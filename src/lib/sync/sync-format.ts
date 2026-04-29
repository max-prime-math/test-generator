import type { ClassSyncFile, IndexFile, LinkedClassMeta } from './types';
import type { Question, Class } from '../types';

export const INDEX_FILENAME = 'index.json';
export const DEFAULT_REPO_NAME = 'test-generator-bank';

/** Filename for a class inside the repo. */
export function classFilename(classId: string): string {
  return `${classId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
}

/** Build a plaintext class file. */
export function buildClassFile(
  classId: string,
  className: string,
  ownerId: string,
  questions: Question[],
  images: Record<string, string>,  // basename → base64
  customClass?: Class,
): ClassSyncFile {
  return {
    version: 2,
    meta: { classId, className, ownerId, lastModified: Date.now() },
    questions,
    images,
    customClass,
  };
}

/** Parse and validate a class file. Throws on version mismatch or bad shape. */
export function parseClassFile(raw: unknown): ClassSyncFile {
  if (typeof raw !== 'object' || raw === null) throw new Error('Class file must be an object');
  const r = raw as Record<string, unknown>;
  if (r.version === 1) {
    throw new Error(
      'This class file was created with an older encrypted format. ' +
      'Delete the existing file in the repo and run Backup again.',
    );
  }
  if (r.version !== 2) throw new Error(`Unsupported class file version: ${r.version}`);
  if (!r.meta || !Array.isArray(r.questions)) throw new Error('Malformed class file');
  return raw as ClassSyncFile;
}

/** Build an index file. */
export function buildIndex(userId: string, classes: LinkedClassMeta[]): IndexFile {
  return { version: 1, userId, classes };
}

/** Parse and validate an index file. */
export function parseIndex(raw: unknown): IndexFile {
  if (typeof raw !== 'object' || raw === null) throw new Error('Index must be an object');
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) throw new Error(`Unsupported index version: ${r.version}`);
  if (typeof r.userId !== 'string') throw new Error('Index userId must be a string');
  if (!Array.isArray(r.classes)) throw new Error('Index classes must be an array');
  return raw as IndexFile;
}
