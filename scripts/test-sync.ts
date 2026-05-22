import assert from 'node:assert/strict';
import { buildLocalFile, SyncManager } from '../src/lib/sync/sync-manager.ts';
import type {
  LocalFile,
  RemoteFile,
  StorageLike,
  SyncProvider,
  SyncProviderAuthInput,
} from '../src/lib/sync/types.ts';

class MemoryStorage implements StorageLike {
  #map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#map.set(key, value);
  }

  removeItem(key: string): void {
    this.#map.delete(key);
  }
}

class MemoryProvider implements SyncProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isStub = false;
  files = new Map<string, RemoteFile & { content: string }>();

  constructor(id: string, displayName = id) {
    this.id = id;
    this.displayName = displayName;
  }

  isConfigured(): boolean {
    return true;
  }

  async isAuthenticated(): Promise<boolean> {
    return true;
  }

  async authenticate(_input?: SyncProviderAuthInput): Promise<void> {}

  async listFiles(): Promise<RemoteFile[]> {
    return Array.from(this.files.values()).map(({ content: _content, ...file }) => file);
  }

  async uploadFile(file: LocalFile): Promise<RemoteFile> {
    const remote: RemoteFile & { content: string } = {
      id: file.path,
      path: file.path,
      name: file.name,
      modifiedTime: file.modifiedTime,
      hash: file.hash,
      providerId: this.id,
      content: file.content,
    };
    this.files.set(file.path, remote);
    return remote;
  }

  async downloadFile(remoteId: string): Promise<LocalFile> {
    const file = this.files.get(remoteId);
    if (!file) throw new Error(`not found: ${remoteId}`);
    return {
      path: file.path,
      name: file.name,
      content: file.content,
      modifiedTime: file.modifiedTime ?? 0,
      hash: file.hash ?? '',
    };
  }

  async deleteFile(remoteId: string): Promise<void> {
    this.files.delete(remoteId);
  }
}

class FailingProvider extends MemoryProvider {
  override async uploadFile(_file: LocalFile): Promise<RemoteFile> {
    throw new Error('upload failed');
  }
}

async function testManifestUpdate(): Promise<void> {
  const storage = new MemoryStorage();
  const provider = new MemoryProvider('github', 'GitHub');
  const manager = new SyncManager({ github: provider }, storage);
  manager.setProviderEnabled('github', true);
  await manager.refreshProviderStates();

  const file = await buildLocalFile('classes/algebra.json', '{"a":1}', 100);
  const result = await manager.backupNow(file);

  assert.equal(result.uploadedProviders.length, 1);
  assert.equal(manager.manifest.entries.length, 1);
  assert.equal(manager.manifest.entries[0].localFilePath, 'classes/algebra.json');
  assert.equal(manager.manifest.entries[0].providerId, 'github');
}

async function testProviderFailureIsolation(): Promise<void> {
  const storage = new MemoryStorage();
  const good = new MemoryProvider('github', 'GitHub');
  const bad = new FailingProvider('gitlab', 'GitLab');
  const manager = new SyncManager({ github: good, gitlab: bad }, storage);
  manager.setProviderEnabled('github', true);
  manager.setProviderEnabled('gitlab', true);
  await manager.refreshProviderStates();

  const file = await buildLocalFile('tests/test.json', '{"t":1}', 200);
  const result = await manager.backupNow(file);

  assert.deepEqual(result.uploadedProviders, ['github']);
  assert.equal(result.failedProviders.length, 1);
  assert.equal(result.failedProviders[0].providerId, 'gitlab');
  assert.equal(good.files.has('tests/test.json'), true);
}

async function testConflictDetection(): Promise<void> {
  const storage = new MemoryStorage();
  const provider = new MemoryProvider('github', 'GitHub');
  const manager = new SyncManager({ github: provider }, storage);
  manager.setProviderEnabled('github', true);
  await manager.refreshProviderStates();

  const first = await buildLocalFile('classes/geometry.json', '{"v":1}', 300);
  await manager.backupNow(first);

  const remoteConflict = await buildLocalFile('classes/geometry.json', '{"v":2}', 301);
  await provider.uploadFile(remoteConflict);

  const localConflict = await buildLocalFile('classes/geometry.json', '{"v":3}', 302);
  const result = await manager.backupNow(localConflict);

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.uploadedProviders.length, 0);
  assert.equal(result.conflicts[0].providerId, 'github');
}

async function testRemoteNewerWithoutLocalChangeDoesNotOverwrite(): Promise<void> {
  const storage = new MemoryStorage();
  const provider = new MemoryProvider('github', 'GitHub');
  const manager = new SyncManager({ github: provider }, storage);
  manager.setProviderEnabled('github', true);
  await manager.refreshProviderStates();

  const first = await buildLocalFile('classes/stats.json', '{"v":1}', 500);
  await manager.backupNow(first);

  const remoteNewer = await buildLocalFile('classes/stats.json', '{"v":2}', 501);
  await provider.uploadFile(remoteNewer);

  const result = await manager.backupNow(first);

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.uploadedProviders.length, 0);
  assert.equal(provider.files.get('classes/stats.json')?.content, '{"v":2}');
}

async function testDisabledProvidersSkipped(): Promise<void> {
  const storage = new MemoryStorage();
  const enabled = new MemoryProvider('github', 'GitHub');
  const disabled = new MemoryProvider('dropbox', 'Dropbox');
  const manager = new SyncManager({ github: enabled, dropbox: disabled }, storage);
  manager.setProviderEnabled('github', true);
  manager.setProviderEnabled('dropbox', false);
  await manager.refreshProviderStates();

  const file = await buildLocalFile('classes/precalc.json', '{"v":1}', 400);
  const result = await manager.backupNow(file);

  assert.deepEqual(result.attemptedProviders, ['github']);
  assert.equal(enabled.files.has('classes/precalc.json'), true);
  assert.equal(disabled.files.has('classes/precalc.json'), false);
}

async function main(): Promise<void> {
  await testManifestUpdate();
  await testProviderFailureIsolation();
  await testConflictDetection();
  await testRemoteNewerWithoutLocalChangeDoesNotOverwrite();
  await testDisabledProvidersSkipped();
  console.log('sync manager tests passed');
}

await main();
