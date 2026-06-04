import type { StorageLike, SyncProvider } from '../types';
import { GoogleDriveSyncProvider } from './google-drive-provider';
import { LocalFolderSyncProvider } from './local-folder-provider';
import { StubSyncProvider } from './stub-provider';

export function createSyncProviders(storage: StorageLike): Record<string, SyncProvider> {
  return {
    github: new StubSyncProvider('github', 'GitHub legacy file sync'),
    gitlab: new StubSyncProvider('gitlab', 'GitLab'),
    googleDrive: new GoogleDriveSyncProvider(storage),
    dropbox: new StubSyncProvider('dropbox', 'Dropbox'),
    oneDrive: new StubSyncProvider('oneDrive', 'OneDrive'),
    webdav: new StubSyncProvider('webdav', 'WebDAV'),
    localFolder: new LocalFolderSyncProvider(),
  };
}
