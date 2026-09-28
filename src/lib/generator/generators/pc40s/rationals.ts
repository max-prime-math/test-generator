import type { Rng } from '../../rng.ts';
import { Q } from '../../exact.ts';
import { graphTypst, type Dot } from '../../graph.ts';
import { math, pc40s } from './common.ts';
import { factorText, fromRoots, poly, polyEval } from './functions.ts';

/** f(x) = lead · Π(x − top) / Π(x − bottom), with any shared factor giving a hole. */
interface Rational { lead: number; top: number[]; bottom: number[] }

const holes = (f: Rational) => f.bottom.filter((b) => f.top.includes(b));
const asymptotes = (f: Rational) => [...new Set(f.bottom.filter((b) => !f.top.includes(b)))];
const value = (f: Rational, x: number) => (f.lead * f.top.reduce((acc, r) => acc * (x - r), 1)) / f.bottom.reduce((acc, r) => acc * (x - r), 1);
/** The simplified function's value at a hole. */
const holeValue = (f: Rational, h: number) => {
  const top = [...f.top]; top.splice(top.indexOf(h), 1);
  const bottom = [...f.bottom]; bottom.splice(bottom.indexOf(h), 1);
  return new Q(f.lead * top.reduce((acc, r) => acc * (h - r), 1), bottom.reduce((acc, r) => acc * (h - r), 1));
};
/** Horizontal asymptote: y = 0 (degree of top lower), y = lead (equal degrees), or none. */
const horizontal = (f: Rational) => (f.top.length < f.bottom.length ? 0 : f.top.length === f.bottom.length ? f.lead : null);

/** The rational function in expanded form, as it would be given: (x^2 - x - 6)/(x^2 - 4). */
function expandedText(f: Rational): string {
  const top = poly(fromRoots(f.top, f.lead)), bottom = poly(fromRoots(f.bottom));
  const wrap = (s: string) => (/^[0-9a-z^]+$/.test(s) ? s : `(${s})`);
  return `${wrap(top)}/${wrap(bottom)}`;
}

function factoredRational(f: Rational): string {
  const lead = f.lead === 1 ? '' : f.lead === -1 ? '-' : String(f.lead);
  const top = f.top.length ? f.top.map((r) => factorText(r)).join('') : '1';
  return `(${lead}${top})/(${f.bottom.map((r) => factorText(r)).join('')})`;
}

/** Distinct factors on each side, so every shared factor is a single hole (distractor variants can break this). */
const wellFormed = (f: Rational) => new Set(f.top).size === f.top.length && new Set(f.bottom).size === f.bottom.length;

function distinct(rng: Rng, n: number, lo = -5, hi = 5): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(lo, hi));
  return [...out];
}

/** A rational function for each level: one asymptote; a hole and an asymptote; two asymptotes and a hole. */
function randomRational(rng: Rng, difficulty: number): Rational {
  if (difficulty === 1) { const [s, t] = distinct(rng, 2); return { lead: rng.pick([1, 2, -1]), top: [s], bottom: [t] }; }
  if (difficulty === 2) { const [r, s, t] = distinct(rng, 3); return { lead: 1, top: [r, s], bottom: [r, t] }; }
  const [r, s, t, u] = distinct(rng, 4); return { lead: 1, top: [r, s], bottom: [r, t, u] };
}

function rationalGraph(f: Rational, size: number, extra: Dot[] = []): string {
  const hs = holes(f);
  return graphTypst({
    xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 4, yLabelStep: 4, width: size, height: size,
    curves: [{ f: (x) => (hs.some((h) => Math.abs(x - h) < 1e-6) ? NaN : value(f, x)) }],
    vertical: asymptotes(f), horizontal: horizontal(f) === null ? [] : [horizontal(f)!],
    dots: [...hs.map((h) => ({ x: h, y: holeValue(f, h).value, open: true })), ...extra],
  });
}

export const ratNpv = pc40s('40s-rat-npv', {
  levels: { 1: 'List the non-permissible values', 2: 'Asymptote or hole?', 3: 'Two asymptotes and a hole' },
  generate(rng, difficulty) {
    const f = randomRational(rng, Math.max(difficulty, 2));
    const npv = [...new Set(f.bottom)].sort((a, b) => a - b);
    if (difficulty === 1) {
      const answer = `x != ${npv.join(', ')}`;
      return {
        body: `State the non-permissible values of ${math(`f(x) = ${expandedText(f)}`)}.`,
        answer: math(answer),
        distractors: [`x != ${npv.map((v) => -v).join(', ')}`, `x != ${[...new Set(f.top)].sort((a, b) => a - b).join(', ')}`, `x != ${asymptotes(f).join(', ')}`].filter((d) => d !== answer).map(math),
        solution: `Factor the denominator: ${math(poly(fromRoots(f.bottom)) + ' = ' + f.bottom.map((r) => factorText(r)).join(''))}. It is zero at ${math(npv.join(', '))}, so ${math(answer)}.`,
      };
    }
    const hole = holes(f)[0], vas = asymptotes(f).sort((a, b) => a - b);
    const answer = `"hole at" x = ${hole}", asymptote" ${vas.map((v) => `x = ${v}`).join(', ')}`;
    return {
      body: `For ${math(`f(x) = ${expandedText(f)}`)}, state each non-permissible value and whether it gives a vertical asymptote or a hole.`,
      answer: math(answer),
      distractors: [`"hole at" x = ${vas[0]}", asymptote" x = ${hole}${vas.length > 1 ? `, x = ${vas[1]}` : ''}`, `"asymptotes" ${[hole, ...vas].sort((a, b) => a - b).map((v) => `x = ${v}`).join(', ')}`, `"hole at" x = ${-hole}", asymptote" ${vas.map((v) => `x = ${-v}`).join(', ')}`].map(math),
      solution: `Factor: ${math(`f(x) = ${factoredRational(f)}`)}. The factor ${math(factorText(hole))} cancels, so ${math(`x = ${hole}`)} is a hole; the remaining factor${vas.length > 1 ? 's' : ''} in the denominator give${vas.length > 1 ? '' : 's'} the vertical asymptote${vas.length > 1 ? 's' : ''} ${math(vas.map((v) => `x = ${v}`).join(', '))}.`,
    };
  },
});

export const ratFeatures = pc40s('40s-rat-features', {
  levels: { 1: 'One vertical asymptote', 2: 'Equal degrees', 3: 'With a hole' },
  generate(rng, difficulty) {
    const f: Rational = difficulty === 1 ? randomRational(rng, 1)
      : difficulty === 2 ? (() => { const [s, u, t, v] = distinct(rng, 4); return { lead: rng.pick([1, 2, -1]), top: [s, u], bottom: [t, v] }; })()
      : randomRational(rng, 2);
    const ask = rng.pick(['vertical', 'horizontal', 'xint', 'yint'] as const);
    const vas = asymptotes(f).sort((a, b) => a - b), ha = horizontal(f)!;
    const zeros = [...new Set(f.top.filter((r) => !f.bottom.includes(r)))].sort((a, b) => a - b);
    const yInt = f.bottom.includes(0) ? null : new Q(f.lead * f.top.reduce((acc, r) => acc * -r, 1), f.bottom.reduce((acc, r) => acc * -r, 1));
    const answers = {
      vertical: vas.map((v) => `x = ${v}`).join(', '),
      horizontal: `y = ${ha}`,
      xint: zeros.length ? zeros.map((z) => `(${z}, 0)`).join(', ') : '"none"',
      yint: yInt ? `(0, ${yInt.typst()})` : '"none"',
    };
    const wrong = {
      vertical: [vas.map((v) => `x = ${-v}`).join(', '), [...new Set(f.bottom)].map((v) => `x = ${v}`).join(', '), zeros.map((z) => `x = ${z}`).join(', ') || 'x = 0'],
      horizontal: [`y = ${ha === 0 ? 1 : 0}`, `y = ${-ha || 2}`, `x = ${ha}`],
      xint: [f.top.map((z) => `(${-z}, 0)`).join(', '), [...new Set(f.top)].map((z) => `(${z}, 0)`).join(', '), vas.map((v) => `(${v}, 0)`).join(', ')],
      yint: [yInt ? `(0, ${yInt.neg().typst()})` : '(0, 0)', `(0, ${f.lead})`, yInt ? `(${yInt.typst()}, 0)` : '(0, 1)'],
    };
    const noun = { vertical: 'the equation(s) of the vertical asymptote(s)', horizontal: 'the equation of the horizontal asymptote', xint: 'the x-intercept(s)', yint: 'the y-intercept' }[ask];
    return {
      body: `State ${noun} of ${math(`f(x) = ${expandedText(f)}`)}.`,
      answer: math(answers[ask]),
      distractors: wrong[ask].filter((w, i, all) => w && w !== answers[ask] && all.indexOf(w) === i).map(math),
      solution: `Factor: ${math(`f(x) = ${factoredRational(f)}`)}. ${{
        vertical: `Zeros of the denominator that do not cancel give vertical asymptotes: ${math(answers.vertical)}.`,
        horizontal: `The degrees ${f.top.length === f.bottom.length ? `are equal, so the asymptote is the ratio of leading coefficients, ${math(answers.horizontal)}` : `of the numerator is lower, so the asymptote is ${math('y = 0')}`}.`,
        xint: `x-intercepts come from zeros of the numerator that do not cancel: ${math(answers.xint)}.`,
        yint: `Substitute ${math('x = 0')}: ${math(answers.yint)}.`,
      }[ask]}`,
    };
  },
});

export const ratHole = pc40s('40s-rat-hole', {
  levels: { 1: 'Linear over linear times the same factor', 2: 'Quadratic over quadratic', 3: 'With a leading coefficient' },
  generate(rng, difficulty) {
    const [r, s, t] = distinct(rng, 3);
    const f: Rational = { lead: difficulty === 3 ? rng.pick([2, 3, -2]) : 1, top: difficulty === 1 ? [r] : [r, s], bottom: [r, t] };
    const y = holeValue(f, r);
    return {
      body: `Find the coordinates of the point of discontinuity (hole) in the graph of ${math(`f(x) = ${expandedText(f)}`)}.`,
      answer: math(`(${r}, ${y.typst()})`),
      distractors: [`(${r}, 0)`, `(${t}, ${y.typst()})`, `(${-r}, ${y.neg().typst()})`, `(${r}, ${y.neg().typst()})`].filter((d, i, all) => d !== `(${r}, ${y.typst()})` && all.indexOf(d) === i).map(math),
      solution: `Factor and cancel: ${math(`f(x) = ${factoredRational(f)}`)}, so the hole is at ${math(`x = ${r}`)}. Substitute into the simplified function: ${math(`y = ${y.typst()}`)}. The hole is ${math(`(${r}, ${y.typst()})`)}.`,
    };
  },
});

export const ratBehaviour = pc40s('40s-rat-behaviour', {
  levels: { 1: 'Approaching from one side', 2: 'Approaching from the other side', 3: 'As x grows without bound' },
  generate(rng, difficulty) {
    const f = randomRational(rng, difficulty === 3 ? 1 : rng.pick([1, 3]));
    const vas = asymptotes(f);
    if (difficulty === 3) {
      const ha = horizontal(f)!;
      const dir = rng.pick(['oo', '-oo']);
      return {
        body: `Describe the behaviour of ${math(`f(x) = ${expandedText(f)}`)} as ${math(`x -> ${dir}`)}.`,
        answer: math(`y -> ${ha}`),
        distractors: [`y -> ${dir}`, `y -> ${dir === 'oo' ? '-oo' : 'oo'}`, `y -> ${ha === 0 ? 1 : 0}`].map(math),
        solution: `For large ${math('|x|')}, ${math('f(x)')} approaches its horizontal asymptote ${math(`y = ${ha}`)}.`,
      };
    }
    const c = rng.pick(vas);
    const side = difficulty === 1 ? '+' : '-';
    const y = value(f, c + (side === '+' ? 1e-4 : -1e-4));
    const answer = y > 0 ? 'y -> oo' : 'y -> -oo';
    return {
      body: `For ${math(`f(x) = ${expandedText(f)}`)}, describe what happens to ${math('y')} as ${math(`x -> ${c}^${side}`)}.`,
      answer: math(answer),
      distractors: [y > 0 ? 'y -> -oo' : 'y -> oo', `y -> ${horizontal(f) ?? 0}`, `y -> ${c}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `${math(`x = ${c}`)} is a vertical asymptote. Test a value just ${side === '+' ? 'right' : 'left'} of it, such as ${math(`x = ${c + (side === '+' ? 0.1 : -0.1)}`)}: ${math(`f(${c + (side === '+' ? 0.1 : -0.1)}) approx ${Math.round(value(f, c + (side === '+' ? 0.1 : -0.1)) * 10) / 10}`)}, which is ${y > 0 ? 'large and positive' : 'large and negative'}. So ${math(answer)}.`,
    };
  },
});

export const ratSketch = pc40s('40s-rat-sketch', {
  levels: { 1: 'One vertical asymptote', 2: 'With a hole', 3: 'Two vertical asymptotes' },
  generate(rng, difficulty) {
    const f = randomRational(rng, difficulty);
    const flip = (g: Rational): Rational => ({ ...g, lead: -g.lead });
    const shift = (g: Rational): Rational => ({ ...g, bottom: g.bottom.map((b) => (holes(g).includes(b) ? b : -b)) });
    const swap = (g: Rational): Rational => ({ ...g, top: g.top.map((t) => (holes(g).includes(t) ? t : -t)) });
    return {
      body: `Graph ${math(`f(x) = ${factoredRational(f)}`)}. Show asymptotes and any hole.`,
      answer: rationalGraph(f, 3.4),
      distractors: [flip(f), shift(f), swap(f)].filter(wellFormed).map((g) => rationalGraph(g, 3.4)),
      solution: `Vertical asymptote${asymptotes(f).length > 1 ? 's' : ''} ${math(asymptotes(f).map((v) => `x = ${v}`).join(', '))}; horizontal asymptote ${math(`y = ${horizontal(f)}`)}${holes(f).length ? `; hole at ${math(`(${holes(f)[0]}, ${holeValue(f, holes(f)[0]).typst()})`)}` : ''}. Use the intercepts and test points on each side of the vertical asymptotes to place the branches.`,
    };
  },
});

export const ratMatch = pc40s('40s-rat-match', {
  levels: { 1: 'One vertical asymptote', 2: 'With a hole', 3: 'Two vertical asymptotes' },
  generate(rng, difficulty) {
    const f = randomRational(rng, difficulty);
    const variants: Rational[] = [{ ...f, lead: -f.lead }, { ...f, bottom: f.bottom.map((b) => (holes(f).includes(b) ? b : b + 1)) }, { ...f, top: f.top.map((t) => (holes(f).includes(t) ? t : -t)) }];
    return {
      body: `Which graph matches ${math(`f(x) = ${expandedText(f)}`)}?`,
      answer: rationalGraph(f, 3.4),
      distractors: variants.filter(wellFormed).map((v) => rationalGraph(v, 3.4)),
      solution: `Factor: ${math(`f(x) = ${factoredRational(f)}`)}. Look for the vertical asymptote${asymptotes(f).length > 1 ? 's' : ''} ${math(asymptotes(f).map((v) => `x = ${v}`).join(', '))}${holes(f).length ? `, the hole at ${math(`x = ${holes(f)[0]}`)}` : ''}, the horizontal asymptote ${math(`y = ${horizontal(f)}`)}, and the intercepts.`,
    };
  },
});

export const ratSolveGraphically = pc40s('40s-rat-solve-graphically', {
  levels: { 1: 'Roots as x-intercepts', 2: 'Intersection with y = k', 3: 'Intersection with a line' },
  generate(rng, difficulty) {
    const window = { xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 2, yLabelStep: 2, width: 5.5, height: 5.5 };
    if (difficulty === 3) {
      // y = 6/(x − t) meets y = m(x − t) + c where x − t is x1 or x2, with x1·x2 dividing 6.
      const [u, v] = rng.pick([[1, 6], [2, 3], [-1, 6], [-2, 3], [-1, -6], [-2, -3], [1, -6], [2, -3]] as const);
      const t = rng.int(-2, 2);
      const m = -6 / (u * v), c = 6 / u + 6 / v;
      const xs = [u + t, v + t].sort((p, q) => p - q);
      const f = (x: number) => 6 / (x - t);
      const line = (x: number) => m * (x - t) + c;
      // m(x − t) + c, simplified to mx + b.
      const b = c - m * t;
      const lineText = `${m === 1 ? '' : m === -1 ? '-' : m}x${b === 0 ? '' : ` ${b < 0 ? '-' : '+'} ${Math.abs(b)}`}`;
      const fText = `6/(${t === 0 ? 'x' : `x ${t > 0 ? '-' : '+'} ${Math.abs(t)}`})`;
      const graph = graphTypst({ ...window, curves: [{ f }, { f: line, dashed: true }], vertical: [t], horizontal: [0], dots: xs.map((x) => ({ x, y: f(x) })) });
      const answer = `x = ${xs.join(', ')}`;
      return {
        body: `The graphs of ${math(`y = ${fText}`)} and ${math(`y = ${lineText}`)} are shown. Use them to solve ${math(`${fText} = ${lineText}`)}.\n\n${graph}`,
        answer: math(answer),
        distractors: [`x = ${xs[0]}`, `x = ${xs.map((x) => f(x)).join(', ')}`, `x = ${xs.map((x) => -x).join(', ')}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
        solution: `The solutions are the x-coordinates of the intersection points: ${math(answer)}.`,
      };
    }
    // lead(x − s)/(x − t) = k  →  x = (lead·s − k·t)/(lead − k); keep x a whole number inside the window.
    let f: Rational, k: number, x: Q;
    do {
      f = randomRational(rng, 1);
      k = difficulty === 1 ? 0 : rng.nonZero(-4, 4);
      if (f.lead === k) f.lead = -f.lead;
      x = new Q(f.lead * f.top[0] - k * f.bottom[0], f.lead - k);
    } while (!x.isInt || Math.abs(x.value) > 7);
    const graph = graphTypst({ ...window, curves: [{ f: (z) => value(f, z) }, ...(k !== 0 ? [{ f: () => k, dashed: true }] : [])], vertical: asymptotes(f), horizontal: [horizontal(f)!], dots: [{ x: x.value, y: k }] });
    const eq = `${factoredRational(f)} = ${k}`;
    return {
      body: `The graph of ${math(`y = ${factoredRational(f)}`)}${k !== 0 ? ` and the line ${math(`y = ${k}`)} are` : ' is'} shown. Use the graph to solve ${math(eq)}.\n\n${graph}`,
      answer: math(`x = ${x.typst()}`),
      distractors: [`x = ${f.bottom[0]}`, `x = ${x.neg().typst()}`, `x = ${k === 0 ? f.lead : k}`].filter((d, i, all) => d !== `x = ${x.typst()}` && all.indexOf(d) === i).map(math),
      solution: `${k === 0 ? 'The roots are the x-intercepts' : 'The solution is the x-coordinate of the intersection'}: ${math(`x = ${x.typst()}`)}. Check algebraically: ${math(`${f.lead === 1 ? '' : f.lead === -1 ? '-' : f.lead}${factorText(f.top[0])} = ${k === 0 ? '0' : `${k === 1 ? '' : k === -1 ? '-' : k}${factorText(f.bottom[0])}`}`)} gives ${math(`x = ${x.typst()}`)}.`,
    };
  },
});

export const RATIONAL_GENERATORS = [ratNpv, ratFeatures, ratHole, ratBehaviour, ratSketch, ratMatch, ratSolveGraphically];
