import type { Rng } from '../../rng.ts';
import { Q } from '../../exact.ts';
import { gcd, round } from '../../format.ts';
import { math, pc30s } from '../pc40s/common.ts';
import { optNum, optOne, radioOption, sizeOption } from '../../options.ts';
import { factorText, fromRoots, poly, polyAdd, polyMul } from '../pc40s/functions.ts';

/** Distinct integers in a range, excluding some values. */
function picks(rng: Rng, n: number, exclude: number[] = [], lo = -6, hi = 6): number[] {
  const out = new Set<number>();
  while (out.size < n) { const v = rng.int(lo, hi); if (!exclude.includes(v)) out.add(v); }
  return [...out];
}

/** `x(x + 3)(x - 2)^2` (a bare x first, repeated roots as powers), or `1` for no factors. */
function factors(rs: number[]): string {
  if (!rs.length) return '1';
  const distinct = [...new Set(rs)].sort((a, b) => Number(b === 0) - Number(a === 0));
  return distinct.map((r) => factorText(r, rs.filter((v) => v === r).length)).join('').replace(/(\^\d+)(?=[(x])/g, '$1 ');
}
/** c times a factor: `(x - 2)`, `-(x - 2)`, `3(x - 2)`, `x` for c = 1 and root 0. */
const times = (c: number, root: number) => `${c === 1 ? '' : c === -1 ? '-' : c}${factorText(root)}`;
/** A fraction of polynomials in expanded form. */
const frac = (top: string, bottom: string) => `(${top})/(${bottom})`;
/** `x != -3, 2` from a list of values. */
const npvText = (vs: number[]) => `x != ${[...new Set(vs)].sort((a, b) => a - b).join(', ')}`;
/** A factor list as a simplified fraction, e.g. (x + 3)/(x + 2), or just the numerator over 1. */
function simplified(top: number[], bottom: number[], lead = 1): string {
  const t = [...top], b = [...bottom];
  for (const r of [...t]) { const i = b.indexOf(r); if (i >= 0) { b.splice(i, 1); t.splice(t.indexOf(r), 1); } }
  const leadText = lead === 1 ? '' : lead === -1 ? '-' : String(lead);
  // A single factor loses its own brackets: x - 2, (x + 4)/(x + 3), -(x - 2)/(x + 3).
  const bare = (rs: number[]) => (rs.length === 1 && rs[0] !== 0 ? factorText(rs[0]).slice(1, -1) : factors(rs));
  const num = t.length ? (leadText && t.length === 1 ? `${leadText}${factors(t)}` : `${leadText}${bare(t)}`) : String(lead);
  if (!b.length) return num;
  return `(${num})/(${bare(b)})`;
}

export const rexpNpv = pc30s('30s-rexp-npv', {
  points: 1,
  levels: { 1: 'Linear denominator', 2: 'Quadratic denominator', 3: 'Denominator with a common factor' },
  options: [
    radioOption('form', 'Denominator', [['1', 'Linear denominator'], ['2', 'Quadratic denominator'], ['3', 'Denominator with a common factor']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    const top = fromRoots(picks(rng, 1, [], -N, N));
    let bottomRoots: number[], bottom: number[];
    if (difficulty === 1) { const a = rng.int(1, 4), r = rng.int(-N, N); bottomRoots = []; bottom = [a, -a * r]; const nv = new Q(a * r, a); return npvProblem(poly(top), poly(bottom), [nv], rng); }
    if (difficulty === 2) { bottomRoots = picks(rng, 2, [], -N, N); bottom = fromRoots(bottomRoots); }
    else { const [r] = picks(rng, 1, [0], 1, N); bottomRoots = [0, r, -r]; bottom = fromRoots(bottomRoots, rng.pick([1, 2])); }
    return npvProblem(poly(top), poly(bottom), bottomRoots.map((r) => new Q(r)), rng);
  },
});

function npvProblem(top: string, bottom: string, values: Q[], rng: Rng) {
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const answer = `x != ${sorted.map((v) => v.typst()).join(', ')}`;
  return {
    body: `State the non-permissible values of ${math(frac(top, bottom))}.`,
    answer: math(answer),
    distractors: [`x != ${sorted.map((v) => v.neg().typst()).sort().join(', ')}`, `x != ${sorted.slice(0, 1).map((v) => v.typst()).join(', ')}`, `x != 0`, `x != ${rng.int(7, 9)}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
    solution: `A rational expression is undefined where its denominator is 0. Solve ${math(`${bottom} = 0`)}: ${math(answer)}.`,
  };
}

export const rexpSimplify = pc30s('30s-rexp-simplify', {
  levels: { 1: 'Monomials and a common factor', 2: 'Trinomial over binomial', 3: 'Trinomials, and opposite factors' },
  options: [
    radioOption('form', 'Expression', [['1', 'Monomials and a common factor'], ['2', 'Trinomial over binomial'], ['3', 'Trinomials, and opposite factors']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    if (difficulty === 1) {
      const k = rng.int(2, 6), r = rng.nonZero(-N, N), m = rng.int(2, 4);
      // k(x − r) / (m k (x − r)) = 1/m, or (k x − k r)/(x − r) = k
      const top = [k, -k * r], bottom = rng.next() < 0.5 ? [1, -r] : [m * k, -m * k * r];
      const answer = bottom[0] === 1 ? `${k}, x != ${r}` : `1/${m}, x != ${r}`;
      return {
        body: `Simplify, and state the non-permissible values: ${math(frac(poly(top), poly(bottom)))}`,
        answer: math(answer),
        distractors: [bottom[0] === 1 ? `${k}` : `1/${m}`, bottom[0] === 1 ? `${k}, x != ${-r}` : `${m}, x != ${r}`, bottom[0] === 1 ? `${k}x, x != ${r}` : `1/${m}, x != 0`].map(math),
        solution: `Factor: ${math(frac(`${times(k, r)}`, bottom[0] === 1 ? factorText(r) : `${times(m * k, r)}`))}. Cancel ${math(factorText(r))}, noting ${math(`x != ${r}`)}: ${math(answer)}.`,
      };
    }
    const [shared, t, b] = picks(rng, 3, [], -N, N);
    const topRoots = [shared, t], bottomRoots = difficulty === 2 ? [shared] : [shared, b];
    const lead = difficulty === 3 ? rng.pick([1, 2, -1]) : 1;
    const top = fromRoots(topRoots, lead), bottom = fromRoots(bottomRoots);
    const npv = npvText(bottomRoots);
    const answer = `${simplified(topRoots, bottomRoots, lead)}, ${npv}`;
    return {
      body: `Simplify, and state the non-permissible values: ${math(frac(poly(top), poly(bottom)))}`,
      answer: math(answer),
      distractors: [
        simplified(topRoots, bottomRoots, lead),
        `${simplified(topRoots, bottomRoots, lead)}, ${npvText(bottomRoots.filter((r) => r !== shared).concat(bottomRoots.length === 1 ? [t] : []))}`,
        `${simplified(topRoots.map((r) => -r), bottomRoots.map((r) => -r), lead)}, ${npv}`,
        `${simplified(topRoots, bottomRoots, -lead)}, ${npv}`,
      ].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Factor: ${math(frac(`${lead === 1 ? '' : lead === -1 ? '-' : lead}${factors(topRoots)}`, factors(bottomRoots)))}. The non-permissible values come from the original denominator: ${math(npv)}. Cancel the common factor ${math(factorText(shared))}: ${math(answer)}.`,
    };
  },
});

export const rexpEquivalent = pc30s('30s-rexp-equivalent', {
  levels: { 1: 'Multiply by a monomial', 2: 'Multiply by a binomial', 3: 'Match a given denominator' },
  options: [
    radioOption('form', 'Multiply by', [['1', 'Multiply by a monomial'], ['2', 'Multiply by a binomial'], ['3', 'Match a given denominator']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    const [p, q] = picks(rng, 2, [], -N, N);
    const top = [rng.int(1, 5), rng.int(-6, 6)];
    if (difficulty === 1) {
      const k = rng.int(2, 5);
      const answer = `${frac(poly(polyMul(top, [k, 0])), poly(polyMul([1, -p], [k, 0])))}, ${npvText([0, p])}`;
      return {
        body: `Multiply the numerator and denominator of ${math(frac(poly(top), poly([1, -p])))} by ${math(`${k}x`)}. State the non-permissible values of the new expression.`,
        answer: math(answer),
        distractors: [frac(poly(polyMul(top, [k, 0])), poly(polyMul([1, -p], [k, 0]))) + `, x != ${p}`, frac(poly(polyMul(top, [k, 0])), poly([1, -p])) + `, x != ${p}`, frac(poly(top.map((c) => c * k)), poly([k, -k * p])) + `, x != ${p}`].map(math),
        solution: `Multiplying by ${math(`(${k}x)/(${k}x)`)} gives an equivalent expression, but ${math('x = 0')} now also makes the denominator 0: ${math(answer)}.`,
      };
    }
    const newTop = polyMul(top, [1, -q]), newBottom = polyMul([1, -p], [1, -q]);
    const answer = `${frac(poly(newTop), poly(newBottom))}, ${npvText([p, q])}`;
    return {
      body: difficulty === 2
        ? `Multiply the numerator and denominator of ${math(frac(poly(top), poly([1, -p])))} by ${math(factorText(q))}. State the non-permissible values.`
        : `Write an expression equivalent to ${math(frac(poly(top), poly([1, -p])))} with denominator ${math(poly(newBottom))}, and state the non-permissible values.`,
      answer: math(answer),
      distractors: [`${frac(poly(newTop), poly(newBottom))}, ${npvText([p])}`, `${frac(poly(polyAdd(top, [0, -q])), poly(newBottom))}, ${npvText([p, q])}`, `${frac(poly(top), poly(newBottom))}, ${npvText([p, q])}`].map(math),
      solution: `${difficulty === 3 ? `${math(poly(newBottom))} factors as ${math(`${factorText(p)}${factorText(q)}`)}, so multiply` : 'Multiply'} the numerator by ${math(factorText(q))} too: ${math(`(${poly(top)})${factorText(q)} = ${poly(newTop)}`)}. Both ${math(`x = ${p}`)} and ${math(`x = ${q}`)} make the new denominator 0: ${math(answer)}.`,
    };
  },
});

export const rexpFindError = pc30s('30s-rexp-find-error', {
  levels: { 1: 'Cancelling terms instead of factors', 2: 'A factoring slip', 3: 'Opposite factors' },
  options: [
    radioOption('form', 'Error', [['1', 'Cancelling terms instead of factors'], ['2', 'A factoring slip'], ['3', 'Opposite factors']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    const [a, b0] = picks(rng, 2, [0], 1, N + 1);
    // b >= 2 at level 1, so the student's answer really is wrong ((x + a)/(x + a) would be 1).
    const b = difficulty === 1 && b0 === 1 ? a + 1 : b0;
    if (difficulty === 1) {
      const top = `x + ${a * b}`, bottom = `x + ${a}`;
      return {
        body: `A student simplified ${math(frac(top, bottom))} to ${math(String(b))}. Find the error and give the correct simplification.`,
        task: { instruction: 'A student simplified each expression as shown. Find the error and give the correct simplification.', item: `${math(frac(top, bottom))} to ${math(String(b))}` },
        answer: `It cannot be simplified: ${math(`${frac(top, bottom)}, x != ${-a}`)}.`,
        distractors: [`${math(`${b}, x != ${-a}`)}`, `${math(`x + ${b}, x != ${-a}`)}`, `${math(`${a * b - a}, x != ${-a}`)}`],
        solution: `Only common factors can be cancelled, not terms. ${math(top)} and ${math(bottom)} have no common factor, so the expression is already in simplest form, with ${math(`x != ${-a}`)}.`,
      };
    }
    if (difficulty === 2) {
      const top = poly(fromRoots([a, -a])), bottom = poly([1, -a]);
      return {
        body: `A student simplified ${math(frac(top, bottom))} to ${math(`x - ${a}`)}. Find the error and give the correct simplification.`,
        task: { instruction: 'A student simplified each expression as shown. Find the error and give the correct simplification.', item: `${math(frac(top, bottom))} to ${math(`x - ${a}`)}` },
        answer: math(`x + ${a}, x != ${a}`),
        distractors: [`x - ${a}, x != ${a}`, `x + ${a}, x != ${-a}`, `x^2 - ${a}, x != ${a}`].map(math),
        solution: `${math(top)} factors as ${math(`(x - ${a})(x + ${a})`)}, not ${math(`(x - ${a})^2`)}. Cancelling ${math(`x - ${a}`)} leaves ${math(`x + ${a}`)}, with ${math(`x != ${a}`)}.`,
      };
    }
    return {
      body: `A student simplified ${math(frac(`${a} - x`, `x - ${a}`))} to ${math('1')}. Find the error and give the correct simplification.`,
      answer: math(`-1, x != ${a}`),
      distractors: [`1, x != ${a}`, `-1, x != ${-a}`, `0, x != ${a}`].map(math),
      solution: `${math(`${a} - x = -(x - ${a})`)}, so the factors are opposites and the quotient is ${math('-1')}, with ${math(`x != ${a}`)}.`,
    };
  },
});

export const rexpMultiplyDivide = pc30s('30s-rexp-multiply-divide', {
  levels: { 1: 'Monomials', 2: 'Multiply with factoring', 3: 'Divide with factoring' },
  options: [
    radioOption('form', 'Operation', [['1', 'Monomials'], ['2', 'Multiply with factoring'], ['3', 'Divide with factoring']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    if (difficulty === 1) {
      const a = rng.int(2, 6), b = rng.int(2, 6), c = rng.int(2, 6), d = rng.int(2, 6);
      const value = new Q(a * c, b * d);
      // value·x, written as 3x, x, (3x)/4, or x/4.
      const vx = (q: Q) => (q.isInt ? (q.n === 1 ? 'x' : `${q.n}x`) : q.n === 1 ? `x/${q.d}` : `(${q.n}x)/${q.d}`);
      const answer = `${vx(value)}, x != 0, y != 0`;
      return {
        body: `Simplify, and state the non-permissible values: ${math(`(${a}x^2)/(${b}y) dot (${c}y)/(${d}x)`)}`,
        answer: math(answer),
        distractors: [vx(value), `${vx(new Q(a * d, b * c))}, x != 0, y != 0`, `${vx(value)}, x != 0`].map(math),
        solution: `Multiply and cancel common factors: ${math(`(${a * c}x^2 y)/(${b * d}x y) = ${vx(value)}`)}. The original denominators give ${math('x != 0')} and ${math('y != 0')}.`,
      };
    }
    const [p, q, r, s] = picks(rng, 4, [], -N, N);
    // Multiply: (x − p)(x − q)/((x − r)(x − p)) · (x − r)/(x − s)  →  (x − q)/(x − s)
    const f1Top = [p, q], f1Bottom = [r, p], f2Top = [r], f2Bottom = [s];
    const divide = difficulty === 3;
    // For division, write the second fraction upside down: ÷ (x − s)/(x − r).
    const second = divide ? frac(poly(fromRoots(f2Bottom)), poly(fromRoots(f2Top))) : frac(poly(fromRoots(f2Top)), poly(fromRoots(f2Bottom)));
    const npv = npvText(divide ? [r, p, s, r] : [r, p, s]);
    const answer = `${simplified([...f1Top, ...f2Top], [...f1Bottom, ...f2Bottom])}, ${npv}`;
    return {
      body: `Simplify, and state the non-permissible values: ${math(`${frac(poly(fromRoots(f1Top)), poly(fromRoots(f1Bottom)))} ${divide ? 'div' : 'dot'} ${second}`)}`,
      answer: math(answer),
      distractors: [
        simplified([...f1Top, ...f2Top], [...f1Bottom, ...f2Bottom]),
        `${simplified([...f1Top, ...f2Bottom], [...f1Bottom, ...f2Top])}, ${npv}`,
        `${simplified([...f1Top, ...f2Top], [...f1Bottom, ...f2Bottom])}, ${npvText([s])}`,
      ].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `${divide ? `Multiply by the reciprocal of the second fraction. ` : ''}Factor everything: ${math(`${frac(factors(f1Top), factors(f1Bottom))} dot ${frac(factors(f2Top), factors(f2Bottom))}`)}. `
        + `Non-permissible values come from every denominator${divide ? ', including the numerator of the divisor' : ''}: ${math(npv)}. Cancel common factors: ${math(answer)}.`,
    };
  },
});

export const rexpSameDenominator = pc30s('30s-rexp-same-denominator', {
  levels: { 1: 'Monomial numerators', 2: 'Binomial numerators', 3: 'Result simplifies' },
  options: [
    radioOption('form', 'Numerators', [['1', 'Monomial numerators'], ['2', 'Binomial numerators'], ['3', 'Result simplifies']], ['1', '2', '3']),
    radioOption('op', 'Operation', [['add', 'Add'], ['subtract', 'Subtract'], ['either', 'Either']], ['either', 'either', 'either']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    // p ≠ 0, so monomial numerators over x − p never cancel by accident.
    const [p] = picks(rng, 1, [0]);
    const op = optOne(o, 'op', 'either');
    const plus = op === 'either' ? rng.next() < 0.5 : op === 'add';
    let n1: number[], n2: number[];
    if (difficulty === 3) {
      // Choose numerators whose sum or difference is k(x − p), which cancels.
      const k = rng.int(2, 5), a = rng.int(1, 6), b = rng.int(-6, 6);
      n1 = [k + a, -k * p + b];
      n2 = plus ? [-a, -b] : [a, b];
    } else {
      // Different numerators, so a difference never collapses to 0.
      do {
        n1 = difficulty === 1 ? [rng.int(1, 9), 0] : [rng.int(1, 5), rng.int(-9, 9)];
        n2 = difficulty === 1 ? [rng.int(1, 9), 0] : [rng.int(1, 5), rng.int(-9, 9)];
      } while (n1[0] === n2[0] && n1[1] === n2[1]);
    }
    const result = polyAdd(n1, n2, plus ? 1 : -1);
    const den = poly([1, -p]);
    const k = result.length === 2 && result[0] !== 0 && result[1] === -result[0] * p ? result[0] : null;
    const answer = k !== null ? `${k}, x != ${p}` : `${frac(poly(result), den)}, x != ${p}`;
    const signSlip = polyAdd(n1, n2.map((c, i) => (i === 0 ? c : -c)), plus ? 1 : -1);
    return {
      body: `Simplify, and state the non-permissible values: ${math(`${frac(poly(n1), den)} ${plus ? '+' : '-'} ${frac(poly(n2), den)}`)}`,
      answer: math(answer),
      // Adding the denominators, a sign slip on the second numerator, the opposite operation, or the wrong restriction.
      distractors: [`${frac(poly(result), `2(${den})`)}, x != ${p}`, `${frac(poly(signSlip), den)}, x != ${p}`, `${frac(poly(polyAdd(n1, n2, plus ? -1 : 1)), den)}, x != ${p}`, `${frac(poly(result), den)}, x != ${-p}`]
        .filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `The denominators are the same, so ${plus ? 'add' : 'subtract'} the numerators${plus ? '' : ' (subtract every term of the second numerator)'}: ${math(`${frac(`${poly(n1)} ${plus && n2[0] > 0 ? `+ ${poly(n2)}` : `${plus ? '+' : '-'} (${poly(n2)})`}`, den)} = ${frac(poly(result), den)}`)}${k !== null ? ` ${math(`= (${k === 1 ? '' : k === -1 ? '-' : k}${factorText(p)})/${factorText(p)} = ${k}`)}` : ''}, with ${math(`x != ${p}`)}.`,
    };
  },
});

export const rexpDifferentDenominator = pc30s('30s-rexp-different-denominator', {
  levels: { 1: 'Monomial denominators', 2: 'Two binomial denominators', 3: 'Denominators with a common factor' },
  options: [
    radioOption('form', 'Denominators', [['1', 'Monomial denominators'], ['2', 'Two binomial denominators'], ['3', 'Denominators with a common factor']], ['1', '2', '3']),
    radioOption('op', 'Operation', [['add', 'Add'], ['subtract', 'Subtract'], ['either', 'Either']], ['either', 'either', 'either']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    const op = optOne(o, 'op', 'either');
    const plus = op === 'either' ? rng.next() < 0.5 : op === 'add', sign = plus ? 1 : -1;
    if (difficulty === 1) {
      const a = rng.int(1, 9), b = rng.int(1, 9), c = rng.int(2, 5), d = rng.int(2, 5);
      // a/(c x) ± b/(d x²): LCD c·d·x² reduced
      const top = `${a * d}x ${plus ? '+' : '-'} ${b * c}`;
      return {
        body: `Simplify, and state the non-permissible values: ${math(`${a}/(${c}x) ${plus ? '+' : '-'} ${b}/(${d}x^2)`)}`,
        answer: math(`(${top})/(${c * d}x^2), x != 0`),
        distractors: [`(${a} ${plus ? '+' : '-'} ${b})/(${c * d}x^3), x != 0`, `(${a * d}x ${plus ? '-' : '+'} ${b * c})/(${c * d}x^2), x != 0`, `(${a + b})/(${c + d}x^2), x != 0`].map(math),
        solution: `The lowest common denominator is ${math(`${c * d}x^2`)}: ${math(`(${a * d}x)/(${c * d}x^2) ${plus ? '+' : '-'} ${b * c}/(${c * d}x^2) = (${top})/(${c * d}x^2)`)}, with ${math('x != 0')}.`,
      };
    }
    const [p, q, r] = picks(rng, 3, [], -N, N);
    const a = rng.nonZero(-5, 5), b = rng.nonZero(-5, 5);
    // a/((x − p)[(x − r)]) ± b/((x − q)[(x − r)])
    const shared = difficulty === 3 ? [r] : [];
    const d1 = [p, ...shared], d2 = [q, ...shared];
    const lcd = [p, q, ...shared];
    const top = polyAdd(polyMul([a], [1, -q]), polyMul([sign * b], [1, -p]));
    const naiveLcd = [p, q, ...shared, ...shared];
    const answer = `${frac(poly(top), factors(lcd))}, ${npvText(lcd)}`;
    return {
      body: `Simplify, and state the non-permissible values: ${math(`${frac(String(a), poly(fromRoots(d1)))} ${plus ? '+' : '-'} ${frac(String(b), poly(fromRoots(d2)))}`)}`,
      answer: math(answer),
      distractors: [
        `${frac(String(a + sign * b), factors(lcd))}, ${npvText(lcd)}`,
        `${frac(poly(polyAdd(polyMul([a], [1, -q]), polyMul([-sign * b], [1, -p]))), factors(lcd))}, ${npvText(lcd)}`,
        difficulty === 3 ? `${frac(poly(polyMul(top, [1, -r])), factors(naiveLcd))}, ${npvText(lcd)}` : `${frac(poly(top), factors(lcd))}, ${npvText([p])}`,
      ].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `${difficulty === 3 ? 'Factor the denominators; the' : 'The'} lowest common denominator is ${math(factors(lcd))}. Rewrite each fraction over it and combine: ${math(`(${times(a, q)} ${plus ? '+' : '-'} ${b < 0 ? `(${times(b, p)})` : times(b, p)})/(${factors(lcd)}) = ${frac(poly(top), factors(lcd))}`)}, with ${math(npvText(lcd))}.`,
    };
  },
});

export const rexpMixed = pc30s('30s-rexp-mixed', {
  levels: { 1: 'Sum, then multiply', 2: 'Difference, then divide', 3: 'Complex fraction' },
  options: [
    radioOption('form', 'Expression', [['1', 'Sum, then multiply'], ['2', 'Difference, then divide'], ['3', 'Complex fraction']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    const [p, q] = picks(rng, 2, [0]);
    if (difficulty === 3) {
      // (1/(x − p) + 1/(x − q)) / (1/((x − p)(x − q)))  =  (x − q) + (x − p)
      const answer = `${poly([2, -p - q])}, ${npvText([p, q])}`;
      return {
        body: `Simplify, and state the non-permissible values: ${math(`(1/${factorText(p)} + 1/${factorText(q)})/(1/(${factors([p, q])}))`)}`,
        answer: math(answer),
        distractors: [poly([2, -p - q]), `1/(${poly([2, -p - q])}), ${npvText([p, q])}`, `${poly([2, p + q])}, ${npvText([p, q])}`].map(math),
        solution: `Multiply the numerator and the denominator by ${math(factors([p, q]))}: the numerator becomes ${math(`${factorText(q)} + ${factorText(p)} = ${poly([2, -p - q])}`)} and the denominator becomes 1. So the result is ${math(answer)}.`,
      };
    }
    const k = rng.int(2, 5);
    if (difficulty === 1) {
      // (k/(x − p) + k/(x − q)) · (x − p)(x − q)/k  =  (x − q) + (x − p)
      const inner = polyAdd([k, -k * q], [k, -k * p]);
      const answer = `${poly([2, -p - q])}, ${npvText([p, q])}`;
      return {
        body: `Simplify, and state the non-permissible values: ${math(`(${k}/${factorText(p)} + ${k}/${factorText(q)}) dot (${factors([p, q])})/${k}`)}`,
        answer: math(answer),
        distractors: [poly([2, -p - q]), `${poly(inner)}, ${npvText([p, q])}`, `${poly([2, p + q])}, ${npvText([p, q])}`].filter((d) => d !== answer).map(math),
        solution: `Add first: ${math(`(${poly(inner)})/(${factors([p, q])})`)}. Multiply and cancel: ${math(`(${poly(inner)})/${k} = ${poly([2, -p - q])}`)}, with ${math(npvText([p, q]))}.`,
      };
    }
    // (k/(x − p) − k/(x − q)) ÷ (x − p)(x − q)/k  =  k·k(p − q)/((x − p)(x − q))²
    const top = k * k * (p - q);
    const answer = `${frac(String(top), `(${factors([p, q])})^2`)}, ${npvText([p, q])}`;
    return {
      body: `Simplify, and state the non-permissible values: ${math(`(${k}/${factorText(p)} - ${k}/${factorText(q)}) div (${factors([p, q])})/${k}`)}`,
      answer: math(answer),
      distractors: [`${frac(String(-top), `(${factors([p, q])})^2`)}, ${npvText([p, q])}`, `${frac(String(k * (p - q)), factors([p, q]))}, ${npvText([p, q])}`, `${k * (p - q)}, ${npvText([p, q])}`].map(math),
      solution: `Subtract first: ${math(`(${times(k, q)} - ${times(k, p)})/(${factors([p, q])}) = ${k * (p - q)}/(${factors([p, q])})`)}. Multiply by the reciprocal of the divisor: ${math(`${k * (p - q)}/(${factors([p, q])}) dot ${k}/(${factors([p, q])}) = ${frac(String(top), `(${factors([p, q])})^2`)}`)}, with ${math(npvText([p, q]))}.`,
    };
  },
});

// ── Rational equations ────────────────────────────────────────────────────

export const reqNpv = pc30s('30s-req-npv', {
  points: 1,
  levels: { 1: 'One denominator', 2: 'Two denominators', 3: 'A quadratic denominator' },
  options: [
    radioOption('form', 'Denominators', [['1', 'One denominator'], ['2', 'Two denominators'], ['3', 'A quadratic denominator']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    // p is never 0, so x/(x - p) never collapses to x/x.
    const [p, q] = picks(rng, 2, [0], -N, N);
    const eq = difficulty === 1 ? `${rng.int(1, 9)}/${factorText(p)} = ${rng.int(1, 9)}`
      : difficulty === 2 ? `${rng.int(1, 9)}/${factorText(p)} = ${rng.int(1, 9)}/${factorText(q)}`
      : `x/${factorText(p)} + ${rng.int(1, 5)}/(${poly(fromRoots([p, q]))}) = 1`;
    const values = difficulty === 1 ? [p] : [p, q];
    const answer = npvText(values);
    return {
      body: `State the non-permissible values for ${math(eq)}.`,
      answer: math(answer),
      distractors: [npvText(values.map((v) => -v)), npvText(values.slice(0, 1).concat([0])), 'x != 0', npvText([...values, 1])].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Any value that makes a denominator 0 is non-permissible: ${math(answer)}.${difficulty === 3 ? ` (Factor ${math(poly(fromRoots([p, q])))} as ${math(factors([p, q]))}.)` : ''}`,
    };
  },
});

export const reqLinear = pc30s('30s-req-linear', {
  levels: { 1: 'a/(x − p) = b/(x − q)', 2: 'Fractions with a monomial denominator', 3: 'A quadratic common denominator' },
  options: [
    radioOption('form', 'Equation', [['1', 'a/(x − p) = b/(x − q)'], ['2', 'Fractions with a monomial denominator'], ['3', 'A quadratic common denominator']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    for (;;) {
      if (difficulty === 1) {
        const [p, q] = picks(rng, 2, [], -N, N); const a = rng.int(1, 6), b = rng.int(1, 6);
        if (a === b) continue;
        // a(x − q) = b(x − p)  →  x = (aq − bp)/(a − b)
        const x = new Q(a * q - b * p, a - b);
        if (!x.isInt || x.eq(p) || x.eq(q)) continue;
        return {
          body: `Solve: ${math(`${a}/${factorText(p)} = ${b}/${factorText(q)}`)}`,
          answer: math(`x = ${x.typst()}`),
          distractors: [new Q(a * q + b * p, a - b), new Q(b * q - a * p, a - b), new Q(a * p - b * q, a - b)].filter((v) => !v.eq(x)).map((v) => math(`x = ${v.typst()}`)).filter((d, i, all) => all.indexOf(d) === i),
          solution: `Multiply both sides by ${math(factors([p, q]))} (${math(npvText([p, q]))}): ${math(`${times(a, q)} = ${times(b, p)}`)}, so ${math(`x = ${x.typst()}`)}.`,
        };
      }
      if (difficulty === 2) {
        const a = rng.int(1, 9), m = rng.pick([2, 3, 4]), x0 = rng.nonZero(-N - 3, N + 3);
        // c/m in lowest terms (no 8/2).
        let c = rng.int(1, 9);
        while (gcd(c, m) !== 1) c = rng.int(1, 9);
        // a/x + c/m = k/(m x) with x0 a solution: m a + c x0 = k
        const k = m * a + c * x0;
        if (k === 0) continue;
        return {
          body: `Solve: ${math(`${a}/x + ${c}/${m} = ${k}/(${m}x)`)}`,
          answer: math(`x = ${x0}`),
          distractors: [new Q(k + m * a, c), new Q(k - a, c), new Q(m * a - k, c)].filter((v) => !v.eq(x0)).map((v) => math(`x = ${v.typst()}`)).filter((d, i, all) => all.indexOf(d) === i),
          solution: `Multiply every term by ${math(`${m}x`)} (${math('x != 0')}): ${math(`${m * a} + ${c === 1 ? '' : c}x = ${k}`)}, so ${math(`x = ${x0}`)}.`,
        };
      }
      const [p] = picks(rng, 1, [0], 1, N); const x0 = rng.int(-N - 3, N + 3);
      if (x0 === p || x0 === -p) continue;
      // 1/(x − p) + 1/(x + p) = k/(x² − p²):  (x + p) + (x − p) = k  →  k = 2x0
      const k = 2 * x0;
      return {
        body: `Solve: ${math(`1/(x - ${p}) + 1/(x + ${p}) = ${k}/(x^2 - ${p * p})`)}`,
        answer: math(`x = ${x0}`),
        distractors: [`x = ${k}`, `x = ${-x0}`, `x = ${x0 + p}`].map(math),
        solution: `Multiply by ${math(`x^2 - ${p * p} = (x - ${p})(x + ${p})`)} (${math(`x != ± ${p}`)}): ${math(`(x + ${p}) + (x - ${p}) = ${k}`)}, so ${math(`2x = ${k}`)} and ${math(`x = ${x0}`)}.`,
      };
    }
  },
});

export const reqQuadratic = pc30s('30s-req-quadratic', {
  levels: { 1: 'An extraneous root', 2: 'Two valid roots', 3: 'No solution' },
  options: [
    radioOption('form', 'Roots', [['1', 'An extraneous root'], ['2', 'Two valid roots'], ['3', 'No solution']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    for (;;) {
      const [p] = picks(rng, 1, [0], 1, Math.max(2, N - 1));
      if (difficulty === 1) {
        // x/(x − p) = 2p²/(x² − p²)  →  x(x + p) = 2p²  →  x = p (extraneous) or x = −2p
        const k = 2 * p * p;
        return {
          body: `Solve: ${math(`x/(x - ${p}) = ${k}/(x^2 - ${p * p})`)}`,
          answer: math(`x = ${-2 * p}`),
          // Keeping the non-permissible root, or sign slips.
          distractors: [`x = ${p}`, `x = ${[p, -2 * p].sort((a, b) => a - b).join(', ')}`, `x = ${2 * p}`].map(math),
          solution: `${math(`x != ± ${p}`)}. Multiply by ${math(`(x - ${p})(x + ${p})`)}: ${math(`x(x + ${p}) = ${k}`)}, so ${math(`(x - ${p})(x + ${2 * p}) = 0`)}. ${math(`x = ${p}`)} is non-permissible, so the only solution is ${math(`x = ${-2 * p}`)}.`,
        };
      }
      if (difficulty === 2) {
        // x/(x − p) = k/(x² − p²) with k = r(r + p): roots r and −r − p
        const r = rng.int(-N, N); const s = -r - p;
        if ([r, s].some((v) => v === p || v === -p) || r === s) continue;
        const k = r * (r + p);
        if (k === 0) continue;
        const sols = [r, s].sort((a, b) => a - b);
        return {
          body: `Solve: ${math(`x/(x - ${p}) = ${k < 0 ? `-${-k}` : k}/(x^2 - ${p * p})`)}`,
          answer: math(`x = ${sols.join(', ')}`),
          distractors: [`x = ${sols[0]}`, `x = ${sols.map((v) => -v).sort((a, b) => a - b).join(', ')}`, `x = ${[p, ...sols].sort((a, b) => a - b).join(', ')}`].map(math),
          solution: `${math(`x != ± ${p}`)}. Multiply by ${math(`x^2 - ${p * p}`)}: ${math(`x(x + ${p}) = ${k}`)}, so ${math(`${poly([1, p, -k])} = 0`)} and ${math(`x = ${sols.join(', ')}`)}. Neither is non-permissible.`,
        };
      }
      // x/(x − p) + c = p/(x − p)  →  x + c(x − p) = p  →  x = p: no solution
      const c = rng.int(1, 5);
      return {
        body: `Solve: ${math(`x/(x - ${p}) + ${c} = ${p}/(x - ${p})`)}`,
        answer: `No solution (${math(`x = ${p}`)} is extraneous).`,
        distractors: [math(`x = ${p}`), math(`x = ${-p}`), math(`x = ${p + c}`)],
        solution: `${math(`x != ${p}`)}. Multiply by ${math(`x - ${p}`)}: ${math(`x + ${c}(x - ${p}) = ${p}`)}, so ${math(`${c + 1}x = ${p * (c + 1)}`)} and ${math(`x = ${p}`)}. That value is non-permissible, so the equation has no solution.`,
      };
    }
  },
});

/** `2x - 3`, `x - 3`: a·x − b for positive a, b. */
const lin = (a: number, b: number) => `${a === 1 ? '' : a}x - ${b}`;

export const reqProblem = pc30s('30s-req-problem', {
  levels: { 1: 'Working together', 2: 'Find one worker’s time', 3: 'A number and its reciprocal' },
  options: [
    radioOption('form', 'Problem', [['1', 'Working together'], ['2', 'Find one worker’s time'], ['3', 'A number and its reciprocal']], ['1', '2', '3']),
    sizeOption([6, 8, 12], [8, 8, 8], 'Largest time (h)'),
    radioOption('context', 'Workers (first two forms)', [['people', 'People painting'], ['pumps', 'Pumps filling a tank'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const T = optNum(o, 'size', 8);
    if (difficulty === 3) {
      const n = rng.int(2, Math.max(3, T - 1)), d = rng.pick([1, 2, 3].filter((v) => v !== n));
      const x = new Q(n, d);
      const sum = x.add(new Q(d, n));
      return {
        body: `The sum of a positive number and its reciprocal is ${math(sum.typst())}. Find the number(s).`,
        answer: math(`${x.typst()} "or" ${new Q(d, n).typst()}`),
        distractors: [math(x.typst()), math(`${x.typst()} "or" ${x.neg().typst()}`), math(sum.div(2).typst())],
        solution: `${math(`x + 1/x = ${sum.typst()}`)}. Multiply by ${math(`${sum.d}x`)}: ${math(`${sum.d}x^2 - ${sum.n}x + ${sum.d} = 0`)}, so ${math(`(${lin(x.d, x.n)})(${lin(x.n, x.d)}) = 0`)} and ${math(`x = ${x.typst()}`)} or ${math(`x = ${new Q(d, n).typst()}`)}. Both check.`,
      };
    }
    const ctx = optOne(o, 'context', 'either');
    const [nameA, nameB] = rng.pick(ctx === 'pumps' ? [['a large pump', 'a small pump']] : ctx === 'people' ? [['Aiden', 'Bria'], ['Sam', 'Priya']] : [['Aiden', 'Bria'], ['a large pump', 'a small pump'], ['Sam', 'Priya']]);
    const a = rng.int(2, T), b = rng.int(a + 1, Math.round(T * 1.5));
    // The job and the people are drawn after the numbers, so a seed's numbers never depend on them.
    const pumps = nameA.includes('pump');
    const [personA, personB] = pumps ? [nameA, nameB] : rng.pick([[nameA, nameB], ['Mei', 'Jordan'], ['Lucas', 'Amara'], ['Noor', 'Ethan'], ['Sofia', 'Kai']]);
    const task = pumps ? rng.pick(['fill a tank', 'fill a swimming pool', 'empty a flooded basement', 'fill a water tower'])
      : rng.pick(['paint a room', 'shovel a driveway', 'mow a lawn', 'stock the shelves at a store', 'rake the leaves in a yard', 'wash all the windows of a house']);
    const together = (a * b) / (a + b);
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    if (difficulty === 1) {
      return {
        body: `${cap(personA)} can ${task} in ${a} h and ${personB} can do it in ${b} h. How long will it take working together? Round to the nearest hundredth of an hour.`,
        answer: math(`${round(together, 2)} "h"`),
        distractors: [round((a + b) / 2, 2), round(a + b, 2), round(b - a, 2)].map((v) => math(`${v} "h"`)),
        solution: `In one hour they complete ${math(`1/${a} + 1/${b}`)} of the job. Solve ${math(`1/${a} + 1/${b} = 1/t`)}: ${math(`t = (${a} dot ${b})/(${a} + ${b}) = ${new Q(a * b, a + b).typst()} approx ${round(together, 2)}`)} h.`,
      };
    }
    const t = new Q(a * b, a + b);
    return {
      body: `Working together, ${personA} and ${personB} can ${task} in ${math(t.typst())} h. ${cap(personA)} alone takes ${a} h. How long would ${personB} take alone?`,
      answer: math(`${b} "h"`),
      distractors: [`${a + b} "h"`, `${round(t.value * 2, 2)} "h"`, `${b - a} "h"`].map(math),
      solution: `${math(`1/${a} + 1/x = 1/(${t.typst()}) = ${new Q(a + b, a * b).typst()}`)}. Then ${math(`1/x = ${new Q(a + b, a * b).typst()} - 1/${a} = ${new Q(1, b).typst()}`)}, so ${math(`x = ${b}`)} h.`,
    };
  },
});

export const RATIONAL_30S = [rexpNpv, rexpSimplify, rexpEquivalent, rexpFindError, rexpMultiplyDivide, rexpSameDenominator, rexpDifferentDenominator, rexpMixed, reqNpv, reqLinear, reqQuadratic, reqProblem];
