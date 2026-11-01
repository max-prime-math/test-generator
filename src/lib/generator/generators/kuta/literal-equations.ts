import type { Rng } from '../../rng.ts';

export type LiteralVariableCount = 'few' | 'some' | 'many';
export type LiteralFactoring = 'no' | 'either' | 'yes';

export interface LiteralEquationOptions {
  variableCount: LiteralVariableCount;
  includeNumbers: boolean;
  isolatedSide: boolean;
  factoring: LiteralFactoring;
}

export interface LiteralEquation {
  family: string;
  equation: string;
  variable: string;
  answer: string;
  distractors: string[];
  explanation: string;
}

interface Family {
  id: string;
  counts: LiteralVariableCount[];
  factoring: boolean;
  isolated: boolean;
  numbers?: 'required';
  build(rng: Rng, v: string[], includeNumbers: boolean): Omit<LiteralEquation, 'family'>;
}

const result = (
  equation: string,
  variable: string,
  answer: string,
  distractors: string[],
  explanation: string,
): Omit<LiteralEquation, 'family'> => ({ equation, variable, answer, distractors, explanation });

const FAMILIES: Family[] = [
  {
    id: 'product', counts: ['few'], factoring: false, isolated: true,
    build(_rng, [x, y, z]) {
      return result(`${x} = ${y} ${z}`, y, `${y} = ${x}/${z}`, [`${y} = ${x} ${z}`, `${y} = ${z}/${x}`, `${y} = ${x} - ${z}`], `Divide both sides by ${z}`);
    },
  },
  {
    id: 'quotient', counts: ['few'], factoring: false, isolated: true,
    build(_rng, [x, y, z]) {
      return result(`${x} = ${y}/${z}`, z, `${z} = ${y}/${x}`, [`${z} = ${x}/${y}`, `${z} = ${x} ${y}`, `${z} = ${y} - ${x}`], `Multiply by ${z}, then divide by ${x}`);
    },
  },
  {
    id: 'sum', counts: ['few'], factoring: false, isolated: true,
    build(_rng, [x, y, z]) {
      return result(`${x} = ${y} + ${z}`, y, `${y} = ${x} - ${z}`, [`${y} = ${x} + ${z}`, `${y} = ${z} - ${x}`, `${y} = ${x}/${z}`], `Subtract ${z} from both sides`);
    },
  },
  {
    id: 'difference', counts: ['few'], factoring: false, isolated: true,
    build(_rng, [x, y, z]) {
      return result(`${x} = ${y} - ${z}`, y, `${y} = ${x} + ${z}`, [`${y} = ${x} - ${z}`, `${y} = ${z} - ${x}`, `${y} = ${x}/${z}`], `Add ${z} to both sides`);
    },
  },
  {
    id: 'numeric-scale', counts: ['few'], factoring: false, isolated: true, numbers: 'required',
    build(rng, [x, y]) {
      const n = rng.int(2, 9);
      return result(`${x} = ${n}${y}`, y, `${y} = ${x}/${n}`, [`${y} = ${n}${x}`, `${y} = ${x} - ${n}`, `${y} = ${n}/${x}`], `Divide both sides by ${n}`);
    },
  },
  {
    id: 'numeric-offset', counts: ['few'], factoring: false, isolated: true, numbers: 'required',
    build(rng, [x, y]) {
      const n = rng.int(2, 12);
      return result(`${x} = ${y} + ${n}`, y, `${y} = ${x} - ${n}`, [`${y} = ${x} + ${n}`, `${y} = ${n} - ${x}`, `${y} = ${x}/${n}`], `Subtract ${n} from both sides`);
    },
  },
  {
    id: 'affine-product', counts: ['some'], factoring: false, isolated: true,
    build(_rng, [x, y, z, w]) {
      return result(`${x} = ${y} ${z} + ${w}`, z, `${z} = (${x} - ${w})/${y}`, [`${z} = ${x}/${y} - ${w}`, `${z} = (${x} + ${w})/${y}`, `${z} = ${y}(${x} - ${w})`], `Subtract ${w}, then divide by ${y}`);
    },
  },
  {
    id: 'grouped-quotient', counts: ['some'], factoring: false, isolated: true,
    build(_rng, [x, y, z, w]) {
      return result(`${x} = (${y} + ${z})/${w}`, y, `${y} = ${w} ${x} - ${z}`, [`${y} = ${x}/${w} - ${z}`, `${y} = ${w} ${x} + ${z}`, `${y} = (${x} - ${z})/${w}`], `Multiply by ${w}, then subtract ${z}`);
    },
  },
  {
    id: 'balanced-sum', counts: ['some'], factoring: false, isolated: false,
    build(_rng, [x, y, z, w]) {
      return result(`${x} ${y} = ${z} + ${w}`, x, `${x} = (${z} + ${w})/${y}`, [`${x} = ${z} + ${w}/${y}`, `${x} = ${y}(${z} + ${w})`, `${x} = (${z} - ${w})/${y}`], `Divide the entire right side by ${y}`);
    },
  },
  {
    id: 'ratio-offset', counts: ['some'], factoring: false, isolated: false,
    build(_rng, [x, y, z, w]) {
      return result(`${x}/${y} + ${z} = ${w}`, x, `${x} = ${y}(${w} - ${z})`, [`${x} = ${w}/${y} - ${z}`, `${x} = ${y}(${w} + ${z})`, `${x} = (${w} - ${z})/${y}`], `Subtract ${z}, then multiply by ${y}`);
    },
  },
  {
    id: 'two-products', counts: ['some'], factoring: false, isolated: false,
    build(_rng, [x, y, z, w]) {
      return result(`${x} ${y} = ${z} ${w}`, w, `${w} = (${x} ${y})/${z}`, [`${w} = ${z}/(${x} ${y})`, `${w} = ${x} ${y} ${z}`, `${w} = (${x} ${z})/${y}`], `Divide both sides by ${z}`);
    },
  },
  {
    id: 'common-factor', counts: ['few', 'some', 'many'], factoring: true, isolated: true,
    build(_rng, [x, y, z, w]) {
      return result(`${w} = ${x} ${y} + ${x} ${z}`, x, `${x} = ${w}/(${y} + ${z})`, [`${x} = ${w}/${y} + ${z}`, `${x} = ${w}/(${y} - ${z})`, `${x} = ${w}(${y} + ${z})`], `Factor ${x} from the right side, then divide by ${y} + ${z}`);
    },
  },
  {
    id: 'two-product-sum', counts: ['many'], factoring: false, isolated: true,
    build(_rng, [x, y, z, w, t]) {
      return result(`${x} = ${y} ${z} + ${w} ${t}`, y, `${y} = (${x} - ${w} ${t})/${z}`, [`${y} = ${x}/${z} - ${w} ${t}`, `${y} = (${x} + ${w} ${t})/${z}`, `${y} = ${z}(${x} - ${w} ${t})`], `Subtract ${w} ${t}, then divide by ${z}`);
    },
  },
  {
    id: 'two-ratios', counts: ['many'], factoring: false, isolated: false,
    build(_rng, [x, y, z, w, t]) {
      return result(`${x}/${y} + ${z}/${w} = ${t}`, x, `${x} = ${y}(${t} - ${z}/${w})`, [`${x} = ${t}/${y} - ${z}/${w}`, `${x} = ${y}(${t} + ${z}/${w})`, `${x} = (${t} - ${z}/${w})/${y}`], `Subtract ${z}/${w}, then multiply by ${y}`);
    },
  },
  {
    id: 'nested-quotient', counts: ['many'], factoring: false, isolated: true,
    build(_rng, [x, y, z, w, t]) {
      return result(`${x} = (${y} + ${z})/(${w} ${t})`, y, `${y} = ${w} ${t} ${x} - ${z}`, [`${y} = ${x}/(${w} ${t}) - ${z}`, `${y} = ${w} ${t} ${x} + ${z}`, `${y} = (${x} - ${z})/(${w} ${t})`], `Multiply by ${w} ${t}, then subtract ${z}`);
    },
  },
  {
    id: 'grouped-products', counts: ['many'], factoring: false, isolated: false,
    build(_rng, [x, y, z, w, t]) {
      return result(`${x}(${y} + ${z}) = ${w} ${t}`, y, `${y} = (${w} ${t})/${x} - ${z}`, [`${y} = ${w} ${t}/(${x} - ${z})`, `${y} = ${x}/(${w} ${t}) - ${z}`, `${y} = (${w} ${t})/${x} + ${z}`], `Divide by ${x}, then subtract ${z}`);
    },
  },
  {
    id: 'factored-product', counts: ['many'], factoring: true, isolated: false,
    build(_rng, [x, y, z, w, t]) {
      return result(`${x} ${y} + ${x} ${z} = ${w} ${t}`, x, `${x} = (${w} ${t})/(${y} + ${z})`, [`${x} = ${w} ${t}/${y} + ${z}`, `${x} = (${w} ${t})/(${y} - ${z})`, `${x} = ${w} ${t}(${y} + ${z})`], `Factor ${x} from the left side, then divide by ${y} + ${z}`);
    },
  },
  {
    id: 'numeric-common-factor', counts: ['some', 'many'], factoring: true, isolated: true, numbers: 'required',
    build(rng, [x, y, z, w]) {
      const n = rng.int(2, 7);
      return result(`${w} = ${n}${x} ${y} + ${n}${x} ${z}`, x, `${x} = ${w}/(${n}(${y} + ${z}))`, [`${x} = ${w}/${n}(${y} + ${z})`, `${x} = ${w}/(${n}${y} + ${z})`, `${x} = ${n}${w}/(${y} + ${z})`], `Factor ${n}${x}, then divide by ${n}(${y} + ${z})`);
    },
  },
];

/**
 * Build a literal-equation problem from an independently designed set of algebraic
 * structures. The returned family id is test metadata, not text shown to students.
 */
export function buildLiteralEquation(rng: Rng, options: LiteralEquationOptions): LiteralEquation {
  let pool = FAMILIES.filter((f) =>
    f.counts.includes(options.variableCount)
    && (options.factoring === 'either' || f.factoring === (options.factoring === 'yes'))
    && (!options.isolatedSide || f.isolated)
    && (options.includeNumbers || f.numbers !== 'required'),
  );

  // A restrictive combination should still generate a useful question. Relax only
  // the isolated-side preference; keep variable count and factoring semantics.
  if (!pool.length) {
    pool = FAMILIES.filter((f) =>
      f.counts.includes(options.variableCount)
      && (options.factoring === 'either' || f.factoring === (options.factoring === 'yes'))
      && (options.includeNumbers || f.numbers !== 'required'),
    );
  }
  if (!pool.length) throw new Error(`No literal-equation family for ${JSON.stringify(options)}`);

  const family = rng.pick(pool);
  const variables = rng.shuffle(['a', 'b', 'c', 'd', 'f', 'g', 'h', 'k', 'm', 'n', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z']);
  const built = family.build(rng, variables, options.includeNumbers);
  const swapSides = rng.next() < 0.5;
  if (swapSides) {
    const [left, right] = built.equation.split(' = ');
    built.equation = `${right} = ${left}`;
  }
  return { family: family.id, ...built };
}

export const literalEquationFamilyIds = FAMILIES.map((f) => f.id);
