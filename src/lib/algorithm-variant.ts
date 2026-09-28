import { graphSvg } from './math-graph/svg.ts';
import { showGraphFeatures } from './algorithm-graph-features.ts';
import type { Graph } from './math-graph/vendor/model.ts';
import type {
  AlgorithmDefinition,
  AlgorithmDisplayFormat,
  AlgorithmEvaluation,
  AlgorithmModel,
  AlgorithmSlot,
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
  /** Newly drawn graph images (SVG) the updated question refers to; store them before saving. */
  images?: Array<{ name: string; svg: string }>;
}

// ExamView conditions can be strict (a zero discriminant holds for ~1 in 200 draws).
const MAX_ATTEMPTS = 20000;
const INDEPENDENT_VARIABLE_NAMES = new Set(['x', 'y', 't', 'n', 'theta', 'pi']);

export function calculateAlgorithmicQuestionVariant(
  question: Question,
  seed = randomSeed(),
): AlgorithmVariantResult | undefined {
  if (!question.algorithmModel?.definitions.length) return undefined;

  const result = evaluateDefinitions(question.algorithmModel.definitions, seed);
  const variant = materializeVariant(question, result);
  const images = applyGraphs(question, question.algorithmModel, result.values, variant.updates, variant.diagnostics);
  return images.length ? { ...variant, images } : variant;
}

/** Whether the imported values are known for every variable, so the original can be restored. */
export function canRestoreAlgorithmicOriginal(question: Question): boolean {
  const definitions = question.algorithmModel?.definitions ?? [];
  const variables = definitions.filter((definition) => !/^condition_\d+$/i.test(definition.name) && definition.name !== 'isunique');
  return variables.length > 0 && variables.every((definition) => (definition.sampleValue ?? '').trim() !== '');
}

/**
 * The question as imported, with its printed sample values, from whichever variant it shows.
 * Graphs are redrawn with the sample values; the caller may point them back at the original
 * pictures when those are still stored.
 */
export function calculateAlgorithmicQuestionOriginal(question: Question): AlgorithmVariantResult | undefined {
  if (!question.algorithmModel?.definitions.length) return undefined;
  const values = new Map<string, AlgorithmValue>();
  const entries: AlgorithmEvaluation['entries'] = [];
  for (const definition of question.algorithmModel.definitions) {
    if (!definition.sampleValue) continue;
    const value = parseSampleValue(definition.sampleValue);
    values.set(definition.name, value);
    entries.push({ name: definition.name, status: 'resolved', value: formatAlgorithmValue(value) });
  }
  const result: EvaluationResult = { values, entries, diagnostics: [], seed: 0 };
  const variant = materializeVariant(question, result);
  const images = applyGraphs(question, question.algorithmModel, values, variant.updates, variant.diagnostics);
  // Back to the imported state: no seed, no variant number, no calculated values.
  variant.updates = { ...variant.updates, algorithmSeed: undefined, algorithmVariant: undefined, algorithmEvaluation: undefined };
  variant.diagnostics = variant.diagnostics.filter((item) => item.code !== 'ALGORITHM_VALUES_CALCULATED');
  return images.length ? { ...variant, images } : variant;
}

function materializeVariant(question: Question, result: EvaluationResult): AlgorithmVariantResult {
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

  const diagnostics: QuestionDecodeDiagnostic[] = [...result.diagnostics];
  const model = question.algorithmModel!;
  if (model.slots?.length) {
    const slotted = materializeSlots(question, model, result.values);
    if (slotted) {
      diagnostics.push({ level: 'info', code: 'ALGORITHM_VALUES_CALCULATED', message: `Calculated algorithm values with seed ${result.seed}.` });
      return {
        seed: result.seed,
        diagnostics,
        updates: {
          body: slotted.fields.get('body') ?? question.body,
          narrative: slotted.fields.get('narrative') ?? question.narrative,
          solution: slotted.fields.get('solution') ?? question.solution,
          choices: question.choices
            ? Object.fromEntries(Object.entries(question.choices).map(([id, text]) => [id, slotted.fields.get(`choice:${id}`) ?? text]))
            : undefined,
          graphTypst: materialize(question.graphTypst),
          graphModel,
          algorithmModel: { ...model, slots: slotted.slots },
          algorithmEvaluation: { entries: result.entries, diagnostics },
          algorithmSeed: result.seed,
          algorithmVariant: (question.algorithmVariant ?? 0) + 1,
          checked: false,
          renderError: undefined,
        },
      };
    }
    diagnostics.push({
      level: 'warning',
      code: 'ALGORITHM_SLOTS_STALE',
      message: 'The recorded value positions no longer match the text (was it edited?); replaced values by searching instead.',
    });
  }
  diagnostics.push({
    level: 'info' as const,
    code: 'ALGORITHM_VALUES_CALCULATED',
    message: `Calculated algorithm values with seed ${result.seed}.`,
  });

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

// Redraw each graph template with the new values, give the drawing a content-derived name,
// and point the question's image references at it. A graph that can't be drawn keeps its
// previous picture and adds a warning.
function applyGraphs(
  question: Question,
  model: AlgorithmModel,
  values: Map<string, AlgorithmValue>,
  updates: Partial<Question>,
  diagnostics: QuestionDecodeDiagnostic[],
): Array<{ name: string; svg: string }> {
  if (!model.graphs?.length) return [];
  const images: Array<{ name: string; svg: string }> = [];
  const renamed = new Map<string, string>();
  const graphs = model.graphs.map((template) => {
    try {
      const svg = graphSvg(instantiateGraph(template.graph, values));
      const name = `${template.image.replace(/-g[0-9a-f]{8}$/, '')}-g${fnv1a(svg)}`;
      images.push({ name, svg });
      renamed.set(template.image, name);
      return { ...template, image: name };
    } catch (error) {
      diagnostics.push({
        level: 'warning',
        code: 'ALGORITHM_GRAPH_FAILED',
        message: `Could not draw graph ${template.image} for these values (${error instanceof Error ? error.message : String(error)}); kept the previous picture.`,
      });
      return template;
    }
  });
  if (renamed.size) {
    const rename = (text: string | undefined) => text?.replace(
      /\/imgs\/([\w.-]+?)(\.(?:png|jpe?g|gif|svg|webp))?(?=["'])/gi,
      (full, name: string) => (renamed.has(name) ? `/imgs/${renamed.get(name)}` : full),
    );
    updates.body = rename(updates.body ?? question.body);
    updates.narrative = rename(updates.narrative ?? question.narrative);
    updates.solution = rename(updates.solution ?? question.solution);
    const choices = updates.choices ?? question.choices;
    if (choices) updates.choices = Object.fromEntries(Object.entries(choices).map(([id, text]) => [id, rename(text) ?? text]));
    const before = question.images ?? [];
    updates.images = [...new Set([...before.map((name) => renamed.get(name) ?? name), ...renamed.values()])];
  }
  updates.algorithmModel = { ...(updates.algorithmModel ?? model), graphs };
  return images;
}

const GRAPH_NUMBER_SETTINGS = ['xmin', 'xmax', 'ymin', 'ymax', 'xtick', 'ytick', 'width', 'height'];
const MATH_GRAPH_FUNCTIONS = new Set(['sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'ln']);

function instantiateGraph(template: Record<string, unknown>, values: Map<string, AlgorithmValue>): unknown {
  const rng = new SeededRandom(0x6d2b79f5);
  const evaluate = (expression: unknown): AlgorithmValue | undefined => (
    typeof expression === 'number' || typeof expression === 'boolean'
      ? expression
      : evaluateAlgorithmExpression(String(expression), values, rng)
  );
  const number = (expression: unknown, what: string): number => {
    const value = Number(evaluate(expression));
    if (!Number.isFinite(value)) throw new Error(`${what} is not a number`);
    return value;
  };
  const bound = (expression: unknown, what: string): number | null => (
    expression === null || expression === undefined || expression === '' || /^[+-]?inf$/i.test(String(expression))
      ? null
      : number(expression, what)
  );
  const interpolate = (text: string) => text.replace(/\{([^{}]+)\}/g, (_match, expression: string) => {
    const value = evaluate(expression);
    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`label ${expression} has no value`);
    return formatDisplayValue(value, undefined);
  });

  const settings = { ...(template.settings as Record<string, unknown>) };
  // Templates come from printed banks, whose graphs have solid grids; a template can still ask for dots.
  settings.gridStyle ??= 'lines';
  for (const key of GRAPH_NUMBER_SETTINGS) {
    if (typeof settings[key] === 'string') settings[key] = number(settings[key], key);
  }
  const objects = ((template.objects as Array<Record<string, unknown>>) ?? []).map((raw) => {
    const { visibleIf, ...object } = raw;
    if (visibleIf !== undefined) object.visible = object.visible !== false && truthy(evaluate(visibleIf) ?? false);
    switch (object.type) {
      case 'function':
        object.expression = mathGraphExpression(String(object.expression), values);
        object.min = bound(object.min, 'domain minimum');
        object.max = bound(object.max, 'domain maximum');
        break;
      case 'point':
        object.x = number(object.x, `point ${String(object.name)} x`);
        object.y = number(object.y, `point ${String(object.name)} y`);
        if (object.label && typeof object.label === 'object') {
          const label = object.label as { text: string; math: boolean };
          object.label = { ...label, text: interpolate(label.text) };
        }
        break;
      case 'line':
        object.m = number(object.m, 'slope');
        object.b = number(object.b, 'intercept');
        break;
    }
    return object;
  });
  const { showFeatures, ...graphSettings } = settings;
  const graph = { ...template, settings: graphSettings, objects } as unknown as Graph;
  return showFeatures ? showGraphFeatures(graph) : graph;
}

// Put numeric values into a function expression, in the subset Math Graph's parser reads.
function mathGraphExpression(expression: string, values: Map<string, AlgorithmValue>): string {
  let text = expression.replace(/\s+/g, ' ');
  const wrap = (name: string, open: string, close: string) => {
    for (let start = text.search(new RegExp(`\\b${name}\\s*\\(`)); start >= 0; start = text.search(new RegExp(`\\b${name}\\s*\\(`))) {
      const paren = text.indexOf('(', start);
      let depth = 0;
      let end = paren;
      for (; end < text.length; end++) {
        if (text[end] === '(') depth++;
        else if (text[end] === ')' && --depth === 0) break;
      }
      if (end >= text.length) throw new Error(`unbalanced ${name}()`);
      text = `${text.slice(0, start)}(${open}${text.slice(paren + 1, end)}${close})${text.slice(end + 1)}`;
    }
  };
  wrap('sec', '1/cos(', ')');
  wrap('csc', '1/sin(', ')');
  wrap('cot', '1/tan(', ')');
  wrap('log', 'ln(', ')/ln(10)');
  return text.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (token) => {
    if (token === 'x' || token === 'pi' || MATH_GRAPH_FUNCTIONS.has(token)) return token;
    const value = values.get(token);
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${token} has no numeric value`);
    return `(${value})`;
  });
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// Replace each recorded slot with its variable's newly formatted value. Returns undefined when
// any slot can't be found exactly, so the caller can fall back to value search.
function materializeSlots(
  question: Question,
  model: AlgorithmModel,
  values: Map<string, AlgorithmValue>,
): { fields: Map<string, string>; slots: AlgorithmSlot[] } | undefined {
  const displayByName = new Map(model.definitions.map((definition) => [definition.name, definition.display]));
  const fieldText = (field: string): string | undefined => {
    if (field === 'body') return question.body;
    if (field === 'narrative') return question.narrative;
    if (field === 'solution') return question.solution;
    if (field.startsWith('choice:')) return question.choices?.[field.slice('choice:'.length)];
    return undefined;
  };

  const fields = new Map<string, string>();
  const nextSlots: AlgorithmSlot[] = [];
  const byField = new Map<string, AlgorithmSlot[]>();
  for (const slot of model.slots ?? []) byField.set(slot.field, [...(byField.get(slot.field) ?? []), slot]);

  for (const [field, slots] of byField) {
    const text = fieldText(field);
    if (text === undefined) return undefined;
    const spans: Array<{ slot: AlgorithmSlot; start: number; end: number; text: string }> = [];
    for (const slot of slots) {
      const start = nthOccurrence(text, slot.text, slot.occurrence);
      const value = values.get(slot.name);
      if (start < 0 || value === undefined) return undefined;
      spans.push({ slot, start, end: start + slot.text.length, text: formatDisplayValue(value, displayByName.get(slot.name)) });
    }
    spans.sort((left, right) => left.start - right.start);
    if (spans.some((span, index) => index > 0 && span.start < spans[index - 1].end)) return undefined;

    let output = '';
    let cursor = 0;
    const placed: Array<{ slot: AlgorithmSlot; start: number; text: string }> = [];
    for (const span of spans) {
      output += text.slice(cursor, span.start);
      placed.push({ slot: span.slot, start: output.length, text: span.text });
      output += span.text;
      cursor = span.end;
    }
    output += text.slice(cursor);
    fields.set(field, output);
    for (const { slot, start, text: newText } of placed) {
      nextSlots.push({ ...slot, text: newText, occurrence: occurrencesBefore(output, newText, start) });
    }
  }
  return { fields, slots: nextSlots };
}

function nthOccurrence(text: string, search: string, occurrence: number): number {
  let index = -1;
  for (let count = 0; count <= occurrence; count++) {
    index = text.indexOf(search, index + 1);
    if (index < 0) return -1;
  }
  return index;
}

function occurrencesBefore(text: string, search: string, position: number): number {
  let count = 0;
  for (let index = text.indexOf(search); index >= 0 && index < position; index = text.indexOf(search, index + 1)) count++;
  return count;
}

export function formatDisplayValue(value: AlgorithmValue, display: AlgorithmDisplayFormat | undefined): string {
  if (typeof value === 'string' && display?.sign === 'always') {
    // Signed terms from string values such as fracs(): "- frac(5, 3)", "+ frac(4, 3)".
    const trimmed = value.trim();
    return trimmed.startsWith('-') ? `- ${trimmed.slice(1).trim()}` : `+ ${trimmed}`;
  }
  if (typeof value !== 'number') return formatAlgorithmValue(value);
  const magnitude = Math.abs(value);
  let digits = display?.decimals !== undefined ? magnitude.toFixed(display.decimals) : formatAlgorithmValue(magnitude);
  if (display?.group) {
    const [integer, fraction] = digits.split('.');
    if (integer.length >= 5) digits = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (fraction !== undefined ? `.${fraction}` : '');
  }
  const negative = value < 0 && Number(digits.replace(/ /g, '')) !== 0;
  if (display?.sign === 'always') return `${negative ? '-' : '+'} ${digits}`;
  return negative ? `-${digits}` : digits;
}

function evaluateDefinitions(definitions: AlgorithmDefinition[], seed: number): EvaluationResult {
  let diagnostics: QuestionDecodeDiagnostic[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = new SeededRandom(mixSeed(seed, attempt));
    const values = new Map<string, AlgorithmValue>();
    const entries: AlgorithmEvaluation['entries'] = [];
    diagnostics = [];
    let accepted = true;

    for (const definition of orderByDependencies(definitions)) {
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
          diagnostics.push({
            level: 'warning',
            code: 'ALGORITHM_RULE_UNSUPPORTED',
            message: `Could not evaluate ${definition.name} = ${rawExpression}; kept its imported value ${definition.sampleValue}.`,
          });
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

      // sqrt of a negative, division by zero, comb(n, r) with r > n: ExamView would draw again.
      if (typeof evaluated === 'number' && !Number.isFinite(evaluated)) {
        accepted = false;
        break;
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
    // ExamView: rand(n) is an integer from 1 to n.
    if (args.length === 1 && Number.isInteger(args[0]) && args[0] >= 1) return rng.int(1, args[0]);
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

  if (/^"[^"]*"$/.test(normalized) || /^'[^']*'$/.test(normalized)) return normalized.slice(1, -1);
  if (/^[+\-]?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  if (values.has(normalized)) return values.get(normalized);
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized) && fallbackSample) return parseSampleValue(fallbackSample);

  return evaluateJsExpression(normalized, values, rng);
}

function evaluateJsExpression(expression: string, values: Map<string, AlgorithmValue>, rng: SeededRandom): AlgorithmValue | undefined {
  const stringLiterals: string[] = [];
  let js = expression.replace(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g, (literal) => {
    const key = `__str${stringLiterals.length}__`;
    stringLiterals.push(literal);
    return key;
  });

  js = replaceFactorials(js)
    .replace(/\bAND\b/gi, '&&')
    .replace(/\bOR\b/gi, '||')
    .replace(/\bNOT\b/gi, '!')
    .replace(/\bMOD\b/gi, '%')
    .replace(/(?<!&)&(?!&)/g, '&&')
    .replace(/(?<!\|)\|(?!\|)/g, '||')
    .replace(/<>/g, '!=')
    .replace(/(?<![<>=!])=(?![=])/g, '==')
    .replace(/\^/g, '**');

  js = js.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (token) => {
    if (/^__str\d+__$/.test(token)) return token;
    const lower = token.toLowerCase();
    if (lower === 'true' || lower === 'false') return lower;
    if (lower === 'pi') return 'Math.PI';
    // Parenthesized so negative values stay valid JavaScript: (-6)**4, not -6**4.
    // Stored as literals so string values pass the character check below.
    const value = values.has(token) ? values.get(token) : values.get(lower);
    if (value !== undefined) {
      stringLiterals.push(JSON.stringify(value));
      return `(__str${stringLiterals.length - 1}__)`;
    }
    if (Object.hasOwn(ALGORITHM_FUNCTIONS, lower)) return `F.${lower}`;
    return token;
  });

  if (!/^[\d\s+\-*/%().,<>=!&|?:A-Za-z_$\[\]]+$/.test(js)) return undefined;
  js = js.replace(/__str(\d+)__/g, (_match, index: string) => stringLiterals[Number(index)] ?? '""');

  try {
    const result = Function('F', `"use strict"; return (${js});`)(bindFunctions(rng));
    // NaN/Infinity pass through: they mean these values are impossible, not that the rule is unsupported.
    if (typeof result === 'number' || typeof result === 'string' || typeof result === 'boolean') return result;
  } catch {
    return undefined;
  }
  return undefined;
}

// ExamView's postfix factorial: n!, 5!, (n-r)!  ->  fact(...)
function replaceFactorials(js: string): string {
  let output = js;
  for (let index = output.indexOf('!'); index >= 0; index = output.indexOf('!', index + 1)) {
    if (output[index + 1] === '=') continue;
    let end = index - 1;
    while (end >= 0 && output[end] === ' ') end--;
    if (end < 0) continue;
    let start = end;
    if (output[end] === ')') {
      let depth = 0;
      for (; start >= 0; start--) {
        if (output[start] === ')') depth++;
        else if (output[start] === '(' && --depth === 0) break;
      }
      if (start < 0) continue;
    } else if (/[\w.]/.test(output[end])) {
      while (start > 0 && /[\w.]/.test(output[start - 1])) start--;
    } else {
      continue;
    }
    const replacement = `fact(${output.slice(start, end + 1)})`;
    output = output.slice(0, start) + replacement + output.slice(index + 1);
    index = start + replacement.length - 1;
  }
  return output;
}

type AlgorithmFunction = (rng: SeededRandom, ...args: AlgorithmValue[]) => AlgorithmValue;

const num = (value: AlgorithmValue): number => Number(value);

// Functions available inside any expression (ExamView names, plus common aliases).
const ALGORITHM_FUNCTIONS: Record<string, AlgorithmFunction> = {
  abs: (_rng, x) => Math.abs(num(x)),
  sqrt: (_rng, x) => Math.sqrt(num(x)),
  pow: (_rng, x, y) => num(x) ** num(y),
  exp: (_rng, x) => Math.exp(num(x)),
  ln: (_rng, x) => Math.log(num(x)),
  log: (_rng, x) => Math.log10(num(x)),
  log10: (_rng, x) => Math.log10(num(x)),
  floor: (_rng, x) => Math.floor(num(x)),
  ceil: (_rng, x) => Math.ceil(num(x)),
  ceiling: (_rng, x) => Math.ceil(num(x)),
  int: (_rng, x) => Math.trunc(num(x)),
  round: (_rng, x, digits = 0) => {
    const factor = 10 ** num(digits);
    return Math.round(num(x) * factor) / factor;
  },
  sigfig: (_rng, x, digits) => Number(num(x).toPrecision(Math.max(1, Math.min(21, num(digits))))),
  min: (_rng, ...args) => Math.min(...args.map(num)),
  max: (_rng, ...args) => Math.max(...args.map(num)),
  sgn: (_rng, x) => Math.sign(num(x)),
  sin: (_rng, x) => Math.sin(num(x)),
  cos: (_rng, x) => Math.cos(num(x)),
  tan: (_rng, x) => Math.tan(num(x)),
  csc: (_rng, x) => 1 / Math.sin(num(x)),
  sec: (_rng, x) => 1 / Math.cos(num(x)),
  cot: (_rng, x) => 1 / Math.tan(num(x)),
  asin: (_rng, x) => Math.asin(num(x)),
  acos: (_rng, x) => Math.acos(num(x)),
  atan: (_rng, x) => Math.atan(num(x)),
  arcsin: (_rng, x) => Math.asin(num(x)),
  arccos: (_rng, x) => Math.acos(num(x)),
  arctan: (_rng, x) => Math.atan(num(x)),
  acsc: (_rng, x) => Math.asin(1 / num(x)),
  asec: (_rng, x) => Math.acos(1 / num(x)),
  acot: (_rng, x) => Math.atan(1 / num(x)),
  fact: (_rng, x) => factorial(num(x)),
  comb: (_rng, n, r) => factorial(num(n)) / (factorial(num(r)) * factorial(num(n) - num(r))),
  perm: (_rng, n, r) => factorial(num(n)) / factorial(num(n) - num(r)),
  gcf: (_rng, ...args) => args.map(num).reduce(gcd),
  gcd: (_rng, ...args) => args.map(num).reduce(gcd),
  lcm: (_rng, ...args) => args.map(num).reduce((a, b) => Math.abs(a * b) / gcd(a, b)),
  range: (rng, min, max, step = 1) => rng.range(num(min), num(max), Math.abs(num(step)) || 1),
  rand: (rng, ...args) => {
    if (args.length >= 2) return rng.float(num(args[0]), num(args[1]));
    if (args.length === 1) return rng.int(1, num(args[0]));
    return rng.next();
  },
  prime: (rng, low, high) => {
    const primes = [];
    for (let n = Math.max(2, Math.ceil(num(low))); n <= num(high); n++) if (isPrime(n)) primes.push(n);
    return primes.length ? primes[rng.int(0, primes.length - 1)] : NaN;
  },
  isunique: (_rng, ...args) => new Set(args.map((value) => String(value))).size === args.length,
  chr: (_rng, code) => String.fromCharCode(num(code)),
  str: (_rng, value) => formatAlgorithmValue(value),
  fracs: (_rng, numerator, denominator) => typstFraction(num(numerator), num(denominator), false),
  mixfracs: (_rng, numerator, denominator) => typstFraction(num(numerator), num(denominator), true),
  sqrs: (_rng, value) => typstSquareRoot(num(value)),
};

function bindFunctions(rng: SeededRandom): Record<string, (...args: AlgorithmValue[]) => AlgorithmValue> {
  return Object.fromEntries(Object.entries(ALGORITHM_FUNCTIONS).map(([name, fn]) => [name, (...args: AlgorithmValue[]) => fn(rng, ...args)]));
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
  let result = 1;
  for (let k = 2; k <= n; k++) result *= k;
  return result;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x;
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let k = 2; k * k <= n; k++) if (n % k === 0) return false;
  return true;
}

/** A rational number as [numerator, denominator] with denominator > 0, from a decimal if needed. */
function toFraction(value: number): [number, number] | undefined {
  if (!Number.isFinite(value)) return undefined;
  if (Number.isInteger(value)) return [value, 1];
  // Continued fractions: exact for the terminating decimals and small ratios ExamView produces.
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let x = value;
  for (let i = 0; i < 32; i++) {
    const a = Math.floor(x);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (Math.abs(value - h1 / k1) < 1e-9 * Math.max(1, Math.abs(value))) return [h1, k1];
    x = 1 / (x - a);
  }
  return undefined;
}

/** ExamView fracs()/mixfracs() as Typst math: "-frac(5, 3)", "4", "1 frac(2, 3)". */
function typstFraction(numerator: number, denominator: number, mixed: boolean): AlgorithmValue {
  const parts = toFraction(numerator / denominator);
  if (!parts || denominator === 0) return NaN;
  const [n, d] = parts;
  const sign = n < 0 ? '-' : '';
  const whole = Math.trunc(Math.abs(n) / d);
  const rest = Math.abs(n) % d;
  if (rest === 0) return `${sign}${whole}`;
  if (mixed && whole > 0) return `${sign}${whole} frac(${rest}, ${d})`;
  return `${sign}frac(${Math.abs(n)}, ${d})`;
}

/** ExamView sqrs(): the square root of a rational in simplest radical form, as Typst math. */
function typstSquareRoot(value: number): AlgorithmValue {
  const parts = toFraction(value);
  if (!parts || parts[0] < 0) return NaN;
  const [p, q] = parts;
  // sqrt(p/q) = sqrt(p*q)/q = outside*sqrt(inside)/q
  let inside = p * q;
  let outside = 1;
  for (let k = 2; k * k <= inside; k++) {
    while (inside % (k * k) === 0) {
      inside /= k * k;
      outside *= k;
    }
  }
  const common = gcd(outside, q);
  const top = outside / common;
  const bottom = q / common;
  const radical = inside === 1 ? String(top) : `${top === 1 ? '' : `${top} `}sqrt(${inside})`;
  return bottom === 1 ? radical : `frac(${radical}, ${bottom})`;
}

// Evaluate definitions after the ones they use (ExamView allows any order).
function orderByDependencies(definitions: AlgorithmDefinition[]): AlgorithmDefinition[] {
  const names = new Set(definitions.map((definition) => definition.name));
  const uses = new Map(definitions.map((definition) => [
    definition,
    new Set((definition.rawExpression ?? '').replace(/"[^"]*"/g, '').match(/[A-Za-z_][A-Za-z0-9_]*/g)?.filter((name) => names.has(name) && name !== definition.name) ?? []),
  ]));
  const remaining = [...definitions];
  const done = new Set<string>();
  const ordered: AlgorithmDefinition[] = [];
  while (remaining.length) {
    const index = remaining.findIndex((definition) => [...uses.get(definition)!].every((name) => done.has(name)));
    if (index < 0) return [...ordered, ...remaining];
    const [definition] = remaining.splice(index, 1);
    ordered.push(definition);
    done.add(definition.name);
  }
  return ordered;
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
  // A sign on its own is a value (ExamView picks "+" or "-" for a term), not a signed number.
  if (/^\s*[+\-–−]\s*$/.test(value)) return value.trim().replace(/[–−]/, '-');
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
