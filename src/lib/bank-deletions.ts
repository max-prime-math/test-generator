// Questions and narratives this app deleted from a bank, by bank and folder path, until the
// workspace folder records them as deleted (see banks-sync-core.ts). Only these reach the
// folder as deletions: a question merely missing from this browser is never deleted there.
const KEY = 'tg-bank-deletions-v1';

type Store = Record<string, Record<string, number>>;
function read(): Store {
  try { const value = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return value && typeof value === 'object' ? value : {}; }
  catch { return {}; }
}
function write(store: Store): void {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* a lost intent only means the folder keeps the file */ }
}

export const bankDeletions = {
  record(bankId: string, paths: string[], at = Date.now()): void {
    if (!paths.length) return;
    const store = read();
    store[bankId] = { ...(store[bankId] ?? {}), ...Object.fromEntries(paths.map(path => [path, at])) };
    write(store);
  },
  list(bankId: string): Map<string, number> {
    return new Map(Object.entries(read()[bankId] ?? {}));
  },
  settle(bankId: string, paths: string[]): void {
    const store = read();
    if (!store[bankId]) return;
    for (const path of paths) delete store[bankId][path];
    if (!Object.keys(store[bankId]).length) delete store[bankId];
    write(store);
  },
};
