// Independent checks for the Grade 10 (20S) task options: factorizations are expanded and
// compared with the trinomial, word-problem answers are substituted into their systems, and
// line and distance answers are recomputed from the given points.
import assert from 'node:assert/strict';
import { generateProblem } from '../src/lib/generator/registry.ts';
import type { GenOptions } from '../src/lib/generator/types.ts';

const SEEDS = 80;
const problems = (id: string, options: GenOptions, difficulties = [1, 2, 3] as const) =>
  difficulties.flatMap((difficulty) => Array.from({ length: SEEDS }, (_, seed) => generateProblem({ generatorId: `mb-10i-${id}`, difficulty, seed, options })));
const inner = (math: string) => math.match(/\$([^$]*)\$/)![1];
let checked = 0;

/** Evaluate Typst-style algebra (implicit products, ^ powers, a/b fractions) at x and y. */
function evaluate(text: string, x: number, y: number): number {
  const js = text
    .replace(/(\d|\))\s*(?=[xy(])/g, '$1*')
    .replace(/([xy])\s+(?=[xy(])/g, '$1*')
    .replace(/([xy])(?=\()/g, '$1*')
    .replace(/\^/g, '**')
    .replace(/\bx\b/g, `(${x})`).replace(/\by\b/g, `(${y})`);
  return Function(`return ${js}`)() as number;
}

// Factoring: the answer expands to the trinomial, perfect squares are written as squares.
for (const options of [{ vars: 'xy' }, { kind: 'square' }, { vars: 'xy', kind: 'square' }, { vars: 'xy', leading: '1' }] as GenOptions[]) {
  for (const p of problems('factor-trinomials', options)) {
    const given = inner(p.body), answer = inner(p.answer);
    for (const [x, y] of [[2, 3], [-1, 5], [4, -2], [7, 1]]) assert.ok(Math.abs(evaluate(answer, x, y) - evaluate(given, x, y)) < 1e-9, `${given} ≠ ${answer}`);
    if (options.kind === 'square') assert.match(answer, /\)\^2$/, `${answer} should be written as a square`);
    if (options.vars === 'xy') assert.match(given, /y\^2/, `${given} should have a y² term`);
    checked++;
  }
}

// Systems word problems: the stated answer satisfies both equations of the model.
const numbers = (text: string) => [...text.replace(/\\\$/g, '').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
for (const [form, vars] of [['4', ['n', 'C']], ['5', ['a', 'b']], ['6', ['s', 'w|c']]] as const) {
  for (const p of problems('sys-problem', { form })) {
    const [e1, e2] = p.solution.match(/cases\((.*?), (.*?)\)\)/)!.slice(1);
    // The plan answer is "10 visits, at $140"; the mixture "3 kg of … and 5 kg of …"; the speeds "…: 12 km/h; …: 4 km/h".
    const values = numbers(p.answer);
    const scope: Record<string, number> = { [vars[0]]: values[0] };
    for (const v of vars[1].split('|')) scope[v] = values[1];
    for (const eq of [e1, e2]) {
      const [lhs, rhs] = eq.split('=').map((side) => side.replace(/(?<![a-zA-Z])([a-zA-Z])(?![a-zA-Z])/g, (v) => `(${scope[v]})`)
        .replace(/(\d|\))\s*\(/g, '$1*(').replace(/\)\s*(?=\d)/g, ')*'));
      assert.equal(Function(`return ${lhs}`)(), Function(`return ${rhs}`)(), `${p.body} → ${p.answer} fails ${eq}`);
    }
    checked++;
  }
}

// Parallel or perpendicular lines: the answer passes through the point with the right slope.
const fraction = (t: string) => Function(`return ${t.replace(/\s/g, '')}`)() as number;
const slopeOf = (answer: string) => { const m = answer.match(/^y = (-?[\d/]*) ?x/); return m ? (m[1] === '' ? 1 : m[1] === '-' ? -1 : fraction(m[1])) : 0; };
for (const p of problems('eq-parallel-perpendicular', { form: '4' })) {
  const pts = [...p.body.matchAll(/\$\((-?[\d/]+), (-?[\d/]+)\)\$/g)].map((m) => [fraction(m[1]), fraction(m[2])]);
  const [[x1, y1], [u1, v1], [u2, v2]] = pts;
  const m0 = (v2 - v1) / (u2 - u1), answer = inner(p.answer);
  const line = (x: number) => evaluate(answer.replace(/^y = /, ''), x, 0);
  assert.ok(Math.abs(line(x1) - y1) < 1e-9, `${answer} misses (${x1}, ${y1})`);
  const m = line(1) - line(0);
  assert.ok(/parallel/.test(p.body) ? Math.abs(m - m0) < 1e-9 : Math.abs(m * m0 + 1) < 1e-9, `${p.body} → ${answer}`);
  assert.ok(Math.abs(slopeOf(answer) - m) < 1e-9, `slope of ${answer}`);
  checked++;
}
for (const p of problems('eq-parallel-perpendicular', { form: '5' })) {
  const [x1, y1] = p.body.match(/\$\((-?\d+), (-?\d+)\)\$/)!.slice(1).map(Number);
  const givenHorizontal = /to \$y = /.test(p.body), parallel = /parallel/.test(p.body);
  assert.equal(inner(p.answer), givenHorizontal === parallel ? `y = ${y1}` : `x = ${x1}`, p.body);
  checked++;
}

// Distance problems: recompute the right-angle test and both missing coordinates.
for (const p of problems('dist-problem', { form: '4' })) {
  const [A, B, C] = [...p.body.matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const d2 = (u: number[], v: number[]) => (u[0] - v[0]) ** 2 + (u[1] - v[1]) ** 2;
  const [s1, s2, s3] = [d2(A, B), d2(A, C), d2(B, C)].sort((u, v) => u - v);
  assert.equal(p.answer.startsWith('Yes'), s1 + s2 === s3, p.body);
  checked++;
}
for (const p of problems('dist-problem', { form: '5' })) {
  const [, x1, y1, x2, d] = p.body.match(/\((-?\d+), (-?\d+)\)\$ and \$\((-?\d+), k\)\$ is (\d+)/)!.map(Number);
  const ks = numbers(inner(p.answer));
  assert.equal(ks.length, 2);
  for (const k of ks) assert.equal((x2 - x1) ** 2 + (k - y1) ** 2, d * d, `${p.body} → k = ${k}`);
  checked++;
}

assert.ok(checked > 2000, `only ${checked} cases checked`);
console.log(`Grade 10 checks passed: ${checked} answers verified by expansion, substitution, or recomputation.`);
