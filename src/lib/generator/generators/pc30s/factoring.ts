import type { Rng } from '../../rng.ts';
import { gcd, poly, polynomial } from '../../format.ts';
import { Q } from '../../exact.ts';
import { math, pc30s } from '../pc40s/common.ts';
import { optNum, optOne, radioOption, sizeOption } from '../../options.ts';
import { fromRoots, polyEval, polyMul } from '../pc40s/functions.ts';

/** A linear factor (m·v + p) or (m·v + p·w): `(2x - 3)`, `(x + 4y)`, `x` alone when p = 0 and m = 1. */
function factor(m: number | Q, p: number | Q, v = 'x', w = ''): string {
  const M = Q.of(m), P = Q.of(p);
  const lead = M.eq(1) ? v : M.eq(-1) ? `-${v}` : M.isInt ? `${M.n}${v}` : `${M.typst()} ${v}`;
  if (P.eq(0)) return M.eq(1) ? v : `(${lead})`;
  const tail = `${P.abs().eq(1) && w ? '' : P.abs().typst()}${w}`;
  return `(${lead} ${P.sign < 0 ? '-' : '+'} ${tail})`;
}

/** Distinct non-zero integers. */
function picks(rng: Rng, n: number, lo = -7, hi = 7): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.nonZero(lo, hi));
  return [...out];
}

export const facCommon = pc30s('30s-fac-common', {
  levels: { 1: 'A monomial common factor', 2: 'Two variables', 3: 'A binomial common factor' },
  options: [
    radioOption('form', 'Common factor', [['1', 'A monomial common factor'], ['2', 'Two variables'], ['3', 'A binomial common factor']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of coefficients'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const N = optNum(o, 'size', 5);
      const k = rng.nonZero(-N - 1, N + 1), a = rng.int(1, N), b = rng.nonZero(-N - 2, N + 2);
      const common = factor(1, k);
      const expr = `${a === 1 ? '' : a}x${common} ${b < 0 ? '-' : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}${common}`;
      const answer = `${common}${factor(a, b)}`;
      return {
        body: `Factor: ${math(expr)}`,
        answer: math(answer),
        // A sign slip, the wrong binomial, or adding the coefficients.
        distractors: [`${common}${factor(a, -b)}`, `${factor(1, -k)}${factor(a, b)}`, ...(a + b === 0 ? [] : [`${a + b === 1 ? '' : a + b === -1 ? '-' : a + b}x${common}`])].map(math),
        solution: `${math(common)} is a common factor of both terms: ${math(`${expr} = ${answer}`)}.`,
      };
    }
    let coefs: number[];
    const N = optNum(o, 'size', 5);
    do { coefs = [rng.nonZero(-N, N), rng.nonZero(-N, N), rng.nonZero(-N, N)]; } while (gcd(gcd(coefs[0], coefs[1]), coefs[2]) !== 1);
    // A negative leading term takes the negative sign out with the common factor.
    const g = rng.int(2, N + 1) * (coefs[0] < 0 ? -1 : 1);
    if (g < 0) coefs = coefs.map((c) => -c);
    const lowPower = rng.int(1, 2);
    const y = difficulty === 2;
    // g·x^low·(c0 x² + c1 x + c2) (with a factor of y too at level 2)
    const powers = (e: number) => [['x', e + lowPower], ...(y ? [['y', rng.int(1, 2)]] : [])] as Array<[string, number]>;
    const terms = coefs.map((c, i) => ({ coef: g * c, powers: powers(2 - i) }));
    const yPow = y ? Math.min(...terms.map((t) => t.powers[1][1])) : 0;
    const outside = `${g}x${lowPower === 1 ? '' : `^${lowPower}`}${yPow ? ` ${yPow === 1 ? 'y' : `y^${yPow}`}` : ''}`;
    const innerTerms = terms.map((t) => ({ coef: t.coef / g, powers: [['x', t.powers[0][1] - lowPower], ...(y ? [['y', t.powers[1][1] - yPow]] : [])] as Array<[string, number]> }));
    const answer = `${outside}(${polynomial(innerTerms)})`;
    return {
      body: `Factor completely: ${math(polynomial(terms))}`,
      answer: math(answer),
      distractors: [
        `${g}(${polynomial(terms.map((t) => ({ ...t, coef: t.coef / g })))})`,
        `${g}x(${polynomial(terms.map((t) => ({ coef: t.coef / g, powers: [['x', t.powers[0][1] - 1], ...t.powers.slice(1)] as Array<[string, number]> })))})`,
        `${outside}(${polynomial(innerTerms.map((t, i) => (i === 2 ? { ...t, coef: -t.coef } : t)))})`,
      ].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `The greatest common factor is ${math(outside)}. Divide each term by it: ${math(answer)}.`,
    };
  },
});

export const facSimpleTrinomial = pc30s('30s-fac-simple-trinomial', {
  levels: { 1: 'x² + bx + c', 2: 'With a common factor first', 3: 'Two variables' },
  options: [
    radioOption('form', 'Trinomial', [['1', 'x² + bx + c'], ['2', 'With a common factor first'], ['3', 'Two variables']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [9, 9, 9], 'Size of the numbers in the factors'),
    radioOption('signs', 'Signs in the factors', [['plus', 'Both +'], ['minus', 'Both −'], ['mixed', 'One + and one −'], ['any', 'Any']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 9), signs = optOne(o, 'signs', 'any');
    // p and q are the roots, so the factors are (x − p)(x − q).
    let [p, q] = picks(rng, 2, 1, N);
    if (signs === 'plus') [p, q] = [-p, -q];
    else if (signs === 'mixed') q = -q;
    else if (signs === 'any') [p, q] = picks(rng, 2, -N, N);
    const k = difficulty === 2 ? rng.pick([2, 3, -2, 5]) : 1;
    const w = difficulty === 3 ? 'y' : '';
    const coefs = polyMul([1, -p], [1, -q]).map((c) => c * k);
    const expr = w ? polynomial([{ coef: coefs[0], powers: [['x', 2]] }, { coef: coefs[1], powers: [['x', 1], ['y', 1]] }, { coef: coefs[2], powers: [['y', 2]] }]) : poly(coefs);
    const lead = k === 1 ? '' : k === -1 ? '-' : String(k);
    const answer = `${lead}${factor(1, -p, 'x', w)}${factor(1, -q, 'x', w)}`;
    return {
      body: `Factor completely: ${math(expr)}`,
      answer: math(answer),
      distractors: [`${lead}${factor(1, p, 'x', w)}${factor(1, q, 'x', w)}`, `${lead}${factor(1, -p, 'x', w)}${factor(1, q, 'x', w)}`, k !== 1 ? `${factor(1, -p, 'x', w)}${factor(1, -q, 'x', w)}` : `${factor(1, p, 'x', w)}${factor(1, -q, 'x', w)}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `${k !== 1 ? `Take out ${math(String(k))} first. ` : ''}Find two integers with product ${math(String(p * q))} and sum ${math(String(-(p + q)))}: ${math(`${-p}`)} and ${math(`${-q}`)}. So ${math(answer)}.`,
    };
  },
});

export const facTrinomial = pc30s('30s-fac-trinomial', {
  levels: { 1: 'Leading coefficient 2 or 3', 2: 'Any leading coefficient', 3: 'Negative leading coefficient' },
  options: [
    radioOption('form', 'Trinomial', [['1', 'Leading coefficient 2 or 3'], ['2', 'Any leading coefficient'], ['3', 'Negative leading coefficient']], ['1', '2', '3']),
    sizeOption([4, 7, 10], [7, 7, 7], 'Size of the constants in the factors'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    for (;;) {
      const m = difficulty === 1 ? rng.pick([1, 2, 3]) : rng.int(1, 5), n = difficulty === 1 ? rng.pick([2, 3]) : rng.int(2, 5);
      const N = optNum(o, 'size', 7);
      const p = rng.nonZero(-N, N), q = rng.nonZero(-N, N);
      if (gcd(m, p) !== 1 || gcd(n, q) !== 1 || m * q + n * p === 0) continue;
      const sign = difficulty === 3 ? -1 : 1;
      const coefs = polyMul([m, p], [n, q]).map((c) => c * sign);
      const lead = sign < 0 ? '-' : '';
      const answer = `${lead}${factor(m, p)}${factor(n, q)}`;
      return {
        body: `Factor completely: ${math(poly(coefs))}`,
        answer: math(answer),
        distractors: [`${lead}${factor(m, -p)}${factor(n, -q)}`, `${lead}${factor(m, q)}${factor(n, p)}`, `${lead}${factor(m, p)}${factor(n, -q)}`, `${sign < 0 ? '' : '-'}${factor(m, p)}${factor(n, q)}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
        solution: `${sign < 0 ? 'Take out −1 first. ' : ''}Find two integers with product ${math(`${m * n} dot ${p * q < 0 ? `(${p * q})` : p * q} = ${m * n * p * q}`)} and sum ${math(String(m * q + n * p))}: ${math(String(m * q))} and ${math(String(n * p))}. Split the middle term and group: ${math(answer)}.`,
      };
    }
  },
});

export const facDifferenceSquares = pc30s('30s-fac-difference-squares', {
  levels: { 1: 'x² − b²', 2: 'a²x² − b²y²', 3: 'With a common factor, or x⁴ − b⁴' },
  options: [
    radioOption('form', 'Expression', [['1', 'x² − b²'], ['2', 'a²x² − b²y²'], ['3', 'With a common factor, or x⁴ − b⁴']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [9, 9, 9], 'Largest square root'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3 && rng.next() < 0.5) {
      const b = rng.int(1, 3);
      return {
        body: `Factor completely: ${math(`x^4 - ${b ** 4}`)}`,
        answer: math(`(x^2 + ${b * b})${factor(1, -b)}${factor(1, b)}`),
        distractors: [`(x^2 + ${b * b})(x^2 - ${b * b})`, `${factor(1, -b)}^2${factor(1, b)}^2`, `(x^2 - ${b * b})^2`].map(math),
        solution: `${math(`x^4 - ${b ** 4} = (x^2 + ${b * b})(x^2 - ${b * b})`)}, and ${math(`x^2 - ${b * b}`)} is a difference of squares again: ${math(`${factor(1, -b)}${factor(1, b)}`)}. (${math(`x^2 + ${b * b}`)} does not factor.)`,
      };
    }
    const a = difficulty === 1 ? 1 : rng.int(2, 7), b = rng.int(1, optNum(o, 'size', 9));
    const k = difficulty === 3 ? rng.pick([2, 3, 5]) : 1;
    const w = difficulty === 1 ? '' : 'y';
    // c·y² (or just c without y), dropping a coefficient of 1 in front of y.
    const cy = (c: number, power = 2) => (w ? `${c === 1 ? '' : c}y${power === 2 ? '^2' : ''}` : String(c));
    const expr = `${k * a * a === 1 ? '' : k * a * a}x^2 - ${cy(k * b * b)}`;
    const lead = k === 1 ? '' : String(k);
    const answer = `${lead}${factor(a, -b, 'x', w)}${factor(a, b, 'x', w)}`;
    return {
      body: `Factor completely: ${math(expr)}`,
      answer: math(answer),
      // A perfect square instead, the coefficient not square-rooted, b² not square-rooted.
      distractors: [`${lead}${factor(a, -b, 'x', w)}^2`, `${lead}${factor(a, b, 'x', w)}^2`, `${lead}${factor(a * a, -b, 'x', w)}${factor(1, b, 'x', w)}`, `${lead}${factor(a, -(b * b), 'x', w)}${factor(a, b * b, 'x', w)}`]
        .filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `${k !== 1 ? `Take out ${k}: ${math(`${k}(${a * a === 1 ? '' : a * a}x^2 - ${cy(b * b)})`)}. ` : ''}${math(`A^2 - B^2 = (A - B)(A + B)`)} with ${math(`A = ${a === 1 ? '' : a}x`)} and ${math(`B = ${cy(b, 1)}`)}: ${math(answer)}.`,
    };
  },
});

export const facPatternTrinomial = pc30s('30s-fac-pattern-trinomial', {
  levels: { 1: 'In x²', 2: 'In (x + k)', 3: 'In (x + k) with a leading coefficient' },
  options: [
    radioOption('form', 'Expression', [['1', 'In x²'], ['2', 'In (x + k)'], ['3', 'In (x + k) with a leading coefficient']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const [p, q] = picks(rng, 2, 1, optNum(o, 'size', 5) + 1).map((v) => v * v);
      const coefs = [1, 0, -(p + q), 0, p * q];
      const [rp, rq] = [Math.sqrt(p), Math.sqrt(q)];
      const answer = `${factor(1, -rp)}${factor(1, rp)}${factor(1, -rq)}${factor(1, rq)}`;
      return {
        body: `Factor completely: ${math(poly(coefs))}`,
        answer: math(answer),
        distractors: [`(x^2 - ${p})(x^2 - ${q})`, `${factor(1, -rp)}^2${factor(1, -rq)}^2`, `(x^2 + ${p})(x^2 + ${q})`].map(math),
        solution: `Let ${math('u = x^2')}: ${math(`u^2 - ${p + q}u + ${p * q} = (u - ${p})(u - ${q})`)}. Substitute back and factor each difference of squares: ${math(answer)}.`,
      };
    }
    const N = optNum(o, 'size', 5);
    const k = rng.nonZero(-N, N);
    const a = difficulty === 3 ? rng.pick([2, 3]) : 1;
    const [p, q] = picks(rng, 2, -N - 1, N + 1);
    // a·u² + b·u + c = (a u − a p)(u − q) with u = x + k, written with a primitive first factor.
    const b = -(a * q + a * p), c = a * p * q;
    const u = `(${factor(1, k).slice(1, -1)})`;
    // a·u² + b·u + c, skipping a zero middle term.
    const expr = `${a === 1 ? '' : a}${u}^2${b === 0 ? '' : ` ${b < 0 ? '-' : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}${u}`} ${c < 0 ? '-' : '+'} ${Math.abs(c)}`;
    const answer = `${a === 1 ? '' : a}${factor(1, k - p)}${factor(1, k - q)}`;
    return {
      body: `Factor completely: ${math(expr)}`,
      answer: math(answer),
      // Compare factor pairs as sets, so a reordered copy of the answer is never offered as wrong.
      distractors: ([[-p, -q], [k + p, k + q], [k - p, k + q]] as Array<[number, number]>)
        .filter(([u, v]) => [u, v].sort((m, n) => m - n).join() !== [k - p, k - q].sort((m, n) => m - n).join())
        .map(([u, v]) => `${a === 1 ? '' : a}${factor(1, u)}${factor(1, v)}`).map((d) => d.replace('xx', 'x^2')).filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Let ${math(`u = ${u.slice(1, -1)}`)}: ${math(`${poly([a, b, c], 'u')} = ${a === 1 ? '' : a}(u ${p > 0 ? '-' : '+'} ${Math.abs(p)})(u ${q > 0 ? '-' : '+'} ${Math.abs(q)})`)}. Substitute back and simplify: ${math(answer)}.`,
    };
  },
});

export const facPatternSquares = pc30s('30s-fac-pattern-squares', {
  levels: { 1: '(x + a)² − b²', 2: 'a²(x + k)² − b²y²', 3: '(x + a)² − (x + b)²' },
  options: [
    radioOption('form', 'Expression', [['1', '(x + a)² − b²'], ['2', 'a²(x + k)² − b²y²'], ['3', '(x + a)² − (x + b)²']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    const a = rng.nonZero(-N, N), b = rng.int(1, N + 1);
    const u = factor(1, a);
    if (difficulty === 1) {
      const answer = `${factor(1, a - b)}${factor(1, a + b)}`;
      return {
        body: `Factor completely: ${math(`${u}^2 - ${b * b}`)}`,
        answer: math(answer),
        distractors: [`${factor(1, -b)}${factor(1, b)}`, `${factor(1, a - b * b)}${factor(1, a + b * b)}`, `${factor(1, a - b)}^2`].filter((d) => d !== answer).map(math),
        solution: `This is ${math('A^2 - B^2')} with ${math(`A = ${u.slice(1, -1)}`)} and ${math(`B = ${b}`)}: ${math(`(${u.slice(1, -1)} - ${b})(${u.slice(1, -1)} + ${b}) = ${answer}`)}.`,
      };
    }
    if (difficulty === 2) {
      const m = rng.int(2, 5), n = rng.int(1, 5);
      const A = `${m}x ${m * a < 0 ? '-' : '+'} ${Math.abs(m * a)}`;
      const ny = (k: number) => `${k === 1 ? '' : k}y`;
      const answer = `(${A} - ${ny(n)})(${A} + ${ny(n)})`;
      return {
        body: `Factor completely: ${math(`${m * m}${u}^2 - ${n * n === 1 ? '' : n * n}y^2`)}`,
        answer: math(answer),
        distractors: [`(${m}${u} - ${ny(n)})^2`, `(${m * m}${u} - ${ny(n * n)})(${m * m}${u} + ${ny(n * n)})`, `(${A} - ${ny(n)})(${A} - ${ny(n)})`].map(math),
        solution: `${math(`A = ${m}${u}`)} and ${math(`B = ${n === 1 ? '' : n}y`)}: ${math(`(${m}${u} - ${n === 1 ? '' : n}y)(${m}${u} + ${n === 1 ? '' : n}y)`)}, which expands inside the brackets to ${math(answer)}.`,
      };
    }
    let c = rng.nonZero(-N, N);
    while (c === a || c === -a) c = rng.nonZero(-N, N);
    // (x + a)² − (x + c)² = ((x + a) − (x + c))((x + a) + (x + c)) = (a − c)(2x + a + c)
    const diff = a - c, sum = a + c;
    const inner = gcd(2, sum) === 2 ? `2${factor(1, sum / 2)}` : factor(2, sum);
    const answer = `${diff}${inner}`;
    return {
      body: `Factor completely: ${math(`${u}^2 - ${factor(1, c)}^2`)}`,
      answer: math(answer),
      distractors: [`${-diff}${inner}`, `${diff}${factor(2, a - c)}`, `${a * a - c * c}`].map(math),
      solution: `${math(`A^2 - B^2 = (A - B)(A + B)`)}: ${math(`(${u} - ${factor(1, c)})(${u} + ${factor(1, c)}) = (${diff})(2x ${sum < 0 ? '-' : '+'} ${Math.abs(sum)})`)}${sum % 2 === 0 ? ` ${math(`= ${answer}`)}` : ''}.`,
    };
  },
});

export const facRational = pc30s('30s-fac-rational', {
  levels: { 1: 'x² − 1/c²', 2: 'Fractional coefficient on x²', 3: 'Take out a fraction first' },
  options: [
    radioOption('form', 'Expression', [['1', 'x² − 1/c²'], ['2', 'Fractional coefficient on x²'], ['3', 'Take out a fraction first']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [9, 9, 9], 'Largest denominator'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const D = optNum(o, 'size', 9);
      const c = rng.int(2, D), n = rng.int(1, c - 1);
      const r = new Q(n, c);
      return {
        body: `Factor: ${math(`x^2 - ${r.mul(r).typst()}`)}`,
        answer: math(`${factor(1, r.neg())}${factor(1, r)}`),
        distractors: [`${factor(1, r.mul(r).neg())}${factor(1, r.mul(r))}`, `${factor(1, r.neg())}^2`, `${factor(1, new Q(n, c * c).neg())}${factor(1, new Q(n, c * c))}`].map(math),
        solution: `${math(`${r.mul(r).typst()} = (${r.typst()})^2`)}, so this is a difference of squares: ${math(`${factor(1, r.neg())}${factor(1, r)}`)}.`,
      };
    }
    if (difficulty === 2) {
      const d = rng.int(2, Math.min(5, optNum(o, 'size', 9))), b = rng.int(1, 9);
      const r = new Q(1, d);
      return {
        body: `Factor: ${math(`${r.mul(r).typst()} x^2 - ${b * b}`)}`,
        answer: math(`${factor(r, -b)}${factor(r, b)}`),
        distractors: [`${factor(r.mul(r), -b)}${factor(1, b)}`, `${factor(r, -b)}^2`, `${factor(r, -(b * b))}${factor(r, b * b)}`].map(math),
        solution: `${math(`${r.mul(r).typst()} x^2 = (${r.typst()} x)^2`)} and ${math(`${b * b} = ${b}^2`)}: ${math(`${factor(r, -b)}${factor(r, b)}`)}.`,
      };
    }
    const [p, q] = picks(rng, 2, -6, 6);
    const k = new Q(1, rng.pick([2, 3, 4].filter((v) => v <= optNum(o, 'size', 9))));
    const coefs = polyMul([1, -p], [1, -q]).map((c) => k.mul(c));
    // A quadratic with fractional coefficients: 1/2 x^2 - x - 4.
    const terms = coefs.map((c, i) => ({ c, power: ['x^2', 'x', ''][i] })).filter((t) => !t.c.eq(0));
    const text = terms.map((t, i) => {
      const mag = t.c.abs().eq(1) && t.power ? '' : t.c.abs().typst();
      const body = mag && t.power ? `${mag} ${t.power}` : `${mag}${t.power}`;
      return i === 0 ? `${t.c.sign < 0 ? '-' : ''}${body}` : ` ${t.c.sign < 0 ? '-' : '+'} ${body}`;
    }).join('');
    const answer = `${k.typst()} ${factor(1, -p)}${factor(1, -q)}`;
    return {
      body: `Factor completely: ${math(text)}`,
      answer: math(answer),
      distractors: [`${k.typst()} ${factor(1, p)}${factor(1, q)}`, `${factor(1, -p)}${factor(1, -q)}`, `${k.typst()} ${factor(1, -p)}${factor(1, q)}`].map(math),
      solution: `Take out ${math(k.typst())}: ${math(`${k.typst()}(${poly(polyMul([1, -p], [1, -q]))})`)}. Then factor the trinomial: ${math(answer)}.`,
    };
  },
});

export const facIsFactor = pc30s('30s-fac-is-factor', {
  points: 1,
  levels: { 1: 'x − a and a quadratic', 2: 'x + a and a quadratic', 3: 'ax − b and a quadratic' },
  options: [
    radioOption('form', 'Factor', [['1', 'x − a and a quadratic'], ['2', 'x + a and a quadratic'], ['3', 'ax − b and a quadratic']], ['1', '2', '3']),
    radioOption('answer', 'Answer', [['mixed', 'Yes or no'], ['yes', 'Always yes'], ['no', 'Always no']], ['mixed', 'mixed', 'mixed']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const ans = optOne(o, 'answer', 'mixed');
    const yes = ans === 'mixed' ? rng.next() < 0.5 : ans === 'yes';
    const [p, q] = picks(rng, 2, -7, 7);
    if (difficulty === 3) {
      const m = rng.pick([2, 3]), r = rng.nonZero(-5, 5);
      const quad = polyMul([m, -r], [1, -q]);
      const test = yes ? new Q(r, m) : new Q(r + 1, m);
      const value = quad.reduce((acc, c) => acc.mul(test).add(c), new Q(0));
      const f = factor(m, -(yes ? r : r + 1));
      return {
        body: `Is ${math(f)} a factor of ${math(poly(quad))}?`,
        answer: `${value.eq(0) ? 'Yes' : 'No'}: substituting ${math(`x = ${test.typst()}`)} gives ${math(value.typst())}.`,
        distractors: [`${value.eq(0) ? 'No' : 'Yes'}: substituting ${math(`x = ${test.typst()}`)} gives ${math(value.typst())}.`, `${value.eq(0) ? 'No' : 'Yes'}: substituting ${math(`x = ${test.neg().typst()}`)} gives ${math(value.eq(0) ? '1' : '0')}.`, `Yes: the constant term is divisible by ${m}.`],
        solution: `${math(f)} is a factor exactly when ${math(`x = ${test.typst()}`)} makes the polynomial 0. It gives ${math(value.typst())}, so it ${value.eq(0) ? 'is' : 'is not'} a factor.`,
      };
    }
    const quad = fromRoots([p, q]);
    const a = yes ? p : rng.pick([p + 1, -p, q - 1].filter((v) => v !== p && v !== q));
    const f = factor(1, -a);
    const value = polyEval(quad, a);
    return {
      body: `Is ${math(f)} a factor of ${math(poly(quad))}?`,
      answer: `${value === 0 ? 'Yes' : 'No'}: substituting ${math(`x = ${a}`)} gives ${math(String(value))}.`,
      distractors: [`${value === 0 ? 'No' : 'Yes'}: substituting ${math(`x = ${a}`)} gives ${math(String(value))}.`, `${value === 0 ? 'No' : 'Yes'}: substituting ${math(`x = ${-a}`)} gives ${math(String(polyEval(quad, -a)))}.`, `${value === 0 ? 'No' : 'Yes'}: substituting ${math(`x = ${a}`)} gives ${math(String(value === 0 ? 2 : 0))}.`].filter((d, i, all) => all.indexOf(d) === i),
      solution: `${math(f)} is a factor exactly when ${math(`x = ${a}`)} makes the expression 0: ${math(`${poly(quad).replace(/x/g, `(${a})`)} = ${value}`)}. So it ${value === 0 ? 'is' : 'is not'} a factor${value === 0 ? `: ${math(poly(quad))} = ${math(`${factor(1, -p)}${factor(1, -q)}`)}` : ''}.`,
    };
  },
});

export const FACTORING_30S = [facCommon, facSimpleTrinomial, facTrinomial, facDifferenceSquares, facPatternTrinomial, facPatternSquares, facRational, facIsFactor];

