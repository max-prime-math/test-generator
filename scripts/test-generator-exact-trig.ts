import assert from 'node:assert/strict';
import { Q, Surds, TRIG_FNS, reciprocalFn, type TrigFn } from '../src/lib/generator/exact.ts';
import { createRng } from '../src/lib/generator/rng.ts';
import { describeOptions, generateProblem, resolveOptions, toQuestion } from '../src/lib/generator/registry.ts';
import { compoundExactTrig, compoundModel, compoundProblem, twoAngleExactTrig, twoAngleModel, twoAngleProblem } from '../src/lib/generator/generators/pc40s/exact-trig.ts';
import { COMPOUND_EXAMPLES, TWO_ANGLE_EXAMPLES, compoundValue, combinedRatios, divideSurds, recoverRatios, ratioValue, type Quadrant, type RatioGiven } from '../src/lib/generator/generators/pc40s/exact-trig-model.ts';

function close(actual: number, expected: number, message = '') {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), message);
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${message}: ${actual} != ${expected}`);
}
function numeric(fn: TrigFn, radians: number): number {
  switch (fn) {
    case 'sin': return Math.sin(radians);
    case 'cos': return Math.cos(radians);
    case 'tan': return Math.tan(radians);
    case 'csc': return 1 / Math.sin(radians);
    case 'sec': return 1 / Math.cos(radians);
    case 'cot': return 1 / Math.tan(radians);
  }
}
/** Independently evaluate the published exact answer's small arithmetic grammar. */
function answerValue(source: string): number {
  const s = source.replaceAll('$', '').replace(/sqrt\((\d+)\)/g, 'Math.sqrt($1)').replace(/(\d|\))(?=Math\.sqrt|\()/g, '$1*');
  assert.match(s, /^[\d\s+\-*/().Mathsqrt]+$/);
  return Function(`return (${s});`)() as number;
}
/** Derive an angle from the given ratio using inverse functions, independently of the radical model. */
function givenAngle(g: RatioGiven): number {
  const q = g.value.value;
  const acute = g.fn === 'sin' ? Math.asin(Math.abs(q)) : g.fn === 'cos' ? Math.acos(Math.abs(q))
    : g.fn === 'csc' ? Math.asin(1 / Math.abs(q)) : g.fn === 'sec' ? Math.acos(1 / Math.abs(q))
    : g.fn === 'tan' ? Math.atan(Math.abs(q)) : Math.atan(1 / Math.abs(q));
  return g.quadrant === 1 ? acute : g.quadrant === 2 ? Math.PI - acute : g.quadrant === 3 ? Math.PI + acute : 2 * Math.PI - acute;
}

// Independently calculated provincial reference answers, including irrational recovery and rationalization.
assert.equal(compoundValue(COMPOUND_EXAMPLES['2026-jun-q25']).typst(), '0');
assert.equal(compoundValue(COMPOUND_EXAMPLES['2026-jan-q37']).typst(), '5/2');
assert.equal(compoundValue(COMPOUND_EXAMPLES['2025-jun-q28']).typst(), '6');
const june26 = TWO_ANGLE_EXAMPLES['2026-jun-q31'];
assert.equal(ratioValue('sin', combinedRatios(june26)).typst(), '(2sqrt(10) - 2)/9');
const june25 = TWO_ANGLE_EXAMPLES['2025-jun-q35'];
assert.equal(ratioValue('cos', combinedRatios(june25)).typst(), '(48 + 5sqrt(33))/91');
assert.equal(ratioValue('sec', combinedRatios(june25)).typst(), '(4368 - 455sqrt(33))/1479');
assert.equal(ratioValue('cos', combinedRatios(TWO_ANGLE_EXAMPLES['2025-jan-q31'])).typst(), '-16/65');
close(divideSurds(Surds.of(1), new Surds([[1, 2], [1, 3]])).value, 1 / (Math.sqrt(2) + Math.sqrt(3)));
assert.throws(() => divideSurds(Surds.of(1), Surds.of(0)), /zero/);
assert.throws(() => recoverRatios({ fn: 'sin', value: new Q(2, 3), quadrant: 3 }), /inconsistent/);
assert.throws(() => recoverRatios({ fn: 'cos', value: new Q(1), quadrant: 1 }), /less than 1/);

// Every given-ratio type in every quadrant: recovered ratios satisfy both the input and unit-circle identities.
for (const fn of TRIG_FNS) for (const quadrant of [1, 2, 3, 4] as Quadrant[]) {
  const radians = (quadrant - 1) * Math.PI / 2 + 0.63;
  const sign = Math.sign(numeric(fn, radians));
  const magnitude = fn === 'sec' || fn === 'csc' ? new Q(7, 3) : new Q(3, 7);
  const given: RatioGiven = { fn, quadrant, value: magnitude.mul(sign) };
  const r = recoverRatios(given), theta = givenAngle(given);
  close(r.sin.value, Math.sin(theta)); close(r.cos.value, Math.cos(theta));
  close(r.sin.value ** 2 + r.cos.value ** 2, 1);
  close(ratioValue(fn, r).value, given.value.value);
}

assert.doesNotMatch(describeOptions(compoundExactTrig, { example: '2026-jun-q25', unit: 'rad' }, 1), /Angles in/);
assert.match(describeOptions(compoundExactTrig, { example: 'practice', unit: 'rad' }, 1), /Angles in: Radians/);
let checked = 0;
for (const generator of [compoundExactTrig, twoAngleExactTrig]) {
  const variants = [{}];
  for (const spec of generator.options!) for (const choice of spec.choices) variants.push({ [spec.id]: choice.value });
  // Interacting options: all targets, sums/differences, explicit/inferred quadrants, and single/paired tasks.
  if (generator === twoAngleExactTrig) for (const fn of TRIG_FNS) for (const operation of ['+', '-']) for (const quadrants of ['same', 'explicit']) for (const task of ['single', 'paired']) {
    variants.push({ fn, operation, quadrants, task, given: 'reciprocal' });
  }
  if (generator === compoundExactTrig) for (const task of ['sum', 'product', 'sum-product']) for (const ratios of ['primary', 'reciprocal', 'all']) for (const powers of ['1', '2', '3']) {
    variants.push({ task, ratios, powers, range: 'wide' });
  }
  for (const difficulty of [1, 2, 3] as const) for (const options of variants) for (let seed = 0; seed < 30; seed++) {
    const o = resolveOptions(generator, options, difficulty);
    const item = { generatorId: generator.id, difficulty, options, seed };
    const p = generateProblem(item);
    assert.deepEqual(p, generateProblem(item), 'seed and settings reproduce the question');
    if (generator === compoundExactTrig) {
      const model = compoundModel(createRng(seed), difficulty, o);
      const [a, b, c] = model.terms.map(t => numeric(t.fn, t.degrees * Math.PI / 180) ** t.power);
      const expected = model.task === 'product' ? a * b : a + model.sign * (model.task === 'sum' ? b : b * c);
      close(answerValue(p.answer), expected, `compound ${seed}`);
      const q = toQuestion(item, 'mcq');
      assert.equal(Object.keys(q.choices!).length, 4);
      const numbers = Object.values(q.choices!).map(answerValue);
      assert.equal(new Set(numbers.map(n => n.toFixed(9))).size, 4, 'MCQ answers differ mathematically');
      close(answerValue(q.choices![q.answer!]), expected, 'MCQ choice matches the exact answer');
    } else {
      const model = twoAngleModel(createRng(seed), difficulty, o);
      const theta = givenAngle(model.alpha) + (model.operation === '+' ? 1 : -1) * givenAngle(model.beta);
      const answers = [...p.answer.matchAll(/\$([^$]*)\$/g)].map(m => answerValue(m[1]));
      close(answers[0], numeric(model.fn, theta), `two angle ${seed}`);
      if (model.paired) close(answers[1], numeric(reciprocalFn(model.fn), theta), 'reciprocal part');
      assert.equal(answers.length, model.paired ? 2 : 1);
      if (model.inferQuadrant) {
        assert.equal(model.alpha.quadrant, model.beta.quadrant);
        // The two givens must fix one sine sign and one cosine sign, not leave two possible quadrants.
        assert.notEqual(['sin', 'csc'].includes(model.alpha.fn), ['sin', 'csc'].includes(model.beta.fn));
      }
      if (difficulty === 1 && o.example === 'practice') {
        const a = recoverRatios(model.alpha), b = recoverRatios(model.beta);
        assert.ok(a.sin.isRational && a.cos.isRational && b.sin.isRational && b.cos.isRational);
      }
      assert.equal(toQuestion(item, 'mcq').questionType, 'frq', 'linked exact-angle work stays written');
    }
    checked++;
  }
}
console.log(`Exact trig checks passed: provincial references and ${checked} option/seed cases checked against independent numerical trigonometry.`);
