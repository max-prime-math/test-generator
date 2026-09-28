import { poly, round } from '../../format.ts';
import { Q, simplifySqrt, Surds } from '../../exact.ts';
import { math, pc30s } from '../pc40s/common.ts';
import { optNum, optOne, radioOption, sizeOption } from '../../options.ts';

/** `3sqrt(2)`, `sqrt(5)`, `-2sqrt(3)`, `6`. */
const mixed = (c: number, r: number) => Surds.of(c, r).typst();
/** `2root(3, 5)` for cube roots. */
const cubeMixed = (c: number, r: number) => (r === 1 ? String(c) : `${c === 1 ? '' : c === -1 ? '-' : c}root(3, ${r})`);
const SQUARE_FREE = [2, 3, 5, 6, 7, 10, 11];
/** `ax + b` written tidily: `3x - 2`, `-x`, `x + 4`. */
const linear = (a: number, b: number) => `${a === 1 ? '' : a === -1 ? '-' : a}x${b === 0 ? '' : ` ${b < 0 ? '-' : '+'} ${Math.abs(b)}`}`;

// ── Absolute value ─────────────────────────────────────────────────────────

export const absEvaluate = pc30s('30s-abs-evaluate', {
  points: 1,
  levels: { 1: 'Single absolute values', 2: 'Expressions with several absolute values', 3: 'Radicals and fractions' },
  options: [
    radioOption('form', 'Expression', [['1', 'Single absolute values'], ['2', 'Expressions with several absolute values'], ['3', 'Radicals and fractions']], ['1', '2', '3']),
    sizeOption([10, 15, 25], [15, 15, 15], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const N = optNum(o, 'size', 15);
      const a = rng.int(2, N), b = rng.int(2, N);
      const single = rng.next() < 0.5;
      // |−a| = a, or |a − (a + b)| = b.
      const expr = single ? `|-${a}|` : `|${a} - ${a + b}|`;
      const value = single ? a : b;
      return {
        body: `Evaluate: ${math(expr)}`,
        answer: math(String(value)),
        distractors: [String(-value), String(single ? 0 : 2 * a + b), String(value + 1)].map(math),
        solution: `The absolute value is the distance from 0, so it is never negative: ${math(`${expr} = ${value}`)}.`,
      };
    }
    if (difficulty === 2) {
      const N = optNum(o, 'size', 15);
      const a = rng.int(2, Math.round(N * 0.6)), b = rng.int(a + 1, Math.round(N * 0.8)), c = rng.int(2, Math.round(N * 0.6)), k = rng.int(2, 4);
      const value = (b - a) - c + k * c;
      const expr = `|${a} - ${b}| - |-${c}| + ${k}|${-c}|`;
      return {
        body: `Evaluate: ${math(expr)}`,
        answer: math(String(value)),
        distractors: [String((a - b) - c + k * c), String((b - a) + c + k * c), String((b - a) - c - k * c)].filter((d) => d !== String(value)).map(math),
        solution: math(`${expr} = ${b - a} - ${c} + ${k}(${c}) = ${value}`),
      };
    }
    if (rng.next() < 0.5) {
      const r = rng.pick(SQUARE_FREE), n = Math.floor(Math.sqrt(r)) + rng.pick([0, 1]);
      // |n − √r|: which is bigger decides the sign.
      const bigger = n * n > r;
      const answer = bigger ? `${n} - sqrt(${r})` : `sqrt(${r}) - ${n}`;
      return {
        body: `Evaluate exactly: ${math(`|${n} - sqrt(${r})|`)}`,
        answer: math(answer),
        distractors: [bigger ? `sqrt(${r}) - ${n}` : `${n} - sqrt(${r})`, `${n} + sqrt(${r})`, `-${n} - sqrt(${r})`].map(math),
        solution: `${math(`sqrt(${r}) approx ${round(Math.sqrt(r), 2)}`)}, so ${math(`${n} - sqrt(${r})`)} is ${bigger ? 'positive' : 'negative'} and ${math(`|${n} - sqrt(${r})| = ${answer}`)}.`,
      };
    }
    const p = new Q(rng.int(1, 5), rng.pick([2, 3, 4])), q = new Q(rng.int(1, 5), rng.pick([2, 3, 6]));
    const value = p.sub(q).abs();
    return {
      body: `Evaluate: ${math(`|${p.typst()} - ${q.typst()}|`)}`,
      answer: math(value.typst()),
      distractors: [p.sub(q).neg().abs().eq(value) ? p.add(q) : p.sub(q).neg(), p.add(q), value.add(1)].filter((d) => !d.eq(value)).map((d) => math(d.typst())),
      solution: math(`|${p.typst()} - ${q.typst()}| = |${p.sub(q).typst()}| = ${value.typst()}`),
    };
  },
});

export const absDistance = pc30s('30s-abs-distance', {
  points: 1,
  levels: { 1: 'Integers', 2: 'Decimals and fractions', 3: 'Radicals' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Integers'], ['2', 'Decimals and fractions'], ['3', 'Radicals']], ['1', '2', '3']),
    sizeOption([10, 20, 50], [20, 20, 20], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const r = rng.pick(SQUARE_FREE), a = rng.int(-Math.ceil(optNum(o, 'size', 20) / 3), Math.ceil(optNum(o, 'size', 20) / 3));
      // The distance from −√r to a is |a + √r|.
      const sum = new Surds([[a, 1], [1, r]]);
      const distance = sum.value >= 0 ? sum : sum.scale(-1);
      const answer = distance.typst();
      return {
        body: `Find the exact distance between ${math(`-sqrt(${r})`)} and ${math(String(a))} on a number line.`,
        answer: math(answer),
        distractors: [new Surds([[a, 1], [-1, r]]).typst(), `sqrt(${r})`, String(Math.abs(a)), sum.scale(-1).typst()].filter((d, i, all) => d !== answer && all.indexOf(d) === i && d !== '0').map(math),
        solution: `The distance is ${math(`|${a} - (-sqrt(${r}))| = |${sum.typst()}|`)}. Since ${math(sum.typst())} is ${sum.value >= 0 ? 'positive' : 'negative'}, the distance is ${math(answer)}.`,
      };
    }
    const N = optNum(o, 'size', 20);
    let A: number, B: number;
    do {
      A = difficulty === 1 ? rng.int(-N, N) : rng.int(-N * 5, N * 5) / 10;
      B = difficulty === 1 ? rng.int(-N, N) : rng.int(-N * 5, N * 5) / 10;
    } while (A === B);
    const tidy = (v: number) => Math.round(v * 10) / 10;
    const d = tidy(Math.abs(A - B));
    return {
      body: `Find the distance between ${math(String(A))} and ${math(String(B))} on a number line.`,
      answer: math(String(d)),
      distractors: [tidy(A + B), tidy(Math.abs(A) + Math.abs(B)), -d, tidy(Math.abs(Math.abs(A) - Math.abs(B)))].filter((v, i, all) => v !== d && all.indexOf(v) === i).map((v) => math(String(v))),
      solution: `The distance is the absolute value of the difference: ${math(`|${A} - (${B})| = ${d}`)}.`,
    };
  },
});

export const absOrder = pc30s('30s-abs-order', {
  points: 1,
  levels: { 1: 'Integers', 2: 'Decimals and expressions', 3: 'Radicals' },
  options: [
    radioOption('form', 'Values', [['1', 'Integers'], ['2', 'Decimals and expressions'], ['3', 'Radicals']], ['1', '2', '3']),
    radioOption('count', 'Values to order', [['3', 'Three'], ['4', 'Four'], ['5', 'Five']], ['4', '4', '4']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    // Each item: its text, its absolute value, and the signed number inside (for a common mix-up).
    const items: Array<{ text: string; value: number; signed: number }> = [];
    const used = new Set<number>();
    const count = optNum(o, 'count', 4);
    while (items.length < count) {
      let item: { text: string; value: number; signed: number };
      if (difficulty === 1) { const v = rng.int(-12, 12); item = { text: `|${v}|`, value: Math.abs(v), signed: v }; }
      else if (difficulty === 2) {
        if (rng.next() < 0.5) { const v = rng.int(-95, 95) / 10; item = { text: `|${v}|`, value: Math.abs(v), signed: v }; }
        else { const w = rng.int(-9, 9), v = rng.int(1, 9); item = { text: `|${w} - ${v}|`, value: Math.abs(w - v), signed: w - v }; }
      } else if (rng.next() < 0.6) { const r = rng.int(2, 40), sign = rng.pick([1, -1]); item = { text: `|${sign < 0 ? '-' : ''}sqrt(${r})|`, value: Math.sqrt(r), signed: sign * Math.sqrt(r) }; }
      else { const v = rng.nonZero(-6, 6); item = { text: `|${v}|`, value: Math.abs(v), signed: v }; }
      const key = Math.round(item.value * 1000);
      if (used.has(key)) continue;
      used.add(key); items.push(item);
    }
    const order = (key: (i: typeof items[number]) => number) => [...items].sort((a, b) => key(a) - key(b)).map((i) => i.text).join(', ');
    const answer = order((i) => i.value);
    return {
      body: `Order from least to greatest: ${math(items.map((i) => i.text).join(', '))}`,
      answer: math(answer),
      distractors: [order((i) => -i.value), order((i) => i.signed), items.map((i) => i.text).join(', ')].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Evaluate each: ${items.map((i) => { const exact = Math.abs(i.value * 10 - Math.round(i.value * 10)) < 1e-9; return math(`${i.text} ${exact ? '=' : 'approx'} ${exact ? Math.round(i.value * 10) / 10 : round(i.value, 2)}`); }).join(', ')}. In order: ${math(answer)}.`,
    };
  },
});

// ── Radicals ───────────────────────────────────────────────────────────────

export const radEntireToMixed = pc30s('30s-rad-entire-to-mixed', {
  points: 1,
  levels: { 1: 'Small square roots', 2: 'Larger square roots', 3: 'Cube roots' },
  options: [
    radioOption('form', 'Radicals', [['1', 'Small square roots'], ['2', 'Larger square roots'], ['3', 'Cube roots']], ['1', '2', '3']),
    sizeOption([5, 8, 12], [5, 12, 5], 'Largest coefficient'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const c = rng.int(2, Math.min(5, optNum(o, 'size', 5))) * rng.pick([1, 1, -1]), r = rng.pick([2, 3, 4, 5, 6, 7]);
      const n = c ** 3 * r;
      const answer = cubeMixed(c, r);
      return {
        body: `Write as a mixed radical: ${math(`root(3, ${n})`)}`,
        answer: math(answer),
        distractors: [cubeMixed(c * c, r), `${Math.abs(c)}sqrt(${Math.abs(c) * r})`, cubeMixed(-c, r)].map(math),
        solution: `Find the largest perfect cube factor: ${math(`${n} = ${c ** 3} dot ${r}`)}, so ${math(`root(3, ${n}) = root(3, ${c ** 3}) root(3, ${r}) = ${answer}`)}.`,
      };
    }
    const N = optNum(o, 'size', difficulty === 1 ? 5 : 12);
    const c = difficulty === 1 ? rng.int(2, N) : rng.int(Math.min(4, N - 1), N), r = rng.pick(SQUARE_FREE);
    const n = c * c * r;
    const answer = mixed(c, r);
    // A common slip: using a smaller square factor.
    const small = [2, 3].find((f) => c % f === 0 && f < c);
    return {
      body: `Write as a mixed radical in simplest form: ${math(`sqrt(${n})`)}`,
      answer: math(answer),
      distractors: [small ? `${small}sqrt(${n / (small * small)})` : `${c * c}sqrt(${r})`, `${r}sqrt(${c})`, `${c}sqrt(${r * 2})`, `${c * c}sqrt(${r})`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Find the largest perfect square factor: ${math(`${n} = ${c * c} dot ${r}`)}, so ${math(`sqrt(${n}) = sqrt(${c * c}) sqrt(${r}) = ${answer}`)}.`,
    };
  },
});

export const radMixedToEntire = pc30s('30s-rad-mixed-to-entire', {
  points: 1,
  levels: { 1: 'Square roots', 2: 'Negative coefficients', 3: 'Cube roots' },
  options: [
    radioOption('form', 'Radicals', [['1', 'Square roots'], ['2', 'Negative coefficients'], ['3', 'Cube roots']], ['1', '2', '3']),
    sizeOption([4, 9, 12], [9, 9, 4], 'Largest coefficient'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const c = rng.int(2, Math.min(4, optNum(o, 'size', 4))) * rng.pick([1, -1]), r = rng.int(2, 7);
      const n = c ** 3 * r;
      return {
        body: `Write as an entire radical: ${math(cubeMixed(c, r))}`,
        answer: math(`root(3, ${n})`),
        distractors: [`root(3, ${c * c * r})`, `root(3, ${c * r})`, `root(3, ${-n})`].map(math),
        solution: math(`${cubeMixed(c, r)} = root(3, ${c}^3 dot ${r}) = root(3, ${n})`).replace(`${c}^3`, `(${c})^3`),
      };
    }
    const c = rng.int(2, optNum(o, 'size', 9)) * (difficulty === 2 ? -1 : 1), r = rng.pick(SQUARE_FREE);
    const n = c * c * r;
    const answer = c < 0 ? `-sqrt(${n})` : `sqrt(${n})`;
    return {
      body: `Write as an entire radical: ${math(mixed(c, r))}`,
      answer: math(answer),
      distractors: [`sqrt(${Math.abs(c) * r})`, c < 0 ? `sqrt(${n})` : `sqrt(${c * c + r})`, `sqrt(${2 * Math.abs(c) * r})`].filter((d) => d !== answer).map(math),
      solution: `Move the coefficient inside as its square${c < 0 ? ', keeping the negative sign outside' : ''}: ${math(`${mixed(c, r)} = ${c < 0 ? '-' : ''}sqrt(${c * c} dot ${r}) = ${answer}`)}.`,
    };
  },
});

export const radOrder = pc30s('30s-rad-order', {
  points: 1,
  levels: { 1: 'Three mixed radicals', 2: 'Four mixed radicals', 3: 'Mixed and entire radicals' },
  options: [
    radioOption('form', 'Radicals', [['1', 'Three mixed radicals'], ['2', 'Four mixed radicals'], ['3', 'Mixed and entire radicals']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [6, 6, 6], 'Largest coefficient'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const count = difficulty === 1 ? 3 : 4;
    const items: Array<[string, number]> = [];
    const used = new Set<number>();
    while (items.length < count) {
      const entire = difficulty === 3 && rng.next() < 0.4;
      const c = rng.int(2, optNum(o, 'size', 6)), r = rng.pick([2, 3, 5, 6, 7]);
      const value = c * c * r;
      if (used.has(value)) continue;
      used.add(value);
      items.push([entire ? `sqrt(${value})` : mixed(c, r), value]);
    }
    const sorted = [...items].sort((a, b) => a[1] - b[1]);
    const answer = sorted.map(([t]) => t).join(', ');
    const byCoefficient = [...items].sort((a, b) => parseInt(a[0]) - parseInt(b[0]) || a[1] - b[1]).map(([t]) => t).join(', ');
    // Near misses: two neighbours swapped.
    const swap = (i: number) => { const s = sorted.map(([t]) => t); [s[i], s[i + 1]] = [s[i + 1], s[i]]; return s.join(', '); };
    return {
      body: `Order from least to greatest: ${math(items.map(([t]) => t).join(', '))}`,
      answer: math(answer),
      distractors: [[...sorted].reverse().map(([t]) => t).join(', '), byCoefficient, items.map(([t]) => t).join(', '), swap(0), swap(count - 2)].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Write each as an entire radical and compare the radicands: ${items.map(([t, v]) => math(`${t} = sqrt(${v})`)).join(', ')}. In order: ${math(answer)}.`,
    };
  },
});

export const radAddSubtract = pc30s('30s-rad-add-subtract', {
  levels: { 1: 'Like radicals', 2: 'Simplify first', 3: 'Variable radicands' },
  options: [
    radioOption('form', 'Radicals', [['1', 'Like radicals'], ['2', 'Simplify first'], ['3', 'Variable radicands']], ['1', '2', '3']),
    radioOption('terms', 'Number of terms', [['2', 'Two'], ['3', 'Three'], ['4', 'Four']], ['3', '3', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const r = rng.pick([2, 3, 5, 6, 7]);
    // Each term c·√(k²·r) simplifies to c·k·√r; the total must not cancel to zero.
    let terms: Array<readonly [number, number]>, total: number;
    do {
      terms = Array.from({ length: optNum(o, 'terms', 3) }, () => [rng.nonZero(-6, 6), difficulty === 1 ? 1 : rng.int(1, 4)] as const);
      total = terms.reduce((sum, [c, k]) => sum + c * k, 0);
    } while (total === 0);
    const v = difficulty === 3 ? rng.pick(['x', 'a']) : '';
    const rad = (n: number) => (v ? `sqrt(${n}${v})` : `sqrt(${n})`);
    const expr = terms.map(([c, k], i) => {
      const body = `${Math.abs(c) === 1 ? '' : Math.abs(c)}${rad(k * k * r)}`;
      return i === 0 ? (c < 0 ? `-${body}` : body) : ` ${c < 0 ? '-' : '+'} ${body}`;
    }).join('');
    const answer = `${total === 1 ? '' : total === -1 ? '-' : total}${rad(r)}`;
    const naive = terms.reduce((sum, [c]) => sum + c, 0);
    // Adding radicands, tripling the radicand, the wrong sign, ignoring the signs, or not simplifying first.
    const sumAbs = terms.reduce((sum, [c, k]) => sum + Math.abs(c) * k, 0);
    return {
      body: `Simplify${v ? `, where ${math(`${v} >= 0`)}` : ''}: ${math(expr)}`,
      answer: math(answer),
      distractors: [`${naive}${rad(terms.reduce((sum, [, k]) => sum + k * k * r, 0))}`, `${total}${rad(r * 3)}`, `${-total}${rad(r)}`, `${naive}${rad(r)}`, `${sumAbs}${rad(r)}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i && !/^1s|^-1s|^0/.test(d)).map(math),
      solution: difficulty === 1
        ? `The radicals are alike, so combine the coefficients: ${math(answer)}.`
        : `Simplify each radical: ${[...new Set(terms.filter(([, k]) => k > 1).map(([, k]) => math(`${rad(k * k * r)} = ${k}${rad(r)}`)))].join(', ')}. Then combine like radicals: ${math(answer)}.`,
    };
  },
});

export const radMultiply = pc30s('30s-rad-multiply', {
  levels: { 1: 'Monomials', 2: 'Monomial by binomial', 3: 'Binomial by binomial' },
  options: [
    radioOption('form', 'Factors', [['1', 'Monomials'], ['2', 'Monomial by binomial'], ['3', 'Binomial by binomial']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [6, 6, 6], 'Size of coefficients'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    const r1 = rng.pick([2, 3, 5, 6]), r2 = rng.pick([2, 3, 6, 10]);
    if (difficulty === 1) {
      const a = rng.int(2, N), b = rng.int(2, N);
      const product = Surds.of(a, r1).mul(Surds.of(b, r2));
      return {
        body: `Simplify: ${math(`(${mixed(a, r1)})(${mixed(b, r2)})`)}`,
        answer: math(product.typst()),
        distractors: [`${a * b}sqrt(${r1 * r2})`, mixed(a + b, r1 * r2), Surds.of(a * b, r1 + r2).typst()].filter((d) => d !== product.typst()).map(math),
        solution: `Multiply coefficients and radicands: ${math(`${a * b}sqrt(${r1 * r2}) = ${product.typst()}`)}.`,
      };
    }
    if (difficulty === 2) {
      const a = rng.int(2, N - 1), b = rng.nonZero(-N + 2, N - 2), c = rng.nonZero(-N + 1, N - 1);
      const left = Surds.of(a, r1), right = new Surds([[b, r2], [c, 1]]);
      const product = left.mul(right);
      return {
        body: `Expand and simplify: ${math(`${mixed(a, r1)}(${right.typst()})`)}`,
        answer: math(product.typst()),
        distractors: [left.mul(Surds.of(b, r2)).add(Surds.of(c)).typst(), left.mul(new Surds([[b, r2], [-c, 1]])).typst(), new Surds([[a * b, r1 * r2], [a * c, 1]]).typst()].filter((d, i, all) => d !== product.typst() && all.indexOf(d) === i).map(math),
        solution: `Distribute: ${math(`${mixed(a, r1)} dot ${b < 0 ? `(${mixed(b, r2)})` : mixed(b, r2)} + ${mixed(a, r1)} dot ${c < 0 ? `(${c})` : c} = ${product.typst()}`)}.`,
      };
    }
    const square = rng.next() < 0.4;
    const A = new Surds([[rng.int(1, 3), r1], [rng.nonZero(1 - N, N - 1), 1]]);
    const B = square ? A : new Surds([[rng.int(1, 3), r1], [rng.nonZero(1 - N, N - 1), 1]]);
    const product = A.mul(B);
    const firstLast = new Surds([...A.terms].map(([r, c]) => [c.mul(B.terms.get(r) ?? new Q(0)), r * r] as [Q, number]));
    return {
      body: `Expand and simplify: ${math(square ? `(${A.typst()})^2` : `(${A.typst()})(${B.typst()})`)}`,
      answer: math(product.typst()),
      distractors: [firstLast.typst(), product.add(Surds.of(1)).typst(), A.mul(B.conjugate()).typst()].filter((d, i, all) => d !== product.typst() && all.indexOf(d) === i).map(math),
      solution: `Multiply every term of the first factor by every term of the second, then collect like terms: ${math(product.typst())}.`,
    };
  },
});

export const radDivide = pc30s('30s-rad-divide', {
  levels: { 1: 'Whole-number results', 2: 'Coefficients and radicals', 3: 'Binomial numerator' },
  options: [
    radioOption('form', 'Quotient', [['1', 'Whole-number results'], ['2', 'Coefficients and radicals'], ['3', 'Binomial numerator']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [6, 6, 6], 'Size of coefficients'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const r = rng.pick([2, 3, 5, 6, 7]);
    if (difficulty === 1) {
      const k = rng.int(2, optNum(o, 'size', 6));
      return {
        body: `Simplify: ${math(`sqrt(${k * k * r})/sqrt(${r})`)}`,
        answer: math(String(k)),
        distractors: [String(k * k), mixed(k, r), String(k * r)].map(math),
        solution: math(`sqrt(${k * k * r})/sqrt(${r}) = sqrt(${k * k * r}/${r}) = sqrt(${k * k}) = ${k}`),
      };
    }
    const m = rng.pick([2, 3, 5, 7].filter((v) => v !== r)), a = rng.int(2, optNum(o, 'size', 6)), b = rng.int(1, 3);
    if (difficulty === 2) {
      const top = Surds.of(a * b * 2, r * m);
      const answer = Surds.of(a, m).typst();
      return {
        body: `Simplify: ${math(`(${top.typst()})/(${mixed(2 * b, r)})`)}`,
        answer: math(answer),
        distractors: [Surds.of(a * 4 * b * b, m).typst(), Surds.of(a, r * m).typst(), Surds.of(2 * a * b, m).typst()].filter((d) => d !== answer).map(math),
        solution: `Divide coefficients and radicands: ${math(`${(a * b * 2) / (2 * b)} sqrt(${(r * m) / r}) = ${answer}`)}.`,
      };
    }
    const c = rng.int(1, 4), d = rng.nonZero(-4, 4), n = rng.pick([2, 3]);
    // (n·c·√(r·m) + n·d·√(r·k)) / (n·√r) with m, k different
    const k2 = m === 2 ? 3 : 2;
    const top = new Surds([[n * c, r * m], [n * d, r * k2]]);
    const answer = new Surds([[c, m], [d, k2]]);
    return {
      body: `Simplify: ${math(`(${top.typst()})/(${mixed(n, r)})`)}`,
      answer: math(answer.typst()),
      distractors: [new Surds([[c, m], [n * d, r * k2]]).typst(), new Surds([[c, r * m], [d, r * k2]]).typst(), new Surds([[c, m], [-d, k2]]).typst()].filter((x, i, all) => x !== answer.typst() && all.indexOf(x) === i).map(math),
      solution: `Divide each term of the numerator by ${math(mixed(n, r))}: ${math(answer.typst())}.`,
    };
  },
});

export const radRationalizeMonomial = pc30s('30s-rad-rationalize-monomial', {
  levels: { 1: 'a/√b', 2: 'a/(c√b)', 3: 'Radicals in the numerator too' },
  options: [
    radioOption('form', 'Expression', [['1', 'a/√b'], ['2', 'a/(c√b)'], ['3', 'Radicals in the numerator too']], ['1', '2', '3']),
    sizeOption([6, 12, 20], [12, 12, 12], 'Size of the numerator'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const r = rng.pick([2, 3, 5, 6, 7, 10]);
    const a = difficulty === 3 ? 1 : rng.int(1, optNum(o, 'size', 12)), c = difficulty === 1 ? 1 : rng.int(2, 5);
    const top = difficulty === 3 ? Surds.of(rng.int(1, 4), rng.pick([2, 3, 5].filter((x) => x !== r))) : Surds.of(a);
    const answer = top.mul(Surds.of(1, r)).div(c * r);
    const given = `(${top.typst()})/(${mixed(c, r)})`;
    return {
      body: `Rationalize the denominator: ${math(given)}`,
      answer: math(answer.typst()),
      // Forgetting part of the denominator or the numerator, or thinking √r·√r = 2r.
      distractors: [top.mul(Surds.of(1, r)).div(c).typst(), top.mul(Surds.of(1, r)).div(r).typst(), top.div(c * r).typst(), top.mul(Surds.of(1, r)).div(2 * c * r).typst()].filter((d, i, all) => d !== answer.typst() && all.indexOf(d) === i).map(math),
      solution: `Multiply the numerator and denominator by ${math(`sqrt(${r})`)}: ${math(`${given} dot sqrt(${r})/sqrt(${r}) = (${top.mul(Surds.of(1, r)).typst()})/${c * r} = ${answer.typst()}`)}.`,
    };
  },
});

export const radRationalizeBinomial = pc30s('30s-rad-rationalize-binomial', {
  levels: { 1: '1/(√b ± a)', 2: 'k/(a ± √b)', 3: 'Radicals in both terms' },
  options: [
    radioOption('form', 'Expression', [['1', '1/(√b ± a)'], ['2', 'k/(a ± √b)'], ['3', 'Radicals in both terms']], ['1', '2', '3']),
    sizeOption([2, 4, 6], [4, 4, 4], 'Size of the whole-number term'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const r = rng.pick([2, 3, 5, 6, 7]);
    let den: Surds, top: Surds;
    if (difficulty === 3) {
      const r2 = rng.pick([2, 3, 5].filter((x) => x !== r));
      den = new Surds([[1, r], [rng.pick([1, -1]), r2]]);
      // A radical over the binomial, or the sum when the denominator is the difference (never the denominator itself).
      top = rng.next() < 0.5 || den.typst() === new Surds([[1, r], [1, r2]]).typst() ? Surds.of(rng.int(1, 3), rng.pick([2, 3])) : new Surds([[1, r], [1, r2]]);
    } else {
      const A = optNum(o, 'size', 4);
      let a = rng.nonZero(-A, A);
      while (a * a === r) a = rng.nonZero(-A, A);
      den = difficulty === 1 ? new Surds([[1, r], [a, 1]]) : new Surds([[Math.abs(a), 1], [rng.pick([1, -1]), r]]);
      top = Surds.of(difficulty === 1 ? 1 : rng.int(2, 8));
    }
    const conj = den.conjugate();
    const d = den.mul(conj).rational;
    const answer = top.mul(conj).div(d);
    return {
      body: `Rationalize the denominator: ${math(`(${top.typst()})/(${den.typst()})`)}`,
      answer: math(answer.typst()),
      distractors: [top.mul(conj).div(d.neg()).typst(), top.mul(den).div(d).typst(), top.mul(conj).typst()].filter((x, i, all) => x !== answer.typst() && all.indexOf(x) === i).map(math),
      solution: `Multiply by the conjugate ${math(`(${conj.typst()})/(${conj.typst()})`)}. The denominator becomes a difference of squares, ${math(`(${den.typst()})(${conj.typst()}) = ${d.typst()}`)}, so the result is ${math(answer.typst())}.`,
    };
  },
});

export const radRestrictions = pc30s('30s-rad-restrictions', {
  points: 1,
  levels: { 1: '√(x + a)', 2: '√(ax + b)', 3: 'Radical in a denominator' },
  options: [
    radioOption('form', 'Expression', [['1', '√(x + a)'], ['2', '√(ax + b)'], ['3', 'Radical in a denominator']], ['1', '2', '3']),
    sizeOption([5, 9, 15], [9, 9, 9], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 9);
    const a = rng.nonZero(-Math.ceil(N / 2), Math.ceil(N / 2)), b = rng.int(-N, N);
    if (difficulty === 1) {
      const answer = `x >= ${-b}`;
      return {
        body: `For what values of ${math('x')} is ${math(`sqrt(${linear(1, b)})`)} defined?`,
        answer: math(answer),
        distractors: [`x >= ${b}`, `x > ${-b}`, `x <= ${-b}`].filter((d) => d !== answer).map(math),
        solution: `The radicand must be non-negative: ${math(`${linear(1, b)} >= 0`)}, so ${math(answer)}.`,
      };
    }
    const edge = new Q(-b, a);
    const strict = difficulty === 3;
    const op = a > 0 ? (strict ? '>' : '>=') : (strict ? '<' : '<=');
    const answer = `x ${op} ${edge.typst()}`;
    const radicand = linear(a, b);
    return {
      body: `For what values of ${math('x')} is ${math(strict ? `${rng.int(1, 9)}/sqrt(${radicand})` : `sqrt(${radicand})`)} defined?`,
      answer: math(answer),
      distractors: [`x ${a > 0 ? (strict ? '<' : '<=') : (strict ? '>' : '>=')} ${edge.typst()}`, `x ${strict ? (a > 0 ? '>=' : '<=') : (a > 0 ? '>' : '<')} ${edge.typst()}`, `x ${op} ${edge.neg().typst()}`].filter((d) => d !== answer).map(math),
      solution: `The radicand must be ${strict ? 'positive (it is in a denominator, so it cannot be 0)' : 'non-negative'}: ${math(`${radicand} ${strict ? '>' : '>='} 0`)}, so ${math(answer)}${a < 0 ? ' (dividing by a negative reverses the inequality)' : ''}.`,
    };
  },
});

export const radVariable = pc30s('30s-rad-variable', {
  levels: { 1: '√(k x²)', 2: '√(k xᵐ yⁿ)', 3: 'Products and cube roots' },
  options: [
    radioOption('form', 'Expression', [['1', '√(k x²)'], ['2', '√(k xᵐ yⁿ)'], ['3', 'Products and cube roots']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Largest exponent'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const k = rng.pick([2, 3, 5, 6, 7]), c = rng.int(2, 5);
    if (difficulty === 3 && rng.next() < 0.5) {
      const m = rng.int(1, 2) * 3 + 1; // x⁴ or x⁷
      const n = c ** 3 * k;
      const xp = (e: number) => (e === 1 ? 'x' : `x^${e}`);
      const outside = `${c}${xp((m - 1) / 3)}`;
      return {
        body: `Simplify: ${math(`root(3, ${n}x^${m})`)}`,
        answer: math(`${outside} root(3, ${k}x)`),
        // Dividing the exponent wrongly, taking out only one cube of x, or squaring the coefficient.
        distractors: [`${c}${xp(m - 1)} root(3, ${k}x)`, `${c}x root(3, ${k}${xp(m - 3)})`, `${c * c}${xp((m - 1) / 3)} root(3, ${k}x)`].map(math),
        solution: `Take out perfect cubes: ${math(`${n} = ${c}^3 dot ${k}`)} and ${math(`x^${m} = ${(m - 1) / 3 === 1 ? 'x^3' : `(x^${(m - 1) / 3})^3`} x`)}, so ${math(`root(3, ${n}x^${m}) = ${outside} root(3, ${k}x)`)}.`,
      };
    }
    const E = optNum(o, 'size', 5);
    const m = difficulty === 1 ? 2 : rng.int(2, E), p = difficulty === 1 ? 0 : rng.int(1, E - 1);
    const n = c * c * k;
    const outX = Math.floor(m / 2), inX = m % 2, outY = Math.floor(p / 2), inY = p % 2;
    const pw = (v: string, e: number) => (e === 0 ? '' : e === 1 ? v : `${v}^${e}`);
    const outside = `${c}${pw('x', outX)}${outY ? ` ${pw('y', outY)}` : ''}`;
    const insideParts = [String(k), pw('x', inX), pw('y', inY)].filter(Boolean).join(' ');
    const answer = `${outside} sqrt(${insideParts})`;
    const given = `sqrt(${n}${m ? ` ${pw('x', m)}` : ''}${p ? ` ${pw('y', p)}` : ''})`;
    return {
      body: `Simplify, assuming the variables are non-negative: ${math(given)}`,
      answer: math(answer),
      distractors: [`${c}${pw('x', m)}${p ? ` ${pw('y', p)}` : ''} sqrt(${k})`, `${c * c}${pw('x', outX)} sqrt(${insideParts})`, `${outside} sqrt(${k}${m ? ` ${pw('x', m - 2 * outX + 2)}` : ''})`].filter((d) => d !== answer).map(math),
      solution: `Take the square root of each perfect square factor: ${math(`${n} = ${c}^2 dot ${k}`)}${m ? `, ${math(`${pw('x', m)} = (${pw('x', outX)})^2 ${inX ? 'x' : ''}`)}` : ''}${p ? `, ${math(`${pw('y', p)} = (${pw('y', Math.max(outY, 1))})^2 ${inY ? 'y' : ''}`)}` : ''}. So ${math(`${given} = ${answer}`)}.`,
    };
  },
});

export const radProblem = pc30s('30s-rad-problem', {
  levels: { 1: 'Side of a square from its area', 2: 'Perimeter of a rectangle', 3: 'Diagonal of a rectangle' },
  options: [
    radioOption('form', 'Problem', [['1', 'Side of a square from its area'], ['2', 'Perimeter of a rectangle'], ['3', 'Diagonal of a rectangle']], ['1', '2', '3']),
    sizeOption([5, 8, 12], [8, 8, 8], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const c = rng.int(2, optNum(o, 'size', 8)), r = rng.pick(SQUARE_FREE);
      return {
        body: `A square has an area of ${c * c * r} cm². Find the exact side length in simplest radical form.`,
        answer: math(`${mixed(c, r)} "cm"`),
        distractors: [`${mixed(c * c, r)} "cm"`, `${mixed(r, c)} "cm"`, `${(c * c * r) / 4} "cm"`].map(math),
        solution: math(`s = sqrt(${c * c * r}) = ${mixed(c, r)}`) + ' cm.',
      };
    }
    const r = rng.pick([2, 3, 5]);
    const a = rng.int(1, Math.ceil(optNum(o, 'size', 8) / 2)), b = rng.int(1, Math.ceil(optNum(o, 'size', 8) / 2));
    if (difficulty === 2) {
      const L = Surds.of(1, a * a * r), W = Surds.of(1, b * b * r * 4);
      const P = L.add(W).scale(2);
      return {
        body: `A rectangle measures ${math(`sqrt(${a * a * r})`)} m by ${math(`sqrt(${b * b * r * 4})`)} m. Find its exact perimeter in simplest form.`,
        answer: math(`${P.typst()} "m"`),
        distractors: [`${L.add(W).typst()} "m"`, `${Surds.of(2, a * a * r + b * b * r * 4).typst()} "m"`, `${L.mul(W).typst()} "m"`].map(math),
        solution: `${math(`sqrt(${a * a * r}) = ${Surds.of(1, a * a * r).typst()}`)} and ${math(`sqrt(${b * b * r * 4}) = ${W.typst()}`)}. ${math(`P = 2(${L.typst()} + ${W.typst()}) = ${P.typst()}`)} m.`,
      };
    }
    const L = rng.int(2, optNum(o, 'size', 8) + 1), W = rng.int(1, L - 1);
    const d2 = L * L + W * W;
    const { coef, radicand } = simplifySqrt(d2);
    const answer = mixed(coef, radicand);
    return {
      body: `A rectangle is ${L} cm by ${W} cm. Find the exact length of its diagonal in simplest radical form.`,
      answer: math(`${answer} "cm"`),
      distractors: [`${L + W} "cm"`, `sqrt(${L + W}) "cm"`, `${mixed(1, d2 * 2)} "cm"`].filter((d) => d !== `${answer} "cm"`).map(math),
      solution: math(`d = sqrt(${L}^2 + ${W}^2) = sqrt(${d2})${answer === `sqrt(${d2})` ? '' : ` = ${answer}`}`) + ' cm.',
    };
  },
});

// ── Radical equations ─────────────────────────────────────────────────────

export const radeqRestrictions = pc30s('30s-radeq-restrictions', {
  points: 1,
  levels: { 1: '√(ax + b) = c', 2: '√(x + a) = x + b', 3: 'Two radicals' },
  options: [
    radioOption('form', 'Equation', [['1', '√(ax + b) = c'], ['2', '√(x + a) = x + b'], ['3', 'Two radicals']], ['1', '2', '3']),
    sizeOption([4, 6, 10], [6, 6, 6], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    const a = rng.int(-N, N), b = rng.int(-N, N);
    const lin = (k: number) => (k === 0 ? 'x' : `x ${k < 0 ? '-' : '+'} ${Math.abs(k)}`);
    if (difficulty === 1) {
      const answer = `x >= ${-a}`;
      return {
        body: `State the restriction on ${math('x')} for ${math(`sqrt(${lin(a)}) = ${rng.int(1, 6)}`)}.`,
        answer: math(answer),
        distractors: [`x >= ${a}`, `x > ${-a}`, `x <= ${-a}`].filter((d) => d !== answer).map(math),
        solution: `The radicand must be non-negative: ${math(`${lin(a)} >= 0`)}, so ${math(answer)}.`,
      };
    }
    if (difficulty === 2) {
      const lo = Math.max(-a, -b);
      const answer = `x >= ${lo}`;
      return {
        body: `State the restriction on ${math('x')} for ${math(`sqrt(${lin(a)}) = ${lin(b)}`)}. (The square root is never negative, so the right side cannot be negative either.)`,
        answer: math(answer),
        // One condition only, the weaker condition, a strict inequality, or the reversed inequality.
        distractors: [`x >= ${-a}`, `x >= ${-b}`, `x >= ${Math.min(-a, -b)}`, `x > ${lo}`, `x <= ${lo}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
        solution: `${math(`${lin(a)} >= 0`)} gives ${math(`x >= ${-a}`)}, and ${math(`${lin(b)} >= 0`)} gives ${math(`x >= ${-b}`)}. Both must hold: ${math(answer)}.`,
      };
    }
    const c = rng.int(2, 3), d = rng.int(-N, N);
    const edge2 = new Q(-d, c);
    const lo = Math.max(-a, edge2.value);
    const answer = `x >= ${lo === -a ? -a : edge2.typst()}`;
    return {
      body: `State the restriction on ${math('x')} for ${math(`sqrt(${lin(a)}) = sqrt(${c}x ${d < 0 ? '-' : '+'} ${Math.abs(d)})`)}.`,
      answer: math(answer),
      distractors: [`x >= ${lo === -a ? edge2.typst() : -a}`, `x >= ${a}`, `x >= ${Math.min(-a, edge2.value) === -a ? -a : edge2.typst()}`, `x > ${lo === -a ? -a : edge2.typst()}`, `x <= ${lo === -a ? -a : edge2.typst()}`].filter((x, i, all) => x !== answer && all.indexOf(x) === i).map(math),
      solution: `Both radicands must be non-negative: ${math(`x >= ${-a}`)} and ${math(`x >= ${edge2.typst()}`)}. Both hold when ${math(answer)}.`,
    };
  },
});

const lin = (k: number) => (k === 0 ? 'x' : `x ${k < 0 ? '-' : '+'} ${Math.abs(k)}`);

export const radeqOneRadical = pc30s('30s-radeq-one-radical', {
  levels: { 1: '√(ax + b) = c', 2: '√(ax + b) + d = e', 3: 'k√(x + b) = c' },
  options: [
    radioOption('form', 'Equation', [['1', '√(ax + b) = c'], ['2', '√(ax + b) + d = e'], ['3', 'k√(x + b) = c']], ['1', '2', '3']),
    sizeOption([5, 10, 15], [10, 10, 10], 'Size of the solution'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = difficulty === 3 ? 1 : rng.int(1, 5), cRoot = rng.int(1, 7), x0 = rng.int(-Math.round(optNum(o, 'size', 10) * 0.6), optNum(o, 'size', 10));
    const b = cRoot * cRoot - a * x0; // √(a x0 + b) = cRoot
    const radicand = linear(a, b);
    let equation: string, steps: string;
    if (difficulty === 1) { equation = `sqrt(${radicand}) = ${cRoot}`; steps = ''; }
    else if (difficulty === 2) { const d = rng.nonZero(-6, 6); equation = `sqrt(${radicand}) ${d < 0 ? '-' : '+'} ${Math.abs(d)} = ${cRoot + d}`; steps = `Isolate the radical: ${math(`sqrt(${radicand}) = ${cRoot}`)}. `; }
    else { const k = rng.int(2, 4); equation = `${k}sqrt(${radicand}) = ${k * cRoot}`; steps = `Divide by ${k}: ${math(`sqrt(${radicand}) = ${cRoot}`)}. `; }
    return {
      body: `Solve: ${math(equation)}`,
      answer: math(`x = ${x0}`),
      distractors: [new Q(cRoot - b, a), new Q(cRoot * cRoot + b, a), new Q(-cRoot * cRoot - b, a)].filter((v) => !v.eq(x0)).map((v) => math(`x = ${v.typst()}`)).filter((d, i, all) => all.indexOf(d) === i),
      solution: `${steps}Square both sides: ${math(`${radicand} = ${cRoot * cRoot}`)}, so ${math(`x = ${x0}`)}. Check: ${math(`sqrt(${a * x0 + b}) = ${cRoot}`)}.`,
    };
  },
});

export const radeqExtraneous = pc30s('30s-radeq-extraneous', {
  levels: { 1: 'One valid root', 2: 'Check both roots', 3: 'With a coefficient' },
  options: [
    radioOption('form', 'Equation', [['1', 'One valid root'], ['2', 'Check both roots'], ['3', 'With a coefficient']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [6, 6, 6], 'Size of the solution'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    for (;;) {
      // √(x + a) = x + c has x0 as a root; squaring adds the root 1 − 2c − x0.
      const N = optNum(o, 'size', 6);
      const s = rng.int(1, 4), x0 = rng.int(-Math.round(N * 0.7), N);
      const a = s * s - x0, c = s - x0;
      const other = 1 - 2 * c - x0;
      if (other === x0) continue;
      const otherValid = other + c >= 0 && other + a >= 0;
      if (difficulty === 1 && otherValid) continue;
      const valid = [x0, ...(otherValid ? [other] : [])].sort((p, q) => p - q);
      const answer = `x = ${valid.join(', ')}`;
      const both = `x = ${[x0, other].sort((p, q) => p - q).join(', ')}`;
      return {
        body: `Solve and check for extraneous roots: ${math(`sqrt(${lin(a)}) = ${lin(c)}`)}`,
        answer: math(answer),
        distractors: [both, `x = ${other}`, `x = ${x0 + 1}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
        solution: `Square both sides: ${math(`${lin(a)} = ${c === 0 ? 'x^2' : `(${lin(c)})^2`}`)}, so ${math(`${poly([1, 2 * c - 1, c * c - a])} = 0`)} and ${math(`x = ${x0}`)} or ${math(`x = ${other}`)}. `
          + `Check each in the original equation: ${otherValid ? 'both work.' : `${math(`x = ${other}`)} gives ${math(`sqrt(${other + a}) = ${Math.sqrt(Math.max(other + a, 0)).toFixed(0)}`)} on the left but ${math(String(other + c))} on the right, so it is extraneous.`} ${math(answer)}.`,
      };
    }
  },
});

export const radeqTwoRadicals = pc30s('30s-radeq-two-radicals', {
  levels: { 1: '√(ax + b) = √(cx + d)', 2: '√(x + a) − √x = 1', 3: '√(2x + q) − √x = 1' },
  options: [
    radioOption('form', 'Equation', [['1', '√(ax + b) = √(cx + d)'], ['2', '√(x + a) − √x = 1'], ['3', '√(2x + q) − √x = 1']], ['1', '2', '3']),
    sizeOption([5, 9, 15], [9, 9, 9], 'Size of the solution'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      for (;;) {
        const a = rng.int(1, 5), c = rng.int(1, 5), x0 = rng.int(0, optNum(o, 'size', 9));
        if (a === c) continue;
        const b = rng.int(-5, 9), d = a * x0 + b - c * x0;
        if (a * x0 + b < 0) continue;
        const left = linear(a, b), right = linear(c, d);
        return {
          body: `Solve: ${math(`sqrt(${left}) = sqrt(${right})`)}`,
          answer: math(`x = ${x0}`),
          distractors: [new Q(d + b, a - c), new Q(d - b, a + c), new Q(b - d, a + c)].filter((v) => !v.eq(x0)).map((v) => math(`x = ${v.typst()}`)).filter((dd, i, all) => all.indexOf(dd) === i),
          solution: `Square both sides: ${math(`${left} = ${right}`)}, so ${math(`x = ${x0}`)}. Check: both radicands equal ${math(String(a * x0 + b))}, which is non-negative.`,
        };
      }
    }
    if (difficulty === 2) {
      const s = rng.int(1, Math.max(2, Math.round(Math.sqrt(optNum(o, 'size', 9) * 4)))), a = 2 * s + 1;
      return {
        body: `Solve: ${math(`sqrt(x + ${a}) - sqrt(x) = 1`)}`,
        answer: math(`x = ${s * s}`),
        distractors: [`x = ${s}`, `x = ${a - 1}`, `x = ${(s + 1) * (s + 1)}`].map(math),
        solution: `Isolate a radical: ${math(`sqrt(x + ${a}) = sqrt(x) + 1`)}. Square: ${math(`x + ${a} = x + 2sqrt(x) + 1`)}, so ${math(`sqrt(x) = ${s}`)} and ${math(`x = ${s * s}`)}. Check: ${math(`sqrt(${s * s + a}) - sqrt(${s * s}) = ${s + 1} - ${s} = 1`)}.`,
      };
    }
    // √(2x + q) = √x + 1: with u = √x, u² − 2u + (q − 1) = 0 with roots u1 and 2 − u1.
    const u1 = rng.int(2, 4), u2 = 2 - u1, q = u1 * u2 + 1;
    const valid = [u1, u2].filter((u) => u >= 0).map((u) => u * u).sort((p, r) => p - r);
    const answer = `x = ${valid.join(', ')}`;
    return {
      body: `Solve: ${math(`sqrt(2x ${q < 0 ? '-' : '+'} ${Math.abs(q)}) - sqrt(x) = 1`)}`,
      answer: math(answer),
      distractors: [`x = ${[u1 * u1, u2 * u2].sort((p, r) => p - r).join(', ')}`, `x = ${u1}`, `x = ${u1 * u1 + 1}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Isolate a radical and square: ${math(`2x ${q < 0 ? '-' : '+'} ${Math.abs(q)} = x + 2sqrt(x) + 1`)}, so ${math(`x ${q - 1 < 0 ? '-' : '+'} ${Math.abs(q - 1)} = 2sqrt(x)`)}. With ${math('u = sqrt(x) >= 0')}: ${math(`u^2 - 2u ${q - 1 < 0 ? '-' : '+'} ${Math.abs(q - 1)} = 0`)}, so ${math(`u = ${u1}`)} or ${math(`u = ${u2}`)}.${u2 < 0 ? ` ${math(`u = ${u2}`)} is rejected because ${math('sqrt(x)')} cannot be negative.` : ''} ${math(answer)}.`,
    };
  },
});

export const radeqProblem = pc30s('30s-radeq-problem', {
  levels: { 1: 'Evaluate a formula', 2: 'Solve a formula for a variable', 3: 'Solve and interpret' },
  options: [
    radioOption('form', 'Task', [['1', 'Evaluate a formula'], ['2', 'Solve a formula for a variable'], ['3', 'Solve and interpret']], ['1', '2', '3']),
    radioOption('context', 'Context', [['pendulum', 'Pendulum'], ['skid', 'Skid marks'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const ctx = optOne(o, 'context', 'either');
    const context = ctx === 'either' ? rng.pick(['pendulum', 'skid'] as const) : ctx;
    if (context === 'pendulum') {
      // T = 2π√(L/9.8)
      if (difficulty === 1) {
        const L = rng.int(5, 40) / 10;
        const T = 2 * Math.PI * Math.sqrt(L / 9.8);
        return {
          body: `The period of a pendulum is ${math('T = 2pi sqrt(L/9.8)')}, where ${math('L')} is its length in metres. Find the period of a ${L} m pendulum, to the nearest hundredth of a second.`,
          answer: math(`${round(T, 2)} "s"`),
          distractors: [round(2 * Math.PI * L / 9.8, 2), round(Math.PI * Math.sqrt(L / 9.8), 2), round(2 * Math.PI * Math.sqrt(9.8 / L), 2)].map((v) => math(`${v} "s"`)),
          solution: math(`T = 2pi sqrt(${L}/9.8) approx ${round(T, 2)}`) + ' s.',
        };
      }
      const T = rng.int(10, 40) / 10;
      const L = 9.8 * (T / (2 * Math.PI)) ** 2;
      return {
        body: `The period of a pendulum is ${math('T = 2pi sqrt(L/9.8)')}. ${difficulty === 3 ? 'A clock needs' : 'Find the length that gives'} a period of ${T} s${difficulty === 3 ? '. How long should its pendulum be?' : '.'} Round to the nearest hundredth of a metre.`,
        answer: math(`${round(L, 2)} "m"`),
        distractors: [round(9.8 * T / (2 * Math.PI), 2), round(9.8 * (T / Math.PI) ** 2, 2), round((T / (2 * Math.PI)) ** 2, 2)].map((v) => math(`${v} "m"`)),
        solution: `Divide by ${math('2pi')} and square: ${math(`L/9.8 = (${T}/(2pi))^2`)}, so ${math(`L = 9.8(${T}/(2pi))^2 approx ${round(L, 2)}`)} m.`,
      };
    }
    // Skid marks: v = √(254 f d)... use the common textbook form s = √(30 f d) in mph; here metric v = √(254 · f · d) km/h.
    const f = rng.pick([0.5, 0.6, 0.7, 0.8]);
    if (difficulty === 1) {
      const d = rng.int(15, 80);
      const v = Math.sqrt(254 * f * d);
      return {
        body: `A car's speed from its skid marks is ${math('v = sqrt(254 f d)')} km/h, where ${math('d')} is the skid length in metres and ${math(`f = ${f}`)}. Find the speed for a ${d} m skid, to the nearest km/h.`,
        answer: math(`${Math.round(v)} "km/h"`),
        distractors: [Math.round(254 * f * d / 100), Math.round(Math.sqrt(254 * d)), Math.round(Math.sqrt(254 * f) * d)].map((x) => math(`${x} "km/h"`)),
        solution: math(`v = sqrt(254(${f})(${d})) approx ${Math.round(v)}`) + ' km/h.',
      };
    }
    const v = rng.pick([50, 60, 70, 80, 90, 100]);
    const d = (v * v) / (254 * f);
    return {
      body: `A car's speed from its skid marks is ${math('v = sqrt(254 f d)')} km/h, where ${math('d')} is the skid length in metres and ${math(`f = ${f}`)}. ${difficulty === 3 ? `A car was travelling at ${v} km/h when it braked. How long a skid mark would it leave?` : `Find the skid length for a speed of ${v} km/h.`} Round to the nearest tenth of a metre.`,
      answer: math(`${round(d, 1)} "m"`),
      distractors: [round(v / (254 * f), 1), round((v * v) / 254, 1), round(Math.sqrt(v) / (254 * f) * 100, 1)].map((x) => math(`${x} "m"`)),
      solution: `Square both sides: ${math(`${v}^2 = 254(${f})d`)}, so ${math(`d = ${v * v}/${round(254 * f, 1).replace(/\.0$/, '')} approx ${round(d, 1)}`)} m.`,
    };
  },
});

export const ALGEBRA_30S = [absEvaluate, absDistance, absOrder, radEntireToMixed, radMixedToEntire, radOrder, radAddSubtract, radMultiply, radDivide, radRationalizeMonomial, radRationalizeBinomial, radRestrictions, radVariable, radProblem, radeqRestrictions, radeqOneRadical, radeqExtraneous, radeqTwoRadicals, radeqProblem];

