import type { Rng } from '../../rng.ts';
import { graphTypst, type Pt } from '../../graph.ts';
import { math, mb10f } from '../pc40s/common.ts';
import { optNum, radioOption, sizeOption } from '../../options.ts';
import { article, dec, distinct } from '../grade10/shared.ts';

const rad = (d: number) => (d * Math.PI) / 180;
const onCircle = (deg: number, r = 4): Pt => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg))];
const circlePts = (r = 4): Pt[] => Array.from({ length: 97 }, (_, i) => onCircle((i * 360) / 96, r));

/**
 * A circle of radius 4 centred at O, with named points, segments between them, labels near angles,
 * and optional right-angle marks. Coordinates are in a [-6, 6] window.
 */
function circleDiagram(points: Record<string, Pt>, segments: Array<[string, string]>, extras: { angleLabels?: Array<{ at: string; toward: [string, string]; text: string }>; right?: Array<{ at: string; along: [string, string] }>; showO?: boolean } = {}, size = 4.6): string {
  const P: Record<string, Pt> = { O: [0, 0], ...points };
  const curves: Array<{ points: Pt[] }> = [{ points: circlePts() }];
  for (const [a, b] of segments) curves.push({ points: [P[a], P[b]] });
  const labels: Array<{ x: number; y: number; text: string }> = [];
  for (const [name, [x, y]] of Object.entries(P)) {
    if (name === 'O' && extras.showO === false) continue;
    const l = Math.hypot(x, y);
    const [dx, dy] = l < 0.1 ? [0.45, -0.45] : [(x / l) * 0.6, (y / l) * 0.6];
    labels.push({ x: x + dx, y: y + dy, text: name });
  }
  for (const a of extras.angleLabels ?? []) {
    const v = P[a.at], u1 = P[a.toward[0]], u2 = P[a.toward[1]];
    const d1 = [u1[0] - v[0], u1[1] - v[1]], d2 = [u2[0] - v[0], u2[1] - v[1]];
    const n1 = Math.hypot(d1[0], d1[1]), n2 = Math.hypot(d2[0], d2[1]);
    const bx = d1[0] / n1 + d2[0] / n2, by = d1[1] / n1 + d2[1] / n2, bl = Math.hypot(bx, by) || 1;
    labels.push({ x: v[0] + (bx / bl) * 1.35, y: v[1] + (by / bl) * 1.35, text: a.text });
  }
  for (const r of extras.right ?? []) {
    const v = P[r.at], a = P[r.along[0]], b = P[r.along[1]];
    const ua = [(a[0] - v[0]) / Math.hypot(a[0] - v[0], a[1] - v[1]), (a[1] - v[1]) / Math.hypot(a[0] - v[0], a[1] - v[1])];
    const ub = [(b[0] - v[0]) / Math.hypot(b[0] - v[0], b[1] - v[1]), (b[1] - v[1]) / Math.hypot(b[0] - v[0], b[1] - v[1])];
    const s = 0.45;
    curves.push({ points: [[v[0] + ua[0] * s, v[1] + ua[1] * s], [v[0] + (ua[0] + ub[0]) * s, v[1] + (ua[1] + ub[1]) * s], [v[0] + ub[0] * s, v[1] + ub[1] * s]] });
  }
  const dots = Object.entries(P).filter(([n]) => n !== 'O' || extras.showO !== false).map(([, [x, y]]) => ({ x, y }));
  return graphTypst({ xMin: -6.5, xMax: 6.5, yMin: -6.5, yMax: 6.5, width: size, height: size, grid: false, numbers: false, axes: false, curves, labels, dots });
}

// ── Circle geometry ───────────────────────────────────────────────────────

const TRIPLES: Array<[number, number, number]> = [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [9, 12, 15], [7, 24, 25]];

export const circChord = mb10f('10f-circ-chord', {
  levels: { 1: 'Half of a chord', 2: 'Length of a chord', 3: 'Distance from the centre' },
  options: [
    radioOption('form', 'Find', [['1', 'Half of a chord'], ['2', 'Length of a chord'], ['3', 'Distance from the centre']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const [d, half, r] = rng.pick(TRIPLES);
    const theta = rng.int(200, 340);
    // Chord AB perpendicular to OM, at distance d (scaled to the drawing) from O.
    const ratio = d / r, alpha = Math.acos(ratio) * (180 / Math.PI);
    const A = onCircle(theta - alpha), B = onCircle(theta + alpha), M: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const pic = () => circleDiagram({ A, B, M }, [['A', 'B'], ['O', 'M'], ['O', 'A']], { right: [{ at: 'M', along: ['O', 'B'] }] });
    if (difficulty === 1) {
      const ab = 2 * half;
      return {
        body: `In circle ${math('O')}, ${math('O M')} is perpendicular to chord ${math('A B')}, and ${math(`A B = ${ab}`)} cm. Find ${math('A M')}.\n\n${pic()}`,
        answer: `${half} cm`,
        distractors: distinct(`${half} cm`, [`${ab} cm`, `${r} cm`, `${d} cm`, `${half / 2} cm`]),
        solution: `A perpendicular from the centre to a chord bisects the chord, so ${math(`A M = ${ab} / 2 = ${half}`)} cm.`,
      };
    }
    if (difficulty === 2) {
      return {
        body: `In circle ${math('O')}, the radius is ${r} cm and chord ${math('A B')} is ${d} cm from the centre (${math('O M perp A B')}). Find the length of ${math('A B')}.\n\n${pic()}`,
        answer: `${2 * half} cm`,
        distractors: distinct(`${2 * half} cm`, [`${half} cm`, `${2 * r} cm`, `${dec(2 * Math.hypot(r, d), 1)} cm`, `${r + d} cm`]),
        solution: `In right triangle ${math('O M A')}: ${math(`A M = sqrt(${r}^2 - ${d}^2) = ${half}`)}. The perpendicular bisects the chord, so ${math(`A B = 2(${half}) = ${2 * half}`)} cm.`,
      };
    }
    const R = rng.int(6, 15), AB = rng.int(4, 2 * R - 2);
    const dist = Math.sqrt(R * R - (AB / 2) ** 2);
    return {
      body: `A circle has a radius of ${R} cm. A chord is ${AB} cm long. How far is the chord from the centre, to the nearest tenth?\n\n${pic()}`,
      answer: `${dec(dist, 1)} cm`,
      distractors: distinct(`${dec(dist, 1)} cm`, [`${dec(Math.sqrt(Math.abs(R * R - AB * AB)), 1)} cm`, `${dec(Math.hypot(R, AB / 2), 1)} cm`, `${dec(R - AB / 2, 1)} cm`]),
      solution: `The perpendicular from the centre bisects the chord: half is ${dec(AB / 2)} cm. ${math(`O M = sqrt(${R}^2 - ${dec(AB / 2)}^2) approx ${dec(dist, 1)}`)} cm.`,
    };
  },
});

function arcPoints(rng: Rng) {
  const a = rng.int(200, 250), b = a + rng.int(70, 120), c = rng.int(40, 140);
  return { A: onCircle(a), B: onCircle(b), C: onCircle(c), arc: b - a };
}

export const circCentralInscribed = mb10f('10f-circ-central-inscribed', {
  levels: { 1: 'Inscribed angle from the central angle', 2: 'Central angle from the inscribed angle', 3: 'Solve for x' },
  options: [
    radioOption('form', 'Given', [['1', 'Inscribed angle from the central angle'], ['2', 'Central angle from the inscribed angle'], ['3', 'Solve for x']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const { A, B, C, arc } = arcPoints(rng);
    const central = arc, inscribed = arc / 2;
    const pic = (oText: string, cText: string) => circleDiagram({ A, B, C }, [['O', 'A'], ['O', 'B'], ['C', 'A'], ['C', 'B']], { angleLabels: [{ at: 'O', toward: ['A', 'B'], text: oText }, { at: 'C', toward: ['A', 'B'], text: cText }] });
    if (difficulty === 3) {
      const x = rng.int(5, 20), k = rng.int(2, 4);
      const insExpr = inscribed - k * x;
      if (insExpr <= 0 || !Number.isInteger(insExpr)) return circCentralInscribed.generate(rng, difficulty, o);
      const insText = `(${k}x + ${insExpr})°`;
      const eq = `${central} = 2(${k}x + ${insExpr})`;
      return {
        body: `In circle ${math('O')}, the central angle ${math('angle A O B')} is ${central}° and the inscribed angle ${math('angle A C B')} is ${math(insText)}. Find ${math('x')}.\n\n${pic(`${central}°`, `(${k}x + ${insExpr})°`)}`,
        answer: math(`x = ${x}`),
        distractors: distinct(math(`x = ${x}`), [`x = ${dec((central - insExpr) / k, 2)}`, `x = ${dec((central / 2 + insExpr) / k, 2)}`, `x = ${dec((2 * central - insExpr) / k, 2)}`, `x = ${x + 5}`].map(math)),
        solution: `The central angle is twice the inscribed angle on the same arc: ${math(eq)}, so ${math(`${2 * k}x = ${central - 2 * insExpr}`)} and ${math(`x = ${x}`)}.`,
      };
    }
    if (difficulty === 1) {
      return {
        body: `In circle ${math('O')}, ${math(`angle A O B = ${central}°`)}. Find the inscribed angle ${math('angle A C B')}.\n\n${pic(`${central}°`, '?')}`,
        answer: `${dec(inscribed)}°`,
        distractors: distinct(`${dec(inscribed)}°`, [`${central}°`, `${2 * central}°`, `${180 - central}°`, `${dec(90 - inscribed)}°`]),
        solution: `An inscribed angle is half the central angle on the same arc: ${math(`${central}° div 2 = ${dec(inscribed)}°`)}.`,
      };
    }
    return {
      body: `In circle ${math('O')}, the inscribed angle ${math(`angle A C B = ${dec(inscribed)}°`)}. Find the central angle ${math('angle A O B')}.\n\n${pic('?', `${dec(inscribed)}°`)}`,
      answer: `${central}°`,
      distractors: distinct(`${central}°`, [`${dec(inscribed)}°`, `${dec(inscribed / 2)}°`, `${dec(180 - inscribed)}°`, `${dec(360 - central)}°`]),
      solution: `The central angle is twice the inscribed angle on the same arc: ${math(`2(${dec(inscribed)}°) = ${central}°`)}.`,
    };
  },
});

export const circSameArc = mb10f('10f-circ-same-arc', {
  levels: { 1: 'Equal inscribed angles', 2: 'With the angle sum of a triangle', 3: 'Solve for x' },
  options: [
    radioOption('form', 'Given', [['1', 'Equal inscribed angles'], ['2', 'With the angle sum of a triangle'], ['3', 'Solve for x']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = rng.int(200, 240), b = a + rng.int(70, 110);
    const A = onCircle(a), B = onCircle(b), C = onCircle(rng.int(60, 90)), D = onCircle(rng.int(110, 150));
    const angle = (b - a) / 2;
    const pic = (cText: string, dText: string) => circleDiagram({ A, B, C, D }, [['C', 'A'], ['C', 'B'], ['D', 'A'], ['D', 'B']], { showO: false, angleLabels: [{ at: 'C', toward: ['A', 'B'], text: cText }, { at: 'D', toward: ['A', 'B'], text: dText }] });
    if (difficulty === 1) {
      return {
        body: `Points ${math('C')} and ${math('D')} are on the circle, and ${math(`angle A C B = ${dec(angle)}°`)}. Find ${math('angle A D B')}.\n\n${pic(`${dec(angle)}°`, '?')}`,
        answer: `${dec(angle)}°`,
        distractors: distinct(`${dec(angle)}°`, [`${dec(2 * angle)}°`, `${dec(angle / 2)}°`, `${dec(180 - angle)}°`]),
        solution: `Inscribed angles subtended by the same arc ${math('A B')} are congruent: ${math(`angle A D B = ${dec(angle)}°`)}.`,
      };
    }
    if (difficulty === 2) {
      const cab = rng.int(25, 70);
      const cba = 180 - angle - cab;
      return {
        body: `In the diagram, ${math(`angle A C B = ${dec(angle)}°`)} and ${math(`angle C A B = ${cab}°`)}. Find ${math('angle A D B')} and ${math('angle C B A')}.\n\n${circleDiagram({ A, B, C, D }, [['C', 'A'], ['C', 'B'], ['D', 'A'], ['D', 'B'], ['A', 'B']], { showO: false })}`,
        answer: `${math(`angle A D B = ${dec(angle)}°`)}, ${math(`angle C B A = ${dec(cba)}°`)}`,
        distractors: distinct(`${math(`angle A D B = ${dec(angle)}°`)}, ${math(`angle C B A = ${dec(cba)}°`)}`, [`${math(`angle A D B = ${dec(2 * angle)}°`)}, ${math(`angle C B A = ${dec(cba)}°`)}`, `${math(`angle A D B = ${dec(angle)}°`)}, ${math(`angle C B A = ${dec(180 - cab)}°`)}`, `${math(`angle A D B = ${cab}°`)}, ${math(`angle C B A = ${dec(angle)}°`)}`]),
        solution: `${math('angle A D B = angle A C B')} (same arc). In triangle ${math('A B C')}: ${math(`180° - ${dec(angle)}° - ${cab}° = ${dec(cba)}°`)}.`,
      };
    }
    const k = rng.int(2, 5), x = rng.int(4, 15), c = angle - k * x;
    const m = k + rng.int(1, 3), d = angle - m * x;
    const e1 = `${k}x ${c < 0 ? '-' : '+'} ${Math.abs(c)}`, e2 = `${m}x ${d < 0 ? '-' : '+'} ${Math.abs(d)}`;
    return {
      body: `Inscribed angles ${math('angle A C B')} and ${math('angle A D B')} stand on the same arc. ${math(`angle A C B = (${e1})°`)} and ${math(`angle A D B = (${e2})°`)}. Find ${math('x')}.\n\n${pic(`(${e1})°`, `(${e2})°`)}`,
      answer: math(`x = ${x}`),
      distractors: distinct(math(`x = ${x}`), [`x = ${dec((c + d) / (k + m), 2)}`, `x = ${dec((180 - c - d) / (k + m), 2)}`, `x = ${x + 3}`, `x = ${dec(angle, 2)}`].map(math)),
      solution: `Inscribed angles on the same arc are equal: ${math(`${e1} = ${e2}`)}, so ${math(`${m - k === 1 ? '' : m - k}x = ${c - d}`)} and ${math(`x = ${x}`)} (each angle is ${dec(angle)}°).`,
    };
  },
});

export const circSemicircle = mb10f('10f-circ-semicircle', {
  levels: { 1: 'The angle in a semicircle', 2: 'The third angle', 3: 'A side length' },
  options: [
    radioOption('form', 'Find', [['1', 'The angle in a semicircle'], ['2', 'The third angle'], ['3', 'A side length']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const t = rng.int(25, 155);
    const A = onCircle(180), B = onCircle(0), C = onCircle(t);
    const pic = (cText: string, aText = '') => circleDiagram({ A, B, C }, [['A', 'B'], ['A', 'C'], ['C', 'B']], { angleLabels: [{ at: 'C', toward: ['A', 'B'], text: cText }, ...(aText ? [{ at: 'A', toward: ['C', 'B'] as [string, string], text: aText }] : [])] });
    if (difficulty === 1) {
      return {
        body: `${math('A B')} is a diameter of circle ${math('O')} and ${math('C')} is on the circle. Find ${math('angle A C B')}.\n\n${pic('?')}`,
        answer: '90°',
        distractors: ['180°', '45°', '60°'],
        solution: `An inscribed angle subtended by a diameter is a right angle: ${math('angle A C B = 90°')}.`,
      };
    }
    const cab = Math.round((180 - t) / 2);
    if (difficulty === 2) {
      return {
        body: `${math('A B')} is a diameter and ${math(`angle C A B = ${cab}°`)}. Find ${math('angle C B A')}.\n\n${pic('', `${cab}°`)}`,
        answer: `${90 - cab}°`,
        distractors: distinct(`${90 - cab}°`, [`${180 - cab}°`, `${cab}°`, `${2 * cab}°`, `${180 - 2 * cab}°`]),
        solution: `${math('angle A C B = 90°')} (angle in a semicircle), so ${math(`angle C B A = 180° - 90° - ${cab}° = ${90 - cab}°`)}.`,
      };
    }
    const [a, b, c] = rng.pick(TRIPLES);
    return {
      body: `${math('A B')} is a diameter of ${c} cm, ${math('C')} is on the circle, and ${math(`A C = ${a}`)} cm. Find ${math('B C')}.\n\n${pic('')}`,
      answer: `${b} cm`,
      distractors: distinct(`${b} cm`, [`${dec(Math.hypot(a, c), 1)} cm`, `${c - a} cm`, `${dec(c / 2, 1)} cm`]),
      solution: `${math('angle A C B = 90°')}, so ${math('A B')} is the hypotenuse: ${math(`B C = sqrt(${c}^2 - ${a}^2) = ${b}`)} cm.`,
    };
  },
});

export const circTangent = mb10f('10f-circ-tangent', {
  levels: { 1: 'Angle between a tangent and a radius', 2: 'Tangent length', 3: 'Radius or distance' },
  options: [
    radioOption('form', 'Find', [['1', 'Angle between a tangent and a radius'], ['2', 'Tangent length'], ['3', 'Radius or distance']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const t = rng.int(60, 120);
    const P = onCircle(t);
    // Q on the tangent line at P, outside the circle.
    const dir: Pt = [-Math.sin(rad(t)), Math.cos(rad(t))];
    const Q: Pt = [P[0] + dir[0] * 4, P[1] + dir[1] * 4];
    const pic = (pqText = '') => circleDiagram({ P, Q }, [['O', 'P'], ['P', 'Q'], ['O', 'Q']], { right: [{ at: 'P', along: ['O', 'Q'] }], angleLabels: pqText ? [{ at: 'Q', toward: ['O', 'P'], text: pqText }] : [] });
    if (difficulty === 1) {
      const q = rng.int(20, 65);
      return {
        body: `${math('P Q')} is tangent to circle ${math('O')} at ${math('P')}, and ${math(`angle O Q P = ${q}°`)}. Find ${math('angle P O Q')}.\n\n${pic(`${q}°`)}`,
        answer: `${90 - q}°`,
        distractors: distinct(`${90 - q}°`, [`${180 - q}°`, `${q}°`, `${2 * q}°`, `${180 - 2 * q}°`]),
        solution: `A tangent is perpendicular to the radius at the point of tangency: ${math('angle O P Q = 90°')}. So ${math(`angle P O Q = 180° - 90° - ${q}° = ${90 - q}°`)}.`,
      };
    }
    const [r, len, oq] = rng.pick(TRIPLES);
    if (difficulty === 2) {
      return {
        body: `${math('P Q')} is tangent to a circle with centre ${math('O')} and radius ${r} cm. ${math(`O Q = ${oq}`)} cm. Find the tangent length ${math('P Q')}.\n\n${pic()}`,
        answer: `${len} cm`,
        distractors: distinct(`${len} cm`, [`${dec(Math.hypot(r, oq), 1)} cm`, `${oq - r} cm`, `${r + oq} cm`]),
        solution: `${math('O P perp P Q')}, so ${math(`P Q = sqrt(${oq}^2 - ${r}^2) = ${len}`)} cm.`,
      };
    }
    return {
      body: `${math('P Q')} is tangent to a circle with centre ${math('O')} at ${math('P')}. ${math(`P Q = ${len}`)} cm and ${math(`O Q = ${oq}`)} cm. Find the radius.\n\n${pic()}`,
      answer: `${r} cm`,
      distractors: distinct(`${r} cm`, [`${oq - len} cm`, `${dec(Math.hypot(len, oq), 1)} cm`, `${dec(oq / 2, 1)} cm`]),
      solution: `${math('O P perp P Q')}, so ${math(`O P = sqrt(${oq}^2 - ${len}^2) = ${r}`)} cm.`,
    };
  },
});

const PROPERTIES: Array<[string, string]> = [
  ['a perpendicular from the centre to a chord meets it at its midpoint', 'The perpendicular from the centre of a circle to a chord bisects the chord.'],
  ['an angle at the centre is twice an inscribed angle on the same arc', 'The central angle is twice the inscribed angle subtended by the same arc.'],
  ['two inscribed angles on the same arc are equal', 'Inscribed angles subtended by the same arc are congruent.'],
  ['an angle inscribed in a semicircle is 90°', 'An inscribed angle subtended by a diameter is a right angle.'],
  ['the angle between a radius and a tangent at its endpoint is 90°', 'A tangent to a circle is perpendicular to the radius at the point of tangency.'],
];

export const circProperty = mb10f('10f-circ-property', {
  points: 1,
  levels: { 1: 'Name the property', 2: 'Which property justifies the step?', 3: 'Reverse relationships' },
  options: [
    radioOption('form', 'Property', [['1', 'Name the property'], ['2', 'Which property justifies the step?'], ['3', 'Reverse relationships']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const [what, prop] = rng.pick(PROPERTIES);
    if (difficulty === 3) {
      const reverse: Array<[string, string, string]> = [
        ['A line through the centre bisects a chord.', 'It is perpendicular to the chord.', 'It is parallel to the chord.'],
        ['An inscribed angle is 90°.', 'Its arc is a semicircle: the chord it subtends is a diameter.', 'Its arc is a quarter circle.'],
        ['A line meets a circle at P and is perpendicular to the radius there.', 'The line is tangent to the circle at P.', 'The line passes through the centre.'],
      ];
      const [given, conclusion, wrong] = rng.pick(reverse);
      return {
        body: `${given} What can you conclude?`,
        answer: conclusion,
        distractors: distinct(conclusion, [wrong, 'Nothing can be concluded.', 'It is a tangent to the circle.']),
        solution: `This is the reverse of a circle property, and it also holds: ${conclusion.toLowerCase()}`,
      };
    }
    return {
      body: difficulty === 1 ? `Which circle property says that ${what}?` : `A student writes "${what}" as a reason in a proof. Which property is being used?`,
      answer: prop,
      distractors: PROPERTIES.filter(([, p]) => p !== prop).map(([, p]) => p).slice(0, 3),
      solution: prop,
    };
  },
});

// ── Surface area ──────────────────────────────────────────────────────────

const box = (l: number, w: number, h: number) => 2 * (l * w + l * h + w * h);

export const saComposite = mb10f('10f-sa-composite', {
  levels: { 1: 'Two stacked rectangular prisms', 2: 'A cylinder on a rectangular prism', 3: 'A triangular prism roof on a rectangular prism' },
  options: [
    radioOption('form', 'Solid', [['1', 'Two stacked rectangular prisms'], ['2', 'A cylinder on a rectangular prism'], ['3', 'A triangular prism roof on a rectangular prism']], ['1', '2', '3']),
    sizeOption([12, 20, 30], [20, 20, 20], 'Largest dimension'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const T = optNum(o, 'size', 20);
    const L = rng.int(8, T), W = rng.int(6, Math.max(7, Math.round(T * 0.7))), H = rng.int(3, Math.max(4, Math.round(T / 2)));
    if (difficulty === 1) {
      const l = rng.int(2, L - 2), w = rng.int(2, W - 2), h = rng.int(2, 8);
      const sa = box(L, W, H) + box(l, w, h) - 2 * l * w;
      return {
        body: `A ${l} cm × ${w} cm × ${h} cm box sits on top of a ${L} cm × ${W} cm × ${H} cm box. Find the total exposed surface area.`,
        answer: `${sa} cm²`,
        distractors: distinct(`${sa} cm²`, [`${box(L, W, H) + box(l, w, h)} cm²`, `${box(L, W, H) + box(l, w, h) - l * w} cm²`, `${L * W * H + l * w * h} cm²`]),
        solution: `Add both surface areas, ${box(L, W, H)} + ${box(l, w, h)}, then subtract the overlap twice (the top box's bottom and the part of the lower box it covers): ${math(`2(${l} dot ${w}) = ${2 * l * w}`)}. Total: ${sa} cm².`,
      };
    }
    if (difficulty === 2) {
      const r = rng.int(1, Math.floor(Math.min(L, W) / 2) - 1), h = rng.int(3, 12);
      const sa = box(L, W, H) + 2 * Math.PI * r * r + 2 * Math.PI * r * h - 2 * Math.PI * r * r;
      return {
        body: `A cylinder (radius ${r} cm, height ${h} cm) stands on a ${L} cm × ${W} cm × ${H} cm box. Find the exposed surface area, to the nearest tenth.`,
        answer: `${dec(sa, 1)} cm²`,
        distractors: distinct(`${dec(sa, 1)} cm²`, [`${dec(sa + 2 * Math.PI * r * r, 1)} cm²`, `${dec(sa + Math.PI * r * r, 1)} cm²`, `${dec(box(L, W, H) + 2 * Math.PI * r * h, 1) === dec(sa, 1) ? dec(sa - 10, 1) : dec(box(L, W, H) + Math.PI * r * h, 1)} cm²`]),
        solution: `The cylinder's bottom and the circle it covers on the box are hidden, so they cancel with the cylinder's top: box ${box(L, W, H)} + lateral ${math(`2 pi (${r})(${h}) approx ${dec(2 * Math.PI * r * h, 1)}`)} ≈ ${dec(sa, 1)} cm².`,
      };
    }
    const [a, b, c] = rng.pick([[3, 4, 5], [6, 8, 10], [5, 12, 13]]);
    // The roof: an isosceles triangle with base W = 2b? Keep a right-triangle roof: legs a (height) and b (half the width).
    const width = 2 * b, len = rng.int(8, 20), wallH = rng.int(3, 8);
    const walls = 2 * (len * wallH + width * wallH), floor = len * width;
    const roofEnds = 2 * (width * a / 2), roofSides = 2 * c * len;
    const sa = walls + floor + roofEnds + roofSides;
    return {
      body: `A shed is ${article(len)} ${len} m × ${width} m × ${wallH} m box with a roof shaped like a triangular prism. The roof's triangular ends have base ${width} m and height ${a} m, with sloped sides ${c} m. Find the total outside surface area, including the floor.`,
      answer: `${sa} m²`,
      distractors: distinct(`${sa} m²`, [`${sa + floor} m²`, `${sa - roofEnds / 2} m²`, `${walls + floor + roofSides} m²`]),
      solution: `Walls ${walls}, floor ${floor}, triangular ends ${math(`2 dot 1/2 (${width})(${a}) = ${roofEnds}`)}, roof panels ${math(`2(${c})(${len}) = ${roofSides}`)}. The box top is hidden under the roof. Total: ${sa} m².`,
    };
  },
});

export const saOverlap = mb10f('10f-sa-overlap', {
  points: 1,
  levels: { 1: 'Area of overlap', 2: 'Effect on surface area', 3: 'A cylinder overlap' },
  options: [
    radioOption('form', 'Solid', [['1', 'Area of overlap'], ['2', 'Effect on surface area'], ['3', 'A cylinder overlap']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const s = rng.int(3, 10);
    if (difficulty === 3) {
      const r = rng.int(2, 6);
      const ov = Math.PI * r * r;
      return {
        body: `A cylinder of radius ${r} cm stands on a box. By how much is the total surface area less than the sum of the two separate surface areas, to the nearest tenth?`,
        answer: `${dec(2 * ov, 1)} cm²`,
        distractors: distinct(`${dec(2 * ov, 1)} cm²`, [`${dec(ov, 1)} cm²`, `${dec(2 * Math.PI * r, 1)} cm²`, `${dec(4 * ov, 1)} cm²`]),
        solution: `The overlap is a circle of area ${math(`pi (${r})^2 approx ${dec(ov, 1)}`)}. It is hidden on both objects, so subtract it twice: ${dec(2 * ov, 1)} cm².`,
      };
    }
    if (difficulty === 1) {
      return {
        body: `A cube with ${s} cm edges is glued onto the top of a larger box. What is the area of overlap?`,
        answer: `${s * s} cm²`,
        distractors: distinct(`${s * s} cm²`, [`${2 * s * s} cm²`, `${6 * s * s} cm²`, `${4 * s} cm²`]),
        solution: `The overlap is one face of the cube: ${math(`${s}^2 = ${s * s}`)} cm².`,
      };
    }
    return {
      body: `A cube with ${s} cm edges is glued onto a larger box. How does this change the total surface area, compared with the two objects apart?`,
      answer: `It is ${2 * s * s} cm² less`,
      distractors: [`It is ${s * s} cm² less`, `It is ${2 * s * s} cm² more`, 'It does not change'],
      solution: `The overlapping ${s * s} cm² is hidden on the cube and on the box, so subtract it twice: ${2 * s * s} cm².`,
    };
  },
});

export const saProblem = mb10f('10f-sa-problem', {
  levels: { 1: 'Paint for a room', 2: 'Wrapping paper', 3: 'Cost of materials' },
  options: [
    radioOption('form', 'Context', [['1', 'Paint for a room'], ['2', 'Wrapping paper'], ['3', 'Cost of materials']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const l = rng.int(3, 6), w = rng.int(3, 5), h = rng.pick([2.4, 2.5, 3]), cover = rng.pick([8, 10, 12]);
      const area = 2 * (l * h + w * h) + l * w;
      const litres = Math.ceil(area / cover);
      return {
        body: `${rng.pick(['A room', 'A bedroom', 'A classroom', 'An office'])} is ${l} m × ${w} m with ${h} m walls. You will paint the walls and ceiling. One litre covers ${cover} m². How many whole litres are needed?`,
        answer: `${litres} L`,
        distractors: distinct(`${litres} L`, [`${Math.ceil((area + l * w) / cover)} L`, `${Math.ceil((2 * (l * h + w * h)) / cover)} L`, `${Math.floor(area / cover)} L`, `${litres + 2} L`]),
        solution: `Walls: ${math(`2(${l} dot ${h}) + 2(${w} dot ${h}) = ${dec(2 * (l * h + w * h), 1)}`)}; ceiling: ${l * w}. Total ${dec(area, 1)} m². ${dec(area, 1)} ÷ ${cover} ≈ ${dec(area / cover, 2)}, so buy ${litres} L.`,
      };
    }
    if (difficulty === 2) {
      const l = rng.int(10, 40), w = rng.int(8, 30), h = rng.int(3, 15), extra = rng.pick([10, 15, 20]);
      const sa = box(l, w, h), need = sa * (1 + extra / 100);
      return {
        body: `A ${rng.pick(['gift box', 'shoebox', 'board game box', 'box of chocolates'])} is ${l} cm × ${w} cm × ${h} cm. You need ${extra}% extra paper for overlap. How much wrapping paper is needed?`,
        answer: `${dec(need, 1)} cm²`,
        distractors: distinct(`${dec(need, 1)} cm²`, [`${sa} cm²`, `${dec(l * w * h * (1 + extra / 100), 1)} cm²`, `${dec(sa + extra, 1)} cm²`]),
        solution: `Surface area: ${math(`2(${l * w} + ${l * h} + ${w * h}) = ${sa}`)} cm². Add ${extra}%: ${math(`${sa} times ${dec(1 + extra / 100)} = ${dec(need, 1)}`)} cm².`,
      };
    }
    const r = rng.pick([0.5, 1, 1.5]), h = rng.int(2, 6), price = rng.pick([12, 15, 18.5]);
    const sa = 2 * Math.PI * r * r + 2 * Math.PI * r * h;
    return {
      body: `A closed cylindrical ${rng.pick(['tank', 'water tank', 'fuel tank', 'storage drum'])} has radius ${r} m and height ${h} m. Sheet metal costs \\$${price.toFixed(2)} per m². What does the metal cost, to the nearest dollar?`,
      answer: `\\$${Math.round(sa * price)}`,
      distractors: distinct(`\\$${Math.round(sa * price)}`, [`\\$${Math.round((Math.PI * r * r + 2 * Math.PI * r * h) * price)}`, `\\$${Math.round(Math.PI * r * r * h * price)}`, `\\$${Math.round(2 * Math.PI * r * h * price)}`]),
      solution: `${math(`"SA" = 2 pi (${r})^2 + 2 pi (${r})(${h}) approx ${dec(sa, 2)}`)} m². Cost ≈ ${dec(sa, 2)} × ${price} ≈ \\$${Math.round(sa * price)}.`,
    };
  },
});

// ── Similarity and scale ──────────────────────────────────────────────────

export const simCheck = mb10f('10f-sim-check', {
  points: 1,
  levels: { 1: 'Rectangles', 2: 'Triangles', 3: 'Quadrilaterals with angles' },
  options: [
    radioOption('form', 'Figures', [['1', 'Rectangles'], ['2', 'Triangles'], ['3', 'Quadrilaterals with angles']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const similar = rng.next() < 0.5, k = rng.pick([1.5, 2, 2.5, 3, 0.5]);
    const sides = difficulty === 1 ? [rng.int(2, 9), rng.int(10, 15)] : [rng.int(3, 8), rng.int(5, 10), rng.int(6, 12)];
    const other = sides.map((s, i) => s * k + (!similar && i === sides.length - 1 ? rng.pick([1, 2, -1]) : 0));
    const shape = difficulty === 1 ? 'rectangle' : difficulty === 2 ? 'triangle' : 'quadrilateral';
    const angleNote = difficulty === 3 ? ' Corresponding angles are equal.' : '';
    const answer = similar ? `Similar: every ratio is ${dec(k)}` : 'Not similar: the side ratios are not all equal';
    return {
      body: `One ${shape} has sides ${sides.join(', ')} cm and another has corresponding sides ${other.map((o) => dec(o)).join(', ')} cm.${angleNote} Are they similar?`,
      answer,
      distractors: distinct(answer, [similar ? 'Not similar: the side ratios are not all equal' : `Similar: every ratio is ${dec(k)}`, 'Similar: the sides all increased', similar ? `Not similar: the sides differ by ${dec(other[0] - sides[0])} cm` : `Similar: each side grew by ${dec(other[0] - sides[0])} cm`]),
      solution: `Ratios of corresponding sides: ${sides.map((s, i) => dec(other[i] / s, 3)).join(', ')}. ${similar ? 'They are all equal, so the polygons are similar.' : 'They are not all equal, so the polygons are not similar.'}`,
    };
  },
});

export const simMissingSide = mb10f('10f-sim-missing-side', {
  levels: { 1: 'Enlargement by a whole-number factor', 2: 'Any scale factor', 3: 'Reduction' },
  options: [
    radioOption('form', 'Scale factor', [['1', 'Enlargement by a whole-number factor'], ['2', 'Any scale factor'], ['3', 'Reduction']], ['1', '2', '3']),
    sizeOption([6, 12, 20], [12, 12, 12], 'Largest side'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = rng.int(3, Math.max(4, Math.round(optNum(o, 'size', 12) * 0.75))), b = rng.int(4, optNum(o, 'size', 12));
    const k = difficulty === 1 ? rng.int(2, 3) : difficulty === 2 ? rng.pick([1.5, 2.5, 1.25]) : rng.pick([0.5, 0.25, 0.75]);
    const draw = (scale: number, x0: number, lab: [string, string]) => {
      const w = b * scale, h = a * scale;
      return { curve: { points: [[x0, 0], [x0 + w, 0], [x0, h], [x0, 0]] as Pt[] }, labels: [{ x: x0 + w / 2, y: -0.9, text: lab[0] }, { x: x0 - 0.9, y: h / 2, text: lab[1] }] };
    };
    const s = 6 / Math.max(b, b * k, a * k, a);
    const t1 = draw(s, 0, [String(b), String(a)]);
    const t2 = draw(s * k, b * s + 2.5, [dec(b * k), 'x']);
    const W = b * s + 2.5 + b * s * k + 1;
    const pic = graphTypst({ xMin: -1.8, xMax: W, yMin: -1.8, yMax: Math.max(a * s, a * s * k) + 1, width: Math.min(12, (W + 1.8) * 0.5), height: (Math.max(a * s, a * s * k) + 2.8) * 0.5, grid: false, numbers: false, axes: false, curves: [t1.curve, t2.curve], labels: [...t1.labels, ...t2.labels] });
    const x = a * k;
    return {
      body: `The right triangles are similar. Find ${math('x')}.\n\n${pic}`,
      answer: math(`x = ${dec(x, 2)}`),
      distractors: distinct(math(`x = ${dec(x, 2)}`), [dec(a / k, 2), dec(a + b * k - b, 2), dec((b * k * b) / a, 2), dec(a * b / (b * k), 2)].map((v) => math(`x = ${v}`))),
      solution: `The scale factor is ${math(`${dec(b * k)} / ${b} = ${dec(k)}`)}, so ${math(`x = ${a} times ${dec(k)} = ${dec(x, 2)}`)}.`,
    };
  },
});

export const simProblem = mb10f('10f-sim-problem', {
  levels: { 1: 'Shadows', 2: 'Photo enlargements', 3: 'Indirect measurement' },
  options: [
    radioOption('form', 'Context', [['1', 'Shadows'], ['2', 'Photo enlargements'], ['3', 'Indirect measurement']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const h = rng.pick([1.5, 1.6, 1.8]), s = rng.int(2, 4) / 2 + 0.5, S = rng.int(8, 30);
      const H = (h * S) / s;
      return {
        body: ((thing) => `A ${h} m tall student casts a ${dec(s)} m shadow. At the same time, ${thing} casts a ${S} m shadow. How tall is the ${thing.slice(2)}, to the nearest tenth?`)(rng.pick(['a flagpole', 'a tree', 'a building', 'a light pole', 'a statue'])),
        answer: `${dec(H, 1)} m`,
        distractors: distinct(`${dec(H, 1)} m`, [`${dec((s * S) / h, 1)} m`, `${dec(S + h - s, 1)} m`, `${dec(h * S, 1)} m`]),
        solution: `The triangles are similar: ${math(`H / ${S} = ${h} / ${dec(s)}`)}, so ${math(`H approx ${dec(H, 1)}`)} m.`,
      };
    }
    if (difficulty === 2) {
      const w = rng.pick([4, 5, 6]), h = rng.pick([6, 7, 8]), W = w * rng.pick([2, 2.5, 3]);
      const H = (h * W) / w;
      return {
        body: `A ${w} cm × ${h} cm ${rng.pick(['photo', 'drawing', 'poster design', 'logo'])} is enlarged so the width is ${dec(W)} cm. What is the new height?`,
        answer: `${dec(H, 2)} cm`,
        distractors: distinct(`${dec(H, 2)} cm`, [`${dec(h + W - w, 2)} cm`, `${dec((w * W) / h, 2)} cm`, `${dec(h * W, 2)} cm`]),
        solution: `Scale factor ${math(`${dec(W)} / ${w} = ${dec(W / w)}`)}, so the height is ${math(`${h} times ${dec(W / w)} = ${dec(H, 2)}`)} cm.`,
      };
    }
    const a = rng.int(10, 30), b = rng.int(3, 8), c = rng.int(12, 40);
    const x = (a * c) / b;
    return {
      body: `To find the width of a river, a surveyor sets up similar triangles: the small triangle has legs ${b} m and ${a} m, and the large triangle has the corresponding shorter leg ${c} m. Find the longer leg of the large triangle (the river width), to the nearest tenth.`,
      answer: `${dec(x, 1)} m`,
      distractors: distinct(`${dec(x, 1)} m`, [`${dec((b * c) / a, 1)} m`, `${dec(a + c - b, 1)} m`, `${dec(a * c, 1)} m`]),
      solution: `${math(`x / ${a} = ${c} / ${b}`)}, so ${math(`x = ${a} times ${c} / ${b} approx ${dec(x, 1)}`)} m.`,
    };
  },
});

export const scaleFactor = mb10f('10f-scale-factor', {
  points: 1,
  levels: { 1: 'Same units', 2: 'Different units', 3: 'Is the diagram proportional?' },
  options: [
    radioOption('form', 'Task', [['1', 'Same units'], ['2', 'Different units'], ['3', 'Is the diagram proportional?']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const l = rng.int(4, 12), w = rng.int(2, 8), k = rng.pick([1.5, 2, 3, 0.5]), ok = rng.next() < 0.5;
      const L = l * k, Wd = w * k + (ok ? 0 : rng.pick([1, -1, 0.5]));
      const answer = ok ? `Yes, with scale factor ${dec(k)}` : 'No: the length and width are scaled differently';
      return {
        body: `${article(l).replace(/^a/, 'A')} ${l} cm × ${w} cm rectangle is drawn as ${dec(L)} cm × ${dec(Wd)} cm. Is the drawing proportional to the original?`,
        answer,
        distractors: distinct(answer, [ok ? 'No: the length and width are scaled differently' : `Yes, with scale factor ${dec(k)}`, `Yes, with scale factor ${dec(Wd / w, 2)}`, 'No: a drawing must be smaller than the original']),
        solution: `Length ratio ${dec(L / l, 3)}, width ratio ${dec(Wd / w, 3)}. ${ok ? 'They match.' : 'They differ.'}`,
      };
    }
    if (difficulty === 1) {
      const orig = rng.int(2, 20), k = rng.pick([0.25, 0.5, 1.5, 2, 3, 4]);
      return {
        body: `A ${orig} cm line segment is drawn ${dec(orig * k)} cm long on a scale diagram. What is the scale factor?`,
        answer: math(dec(k)),
        distractors: distinct(math(dec(k)), [dec(1 / k, 3), dec(orig * k - orig), dec(k * 10)].map(math)),
        solution: `Scale factor = diagram length ÷ actual length = ${math(`${dec(orig * k)} / ${orig} = ${dec(k)}`)}. ${k > 1 ? 'Greater than 1: an enlargement.' : 'Less than 1: a reduction.'}`,
      };
    }
    const actualM = rng.int(3, 40), d = rng.int(2, 15);
    const k = d / (actualM * 100);
    return {
      body: `A ${actualM} m long ${rng.pick(['bridge', 'building', 'boat', 'train platform', 'swimming pool'])} is ${d} cm long in a drawing. What is the scale factor?`,
      answer: math(`${d}/${actualM * 100} = ${dec(k, 5)}`),
      distractors: [`${d}/${actualM} = ${dec(d / actualM, 3)}`, `${actualM * 100}/${d} = ${dec((actualM * 100) / d, 2)}`, `${d}/${actualM * 10} = ${dec(d / (actualM * 10), 4)}`].map(math),
      solution: `Use the same units: ${actualM} m = ${actualM * 100} cm. ${math(`k = ${d} / ${actualM * 100} = ${dec(k, 5)}`)}.`,
    };
  },
});

export const scaleActual = mb10f('10f-scale-actual', {
  levels: { 1: 'Actual length from a scale', 2: 'Diagram length from a scale', 3: 'Map scales' },
  options: [
    radioOption('form', 'Find', [['1', 'Actual length from a scale'], ['2', 'Diagram length from a scale'], ['3', 'Map scales']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const km = rng.pick([10, 20, 25, 50]), cm = rng.int(3, 15) + rng.pick([0, 0.5]);
      return {
        body: `On a ${rng.pick(['map of Manitoba', 'road map', 'map of a provincial park', 'hiking map'])}, 1 cm represents ${km} km. Two ${rng.pick(['towns', 'campsites', 'lakes', 'lookouts'])} are ${dec(cm)} cm apart on the map. How far apart are they?`,
        answer: `${dec(cm * km)} km`,
        distractors: distinct(`${dec(cm * km)} km`, [`${dec(km / cm, 2)} km`, `${dec(cm + km)} km`, `${dec(cm * km * 10)} km`]),
        solution: `${dec(cm)} × ${km} = ${dec(cm * km)} km.`,
      };
    }
    const n = rng.pick([20, 25, 50, 100]), dcm = rng.int(2, 20) + rng.pick([0, 0.5]);
    const actualM = (dcm * n) / 100;
    if (difficulty === 1) {
      return {
        body: `A ${rng.pick(['floor plan', 'house plan', 'school blueprint', 'plan of a cabin'])} uses the scale 1 : ${n}. A wall is ${dec(dcm)} cm long on the plan. How long is the actual wall, in metres?`,
        answer: `${dec(actualM, 3)} m`,
        distractors: distinct(`${dec(actualM, 3)} m`, [`${dec(dcm * n, 2)} m`, `${dec(dcm / n, 4)} m`, `${dec(actualM * 10, 3)} m`]),
        solution: `Actual = ${dec(dcm)} × ${n} = ${dec(dcm * n)} cm = ${dec(actualM, 3)} m.`,
      };
    }
    return {
      body: `A plan uses the scale 1 : ${n}. How long should a ${dec(actualM, 3)} m wall be drawn, in centimetres?`,
      answer: `${dec(dcm, 2)} cm`,
      distractors: distinct(`${dec(dcm, 2)} cm`, [`${dec(actualM * n, 2)} cm`, `${dec(actualM / n, 4)} cm`, `${dec(dcm * 10, 2)} cm`]),
      solution: `${dec(actualM, 3)} m = ${dec(actualM * 100)} cm; divide by ${n}: ${dec(dcm, 2)} cm.`,
    };
  },
});

/** A polygon on a grid. */
function gridShape(pts: Pt[], size = 3.4, extra: Pt[][] = []): string {
  return graphTypst({ xMin: 0, xMax: 12, yMin: 0, yMax: 12, width: size, height: size, numbers: false, axes: false, curves: [{ points: [...pts, pts[0]] }, ...extra.map((p) => ({ points: p, dashed: true }))] });
}
function baseShape(rng: Rng): Pt[] {
  return rng.pick([
    [[1, 1], [4, 1], [4, 3], [2, 3], [2, 4], [1, 4]],
    [[1, 1], [5, 1], [3, 4]],
    [[1, 1], [4, 1], [5, 3], [2, 3]],
    [[1, 1], [3, 1], [3, 2], [5, 2], [5, 4], [1, 4]],
  ] as Pt[][]);
}

export const scaleDraw = mb10f('10f-scale-draw', {
  levels: { 1: 'Enlarge by 2', 2: 'Enlarge by 1.5 or 3', 3: 'Reduce by 1/2' },
  options: [
    radioOption('form', 'Task', [['1', 'Enlarge by 2'], ['2', 'Enlarge by 1.5 or 3'], ['3', 'Reduce by 1/2']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    let base = baseShape(rng);
    const k = difficulty === 1 ? 2 : difficulty === 2 ? rng.pick([1.5, 2.5]) : 0.5;
    if (difficulty === 3) base = base.map(([x, y]) => [x * 2, y * 2]);
    const scaled = (f: number, g = f) => base.map(([x, y]) => [1 + (x - 1) * f, 1 + (y - 1) * g] as Pt);
    return {
      body: `Which grid shows the shape scaled by a factor of ${math(dec(k))}?\n\n${gridShape(base, 3.4)}`,
      answer: gridShape(scaled(k)),
      distractors: [gridShape(scaled(k, 1)), gridShape(base.map(([x, y]) => [x + (k > 1 ? 3 : -1), y + (k > 1 ? 3 : -1)] as Pt)), gridShape(scaled(k + (k > 1 ? 1 : 0.25)))],
      solution: `Multiply every length by ${dec(k)}: both the horizontal and vertical sides change by the same factor, so the image is similar to the original.`,
    };
  },
});

// ── Symmetry ──────────────────────────────────────────────────────────────

const regular = (n: number, r = 4.2, start = 90): Pt[] => Array.from({ length: n }, (_, i) => [6 + r * Math.cos(rad(start + (360 * i) / n)), 6 + r * Math.sin(rad(start + (360 * i) / n))] as Pt);
const SHAPES: Array<{ name: string; pts: Pt[]; lines: number; order: number }> = [
  { name: 'equilateral triangle', pts: regular(3), lines: 3, order: 3 },
  { name: 'square', pts: regular(4, 4.5, 45), lines: 4, order: 4 },
  { name: 'regular pentagon', pts: regular(5), lines: 5, order: 5 },
  { name: 'regular hexagon', pts: regular(6), lines: 6, order: 6 },
  { name: 'rectangle', pts: [[2, 3.5], [10, 3.5], [10, 8.5], [2, 8.5]], lines: 2, order: 2 },
  { name: 'rhombus', pts: [[6, 1.5], [9, 6], [6, 10.5], [3, 6]], lines: 2, order: 2 },
  { name: 'isosceles triangle', pts: [[3, 2], [9, 2], [6, 10]], lines: 1, order: 1 },
  { name: 'kite', pts: [[6, 1.5], [9, 7], [6, 10], [3, 7]], lines: 1, order: 1 },
  { name: 'parallelogram', pts: [[2, 3], [8, 3], [10, 9], [4, 9]], lines: 0, order: 2 },
  { name: 'scalene triangle', pts: [[2, 2], [10, 3], [4, 9]], lines: 0, order: 1 },
];

export const symLines = mb10f('10f-sym-lines', {
  points: 1,
  levels: { 1: 'Triangles and quadrilaterals', 2: 'Regular polygons', 3: 'Any shape' },
  options: [
    radioOption('form', 'Figure', [['1', 'Triangles and quadrilaterals'], ['2', 'Regular polygons'], ['3', 'Any shape']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const pool = difficulty === 1 ? SHAPES.filter((s) => s.pts.length <= 4) : difficulty === 2 ? SHAPES.slice(0, 4) : SHAPES;
    const s = rng.pick(pool);
    return {
      body: `How many lines of symmetry does the shape have?\n\n${graphTypst({ xMin: 0, xMax: 12, yMin: 0, yMax: 12, width: 3.6, height: 3.6, grid: false, numbers: false, axes: false, curves: [{ points: [...s.pts, s.pts[0]] }] })}`,
      answer: String(s.lines),
      distractors: distinct(String(s.lines), ['0', '1', '2', '3', '4', '5', '6'].filter((n) => Math.abs(Number(n) - s.lines) <= 2)).slice(0, 3),
      solution: `The shape is a${/^[aeiou]/.test(s.name) ? 'n' : ''} ${s.name}, which has ${s.lines} line${s.lines === 1 ? '' : 's'} of symmetry${s.lines ? ': folding along each gives matching halves' : ''}.`,
    };
  },
});

export const symRotation = mb10f('10f-sym-rotation', {
  points: 1,
  levels: { 1: 'Order of rotation', 2: 'Angle of rotation', 3: 'Order and angle' },
  options: [
    radioOption('form', 'Figure', [['1', 'Order of rotation'], ['2', 'Angle of rotation'], ['3', 'Order and angle']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const s = rng.pick(SHAPES);
    const angle = s.order === 1 ? 'none' : `${360 / s.order}°`;
    const pic = graphTypst({ xMin: 0, xMax: 12, yMin: 0, yMax: 12, width: 3.6, height: 3.6, grid: false, numbers: false, axes: false, curves: [{ points: [...s.pts, s.pts[0]] }] });
    if (difficulty === 1) {
      return {
        body: `What is the order of rotation symmetry of the shape?\n\n${pic}`,
        answer: String(s.order),
        distractors: distinct(String(s.order), ['1', '2', '3', '4', '5', '6'].filter((n) => Math.abs(Number(n) - s.order) <= 2)).slice(0, 3),
        solution: `The ${s.name} matches itself ${s.order} time${s.order > 1 ? 's' : ''} in a full turn.`,
      };
    }
    const angles = ['none (order 1)', '180°', '120°', '90°', '72°', '60°'];
    const ans = s.order === 1 ? angles[0] : `${360 / s.order}°`;
    if (difficulty === 2) {
      return {
        body: `What is the smallest angle of rotation symmetry of the shape?\n\n${pic}`,
        answer: ans,
        distractors: distinct(ans, angles).slice(0, 3),
        solution: s.order === 1 ? `The ${s.name} has no rotation symmetry (order 1).` : `Order ${s.order}: ${math(`360° div ${s.order} = ${360 / s.order}°`)}.`,
      };
    }
    const answer = s.order === 1 ? 'Order 1: no rotation symmetry' : `Order ${s.order}, angle ${angle}`;
    return {
      body: `State the order and the angle of rotation symmetry of the shape.\n\n${pic}`,
      answer,
      distractors: distinct(answer, [`Order ${s.lines || 2}, angle ${360 / (s.lines || 2)}°`, `Order ${s.order + 1}, angle ${360 / (s.order + 1)}°`, `Order ${s.order}, angle ${s.order === 1 ? 360 : 180 / s.order}°`, 'Order 1: no rotation symmetry']),
      solution: s.order === 1 ? `Only a full turn matches the ${s.name}.` : `The ${s.name} matches itself ${s.order} times in a turn, every ${angle}.`,
    };
  },
});

function halfShape(rng: Rng): Pt[] {
  return rng.pick([
    [[6, 1], [3, 1], [3, 5], [1, 5], [1, 7], [4, 11], [6, 11]],
    [[6, 2], [2, 2], [2, 6], [4, 8], [4, 10], [6, 10]],
    [[6, 1], [4, 1], [4, 4], [1, 6], [4, 8], [4, 11], [6, 11]],
  ] as Pt[][]);
}

export const symComplete = mb10f('10f-sym-complete', {
  levels: { 1: 'Vertical line of symmetry', 2: 'Horizontal line of symmetry', 3: 'Either' },
  options: [
    radioOption('form', 'Figure', [['1', 'Vertical line of symmetry'], ['2', 'Horizontal line of symmetry'], ['3', 'Either']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const vertical = difficulty === 1 || (difficulty === 3 && rng.next() < 0.5);
    let half = halfShape(rng);
    if (!vertical) half = half.map(([x, y]) => [y, x] as Pt);
    const mirror = (p: Pt[]): Pt[] => p.map(([x, y]) => (vertical ? [12 - x, y] : [x, 12 - y]) as Pt).reverse();
    const shiftCopy = (p: Pt[]): Pt[] => p.map(([x, y]) => (vertical ? [x + 6, y] : [x, y + 6]) as Pt).reverse();
    const flipOther = (p: Pt[]): Pt[] => p.map(([x, y]) => (vertical ? [12 - x, 12 - y] : [12 - x, 12 - y]) as Pt).reverse();
    const axis: Pt[] = vertical ? [[6, 0], [6, 12]] : [[0, 6], [12, 6]];
    const draw = (other: Pt[] | null, size: number) => graphTypst({ xMin: 0, xMax: 12, yMin: 0, yMax: 12, width: size, height: size, numbers: false, axes: false, curves: [{ points: other ? [...half, ...other] : half }, { points: axis, dashed: true }] });
    return {
      body: `Complete the shape using the dashed line of symmetry. Which is correct?\n\n${draw(null, 3.8)}`,
      answer: draw(mirror(half), 3.4),
      distractors: [draw(shiftCopy(half), 3.4), draw(flipOther(half), 3.4), draw(mirror(half).map(([x, y]) => (vertical ? [x, Math.min(12, y + 1)] : [Math.min(12, x + 1), y]) as Pt), 3.4)],
      solution: `Each point is reflected across the ${vertical ? 'vertical' : 'horizontal'} line: it lands the same distance away on the other side.`,
    };
  },
});

export const symRotate = mb10f('10f-sym-rotate', {
  levels: { 1: '180° about a vertex', 2: '90° clockwise about a vertex', 3: '90° counterclockwise about a vertex' },
  options: [
    radioOption('form', 'Rotation', [['1', '180° about a vertex'], ['2', '90° clockwise about a vertex'], ['3', '90° counterclockwise about a vertex']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const shape: Pt[] = rng.pick([[[6, 6], [9, 6], [9, 8], [6, 7]], [[6, 6], [10, 6], [8, 9]], [[6, 6], [8, 6], [8, 7], [10, 7], [10, 9], [6, 9]]] as Pt[][]);
    const [cx, cy] = shape[0];
    const rot = (deg: number) => shape.map(([x, y]) => {
      const dx = x - cx, dy = y - cy, c = Math.round(Math.cos(rad(deg))), s = Math.round(Math.sin(rad(deg)));
      return [cx + dx * c - dy * s, cy + dx * s + dy * c] as Pt;
    });
    const angle = difficulty === 1 ? 180 : difficulty === 2 ? -90 : 90;
    const draw = (img: Pt[], size: number) => graphTypst({ xMin: 0, xMax: 12, yMin: 0, yMax: 12, width: size, height: size, numbers: false, axes: false, curves: [{ points: [...shape, shape[0]], dashed: true }, { points: [...img, img[0]] }], dots: [{ x: cx, y: cy }] });
    const name = difficulty === 1 ? '180°' : difficulty === 2 ? '90° clockwise' : '90° counterclockwise';
    const reflect = shape.map(([x, y]) => [2 * cx - x, y] as Pt);
    return {
      body: `The shape is rotated ${name} about the marked vertex. Which diagram shows the image (solid) and the original (dashed)?`,
      answer: draw(rot(angle), 3.4),
      distractors: [draw(rot(angle === 180 ? 90 : -angle), 3.4), draw(reflect, 3.4), draw(rot(angle === 180 ? -90 : 180), 3.4)],
      solution: `Each point turns ${name} around the vertex, keeping its distance from it. The vertex itself stays fixed.`,
    };
  },
});

export const GEOMETRY_10F = [
  circChord, circCentralInscribed, circSameArc, circSemicircle, circTangent, circProperty,
  saComposite, saOverlap, saProblem, simCheck, simMissingSide, simProblem, scaleFactor, scaleActual, scaleDraw,
  symLines, symRotation, symComplete, symRotate,
];
