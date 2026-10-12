// Precalculus: parametric equations, polar coordinates, complex numbers in
// polar form, and vectors in the plane and in space, after Kuta's
// ParametricEquations, ParametricWordProblems, PolarCoordinates,
// PolarGraphing, PolarEquations, PolarConics, PolarComplexNumbers*
// (convert, multiply, divide, power, root), VectorBasics*, VectorDiagram*,
// VectorOperations*, VectorDot*, Vector3DBasics/Operations/Cross.
import type { Rng } from '../../rng.ts';
import { Q, Surds } from '../../exact.ts';
import { poly } from '../../format.ts';
import { manyOption, optList, optOne, radioOption } from '../../options.ts';
import { us, math, task, wrong, fixed } from './common.ts';
import { piText } from './algebra2-advanced.ts';

const root = (n: number) => new Surds([[1, n]]).typst();
const vec = (...cs: Array<number | string>) => `angle.l ${cs.join(', ')} angle.r`;
/** `y = mx + k` with tidy coefficients. */
const line = (m: Q, k: Q) => `y = ${m.eq(0) ? '' : m.eq(1) ? 'x' : m.eq(-1) ? '-x' : m.isInt ? `${m.typst()}x` : `${m.typst()} x`}${k.eq(0) ? (m.eq(0) ? '0' : '') : m.eq(0) ? k.typst() : ` ${k.sign < 0 ? '-' : '+'} ${k.abs().typst()}`}`;

// ── Parametric equations ─────────────────────────────────────────────────────

export const pcParametric = us('pc-parametric', {
  levels: { 1: 'Lines', 2: 'Parabolas', 3: 'Circles and ellipses' },
  generate(rng, level) {
    if (level === 1) {
      const a = rng.nonZero(-4, 4), b = rng.int(-6, 6), c = rng.nonZero(-5, 5), d = rng.int(-6, 6);
      // t = (x − b)/a, y = c t + d  →  y = (c/a)x − cb/a + d
      const m = new Q(c, a), k = new Q(d).sub(m.mul(b));
      const answer = line(m, k);
      return task('Eliminate the parameter.', 'Eliminate the parameter:', `x = ${poly([a, b], 't')}, y = ${poly([c, d], 't')}`, {
        answer: math(answer),
        distractors: wrong(math(answer), [line(new Q(a, c), new Q(0)), line(m, k.neg()), line(new Q(c), new Q(d))].map(math)),
        solution: `Solve ${math(`x = ${poly([a, b], 't')}`)} for ${math('t')}, ${math(`t = (${poly([1, -b])})/${a}`.replace('/1', '').replace('/(-1)', ''))}, and substitute: ${math(answer)}.`,
      }, '');
    }
    if (level === 2) {
      const a = rng.nonZero(-3, 3), b = rng.int(-5, 5), c = rng.nonZero(-3, 3), d = rng.int(-5, 5);
      // x = t + b, y = a t² + c t + d  →  y = a(x − b)² + c(x − b) + d
      const coefs = [a, -2 * a * b + c, a * b * b - c * b + d];
      const answer = `y = ${poly(coefs)}`;
      return task('Eliminate the parameter.', 'Eliminate the parameter:', `x = ${poly([1, b], 't')}, y = ${poly([a, c, d], 't')}`, {
        answer: math(answer),
        distractors: wrong(math(answer), [`y = ${poly([a, c, d])}`, `y = ${poly([a, 2 * a * b + c, a * b * b + c * b + d])}`, `y = ${poly([a, c - b, d])}`].map(math)),
        solution: `${math(`t = ${poly([1, -b])}`)}; substitute and expand: ${math(answer)}.`,
      }, '');
    }
    const h = rng.int(-4, 4), k = rng.int(-4, 4), A = rng.int(2, 6), B = rng.next() < 0.5 ? A : rng.int(2, 6);
    const xt = `${h ? `${h} + ` : ''}${A}cos t`, yt = `${k ? `${k} + ` : ''}${B}sin t`;
    const sq = (v: string, c: number) => (c === 0 ? `${v}^2` : `(${v} ${c < 0 ? '+' : '-'} ${Math.abs(c)})^2`);
    const answer = A === B ? `${sq('x', h)} + ${sq('y', k)} = ${A * A}` : `${sq('x', h)}/${A * A} + ${sq('y', k)}/${B * B} = 1`;
    return task('Eliminate the parameter.', 'Eliminate the parameter:', `x = ${xt}, y = ${yt}`, {
      answer: math(answer),
      distractors: wrong(math(answer), [A === B ? `${sq('x', -h)} + ${sq('y', -k)} = ${A * A}` : `${sq('x', h)}/${B * B} + ${sq('y', k)}/${A * A} = 1`, A === B ? `${sq('x', h)} + ${sq('y', k)} = ${A}` : `${sq('x', h)}/${A} + ${sq('y', k)}/${B} = 1`, `${sq('x', h)} - ${sq('y', k)} = ${A * B}`].map(math)),
      solution: `${math(`cos t = (x ${h ? `${h < 0 ? '+' : '-'} ${Math.abs(h)}` : ''})/${A}`)} and ${math(`sin t = (y ${k ? `${k < 0 ? '+' : '-'} ${Math.abs(k)}` : ''})/${B}`)}; use ${math('cos^2 t + sin^2 t = 1')}: ${math(answer)}.`,
    }, '');
  },
});

export const pcProjectile = us('pc-projectile', {
  points: 2,
  levels: { 1: 'Horizontal distance at a time', 2: 'Maximum height', 3: 'Time in the air and range' },
  options: [radioOption('ask', 'Find', [['position', 'Position at a time'], ['height', 'Maximum height'], ['range', 'Time of flight and range']], ['position', 'height', 'range'])],
  generate(rng, level, o) {
    const ask = optOne(o, 'ask', ['position', 'height', 'range'][level - 1]);
    const v = rng.int(10, 40), deg = rng.pick([20, 25, 30, 35, 40, 45, 50, 55, 60]), h0 = rng.pick([0, 0, 1, 1.5, 2]);
    const r = (deg * Math.PI) / 180, vx = v * Math.cos(r), vy = v * Math.sin(r);
    const setup = `A ball is launched at ${v} m/s at an angle of ${math(`${deg}°`)} above the horizontal${h0 ? `, from a height of ${h0} m` : ' from the ground'}. Use ${math(`x = ${v} cos ${deg}° dot t`)} and ${math(`y = ${h0 ? `${h0} + ` : ''}${v} sin ${deg}° dot t - 4.9t^2`)}.`;
    const m = (x: number, unit: string) => `${math(fixed(x, 1))} ${unit}`;
    if (ask === 'position') {
      const t = rng.int(1, 3) / (rng.next() < 0.5 ? 2 : 1);
      const x = vx * t, y = h0 + vy * t - 4.9 * t * t;
      const answer = `(${m(x, 'm')}, ${m(y, 'm')})`;
      return {
        body: `${setup} Find the position of the ball after ${t} s.`,
        answer, distractors: wrong(answer, [`(${m(vy * t, 'm')}, ${m(h0 + vx * t - 4.9 * t * t, 'm')})`, `(${m(x, 'm')}, ${m(h0 + vy * t, 'm')})`, `(${m(v * t, 'm')}, ${m(y, 'm')})`]),
        solution: `Substitute ${math(`t = ${t}`)}: ${math(`x approx ${fixed(x, 1)}`)} and ${math(`y approx ${fixed(y, 1)}`)}.`,
      };
    }
    const tTop = vy / 9.8, top = h0 + vy * tTop - 4.9 * tTop * tTop;
    if (ask === 'height') {
      const answer = m(top, 'm');
      return {
        body: `${setup} Find the maximum height of the ball.`,
        answer, distractors: wrong(answer, [m((v * v) / 19.6, 'm'), m(h0 + vy * tTop, 'm'), m(top * 2, 'm')]),
        solution: `The vertex of ${math('y(t)')} is at ${math(`t = (${fixed(vy, 2)})/9.8 approx ${fixed(tTop, 2)}`)} s, where ${math(`y approx ${fixed(top, 1)}`)} m.`,
      };
    }
    const tLand = (vy + Math.sqrt(vy * vy + 19.6 * h0)) / 9.8, range = vx * tLand;
    const answer = `${m(tLand, 's')}; ${m(range, 'm')}`;
    return {
      body: `${setup} How long is the ball in the air, and how far does it travel horizontally?`,
      answer, distractors: wrong(answer, [`${m(tTop, 's')}; ${m(vx * tTop, 'm')}`, `${m(tLand, 's')}; ${m(v * tLand, 'm')}`, `${m(2 * vy / 4.9, 's')}; ${m(vx * 2 * vy / 4.9, 'm')}`]),
      solution: `Solve ${math('y(t) = 0')} for the positive root: ${math(`t approx ${fixed(tLand, 1)}`)} s. Then ${math(`x approx ${fixed(range, 1)}`)} m.`,
    };
  },
});

// ── Polar coordinates ────────────────────────────────────────────────────────

/** Exact cos and sin of a special angle, as Typst. */
const SPECIAL: Record<number, [string, string]> = {
  0: ['1', '0'], 30: ['sqrt(3)/2', '1/2'], 45: ['sqrt(2)/2', 'sqrt(2)/2'], 60: ['1/2', 'sqrt(3)/2'], 90: ['0', '1'],
  120: ['-1/2', 'sqrt(3)/2'], 135: ['-sqrt(2)/2', 'sqrt(2)/2'], 150: ['-sqrt(3)/2', '1/2'], 180: ['-1', '0'],
  210: ['-sqrt(3)/2', '-1/2'], 225: ['-sqrt(2)/2', '-sqrt(2)/2'], 240: ['-1/2', '-sqrt(3)/2'], 270: ['0', '-1'],
  300: ['1/2', '-sqrt(3)/2'], 315: ['sqrt(2)/2', '-sqrt(2)/2'], 330: ['sqrt(3)/2', '-1/2'],
};
/** r times an exact trig value, simplified: 4·(√3/2) → 2√3, 6·(−1/2) → −3. */
function scale(r: number, value: string): string {
  const neg = value.startsWith('-');
  const v = value.replace(/^-/, '');
  const m = /^(?:sqrt\((\d)\))?(?:\/(\d))?$|^(\d)(?:\/(\d))?$/.exec(v);
  if (!m) return value;
  const rad = m[1] ? Number(m[1]) : 1;
  const den = Number(m[2] ?? m[4] ?? 1);
  const num = m[3] ? Number(m[3]) : 1;
  const q = new Q(r * num * (neg ? -1 : 1), den);
  if (rad === 1) return q.typst();
  return new Surds([[q, rad]]).typst();
}

export const pcPolarPoints = us('pc-polar-points', {
  levels: { 1: 'Polar to rectangular', 2: 'Rectangular to polar', 3: 'Either, with negative r' },
  options: [radioOption('unit', 'Angles in', [['rad', 'Radians'], ['deg', 'Degrees']], ['rad', 'rad', 'rad'])],
  generate(rng, level, o) {
    const rad = optOne(o, 'unit', 'rad') === 'rad';
    const ang = (d: number) => (rad ? piText(new Q(d, 180)) : `${d}°`);
    const d = rng.pick(Object.keys(SPECIAL).map(Number).filter((x) => x % 90 !== 0 || rng.next() < 0.2));
    const r = rng.int(1, 8) * (level === 3 && rng.next() < 0.5 ? -1 : 1);
    const toRect = level === 1 || (level === 3 && rng.next() < 0.5);
    const [c, s] = SPECIAL[d];
    const x = scale(r, c), y = scale(r, s);
    if (toRect) {
      const answer = `(${x}, ${y})`;
      return task('Convert each point to rectangular coordinates.', 'Convert to rectangular coordinates:', `(${r}, ${ang(d)})`, {
        answer: math(answer),
        distractors: wrong(math(answer), [`(${y}, ${x})`, `(${scale(-r, c)}, ${y})`, `(${x}, ${scale(-r, s)})`, `(${r}, ${y})`].map(math)),
        solution: `${math(`x = r cos theta = ${x}`)} and ${math(`y = r sin theta = ${y}`)}.`,
      }, '');
    }
    const R = Math.abs(r);
    const answer = `(${R}, ${ang(d)})`;
    return task(`Convert each point to polar coordinates with ${math('r > 0')} and ${math(rad ? '0 <= theta < 2pi' : '0° <= theta < 360°')}.`, 'Convert to polar coordinates:', `(${scale(R, c)}, ${scale(R, s)})`, {
      answer: math(answer),
      distractors: wrong(math(answer), [`(${R}, ${ang((d + 180) % 360)})`, `(${R}, ${ang((360 - d) % 360)})`, `(${R * R}, ${ang(d)})`, `(${R}, ${ang((d + 90) % 360)})`].map(math)),
      solution: `${math(`r = sqrt(x^2 + y^2) = ${R}`)}, and the point is in the ${['first', 'second', 'third', 'fourth'][Math.floor((d % 360) / 90.0001)] ?? 'first'} quadrant (or on an axis) with ${math(`tan theta = y/x`)}: ${math(`theta = ${ang(d)}`)}.`,
    }, '');
  },
});

export const pcPolarGraphs = us('pc-polar-graphs', {
  levels: { 1: 'Circles and roses', 2: 'Limaçons and cardioids', 3: 'Any, including lemniscates' },
  generate(rng, level) {
    const a = rng.int(1, 6);
    const fn = rng.pick(['cos', 'sin']);
    const kinds = level === 1 ? ['circle', 'rose'] : level === 2 ? ['limacon'] : ['circle', 'rose', 'limacon', 'lemniscate'];
    const kind = rng.pick(kinds);
    let eq: string, answer: string;
    if (kind === 'circle') { const centred = rng.next() < 0.4; eq = centred ? `r = ${a}` : `r = ${a * 2} ${fn} theta`; answer = `"circle"`; }
    else if (kind === 'rose') { const n = rng.int(2, 5); eq = `r = ${a} ${fn} ${n} theta`; answer = `"rose with ${n % 2 ? n : 2 * n} petals"`; }
    else if (kind === 'lemniscate') { eq = `r^2 = ${a * a} ${fn} 2theta`; answer = '"lemniscate"'; }
    else {
      const b = rng.int(1, 6), c = rng.pick([b, b + rng.int(1, 3), Math.max(1, b - rng.int(1, 2)), 2 * b + 1]);
      eq = `r = ${c} ${rng.next() < 0.5 ? '+' : '-'} ${b === 1 ? '' : `${b} `}${fn} theta`;
      answer = c === b ? '"cardioid"' : c < b ? '"limaçon with an inner loop"' : c < 2 * b ? '"dimpled limaçon"' : '"convex limaçon"';
    }
    const pool = ['"circle"', '"cardioid"', '"limaçon with an inner loop"', '"dimpled limaçon"', '"convex limaçon"', '"lemniscate"', '"rose with 3 petals"', '"rose with 4 petals"', '"rose with 8 petals"', '"rose with 5 petals"'];
    return task('Identify the graph of each polar equation.', 'Identify the graph of', eq, {
      answer: math(answer),
      distractors: wrong(math(answer), rng.shuffle(pool).slice(0, 5).map(math)).slice(0, 4),
      solution: kind === 'rose' ? `${math(`r = a ${fn} n theta`)} is a rose with ${math('n')} petals when ${math('n')} is odd and ${math('2n')} petals when ${math('n')} is even.`
        : kind === 'limacon' ? `${math(`r = a plus.minus b ${fn} theta`)}: compare ${math('a')} and ${math('b')} (equal: cardioid; ${math('a < b')}: inner loop; ${math('b < a < 2b')}: dimpled; ${math('a >= 2b')}: convex).`
          : kind === 'lemniscate' ? `${math(`r^2 = a^2 ${fn} 2theta`)} is a lemniscate.` : `${math('r = a')} and ${math(`r = a ${fn} theta`)} are circles.`,
    });
  },
});

export const pcPolarEquations = us('pc-polar-equations', {
  levels: { 1: 'Rectangular to polar', 2: 'Polar to rectangular', 3: 'Either' },
  generate(rng, level) {
    const a = rng.int(1, 8);
    const pairs: Array<[string, string, string[]]> = [
      [`x^2 + y^2 = ${a * a}`, `r = ${a}`, [`r = ${a * a}`, `theta = ${a}`, `r = ${a} cos theta`]],
      [`y = ${a}`, `r = ${a} csc theta`, [`r = ${a} sec theta`, `r = ${a} sin theta`, `r = ${a}`]],
      [`x = ${a}`, `r = ${a} sec theta`, [`r = ${a} csc theta`, `r = ${a} cos theta`, `theta = ${a}`]],
      [`x^2 + y^2 = ${2 * a}x`, `r = ${2 * a} cos theta`, [`r = ${2 * a} sin theta`, `r = ${a} cos theta`, `r = ${2 * a}`]],
      [`x^2 + y^2 = ${2 * a}y`, `r = ${2 * a} sin theta`, [`r = ${2 * a} cos theta`, `r = ${a} sin theta`, `r = ${2 * a}`]],
      ['y = x', 'theta = pi/4', ['theta = pi/2', 'r = 1', 'theta = pi']],
      [`y = -x`, 'theta = (3pi)/4', ['theta = pi/4', 'theta = -pi', 'r = -1']],
    ];
    const [rect, polar, wrongPolar] = rng.pick(pairs);
    const toPolar = level === 1 || (level === 3 && rng.next() < 0.5);
    if (toPolar) {
      return task('Convert each equation to polar form.', 'Convert to polar form:', rect, {
        answer: math(polar), distractors: wrong(math(polar), wrongPolar.map(math)),
        solution: `Substitute ${math('x = r cos theta')}, ${math('y = r sin theta')}, and ${math('x^2 + y^2 = r^2')}, then simplify: ${math(polar)}.`,
      }, '');
    }
    const others = pairs.map(([r]) => r).filter((r) => r !== rect);
    return task('Convert each equation to rectangular form.', 'Convert to rectangular form:', polar, {
      answer: math(rect), distractors: wrong(math(rect), rng.shuffle(others).slice(0, 3).map(math)),
      solution: `Multiply or rewrite so that ${math('r cos theta')}, ${math('r sin theta')}, and ${math('r^2')} appear, then replace them with ${math('x')}, ${math('y')}, and ${math('x^2 + y^2')}: ${math(rect)}.`,
    }, '');
  },
});

export const pcPolarConics = us('pc-polar-conics', {
  levels: { 1: 'Eccentricity and type', 2: 'Type and directrix', 3: 'Write the equation from e and the directrix' },
  generate(rng, level) {
    const e = rng.pick([new Q(1, 2), new Q(2, 3), new Q(1), new Q(2), new Q(3), new Q(3, 2), new Q(1, 3)]);
    const d = rng.int(1, 6);
    const fn = rng.pick(['cos', 'sin']), sign = rng.pick(['+', '-']);
    const c = e.d * rng.int(1, 2), k = e.mul(c); // r = (e d c)/(c ± (e c) fn θ)
    const num = e.mul(d).mul(c);
    const eq = `r = ${num.typst()}/(${c} ${sign} ${k.eq(1) ? '' : k.typst()} ${fn} theta)`.replace(' 1 ', ' ').replace(/\(1 /, '(1 ');
    const type = e.eq(1) ? 'parabola' : e.value < 1 ? 'ellipse' : 'hyperbola';
    const directrix = `${fn === 'cos' ? 'x' : 'y'} = ${sign === '+' ? '' : '-'}${d}`;
    if (level === 3) {
      const std = `r = ${e.mul(d).typst()}/(1 ${sign} ${e.eq(1) ? '' : e.typst()} ${fn} theta)`;
      return {
        body: `Write a polar equation of the conic with a focus at the pole, eccentricity ${math(`e = ${e.typst()}`)}, and directrix ${math(directrix)}.`,
        answer: math(std),
        distractors: wrong(math(std), [`r = ${e.mul(d).typst()}/(1 ${sign === '+' ? '-' : '+'} ${e.eq(1) ? '' : e.typst()} ${fn} theta)`, `r = ${e.mul(d).typst()}/(1 ${sign} ${e.eq(1) ? '' : e.typst()} ${fn === 'cos' ? 'sin' : 'cos'} theta)`, `r = ${d}/(1 ${sign} ${e.eq(1) ? '' : e.typst()} ${fn} theta)`].map(math)),
        solution: `Use ${math(`r = (e d)/(1 ${sign} e ${fn} theta)`)} with ${math(`e = ${e.typst()}`)} and ${math(`d = ${d}`)}: ${math(std)}.`,
      };
    }
    const answer = level === 1 ? `e = ${e.typst()}", " "${type}"` : `"${type}; directrix" ${directrix}`;
    const altType = ['ellipse', 'parabola', 'hyperbola'].filter((t) => t !== type);
    return task(level === 1 ? 'Find the eccentricity and identify each conic.' : 'Identify each conic and find its directrix.', level === 1 ? 'Find the eccentricity and type of' : 'Identify the conic and directrix of', eq, {
      answer: math(answer),
      distractors: wrong(math(answer), (level === 1 ? [`e = ${e.typst()}", " "${altType[0]}"`, `e = ${k.typst()}", " "${type}"`, `e = ${new Q(1).div(e).typst()}", " "${altType[1]}"`] : [`"${altType[0]}; directrix" ${directrix}`, `"${type}; directrix" ${fn === 'cos' ? 'y' : 'x'} = ${sign === '+' ? '' : '-'}${d}`, `"${type}; directrix" ${fn === 'cos' ? 'x' : 'y'} = ${sign === '+' ? '-' : ''}${d}`]).map(math)),
      solution: `Divide the numerator and denominator by ${c} to get ${math(`r = ${e.mul(d).typst()}/(1 ${sign} ${e.eq(1) ? '' : e.typst()} ${fn} theta)`)}. So ${math(`e = ${e.typst()}`)} (${type === 'ellipse' ? 'less than 1: an ellipse' : type === 'parabola' ? 'equal to 1: a parabola' : 'greater than 1: a hyperbola'}) and ${math(`e d = ${e.mul(d).typst()}`)}, so ${math(`d = ${d}`)}: the directrix is ${math(directrix)}.`,
    });
  },
});

// ── Complex numbers in polar form ────────────────────────────────────────────

const cis = (r: number | string, d: number, rad = true) => `${r === 1 || r === '1' ? '' : `${r} `}(cos ${rad ? piText(new Q(d, 180)) : `${d}°`} + i sin ${rad ? piText(new Q(d, 180)) : `${d}°`})`;

export const pcComplexPolar = us('pc-complex-polar', {
  levels: { 1: 'Rectangular to polar', 2: 'Multiply and divide', 3: "Powers (De Moivre's Theorem)" },
  options: [radioOption('form', 'Questions', [['convert', 'Convert to polar form'], ['muldiv', 'Multiply or divide'], ['power', 'Powers']], ['convert', 'muldiv', 'power'])],
  generate(rng, level, o) {
    const form = optOne(o, 'form', ['convert', 'muldiv', 'power'][level - 1]);
    const norm = (d: number) => ((d % 360) + 360) % 360;
    if (form === 'convert') {
      const d = rng.pick([30, 45, 60, 120, 135, 150, 210, 225, 240, 300, 315, 330]);
      const r = rng.int(1, 6) * 2;
      const [c, s] = SPECIAL[d];
      const z = `${scale(r, c)} ${scale(r, s).startsWith('-') ? '-' : '+'} ${scale(r, s).replace(/^-/, '') === '1' ? '' : scale(r, s).replace(/^-/, '')}i`.replace(/ (\d+)\/(\d+)i$/, ' $1/$2 i');
      const answer = cis(r, d);
      return task('Write each complex number in polar form.', 'Write in polar form:', z, {
        answer: math(answer),
        distractors: wrong(math(answer), [cis(r, norm(180 - d)), cis(r * r, d), cis(r, norm(-d)), cis(r / 2, d)].map(math)),
        solution: `${math(`r = sqrt(a^2 + b^2) = ${r}`)} and ${math(`theta = ${piText(new Q(d, 180))}`)} from the quadrant of the point: ${math(answer)}.`,
      }, '');
    }
    const r1 = rng.int(1, 6), r2 = rng.int(1, 6), d1 = rng.pick([30, 45, 60, 90, 120, 135, 150]), d2 = rng.pick([30, 45, 60, 90, 120]);
    if (form === 'muldiv') {
      const mult = rng.next() < 0.5;
      const r = mult ? String(r1 * r2) : new Q(r1, r2).typst();
      const d = norm(mult ? d1 + d2 : d1 - d2);
      const answer = cis(r, d);
      return task(mult ? 'Find each product in polar form.' : 'Find each quotient in polar form.', mult ? 'Multiply:' : 'Divide:', mult ? `${cis(r1, d1)} dot ${cis(r2, d2)}` : `(${cis(r1, d1)})/(${cis(r2, d2)})`, {
        answer: math(answer),
        distractors: wrong(math(answer), [cis(mult ? r1 + r2 : new Q(r2, r1).typst(), d), cis(r, norm(mult ? d1 * d2 / 30 : d2 - d1)), cis(r, norm(mult ? d1 - d2 : d1 + d2))].map(math)),
        solution: `${mult ? 'Multiply the moduli and add the arguments' : 'Divide the moduli and subtract the arguments'}: ${math(answer)}.`,
      }, '');
    }
    const n = rng.int(2, 6), r = rng.int(1, 3);
    const d = norm(d1 * n);
    const answer = cis(r ** n, d);
    return task("Use De Moivre's Theorem to find each power.", 'Find', `(${cis(r, d1)})^${n}`, {
      answer: math(answer),
      distractors: wrong(math(answer), [cis(r * n, d), cis(r ** n, d1), cis(r ** n, norm(d + 180))].map(math)),
      solution: `${math(`(r(cos theta + i sin theta))^n = r^n (cos n theta + i sin n theta)`)}: ${math(answer)}.`,
    }, '');
  },
});

export const pcComplexRoots = us('pc-complex-roots', {
  points: 2,
  levels: { 1: 'Square roots', 2: 'Cube roots', 3: 'Fourth roots' },
  generate(rng, level) {
    const n = level + 1;
    const base = rng.pick([0, 60, 90, 120, 180, 240, 270]);
    const mod = rng.pick(n === 2 ? [4, 9, 16] : n === 3 ? [8, 27, 1] : [16, 81, 1]);
    const rootMod = Math.round(mod ** (1 / n));
    // Arguments in degrees, possibly fractional (e.g. 22.5°), shown as multiples of π.
    const ang = (d: number) => piText(new Q(Math.round(d * 2), 360));
    const term = (r: number, d: number) => `${r === 1 ? '' : `${r} `}(cos ${ang(d)} + i sin ${ang(d)})`;
    const roots = (r: number, args: number[]) => args.map((d) => term(r, d)).join(', ');
    const args = Array.from({ length: n }, (_, k) => (base + 360 * k) / n);
    const answer = roots(rootMod, args);
    return {
      body: `Find the ${['', '', 'square', 'cube', 'fourth'][n]} roots of ${math(cis(mod, base))}.`,
      answer: math(answer),
      // The modulus not rooted, every root at θ/n, or the 2πk/n steps left out of the argument.
      distractors: wrong(math(answer), [roots(mod, args), roots(rootMod, args.map((_, k) => (base + 180 * k) / n)), roots(rootMod, args.map((_, k) => base + 360 * k / n))].map(math)),
      solution: `The ${n} roots have modulus ${math(`root(${n}, ${mod}) = ${rootMod}`)} and arguments ${math(`(theta + 2pi k)/${n}`)} for ${math(`k = 0, ..., ${n - 1}`)}: ${math(answer)}.`,
    };
  },
});

// ── Vectors in the plane ─────────────────────────────────────────────────────

const deg = (rad: number) => ((rad * 180) / Math.PI + 360) % 360;

export const pcVectorBasics = us('pc-vector-basics', {
  levels: { 1: 'Component form from two points', 2: 'Magnitude and direction', 3: 'Components from magnitude and direction' },
  generate(rng, level) {
    const P = [rng.int(-8, 8), rng.int(-8, 8)], R = [rng.int(-8, 8), rng.int(-8, 8)];
    if (R[0] === P[0] && R[1] === P[1]) R[0]++;
    const v = [R[0] - P[0], R[1] - P[1]];
    if (level === 1) {
      const answer = vec(v[0], v[1]);
      return {
        body: `Find the component form of the vector with initial point ${math(`(${P.join(', ')})`)} and terminal point ${math(`(${R.join(', ')})`)}.`,
        answer: math(answer),
        distractors: wrong(math(answer), [vec(-v[0], -v[1]), vec(P[0] + R[0], P[1] + R[1]), vec(v[1], v[0])].map(math)),
        solution: `Subtract initial from terminal: ${math(`angle.l ${R[0]} - ${P[0] < 0 ? `(${P[0]})` : P[0]}, ${R[1]} - ${P[1] < 0 ? `(${P[1]})` : P[1]} angle.r = ${answer}`)}.`,
      };
    }
    if (level === 2) {
      const mag = root(v[0] ** 2 + v[1] ** 2), dir = deg(Math.atan2(v[1], v[0]));
      const answer = `|bold(v)| = ${mag}", " theta approx ${fixed(dir, 1)}°`;
      const alt = deg(Math.atan(v[1] / (v[0] || 1e-9)));
      return {
        body: `Find the magnitude and direction angle of ${math(`bold(v) = ${vec(v[0], v[1])}`)}. Round the angle to the nearest tenth of a degree.`,
        answer: math(answer),
        distractors: wrong(math(answer), [`|bold(v)| = ${Math.abs(v[0]) + Math.abs(v[1])}", " theta approx ${fixed(dir, 1)}°`, `|bold(v)| = ${mag}", " theta approx ${fixed(alt, 1)}°`, `|bold(v)| = ${v[0] ** 2 + v[1] ** 2}", " theta approx ${fixed(dir, 1)}°`].map(math)),
        solution: `${math(`|bold(v)| = sqrt(${v[0] ** 2} + ${v[1] ** 2}) = ${mag}`)}; the direction angle is measured from the positive x-axis in the vector's quadrant: ${math(`theta approx ${fixed(dir, 1)}°`)}.`,
      };
    }
    const m = rng.int(3, 30), d = rng.int(5, 355);
    const x = m * Math.cos((d * Math.PI) / 180), y = m * Math.sin((d * Math.PI) / 180);
    const answer = vec(fixed(x, 2), fixed(y, 2));
    return {
      body: `A vector has magnitude ${m} and direction angle ${math(`${d}°`)}. Find its component form, rounding to the nearest hundredth.`,
      answer: math(answer),
      distractors: wrong(math(answer), [vec(fixed(y, 2), fixed(x, 2)), vec(fixed(m * Math.cos(d), 2), fixed(m * Math.sin(d), 2)), vec(fixed(-x, 2), fixed(y, 2))].map(math)),
      solution: `${math(`bold(v) = angle.l ${m} cos ${d}°, ${m} sin ${d}° angle.r approx ${answer}`)}.`,
    };
  },
});

export const pcVectorResultant = us('pc-vector-resultant', {
  points: 2,
  levels: { 1: 'Perpendicular vectors', 2: 'Any two directions', 3: 'Any two directions' },
  generate(rng, level) {
    const m1 = rng.int(5, 40), m2 = rng.int(5, 40);
    const d1 = rng.int(0, 359), d2 = level === 1 ? (d1 + 90) % 360 : rng.int(0, 359);
    const rad = (d: number) => (d * Math.PI) / 180;
    const x = m1 * Math.cos(rad(d1)) + m2 * Math.cos(rad(d2)), y = m1 * Math.sin(rad(d1)) + m2 * Math.sin(rad(d2));
    const mag = Math.hypot(x, y), dir = deg(Math.atan2(y, x));
    const answer = `${math(fixed(mag, 1))} at ${math(`${fixed(dir, 1)}°`)}`;
    return {
      body: `Two forces act on an object: ${m1} N at ${math(`${d1}°`)} and ${m2} N at ${math(`${d2}°`)} (directions measured from the positive x-axis). Find the magnitude and direction of the resultant, to the nearest tenth.`,
      answer,
      distractors: wrong(answer, [`${math(fixed(m1 + m2, 1))} at ${math(`${fixed(dir, 1)}°`)}`, `${math(fixed(mag, 1))} at ${math(`${fixed((d1 + d2) / 2, 1)}°`)}`, `${math(fixed(Math.abs(m1 - m2), 1))} at ${math(`${fixed(dir, 1)}°`)}`]),
      solution: `Add components: ${math(`angle.l ${fixed(x, 2)}, ${fixed(y, 2)} angle.r`)}. The magnitude is ${math(`approx ${fixed(mag, 1)}`)} N and the direction is ${math(`approx ${fixed(dir, 1)}°`)}.`,
    };
  },
});

function vectorOps(rng: Rng, dims: 2 | 3, level: number) {
  const r = () => Array.from({ length: dims }, () => rng.int(-8, 8));
  const u = r(), v = r();
  const a = rng.nonZero(-4, 4), b = rng.nonZero(-4, 4);
  const lin = u.map((x, i) => a * x + b * v[i]);
  const name = (k: number, w: string) => (k === 1 ? `bold(${w})` : k === -1 ? `-bold(${w})` : `${k}bold(${w})`);
  const given = `bold(u) = ${vec(...u)}", " bold(v) = ${vec(...v)}`;
  if (level === 3) {
    const sq = u.reduce((s, x) => s + x * x, 0) || 1;
    const m = new Surds([[1, sq]]);
    const unit = vec(...u.map((x) => new Surds([[new Q(x, sq), sq]]).typst()));
    return {
      body: `Find the unit vector in the direction of ${math(`bold(u) = ${vec(...u)}`)}.`,
      answer: math(unit),
      distractors: wrong(math(unit), [vec(...u.map((x) => new Q(x, sq).typst())), vec(...u.map((x) => `${x}/(${m.typst()})`.replace(/^(-?\d+)\/1$/, '$1'))), vec(...u.map((x) => new Q(x, u.reduce((s, y) => s + Math.abs(y), 0) || 1).typst()))].map(math)),
      solution: `Divide by the magnitude ${math(`|bold(u)| = ${m.typst()}`)}: ${math(unit)}.`,
    };
  }
  if (level === 2) {
    const s = u.map((x, i) => x + v[i]), mag = root(s.reduce((t, x) => t + x * x, 0) || 1);
    return {
      body: `Given ${math(given)}, find ${math('|bold(u) + bold(v)|')}.`,
      answer: math(mag),
      distractors: wrong(math(mag), [root(u.reduce((t, x) => t + x * x, 0) + v.reduce((t, x) => t + x * x, 0) || 1), String(s.reduce((t, x) => t + Math.abs(x), 0)), root(Math.max(1, s.reduce((t, x) => t + x * x, 0) + 2))].map(math)),
      solution: `${math(`bold(u) + bold(v) = ${vec(...s)}`)}, whose magnitude is ${math(mag)}.`,
    };
  }
  const expr = `${name(a, 'u')} ${b < 0 ? '-' : '+'} ${name(Math.abs(b), 'v')}`;
  return {
    body: `Given ${math(given)}, find ${math(expr)}.`,
    answer: math(vec(...lin)),
    distractors: wrong(math(vec(...lin)), [vec(...u.map((x, i) => a * x - b * v[i])), vec(...u.map((x, i) => a * x + v[i])), vec(...u.map((x, i) => b * x + a * v[i]))].map(math)),
    solution: `Scale each vector, then add components: ${math(`${expr} = ${vec(...lin)}`)}.`,
  };
}

export const pcVectorOperations = us('pc-vector-operations', {
  levels: { 1: 'Linear combinations', 2: 'Magnitude of a sum', 3: 'Unit vectors' },
  generate: (rng, level) => vectorOps(rng, 2, level),
});

function dotProblems(rng: Rng, dims: 2 | 3, ask: string) {
  const r = () => Array.from({ length: dims }, () => rng.int(-7, 7));
  let u = r(), v = r();
  if (!u.some((x) => x !== 0)) u[0] = 1;
  if (!v.some((x) => x !== 0)) v[0] = 2;
  if (ask === 'relation') {
    const kind = rng.pick(['orthogonal', 'parallel', 'neither'] as const);
    // Orthogonal by construction: a rotation of u in the plane, or (u2, -u1, 0) in space, scaled.
    if (kind === 'orthogonal') { const k = rng.nonZero(-2, 2); v = dims === 2 ? [-u[1] * k, u[0] * k] : [u[1] * k, -u[0] * k, 0]; }
    if (kind === 'parallel') { const k = rng.nonZero(-3, 3); v = u.map((x) => x * k); }
    const dot = u.reduce((s, x, i) => s + x * v[i], 0);
    const cross = dims === 2 ? u[0] * v[1] - u[1] * v[0] : 1;
    const truth = dot === 0 ? 'orthogonal' : cross === 0 || (dims === 3 && u.every((x, i) => x * v[0] === v[i] * u[0]) && u.every((x, i) => x * v[1] === v[i] * u[1])) ? 'parallel' : 'neither';
    return {
      body: `Are ${math(`bold(u) = ${vec(...u)}`)} and ${math(`bold(v) = ${vec(...v)}`)} orthogonal, parallel, or neither?`,
      answer: truth, distractors: wrong(truth, ['orthogonal', 'parallel', 'neither']),
      solution: `${math(`bold(u) dot bold(v) = ${dot}`)}${dot === 0 ? ', so they are orthogonal' : truth === 'parallel' ? '; one vector is a multiple of the other, so they are parallel' : '; they are not orthogonal, and neither is a multiple of the other'}.`,
    };
  }
  const dot = u.reduce((s, x, i) => s + x * v[i], 0);
  if (ask === 'dot') {
    return task('Find each dot product.', 'Find', `${vec(...u)} dot ${vec(...v)}`, {
      answer: math(String(dot)),
      distractors: wrong(math(String(dot)), [u.reduce((s, x, i) => s + x + v[i], 0), dims === 2 ? u[0] * v[1] - u[1] * v[0] : dot + 2, -dot, u[0] * v[0]].map((n) => math(String(n)))),
      solution: `Multiply matching components and add: ${math(u.map((x, i) => `(${x})(${v[i]})`).join(' + ') + ` = ${dot}`)}.`,
    });
  }
  const mu = Math.hypot(...u), mv = Math.hypot(...v);
  const angle = (Math.acos(Math.max(-1, Math.min(1, dot / (mu * mv)))) * 180) / Math.PI;
  const answer = math(`${fixed(angle, 1)}°`);
  return {
    body: `Find the angle between ${math(`bold(u) = ${vec(...u)}`)} and ${math(`bold(v) = ${vec(...v)}`)}, to the nearest tenth of a degree.`,
    answer, distractors: wrong(answer, [180 - angle, 90 - angle, (Math.acos(Math.max(-1, Math.min(1, dot / (mu * mv) / 2))) * 180) / Math.PI].map((x) => math(`${fixed(Math.abs(x), 1)}°`))),
    solution: `${math(`cos theta = (bold(u) dot bold(v))/(|bold(u)||bold(v)|) = ${dot}/(${root(u.reduce((s, x) => s + x * x, 0))} dot ${root(v.reduce((s, x) => s + x * x, 0))})`)}, so ${math(`theta approx ${fixed(angle, 1)}°`)}.`,
  };
}

export const pcDotProduct = us('pc-dot-product', {
  levels: { 1: 'Dot products', 2: 'Angle between vectors', 3: 'Orthogonal, parallel, or neither' },
  options: [manyOption('ask', 'Ask for', [['dot', 'Dot product'], ['angle', 'Angle between'], ['relation', 'Orthogonal or parallel']], [['dot'], ['angle'], ['relation']])],
  generate: (rng, _level, o) => dotProblems(rng, 2, rng.pick(optList(o, 'ask', ['dot']))),
});

// ── Vectors in space ─────────────────────────────────────────────────────────

export const pcVector3Basics = us('pc-vector3-basics', {
  levels: { 1: 'Component form from two points', 2: 'Magnitude', 3: 'Unit vector' },
  generate(rng, level) {
    const P = [rng.int(-6, 6), rng.int(-6, 6), rng.int(-6, 6)], R = [rng.int(-6, 6), rng.int(-6, 6), rng.int(-6, 6)];
    const v = R.map((x, i) => x - P[i]);
    if (!v.some((x) => x !== 0)) v[0] = 1;
    if (level === 1) {
      const answer = vec(...v);
      return {
        body: `Find the component form of the vector from ${math(`(${P.join(', ')})`)} to ${math(`(${R.join(', ')})`)}.`,
        answer: math(answer), distractors: wrong(math(answer), [vec(...v.map((x) => -x)), vec(...P.map((x, i) => x + R[i])), vec(v[1], v[0], v[2])].map(math)),
        solution: `Subtract initial from terminal coordinates: ${math(answer)}.`,
      };
    }
    if (level === 2) {
      const sq = v.reduce((s, x) => s + x * x, 0);
      return task('Find the magnitude of each vector.', 'Find the magnitude of', vec(...v), {
        answer: math(root(sq)), distractors: wrong(math(root(sq)), [String(v.reduce((s, x) => s + Math.abs(x), 0)), String(sq), root(sq + 1)].map(math)),
        solution: `${math(`sqrt(${v.map((x) => `(${x})^2`).join(' + ')}) = ${root(sq)}`)}.`,
      });
    }
    return vectorOps(rng, 3, 3);
  },
});

export const pcVector3Operations = us('pc-vector3-operations', {
  levels: { 1: 'Linear combinations', 2: 'Dot products', 3: 'Angle between vectors' },
  generate(rng, level) {
    if (level === 1) return vectorOps(rng, 3, 1);
    return dotProblems(rng, 3, level === 2 ? 'dot' : 'angle');
  },
});

export const pcCrossProduct = us('pc-cross-product', {
  levels: { 1: 'Cross product', 2: 'Area of a parallelogram', 3: 'A vector orthogonal to two vectors' },
  generate(rng, level) {
    const r = () => [rng.int(-5, 5), rng.int(-5, 5), rng.int(-5, 5)];
    const u = r(), v = r();
    const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (c.every((x) => x === 0)) return pcCrossProduct.generate(rng, level);
    if (level === 2) {
      const sq = c.reduce((s, x) => s + x * x, 0);
      return {
        body: `Find the area of the parallelogram with adjacent sides ${math(`bold(u) = ${vec(...u)}`)} and ${math(`bold(v) = ${vec(...v)}`)}.`,
        answer: math(root(sq)), distractors: wrong(math(root(sq)), [String(Math.abs(u.reduce((s, x, i) => s + x * v[i], 0))), new Surds([[new Q(1, 2), sq]]).typst(), String(sq)].map(math)),
        solution: `The area is ${math(`|bold(u) times bold(v)| = |${vec(...c)}| = ${root(sq)}`)}.`,
      };
    }
    const answer = vec(...c);
    return {
      body: level === 1 ? `Find ${math(`bold(u) times bold(v)`)} for ${math(`bold(u) = ${vec(...u)}`)} and ${math(`bold(v) = ${vec(...v)}`)}.` : `Find a vector orthogonal to both ${math(`bold(u) = ${vec(...u)}`)} and ${math(`bold(v) = ${vec(...v)}`)}.`,
      answer: math(answer),
      distractors: wrong(math(answer), [vec(...c.map((x) => -x)).replace(/^/, level === 3 ? '' : ''), vec(u[1] * v[2] + u[2] * v[1], u[2] * v[0] + u[0] * v[2], u[0] * v[1] + u[1] * v[0]), vec(...u.map((x, i) => x * v[i])), vec(c[0], -c[1], c[2])].slice(level === 3 ? 1 : 0).map(math)),
      solution: `${math(`bold(u) times bold(v) = angle.l u_2 v_3 - u_3 v_2, u_3 v_1 - u_1 v_3, u_1 v_2 - u_2 v_1 angle.r = ${answer}`)}${level === 3 ? ', which is orthogonal to both (any non-zero multiple also works)' : ''}.`,
    };
  },
});

export const PRECALC_POLAR_VECTORS = [pcParametric, pcProjectile, pcPolarPoints, pcPolarGraphs, pcPolarEquations, pcPolarConics, pcComplexPolar, pcComplexRoots, pcVectorBasics, pcVectorResultant, pcVectorOperations, pcDotProduct, pcVector3Basics, pcVector3Operations, pcCrossProduct];
