/// <reference lib="webworker" />
import { decodeSharePackage, encodeSharePackage, prepareTestCopies, portableTest, type SharePackage } from './share-package';
import type { RepoAppData } from '../git/repoDataModel';
import type { SavedTest } from './types';

self.onmessage = ({ data: job }: MessageEvent<{ id: number; action: string; pack?: SharePackage; bytes?: Uint8Array; tests?: SavedTest[]; data?: RepoAppData; existing?: SavedTest[] }>) => {
  try {
    const result = job.action === 'decode' ? decodeSharePackage(job.bytes!)
      : job.action === 'copies' ? prepareTestCopies(job.pack!.items, job.existing!)
      : job.action === 'tests' ? encodeSharePackage({ kind: 'tests', items: job.tests!.map(test => portableTest(test, job.data!)) })
      : encodeSharePackage(job.pack!);
    self.postMessage({ id: job.id, result });
  } catch (error) {
    self.postMessage({ id: job.id, error: error instanceof Error ? error.message : String(error) });
  }
};
