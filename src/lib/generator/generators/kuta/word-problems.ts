import type { GeneratedProblem } from '../../types.ts';
import type { Rng } from '../../rng.ts';
import { Q } from '../../exact.ts';
import { gcd } from '../../format.ts';
import { decimal, fixed, math, money, NAMES, wrong } from './common.ts';

export interface FamilyProblem {
  family: string;
  problem: GeneratedProblem;
}

export type MixtureForm = 'result' | 'add' | 'source' | 'split' | 'price';
export type MixtureContext = 'solution' | 'alloy' | 'food' | 'soil';

interface MixContext {
  noun: string;
  component: string;
  unit: string;
}

const MIX_CONTEXTS: Record<MixtureContext, MixContext[]> = {
  solution: [
    { noun: 'acid solution', component: 'acid', unit: 'L' },
    { noun: 'saline solution', component: 'salt', unit: 'L' },
    { noun: 'alcohol solution', component: 'alcohol', unit: 'L' },
  ],
  alloy: [
    { noun: 'metal alloy', component: 'copper', unit: 'kg' },
    { noun: 'metal alloy', component: 'zinc', unit: 'kg' },
  ],
  food: [
    { noun: 'fruit punch', component: 'fruit juice', unit: 'L' },
    { noun: 'nut mixture', component: 'peanuts', unit: 'kg' },
  ],
  soil: [
    { noun: 'soil mixture', component: 'sand', unit: 'kg' },
    { noun: 'soil mixture', component: 'clay', unit: 'kg' },
  ],
};

const pct = (n: number) => `${n}%`;

export function buildMixtureProblem(rng: Rng, forms: MixtureForm[], contexts: MixtureContext[]): FamilyProblem {
  const form = rng.pick(forms);
  if (form === 'price') {
    const [item, unit] = rng.pick([['coffee beans', 'kg'], ['tea leaves', 'kg'], ['granola', 'kg'], ['mixed nuts', 'kg']] as const);
    for (;;) {
      const p1 = rng.int(4, 10), p2 = rng.int(p1 + 2, 20), a = rng.int(2, 16), b = rng.int(2, 16);
      const total = a + b, value = p1 * a + p2 * b;
      if (value % total) continue;
      const target = value / total;
      const answer = `${math(String(a))} ${unit} at ${money(p1)} and ${math(String(b))} ${unit} at ${money(p2)}`;
      return { family: 'price-split', problem: {
        body: `A shop needs ${math(String(total))} ${unit} of ${item} worth ${money(target)} per ${unit}. It will blend varieties worth ${money(p1)} and ${money(p2)} per ${unit}. How much of each should it use?`,
        answer,
        distractors: wrong(answer, [
          `${math(String(b))} ${unit} at ${money(p1)} and ${math(String(a))} ${unit} at ${money(p2)}`,
          `${math(String(total / 2))} ${unit} of each`,
          `${math(String(a + 1))} ${unit} at ${money(p1)} and ${math(String(b - 1))} ${unit} at ${money(p2)}`,
        ]),
        solution: `Let ${math('x')} be the amount at ${money(p1)}. Then ${math(`${p1}x + ${p2}(${total} - x) = ${target}(${total})`)}, giving ${math(`x = ${a}`)} and ${math(`${total} - x = ${b}`)}.`,
      } };
    }
  }

  const contextType = rng.pick(contexts);
  const context = rng.pick(MIX_CONTEXTS[contextType]);
  const { noun, component, unit } = context;
  for (;;) {
    const c1 = rng.pick([10, 15, 20, 25, 30, 35, 40]), c2 = rng.pick([50, 60, 70, 80, 90, 100]);
    const a = rng.int(2, 14), b = rng.int(2, 14), total = a + b;
    const weighted = c1 * a + c2 * b;
    if (weighted % total) continue;
    const target = weighted / total;

    if (form === 'result') {
      const answer = pct(target);
      return { family: `result-${contextType}`, problem: {
        body: `${math(String(a))} ${unit} of ${noun} containing ${pct(c1)} ${component} is mixed with ${math(String(b))} ${unit} containing ${pct(c2)} ${component}. What percent of the new mixture is ${component}?`,
        answer,
        distractors: wrong(answer, [pct(Math.round((c1 + c2) / 2)), pct(Math.abs(c2 - c1)), pct(Math.round(weighted / (a * b)))]),
        solution: `The amount of ${component} is ${math(`${c1 / 100}(${a}) + ${c2 / 100}(${b})`)} in ${math(String(total))} ${unit}, so the concentration is ${math(`${weighted}/${total} = ${target}`)}%.`,
      } };
    }

    if (form === 'source') {
      const answer = pct(c1);
      return { family: `source-${contextType}`, problem: {
        body: `${math(String(a))} ${unit} of one ${noun} is mixed with ${math(String(b))} ${unit} containing ${pct(c2)} ${component}. The resulting mixture contains ${pct(target)} ${component}. What was the concentration of the first mixture?`,
        answer,
        distractors: wrong(answer, [pct(c2 - c1), pct(target - c1), pct(Math.round((target + c2) / 2))]),
        solution: `If ${math('x')} is the unknown percent, ${math(`${a}x + ${b}(${c2}) = ${total}(${target})`)}, so ${math(`x = ${c1}`)}%.`,
      } };
    }

    if (form === 'split') {
      const answer = `${math(String(a))} ${unit} at ${pct(c1)} and ${math(String(b))} ${unit} at ${pct(c2)}`;
      return { family: `split-${contextType}`, problem: {
        body: `How much ${pct(c1)} ${noun} and ${pct(c2)} ${noun} should be combined to make ${math(String(total))} ${unit} containing ${pct(target)} ${component}?`,
        answer,
        distractors: wrong(answer, [
          `${math(String(b))} ${unit} at ${pct(c1)} and ${math(String(a))} ${unit} at ${pct(c2)}`,
          `${math(String(total / 2))} ${unit} of each`,
          `${math(String(a + 1))} ${unit} at ${pct(c1)} and ${math(String(b - 1))} ${unit} at ${pct(c2)}`,
        ]),
        solution: `Let ${math('x')} be the amount at ${pct(c1)}. Then ${math(`${c1}x + ${c2}(${total} - x) = ${target}(${total})`)}, so ${math(`x = ${a}`)} and ${math(`${total} - x = ${b}`)}.`,
      } };
    }

    // Amount added: the generated target guarantees that b is an integer solution.
    const answer = `${math(String(b))} ${unit}`;
    return { family: `add-${contextType}`, problem: {
      body: `How much ${noun} containing ${pct(c2)} ${component} must be added to ${math(String(a))} ${unit} containing ${pct(c1)} ${component} to obtain a ${pct(target)} mixture?`,
      answer,
      distractors: wrong(answer, [a, total, Math.abs(c2 - target), Math.abs(target - c1)].map((n) => `${math(String(n))} ${unit}`)),
      solution: `${math(`${c1 / 100}(${a}) + ${c2 === 100 ? 'x' : `${c2 / 100}x`} = ${target / 100}(${a} + x)`)}, so ${math(`x = ${b}`)} ${unit}.`,
    } };
  }
}

export type TravelScenario = 'opposite' | 'round' | 'catch' | 'current';
export type TravelUnknown = 'time' | 'speed' | 'either';
export type TravelGivens = 'direct' | 'difference' | 'either';

interface TravelFamily {
  id: string;
  scenario: TravelScenario;
  unknown: Exclude<TravelUnknown, 'either'>;
  givens: Exclude<TravelGivens, 'either'>;
  build(rng: Rng): GeneratedProblem;
}

const hours = (value: number) => `${math(fixed(value, 1).replace(/\.0$/, ''))} hours`;
const speed = (value: number) => `${math(fixed(value, 1).replace(/\.0$/, ''))} km/h`;

const TRAVEL_FAMILIES: TravelFamily[] = [
  {
    id: 'opposite-time-direct', scenario: 'opposite', unknown: 'time', givens: 'direct',
    build(rng) {
      const [a, b] = rng.shuffle(NAMES).slice(0, 2), r1 = rng.int(4, 12) * 5, r2 = rng.int(4, 12) * 5, t = rng.int(2, 6), d = (r1 + r2) * t;
      const answer = hours(t);
      return { body: `${a} and ${b} leave the same place at the same time in opposite directions at ${r1} km/h and ${r2} km/h. When will they be ${d} km apart?`, answer, distractors: wrong(answer, [d / Math.abs(r1 - r2 || 1), t + 1, d / Math.max(r1, r2)].map(hours)), solution: `Their separation rate is ${math(`${r1} + ${r2} = ${r1 + r2}`)} km/h, so ${math(`t = ${d}/${r1 + r2} = ${t}`)} hours.` };
    },
  },
  {
    id: 'opposite-time-difference', scenario: 'opposite', unknown: 'time', givens: 'difference',
    build(rng) {
      const [a, b] = rng.shuffle(NAMES).slice(0, 2), r1 = rng.int(5, 10) * 5, diff = rng.int(1, 5) * 5, r2 = r1 + diff, t = rng.int(2, 6), d = (r1 + r2) * t;
      const answer = hours(t);
      return { body: `${a} and ${b} leave the same town in opposite directions. ${a} travels ${r1} km/h and ${b} travels ${diff} km/h faster. How long until they are ${d} km apart?`, answer, distractors: wrong(answer, [d / diff, d / (r1 + diff), t + 1].map(hours)), solution: `The faster speed is ${math(`${r1} + ${diff} = ${r2}`)}, so ${math(`t = ${d}/(${r1} + ${r2}) = ${t}`)} hours.` };
    },
  },
  {
    id: 'opposite-speed-direct', scenario: 'opposite', unknown: 'speed', givens: 'direct',
    build(rng) {
      const [a, b] = rng.shuffle(NAMES).slice(0, 2), r1 = rng.int(5, 12) * 5, r2 = rng.int(5, 12) * 5, t = rng.int(2, 5), d = (r1 + r2) * t;
      const answer = speed(r2);
      return { body: `${a} and ${b} cycle from the same point in opposite directions. ${a} averages ${r1} km/h. After ${t} hours they are ${d} km apart. Find ${b}'s speed.`, answer, distractors: wrong(answer, [d / t, d / t + r1, Math.abs(d / t - 2 * r1)].map(speed)), solution: `${math(`(${r1} + r)t = ${d}`)}, so ${math(`r = ${d}/${t} - ${r1} = ${r2}`)} km/h.` };
    },
  },
  {
    id: 'opposite-speeds-difference', scenario: 'opposite', unknown: 'speed', givens: 'difference',
    build(rng) {
      const [a, b] = rng.shuffle(NAMES).slice(0, 2), slow = rng.int(5, 10) * 5, diff = rng.int(1, 5) * 5, fast = slow + diff, t = rng.int(2, 5), d = (slow + fast) * t;
      const answer = `${speed(slow)} and ${speed(fast)}`;
      return { body: `${a} and ${b} travel in opposite directions for ${t} hours and end ${d} km apart. One travels ${diff} km/h faster. Find both speeds.`, answer, distractors: wrong(answer, [`${speed(slow - 5)} and ${speed(fast + 5)}`, `${speed(slow)} and ${speed(fast + diff)}`, `${speed(d / (2 * t))} each`]), solution: `Let the slower speed be ${math('r')}. Then ${math(`${t}r + ${t}(r + ${diff}) = ${d}`)}, giving ${math(`r = ${slow}`)} and ${math(`r + ${diff} = ${fast}`)}.` };
    },
  },
  {
    id: 'catch-time-direct', scenario: 'catch', unknown: 'time', givens: 'direct',
    build(rng) {
      for (;;) {
        const [a, b] = rng.shuffle(NAMES).slice(0, 2), slow = rng.int(5, 10) * 5, head = rng.int(1, 3), fast = slow + rng.int(2, 6) * 5, t = slow * head / (fast - slow);
        if (!Number.isInteger(t * 2)) continue;
        const answer = hours(t);
        return { body: `${a} leaves at ${slow} km/h. ${head} hour${head === 1 ? '' : 's'} later, ${b} follows at ${fast} km/h. How long after leaving will ${b} take to catch ${a}?`, answer, distractors: wrong(answer, [t + head, slow * head / fast, fast * head / (fast - slow)].map(hours)), solution: `${math(`${fast}t = ${slow}(t + ${head})`)}, so ${math(`t = ${decimal(t)}`)} hours.` };
      }
    },
  },
  {
    id: 'catch-time-difference', scenario: 'catch', unknown: 'time', givens: 'difference',
    build(rng) {
      for (;;) {
        const [a, b] = rng.shuffle(NAMES).slice(0, 2), slow = rng.int(5, 10) * 5, head = rng.int(1, 3), diff = rng.int(2, 6) * 5, t = slow * head / diff;
        if (!Number.isInteger(t * 2)) continue;
        const answer = hours(t);
        return { body: `${a} travels at ${slow} km/h. ${b} leaves ${head} hour${head === 1 ? '' : 's'} later and travels ${diff} km/h faster. How long after leaving will ${b} take to catch ${a}?`, answer, distractors: wrong(answer, [slow * head / (slow + diff), t + head, slow / diff].map(hours)), solution: `${b} gains at ${diff} km/h and must make up ${slow * head} km, so ${math(`t = ${slow * head}/${diff} = ${decimal(t)}`)} hours.` };
      }
    },
  },
  {
    id: 'catch-speed-direct', scenario: 'catch', unknown: 'speed', givens: 'direct',
    build(rng) {
      for (;;) {
        const [a, b] = rng.shuffle(NAMES).slice(0, 2), slow = rng.int(5, 10) * 5, head = rng.int(1, 3), t = rng.int(2, 6), diff = slow * head / t;
        if (!Number.isInteger(diff)) continue;
        const fast = slow + diff, answer = speed(fast);
        return { body: `${a} travels at ${slow} km/h. ${b} leaves ${head} hour${head === 1 ? '' : 's'} later and catches ${a} after ${t} hours. How fast was ${b} travelling?`, answer, distractors: wrong(answer, [diff, slow * head / (t + head), slow + head * t].map(speed)), solution: `${math(`rt = ${slow}(t + ${head})`)}, so ${math(`r = ${slow}(${t + head})/${t} = ${fast}`)} km/h.` };
      }
    },
  },
  {
    id: 'catch-speeds-difference', scenario: 'catch', unknown: 'speed', givens: 'difference',
    build(rng) {
      for (;;) {
        const [a, b] = rng.shuffle(NAMES).slice(0, 2), head = rng.int(1, 3), t = rng.int(2, 6), diff = rng.int(2, 6) * 5, slow = diff * t / head;
        if (!Number.isInteger(slow) || slow > 120) continue;
        const fast = slow + diff, answer = `${speed(slow)} and ${speed(fast)}`;
        return { body: `${b} leaves ${head} hour${head === 1 ? '' : 's'} after ${a}, catches ${a} ${t} hours later, and travels ${diff} km/h faster. Find both speeds.`, answer, distractors: wrong(answer, [`${speed(slow - diff)} and ${speed(slow)}`, `${speed(slow)} and ${speed(fast + diff)}`, `${speed(diff)} and ${speed(2 * diff)}`]), solution: `If ${a}'s speed is ${math('r')}, then ${math(`(r + ${diff})${t} = r(${t} + ${head})`)}, so ${math(`r = ${slow}`)} and ${b}'s speed is ${math(String(fast))} km/h.` };
      }
    },
  },
  {
    id: 'round-time-direct', scenario: 'round', unknown: 'time', givens: 'direct',
    build(rng) {
      const name = rng.pick(NAMES), out = rng.int(4, 10) * 5, back = rng.int(5, 12) * 5, d = out * back / gcd(out, back), total = d / out + d / back, answer = hours(total);
      return { body: `${name} goes ${d} km to a destination at ${out} km/h and returns the same distance at ${back} km/h. How long does the entire trip take?`, answer, distractors: wrong(answer, [2 * d / ((out + back) / 2), d / out, d / back].map(hours)), solution: `Add the two travel times: ${math(`${d}/${out} + ${d}/${back} = ${decimal(total)}`)} hours.` };
    },
  },
  {
    id: 'round-speed-direct', scenario: 'round', unknown: 'speed', givens: 'direct',
    build(rng) {
      const name = rng.pick(NAMES), d = rng.int(6, 20) * 10, t = rng.int(2, 6), r = d / t, answer = speed(r);
      return { body: `The outward leg of ${name}'s ${d} km round trip takes ${t} hours. What was the average speed on that leg?`, answer, distractors: wrong(answer, [2 * d / t, d / (2 * t), d - t].map(speed)), solution: `${math(`r = d/t = ${d}/${t} = ${decimal(r)}`)} km/h.` };
    },
  },
  {
    id: 'round-time-difference', scenario: 'round', unknown: 'time', givens: 'difference',
    build(rng) {
      const name = rng.pick(NAMES), slow = rng.int(4, 9) * 5, fast = slow + rng.int(1, 5) * 5, d = slow * fast / gcd(slow, fast), tSlow = d / slow, tFast = d / fast, diff = tSlow - tFast, answer = hours(tSlow);
      return { body: `${name} covers ${d} km each way. The return trip at ${fast} km/h takes ${decimal(diff)} hours less than the outward trip. How long does the outward trip take?`, answer, distractors: wrong(answer, [tFast, diff, tSlow + tFast].map(hours)), solution: `The return trip takes ${math(`${d}/${fast} = ${decimal(tFast)}`)} hours, so the outward trip takes ${math(`${decimal(tFast)} + ${decimal(diff)} = ${decimal(tSlow)}`)} hours.` };
    },
  },
  {
    id: 'round-speed-difference', scenario: 'round', unknown: 'speed', givens: 'difference',
    build(rng) {
      const name = rng.pick(NAMES), slow = rng.int(4, 9) * 5, fast = slow + rng.int(1, 5) * 5, d = slow * fast / gcd(slow, fast), diff = d / slow - d / fast, answer = speed(slow);
      return { body: `${name}'s ${d} km outward trip takes ${decimal(diff)} hours longer than the return trip, which is travelled at ${fast} km/h. Find the outward speed.`, answer, distractors: wrong(answer, [fast - diff, fast + diff, d / diff].map(speed)), solution: `${math(`${d}/r - ${d}/${fast} = ${decimal(diff)}`)}, which gives ${math(`r = ${slow}`)} km/h.` };
    },
  },
  {
    id: 'current-speed-direct', scenario: 'current', unknown: 'speed', givens: 'direct',
    build(rng) {
      for (;;) {
        const name = rng.pick(NAMES), r = rng.int(8, 30), c = rng.int(2, 6), up = r - c, down = r + c, d = up * down / gcd(up, down), total = d / up + d / down;
        if (!Number.isInteger(total * 4)) continue;
        const answer = speed(r);
        return { body: `${name}'s boat travels ${d} km upstream and ${d} km downstream in ${decimal(total)} hours. The current is ${c} km/h. Find the boat's speed in still water.`, answer, distractors: wrong(answer, [r + c, r - c, 2 * d / total].map(speed)), solution: `${math(`${d}/(r - ${c}) + ${d}/(r + ${c}) = ${decimal(total)}`)}, which gives ${math(`r = ${r}`)} km/h.` };
      }
    },
  },
  {
    id: 'current-time-direct', scenario: 'current', unknown: 'time', givens: 'direct',
    build(rng) {
      const name = rng.pick(NAMES), r = rng.int(10, 25), c = rng.int(2, Math.min(6, r - 2)), d = (r - c) * (r + c) / gcd(r - c, r + c), total = d / (r - c) + d / (r + c), answer = hours(total);
      return { body: `${name}'s boat moves at ${r} km/h in still water and the current is ${c} km/h. How long will a ${d} km upstream-and-back trip take?`, answer, distractors: wrong(answer, [2 * d / r, d / (r - c), d / (r + c)].map(hours)), solution: `Upstream and downstream speeds are ${r - c} and ${r + c} km/h, so the time is ${math(`${d}/${r - c} + ${d}/${r + c} = ${decimal(total)}`)} hours.` };
    },
  },
  {
    id: 'current-time-difference', scenario: 'current', unknown: 'time', givens: 'difference',
    build(rng) {
      const name = rng.pick(NAMES), r = rng.int(10, 25), c = rng.int(2, Math.min(6, r - 2)), d = (r - c) * (r + c) / gcd(r - c, r + c), up = d / (r - c), down = d / (r + c), diff = up - down, answer = hours(up + down);
      return { body: `${name}'s upstream leg takes ${decimal(diff)} hours longer than the downstream leg, which takes ${decimal(down)} hours. How long is the complete round trip?`, answer, distractors: wrong(answer, [up, down, diff].map(hours)), solution: `The upstream time is ${math(`${decimal(down)} + ${decimal(diff)} = ${decimal(up)}`)}, so the total is ${math(`${decimal(up)} + ${decimal(down)} = ${decimal(up + down)}`)} hours.` };
    },
  },
  {
    id: 'current-speed-difference', scenario: 'current', unknown: 'speed', givens: 'difference',
    build(rng) {
      const name = rng.pick(NAMES), r = rng.int(10, 25), c = rng.int(2, Math.min(6, r - 2)), d = (r - c) * (r + c) / gcd(r - c, r + c), diff = d / (r - c) - d / (r + c), answer = speed(r);
      return { body: `${name}'s boat travels ${d} km upstream and ${d} km downstream. The upstream leg takes ${decimal(diff)} hours longer, and the current is ${c} km/h. Find the boat's speed in still water.`, answer, distractors: wrong(answer, [r - c, r + c, d / diff].map(speed)), solution: `${math(`${d}/(r - ${c}) - ${d}/(r + ${c}) = ${decimal(diff)}`)}, which gives ${math(`r = ${r}`)} km/h.` };
    },
  },
];

export function buildTravelProblem(rng: Rng, scenarios: TravelScenario[], unknown: TravelUnknown, givens: TravelGivens): FamilyProblem {
  let pool = TRAVEL_FAMILIES.filter((f) => scenarios.includes(f.scenario) && (unknown === 'either' || f.unknown === unknown) && (givens === 'either' || f.givens === givens));
  if (!pool.length) pool = TRAVEL_FAMILIES.filter((f) => scenarios.includes(f.scenario) && (unknown === 'either' || f.unknown === unknown));
  if (!pool.length) pool = TRAVEL_FAMILIES.filter((f) => scenarios.includes(f.scenario));
  const family = rng.pick(pool);
  return { family: family.id, problem: family.build(rng) };
}

export type WorkScenario = 'together' | 'alone' | 'delayed' | 'fill-drain';
export type WorkContext = 'people' | 'machines' | 'pipes';

const workTime = (q: Q) => `${math(q.typst())} hour${q.eq(1) ? '' : 's'}`;

export function buildWorkProblem(rng: Rng, scenarios: WorkScenario[], contexts: WorkContext[]): FamilyProblem {
  const scenario = rng.pick(scenarios);
  const requestedContext = rng.pick(contexts);
  const context: WorkContext = scenario === 'fill-drain' ? 'pipes' : requestedContext;
  const ta = rng.int(2, 12);
  let tb = rng.int(2, 12); while (tb === ta) tb = rng.int(2, 12);
  const together = new Q(ta * tb, ta + tb);

  const actors = context === 'people'
    ? (() => { const [a, b] = rng.shuffle(NAMES).slice(0, 2); return { a, b, job: rng.pick(['paint a fence', 'mow a lawn', 'clean a gym', 'sort a shipment']) }; })()
    : context === 'machines'
      ? (() => {
          const [a, b] = rng.pick([
            ['Printer A', 'Printer B'], ['Machine A', 'Machine B'], ['Server A', 'Server B'], ['Packaging line A', 'Packaging line B'],
          ] as const);
          return { a, b, job: rng.pick(['package an order', 'print a batch of posters', 'process a data set', 'assemble a shipment', 'complete a production run']) };
        })()
      : (() => {
          const [a, b, job] = rng.pick([
            ['Pipe A', 'Pipe B', 'fill a storage tank'], ['Pump A', 'Pump B', 'fill a reservoir'], ['Hose A', 'Hose B', 'fill a swimming pool'], ['Inlet A', 'Inlet B', 'fill a cistern'],
          ] as const);
          return { a, b, job };
        })();

  if (scenario === 'together') {
    const answer = workTime(together);
    return { family: `together-${context}`, problem: {
      body: `${actors.a} can ${actors.job} in ${ta} hours and ${actors.b} can do it in ${tb} hours. How long will they take working together?`,
      answer,
      distractors: wrong(answer, [new Q(ta + tb, 2), new Q(ta + tb), new Q(ta * tb, Math.abs(ta - tb) || 1)].map(workTime)),
      solution: `Their rates add: ${math(`1/${ta} + 1/${tb} = 1/t`)}, so ${math(`t = (${ta} dot ${tb})/(${ta} + ${tb}) = ${together.typst()}`)} hours.`,
    } };
  }

  if (scenario === 'alone') {
    const answer = workTime(new Q(tb));
    return { family: `alone-${context}`, problem: {
      body: `Together, ${actors.a} and ${actors.b} can ${actors.job} in ${workTime(together)}. ${actors.a} alone takes ${ta} hours. How long would ${actors.b} take alone?`,
      answer,
      distractors: wrong(answer, [together.add(ta), new Q(ta).sub(together).abs(), new Q(ta * 2)].map(workTime)),
      solution: `${math(`1/${ta} + 1/t = 1/(${together.typst()})`)}, which gives ${math(`t = ${tb}`)} hours.`,
    } };
  }

  if (scenario === 'fill-drain') {
    const vessel = rng.pick(['storage tank', 'reservoir', 'swimming pool', 'cistern', 'water trough']);
    const fill = rng.int(3, 10), drain = fill + rng.int(2, 8), net = new Q(fill * drain, drain - fill), answer = workTime(net);
    return { family: 'fill-and-drain', problem: {
      body: `An inlet can fill a ${vessel} in ${fill} hours. A drain can empty it in ${drain} hours. If both are open, how long will it take to fill the empty ${vessel}?`,
      answer,
      distractors: wrong(answer, [new Q(fill * drain, fill + drain), new Q(fill + drain), new Q(drain - fill)].map(workTime)),
      solution: `The net rate is ${math(`1/${fill} - 1/${drain} = 1/t`)}, so ${math(`t = ${net.typst()}`)} hours.`,
    } };
  }

  const first = rng.int(1, Math.max(1, ta - 1));
  const rest = new Q(1).sub(new Q(first, ta)).div(new Q(1, ta).add(new Q(1, tb)));
  const answer = workTime(rest);
  return { family: `delayed-${context}`, problem: {
    body: `${actors.a} can ${actors.job} in ${ta} hours and begins alone. After ${first} hour${first === 1 ? '' : 's'}, ${actors.b}, who could do the whole job in ${tb} hours, joins. How much longer will they need?`,
    answer,
    distractors: wrong(answer, [together, together.add(first), new Q(ta - first)].map(workTime)),
    solution: `${actors.a} completes ${math(`${first}/${ta}`)} alone. The remaining work takes ${math(`(1 - ${first}/${ta}) div (1/${ta} + 1/${tb}) = ${rest.typst()}`)} hours.`,
  } };
}
