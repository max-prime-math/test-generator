import type { Generator } from '../types.ts';
import { round } from '../format.ts';

const math = (text: string) => `$${text}$`;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

// Right triangle ABC with the right angle at C. Relative to angle A:
// BC is opposite, AC is adjacent, and AB is the hypotenuse.
type Side = 'opposite' | 'adjacent' | 'hypotenuse';
const SIDE_NAME: Record<Side, string> = { opposite: 'B C', adjacent: 'A C', hypotenuse: 'A B' };
type Ratio = 'sin' | 'cos' | 'tan';
const RATIO_SIDES: Record<Ratio, [top: Side, bottom: Side]> = {
  sin: ['opposite', 'hypotenuse'],
  cos: ['adjacent', 'hypotenuse'],
  tan: ['opposite', 'adjacent'],
};
const RATIO_FN: Record<Ratio, (x: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan };
const INVERSE: Record<Ratio, (x: number) => number> = { sin: Math.asin, cos: Math.acos, tan: Math.atan };
const deg = (radians: number) => (radians * 180) / Math.PI;
/** A side-over-side fraction; the parentheses keep Typst from reading `B C/A B` as `B (C/A) B`. */
const over = (top: string, bottom: string) => `(${top})/(${bottom})`;

function lengths(angle: number, hypotenuse: number): Record<Side, number> {
  return { hypotenuse, opposite: hypotenuse * Math.sin(rad(angle)), adjacent: hypotenuse * Math.cos(rad(angle)) };
}

/** Distinct positive answers other than the correct one, rounded the same way. */
function keep(answer: string, values: number[], places: number): string[] {
  const out = new Set<string>();
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) continue;
    const text = round(value, places);
    if (text !== answer) out.add(text);
  }
  return [...out];
}

export const rightTriangleTrig: Generator = {
  id: 'mb-10i-right-triangle-trig',
  title: 'Solve right triangles with primary trig ratios',
  classId: 'mb-10i',
  unitId: 'M',
  outcomeId: '10I.M.4',
  levels: {
    1: 'Find a side (unknown in the numerator)',
    2: 'Find a side (unknown in the denominator)',
    3: 'Find an angle',
  },
  points: 2,
  generate(rng, difficulty) {
    const angle = rng.int(15, 75);
    const sides = lengths(angle, rng.int(50, 200) / 10);
    const setup = `In right triangle ${math('A B C')}, ${math('angle C = 90°')}.`;

    if (difficulty === 3) {
      const ratio = rng.pick(['sin', 'cos', 'tan'] as const);
      const [top, bottom] = RATIO_SIDES[ratio];
      const a = Number(round(sides[top])), b = Number(round(sides[bottom]));
      const exact = deg(INVERSE[ratio](a / b));
      const answer = round(exact);
      return {
        body: `${setup} ${math(`${SIDE_NAME[top]} = ${a.toFixed(1)}`)} cm and ${math(`${SIDE_NAME[bottom]} = ${b.toFixed(1)}`)} cm. Find ${math('angle A')}, to the nearest tenth of a degree.`,
        answer: math(`${answer}°`),
        distractors: keep(answer, [
          90 - exact,
          deg(INVERSE[ratio](b / a)),
          deg(Math.atan(b / a)),
          INVERSE[ratio](a / b), // calculator in radian mode
          ...(['sin', 'cos', 'tan'] as const).filter((r) => r !== ratio).map((r) => deg(INVERSE[r](a / b))),
        ], 1).map((d) => math(`${d}°`)),
        solution: math(`${ratio} A = ${over(SIDE_NAME[top], SIDE_NAME[bottom])} = ${a.toFixed(1)}/${b.toFixed(1)}, quad A = ${ratio}^(-1)(${a.toFixed(1)}/${b.toFixed(1)}) approx ${answer}°`),
      };
    }

    // Pick a ratio and which of its two sides is unknown.
    const ratio = rng.pick(['sin', 'cos', 'tan'] as const);
    const [top, bottom] = RATIO_SIDES[ratio];
    const unknown = difficulty === 1 ? top : bottom;
    const known = unknown === top ? bottom : top;
    const given = Number(round(sides[known]));
    const f = RATIO_FN[ratio](rad(angle));
    const exact = unknown === top ? given * f : given / f;
    const answer = round(exact);
    const wrongRatios = (['sin', 'cos', 'tan'] as const).filter((r) => r !== ratio).map((r) => RATIO_FN[r](rad(angle)));
    const distractors = keep(answer, [
      unknown === top ? given / f : given * f,
      ...wrongRatios.map((g) => (unknown === top ? given * g : given / g)),
      unknown === top ? given * RATIO_FN[ratio](angle) : given / RATIO_FN[ratio](angle), // calculator in radian mode
      unknown === top ? given * RATIO_FN[ratio](rad(90 - angle)) : given / RATIO_FN[ratio](rad(90 - angle)), // used angle B
    ], 1);
    const equation = unknown === top
      ? `${ratio} ${angle}° = x/${given.toFixed(1)}, quad x = ${given.toFixed(1)} ${ratio} ${angle}°`
      : `${ratio} ${angle}° = ${given.toFixed(1)}/x, quad x = ${given.toFixed(1)}/(${ratio} ${angle}°)`;
    const [topName, bottomName] = [SIDE_NAME[top], SIDE_NAME[bottom]];
    return {
      body: `${setup} ${math(`angle A = ${angle}°`)} and ${math(`${SIDE_NAME[known]} = ${given.toFixed(1)}`)} cm. Find the length of ${math(SIDE_NAME[unknown])}, to the nearest tenth of a centimetre.`,
      answer: math(`${answer} "cm"`),
      distractors: distractors.map((d) => math(`${d} "cm"`)),
      solution: `Use ${math(`${ratio} A = ${over(topName, bottomName)}`)}. Let ${math(`x = ${SIDE_NAME[unknown]}`)}: ${math(`${equation} approx ${answer}`)} cm.`,
    };
  },
};
