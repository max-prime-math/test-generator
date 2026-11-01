import assert from 'node:assert/strict';
import { buildLiteralEquation, type LiteralFactoring, type LiteralVariableCount } from '../src/lib/generator/generators/kuta/literal-equations.ts';
import { createRng } from '../src/lib/generator/rng.ts';

const counts: LiteralVariableCount[] = ['few', 'some', 'many'];
const factoring: LiteralFactoring[] = ['no', 'either', 'yes'];
let checked = 0;

// Every teacher-selectable combination must be deterministic, non-empty, and clean.
for (const variableCount of counts) {
  for (const factorMode of factoring) {
    for (const includeNumbers of [false, true]) {
      for (const isolatedSide of [false, true]) {
        for (let seed = 0; seed < 100; seed++) {
          const options = { variableCount, factoring: factorMode, includeNumbers, isolatedSide };
          const actual = buildLiteralEquation(createRng(seed), options);
          assert.deepEqual(actual, buildLiteralEquation(createRng(seed), options), 'same seed and options reproduce the question');
          assert.equal(new Set(actual.distractors).size, 3, `${actual.family}: distractors are distinct`);
          assert.ok(!actual.distractors.includes(actual.answer), `${actual.family}: distractors exclude the answer`);
          if (!includeNumbers) assert.ok(!/\d/.test(actual.equation), `${actual.family}: no-numbers mode`);
          if (isolatedSide) {
            const sides = actual.equation.split(' = ');
            assert.ok(sides.some((side) => /^[a-z]$/.test(side)), `${actual.family}: one side is an isolated variable`);
          }
          checked++;
        }
      }
    }
  }
}

// Default levels must vary the algebraic structure, not merely names or coefficients.
for (const [variableCount, minimumFamilies] of [['few', 4], ['some', 6], ['many', 6]] as const) {
  const families = new Set<string>();
  const equations = new Set<string>();
  for (let seed = 0; seed < 250; seed++) {
    const question = buildLiteralEquation(createRng(seed), {
      variableCount,
      includeNumbers: variableCount !== 'few',
      isolatedSide: variableCount === 'few',
      factoring: variableCount === 'few' ? 'no' : 'either',
    });
    families.add(question.family);
    equations.add(question.equation);
  }
  assert.ok(families.size >= minimumFamilies, `${variableCount}: expected at least ${minimumFamilies} structural families, got ${families.size}`);
  assert.ok(equations.size >= 225, `${variableCount}: expected broad surface variation, got ${equations.size}/250 distinct equations`);
}

console.log(`literal-equation generator: ${checked} option cases plus diversity checks passed`);
