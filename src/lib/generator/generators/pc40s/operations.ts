import type { Rng } from '../../rng.ts';
import { poly } from '../../format.ts';
import { Q } from '../../exact.ts';
import { graphTypst, type Pt } from '../../graph.ts';
import { math, pc40s } from './common.ts';
import { optNum, optOne, radioOption, sizeOption } from '../../options.ts';
import { fitWindow, plEval, plGraph, polyAdd, polyEval, polyMul, randomPL, pointText, type PL } from './functions.ts';

type Op = '+' | '-' | '*' | '/';
const OP_TEXT: Record<Op, string> = { '+': 'f + g', '-': 'f - g', '*': 'f g', '/': 'f/g' };

function linear(rng: Rng): number[] { return [rng.nonZero(-4, 4), rng.int(-6, 6)]; }
function quadratic(rng: Rng): number[] { return [rng.nonZero(-2, 2), rng.int(-4, 4), rng.int(-6, 6)]; }

export const opEquation = pc40s('40s-op-equation', {
  levels: { 1: 'Sum or difference of linear functions', 2: 'Products and differences with a quadratic', 3: 'A quotient that simplifies' },
  options: [
    radioOption('op', 'Operation', [['sum', 'f + g'], ['difference', 'f − g'], ['product', 'f g'], ['quotient', 'f/g (it simplifies)'], ['sumdiff', 'f + g or f − g'], ['proddiff', 'f g or f − g']], ['sumdiff', 'proddiff', 'quotient']),
    radioOption('g', 'g is', [['linear', 'Linear'], ['quadratic', 'Quadratic']], ['linear', 'quadratic', 'linear'], 'For a quotient, f is quadratic and g is linear.'),
  ],
  generate(rng, difficulty, o) {
    const opOpt = optOne(o, 'op', difficulty === 1 ? 'sumdiff' : difficulty === 2 ? 'proddiff' : 'quotient');
    if (opOpt === 'quotient') {
      const r = rng.nonZero(-6, 6);
      let s = rng.nonZero(-6, 6);
      while (s === r) s = rng.nonZero(-6, 6);
      const f = polyMul([1, -r], [1, -s]), g = [1, -s];
      const answer = `(f/g)(x) = ${poly([1, -r])}, x != ${s}`;
      return {
        body: `Given ${math(`f(x) = ${poly(f)}`)} and ${math(`g(x) = ${poly(g)}`)}, find ${math('(f/g)(x)')} and state any restriction.`,
        answer: math(answer),
        distractors: [`(f/g)(x) = ${poly([1, -r])}`, `(f/g)(x) = ${poly([1, -s])}, x != ${r}`, `(f/g)(x) = ${poly([1, -r])}, x != ${-s}`].map(math),
        solution: `${math(`(f/g)(x) = (${poly(f)})/(${poly(g)}) = ((${poly([1, -r])})(${poly([1, -s])}))/(${poly(g)}) = ${poly([1, -r])}`)}, with ${math(`x != ${s}`)} because ${math('g(x)')} cannot be 0.`,
      };
    }
    const f = linear(rng), g = optOne(o, 'g', difficulty === 1 ? 'linear' : 'quadratic') === 'linear' ? linear(rng) : quadratic(rng);
    const op: Op = opOpt === 'sum' ? '+' : opOpt === 'difference' ? '-' : opOpt === 'product' ? '*' : opOpt === 'sumdiff' ? rng.pick(['+', '-'] as const) : rng.pick(['*', '-'] as const);
    const result = op === '+' ? polyAdd(f, g) : op === '-' ? polyAdd(f, g, -1) : polyMul(f, g);
    const answer = `(${OP_TEXT[op]})(x) = ${poly(result)}`;
    const wrong = [op === '-' ? polyAdd(g, f, -1) : polyAdd(f, g, -1), op === '*' ? polyAdd(f, g) : polyMul(f, g), op === '-' ? polyAdd(f, g.map((c, i) => (i === 0 ? -c : c))) : polyAdd(f, g).map((c, i, a) => (i === a.length - 1 ? -c : c))];
    return {
      body: `Given ${math(`f(x) = ${poly(f)}`)} and ${math(`g(x) = ${poly(g)}`)}, find ${math(`(${OP_TEXT[op]})(x)`)}.`,
      answer: math(answer),
      distractors: wrong.map((w) => `(${OP_TEXT[op]})(x) = ${poly(w)}`).filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `${math(`(${OP_TEXT[op]})(x) = ${op === '*' ? `(${poly(f)})(${poly(g)})` : `(${poly(f)}) ${op} (${poly(g)})`} = ${poly(result)}`)}.`,
    };
  },
});

export const opDomain = pc40s('40s-op-domain', {
  levels: { 1: 'A quotient of linear functions', 2: 'A sum with a square root', 3: 'A quotient with a square root' },
  options: [radioOption('form', 'Combination', [['1', 'A quotient of linear functions'], ['2', 'A sum or product with a square root'], ['3', 'A quotient with a square root']], ['1', '2', '3'])],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl);
    const a = rng.int(-5, 5), b = rng.nonZero(-6, 6);
    if (difficulty === 1) {
      const f = linear(rng), g = [1, -b];
      const answer = `{x | x != ${b}, x in RR}`;
      return {
        body: `Given ${math(`f(x) = ${poly(f)}`)} and ${math(`g(x) = ${poly(g)}`)}, state the domain of ${math('(f/g)(x)')}.`,
        answer: math(answer),
        distractors: [`{x | x != ${-b}, x in RR}`, '{x | x in RR}', `{x | x > ${b}, x in RR}`].map(math),
        solution: `The domain is every ${math('x')} in both domains, except where ${math('g(x) = 0')}: ${math(`x != ${b}`)}. ${math(answer)}.`,
      };
    }
    const root = `sqrt(${a === 0 ? 'x' : `x ${a > 0 ? '-' : '+'} ${Math.abs(a)}`})`;
    if (difficulty === 2) {
      const g = quadratic(rng);
      const op = rng.pick(['+', '*'] as const);
      const answer = `{x | x >= ${a}, x in RR}`;
      return {
        body: `Given ${math(`f(x) = ${root}`)} and ${math(`g(x) = ${poly(g)}`)}, state the domain of ${math(`(${OP_TEXT[op]})(x)`)}.`,
        answer: math(answer),
        distractors: [`{x | x >= ${-a}, x in RR}`, '{x | x in RR}', `{x | x > ${a}, x in RR}`, `{x | x <= ${a}, x in RR}`].filter((d) => d !== answer).map(math),
        solution: `${math('g')} is defined for all real numbers, but ${math(root)} needs ${math(`x >= ${a}`)}. The domain of a sum or product is where both are defined: ${math(answer)}.`,
      };
    }
    // x² − c² excludes ±c; only those ≥ a matter. c ≥ 1, so g always has two zeros.
    const c = rng.int(Math.max(1, a + 1), Math.max(1, a + 1) + 5);
    const excluded = [c, -c].filter((v) => v >= a && v !== 0).sort((x, y) => x - y);
    const answer = `{x | x >= ${a}, ${excluded.map((v) => `x != ${v}`).join(', ')}, x in RR}`;
    return {
      body: `Given ${math(`f(x) = ${root}`)} and ${math(`g(x) = x^2 - ${c * c}`)}, state the domain of ${math('(f/g)(x)')}.`,
      answer: math(answer),
      distractors: [`{x | x >= ${a}, x in RR}`, `{x | x != ${c}, x != ${-c}, x in RR}`, `{x | x > ${a}, x != ${c}, x != ${-c}, x in RR}`].filter((d) => d !== answer).map(math),
      solution: `${math(root)} needs ${math(`x >= ${a}`)}, and ${math(`g(x) = 0`)} at ${math(`x = ± ${c}`)}. Remove the zeros of ${math('g')} that are in the domain of ${math('f')}: ${math(answer)}.`,
    };
  },
});

export const opEvaluate = pc40s('40s-op-evaluate', {
  points: 1,
  levels: { 1: 'Sum and difference', 2: 'Product', 3: 'Quotient' },
  options: [
    radioOption('op', 'Operation', [['sumdiff', 'f + g or f − g'], ['product', 'f g'], ['quotient', 'f/g'], ['mixed', 'Any']], ['sumdiff', 'product', 'quotient']),
    sizeOption([3, 5, 8], [3, 3, 3], 'Size of the input'),
  ],
  generate(rng, difficulty, o) {
    const f = linear(rng), g = quadratic(rng);
    const opOpt = optOne(o, 'op', difficulty === 1 ? 'sumdiff' : difficulty === 2 ? 'product' : 'quotient');
    const op: Op = opOpt === 'sumdiff' ? rng.pick(['+', '-'] as const) : opOpt === 'product' ? '*' : opOpt === 'quotient' ? '/' : rng.pick(['+', '-', '*', '/'] as const);
    const N = optNum(o, 'size', 3);
    // A quotient needs g(x) ≠ 0.
    let x = rng.int(-N, N + 1);
    while (op === '/' && polyEval(g, x) === 0) x = rng.int(-N, N + 1);
    const fv = polyEval(f, x), gv = polyEval(g, x);
    const value = op === '+' ? new Q(fv + gv) : op === '-' ? new Q(fv - gv) : op === '*' ? new Q(fv * gv) : new Q(fv, gv);
    const wrong = [new Q(fv - gv), new Q(fv + gv), new Q(fv * gv), gv === 0 ? new Q(fv) : new Q(fv, gv), fv === 0 ? new Q(gv + 1) : new Q(gv, fv)];
    return {
      body: `Given ${math(`f(x) = ${poly(f)}`)} and ${math(`g(x) = ${poly(g)}`)}, evaluate ${math(`(${OP_TEXT[op]})(${x})`)}.`,
      answer: math(value.typst()),
      distractors: wrong.filter((w) => !w.eq(value)).map((w) => w.typst()).filter((d, i, all) => all.indexOf(d) === i).map(math),
      solution: `${math(`f(${x}) = ${fv}`)} and ${math(`g(${x}) = ${gv}`)}, so ${math(`(${OP_TEXT[op]})(${x}) = ${op === '*' ? `(${fv})(${gv})` : op === '/' ? `(${fv})/(${gv})` : `${fv} ${op} (${gv})`} = ${value.typst()}`)}.`,
    };
  },
});

export const opComposeEvaluate = pc40s('40s-op-compose-evaluate', {
  points: 1,
  levels: { 1: 'f(g(a)) with linear functions', 2: 'With a quadratic', 3: 'f(f(a)) and g(f(a))' },
  options: [
    radioOption('order', 'Evaluate', [['fg', 'f(g(a))'], ['gf', 'g(f(a))'], ['ff', 'f(f(a))'], ['mixed', 'f(f(a)) or g(f(a))']], ['fg', 'fg', 'mixed']),
    radioOption('f', 'f is', [['linear', 'Linear'], ['quadratic', 'Quadratic']], ['linear', 'quadratic', 'quadratic']),
  ],
  generate(rng, difficulty, o) {
    const f = optOne(o, 'f', difficulty === 1 ? 'linear' : 'quadratic') === 'linear' ? linear(rng) : quadratic(rng), g = linear(rng);
    const a = rng.int(-3, 3);
    const order = optOne(o, 'order', difficulty === 3 ? 'mixed' : 'fg');
    const form = order === 'mixed' ? rng.pick(['ff', 'gf'] as const) : order as 'fg' | 'gf' | 'ff';
    const [outer, inner, outerName, innerName] = form === 'fg' ? [f, g, 'f', 'g'] : form === 'gf' ? [g, f, 'g', 'f'] : [f, f, 'f', 'f'];
    const mid = polyEval(inner, a), value = polyEval(outer, mid);
    const swapped = polyEval(inner, polyEval(outer, a));
    return {
      body: `Given ${math(`f(x) = ${poly(f)}`)} and ${math(`g(x) = ${poly(g)}`)}, evaluate ${math(`${outerName}(${innerName}(${a}))`)}.`,
      answer: math(String(value)),
      distractors: [swapped, polyEval(outer, a) * mid, polyEval(outer, a) + mid, mid].filter((v) => v !== value).map((v) => String(v)).filter((d, i, all) => all.indexOf(d) === i).map(math),
      solution: `Work from the inside out: ${math(`${innerName}(${a}) = ${mid}`)}, then ${math(`${outerName}(${mid}) = ${value}`)}.`,
    };
  },
});

export const opComposeEquation = pc40s('40s-op-compose-equation', {
  levels: { 1: 'Linear functions', 2: 'A quadratic', 3: 'Radicals and reciprocals, with restrictions' },
  options: [
    radioOption('functions', 'Functions', [['1', 'Two linear functions'], ['2', 'A quadratic and a linear function'], ['3', 'A radical or reciprocal, with restrictions']], ['1', '2', '3']),
    radioOption('order', 'Find (linear and quadratic)', [['fg', 'f(g(x))'], ['gf', 'g(f(x))'], ['either', 'Either']], ['either', 'fg', 'fg']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'functions', gl);
    if (difficulty === 3) {
      const c = rng.nonZero(-5, 5);
      let d = rng.nonZero(-5, 5);
      while (c + d === 0) d = rng.nonZero(-5, 5);
      const g = [1, c];
      const radical = rng.next() < 0.5;
      const shifted = c + d; // f(x) = 1/(x + d) → f(g(x)) = 1/(x + c + d)
      if (radical) {
        const answer = `f(g(x)) = sqrt(${poly(g)}), x >= ${-c}`;
        return {
          body: `Given ${math('f(x) = sqrt(x)')} and ${math(`g(x) = ${poly(g)}`)}, find ${math('f(g(x))')} and state its domain.`,
          answer: math(answer),
          distractors: [`f(g(x)) = sqrt(x) ${c < 0 ? '-' : '+'} ${Math.abs(c)}, x >= 0`, `f(g(x)) = sqrt(${poly(g)}), x >= ${c}`, `f(g(x)) = sqrt(${poly(g)}), x in RR`].map(math),
          solution: `${math(`f(g(x)) = f(${poly(g)}) = sqrt(${poly(g)})`)}. The radicand must be non-negative: ${math(`${poly(g)} >= 0`)}, so ${math(`x >= ${-c}`)}.`,
        };
      }
      const f = `1/(x ${d < 0 ? '-' : '+'} ${Math.abs(d)})`;
      const answer = `f(g(x)) = 1/(${poly([1, shifted])}), x != ${-shifted}`;
      return {
        body: `Given ${math(`f(x) = ${f}`)} and ${math(`g(x) = ${poly(g)}`)}, find ${math('f(g(x))')} and state any restriction.`,
        answer: math(answer),
        distractors: [`f(g(x)) = 1/(${poly([1, d])}) ${c < 0 ? '-' : '+'} ${Math.abs(c)}, x != ${-d}`, `f(g(x)) = 1/(${poly([1, shifted])}), x != ${shifted}`, `f(g(x)) = 1/(${poly([1, shifted])}), x != ${-d}`].filter((x) => x !== answer).map(math),
        solution: `${math(`f(g(x)) = 1/((${poly(g)}) ${d < 0 ? '-' : '+'} ${Math.abs(d)}) = 1/(${poly([1, shifted])})`)}, so ${math(`x != ${-shifted}`)}.`,
      };
    }
    const f = difficulty === 1 ? linear(rng) : quadratic(rng), g = linear(rng);
    const order = optOne(o, 'order', difficulty === 1 ? 'either' : 'fg');
    const outerFirst = order === 'either' ? rng.next() < 0.5 : order === 'fg';
    const [outer, inner, label] = outerFirst ? [f, g, 'f(g(x))'] : [g, f, 'g(f(x))'];
    // outer(inner(x)): substitute the inner polynomial into the outer one.
    const compose = (o: number[], i: number[]) => o.reduce((acc, c) => polyAdd(polyMul(acc, i), [c]), [0]);
    const result = compose(outer, inner);
    const answer = `${label} = ${poly(result)}`;
    return {
      body: `Given ${math(`f(x) = ${poly(f)}`)} and ${math(`g(x) = ${poly(g)}`)}, find ${math(label)}.`,
      answer: math(answer),
      distractors: [compose(inner, outer), polyMul(outer, inner), polyAdd(outer, inner)].map((w) => `${label} = ${poly(w)}`).filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Substitute ${math(outerFirst ? 'g(x)' : 'f(x)')} for ${math('x')} in ${math(outerFirst ? 'f' : 'g')}: ${math(`${label} = ${poly(result)}`)}.`,
    };
  },
});

export const opDecompose = pc40s('40s-op-decompose', {
  levels: { 1: 'Powers', 2: 'Radicals and reciprocals', 3: 'Two-step compositions' },
  options: [radioOption('form', 'h(x) is', [['1', 'A power of a linear expression'], ['2', 'A radical, reciprocal, or exponential'], ['3', 'A two-step composition']], ['1', '2', '3'])],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl);
    const inner = poly([rng.nonZero(-4, 4), rng.nonZero(-7, 7)]);
    const n = rng.int(2, 5);
    const [h, f] = difficulty === 1
      ? [`(${inner})^${n}`, `x^${n}`]
      : difficulty === 2
        ? rng.pick([[`sqrt(${inner})`, 'sqrt(x)'], [`1/(${inner})`, '1/x'], [`2^(${inner})`, '2^x']] as const)
        : rng.pick([[`3(${inner})^2 - 5`, '3x^2 - 5'], [`sqrt(${inner}) + 4`, 'sqrt(x) + 4'], [`2/(${inner})^2`, '2/x^2']] as const);
    const answer = `f(x) = ${f}, g(x) = ${inner}`;
    return {
      body: `Find functions ${math('f')} and ${math('g')} so that ${math(`h(x) = f(g(x))`)}, where ${math(`h(x) = ${h}`)}.`,
      answer: math(answer),
      distractors: [`f(x) = ${inner}, g(x) = ${f}`, `f(x) = ${f}, g(x) = x`, `f(x) = x, g(x) = ${h}`].map(math),
      solution: `${math('g')} is the inner expression and ${math('f')} is what is done to it: ${math(answer)}. Check: ${math(`f(g(x)) = ${h}`)}. (Other answers are possible.)`,
    };
  },
});

/** Two piecewise-linear functions whose values at the key x-values are integers. */
function twoFunctions(rng: Rng): [PL, PL] {
  const f = randomPL(rng, { count: 5, xMin: -4, xMax: 4, yMin: -3, yMax: 3 });
  const g = randomPL(rng, { count: 5, xMin: -4, xMax: 4, yMin: -3, yMax: 3 });
  return [f, g];
}

const intAt = (f: PL, x: number) => Number.isInteger(plEval(f, x));

export const opFromGraphs = pc40s('40s-op-from-graphs', {
  levels: { 1: 'Sum and difference', 2: 'Product and quotient', 3: 'Compositions' },
  options: [radioOption('op', 'Evaluate', [['1', 'Sums and differences'], ['2', 'Products and quotients'], ['3', 'Compositions']], ['1', '2', '3'])],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'op', gl);
    for (;;) {
      const [f, g] = twoFunctions(rng);
      const xs = [-4, -3, -2, -1, 0, 1, 2, 3, 4].filter((x) => intAt(f, x) && intAt(g, x));
      if (!xs.length) continue;
      const a = rng.pick(xs);
      const fa = plEval(f, a), ga = plEval(g, a);
      let expr: string, value: Q, steps: string, wrong: Q[];
      if (difficulty === 3) {
        if (!intAt(f, ga)) continue;
        const fga = plEval(f, ga);
        expr = `f(g(${a}))`; value = new Q(fga);
        steps = `${math(`g(${a}) = ${ga}`)}, then ${math(`f(${ga}) = ${fga}`)}`;
        wrong = [new Q(intAt(g, fa) ? plEval(g, fa) : fa + 10), new Q(fa * ga), new Q(fa + ga)];
      } else {
        const op: Op = difficulty === 1 ? rng.pick(['+', '-'] as const) : ga === 0 ? '*' : rng.pick(['*', '/'] as const);
        expr = `(${OP_TEXT[op]})(${a})`;
        value = op === '+' ? new Q(fa + ga) : op === '-' ? new Q(fa - ga) : op === '*' ? new Q(fa * ga) : new Q(fa, ga);
        steps = `${math(`f(${a}) = ${fa}`)} and ${math(`g(${a}) = ${ga}`)}`;
        wrong = [new Q(fa + ga), new Q(fa - ga), new Q(ga - fa), new Q(fa * ga)];
      }
      const window = fitWindow([f, g], 1, 5);
      const graphs = `#grid(columns: 2, column-gutter: 1em, [${math('y = f(x)')} \\ ${plGraph([f], 4, window)}], [${math('y = g(x)')} \\ ${plGraph([g], 4, window)}])`;
      return {
        body: `Use the graphs to evaluate ${math(expr)}.\n\n${graphs}`,
        answer: math(value.typst()),
        distractors: wrong.filter((w) => !w.eq(value)).map((w) => w.typst()).filter((d, i, all) => all.indexOf(d) === i).map(math),
        solution: `From the graphs, ${steps}, so ${math(`${expr} = ${value.typst()}`)}.`,
      };
    }
  },
});

/** f ± g on the common domain, as a piecewise-linear function through every key x-value. */
function combine(f: PL, g: PL, sign: number): PL {
  const lo = Math.max(f[0][0], g[0][0]), hi = Math.min(f[f.length - 1][0], g[g.length - 1][0]);
  const xs = [...new Set([...f, ...g].map(([x]) => x).filter((x) => x >= lo && x <= hi))].sort((a, b) => a - b);
  return xs.map((x) => [x, plEval(f, x) + sign * plEval(g, x)] as Pt);
}

export const opSketch = pc40s('40s-op-sketch', {
  levels: { 1: 'y = f(x) + g(x)', 2: 'y = f(x) − g(x)', 3: 'Either, over a partial domain' },
  options: [radioOption('op', 'Graph', [['sum', 'f(x) + g(x)'], ['difference', 'f(x) − g(x)'], ['either', 'Either']], ['sum', 'difference', 'either'])],
  generate(rng, difficulty, o) {
    const opOpt = optOne(o, 'op', difficulty === 1 ? 'sum' : difficulty === 2 ? 'difference' : 'either');
    for (;;) {
      const [f, g] = twoFunctions(rng);
      const sign = opOpt === 'difference' ? -1 : opOpt === 'sum' ? 1 : rng.pick([1, -1]);
      const answerPL = combine(f, g, sign);
      if (answerPL.length < 3) continue;
      // The other combinations: f + g, f − g, g − f, and −(f + g), minus the correct one.
      const flip = (h: PL) => h.map(([x, y]) => [x, -y] as Pt);
      const others = sign > 0 ? [combine(f, g, -1), combine(g, f, -1), flip(combine(f, g, 1))] : [combine(f, g, 1), combine(g, f, -1), flip(combine(f, g, 1))];
      const window = fitWindow([f, g, answerPL, ...others], 1, 5);
      const label = sign > 0 ? 'y = f(x) + g(x)' : 'y = f(x) - g(x)';
      const both = graphTypst({ ...window, width: 5, height: 5, curves: [{ points: f }, { points: g, dashed: true }], dots: [...f, ...g].map(([x, y]) => ({ x, y })) });
      return {
        body: `The graphs of ${math('y = f(x)')} (solid) and ${math('y = g(x)')} (dashed) are shown. Graph ${math(label)}.\n\n${both}`,
        answer: plGraph([answerPL], 3.4, window),
        distractors: others.map((o) => plGraph([o], 3.4, window)),
        solution: `${sign > 0 ? 'Add' : 'Subtract'} the y-values at each key x-value where both are defined: ${answerPL.map((p) => math(pointText(p))).join(', ')}. The domain is where both functions are defined.`,
      };
    }
  },
});

export const opAbsReciprocal = pc40s('40s-op-abs-reciprocal', {
  levels: { 1: 'y = |f(x)|', 2: 'y = 1/f(x) for a linear f', 3: 'y = 1/f(x) for a quadratic f' },
  options: [radioOption('graph', 'Graph', [['1', 'y = |f(x)|'], ['2', 'y = 1/f(x), f linear'], ['3', 'y = 1/f(x), f quadratic']], ['1', '2', '3'])],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'graph', gl);
    if (difficulty === 1) {
      const f = randomPL(rng, { count: 5, xMin: -4, xMax: 4, yMin: -4, yMax: 4 });
      // Include the x-intercepts as key points so |f| folds cleanly.
      const pts: Pt[] = [];
      f.forEach((p, i) => {
        if (i > 0) {
          const [x0, y0] = f[i - 1], [x1, y1] = p;
          if (y0 * y1 < 0) pts.push([x0 + ((x1 - x0) * -y0) / (y1 - y0), 0]);
        }
        pts.push(p);
      });
      const abs = pts.map(([x, y]) => [x, Math.abs(y)] as Pt);
      const window = fitWindow([f], 1, 5);
      return {
        body: `The graph of ${math('y = f(x)')} is shown. Graph ${math('y = |f(x)|')}.\n\n${plGraph([f], 4.5, window)}`,
        answer: plGraph([pts, abs], 3.4, window),
        distractors: [plGraph([pts, pts.map(([x, y]) => [x, -Math.abs(y)] as Pt)], 3.4, window), plGraph([pts, pts.map(([x, y]) => [Math.abs(x), y] as Pt).sort((p, q) => p[0] - q[0])], 3.4, window), plGraph([pts, pts.map(([x, y]) => [x, -y] as Pt)], 3.4, window)],
        solution: `Keep the parts of the graph on or above the x-axis, and reflect the parts below the x-axis in the x-axis. The x-intercepts are invariant points.`,
      };
    }
    const f = difficulty === 2 ? [rng.pick([1, -1, 2, 1 / 2]), rng.int(-3, 3)] : (() => { const r = rng.int(-4, 0), s = rng.int(1, 4); return polyMul([1, -r], [1, -s]).map((c) => c / 2); })();
    const zeros = difficulty === 2 ? [-f[1] / f[0]] : (() => { const [A, B, C] = f; const d = Math.sqrt(B * B - 4 * A * C); return [(-B - d) / (2 * A), (-B + d) / (2 * A)]; })();
    const fx = (x: number) => polyEval(f, x);
    const window = { xMin: -6, xMax: 6, yMin: -6, yMax: 6 };
    const recip = (g: (x: number) => number, dashed = false) => graphTypst({ ...window, width: 3.4, height: 3.4, xLabelStep: 2, yLabelStep: 2, curves: [{ f: fx, faint: true }, { f: (x) => 1 / g(x), dashed }], vertical: zeros, horizontal: [0] });
    return {
      body: `The graph of ${math('y = f(x)')} is shown. Graph ${math('y = 1/f(x)')}.\n\n${graphTypst({ ...window, width: 4.5, height: 4.5, xLabelStep: 2, yLabelStep: 2, curves: [{ f: fx }] })}`,
      answer: recip(fx),
      distractors: [
        graphTypst({ ...window, width: 3.4, height: 3.4, xLabelStep: 2, yLabelStep: 2, curves: [{ f: fx, faint: true }, { f: (x) => -1 / fx(x) }], vertical: zeros, horizontal: [0] }),
        graphTypst({ ...window, width: 3.4, height: 3.4, xLabelStep: 2, yLabelStep: 2, curves: [{ f: fx, faint: true }, { f: (x) => -fx(x) }] }),
        graphTypst({ ...window, width: 3.4, height: 3.4, xLabelStep: 2, yLabelStep: 2, curves: [{ f: fx, faint: true }, { f: (x) => Math.abs(fx(x)) }] }),
      ],
      solution: `Vertical asymptotes occur at the zeros of ${math('f')}: ${math(zeros.map((z) => `x = ${Number(z.toFixed(2))}`).join(', '))}. Points where ${math('f(x) = ± 1')} are invariant, and ${math('1/f(x)')} has the same sign as ${math('f(x)')}. Where ${math('|f(x)|')} is large, ${math('1/f(x)')} is near 0.`,
    };
  },
});

export const OPERATION_GENERATORS = [opEquation, opDomain, opEvaluate, opComposeEvaluate, opComposeEquation, opDecompose, opFromGraphs, opSketch, opAbsReciprocal];
