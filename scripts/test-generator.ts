import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GENERATORS, generateProblem, toQuestion, type GeneratedItem } from '../src/lib/generator/registry.ts';
import { frac, monomialQuotient, poly, polynomial } from '../src/lib/generator/format.ts';
import { createRng, deriveSeed } from '../src/lib/generator/rng.ts';
import { randomSystem, rank, toQ } from '../src/lib/generator/linalg.ts';
import { loadPlan, planItems } from '../src/lib/generator/worksheet.ts';
import { Q } from '../src/lib/generator/exact.ts';
import { GENERATOR_COURSES, outcomeStatement } from '../src/lib/generator/outcomes.ts';
import { CATALOGS } from '../src/lib/generator/catalog.ts';
import { staleRoadmapPages } from './build-roadmap.ts';
import type { Difficulty } from '../src/lib/generator/types.ts';

const SEEDS = 300;
const DIFFICULTIES: Difficulty[] = [1, 2, 3];

// Formatting helpers
assert.equal(poly([2, -5, 3]), '2x^2 - 5x + 3');
assert.equal(poly([1, 0, -1]), 'x^2 - 1');
assert.equal(poly([-1, 1]), '-x + 1');
assert.equal(polynomial([{ coef: 3, powers: [['x', 1]] }, { coef: -1, powers: [['y', 1]] }, { coef: 0 }]), '3x - y');
assert.equal(frac(6, -8), '-3/4');
assert.equal(frac(8, 4), '2');
assert.equal(monomialQuotient(3, 12, [['x', 2], ['y', -3]]), '(x^2)/(4y^3)');
assert.equal(monomialQuotient(-6, 4, [['x', -1]]), '-3/(2x)');

// Random systems have exactly the rank, consistency, and number of parameters they were built for.
for (const spec of [
  { vars: 3, eqs: 3, rank: 3, consistent: true }, { vars: 4, eqs: 4, rank: 4, consistent: true },
  { vars: 3, eqs: 3, rank: 2, consistent: true }, { vars: 3, eqs: 3, rank: 2, consistent: false },
  { vars: 4, eqs: 3, rank: 2, consistent: true }, { vars: 4, eqs: 4, rank: 3, consistent: false }, { vars: 3, eqs: 3, rank: 1, consistent: true },
]) {
  for (let n = 0; n < 200; n++) {
    const sys = randomSystem(createRng(deriveSeed(7, spec.vars, spec.rank, n)), spec);
    assert.equal(rank(toQ(sys.A)), spec.rank, 'system rank');
    assert.equal(sys.solution.kind === 'none', !spec.consistent, 'system consistency');
    if (spec.consistent) assert.equal(sys.solution.kind === 'param' ? sys.solution.free.length : 0, spec.vars - spec.rank, 'system parameters');
    // The stated solution really satisfies the system (checked at two parameter values).
    for (const t of [0, 2]) {
      if (sys.solution.kind === 'none') break;
      const x = sys.solution.kind === 'unique' ? sys.solution.values : sys.solution.exprs.map((e) => e.coefs.reduce((acc, k) => acc.add(k.mul(t)), e.c));
      sys.A.forEach((row, i) => assert.ok(row.reduce((acc, c, j) => acc.add(x[j].mul(c)), new Q(0)).eq(sys.b[i]), 'solution satisfies the system'));
    }
  }
}

// Every generator's outcome exists in its course.
for (const g of GENERATORS) {
  const course = GENERATOR_COURSES.find((c) => c.id === g.classId);
  assert.ok(course, `${g.id}: unknown course ${g.classId}`);
  const placed = new Set(course.units.flatMap((u) => u.sections.map((s) => `${u.id}:${s.id}`)));
  assert.ok(placed.has(`${g.unitId}:${g.outcomeId}`), `${g.id}: unknown outcome ${g.outcomeId}`);
}

// Catalogues: every tag is a real outcome of its course, every outcome has at least
// one problem type, ids are unique, and linked generators exist.
const catalogIds = new Set<string>();
for (const catalog of CATALOGS) {
  const course = GENERATOR_COURSES.find((c) => c.id === catalog.classId);
  assert.ok(course, `catalog for unknown course ${catalog.classId}`);
  const courseOutcomes = new Set(course.units.flatMap((u) => u.sections.map((s) => s.id)));
  const used = new Set<string>();
  for (const type of catalog.units.flatMap((u) => u.types)) {
    assert.ok(!catalogIds.has(type.id), `duplicate catalog id ${type.id}`);
    catalogIds.add(type.id);
    assert.ok(type.outcomes.length, `${type.id}: no outcomes`);
    for (const o of type.outcomes) { assert.ok(courseOutcomes.has(o), `${type.id}: unknown outcome ${o}`); used.add(o); }
  }
  for (const o of courseOutcomes) {
    assert.ok(used.has(o), `${catalog.classId}: outcome ${o} has no problem types`);
    assert.ok(outcomeStatement(o), `${catalog.classId}: outcome ${o} has no statement`);
  }
}

// Generators linked to the catalogue carry exactly that entry's outcomes.
for (const g of GENERATORS.filter((g) => g.catalogId)) {
  const entry = CATALOGS.flatMap((c) => c.units.flatMap((u) => u.types)).find((t) => t.id === g.catalogId);
  assert.ok(entry, `${g.id}: unknown catalog entry ${g.catalogId}`);
  assert.deepEqual(g.outcomes, entry.outcomes, `${g.id}: outcomes must match ${entry.id}`);
}

// Every course is complete: each problem type in its catalogue has a generator.
for (const { classId } of CATALOGS) {
  const entries = CATALOGS.find((c) => c.classId === classId)!.units.flatMap((u) => u.types);
  const missing = entries.filter((t) => !GENERATORS.some((g) => g.catalogId === t.id)).map((t) => t.id);
  assert.deepEqual(missing, [], `${classId} problem types without a generator: ${missing.join(', ')}`);
}

// The roadmap pages are built from the catalogue, so they must match it.
assert.deepEqual(staleRoadmapPages(), [], 'Roadmap pages are out of date; run npm run roadmap:build');

/** Slips that should never appear in rendered math. */
const SLIPS: Array<[RegExp, string]> = [
  [/\+ -/, 'plus minus'],
  [/- -/, 'minus minus'],
  [/(?<![A-Za-z])xx(?![A-Za-z])/, 'adjacent x x'],
  [/(^|[^0-9.^])1[a-z]/, 'coefficient 1'],
  [/[a-z]\^1(?![0-9])/, 'power of 1'],
  [/(^|[^0-9.])0[a-z]/, 'zero term'],
  [/NaN|Infinity|null/, 'bad number'],
  // Floating-point noise such as 657719.9999999999.
  // (Leading zeros in a small value such as 0.000000178 are not noise.)
  [/[1-9]\d*\.\d*(?:9{6,}|0{6,})\d|\d\.\d*9{6,}\d/, 'floating-point noise'],
  [/[a-z]\^\(0\)|[a-z]\^0(?![0-9.])/, 'power of zero'],
];

let problems = 0;
const thinChoices: string[] = [];
for (const g of GENERATORS) {
  for (const difficulty of DIFFICULTIES) {
    let short = 0;
    for (let n = 0; n < SEEDS; n++) {
      const item: GeneratedItem = { generatorId: g.id, difficulty, seed: deriveSeed(12345, g.id, difficulty, n) };
      const problem = generateProblem(item);
      assert.deepEqual(generateProblem(item), problem, `${g.id}: same seed must reproduce the problem`);
      for (const text of [problem.body, problem.answer, problem.solution, ...problem.distractors]) {
        for (const [pattern, label] of SLIPS) {
          const math = [...text.replace(/\\\$/g, '').matchAll(/\$([^$]*)\$/g)].map((m) => m[1]).join(' ');
          assert.ok(!pattern.test(math), `${g.id} L${difficulty} seed ${item.seed}: ${label} in ${JSON.stringify(text)}`);
        }
      }
      const mcq = toQuestion(item, 'mcq');
      problems++;
      if (g.mcq === false) {
        assert.equal(mcq.questionType, 'frq', `${g.id}: written-only generators stay written`);
        continue;
      }
      const choices = Object.values(mcq.choices ?? {});
      assert.equal(new Set(choices).size, choices.length, `${g.id}: duplicate choices`);
      assert.ok(mcq.answer && mcq.choices?.[mcq.answer], `${g.id}: answer letter must point at a choice`);
      if (choices.length < 4) short++;
    }
    if (short) thinChoices.push(`${g.id} L${difficulty}: ${short}/${SEEDS} with fewer than 4 choices`);
  }
}

// Options: every value of every option, at every level, gives clean, reproducible problems.
let optionProblems = 0;
for (const g of GENERATORS.filter((g) => g.options?.length)) {
  const ids = new Set<string>();
  for (const spec of g.options!) {
    assert.ok(!ids.has(spec.id), `${g.id}: duplicate option ${spec.id}`); ids.add(spec.id);
    for (const d of DIFFICULTIES) assert.ok(spec.kind === 'toggle' ? ['yes', 'no'].includes(spec.levels[d]) : spec.levels[d].split(',').every((v) => spec.choices.some((c) => c.value === v)), `${g.id}: level ${d} value of ${spec.id} is not a choice`);
    const values = spec.kind === 'toggle' ? ['yes', 'no'] : spec.kind === 'many' ? [...spec.choices.map((c) => c.value), spec.choices.map((c) => c.value).join(',')] : spec.choices.map((c) => c.value);
    for (const value of values) {
      for (const difficulty of DIFFICULTIES) {
        for (let n = 0; n < 40; n++) {
          const item: GeneratedItem = { generatorId: g.id, difficulty, seed: deriveSeed(99, g.id, spec.id, value, difficulty, n), options: { [spec.id]: value } };
          const problem = generateProblem(item);
          assert.deepEqual(generateProblem(item), problem, `${g.id} ${spec.id}=${value}: same seed must reproduce the problem`);
          for (const text of [problem.body, problem.answer, problem.solution, ...problem.distractors]) {
            const math = [...text.replace(/\\\$/g, '').matchAll(/\$([^$]*)\$/g)].map((m) => m[1]).join(' ');
            for (const [pattern, label] of SLIPS) assert.ok(!pattern.test(math), `${g.id} ${spec.id}=${value} L${difficulty}: ${label} in ${JSON.stringify(text)}`);
          }
          const mcq = toQuestion(item, 'mcq');
          const choices = Object.values(mcq.choices ?? {});
          assert.equal(new Set(choices).size, choices.length, `${g.id} ${spec.id}=${value}: duplicate choices`);
          optionProblems++;
        }
      }
    }
  }
}

// Worksheets: questions follow the sections in order, and an old plan (a count per type) migrates.
{
  const sections = [
    { id: 'a', generatorId: 'mb-10i-factor-trinomials', seeds: [1, 2], difficulty: 2 as const, format: 'mcq' as const, options: { gcf: 'yes' } },
    { id: 'b', generatorId: 'mb-10f-ooo-integers', seeds: [3], difficulty: 1 as const, format: 'written' as const, options: {} },
  ];
  const planned = planItems(sections);
  assert.deepEqual(planned.map((p) => [p.sectionId, p.item.seed, p.format, p.index]), [['a', 1, 'mcq', 0], ['a', 2, 'mcq', 1], ['b', 3, 'written', 0]]);
  assert.equal(planned[0].item.options?.gcf, 'yes');
  const old = { getItem: (k: string) => (k === 'tg-generator-plan-v1' ? JSON.stringify({ format: 'mcq', course: 'mb-10i', rows: { 'mb-10i-factor-trinomials': { count: 3, difficulty: 2 } } }) : null) };
  const migrated = loadPlan(['mb-10f', 'mb-10i'], old);
  assert.equal(migrated.course, 'mb-10i');
  assert.equal(migrated.sections.length, 1);
  assert.equal(migrated.sections[0].seeds.length, 3);
  assert.equal(migrated.sections[0].format, 'mcq');
  const junk = { getItem: (k: string) => (k === 'tg-generator-plan-v2' ? JSON.stringify({ course: 'nope', sections: [{ generatorId: 'missing', seeds: [1] }, { generatorId: 'mb-10i-factor-trinomials', seeds: [] }, { generatorId: 'mb-10i-factor-trinomials', seeds: [5, -1, 2.5], difficulty: 9, format: 'mcq' }] }) : null) };
  const cleaned = loadPlan(['mb-10f'], junk);
  assert.equal(cleaned.course, 'mb-10f');
  assert.deepEqual(cleaned.sections.map((s) => [s.seeds, s.difficulty]), [[[5], 1]]);
}

// Spot-check correctness: expanded products and factored trinomials agree numerically.
function evaluate(math: string, x: number): number {
  const js = math
    .replace(/\$/g, '')
    .replace(/(\d)\s*x/g, '$1*x')
    .replace(/\)\s*\(/g, ')*(')
    .replace(/(\d)\(/g, '$1*(')
    .replace(/x\^(\d+)/g, 'x**$1')
    .replace(/\bx\b/g, `(${x})`);
  return Function(`return ${js}`)() as number;
}
for (const id of ['mb-10i-multiply-polynomials', 'mb-10i-factor-trinomials']) {
  for (const difficulty of DIFFICULTIES) {
    for (let n = 0; n < 100; n++) {
      const problem = generateProblem({ generatorId: id, difficulty, seed: n });
      const question = problem.body.match(/\$(.*)\$/)![1];
      for (const x of [-2, 1, 3]) assert.ok(Math.abs(evaluate(problem.answer, x) - evaluate(question, x)) < 1e-9, `${id}: ${question} ≠ ${problem.answer}`);
    }
  }
}

// Compile a sample of every generator and level with the Typst CLI to catch markup Typst rejects.
const sample: string[] = ['#set page(width: 16cm, height: auto, margin: 1cm)', '#set text(size: 11pt)'];
for (const g of GENERATORS) {
  sample.push(`= ${g.title} (${g.outcomeId})`);
  for (const difficulty of DIFFICULTIES) {
    for (let n = 0; n < 4; n++) {
      const q = toQuestion({ generatorId: g.id, difficulty, seed: deriveSeed(7, g.id, difficulty, n) }, n % 2 ? 'mcq' : 'written');
      const choices = q.choices ? Object.entries(q.choices).map(([l, c]) => `(${l}) ${c}`).join(' #h(1em) ') : '';
      sample.push(`+ ${q.body}\n\n  ${choices}\n\n  #text(fill: gray)[${q.solution.replace(/\n\n/g, ' ')}]`);
    }
  }
}
const dir = mkdtempSync(join(tmpdir(), 'tg-generator-'));
const source = join(dir, 'sample.typ');
writeFileSync(source, sample.join('\n\n'));
const typst = spawnSync('typst', ['compile', source, join(dir, 'sample.pdf')], { encoding: 'utf8' });
if (typst.error) console.warn(`Skipped Typst compile check: ${typst.error.message}`);
else assert.equal(typst.status, 0, `Typst rejected generated markup (${source}):\n${typst.stderr}`);

console.log(`generator: ${problems} problems checked across ${GENERATORS.length} generators, plus ${optionProblems} across every option value; sample at ${source}`);
if (thinChoices.length) console.log(`Note — some MCQs have fewer than 4 choices:\n  ${thinChoices.join('\n  ')}`);
