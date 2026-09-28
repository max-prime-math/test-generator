import type { Rng } from '../../rng.ts';
import { monomial, poly, polynomial, sub } from '../../format.ts';
import { graphTypst, type Pt } from '../../graph.ts';
import { math, mb10f } from '../pc40s/common.ts';
import { distinct } from '../grade10/shared.ts';

type P = [number, number, number]; // ax² + bx + c
const p = (q: number[]) => poly(q.length === 3 && q[0] === 0 ? (q[1] === 0 ? [q[2]] : q.slice(1)) : q);
const add = (a: P, b: P, s = 1): P => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
function randomPoly(rng: Rng, terms = 3): P {
  for (;;) {
    const q: P = [rng.int(-6, 6), rng.int(-9, 9), rng.int(-9, 9)];
    if (terms === 3 && q.every((c) => c !== 0)) return q;
    if (terms === 2 && q[0] !== 0 && q[1] !== 0) return [q[0], q[1], 0];
  }
}

// ── Polynomials ───────────────────────────────────────────────────────────

export const polyParts = mb10f('10f-poly-parts', {
  points: 1,
  levels: { 1: 'Number of terms and constant term', 2: 'Coefficients', 3: 'Degree, with two variables' },
  generate(rng, difficulty) {
    if (difficulty === 3) {
      const a = rng.nonZero(-6, 6), b = rng.nonZero(-6, 6), c = rng.nonZero(-9, 9);
      const kind = rng.pick(['xy', 'x2', 'lin'] as const);
      const terms = kind === 'xy' ? [{ coef: a, powers: [['x', 1], ['y', 1]] as Array<[string, number]> }, { coef: b, powers: [['x', 1]] as Array<[string, number]> }, { coef: c }]
        : kind === 'x2' ? [{ coef: a, powers: [['y', 2]] as Array<[string, number]> }, { coef: b, powers: [['x', 1]] as Array<[string, number]> }, { coef: c }]
          : [{ coef: a, powers: [['x', 1]] as Array<[string, number]> }, { coef: b, powers: [['y', 1]] as Array<[string, number]> }, { coef: c }];
      const deg = kind === 'lin' ? 1 : 2;
      return {
        body: `What is the degree of ${math(polynomial(terms))}?`,
        answer: String(deg),
        distractors: ['0', '1', '2', '3'].filter((d) => d !== String(deg)),
        solution: `The degree is the highest degree of any term; a term's degree is the sum of its exponents. ${kind === 'xy' ? `${math(monomial(a, [['x', 1], ['y', 1]]))} has degree ${math('1 + 1 = 2')}.` : kind === 'x2' ? `${math(monomial(a, [['y', 2]]))} has degree 2.` : 'Every variable term has degree 1.'}`,
      };
    }
    const q = randomPoly(rng, rng.next() < 0.5 ? 3 : 2);
    const text = p(q);
    const nTerms = q.filter((c) => c !== 0).length;
    if (difficulty === 1) {
      const askConst = rng.next() < 0.5;
      const answer = askConst ? String(q[2]) : String(nTerms);
      return {
        body: askConst ? `What is the constant term of ${math(text)}?` : `How many terms does ${math(text)} have?`,
        answer: math(answer),
        distractors: distinct(math(answer), (askConst ? [String(q[0]), String(q[1]), String(-q[2] || 1), '0'] : ['1', '2', '3', '4']).map(math)),
        solution: askConst ? `The constant term has no variable: ${math(String(q[2]))}.` : `The terms are ${q.map((c, i) => [c, i] as const).filter(([c]) => c !== 0).map(([c, i]) => math(monomial(c, [['x', 2 - i]]))).join(', ')}: ${nTerms} terms.`,
      };
    }
    const which = rng.pick([0, 1] as const);
    const name = which === 0 ? 'x^2' : 'x';
    return {
      body: `What is the coefficient of ${math(name)} in ${math(text)}?`,
      answer: math(String(q[which])),
      distractors: distinct(math(String(q[which])), [String(q[1 - which]), String(-q[which]), String(q[2]), String(which === 0 ? 2 : 1)].map(math)),
      solution: `The coefficient is the number multiplying ${math(name)}, including its sign: ${math(String(q[which]))}.`,
    };
  },
});

export const polyClassify = mb10f('10f-poly-classify', {
  points: 1,
  levels: { 1: 'By number of terms', 2: 'By degree', 3: 'Both, after simplifying' },
  generate(rng, difficulty) {
    const nTerms = rng.int(1, 3), deg = rng.int(nTerms === 3 ? 2 : 0, 2);
    const coefs: P = [0, 0, 0];
    const slots = rng.shuffle([0, 1, 2].filter((i) => i >= 2 - deg)).slice(0, nTerms);
    if (!slots.includes(2 - deg)) slots[0] = 2 - deg;
    for (const i of new Set(slots)) coefs[i] = rng.nonZero(-9, 9);
    const actualTerms = coefs.filter((c) => c !== 0).length;
    const names = ['', 'Monomial', 'Binomial', 'Trinomial'];
    const degName = ['constant', 'linear', 'quadratic'];
    let text = p(coefs);
    if (difficulty === 3) {
      // Add terms that cancel so the student must simplify first.
      const k = rng.nonZero(-5, 5);
      text = `${p(coefs)} ${k > 0 ? '+' : '-'} ${monomial(Math.abs(k), [['x', 1]])} ${k > 0 ? '-' : '+'} ${monomial(Math.abs(k), [['x', 1]])}`;
    }
    const answer = difficulty === 1 ? names[actualTerms] : difficulty === 2 ? `Degree ${deg} (${degName[deg]})` : `${names[actualTerms]} of degree ${deg}`;
    const pool = difficulty === 1 ? names.slice(1).concat(['Polynomial of four terms']) : difficulty === 2 ? [0, 1, 2, 3].map((d) => `Degree ${d} (${['constant', 'linear', 'quadratic', 'cubic'][d]})`) : [`${names[actualTerms]} of degree ${deg}`, `${names[Math.min(3, actualTerms + 2)]} of degree ${deg}`, `${names[actualTerms]} of degree ${(deg + 1) % 3}`, `${names[actualTerms === 1 ? 2 : 1]} of degree ${deg}`];
    return {
      body: `Classify ${math(text)}${difficulty === 1 ? ' by its number of terms' : difficulty === 2 ? ' by its degree' : ' by its number of terms and degree (simplify first)'}.`,
      answer,
      distractors: distinct(answer, pool),
      solution: `${difficulty === 3 ? `The ${math('x')}-terms cancel: ${math(p(coefs))}. ` : ''}It has ${actualTerms} term${actualTerms > 1 ? 's' : ''} and its highest power of ${math('x')} is ${deg}.`,
    };
  },
});

/** Algebra tiles: x² squares, x rectangles, and unit squares, each labelled with its value. */
function tiles(q: P): string {
  const curves: Array<{ points: Pt[] }> = [];
  const labels: Array<{ x: number; y: number; text: string }> = [];
  const rect = (x: number, y: number, w: number, h: number, text: string) => {
    curves.push({ points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]] });
    labels.push({ x: x + w / 2, y: y + h / 2 + 0.05, text });
  };
  let x = 0;
  const S = 2, T = 0.9;
  for (let i = 0; i < Math.abs(q[0]); i++) { rect(x, 0, S, S, q[0] > 0 ? 'x^2' : '-x^2'); x += S + 0.25; }
  if (q[0]) x += 0.4;
  for (let i = 0; i < Math.abs(q[1]); i++) { rect(x, 0, T, S, q[1] > 0 ? 'x' : '-x'); x += T + 0.2; }
  if (q[1]) x += 0.4;
  const units = Math.abs(q[2]);
  for (let i = 0; i < units; i++) { const col = Math.floor(i / 2), row = i % 2; rect(x + col * (T + 0.15), row * (T + 0.3), T, T, q[2] > 0 ? '1' : '-1'); }
  const W = x + Math.ceil(units / 2) * (T + 0.15);
  return graphTypst({ xMin: -0.3, xMax: W + 0.3, yMin: -0.3, yMax: S + 0.3, width: Math.min(13, (W + 0.6) * 0.7), height: (S + 0.6) * 0.7, grid: false, numbers: false, axes: false, curves, labels });
}

export const polyTiles = mb10f('10f-poly-tiles', {
  points: 1,
  levels: { 1: 'Positive tiles', 2: 'Positive and negative tiles', 3: 'Simplify the tiles (zero pairs)' },
  generate(rng, difficulty) {
    const q: P = difficulty === 1 ? [rng.int(0, 3), rng.int(1, 5), rng.int(0, 6)] : [rng.int(-3, 3), rng.nonZero(-5, 5), rng.int(-6, 6)];
    if (difficulty === 3) {
      // Show the polynomial plus some zero pairs of x tiles.
      const k = rng.int(1, 3);
      const shown = tilesWithPairs(q, k);
      return {
        body: `Write the simplified polynomial modelled by the tiles. (A tile and its opposite form a zero pair.)\n\n${shown}`,
        answer: math(p(q)),
        distractors: distinct(math(p(q)), [p([q[0], q[1] + k * Math.sign(q[1] || 1), q[2]]), p([q[0], Math.abs(q[1]) + 2 * k, q[2]]), p([-q[0], q[1], q[2]]), p([q[0], q[1], -q[2]])].map(math)),
        solution: `Remove the ${k} zero pair${k > 1 ? 's' : ''} of ${math('x')}-tiles, then count: ${math(p(q))}.`,
      };
    }
    if (q.every((c) => c === 0)) return polyTiles.generate(rng, difficulty);
    return {
      body: `Write the polynomial modelled by the algebra tiles.\n\n${tiles(q)}`,
      answer: math(p(q)),
      distractors: distinct(math(p(q)), [p([q[1], q[0], q[2]]), p([q[0], q[1], -q[2]]), p([q[0], -q[1], q[2]]), p([q[0] + 1, q[1], q[2]])].map(math)),
      solution: `Count each kind: ${q[0]} ${math('x^2')}-tiles, ${q[1]} ${math('x')}-tiles, and ${q[2]} unit tiles: ${math(p(q))}.`,
    };
  },
});
function tilesWithPairs(q: P, k: number): string {
  // Draw q's x² and unit tiles with the x tiles split into (|b| + k) of one sign and k of the other.
  const pos = q[1] >= 0 ? q[1] + k : k, neg = q[1] >= 0 ? k : -q[1] + k;
  const curves: Array<{ points: Pt[] }> = [];
  const labels: Array<{ x: number; y: number; text: string }> = [];
  const rect = (x: number, y: number, w: number, h: number, text: string) => { curves.push({ points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]] }); labels.push({ x: x + w / 2, y: y + h / 2 + 0.05, text }); };
  let x = 0;
  const S = 2, T = 0.9;
  for (let i = 0; i < Math.abs(q[0]); i++) { rect(x, 0, S, S, q[0] > 0 ? 'x^2' : '-x^2'); x += S + 0.25; }
  if (q[0]) x += 0.4;
  for (let i = 0; i < pos; i++) { rect(x, 0, T, S, 'x'); x += T + 0.2; }
  for (let i = 0; i < neg; i++) { rect(x, 0, T, S, '-x'); x += T + 0.2; }
  x += 0.4;
  const units = Math.abs(q[2]);
  for (let i = 0; i < units; i++) { const col = Math.floor(i / 2), row = i % 2; rect(x + col * (T + 0.15), row * (T + 0.3), T, T, q[2] > 0 ? '1' : '-1'); }
  const W = x + Math.ceil(units / 2) * (T + 0.15);
  return graphTypst({ xMin: -0.3, xMax: W + 0.3, yMin: -0.3, yMax: S + 0.3, width: Math.min(13, (W + 0.6) * 0.7), height: (S + 0.6) * 0.7, grid: false, numbers: false, axes: false, curves, labels });
}

/** An unsimplified expression with like terms scattered: `3x^2 - 2x + 5 - x^2 + 4x`. */
function scattered(a: P, b: P): string {
  const terms = [{ coef: a[0], powers: [['x', 2]] as Array<[string, number]> }, { coef: a[1], powers: [['x', 1]] as Array<[string, number]> }, { coef: a[2] }, { coef: b[0], powers: [['x', 2]] as Array<[string, number]> }, { coef: b[1], powers: [['x', 1]] as Array<[string, number]> }, { coef: b[2] }];
  return polynomial(terms);
}

export const polyEquivalent = mb10f('10f-poly-equivalent', {
  points: 1,
  levels: { 1: 'Collect like terms', 2: 'With negative terms', 3: 'Which expression is not equivalent?' },
  generate(rng, difficulty) {
    const a = randomPoly(rng), b = randomPoly(rng);
    if (difficulty === 1) { a.forEach((_, i) => { a[i] = Math.abs(a[i]); b[i] = Math.abs(b[i]); }); }
    const sum = add(a, b);
    const expr = scattered(a, b);
    if (difficulty === 3) {
      const rearranged = polynomial([{ coef: b[2] + a[2] }, { coef: sum[1], powers: [['x', 1]] }, { coef: sum[0], powers: [['x', 2]] }]);
      const answer = p([sum[0], -sum[1], sum[2]]);
      return {
        body: `Which expression is not equivalent to ${math(expr)}?`,
        answer: math(answer === p(sum) ? p([sum[0] + 1, sum[1], sum[2]]) : answer),
        distractors: [p(sum), rearranged, scattered(b, a)].map(math),
        solution: `Collecting like terms gives ${math(p(sum))}. Reordering terms keeps an expression equivalent; changing a sign does not.`,
      };
    }
    return {
      body: `Which expression is equivalent to ${math(expr)}?`,
      answer: math(p(sum)),
      distractors: distinct(math(p(sum)), [p(add(a, b, -1)), p([0, sum[0] + sum[1], sum[2]]), p([sum[0], sum[1] + sum[2], 0]), p([a[0] + b[0], a[1] - b[1], a[2] + b[2]])].map(math)),
      solution: `Collect like terms: ${math(`(${a[0]} + ${sub(b[0])})x^2 + (${a[1]} + ${sub(b[1])})x + (${a[2]} + ${sub(b[2])}) = ${p(sum)}`)}.`,
    };
  },
});

export const polyAdd = mb10f('10f-poly-add', {
  points: 1,
  levels: { 1: 'Binomials', 2: 'Trinomials', 3: 'Trinomials with negatives' },
  generate(rng, difficulty) {
    const a = randomPoly(rng, difficulty === 1 ? 2 : 3), b = randomPoly(rng, difficulty === 1 ? 2 : 3);
    if (difficulty < 3) a.forEach((_, i) => { a[i] = Math.abs(a[i]); b[i] = Math.abs(b[i]); });
    const sum = add(a, b);
    return {
      body: `Add: ${math(`(${p(a)}) + (${p(b)})`)}`,
      answer: math(p(sum)),
      distractors: distinct(math(p(sum)), [p(add(a, b, -1)), p([sum[0], sum[1], a[2] - b[2]]), p([a[0] * b[0] || sum[0] + 1, sum[1], sum[2]]), p([0, sum[0] + sum[1], sum[2]])].map(math)),
      solution: `Add like terms: ${math(p(sum))}.`,
    };
  },
});

export const polySubtract = mb10f('10f-poly-subtract', {
  points: 1,
  levels: { 1: 'Binomials', 2: 'Trinomials', 3: 'Trinomials with negatives' },
  generate(rng, difficulty) {
    const a = randomPoly(rng, difficulty === 1 ? 2 : 3), b = randomPoly(rng, difficulty === 1 ? 2 : 3);
    if (difficulty < 3) a.forEach((_, i) => { a[i] = Math.abs(a[i]); b[i] = Math.abs(b[i]); });
    const diff = add(a, b, -1);
    const onlyFirst: P = [a[0] - b[0], a[1] + b[1], a[2] + b[2]];
    return {
      body: `Subtract: ${math(`(${p(a)}) - (${p(b)})`)}`,
      answer: math(p(diff)),
      distractors: distinct(math(p(diff)), [p(add(a, b)), p(onlyFirst), p(add(b, a, -1)), p([diff[0], diff[1], a[2] + b[2]])].map(math)),
      solution: `Subtracting a polynomial adds its opposite: ${math(`(${p(a)}) + (${p(b.map((c) => -c))})`)} ${math(`= ${p(diff)}`)}.`,
    };
  },
});

export const polyPerimeter = mb10f('10f-poly-perimeter', {
  levels: { 1: 'Perimeter of a triangle', 2: 'Perimeter of a rectangle', 3: 'Find a missing side' },
  generate(rng, difficulty) {
    const side = (): P => [0, rng.int(1, 6), rng.int(-3, 8)];
    if (difficulty === 1) {
      const s = [side(), side(), side()];
      const P = s.reduce((x, y) => add(x, y));
      return {
        body: `A triangle has sides ${s.map((q) => math(p(q))).join(', ')}. Write its perimeter.`,
        answer: math(p(P)),
        distractors: distinct(math(p(P)), [p([0, P[1], 0]), p([0, P[1] + P[2], 0]), p([0, P[1], s[0][2] + s[1][2] - s[2][2]]), p([0, P[1] * 2, P[2]])].map(math)),
        solution: `Add the three sides: ${math(p(P))}.`,
      };
    }
    const l = side(), w = side();
    if (difficulty === 2) {
      const P = add(add(l, l), add(w, w));
      return {
        body: `A rectangle is ${math(p(l))} long and ${math(p(w))} wide. Write its perimeter.`,
        answer: math(p(P)),
        distractors: distinct(math(p(P)), [p(add(l, w)), p([0, P[1], add(l, w)[2]]), p([0, 2 * l[1] + w[1], 2 * l[2] + w[2]])].map(math)),
        solution: `${math(`2(${p(l)}) + 2(${p(w)}) = ${p(P)}`)}.`,
      };
    }
    const s = [side(), side()], third = side();
    const P = add(add(s[0], s[1]), third);
    return {
      body: `A triangle has a perimeter of ${math(p(P))}. Two sides are ${math(p(s[0]))} and ${math(p(s[1]))}. Find the third side.`,
      answer: math(p(third)),
      distractors: distinct(math(p(third)), [p(add(P, add(s[0], s[1]))), p([0, third[1], P[2] + s[0][2] + s[1][2]]), p(add(s[0], s[1])), p([0, third[1] + 1, third[2]])].map(math)),
      solution: `Subtract the known sides from the perimeter: ${math(`(${p(P)}) - (${p(s[0])}) - (${p(s[1])}) = ${p(third)}`)}.`,
    };
  },
});

export const polyMultiply = mb10f('10f-poly-multiply', {
  points: 1,
  levels: { 1: 'Monomial × monomial', 2: 'Monomial × binomial', 3: 'Negative monomial × trinomial' },
  generate(rng, difficulty) {
    const k = difficulty === 3 ? -rng.int(1, 5) : rng.int(2, 6), withX = rng.next() < 0.6 || difficulty === 1;
    const kText = withX ? monomial(k, [['x', 1]]) : String(k);
    if (difficulty === 1) {
      const m = rng.nonZero(-6, 6), useX = rng.next() < 0.6;
      const answer = monomial(k * m, [['x', useX ? 2 : 1]]);
      return {
        body: `Multiply: ${math(`(${kText})(${useX ? monomial(m, [['x', 1]]) : m})`)}`,
        answer: math(answer),
        distractors: distinct(math(answer), [monomial(k + m, [['x', useX ? 2 : 1]]), monomial(k * m, [['x', useX ? 1 : 2]]), monomial(-k * m, [['x', useX ? 2 : 1]]), monomial(k * m, [])].map(math)),
        solution: `Multiply the coefficients and add the exponents of ${math('x')}: ${math(answer)}.`,
      };
    }
    const q: P = difficulty === 2 ? [0, rng.nonZero(-6, 6), rng.nonZero(-9, 9)] : [rng.nonZero(-4, 4), rng.nonZero(-6, 6), rng.nonZero(-9, 9)];
    // x × (ax² + bx + c) would be cubic; keep degree ≤ 2 by using a constant multiplier with trinomials.
    const useX = withX && q[0] === 0;
    const prod: P = useX ? [k * q[1], k * q[2], 0] : [k * q[0], k * q[1], k * q[2]];
    const mText = useX ? kText : String(k);
    const onlyFirst: P = useX ? [k * q[1], q[2], 0] : [k * q[0], q[1], q[2]];
    return {
      body: `Multiply: ${math(`${mText.startsWith('-') ? `(${mText})` : mText}(${p(q)})`)}`,
      answer: math(p(prod)),
      distractors: distinct(math(p(prod)), [p(onlyFirst), p(prod.map((c) => -c) as P), useX ? p([0, k * q[1], k * q[2]]) : p([k * q[0], k * q[1], q[2]]), p(useX ? [k * q[1], 0, k * q[2]] : [k * q[0], -k * q[1], k * q[2]])].map(math)),
      solution: `Multiply every term by ${math(mText)}: ${math(p(prod))}.`,
    };
  },
});

export const polyDivide = mb10f('10f-poly-divide', {
  points: 1,
  levels: { 1: 'Monomial ÷ monomial', 2: 'Binomial ÷ monomial', 3: 'Trinomial ÷ a negative number' },
  generate(rng, difficulty) {
    const k = difficulty === 3 ? -rng.int(2, 5) : rng.int(2, 6);
    if (difficulty === 1) {
      const m = rng.nonZero(-7, 7), top = monomial(k * m, [['x', 2]]), bottom = monomial(k, [['x', 1]]);
      const answer = monomial(m, [['x', 1]]);
      return {
        body: `Divide: ${math(`(${top}) / (${bottom})`)}`,
        answer: math(answer),
        distractors: distinct(math(answer), [monomial(m, [['x', 2]]), monomial(k * m - k, [['x', 1]]), monomial(-m, [['x', 1]]), String(m)].map(math)),
        solution: `Divide the coefficients and subtract the exponents: ${math(`${k * m} div ${k} = ${m}`)} and ${math('x^2 div x = x')}. So ${math(answer)}.`,
      };
    }
    const q: P = difficulty === 2 ? [0, rng.nonZero(-6, 6), rng.nonZero(-9, 9)] : [rng.nonZero(-4, 4), rng.nonZero(-6, 6), rng.nonZero(-9, 9)];
    const byX = difficulty === 2 && rng.next() < 0.6;
    const top: P = byX ? [k * q[1], k * q[2], 0] : [k * q[0], k * q[1], k * q[2]];
    const bottom = byX ? monomial(k, [['x', 1]]) : String(k);
    const onlyFirst: P = byX ? [0, q[1], k * q[2]] : [q[0], k * q[1], k * q[2]];
    return {
      body: `Divide: ${math(`(${p(top)}) / (${bottom})`)}`,
      answer: math(p(q)),
      distractors: distinct(math(p(q)), [p(onlyFirst), p(q.map((c) => -c) as P), byX ? p([q[1], q[2], 0]) : p([q[0], q[1], k * q[2]]), p([q[0], -q[1], q[2]])].map(math)),
      solution: `Divide every term by ${math(bottom)}: ${math(p(q))}.`,
    };
  },
});

export const polyArea = mb10f('10f-poly-area', {
  levels: { 1: 'Area of a rectangle', 2: 'Missing side from the area', 3: 'Area of a shaded region' },
  generate(rng, difficulty) {
    const k = rng.int(2, 6), b = rng.int(1, 9), c = rng.int(1, 4);
    if (difficulty === 1) {
      const area: P = [k * c, k * b, 0];
      return {
        body: `A rectangle is ${math(monomial(k, [['x', 1]]))} wide and ${math(p([0, c, b]))} long. Write its area.`,
        answer: math(p(area)),
        distractors: distinct(math(p(area)), [p([0, k + c, b]), p([k * c, b, 0]), p([0, 2 * k + 2 * c, 2 * b]), p([k * c, k + b, 0])].map(math)),
        solution: `${math(`${monomial(k, [['x', 1]])}(${p([0, c, b])}) = ${p(area)}`)}.`,
      };
    }
    if (difficulty === 2) {
      const area: P = [k * c, k * b, 0];
      return {
        body: `A rectangle has an area of ${math(p(area))} and a width of ${math(monomial(k, [['x', 1]]))}. Find its length.`,
        answer: math(p([0, c, b])),
        distractors: distinct(math(p([0, c, b])), [p([k * c, b, 0]), p([0, c, k * b]), p([0, k * c, k * b]), p([0, c + k, b])].map(math)),
        solution: `Length = area ÷ width: ${math(`(${p(area)}) div ${monomial(k, [['x', 1]])} = ${p([0, c, b])}`)}.`,
      };
    }
    const s = rng.int(1, 3);
    const big: P = [k * c, k * b, 0], hole: P = [s * s, 0, 0];
    const shaded = add(big, hole, -1);
    return {
      body: `A rectangle ${math(monomial(k, [['x', 1]]))} by ${math(p([0, c, b]))} has a square of side ${math(monomial(s, [['x', 1]]))} cut out of it. Write the area that remains.`,
      answer: math(p(shaded)),
      distractors: distinct(math(p(shaded)), [p(add(big, hole)), p(add(big, [0, s, 0], -1)), p([k * c - s, k * b, 0]), p(big)].map(math)),
      solution: `${math(`${monomial(k, [['x', 1]])}(${p([0, c, b])}) - (${monomial(s, [['x', 1]])})^2 = ${p(big)} - ${p(hole)} = ${p(shaded)}`)}.`,
    };
  },
});

export const polyError = mb10f('10f-poly-error', {
  levels: { 1: 'Combining unlike terms', 2: 'Subtracting a polynomial', 3: 'Dividing only one term' },
  generate(rng, difficulty) {
    let expr: string, wrong: string, right: string, why: string, alt: string[];
    if (difficulty === 1) {
      const a = rng.int(2, 8), b = rng.int(2, 8);
      expr = `${a}x^2 + ${b}x`; wrong = `${a + b}x^3`; right = `${a}x^2 + ${b}x`;
      why = `${math('x^2')} and ${math('x')} are unlike terms, so they cannot be combined: the expression is already simplified.`;
      alt = [`${a + b}x^2`, `${a * b}x^3`];
    } else if (difficulty === 2) {
      const a = randomPoly(rng), b = randomPoly(rng);
      const diff = add(a, b, -1);
      expr = `(${p(a)}) - (${p(b)})`; wrong = p([a[0] - b[0], a[1] + b[1], a[2] + b[2]]); right = p(diff);
      why = 'The subtraction applies to every term of the second polynomial, not just the first.';
      alt = [p(add(a, b)), p([diff[0], diff[1], a[2] + b[2]])];
    } else {
      const k = rng.int(2, 5), q: P = [0, rng.nonZero(-6, 6), rng.nonZero(-9, 9)];
      expr = `(${p([0, k * q[1], k * q[2]])}) / ${k}`; wrong = p([0, q[1], k * q[2]]); right = p(q);
      why = `Every term must be divided by ${k}.`;
      alt = [p([0, k * q[1], q[2]]), p([0, -q[1], q[2]])];
    }
    return {
      body: `A student simplified ${math(expr)} as ${math(wrong)}. What is the correct result?`,
      answer: math(right),
      distractors: distinct(math(right), [wrong, ...alt].map(math)),
      solution: `${why} The correct result is ${math(right)}.`,
    };
  },
});

export const POLYNOMIALS_10F = [polyParts, polyClassify, polyTiles, polyEquivalent, polyAdd, polySubtract, polyPerimeter, polyMultiply, polyDivide, polyArea, polyError];
