import { bank } from '../bank.svelte';
import { bankWorkspaces } from '../bank-workspaces.svelte';
import { narratives } from '../narratives.svelte';
import { imageKeyFromReference } from '../image-keys';
import { referencedImageNames } from './image-references';
import { scanImageRefs } from '../typst/image-shadow';
import type { DraftQuestion, Question } from '../types';
import type { ParsedBulkImportKind } from '../bulk-import';
import { commitDraft, duplicateDraft, editDraft, importDraft, newDraft, questionData, type EditorDefaults, type EditorDraft } from './editor-model';
import { draftKey, loadSession, type EditorSession } from './editor-drafts';

class EditorState {
  session = $state<EditorSession>({ version: 1, drafts: [], defaults: { classId: '', unitId: '', sectionId: '', points: 5, tagInput: '' }, activeId: null });
  storageError = $state('');
  status = $state('Draft saved locally');
  pendingImport = $state<{ questions: DraftQuestion[]; kind?: ParsedBulkImportKind } | null>(null);
  private readFailed = false;
  private lastPersisted = '';
  // Bank switching updates activeBankId before reloading. Pagehide must still
  // flush this session to the bank it was loaded from.
  private bankId = bankWorkspaces.activeBankId;
  constructor() {
    try { this.session = loadSession(localStorage, this.bankId); }
    catch (error) { this.readFailed = true; this.storageError = String(error); }
  }
  get current() { return this.session.drafts.find(d => d.id === this.session.activeId); }
  persist(snapshot?: string) {
    if (this.readFailed) return;
    try {
      snapshot ??= JSON.stringify(this.session);
      if (snapshot === this.lastPersisted) return;
      localStorage.setItem(draftKey(this.bankId), snapshot);
      this.lastPersisted = snapshot;
      this.storageError = '';
      this.status = this.current ? 'Draft saved locally' : 'Saved locally';
    }
    catch { this.storageError = 'Draft could not be saved locally. Browser storage may be full. Keep this page open until you can save.'; }
  }
  select(draft: EditorDraft) { this.status = 'Draft saved locally'; this.session.activeId = draft.id; this.persist(); }
  add(draft: EditorDraft) { this.session.drafts.push(draft); this.select(draft); return draft; }
  create(defaults: Partial<EditorDefaults> = {}) { return this.add(newDraft({ ...this.session.defaults, ...defaults })); }
  open(q: Question) {
    const draft = this.session.drafts.find(d => d.sourceId === q.id) ?? this.add(editDraft(q));
    this.select(draft); return draft;
  }
  duplicate(draft: EditorDraft) { return this.add(duplicateDraft(draft)); }
  stage(questions: DraftQuestion[]) {
    const drafts = questions.map(importDraft);
    this.session.drafts.push(...drafts);
    if (drafts.length) this.select(drafts[drafts.length - 1]);
  }
  discard(id: string) {
    this.session.drafts = this.session.drafts.filter(d => d.id !== id);
    if (this.session.activeId === id) this.session.activeId = this.session.drafts[0]?.id ?? null;
    this.persist();
  }
  save(draft: EditorDraft): string {
    const data = questionData(draft);
    const narrative = narratives.getById(data.narrativeId ?? '');
    if (narrative) data.narrative = narrative.body;
    const refs = scanImageRefs([
      data.narrative ?? '', draft.fields.body, data.graphTypst ?? '', data.solution ?? '', ...Object.values(data.choices ?? {}),
    ].join('\n'));
    const originalRefs = new Set((draft.imageReferences ?? referencedImageNames(draft.original)).map(name => imageKeyFromReference(name).toLowerCase()));
    const currentRefs = new Set(refs.map(name => imageKeyFromReference(name).toLowerCase()));
    data.images = [...new Set([...(data.images ?? []).filter(name => !originalRefs.has(imageKeyFromReference(name).toLowerCase()) || currentRefs.has(imageKeyFromReference(name).toLowerCase())), ...refs])];
    const id = commitDraft(draft, bank, data);
    this.discard(draft.id);
    this.status = 'Saved to bank';
    return id;
  }
}
export const editor = new EditorState();
export function openInEditor(q: Question) {
  editor.open(q);
  window.location.hash = `#/editor/${encodeURIComponent(q.id)}`;
}
export function newInEditor(defaults: Partial<EditorDefaults> = {}) {
  const draft = editor.create(defaults);
  window.location.hash = `#/editor/${encodeURIComponent(draft.id)}`;
}
