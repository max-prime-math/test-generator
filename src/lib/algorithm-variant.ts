import type {
  AlgorithmDefinition,
  AlgorithmEvaluation,
  GraphModel,
  Question,
  QuestionDecodeDiagnostic,
} from './types';

type AlgorithmValue = number | string | boolean;

interface EvaluationResult {
  values: Map<string, AlgorithmValue>;
  entries: AlgorithmEvaluation['entries'];
  diagnostics: QuestionDecodeDiagnostic[];
  seed: number;
}

export interface AlgorithmVariantResult {
  seed: number;
  updates: Partial<Question>;
  diagnostics: QuestionDecodeDiagnostic[];
}

const INDEPENDENT_VARIABLE_NAMES = new Set(['x', 'y', 't', 'n', 'theta', 'pi']);

export function calculateAlgorithmicQuestionVariant(
  question: Question,
  seed = randomSeed(),
): AlgorithmVariantResult | undefined {
  if (!question.algorithmModel?.definitions.length) return undefined;

  const result = evaluateDefinitions(question.algorithmModel.definitions, seed);
  const previousValues = currentAlgorithmValues(question);
  const nextValues = new Map([...result.values.entries()].map(([name, value]) => [name, formatAlgorithmValue(value)]));

  const materialize = (text: string | undefined): string | undefined => (
    text === undefined ? undefined : materializeText(text, previousValues, nextValues)
  );

  const choices = question.choices
    ? Object.fromEntries(
        Object.entries(question.choices).map(([id, text]) => [id, materializeText(text, previousValues, nextValues)]),
      )
    : undefined;

  const graphModel = question.graphModel
    ? materializeGraphModel(question.graphModel, previousValues, nextValues)
    : undefined;

  const diagnostics = [
    ...result.diagnostics,
    {
      level: 'info' as const,
      code: 'ALGORITHM_VALUES_CALCULATED',
      message: `Calculated algorithm values with seed ${result.seed}.`,
    },
  ];

  return {
    seed: result.seed,
    diagnostics,
    updates: {
      body: materialize(question.body) ?? question.body,
      narrative: materialize(question.narrative),
      parts: materializeParts(question.parts, previousValues, nextValues),
      answer: materialize(question.answer),
      solution: materialize(question.solution),
      choices,
      graphTypst: materialize(question.graphTypst),
      graphModel,
      algorithmEvaluation: {
        entries: result.entries,
        diagnostics,
      },
      algorithmSeed: result.seed,
      algorithmVariant: (question.algorithmVariant ?? 0) + 1,
      checked: false,
      renderError: undefined,
    },
  };
}

function evaluateDefinitions(definitions: AlgorithmDefinition[], seed: number): EvaluationResult {
  let diagnostics: QuestionDecodeDiagnostic[] = [];

  for (let attempt = 0; attempt < 80; attempt++) {
    const rng = new SeededRandom(mixSeed(seed, attempt));
    const values = new Map<string, AlgorithmValue>();
    const entries: AlgorithmEvaluation['entries'] = [];
    diagnostics = [];
    let accepted = true;

    for (const definition of definitions) {
      const rawExpression = definition.rawExpression?.trim();
      if (!rawExpression) {
        if (definition.sampleValue) {
          const parsed = parseSampleValue(definition.sampleValue);
          values.set(definition.name, parsed);
          entries.push({ name: definition.name, status: 'resolved', value: formatAlgorithmValue(parsed) });
        } else {
          entries.push({ name: definition.name, status: 'unresolved' });
        }
        continue;
      }

      const evaluated = evaluateAlgorithmExpression(rawExpression, values, rng, definition.sampleValue);
      if (evaluated === undefined) {
        const fallback = parseSampleValue(definition.sampleValue ?? '');
        if (definition.sampleValue) {
          values.set(definition.name, fallback);
          entries.push({ name: definition.name, status: 'resolved', value: formatAlgorithmValue(fallback) });
        } else {
          entries.push({ name: definition.name, status: 'unresolved' });
          diagnostics.push({
            level: 'warning',
            code: 'ALGORITHM_RULE_UNSUPPORTED',
            message: `Could not evaluate ${definition.name} = ${rawExpression}.`,
          });
        }
        continue;
      }

      if (isPredicateDefinition(definition, evaluated)) {
        const ok = truthy(evaluated);
        entries.push({ name: definition.name, status: 'resolved', value: ok ? '1' : '0' });
        if (!ok) {
          accepted = false;
          break;
        }
        continue;
      }

      values.set(definition.name, evaluated);
      entries.push({ name: definition.name, status: 'resolved', value: formatAlgorithmValue(evaluated) });
    }

    if (accepted) {
      return {
        values,
        entries,
        diagnostics,
        seed,
      };
    }
  }

  diagnostics.push({
    level: 'warning',
    code: 'ALGORITHM_CONDITIONS_NOT_SATISFIED',
    message: 'Could not find values satisfying all recovered algorithm conditions; using the last attempted values.',
  });

  return {
    values: new Map(),
    entries: definitions.map((definition) => ({
      name: definition.name,
      status: definition.sampleValue ? 'resolved' : 'unresolved',
      value: definition.sampleValue,
    })),
    diagnostics,
    seed,
  };
}

function evaluateAlgorithmExpression(
  expression: string,
  values: Map<string, AlgorithmValue>,
  rng: SeededRandom,
  fallbackSample?: string,
): AlgorithmValue | undefined {
  const normalized = normalizeExpression(expression);
  const call = parseCall(normalized);

  if (call?.name.toLowerCase() === 'range') {
    const args = call.args.map((arg) => Number(evaluateAlgorithmExpression(arg, values, rng)));
    if (args.length >= 2 && args.every(Number.isFinite)) {
      const [min, max] = args;
      const step = args[2] && Number.isFinite(args[2]) ? Math.abs(args[2]) : 1;
      return rng.range(min, max, step);
    }
  }

  if (call?.name.toLowerCase() === 'rand') {
    const args = call.args.map((arg) => Number(evaluateAlgorithmExpression(arg, values, rng)));
    if (args.length >= 2 && args.every(Number.isFinite)) return rng.float(args[0], args[1]);
    return rng.next();
  }

  if (call?.name.toLowerCase() === 'choose') {
    const args = call.args
      .map((arg) => evaluateAlgorithmExpression(arg, values, rng))
      .filter((value): value is AlgorithmValue => value !== undefined);
    return args.length ? args[rng.int(0, args.length - 1)] : undefined;
  }

  if (call?.name.toLowerCase() === 'if' && call.args.length >= 3) {
    const condition = evaluateAlgorithmExpression(call.args[0], values, rng);
    return evaluateAlgorithmExpression(truthy(condition) ? call.args[1] : call.args[2], values, rng, fallbackSample);
  }

  if (call?.name.toLowerCase() === 'isunique') {
    const args = call.args.map((arg) => evaluateAlgorithmExpression(arg, values, rng));
    const keys = args.map((value) => String(value));
    return keys.length === new Set(keys).size;
  }

  if (/^".*"$/.test(normalized) || /^'.*'$/.test(normalized)) return normalized.slice(1, -1);
  if (/^[+\-]?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  if (values.has(normalized)) return values.get(normalized);
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized) && fallbackSample) return parseSampleValue(fallbackSample);

  return evaluateJsExpression(normalized, values);
}

function evaluateJsExpression(expression: string, values: Map<string, AlgorithmValue>): AlgorithmValue | undefined {
  const stringLiterals: string[] = [];
  let js = expression.replace(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g, (literal) => {
    const key = `__str${stringLiterals.length}__`;
    stringLiterals.push(literal);
    return key;
  });

  js = js
    .replace(/\bAND\b/gi, '&&')
    .replace(/\bOR\b/gi, '||')
    .replace(/\bNOT\b/gi, '!')
    .replace(/<>/g, '!=')
    .replace(/(?<![<>=!])=(?![=])/g, '==')
    .replace(/\^/g, '**');

  js = js.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (token) => {
    if (/^__str\d+__$/.test(token)) return token;
    const lower = token.toLowerCase();
    if (lower === 'true' || lower === 'false') return lower;
    if (lower === 'pi') return 'Math.PI';
    if (values.has(token)) return JSON.stringify(values.get(token));
    if (values.has(lower)) return JSON.stringify(values.get(lower));
    const builtin = jsBuiltin(token);
    return builtin ?? token;
  });

  js = js.replace(/__str(\d+)__/g, (_match, index: string) => stringLiterals[Number(index)] ?? '""');
  if (!/^[\d\s+\-*/%().,<>=!&|?:'"A-Za-z_$\[\]]+$/.test(js)) return undefined;

  try {
    const result = Function(`"use strict"; return (${js});`)();
    if (typeof result === 'number' || typeof result === 'string' || typeof result === 'boolean') return result;
  } catch {
    return undefined;
  }
  return undefined;
}

function jsBuiltin(token: string): string | undefined {
  switch (token.toLowerCase()) {
    case 'abs': return 'Math.abs';
    case 'acos': return 'Math.acos';
    case 'asin': return 'Math.asin';
    case 'atan': return 'Math.atan';
    case 'ceiling':
    case 'ceil': return 'Math.ceil';
    case 'cos': return 'Math.cos';
    case 'floor':
    case 'int': return 'Math.floor';
    case 'ln': return 'Math.log';
    case 'log': return 'Math.log10';
    case 'max': return 'Math.max';
    case 'min': return 'Math.min';
    case 'pow': return 'Math.pow';
    case 'round': return 'Math.round';
    case 'sin': return 'Math.sin';
    case 'sqrt': return 'Math.sqrt';
    case 'tan': return 'Math.tan';
    default: return undefined;
  }
}

function materializeText(
  text: string,
  previousValues: Map<string, string>,
  nextValues: Map<string, string>,
): string {
  let output = text;
  const names = [...nextValues.keys()]
    .filter((name) => !INDEPENDENT_VARIABLE_NAMES.has(name.toLowerCase()))
    .sort((left, right) => right.length - left.length);

  for (const name of names) {
    const value = nextValues.get(name);
    if (!value) continue;
    output = output.replace(
      new RegExp(`(^|[^A-Za-z0-9_])${escapeRegex(name)}(?=$|[^A-Za-z0-9_])`, 'g'),
      (_match, prefix: string) => `${prefix}${value}`,
    );
  }

  const replacements = names
    .map((name) => ({
      oldValue: previousValues.get(name),
      newValue: nextValues.get(name),
    }))
    .filter((entry): entry is { oldValue: string; newValue: string } => {
      if (!entry.oldValue || !entry.newValue) return false;
      return normalizeComparableValue(entry.oldValue) !== normalizeComparableValue(entry.newValue);
    })
    .sort((left, right) => right.oldValue.length - left.oldValue.length);

  const stagedReplacements: Array<{ token: string; value: string }> = [];
  let stagedIndex = 0;
  for (const { oldValue, newValue } of replacements) {
    for (const variant of displayValueVariants(oldValue)) {
      output = output.replace(
        valuePattern(variant),
        (_match, prefix: string) => {
          const token = `@@ALG_VALUE_${stagedIndex++}@@`;
          stagedReplacements.push({ token, value: formatReplacementLike(newValue, variant) });
          return `${prefix}${token}`;
        },
      );
    }
  }

  for (const { token, value } of stagedReplacements) {
    output = output.split(token).join(value);
  }

  return normalizeMaterializedText(output);
}

function normalizeMaterializedText(text: string): string {
  return text
    .replace(/\+\s*-/g, '- ')
    .replace(/-\s*-/g, '+ ')
    .replace(/-\s*\+/g, '- ')
    .replace(/\(\s*\+\s*(-?\d+(?:\.\d+)?)\s*([A-Za-z])/g, '($1 $2')
    .replace(/\^\s*\+\s*(\d+)/g, '^$1')
    .replace(/\)\s*(\d)(?=\$|[\s,.;:?!])/g, ')^$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function materializeGraphModel(
  graphModel: GraphModel,
  previousValues: Map<string, string>,
  nextValues: Map<string, string>,
): GraphModel {
  const materialize = (value: string | undefined) => (
    value === undefined ? undefined : materializeText(value, previousValues, nextValues)
  );

  return {
    ...graphModel,
    variables: graphModel.variables
      ? Object.fromEntries(Object.entries(graphModel.variables).map(([key, value]) => [key, materializeText(value, previousValues, nextValues)]))
      : undefined,
    rawExpressions: graphModel.rawExpressions.map((expression) => materializeText(expression, previousValues, nextValues)),
    objects: graphModel.objects.map((object) => ({
      ...object,
      expression: materialize(object.expression),
      typstMath: materialize(object.typstMath),
      latexMath: materialize(object.latexMath),
      displayCondition: materialize(object.displayCondition),
      domain: object.domain
        ? {
            min: materialize(object.domain.min),
            max: materialize(object.domain.max),
          }
        : undefined,
      point: object.point
        ? {
            ...object.point,
            x: materializeText(object.point.x, previousValues, nextValues),
            y: materializeText(object.point.y, previousValues, nextValues),
            label: materialize(object.point.label),
          }
        : undefined,
      ray: object.ray
        ? {
            ...object.ray,
            endpoint: materializeText(object.ray.endpoint, previousValues, nextValues),
            label: materialize(object.ray.label),
          }
        : undefined,
    })),
  };
}

function materializeParts(
  parts: Question['parts'],
  previousValues: Map<string, string>,
  nextValues: Map<string, string>,
): Question['parts'] {
  if (!parts) return undefined;
  return {
    stem: materializeText(parts.stem, previousValues, nextValues),
    items: parts.items.map((item) => ({
      ...item,
      body: materializeText(item.body, previousValues, nextValues),
      parts: materializeParts(item.parts, previousValues, nextValues),
    })),
  };
}

function currentAlgorithmValues(question: Question): Map<string, string> {
  const values = new Map<string, string>();
  for (const definition of question.algorithmModel?.definitions ?? []) {
    if (definition.sampleValue) values.set(definition.name, normalizeDisplayValue(definition.sampleValue));
  }
  for (const entry of question.algorithmEvaluation?.entries ?? []) {
    if (entry.value) values.set(entry.name, normalizeDisplayValue(entry.value));
  }
  return values;
}

function isPredicateDefinition(definition: AlgorithmDefinition, value: AlgorithmValue): boolean {
  if (definition.name === 'isunique') return true;
  if (/^condition_\d+$/i.test(definition.name)) return true;
  if (definition.name === 'scramble') return false;
  if (typeof value !== 'boolean') return false;
  return /[<>=]|<>|\band\b|\bor\b|isunique\(/i.test(definition.rawExpression ?? '');
}

function parseCall(expression: string): { name: string; args: string[] } | undefined {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\(([\s\S]*)\)$/.exec(expression.trim());
  if (!match) return undefined;
  return { name: match[1], args: splitTopLevel(match[2]) };
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let start = 0;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    const previous = input[index - 1];
    if ((char === '"' || char === "'") && previous !== '\\') {
      quote = quote === char ? null : quote ?? char;
      continue;
    }
    if (quote) continue;
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      parts.push(input.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = input.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function normalizeExpression(expression: string): string {
  return expression
    .replace(/[–−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSampleValue(value: string): AlgorithmValue {
  const normalized = normalizeDisplayValue(value);
  if (/^[+\-]?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  if (/^(true|false)$/i.test(normalized)) return /^true$/i.test(normalized);
  return normalized;
}

function normalizeDisplayValue(value: string): string {
  return value
    .replace(/[–−]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\+\s*/, '')
    .replace(/^-\s*/, '-')
    .trim();
}

function formatAlgorithmValue(value: AlgorithmValue): string {
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(6).replace(/0+$/g, '').replace(/\.$/, '');
  }
  return value;
}

function truthy(value: AlgorithmValue | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0 && value !== '0' && value.toLowerCase() !== 'false';
  return false;
}

function displayValueVariants(value: string): string[] {
  const normalized = normalizeDisplayValue(value);
  const variants = new Set([value.trim(), normalized]);
  if (normalized.startsWith('-')) {
    variants.add(`- ${normalized.slice(1)}`);
    variants.add(`– ${normalized.slice(1)}`);
    variants.add(`− ${normalized.slice(1)}`);
  }
  if (/^\d/.test(normalized)) variants.add(`+ ${normalized}`);
  return [...variants].filter(Boolean);
}

function valuePattern(value: string): RegExp {
  const escaped = escapeRegex(value).replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^A-Za-z0-9_.])${escaped}(?=$|[^A-Za-z0-9_.])`, 'g');
}

function formatReplacementLike(value: string, previous: string): string {
  const normalized = normalizeDisplayValue(value);
  const previousTrimmed = previous.trim();
  if (/^[+\-–−]/.test(previousTrimmed)) {
    return normalized.startsWith('-') ? `- ${normalized.slice(1)}` : `+ ${normalized}`;
  }
  return normalized;
}

function normalizeComparableValue(value: string): string {
  return normalizeDisplayValue(value).replace(/\s+/g, '');
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function randomSeed(): number {
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.getRandomValues === 'function') {
    const data = new Uint32Array(1);
    crypto.getRandomValues(data);
    return data[0] || Date.now();
  }
  return Math.floor(Math.random() * 0xffffffff);
}

function mixSeed(seed: number, attempt: number): number {
  let value = (seed ^ Math.imul(attempt + 1, 0x9e3779b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

class SeededRandom {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0 || 0x6d2b79f5;
  }

  next(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let value = this.#state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    const low = Math.ceil(Math.min(min, max));
    const high = Math.floor(Math.max(min, max));
    return low + Math.floor(this.next() * (high - low + 1));
  }

  range(min: number, max: number, step: number): number {
    const count = Math.floor((max - min) / step);
    return min + this.int(0, Math.max(0, count)) * step;
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}
