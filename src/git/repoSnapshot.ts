import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { RepoAppData, RepoDataImage } from './repoDataModel.ts';

export const REPO_SNAPSHOT_PATH = 'test-generator-bank.snapshot.json.gz';
export const REPO_SNAPSHOT_BRANCH = 'test-generator-snapshot';
export const REPO_SNAPSHOT_KIND = 'test-generator-bank-snapshot';
export const REPO_SNAPSHOT_VERSION = 1;

export interface RepoSnapshotFile {
  kind: typeof REPO_SNAPSHOT_KIND;
  version: typeof REPO_SNAPSHOT_VERSION;
  exportedAt: string;
  counts: {
    questions: number;
    customClasses: number;
    savedTests: number;
    images: number;
  };
  appData: {
    questions: RepoAppData['questions'];
    customClasses: RepoAppData['customClasses'];
    savedTests: RepoAppData['savedTests'];
    images: Array<Omit<RepoDataImage, 'bytes'> & { base64: string }>;
  };
}

export function createRepoSnapshotBytes(appData: RepoAppData, exportedAt = new Date().toISOString()): Uint8Array {
  const snapshot: RepoSnapshotFile = {
    kind: REPO_SNAPSHOT_KIND,
    version: REPO_SNAPSHOT_VERSION,
    exportedAt,
    counts: {
      questions: appData.questions.length,
      customClasses: appData.customClasses.length,
      savedTests: appData.savedTests.length,
      images: appData.images?.length ?? 0,
    },
    appData: {
      questions: appData.questions,
      customClasses: appData.customClasses,
      savedTests: appData.savedTests,
      images: (appData.images ?? []).map((image) => ({
        name: image.name,
        ext: image.ext,
        mime: image.mime,
        size: image.size,
        base64: bytesToBase64(image.bytes),
      })),
    },
  };
  return gzipSync(strToU8(JSON.stringify(snapshot)));
}

export function parseRepoSnapshotBytes(bytes: Uint8Array): { appData: RepoAppData; exportedAt: string } {
  const parsed = JSON.parse(strFromU8(gunzipSync(bytes))) as unknown;
  if (!isSnapshotFile(parsed)) {
    throw new Error('Unsupported Test Generator snapshot file.');
  }
  const images = parsed.appData.images.map((image) => {
    const bytes = base64ToBytes(image.base64);
    return {
      name: image.name,
      ext: image.ext,
      mime: image.mime,
      size: image.size ?? bytes.byteLength,
      bytes,
    };
  });
  return {
    exportedAt: parsed.exportedAt,
    appData: {
      questions: parsed.appData.questions,
      customClasses: parsed.appData.customClasses,
      savedTests: parsed.appData.savedTests,
      images,
    },
  };
}

function isSnapshotFile(value: unknown): value is RepoSnapshotFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as RepoSnapshotFile;
  return snapshot.kind === REPO_SNAPSHOT_KIND
    && snapshot.version === REPO_SNAPSHOT_VERSION
    && typeof snapshot.exportedAt === 'string'
    && Boolean(snapshot.appData)
    && Array.isArray(snapshot.appData.questions)
    && Array.isArray(snapshot.appData.customClasses)
    && Array.isArray(snapshot.appData.savedTests)
    && Array.isArray(snapshot.appData.images)
    && snapshot.appData.images.every((image) =>
      image
      && typeof image === 'object'
      && typeof image.name === 'string'
      && typeof image.ext === 'string'
      && typeof image.base64 === 'string'
    );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
