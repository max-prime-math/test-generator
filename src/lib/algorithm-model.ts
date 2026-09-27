import type { AlgorithmDisplayFormat, AlgorithmGraphTemplate, AlgorithmSlot } from './types';

/** Shared by import and bank storage so both keep the same optional algorithm fields. */
export function normalizeAlgorithmDisplay(value: unknown): AlgorithmDisplayFormat | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const display: AlgorithmDisplayFormat = {};
  if (raw.sign === 'auto' || raw.sign === 'always') display.sign = raw.sign;
  if (typeof raw.decimals === 'number' && Number.isInteger(raw.decimals) && raw.decimals >= 0 && raw.decimals <= 10) {
    display.decimals = raw.decimals;
  }
  if (raw.group === true) display.group = true;
  return Object.keys(display).length ? display : undefined;
}

export function normalizeAlgorithmSlots(value: unknown): AlgorithmSlot[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const slots = value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      name: typeof entry.name === 'string' ? entry.name : '',
      field: typeof entry.field === 'string' ? entry.field : '',
      // Not trimmed: surrounding spaces are part of what the slot matches.
      text: typeof entry.text === 'string' ? entry.text : '',
      occurrence: typeof entry.occurrence === 'number' && Number.isInteger(entry.occurrence) && entry.occurrence >= 0 ? entry.occurrence : -1,
    }))
    .filter((slot) => slot.name && slot.text && slot.occurrence >= 0 && /^(body|narrative|solution|choice:[A-Za-z0-9]+)$/.test(slot.field));
  return slots.length ? slots : undefined;
}

export function normalizeAlgorithmGraphs(value: unknown): AlgorithmGraphTemplate[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const graphs = value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .filter((entry) => typeof entry.image === 'string' && entry.image && entry.graph && typeof entry.graph === 'object' && !Array.isArray(entry.graph))
    .map((entry) => ({ image: entry.image as string, graph: entry.graph as Record<string, unknown> }));
  return graphs.length ? graphs : undefined;
}
