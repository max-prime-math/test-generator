import type { ExportRepoDataOptions, RepoAppData, RepoDataEntry } from './repoDataModel';

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (entries: RepoDataEntry[]) => void; reject: (error: Error) => void }>();

/** Keep bank serialization and hashing off the UI thread. Input must be plain
 * data, not a reactive proxy. Never transfer image buffers owned by the app. */
export function exportAppDataInWorker(data: RepoAppData, options?: ExportRepoDataOptions): Promise<RepoDataEntry[]> {
  return new Promise((resolve, reject) => {
    if (!worker) {
      worker = new Worker(new URL('./repo-export.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data: result }: MessageEvent<{ id: number; entries?: RepoDataEntry[]; error?: string }>) => {
        const job = pending.get(result.id);
        if (!job) return;
        pending.delete(result.id);
        if (result.entries) job.resolve(result.entries);
        else job.reject(new Error(result.error ?? 'Bank export failed.'));
      };
      const failed = () => {
        worker?.terminate();
        worker = undefined;
        for (const job of pending.values()) job.reject(new Error('Background bank export stopped. Please retry saving.'));
        pending.clear();
      };
      worker.onerror = failed;
      worker.onmessageerror = failed;
    }
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    try { worker.postMessage({ id, data, options }); }
    catch (error) { pending.delete(id); reject(error); }
  });
}
