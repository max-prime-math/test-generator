import type { Rng } from '../../rng.ts';
import { poly } from '../../format.ts';
import { Q } from '../../exact.ts';
import { graphTypst } from '../../graph.ts';
import { math, pc30s } from '../pc40s/common.ts';
import { optNum, optOn, radioOption, sizeOption, toggleOption } from '../../options.ts';
import { fromRoots, polyEval } from '../pc40s/functions.ts';

/** A linear f(x) = ax + b with a whole-number zero, or a quadratic with two whole-number zeros. */
function randomF(rng: Rng, quadratic: boolean, N = 5): { coefs: number[]; zeros: number[] } {
  if (quadratic) {
    const r = rng.int(-N, 1), s = rng.int(r + 1, N);
    return { coefs: fromRoots([r, s]), zeros: [r, s] };
  }
  const a = rng.nonZero(-3, 3), z = rng.int(-N, N);
  return { coefs: [a, -a * z], zeros: [z] };
}

const absText = (coefs: number[]) => `|${poly(coefs)}|`;

/**
 * Every x in [lo, hi] where g changes sign or touches zero, found by scanning:
 * used to confirm that the whole-number solutions shown are the only ones.
 */
function crossings(g: (x: number) => number, lo = -10, hi = 10, step = 0.001): number[] {
  const out: number[] = [];
  let prev = g(lo);
  for (let x = lo + step; x <= hi; x += step) {
    const v = g(x);
    if (v === 0 || Math.sign(v) !== Math.sign(prev) || Math.abs(v) < 1e-9) {
      if (!out.length || x - out[out.length - 1] > 0.05) out.push(x);
    }
    prev = v;
  }
  return out;
}
const allWhole = (xs: number[], shown: number[]) => xs.every((x) => shown.some((h) => Math.abs(h - x) < 0.02));

export const absfTable = pc30s('30s-absf-table', {
  points: 1,
  levels: { 1: 'Linear f', 2: 'Quadratic f', 3: 'Values given only as a table' },
  options: [
    radioOption('form', 'f(x)', [['1', 'Linear f'], ['2', 'Quadratic f'], ['3', 'Values given only as a table']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const { coefs } = randomF(rng, difficulty > 1, optNum(o, 'size', 5));
    const shift = rng.int(-2, 1);
    const xs = [-2, -1, 0, 1, 2, 3].map((x) => x + shift);
    const ys = xs.map((x) => polyEval(coefs, x));
    const table = (row: number[]) => `#table(columns: ${xs.length + 1}, align: center, inset: 5pt, [$x$], ${xs.map((x) => `[$${x}$]`).join(', ')}, [$y$], ${row.map((y) => `[$${y}$]`).join(', ')})`;
    const answer = ys.map((y) => Math.abs(y)).join(', ');
    return {
      body: `${difficulty === 3 ? 'A function has this table of values.' : `The table shows values of ${math(`f(x) = ${poly(coefs)}`)}.`} Find the corresponding values of ${math('y = |f(x)|')}.\n\n${table(ys)}`,
      answer: math(answer),
      distractors: [ys.map((y) => -Math.abs(y)).join(', '), ys.map((y) => -y).join(', '), ys.map((y) => (y < 0 ? 0 : y)).join(', ')].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Take the absolute value of each ${math('y')}-value: negative values become positive, and the others stay the same: ${math(answer)}.`,
    };
  },
});

export const absfPiecewise = pc30s('30s-absf-piecewise', {
  levels: { 1: '|ax + b|', 2: '|x² − c|', 3: '|x² + bx + c|' },
  options: [
    radioOption('form', 'Expression', [['1', '|ax + b|'], ['2', '|x² − c|'], ['3', '|x² + bx + c|']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const { coefs, zeros: [z] } = randomF(rng, false, optNum(o, 'size', 5));
      const pos = coefs[0] > 0 ? `x >= ${z}` : `x <= ${z}`, neg = coefs[0] > 0 ? `x < ${z}` : `x > ${z}`;
      const answer = `y = cases(${poly(coefs)} & "if" ${pos}, ${poly(coefs.map((c) => -c))} & "if" ${neg})`;
      return {
        body: `Write ${math(`y = ${absText(coefs)}`)} as a piecewise function.`,
        answer: math(answer),
        distractors: [`y = cases(${poly(coefs)} & "if" ${neg}, ${poly(coefs.map((c) => -c))} & "if" ${pos})`, `y = cases(${poly(coefs)} & "if" ${pos}, ${poly([-coefs[0], coefs[1]])} & "if" ${neg})`, `y = cases(${poly(coefs)} & "if" x >= ${-z}, ${poly(coefs.map((c) => -c))} & "if" x < ${-z})`].filter((d) => d !== answer).map(math),
        solution: `${math(poly(coefs))} is zero at ${math(`x = ${z}`)} and non-negative when ${math(pos)}. There ${math(`y = ${poly(coefs)}`)}; elsewhere the expression is negative, so ${math(`y = -(${poly(coefs)}) = ${poly(coefs.map((c) => -c))}`)}.`,
      };
    }
    const { coefs, zeros: [r, s] } = difficulty === 2 ? (() => { const c = rng.int(1, Math.min(4, optNum(o, 'size', 5))); return { coefs: [1, 0, -c * c], zeros: [-c, c] }; })() : randomF(rng, true, optNum(o, 'size', 5));
    const answer = `y = cases(${poly(coefs)} & "if" x <= ${r} "or" x >= ${s}, ${poly(coefs.map((c) => -c))} & "if" ${r} < x < ${s})`;
    return {
      body: `Write ${math(`y = ${absText(coefs)}`)} as a piecewise function.`,
      answer: math(answer),
      distractors: [
        `y = cases(${poly(coefs)} & "if" ${r} < x < ${s}, ${poly(coefs.map((c) => -c))} & "if" x <= ${r} "or" x >= ${s})`,
        `y = cases(${poly(coefs)} & "if" x >= ${s}, ${poly(coefs.map((c) => -c))} & "if" x < ${s})`,
        `y = cases(${poly(coefs)} & "if" x <= ${-s} "or" x >= ${-r}, ${poly(coefs.map((c) => -c))} & "if" ${-s} < x < ${-r})`,
        `y = cases(${poly(coefs)} & "if" x >= ${r}, ${poly(coefs.map((c) => -c))} & "if" x < ${r})`,
        `y = cases(${poly(coefs)} & "if" x <= ${r} "or" x >= ${s}, ${poly(coefs.map((c, i) => (i === 0 ? -c : c)))} & "if" ${r} < x < ${s})`,
      ].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `${math(poly(coefs))} has zeros ${math(`x = ${r}`)} and ${math(`x = ${s}`)}; it opens upward, so it is negative only between them. There ${math('|f(x)| = -f(x)')}.`,
    };
  },
});

export const absfFeatures = pc30s('30s-absf-features', {
  levels: { 1: 'Linear: intercepts', 2: 'Linear: domain and range', 3: 'Quadratic: range and intercepts' },
  options: [
    radioOption('form', 'Ask for', [['1', 'Linear: intercepts'], ['2', 'Linear: domain and range'], ['3', 'Quadratic: range and intercepts']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const quadratic = difficulty === 3;
    const { coefs, zeros } = randomF(rng, quadratic, optNum(o, 'size', 5));
    const f = `y = ${absText(coefs)}`;
    const yInt = Math.abs(polyEval(coefs, 0));
    const ask = difficulty === 1 ? rng.pick(['xint', 'yint'] as const) : difficulty === 2 ? rng.pick(['domain', 'range'] as const) : rng.pick(['range', 'xint', 'yint'] as const);
    const answers = {
      xint: zeros.map((z) => `(${z}, 0)`).join(', '),
      yint: `(0, ${yInt})`,
      domain: '{x | x in RR}',
      range: '{y | y >= 0, y in RR}',
    };
    const wrong = {
      xint: [zeros.map((z) => `(${-z}, 0)`).join(', '), `(0, ${zeros[0]})`, zeros.map((z) => `(${z}, 0)`).slice(0, 1).concat(quadratic ? [] : [`(${-zeros[0]}, 0)`]).join(', ')],
      yint: [`(0, ${-yInt || 1})`, `(${yInt}, 0)`, `(0, ${Math.abs(coefs[0])})`],
      domain: ['{x | x >= 0, x in RR}', `{x | x >= ${zeros[0]}, x in RR}`, '{x | x != 0, x in RR}'],
      range: ['{y | y in RR}', `{y | y >= ${Math.min(polyEval(coefs, zeros[0] - 1), 0)}, y in RR}`, '{y | y > 0, y in RR}'],
    };
    const noun = { xint: 'the x-intercept(s)', yint: 'the y-intercept', domain: 'the domain', range: 'the range' }[ask];
    return {
      body: `State ${noun} of ${math(f)}.`,
      answer: math(answers[ask]),
      distractors: wrong[ask].filter((w, i, all) => w && w !== answers[ask] && all.indexOf(w) === i).map(math),
      solution: {
        xint: `${math('|f(x)| = 0')} exactly where ${math('f(x) = 0')}: ${math(answers.xint)}.`,
        yint: `At ${math('x = 0')}: ${math(`y = |${polyEval(coefs, 0)}| = ${yInt}`)}.`,
        domain: `${math(poly(coefs))} is defined for every real ${math('x')}, and so is its absolute value: ${math(answers.domain)}.`,
        range: `An absolute value is never negative, and ${math('y = 0')} at the x-intercepts${quadratic ? '; the reflected part only adds positive values' : ''}: ${math(answers.range)}.`,
      }[ask],
    };
  },
});

export const absfSolve = pc30s('30s-absf-solve', {
  levels: { 1: '|ax + b| = c', 2: '|ax + b| = cx + d (check both cases)', 3: '|x² − c| = k' },
  options: [
    radioOption('form', 'Equation', [['1', '|ax + b| = c'], ['2', '|ax + b| = cx + d (check both cases)'], ['3', '|x² − c| = k']], ['1', '2', '3']),
    sizeOption([4, 8, 12], [8, 8, 8], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const N = optNum(o, 'size', 8);
      const a = rng.nonZero(-4, 4), x1 = rng.int(-N, N), c = rng.int(1, Math.round(N * 1.5));
      const b = c - a * x1; // a·x1 + b = c; other case a·x2 + b = −c
      const x2 = new Q(-c - b, a);
      const sols = [new Q(x1), x2].sort((p, q) => p.value - q.value);
      const answer = `x = ${sols.map((v) => v.typst()).join(', ')}`;
      return {
        body: `Solve: ${math(`|${poly([a, b])}| = ${c}`)}`,
        answer: math(answer),
        distractors: [`x = ${x1}`, `x = ${sols.map((v) => v.neg().typst()).sort().join(', ')}`, `x = ${new Q(c + b, a).typst()}, ${x2.typst()}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
        solution: `${math(`${poly([a, b])} = ${c}`)} or ${math(`${poly([a, b])} = -${c}`)}. These give ${math(answer)}. Both check.`,
      };
    }
    if (difficulty === 2) {
      for (;;) {
        const N = Math.max(3, Math.round(optNum(o, 'size', 8) * 0.75));
        const a = rng.nonZero(-3, 3), b = rng.int(-N, N), c = rng.nonZero(-2, 2), d = rng.int(-N, N);
        if (a === c || a === -c) continue;
        // Case 1: ax + b = cx + d; case 2: ax + b = −(cx + d)
        const x1 = new Q(d - b, a - c), x2 = new Q(-d - b, a + c);
        if (x1.d > 3 || x2.d > 3) continue;
        const ok = (x: Q) => new Q(c).mul(x).add(d).value >= 0;
        const valid = [x1, x2].filter(ok).filter((x, i, all) => all.findIndex((y) => y.eq(x)) === i).sort((p, q) => p.value - q.value);
        if (valid.length === 0) continue;
        const answer = `x = ${valid.map((v) => v.typst()).join(', ')}`;
        const both = `x = ${[x1, x2].sort((p, q) => p.value - q.value).map((v) => v.typst()).join(', ')}`;
        return {
          body: `Solve and verify: ${math(`|${poly([a, b])}| = ${poly([c, d])}`)}`,
          answer: math(answer),
          distractors: [both, `x = ${x1.typst()}`, `x = ${x2.typst()}`, `x = ${x1.neg().typst()}`].filter((dd, i, all) => dd !== answer && all.indexOf(dd) === i).map(math),
          solution: `Case 1: ${math(`${poly([a, b])} = ${poly([c, d])}`)} gives ${math(`x = ${x1.typst()}`)}. Case 2: ${math(`${poly([a, b])} = -(${poly([c, d])})`)} gives ${math(`x = ${x2.typst()}`)}. `
            + `The right side must be non-negative, so check each: ${[x1, x2].map((x) => `${math(`x = ${x.typst()}`)} ${ok(x) ? 'works' : 'is extraneous'}`).join('; ')}.`,
        };
      }
    }
    const c = rng.int(2, Math.max(3, optNum(o, 'size', 8) + 1)), k = rng.int(1, Math.round(optNum(o, 'size', 8) * 1.5));
    // x² − c = ±k
    const roots = [c + k, c - k].filter((v) => v >= 0).flatMap((v) => (v === 0 ? [0] : [Math.sqrt(v), -Math.sqrt(v)]));
    const nice = (v: number) => (Number.isInteger(v) ? String(v) : `${v < 0 ? '-' : ''}sqrt(${Math.round(v * v)})`);
    const sorted = [...new Set(roots.map((v) => Math.round(v * 1e9) / 1e9))].sort((p, q) => p - q);
    const answer = `x = ${sorted.map(nice).join(', ')}`;
    return {
      body: `Solve: ${math(`|x^2 - ${c}| = ${k}`)}`,
      answer: math(answer),
      distractors: [`x = ${[Math.sqrt(c + k), -Math.sqrt(c + k)].sort((p, q) => p - q).map(nice).join(', ')}`, `x = ${nice(Math.sqrt(c + k))}`, `x = ${[c + k, c - k].join(', ')}`].filter((d) => d !== answer).map(math),
      solution: `${math(`x^2 - ${c} = ${k}`)} gives ${math(`x^2 = ${c + k}`)}; ${math(`x^2 - ${c} = -${k}`)} gives ${math(`x^2 = ${c - k}`)}${c - k < 0 ? ', which has no real solution' : ''}. So ${math(answer)}.`,
    };
  },
});

export const absfNoSolution = pc30s('30s-absf-no-solution', {
  points: 1,
  levels: { 1: 'Linear equations', 2: 'Quadratic equations', 3: 'Rearranging first' },
  options: [
    radioOption('form', 'Equations', [['1', 'Linear equations'], ['2', 'Quadratic equations'], ['3', 'Rearranging first']], ['1', '2', '3']),
    toggleOption('explain', 'Ask for an explanation', [true, true, true]),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const labels = ['i', 'ii', 'iii', 'iv'];
    const make = (bad: boolean): string => {
      const inner = difficulty === 2 ? poly([1, rng.int(-5, 5), rng.int(-9, 9)]) : poly([rng.nonZero(-4, 4), rng.int(-9, 9)]);
      const k = rng.int(1, 9);
      if (difficulty === 3) return bad ? `|${inner}| + ${k + rng.int(1, 5)} = ${k}` : `|${inner}| - ${k} = ${rng.int(-k, 5)}`;
      return `|${inner}| = ${bad ? -k : rng.int(0, 9)}`;
    };
    const which = rng.int(0, labels.length - 1);
    const eqs = labels.map((_, i) => make(i === which));
    return {
      body: `Which equation has no solution?${optOn(o, 'explain', true) ? ' Explain.' : ''}\n\n${eqs.map((e, i) => `(${labels[i]}) ${math(e)}`).join(' #h(1.5em) ')}`,
      answer: `(${labels[which]})`,
      distractors: labels.filter((_, i) => i !== which).map((l) => `(${l})`),
      solution: `An absolute value is never negative. ${difficulty === 3 ? `Isolate the absolute value in (${labels[which]}): it would have to equal a negative number.` : `In (${labels[which]}) the absolute value equals a negative number.`} So (${labels[which]}) has no solution.`,
    };
  },
});

export const absfFindError = pc30s('30s-absf-find-error', {
  levels: { 1: 'A missing case', 2: 'A sign error in the second case', 3: 'An extraneous root kept' },
  options: [
    radioOption('form', 'Error', [['1', 'A missing case'], ['2', 'A sign error in the second case'], ['3', 'An extraneous root kept']], ['1', '2', '3']),
    sizeOption([4, 9, 15], [9, 9, 9], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 9);
    const a = rng.int(1, 4), b = rng.nonZero(-N, N);
    if (difficulty === 3) {
      // |x + b| = 2x + d with one extraneous root
      for (;;) {
        const d = rng.int(-6, 6);
        const x1 = new Q(b - d, 1), x2 = new Q(-b - d, 3);
        const ok = (x: Q) => x.mul(2).add(d).value >= 0;
        if (ok(x1) === ok(x2) || x2.d !== 1) continue;
        const valid = ok(x1) ? x1 : x2, bad = ok(x1) ? x2 : x1;
        const all = [x1, x2].sort((p, q) => p.value - q.value).map((v) => v.typst()).join(', ');
        return {
          body: `A student solved ${math(`|x ${b < 0 ? '-' : '+'} ${Math.abs(b)}| = ${poly([2, d])}`)} and got ${math(`x = ${all}`)}. Find the error and give the correct solution.`,
          answer: math(`x = ${valid.typst()}`),
          distractors: [`x = ${all}`, `x = ${bad.typst()}`, `x = ${valid.neg().typst()}`].map(math),
          solution: `Both cases were solved correctly, but ${math(`x = ${bad.typst()}`)} makes the right side negative, so it is extraneous. Check: ${math(`x = ${valid.typst()}`)} works. The solution is ${math(`x = ${valid.typst()}`)}.`,
        };
      }
    }
    const c = rng.int(1, Math.round(N * 1.3));
    const x1 = new Q(c - b, a), x2 = new Q(-c - b, a);
    const correct = `x = ${[x1, x2].sort((p, q) => p.value - q.value).map((v) => v.typst()).join(', ')}`;
    const studentWrong = difficulty === 1 ? `x = ${x1.typst()}` : `x = ${[x1, new Q(-c + b, a)].sort((p, q) => p.value - q.value).map((v) => v.typst()).join(', ')}`;
    return {
      body: `A student solved ${math(`|${poly([a, b])}| = ${c}`)} and got ${math(studentWrong)}. Find the error and give the correct solution.`,
      answer: math(correct),
      distractors: [studentWrong, `x = ${x2.typst()}`, `x = ${[x1, x2].map((v) => v.neg().typst()).join(', ')}`].filter((d, i, all) => d !== correct && all.indexOf(d) === i).map(math),
      solution: `${difficulty === 1 ? 'The student solved only the positive case.' : `The student made a sign error in the negative case: ${math(`${poly([a, b])} = -${c}`)} gives ${math(`x = ${x2.typst()}`)}.`} Both cases, ${math(`${poly([a, b])} = ${c}`)} and ${math(`${poly([a, b])} = -${c}`)}, give ${math(correct)}.`,
    };
  },
});

function absGraph(coefs: number[], size: number, extra: { horizontal?: number[]; dots?: Array<{ x: number; y: number }>; guide?: boolean } = {}): string {
  const guide = extra.guide === false ? [] : [{ f: (x: number) => polyEval(coefs, x), faint: true }];
  return graphTypst({ xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 2, yLabelStep: 2, width: size, height: size, curves: [...guide, { f: (x) => Math.abs(polyEval(coefs, x)) }], horizontal: extra.horizontal, dots: extra.dots });
}

export const absfSketch = pc30s('30s-absf-sketch', {
  levels: { 1: 'Linear', 2: 'Quadratic with two zeros', 3: 'Quadratic in vertex form' },
  options: [
    radioOption('form', 'f(x)', [['1', 'Linear'], ['2', 'Quadratic with two zeros'], ['3', 'Quadratic in vertex form']], ['1', '2', '3']),
    toggleOption('guide', 'Show y = f(x) dashed on the graphs', [true, true, true]),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    let coefs: number[];
    if (difficulty === 3) { const p = rng.int(-3, 3), q = rng.int(1, 5); coefs = [1, -2 * p, p * p - q]; }
    else coefs = randomF(rng, difficulty === 2).coefs;
    const guide = optOn(o, 'guide', true);
    const faint = guide ? [{ f: (x: number) => polyEval(coefs, x), faint: true }] : [];
    const plain = (c: number[], transform: (y: number) => number) => graphTypst({ xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 2, yLabelStep: 2, width: 3.4, height: 3.4, curves: [...faint, { f: (x) => transform(polyEval(c, x)) }] });
    return {
      body: `Graph ${math(`y = ${absText(coefs)}`)}.`,
      answer: absGraph(coefs, 3.4, { guide }),
      // Reflected the wrong way (−|f|), reflected in the y-axis instead, or y = f(|x|).
      distractors: [
        plain(coefs, (y) => -Math.abs(y)),
        plain(coefs.map((c, i) => ((coefs.length - 1 - i) % 2 === 1 ? -c : c)), (y) => Math.abs(y)),
        graphTypst({ xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 2, yLabelStep: 2, width: 3.4, height: 3.4, curves: [...faint, { f: (x) => polyEval(coefs, Math.abs(x)) }] }),
      ],
      solution: `Graph ${math(`y = ${poly(coefs)}`)}${guide ? ' (dashed)' : ''}, then reflect the parts below the x-axis in the x-axis. The x-intercepts stay where they are.`,
    };
  },
});

export const absfSolveGraph = pc30s('30s-absf-solve-graph', {
  levels: { 1: 'Linear, two intersections', 2: 'Quadratic', 3: 'Intersection with a line' },
  options: [
    radioOption('form', 'Equation', [['1', 'Linear, two intersections'], ['2', 'Quadratic'], ['3', 'Intersection with a line']], ['1', '2', '3']),
    toggleOption('dots', 'Mark the intersection points', [true, true, true]),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    for (;;) {
      const dots = optOn(o, 'dots', true);
      const { coefs } = randomF(rng, difficulty === 2);
      if (difficulty === 3) {
        // |f(x)| = mx + c through two lattice points of y = |f(x)|
        const xs = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
        const [p, q] = rng.shuffle(xs).slice(0, 2).sort((u, v) => u - v);
        const yp = Math.abs(polyEval(coefs, p)), yq = Math.abs(polyEval(coefs, q));
        const m = new Q(yq - yp, q - p);
        if (!m.isInt) continue;
        const c = yp - m.value * p;
        const hits = xs.filter((x) => Math.abs(polyEval(coefs, x)) === m.value * x + c);
        // Every intersection must be one of the whole-number points shown.
        if (hits.length < 1 || !allWhole(crossings((x) => Math.abs(polyEval(coefs, x)) - (m.value * x + c)), hits)) continue;
        const line = poly([m.value, c]);
        const answer = `x = ${hits.join(', ')}`;
        return {
          body: `The graphs of ${math(`y = ${absText(coefs)}`)} and ${math(`y = ${line}`)} are shown. Use them to solve ${math(`${absText(coefs)} = ${line}`)}.\n\n${graphTypst({ xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 2, yLabelStep: 2, width: 5, height: 5, curves: [{ f: (x) => Math.abs(polyEval(coefs, x)) }, { f: (x) => m.value * x + c, dashed: true }], dots: dots ? hits.map((x) => ({ x, y: m.value * x + c })) : [] })}`,
          answer: math(answer),
          distractors: [`x = ${hits.map((x) => m.value * x + c).join(', ')}`, `x = ${hits[0]}`, `x = ${hits.map((x) => -x).join(', ')}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
          solution: `The solutions are the x-coordinates of the intersection points: ${math(answer)}.`,
        };
      }
      const k = rng.int(1, 6);
      const xs: number[] = [];
      for (let x = -8; x <= 8; x++) if (Math.abs(polyEval(coefs, x)) === k) xs.push(x);
      const expected = difficulty === 2 ? 4 : 2;
      if (xs.length !== expected && !(difficulty === 2 && xs.length === 2)) continue;
      // Make sure there are no non-integer solutions we are not showing.
      if (!allWhole(crossings((x) => Math.abs(polyEval(coefs, x)) - k), xs)) continue;
      const answer = `x = ${xs.join(', ')}`;
      return {
        body: `The graphs of ${math(`y = ${absText(coefs)}`)} and ${math(`y = ${k}`)} are shown. Use them to solve ${math(`${absText(coefs)} = ${k}`)}.\n\n${absGraph(coefs, 5, { horizontal: [k], dots: dots ? xs.map((x) => ({ x, y: k })) : [] })}`,
        answer: math(answer),
        distractors: [`x = ${xs[0]}`, `x = ${xs.map((x) => -x).sort((p, q) => p - q).join(', ')}`, `x = ${xs.slice(0, 2).join(', ')}`, `x = ${k}, ${-k}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
        solution: `The solutions are the x-coordinates of the points where the graph meets the line ${math(`y = ${k}`)}: ${math(answer)}.`,
      };
    }
  },
});

export const ABSOLUTE_30S = [absfTable, absfPiecewise, absfFeatures, absfSolve, absfNoSolution, absfFindError, absfSketch, absfSolveGraph];
