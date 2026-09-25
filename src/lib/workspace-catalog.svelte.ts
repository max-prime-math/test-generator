import type { RepoAppData, RepoDataImage } from '../git/repoDataModel.ts';
import type { Class, Question } from './types.ts';
import { snapshotTest } from './workspace-format.ts';
import { defaultTestConfig } from './types.ts';
import { yieldWorkspaceProgress } from './workspace-progress.ts';

export interface FolderBank { id: string; name: string; data: RepoAppData }

export interface CatalogSnapshot {
  banks: FolderBank[];
  questions: Question[];
  sources: Record<string, { bankId: string; bankName: string; questionId: string }>;
  classes: Class[];
  images: RepoDataImage[];
}

export class WorkspaceCatalog {
  banks = $state<FolderBank[]>([]);
  questions = $state<Question[]>([]);
  sources = $state<Record<string, { bankId: string; bankName: string; questionId: string }>>({});
  classes = $state<Class[]>([]);
  images: RepoDataImage[] = [];

  async replace(banks: FolderBank[], onProgress?: (completed: number, total: number, bankName: string) => void): Promise<void> {
    const questions: Question[] = [];
    const images: RepoDataImage[] = [];
    const sources: typeof this.sources = {};
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
      for (const original of captured.test.questionSnapshots!) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([bank.id, original.id])));
        const id = `ws-${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
        const narrative = captured.test.narrativeSnapshots?.find(n => n.id === original.narrativeId);
        // Inline the narrative snapshot: identifiers may collide across source banks.
        questions.push({ ...original, id, narrativeId: undefined, narrative: narrative?.body ?? original.narrative });
        sources[id] = { bankId: bank.id, bankName: bank.name, questionId: original.id };
        onProgress?.(questions.length, total, bank.name);
        if (onProgress && questions.length % 25 === 0) await yieldWorkspaceProgress();
      }
    }
    this.banks = banks;
    this.questions = questions;
    this.sources = sources;
    this.classes = [...classes.values()];
    this.images = [...new Map(images.map(image => [image.name, image])).values()];
  }

  snapshot(): CatalogSnapshot {
    return { banks: $state.snapshot(this.banks), questions: $state.snapshot(this.questions),
      sources: $state.snapshot(this.sources), classes: $state.snapshot(this.classes), images: this.images };
  }

  restore(snapshot: CatalogSnapshot): void {
    this.banks = snapshot.banks;
    this.questions = snapshot.questions;
    this.sources = snapshot.sources;
    this.classes = snapshot.classes;
    this.images = snapshot.images;
  }

  clear(): void { this.banks = []; this.questions = []; this.sources = {}; this.classes = []; this.images = []; }
}

export const workspaceCatalog = new WorkspaceCatalog();
