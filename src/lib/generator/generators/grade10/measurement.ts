
import type { Rng } from '../../rng.ts';
import type { GenOptions } from '../../types.ts';
import { graphTypst } from '../../graph.ts';
import { gcd } from '../../format.ts';
import { math, mb10i } from '../pc40s/common.ts';
import { optNum, optOne, radioOption, sizeOption } from '../../options.ts';
import { dec, decGrouped, distinct, others } from './shared.ts';

// ── Linear measurement ────────────────────────────────────────────────────

const SI_UNITS: Array<[string, string]> = [
  ['the thickness of a dime', 'millimetre'], ['the width of a staple', 'millimetre'], ['the length of an ant', 'millimetre'],
  ['the length of a pencil', 'centimetre'], ['the width of a textbook', 'centimetre'], ['the length of a shoe', 'centimetre'],
  ['the height of a door', 'metre'], ['the length of a hockey rink', 'metre'], ['the depth of a swimming pool', 'metre'],
  ['the distance from Winnipeg to Brandon', 'kilometre'], ['the length of the Red River', 'kilometre'], ['the distance of a marathon', 'kilometre'],
];
const IMPERIAL_UNITS: Array<[string, string]> = [
  ['the length of a paper clip', 'inch'], ['the diameter of a hockey puck', 'inch'], ['the width of a phone screen', 'inch'],
  ['the height of a basketball player', 'foot'], ['the length of a canoe', 'foot'], ['the height of a ceiling', 'foot'],
  ['the length of a football field', 'yard'], ['the length of fabric for curtains', 'yard'], ['the width of a backyard', 'yard'],
  ['the distance between two towns', 'mile'], ['the length of a highway', 'mile'], ['the distance flown by a plane', 'mile'],
];
const REFERENTS: Array<[string, string]> = [
  ['1 millimetre', 'the thickness of a dime'], ['1 centimetre', 'the width of a fingernail'], ['1 metre', 'the height of a doorknob from the floor'],
  ['1 kilometre', 'the distance walked in about 12 minutes'], ['1 inch', 'the width of a thumb at the knuckle'], ['1 foot', 'the length of a standard ruler'],
  ['1 yard', 'the length of a long stride'], ['1 mile', 'the distance walked in about 20 minutes'],
];

const UNIT_OPTION = radioOption('units', 'Units', [['si', 'SI'], ['imperial', 'Imperial'], ['any', 'Either']], ['any', 'any', 'any']);
/** A unit from the pool, limited to SI or imperial by the option. */
function unitFor(rng: Rng, o: GenOptions | undefined, pool: string[]): string {
  const system = optOne(o, 'units', 'any');
  const allowed = system === 'any' ? pool : pool.filter((u) => (['in', 'ft', 'yd'].includes(u)) === (system === 'imperial'));
  return rng.pick(allowed.length ? allowed : system === 'imperial' ? ['in', 'ft'] : ['cm', 'm']);
}

export const measReferent = mb10i('10i-meas-referent', {
  points: 1,
  levels: { 1: 'Best SI unit', 2: 'Best imperial unit', 3: 'Referents' },
  options: [
    radioOption('form', 'Question', [['1', 'Best SI unit'], ['2', 'Best imperial unit'], ['3', 'Referents']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const [unit, referent] = rng.pick(REFERENTS);
      return {
        body: `Which referent is closest to ${unit}?`,
        answer: referent,
        distractors: others(rng, REFERENTS.map(([, r]) => r), referent),
        solution: `A useful referent for ${unit} is ${referent}.`,
      };
    }
    const pool = difficulty === 1 ? SI_UNITS : IMPERIAL_UNITS;
    const [thing, unit] = rng.pick(pool);
    const units = [...new Set(pool.map(([, u]) => u))];
    return {
      body: `Which ${difficulty === 1 ? 'SI' : 'imperial'} unit is most appropriate to measure ${thing}?`,
      answer: `${unit}`,
      distractors: units.filter((u) => u !== unit),
      solution: `${thing[0].toUpperCase()}${thing.slice(1)} is best measured in ${unit}s: smaller units give very large numbers, and larger units give tiny fractions.`,
    };
  },
});

const ftIn = (inches: number) => {
  const ft = Math.floor(inches / 12), inch = inches % 12;
  return ft && inch ? `${ft} ft ${inch} in` : ft ? `${ft} ft` : `${inch} in`;
};

export const measFeetInches = mb10i('10i-meas-feet-inches', {
  levels: { 1: 'Add lengths', 2: 'Subtract lengths', 3: 'Multiply a length' },
  options: [
    radioOption('form', 'Operation', [['1', 'Add lengths'], ['2', 'Subtract lengths'], ['3', 'Multiply a length']], ['1', '2', '3']),
    sizeOption([5, 9, 15], [9, 9, 9], 'Largest length (ft)'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const F = optNum(o, 'size', 9);
    const a = rng.int(3, F) * 12 + rng.int(1, 11), b = rng.int(1, Math.max(2, F - 4)) * 12 + rng.int(1, 11);
    if (difficulty === 1) {
      const total = a + b, raw = `${Math.floor(a / 12) + Math.floor(b / 12)} ft ${(a % 12) + (b % 12)} in`;
      return {
        body: `A board is ${ftIn(a)} long and another is ${ftIn(b)} long. What is their total length laid end to end?`,
        answer: ftIn(total),
        distractors: distinct(ftIn(total), [raw, ftIn(total + 12), ftIn(total - 10 > 0 ? total - 2 : total + 2), `${dec(total / 12, 1)} ft`]),
        solution: `Add feet and inches separately: ${raw}. Since 12 in = 1 ft, this is ${ftIn(total)}.`,
      };
    }
    if (difficulty === 2) {
      const [big, small] = a > b ? [a, b] : [b, a];
      const diff = big - small;
      const noBorrow = `${Math.floor(big / 12) - Math.floor(small / 12)} ft ${Math.abs((big % 12) - (small % 12))} in`;
      return {
        body: `A ${ftIn(small)} piece is cut from a ${ftIn(big)} pipe. How long is the remaining piece?`,
        answer: ftIn(diff),
        distractors: distinct(ftIn(diff), [noBorrow, ftIn(diff + 2), ftIn(diff + 12), ftIn(Math.max(1, diff - 12))]),
        solution: `Rewrite in inches: ${big} in − ${small} in = ${diff} in, which is ${ftIn(diff)}.${big % 12 < small % 12 ? ' (Or borrow 1 ft = 12 in before subtracting the inches.)' : ''}`,
      };
    }
    const n = rng.int(3, 7), piece = rng.int(1, 4) * 12 + rng.int(1, 11);
    const total = n * piece;
    return {
      body: `A shelf unit needs ${n} boards, each ${ftIn(piece)} long. What total length of board is needed?`,
      answer: ftIn(total),
      distractors: distinct(ftIn(total), [`${n * Math.floor(piece / 12)} ft ${n * (piece % 12)} in`, ftIn(total - (piece % 12)), ftIn(n * Math.floor(piece / 12) * 12 + (piece % 12)), ftIn(total + 12)]),
      solution: `${ftIn(piece)} = ${piece} in, and ${n} × ${piece} in = ${total} in = ${ftIn(total)}.`,
    };
  },
});

/** A ruler from 0 to `length` units, with an object from `start` to `end`. */
function ruler(length: number, sub: number, start: number, end: number, unit: string): string {
  const curves = [];
  for (let i = 0; i <= length * sub; i++) {
    const x = i / sub;
    const h = i % sub === 0 ? 1.4 : sub >= 8 && i % (sub / 2) === 0 ? 1.05 : sub >= 8 && i % (sub / 4) === 0 ? 0.8 : sub === 10 && i % 5 === 0 ? 1 : 0.55;
    curves.push({ points: [[x, 0], [x, h]] as Array<[number, number]> });
  }
  curves.push({ points: [[0, 0], [length, 0]] as Array<[number, number]> });
  // The object: a bar above the ruler.
  curves.push({ points: [[start, 2], [end, 2], [end, 2.6], [start, 2.6], [start, 2]] as Array<[number, number]> });
  const labels = Array.from({ length: length + 1 }, (_, i) => ({ x: i, y: -0.55, text: String(i) }));
  labels.push({ x: length + 0.35, y: 0.9, text: `"${unit}"` });
  return graphTypst({
    xMin: -0.3, xMax: length + 0.7, yMin: -1.2, yMax: 3, width: length * 2.2 + 1, height: 2.4, grid: false, numbers: false, axes: false,
    curves, labels,
  });
}

/** 2 3/8 as Typst math. */
function mixed(whole: number, n: number, d: number): string {
  const g = gcd(n, d) || 1;
  if (n === 0) return String(whole);
  return whole ? `${whole} ${n / g}/${d / g}` : `${n / g}/${d / g}`;
}

export const measReadRuler = mb10i('10i-meas-read-ruler', {
  points: 1,
  levels: { 1: 'Centimetres and millimetres', 2: 'Inches to the nearest eighth', 3: 'Inches to the sixteenth, not starting at 0' },
  options: [
    radioOption('form', 'Ruler', [['1', 'Centimetres and millimetres'], ['2', 'Inches to the nearest eighth'], ['3', 'Inches to the sixteenth, not starting at 0']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const end = rng.int(12, 58) / 10;
      const answer = `${dec(end, 1)} "cm"`;
      return {
        body: `How long is the bar, to the nearest millimetre?\n\n${ruler(6, 10, 0, end, 'cm')}`,
        answer: math(answer),
        distractors: [`${dec(end + 0.1, 1)} "cm"`, `${dec(end - 0.1, 1)} "cm"`, `${Math.round(end * 10)} "cm"`, `${Math.floor(end)}.${Math.round(end * 10) % 10 + 1} "mm"`].map(math),
        solution: `The bar ends ${Math.round(end * 10) % 10} small marks (millimetres) past ${Math.floor(end)} cm: ${math(answer)} = ${Math.round(end * 10)} mm.`,
      };
    }
    const sub = difficulty === 2 ? 8 : 16;
    const len = rng.int(3 * sub, 5 * sub) / sub, start = difficulty === 3 ? rng.int(1, sub - 1) / sub : 0;
    const whole = Math.floor(len), n = Math.round((len - whole) * sub);
    const answerText = mixed(whole, n, sub) + ' "in"';
    const wrong = (k: number) => { const v = Math.round(len * sub) + k; return mixed(Math.floor(v / sub), v % sub, sub) + ' "in"'; };
    const end = start + len;
    const endText = mixed(Math.floor(end), Math.round((end - Math.floor(end)) * sub), sub);
    return {
      body: `How long is the bar, to the nearest ${sub === 8 ? 'eighth' : 'sixteenth'} of an inch?\n\n${ruler(Math.ceil(end + 0.2), sub, start, end, 'in')}`,
      answer: math(answerText),
      distractors: distinct(math(answerText), [wrong(1), wrong(-1), wrong(sub === 8 ? 2 : 4), start ? `${endText} "in"` : wrong(-2)].map(math)),
      solution: difficulty === 3
        ? `The bar runs from ${math(mixed(0, Math.round(start * sub), sub))} in to ${math(endText)} in, so its length is the difference: ${math(answerText)}.`
        : `Each inch is split into ${sub} parts. The bar ends ${n} parts past ${whole} in: ${math(answerText)}.`,
    };
  },
});

export const measPerimeter = mb10i('10i-meas-perimeter', {
  levels: { 1: 'Rectangles in feet and inches', 2: 'Circumference', 3: 'Composite shapes and cost' },
  options: [
    radioOption('form', 'Shape', [['1', 'Rectangles in feet and inches'], ['2', 'Circumference'], ['3', 'Composite shapes and cost']], ['1', '2', '3']),
    sizeOption([20, 40, 60], [40, 40, 40], 'Largest dimension'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const l = rng.int(6, Math.round(optNum(o, 'size', 40) / 2)), w = rng.int(3, l - 1), li = rng.int(1, 11), wi = rng.int(1, 11);
      const total = 2 * (l * 12 + li + w * 12 + wi);
      return {
        body: `A rectangular garden is ${l} ft ${li} in by ${w} ft ${wi} in. How much edging is needed to go around it?`,
        answer: ftIn(total),
        distractors: distinct(ftIn(total), [ftIn(total / 2), `${2 * (l + w)} ft ${2 * (li + wi)} in`, ftIn(total + 12), ftIn(total - 12)]),
        solution: `${math('P = 2(l + w)')}: ${l} ft ${li} in + ${w} ft ${wi} in = ${ftIn(total / 2)}, doubled is ${ftIn(total)}.`,
      };
    }
    if (difficulty === 2) {
      const unit = rng.pick(['cm', 'in', 'm']);
      const useR = rng.next() < 0.5, v = rng.int(3, optNum(o, 'size', 40));
      const C = Math.PI * (useR ? 2 * v : v);
      return {
        body: `Find the circumference of a circle with a ${useR ? 'radius' : 'diameter'} of ${v} ${unit}, to the nearest tenth.`,
        answer: `${dec(C, 1)} ${unit}`,
        distractors: distinct(`${dec(C, 1)} ${unit}`, [`${dec(useR ? Math.PI * v : 2 * Math.PI * v, 1)} ${unit}`, `${dec(Math.PI * (useR ? v * v : (v / 2) ** 2), 1)} ${unit}`, `${dec(C + 1, 1)} ${unit}`]),
        solution: `${math(`C = pi d = pi (${useR ? 2 * v : v}) approx ${dec(C, 1)}`)} ${unit}.`,
      };
    }
    const l = rng.int(10, optNum(o, 'size', 40)), w = rng.int(6, Math.round(optNum(o, 'size', 40) / 2)) * 2, price = rng.pick([4.5, 6.25, 8, 12.75]);
    // A rectangle with a semicircle on one short side.
    const P = 2 * l + w + (Math.PI * w) / 2, cost = P * price;
    return {
      body: `A patio is a ${l} m by ${w} m rectangle with a semicircle on one ${w} m side. Edging costs \\$${price.toFixed(2)} per metre. What does edging the whole patio cost, to the nearest cent?`,
      answer: `\\$${cost.toFixed(2)}`,
      distractors: distinct(`\\$${cost.toFixed(2)}`, [`\\$${((2 * l + 2 * w + (Math.PI * w) / 2) * price).toFixed(2)}`, `\\$${((2 * l + w + Math.PI * w) * price).toFixed(2)}`, `\\$${((2 * l + 2 * w) * price).toFixed(2)}`]),
      solution: `The perimeter is two long sides, one short side, and half a circle: ${math(`2(${l}) + ${w} + 1/2 pi (${w}) approx ${dec(P, 2)}`)} m. Cost: ${dec(P, 2)} × \\$${price.toFixed(2)} ≈ \\$${cost.toFixed(2)}.`,
    };
  },
});

const SI: Array<[string, number]> = [['km', 100000], ['m', 100], ['cm', 1], ['mm', 0.1]];
export const measConvertSi = mb10i('10i-meas-convert-si', {
  points: 1,
  levels: { 1: 'One step (m ↔ cm, cm ↔ mm)', 2: 'Across several units', 3: 'Mixed units to one unit' },
  options: [
    radioOption('form', 'Conversion', [['1', 'One step (m ↔ cm, cm ↔ mm)'], ['2', 'Across several units'], ['3', 'Mixed units to one unit']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const m = rng.int(1, 9), cm = rng.int(1, 99), mm = rng.int(1, 9);
      const total = m * 1000 + cm * 10 + mm;
      return {
        body: `Write ${m} m ${cm} cm ${mm} mm in millimetres.`,
        answer: math(`${total} "mm"`),
        distractors: [`${m * 100 + cm * 10 + mm} "mm"`, `${m}${cm}${mm} "mm"`, `${m * 1000 + cm + mm} "mm"`, `${m * 1000 + cm * 100 + mm} "mm"`].map(math),
        solution: `${m} m = ${m * 1000} mm and ${cm} cm = ${cm * 10} mm, so the total is ${total} mm.`,
      };
    }
    const i = difficulty === 1 ? rng.int(1, 2) : 0;
    const j = difficulty === 1 ? i + 1 : rng.pick([2, 3]);
    const [from, to] = rng.next() < 0.5 ? [SI[i], SI[j]] : [SI[j], SI[i]];
    const value = rng.int(12, 950) / rng.pick([1, 10, 100]);
    const factor = from[1] / to[1];
    const v = (f: number) => math(`${decGrouped(value * f, 6)} "${to[0]}"`);
    return {
      body: `Convert ${math(`${dec(value, 3)} "${from[0]}"`)} to ${to[0] === 'm' ? 'metres' : to[0] === 'km' ? 'kilometres' : to[0] === 'cm' ? 'centimetres' : 'millimetres'}.`,
      answer: v(factor),
      distractors: distinct(v(factor), [v(1 / factor), v(factor * 10), v(factor / 10)]),
      solution: `1 ${factor > 1 ? from[0] : to[0]} = ${decGrouped(factor > 1 ? factor : 1 / factor)} ${factor > 1 ? to[0] : from[0]}, so ${factor > 1 ? 'multiply' : 'divide'} by ${decGrouped(factor > 1 ? factor : 1 / factor)}: ${v(factor)}.`,
    };
  },
});

export const measConvertImperial = mb10i('10i-meas-convert-imperial', {
  points: 1,
  levels: { 1: 'Feet and inches', 2: 'Yards, feet, inches, and miles', 3: 'Mixed units to one unit' },
  options: [
    radioOption('form', 'Units', [['1', 'Feet and inches'], ['2', 'Yards, feet, inches, and miles'], ['3', 'Mixed units to one unit']], ['1', '2', '3']),
    radioOption('dir', 'Direction', [['down', 'To the smaller unit'], ['up', 'To the larger unit'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const yd = rng.int(1, 9), ft = rng.int(1, 2), inch = rng.int(1, 11);
      const total = yd * 36 + ft * 12 + inch;
      return {
        body: `Write ${yd} yd ${ft} ft ${inch} in in inches.`,
        answer: `${total} in`,
        distractors: [`${yd * 12 + ft * 12 + inch} in`, `${yd * 3 + ft * 12 + inch} in`, `${yd * 36 + ft + inch} in`, `${yd * 36 + ft * 12} in`].filter((d) => d !== `${total} in`),
        solution: `1 yd = 36 in and 1 ft = 12 in: ${yd * 36} + ${ft * 12} + ${inch} = ${total} in.`,
      };
    }
    const pairs: Array<[string, string, number]> = difficulty === 1
      ? [['ft', 'in', 12]]
      : [['yd', 'ft', 3], ['yd', 'in', 36], ['mi', 'ft', 5280], ['mi', 'yd', 1760]];
    const [big, small, f] = rng.pick(pairs);
    const dir = optOne(o, 'dir', 'either');
    const toSmall = dir === 'either' ? rng.next() < 0.5 : dir === 'down';
    const nBig = toSmall ? rng.int(2, 12) + rng.pick([0, 0.5, 0.25]) : rng.int(2, 12);
    const nSmall = nBig * f;
    const [q, a, wrongF] = toSmall ? [`${dec(nBig)} ${big}`, nSmall, (k: number) => nBig * k] : [`${grp(nSmall)} ${small}`, nBig, (k: number) => nSmall / k];
    const unit = toSmall ? small : big;
    return {
      body: `Convert ${q} to ${unit}.`,
      answer: `${grp(a)} ${unit}`,
      distractors: distinct(`${grp(a)} ${unit}`, [toSmall ? `${grp(nBig / f)} ${unit}` : `${grp(nSmall * f)} ${unit}`, `${grp(wrongF(f === 12 ? 10 : f === 3 ? 12 : f === 36 ? 12 : f === 5280 ? 1760 : 5280))} ${unit}`, `${grp(wrongF(f * 2))} ${unit}`]),
      solution: `1 ${big} = ${grp(f)} ${small}, so ${toSmall ? `multiply by ${grp(f)}` : `divide by ${grp(f)}`}: ${grp(a)} ${unit}.`,
    };
  },
});
function grp(v: number): string {
  const text = dec(v, 3);
  const [w, f] = text.split('.');
  return (w.length > 4 ? w.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : w) + (f ? `.${f}` : '');
}

const BETWEEN: Array<[string, string, number, string]> = [
  ['in', 'cm', 2.54, '1 in = 2.54 cm'], ['ft', 'cm', 30.48, '1 ft = 30.48 cm'], ['yd', 'm', 0.9144, '1 yd = 0.9144 m'],
  ['ft', 'm', 0.3048, '1 ft = 0.3048 m'], ['mi', 'km', 1.609, '1 mi ≈ 1.609 km'],
];
export const measConvertBetween = mb10i('10i-meas-convert-between', {
  levels: { 1: 'Inches and centimetres', 2: 'Feet, yards, and metres', 3: 'Miles and kilometres' },
  options: [
    radioOption('form', 'Units', [['1', 'Inches and centimetres'], ['2', 'Feet, yards, and metres'], ['3', 'Miles and kilometres']], ['1', '2', '3']),
    radioOption('dir', 'Direction', [['si', 'Imperial to SI'], ['imperial', 'SI to imperial'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const choice = difficulty === 1 ? BETWEEN[0] : difficulty === 2 ? rng.pick(BETWEEN.slice(1, 4)) : BETWEEN[4];
    const [imp, si, f, fact] = choice;
    const dir = optOne(o, 'dir', 'either');
    const toSi = dir === 'either' ? rng.next() < 0.5 : dir === 'si';
    const value = difficulty === 3 ? rng.int(5, 300) : rng.int(3, 60) + (difficulty === 1 ? rng.pick([0, 0.5]) : 0);
    const [from, to] = toSi ? [imp, si] : [si, imp];
    const ans = toSi ? value * f : value / f, wrong = toSi ? value / f : value * f;
    const fmt = (v: number) => `${dec(v, 2)} ${to}`;
    return {
      body: `Convert ${dec(value)} ${from} to ${to}. Round to the nearest hundredth.`,
      answer: fmt(ans),
      distractors: distinct(fmt(ans), [fmt(wrong), fmt(ans * 10), fmt(toSi ? value * (f === 2.54 ? 2.2 : f * 1.1) : value / (f * 1.1)), fmt(ans / 10)]),
      solution: `${fact}. Set up a proportion: ${math(`x/${dec(value)} = ${toSi ? `${f}/1` : `1/${f}`}`)}, so ${math(`x approx ${dec(ans, 2)}`)} ${to}.`,
    };
  },
});

export const measConvertProblem = mb10i('10i-meas-convert-problem', {
  levels: { 1: 'Heights in feet and inches to centimetres', 2: 'Speeds and distances', 3: 'Rates with unit prices' },
  options: [
    radioOption('form', 'Context', [['1', 'Heights in feet and inches to centimetres'], ['2', 'Speeds and distances'], ['3', 'Rates with unit prices']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const ft = rng.int(4, 6), inch = rng.int(0, 11), total = ft * 12 + inch, cm = total * 2.54;
      return {
        body: `A student is ${ft} ft ${inch} in tall. What is their height in centimetres, to the nearest centimetre?`,
        answer: `${Math.round(cm)} cm`,
        distractors: distinct(`${Math.round(cm)} cm`, [`${Math.round((ft * 10 + inch) * 2.54)} cm`, `${Math.round(total / 2.54)} cm`, `${Math.round(ft * 30.48)} cm`, `${Math.round(cm) + 3} cm`]),
        solution: `${ft} ft ${inch} in = ${total} in, and ${total} × 2.54 ≈ ${Math.round(cm)} cm.`,
      };
    }
    if (difficulty === 2) {
      const mph = rng.pick([45, 55, 60, 65, 70, 75]), km = mph * 1.609;
      const toKm = rng.next() < 0.5;
      const kmh = rng.pick([50, 80, 90, 100, 110]);
      if (toKm) {
        return {
          body: `A U.S. speed limit is ${mph} mi/h. What is this in kilometres per hour, to the nearest whole number? (1 mi ≈ 1.609 km)`,
          answer: `${Math.round(km)} km/h`,
          distractors: distinct(`${Math.round(km)} km/h`, [`${Math.round(mph / 1.609)} km/h`, `${Math.round(mph * 1.5)} km/h`, `${Math.round(km) + 10} km/h`]),
          solution: `${mph} × 1.609 ≈ ${Math.round(km)} km/h.`,
        };
      }
      return {
        body: `A highway speed limit is ${kmh} km/h. What is this in miles per hour, to the nearest whole number? (1 mi ≈ 1.609 km)`,
        answer: `${Math.round(kmh / 1.609)} mi/h`,
        distractors: distinct(`${Math.round(kmh / 1.609)} mi/h`, [`${Math.round(kmh * 1.609)} mi/h`, `${Math.round(kmh / 1.2)} mi/h`, `${Math.round(kmh / 1.609) + 5} mi/h`]),
        solution: `${kmh} ÷ 1.609 ≈ ${Math.round(kmh / 1.609)} mi/h.`,
      };
    }
    const yards = rng.int(8, 30), price = rng.pick([6.5, 8.25, 9.99, 12.5]);
    const metres = yards * 0.9144, perM = price / 0.9144;
    return {
      body: `Fabric costs \\$${price.toFixed(2)} per yard. What is the cost per metre, to the nearest cent? (1 yd = 0.9144 m)`,
      answer: `\\$${perM.toFixed(2)}`,
      distractors: distinct(`\\$${perM.toFixed(2)}`, [`\\$${(price * 0.9144).toFixed(2)}`, `\\$${(price * 3).toFixed(2)}`, `\\$${(price / 0.3048).toFixed(2)}`]),
      solution: `1 m = 1/0.9144 yd ≈ 1.094 yd, so 1 m costs \\$${price.toFixed(2)} ÷ 0.9144 ≈ \\$${perM.toFixed(2)}. (${yards} yd would be ${dec(metres, 1)} m.)`,
    };
  },
});

// ── Surface area and volume ───────────────────────────────────────────────

const PI = Math.PI;
const area = (v: number, unit: string) => `${dec(v, 1)} ${unit}²`;
const vol = (v: number, unit: string) => `${dec(v, 1)} ${unit}³`;

export const savPrismPyramidArea = mb10i('10i-sav-prism-pyramid-area', {
  levels: { 1: 'Rectangular prism', 2: 'Triangular prism (right-triangle base)', 3: 'Square pyramid from its height' },
  options: [
    radioOption('form', 'Solid', [['1', 'Rectangular prism'], ['2', 'Triangular prism (right-triangle base)'], ['3', 'Square pyramid from its height']], ['1', '2', '3']),
    UNIT_OPTION,
    sizeOption([10, 15, 25], [15, 15, 15], 'Largest dimension'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const unit = unitFor(rng, o, ['cm', 'm', 'in']);
    const N = optNum(o, 'size', 15);
    if (difficulty === 1) {
      const l = rng.int(3, Math.round(N * 1.3)), w = rng.int(2, N), h = rng.int(2, N);
      const sa = 2 * (l * w + l * h + w * h);
      return {
        body: `Find the surface area of a rectangular prism ${l} ${unit} long, ${w} ${unit} wide, and ${h} ${unit} high.`,
        answer: area(sa, unit),
        distractors: distinct(area(sa, unit), [area(l * w * h, unit), area(sa / 2, unit), area(2 * l * w + l * h + w * h, unit)]),
        solution: `${math('"SA" = 2(l w + l h + w h)')} = 2(${l * w} + ${l * h} + ${w * h}) = ${sa} ${unit}².`,
      };
    }
    if (difficulty === 2) {
      const [a, b, c] = rng.pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15]]);
      const L = rng.int(5, Math.round(N * 1.6)), sa = a * b + (a + b + c) * L;
      return {
        body: `A triangular prism is ${L} ${unit} long. Its triangular ends are right triangles with legs ${a} ${unit} and ${b} ${unit}. Find its surface area.`,
        answer: area(sa, unit),
        distractors: distinct(area(sa, unit), [area(a * b / 2 * L, unit), area(a * b / 2 + (a + b + c) * L, unit), area(a * b + (a + b) * L, unit)]),
        solution: `The hypotenuse is ${math(`sqrt(${a}^2 + ${b}^2) = ${c}`)} ${unit}. Two triangles: ${math(`2 dot 1/2 (${a})(${b}) = ${a * b}`)}. Three rectangles: ${math(`(${a} + ${b} + ${c})(${L}) = ${(a + b + c) * L}`)}. Total: ${sa} ${unit}².`,
      };
    }
    const s = rng.int(3, Math.round(N * 0.8)) * 2, h = rng.int(4, Math.round(N * 1.3));
    const slant = Math.sqrt(h * h + (s / 2) ** 2), sa = s * s + 2 * s * slant;
    return {
      body: `A square pyramid has a base ${s} ${unit} on each side and a height of ${h} ${unit}. Find its surface area, to the nearest tenth.`,
      answer: area(sa, unit),
      distractors: distinct(area(sa, unit), [area(s * s + 2 * s * h, unit), area(2 * s * slant, unit), area(s * s + 4 * s * slant, unit)]),
      solution: `Slant height: ${math(`s = sqrt(${h}^2 + ${s / 2}^2) approx ${dec(slant, 2)}`)}. ${math(`"SA" = b^2 + 4 (1/2 b s) = ${s}^2 + 2(${s})(${dec(slant, 2)}) approx ${dec(sa, 1)}`)} ${unit}².`,
    };
  },
});

export const savCylinderConeArea = mb10i('10i-sav-cylinder-cone-area', {
  levels: { 1: 'Cylinder', 2: 'Cone from its slant height', 3: 'Cone from its height' },
  options: [
    radioOption('form', 'Solid', [['1', 'Cylinder'], ['2', 'Cone from its slant height'], ['3', 'Cone from its height']], ['1', '2', '3']),
    UNIT_OPTION,
    sizeOption([10, 15, 25], [15, 15, 15], 'Largest radius'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const unit = unitFor(rng, o, ['cm', 'm', 'in', 'ft']);
    const N = optNum(o, 'size', 15);
    const r = rng.int(2, N), h = rng.int(3, Math.round(N * 1.6));
    const useD = rng.next() < 0.4;
    const given = useD ? `a diameter of ${2 * r} ${unit}` : `a radius of ${r} ${unit}`;
    if (difficulty === 1) {
      const sa = 2 * PI * r * r + 2 * PI * r * h;
      return {
        body: `Find the surface area of a closed cylinder with ${given} and a height of ${h} ${unit}, to the nearest tenth.`,
        answer: area(sa, unit),
        distractors: distinct(area(sa, unit), [area(PI * r * r + 2 * PI * r * h, unit), area(2 * PI * r * h, unit), area(2 * PI * 4 * r * r + 4 * PI * r * h, unit), area(PI * r * r * h, unit)]),
        solution: `${math(`"SA" = 2 pi r^2 + 2 pi r h = 2 pi (${r})^2 + 2 pi (${r})(${h}) approx ${dec(sa, 1)}`)} ${unit}².`,
      };
    }
    const slant = difficulty === 2 ? rng.int(r + 2, r + 20) : Math.sqrt(r * r + h * h);
    const sa = PI * r * r + PI * r * slant;
    return {
      body: difficulty === 2
        ? `Find the surface area of a cone with ${given} and a slant height of ${slant} ${unit}, to the nearest tenth.`
        : `Find the surface area of a cone with ${given} and a height of ${h} ${unit}, to the nearest tenth.`,
      answer: area(sa, unit),
      distractors: distinct(area(sa, unit), [area(PI * r * slant, unit), area(PI * r * r + PI * r * (difficulty === 2 ? slant * 2 : h), unit), area(PI * r * r + 2 * PI * r * slant, unit), area(PI * 4 * r * r + PI * 2 * r * slant, unit)]),
      solution: `${difficulty === 3 ? `Slant height: ${math(`s = sqrt(${r}^2 + ${h}^2) approx ${dec(slant, 2)}`)}. ` : ''}${math(`"SA" = pi r^2 + pi r s = pi (${r})^2 + pi (${r})(${dec(slant, 2)}) approx ${dec(sa, 1)}`)} ${unit}².`,
    };
  },
});

type Solid = 'prism' | 'pyramid' | 'cylinder' | 'cone';
export const savVolume = mb10i('10i-sav-volume', {
  levels: { 1: 'Prisms and cylinders', 2: 'Pyramids and cones', 3: 'Any, given a diameter or slant height' },
  options: [
    radioOption('form', 'Solids', [['1', 'Prisms and cylinders'], ['2', 'Pyramids and cones'], ['3', 'Any, given a diameter or slant height']], ['1', '2', '3']),
    UNIT_OPTION,
    sizeOption([10, 15, 25], [15, 15, 15], 'Largest dimension'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const unit = unitFor(rng, o, ['cm', 'm', 'in']);
    const N = optNum(o, 'size', 15);
    const solid: Solid = difficulty === 1 ? rng.pick(['prism', 'cylinder'] as const) : rng.pick(difficulty === 2 ? ['pyramid', 'cone'] as const : ['cylinder', 'cone', 'pyramid'] as const);
    const h = rng.int(3, Math.round(N * 1.3));
    if (solid === 'prism' || solid === 'pyramid') {
      const l = rng.int(2, N), w = solid === 'pyramid' ? l : rng.int(2, N);
      const base = l * w, V = solid === 'prism' ? base * h : (base * h) / 3;
      const slantGiven = difficulty === 3 && solid === 'pyramid';
      const s = slantGiven ? Math.hypot(h, l / 2) : 0;
      return {
        body: solid === 'prism'
          ? `Find the volume of a rectangular prism ${l} ${unit} by ${w} ${unit} by ${h} ${unit}.`
          : slantGiven
            ? `A square pyramid has a base ${l} ${unit} on each side and a slant height of ${dec(s, 1)} ${unit}. Find its volume, to the nearest tenth.`
            : `Find the volume of a square pyramid with a base ${l} ${unit} on each side and a height of ${h} ${unit}, to the nearest tenth.`,
        answer: vol(V, unit),
        distractors: distinct(vol(V, unit), [vol(solid === 'prism' ? base * h / 3 : base * h, unit), vol(solid === 'prism' ? 2 * (l * w + l * h + w * h) : (base * (slantGiven ? Number(dec(s, 1)) : h)) / 3, unit), vol(V * 2, unit), vol(solid === 'prism' ? l + w + h : (base * h) / 2, unit)]),
        solution: solid === 'prism'
          ? `${math('V = l w h')} = ${l} × ${w} × ${h} = ${V} ${unit}³.`
          : `${slantGiven ? `Height: ${math(`h = sqrt(${dec(s, 1)}^2 - ${dec(l / 2, 1)}^2) approx ${h}`)}. ` : ''}${math(`V = 1/3 b^2 h = 1/3 (${l})^2 (${h}) approx ${dec(V, 1)}`)} ${unit}³.`,
      };
    }
    const r = rng.int(2, Math.round(N * 0.8));
    const useD = difficulty === 3 && rng.next() < 0.6;
    const V = solid === 'cylinder' ? PI * r * r * h : (PI * r * r * h) / 3;
    const given = useD ? `a diameter of ${2 * r} ${unit}` : `a radius of ${r} ${unit}`;
    return {
      body: `Find the volume of a ${solid} with ${given} and a height of ${h} ${unit}, to the nearest tenth.`,
      answer: vol(V, unit),
      distractors: distinct(vol(V, unit), [vol(solid === 'cylinder' ? V / 3 : V * 3, unit), vol((solid === 'cylinder' ? 1 : 1 / 3) * PI * 4 * r * r * h, unit), vol((solid === 'cylinder' ? 1 : 1 / 3) * 2 * PI * r * h, unit), vol(V / 2, unit)]),
      solution: `${useD ? `The radius is ${r} ${unit}. ` : ''}${math(`V = ${solid === 'cone' ? '1/3 ' : ''}pi r^2 h = ${solid === 'cone' ? '1/3 ' : ''}pi (${r})^2 (${h}) approx ${dec(V, 1)}`)} ${unit}³.`,
    };
  },
});

export const savSphere = mb10i('10i-sav-sphere', {
  levels: { 1: 'Surface area of a sphere', 2: 'Volume of a sphere', 3: 'Hemispheres' },
  options: [
    radioOption('form', 'Find', [['1', 'Surface area of a sphere'], ['2', 'Volume of a sphere'], ['3', 'Hemispheres']], ['1', '2', '3']),
    UNIT_OPTION,
    sizeOption([10, 15, 25], [15, 15, 15], 'Largest radius'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const unit = unitFor(rng, o, ['cm', 'm', 'in']);
    const r = rng.int(2, optNum(o, 'size', 15)), useD = rng.next() < 0.4;
    const given = useD ? `a diameter of ${2 * r} ${unit}` : `a radius of ${r} ${unit}`;
    if (difficulty === 1) {
      const sa = 4 * PI * r * r;
      return {
        body: `Find the surface area of a sphere with ${given}, to the nearest tenth.`,
        answer: area(sa, unit),
        distractors: distinct(area(sa, unit), [area(PI * r * r, unit), area(4 * PI * 4 * r * r, unit), area((4 / 3) * PI * r ** 3, unit), area(2 * PI * r * r, unit)]),
        solution: `${math(`"SA" = 4 pi r^2 = 4 pi (${r})^2 approx ${dec(sa, 1)}`)} ${unit}².`,
      };
    }
    if (difficulty === 2) {
      const V = (4 / 3) * PI * r ** 3;
      return {
        body: `Find the volume of a sphere with ${given}, to the nearest tenth.`,
        answer: vol(V, unit),
        distractors: distinct(vol(V, unit), [vol(4 * PI * r ** 3, unit), vol((4 / 3) * PI * (2 * r) ** 3, unit), vol(4 * PI * r * r, unit), vol((1 / 3) * PI * r ** 3, unit)]),
        solution: `${math(`V = 4/3 pi r^3 = 4/3 pi (${r})^3 approx ${dec(V, 1)}`)} ${unit}³.`,
      };
    }
    const wantVolume = rng.next() < 0.5;
    const V = (2 / 3) * PI * r ** 3, sa = 3 * PI * r * r;
    return wantVolume
      ? {
        body: `Find the volume of a hemisphere with ${given}, to the nearest tenth.`,
        answer: vol(V, unit),
        distractors: distinct(vol(V, unit), [vol(2 * V, unit), vol((2 / 3) * PI * (2 * r) ** 3, unit), vol(2 * PI * r * r, unit)]),
        solution: `Half a sphere: ${math(`V = 1/2 dot 4/3 pi r^3 = 2/3 pi (${r})^3 approx ${dec(V, 1)}`)} ${unit}³.`,
      }
      : {
        body: `Find the total surface area of a solid hemisphere (including its flat face) with ${given}, to the nearest tenth.`,
        answer: area(sa, unit),
        distractors: distinct(area(sa, unit), [area(2 * PI * r * r, unit), area(4 * PI * r * r, unit), area(PI * r * r, unit)]),
        solution: `Half of the sphere's surface plus a circle: ${math(`2 pi r^2 + pi r^2 = 3 pi (${r})^2 approx ${dec(sa, 1)}`)} ${unit}².`,
      };
  },
});

export const savUnknownDimension = mb10i('10i-sav-unknown-dimension', {
  levels: { 1: 'Height from a volume', 2: 'Radius from a volume or surface area', 3: 'Radius of a sphere' },
  options: [
    radioOption('form', 'Find', [['1', 'Height from a volume'], ['2', 'Radius from a volume or surface area'], ['3', 'Radius of a sphere']], ['1', '2', '3']),
    UNIT_OPTION,
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const unit = unitFor(rng, o, ['cm', 'm', 'in']);
    if (difficulty === 1) {
      const kind = rng.pick(['prism', 'cylinder', 'cone'] as const);
      const h = rng.int(3, 25);
      if (kind === 'prism') {
        const l = rng.int(2, 12), w = rng.int(2, 12), V = l * w * h;
        return {
          body: `A rectangular prism has a volume of ${V} ${unit}³, a length of ${l} ${unit}, and a width of ${w} ${unit}. Find its height.`,
          answer: `${h} ${unit}`,
          distractors: distinct(`${h} ${unit}`, [`${V - l - w} ${unit}`, `${dec(V / l, 1)} ${unit}`, `${dec(V / (l + w), 1)} ${unit}`, `${h * 2} ${unit}`]),
          solution: `${math(`h = V/(l w) = ${V}/(${l} dot ${w}) = ${h}`)} ${unit}.`,
        };
      }
      const r = rng.int(2, 10), V = kind === 'cylinder' ? PI * r * r * h : (PI * r * r * h) / 3;
      const Vr = Number(dec(V, 1));
      const hh = kind === 'cylinder' ? Vr / (PI * r * r) : (3 * Vr) / (PI * r * r);
      return {
        body: `A ${kind} has a volume of ${dec(V, 1)} ${unit}³ and a radius of ${r} ${unit}. Find its height, to the nearest tenth.`,
        answer: `${dec(hh, 1)} ${unit}`,
        distractors: distinct(`${dec(hh, 1)} ${unit}`, [`${dec(kind === 'cone' ? hh / 3 : hh * 3, 1)} ${unit}`, `${dec(Vr / (2 * PI * r), 1)} ${unit}`, `${dec(Vr / (PI * r), 1)} ${unit}`]),
        solution: `${math(kind === 'cylinder' ? `h = V/(pi r^2) = ${dec(V, 1)}/(pi (${r})^2)` : `h = (3V)/(pi r^2) = (3 dot ${dec(V, 1)})/(pi (${r})^2)`)} ≈ ${dec(hh, 1)} ${unit}.`,
      };
    }
    if (difficulty === 2) {
      const h = rng.int(4, 20), r = rng.int(2, 12), V = Number(dec(PI * r * r * h, 1));
      const rr = Math.sqrt(V / (PI * h));
      return {
        body: `A cylinder has a volume of ${V} ${unit}³ and a height of ${h} ${unit}. Find its radius, to the nearest tenth.`,
        answer: `${dec(rr, 1)} ${unit}`,
        distractors: distinct(`${dec(rr, 1)} ${unit}`, [`${dec(V / (PI * h), 1)} ${unit}`, `${dec(2 * rr, 1)} ${unit}`, `${dec(Math.sqrt(V / h), 1)} ${unit}`]),
        solution: `${math(`r^2 = V/(pi h) = ${V}/(pi dot ${h}) approx ${dec(V / (PI * h), 2)}`)}, so ${math(`r approx ${dec(rr, 1)}`)} ${unit}.`,
      };
    }
    const r = rng.int(2, 15), fromVolume = rng.next() < 0.5;
    const given = fromVolume ? Number(dec((4 / 3) * PI * r ** 3, 1)) : Number(dec(4 * PI * r * r, 1));
    const rr = fromVolume ? Math.cbrt((3 * given) / (4 * PI)) : Math.sqrt(given / (4 * PI));
    return {
      body: `A sphere has a ${fromVolume ? `volume of ${given} ${unit}³` : `surface area of ${given} ${unit}²`}. Find its radius, to the nearest tenth.`,
      answer: `${dec(rr, 1)} ${unit}`,
      distractors: distinct(`${dec(rr, 1)} ${unit}`, [`${dec(2 * rr, 1)} ${unit}`, `${dec(fromVolume ? Math.sqrt((3 * given) / (4 * PI)) : given / (4 * PI), 1)} ${unit}`, `${dec(fromVolume ? Math.cbrt(given / PI) : Math.sqrt(given / PI), 1)} ${unit}`]),
      solution: fromVolume
        ? `${math(`r^3 = (3V)/(4 pi) = (3 dot ${given})/(4 pi)`)}, so ${math(`r approx ${dec(rr, 1)}`)} ${unit}.`
        : `${math(`r^2 = "SA"/(4 pi) = ${given}/(4 pi)`)}, so ${math(`r approx ${dec(rr, 1)}`)} ${unit}.`,
    };
  },
});

export const savComposite = mb10i('10i-sav-composite', {
  levels: { 1: 'Volume of two combined solids', 2: 'Surface area of two combined solids', 3: 'A solid with a hole' },
  options: [
    radioOption('form', 'Solid', [['1', 'Volume of two combined solids'], ['2', 'Surface area of two combined solids'], ['3', 'A solid with a hole']], ['1', '2', '3']),
    UNIT_OPTION,
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const unit = unitFor(rng, o, ['cm', 'm', 'in']);
    const r = rng.int(2, 8), h = rng.int(5, 20);
    if (difficulty === 1) {
      const top = rng.pick(['hemisphere', 'cone'] as const), hc = rng.int(3, 10);
      const Vcyl = PI * r * r * h, Vtop = top === 'hemisphere' ? (2 / 3) * PI * r ** 3 : (PI * r * r * hc) / 3;
      const V = Vcyl + Vtop;
      return {
        body: `A grain bin is a cylinder with radius ${r} ${unit} and height ${h} ${unit}, topped with a ${top}${top === 'cone' ? ` of height ${hc} ${unit}` : ''}. Find its volume, to the nearest tenth.`,
        answer: vol(V, unit),
        distractors: distinct(vol(V, unit), [vol(Vcyl, unit), vol(Vcyl + (top === 'hemisphere' ? (4 / 3) * PI * r ** 3 : PI * r * r * hc), unit), vol(Vcyl - Vtop, unit)]),
        solution: `Cylinder: ${math(`pi (${r})^2 (${h}) approx ${dec(Vcyl, 1)}`)}. ${top === 'hemisphere' ? `Hemisphere: ${math(`2/3 pi (${r})^3 approx ${dec(Vtop, 1)}`)}` : `Cone: ${math(`1/3 pi (${r})^2 (${hc}) approx ${dec(Vtop, 1)}`)}`}. Total ≈ ${dec(V, 1)} ${unit}³.`,
      };
    }
    if (difficulty === 2) {
      // A cylinder with a hemisphere on top: bottom circle + lateral + half sphere.
      const sa = PI * r * r + 2 * PI * r * h + 2 * PI * r * r;
      return {
        body: `A silo is a cylinder (radius ${r} ${unit}, height ${h} ${unit}) with a hemisphere on top. Find its total outside surface area, including the floor, to the nearest tenth.`,
        answer: area(sa, unit),
        distractors: distinct(area(sa, unit), [area(2 * PI * r * r + 2 * PI * r * h + 2 * PI * r * r, unit), area(PI * r * r + 2 * PI * r * h + 4 * PI * r * r, unit), area(2 * PI * r * h + 2 * PI * r * r, unit)]),
        solution: `The joined faces are hidden. Floor: ${math(`pi r^2`)}; wall: ${math('2 pi r h')}; dome: ${math('2 pi r^2')}. ${math(`pi (${r})^2 + 2 pi (${r})(${h}) + 2 pi (${r})^2 approx ${dec(sa, 1)}`)} ${unit}².`,
      };
    }
    const R = r + rng.int(1, 4);
    const V = PI * (R * R - r * r) * h;
    return {
      body: `A concrete pipe is ${h} ${unit} long, with an outer radius of ${R} ${unit} and an inner radius of ${r} ${unit}. Find the volume of concrete, to the nearest tenth.`,
      answer: vol(V, unit),
      distractors: distinct(vol(V, unit), [vol(PI * (R - r) ** 2 * h, unit), vol(PI * R * R * h, unit), vol(PI * (R * R + r * r) * h, unit)]),
      solution: `Outer cylinder minus the hole: ${math(`pi (${R})^2 (${h}) - pi (${r})^2 (${h}) approx ${dec(V, 1)}`)} ${unit}³.`,
    };
  },
});

export const savRelationship = mb10i('10i-sav-relationship', {
  points: 1,
  levels: { 1: 'Cone from a cylinder', 2: 'Cylinder or prism from a cone or pyramid', 3: 'Different heights' },
  options: [
    radioOption('form', 'Solids', [['1', 'Cone from a cylinder'], ['2', 'Cylinder or prism from a cone or pyramid'], ['3', 'Different heights']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const [small, big] = rng.pick([['cone', 'cylinder'], ['pyramid', 'prism']] as const);
    const V = rng.int(3, 60) * 30;
    if (difficulty === 1) {
      return {
        body: `A ${big} and a ${small} have the same base and height. The ${big} holds ${V} mL. How much does the ${small} hold?`,
        answer: `${V / 3} mL`,
        distractors: [`${V / 2} mL`, `${V * 3} mL`, `${V} mL`],
        solution: `A ${small} holds ${math('1/3')} of the ${big} with the same base and height: ${V} ÷ 3 = ${V / 3} mL.`,
      };
    }
    if (difficulty === 2) {
      return {
        body: `A ${small} holds ${V} mL. A ${big} has the same base and height. How much does the ${big} hold?`,
        answer: `${V * 3} mL`,
        distractors: [`${V / 3} mL`, `${V * 2} mL`, `${V} mL`],
        solution: `The ${big} holds 3 times the ${small}: ${V} × 3 = ${V * 3} mL.`,
      };
    }
    const k = rng.pick([2, 3, 6]);
    return {
      body: `A ${small} has the same base as a ${big} but is ${k} times as tall. The ${big} holds ${V} mL. How much does the ${small} hold?`,
      answer: `${dec((V * k) / 3)} mL`,
      distractors: distinct(`${dec((V * k) / 3)} mL`, [`${dec(V / 3)} mL`, `${V * k} mL`, `${dec(V / (3 * k))} mL`, `${V * 3 * k} mL`]),
      solution: `Volume is proportional to height for the same base, and a ${small} holds ${math('1/3')} of the matching ${big}: ${math(`1/3 dot ${k} dot ${V} = ${dec((V * k) / 3)}`)} mL.`,
    };
  },
});

export const savImperial = mb10i('10i-sav-imperial', {
  levels: { 1: 'Volume in cubic feet', 2: 'Surface area in square feet', 3: 'Convert cubic inches and cubic feet' },
  options: [
    radioOption('form', 'Task', [['1', 'Volume in cubic feet'], ['2', 'Surface area in square feet'], ['3', 'Convert cubic inches and cubic feet']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const r = rng.int(2, 8), h = rng.int(4, 20), V = PI * r * r * h;
      return {
        body: `A cylindrical water tank has a radius of ${r} ft and a height of ${h} ft. Find its volume in cubic feet, to the nearest tenth.`,
        answer: vol(V, 'ft'),
        distractors: distinct(vol(V, 'ft'), [vol(2 * PI * r * h, 'ft'), vol(PI * 4 * r * r * h, 'ft'), vol(V / 3, 'ft')]),
        solution: `${math(`V = pi r^2 h = pi (${r})^2 (${h}) approx ${dec(V, 1)}`)} ft³.`,
      };
    }
    if (difficulty === 2) {
      const l = rng.int(8, 20), w = rng.int(6, 15), h = rng.int(7, 10);
      // The four walls and the ceiling of a room.
      const sa = 2 * (l * h + w * h) + l * w;
      return {
        body: `A room is ${l} ft by ${w} ft with ${h} ft walls. Find the area of the four walls and the ceiling, in square feet.`,
        answer: area(sa, 'ft'),
        distractors: distinct(area(sa, 'ft'), [area(2 * (l * h + w * h) + 2 * l * w, 'ft'), area(2 * (l * h + w * h), 'ft'), area(l * w * h, 'ft')]),
        solution: `Walls: ${math(`2(${l} dot ${h}) + 2(${w} dot ${h}) = ${2 * (l * h + w * h)}`)}; ceiling: ${l * w}. Total: ${sa} ft².`,
      };
    }
    const toFt = rng.next() < 0.5;
    if (toFt) {
      const inches = rng.int(2, 30) * 1728 / rng.pick([1, 2, 4]);
      return {
        body: `A box has a volume of ${grp(inches)} in³. What is its volume in cubic feet? (1 ft = 12 in)`,
        answer: `${dec(inches / 1728, 2)} ft³`,
        distractors: distinct(`${dec(inches / 1728, 2)} ft³`, [`${dec(inches / 12, 2)} ft³`, `${dec(inches / 144, 2)} ft³`, `${grp(inches * 1728)} ft³`]),
        solution: `1 ft³ = 12 × 12 × 12 = 1728 in³, so ${grp(inches)} ÷ 1728 = ${dec(inches / 1728, 2)} ft³.`,
      };
    }
    const ft = rng.int(2, 9);
    return {
      body: `How many cubic inches are in ${ft} ft³? (1 ft = 12 in)`,
      answer: `${grp(ft * 1728)} in³`,
      distractors: [`${ft * 12} in³`, `${grp(ft * 144)} in³`, `${grp(ft * 1000)} in³`],
      solution: `1 ft³ = 12³ = 1728 in³, so ${ft} × 1728 = ${grp(ft * 1728)} in³.`,
    };
  },
});

export const MEASUREMENT_10I = [
  measReferent, measFeetInches, measReadRuler, measPerimeter, measConvertSi, measConvertImperial, measConvertBetween, measConvertProblem,
  savPrismPyramidArea, savCylinderConeArea, savVolume, savSphere, savUnknownDimension, savComposite, savRelationship, savImperial,
];


