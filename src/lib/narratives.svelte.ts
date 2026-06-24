import type { Narrative } from './types';

export const NARRATIVES_KEY = 'tg-narratives-v1';

function load(): Narrative[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(NARRATIVES_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? normalizeNarratives(parsed) : [];
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(NARRATIVES_KEY, JSON.stringify(_narratives));
}

let _narratives = $state<Narrative[]>(load());

export const narratives = {
  get narratives(): Narrative[] { return _narratives; },

  getById(id: string | undefined): Narrative | undefined {
    if (!id) return undefined;
    return _narratives.find((narrative) => narrative.id === id);
  },

  importMany(incoming: Narrative[]): number {
    const normalized = normalizeNarratives(incoming);
    if (normalized.length === 0) return 0;
    const incomingIds = new Set(normalized.map((narrative) => narrative.id));
    _narratives = [
      ..._narratives.filter((narrative) => !incomingIds.has(narrative.id)),
      ...normalized,
    ];
    save();
    return normalized.length;
  },

  replaceAll(incoming: Narrative[]): void {
    _narratives = normalizeNarratives(incoming);
    save();
  },

  add(data: Omit<Narrative, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Narrative {
    const now = Date.now();
    const title = data.title.trim() || 'Shared Instructions';
    const narrative: Narrative = {
      id: data.id?.trim() || makeNarrativeId(title, now),
      title,
      body: data.body.trim(),
      tags: normalizeTags(data.tags),
      classId: normalizeOptionalString(data.classId),
      unitId: normalizeOptionalString(data.unitId),
      sectionId: normalizeOptionalString(data.sectionId),
      createdAt: now,
    };
    _narratives = [..._narratives.filter((item) => item.id !== narrative.id), narrative];
    save();
    return narrative;
  },

  update(id: string, data: Partial<Omit<Narrative, 'id' | 'createdAt'>>): void {
    const now = Date.now();
    _narratives = _narratives.map((narrative) => {
      if (narrative.id !== id) return narrative;
      const next: Narrative = {
        ...narrative,
        ...data,
        title: data.title !== undefined ? data.title.trim() : narrative.title,
        body: data.body !== undefined ? data.body.trim() : narrative.body,
        tags: data.tags !== undefined ? normalizeTags(data.tags) : narrative.tags,
        classId: data.classId !== undefined ? normalizeOptionalString(data.classId) : narrative.classId,
        unitId: data.unitId !== undefined ? normalizeOptionalString(data.unitId) : narrative.unitId,
        sectionId: data.sectionId !== undefined ? normalizeOptionalString(data.sectionId) : narrative.sectionId,
        updatedAt: now,
      };
      return stripUndefined(next);
    });
    save();
  },

  remove(id: string): void {
    _narratives = _narratives.filter((narrative) => narrative.id !== id);
    save();
  },
};

function normalizeNarratives(value: unknown[]): Narrative[] {
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => {
      const id = stringValue(entry.id);
      const body = stringValue(entry.body);
      if (!id || !body) return null;
      const title = stringValue(entry.title) || 'Shared Instructions';
      const createdAt = numberValue(entry.createdAt) ?? Date.now();
      const updatedAt = numberValue(entry.updatedAt);
      const narrative: Narrative = {
        id,
        title,
        body,
        tags: Array.isArray(entry.tags) ? normalizeTags(entry.tags) : [],
        classId: normalizeOptionalString(entry.classId),
        unitId: normalizeOptionalString(entry.unitId),
        sectionId: normalizeOptionalString(entry.sectionId),
        createdAt,
        updatedAt,
      };
      return stripUndefined(narrative);
    })
    .filter((entry): entry is Narrative => entry !== null);
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = stringValue(value);
  return normalized || undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function makeNarrativeId(title: string, now: number): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `narrative-${slug || 'shared-instructions'}-${now}`;
}

function stripUndefined<T>(value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const cleaned: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (nested !== undefined) cleaned[key] = nested;
  }
  return cleaned as T;
}
