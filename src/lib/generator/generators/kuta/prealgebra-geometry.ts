// Pre-Algebra: the coordinate plane, angles, plane figures, transformations,
// solids, and square roots, after Kuta's PlottingPoints, AngleMeasure,
// AngleRelationships, TriangleClassifications, TriangleAngleSum,
// Quadrilaterals, QuadrilateralAngleSum, Area*, Circles, Transformation*,
// Solids, and SquareRoot.
import type { Rng } from '../../rng.ts';
import { graphTypst, type Pt } from '../../graph.ts';
import { optList, optOne, manyOption, radioOption, toggleOption, optOn } from '../../options.ts';
import { us, math, task, wrong, decimal, fixed, sample } from './common.ts';

const POINT_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
const pair = ([x, y]: Pt) => `(${x}, ${y})`;

function quadrant([x, y]: Pt): string {
  if (x === 0 && y === 0) return 'the origin';
  if (x === 0) return 'the y-axis';
  if (y === 0) return 'the x-axis';
  return x > 0 ? (y > 0 ? 'Quadrant I' : 'Quadrant IV') : y > 0 ? 'Quadrant II' : 'Quadrant III';
}

export const paPlotPoints = us('pa-plot-points', {
  levels: { 1: 'Quadrant I', 2: 'All four quadrants', 3: 'Including points on the axes' },
  options: [radioOption('ask', 'Ask for', [['coords', 'Coordinates'], ['quadrant', 'Quadrant'], ['either', 'Either']], ['coords', 'either', 'either'])],
  generate(rng, level, o) {
    const N = 6;
    const pts: Pt[] = [];
    while (pts.length < 4) {
      const p: Pt = level === 1 ? [rng.int(1, N), rng.int(1, N)] : [rng.nonZero(-N, N), rng.nonZero(-N, N)];
      if (level === 3 && pts.length === 0) p[rng.int(0, 1)] = 0;
      if (!pts.some((q) => q[0] === p[0] && q[1] === p[1])) pts.push(p);
    }
    const i = rng.int(0, 3), [x, y] = pts[i], name = POINT_NAMES[i];
    const graph = graphTypst({
      xMin: level === 1 ? -1 : -N - 1, xMax: N + 1, yMin: level === 1 ? -1 : -N - 1, yMax: N + 1, width: 5, height: 5,
      dots: pts.map(([px, py]) => ({ x: px, y: py })),
      labels: pts.map(([px, py], k) => ({ x: px + 0.45, y: py + 0.5, text: POINT_NAMES[k] })),
    });
    const ask = optOne(o, 'ask', 'coords') === 'either' ? rng.pick(['coords', 'quadrant'] as const) : optOne(o, 'ask', 'coords');
    if (ask === 'coords') {
      const answer = math(pair([x, y]));
      return {
        body: `State the coordinates of point ${name}.\n\n${graph}`,
        answer,
        distractors: wrong(answer, [pair([y, x]), pair([-x, y]), pair([x, -y]), pair([-y, -x])].map(math)),
        solution: `Point ${name} is ${Math.abs(x)} unit${Math.abs(x) === 1 ? '' : 's'} ${x < 0 ? 'left' : 'right'} of the origin and ${Math.abs(y)} unit${Math.abs(y) === 1 ? '' : 's'} ${y < 0 ? 'down' : 'up'}: ${answer}.`,
      };
    }
    const answer = quadrant([x, y]);
    return {
      body: `Name the quadrant in which point ${name} lies, or the axis it lies on.\n\n${graph}`,
      answer,
      distractors: wrong(answer, ['Quadrant I', 'Quadrant II', 'Quadrant III', 'Quadrant IV', 'the x-axis', 'the y-axis']).slice(0, 4),
      solution: `${name} is ${math(pair([x, y]))}, so it is in ${answer}.`,
    };
  },
});

// ── Angles ───────────────────────────────────────────────────────────────────

/** An angle drawn as two rays from a vertex, with its measure marked. */
function angleDiagram(deg: number, label: string, start = 0): string {
  const r = 3, rad = (d: number) => (d * Math.PI) / 180;
  const ray = (d: number): Pt => [r * Math.cos(rad(d)), r * Math.sin(rad(d))];
  const arc: Pt[] = Array.from({ length: 30 }, (_, i) => { const d = start + (deg * i) / 29; return [0.8 * Math.cos(rad(d)), 0.8 * Math.sin(rad(d))]; });
  const mid = start + deg / 2;
  return graphTypst({
    xMin: -3.4, xMax: 3.4, yMin: deg > 180 || start > 0 ? -3.4 : -0.6, yMax: 3.4, width: 4, height: deg > 180 || start > 0 ? 4 : 2.4,
    grid: false, axes: false, numbers: false,
    curves: [{ points: [[0, 0], ray(start)] }, { points: [[0, 0], ray(start + deg)] }, { points: arc }],
    labels: [{ x: 1.5 * Math.cos(rad(mid)), y: 1.5 * Math.sin(rad(mid)), text: label }],
  });
}

const ANGLE_KINDS = ['acute', 'right', 'obtuse', 'straight'] as const;
const angleKind = (d: number) => (d < 90 ? 'acute' : d === 90 ? 'right' : d < 180 ? 'obtuse' : 'straight');

export const paAngleClassify = us('pa-angle-classify', {
  levels: { 1: 'Acute, right, or obtuse', 2: 'Including straight angles', 3: 'Including straight angles' },
  options: [toggleOption('diagram', 'Draw the angle', [true, true, false])],
  generate(rng, level, o) {
    const deg = rng.pick(level === 1 ? [rng.int(10, 85), 90, rng.int(95, 175)] : [rng.int(10, 85), 90, rng.int(95, 175), 180]);
    const answer = angleKind(deg);
    const diagram = optOn(o, 'diagram', true) ? `\n\n${angleDiagram(deg, `${deg}°`, rng.pick([0, 0, 20, 40]))}` : '';
    return {
      body: `Classify the angle measuring ${math(`${deg}°`)} as acute, right, obtuse, or straight.${diagram}`,
      task: { instruction: 'Classify each angle as acute, right, obtuse, or straight.', item: math(`${deg}°`) },
      answer,
      distractors: wrong(answer, [...ANGLE_KINDS]),
      solution: `Acute angles are less than ${math('90°')}, right angles are exactly ${math('90°')}, obtuse angles are between ${math('90°')} and ${math('180°')}, and straight angles are ${math('180°')}. ${math(`${deg}°`)} is ${answer}.`,
    };
  },
});

export const paAngleRelationships = us('pa-angle-relationships', {
  levels: { 1: 'Complements and supplements', 2: 'Vertical angles and linear pairs', 3: 'Solve for x' },
  options: [radioOption('form', 'Questions', [['1', 'Find a complement or supplement'], ['2', 'Name or use a relationship'], ['3', 'Solve for x']], ['1', '2', '3'])],
  generate(rng, level, o) {
    const form = Number(optOne(o, 'form', String(level)));
    if (form === 1) {
      const comp = rng.next() < 0.5;
      const a = comp ? rng.int(5, 85) : rng.int(5, 175);
      const answer = comp ? 90 - a : 180 - a;
      return {
        body: `Find the ${comp ? 'complement' : 'supplement'} of an angle measuring ${math(`${a}°`)}.`,
        task: { instruction: `Find the ${comp ? 'complement' : 'supplement'} of each angle.`, item: math(`${a}°`) },
        answer: math(`${answer}°`),
        distractors: wrong(math(`${answer}°`), [comp ? 180 - a : Math.abs(90 - a), 360 - a, a].map((d) => math(`${d}°`))),
        solution: `${comp ? 'Complementary angles add to' : 'Supplementary angles add to'} ${math(comp ? '90°' : '180°')}: ${math(`${comp ? 90 : 180}° - ${a}° = ${answer}°`)}.`,
      };
    }
    if (form === 2) {
      const a = rng.int(25, 155);
      const vertical = rng.next() < 0.5;
      const answer = vertical ? a : 180 - a;
      const name = vertical ? 'vertical angles' : 'a linear pair';
      // Two intersecting lines, with the given angle and the unknown marked.
      const t = rng.int(0, 30);
      const rad = (d: number) => (d * Math.PI) / 180;
      const end = (d: number): Pt => [3 * Math.cos(rad(d)), 3 * Math.sin(rad(d))];
      const graph = graphTypst({
        xMin: -3.4, xMax: 3.4, yMin: -3.4, yMax: 3.4, width: 4, height: 4, grid: false, axes: false, numbers: false,
        curves: [{ points: [end(t), end(t + 180)] }, { points: [end(t + a), end(t + a + 180)] }],
        labels: [
          { x: 1.3 * Math.cos(rad(t + a / 2)), y: 1.3 * Math.sin(rad(t + a / 2)), text: `${a}°` },
          { x: 1.3 * Math.cos(rad(vertical ? t + 180 + a / 2 : t + a + (180 - a) / 2)), y: 1.3 * Math.sin(rad(vertical ? t + 180 + a / 2 : t + a + (180 - a) / 2)), text: 'x' },
        ],
      });
      return {
        body: `Find ${math('x')}.\n\n${graph}`,
        answer: math(`x = ${answer}°`),
        distractors: wrong(math(`x = ${answer}°`), [vertical ? 180 - a : a, 90 - (a % 90), 360 - a].map((d) => math(`x = ${d}°`))),
        solution: `The angles are ${name}, so ${vertical ? 'they are equal' : 'they add to 180°'}: ${math(`x = ${answer}°`)}.`,
      };
    }
    // Expressions in x: vertical (equal), supplementary or complementary (sum).
    const rel = rng.pick(['vertical', 'supplementary', 'complementary'] as const);
    const x = rng.int(3, 20);
    const a1 = rng.int(2, 6), b1 = rng.int(-10, 20);
    let a2 = rng.int(2, 6); while (a2 === a1) a2 = rng.int(2, 6);
    const total = rel === 'vertical' ? 0 : rel === 'supplementary' ? 180 : 90;
    const first = a1 * x + b1;
    const b2 = rel === 'vertical' ? first - a2 * x : total - first - a2 * x;
    const second = a2 * x + b2;
    if (first <= 0 || second <= 0 || (rel !== 'vertical' && (first >= total || second >= total)) || first >= 180) return paAngleRelationships.generate(rng, 1, { form: '3' });
    const e = (a: number, b: number) => (b ? `${a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)}` : `${a}x`);
    const answer = math(`x = ${x}`);
    return {
      body: `Two angles are ${rel === 'vertical' ? 'vertical angles' : rel}. Their measures are ${math(`(${e(a1, b1)})°`)} and ${math(`(${e(a2, b2)})°`)}. Find ${math('x')}.`,
      answer,
      distractors: wrong(answer, [x + 1, x * 2, rel === 'vertical' ? (180 - b1 - b2) / (a1 + a2) : (b2 - b1) / (a1 - a2)].filter((v) => Number.isInteger(v) && v > 0).map((v) => math(`x = ${v}`)).concat([math(`x = ${first}`)])),
      solution: rel === 'vertical'
        ? `Vertical angles are equal: ${math(`${e(a1, b1)} = ${e(a2, b2)}`)}, so ${answer}.`
        : `The angles add to ${math(`${total}°`)}: ${math(`${e(a1, b1)} + ${e(a2, b2)} = ${total}`)}, so ${answer}.`,
    };
  },
});

// ── Triangles and quadrilaterals ─────────────────────────────────────────────

export const paTriangles = us('pa-triangles', {
  levels: { 1: 'Find the missing angle', 2: 'Classify by sides or angles', 3: 'Angles with expressions in x' },
  options: [radioOption('form', 'Questions', [['1', 'Missing angle'], ['2', 'Classify'], ['3', 'Angles in terms of x']], ['1', '2', '3'])],
  generate(rng, level, o) {
    const form = Number(optOne(o, 'form', String(level)));
    if (form === 1) {
      const a = rng.int(20, 110), b = rng.int(15, 170 - a - 5), c = 180 - a - b;
      return {
        body: `Two angles of a triangle measure ${math(`${a}°`)} and ${math(`${b}°`)}. Find the third angle.`,
        answer: math(`${c}°`),
        distractors: wrong(math(`${c}°`), [360 - a - b, a + b, 90 - Math.abs(a - b), c + 10].map((d) => math(`${d}°`))),
        solution: `The angles of a triangle add to ${math('180°')}: ${math(`180° - ${a}° - ${b}° = ${c}°`)}.`,
      };
    }
    if (form === 2) {
      if (rng.next() < 0.5) {
        const kind = rng.pick(['equilateral', 'isosceles', 'scalene'] as const);
        const s = rng.int(3, 15);
        let t = rng.int(3, 15); while (t === s || s * 2 <= t) t = rng.int(3, 15);
        let u = rng.int(Math.abs(s - t) + 1, s + t - 1); while (u === s || u === t) u = u + 1 < s + t ? u + 1 : Math.abs(s - t) + 1;
        const sides = kind === 'equilateral' ? [s, s, s] : kind === 'isosceles' ? rng.shuffle([s, s, t]) : [s, t, u];
        if (kind === 'scalene' && new Set(sides).size < 3) return paTriangles.generate(rng, 2, { form: '2' });
        return {
          body: `Classify the triangle with side lengths ${math(sides.join(', '))} by its sides.`,
          answer: kind,
          distractors: wrong(kind, ['equilateral', 'isosceles', 'scalene', 'right']),
          solution: `${kind === 'equilateral' ? 'All three sides are equal' : kind === 'isosceles' ? 'Exactly two sides are equal' : 'No two sides are equal'}, so the triangle is ${kind}.`,
        };
      }
      const kind = rng.pick(['acute', 'right', 'obtuse'] as const);
      // The largest angle decides the kind; the other two share what is left.
      const big = kind === 'right' ? 90 : kind === 'obtuse' ? rng.int(95, 150) : rng.int(61, 85);
      const rest = 180 - big;
      const a = rng.int(Math.max(rest - big, 10), Math.min(big, rest - 10));
      const angles = rng.shuffle([big, a, rest - a]);
      return {
        body: `Classify the triangle with angles ${math(angles.map((d) => `${d}°`).join(', '))} by its angles.`,
        answer: kind,
        distractors: wrong(kind, ['acute', 'right', 'obtuse', 'equiangular']),
        solution: `${kind === 'right' ? 'One angle is 90°' : kind === 'obtuse' ? 'One angle is greater than 90°' : 'All three angles are less than 90°'}, so the triangle is ${kind}.`,
      };
    }
    const x = rng.int(5, 25);
    const a = rng.int(1, 4), b = rng.int(-10, 30), c = rng.int(1, 4), d = rng.int(-10, 30);
    const third = 180 - (a * x + b) - (c * x + d);
    if (a * x + b <= 0 || c * x + d <= 0 || third <= 0) return paTriangles.generate(rng, 3, { form: '3' });
    const e = (k: number, m: number) => `${k === 1 ? '' : k}x${m ? ` ${m < 0 ? '-' : '+'} ${Math.abs(m)}` : ''}`;
    const answer = math(`x = ${x}`);
    return {
      body: `The angles of a triangle measure ${math(`(${e(a, b)})°`)}, ${math(`(${e(c, d)})°`)}, and ${math(`${third}°`)}. Find ${math('x')}.`,
      answer,
      distractors: wrong(answer, [x + 2, x - 1, Math.round((180 + b + d - third) / (a + c))].filter((v) => v > 0).map((v) => math(`x = ${v}`))),
      solution: `The angles add to 180°: ${math(`${e(a, b)} + ${e(c, d)} + ${third} = 180`)}, so ${math(`${a + c}x = ${180 - b - d - third}`)} and ${answer}.`,
    };
  },
});

const QUAD_FACTS: Array<[name: string, fact: string]> = [
  ['square', 'four equal sides and four right angles'],
  ['rectangle', 'four right angles, with opposite sides equal but not all four sides equal'],
  ['rhombus', 'four equal sides, with angles that are not right angles'],
  ['parallelogram', 'two pairs of parallel sides, with no right angles and adjacent sides unequal'],
  ['trapezoid', 'exactly one pair of parallel sides'],
  ['kite', 'two pairs of equal adjacent sides and no parallel sides'],
];

export const paQuadrilaterals = us('pa-quadrilaterals', {
  levels: { 1: 'Find the missing angle', 2: 'Classify from properties', 3: 'Angles with expressions in x' },
  options: [radioOption('form', 'Questions', [['1', 'Missing angle'], ['2', 'Classify'], ['3', 'Angles in terms of x']], ['1', '2', '3'])],
  generate(rng, level, o) {
    const form = Number(optOne(o, 'form', String(level)));
    if (form === 2) {
      const [name, fact] = rng.pick(QUAD_FACTS);
      return {
        body: `Name the most specific quadrilateral that has ${fact}.`,
        answer: name,
        distractors: wrong(name, QUAD_FACTS.map(([n]) => n)).slice(0, 4),
        solution: `A quadrilateral with ${fact} is a ${name}.`,
      };
    }
    if (form === 1) {
      const a = rng.int(50, 130), b = rng.int(50, 130), c = rng.int(50, 130), d = 360 - a - b - c;
      if (d <= 20 || d >= 200) return paQuadrilaterals.generate(rng, 1, { form: '1' });
      return {
        body: `Three angles of a quadrilateral measure ${math(`${a}°`)}, ${math(`${b}°`)}, and ${math(`${c}°`)}. Find the fourth angle.`,
        answer: math(`${d}°`),
        distractors: wrong(math(`${d}°`), [180 - a - b - c, d + 10, 540 - a - b - c].filter((v) => v > 0).map((v) => math(`${v}°`))),
        solution: `The angles of a quadrilateral add to ${math('360°')}: ${math(`360° - ${a}° - ${b}° - ${c}° = ${d}°`)}.`,
      };
    }
    const x = rng.int(5, 20), k = rng.int(2, 5), m = rng.int(0, 30);
    const known = [rng.int(60, 120), rng.int(60, 120)];
    const fourth = 360 - known[0] - known[1] - (k * x + m);
    if (fourth <= 20 || k * x + m >= 180) return paQuadrilaterals.generate(rng, 3, { form: '3' });
    const answer = math(`x = ${x}`);
    return {
      body: `The angles of a quadrilateral measure ${math(`${known[0]}°`)}, ${math(`${known[1]}°`)}, ${math(`${fourth}°`)}, and ${math(`(${k}x${m ? ` + ${m}` : ''})°`)}. Find ${math('x')}.`,
      answer,
      distractors: wrong(answer, [x + 1, x * 2, Math.round((180 - known[0] - known[1] - m) / k)].filter((v) => v > 0).map((v) => math(`x = ${v}`))),
      solution: `The angles add to 360°: ${math(`${known[0]} + ${known[1]} + ${fourth} + ${k}x${m ? ` + ${m}` : ''} = 360`)}, so ${math(`${k}x = ${k * x}`)} and ${answer}.`,
    };
  },
});

// ── Area ─────────────────────────────────────────────────────────────────────

type Shape = 'rectangle' | 'square' | 'triangle' | 'parallelogram' | 'trapezoid';
/** A labelled outline of a shape, scaled to fit, with its dimensions marked. */
function shapeDiagram(shape: Shape, d: { b: number; h: number; t?: number; s?: number }, unit: string): string {
  const W = 5, scale = W / Math.max(d.b, d.t ?? 0, d.h * 1.4);
  const b = d.b * scale, h = d.h * scale, off = (d.s ?? 0) * scale, t = (d.t ?? 0) * scale;
  const outline: Pt[] = shape === 'triangle' ? [[0, 0], [b, 0], [off, h], [0, 0]]
    : shape === 'trapezoid' ? [[0, 0], [b, 0], [off + t, h], [off, h], [0, 0]]
      : shape === 'parallelogram' ? [[0, 0], [b, 0], [b + off, h], [off, h], [0, 0]]
        : [[0, 0], [b, 0], [b, h], [0, h], [0, 0]];
  const curves: Array<{ points: Pt[]; dashed?: boolean }> = [{ points: outline }];
  const labels = [{ x: b / 2, y: -0.35, text: `${d.b} "${unit}"` }];
  if (shape === 'rectangle' || shape === 'square') labels.push({ x: b + 0.7, y: h / 2, text: `${d.h} "${unit}"` });
  else { curves.push({ points: [[off, 0], [off, h]], dashed: true }); labels.push({ x: off + 0.6, y: h / 2, text: `${d.h} "${unit}"` }); }
  if (shape === 'trapezoid') labels.push({ x: off + t / 2, y: h + 0.35, text: `${d.t} "${unit}"` });
  const xs = outline.map(([x]) => x);
  return graphTypst({ xMin: Math.min(...xs) - 0.8, xMax: Math.max(...xs) + 1.4, yMin: -0.8, yMax: h + 0.8, width: Math.max(...xs) - Math.min(...xs) + 2.2, height: h + 1.6, grid: false, axes: false, numbers: false, curves, labels });
}

export const paAreaPolygons = us('pa-area-polygons', {
  levels: { 1: 'Rectangles, squares, and triangles', 2: 'Parallelograms and trapezoids', 3: 'Any, with decimal dimensions' },
  options: [
    manyOption('shapes', 'Shapes', [['rectangle', 'Rectangles'], ['square', 'Squares'], ['triangle', 'Triangles'], ['parallelogram', 'Parallelograms'], ['trapezoid', 'Trapezoids']], [['rectangle', 'square', 'triangle'], ['parallelogram', 'trapezoid', 'triangle'], ['rectangle', 'square', 'triangle', 'parallelogram', 'trapezoid']]),
    toggleOption('decimals', 'Decimal dimensions', [false, false, true]),
  ],
  generate(rng, _level, o) {
    const shape = rng.pick(optList(o, 'shapes', ['rectangle'])) as Shape;
    const dec = optOn(o, 'decimals', false);
    const n = (lo: number, hi: number) => (dec ? rng.int(lo * 10, hi * 10) / 10 : rng.int(lo, hi));
    const unit = rng.pick(['cm', 'm', 'in', 'ft', 'mm']);
    const b = n(4, 16), h = shape === 'square' ? b : n(3, 12), t = shape === 'trapezoid' ? n(2, Math.max(3, b - 1)) : undefined;
    const s = shape === 'triangle' ? n(0, b) : shape === 'parallelogram' ? n(1, 4) : shape === 'trapezoid' ? Math.max(0, (b - (t ?? 0)) / 2) : 0;
    const area = shape === 'triangle' ? (b * h) / 2 : shape === 'trapezoid' ? ((b + (t ?? 0)) * h) / 2 : b * h;
    const answer = `${math(decimal(area, 3))} ${unit}#super[2]`;
    const doubled = shape === 'triangle' || shape === 'trapezoid' ? area * 2 : area / 2;
    const perimeterish = shape === 'trapezoid' ? b + (t ?? 0) + 2 * h : 2 * (b + h);
    return {
      body: `Find the area of the ${shape}.\n\n${shapeDiagram(shape, { b, h, t, s: Math.min(s, b) }, unit)}`,
      answer,
      distractors: wrong(answer, [doubled, perimeterish, b * h + (t ?? 0), area + b].map((v) => `${math(decimal(v, 3))} ${unit}#super[2]`)),
      solution: `${math({ rectangle: 'A = b h', square: 'A = s^2', triangle: 'A = 1/2 b h', parallelogram: 'A = b h', trapezoid: 'A = 1/2 (a + b) h' }[shape])}, so ${math(`A = ${decimal(area, 3)}`)} ${unit}#super[2].`,
    };
  },
});

export const paCircles = us('pa-circles', {
  levels: { 1: 'Circumference', 2: 'Area', 3: 'Either, given the radius or the diameter' },
  options: [
    radioOption('find', 'Find', [['circumference', 'Circumference'], ['area', 'Area'], ['either', 'Either']], ['circumference', 'area', 'either']),
    radioOption('given', 'Given', [['radius', 'Radius'], ['diameter', 'Diameter'], ['either', 'Either']], ['radius', 'radius', 'either']),
    radioOption('form', 'Answer', [['pi', 'In terms of π'], ['decimal', 'Rounded to the nearest tenth']], ['decimal', 'decimal', 'decimal']),
  ],
  generate(rng, _level, o) {
    const find = optOne(o, 'find', 'either') === 'either' ? rng.pick(['circumference', 'area'] as const) : optOne(o, 'find', 'area');
    const given = optOne(o, 'given', 'either') === 'either' ? rng.pick(['radius', 'diameter'] as const) : optOne(o, 'given', 'radius');
    const exact = optOne(o, 'form', 'decimal') === 'pi';
    const unit = rng.pick(['cm', 'm', 'in', 'ft', 'yd', 'km']);
    const r = rng.int(2, 15), d = 2 * r;
    const value = find === 'area' ? r * r : d;
    const sq = find === 'area' ? '#super[2]' : '';
    const fmt = (k: number) => (exact ? `${math(`${k} pi`)} ${unit}${sq}` : `${math(fixed(k * Math.PI, 1))} ${unit}${sq}`);
    const answer = fmt(value);
    const circle = graphTypst({
      xMin: -1.4, xMax: 1.4, yMin: -1.4, yMax: 1.4, width: 3, height: 3, grid: false, axes: false, numbers: false,
      curves: [{ points: Array.from({ length: 73 }, (_, i) => [Math.cos((i * Math.PI) / 36), Math.sin((i * Math.PI) / 36)] as Pt) }, { points: given === 'radius' ? [[0, 0], [1, 0]] : [[-1, 0], [1, 0]] }],
      dots: [{ x: 0, y: 0 }],
      labels: [{ x: given === 'radius' ? 0.5 : 0, y: 0.22, text: `${given === 'radius' ? r : d} "${unit}"` }],
    });
    return {
      body: `Find the ${find} of the circle.${exact ? ' Leave your answer in terms of π.' : ' Use π and round to the nearest tenth.'}\n\n${circle}`,
      answer,
      distractors: wrong(answer, [find === 'area' ? d * d : r, find === 'area' ? d : r * r, find === 'area' ? 2 * r : 2 * d, find === 'area' ? r * 2 * r : d / 2].map(fmt)),
      solution: find === 'area' ? `${math(`A = pi r^2 = pi (${r})^2 = ${r * r} pi`)}${exact ? '' : ` ${math(`approx ${fixed(r * r * Math.PI, 1)}`)}`}.` : `${math(`C = pi d = ${d} pi`)}${exact ? '' : ` ${math(`approx ${fixed(d * Math.PI, 1)}`)}`}.`,
    };
  },
});

// ── Transformations ──────────────────────────────────────────────────────────

type Move = { text: string; f: (p: Pt) => Pt };
function randomMove(rng: Rng, kinds: string[]): Move {
  const kind = rng.pick(kinds);
  if (kind === 'translation') {
    const a = rng.nonZero(-6, 6), b = rng.nonZero(-6, 6);
    return { text: `translation: ${Math.abs(a)} unit${Math.abs(a) === 1 ? '' : 's'} ${a > 0 ? 'right' : 'left'} and ${Math.abs(b)} unit${Math.abs(b) === 1 ? '' : 's'} ${b > 0 ? 'up' : 'down'}`, f: ([x, y]) => [x + a, y + b] };
  }
  if (kind === 'reflection') {
    return rng.pick<Move>([
      { text: 'reflection across the x-axis', f: ([x, y]) => [x, -y] },
      { text: 'reflection across the y-axis', f: ([x, y]) => [-x, y] },
      { text: `reflection across the line ${math('y = x')}`, f: ([x, y]) => [y, x] },
    ]);
  }
  return rng.pick<Move>([
    { text: 'rotation 90° counterclockwise about the origin', f: ([x, y]) => [-y, x] },
    { text: 'rotation 90° clockwise about the origin', f: ([x, y]) => [y, -x] },
    { text: 'rotation 180° about the origin', f: ([x, y]) => [-x, -y] },
  ]);
}

export const paTransformPoints = us('pa-transform-points', {
  levels: { 1: 'Translations', 2: 'Reflections', 3: 'Rotations' },
  options: [manyOption('kinds', 'Transformations', [['translation', 'Translations'], ['reflection', 'Reflections'], ['rotation', 'Rotations']], [['translation'], ['reflection'], ['rotation']]), toggleOption('graph', 'Show the figure on a grid', [true, true, true])],
  generate(rng, _level, o) {
    const move = randomMove(rng, optList(o, 'kinds', ['translation']));
    const names = rng.pick([['A', 'B', 'C'], ['J', 'K', 'L'], ['P', 'Q', 'R'], ['X', 'Y', 'Z']]);
    const pts: Pt[] = [];
    while (pts.length < 3) { const p: Pt = [rng.int(-5, 5), rng.int(-5, 5)]; if (!pts.some((q) => q[0] === p[0] && q[1] === p[1])) pts.push(p); }
    const area2 = Math.abs((pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1]));
    if (area2 < 4) return paTransformPoints.generate(rng, 1, o);
    const image = pts.map(move.f);
    const list = (ps: Pt[]) => ps.map((p, i) => `${names[i]}'${pair(p)}`).join(', ');
    const answer = math(list(image).replace(/'/g, "'"));
    const graph = optOn(o, 'graph', true) ? `\n\n${graphTypst({ xMin: -8, xMax: 8, yMin: -8, yMax: 8, width: 5, height: 5, curves: [{ points: [...pts, pts[0]] }], labels: pts.map(([x, y], i) => ({ x: x + 0.6, y: y + 0.6, text: names[i] })) })}` : '';
    const alt = [([x, y]: Pt): Pt => [-x, y], ([x, y]: Pt): Pt => [x, -y], ([x, y]: Pt): Pt => [y, x], ([x, y]: Pt): Pt => [-y, x], ([x, y]: Pt): Pt => [y, -x]];
    return {
      body: `Find the coordinates of the vertices of the image of ${math(`triangle ${names.join(' ')}`)} with vertices ${math(pts.map((p, i) => `${names[i]}${pair(p)}`).join(', '))} after a ${move.text}.${graph}`,
      answer,
      distractors: wrong(answer, alt.map((f) => math(list(pts.map(f))))),
      solution: `Apply the rule to each vertex: ${answer}.`,
    };
  },
});

// ── Solids ───────────────────────────────────────────────────────────────────

const SOLIDS: Array<{ name: string; faces: number; edges: number; vertices: number; describe: string }> = [
  { name: 'cube', faces: 6, edges: 12, vertices: 8, describe: 'six congruent square faces' },
  { name: 'rectangular prism', faces: 6, edges: 12, vertices: 8, describe: 'two rectangular bases and four rectangular lateral faces, not all congruent' },
  { name: 'triangular prism', faces: 5, edges: 9, vertices: 6, describe: 'two triangular bases and three rectangular lateral faces' },
  { name: 'pentagonal prism', faces: 7, edges: 15, vertices: 10, describe: 'two pentagonal bases and five rectangular lateral faces' },
  { name: 'hexagonal prism', faces: 8, edges: 18, vertices: 12, describe: 'two hexagonal bases and six rectangular lateral faces' },
  { name: 'triangular pyramid', faces: 4, edges: 6, vertices: 4, describe: 'a triangular base and three triangular faces meeting at a point' },
  { name: 'square pyramid', faces: 5, edges: 8, vertices: 5, describe: 'a square base and four triangular faces meeting at a point' },
  { name: 'pentagonal pyramid', faces: 6, edges: 10, vertices: 6, describe: 'a pentagonal base and five triangular faces meeting at a point' },
  { name: 'hexagonal pyramid', faces: 7, edges: 12, vertices: 7, describe: 'a hexagonal base and six triangular faces meeting at a point' },
];

export const paSolidsClassify = us('pa-solids-classify', {
  levels: { 1: 'Name the solid', 2: 'Count faces, edges, and vertices', 3: "Use Euler's formula" },
  options: [radioOption('form', 'Questions', [['1', 'Name the solid'], ['2', 'Faces, edges, and vertices'], ['3', "Euler's formula"]], ['1', '2', '3'])],
  generate(rng, level, o) {
    const form = Number(optOne(o, 'form', String(level)));
    const s = rng.pick(SOLIDS);
    if (form === 1) {
      return {
        body: `Name the solid that has ${s.describe}.`,
        answer: s.name,
        distractors: wrong(s.name, sample(rng, SOLIDS.map((x) => x.name), 6)).slice(0, 4),
        solution: `A solid with ${s.describe} is a ${s.name}.`,
      };
    }
    if (form === 2) {
      const answer = `${s.faces} faces, ${s.edges} edges, ${s.vertices} vertices`;
      return {
        body: `How many faces, edges, and vertices does a ${s.name} have?`,
        answer,
        distractors: wrong(answer, [`${s.vertices} faces, ${s.edges} edges, ${s.faces} vertices`, `${s.faces} faces, ${s.edges - 2} edges, ${s.vertices} vertices`, `${s.faces + 1} faces, ${s.edges} edges, ${s.vertices + 1} vertices`]),
        solution: `Count the bases and lateral faces (${s.faces}), the edges (${s.edges}), and the corners (${s.vertices}). Check: ${math(`F + V - E = ${s.faces} + ${s.vertices} - ${s.edges} = 2`)}.`,
      };
    }
    const ask = rng.pick(['faces', 'edges', 'vertices'] as const);
    const known = { faces: s.faces, edges: s.edges, vertices: s.vertices };
    const answer = math(String(known[ask]));
    const given = (['faces', 'edges', 'vertices'] as const).filter((k) => k !== ask).map((k) => `${known[k]} ${k}`).join(' and ');
    return {
      body: `A polyhedron has ${given}. Use Euler's formula, ${math('F + V - E = 2')}, to find the number of ${ask}.`,
      answer,
      distractors: wrong(answer, [known[ask] + 2, known[ask] - 2, known[ask] + 4].map((v) => math(String(v)))),
      solution: `Substitute into ${math('F + V - E = 2')}: there are ${answer} ${ask}.`,
    };
  },
});

// ── Square roots ─────────────────────────────────────────────────────────────

export const paSquareRoots = us('pa-square-roots', {
  levels: { 1: 'Perfect squares', 2: 'Fractions, decimals, and ±', 3: 'Approximate to the nearest tenth' },
  options: [radioOption('form', 'Questions', [['1', 'Perfect squares'], ['2', 'Fractions, decimals, and ±'], ['3', 'Approximate']], ['1', '2', '3'])],
  generate(rng, level, o) {
    const form = Number(optOne(o, 'form', String(level)));
    if (form === 1) {
      const n = rng.int(1, 20);
      const sq = rng.next() < 0.3;
      const expr = sq ? `${rng.next() < 0.5 ? n : `(-${n})`}^2` : `sqrt(${n * n})`;
      const answer = String(sq ? n * n : n);
      return task('Evaluate each.', 'Evaluate', expr, {
        answer: math(answer),
        distractors: wrong(math(answer), [sq ? 2 * n : n * n, sq ? -n * n : n / 2, sq ? n * n + n : 2 * n, sq ? n : -n].map((v) => math(String(v)))),
        solution: sq ? `${math(`${expr} = ${n} times ${n} = ${n * n}`)}.` : `${math(`${n}^2 = ${n * n}`)}, so ${math(`${expr} = ${n}`)}.`,
      });
    }
    if (form === 2) {
      const kind = rng.pick(['frac', 'dec', 'pm'] as const);
      if (kind === 'frac') {
        const a = rng.int(1, 12), b = rng.int(a + 1, 15);
        return task('Evaluate each.', 'Evaluate', `sqrt(${a * a}/${b * b})`, { answer: math(`${a}/${b}`), distractors: wrong(math(`${a}/${b}`), [`${a * a}/${b}`, `${a}/${b * b}`, `${b}/${a}`].map(math)), solution: `Take the square root of the numerator and the denominator: ${math(`${a}/${b}`)}.` });
      }
      if (kind === 'dec') {
        const a = rng.int(1, 12) / 10;
        const sq = Number((a * a).toFixed(2));
        return task('Evaluate each.', 'Evaluate', `sqrt(${sq})`, { answer: math(decimal(a)), distractors: wrong(math(decimal(a)), [decimal(a * 10), decimal(a / 10), decimal(sq / 2)].map(math)), solution: `${math(`${decimal(a)}^2 = ${sq}`)}, so ${math(`sqrt(${sq}) = ${decimal(a)}`)}.` });
      }
      const n = rng.int(2, 15);
      return task('Evaluate each.', 'Evaluate', `plus.minus sqrt(${n * n})`, { answer: math(`plus.minus ${n}`), distractors: wrong(math(`plus.minus ${n}`), [`${n}`, `-${n}`, `plus.minus ${n * 2}`].map(math)), solution: `Both ${math(String(n))} and ${math(`-${n}`)} square to ${math(String(n * n))}: ${math(`plus.minus ${n}`)}.` });
    }
    let n = rng.int(2, 150);
    while (Number.isInteger(Math.sqrt(n))) n++;
    const root = Math.sqrt(n), answer = fixed(root, 1);
    const lo = Math.floor(root);
    return task('Find each square root. Round to the nearest tenth.', 'Evaluate', `sqrt(${n})`, {
      answer: math(answer),
      distractors: wrong(math(answer), [fixed(n / 2, 1), fixed(root + 0.3, 1), fixed(root - 0.3, 1), `${lo}`].map(math)),
      solution: `${math(`${lo}^2 = ${lo * lo}`)} and ${math(`${lo + 1}^2 = ${(lo + 1) ** 2}`)}, so the root is between ${lo} and ${lo + 1}: ${math(`sqrt(${n}) approx ${answer}`)}.`,
    });
  },
});

export const PREALGEBRA_GEOMETRY = [paPlotPoints, paAngleClassify, paAngleRelationships, paTriangles, paQuadrilaterals, paAreaPolygons, paCircles, paTransformPoints, paSolidsClassify, paSquareRoots];
