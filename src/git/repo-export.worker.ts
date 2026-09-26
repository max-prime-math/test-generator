import { exportAppDataToRepoEntries, type ExportRepoDataOptions, type RepoAppData } from './repoDataModel';

self.onmessage = ({ data: request }: MessageEvent<{ id: number; data: RepoAppData; options?: ExportRepoDataOptions }>) => {
  try {
    const entries = exportAppDataToRepoEntries(request.data, request.options);
    self.postMessage({ id: request.id, entries });
  } catch (error) {
    self.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) });
  }
};
