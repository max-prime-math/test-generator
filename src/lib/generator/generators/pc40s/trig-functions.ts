import type { Rng } from '../../rng.ts';
import { round } from '../../format.ts';
import { Q, radians } from '../../exact.ts';
import { graphTypst } from '../../graph.ts';
import { math, pc40s } from './common.ts';

/** y = a·fn(b(x − c)) + d, with c in degrees so it can print as an exact multiple of π. */
export interface Sinusoid { fn: 'sin' | 'cos'; a: number; b: Q; c: number; d: number }

const plus = (k: number) => (k === 0 ? '' : ` ${k < 0 ? '-' : '+'} ${Math.abs(k)}`);

/** `x - pi/4`, `x + pi/3`, or `x`. */
export function shiftText(c: number): string {
  if (c === 0) return 'x';
  return `x ${c > 0 ? '-' : '+'} ${radians(Math.abs(c))}`;
}

/** `sin 2(x - pi/4)`, `cos(x/2)`, `sin x`. */
export function innerText(fn: string, b: Q, c: number): string {
  if (c === 0) {
    if (b.eq(1)) return `${fn} x`;
    if (b.isInt) return `${fn}(${b.n}x)`;
    return `${fn}(${b.n === 1 ? 'x' : `${b.n}x`}/${b.d})`;
  }
  if (b.eq(1)) return `${fn}(${shiftText(c)})`;
  // A space keeps a fractional b as its own factor: sin 1/2 (x - pi/4).
  return `${fn} ${b.typst()}${b.isInt ? '' : ' '}(${shiftText(c)})`;
}

export function sinusoidText(s: Sinusoid): string {
  const lead = s.a === 1 ? '' : s.a === -1 ? '-' : String(s.a);
  return `y = ${lead}${innerText(s.fn, s.b, s.c)}${plus(s.d)}`;
}

export function sinusoidValue(s: Sinusoid, x: number): number {
  const t = s.b.value * (x - (s.c * Math.PI) / 180);
  return s.a * (s.fn === 'sin' ? Math.sin(t) : Math.cos(t)) + s.d;
}

/** Period in degrees: 360°/|b|. */
export const periodDeg = (b: Q) => new Q(360).div(b.abs());

/** Ticks every quarter or half period, labelled as multiples of π. */
function radianTicks(min: number, max: number, stepDeg: number): Array<[number, string]> {
  const ticks: Array<[number, string]> = [];
  for (let dgr = Math.ceil(min / stepDeg) * stepDeg; dgr <= max; dgr += stepDeg) {
    if (dgr !== 0) ticks.push([(dgr * Math.PI) / 180, radians(dgr)]);
  }
  return ticks;
}

/** A graph of one or two periods of a sinusoid, on a radian axis. */
export function sinusoidGraph(s: Sinusoid, size: { width: number; height: number }, extra: Sinusoid[] = []): string {
  const period = periodDeg(s.b).value;
  const lo = Math.min(0, s.c) - period / 4, hi = Math.max(0, s.c) + period * 1.25;
  const step = period <= 180 ? 45 : period <= 360 ? 90 : 180;
  const top = Math.max(Math.abs(s.a) + Math.abs(s.d), 2) + 1;
  return graphTypst({
    xMin: (lo * Math.PI) / 180, xMax: (hi * Math.PI) / 180, yMin: -top, yMax: top,
    xStep: (step * Math.PI) / 180, yStep: 1, yLabelStep: top > 5 ? 2 : 1,
    xTicks: radianTicks(lo, hi, step * (hi - lo > 720 ? 2 : 1)),
    width: size.width, height: size.height,
    curves: [...extra.map((e) => ({ f: (x: number) => sinusoidValue(e, x), faint: true })), { f: (x: number) => sinusoidValue(s, x) }],
  });
}

function randomSinusoid(rng: Rng, difficulty: number): Sinusoid {
  return {
    fn: rng.pick(['sin', 'cos'] as const),
    a: difficulty === 1 ? rng.pick([1, 2, 3]) : rng.pick([-3, -2, -1, 2, 3]),
    b: difficulty === 1 ? new Q(1) : rng.pick([new Q(2), new Q(1, 2), new Q(3), new Q(1)]),
    c: difficulty === 3 ? rng.sign() * rng.pick([30, 45, 60, 90]) : 0,
    d: difficulty === 1 ? 0 : rng.int(-3, 3),
  };
}

export const tfCharacteristicsBasic = pc40s('40s-tf-characteristics-basic', {
  points: 1,
  levels: { 1: 'Amplitude, period, and range', 2: 'Zeros and domain', 3: 'Asymptotes of y = tan x' },
  generate(rng, difficulty) {
    const unit = rng.pick(['deg', 'rad'] as const);
    const a = (dgr: number) => (unit === 'deg' ? `${dgr}°` : radians(dgr));
    if (difficulty === 1) {
      const fn = rng.pick(['sin', 'cos'] as const);
      const ask = rng.pick(['amplitude', 'period', 'range'] as const);
      const answers = { amplitude: '1', period: a(360), range: '{y | -1 <= y <= 1, y in RR}' };
      const wrong = { amplitude: ['2', a(360), '0'], period: [a(180), a(90), a(720)], range: ['{y | y in RR}', '{y | 0 <= y <= 1, y in RR}', '{y | -2 <= y <= 2, y in RR}'] };
      return {
        body: `State the ${ask} of ${math(`y = ${fn} x`)}${ask === 'period' ? ` in ${unit === 'deg' ? 'degrees' : 'radians'}` : ''}.`,
        answer: math(answers[ask]),
        distractors: wrong[ask].map(math),
        solution: `${math(`y = ${fn} x`)} oscillates between ${math('-1')} and ${math('1')} and repeats every ${math(a(360))}: amplitude 1, period ${math(a(360))}, range ${math(answers.range)}.`,
      };
    }
    if (difficulty === 2) {
      const fn = rng.pick(['sin', 'cos', 'tan'] as const);
      const zeros = fn === 'cos' ? [90, 270] : [0, 180, 360];
      const answer = `x = ${zeros.map(a).join(', ')}`;
      const other = fn === 'cos' ? [0, 180, 360] : [90, 270];
      return {
        body: `Find the zeros of ${math(`y = ${fn} x`)} for ${math(`0 <= x <= ${a(360)}`)}.`,
        answer: math(answer),
        distractors: [`x = ${other.map(a).join(', ')}`, `x = ${a(fn === 'cos' ? 90 : 180)}`, `x = ${[45, 225].map(a).join(', ')}`].map(math),
        solution: `${fn === 'cos' ? 'The cosine' : fn === 'sin' ? 'The sine' : 'The tangent'} is zero where ${fn === 'cos' ? 'the x-coordinate' : 'the y-coordinate'} on the unit circle is 0: ${math(answer)}.`,
      };
    }
    const general = rng.next() < 0.5;
    const answer = general ? `x = ${a(90)} + ${unit === 'deg' ? '180°' : 'pi'} n, n in ZZ` : `x = ${[-270, -90, 90, 270].map(a).join(', ')}`;
    return {
      body: general
        ? `Write the equations of all vertical asymptotes of ${math('y = tan x')}.`
        : `Find the equations of the vertical asymptotes of ${math('y = tan x')} for ${math(`${a(-360)} <= x <= ${a(360)}`)}.`,
      answer: math(answer),
      distractors: general
        ? [`x = ${a(90)} + ${unit === 'deg' ? '360°' : '2pi'} n, n in ZZ`, `x = ${unit === 'deg' ? '180°' : 'pi'} n, n in ZZ`, `y = ${a(90)} + ${unit === 'deg' ? '180°' : 'pi'} n, n in ZZ`].map(math)
        : [`x = ${[-360, -180, 0, 180, 360].map(a).join(', ')}`, `x = ${[-90, 90].map(a).join(', ')}`, `x = ${[-270, 90].map(a).join(', ')}`].map(math),
      solution: `${math('tan x = sin x / cos x')} is undefined where ${math('cos x = 0')}: ${math(answer)}.`,
    };
  },
});

export const tfCharacteristics = pc40s('40s-tf-characteristics', {
  levels: { 1: 'Amplitude and vertical displacement', 2: 'Period', 3: 'Phase shift (factor b first)' },
  generate(rng, difficulty) {
    const s = randomSinusoid(rng, Math.max(difficulty, 2));
    if (difficulty === 1) { s.b = new Q(1); s.c = 0; }
    if (difficulty === 2) s.c = 0;
    if (difficulty === 3 && s.c === 0) s.c = 45;
    // Keep b·c a whole number of degrees so the expanded form prints exactly (b = 1/2 needs c = ±90°).
    if (difficulty === 3 && !Number.isInteger(s.b.value * s.c)) s.c = Math.sign(s.c) * 90;
    const unit = rng.pick(['deg', 'rad'] as const);
    const ask = difficulty === 1 ? rng.pick(['amplitude', 'displacement'] as const) : difficulty === 2 ? 'period' : 'phase';
    const period = periodDeg(s.b);
    // Level 3 hides the phase shift by expanding b(x − c) = bx − bc.
    const expanded = (() => {
      const shift = s.b.mul(s.c);
      const lead = s.a === 1 ? '' : s.a === -1 ? '-' : String(s.a);
      const bx = s.b.eq(1) ? 'x' : s.b.isInt ? `${s.b.n}x` : `x/${s.b.d}`;
      return `y = ${lead}${s.fn}(${bx} ${shift.value > 0 ? '-' : '+'} ${radians(Math.abs(shift.value))})${plus(s.d)}`;
    })();
    const equation = difficulty === 3 ? expanded : sinusoidText(s);
    const answers = {
      amplitude: String(Math.abs(s.a)),
      displacement: s.d === 0 ? '"none"' : `${Math.abs(s.d)} "${s.d > 0 ? 'up' : 'down'}"`,
      period: unit === 'deg' ? `${period.typst()}°` : radians(period.value),
      phase: `${radians(Math.abs(s.c))} "${s.c > 0 ? 'right' : 'left'}"`,
    };
    const wrong = {
      amplitude: [String(s.a * 2), String(s.a + s.d), String(-Math.abs(s.a))],
      displacement: [`${Math.abs(s.d) || 1} "${s.d > 0 ? 'down' : 'up'}"`, `${Math.abs(s.a)} "up"`, `${Math.abs(s.d) + 1} "${s.d > 0 ? 'up' : 'down'}"`],
      // Dividing by the reciprocal of b, multiplying by b, half or double the period, or ignoring b.
      period: [periodDeg(new Q(s.b.d, s.b.n)), s.b.mul(360), period.div(2), period.mul(2), new Q(360)]
        .map((p) => (unit === 'deg' ? `${p.typst()}°` : radians(p.value))),
      phase: [`${radians(Math.abs(s.c))} "${s.c > 0 ? 'left' : 'right'}"`, `${radians(Math.abs(s.b.mul(s.c).value))} "${s.c > 0 ? 'right' : 'left'}"`, `${radians(Math.abs(s.b.mul(s.c).value))} "${s.c > 0 ? 'left' : 'right'}"`],
    };
    const noun = { amplitude: 'amplitude', displacement: 'vertical displacement', period: `period${unit === 'deg' ? ' in degrees' : ' in radians'}`, phase: 'phase shift' }[ask];
    return {
      body: `State the ${noun} of ${math(equation)}.`,
      answer: math(answers[ask]),
      distractors: wrong[ask].filter((w) => w !== answers[ask]).map(math),
      solution: {
        amplitude: `The amplitude is ${math(`|a| = ${Math.abs(s.a)}`)}.`,
        displacement: `The vertical displacement is ${math(`d = ${s.d}`)}${s.d === 0 ? ' (none)' : ''}.`,
        period: `The period is ${math(`(${unit === 'deg' ? '360°' : '2pi'})/abs(b) = (${unit === 'deg' ? '360°' : '2pi'})/(${s.b.typst()}) = ${answers.period}`)}.`,
        phase: `Factor out ${math(`b = ${s.b.typst()}`)}: ${math(sinusoidText(s))}. The phase shift is ${math(answers.phase)}.`,
      }[ask],
    };
  },
});

export const tfMaxMin = pc40s('40s-tf-max-min', {
  levels: { 1: 'Maximum and minimum values', 2: 'Range with a reflection', 3: 'Where the first maximum occurs' },
  generate(rng, difficulty) {
    const s = randomSinusoid(rng, difficulty === 3 ? 3 : 2);
    if (difficulty === 1) s.a = Math.abs(s.a);
    const max = s.d + Math.abs(s.a), min = s.d - Math.abs(s.a);
    if (difficulty < 3) {
      const ask = difficulty === 1 ? rng.pick(['maximum', 'minimum'] as const) : 'range';
      const answer = ask === 'maximum' ? String(max) : ask === 'minimum' ? String(min) : `{y | ${min} <= y <= ${max}, y in RR}`;
      const wrong = ask === 'range'
        ? [`{y | ${s.d - s.a} <= y <= ${s.a}, y in RR}`, `{y | ${-Math.abs(s.a)} <= y <= ${Math.abs(s.a)}, y in RR}`, `{y | ${min - 1} <= y <= ${max + 1}, y in RR}`]
        : [String(ask === 'maximum' ? min : max), String(Math.abs(s.a)), String(ask === 'maximum' ? s.a + 1 : -s.a)];
      return {
        body: `State the ${ask} ${ask === 'range' ? '' : 'value '}of ${math(sinusoidText(s))}.`,
        answer: math(answer),
        distractors: wrong.filter((w) => w !== answer).map(math),
        solution: `The graph oscillates ${math(`|a| = ${Math.abs(s.a)}`)} above and below the midline ${math(`y = ${s.d}`)}: maximum ${math(String(max))}, minimum ${math(String(min))}.`,
      };
    }
    // First x > 0 where the maximum occurs: b(x − c) = phase of the peak, plus whole periods.
    const peak = s.a > 0 ? (s.fn === 'sin' ? 90 : 0) : s.fn === 'sin' ? 270 : 180;
    const period = periodDeg(s.b).value;
    let x = s.c + peak / s.b.value;
    while (x <= 0) x += period;
    while (x - period > 0) x -= period;
    const answer = `x = ${radians(x)}`;
    return {
      body: `Find the smallest positive value of ${math('x')} where ${math(sinusoidText(s))} has its maximum value.`,
      answer: math(answer),
      distractors: [x + period / 2, x + period, s.c + peak].filter((v) => v > 0 && Math.abs(v - x) > 1e-9).map((v) => math(`x = ${radians(v)}`)),
      solution: `A maximum occurs where ${math(`${s.b.eq(1) ? '' : `${s.b.typst()}`}(${shiftText(s.c)})`)} equals ${math(radians(peak))} (plus full periods of ${math(radians(period))}). The smallest positive such ${math('x')} is ${math(radians(x))}.`,
    };
  },
});

export const tfEquationFromFeatures = pc40s('40s-tf-equation-from-features', {
  levels: { 1: 'Amplitude and period', 2: 'With a vertical displacement', 3: 'From the maximum, minimum, and period' },
  generate(rng, difficulty) {
    const s = randomSinusoid(rng, difficulty);
    s.a = Math.abs(s.a);
    if (difficulty === 1) { s.b = rng.pick([new Q(2), new Q(1, 2), new Q(3), new Q(4)]); s.d = 0; }
    if (difficulty < 3) s.c = 0;
    const period = periodDeg(s.b);
    if (difficulty === 3) {
      s.fn = 'cos';
      const max = s.d + s.a, min = s.d - s.a;
      const answer = sinusoidText(s);
      return {
        body: `A cosine function has a maximum of ${max} at ${math(`x = ${radians(s.c)}`)}, a minimum of ${min}, and a period of ${math(radians(period.value))}. Write its equation.`,
        answer: math(answer),
        distractors: [
          sinusoidText({ ...s, c: -s.c }),
          sinusoidText({ ...s, b: new Q(s.b.d, s.b.n) }),
          // Using the maximum as the amplitude and the minimum as the midline.
          sinusoidText({ ...s, a: max === 0 || max === s.a ? s.a + 1 : max, d: min }),
        ].filter((d) => d !== answer).map(math),
        solution: `Amplitude ${math(`(${max} - (${min}))/2 = ${s.a}`)}; midline ${math(`(${max} + (${min}))/2 = ${s.d}`)}; ${math(`b = (2pi)/(${radians(period.value)}) = ${s.b.typst()}`)}; a cosine curve starts at a maximum, so the phase shift is ${math(radians(s.c))}. Equation: ${math(answer)}. (Other equivalent equations are possible.)`,
      };
    }
    const answer = sinusoidText(s);
    return {
      body: `Write the equation of a ${s.fn === 'sin' ? 'sine' : 'cosine'} function with amplitude ${s.a}, period ${math(radians(period.value))}${difficulty === 2 ? `, and a vertical displacement of ${Math.abs(s.d)} ${s.d >= 0 ? 'up' : 'down'}` : ''}.`,
      answer: math(answer),
      distractors: [
        sinusoidText({ ...s, b: new Q(s.b.d, s.b.n) }),
        sinusoidText({ ...s, b: period.div(180) }),
        sinusoidText({ ...s, d: -s.d, a: difficulty === 1 ? -s.a : s.a }),
      ].filter((d) => d !== answer).map(math),
      solution: `${math(`b = (2pi)/"period" = (2pi)/(${radians(period.value)}) = ${s.b.typst()}`)}, so ${math(answer)}.`,
    };
  },
});

export const tfModel = pc40s('40s-tf-model', {
  levels: { 1: 'Evaluate a model', 2: 'Write a model', 3: 'Solve a model for time' },
  generate(rng, difficulty) {
    const r = rng.int(8, 30), gap = rng.int(1, 4), T = rng.pick([40, 60, 80, 90, 120]);
    const h0 = r + gap;
    const model = `h(t) = -${r} cos((2pi)/${T} t) + ${h0}`;
    const h = (t: number) => -r * Math.cos((2 * Math.PI * t) / T) + h0;
    const intro = `A Ferris wheel has a radius of ${r} m, its centre is ${h0} m above the ground, and it turns once every ${T} s. A rider gets on at the bottom.`;
    if (difficulty === 1) {
      const t = rng.int(5, T - 5);
      return {
        body: `${intro} The rider's height is ${math(model)}. Find the height after ${t} s, to the nearest tenth of a metre.`,
        answer: math(`${round(h(t), 1)} "m"`),
        distractors: [round(-r * Math.cos((2 * Math.PI * t) / T * (180 / Math.PI)) + h0, 1), round(r * Math.cos((2 * Math.PI * t) / T) + h0, 1), round(-r * Math.sin((2 * Math.PI * t) / T) + h0, 1)].filter((v) => v !== round(h(t), 1)).map((v) => math(`${v} "m"`)),
        solution: `${math(`h(${t}) = -${r} cos((2pi)/${T} dot ${t}) + ${h0} approx ${round(h(t), 1)}`)} m (calculator in radian mode).`,
      };
    }
    if (difficulty === 2) {
      return {
        body: `${intro} Write an equation for the rider's height ${math('h')}, in metres, after ${math('t')} seconds.`,
        answer: math(model),
        distractors: [`h(t) = ${r} cos((2pi)/${T} t) + ${h0}`, `h(t) = -${r} cos(${T} t) + ${h0}`, `h(t) = -${h0} cos((2pi)/${T} t) + ${r}`].map(math),
        solution: `Amplitude ${r} (the radius), midline ${math(`h = ${h0}`)} (the centre), ${math(`b = (2pi)/${T}`)}, and a negative cosine because the ride starts at the minimum: ${math(model)}.`,
      };
    }
    const H = rng.int(gap + 1, h0 + r - 1);
    const t = (T / (2 * Math.PI)) * Math.acos((h0 - H) / r);
    return {
      body: `${intro} The rider's height is ${math(model)}. When does the rider first reach a height of ${H} m? Round to one decimal place.`,
      answer: math(`${round(t, 1)} "s"`),
      distractors: [round(T - t, 1), round((T / (2 * Math.PI)) * Math.acos((H - h0) / r), 1), round((T / 360) * (Math.acos((h0 - H) / r) * 180 / Math.PI) / 2, 1)].filter((v) => v !== round(t, 1)).map((v) => math(`${v} "s"`)),
      solution: `${math(`${H} = -${r} cos((2pi)/${T} t) + ${h0}`)} gives ${math(`cos((2pi)/${T} t) = ${new Q(h0 - H, r).typst()}`)}. The first solution is ${math(`t = ${T}/(2pi) cos^(-1)(${new Q(h0 - H, r).typst()}) approx ${round(t, 1)}`)} s.`,
    };
  },
});

export const tfSketch = pc40s('40s-tf-sketch', {
  levels: { 1: 'Amplitude changes', 2: 'Period and vertical displacement', 3: 'All four parameters' },
  generate(rng, difficulty) {
    const s = randomSinusoid(rng, difficulty);
    if (difficulty === 1) s.a = rng.pick([-2, 2, 3, -1]);
    const size = { width: 3.6, height: 2.8 };
    return {
      body: `Graph ${math(sinusoidText(s))}.`,
      answer: sinusoidGraph(s, size),
      distractors: [
        sinusoidGraph({ ...s, a: -s.a }, size),
        sinusoidGraph({ ...s, b: s.b.eq(1) ? new Q(2) : new Q(s.b.d, s.b.n) }, size),
        sinusoidGraph(s.c !== 0 ? { ...s, c: -s.c } : { ...s, d: s.d === 0 ? 1 : -s.d }, size),
      ],
      solution: `Amplitude ${Math.abs(s.a)}${s.a < 0 ? ' (reflected in the x-axis)' : ''}, period ${math(radians(periodDeg(s.b).value))}, phase shift ${s.c === 0 ? 'none' : math(`${radians(Math.abs(s.c))}`) + (s.c > 0 ? ' right' : ' left')}, vertical displacement ${s.d === 0 ? 'none' : `${Math.abs(s.d)} ${s.d > 0 ? 'up' : 'down'}`}. The range is ${math(`{y | ${s.d - Math.abs(s.a)} <= y <= ${s.d + Math.abs(s.a)}}`)}.`,
    };
  },
});

export const tfEquationFromGraph = pc40s('40s-tf-equation-from-graph', {
  levels: { 1: 'Amplitude only', 2: 'Amplitude, period, and midline', 3: 'With a phase shift' },
  generate(rng, difficulty) {
    const s = randomSinusoid(rng, difficulty);
    s.a = Math.abs(s.a);
    s.fn = difficulty === 3 ? 'sin' : s.fn;
    const answer = sinusoidText(s);
    return {
      body: `Write an equation of the form ${math(`y = a ${s.fn} b(x - c) + d`)} for the graph.\n\n${sinusoidGraph(s, { width: 7, height: 4 })}`,
      answer: math(answer),
      distractors: [
        sinusoidText({ ...s, b: s.b.eq(1) ? new Q(1, 2) : new Q(s.b.d, s.b.n) }),
        sinusoidText({ ...s, c: -s.c, d: s.c === 0 ? -s.d || 1 : s.d }),
        sinusoidText({ ...s, a: s.a + (Math.abs(s.d) || 1) }),
        sinusoidText({ ...s, fn: s.fn === 'sin' ? 'cos' : 'sin' }),
        sinusoidText({ ...s, a: -s.a }),
      ].filter((d) => d !== answer).map(math),
      solution: `Read the maximum ${math(String(s.d + s.a))} and minimum ${math(String(s.d - s.a))}: amplitude ${s.a}, midline ${math(`y = ${s.d}`)}. One cycle takes ${math(radians(periodDeg(s.b).value))}, so ${math(`b = ${s.b.typst()}`)}.${s.c ? ` The ${s.fn === 'sin' ? 'sine' : 'cosine'} cycle starts at ${math(`x = ${radians(s.c)}`)}.` : ''} Equation: ${math(answer)}. (Other equivalent equations are possible.)`,
    };
  },
});

export const TRIG_FUNCTION_GENERATORS = [tfCharacteristicsBasic, tfCharacteristics, tfMaxMin, tfEquationFromFeatures, tfModel, tfSketch, tfEquationFromGraph];
