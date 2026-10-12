// Conic sections (Algebra 2 and Precalculus), after Kuta's PropertiesParabola,
// EquationsParabola, PropertiesCircle, EquationsCircle, PropertiesEllipse,
// EquationsEllipse, PropertiesHyperbolas, EquationsHyperbola, and
// ClassifyConics. Properties can be asked from standard form or, after
// completing the square, from general form.
import type { Rng } from '../../rng.ts';
import { Q, Surds } from '../../exact.ts';
import { graphTypst, type Pt } from '../../graph.ts';
import { polynomial, type Term } from '../../format.ts';
import { optOn, optOne, radioOption, toggleOption } from '../../options.ts';
import { us, math, wrong } from './common.ts';

const P = (x: Q | Surds | number, y: Q | Surds | number) => `(${typ(x)}, ${typ(y)})`;
const typ = (v: Q | Surds | number) => (typeof v === 'number' ? String(v) : v.typst());
/** h + s·√r as exact text: the coordinate of a focus or vertex. */
const shift = (h: number, s: number, r: number) => {
  const root = Surds.of(1, r).typst();
  return h === 0 ? (s > 0 ? root : `-${root}`) : `${h} ${s > 0 ? '+' : '-'} ${root}`;
};
/** `(x - 3)^2`, `(y + 1)^2`, `x^2`. */
const sq = (v: string, h: number) => (h === 0 ? `${v}^2` : `(${v} ${h < 0 ? '+' : '-'} ${Math.abs(h)})^2`);
/** `x - 3`, `y + 1`, `x`. */
/** `(x - 3)^2/4`, or just the square when the denominator is 1. */
const over = (v: string, h: number, d: number) => (d === 1 ? sq(v, h) : `${sq(v, h)}/${d}`);
const lin = (v: string, h: number) => (h === 0 ? v : `${v} ${h < 0 ? '+' : '-'} ${Math.abs(h)}`);

/** General form A x² + C y² + D x + E y + F = 0 from b²(x−h)² ± a²(y−k)² = ±a²b² style coefficients. */
function generalForm(A: number, C: number, h: number, k: number, rhs: number): string {
  // A(x − h)² + C(y − k)² = rhs, expanded.
  const terms: Term[] = [
    { coef: A, powers: [['x', 2]] }, { coef: C, powers: [['y', 2]] },
    { coef: -2 * A * h, powers: [['x', 1]] }, { coef: -2 * C * k, powers: [['y', 1]] },
    { coef: A * h * h + C * k * k - rhs },
  ];
  const g = terms.reduce((acc, t) => gcdN(acc, t.coef), 0) || 1;
  const sign = A < 0 || (A === 0 && C < 0) ? -1 : 1;
  return `${polynomial(terms.map((t) => ({ ...t, coef: (sign * t.coef) / g })))} = 0`;
}
function gcdN(a: number, b: number): number { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }

const FORM_OPTION = radioOption('form', 'Equation given in', [['standard', 'Standard form'], ['general', 'General form (complete the square)']], ['standard', 'standard', 'general']);

/** A small sketch of a conic, centred on its own window. */
function sketch(curves: Array<{ f?: (x: number) => number; points?: Pt[]; dashed?: boolean }>, cx: number, cy: number, r: number, dots: Pt[] = []): string {
  const span = Math.max(4, Math.ceil(r) + 2);
  return graphTypst({ xMin: cx - span, xMax: cx + span, yMin: cy - span, yMax: cy + span, width: 4, height: 4, xLabelStep: span > 6 ? 2 : 1, yLabelStep: span > 6 ? 2 : 1, curves, dots: dots.map(([x, y]) => ({ x, y })) });
}

// ── Parabolas ────────────────────────────────────────────────────────────────

function randomParabola(rng: Rng) {
  const h = rng.int(-6, 6), k = rng.int(-6, 6);
  const p = new Q(rng.pick([1, 1, 2, 3, 4]) * rng.sign(), rng.pick([1, 2, 4]));
  const vertical = rng.next() < 0.6;
  return { h, k, p, vertical, a: new Q(1).div(p.mul(4)) };
}

export const a2ParabolaProperties = us('a2-parabola-properties', {
  points: 2,
  levels: { 1: 'Vertex form, vertex and focus', 2: 'Vertex form, all properties', 3: 'Standard form (complete the square)' },
  options: [FORM_OPTION, toggleOption('sketch', 'Include a sketch in the answer', [false, false, false])],
  generate(rng, level, o) {
    const { h, k, p, vertical, a } = randomParabola(rng);
    const general = optOne(o, 'form', level === 3 ? 'general' : 'standard') === 'general';
    const [dep, ind, c1, c2] = vertical ? ['y', 'x', h, k] : ['x', 'y', k, h];
    const coef = a.eq(1) ? '' : a.eq(-1) ? '-' : a.isInt ? a.typst() : `${a.typst()} `;
    let eq = `${dep} = ${coef}${sq(ind, c1)}${c2 ? ` ${c2 < 0 ? '-' : '+'} ${Math.abs(c2)}` : ''}`;
    if (general) {
      // dep = a ind² − 2a c1 ind + a c1² + c2, cleared of fractions.
      const terms = [a, a.mul(-2 * c1), a.mul(c1 * c1).add(c2)];
      const den = terms.reduce((d, q) => (d * q.d) / gcdN(d, q.d), 1);
      const [A, B, C] = terms.map((q) => q.mul(den).n);
      eq = `${den === 1 ? '' : den}${dep} = ${polynomial([{ coef: A, powers: [[ind, 2]] }, { coef: B, powers: [[ind, 1]] }, { coef: C }])}`;
    }
    const vertex = vertical ? P(h, k) : P(h, k);
    const focus = vertical ? P(h, p.add(k)) : P(p.add(h), k);
    const directrix = vertical ? `y = ${new Q(k).sub(p).typst()}` : `x = ${new Q(h).sub(p).typst()}`;
    const axis = vertical ? `x = ${h}` : `y = ${k}`;
    const opens = vertical ? (p.sign > 0 ? 'up' : 'down') : p.sign > 0 ? 'right' : 'left';
    const answer = level === 1 && !general
      ? `"Vertex:" ${vertex}; "focus:" ${focus}`
      : `"Vertex:" ${vertex}; "focus:" ${focus}; "directrix:" ${directrix}; "axis:" ${axis}; "opens" "${opens}"`;
    const flipP = p.neg();
    const wrongFocus = vertical ? P(h, flipP.add(k)) : P(flipP.add(h), k);
    const wrongDir = vertical ? `y = ${new Q(k).add(p).typst()}` : `x = ${new Q(h).add(p).typst()}`;
    const aFocus = vertical ? P(h, a.add(k)) : P(a.add(h), k);
    const swapped = P(-h, -k);
    const alt = level === 1 && !general
      ? [`"Vertex:" ${vertex}; "focus:" ${wrongFocus}`, `"Vertex:" ${swapped}; "focus:" ${focus}`, `"Vertex:" ${vertex}; "focus:" ${aFocus}`]
      : [`"Vertex:" ${vertex}; "focus:" ${wrongFocus}; "directrix:" ${wrongDir}; "axis:" ${axis}; "opens" "${{ up: 'down', down: 'up', left: 'right', right: 'left' }[opens]}"`,
        `"Vertex:" ${swapped}; "focus:" ${focus}; "directrix:" ${directrix}; "axis:" ${axis}; "opens" "${opens}"`,
        `"Vertex:" ${vertex}; "focus:" ${aFocus}; "directrix:" ${directrix}; "axis:" ${vertical ? `y = ${k}` : `x = ${h}`}; "opens" "${opens}"`];
    const fn = vertical ? (x: number) => a.value * (x - h) ** 2 + k : undefined;
    const pts: Pt[] = vertical ? [] : Array.from({ length: 81 }, (_, i) => { const y = k - 10 + i / 4; return [a.value * (y - k) ** 2 + h, y]; });
    const graph = optOn(o, 'sketch', false) ? `\n\n${sketch([vertical ? { f: fn } : { points: pts }], h, k, 6)}` : '';
    return {
      body: `Identify the ${level === 1 && !general ? 'vertex and focus' : 'vertex, focus, directrix, axis of symmetry, and direction of opening'} of ${math(eq)}.`,
      answer: math(answer) + graph,
      distractors: wrong(math(answer), alt.map(math)),
      solution: `${general ? `Complete the square to get ${math(`${dep} = ${coef}${sq(ind, c1)}${c2 ? ` ${c2 < 0 ? '-' : '+'} ${Math.abs(c2)}` : ''}`)}. ` : ''}In the form ${math(`${dep} = 1/(4p) ${vertical ? '(x - h)^2 + k' : '(y - k)^2 + h'}`)}, ${math(`1/(4p) = ${a.typst()}`)}, so ${math(`p = ${p.typst()}`)}. The focus is ${math('|p|')} from the vertex inside the curve, and the directrix is ${math('|p|')} on the other side: ${math(answer)}.`,
    };
  },
});

export const a2ParabolaWrite = us('a2-parabola-write', {
  points: 2,
  levels: { 1: 'Vertex and focus', 2: 'Focus and directrix', 3: 'Vertex and directrix' },
  generate(rng, level) {
    const { h, k, p, vertical, a } = randomParabola(rng);
    const focus = vertical ? P(h, p.add(k)) : P(p.add(h), k);
    const directrix = vertical ? `y = ${new Q(k).sub(p).typst()}` : `x = ${new Q(h).sub(p).typst()}`;
    const given = level === 1 ? `vertex ${math(P(h, k))} and focus ${math(focus)}` : level === 2 ? `focus ${math(focus)} and directrix ${math(directrix)}` : `vertex ${math(P(h, k))} and directrix ${math(directrix)}`;
    const [dep, ind, c1, c2] = vertical ? ['y', 'x', h, k] : ['x', 'y', k, h];
    const eq = (aa: Q, hh: number, kk: number) => `${dep} = ${aa.eq(1) ? '' : aa.eq(-1) ? '-' : aa.isInt ? aa.typst() : `${aa.typst()} `}${sq(ind, hh)}${kk ? ` ${kk < 0 ? '-' : '+'} ${Math.abs(kk)}` : ''}`;
    const answer = eq(a, c1, c2);
    return {
      body: `Write the equation of the parabola with ${given}.`,
      answer: math(answer),
      distractors: wrong(math(answer), [eq(a.neg(), c1, c2), eq(p, c1, c2), eq(a, -c1, c2), `${ind} = ${a.eq(1) ? '' : a.eq(-1) ? '-' : a.isInt ? a.typst() : `${a.typst()} `}${sq(dep, c2)}${c1 ? ` ${c1 < 0 ? '-' : '+'} ${Math.abs(c1)}` : ''}`].map(math)),
      solution: `The vertex is ${math(P(h, k))} and the focus is ${math(`p = ${p.typst()}`)} units from it, so ${math(`1/(4p) = ${a.typst()}`)}: ${math(answer)}.`,
    };
  },
});

// ── Circles ──────────────────────────────────────────────────────────────────

const rootOf = (n: number) => new Surds([[1, n]]).typst();

export const a2CircleProperties = us('a2-circle-properties', {
  levels: { 1: 'Standard form, whole radius', 2: 'Standard form, radical radius', 3: 'General form (complete the square)' },
  options: [FORM_OPTION],
  generate(rng, level, o) {
    const h = rng.int(-8, 8), k = rng.int(-8, 8);
    const r2 = level === 2 ? rng.pick([2, 3, 5, 6, 7, 8, 10, 12, 13, 18, 20]) : rng.int(1, 9) ** 2;
    const general = optOne(o, 'form', level === 3 ? 'general' : 'standard') === 'general';
    const eq = general ? generalForm(1, 1, h, k, r2) : `${sq('x', h)} + ${sq('y', k)} = ${r2}`;
    const answer = `"Centre:" ${P(h, k)}; "radius:" ${rootOf(r2)}`;
    return {
      body: `Identify the centre and radius of ${math(eq)}.`,
      task: { instruction: 'Identify the centre and radius of each circle.', item: math(eq) },
      answer: math(answer),
      distractors: wrong(math(answer), [`"Centre:" ${P(-h, -k)}; "radius:" ${rootOf(r2)}`, `"Centre:" ${P(h, k)}; "radius:" ${r2}`, `"Centre:" ${P(k, h)}; "radius:" ${rootOf(r2)}`, `"Centre:" ${P(-h, -k)}; "radius:" ${r2}`].map(math)),
      solution: `${general ? `Complete the square in ${math('x')} and in ${math('y')}: ${math(`${sq('x', h)} + ${sq('y', k)} = ${r2}`)}. ` : ''}The centre is ${math(P(h, k))} and the radius is ${math(`sqrt(${r2})${rootOf(r2) === `sqrt(${r2})` ? '' : ` = ${rootOf(r2)}`}`)}.`,
    };
  },
});

export const a2CircleWrite = us('a2-circle-write', {
  levels: { 1: 'Centre and radius', 2: 'Centre and a point on the circle', 3: 'Endpoints of a diameter' },
  generate(rng, level) {
    const h = rng.int(-7, 7), k = rng.int(-7, 7);
    let r2: number, given: string;
    if (level === 1) { const r = rng.int(1, 9); r2 = r * r; given = `centre ${math(P(h, k))} and radius ${math(String(r))}`; }
    else if (level === 2) { const [dx, dy] = [rng.nonZero(-6, 6), rng.int(-6, 6)]; r2 = dx * dx + dy * dy; given = `centre ${math(P(h, k))} that passes through ${math(P(h + dx, k + dy))}`; }
    else { const [dx, dy] = [rng.nonZero(-5, 5), rng.int(-5, 5)]; r2 = dx * dx + dy * dy; given = `a diameter with endpoints ${math(P(h + dx, k + dy))} and ${math(P(h - dx, k - dy))}`; }
    const eq = (hh: number, kk: number, rr: number) => `${sq('x', hh)} + ${sq('y', kk)} = ${rr}`;
    const answer = eq(h, k, r2);
    return {
      body: `Write the equation of the circle with ${given}.`,
      answer: math(answer),
      distractors: wrong(math(answer), [eq(-h, -k, r2), eq(h, k, level === 1 ? Math.sqrt(r2) : r2 * 4), eq(h, k, Math.round(Math.sqrt(r2)) || 1), eq(k, h, r2)].map(math)),
      solution: `${level === 3 ? `The centre is the midpoint ${math(P(h, k))}. ` : ''}${level > 1 ? `The radius squared is the squared distance from the centre to the point: ${math(`r^2 = ${r2}`)}. ` : ''}${math(answer)}.`,
    };
  },
});

// ── Ellipses and hyperbolas ──────────────────────────────────────────────────

function axes(rng: Rng, ellipse: boolean) {
  // Semi-axes with whole squares; c² = a² − b² (ellipse) or a² + b² (hyperbola).
  const a = rng.int(2, 9);
  const b = ellipse ? rng.int(1, a - 1) : rng.int(1, 8);
  return { a, b, c2: ellipse ? a * a - b * b : a * a + b * b };
}

function conicFocusPoints(h: number, k: number, horizontal: boolean, dist: number, root = true): string {
  const s = (sign: number) => (root ? shift(horizontal ? h : k, sign, dist) : String((horizontal ? h : k) + sign * dist));
  return horizontal ? `(${s(1)}, ${k}), (${s(-1)}, ${k})` : `(${h}, ${s(1)}), (${h}, ${s(-1)})`;
}

export const a2EllipseProperties = us('a2-ellipse-properties', {
  points: 2,
  levels: { 1: 'Centre and vertices', 2: 'Centre, vertices, and foci', 3: 'General form (complete the square)' },
  options: [FORM_OPTION],
  generate(rng, level, o) {
    const h = rng.int(-6, 6), k = rng.int(-6, 6);
    const { a, b, c2 } = axes(rng, true);
    const horizontal = rng.next() < 0.5;
    const general = optOne(o, 'form', level === 3 ? 'general' : 'standard') === 'general';
    const [dx, dy] = horizontal ? [a * a, b * b] : [b * b, a * a];
    const eq = general ? generalForm(dy, dx, h, k, dx * dy) : `${over('x', h, dx)} + ${over('y', k, dy)} = 1`;
    const vertices = conicFocusPoints(h, k, horizontal, a, false);
    const foci = conicFocusPoints(h, k, horizontal, c2);
    const coVertices = conicFocusPoints(h, k, !horizontal, b, false);
    const answer = level === 1 && !general ? `"Centre:" ${P(h, k)}; "vertices:" ${vertices}` : `"Centre:" ${P(h, k)}; "vertices:" ${vertices}; "foci:" ${foci}`;
    const wrongV = conicFocusPoints(h, k, !horizontal, a, false), wrongF = conicFocusPoints(h, k, horizontal, a * a + b * b);
    const alt = level === 1 && !general
      ? [`"Centre:" ${P(h, k)}; "vertices:" ${coVertices}`, `"Centre:" ${P(-h, -k)}; "vertices:" ${conicFocusPoints(-h, -k, horizontal, a, false)}`, `"Centre:" ${P(h, k)}; "vertices:" ${conicFocusPoints(h, k, horizontal, a * a, false)}`]
      : [`"Centre:" ${P(h, k)}; "vertices:" ${vertices}; "foci:" ${wrongF}`, `"Centre:" ${P(h, k)}; "vertices:" ${wrongV}; "foci:" ${conicFocusPoints(h, k, !horizontal, c2)}`, `"Centre:" ${P(h, k)}; "vertices:" ${coVertices}; "foci:" ${foci}`];
    return {
      body: `Identify the centre${level === 1 && !general ? ' and vertices' : ', vertices, and foci'} of the ellipse ${math(eq)}.`,
      answer: math(answer),
      distractors: wrong(math(answer), alt.map(math)),
      solution: `${general ? `Complete the square and divide to get ${math(`${over('x', h, dx)} + ${over('y', k, dy)} = 1`)}. ` : ''}The larger denominator, ${a * a}, is under ${math(horizontal ? 'x' : 'y')}, so the major axis is ${horizontal ? 'horizontal' : 'vertical'} with ${math(`a = ${a}`)} and ${math(`b = ${b}`)}. ${math(`c^2 = a^2 - b^2 = ${c2}`)}. ${math(answer)}.`,
    };
  },
});

export const a2EllipseWrite = us('a2-ellipse-write', {
  points: 2,
  levels: { 1: 'Centre at the origin: vertices and co-vertices', 2: 'Vertices and foci', 3: 'Any centre: vertices and foci' },
  generate(rng, level) {
    const h = level === 3 ? rng.int(-5, 5) : 0, k = level === 3 ? rng.int(-5, 5) : 0;
    const horizontal = rng.next() < 0.5;
    let a: number, b2: number, c = 0;
    if (level === 1) { a = rng.int(2, 9); b2 = rng.int(1, a - 1) ** 2; }
    else { a = rng.int(3, 10); c = rng.int(1, a - 1); b2 = a * a - c * c; }
    const [dx, dy] = horizontal ? [a * a, b2] : [b2, a * a];
    const vertices = conicFocusPoints(h, k, horizontal, a, false);
    const given = level === 1 ? `vertices ${math(vertices)} and co-vertices ${math(conicFocusPoints(h, k, !horizontal, Math.sqrt(b2), false))}` : `vertices ${math(vertices)} and foci ${math(conicFocusPoints(h, k, horizontal, c, false))}`;
    const eq = (X: number, Y: number) => `${over('x', h, X)} + ${over('y', k, Y)} = 1`;
    const answer = eq(dx, dy);
    return {
      body: `Write the equation of the ellipse with ${given}.`,
      answer: math(answer),
      distractors: wrong(math(answer), [eq(dy, dx), level === 1 ? eq(horizontal ? a : Math.sqrt(b2), horizontal ? Math.sqrt(b2) : a) : eq(horizontal ? a * a : c * c, horizontal ? c * c : a * a), level === 1 ? eq(dx + 1, dy) : eq(horizontal ? a * a : a * a + c * c, horizontal ? a * a + c * c : a * a)].map(math)),
      solution: `The centre is ${math(P(h, k))} and ${math(`a = ${a}`)}. ${level === 1 ? `${math(`b^2 = ${b2}`)}` : `${math(`c = ${c}`)}, so ${math(`b^2 = a^2 - c^2 = ${b2}`)}`}. The major axis is ${horizontal ? 'horizontal' : 'vertical'}: ${math(answer)}.`,
    };
  },
});

export const a2HyperbolaProperties = us('a2-hyperbola-properties', {
  points: 2,
  levels: { 1: 'Centre and vertices', 2: 'Vertices, foci, and asymptotes', 3: 'General form (complete the square)' },
  options: [FORM_OPTION],
  generate(rng, level, o) {
    const h = rng.int(-6, 6), k = rng.int(-6, 6);
    const { a, b, c2 } = axes(rng, false);
    const horizontal = rng.next() < 0.5;
    const general = optOne(o, 'form', level === 3 ? 'general' : 'standard') === 'general';
    const eqStd = horizontal ? `${over('x', h, a * a)} - ${over('y', k, b * b)} = 1` : `${over('y', k, a * a)} - ${over('x', h, b * b)} = 1`;
    const eq = general ? (horizontal ? generalForm(b * b, -a * a, h, k, a * a * b * b) : generalForm(-a * a, b * b, h, k, a * a * b * b)) : eqStd;
    const vertices = conicFocusPoints(h, k, horizontal, a, false);
    const foci = conicFocusPoints(h, k, horizontal, c2);
    const slope = horizontal ? new Q(b, a) : new Q(a, b);
    const asym = `${lin('y', k)} = plus.minus ${slope.eq(1) ? '' : `${slope.typst()} `}(${lin('x', h)})`.replace('((', '(').replace(/\(x\)/, 'x');
    const answer = level === 1 && !general ? `"Centre:" ${P(h, k)}; "vertices:" ${vertices}` : `"Vertices:" ${vertices}; "foci:" ${foci}; "asymptotes:" ${asym}`;
    const wrongSlope = new Q(1).div(slope);
    const asymW = `${lin('y', k)} = plus.minus ${wrongSlope.eq(1) ? '' : `${wrongSlope.typst()} `}(${lin('x', h)})`.replace(/\(x\)/, 'x');
    const alt = level === 1 && !general
      ? [`"Centre:" ${P(h, k)}; "vertices:" ${conicFocusPoints(h, k, !horizontal, a, false)}`, `"Centre:" ${P(-h, -k)}; "vertices:" ${conicFocusPoints(-h, -k, horizontal, a, false)}`, `"Centre:" ${P(h, k)}; "vertices:" ${conicFocusPoints(h, k, horizontal, b, false)}`]
      : [`"Vertices:" ${vertices}; "foci:" ${conicFocusPoints(h, k, horizontal, Math.abs(a * a - b * b) || 1)}; "asymptotes:" ${asym}`, `"Vertices:" ${vertices}; "foci:" ${foci}; "asymptotes:" ${asymW}`, `"Vertices:" ${conicFocusPoints(h, k, !horizontal, a, false)}; "foci:" ${conicFocusPoints(h, k, !horizontal, c2)}; "asymptotes:" ${asym}`];
    return {
      body: `Identify the ${level === 1 && !general ? 'centre and vertices' : 'vertices, foci, and equations of the asymptotes'} of the hyperbola ${math(eq)}.`,
      answer: math(answer),
      distractors: wrong(math(answer), alt.map(math)),
      solution: `${general ? `Complete the square and divide to get ${math(eqStd)}. ` : ''}The positive term is in ${math(horizontal ? 'x' : 'y')}, so the hyperbola opens ${horizontal ? 'left and right' : 'up and down'}, with ${math(`a = ${a}`)}, ${math(`b = ${b}`)}, and ${math(`c^2 = a^2 + b^2 = ${c2}`)}. ${math(answer)}.`,
    };
  },
});

export const a2HyperbolaWrite = us('a2-hyperbola-write', {
  points: 2,
  levels: { 1: 'Centre at the origin: vertices and foci', 2: 'Vertices and asymptote slope', 3: 'Any centre: vertices and foci' },
  generate(rng, level) {
    const h = level === 3 ? rng.int(-5, 5) : 0, k = level === 3 ? rng.int(-5, 5) : 0;
    const horizontal = rng.next() < 0.5;
    const a = rng.int(1, 8), b = rng.int(1, 8);
    const c2 = a * a + b * b, c = Math.sqrt(c2);
    const vertices = conicFocusPoints(h, k, horizontal, a, false);
    const foci = Number.isInteger(c) ? conicFocusPoints(h, k, horizontal, c, false) : conicFocusPoints(h, k, horizontal, c2);
    const slope = horizontal ? new Q(b, a) : new Q(a, b);
    const given = level === 2 ? `vertices ${math(vertices)} and asymptotes with slopes ${math(`plus.minus ${slope.typst()}`)}` : `vertices ${math(vertices)} and foci ${math(foci)}`;
    const eq = (A: number, B: number) => (horizontal ? `${over('x', h, A)} - ${over('y', k, B)} = 1` : `${over('y', k, A)} - ${over('x', h, B)} = 1`);
    const answer = eq(a * a, b * b);
    const other = horizontal ? `${over('y', k, a * a)} - ${over('x', h, b * b)} = 1` : `${over('x', h, a * a)} - ${over('y', k, b * b)} = 1`;
    return {
      body: `Write the equation of the hyperbola with ${given}.`,
      answer: math(answer),
      distractors: wrong(math(answer), [other, eq(b * b, a * a), eq(a * a, c2), eq(a, b)].map(math)),
      solution: `The centre is ${math(P(h, k))} and ${math(`a = ${a}`)}. ${level === 2 ? `The asymptote slope gives ${math(`b = ${b}`)}` : `${math(`c^2 = ${c2}`)}, so ${math(`b^2 = c^2 - a^2 = ${b * b}`)}`}. It opens ${horizontal ? 'left and right' : 'up and down'}: ${math(answer)}.`,
    };
  },
});

export const a2ConicClassify = us('a2-conic-classify', {
  levels: { 1: 'From standard form', 2: 'From general form', 3: 'From general form, including degenerate-looking forms' },
  generate(rng, level) {
    const type = rng.pick(['circle', 'ellipse', 'parabola', 'hyperbola'] as const);
    const h = rng.int(-5, 5), k = rng.int(-5, 5);
    let std: string, gen: string;
    if (type === 'circle') { const r2 = rng.int(1, 8) ** 2; std = `${sq('x', h)} + ${sq('y', k)} = ${r2}`; gen = generalForm(1, 1, h, k, r2); }
    else if (type === 'ellipse') { const { a, b } = axes(rng, true); std = `${over('x', h, a * a)} + ${over('y', k, b * b)} = 1`; gen = generalForm(b * b, a * a, h, k, a * a * b * b); }
    else if (type === 'hyperbola') { const { a, b } = axes(rng, false); std = `${over('x', h, a * a)} - ${over('y', k, b * b)} = 1`; gen = generalForm(b * b, -a * a, h, k, a * a * b * b); }
    else { const a = rng.nonZero(-3, 3); std = `y = ${a === 1 ? '' : a === -1 ? '-' : a}${sq('x', h)}${k ? ` ${k < 0 ? '-' : '+'} ${Math.abs(k)}` : ''}`; gen = `${polynomial([{ coef: a, powers: [['x', 2]] }, { coef: -2 * a * h, powers: [['x', 1]] }, { coef: -1, powers: [['y', 1]] }, { coef: a * h * h + k }])} = 0`; }
    const eq = level === 1 ? std : gen;
    return {
      body: `Classify the conic section: ${math(eq)}`,
      task: { instruction: 'Classify each conic section.', item: math(eq) },
      answer: type,
      distractors: wrong(type, ['circle', 'ellipse', 'parabola', 'hyperbola']),
      solution: level === 1
        ? `${type === 'parabola' ? 'Only one variable is squared' : type === 'hyperbola' ? 'The squared terms have opposite signs' : type === 'circle' ? 'The squared terms have equal coefficients' : 'The squared terms have the same sign but different denominators'}: ${type === 'ellipse' ? 'an' : 'a'} ${type}.`
        : `Compare the coefficients of ${math('x^2')} and ${math('y^2')}: ${type === 'parabola' ? 'only one is present' : type === 'hyperbola' ? 'they have opposite signs' : type === 'circle' ? 'they are equal' : 'they have the same sign but are not equal'}, so it is ${type === 'ellipse' ? 'an' : 'a'} ${type}.`,
    };
  },
});

export const CONICS = [a2ParabolaProperties, a2ParabolaWrite, a2CircleProperties, a2CircleWrite, a2EllipseProperties, a2EllipseWrite, a2HyperbolaProperties, a2HyperbolaWrite, a2ConicClassify];
