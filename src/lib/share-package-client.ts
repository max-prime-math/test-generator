import type { SharePackage, prepareTestCopies } from './share-package';
import type { RepoAppData } from '../git/repoDataModel';
import type { SavedTest } from './types';

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
function run<T>(job: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!worker) {
      worker = new Worker(new URL('./share-package.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        const task = pending.get(data.id);
        if (!task) return;
        pending.delete(data.id);
        if (data.error) task.reject(new Error(data.error)); else task.resolve(data.result);
      };
      const failed = () => {
        worker?.terminate(); worker = undefined;
        for (const task of pending.values()) task.reject(new Error('ZIP processing stopped. Please try again.'));
        pending.clear();
      };
      worker.onerror = failed;
      worker.onmessageerror = failed;
    }
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    try { worker.postMessage({ ...job, id }); }
    catch (error) { pending.delete(id); reject(error); }
  });
}

export const readShareZip = (bytes: Uint8Array) => run<SharePackage>({ action: 'decode', bytes });
export const writeShareZip = (pack: SharePackage) => run<Uint8Array>({ action: 'encode', pack });
export const writeTestsZip = (tests: SavedTest[], data: RepoAppData) => run<Uint8Array>({ action: 'tests', tests, data });
export const copySharedTests = (pack: SharePackage, existing: SavedTest[]) => run<ReturnType<typeof prepareTestCopies>>({ action: 'copies', pack, existing });
