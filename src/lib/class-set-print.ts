import type { ChoiceOverride, Narrative, Question, TestConfig } from './types.ts';
import { generateTypst, generateVersionedAnswerKeyPage, type McqPosition } from './typst/template.ts';

export type ClassSetOrder = 'alternating' | 'grouped';

export interface ClassSetPrintRequest {
  copies: number;
  versions: number;
  order: ClassSetOrder;
  /** Print "Version A/B" on student papers. Answer-key headings always identify their version. */
  showVersionLabel?: boolean;
}

export interface ClassSetPrintPlan {
  copies: number;
  versions: number;
  order: ClassSetOrder;
  sequence: number[];
  counts: number[];
}

export interface GeneratedClassSet {
  source: string;
  plan: ClassSetPrintPlan;
  answerKeyCount: number;
  /** One source per version, used to locate MCQs before building answer strips. */
  versionSources: string[];
}

const MAX_COPIES = 500;
const MAX_VERSIONS = 26;

function boundedInteger(value: number, minimum: number, maximum: number): number {
  const finite = Number.isFinite(value) ? Math.round(value) : minimum;
  return Math.max(minimum, Math.min(maximum, finite));
}

export function versionLabel(index: number): string {
  return String.fromCharCode(65 + boundedInteger(index, 0, MAX_VERSIONS - 1));
}

/** A predictable paper order and distribution, shared by the preview summary and generator. */
export function classSetPrintPlan(request: ClassSetPrintRequest): ClassSetPrintPlan {
  const copies = boundedInteger(request.copies, 1, MAX_COPIES);
  const versions = boundedInteger(request.versions, 1, Math.min(MAX_VERSIONS, copies));
  const sequence = request.order === 'grouped'
    ? Array.from({ length: versions }, (_, version) =>
        Array.from({ length: Math.ceil((copies - version) / versions) }, () => version),
      ).flat().slice(0, copies)
    : Array.from({ length: copies }, (_, copy) => copy % versions);
  const counts = Array.from({ length: versions }, (_, version) => sequence.filter(item => item === version).length);
  return { copies, versions, order: request.order, sequence, counts };
}

/** Legacy questions may keep their choices in a rendered grid instead of `choices`. */
export function choicesForQuestion(question: Pick<Question, 'body' | 'choices'>): Record<string, string> | null {
  if (question.choices && Object.keys(question.choices).length >= 2) return question.choices;
  const gridIndex = question.body.lastIndexOf('\n\n#grid(');
  if (gridIndex < 0) return null;
  const choices: Record<string, string> = {};
  for (const match of question.body.slice(gridIndex).matchAll(/\[\*\(([A-E])\)\*\s*(.*?)\]/g)) {
    choices[match[1]] = match[2].trim();
  }
  return Object.keys(choices).length >= 2 ? choices : null;
}

function hash32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffled<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  let state = seed || 0x9e3779b9;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function answerLetter(question: Question): string {
  const answer = (question.answer ?? '').trim().toUpperCase();
  if (/^[A-E]$/.test(answer)) return answer;
  const legacy = (question.solution ?? '').trim().toUpperCase();
  return /^[A-E]$/.test(legacy) ? legacy : '';
}

function choiceSignature(choices: Record<string, string>): string {
  return Object.keys(choices).sort().map(letter => choices[letter]).join('\u0000');
}

function overrideForOrder(question: Question, choices: Record<string, string>, order: string[]): ChoiceOverride {
  const correct = answerLetter(question);
  let solution = '';
  const remapped: Record<string, string> = {};
  order.forEach((originalLetter, index) => {
    const letter = String.fromCharCode(65 + index);
    remapped[letter] = choices[originalLetter];
    if (originalLetter === correct) solution = letter;
  });
  return { choices: remapped, solution };
}

/**
 * Version A keeps the teacher's current order. Later versions start from the source choices and
 * avoid repeating a prior displayed order whenever the question has enough permutations.
 */
export function choiceOverridesByVersion(config: TestConfig, questions: Question[], versionCount: number): Record<string, ChoiceOverride>[] {
  const count = boundedInteger(versionCount, 1, MAX_VERSIONS);
  const versions: Record<string, ChoiceOverride>[] = [{ ...config.choiceOverrides }];
  const seen = new Map<string, Set<string>>();
  for (const question of questions) {
    const original = choicesForQuestion(question);
    if (!original) continue;
    const current = config.choiceOverrides[question.id]?.choices ?? original;
    seen.set(question.id, new Set([choiceSignature(current)]));
  }

  for (let version = 1; version < count; version += 1) {
    const overrides = { ...config.choiceOverrides };
    for (const question of questions) {
      const original = choicesForQuestion(question);
      if (!original) continue;
      const letters = Object.keys(original);
      const signatures = seen.get(question.id)!;
      let candidate = letters;
      for (let attempt = 0; attempt < 64; attempt += 1) {
        candidate = shuffled(letters, hash32(`${question.id}:${version}:${attempt}`));
        const signature = candidate.map(letter => original[letter]).join('\u0000');
        if (!signatures.has(signature)) {
          signatures.add(signature);
          break;
        }
      }
      overrides[question.id] = overrideForOrder(question, original, candidate);
    }
    versions.push(overrides);
  }
  return versions;
}

function joinDocuments(documents: string[]): string {
  // Each generated document contains its own set/show rules. A content block gives those
  // rules a local style scope; without it, 30 copies of the display-math show rule stack
  // globally until Typst reports "Maximum show rule depth exceeded".
  return documents
    .map(source => `#[\n${source}\n]`)
    .join('\n\n#pagebreak()\n#counter(page).update(1)\n\n');
}

/** Build one printable PDF: every student paper, then one combined key covering all versions. */
export function generateClassSet(
  request: ClassSetPrintRequest,
  config: TestConfig,
  questions: Question[],
  narratives: Narrative[] = [],
  positionsByVersion: Array<McqPosition[] | null> = [],
): GeneratedClassSet {
  const plan = classSetPrintPlan(request);
  const overrides = choiceOverridesByVersion(config, questions, plan.versions);
  const versionConfigs = overrides.map(choiceOverrides => ({
    ...config,
    choiceOverrides,
    showAnswerKey: false,
  }));
  const testSources = versionConfigs.map((versionConfig, index) =>
    generateTypst(versionConfig, questions, narratives, {
      versionLabel: request.showVersionLabel === false ? undefined : `Version ${versionLabel(index)}`,
    }),
  );
  const papers = plan.sequence.map(version => testSources[version]);
  const combinedKey = generateVersionedAnswerKeyPage(
    versionConfigs.map((versionConfig, index) => ({
      label: versionLabel(index),
      config: versionConfig,
      positions: positionsByVersion[index] ?? null,
    })),
    questions,
    narratives,
  );
  const keys = combinedKey ? [combinedKey] : [];
  return {
    source: joinDocuments([...papers, ...keys]),
    plan,
    answerKeyCount: keys.length,
    versionSources: testSources,
  };
}
