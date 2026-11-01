import assert from 'node:assert/strict';
import { createRng } from '../src/lib/generator/rng.ts';
import {
  buildMixtureProblem,
  buildTravelProblem,
  buildWorkProblem,
  type MixtureContext,
  type MixtureForm,
  type TravelGivens,
  type TravelScenario,
  type TravelUnknown,
  type WorkContext,
  type WorkScenario,
} from '../src/lib/generator/generators/kuta/word-problems.ts';

const mixtures: MixtureForm[] = ['result', 'add', 'source', 'split', 'price'];
const mixContexts: MixtureContext[] = ['solution', 'alloy', 'food', 'soil'];
const travelScenarios: TravelScenario[] = ['opposite', 'round', 'catch', 'current'];
const travelUnknowns: TravelUnknown[] = ['time', 'speed', 'either'];
const travelGivens: TravelGivens[] = ['direct', 'difference', 'either'];
const workScenarios: WorkScenario[] = ['together', 'alone', 'delayed', 'fill-drain'];
const workContexts: WorkContext[] = ['people', 'machines', 'pipes'];

let checked = 0;
const validate = <T extends { family: string; problem: { body: string; answer: string; solution: string; distractors: string[] } }>(actual: T, repeat: T) => {
  assert.deepEqual(actual, repeat, `${actual.family}: same seed and options reproduce the question`);
  assert.ok(actual.problem.body && actual.problem.answer && actual.problem.solution, `${actual.family}: complete problem`);
  assert.equal(new Set(actual.problem.distractors).size, actual.problem.distractors.length, `${actual.family}: distinct distractors`);
  assert.ok(!actual.problem.distractors.includes(actual.problem.answer), `${actual.family}: distractors exclude answer`);
  checked++;
};

for (const form of mixtures) for (const context of mixContexts) for (let seed = 0; seed < 100; seed++) {
  validate(buildMixtureProblem(createRng(seed), [form], [context]), buildMixtureProblem(createRng(seed), [form], [context]));
}

for (const scenario of travelScenarios) for (const unknown of travelUnknowns) for (const givens of travelGivens) for (let seed = 0; seed < 100; seed++) {
  validate(buildTravelProblem(createRng(seed), [scenario], unknown, givens), buildTravelProblem(createRng(seed), [scenario], unknown, givens));
}

for (const scenario of workScenarios) for (const context of workContexts) for (let seed = 0; seed < 100; seed++) {
  validate(buildWorkProblem(createRng(seed), [scenario], [context]), buildWorkProblem(createRng(seed), [scenario], [context]));
}

const diversity = (
  label: string,
  count: number,
  minimumFamilies: number,
  build: (rng: ReturnType<typeof createRng>) => { family: string; problem: { body: string } },
) => {
  const families = new Set<string>(), bodies = new Set<string>();
  for (let seed = 0; seed < count; seed++) {
    const item = build(createRng(seed));
    families.add(item.family);
    bodies.add(item.problem.body);
  }
  assert.ok(families.size >= minimumFamilies, `${label}: ${families.size} structural families, expected ${minimumFamilies}`);
  assert.ok(bodies.size >= count * 0.9, `${label}: ${bodies.size}/${count} distinct prompts`);
};

diversity('mixtures', 500, 17, (rng) => buildMixtureProblem(rng, mixtures, mixContexts));
diversity('travel', 500, 16, (rng) => buildTravelProblem(rng, travelScenarios, 'either', 'either'));
diversity('work', 500, 10, (rng) => buildWorkProblem(rng, workScenarios, workContexts));

console.log(`word-problem generators: ${checked} option cases plus diversity checks passed`);
