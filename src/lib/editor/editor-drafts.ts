import { emptyDefaults, type EditorDefaults, type EditorDraft } from './editor-model.ts';
export interface EditorSession { version: 1; drafts: EditorDraft[]; defaults: EditorDefaults; activeId: string | null }
export function draftKey(bankId: string): string { return `tg-editor-v1:${bankId}`; }
export function loadSession(storage: Pick<Storage, 'getItem'>, bankId: string): EditorSession {
  const raw = storage.getItem(draftKey(bankId));
  if (!raw) return { version: 1, drafts: [], defaults: { ...emptyDefaults }, activeId: null };
  const parsed = JSON.parse(raw);
  if (parsed.version !== 1 || !Array.isArray(parsed.drafts) || parsed.drafts.some((d: EditorDraft) => !d.id || typeof d.fields?.body !== 'string')) {
    throw new Error('Saved Editor drafts could not be read. The stored copy has been left intact.');
  }
  return { ...parsed, defaults: { ...emptyDefaults, ...parsed.defaults } };
}
export function saveSession(storage: Pick<Storage, 'setItem'>, bankId: string, session: EditorSession): void {
  storage.setItem(draftKey(bankId), JSON.stringify(session));
}
