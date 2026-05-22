import type {
  LocalFile,
  ProviderConnectionInfo,
  RemoteFile,
  SyncProvider,
  SyncProviderAuthInput,
} from '../types';

export class StubSyncProvider implements SyncProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isStub = true;

  constructor(id: string, displayName: string) {
    this.id = id;
    this.displayName = displayName;
  }

  isConfigured(): boolean {
    return false;
  }

  async isAuthenticated(): Promise<boolean> {
    return false;
  }

  async authenticate(_input?: SyncProviderAuthInput): Promise<void> {
    throw new Error(`${this.displayName} is not implemented yet`);
  }

  async disconnect(): Promise<void> {
    // No-op until the provider exists.
  }

  async listFiles(): Promise<RemoteFile[]> {
    return [];
  }

  async uploadFile(_file: LocalFile): Promise<RemoteFile> {
    throw new Error(`${this.displayName} upload is not implemented yet`);
  }

  async downloadFile(_remoteId: string): Promise<LocalFile> {
    throw new Error(`${this.displayName} restore is not implemented yet`);
  }

  async deleteFile(_remoteId: string): Promise<void> {
    throw new Error(`${this.displayName} delete is not implemented yet`);
  }

  async getConnectionInfo(): Promise<ProviderConnectionInfo> {
    return {
      remoteLabel: 'TODO: add provider-specific OAuth or filesystem setup',
    };
  }
}
