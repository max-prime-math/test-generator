// A copy of everything Test Generator keeps in this browser, for safekeeping.
// It only reads: localStorage values are copied exactly as stored, and IndexedDB
// databases are opened without a version, so nothing is created, upgraded or changed.

/** Sign-in secrets stay in the browser; a backup file is easy to share by mistake. */
const SECRET_KEY = /^tg-git-credentials-|^tg-google-drive-api-key/;

/** Databases that are not data: a rebuildable cache, and Git history that GitHub also holds. */
const SKIPPED_DATABASES: Record<string, string> = {
  'test-generator-workspace-cache': 'rebuilt from the workspace folder',
  'test-generator-restore': 'a restore waiting to be applied',
  // Restoring old sync history would let the folder quietly undo the restore.
  'test-generator-gradebook-sync': 'how this browser last matched the workspace folder; rebuilt from the folder',
  'test-generator-tests-sync': 'how this browser last matched the workspace folder; rebuilt from the folder',
  'test-generator-git': 'Git history; the repository on GitHub holds it',
};

export interface BrowserBackupSummary {
  tests: number;
  gradebookSections: number;
  gradebookStudents: number;
  gradebookAssessments: number;
  gradebookScores: number;
  databases: string[];
}

export interface BrowserBackup {
  format: 'test-generator-browser-backup';
  version: 1;
  exportedAt: string;
  origin: string;
  summary: BrowserBackupSummary;
  /** Every localStorage value except sign-in secrets, exactly as stored. */
  localStorage: Record<string, string>;
  /** Each database's stores as [key, value] pairs. Bytes are base64 (`{ $bytes }`). */
  indexedDB: Record<string, Record<string, Array<[unknown, unknown]>>>;
  skipped: Record<string, string>;
}

export async function createBrowserBackup(): Promise<BrowserBackup> {
  const local: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === null || SECRET_KEY.test(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) local[key] = value;
  }

  const skipped: Record<string, string> = {};
  const databases: BrowserBackup['indexedDB'] = {};
  const names = typeof indexedDB !== 'undefined' && 'databases' in indexedDB
    ? (await indexedDB.databases()).map(db => db.name).filter((name): name is string => !!name)
    : [];
  if (typeof indexedDB !== 'undefined' && !('databases' in indexedDB)) skipped['IndexedDB'] = 'this browser cannot list its databases';
  for (const name of names) {
    if (SKIPPED_DATABASES[name]) { skipped[name] = SKIPPED_DATABASES[name]; continue; }
    databases[name] = await readDatabase(name);
  }

  const tests = parse<unknown[]>(local['tg-test-library-v1']);
  const gradebook = parse<Record<string, unknown[]>>(local['tg-gradebook-v1']);
  const count = (list: string) => (Array.isArray(gradebook?.[list]) ? gradebook![list].length : 0);
  return {
    format: 'test-generator-browser-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    origin: location.origin,
    summary: {
      tests: Array.isArray(tests) ? tests.length : 0,
      gradebookSections: count('sections'),
      gradebookStudents: count('students'),
      gradebookAssessments: count('assessments'),
      gradebookScores: count('scores'),
      databases: Object.keys(databases),
    },
    localStorage: local,
    indexedDB: databases,
    skipped,
  };
}

/** Download the backup as one JSON file. */
export async function downloadBrowserBackup(): Promise<BrowserBackupSummary> {
  const backup = await createBrowserBackup();
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  const stamp = backup.exportedAt.slice(0, 19).replace(/:/g, '');
  const link = Object.assign(document.createElement('a'), { href: url, download: `test-generator-browser-backup-${stamp}.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return backup.summary;
}

/** "12 tests; Gradebook: 3 sections, 85 students, 14 assessments, 240 scores". */
export function describeBackup(summary: BrowserBackupSummary): string {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return `${n(summary.tests, 'test')}; Gradebook: ${n(summary.gradebookSections, 'section')}, ${n(summary.gradebookStudents, 'student')}, `
    + `${n(summary.gradebookAssessments, 'assessment')}, ${n(summary.gradebookScores, 'score')}`;
}

function parse<T>(text: string | undefined): T | null {
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

/** Every store of an existing database, read-only. */
function readDatabase(name: string): Promise<Record<string, Array<[unknown, unknown]>>> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    // Opening without a version never upgrades an existing database; if it was
    // removed since it was listed, abort rather than create an empty one.
    let missing = false;
    request.onupgradeneeded = () => { missing = true; request.transaction?.abort(); };
    request.onerror = () => (missing ? resolve({}) : reject(request.error));
    request.onsuccess = async () => {
      const db = request.result;
      try {
        const out: Record<string, Array<[unknown, unknown]>> = {};
        for (const storeName of Array.from(db.objectStoreNames)) {
          const store = db.transaction(storeName, 'readonly').objectStore(storeName);
          const [keys, values] = await Promise.all([requestResult(store.getAllKeys()), requestResult(store.getAll())]);
          out[storeName] = await Promise.all(keys.map(async (key, i) => [await encode(key), await encode(values[i])] as [unknown, unknown]));
        }
        resolve(out);
      } catch (error) {
        reject(error);
      } finally {
        db.close();
      }
    };
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Make a stored value JSON-safe: bytes and blobs become base64, folder handles become their names. */
async function encode(value: unknown): Promise<unknown> {
  if (value instanceof Blob) return { $bytes: toBase64(new Uint8Array(await value.arrayBuffer())), type: value.type };
  if (value instanceof ArrayBuffer) return { $bytes: toBase64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) return { $bytes: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  if (typeof FileSystemHandle !== 'undefined' && value instanceof FileSystemHandle) return { $handle: value.kind, name: value.name };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (value instanceof Map) return { $map: await Promise.all([...value].map(async ([k, v]) => [await encode(k), await encode(v)])) };
  if (value instanceof Set) return { $set: await Promise.all([...value].map(encode)) };
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await encode(v);
    return out;
  }
  return value;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// ── Restore ──
// A restore replaces this browser's copy with a backup's. It is applied on the next page
// load, before the app starts, so nothing the app holds in memory can be saved over it.

const RESTORE_DB = 'test-generator-restore';
const RESTORE_STORE = 'pending';
const RESTORE_RESULT_KEY = 'tg-restore-result';
/** Settings for the workspace connection and diagnostics describe this browser, not the data. */
const NOT_RESTORED = /^tg-workspace-|^tg-perf-|^tg-independent-workspace-/;

export interface RestoreResult { summary: BrowserBackupSummary; exportedAt: string; skipped: string[] }

/** Read and check a backup file made by "Back up everything". */
export async function readBackupFile(file: File): Promise<BrowserBackup> {
  let backup: BrowserBackup;
  try { backup = JSON.parse(await file.text()); } catch { throw new Error(`${file.name} is not a JSON file.`); }
  if (backup?.format !== 'test-generator-browser-backup' || backup.version !== 1 || typeof backup.localStorage !== 'object') {
    throw new Error(`${file.name} is not a Test Generator "Back up everything" file. A Gradebook Backup JSON file is restored with the Gradebook's Restore button.`);
  }
  return backup;
}

/** What this browser holds now, in the same terms as a backup's summary. */
export async function currentSummary(): Promise<BrowserBackupSummary> {
  return (await createBrowserBackup()).summary;
}

/**
 * Restore a "Back up everything" file into this browser: compare it with what is here, ask,
 * download a backup of this browser first, then apply it on reload. Returns a status message.
 */
export async function restoreFromFile(file: File): Promise<string> {
  const backup = await readBackupFile(file);
  const now = await currentSummary();
  const ok = confirm(`Restore the backup from ${new Date(backup.exportedAt).toLocaleString()}?\n\n`
    + `Backup: ${describeBackup(backup.summary)}\nThis browser now: ${describeBackup(now)}\n\n`
    + `This browser's saved tests, drafts, Gradebook and settings are replaced with the backup's, and its banks and images are added. `
    + `A backup of this browser is downloaded first, so this can be undone. Close any other Test Generator tabs before continuing.`);
  if (!ok) return 'Restore cancelled. Nothing was changed.';
  await downloadBrowserBackup();
  // Let the download of this browser's copy start before the page reloads.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await restoreOnReload(backup);
  return 'Restoring…';
}

/** Set the backup aside and reload; `applyPendingRestore` writes it before the app starts. */
export async function restoreOnReload(backup: BrowserBackup): Promise<void> {
  const db = await openRestoreDb();
  try {
    const tx = db.transaction(RESTORE_STORE, 'readwrite');
    tx.objectStore(RESTORE_STORE).put(JSON.stringify(backup), 'backup');
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  } finally { db.close(); }
  location.reload();
}

/** Called first thing on startup. Returns what was restored, once, after a restore. */
export async function applyPendingRestore(): Promise<RestoreResult | null> {
  if (typeof indexedDB === 'undefined' || !('databases' in indexedDB)) return null;
  if (!(await indexedDB.databases()).some(db => db.name === RESTORE_DB)) return takeRestoreResult();
  const db = await openRestoreDb();
  let text: string | undefined;
  try {
    text = await requestResult(db.transaction(RESTORE_STORE, 'readonly').objectStore(RESTORE_STORE).get('backup')) as string | undefined;
  } finally { db.close(); }
  try {
    if (text) {
      const backup = JSON.parse(text) as BrowserBackup;
      const skipped: string[] = [];
      for (const [key, value] of Object.entries(backup.localStorage)) {
        if (!NOT_RESTORED.test(key) && !SECRET_KEY.test(key)) localStorage.setItem(key, value);
      }
      for (const [name, stores] of Object.entries(backup.indexedDB ?? {})) skipped.push(...await writeDatabase(name, stores));
      sessionStorage.setItem(RESTORE_RESULT_KEY, JSON.stringify({ summary: backup.summary, exportedAt: backup.exportedAt, skipped } satisfies RestoreResult));
    }
  } finally {
    // Attempted once: a restore that fails is not retried on every load.
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(RESTORE_DB);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  }
  return takeRestoreResult();
}

function takeRestoreResult(): RestoreResult | null {
  const text = sessionStorage.getItem(RESTORE_RESULT_KEY);
  sessionStorage.removeItem(RESTORE_RESULT_KEY);
  return text ? JSON.parse(text) as RestoreResult : null;
}

function openRestoreDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RESTORE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(RESTORE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Put a backup's records into an existing database's existing stores; returns what had nowhere to go. */
function writeDatabase(name: string, stores: Record<string, Array<[unknown, unknown]>>): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let missing = false;
    request.onupgradeneeded = () => { missing = true; request.transaction?.abort(); };
    request.onerror = () => (missing ? resolve([`${name} (not in this browser yet)`]) : reject(request.error));
    request.onsuccess = async () => {
      const db = request.result;
      const skipped: string[] = [];
      try {
        for (const [storeName, records] of Object.entries(stores)) {
          if (!db.objectStoreNames.contains(storeName)) { skipped.push(`${name}/${storeName}`); continue; }
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          for (const [rawKey, rawValue] of records) {
            const value = decode(rawValue);
            if (value === HANDLE) continue; // folder access is granted again, not restored
            if (store.keyPath === null) store.put(value, decode(rawKey) as IDBValidKey); else store.put(value);
          }
          await new Promise<void>((done, fail) => { tx.oncomplete = () => done(); tx.onerror = () => fail(tx.error); });
        }
        resolve(skipped);
      } catch (error) { reject(error); } finally { db.close(); }
    };
  });
}

const HANDLE = Symbol('folder handle');

/** The reverse of `encode`. */
function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (!value || typeof value !== 'object') return value;
  const v = value as Record<string, unknown>;
  if (typeof v.$bytes === 'string') {
    const bytes = Uint8Array.from(atob(v.$bytes), ch => ch.charCodeAt(0));
    return typeof v.type === 'string' ? new Blob([bytes], { type: v.type }) : bytes;
  }
  if (typeof v.$handle === 'string') return HANDLE;
  if (typeof v.$date === 'string') return new Date(v.$date);
  if (Array.isArray(v.$map)) return new Map((v.$map as Array<[unknown, unknown]>).map(([k, x]) => [decode(k), decode(x)]));
  if (Array.isArray(v.$set)) return new Set((v.$set as unknown[]).map(decode));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
}
