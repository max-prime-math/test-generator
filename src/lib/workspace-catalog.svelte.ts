import type { RepoAppData, RepoDataImage } from '../git/repoDataModel.ts';
import type { Class, Question } from './types.ts';
import { contentImages, mergeWorkspaceClasses, snapshotTest } from './workspace-format.ts';
import { defaultTestConfig } from './types.ts';
import { yieldWorkspaceProgress } from './workspace-progress.ts';

export interface FolderBank { id: string; name: string; data: RepoAppData }

export interface CatalogSnapshot {
  banks: FolderBank[];
  questions: Question[];
  sources: Record<string, { bankId: string; bankName: string; questionId: string }>;
  classes: Class[];
  images: RepoDataImage[];
  /** Optional for caches written before incremental catalog updates. */
  imageNamesByBank?: Record<string, string[]>;
}

export class WorkspaceCatalog {
  banks = $state<FolderBank[]>([]);
  questions = $state<Question[]>([]);
  sources = $state<Record<string, { bankId: string; bankName: string; questionId: string }>>({});
  classes = $state<Class[]>([]);
  images: RepoDataImage[] = [];
  #imageNamesByBank = new Map<string, string[]>();

  async replace(banks: FolderBank[], onProgress?: (completed: number, total: number, bankName: string) => void): Promise<void> {
    const questions: Question[] = [];
    const images: RepoDataImage[] = [];
    const sources: typeof this.sources = {};
    const imageNamesByBank = new Map<string, string[]>();
    const classes = new Map<string, Class>();
    const total = banks.reduce((sum, bank) => sum + bank.data.questions.length, 0);
    onProgress?.(0, total, '');
    for (const bank of banks) {
      for (const cls of bank.data.customClasses) {
        const existing = classes.get(cls.id);
        if (!existing) classes.set(cls.id, JSON.parse(JSON.stringify(cls)));
        else for (const unit of cls.units) {
          const previous = existing.units.find(u => u.id === unit.id);
          if (!previous) existing.units.push(JSON.parse(JSON.stringify(unit)));
          else for (const section of unit.sections) if (!previous.sections.some(s => s.id === section.id)) previous.sections.push(JSON.parse(JSON.stringify(section)));
        }
      }
      const captured = snapshotTest({ id: 'catalog', name: bank.name, classId: null, unitId: null, testType: null,
        config: { ...defaultTestConfig(), selectedIds: bank.data.questions.map(q => q.id) }, createdAt: 0, updatedAt: 0 }, bank.data);
      images.push(...captured.images);
      imageNamesByBank.set(bank.id, captured.images.map(image => image.name));
      for (const original of captured.test.questionSnapshots!) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([bank.id, original.id])));
        const id = `ws-${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
        const narrative = captured.test.narrativeSnapshots?.find(n => n.id === original.narrativeId);
        // Inline the narrative snapshot: identifiers may collide across source banks.
        questions.push({ ...original, id, narrativeId: undefined, narrative: narrative?.body ?? original.narrative });
        sources[id] = { bankId: bank.id, bankName: bank.name, questionId: original.id };
        onProgress?.(questions.length, total, bank.name);
        if (questions.length % 25 === 0) await yieldWorkspaceProgress();
      }
    }
    this.#imageNamesByBank = imageNamesByBank;
    this.banks = banks;
    this.questions = questions;
    this.sources = sources;
    this.classes = [...classes.values()];
    this.images = [...new Map(images.map(image => [image.name, image])).values()];
  }

  /** Refresh only the edited bank; stable catalog IDs and untouched question objects survive. */
  async updateBank(bank: FolderBank): Promise<RepoDataImage[]> {
    const previousIds = new Map<string, string>();
    const untouchedQuestions: Question[] = [];
    const sources: typeof this.sources = {};
    for (const question of this.questions) {
      const source = this.sources[question.id];
      if (source?.bankId === bank.id) previousIds.set(source.questionId, question.id);
      else {
        untouchedQuestions.push(question);
        if (source) sources[question.id] = source;
      }
    }

    // Old caches lack image membership. Recover it once without recompiling,
    // rewriting image references, or hashing the other banks' questions/assets.
    for (const existing of this.banks) {
      if (this.#imageNamesByBank.has(existing.id)) continue;
      const questions = this.questions.filter(question => this.sources[question.id]?.bankId === existing.id);
      this.#imageNamesByBank.set(existing.id, contentImages(questions, [], this.images).map(image => image.name));
      await yieldWorkspaceProgress();
    }

    await yieldWorkspaceProgress();
    const captured = snapshotTest({ id: 'catalog', name: bank.name, classId: null, unitId: null, testType: null,
      config: { ...defaultTestConfig(), selectedIds: bank.data.questions.map(question => question.id) }, createdAt: 0, updatedAt: 0 }, bank.data);
    const narratives = new Map(captured.test.narrativeSnapshots?.map(narrative => [narrative.id, narrative]));
    const questions: Question[] = [];
    for (const original of captured.test.questionSnapshots!) {
      let id = previousIds.get(original.id);
      if (!id) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([bank.id, original.id])));
        id = `ws-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
      }
      questions.push({ ...original, id, narrativeId: undefined,
        narrative: narratives.get(original.narrativeId ?? '')?.body ?? original.narrative });
      sources[id] = { bankId: bank.id, bankName: bank.name, questionId: original.id };
      if (questions.length % 25 === 0) await yieldWorkspaceProgress();
    }
    const banks = this.banks.some(existing => existing.id === bank.id)
      ? this.banks.map(existing => existing.id === bank.id ? bank : existing)
      : [...this.banks, bank];
    this.#imageNamesByBank.set(bank.id, captured.images.map(image => image.name));
    const imageNames = new Set([...this.#imageNamesByBank.values()].flat());
    const images = new Map([...this.images, ...captured.images].filter(image => imageNames.has(image.name)).map(image => [image.name, image]));
    const byBank = new Map<string, Question[]>();
    for (const question of untouchedQuestions) {
      const bankId = sources[question.id]?.bankId;
      if (!bankId) continue;
      const group = byBank.get(bankId) ?? [];
      group.push(question);
      byBank.set(bankId, group);
    }
    byBank.set(bank.id, questions);
    this.banks = banks;
    this.questions = banks.flatMap(existing => byBank.get(existing.id) ?? []);
    this.sources = sources;
    this.classes = mergeWorkspaceClasses(banks.flatMap(existing => existing.data.customClasses));
    const orderedImageNames = new Set(banks.flatMap(existing => this.#imageNamesByBank.get(existing.id) ?? []));
    this.images = [...orderedImageNames].flatMap(name => images.has(name) ? [images.get(name)!] : []);
    return captured.images;
  }

  snapshot(): CatalogSnapshot {
    return { banks: $state.snapshot(this.banks), questions: $state.snapshot(this.questions),
      sources: $state.snapshot(this.sources), classes: $state.snapshot(this.classes), images: this.images,
      imageNamesByBank: Object.fromEntries(this.#imageNamesByBank) };
  }

  restore(snapshot: CatalogSnapshot): void {
    this.#imageNamesByBank = new Map(Object.entries(snapshot.imageNamesByBank ?? {}));
    this.banks = snapshot.banks;
    this.questions = snapshot.questions;
    this.sources = snapshot.sources;
    this.classes = snapshot.classes;
    this.images = snapshot.images;
  }

  clear(): void { this.#imageNamesByBank.clear(); this.banks = []; this.questions = []; this.sources = {}; this.classes = []; this.images = []; }
}

export const workspaceCatalog = new WorkspaceCatalog();
