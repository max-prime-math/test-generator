// Builders and readers for generator options (the fine-tuning controls in a
// problem type's settings card). Values arrive resolved: every declared option is
// present, set to the teacher's choice or to the level's value.
import type { GenOptions, OptionSpec } from './types.ts';

type Three<T> = [T, T, T];
const byLevel = <T>(v: Three<T>) => ({ 1: String(v[0]), 2: String(v[1]), 3: String(v[2]) });

/** A size-of-numbers slider: the largest number used, shown as ±N. */
export function sizeOption(values: number[], levels: Three<number>, label = 'Size of numbers'): OptionSpec {
  return { id: 'size', label, kind: 'one', slider: true, choices: values.map((v) => ({ value: String(v), label: `±${v}` })), levels: byLevel(levels) };
}

/** A single choice shown as radio buttons. */
export function radioOption(id: string, label: string, choices: Array<[value: string, label: string]>, levels: Three<string>, help?: string): OptionSpec {
  return { id, label, kind: 'one', choices: choices.map(([value, l]) => ({ value, label: l })), levels: byLevel(levels), help };
}

/** A checkbox. */
export function toggleOption(id: string, label: string, levels: Three<boolean>, help?: string): OptionSpec {
  return { id, label, kind: 'toggle', choices: [], levels: byLevel(levels.map((v) => (v ? 'yes' : 'no')) as Three<string>), help };
}

/** Any subset of choices, shown as checkboxes. */
export function manyOption(id: string, label: string, choices: Array<[value: string, label: string]>, levels: Three<string[]>, help?: string): OptionSpec {
  return { id, label, kind: 'many', choices: choices.map(([value, l]) => ({ value, label: l })), levels: byLevel(levels.map((v) => v.join(',')) as Three<string>), help };
}

/** Read a numeric option, with a fallback for direct calls that pass no options. */
export const optNum = (o: GenOptions | undefined, id: string, fallback: number) => (o?.[id] ? Number(o[id]) : fallback);
/** Read a single-choice option. */
export const optOne = (o: GenOptions | undefined, id: string, fallback: string): string => o?.[id] || fallback;
/** Read a checkbox option. */
export const optOn = (o: GenOptions | undefined, id: string, fallback: boolean) => (o?.[id] ? o[id] === 'yes' : fallback);
/** Read a many-choice option; an empty selection falls back. */
export const optList = (o: GenOptions | undefined, id: string, fallback: string[]) => {
  const list = (o?.[id] ?? '').split(',').filter(Boolean);
  return list.length ? list : fallback;
};
