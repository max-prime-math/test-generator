import { hashRepoDataContent, type RepoAppData, type RepoDataImage } from '../git/repoDataModel.ts';
import type { Question, Narrative, SavedTest, Class } from './types.ts';
import { imageKeyFromReference } from './image-keys.ts';

export const WORKSPACE_MODE_KEY = 'tg-independent-workspace-v1';
export const WORKSPACE_SHARED_KEYS = ['tg-test-library-v1', 'tg-test-draft-v1', 'tg-gradebook-v1'];

/** First entry wins, preserving frozen snapshots ahead of editable originals. */
export function firstById<T extends { id: string }>(items: T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) if (!result.has(item.id)) result.set(item.id, item);
  return result;
}

export function mergeWorkspaceClasses(classes: Class[]): Class[] {
  const merged = new Map<string, Class>();
  for (const cls of classes) {
    const existing = merged.get(cls.id);
    if (!existing) { merged.set(cls.id, JSON.parse(JSON.stringify(cls))); continue; }
    for (const unit of cls.units) {
      const previous = existing.units.find(candidate => candidate.id === unit.id);
      if (!previous) existing.units.push(JSON.parse(JSON.stringify(unit)));
      else for (const section of unit.sections) {
        if (!previous.sections.some(candidate => candidate.id === section.id)) previous.sections.push(JSON.parse(JSON.stringify(section)));
      }
    }
  }
  return [...merged.values()];
}

export function workspaceId(id: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id) || id === '.' || id === '..') {
    throw new Error(`Unsafe workspace ID: ${id}`);
  }
  return id;
}

/** Only referenced assets cross a sharing boundary, never the entire image bag. */
export function contentImages(questions: Question[], narratives: Narrative[], images: RepoDataImage[]): RepoDataImage[] {
  const content = JSON.stringify([questions, narratives]);
  const declared = new Set(questions.flatMap(q => q.images ?? []).map(imageKeyFromReference));
  const seen = new Set<string>();
  return images.filter(image => {
    const key = JSON.stringify([image.name, image.ext]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).filter(image => declared.has(image.name)
    || content.includes(`/imgs/${image.name}.${image.ext}`)
    || content.includes(`{${image.name}}`) || content.includes(`{${image.name}.${image.ext}}`));
}

export function bankOnlyData(data: RepoAppData): RepoAppData {
  return {
    questions: data.questions,
    narratives: data.narratives ?? [],
    customClasses: data.customClasses,
    savedTests: [],
    images: contentImages(data.questions, data.narratives ?? [], data.images ?? []),
  };
}

/** Freeze content, including namespaced image references, for independent tests. */
export function snapshotTest(test: SavedTest, data: RepoAppData): { test: SavedTest; images: RepoDataImage[] } {
  const byId = firstById([...(test.questionSnapshots ?? []), ...data.questions]);
  const questions = test.config.selectedIds.map(id => {
    const question = byId.get(id);
    if (!question) throw new Error(`Saved test “${test.name}” is missing question ${id}. Open its source bank before saving the workspace.`);
    return question;
  });
  const narrativeIds = new Set(questions.map(q => q.narrativeId).filter(Boolean));
  const narratives = [...firstById([...(test.narrativeSnapshots ?? []), ...(data.narratives ?? [])]).values()]
    .filter(n => narrativeIds.has(n.id));
  const images = contentImages(questions, narratives, data.images ?? []);
  const replacements = new Map<string, string>();
  const renamed = images.map(image => {
    // The full content hash is stable; separate tests may safely share identical assets.
    const name = image.name.startsWith('testasset-') ? image.name
      : `testasset-${hashRepoDataContent(image.bytes).replace(/[^a-zA-Z0-9]/g, '-')}-${image.name.slice(-35)}`;
    replacements.set(image.name, name);
    return { ...image, name };
  });
  function rewrite(value: unknown): unknown {
    if (typeof value === 'string') {
      if (replacements.has(value)) return replacements.get(value);
      let text = value;
      for (const image of images) {
        const name = replacements.get(image.name)!;
        text = text.replaceAll(`/imgs/${image.name}.${image.ext}`, `/imgs/${name}.${image.ext}`)
          .replaceAll(`{${image.name}}`, `{${name}}`).replaceAll(`{${image.name}.${image.ext}}`, `{${name}.${image.ext}}`);
        if (text === `${image.name}.${image.ext}`) text = `${name}.${image.ext}`;
      }
      return text;
    }
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, rewrite(val)]));
    return value;
  }
  return {
    test: { ...test, questionSnapshots: rewrite(questions) as Question[], narrativeSnapshots: rewrite(narratives) as Narrative[] },
    images: renamed,
  };
}

export function standaloneTestData(test: SavedTest, images: RepoDataImage[], customClasses: RepoAppData['customClasses']): RepoAppData {
  if (!test.questionSnapshots) throw new Error(`Test “${test.name}” has no content snapshot.`);
  const referenced = new Set(test.questionSnapshots.map(q => q.classId));
  if (test.classId) referenced.add(test.classId);
  return {
    questions: test.questionSnapshots,
    narratives: test.narrativeSnapshots ?? [],
    customClasses: customClasses.filter(c => referenced.has(c.id)),
    savedTests: [test],
    images: contentImages(test.questionSnapshots, test.narrativeSnapshots ?? [], images),
  };
}
