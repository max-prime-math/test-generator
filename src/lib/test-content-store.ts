import type { Narrative, Question } from './types.ts';

const DB_NAME = 'test-generator-test-content';
const DB_VERSION = 1;
const STORE = 'content';
const BANK_INDEX = 'bankId';

export type StoredTestContent = {
  questionSnapshots?: Question[];
  narrativeSnapshots?: Narrative[];
};

type TestContentRecord = StoredTestContent & {
  key: string;
  bankId: string;
  testId: string;
};

const keyFor = (bankId: string, testId: string) => `${bankId}\u0000${testId}`;
const revisionKey = (bankId: string, testId: string, revision?: string) =>
  revision ? `${keyFor(bankId, testId)}\u0000${revision}` : keyFor(bankId, testId);

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Test content storage was aborted'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore(STORE, { keyPath: 'key' });
      store.createIndex(BANK_INDEX, BANK_INDEX, { unique: false });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

export async function readTestContent(bankId: string, testId: string, revision?: string): Promise<StoredTestContent | undefined> {
  const database = await openDatabase();
  try {
    const record = await request(database.transaction(STORE).objectStore(STORE).get(revisionKey(bankId, testId, revision))) as TestContentRecord | undefined;
    if (record) return { questionSnapshots: record.questionSnapshots, narrativeSnapshots: record.narrativeSnapshots };
    if (revision) throw new Error('The saved question copies could not be read. Reopen the test or recover it from the workspace folder.');
  } finally { database.close(); }
}

export async function writeTestContent(bankId: string, entries: Array<StoredTestContent & { id: string; revision?: string }>): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    const done = transactionDone(transaction);
    try {
      const store = transaction.objectStore(STORE);
      for (const { id, revision, ...content } of entries) {
        store.put({ key: revisionKey(bankId, id, revision), bankId, testId: id, ...content } satisfies TestContentRecord);
      }
    } catch (error) {
      transaction.abort();
      await done.catch(() => undefined);
      throw error;
    }
    await done;
  } finally { database.close(); }
}

export async function removeTestContent(bankId: string, testId: string, revision?: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(STORE).delete(revisionKey(bankId, testId, revision));
    await done;
  } finally { database.close(); }
}
