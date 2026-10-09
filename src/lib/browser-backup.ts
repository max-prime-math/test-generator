// A copy of everything Test Generator keeps in this browser, for safekeeping.
// It only reads: localStorage values are copied exactly as stored, and IndexedDB
// databases are opened without a version, so nothing is created, upgraded or changed.

/** Sign-in secrets stay in the browser; a backup file is easy to share by mistake. */
const SECRET_KEY = /^tg-git-credentials-|^tg-google-drive-api-key/;

/** Databases that are not data: a rebuildable cache, and Git history that GitHub also holds. */
const SKIPPED_DATABASES: Record<string, string> = {
  'test-generator-workspace-cache': 'rebuilt from the workspace folder',
  'test-generator-git': 'Git history; the repository on GitHub holds it',
};

export interface BrowserBackupSummary {
  tests: number;
  gradebookSections: number;
  gradebookStudents: number;
  gradebookAssessments: number;
  gradebookScores: number;
  databases: string[];
}

export interface BrowserBackup {
  format: 'test-generator-browser-backup';
  version: 1;
  exportedAt: string;
  origin: string;
  summary: BrowserBackupSummary;
  /** Every localStorage value except sign-in secrets, exactly as stored. */
  localStorage: Record<string, string>;
  /** Each database's stores as [key, value] pairs. Bytes are base64 (`{ $bytes }`). */
  indexedDB: Record<string, Record<string, Array<[unknown, unknown]>>>;
  skipped: Record<string, string>;
}

export async function createBrowserBackup(): Promise<BrowserBackup> {
  const local: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === null || SECRET_KEY.test(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) local[key] = value;
  }

  const skipped: Record<string, string> = {};
  const databases: BrowserBackup['indexedDB'] = {};
  const names = typeof indexedDB !== 'undefined' && 'databases' in indexedDB
    ? (await indexedDB.databases()).map(db => db.name).filter((name): name is string => !!name)
    : [];
  if (typeof indexedDB !== 'undefined' && !('databases' in indexedDB)) skipped['IndexedDB'] = 'this browser cannot list its databases';
  for (const name of names) {
    if (SKIPPED_DATABASES[name]) { skipped[name] = SKIPPED_DATABASES[name]; continue; }
    databases[name] = await readDatabase(name);
  }

  const tests = parse<unknown[]>(local['tg-test-library-v1']);
  const gradebook = parse<Record<string, unknown[]>>(local['tg-gradebook-v1']);
  const count = (list: string) => (Array.isArray(gradebook?.[list]) ? gradebook![list].length : 0);
  return {
    format: 'test-generator-browser-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    origin: location.origin,
    summary: {
      tests: Array.isArray(tests) ? tests.length : 0,
      gradebookSections: count('sections'),
      gradebookStudents: count('students'),
      gradebookAssessments: count('assessments'),
      gradebookScores: count('scores'),
      databases: Object.keys(databases),
    },
    localStorage: local,
    indexedDB: databases,
    skipped,
  };
}

/** Download the backup as one JSON file. */
export async function downloadBrowserBackup(): Promise<BrowserBackupSummary> {
  const backup = await createBrowserBackup();
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  const stamp = backup.exportedAt.slice(0, 19).replace(/:/g, '');
  const link = Object.assign(document.createElement('a'), { href: url, download: `test-generator-browser-backup-${stamp}.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return backup.summary;
}

/** "12 tests; Gradebook: 3 sections, 85 students, 14 assessments, 240 scores". */
export function describeBackup(summary: BrowserBackupSummary): string {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return `${n(summary.tests, 'test')}; Gradebook: ${n(summary.gradebookSections, 'section')}, ${n(summary.gradebookStudents, 'student')}, `
    + `${n(summary.gradebookAssessments, 'assessment')}, ${n(summary.gradebookScores, 'score')}`;
}

function parse<T>(text: string | undefined): T | null {
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

/** Every store of an existing database, read-only. */
function readDatabase(name: string): Promise<Record<string, Array<[unknown, unknown]>>> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    // Opening without a version never upgrades an existing database; if it was
    // removed since it was listed, abort rather than create an empty one.
    let missing = false;
    request.onupgradeneeded = () => { missing = true; request.transaction?.abort(); };
    request.onerror = () => (missing ? resolve({}) : reject(request.error));
    request.onsuccess = async () => {
      const db = request.result;
      try {
        const out: Record<string, Array<[unknown, unknown]>> = {};
        for (const storeName of Array.from(db.objectStoreNames)) {
          const store = db.transaction(storeName, 'readonly').objectStore(storeName);
          const [keys, values] = await Promise.all([requestResult(store.getAllKeys()), requestResult(store.getAll())]);
          out[storeName] = await Promise.all(keys.map(async (key, i) => [await encode(key), await encode(values[i])] as [unknown, unknown]));
        }
        resolve(out);
      } catch (error) {
        reject(error);
      } finally {
        db.close();
      }
    };
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Make a stored value JSON-safe: bytes and blobs become base64, folder handles become their names. */
async function encode(value: unknown): Promise<unknown> {
  if (value instanceof Blob) return { $bytes: toBase64(new Uint8Array(await value.arrayBuffer())), type: value.type };
  if (value instanceof ArrayBuffer) return { $bytes: toBase64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) return { $bytes: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  if (typeof FileSystemHandle !== 'undefined' && value instanceof FileSystemHandle) return { $handle: value.kind, name: value.name };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (value instanceof Map) return { $map: await Promise.all([...value].map(async ([k, v]) => [await encode(k), await encode(v)])) };
  if (value instanceof Set) return { $set: await Promise.all([...value].map(encode)) };
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await encode(v);
    return out;
  }
  return value;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
