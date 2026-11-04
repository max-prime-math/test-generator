import type { Narrative, Question, SavedTest } from './types.ts';

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

/** Read the frozen question and narrative copies for one bank. */
export async function loadTestContent(bankId: string): Promise<Map<string, StoredTestContent>> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE, 'readonly');
    const done = transactionDone(transaction);
    const records = await request(transaction.objectStore(STORE).index(BANK_INDEX).getAll(bankId)) as TestContentRecord[];
    await done;
    return new Map(records.map(record => [record.testId, {
      questionSnapshots: record.questionSnapshots,
      narrativeSnapshots: record.narrativeSnapshots,
    }]));
  } finally {
    database.close();
  }
}

/** Replace one bank's frozen test content atomically. */
export async function saveTestContent(bankId: string, tests: SavedTest[]): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(STORE);
    const keys = await request(store.index(BANK_INDEX).getAllKeys(bankId));
    for (const key of keys) store.delete(key);
    for (const test of tests) {
      if (test.questionSnapshots === undefined && test.narrativeSnapshots === undefined) continue;
      store.put({
        key: keyFor(bankId, test.id),
        bankId,
        testId: test.id,
        questionSnapshots: test.questionSnapshots,
        narrativeSnapshots: test.narrativeSnapshots,
      } satisfies TestContentRecord);
    }
    await done;
  } finally {
    database.close();
  }
}
