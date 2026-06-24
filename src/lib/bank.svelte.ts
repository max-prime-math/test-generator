import type { Question } from './types';
import { AP_CALC_BC_QUESTIONS } from './ap-calc-bc-questions';
import { appState } from './app-state.svelte';
import { DEMO_CLASS_IDS } from './curriculum';
import { createId } from './id';

const KEY = 'math-test-bank-v2';
const DEMO_KEY = 'math-test-demo-bank-v1';

function load(): Question[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadDemo(): Question[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEMO_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeParts(parts: unknown): Question['parts'] | undefined {
  if (!parts || typeof parts !== 'object' || Array.isArray(parts)) return undefined;

  const stem = typeof (parts as { stem?: unknown }).stem === 'string' ? (parts as { stem: string }).stem : '';
  const itemsRaw = (parts as { items?: unknown }).items;
  if (!Array.isArray(itemsRaw)) return undefined;

  const items = itemsRaw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      label: typeof item.label === 'string' ? item.label : undefined,
      body: typeof item.body === 'string' ? item.body : '',
      parts: normalizeParts(item.parts),
    }))
    .filter((item) => item.body.trim().length > 0);

  if (items.length < 2) return undefined;

  return { stem, items };
}

function normalizeNarrative(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeDecodeDiagnostics(value: unknown): Question['decodeDiagnostics'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const diagnostics: NonNullable<Question['decodeDiagnostics']> = value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      level: (entry.level === 'info' || entry.level === 'warning' || entry.level === 'error' ? entry.level : 'info') as NonNullable<Question['decodeDiagnostics']>[number]['level'],
      code: typeof entry.code === 'string' ? entry.code : '',
      message: typeof entry.message === 'string' ? entry.message : '',
    }))
    .filter((entry) => entry.code && entry.message);
  return diagnostics.length ? diagnostics : undefined;
}

function normalizeAlgorithmModel(value: unknown): Question['algorithmModel'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const definitionsRaw = (value as { definitions?: unknown }).definitions;
  if (!Array.isArray(definitionsRaw)) return undefined;
  const definitions: NonNullable<Question['algorithmModel']>['definitions'] = definitionsRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry, index) => ({
      id: typeof entry.id === 'string' ? entry.id : `alg-${index + 1}`,
      name: typeof entry.name === 'string' ? entry.name : '',
      kind: (entry.kind === 'variable' || entry.kind === 'constant' || entry.kind === 'condition' || entry.kind === 'user-function'
        ? entry.kind
        : 'unknown') as NonNullable<Question['algorithmModel']>['definitions'][number]['kind'],
      rawExpression: typeof entry.rawExpression === 'string' ? entry.rawExpression : undefined,
      sampleValue: typeof entry.sampleValue === 'string' ? entry.sampleValue : undefined,
      dependencies: Array.isArray(entry.dependencies) ? entry.dependencies.filter((item): item is string => typeof item === 'string') : [],
      source: typeof entry.source === 'string' ? entry.source : 'unknown',
    }))
    .filter((entry) => entry.name);
  if (!definitions.length) return undefined;
  const sequenceRaw = (value as { sequence?: unknown }).sequence;
  const sequence: NonNullable<Question['algorithmModel']>['sequence'] = Array.isArray(sequenceRaw)
    ? sequenceRaw
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
      .map((entry, index) => ({
        id: typeof entry.id === 'string' ? entry.id : `alg-seq-${index + 1}`,
        order: typeof entry.order === 'number' ? entry.order : index + 1,
        text: typeof entry.text === 'string' ? entry.text : '',
        kind: (
          entry.kind === 'variable-name'
          || entry.kind === 'rule'
          || entry.kind === 'sample-value'
          || entry.kind === 'condition'
          || entry.kind === 'support-token'
          || entry.kind === 'control'
          ? entry.kind
          : 'unknown'
        ) as NonNullable<Question['algorithmModel']>['sequence'][number]['kind'],
        ownerKind: (
          entry.ownerKind === 'question'
          || entry.ownerKind === 'narrative'
          || entry.ownerKind === 'matching-group'
          ? entry.ownerKind
          : 'question'
        ) as NonNullable<Question['algorithmModel']>['sequence'][number]['ownerKind'],
        definitionName: typeof entry.definitionName === 'string' ? entry.definitionName : undefined,
        source: typeof entry.source === 'string' ? entry.source : 'unknown',
      }))
      .filter((entry) => entry.text)
    : [];
  const scopeKind = (value as { scope?: { kind?: unknown } }).scope?.kind;
  return {
    scope: {
      kind: scopeKind === 'question' || scopeKind === 'narrative' || scopeKind === 'matching-group' ? scopeKind : 'question',
    },
    definitions,
    sequence,
    source: typeof (value as { source?: unknown }).source === 'string' ? (value as { source: string }).source : 'unknown',
  };
}

function normalizeAlgorithmEvaluation(value: unknown): Question['algorithmEvaluation'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entriesRaw = (value as { entries?: unknown }).entries;
  if (!Array.isArray(entriesRaw)) return undefined;
  const entries: NonNullable<Question['algorithmEvaluation']>['entries'] = entriesRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      name: typeof entry.name === 'string' ? entry.name : '',
      status: (entry.status === 'resolved' || entry.status === 'unresolved' ? entry.status : 'unresolved') as NonNullable<Question['algorithmEvaluation']>['entries'][number]['status'],
      value: typeof entry.value === 'string' ? entry.value : undefined,
    }))
    .filter((entry) => entry.name);
  if (!entries.length) return undefined;
  return {
    entries,
    diagnostics: normalizeDecodeDiagnostics((value as { diagnostics?: unknown }).diagnostics) ?? [],
  };
}

function graphString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function graphNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function normalizeGraphObjectKind(value: unknown): NonNullable<Question['graphModel']>['objects'][number]['kind'] {
  return (
    value === 'function'
    || value === 'relation'
    || value === 'point'
    || value === 'ray'
    || value === 'segment'
    || value === 'picture'
    || value === 'shape'
    || value === 'text'
  )
    ? value
    : 'unknown';
}

function normalizeGraphRelation(value: unknown): NonNullable<Question['graphModel']>['objects'][number]['relation'] {
  return value === '=' || value === '<' || value === '<=' || value === '>' || value === '>=' || value === 'unknown'
    ? value
    : undefined;
}

function normalizeGraphPointStyle(value: unknown): NonNullable<NonNullable<Question['graphModel']>['objects'][number]['point']>['style'] {
  return (
    value === 'none'
    || value === 'solid'
    || value === 'hollow'
    || value === 'open-bracket'
    || value === 'closed-bracket'
    || value === 'unknown'
  )
    ? value
    : undefined;
}

function normalizeGraphLabelStyle(value: unknown): NonNullable<NonNullable<Question['graphModel']>['objects'][number]['point']>['labelStyle'] {
  return value === 'none' || value === 'coordinates' || value === 'custom' || value === 'unknown'
    ? value
    : undefined;
}

function normalizeGraphRayDirection(value: unknown): NonNullable<NonNullable<Question['graphModel']>['objects'][number]['ray']>['direction'] {
  return value === 'left' || value === 'right' || value === 'unknown' ? value : 'unknown';
}

function normalizeGraphDomain(value: unknown): NonNullable<Question['graphModel']>['objects'][number]['domain'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const min = graphString((value as Record<string, unknown>).min) || undefined;
  const max = graphString((value as Record<string, unknown>).max) || undefined;
  return min || max ? { min, max } : undefined;
}

function normalizeGraphPointObject(value: unknown): NonNullable<Question['graphModel']>['objects'][number]['point'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  const x = graphString(item.x);
  const y = graphString(item.y);
  if (!x || !y) return undefined;
  return {
    x,
    y,
    style: normalizeGraphPointStyle(item.style),
    labelStyle: normalizeGraphLabelStyle(item.labelStyle),
    label: graphString(item.label) || undefined,
    labelPosition: graphString(item.labelPosition) || undefined,
  };
}

function normalizeGraphRayObject(value: unknown): NonNullable<Question['graphModel']>['objects'][number]['ray'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  const endpoint = graphString(item.endpoint);
  if (!endpoint) return undefined;
  return {
    endpoint,
    direction: normalizeGraphRayDirection(item.direction),
    endpointStyle: normalizeGraphPointStyle(item.endpointStyle),
    labelStyle: normalizeGraphLabelStyle(item.labelStyle),
    label: graphString(item.label) || undefined,
    labelPosition: graphString(item.labelPosition) || undefined,
  };
}

function normalizeGraphModel(value: unknown): Question['graphModel'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const objectsRaw = (value as { objects?: unknown }).objects;
  if (!Array.isArray(objectsRaw)) return undefined;
  const objects: NonNullable<Question['graphModel']>['objects'] = objectsRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry, index) => {
      const samplePoints = Array.isArray(entry.samplePoints)
        ? entry.samplePoints
            .filter((point): point is Record<string, unknown> => Boolean(point) && typeof point === 'object' && !Array.isArray(point))
            .map((point) => {
              const x = graphNumber(point.x);
              const y = graphNumber(point.y);
              return x === undefined || y === undefined ? undefined : { x, y };
            })
            .filter((point): point is { x: number; y: number } => point !== undefined)
        : undefined;
      return {
        id: graphString(entry.id) || `graph-obj-${index + 1}`,
        kind: normalizeGraphObjectKind(entry.kind),
        expression: graphString(entry.expression) || undefined,
        typstMath: graphString(entry.typstMath) || undefined,
        latexMath: graphString(entry.latexMath) || undefined,
        relation: normalizeGraphRelation(entry.relation),
        domain: normalizeGraphDomain(entry.domain),
        displayCondition: graphString(entry.displayCondition) || undefined,
        variables: Array.isArray(entry.variables) ? entry.variables.filter((item): item is string => typeof item === 'string') : undefined,
        color: graphString(entry.color) || undefined,
        linePattern: graphString(entry.linePattern) || undefined,
        shading: graphString(entry.shading) || undefined,
        point: normalizeGraphPointObject(entry.point),
        ray: normalizeGraphRayObject(entry.ray),
        samplePoints: samplePoints?.length ? samplePoints : undefined,
      };
    });
  if (!objects.length) return undefined;
  const family = (value as { family?: unknown }).family;
  const rawVariables = (value as { variables?: unknown }).variables;
  const variables = rawVariables && typeof rawVariables === 'object' && !Array.isArray(rawVariables)
    ? Object.entries(rawVariables).reduce<Record<string, string>>((acc, [key, item]) => {
        if (typeof item === 'string') acc[key] = item;
        return acc;
      }, {})
    : undefined;
  return {
    family: family === 'cartesian' || family === 'polar' || family === 'number-line' ? family : 'unknown',
    objects,
    variables: variables && Object.keys(variables).length ? variables : undefined,
    rawExpressions: Array.isArray((value as { rawExpressions?: unknown }).rawExpressions)
      ? (value as { rawExpressions: unknown[] }).rawExpressions.filter((item): item is string => typeof item === 'string')
      : [],
    source: typeof (value as { source?: unknown }).source === 'string' ? (value as { source: string }).source : 'unknown',
  };
}

class QuestionBank {
  userQuestions = $state<Question[]>(load());
  demoQuestions = $state<Question[]>(loadDemo());

  constructor() {
    if (this.demoQuestions.length === 0) {
      this.demoQuestions = AP_CALC_BC_QUESTIONS.map((q) => ({
        ...q,
        id: createId('question'),
        createdAt: Date.now(),
      }));
      this.#saveDemo();
    }

    const migrated = this.userQuestions.filter((q) => DEMO_CLASS_IDS.has(q.classId ?? ''));
    if (migrated.length > 0) {
      const knownDemoIds = new Set(this.demoQuestions.map((q) => q.id));
      this.demoQuestions = [
        ...this.demoQuestions,
        ...migrated.filter((q) => !knownDemoIds.has(q.id)),
      ];
      this.userQuestions = this.userQuestions.filter((q) => !DEMO_CLASS_IDS.has(q.classId ?? ''));
      this.#saveUser();
      this.#saveDemo();
    }
  }

  get questions(): Question[] {
    return appState.demoMode
      ? [...this.userQuestions, ...this.demoQuestions]
      : this.userQuestions;
  }

  set questions(next: Question[]) {
    if (appState.demoMode) {
      const demoIds = new Set(this.demoQuestions.map((q) => q.id));
      this.userQuestions = next.filter((q) => !demoIds.has(q.id) && !DEMO_CLASS_IDS.has(q.classId ?? ''));
      this.demoQuestions = next.filter((q) => demoIds.has(q.id) || DEMO_CLASS_IDS.has(q.classId ?? ''));
      this.#saveUser();
      this.#saveDemo();
      return;
    }

    this.userQuestions = next.filter((q) => !DEMO_CLASS_IDS.has(q.classId ?? ''));
    this.#saveUser();
  }

  #saveUser() {
    localStorage.setItem(KEY, JSON.stringify(this.userQuestions));
  }

  #saveDemo() {
    localStorage.setItem(DEMO_KEY, JSON.stringify(this.demoQuestions));
  }

  #findQuestionLocation(id: string) {
    const userIdx = this.userQuestions.findIndex((q) => q.id === id);
    if (userIdx !== -1) return { bucket: 'user' as const, index: userIdx };
    const demoIdx = this.demoQuestions.findIndex((q) => q.id === id);
    if (demoIdx !== -1) return { bucket: 'demo' as const, index: demoIdx };
    return null;
  }

  add(data: Omit<Question, 'id' | 'createdAt'>) {
    const question = {
      ...data,
      id: createId('question'),
      createdAt: Date.now(),
    };
    if (DEMO_CLASS_IDS.has(data.classId ?? '')) {
      this.demoQuestions = [...this.demoQuestions, question];
      this.#saveDemo();
    } else {
      this.userQuestions = [...this.userQuestions, question];
      this.#saveUser();
    }
  }

  update(id: string, data: Partial<Omit<Question, 'id' | 'createdAt'>>) {
    const loc = this.#findQuestionLocation(id);
    if (!loc) return;

    if (loc.bucket === 'user') {
      const next = [...this.userQuestions];
      next[loc.index] = { ...next[loc.index], ...data, updatedAt: Date.now() };
      this.userQuestions = next;
      this.#saveUser();
    } else {
      const next = [...this.demoQuestions];
      next[loc.index] = { ...next[loc.index], ...data, updatedAt: Date.now() };
      this.demoQuestions = next;
      this.#saveDemo();
    }
  }

  remove(id: string) {
    const loc = this.#findQuestionLocation(id);
    if (!loc) return;

    if (loc.bucket === 'user') {
      this.userQuestions = this.userQuestions.filter((q) => q.id !== id);
      this.#saveUser();
    } else {
      this.demoQuestions = this.demoQuestions.filter((q) => q.id !== id);
      this.#saveDemo();
    }
  }

  duplicate(id: string): string | null {
    const loc = this.#findQuestionLocation(id);
    if (!loc) return null;

    const bucket = loc.bucket === 'user' ? this.userQuestions : this.demoQuestions;
    const original = bucket[loc.index];
    const copy = {
      ...original,
      id: createId('question'),
      createdAt: Date.now(),
      updatedAt: undefined,
    };

    if (loc.bucket === 'user') {
      this.userQuestions = [...this.userQuestions, copy];
      this.#saveUser();
    } else {
      this.demoQuestions = [...this.demoQuestions, copy];
      this.#saveDemo();
    }

    return copy.id;
  }

  exportJson(): string {
    return JSON.stringify(this.userQuestions, null, 2);
  }

  importJson(json: string): { imported: number; errors: number } {
    try {
      const items = JSON.parse(json);
      if (!Array.isArray(items)) throw new Error('Expected a JSON array');
      let imported = 0;
      let errors = 0;
      for (const item of items) {
        if (typeof item.body === 'string' && typeof item.points === 'number') {
          const question = {
            id: typeof item.id === 'string' ? item.id : createId('question'),
            narrative: normalizeNarrative(item.narrative),
            narrativeId: typeof item.narrativeId === 'string' && item.narrativeId.trim() ? item.narrativeId.trim() : undefined,
            body: item.body,
            parts: normalizeParts(item.parts),
            algorithmModel: normalizeAlgorithmModel(item.algorithmModel),
            algorithmEvaluation: normalizeAlgorithmEvaluation(item.algorithmEvaluation),
            algorithmSeed: typeof item.algorithmSeed === 'number' ? item.algorithmSeed : undefined,
            algorithmVariant: typeof item.algorithmVariant === 'number' ? item.algorithmVariant : undefined,
            graphModel: normalizeGraphModel(item.graphModel),
            graphTypst: typeof item.graphTypst === 'string' && item.graphTypst.trim() ? item.graphTypst : undefined,
            decodeDiagnostics: normalizeDecodeDiagnostics(item.decodeDiagnostics),
            answer: typeof item.answer === 'string' ? item.answer : undefined,
            solution: typeof item.solution === 'string' ? item.solution : undefined,
            choices: item.choices && typeof item.choices === 'object' ? item.choices : undefined,
            points: item.points,
            tags: Array.isArray(item.tags) ? item.tags : [],
            images: Array.isArray(item.images) ? item.images.filter((x: unknown) => typeof x === 'string') : undefined,
            questionType: typeof item.questionType === 'string' ? item.questionType : undefined,
            classId: typeof item.classId === 'string' ? item.classId : undefined,
            unitId: typeof item.unitId === 'string' ? item.unitId : undefined,
            sectionId: typeof item.sectionId === 'string' ? item.sectionId : undefined,
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
            updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : undefined,
            renderError: typeof item.renderError === 'string' ? item.renderError : undefined,
            checked: typeof item.checked === 'boolean' ? item.checked : undefined,
          };
          if (question.parts && question.parts.items.length < 2) {
            question.parts = undefined;
          }
          if (DEMO_CLASS_IDS.has(question.classId ?? '')) {
            this.demoQuestions = [...this.demoQuestions, question];
            this.#saveDemo();
          } else {
            this.userQuestions = [...this.userQuestions, question];
            this.#saveUser();
          }
          imported++;
        } else {
          errors++;
        }
      }
      return { imported, errors };
    } catch {
      return { imported: 0, errors: 1 };
    }
  }
}

export const bank = new QuestionBank();
