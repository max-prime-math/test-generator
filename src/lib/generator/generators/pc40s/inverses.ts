import { Q } from '../../exact.ts';
import { graphTypst, type Pt } from '../../graph.ts';
import { math, pc40s } from './common.ts';
import { optNum, optOn, optOne, radioOption, sizeOption, toggleOption } from '../../options.ts';
import { fitWindow, plGraph, randomPL, type PL } from './functions.ts';

/** `3/2 x + 6`, `-x + 4`, `2x`: a linear expression with rational coefficients. */
function linearText(m: Q, b: Q, v = 'x'): string {
  const lead = m.coef(v);
  if (b.eq(0)) return lead;
  return `${lead} ${b.sign < 0 ? '-' : '+'} ${b.abs().typst()}`;
}

export const invLinear = pc40s('40s-inv-linear', {
  levels: { 1: 'Whole-number slope', 2: 'Fractional slope', 3: 'From an equation in x and y' },
  options: [
    radioOption('slope', 'Slope', [['int', 'Whole number'], ['frac', 'Fraction']], ['int', 'frac', 'int']),
    radioOption('given', 'Given as', [['function', 'f(x) = …'], ['equation', 'An equation in x and y']], ['function', 'function', 'equation']),
  ],
  generate(rng, gl, o) {
    const difficulty = optOne(o, 'given', gl === 3 ? 'equation' : 'function') === 'equation' ? 3 : 1;
    const m = optOne(o, 'slope', gl === 2 ? 'frac' : 'int') === 'frac'
      ? (() => { for (;;) { const q = new Q(rng.nonZero(-5, 5), rng.int(2, 4)); if (!q.isInt) return q; } })()
      : new Q(rng.pick([-4, -3, -2, 2, 3, 4, 5]));
    const b = new Q(rng.int(-9, 9));
    const inverseM = new Q(m.d, m.n), inverseB = b.neg().div(m);
    const answer = `f^(-1)(x) = ${linearText(inverseM, inverseB)}`;
    const given = difficulty === 3
      ? (() => {
        // A x + B y = C with f(x) = (C − A x)/B, i.e. m = −A/B and b = C/B.
        // B is a multiple of m's denominator, so every coefficient is an integer.
        const B = m.d * rng.pick(m.isInt ? [2, 3, -2] : [1, -1, 2]), A = (-m.n * B) / m.d, C = b.n * B;
        const xTerm = A === 1 ? 'x' : A === -1 ? '-x' : `${A}x`;
        return { text: `${xTerm} ${B < 0 ? '-' : '+'} ${Math.abs(B) === 1 ? '' : Math.abs(B)}y = ${C}`, noun: 'the relation' };
      })()
      : { text: `f(x) = ${linearText(m, b)}`, noun: '' };
    return {
      body: difficulty === 3
        ? `Find the equation of the inverse of the relation ${math(given.text)}, written as ${math('y = ...')}.`
        : `Find ${math('f^(-1)(x)')} for ${math(given.text)}.`,
      answer: math(difficulty === 3 ? `y = ${linearText(inverseM, inverseB)}` : answer),
      distractors: [
        linearText(m.neg(), b), linearText(inverseM, b.neg()), linearText(inverseM.neg(), inverseB), linearText(m, b.neg()),
      ].map((t) => math(`${difficulty === 3 ? 'y' : 'f^(-1)(x)'} = ${t}`)),
      solution: `Swap ${math('x')} and ${math('y')} and solve for ${math('y')}: ${math(`x = ${linearText(m, b, 'y')}`)}, so ${math(`y = ${linearText(inverseM, inverseB)}`)}.`,
    };
  },
});

export const invQuadratic = pc40s('40s-inv-quadratic', {
  levels: { 1: 'y = x² + k', 2: 'y = (x − h)² + k', 3: 'y = a(x − h)² + k' },
  options: [
    toggleOption('h', 'Include a horizontal translation (h)', [false, true, true]),
    toggleOption('a', 'Include a stretch or reflection (a)', [false, false, true]),
    radioOption('branch', 'Restricted domain', [['right', 'The right branch, x ≥ h'], ['left', 'The left branch, x ≤ h'], ['either', 'Either branch']], ['right', 'right', 'either']),
  ],
  generate(rng, difficulty, o) {
    const h = optOn(o, 'h', difficulty > 1) ? rng.nonZero(-5, 5) : 0, k = rng.nonZero(-6, 6);
    const a = optOn(o, 'a', difficulty === 3) ? rng.pick([2, 3, -2]) : 1;
    const branch = optOne(o, 'branch', difficulty === 3 ? 'either' : 'right');
    const left = branch === 'left' || (branch === 'either' && rng.next() < 0.5); // restrict to the left branch x ≤ h
    const shift = h === 0 ? 'x' : `x ${h > 0 ? '-' : '+'} ${Math.abs(h)}`;
    const f = `${a === 1 ? '' : a}${h === 0 ? 'x^2' : `(${shift})^2`} ${k < 0 ? '-' : '+'} ${Math.abs(k)}`;
    const domain = left ? `x <= ${h}` : `x >= ${h}`;
    // (x − k)/a, written with a positive denominator: (k − x)/|a| when a < 0.
    const radicand = a === 1 ? `x ${k > 0 ? '-' : '+'} ${Math.abs(k)}` : a > 0 ? `(x ${k > 0 ? '-' : '+'} ${Math.abs(k)})/${a}` : `(${k} - x)/${-a}`;
    const sign = left ? '-' : '+';
    const inverse = h === 0 ? `${left ? '-' : ''}sqrt(${radicand})` : `${h} ${sign} sqrt(${radicand})`;
    const range = a > 0 ? `x >= ${k}` : `x <= ${k}`;
    const answer = `f^(-1)(x) = ${inverse}, ${range}`;
    return {
      body: `For ${math(`f(x) = ${f}`)} with ${math(domain)}, find ${math('f^(-1)(x)')} and state its domain.`,
      answer: math(answer),
      distractors: [
        `f^(-1)(x) = ${h === 0 ? '' : `${h} ${left ? '+' : '-'} `}sqrt(${radicand}), ${range}`,
        // Both translations undone with the wrong sign.
        `f^(-1)(x) = ${h === 0 ? '' : `${-h} ${sign} `}sqrt(${a === 1 ? `x ${k > 0 ? '+' : '-'} ${Math.abs(k)}` : a > 0 ? `(x ${k > 0 ? '+' : '-'} ${Math.abs(k)})/${a}` : `(${-k} - x)/${-a}`}), ${range}`,
        `f^(-1)(x) = ${inverse}, ${domain}`,
        // Undoing the operations in the wrong order: square root first, then the translation.
        `f^(-1)(x) = sqrt(x)${h === 0 ? '' : ` ${h > 0 ? '+' : '-'} ${Math.abs(h)}`} ${k > 0 ? '-' : '+'} ${Math.abs(k)}, ${range}`,
      ].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Swap ${math('x')} and ${math('y')}: ${math(`x = ${f.replace(/x/g, 'y')}`)}. Solve: ${math(`y = ${inverse}`)}, taking the ${left ? 'negative' : 'positive'} root because the original domain was ${math(domain)}. The domain of the inverse is the range of ${math('f')}: ${math(range)}.`,
    };
  },
});

export const invVerify = pc40s('40s-inv-verify', {
  points: 1,
  levels: { 1: 'Linear functions', 2: 'Linear with fractions', 3: 'Radical and quadratic' },
  options: [
    radioOption('functions', 'Functions', [['1', 'Linear'], ['2', 'Linear with fractional slopes'], ['3', 'A radical and a restricted quadratic']], ['1', '2', '3']),
    radioOption('answer', 'Answers', [['mixed', 'Yes or no'], ['yes', 'Always yes'], ['no', 'Always no']], ['mixed', 'mixed', 'mixed']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'functions', gl);
    const ans = optOne(o, 'answer', 'mixed');
    const truly = ans === 'mixed' ? rng.next() < 0.5 : ans === 'yes';
    if (difficulty === 3) {
      const k = rng.int(1, 6);
      const g = truly ? `x^2 + ${k}, x >= 0` : `x^2 - ${k}, x >= 0`;
      const comp = truly ? 'x' : `sqrt(x^2 - ${2 * k})`;
      return {
        body: `Are ${math(`f(x) = sqrt(x - ${k})`)} and ${math(`g(x) = ${g}`)} inverses of each other?`,
        answer: `${truly ? 'Yes' : 'No'}: ${math(`f(g(x)) = ${comp}`)}`,
        distractors: [`${truly ? 'No' : 'Yes'}: ${math(`f(g(x)) = ${comp}`)}`, `${truly ? 'No' : 'Yes'}: ${math(`f(g(x)) = x^2`)}`, `Yes: ${math('f(x) g(x) = 1')}`],
        solution: `${math(`f(g(x)) = sqrt((${g.split(',')[0]}) - ${k}) = sqrt(${truly ? 'x^2' : `x^2 - ${2 * k}`})`)}${truly ? ` ${math('= x')} for ${math('x >= 0')}` : ''}. They ${truly ? 'are' : 'are not'} inverses.`,
      };
    }
    const m = difficulty === 2 ? (() => { for (;;) { const q = new Q(rng.nonZero(-4, 4), rng.int(2, 3)); if (!q.isInt) return q; } })() : new Q(rng.pick([-3, -2, 2, 3, 4]));
    const b = new Q(rng.nonZero(-8, 8));
    const inverseM = new Q(m.d, m.n), inverseB = b.neg().div(m);
    const gB = truly ? inverseB : b.div(m);
    const f = linearText(m, b), g = linearText(inverseM, gB);
    // f(g(x)) = m(x/m + gB) + b = x + m·gB + b
    const constant = m.mul(gB).add(b);
    const comp = linearText(new Q(1), constant);
    return {
      body: `Are ${math(`f(x) = ${f}`)} and ${math(`g(x) = ${g}`)} inverses of each other?`,
      answer: `${truly ? 'Yes' : 'No'}: ${math(`f(g(x)) = ${comp}`)}`,
      distractors: [`${truly ? 'No' : 'Yes'}: ${math(`f(g(x)) = ${comp}`)}`, `${truly ? 'No' : 'Yes'}: ${math(`f(g(x)) = ${linearText(new Q(1), constant.add(1))}`)}`, `Yes: ${math(`f(g(x)) = ${linearText(m.mul(inverseM), new Q(0))}`)}`, `No: ${math('f(x) dot g(x) != 1')}`].filter((d, i, all) => all.indexOf(d) === i),
      solution: `${math(`f(g(x)) = ${m.isInt ? m.n : `(${m.typst()})`}(${g}) ${b.sign < 0 ? '-' : '+'} ${b.abs().typst()} = ${comp}`)}. Inverses give ${math('f(g(x)) = x')}, so they ${truly ? 'are' : 'are not'} inverses.`,
    };
  },
});

const shift = (h: number) => (h === 0 ? 'x' : `x ${h > 0 ? '-' : '+'} ${Math.abs(h)}`);
const plus = (k: number) => (k === 0 ? '' : ` ${k < 0 ? '-' : '+'} ${Math.abs(k)}`);

export const invDomainRange = pc40s('40s-inv-domain-range', {
  levels: { 1: 'Given the domain and range', 2: 'A radical function', 3: 'A restricted quadratic' },
  options: [
    radioOption('form', 'f is given as', [['1', 'Its domain and range'], ['2', 'A square-root function'], ['3', 'A restricted quadratic']], ['1', '2', '3']),
    radioOption('ask', 'Ask for', [['domain', 'The domain of the inverse'], ['range', 'The range of the inverse'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl);
    const askOpt = optOne(o, 'ask', 'either');
    const ask = askOpt === 'either' ? rng.pick(['domain', 'range'] as const) : askOpt as 'domain' | 'range';
    let fDomain: string, fRange: string, given: string;
    if (difficulty === 1) {
      const [p, q] = [rng.int(-6, 0), rng.int(1, 6)], [r, s] = [rng.int(-5, 0), rng.int(1, 5)];
      fDomain = `${p} <= x <= ${q}`; fRange = `${r} <= y <= ${s}`;
      given = `A function has domain ${math(`{x | ${fDomain}, x in RR}`)} and range ${math(`{y | ${fRange}, y in RR}`)}.`;
    } else if (difficulty === 2) {
      const h = rng.int(-5, 5), k = rng.int(-5, 5);
      fDomain = `x >= ${h}`; fRange = `y >= ${k}`;
      given = `${math(`f(x) = sqrt(${shift(h)})${plus(k)}`)}.`;
    } else {
      const h = rng.int(-5, 5), k = rng.int(-5, 5);
      fDomain = `x >= ${h}`; fRange = `y >= ${k}`;
      given = `${math(`f(x) = ${h === 0 ? 'x^2' : `(${shift(h)})^2`}${plus(k)}`)} with ${math(`x >= ${h}`)}.`;
    }
    // The inverse swaps them: domain of f⁻¹ = range of f, range of f⁻¹ = domain of f.
    const swap = (text: string, from: string, to: string) => text.replace(new RegExp(from, 'g'), to);
    const answer = ask === 'domain' ? `{x | ${swap(fRange, 'y', 'x')}, x in RR}` : `{y | ${swap(fDomain, 'x', 'y')}, y in RR}`;
    const wrong = ask === 'domain' ? `{x | ${fDomain}, x in RR}` : `{y | ${fRange}, y in RR}`;
    // Not swapping, all real numbers, the inequality reversed, or the interval negated.
    const flipped = (ask === 'domain' ? `{x | ${swap(fRange, 'y', 'x')}, x in RR}` : `{y | ${swap(fDomain, 'x', 'y')}, y in RR}`).replace(/>=/g, '<=');
    const negated = (text: string) => text.replace(/(-?\d+) <= (\w) <= (-?\d+)/, (_, lo, v, hi) => `${-Number(hi)} <= ${v} <= ${-Number(lo)}`);
    return {
      body: `${given} State the ${ask} of ${math('f^(-1)')}.`,
      answer: math(answer),
      distractors: [wrong, ask === 'domain' ? '{x | x in RR}' : '{y | y in RR}', flipped, negated(answer)].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `The inverse swaps inputs and outputs: its domain is the range of ${math('f')}, and its range is the domain of ${math('f')}. So the ${ask} of ${math('f^(-1)')} is ${math(answer)}.`,
    };
  },
});

export const invIsFunction = pc40s('40s-inv-is-function', {
  points: 1,
  levels: { 1: 'Lines and parabolas', 2: 'Piecewise graphs', 3: 'Cubics and restricted domains' },
  options: [
    radioOption('graphs', 'Graphs', [['1', 'Lines and parabolas'], ['2', 'Piecewise graphs'], ['3', 'Cubics and restricted domains']], ['1', '2', '3']),
    radioOption('answer', 'Answers', [['mixed', 'Yes or no'], ['yes', 'Always yes'], ['no', 'Always no']], ['mixed', 'mixed', 'mixed']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'graphs', gl);
    const ans = optOne(o, 'answer', 'mixed');
    const yes = () => (ans === 'mixed' ? rng.next() < 0.5 : ans === 'yes');
    let curves: Array<{ f?: (x: number) => number; points?: Pt[]; domain?: [number, number] }>, oneToOne: boolean, window = { xMin: -6, xMax: 6, yMin: -6, yMax: 6 };
    if (difficulty === 2) {
      const monotone = yes();
      const isMonotone = (g: PL) => g.every((p, i) => i === 0 || p[1] > g[i - 1][1]) || g.every((p, i) => i === 0 || p[1] < g[i - 1][1]);
      let f: PL;
      do { f = randomPL(rng, { count: 4, xMin: -5, xMax: 5, yMin: -5, yMax: 5 }); } while (isMonotone(f) !== monotone);
      curves = [{ points: f }]; oneToOne = monotone; window = fitWindow([f], 1, 5);
    } else if (difficulty === 1) {
      const line = yes();
      const m = rng.nonZero(-2, 2), c = rng.int(-3, 3);
      curves = [{ f: line ? (x: number) => m * x + c : (x: number) => 0.5 * m * (x - c) ** 2 - 3 }];
      oneToOne = line;
    } else {
      const cubic = rng.next() < 0.5;
      const restricted = yes();
      curves = cubic ? [{ f: (x: number) => (restricted ? 0.1 * x ** 3 : 0.1 * x ** 3 - 1.5 * x) }] : [{ f: (x: number) => 0.4 * (x - 1) ** 2 - 4, domain: restricted ? [1, 6] : [-6, 6] }];
      oneToOne = restricted;
    }
    const graph = graphTypst({ ...window, width: 4.5, height: 4.5, xLabelStep: 2, yLabelStep: 2, curves });
    return {
      body: `The graph of ${math('y = f(x)')} is shown. Is the inverse of ${math('f')} a function?\n\n${graph}`,
      answer: oneToOne ? 'Yes: every horizontal line meets the graph at most once.' : 'No: some horizontal line meets the graph more than once.',
      distractors: oneToOne
        ? ['No: some horizontal line meets the graph more than once.', 'No: some vertical line meets the graph more than once.', 'Yes: every vertical line meets the graph at most once.']
        : ['Yes: every horizontal line meets the graph at most once.', 'Yes: every vertical line meets the graph at most once.', 'No: some vertical line meets the graph more than once.'],
      solution: `The inverse swaps ${math('x')} and ${math('y')}, so vertical lines on the inverse correspond to horizontal lines on ${math('f')}. Apply the horizontal line test: ${oneToOne ? 'no horizontal line crosses the graph twice, so the inverse is a function.' : 'a horizontal line crosses the graph at least twice, so the inverse is not a function.'}`,
    };
  },
});

export const invSketch = pc40s('40s-inv-sketch', {
  levels: { 1: 'Three key points', 2: 'Four key points', 3: 'Five key points' },
  options: [
    { ...radioOption('points', 'Key points', [['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']], ['3', '4', '5']), slider: true },
    sizeOption([3, 4, 5, 6], [4, 4, 4], 'Size of coordinates'),
  ],
  generate(rng, difficulty, o) {
    const N = optNum(o, 'size', 4);
    const f = randomPL(rng, { count: optNum(o, 'points', difficulty + 2), xMin: -N, xMax: N, yMin: -N, yMax: N });
    const swap = (g: PL, map: (p: Pt) => Pt) => g.map(map);
    const inverse = swap(f, ([x, y]) => [y, x]);
    const window = fitWindow([f, inverse]);
    const withMirror = (g: PL) => graphTypst({ ...window, width: 3.4, height: 3.4, curves: [{ f: (x) => x, dashed: true }, { points: f, faint: true }, { points: g }], dots: g.map(([x, y]) => ({ x, y })) });
    return {
      body: `The graph of ${math('y = f(x)')} is shown. Graph its inverse.\n\n${plGraph([f], 4.5, window)}`,
      answer: withMirror(inverse),
      distractors: [withMirror(swap(f, ([x, y]) => [x, -y])), withMirror(swap(f, ([x, y]) => [-x, y])), withMirror(swap(f, ([x, y]) => [-y, -x]))],
      solution: `Swap the coordinates of each key point (a reflection in ${math('y = x')}): ${f.map(([x, y]) => math(`(${x}, ${y}) -> (${y}, ${x})`)).join(', ')}.`,
    };
  },
});

export const INVERSE_GENERATORS = [invLinear, invQuadratic, invVerify, invDomainRange, invIsFunction, invSketch];
