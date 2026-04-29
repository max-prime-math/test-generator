import type {
  ClassGistFile,
  GistPlaintext,
  MasterConfigFile,
  AccessKeyEntry,
} from './types';
import type { Question, Class } from '../types';
import { encryptData, decryptData, toBase64, fromBase64 } from './crypto';

// ── Building encrypted gist files ────────────────────────────────────────────

/** Build a complete encrypted ClassGistFile from raw data.
 *  - Serializes questions + images + customClass to JSON
 *  - Encrypts with the DEK
 *  - Wraps everything in the gist envelope
 */
export async function buildEncryptedGist(
  classId: string,
  className: string,
  ownerId: string,
  dek: CryptoKey,
  accessKeys: AccessKeyEntry[],
  questions: Question[],
  images: Record<string, Uint8Array>,
  customClass?: Class,
): Promise<ClassGistFile> {
  const plaintext: GistPlaintext = {
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

/** Parse and decrypt a ClassGistFile.
 *  - Decrypts the data using the DEK
 *  - Deserializes questions + images + customClass
 *  Returns the plaintext payload.
 */
export async function parseEncryptedGist(
  raw: ClassGistFile,
  dek: CryptoKey,
): Promise<GistPlaintext> {
  const plaintextJson = await decryptData(raw.encryptedData, raw.dataIv, dek);
  const plaintext = JSON.parse(plaintextJson) as GistPlaintext;

  // Decode base64 images back to Uint8Array (though we'll return them as-is for now)
  const images: Record<string, string> = {};
  for (const [name, b64] of Object.entries(plaintext.images)) {
    images[name] = b64; // Keep as base64 for now; decoder can convert when needed
  }

  return {
    questions: plaintext.questions,
    images,
    customClass: plaintext.customClass,
  };
}

// ── Master config gist ───────────────────────────────────────────────────────

/** Build a master config gist (unencrypted plaintext). */
export function buildMasterConfig(
  userId: string,
  linkedGists: import('./types').LinkedGistMeta[],
): MasterConfigFile {
  return {
    version: 1,
    userId,
    linkedGists,
  };
}

/** Parse and validate a master config gist.
 *  Throws if version is incompatible or structure is invalid. */
export function parseMasterConfig(raw: unknown): MasterConfigFile {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Master config must be an object');
  }

  const config = raw as Record<string, unknown>;
  if (config.version !== 1) {
    throw new Error(`Unsupported master config version: ${config.version}`);
  }

  if (typeof config.userId !== 'string') {
    throw new Error('Master config userId must be a string');
  }

  if (!Array.isArray(config.linkedGists)) {
    throw new Error('Master config linkedGists must be an array');
  }

  return config as unknown as MasterConfigFile;
}
