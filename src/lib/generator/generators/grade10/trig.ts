import type { Rng } from '../../rng.ts';
import type { GenOptions } from '../../types.ts';
import { frac } from '../../format.ts';
import { math, mb10i } from '../pc40s/common.ts';
import { optNum, optOne, radioOption, sizeOption } from '../../options.ts';
import { article, dec, distinct, rightTriangle } from './shared.ts';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const TRIPLES: Array<[number, number, number]> = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41]];
const LETTERS = [['A', 'B', 'C'], ['P', 'Q', 'R'], ['D', 'E', 'F'], ['X', 'Y', 'Z']];

/** Vertex names with the right angle at the third letter. */
function names(rng: Rng, o?: GenOptions) {
  const [A, B, C] = optOne(o, 'letters', 'any') === 'ABC' ? LETTERS[0] : rng.pick(LETTERS);
  return { A, B, C };
}

export const trigLabelSides = mb10i('10i-trig-label-sides', {
  points: 1,
  levels: { 1: 'Name the hypotenuse', 2: 'Opposite or adjacent to an angle', 3: 'Opposite or adjacent, either acute angle' },
  options: [
    radioOption('form', 'Ask for', [['1', 'Name the hypotenuse'], ['2', 'Opposite or adjacent to an angle'], ['3', 'Opposite or adjacent, either acute angle']], ['1', '2', '3']),
    radioOption('letters', 'Vertex letters', [['ABC', 'A, B, C'], ['any', 'Any letters']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const { A, B, C } = names(rng, o);
    const flip = rng.next() < 0.5;
    const diagram = rightTriangle(rng.int(3, 6), rng.int(4, 8), { A, B, C }, flip);
    // a = BC (opposite A), b = AC (adjacent to A), c = AB (hypotenuse)
    const sides = { hyp: `${A} ${B}`, oppA: `${B} ${C}`, adjA: `${A} ${C}` };
    if (difficulty === 1) {
      return {
        body: `Which side is the hypotenuse of right triangle ${math(`${A} ${B} ${C}`)}?\n\n${diagram}`,
        answer: math(sides.hyp),
        distractors: [sides.oppA, sides.adjA, `${C} ${A} ${B}`].map(math),
        solution: `The hypotenuse is opposite the right angle at ${math(C)}: ${math(sides.hyp)}.`,
      };
    }
    const at = difficulty === 2 ? A : rng.pick([A, B]);
    const want = rng.pick(['opposite', 'adjacent'] as const);
    const answer = at === A ? (want === 'opposite' ? sides.oppA : sides.adjA) : want === 'opposite' ? sides.adjA : sides.oppA;
    const other = answer === sides.oppA ? sides.adjA : sides.oppA;
    return {
      body: `In right triangle ${math(`${A} ${B} ${C}`)}, which side is ${want} to ${math(`angle ${at}`)}?\n\n${diagram}`,
      answer: math(answer),
      distractors: [other, sides.hyp, `${at} ${C} ${at === A ? B : A}`].map(math),
      solution: `The ${want} side ${want === 'opposite' ? `is across from ${math(`angle ${at}`)}` : `touches ${math(`angle ${at}`)} and is not the hypotenuse`}: ${math(answer)}.`,
    };
  },
});

export const trigRatio = mb10i('10i-trig-ratio', {
  points: 1,
  levels: { 1: 'From a labelled triangle', 2: 'For either acute angle', 3: 'Find the missing side first' },
  options: [
    radioOption('form', 'Triangle', [['1', 'From a labelled triangle'], ['2', 'For either acute angle'], ['3', 'Find the missing side first']], ['1', '2', '3']),
    radioOption('fn', 'Ratio', [['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['any', 'Any']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const [p, q, h] = rng.pick(TRIPLES.slice(0, 4));
    const k = rng.pick([1, 1, 2]);
    const a = p * k, b = q * k, c = h * k;
    const { A, B, C } = names(rng);
    const at = difficulty === 1 ? A : rng.pick([A, B]);
    const fnOpt = optOne(o, 'fn', 'any');
    const fn = fnOpt === 'any' ? rng.pick(['sin', 'cos', 'tan'] as const) : fnOpt as 'sin' | 'cos' | 'tan';
    const opp = at === A ? a : b, adj = at === A ? b : a;
    const ratio = { sin: [opp, c], cos: [adj, c], tan: [opp, adj] }[fn];
    const hide = difficulty === 3 ? rng.pick(['a', 'b', 'c'] as const) : null;
    const labels = { A, B, C, a: hide === 'a' ? '' : String(a), b: hide === 'b' ? '' : String(b), c: hide === 'c' ? '' : String(c) };
    const f = (n: number, d: number) => frac(n, d);
    const answer = f(ratio[0], ratio[1]);
    const raw = `${ratio[0]}/${ratio[1]}`;
    return {
      body: `Write ${math(`${fn} ${at}`)} as a fraction.\n\n${rightTriangle(a, b, labels, rng.next() < 0.5)}`,
      answer: math(answer),
      distractors: distinct(math(answer), [f(ratio[1], ratio[0]), f(fn === 'tan' ? adj : fn === 'sin' ? adj : opp, fn === 'tan' ? opp : c), f(fn === 'sin' ? opp : adj, fn === 'tan' ? c : fn === 'sin' ? adj : opp), f(opp, adj + 1)].map(math)),
      solution: `${hide ? `First find the missing side: ${math(hide === 'c' ? `sqrt(${a}^2 + ${b}^2) = ${c}` : `sqrt(${c}^2 - ${hide === 'a' ? b : a}^2) = ${hide === 'a' ? a : b}`)}. ` : ''}${math(`${fn} ${at} = "${fn === 'sin' ? 'opposite' : fn === 'cos' ? 'adjacent' : 'opposite'}"/"${fn === 'tan' ? 'adjacent' : 'hypotenuse'}" = ${raw}${raw === answer ? '' : ` = ${answer}`}`)}.`,
    };
  },
});

export const trigPythagorean = mb10i('10i-trig-pythagorean', {
  levels: { 1: 'Find the hypotenuse', 2: 'Find a leg', 3: 'A problem in context' },
  options: [
    radioOption('form', 'Find', [['1', 'Find the hypotenuse'], ['2', 'Find a leg'], ['3', 'A problem in context']], ['1', '2', '3']),
    sizeOption([10, 20, 40], [20, 20, 20], 'Largest side'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 20);
    const a = rng.int(3, N), b = rng.int(3, N);
    const c = Math.hypot(a, b);
    if (difficulty === 1) {
      return {
        body: `A right triangle has legs of ${a} cm and ${b} cm. Find the hypotenuse, to the nearest tenth.`,
        answer: `${dec(c, 1)} cm`,
        distractors: distinct(`${dec(c, 1)} cm`, [`${a + b} cm`, `${dec(Math.sqrt(Math.abs(a * a - b * b)), 1)} cm`, `${dec((a * a + b * b) / 2, 1)} cm`, `${dec(c + 1, 1)} cm`]),
        solution: `${math(`c = sqrt(${a}^2 + ${b}^2) = sqrt(${a * a + b * b}) approx ${dec(c, 1)}`)} cm.`,
      };
    }
    if (difficulty === 2) {
      const hyp = Math.max(a, b) + rng.int(1, 10), leg = Math.min(a, b);
      const x = Math.sqrt(hyp * hyp - leg * leg);
      return {
        body: `A right triangle has a hypotenuse of ${hyp} m and one leg of ${leg} m. Find the other leg, to the nearest tenth.`,
        answer: `${dec(x, 1)} m`,
        distractors: distinct(`${dec(x, 1)} m`, [`${dec(Math.hypot(hyp, leg), 1)} m`, `${hyp - leg} m`, `${dec(x + 1, 1)} m`]),
        solution: `${math(`b = sqrt(${hyp}^2 - ${leg}^2) = sqrt(${hyp * hyp - leg * leg}) approx ${dec(x, 1)}`)} m.`,
      };
    }
    const ladder = rng.int(12, Math.max(15, Math.round(N * 1.5))), foot = rng.int(3, Math.floor(ladder / 3));
    const top = Math.sqrt(ladder * ladder - foot * foot);
    return {
      body: rng.pick([
        `A ${ladder} ft ladder leans against a wall with its foot ${foot} ft from the wall. How high up the wall does it reach, to the nearest tenth?`,
        `A ${ladder} ft ladder rests against the side of a house, with its base ${foot} ft from the house. How high up the house does it reach, to the nearest tenth?`,
        `A painter leans a ${ladder} ft ladder against a wall, ${foot} ft out from the wall. How high does the top of the ladder reach, to the nearest tenth?`,
        `A firefighter places a ${ladder} ft ladder ${foot} ft from the base of a building. How high up the building does it reach, to the nearest tenth?`,
      ]),
      answer: `${dec(top, 1)} ft`,
      distractors: distinct(`${dec(top, 1)} ft`, [`${dec(Math.hypot(ladder, foot), 1)} ft`, `${ladder - foot} ft`, `${dec(top - 1, 1)} ft`]),
      solution: `The ladder is the hypotenuse: ${math(`h = sqrt(${ladder}^2 - ${foot}^2) approx ${dec(top, 1)}`)} ft.`,
    };
  },
});

export const trigSolveTriangle = mb10i('10i-trig-solve-triangle', {
  levels: { 1: 'Given an angle and a side', 2: 'Given two sides', 3: 'Given the hypotenuse and an angle' },
  options: [
    radioOption('form', 'Given', [['1', 'Given an angle and a side'], ['2', 'Given two sides'], ['3', 'Given the hypotenuse and an angle']], ['1', '2', '3']),
    sizeOption([15, 25, 40], [25, 25, 25], 'Largest given side'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const { A, B, C } = names(rng);
    const flip = rng.next() < 0.5;
    let angA: number, a: number, b: number, c: number, labels: Record<string, string>, given: string;
    if (difficulty === 2) {
      const N = optNum(o, 'size', 25);
      a = rng.int(4, Math.round(N * 0.8)); b = rng.int(4, Math.round(N * 0.8));
      c = Math.hypot(a, b); angA = deg(Math.atan(a / b));
      labels = { A, B, C, a: String(a), b: String(b) };
      given = `legs ${math(`${B} ${C} = ${a}`)} and ${math(`${A} ${C} = ${b}`)}`;
    } else {
      angA = rng.int(20, 70);
      if (difficulty === 1) { b = rng.int(5, optNum(o, 'size', 25)); a = b * Math.tan(rad(angA)); c = b / Math.cos(rad(angA)); labels = { A, B, C, b: String(b), angleA: `${angA}°` }; given = `${math(`angle ${A} = ${angA}°`)} and ${math(`${A} ${C} = ${b}`)}`; }
      else { c = rng.int(8, Math.round(optNum(o, 'size', 25) * 1.2)); a = c * Math.sin(rad(angA)); b = c * Math.cos(rad(angA)); labels = { A, B, C, c: String(c), angleA: `${angA}°` }; given = `${math(`angle ${A} = ${angA}°`)} and ${math(`${A} ${B} = ${c}`)}`; }
    }
    const angB = 90 - angA;
    const fmt = (x: number, y: number, z: number, p: number, q: number) => `${math(`${B} ${C} approx ${dec(x, 1)}`)}, ${math(`${A} ${C} approx ${dec(y, 1)}`)}, ${math(`${A} ${B} approx ${dec(z, 1)}`)}, ${math(`angle ${A} approx ${dec(p, 1)}°`)}, ${math(`angle ${B} approx ${dec(q, 1)}°`)}`;
    const answer = fmt(a, b, c, angA, angB);
    return {
      body: `Solve right triangle ${math(`${A} ${B} ${C}`)} (${math(`angle ${C} = 90°`)}), given ${given}. Round to the nearest tenth.\n\n${rightTriangle(difficulty === 2 ? a : Math.max(a, 0.3 * b), b, labels, flip)}`,
      answer,
      distractors: distinct(answer, [fmt(b, a, c, angB, angA), fmt(a, b, a + b, angA, angB), fmt(a * 1.1, b * 0.9, c, angA, 180 - angA), fmt(a, b, c, angA, 180 - angA)]),
      solution: difficulty === 2
        ? `${math(`${A} ${B} = sqrt(${a}^2 + ${b}^2) approx ${dec(c, 1)}`)}. ${math(`tan ${A} = ${a}/${b}`)}, so ${math(`angle ${A} approx ${dec(angA, 1)}°`)} and ${math(`angle ${B} approx ${dec(angB, 1)}°`)}.`
        : difficulty === 1
          ? `${math(`angle ${B} = 90° - ${angA}° = ${angB}°`)}. ${math(`${B} ${C} = ${b} tan ${angA}° approx ${dec(a, 1)}`)} and ${math(`${A} ${B} = ${b}/(cos ${angA}°) approx ${dec(c, 1)}`)}.`
          : `${math(`angle ${B} = ${angB}°`)}. ${math(`${B} ${C} = ${c} sin ${angA}° approx ${dec(a, 1)}`)} and ${math(`${A} ${C} = ${c} cos ${angA}° approx ${dec(b, 1)}`)}.`,
    };
  },
});

export const trigElevation = mb10i('10i-trig-elevation', {
  levels: { 1: 'Find a height from an angle of elevation', 2: 'Find a distance from an angle of depression', 3: 'Find the angle' },
  options: [
    radioOption('form', 'Find', [['1', 'Find a height from an angle of elevation'], ['2', 'Find a distance from an angle of depression'], ['3', 'Find the angle']], ['1', '2', '3']),
    sizeOption([50, 120, 200], [120, 120, 120], 'Largest distance'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const D = optNum(o, 'size', 120);
    const angle = rng.int(15, 70), d = rng.int(10, D);
    if (difficulty === 1) {
      const h = d * Math.tan(rad(angle));
      return {
        body: ((thing) => `From a point ${d} m from the base of ${thing}, the angle of elevation to the top is ${angle}°. How tall is it, to the nearest tenth of a metre?`)(
          rng.pick(['a building', 'a cell tower', ...(h <= 40 ? ['a tree', 'a statue', 'a water tower', 'a lighthouse'] : []), ...(h <= 20 ? ['a climbing wall'] : [])])),
        answer: `${dec(h, 1)} m`,
        distractors: distinct(`${dec(h, 1)} m`, [`${dec(d * Math.sin(rad(angle)), 1)} m`, `${dec(d / Math.tan(rad(angle)), 1)} m`, `${dec(d * Math.cos(rad(angle)), 1)} m`]),
        solution: `${math(`tan ${angle}° = h/${d}`)}, so ${math(`h = ${d} tan ${angle}° approx ${dec(h, 1)}`)} m.`,
      };
    }
    if (difficulty === 2) {
      const h = rng.int(20, Math.round(D * 1.25)), x = h / Math.tan(rad(angle));
      return {
        body: (([from, base, to]) => `From the top of ${from}, the angle of depression to ${to} is ${angle}°. How far is it from the base of the ${base}, to the nearest tenth?`)(
          rng.pick([[`a ${h} m cliff`, 'cliff', 'a boat'], [`a ${h} m lighthouse`, 'lighthouse', 'a sailboat'], [`a ${h} m apartment building`, 'building', 'a parked car'], [`a ${h} m fire lookout tower`, 'tower', 'a campsite'], [`a ${h} m bridge`, 'bridge', 'a canoe on the river below']])),
        answer: `${dec(x, 1)} m`,
        distractors: distinct(`${dec(x, 1)} m`, [`${dec(h * Math.tan(rad(angle)), 1)} m`, `${dec(h / Math.sin(rad(angle)), 1)} m`, `${dec(h * Math.cos(rad(angle)), 1)} m`]),
        solution: `The angle of depression equals the angle of elevation from the boat (alternate angles). ${math(`tan ${angle}° = ${h}/x`)}, so ${math(`x = ${h}/(tan ${angle}°) approx ${dec(x, 1)}`)} m.`,
      };
    }
    const h = rng.int(5, Math.round(D / 2)), shadow = rng.int(5, Math.round(D * 0.66));
    const a = deg(Math.atan(h / shadow));
    return {
      body: `${article(h).replace(/^a/, 'A')} ${h} m ${rng.pick(['building', ...(h <= 30 ? ['flagpole', 'tree', 'statue'] : []), ...(h <= 12 ? ['light pole'] : [])])} casts ${article(shadow)} ${shadow} m shadow. What is the angle of elevation of the sun, to the nearest tenth of a degree?`,
      answer: `${dec(a, 1)}°`,
      distractors: distinct(`${dec(a, 1)}°`, [`${dec(90 - a, 1)}°`, `${dec(deg(Math.asin(Math.min(1, h / Math.max(h, shadow)))), 1)}°`, `${dec(deg(Math.atan(shadow / h)) / 2, 1)}°`]),
      solution: `${math(`tan theta = ${h}/${shadow}`)}, so ${math(`theta = tan^(-1)(${h}/${shadow}) approx ${dec(a, 1)}°`)}.`,
    };
  },
});

export const trigTwoTriangles = mb10i('10i-trig-two-triangles', {
  levels: { 1: 'Two angles of elevation from one point', 2: 'Two observers on opposite sides', 3: 'Two observers on the same side' },
  options: [
    radioOption('form', 'Situation', [['1', 'Two angles of elevation from one point'], ['2', 'Two observers on opposite sides'], ['3', 'Two observers on the same side']], ['1', '2', '3']),
    sizeOption([50, 90, 150], [90, 90, 90], 'Largest height or distance'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      // A building with a flagpole on top, seen from one point.
      const d = rng.int(20, Math.round(optNum(o, 'size', 90) * 0.9)), a1 = rng.int(20, 45), a2 = a1 + rng.int(5, 15);
      const h1 = d * Math.tan(rad(a1)), h2 = d * Math.tan(rad(a2));
      return {
        body: (([pole, roof]) => `From a point ${d} m from ${roof}, the angle of elevation to the bottom of ${pole} on top is ${a1}° and to the top of it is ${a2}°. How tall is the ${pole.replace(/^an? /, '')}, to the nearest tenth?`)(
          rng.pick([['a flagpole', 'a building'], ['an antenna', 'an office tower'], ['a sign', 'a store'], ['a statue', 'a tall pedestal'], ['a spire', 'a church']])),
        answer: `${dec(h2 - h1, 1)} m`,
        distractors: distinct(`${dec(h2 - h1, 1)} m`, [`${dec(d * Math.tan(rad(a2 - a1)), 1)} m`, `${dec(h2, 1)} m`, `${dec(h1, 1)} m`]),
        solution: `Top: ${math(`${d} tan ${a2}° approx ${dec(h2, 2)}`)}. Bottom: ${math(`${d} tan ${a1}° approx ${dec(h1, 2)}`)}. The flagpole is the difference, ≈ ${dec(h2 - h1, 1)} m.`,
      };
    }
    const h = rng.int(20, optNum(o, 'size', 90)), a1 = rng.int(20, 50), a2 = rng.int(a1 + 5, 70);
    const x1 = h / Math.tan(rad(a1)), x2 = h / Math.tan(rad(a2));
    const answer = difficulty === 2 ? x1 + x2 : x1 - x2;
    return {
      body: `Two people are on ${difficulty === 2 ? 'opposite sides' : 'the same side'} of ${article(h)} ${h} m ${rng.pick(['tower', 'lighthouse', 'cell tower', 'monument', 'wind turbine'])}. The angles of elevation from them to the top are ${a1}° and ${a2}°. How far apart are they, to the nearest tenth?`,
      answer: `${dec(answer, 1)} m`,
      // Adding instead of subtracting (or the reverse), tan instead of 1/tan, or one distance only.
      distractors: distinct(`${dec(answer, 1)} m`, [`${dec(difficulty === 2 ? x1 - x2 : x1 + x2, 1)} m`, `${dec(Math.abs(h * Math.tan(rad(a1)) + (difficulty === 2 ? 1 : -1) * h * Math.tan(rad(a2))), 1)} m`, `${dec(x1, 1)} m`]),
      solution: `Distances to the base: ${math(`${h}/(tan ${a1}°) approx ${dec(x1, 2)}`)} and ${math(`${h}/(tan ${a2}°) approx ${dec(x2, 2)}`)}. ${difficulty === 2 ? 'Add' : 'Subtract'} them: ≈ ${dec(answer, 1)} m.`,
    };
  },
});

export const TRIG_10I = [trigLabelSides, trigRatio, trigPythagorean, trigSolveTriangle, trigElevation, trigTwoTriangles];
