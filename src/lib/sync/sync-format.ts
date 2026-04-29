import type {
  ClassSyncFile,
  SyncPlaintext,
  IndexFile,
  AccessKeyEntry,
  LinkedClassMeta,
} from './types';
import type { Question, Class } from '../types';
import { encryptData, decryptData, toBase64 } from './crypto';

// ── Building encrypted class files ───────────────────────────────────────────

/** Build a complete encrypted ClassSyncFile from raw data.
 *  - Serializes questions + images + customClass to JSON
 *  - Encrypts with the DEK
 *  - Wraps everything in the file envelope
 */
export async function buildEncryptedClass(
  classId: string,
  className: string,
  ownerId: string,
  dek: CryptoKey,
  accessKeys: AccessKeyEntry[],
  questions: Question[],
  images: Record<string, Uint8Array>,
  customClass?: Class,
): Promise<ClassSyncFile> {
  const plaintext: SyncPlaintext = {
    questions,
    images: Object.fromEntries(
      Object.entries(images).map(([name, bytes]) => [name, toBase64(bytes)]),
    ),
    customClass,
  };

  const plaintextJson = JSON.stringify(plaintext);
  const { iv: dataIv, ciphertext: encryptedData } = await encryptData(plaintextJson, dek);

  return {
    version: 1,
    meta: {
      classId,
      className,
      ownerId,
      lastModified: Date.now(),
    },
    accessKeys,
    dataIv,
    encryptedData,
  };
}

/** Parse and decrypt a ClassSyncFile.
 *  - Decrypts the data using the DEK
 *  - Deserializes questions + images + customClass
 *  Returns the plaintext payload.
 */
export async function parseEncryptedClass(
  raw: ClassSyncFile,
  dek: CryptoKey,
): Promise<SyncPlaintext> {
  const plaintextJson = await decryptData(raw.encryptedData, raw.dataIv, dek);
  const plaintext = JSON.parse(plaintextJson) as SyncPlaintext;
  return {
    questions: plaintext.questions,
    images: plaintext.images,
    customClass: plaintext.customClass,
  };
}

// ── Index file (unencrypted, at the root of the repo) ──────────────────────

/** Build an index file (unencrypted plaintext, listing all classes in the repo). */
export function buildIndex(
  userId: string,
  classes: LinkedClassMeta[],
): IndexFile {
  return {
    version: 1,
    userId,
    classes,
  };
}

/** Parse and validate an index file. Throws on bad shape. */
export function parseIndex(raw: unknown): IndexFile {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Index file must be an object');
  }
  const config = raw as Record<string, unknown>;
  if (config.version !== 1) {
    throw new Error(`Unsupported index version: ${config.version}`);
  }
  if (typeof config.userId !== 'string') {
    throw new Error('Index userId must be a string');
  }
  if (!Array.isArray(config.classes)) {
    throw new Error('Index classes must be an array');
  }
  return config as unknown as IndexFile;
}

/** Filename for a class file in the repo, derived from classId.
 *  classIds are already slug-like (e.g., "ap-calc-bc", "custom-foo-1234567890");
 *  this just sanitizes any unexpected chars and appends .json. */
export function classFilename(classId: string): string {
  return `${classId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
}

/** Filename of the unencrypted index file at the repo root. */
export const INDEX_FILENAME = 'index.json';

/** Default repo name for a teacher's personal sync. */
export const DEFAULT_REPO_NAME = 'test-generator-bank';
