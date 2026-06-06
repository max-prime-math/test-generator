import type {
  LocalFile,
  ProviderConnectionInfo,
  RemoteFile,
  SyncProvider,
  SyncProviderAuthInput,
} from '../types';

export class GitHubSyncProvider implements SyncProvider {
  readonly id = 'github';
  readonly displayName = 'GitHub legacy file sync';
  readonly isStub = true;

  isConfigured(): boolean {
    return false;
  }

  async isAuthenticated(): Promise<boolean> {
    return false;
  }

  async authenticate(_input?: SyncProviderAuthInput): Promise<void> {
    throw new Error('Legacy GitHub file sync is disabled. Use the browser git remote service instead.');
  }

  async disconnect(): Promise<void> {
    // No-op. Legacy GitHub file sync stores no credentials.
  }

  async listFiles(): Promise<RemoteFile[]> {
    return [];
  }

  async uploadFile(_file: LocalFile): Promise<RemoteFile> {
    throw new Error('Legacy GitHub file sync is disabled.');
  }

  async downloadFile(_remoteId: string): Promise<LocalFile> {
    throw new Error('Legacy GitHub file sync is disabled.');
  }

  async deleteFile(_remoteId: string): Promise<void> {
    throw new Error('Legacy GitHub file sync is disabled.');
  }

  async getConnectionInfo(): Promise<ProviderConnectionInfo> {
    return {
      remoteLabel: 'GitHub remote sync is managed by the browser git service',
    };
  }
}
