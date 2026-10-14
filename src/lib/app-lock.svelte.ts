import { readText, writeText } from './folder-io';

/** Intentionally unobtrusive; deleting this workspace file disables password protection. */
export const APP_LOCK_FILE = '.workspace-view';
const ENABLED_HINT_KEY = 'tg-app-lock-enabled-v1';
const IDLE_MINUTES_KEY = 'tg-app-lock-idle-minutes-v1';
const LOCK_CHANNEL = 'test-generator-app-lock';

export const APP_LOCK_IDLE_MINUTES = [1, 5, 15, 30, 60, 120] as const;
export type AppLockIdleMinutes = typeof APP_LOCK_IDLE_MINUTES[number];

interface LockFile {
  version: 1;
  salt: string;
  verifier: string;
}

function loadIdleMinutes(): AppLockIdleMinutes {
  const stored = Number(localStorage.getItem(IDLE_MINUTES_KEY));
  return APP_LOCK_IDLE_MINUTES.includes(stored as AppLockIdleMinutes) ? stored as AppLockIdleMinutes : 15;
}

function parseLockFile(text: string | null): LockFile | null {
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as Partial<LockFile>;
    return value.version === 1 && typeof value.salt === 'string' && typeof value.verifier === 'string'
      ? { version: 1, salt: value.salt, verifier: value.verifier }
      : null;
  } catch { return null; }
}

function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

async function passwordVerifier(password: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function permissionDenied(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
}

class AppLock {
  ready = $state(false);
  locked = $state(localStorage.getItem(ENABLED_HINT_KEY) === '1');
  permissionNeeded = $state(false);
  idleMinutes = $state<AppLockIdleMinutes>(loadIdleMinutes());
  lockFile = $state<LockFile | null>(null);
  private root: FileSystemDirectoryHandle | null = null;
  private channel: BroadcastChannel | null = null;
  private syncing: Promise<void> | null = null;

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(LOCK_CHANNEL);
      this.channel.addEventListener('message', event => {
        if (event.data === 'lock' && this.enabled) this.locked = true;
        if (event.data === 'refresh') void this.syncFromWorkspace(this.root);
      });
    }
  }

  get enabled(): boolean {
    return this.lockFile !== null || localStorage.getItem(ENABLED_HINT_KEY) === '1';
  }

  async syncFromWorkspace(root: FileSystemDirectoryHandle | null): Promise<void> {
    this.root = root;
    if (this.syncing) return this.syncing;
    this.syncing = this.readSource(root).finally(() => { this.syncing = null; });
    return this.syncing;
  }

  private async readSource(root: FileSystemDirectoryHandle | null): Promise<void> {
    if (!root) {
      this.lockFile = null;
      this.locked = false;
      this.permissionNeeded = false;
      this.ready = true;
      localStorage.removeItem(ENABLED_HINT_KEY);
      return;
    }
    try {
      const previousEnabled = this.enabled;
      const lockFile = parseLockFile(await readText(root, APP_LOCK_FILE));
      this.permissionNeeded = false;
      // The app polls the workspace file to detect deletion. Preserve this reactive value
      // when the verifier is unchanged, or the idle-timer effect restarts on every poll.
      if (this.lockFile?.salt !== lockFile?.salt || this.lockFile?.verifier !== lockFile?.verifier) {
        this.lockFile = lockFile;
      }
      if (lockFile) {
        localStorage.setItem(ENABLED_HINT_KEY, '1');
        if (!previousEnabled) this.locked = true;
      } else {
        // Missing or invalid means disabled, which is the forgotten-password recovery path.
        localStorage.removeItem(ENABLED_HINT_KEY);
        this.locked = false;
      }
      this.ready = true;
    } catch (error) {
      if (!permissionDenied(error)) throw error;
      // Until the workspace can be inspected, do not reveal an app that may be protected.
      this.permissionNeeded = true;
      this.locked = true;
      this.ready = true;
    }
  }

  private async makeLockFile(password: string): Promise<LockFile> {
    const salt = randomSalt();
    return { version: 1, salt, verifier: await passwordVerifier(password, salt) };
  }

  async enable(root: FileSystemDirectoryHandle, password: string, idleMinutes: AppLockIdleMinutes): Promise<void> {
    const lockFile = await this.makeLockFile(password);
    await writeText(root, APP_LOCK_FILE, `${JSON.stringify(lockFile)}\n`);
    this.root = root;
    this.lockFile = lockFile;
    this.idleMinutes = idleMinutes;
    this.permissionNeeded = false;
    this.ready = true;
    this.locked = false;
    localStorage.setItem(ENABLED_HINT_KEY, '1');
    localStorage.setItem(IDLE_MINUTES_KEY, String(idleMinutes));
    this.channel?.postMessage('refresh');
  }

  async setPassword(root: FileSystemDirectoryHandle, password: string): Promise<void> {
    const lockFile = await this.makeLockFile(password);
    await writeText(root, APP_LOCK_FILE, `${JSON.stringify(lockFile)}\n`);
    this.root = root;
    this.lockFile = lockFile;
    localStorage.setItem(ENABLED_HINT_KEY, '1');
    this.channel?.postMessage('refresh');
  }

  async disable(root: FileSystemDirectoryHandle): Promise<void> {
    try { await root.removeEntry(APP_LOCK_FILE); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; }
    this.lockFile = null;
    this.locked = false;
    this.permissionNeeded = false;
    localStorage.removeItem(ENABLED_HINT_KEY);
    this.channel?.postMessage('refresh');
  }

  async unlock(candidate: string): Promise<boolean> {
    await this.syncFromWorkspace(this.root);
    const lockFile = this.lockFile;
    if (!lockFile) return true; // Deleting the workspace file disables the lock.
    if (await passwordVerifier(candidate, lockFile.salt) !== lockFile.verifier) return false;
    this.locked = false;
    return true;
  }

  lock(): void {
    if (!this.enabled) return;
    this.locked = true;
    this.channel?.postMessage('lock');
  }

  setIdleMinutes(idleMinutes: AppLockIdleMinutes): void {
    if (!APP_LOCK_IDLE_MINUTES.includes(idleMinutes)) return;
    this.idleMinutes = idleMinutes;
    localStorage.setItem(IDLE_MINUTES_KEY, String(idleMinutes));
  }
}

export const appLock = new AppLock();
