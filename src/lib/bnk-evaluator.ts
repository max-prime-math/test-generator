import type { BnkVar, BnkQuestion } from './bnk-parser';
import { formatBody } from './bnk-parser';

const BLANK = '#underline[#h(1.5em)]';

export type VarValue = number | { num: number; den: number };

// ── Expression evaluator ──────────────────────────────────────────────────────

function toNum(v: VarValue): number {
  if (typeof v === 'number') return v;
  return v.den !== 0 ? v.num / v.den : 0;
}

interface EvalCtx {
  src: string;
  pos: number;
  env: Map<string, VarValue>;
  rng: () => number;
}

function skipWs(ctx: EvalCtx) {
  while (ctx.pos < ctx.src.length && (ctx.src[ctx.pos] === ' ' || ctx.src[ctx.pos] === '\t')) {
    ctx.pos++;
  }
}

function consume(ctx: EvalCtx, s: string): boolean {
  skipWs(ctx);
  if (ctx.src.startsWith(s, ctx.pos)) { ctx.pos += s.length; return true; }
  return false;
}

function parseIdent(ctx: EvalCtx): string | null {
  skipWs(ctx);
  const m = /^[A-Za-z_]\w*/.exec(ctx.src.slice(ctx.pos));
  if (!m) return null;
  ctx.pos += m[0].length;
  return m[0];
}

function parseNumber(ctx: EvalCtx): number | null {
  skipWs(ctx);
  const m = /^\d+(\.\d+)?/.exec(ctx.src.slice(ctx.pos));
  if (!m) return null;
  ctx.pos += m[0].length;
  return parseFloat(m[0]);
}

function parseArgs(ctx: EvalCtx): VarValue[] {
  const args: VarValue[] = [];
  skipWs(ctx);
  if (ctx.src[ctx.pos] === ')') return args;
  args.push(parseExpr(ctx));
  while (consume(ctx, ',')) args.push(parseExpr(ctx));
  return args;
}

function evalFunc(name: string, args: VarValue[], rng: () => number): VarValue {
  const nums = args.map(toNum);
  switch (name.toLowerCase()) {
    case 'range': {
      const a = nums[0] ?? 0;
      const b = nums[1] ?? 0;
      const s = Math.abs(nums[2] ?? 1) || 1;
      const steps = Math.max(0, Math.round((b - a) / s));
      return a + Math.min(Math.floor(rng() * (steps + 1)), steps) * s;
    }
    case 'fracs': {
      return { num: Math.round(nums[0] ?? 1), den: Math.round(nums[1] ?? 1) || 1 };
    }
    case 'abs':   return Math.abs(nums[0] ?? 0);
    case 'pow':   return Math.pow(nums[0] ?? 0, nums[1] ?? 1);
    case 'rand':  return rng();
    case 'sgns':  return rng() < 0.5 ? -1 : 1;
    case 'choose': {
      if (!args.length) return 0;
      return args[Math.floor(rng() * args.length)];
    }
    case 'isunique': {
      const seen = new Set<number>();
      for (const n of nums) {
        if (seen.has(n)) return 0;
        seen.add(n);
      }
      return 1;
    }
    default: return 0;
  }
}

function parseAtom(ctx: EvalCtx): VarValue {
  skipWs(ctx);

  if (consume(ctx, '-')) {
    const val = parseAtom(ctx);
    return typeof val === 'number' ? -val : { num: -val.num, den: val.den };
  }

  if (consume(ctx, '(')) {
    const val = parseExpr(ctx);
    consume(ctx, ')');
    return val;
  }

  skipWs(ctx);
  if (/^\d/.test(ctx.src.slice(ctx.pos))) {
    return parseNumber(ctx) ?? 0;
  }

  const ident = parseIdent(ctx);
  if (!ident) return 0;

  skipWs(ctx);
  if (consume(ctx, '(')) {
    const args = parseArgs(ctx);
    consume(ctx, ')');
    return evalFunc(ident, args, ctx.rng);
  }

  return ctx.env.get(ident) ?? 0;
}

function parsePow(ctx: EvalCtx): VarValue {
  let base = parseAtom(ctx);
  while (consume(ctx, '^')) {
    const exp = parseAtom(ctx);
    base = Math.pow(toNum(base), toNum(exp));
  }
  return base;
}

function parseTerm(ctx: EvalCtx): VarValue {
  let v = parsePow(ctx);
  while (true) {
    if (consume(ctx, '*')) {
      v = toNum(v) * toNum(parsePow(ctx));
    } else if (consume(ctx, '/')) {
      const d = toNum(parsePow(ctx));
      v = d !== 0 ? toNum(v) / d : 0;
    } else break;
  }
  return v;
}

function parseExpr(ctx: EvalCtx): VarValue {
  let v = parseTerm(ctx);
  while (true) {
    if (consume(ctx, '+')) v = toNum(v) + toNum(parseTerm(ctx));
    else if (consume(ctx, '-')) v = toNum(v) - toNum(parseTerm(ctx));
    else break;
  }
  return v;
}

function evalExpression(expr: string, env: Map<string, VarValue>, rng: () => number): VarValue {
  const ctx: EvalCtx = { src: expr.trim(), pos: 0, env, rng };
  return parseExpr(ctx);
}

// ── Constraint checker ────────────────────────────────────────────────────────

function checkConstraint(expr: string, env: Map<string, VarValue>): boolean {
  const rng = Math.random;
  for (const clause of expr.split('&')) {
    const t = clause.trim();
    if (/^isunique\s*\(/i.test(t)) {
      if (toNum(evalExpression(t, env, rng)) === 0) return false;
      continue;
    }
    const op = /^(.+?)(<>|>=|<=|>|<|=)(.+)$/.exec(t);
    if (!op) continue;
    const l = toNum(evalExpression(op[1].trim(), env, rng));
    const r = toNum(evalExpression(op[3].trim(), env, rng));
    const ok =
      op[2] === '<>' ? l !== r :
      op[2] === '>=' ? l >= r :
      op[2] === '<=' ? l <= r :
      op[2] === '>'  ? l > r  :
      op[2] === '<'  ? l < r  : l === r;
    if (!ok) return false;
  }
  return true;
}

// ── PRNG ──────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Variable evaluation ───────────────────────────────────────────────────────

function parseSampleValue(s: string): VarValue {
  const t = s.trim();
  const f = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(t);
  if (f) return { num: parseFloat(f[1]), den: parseFloat(f[2]) };
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

export function evaluateVars(
  vars: BnkVar[],
  constraints: string[],
  seed?: number,
  maxAttempts = 200,
): Map<string, VarValue> {
  const rng = seed !== undefined ? mulberry32(seed) : Math.random.bind(Math);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const env = new Map<string, VarValue>();
    let ok = true;

    for (const v of vars) {
      try {
        env.set(v.name, evalExpression(v.expression, env, rng));
      } catch {
        ok = false;
        break;
      }
    }

    if (ok && constraints.every(c => checkConstraint(c, env))) return env;
  }

  // Fallback: use sample values from the BNK file
  const fallback = new Map<string, VarValue>();
  for (const v of vars) fallback.set(v.name, parseSampleValue(v.sample));
  return fallback;
}

// ── Value rendering ───────────────────────────────────────────────────────────

export function renderValue(val: VarValue): string {
  if (typeof val !== 'number') {
    return `$ frac(${val.num}, ${val.den}) $`;
  }
  if (Number.isInteger(val)) return val.toString();
  return parseFloat(val.toFixed(6)).toString();
}

// ── Template substitution using explicit varOrder ────────────────────────────

export function substituteTemplate(
  template: string,
  varOrder: string[],
  env: Map<string, VarValue>,
  startIndex: number,
): { result: string; consumed: number } {
  let idx = startIndex;
  const result = template.replace(/\x0f/g, () => {
    const name = varOrder[idx++];
    if (!name) return BLANK;
    const val = env.get(name);
    return val !== undefined ? renderValue(val) : BLANK;
  });
  return { result, consumed: idx - startIndex };
}

// ── Public entry point ────────────────────────────────────────────────────────

export function evaluateQuestion(q: BnkQuestion, seed?: number): BnkQuestion {
  if (!q.variables.length || !q.varOrder.length) return q;

  const env = evaluateVars(q.variables, q.rawConstraints, seed);

  // Substitute body first, tracking how many \x0f were consumed
  const { result: stem, consumed: bodyPh } = substituteTemplate(q.rawBody, q.varOrder, env, 0);

  // Substitute choices in file order, continuing the varOrder index
  let choiceIdx = bodyPh;
  const evaluatedChoices: Record<string, string> = {};
  for (const letter of q.choiceFileOrder) {
    const tmpl = q.rawChoices[letter] ?? '';
    const { result, consumed } = substituteTemplate(tmpl, q.varOrder, env, choiceIdx);
    choiceIdx += consumed;
    if (result) evaluatedChoices[letter] = result;
  }

  const body = formatBody(stem, evaluatedChoices);

  return {
    ...q,
    body,
    choices: evaluatedChoices,
    variables: [],
    varOrder: [],
    rawBody: '',
    rawChoices: {},
    choiceFileOrder: [],
    rawConstraints: [],
  };
}
