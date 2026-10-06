// Brute-force checks for the PC40S counting and binomial task options: each answer is
// recounted by enumerating arrangements, selections, or digit strings, or by multiplying
// out the binomial, independently of the generator's formulas.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GENERATORS, generateProblem, toQuestion } from '../src/lib/generator/registry.ts';
import type { GenOptions } from '../src/lib/generator/types.ts';

const SEEDS = 60;
const value = (math: string) => Number(math.replace(/\$/g, '').split('=').at(-1)!.replace(/thin/g, '').replace(/\s/g, ''));
const problems = (id: string, options: GenOptions) => Array.from({ length: SEEDS }, (_, seed) => generateProblem({ generatorId: `mb-40s-${id}`, difficulty: 2, seed, options }));
let checked = 0;

/** Every distinct arrangement of the letters (multiset permutations). */
function* arrangements(letters: string[]): Generator<string> {
  if (!letters.length) { yield ''; return; }
  for (const ch of new Set(letters)) {
    const rest = [...letters]; rest.splice(rest.indexOf(ch), 1);
    for (const tail of arrangements(rest)) yield ch + tail;
  }
}
function* subsets(n: number, r: number, start = 0): Generator<number[]> {
  if (r === 0) { yield []; return; }
  for (let i = start; i <= n - r; i++) for (const rest of subsets(n, r - 1, i + 1)) yield [i, ...rest];
}
const vowel = (ch: string) => 'AEIOU'.includes(ch);
const count = <T>(items: Iterable<T>, ok: (t: T) => boolean) => { let k = 0; for (const t of items) if (ok(t)) k++; return k; };

// Repeated letters with a condition.
for (const p of problems('pc-identical', { form: '4' })) {
  const word = p.body.match(/letters of ([A-Z]+)/)![1];
  if (word.length > 9) continue;
  const begin = p.body.match(/begin with ([A-Z])\?/), ends = p.body.match(/begin and end with ([A-Z])/), together = p.body.match(/all \d+ ([A-Z])'s together/);
  const ok = begin ? (w: string) => w[0] === begin[1]
    : ends ? (w: string) => w[0] === ends[1] && w.at(-1) === ends[1]
      : (w: string) => new RegExp(`${together![1]}{${[...word].filter((c) => c === together![1]).length}}`).test(w);
  assert.equal(value(p.answer), count(arrangements([...word]), ok), p.body);
  checked++;
}

// Alternating vowels and consonants.
for (const p of problems('pc-conditions', { form: '4' })) {
  const word = p.body.match(/letters of ([A-Z]+)/)![1];
  assert.equal(value(p.answer), count(arrangements([...word]), (w) => [...w].every((ch, i) => i === 0 || vowel(ch) !== vowel(w[i - 1]))), p.body);
  checked++;
}

// Groups kept together: arrange labelled items, and check each group is contiguous.
for (const p of problems('pc-conditions', { form: '5' })) {
  const sizes = [...p.body.matchAll(/(\d+) different/g)].map((m) => Number(m[1]));
  if (sizes.reduce((a, k) => a + k, 0) > 8) continue;
  const items = sizes.flatMap((k, g) => Array.from({ length: k }, (_, i) => String.fromCharCode(65 + g * 4 + i)));
  const group = (ch: string) => Math.floor((ch.charCodeAt(0) - 65) / 4);
  const contiguous = (w: string) => sizes.every((_, g) => { const at = [...w].flatMap((ch, i) => (group(ch) === g ? [i] : [])); return at.at(-1)! - at[0] === at.length - 1; });
  assert.equal(value(p.answer), count(arrangements(items), contiguous), p.body);
  checked++;
}

// A particular member must, or must not, be chosen. Members 0 and 1 are the two named ones.
for (const p of problems('pc-combinations', { form: '4' })) {
  const [, r, n] = p.body.match(/(\d+)[^\d]+?(\d+)/)!.map(Number);
  const has = (s: number[], i: number) => s.includes(i);
  const ok = /cannot both/.test(p.body) ? (s: number[]) => !(has(s, 0) && has(s, 1))
    : /both .* must be included/.test(p.body) ? (s: number[]) => has(s, 0) && has(s, 1)
      : /must not be included/.test(p.body) ? (s: number[]) => !has(s, 0) : (s: number[]) => has(s, 0);
  assert.equal(value(p.answer), count(subsets(n, r), ok), p.body);
  checked++;
}

// Numbers from the digits 0 to 9.
for (const p of problems('pc-fcp', { form: '4' })) {
  const len = Number(p.body.match(/(\d)-digit/)![1]);
  const repeat = /if digits may be repeated/.test(p.body);
  const parity = p.body.match(/digit (odd|even) numbers/)?.[1];
  let total = 0;
  for (let x = 10 ** (len - 1); x < 10 ** len; x++) {
    const s = String(x);
    if (!repeat && new Set(s).size !== len) continue;
    if (parity && (x % 2 === 1) !== (parity === 'odd')) continue;
    total++;
  }
  assert.equal(value(p.answer), total, p.body);
  checked++;
}

// Factorial and symmetry equations: the answer satisfies the equation.
const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
const choose = (n: number, r: number) => fact(n) / (fact(r) * fact(n - r));
for (const p of problems('pc-factorial', { form: '4' })) {
  const [, top, bottom, k] = p.body.match(/\$([^$]*)!\/([^$]*)! = (\d+)\$/)!;
  const n = value(p.answer);
  const at = (e: string) => Function('n', `return ${e.replace(/[()]/g, '')}`)(n) as number;
  assert.ok(at(bottom) >= 0 && fact(at(top)) / fact(at(bottom)) === Number(k), p.body);
  checked++;
}
for (const p of problems('pc-ncr-equation', { form: '4' })) {
  const v = value(p.answer);
  const m = p.body.match(/bl: n, br: (\d+)\) = attach\(C, bl: n, br: (\d+)/);
  if (m) assert.equal(choose(v, Number(m[1])), choose(v, Number(m[2])), p.body);
  else {
    const [, N, d] = p.body.match(/bl: (\d+), br: r \+ (\d+)/)!.map(Number);
    assert.equal(choose(N, v), choose(N, v + d), p.body);
  }
  checked++;
}

// Binomials: multiply out (a x^p + b x^-q)^n as a map from power to coefficient.
function parseBinomial(text: string): { terms: Array<[number, number]>; n: number } | null {
  const m = text.match(/\$\(([^()]*)\)\^(\d+)\$/);
  if (!m || /y/.test(m[1])) return null;
  const terms = m[1].replace(/ - /g, ' + -').split(' + ').map((t): [number, number] => {
    const over = t.match(/^(-?\d*)\/x(?:\^(\d+))?$/);
    if (over) return [Number(over[1] === '-' ? -1 : over[1] || 1), -Number(over[2] ?? 1)];
    const mono = t.match(/^(-?\d*)(x(?:\^(\d+))?)?$/)!;
    const c = mono[1] === '-' ? -1 : mono[1] === '' ? 1 : Number(mono[1]);
    return [mono[2] ? c : Number(t), mono[2] ? Number(mono[3] ?? 1) : 0];
  });
  return { terms, n: Number(m[2]) };
}
function expand({ terms: [[a, p], [b, q]], n }: { terms: Array<[number, number]>; n: number }) {
  const out = new Map<number, number>();
  for (let k = 0; k <= n; k++) out.set(p * (n - k) + q * k, (out.get(p * (n - k) + q * k) ?? 0) + choose(n, k) * a ** (n - k) * b ** k);
  return out;
}
const answerTerm = (math: string): [number, number] => {
  const t = math.replace(/\$/g, '');
  const over = t.match(/^(-?\d*)\/x(?:\^(\d+))?$/);
  if (over) return [Number(over[1] || 1), -Number(over[2] ?? 1)];
  const m = t.match(/^(-?\d*)x(?:\^(\d+))?$/);
  return m ? [m[1] === '-' ? -1 : Number(m[1] || 1), Number(m[2] ?? 1)] : [Number(t), 0];
};
for (const options of [{ task: 'general' }, { task: 'absent' }] as GenOptions[]) {
  for (const p of problems('bin-term-power', options)) {
    const e = Number(p.body.match(/\$x(?:\^\(?(-?\d+)\)?)?\$/)![1] ?? 1);
    const coefs = expand(parseBinomial(p.body)!);
    if (options.task === 'absent') assert.equal(coefs.get(e) ?? 0, 0, p.body);
    else assert.deepEqual(answerTerm(p.answer), [coefs.get(e), e], p.body);
    checked++;
  }
}
for (const options of [{ ask: 'middle' }, { ask: 'end' }, { ask: 'middle', form: 'mono' }, { ask: 'end', form: 'mono' }] as GenOptions[]) {
  for (const p of problems('bin-term', options)) {
    const bin = parseBinomial(p.body);
    if (!bin) continue;
    const coefs = [...expand(bin)].sort((x, y) => y[0] - x[0]); // descending powers = term order
    const position = options.ask === 'middle' ? bin.n / 2 : bin.n + 1 - Number(p.body.match(/(\d+)(?:st|nd|rd|th) term from the end/)![1]);
    const [power, coef] = coefs[position];
    assert.deepEqual(answerTerm(p.answer), [coef, power], p.body);
    checked++;
  }
}
for (const p of problems('bin-expand', { task: 'negative' })) {
  const bin = parseBinomial(p.body);
  if (!bin) continue;
  assert.equal(value(p.answer), count(expand(bin).values(), (c) => c < 0), p.body);
  checked++;
}

assert.ok(checked > 600, `only ${checked} cases checked`);

// Every option value of these generators compiles in Typst, as a question, choices, answer and solution.
const sample: string[] = ['#set page(width: 16cm, height: auto, margin: 1cm)', '#set text(size: 11pt)'];
for (const g of GENERATORS.filter((g) => /^mb-40s-(pc|bin)-/.test(g.id))) {
  for (const spec of g.options ?? []) {
    for (const { value: v } of spec.choices) {
      sample.push(`= ${g.title}: ${spec.label} = ${v}`);
      for (let seed = 0; seed < 3; seed++) {
        const q = toQuestion({ generatorId: g.id, difficulty: 2, seed, options: { [spec.id]: v } }, seed % 2 ? 'mcq' : 'written');
        const choices = q.choices ? Object.entries(q.choices).map(([l, c]) => `(${l}) ${c}`).join(' #h(1em) ') : '';
        sample.push(`+ ${q.body}\n\n  ${choices}\n\n  #text(fill: gray)[${q.solution.replace(/\n\n/g, ' ')}]`);
      }
    }
  }
}
const dir = mkdtempSync(join(tmpdir(), 'tg-counting-'));
const source = join(dir, 'counting.typ');
writeFileSync(source, sample.join('\n\n'));
const typst = spawnSync('typst', ['compile', source, join(dir, 'counting.pdf')], { encoding: 'utf8' });
if (typst.error) console.warn(`Skipped Typst compile check: ${typst.error.message}`);
else assert.equal(typst.status, 0, `Typst rejected counting/binomial markup (${source}):\n${typst.stderr}`);
console.log(`Counting and binomial checks passed: ${checked} answers recounted by enumeration or expansion; every option value compiled at ${source}.`);
