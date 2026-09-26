import { bank } from '../bank.svelte';
import { bankWorkspaces } from '../bank-workspaces.svelte';
import { narratives } from '../narratives.svelte';
import { imageKeyFromReference } from '../image-keys';
import { referencedImageNames } from './image-references';
import { scanImageRefs } from '../typst/image-shadow';
import type { DraftQuestion, Question } from '../types';
import type { ParsedBulkImportKind } from '../bulk-import';
import { commitDraft, duplicateDraft, editDraft, importDraft, newDraft, questionData, type EditorDefaults, type EditorDraft } from './editor-model';
import type { EditorSession } from './editor-drafts';
import { DraftJournal, loadDrafts, openDraftDb, type LoadedDrafts } from './draft-store';
import { perf } from '../perf-diagnostics';

const FLUSH_DELAY_MS = 400;

class EditorState {
  session = $state<EditorSession>({ version: 1, drafts: [], defaults: { classId: '', unitId: '', sectionId: '', points: 5, tagInput: '' }, activeId: null });
  storageError = $state('');
  status = $state('Draft saved locally');
  /** True until this bank's drafts have been read from browser storage. */
  loading = $state(true);
  pendingImport = $state<{ questions: DraftQuestion[]; kind?: ParsedBulkImportKind } | null>(null);
  private readFailed = false;
  // Bank switching changes activeBankId first; every write must still go to
  // the bank these drafts were loaded from.
  private bankId = bankWorkspaces.activeBankId;
  /** Last persisted JSON per draft, for per-draft change detection. */
  private persisted = new Map<string, string>();
  private orders = new Map<string, number>();
  private lastMeta = '';
  private journal: DraftJournal | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private flushing: Promise<void> | null = null;
  private generation = 0;
  constructor() {
    const generation = this.generation;
    void this.load(this.bankId).then(loaded => { if (generation === this.generation) this.install(this.bankId, loaded); });
  }

  /** Read a bank's drafts (migrating legacy storage) without changing live state. */
  async load(bankId: string): Promise<{ loaded?: LoadedDrafts; error?: string }> {
    const done = perf.start('Editor drafts: load');
    try {
      const database = await openDraftDb();
      try { return { loaded: await loadDrafts(database, localStorage, bankId) }; }
      finally { database.close(); done(); }
    } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }

  install(bankId: string, result: { loaded?: LoadedDrafts; error?: string }) {
    clearTimeout(this.flushTimer);
    this.generation++;
    // Only the first load can have drafts created while it ran. On a bank
    // switch the live drafts belong to the outgoing bank and must not carry over.
    const initialLoad = this.loading && bankId === this.bankId;
    if (!initialLoad) this.session = { ...this.session, drafts: [], activeId: null };
    this.bankId = bankId;
    this.loading = false;
    if (!result.loaded) {
      this.readFailed = true;
      this.storageError = result.error ?? 'Saved Editor drafts could not be read.';
      this.journal = null;
      return;
    }
    // Keep drafts created before loading finished (for example, Edit from the Bank).
    const loadedSources = new Map(result.loaded.session.drafts.filter(draft => draft.sourceId).map(draft => [draft.sourceId!, draft.id]));
    const earlyDrafts = this.session.drafts.filter(draft => !result.loaded!.orders.has(draft.id));
    // An early "Edit" of a question that already has a draft reopens that draft.
    const early = earlyDrafts.filter(draft => !draft.sourceId || !loadedSources.has(draft.sourceId));
    const earlyOpened = earlyDrafts.find(draft => draft.id === this.session.activeId);
    const earlyActive = earlyOpened?.sourceId && loadedSources.get(earlyOpened.sourceId) || this.session.activeId;
    this.readFailed = false;
    this.storageError = '';
    this.session = result.loaded.session;
    this.orders = result.loaded.orders;
    this.persisted = new Map(this.session.drafts.map(draft => [draft.id, JSON.stringify(draft)]));
    this.lastMeta = JSON.stringify(this.meta());
    try { this.journal = DraftJournal.resume(localStorage, bankId); }
    catch (error) { this.readFailed = true; this.storageError = String(error); return; }
    if (this.journal.size) this.scheduleFlush();
    for (const draft of early) this.add(draft);
    if (earlyActive && this.session.drafts.some(draft => draft.id === earlyActive)) this.session.activeId = earlyActive;
    this.persistMeta();
  }

  private meta() { return { defaults: this.session.defaults, activeId: this.session.activeId }; }

  /** Record one draft's change. Cost is proportional to that draft, not to the session. */
  persistDraft(draft: EditorDraft | undefined, json = draft ? JSON.stringify(draft) : '') {
    if (!draft || this.readFailed || !this.journal) return;
    if (this.persisted.get(draft.id) === json) return;
    if (!this.orders.has(draft.id)) this.orders.set(draft.id, Math.max(-1, ...this.orders.values()) + 1);
    this.write(() => this.journal!.put(draft, this.orders.get(draft.id)!, json));
    this.persisted.set(draft.id, json);
  }

  persistMeta() {
    if (this.readFailed || !this.journal) return;
    const json = JSON.stringify(this.meta());
    if (json === this.lastMeta) return;
    this.write(() => this.journal!.meta(this.meta()));
    this.lastMeta = json;
  }

  /** Full comparison for bulk edits made outside the editor's own methods. */
  persist() {
    if (this.readFailed || !this.journal) return;
    const live = new Set(this.session.drafts.map(draft => draft.id));
    for (const id of [...this.persisted.keys()]) if (!live.has(id)) this.remove(id);
    for (const draft of this.session.drafts) this.persistDraft(draft);
    this.persistMeta();
  }

  private remove(id: string) {
    this.write(() => this.journal!.delete(id));
    this.persisted.delete(id);
    this.orders.delete(id);
  }

  private write(action: () => void) {
    const done = perf.start('Editor drafts: local write');
    try {
      action();
      this.storageError = '';
      this.status = this.current ? 'Draft saved locally' : 'Saved locally';
    } catch {
      this.storageError = 'Draft could not be saved locally. Browser storage may be full. Keep this page open until you can save.';
      this.status = 'Not saved';
    }
    done();
    this.scheduleFlush();
  }

  private scheduleFlush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), FLUSH_DELAY_MS);
  }

  /** Move journaled changes into IndexedDB. Safe to call at any time. */
  async flush(): Promise<void> {
    clearTimeout(this.flushTimer);
    if (this.flushing) await this.flushing;
    const journal = this.journal;
    if (!journal?.size) return;
    this.flushing = (async () => {
      const done = perf.start('Editor drafts: IndexedDB flush');
      try {
        const database = await openDraftDb();
        try { await journal.flush(database); } finally { database.close(); }
        done();
      } catch {
        // Changes stay in the local journal and are retried; nothing is lost.
        perf.count('Editor drafts: flush retries');
        if (journal === this.journal) this.flushTimer = setTimeout(() => void this.flush(), 5_000);
      }
    })();
    try { await this.flushing; } finally { this.flushing = null; }
  }

  get current() { return this.session.drafts.find(d => d.id === this.session.activeId); }
  select(draft: EditorDraft) { this.status = 'Draft saved locally'; this.session.activeId = draft.id; this.persistMeta(); }
  add(draft: EditorDraft) { this.session.drafts.push(draft); this.persistDraft(draft); this.select(draft); return draft; }
  create(defaults: Partial<EditorDefaults> = {}) { return this.add(newDraft({ ...this.session.defaults, ...defaults })); }
  open(q: Question) {
    const draft = this.session.drafts.find(d => d.sourceId === q.id) ?? this.add(editDraft(q));
    this.select(draft); return draft;
  }
  duplicate(draft: EditorDraft) { return this.add(duplicateDraft(draft)); }
  stage(questions: DraftQuestion[]) {
    const drafts = questions.map(importDraft);
    this.session.drafts.push(...drafts);
    for (const draft of drafts) this.persistDraft(draft);
    if (drafts.length) this.select(drafts[drafts.length - 1]);
  }
  discard(id: string) {
    this.session.drafts = this.session.drafts.filter(d => d.id !== id);
    if (this.session.activeId === id) this.session.activeId = this.session.drafts[0]?.id ?? null;
    if (this.persisted.has(id)) this.remove(id);
    this.persistMeta();
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
bankWorkspaces.participate({
  beforeLeave: () => editor.flush(),
  prepare: (bankId) => editor.load(bankId),
  apply: (bankId, loaded) => editor.install(bankId, loaded),
});
export function openInEditor(q: Question) {
  editor.open(q);
  window.location.hash = `#/editor/${encodeURIComponent(q.id)}`;
}
export function newInEditor(defaults: Partial<EditorDefaults> = {}) {
  const draft = editor.create(defaults);
  window.location.hash = `#/editor/${encodeURIComponent(draft.id)}`;
}
