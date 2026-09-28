import type { Rng } from '../../rng.ts';
import { round } from '../../format.ts';
import { angle, exactTrig, exactTypst, exactValue, Q, radians, type Exact, type TrigFn } from '../../exact.ts';
import { graphTypst } from '../../graph.ts';
import { domainText, solutionList, solveSpecial, specialAnglesIn, type Unit } from './angles.ts';
import { math, pc40s } from './common.ts';

/** `fn x - value = 0` written with whole-number coefficients: 2 sin x - 1 = 0, 2 cos x + sqrt(3) = 0. */
export function linearEquation(fn: string, v: Exact, variable = 'x'): string {
  const term = `${v.d === 1 ? '' : v.d}${fn} ${variable}`;
  if (v.a === 0 && v.b === 0) return `${fn} ${variable} = 0`;
  const constant = v.b === 0 ? String(Math.abs(v.a)) : `${Math.abs(v.b) === 1 ? '' : Math.abs(v.b)}sqrt(${v.r})`;
  const sign = (v.b === 0 ? v.a : v.b) < 0 ? '+' : '-';
  return `${term} ${sign} ${constant} = 0`;
}

/** Distractor solution sets: one solution only, the wrong sign, reflected angles, the cofunction's solutions. */
function setDistractors(fn: TrigFn, v: Exact | null, sols: number[], lo: number, hi: number, unit: Unit, variable = 'x'): string[] {
  const cofunction: Record<TrigFn, TrigFn> = { sin: 'cos', cos: 'sin', tan: 'cot', cot: 'tan', csc: 'sec', sec: 'csc' };
  const flipped = v ? solveSpecial(fn, { ...v, a: -v.a, b: -v.b }, lo, hi) : [];
  const reflected = [...new Set(sols.map((a) => ((360 - a) % 360 + 360) % 360))].filter((a) => a >= lo && a < hi).sort((a, b) => a - b);
  return [sols.slice(0, 1), flipped, reflected, solveSpecial(cofunction[fn], v, lo, hi), sols.map((a) => a + 30).filter((a) => a < hi)]
    .map((list) => solutionList(list, unit, variable));
}

/** A special value with at least one solution: fn at a random special angle. */
function specialValue(rng: Rng, fn: TrigFn): Exact {
  for (;;) {
    const v = exactTrig(fn, rng.pick(specialAnglesIn(0, 360)));
    if (v) return v;
  }
}

export const teVerify = pc40s('40s-te-verify', {
  points: 1,
  levels: { 1: 'Degrees', 2: 'Radians', 3: 'Reciprocal ratios' },
  generate(rng, difficulty) {
    const fn: TrigFn = difficulty === 3 ? rng.pick(['csc', 'sec', 'cot'] as const) : rng.pick(['sin', 'cos', 'tan'] as const);
    const unit: Unit = difficulty === 1 ? 'deg' : 'rad';
    const v = specialValue(rng, fn);
    const equation = linearEquation(fn, v);
    const sols = solveSpecial(fn, v, 0, 360);
    const isSolution = rng.next() < 0.5;
    const others = specialAnglesIn(0, 360).filter((a) => !sols.includes(a) && exactTrig(fn, a) !== null);
    const theta = isSolution ? rng.pick(sols) : rng.pick(others);
    const at = exactTrig(fn, theta);
    const value = exactTypst(at);
    const verdict = (yes: boolean, shown: string) => `${yes ? 'Yes' : 'No'}: ${math(`${fn} ${angle(theta, unit)} = ${shown}`)}`;
    return {
      body: `Is ${math(`x = ${angle(theta, unit)}`)} a solution of ${math(equation)}?`,
      answer: verdict(isSolution, value),
      distractors: [verdict(!isSolution, value), verdict(!isSolution, exactTypst(v)), verdict(isSolution, exactTypst(exactTrig(fn, theta + 180)))].filter((d) => d !== verdict(isSolution, value)),
      solution: `The equation says ${math(`${fn} x = ${exactTypst(v)}`)}. Substitute: ${math(`${fn} ${angle(theta, unit)} = ${value}`)}, so ${math(`x = ${angle(theta, unit)}`)} ${isSolution ? 'is' : 'is not'} a solution.`,
    };
  },
});

export const teFirstDegree = pc40s('40s-te-first-degree', {
  levels: { 1: 'Degrees, 0° to 360°', 2: 'Radians, 0 to 2π', 3: 'Reciprocal ratios, −π to 2π' },
  generate(rng, difficulty) {
    const fn: TrigFn = difficulty === 3 ? rng.pick(['csc', 'sec', 'cot', 'tan'] as const) : rng.pick(['sin', 'cos', 'tan'] as const);
    const unit: Unit = difficulty === 1 ? 'deg' : 'rad';
    const [lo, hi] = difficulty === 3 ? [-180, 360] : [0, 360];
    const v = specialValue(rng, fn);
    const sols = solveSpecial(fn, v, lo, hi);
    const answer = solutionList(sols, unit);
    return {
      body: `Solve for ${math(domainText(lo, hi, unit))}: ${math(linearEquation(fn, v))}`,
      answer: math(answer),
      distractors: setDistractors(fn, v, sols, lo, hi, unit).filter((d) => d !== answer).map(math),
      solution: `Isolate the ratio: ${math(`${fn} x = ${exactTypst(v)}`)}. Find the reference angle and the quadrants where ${math(`${fn} x`)} has this sign, then list every solution in the domain: ${math(answer)}.`,
    };
  },
});

/** All x in [lo, hi) degrees with fn(x) = value, for any value (inverse trig). */
function solveApprox(fn: 'sin' | 'cos' | 'tan', value: number, lo: number, hi: number): number[] {
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const base = fn === 'sin' ? [toDeg(Math.asin(value)), 180 - toDeg(Math.asin(value))]
    : fn === 'cos' ? [toDeg(Math.acos(value)), -toDeg(Math.acos(value))]
    : [toDeg(Math.atan(value))];
  const period = fn === 'tan' ? 180 : 360;
  const out: number[] = [];
  for (const b of base) for (let k = -4; k <= 4; k++) {
    const a = b + k * period;
    if (a >= lo - 1e-9 && a < hi - 1e-9 && !out.some((o) => Math.abs(o - a) < 1e-6)) out.push(a);
  }
  return out.sort((a, b) => a - b);
}

export const teFirstDegreeApprox = pc40s('40s-te-first-degree-approx', {
  levels: { 1: 'Degrees, nearest tenth', 2: 'Radians, two decimal places', 3: 'Radians, 0 to 4π' },
  generate(rng, difficulty) {
    const fn = rng.pick(['sin', 'cos', 'tan'] as const);
    const k = rng.int(2, 5);
    const m = fn === 'tan' ? rng.nonZero(-9, 9) : rng.nonZero(-(k - 1), k - 1);
    const value = m / k;
    if (fn !== 'tan' && [0.5, -0.5].includes(value)) return teFirstDegreeApprox.generate(rng, difficulty);
    const unit: Unit = difficulty === 1 ? 'deg' : 'rad';
    const hi = difficulty === 3 ? 720 : 360;
    const sols = solveApprox(fn, value, 0, hi);
    const show = (list: number[]) => `x approx ${list.map((a) => (unit === 'deg' ? `${round(a, 1)}°` : round((a * Math.PI) / 180, 2))).join(', ')}`;
    const answer = show(sols);
    const refDeg = ((fn === 'sin' ? Math.asin(Math.abs(value)) : fn === 'cos' ? Math.acos(Math.abs(value)) : Math.atan(Math.abs(value))) * 180) / Math.PI;
    const equation = `${k}${fn} x ${m < 0 ? '+' : '-'} ${Math.abs(m)} = 0`;
    return {
      body: `Solve for ${math(`0 <= x < ${unit === 'deg' ? `${hi}°` : radians(hi)}`)}, ${unit === 'deg' ? 'to the nearest tenth of a degree' : 'to two decimal places'}: ${math(equation)}`,
      answer: math(answer),
      // One solution only, the opposite sign, the reference angle alone, complements, or a half-turn off.
      distractors: [
        sols.slice(0, 1), solveApprox(fn, -value, 0, hi), [refDeg], sols.map((a) => Math.abs(90 - a)).sort((a, b) => a - b),
        sols.map((a) => (a + 180) % hi).sort((a, b) => a - b),
      ].map(show).filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `${math(`${fn} x = ${new Q(m, k).typst()}`)}. The reference angle is ${math(`${fn}^(-1)(${new Q(Math.abs(m), k).typst()}) approx ${unit === 'deg' ? `${round((Math.abs(fn === 'sin' ? Math.asin(Math.abs(value)) : fn === 'cos' ? Math.acos(Math.abs(value)) : Math.atan(Math.abs(value))) * 180) / Math.PI, 1)}°` : round(Math.abs(fn === 'sin' ? Math.asin(Math.abs(value)) : fn === 'cos' ? Math.acos(Math.abs(value)) : Math.atan(Math.abs(value))), 2)}`)}. Using the quadrants where ${math(`${fn} x`)} is ${value > 0 ? 'positive' : 'negative'}: ${math(answer)}.`,
    };
  },
});

export const teDoubleAngle = pc40s('40s-te-double-angle', {
  levels: { 1: 'sin 2x or cos 2x, degrees', 2: 'Radians', 3: 'tan 2x and negative values' },
  generate(rng, difficulty) {
    const fn: TrigFn = difficulty === 3 ? rng.pick(['tan', 'sin', 'cos'] as const) : rng.pick(['sin', 'cos'] as const);
    const unit: Unit = difficulty === 1 ? 'deg' : 'rad';
    let v: Exact;
    do { v = specialValue(rng, fn); } while (difficulty === 3 && exactValue(v) >= 0 && fn !== 'tan');
    // 2x runs over [0°, 720°) when x runs over [0°, 360°).
    const doubled = solveSpecial(fn, v, 0, 720);
    const sols = doubled.map((a) => a / 2);
    const answer = solutionList(sols, unit);
    return {
      body: `Solve for ${math(domainText(0, 360, unit))}: ${math(linearEquation(fn, v, '2x'))}`,
      answer: math(answer),
      // Not halving, halving only one rotation's solutions, the opposite sign, or doubling instead of halving.
      distractors: [
        solveSpecial(fn, v, 0, 360),
        solveSpecial(fn, v, 0, 360).map((a) => a / 2),
        solveSpecial(fn, { ...v, a: -v.a, b: -v.b }, 0, 720).map((a) => a / 2),
        solveSpecial(fn, v, 0, 180).map((a) => a * 2),
      ].map((list) => solutionList(list, unit)).filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Let ${math('u = 2x')}; since ${math(domainText(0, 360, unit))}, ${math(`0 <= u < ${angle(720, unit)}`)}. Solve ${math(`${fn} u = ${exactTypst(v)}`)}: ${math(`u = ${doubled.map((a) => angle(a, unit)).join(', ')}`)}. Divide by 2: ${math(answer)}.`,
    };
  },
});

/** Values of sin or cos with special solutions, for quadratic equations. */
const QUAD_VALUES: Array<[p: number, q: number]> = [[1, -1], [2, -1], [1, 0], [2, 1], [1, 1]];

export const teSecondDegree = pc40s('40s-te-second-degree', {
  levels: { 1: 'fn²x = k', 2: 'Factor a quadratic', 3: 'Reject a value with no solution' },
  generate(rng, difficulty) {
    const unit: Unit = rng.pick(['deg', 'rad'] as const);
    if (difficulty === 1) {
      const [fn, m, n] = rng.pick([['sin', 4, 1], ['cos', 4, 1], ['sin', 2, 1], ['cos', 4, 3], ['sin', 4, 3], ['tan', 1, 3], ['tan', 1, 1], ['tan', 3, 1]] as const);
      // fn² = n/m  →  fn = ±√(n/m)
      const root = Math.sqrt(n / m);
      const sols = specialAnglesIn(0, 360).filter((a) => { const e = exactTrig(fn, a); return e !== null && Math.abs(Math.abs(exactValue(e)) - root) < 1e-9; });
      const answer = solutionList(sols, unit);
      const positiveOnly = sols.filter((a) => exactValue(exactTrig(fn, a)) > 0);
      return {
        body: `Solve for ${math(domainText(0, 360, unit))}: ${math(`${m === 1 ? '' : m}${fn}^2 x - ${n} = 0`)}`,
        answer: math(answer),
        distractors: [solutionList(positiveOnly, unit), solutionList(sols.slice(0, 2), unit), solutionList(specialAnglesIn(0, 360).filter((a) => { const e = exactTrig(fn, a); return e !== null && Math.abs(exactValue(e) - n / m) < 1e-9; }), unit)].filter((d) => d !== answer).map(math),
        solution: `${math(`${fn}^2 x = ${new Q(n, m).typst()}`)}, so ${math(`${fn} x = ± ${exactTypst(exactTrig(fn, positiveOnly[0] ?? sols[0]))}`)}. Both signs give solutions: ${math(answer)}.`,
      };
    }
    const fn = rng.pick(['sin', 'cos'] as const);
    const pool = difficulty === 3 ? [...QUAD_VALUES, [1, 2] as [number, number], [1, -2] as [number, number]] : QUAD_VALUES;
    let r1: [number, number], r2: [number, number];
    do { r1 = rng.pick(QUAD_VALUES); r2 = rng.pick(pool); } while (r1[1] * r2[0] === r2[1] * r1[0] || (difficulty === 3 && Math.abs(r2[1] / r2[0]) <= 1));
    // (p1 f − q1)(p2 f − q2) = p1p2 f² − (p1q2 + p2q1) f + q1q2
    const A = r1[0] * r2[0], B = -(r1[0] * r2[1] + r2[0] * r1[1]), C = r1[1] * r2[1];
    const term = (c: number, text: string, first: boolean) => (c === 0 ? '' : `${first ? (c < 0 ? '-' : '') : c < 0 ? ' - ' : ' + '}${Math.abs(c) === 1 && text ? '' : Math.abs(c)}${text}`);
    const equation = `${term(A, `${fn}^2 x`, true)}${term(B, `${fn} x`, false)}${term(C, '', false)} = 0`;
    const values = [new Q(r1[1], r1[0]), new Q(r2[1], r2[0])];
    const solsFor = (q: Q) => (Math.abs(q.value) > 1 ? [] : solveSpecial(fn, { a: q.n, b: 0, r: 1, d: q.d }, 0, 360));
    const sols = [...new Set(values.flatMap(solsFor))].sort((a, b) => a - b);
    const answer = solutionList(sols, unit);
    const factor = (p: number, q: number) => `(${p === 1 ? '' : p}${fn} x ${q < 0 ? '+' : '-'} ${Math.abs(q)})`.replace(` - 0)`, ')').replace(` + 0)`, ')');
    return {
      body: `Solve for ${math(domainText(0, 360, unit))}: ${math(equation)}`,
      answer: math(answer),
      // One factor only, the opposite signs, half the solutions, reflected angles, or "no solution".
      distractors: [
        solsFor(values[0]), solsFor(values[1]),
        [...new Set(values.flatMap((q) => solsFor(q.neg())))].sort((a, b) => a - b),
        sols.filter((_, i) => i % 2 === 0),
        [...new Set(sols.map((a) => (360 - a) % 360))].sort((a, b) => a - b),
        [],
      ].map((list) => solutionList(list, unit)).filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Factor: ${math(`${factor(r1[0], r1[1])}${factor(r2[0], r2[1])} = 0`)}, so ${math(`${fn} x = ${values[0].typst()}`)} or ${math(`${fn} x = ${values[1].typst()}`)}.`
        + `${values.some((q) => Math.abs(q.value) > 1) ? ` ${math(`${fn} x = ${values.find((q) => Math.abs(q.value) > 1)!.typst()}`)} has no solution because ${math(`-1 <= ${fn} x <= 1`)}.` : ''} Solutions: ${math(answer)}.`,
    };
  },
});

export const teIdentities = pc40s('40s-te-identities', {
  levels: { 1: 'Double angle, then factor', 2: 'Pythagorean substitution', 3: 'cos 2x substitution (radians)' },
  generate(rng, difficulty) {
    const unit: Unit = difficulty === 3 ? 'rad' : rng.pick(['deg', 'rad'] as const);
    if (difficulty === 1) {
      const withSin = rng.next() < 0.5; // sin 2x = c·sin x  →  sin x (2cos x − c) = 0
      const [cText, cVal] = rng.pick([['', 1], ['-', -1], ['sqrt(2)', Math.SQRT2], ['-sqrt(2)', -Math.SQRT2], ['sqrt(3)', Math.sqrt(3)], ['-sqrt(3)', -Math.sqrt(3)]] as const);
      const fn = withSin ? 'sin' : 'cos';
      const other = withSin ? 'cos' : 'sin';
      const magnitude = cText.replace('-', '');
      const half: Exact = { a: Math.abs(cVal) === 1 ? Math.sign(cVal) : 0, b: Math.abs(cVal) === 1 ? 0 : Math.sign(cVal), r: Math.abs(cVal) === 1 ? 1 : Math.round(cVal * cVal), d: 2 };
      const zeros = solveSpecial(fn, { a: 0, b: 0, r: 1, d: 1 }, 0, 360);
      const rest = solveSpecial(other, half, 0, 360);
      const sols = [...new Set([...zeros, ...rest])].sort((a, b) => a - b);
      const answer = solutionList(sols, unit);
      return {
        body: `Solve for ${math(domainText(0, 360, unit))}: ${math(`sin 2x = ${cText === '' ? '' : cText === '-' ? '-' : `${cText} `}${fn} x`)}`,
        answer: math(answer),
        distractors: [solutionList(rest, unit), solutionList(zeros, unit), solutionList(solveSpecial(other, { ...half, a: -half.a, b: -half.b }, 0, 360).concat(zeros).sort((a, b) => a - b), unit)].filter((d) => d !== answer).map(math),
        solution: `Use ${math('sin 2x = 2 sin x cos x')}: ${math(`2 sin x cos x ${cVal < 0 ? '+' : '-'} ${magnitude ? `${magnitude} ` : ''}${fn} x = 0`)}, so ${math(`${fn} x (2 ${other} x ${cVal < 0 ? '+' : '-'} ${magnitude || '1'}) = 0`)}. `
          + `${math(`${fn} x = 0`)} gives ${math(solutionList(zeros, unit))}; ${math(`${other} x = ${exactTypst(half)}`)} gives ${math(solutionList(rest, unit))}. Do not divide by ${math(`${fn} x`)}: that loses solutions.`,
      };
    }
    // Quadratics in sin (level 2, from cos² = 1 − sin²) or in cos (level 3, from cos 2x = 2cos² − 1).
    const fn = difficulty === 2 ? 'sin' : 'cos';
    let r1: [number, number], r2: [number, number];
    // The linear term must be present, or there is nothing to substitute around (e.g. cos² x = 0).
    do { r1 = rng.pick(QUAD_VALUES); r2 = rng.pick(QUAD_VALUES); } while (r1[1] * r2[0] === r2[1] * r1[0] || (difficulty === 3 && r1[0] * r2[0] !== 2) || r1[0] * r2[1] + r2[0] * r1[1] === 0);
    const A = r1[0] * r2[0], B = -(r1[0] * r2[1] + r2[0] * r1[1]), C = r1[1] * r2[1];
    const coef = (c: number, text: string, first: boolean) => (c === 0 ? '' : `${first ? (c < 0 ? '-' : '') : c < 0 ? ' - ' : ' + '}${Math.abs(c) === 1 && text ? '' : Math.abs(c)}${text}`);
    let equation: string, substitution: string;
    if (difficulty === 2) {
      // A sin² + B sin + C = 0 with sin² = 1 − cos²:  −A cos² + B sin + (A + C) = 0, shown with A cos² first.
      equation = `${coef(A, 'cos^2 x', true)}${coef(-B, 'sin x', false)}${coef(-(A + C), '', false)} = 0`;
      substitution = `Replace ${math('cos^2 x')} with ${math('1 - sin^2 x')} and simplify: ${math(`${coef(A, 'sin^2 x', true)}${coef(B, 'sin x', false)}${coef(C, '', false)} = 0`)}.`;
    } else {
      // 2cos² + B cos + C = 0 with 2cos² = cos 2x + 1:  cos 2x + B cos + (C + 1) = 0
      equation = `cos 2x${coef(B, 'cos x', false)}${coef(C + 1, '', false)} = 0`;
      substitution = `Replace ${math('cos 2x')} with ${math('2cos^2 x - 1')}: ${math(`2cos^2 x${coef(B, 'cos x', false)}${coef(C, '', false)} = 0`)}.`;
    }
    const values = [new Q(r1[1], r1[0]), new Q(r2[1], r2[0])];
    const solsFor = (q: Q) => solveSpecial(fn, { a: q.n, b: 0, r: 1, d: q.d }, 0, 360);
    const sols = [...new Set(values.flatMap(solsFor))].sort((a, b) => a - b);
    const answer = solutionList(sols, unit);
    return {
      body: `Solve for ${math(domainText(0, 360, unit))}: ${math(equation)}`,
      answer: math(answer),
      distractors: [solutionList(solsFor(values[0]), unit), solutionList(solsFor(values[1]), unit), solutionList([...new Set(values.flatMap((q) => solsFor(q.neg())))].sort((a, b) => a - b), unit)].filter((d) => d !== answer).map(math),
      solution: `${substitution} Factor to get ${math(`${fn} x = ${values[0].typst()}`)} or ${math(`${fn} x = ${values[1].typst()}`)}. Solutions: ${math(answer)}.`,
    };
  },
});

/** General solution text: `x = pi/6 + 2pi n, (5pi)/6 + 2pi n, n in ZZ`, merging solutions half a period apart. */
function generalSolution(sols: number[], periodDeg: number, unit: Unit): string {
  let period = periodDeg;
  let base = sols;
  if (sols.length === 2 && Math.abs(sols[1] - sols[0] - periodDeg / 2) < 1e-9) { period = periodDeg / 2; base = [sols[0]]; }
  const p = unit === 'deg' ? `${period}°` : radians(period);
  return `x = ${base.map((a) => `${angle(a, unit)} + ${p} n`).join(', ')}, n in ZZ`;
}

export const teGeneral = pc40s('40s-te-general', {
  levels: { 1: 'Degrees', 2: 'Radians', 3: 'tan x and double angles' },
  generate(rng, difficulty) {
    const unit: Unit = difficulty === 1 ? 'deg' : 'rad';
    const fn: TrigFn = difficulty === 3 ? rng.pick(['tan', 'sin', 'cos'] as const) : rng.pick(['sin', 'cos'] as const);
    const doubleAngle = difficulty === 3 && fn !== 'tan';
    const v = specialValue(rng, fn);
    const basePeriod = fn === 'tan' ? 180 : 360;
    let sols = solveSpecial(fn, v, 0, basePeriod);
    let period = basePeriod;
    if (doubleAngle) { sols = sols.map((a) => a / 2); period = basePeriod / 2; }
    const answer = generalSolution(sols, period, unit);
    return {
      body: `Find the general solution${unit === 'deg' ? ' in degrees' : ' in radians'}: ${math(linearEquation(fn, v, doubleAngle ? '2x' : 'x'))}`,
      answer: math(answer),
      distractors: [
        generalSolution(sols, period * 2, unit),
        generalSolution(sols.slice(0, 1), period, unit),
        doubleAngle ? generalSolution(sols.map((a) => a * 2), basePeriod, unit) : generalSolution(sols, period / 2, unit),
      ].filter((d) => d !== answer).map(math),
      solution: `${doubleAngle ? `Solve for ${math('2x')} first, then divide everything by 2 (including the period). ` : ''}The solutions in one period are ${math(sols.map((a) => angle(a, unit)).join(', '))}; the period is ${math(unit === 'deg' ? `${period}°` : radians(period))}. So ${math(answer)}.`,
    };
  },
});

export const teFindError = pc40s('40s-te-find-error', {
  levels: { 1: 'A missing quadrant', 2: 'A wrong reference angle or domain', 3: 'Dividing by a trig function' },
  generate(rng, difficulty) {
    const unit: Unit = 'rad';
    if (difficulty === 3) {
      const c = rng.pick([1, -1]);
      const half: Exact = { a: c, b: 0, r: 1, d: 2 };
      const wrong = solveSpecial('cos', half, 0, 360);
      const right = [...new Set([...solveSpecial('sin', { a: 0, b: 0, r: 1, d: 1 }, 0, 360), ...wrong])].sort((a, b) => a - b);
      return {
        body: `A student solved ${math(`sin 2x = ${c < 0 ? '-' : ''}sin x`)} for ${math(domainText(0, 360, unit))} like this:\n\n${math(`2 sin x cos x = ${c < 0 ? '-' : ''}sin x`)}, so ${math(`2 cos x = ${c}`)}, so ${math(solutionList(wrong, unit))}.\n\nFind the error and give the correct solution.`,
        answer: math(solutionList(right, unit)),
        distractors: [solutionList(wrong, unit), solutionList(solveSpecial('sin', { a: 0, b: 0, r: 1, d: 1 }, 0, 360), unit), solutionList(solveSpecial('cos', { ...half, a: -c }, 0, 360), unit)].map(math),
        solution: `Dividing by ${math('sin x')} loses the solutions where ${math('sin x = 0')}. Factor instead: ${math(`sin x (2 cos x ${c > 0 ? '-' : '+'} 1) = 0`)}, giving ${math(solutionList(right, unit))}.`,
      };
    }
    const fn = rng.pick(['sin', 'cos', 'tan'] as const);
    let v: Exact;
    do { v = specialValue(rng, fn); } while (exactValue(v) === 0 || Math.abs(exactValue(v)) === 1);
    const right = solveSpecial(fn, v, 0, 360);
    const ref = (a: number) => { const m = ((a % 360) + 360) % 360; return m <= 90 ? m : m <= 180 ? 180 - m : m <= 270 ? m - 180 : 360 - m; };
    // Swapping reference angles is not a mistake at 45°, so those become a missing-quadrant error.
    let kind: 'quadrant' | 'reference' | 'domain' = difficulty === 1 ? 'quadrant' : rng.pick(['reference', 'domain'] as const);
    if (kind === 'reference' && ref(right[0]) === 45) kind = 'quadrant';
    let student: string, explanation: string;
    if (kind === 'quadrant') {
      student = solutionList(right.slice(0, 1), unit);
      explanation = `${math(`${fn} x`)} is ${exactValue(v) > 0 ? 'positive' : 'negative'} in two quadrants, so there are two solutions in one rotation; the student found only one.`;
    } else if (kind === 'reference') {
      const r = ref(right[0]);
      const swapped = right.map((a) => a + (ref(a) === r ? (90 - 2 * r) * (Math.floor(a / 90) % 2 === 0 ? 1 : -1) : 0));
      student = solutionList(swapped, unit);
      explanation = `The reference angle is ${math(radians(r))}, not ${math(radians(90 - r))}, because ${math(`${fn} ${radians(r)} = ${exactTypst(exactTrig(fn, r))}`)}.`;
    } else {
      const negative = right.map((a) => (a > 180 ? a - 360 : a));
      student = solutionList(negative, unit);
      explanation = `The answers must be in ${math(domainText(0, 360, unit))}; add ${math('2pi')} to any negative angle.`;
    }
    const answer = solutionList(right, unit);
    return {
      body: `A student solved ${math(linearEquation(fn, v))} for ${math(domainText(0, 360, unit))} and got ${math(student)}. Find the error and give the correct solution.`,
      answer: math(answer),
      distractors: [student, solutionList(solveSpecial(fn, { ...v, a: -v.a, b: -v.b }, 0, 360), unit), solutionList(right.slice(-1), unit)].filter((d) => d !== answer).map(math),
      solution: `${explanation} Correct solution: ${math(answer)}.`,
    };
  },
});

export const teGraphical = pc40s('40s-te-graphical', {
  levels: { 1: 'sin x or cos x = k', 2: 'a sin x = k', 3: 'Two curves' },
  generate(rng, difficulty) {
    const fn = rng.pick(['sin', 'cos'] as const);
    const a = difficulty === 1 ? 1 : rng.pick([2, 3]);
    const v = specialValue(rng, fn);
    const k = exactValue(v) * a;
    const kText = a === 1 ? exactTypst(v) : exactTypst({ ...v, a: v.a * a, b: v.b * a });
    // The domain includes 2π.
    const sols = solveSpecial(fn, v, 0, 361);
    const f = (x: number) => a * (fn === 'sin' ? Math.sin(x) : Math.cos(x));
    const ticks: Array<[number, string]> = [90, 180, 270, 360].map((d) => [(d * Math.PI) / 180, radians(d)]);
    const graph = graphTypst({
      xMin: -0.4, xMax: 2 * Math.PI + 0.4, yMin: -a - 1, yMax: a + 1, xStep: Math.PI / 6, yStep: 1, xTicks: ticks, width: 7, height: 3.6,
      curves: [{ f }, { f: () => k, dashed: true }],
      dots: sols.map((d) => ({ x: (d * Math.PI) / 180, y: k })),
    });
    const answer = solutionList(sols, 'rad');
    const lead = a === 1 ? '' : String(a);
    return {
      body: `The graphs of ${math(`y = ${lead}${fn} x`)} and ${math(`y = ${kText}`)} are shown, with vertical grid lines every ${math('pi/6')}. Use the graph to solve ${math(`${lead}${fn} x = ${kText}`)} for ${math('0 <= x <= 2pi')}.\n\n${graph}`,
      answer: math(answer),
      distractors: setDistractors(fn, v, sols, 0, 360, 'rad').filter((d) => d !== answer).map(math),
      solution: `The solutions are the x-coordinates of the intersection points: ${math(answer)}. Check: ${math(`${lead}${fn} ${radians(sols[0])} = ${kText}`)}.`,
    };
  },
});

export const TRIG_EQUATION_GENERATORS = [teVerify, teFirstDegree, teFirstDegreeApprox, teDoubleAngle, teSecondDegree, teIdentities, teGeneral, teFindError, teGraphical];
