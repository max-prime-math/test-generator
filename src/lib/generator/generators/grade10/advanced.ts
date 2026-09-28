// Advanced (enrichment) generators for Grade 10: systems in three or four variables,
// matrices, and lines and planes in space. Every system is built by `randomSystem`,
// so whether it is consistent, and how many parameters its solution needs, is
// decided before it is written.
import type { Rng } from '../../rng.ts';
import { Q } from '../../exact.ts';
import { math, mb10i } from '../pc40s/common.ts';
import { distinct } from './shared.ts';
import { manyOption, optList, optNum, optOne, radioOption, sizeOption } from '../../options.ts';
import {
  PARAMS, VARS, add, det, equation, inverse, matText, mul, randomSystem, rank, rref, scale, solve, solutionText, systemText, toQ,
  type GeneratedSystem, type Mat, type Solution,
} from '../../linalg.ts';

type V3 = [number, number, number];
const vec = (v: Array<number | Q>) => `(${v.map((x) => Q.of(x).typst()).join(', ')})`;
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const isZero = (v: number[]) => v.every((x) => x === 0);
const qs = (v: number[]) => v.map((x) => new Q(x));
const augmented = (s: GeneratedSystem) => s.A.map((r, i) => [...r, s.b[i]]);
/** The augmented matrix and its reduced form, as a line of working. */
function rowReduction(s: GeneratedSystem): string {
  const n = s.A[0].length;
  const { R } = rref(toQ(augmented(s)));
  return `${math(matText(augmented(s), n))} reduces to ${math(matText(R, n))}`;
}

/** Wrong solution texts: values swapped, a sign changed, one value off by one; for parameters, a sign or a term changed. */
function wrongSolutions(rng: Rng, s: Solution, n: number): string[] {
  if (s.kind === 'unique') {
    const v = s.values;
    const swapped = [...v]; const i = rng.int(0, n - 2); [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
    return [
      solutionText({ kind: 'unique', values: swapped }, n),
      solutionText({ kind: 'unique', values: v.map((x, j) => (j === n - 1 ? x.neg() : x)) }, n),
      solutionText({ kind: 'unique', values: v.map((x, j) => (j === 0 ? x.add(1) : x)) }, n),
      solutionText({ kind: 'unique', values: v.map((x) => x.neg()) }, n),
      '"no solution"',
    ];
  }
  if (s.kind === 'param') {
    const vary = (f: (e: { c: Q; coefs: Q[] }, j: number) => { c: Q; coefs: Q[] }) => solutionText({ ...s, exprs: s.exprs.map(f) }, n);
    const pivotIdx = s.exprs.map((_, j) => j).filter((j) => !s.free.includes(j));
    const p = pivotIdx[0] ?? 0;
    return [
      vary((e, j) => (j === p ? { c: e.c, coefs: e.coefs.map((k) => k.neg()) } : e)),
      vary((e, j) => (j === p ? { c: e.c.neg(), coefs: e.coefs } : e)),
      vary((e, j) => (pivotIdx.includes(j) ? { c: e.c.add(1), coefs: e.coefs } : e)),
      vary((e) => ({ c: e.c, coefs: e.coefs.map((k) => k.neg()) })),
      '"no solution"',
    ];
  }
  const tuple = `(${VARS.slice(0, n).join(', ')})`;
  return [`${tuple} = (${Array(n).fill(0).join(', ')})`, '"infinitely many solutions"', `${tuple} = (${Array.from({ length: n }, (_, i) => i + 1).join(', ')})`];
}
const paramNote = (s: Solution) => (s.kind === 'param' ? `, ${math(`${PARAMS.slice(0, s.free.length).join(', ')} in RR`)}` : '');

// ── Systems in three or four variables ────────────────────────────────────

export const xSysSolve = mb10i('10i-x-sys-solve', {
  levels: { 1: 'Three variables, small coefficients', 2: 'Three variables', 3: 'Four variables' },
  options: [
    radioOption('vars', 'Variables', [['2', '2 (x, y)'], ['3', '3 (x, y, z)'], ['4', '4 (x, y, z, w)']], ['3', '3', '4']),
    sizeOption([3, 5, 9, 12], [5, 9, 9], 'Largest coefficient'),
  ],
  generate(rng, difficulty, o) {
    const n = optNum(o, 'vars', difficulty === 3 ? 4 : 3);
    const s = randomSystem(rng, { vars: n, eqs: n, rank: n, consistent: true, bound: optNum(o, 'size', difficulty === 1 ? 5 : 9) });
    const answer = solutionText(s.solution, n);
    return {
      body: `Solve: ${math(systemText(s.A, s.b))}`,
      answer: math(answer),
      distractors: distinct(math(answer), wrongSolutions(rng, s.solution, n).map(math)),
      solution: `Eliminate one variable at a time, or row-reduce: ${rowReduction(s)}. So ${math(answer)}. Check in every equation.`,
    };
  },
});

export const xSysVerify = mb10i('10i-x-sys-verify', {
  points: 1,
  levels: { 1: 'Three variables', 2: 'Four variables', 3: 'A point of a parametric solution set' },
  options: [
    radioOption('form', 'System', [['1', 'Three variables'], ['2', 'Four variables'], ['3', 'A point of a parametric solution set']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const n = difficulty === 2 ? 4 : 3;
    const s = difficulty === 3 ? randomSystem(rng, { vars: 3, eqs: 3, rank: 2, consistent: true }) : randomSystem(rng, { vars: n, eqs: n, rank: n, consistent: true });
    let point: Q[];
    if (s.solution.kind === 'param') { const t = rng.int(-3, 3); point = s.solution.exprs.map((e) => e.c.add(e.coefs[0].mul(t))); }
    else point = (s.solution as { values: Q[] }).values;
    const good = rng.next() < 0.5;
    if (!good) { const j = rng.int(0, n - 1); point = point.map((v, i) => (i === j ? v.add(rng.nonZero(-2, 2)) : v)); }
    const fails = s.A.map((row, i) => row.reduce((acc, c, j) => acc.add(point[j].mul(c)), new Q(0)).eq(s.b[i]) ? 0 : i + 1).filter(Boolean);
    const tuple = `(${VARS.slice(0, n).join(', ')}) = ${vec(point)}`;
    // Name every failed equation, so no other "No" choice is also true.
    const list = (xs: number[]) => (xs.length === 1 ? `equation ${xs[0]}` : `equations ${xs.slice(0, -1).join(', ')}${xs.length > 2 ? ',' : ''} and ${xs[xs.length - 1]}`);
    const answer = fails.length ? `No: it fails ${list(fails)}` : 'Yes: it satisfies every equation';
    const holds = Array.from({ length: n }, (_, i) => i + 1).filter((i) => !fails.includes(i));
    // Each of these is false: it names an equation that holds, or leaves out one that fails.
    const wrongNo = fails.length
      ? [...(holds.length ? [`No: it fails ${list(holds)}`] : []), ...(fails.length > 1 ? [`No: it fails only equation ${fails[fails.length - 1]}`] : []), ...(holds.length ? [`No: it fails ${list(Array.from({ length: n }, (_, i) => i + 1))}`] : [])]
      : Array.from({ length: n }, (_, i) => `No: it fails equation ${i + 1}`);
    return {
      body: `Is ${math(tuple)} a solution of ${math(systemText(s.A, s.b))}?`,
      answer,
      distractors: distinct(answer, ['Yes: it satisfies every equation', ...(holds.includes(1) ? [] : ['Yes: it satisfies the first equation']), ...wrongNo]).slice(0, 3),
      solution: `Substitute into each equation. ${fails.length ? `${list(fails).replace(/^e/, 'E')} ${fails.length > 1 ? 'are' : 'is'} not satisfied, so it is not a solution.` : 'Every equation holds, so it is a solution.'}${difficulty === 3 ? ' (This system has infinitely many solutions; the point may or may not be one of them.)' : ''}`,
    };
  },
});

const KIND_TEXT = { unique: 'Exactly one solution', none: 'No solution', one: 'Infinitely many solutions (one parameter)', two: 'Infinitely many solutions (two parameters)' } as const;

export const xSysClassify = mb10i('10i-x-sys-classify', {
  points: 1,
  levels: { 1: 'Three variables: one, none, or a line of solutions', 2: 'Three variables, including a plane of solutions', 3: 'Four variables' },
  options: [
    radioOption('vars', 'Variables', [['2', '2'], ['3', '3'], ['4', '4']], ['3', '3', '4']),
    manyOption('kinds', 'Mix of systems', [['unique', 'One solution'], ['none', 'No solution'], ['one', 'One parameter'], ['two', 'Two parameters']], [['unique', 'none', 'one'], ['unique', 'none', 'one', 'two'], ['unique', 'none', 'one', 'two']], 'Each question is one of the checked kinds, chosen at random. Two parameters need at least three variables.'),
    sizeOption([5, 9, 12], [9, 9, 9], 'Largest coefficient'),
  ],
  generate(rng, difficulty, o) {
    const n = optNum(o, 'vars', difficulty === 3 ? 4 : 3);
    const wanted = optList(o, 'kinds', difficulty === 1 ? ['unique', 'none', 'one'] : ['unique', 'none', 'one', 'two']).filter((k) => k !== 'two' || n >= 3) as Array<keyof typeof KIND_TEXT>;
    const kind = rng.pick(wanted.length ? wanted : ['unique', 'none', 'one'] as Array<keyof typeof KIND_TEXT>);
    const r = kind === 'unique' ? n : kind === 'one' ? n - 1 : kind === 'two' ? n - 2 : rng.int(Math.max(1, n - 2), n - 1);
    const s = randomSystem(rng, { vars: n, eqs: n, rank: r, consistent: kind !== 'none', bound: Math.max(optNum(o, 'size', 9), r === 1 ? 12 : 0) });
    const rA = rank(toQ(s.A)), rAb = rank(toQ(augmented(s)));
    return {
      body: `How many solutions does this system have? ${math(systemText(s.A, s.b))}`,
      answer: KIND_TEXT[kind],
      distractors: Object.values(KIND_TEXT).filter((t) => t !== KIND_TEXT[kind]),
      solution: `${rowReduction(s)}. The coefficient matrix has rank ${rA} and the augmented matrix has rank ${rAb}. ${rA < rAb ? 'A row reads 0 = (non-zero), so the system is inconsistent.' : rA === n ? `Every one of the ${n} variables has a pivot: one solution.` : `${n - rA} variable${n - rA > 1 ? 's are' : ' is'} free, so the solutions need ${n - rA} parameter${n - rA > 1 ? 's' : ''}.`}`,
    };
  },
});

export const xSysParametric = mb10i('10i-x-sys-parametric', {
  levels: { 1: 'Three variables, one parameter', 2: 'Four variables, one parameter', 3: 'Two parameters' },
  options: [
    radioOption('vars', 'Variables', [['3', '3'], ['4', '4']], ['3', '4', '4']),
    radioOption('params', 'Parameters in the solution', [['1', 'One (t)'], ['2', 'Two (t and s)']], ['1', '1', '2']),
    radioOption('eqs', 'Equations', [['2', '2'], ['3', '3'], ['4', '4']], ['3', '3', '3'], 'A system needs at least as many independent equations as variables minus parameters.'),
  ],
  generate(rng, difficulty, o) {
    const vars = optNum(o, 'vars', difficulty === 1 ? 3 : 4), params = optNum(o, 'params', difficulty === 3 ? 2 : 1);
    const rank = vars - params;
    const eqs = Math.max(rank, optNum(o, 'eqs', 3));
    const spec = { vars, eqs, rank };
    const s = randomSystem(rng, { ...spec, consistent: true, bound: spec.rank === 1 ? 12 : 9 });
    const answer = solutionText(s.solution, spec.vars);
    const free = (s.solution as { free: number[] }).free;
    return {
      body: `Solve the system. Use ${free.length === 1 ? math('t') : `${math('t')} and ${math('s')}`} as ${free.length === 1 ? 'the parameter' : 'the parameters'}, for the free variable${free.length > 1 ? 's' : ''} in alphabetical order. ${math(systemText(s.A, s.b))}`,
      answer: math(answer),
      distractors: distinct(math(answer), wrongSolutions(rng, s.solution, spec.vars).map(math)),
      solution: `${rowReduction(s)}. The free variable${free.length > 1 ? 's are' : ' is'} ${free.map((f) => math(VARS[f])).join(' and ')}: let ${free.map((f, i) => math(`${VARS[f]} = ${PARAMS[i]}`)).join(', ')}. Solve each pivot row for its variable: ${math(answer)}${paramNote(s.solution)}.`,
    };
  },
});

/** An equation with one symbolic coefficient or constant: `k x`, `= m`. */
function symEquation(coefs: Array<number | string>, rhs: number | string): string {
  const parts: string[] = [];
  coefs.forEach((c, j) => {
    if (c === 0) return;
    if (typeof c === 'string') { parts.push(parts.length ? `+ ${c} ${VARS[j]}` : `${c} ${VARS[j]}`); return; }
    const text = new Q(Math.abs(c)).coef(VARS[j]);
    parts.push(parts.length ? `${c < 0 ? '-' : '+'} ${text}` : c < 0 ? `-${text}` : text);
  });
  return `${parts.join(' ')} = ${rhs}`;
}
function cofactor(A: number[][], i: number, j: number): Q {
  const minor = A.filter((_, r) => r !== i).map((row) => row.filter((_, c) => c !== j));
  const d = minor.length ? det(toQ(minor)) : new Q(1);
  return (i + j) % 2 ? d.neg() : d;
}

export const xSysParameterK = mb10i('10i-x-sys-parameter-k', {
  levels: { 1: 'Two equations, a parameter k', 2: 'Three equations, a parameter k', 3: 'Three equations, parameters k and m' },
  options: [
    radioOption('vars', 'Equations and variables', [['2', '2 × 2'], ['3', '3 × 3']], ['2', '3', '3']),
    radioOption('params', 'Parameters', [['k', 'k in a coefficient'], ['km', 'k in a coefficient and m in a constant']], ['k', 'k', 'km']),
  ],
  generate(rng, gl, o) {
    const n = optNum(o, 'vars', gl === 1 ? 2 : 3);
    const difficulty = optOne(o, 'params', gl === 3 ? 'km' : 'k') === 'km' ? 3 : 2;
    for (;;) {
      const consistent = difficulty === 3 ? true : rng.next() < 0.5;
      const s = randomSystem(rng, { vars: n, eqs: n, rank: n - 1, consistent });
      // A cell (i, j) whose cofactor is non-zero: then det is linear in k and vanishes only at the original entry.
      const cells = rng.shuffle(Array.from({ length: n * n }, (_, c) => [Math.floor(c / n), c % n] as [number, number]));
      const cell = cells.find(([i, j]) => {
        if (cofactor(s.A, i, j).n === 0 || s.A[i][j] === 0) return false;
        if (difficulty < 3) return true;
        const b2 = s.b.map((v, r) => (r === i ? v + 1 : v));
        return solve(toQ(s.A), qs(b2)).kind === 'none';
      });
      if (!cell) continue;
      const [i, j] = cell;
      const k0 = s.A[i][j], m0 = s.b[i];
      const eqs = s.A.map((row, r) => symEquation(row.map((c, cj) => (r === i && cj === j ? 'k' : c)), difficulty === 3 && r === i ? 'm' : s.b[r]));
      const system = `display(cases(${eqs.join(', ')}))`;
      if (difficulty === 3) {
        const answer = `Unique solution when ${math(`k != ${k0}`)}; infinitely many when ${math(`k = ${k0}`)} and ${math(`m = ${m0}`)}; no solution when ${math(`k = ${k0}`)} and ${math(`m != ${m0}`)}.`;
        return {
          body: `For which values of ${math('k')} and ${math('m')} does the system have a unique solution, infinitely many solutions, or no solution? ${math(system)}`,
          answer,
          distractors: distinct(answer, [
            `Unique solution when ${math(`k != ${k0}`)}; infinitely many when ${math(`k = ${k0}`)} and ${math(`m != ${m0}`)}; no solution when ${math(`k = ${k0}`)} and ${math(`m = ${m0}`)}.`,
            `Unique solution when ${math(`k != ${-k0}`)}; infinitely many when ${math(`k = ${-k0}`)} and ${math(`m = ${m0}`)}; no solution when ${math(`k = ${-k0}`)} and ${math(`m != ${m0}`)}.`,
            `Unique solution when ${math(`m != ${m0}`)}; infinitely many when ${math(`m = ${m0}`)}, for every ${math('k')}.`,
          ]),
          solution: `The determinant of the coefficient matrix is ${math(`${cofactor(s.A, i, j).typst()}(k - ${k0})`).replace('- -', '+ ')}, which is zero only at ${math(`k = ${k0}`)}; otherwise the solution is unique. At ${math(`k = ${k0}`)} the coefficient rows are dependent, and row reduction leaves ${math(`0 = (m - ${m0}) times c`)} for a non-zero ${math('c')}: infinitely many solutions if ${math(`m = ${m0}`)}, none otherwise.`.replace('(m - -', '(m + '),
        };
      }
      const at = consistent ? 'infinitely many solutions' : 'no solution';
      const other = consistent ? 'no solution' : 'infinitely many solutions';
      const answer = `Unique solution when ${math(`k != ${k0}`)}; ${at} when ${math(`k = ${k0}`)}.`;
      return {
        body: `For which values of ${math('k')} does the system have a unique solution? What happens otherwise? ${math(system)}`,
        answer,
        distractors: distinct(answer, [`Unique solution when ${math(`k != ${k0}`)}; ${other} when ${math(`k = ${k0}`)}.`, `Unique solution when ${math(`k != ${-k0}`)}; ${at} when ${math(`k = ${-k0}`)}.`, `Unique solution when ${math(`k != ${k0 + 1}`)}; ${at} when ${math(`k = ${k0 + 1}`)}.`, `A unique solution for every value of ${math('k')}.`]),
        solution: `The determinant is ${math(`${cofactor(s.A, i, j).typst()}(k - ${k0})`).replace('- -', '+ ')}, so the solution is unique unless ${math(`k = ${k0}`)}. At ${math(`k = ${k0}`)}: ${rowReduction({ ...s })}, which gives ${at}.`,
      };
    }
  },
});

export const xSysRrefRead = mb10i('10i-x-sys-rref-read', {
  points: 1,
  levels: { 1: 'A unique solution', 2: 'No solution or one parameter', 3: 'Four variables, one or two parameters' },
  options: [
    radioOption('form', 'Solution', [['1', 'A unique solution'], ['2', 'No solution or one parameter'], ['3', 'Four variables, one or two parameters']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const n = difficulty === 3 ? 4 : 3;
    const spec = difficulty === 1 ? { rank: 3, consistent: true } : difficulty === 2 ? rng.pick([{ rank: 2, consistent: false }, { rank: 2, consistent: true }]) : rng.pick([{ rank: 3, consistent: true }, { rank: 2, consistent: true }, { rank: 3, consistent: false }]);
    const s = randomSystem(rng, { vars: n, eqs: n, ...spec });
    const { R } = rref(toQ(augmented(s)));
    const answer = solutionText(s.solution, n);
    return {
      body: `The augmented matrix of a system in ${VARS.slice(0, n).map((v) => math(v)).join(', ')} reduces to ${math(matText(R, n))}. Write the solution${s.solution.kind === 'param' ? `, using ${s.solution.free.length > 1 ? `${math('t')} and ${math('s')}` : math('t')} for the free variable${s.solution.free.length > 1 ? 's' : ''}` : ''}.`,
      answer: math(answer),
      distractors: distinct(math(answer), wrongSolutions(rng, s.solution, n).map(math)),
      solution: s.solution.kind === 'none' ? 'A row reads 0 = (non-zero number), which is impossible, so there is no solution.' : s.solution.kind === 'unique' ? `Each row gives one variable directly: ${math(answer)}.` : `Columns without pivots are free variables. Solving each row for its pivot variable gives ${math(answer)}${paramNote(s.solution)}.`,
    };
  },
});

export const xSysProblem = mb10i('10i-x-sys-problem', {
  levels: { 1: 'Three numbers', 2: 'Three kinds of tickets', 3: 'Three investments' },
  options: [
    radioOption('form', 'Context', [['1', 'Three numbers'], ['2', 'Three kinds of tickets'], ['3', 'Three investments']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const a = rng.int(5, 40), c = rng.int(5, 40), k = rng.int(2, 3);
      let b = rng.int(5, 40);
      while (b === a) b = rng.int(5, 40);
      const d = a - b;
      const S = a + b + c, T = c + k * b;
      return {
        body: `The sum of three numbers is ${S}. The first is ${Math.abs(d)} ${d >= 0 ? 'more' : 'less'} than the second, and the third plus ${k} times the second is ${T}. Find the numbers.`,
        answer: `${a}, ${b}, ${c}`,
        distractors: distinct(`${a}, ${b}, ${c}`, [`${b}, ${a}, ${c}`, `${a + 1}, ${b + 1}, ${c - 2}`, `${c}, ${b}, ${a}`, `${a}, ${b - 1}, ${c + 1}`]),
        solution: `${math(systemText([[1, 1, 1], [1, -1, 0], [0, k, 1]], [S, d, T]))} gives ${math(`(x, y, z) = (${a}, ${b}, ${c})`)}.`,
      };
    }
    if (difficulty === 2) {
      const [pa, ps, pc] = [rng.pick([14, 15, 16]), rng.pick([8, 9, 10]), rng.pick([6, 7])];
      const c = rng.int(10, 40), s = 2 * c, a = rng.int(30, 120);
      const N = a + s + c, R = pa * a + ps * s + pc * c;
      return {
        body: `A theatre sold ${N} tickets for \\$${R}: adults \\$${pa}, students \\$${ps}, and seniors \\$${pc}. Twice as many student tickets as senior tickets were sold. How many of each were sold?`,
        answer: `${a} adult, ${s} student, ${c} senior`,
        distractors: distinct(`${a} adult, ${s} student, ${c} senior`, [`${s} adult, ${a} student, ${c} senior`, `${a + 2} adult, ${s - 2} student, ${c} senior`, `${a} adult, ${c} student, ${s} senior`]),
        solution: `${math(systemText([[1, 1, 1], [pa, ps, pc], [0, 1, -2]], [N, R, 0], ['a', 's', 'c']))} gives ${a} adult, ${s} student, and ${c} senior tickets.`,
      };
    }
    const x = rng.int(10, 60) * 100, y = rng.int(10, 60) * 100, z = x + rng.int(-5, 5) * 100;
    const total = x + y + z, interest = 0.03 * x + 0.04 * y + 0.05 * z, gap = z - x;
    const money = (v: number) => `\\$${v.toLocaleString('en-CA').replace(/,/g, ' ')}`;
    return {
      body: `${money(total)} is invested in three accounts paying 3%, 4%, and 5% per year, earning ${money(Math.round(interest * 100) / 100)} in one year. The amount at 5% is ${money(Math.abs(gap))} ${gap >= 0 ? 'more' : 'less'} than the amount at 3%. How much is in each account?`,
      answer: `${money(x)} at 3%, ${money(y)} at 4%, ${money(z)} at 5%`,
      distractors: distinct(`${money(x)} at 3%, ${money(y)} at 4%, ${money(z)} at 5%`, [`${money(z)} at 3%, ${money(y)} at 4%, ${money(x)} at 5%`, `${money(y)} at 3%, ${money(x)} at 4%, ${money(z)} at 5%`, `${money(x + 100)} at 3%, ${money(y - 200)} at 4%, ${money(z + 100)} at 5%`]),
      solution: `${math(systemText([[1, 1, 1], [3, 4, 5], [-1, 0, 1]], [total, Math.round(interest * 100), gap], ['a', 'b', 'c']))} (the interest equation is multiplied by 100 to clear the percents). Solving gives ${money(x)}, ${money(y)}, and ${money(z)}.`,
    };
  },
});

// ── Matrices ──────────────────────────────────────────────────────────────

const randMat = (rng: Rng, m: number, n: number, lo = -9, hi = 9) => Array.from({ length: m }, () => Array.from({ length: n }, () => rng.int(lo, hi)));
const matQ = (M: number[][]) => toQ(M);
/** An integer matrix with determinant ±1 (so its inverse is an integer matrix too). */
const unimodular = (rng: Rng, n: number, bound = 6) => randomSystem(rng, { vars: n, eqs: n, rank: n, consistent: true, bound }).A;

export const xMatDimensions = mb10i('10i-x-mat-dimensions', {
  points: 1,
  levels: { 1: 'Dimensions', 2: 'The entry a_ij', 3: 'Build a matrix from a rule' },
  options: [
    radioOption('form', 'Question', [['1', 'Dimensions'], ['2', 'The entry a_ij'], ['3', 'Build a matrix from a rule']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = rng.int(2, 4), n = rng.int(2, 4);
    if (difficulty === 3) {
      const [p, q] = [rng.int(1, 3), rng.nonZero(-2, 2)];
      const M = Array.from({ length: 2 }, (_, i) => Array.from({ length: 3 }, (_, j) => p * (i + 1) + q * (j + 1)));
      const rule = `a_(i j) = ${p === 1 ? '' : p}i ${q < 0 ? '-' : '+'} ${Math.abs(q) === 1 ? '' : Math.abs(q)}j`;
      return {
        body: `Write the ${math('2 times 3')} matrix with ${math(rule)}.`,
        answer: math(matText(M)),
        distractors: distinct(math(matText(M)), [matText(Array.from({ length: 2 }, (_, i) => Array.from({ length: 3 }, (_, j) => p * (j + 1) + q * (i + 1)))), matText(M.map((r) => r.map((v) => v + 1))), matText(Array.from({ length: 2 }, (_, i) => Array.from({ length: 3 }, (_, j) => p * i + q * j)))].map(math)),
        solution: `Row ${math('i')}, column ${math('j')}: for example ${math(`a_(1 1) = ${M[0][0]}`)} and ${math(`a_(2 3) = ${M[1][2]}`)}.`,
      };
    }
    const M = randMat(rng, m, n);
    if (difficulty === 1) {
      return {
        body: `What are the dimensions of ${math(matText(M))}?`,
        answer: math(`${m} times ${n}`),
        distractors: distinct(math(`${m} times ${n}`), [`${n} times ${m}`, `${m * n} times 1`, `${m + 1} times ${n}`, `${m} times ${n + 1}`].map(math)),
        solution: `Rows first, then columns: ${m} rows and ${n} columns, so ${math(`${m} times ${n}`)}.`,
      };
    }
    const i = rng.int(1, m), j = rng.int(1, n);
    let wrong = [M[j - 1]?.[i - 1], M[i - 1][n - j], M[m - i][j - 1], M[i - 1][j - 1] + 1].filter((v) => v !== undefined) as number[];
    wrong = wrong.map(Number);
    return {
      body: `For ${math(`A = ${matText(M)}`)}, what is ${math(`a_(${i} ${j})`)}?`,
      answer: math(String(M[i - 1][j - 1])),
      distractors: distinct(math(String(M[i - 1][j - 1])), [...wrong.map(String), String(-M[i - 1][j - 1]), String(M[i - 1][j - 1] + 2)].map(math)),
      solution: `${math(`a_(${i} ${j})`)} is in row ${i}, column ${j}: ${math(String(M[i - 1][j - 1]))}.`,
    };
  },
});

export const xMatAugmented = mb10i('10i-x-mat-augmented', {
  points: 1,
  levels: { 1: 'System to augmented matrix', 2: 'Augmented matrix to system', 3: 'With missing and rearranged terms' },
  options: [
    radioOption('form', 'Convert', [['1', 'System to augmented matrix'], ['2', 'Augmented matrix to system'], ['3', 'With missing and rearranged terms']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const s = randomSystem(rng, { vars: 3, eqs: 3, rank: 3, consistent: true });
    const aug = augmented(s);
    if (difficulty === 2) {
      const answer = systemText(s.A, s.b);
      const swapped = s.A.map((r) => [r[1], r[0], r[2]]);
      return {
        body: `Write the system (in ${math('x, y, z')}) whose augmented matrix is ${math(matText(aug, 3))}.`,
        answer: math(answer),
        distractors: distinct(math(answer), [systemText(swapped, s.b), systemText(s.A, s.b.map((v) => -v)), systemText(s.A.map((r, i) => [r[0], r[1], s.b[i]]), s.A.map((r) => r[2]))].map(math)),
        solution: `Each row is one equation; the columns are the coefficients of ${math('x, y, z')}, and the last column is the constants.`,
      };
    }
    // Level 3: move one term of each equation to the right and the constant to the left.
    const shown = difficulty === 3 ? s.A.map((row, i) => {
      const j = row.findIndex((c) => c !== 0);
      const left = row.map((c, k) => (k === j ? 0 : c));
      const right = equation(row.map((c, k) => (k === j ? -c : 0)), 0).split(' = ')[0];
      return `${equation(left, 0).split(' = ')[0]} ${-s.b[i] < 0 ? '-' : '+'} ${Math.abs(s.b[i])} = ${right}`.replace(' + 0 =', ' =').replace(' - 0 =', ' =');
    }) : null;
    const body = shown ? `display(cases(${shown.join(', ')}))` : systemText(s.A, s.b);
    const answer = matText(aug, 3);
    return {
      body: `Write the augmented matrix${shown ? ' (first rewrite each equation as ax + by + cz = d)' : ''}: ${math(body)}`,
      answer: math(answer),
      distractors: distinct(math(answer), [matText(aug.map((r) => [r[0], r[1], r[2], -r[3]]), 3), matText(aug.map((r) => [r[1], r[0], r[2], r[3]]), 3), matText(s.A.map((r, i) => [r[0], r[1], r[2], s.b[i]]).map((r) => r.map((v, k) => (k === 0 ? -v : v))), 3)].map(math)),
      solution: `${shown ? `Rewritten: ${math(systemText(s.A, s.b))}. ` : ''}Each row lists the coefficients of ${math('x, y, z')} (0 for a missing variable), then the constant after the bar.`,
    };
  },
});

export const xMatAddScalar = mb10i('10i-x-mat-add-scalar', {
  points: 1,
  levels: { 1: 'A + B or A − B', 2: 'kA', 3: 'pA − qB' },
  options: [
    radioOption('shape', 'Matrix size', [['mix', 'Mixed'], ['2x2', '2 × 2'], ['2x3', '2 × 3'], ['3x3', '3 × 3']], ['mix', 'mix', 'mix']),
    sizeOption([5, 6, 9, 20], [6, 6, 6], 'Largest entry'),
  ],
  generate(rng, difficulty, o) {
    const shape = optOne(o, 'shape', 'mix');
    const [m, n] = shape === 'mix' ? [rng.int(2, 3), rng.int(2, 3)] : shape.split('x').map(Number);
    const E = optNum(o, 'size', 6);
    const A = randMat(rng, m, n, -E, E), B = randMat(rng, m, n, -E, E);
    const [p, q, sub] = difficulty === 1 ? [1, 1, rng.next() < 0.5] : difficulty === 2 ? [rng.nonZero(-4, 4), 0, false] : [rng.int(2, 3), rng.int(2, 3), true];
    const R = add(scale(matQ(A), p), matQ(B), sub ? -q : q);
    const expr = difficulty === 1 ? `A ${sub ? '-' : '+'} B` : difficulty === 2 ? `${p}A` : `${p}A - ${q}B`;
    const offByOne = R.map((r, i) => r.map((v, j) => (i === 0 && j === 0 ? v.add(1) : v)));
    const wrongs = difficulty === 1
      ? [add(matQ(A), matQ(B), sub ? 1 : -1), sub ? add(matQ(B), matQ(A), -1) : add(matQ(A), matQ(B)).map((r) => r.map((v, j) => (j === 0 ? v.neg() : v))), offByOne]
      : difficulty === 2
        ? [matQ(A).map((r) => r.map((v) => v.add(p))), scale(matQ(A), -p), matQ(A).map((r, i) => (i === 0 ? r.map((v) => v.mul(p)) : r))]
        : [add(scale(matQ(A), p), matQ(B), -1), add(scale(matQ(A), p), scale(matQ(B), q)), offByOne];
    return {
      body: `For ${math(`A = ${matText(A)}`)}${difficulty === 2 ? '' : ` and ${math(`B = ${matText(B)}`)}`}, find ${math(expr)}.`,
      answer: math(matText(R)),
      distractors: distinct(math(matText(R)), wrongs.map((w) => math(matText(w)))),
      solution: `Work entry by entry: ${math(`${expr} = ${matText(R)}`)}.`,
    };
  },
});

export const xMatMultiply = mb10i('10i-x-mat-multiply', {
  levels: { 1: '2 × 2 times 2 × 2', 2: 'Different dimensions', 3: 'Is the product defined, and what size is it?' },
  options: [
    radioOption('shape', 'Sizes (levels 1 and 2)', [['22', '2 × 2 times 2 × 2'], ['23', '2 × 3 times 3 × 2'], ['33', '3 × 3 times 3 × 3'], ['31', '3 × 3 times 3 × 1'], ['mix', 'Mixed']], ['22', 'mix', 'mix'], 'Level 3 asks whether a product is defined instead.'),
    sizeOption([3, 5, 9], [5, 5, 5], 'Largest entry'),
  ],
  generate(rng, difficulty, o) {
    const shape = optOne(o, 'shape', difficulty === 1 ? '22' : 'mix');
    const E = optNum(o, 'size', 5);
    if (difficulty === 3) {
      const [m, n, p, q] = [rng.int(2, 4), rng.int(2, 4), rng.int(2, 4), rng.int(2, 4)];
      const defined = n === p;
      const answer = defined ? `Defined; ${math(`A B`)} is ${math(`${m} times ${q}`)}` : `Not defined: ${math('A')} has ${n} columns but ${math('B')} has ${p} rows`;
      return {
        body: `${math('A')} is ${math(`${m} times ${n}`)} and ${math('B')} is ${math(`${p} times ${q}`)}. Is ${math('A B')} defined? If so, what are its dimensions?`,
        answer,
        distractors: distinct(answer, [`Defined; ${math('A B')} is ${math(`${n} times ${p}`)}`, `Defined; ${math('A B')} is ${math(`${m} times ${q}`)}`, `Not defined: ${math('A')} has ${n} columns but ${math('B')} has ${p} rows`, `Defined; ${math('A B')} is ${math(`${q} times ${m}`)}`]),
        solution: `${math('A B')} needs the columns of ${math('A')} to match the rows of ${math('B')}: ${n} ${defined ? '=' : '≠'} ${p}.${defined ? ` The result has the rows of ${math('A')} and the columns of ${math('B')}.` : ''}`,
      };
    }
    const shapes: Record<string, number[]> = { 22: [2, 2, 2], 23: [2, 3, 2], 33: [3, 3, 3], 31: [3, 3, 1] };
    const [m, n, q] = shapes[shape] ?? rng.pick([[2, 3, 2], [3, 2, 3], [2, 3, 1], [3, 3, 1], [2, 2, 3]]);
    const A = randMat(rng, m, n, -E, E), B = randMat(rng, n, q, -E, E);
    const P = mul(matQ(A), matQ(B));
    const wrongs: Mat[] = [
      ...(m === q ? [mul(matQ(B), matQ(A))] : []),
      ...(m === n && n === q ? [matQ(A.map((r, i) => r.map((v, j) => v * B[i][j])))] : []),
      P.map((r, i) => r.map((v, j) => (i === 0 && j === 0 ? v.add(rng.nonZero(-3, 3)) : v))),
      P.map((r) => r.map((v) => v.neg())),
      P.map((r, i) => r.map((v, j) => (i === m - 1 && j === q - 1 ? v.sub(2) : v))),
    ];
    return {
      body: `Find ${math('A B')} for ${math(`A = ${matText(A)}`)} and ${math(`B = ${matText(B)}`)}.`,
      answer: math(matText(P)),
      distractors: distinct(math(matText(P)), wrongs.map((w) => math(matText(w)))),
      solution: `Entry (i, j) is row ${math('i')} of ${math('A')} times column ${math('j')} of ${math('B')}. For example, the top-left entry is ${math(`${A[0].map((v, k) => `(${v})(${B[k][0]})`).join(' + ')} = ${P[0][0].typst()}`)}. ${math(`A B = ${matText(P)}`)}.`,
    };
  },
});

export const xMatRowOps = mb10i('10i-x-mat-row-ops', {
  points: 1,
  levels: { 1: 'Swap or scale a row', 2: 'Add a multiple of one row to another', 3: 'Two operations in turn' },
  options: [
    radioOption('form', 'Operations', [['1', 'Swap or scale a row'], ['2', 'Add a multiple of one row to another'], ['3', 'Two operations in turn']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const M = randMat(rng, 3, 4, -6, 6);
    type Op = { text: string; apply: (X: number[][]) => number[][] };
    const swap = (): Op => { const [i, j] = rng.shuffle([0, 1, 2]).slice(0, 2); return { text: `R_${i + 1} <-> R_${j + 1}`, apply: (X) => X.map((r, k) => (k === i ? X[j] : k === j ? X[i] : r)) }; };
    const scaleOp = (): Op => { const i = rng.int(0, 2), k = rng.pick([2, 3, -1, -2]); return { text: `R_${i + 1} -> ${k === -1 ? '-' : k}R_${i + 1}`, apply: (X) => X.map((r, r2) => (r2 === i ? r.map((v) => v * k) : r)) }; };
    const addOp = (): Op => { const [i, j] = rng.shuffle([0, 1, 2]).slice(0, 2), k = rng.pick([2, 3, -2, -3, 1, -1]); return { text: `R_${i + 1} -> R_${i + 1} ${k < 0 ? '-' : '+'} ${Math.abs(k) === 1 ? '' : Math.abs(k)}R_${j + 1}`, apply: (X) => X.map((r, r2) => (r2 === i ? r.map((v, c) => v + k * X[j][c]) : r)) }; };
    const ops = difficulty === 1 ? [rng.pick([swap, scaleOp])()] : difficulty === 2 ? [addOp()] : [addOp(), addOp()];
    const result = ops.reduce((X, op) => op.apply(X), M);
    const wrong1 = ops.length === 2 ? ops[0].apply(M) : M.map((r, i) => (i === 0 ? r.map((v) => -v) : r));
    const wrong2 = result.map((r, i) => (i === 2 ? r.map((v, c) => (c === 3 ? v + 1 : v)) : r));
    const wrong3 = result.map((r) => [r[1], r[0], r[2], r[3]]);
    return {
      body: `Apply ${ops.map((o) => math(o.text)).join(', then ')} to ${math(matText(M, 3))}.`,
      answer: math(matText(result, 3)),
      distractors: distinct(math(matText(result, 3)), [wrong1, wrong2, wrong3].map((w) => math(matText(w, 3)))),
      solution: `Only the named row changes in each step${ops.length === 2 ? ', and the second step uses the rows after the first' : ''}: ${math(matText(result, 3))}.`,
    };
  },
});

export const xMatRref = mb10i('10i-x-mat-rref', {
  levels: { 1: 'A 3 × 4 matrix with three pivots', 2: 'A matrix with a free column', 3: 'The rank of a matrix' },
  options: [
    radioOption('form', 'Matrix', [['1', 'A 3 × 4 matrix with three pivots'], ['2', 'A matrix with a free column'], ['3', 'The rank of a matrix']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const r = difficulty === 1 ? 3 : difficulty === 2 ? 2 : rng.int(1, 3);
    const s = randomSystem(rng, { vars: 3, eqs: 3, rank: Math.min(r, 3), consistent: true, bound: 8 });
    const M = augmented(s);
    const { R, pivots } = rref(toQ(M));
    if (difficulty === 3) {
      const rk = pivots.length;
      return {
        body: `Find the rank of ${math(matText(M))}.`,
        answer: String(rk),
        distractors: ['1', '2', '3', '4'].filter((v) => v !== String(rk)),
        solution: `Row-reduce: ${math(matText(R))}. There ${rk === 1 ? 'is 1 non-zero row' : `are ${rk} non-zero rows`}, so the rank is ${rk}.`,
      };
    }
    const wrongs: Mat[] = [
      R.map((row, i) => row.map((v, j) => (i === 0 && j === 3 ? v.neg().add(v.n === 0 ? 1 : 0) : v))),
      R.map((row, i) => row.map((v, j) => (i === 1 && j === 3 ? v.add(1) : v))),
      // Row-echelon but not reduced: the first row still has an entry above the second pivot.
      R.map((row, i) => (i === 0 ? row.map((v, j) => v.add(R[1][j])) : row)),
    ];
    return {
      body: `Find the reduced row-echelon form of ${math(matText(M))}.`,
      answer: math(matText(R)),
      distractors: distinct(math(matText(R)), wrongs.map((w) => math(matText(w)))),
      solution: `Create a leading 1 in each pivot column and zeros above and below it, working left to right: ${math(matText(R))}.`,
    };
  },
});

export const xMatDeterminant = mb10i('10i-x-mat-determinant', {
  points: 1,
  levels: { 1: '2 × 2', 2: '3 × 3', 3: 'Find k so the matrix is singular' },
  options: [
    radioOption('n', 'Matrix size (levels 1 and 2)', [['2', '2 × 2'], ['3', '3 × 3'], ['4', '4 × 4']], ['2', '3', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Largest entry'),
  ],
  generate(rng, difficulty, o) {
    if (difficulty === 3) {
      for (;;) {
        const s = randomSystem(rng, { vars: 3, eqs: 3, rank: 2, consistent: true });
        const [i, j] = [rng.int(0, 2), rng.int(0, 2)];
        const c = cofactor(s.A, i, j);
        if (c.n === 0) continue;
        const k0 = s.A[i][j];
        const shown = s.A.map((row, r) => row.map((v, cj) => (r === i && cj === j ? 'k' : String(v))));
        return {
          body: `For what value of ${math('k')} is ${math(`mat(delim: "[", ${shown.map((r) => r.join(', ')).join('; ')})`)} singular (no inverse)?`,
          answer: math(`k = ${k0}`),
          distractors: distinct(math(`k = ${k0}`), [`k = ${-k0}`, `k = ${k0 + 1}`, `k = ${k0 - 2}`, 'k = 0'].map(math)),
          solution: `Expand along the row containing ${math('k')}: the determinant is ${math(`${c.coef('k')}${k0 === 0 ? '' : ` ${c.mul(-k0).sign < 0 ? '-' : '+'} ${c.mul(-k0).abs().typst()}`}`)}, which is zero when ${math(`k = ${k0}`)}.`,
        };
      }
    }
    const n = optNum(o, 'n', difficulty === 1 ? 2 : 3), E = optNum(o, 'size', 6);
    const M = randMat(rng, n, n, -E, E);
    const d = det(matQ(M));
    const diagonal = M.reduce((p, row, i) => p * row[i], 1);
    const wrong = n === 2 ? [M[0][0] * M[1][1] + M[0][1] * M[1][0], M[0][1] * M[1][0] - M[0][0] * M[1][1], M[0][0] * M[1][1]] : [d.neg().value, d.value + 2 * M[0][1] * cofactor(M, 0, 1).value, diagonal];
    return {
      body: `Find the determinant of ${math(matText(M))}.`,
      answer: math(d.typst()),
      distractors: distinct(math(d.typst()), [...wrong.map(String), String(d.value + 1)].map(math)),
      solution: n === 2
        ? `${math(`a d - b c = (${M[0][0]})(${M[1][1]}) - (${M[0][1]})(${M[1][0]}) = ${d.typst()}`)}.`
        : `Expand along the first row: each entry times its cofactor (the ${n - 1} × ${n - 1} minor with sign ${math('(-1)^(i + j)')}): ${math(`${M[0].map((v, j) => `(${v})(${cofactor(M, 0, j).typst()})`).join(' + ')} = ${d.typst()}`)}.`,
    };
  },
});

export const xMatInverse = mb10i('10i-x-mat-inverse', {
  levels: { 1: '2 × 2', 2: '3 × 3', 3: 'Invertible or not?' },
  options: [radioOption('n', 'Matrix size (levels 1 and 2)', [['2', '2 × 2'], ['3', '3 × 3']], ['2', '3', '3'])],
  generate(rng, difficulty, o) {
    if (difficulty === 3) {
      const singular = rng.next() < 0.5;
      const M = singular ? randomSystem(rng, { vars: 3, eqs: 3, rank: 2, consistent: true }).A : unimodular(rng, 3);
      const d = det(matQ(M));
      return {
        body: `Does ${math(matText(M))} have an inverse?`,
        answer: singular ? 'No: its determinant is 0' : `Yes: its determinant is ${math(d.typst())}`,
        distractors: singular ? [`Yes: its determinant is ${math('1')}`, 'Yes: every square matrix has an inverse', 'No: it has a negative entry'] : ['No: its determinant is 0', 'No: it has a negative entry', `Yes: its determinant is ${math(d.neg().add(d.eq(1) ? 1 : 0).typst())}`],
        solution: `A square matrix has an inverse exactly when its determinant is not 0. Here the determinant is ${math(d.typst())}.`,
      };
    }
    const n = optNum(o, 'n', difficulty === 1 ? 2 : 3);
    const M = n === 2 ? (() => { for (;;) { const X = randMat(rng, 2, 2, -6, 6); if (det(matQ(X)).n !== 0) return X; } })() : unimodular(rng, 3);
    const inv = inverse(matQ(M))!;
    const d = det(matQ(M));
    const wrongs: Mat[] = n === 2
      ? [scale(matQ([[M[1][1], -M[0][1]], [-M[1][0], M[0][0]]]), d.neg().eq(0) ? 1 : new Q(1).div(d.neg())), matQ([[M[1][1], -M[0][1]], [-M[1][0], M[0][0]]]), scale(matQ([[M[0][0], -M[0][1]], [-M[1][0], M[1][1]]]), new Q(1).div(d))]
      : [inv.map((r) => r.map((v) => v.neg())), inv.map((r, i) => r.map((v, j) => (i === j ? v.add(1) : v))), inv[0].map((_, j) => inv.map((r) => r[j]))];
    return {
      body: `Find the inverse of ${math(matText(M))}.`,
      answer: math(matText(inv)),
      distractors: distinct(math(matText(inv)), wrongs.map((w) => math(matText(w)))),
      solution: n === 2
        ? `${math(`A^(-1) = 1/(a d - b c) mat(delim: "[", d, -b; -c, a)`)} with ${math(`a d - b c = ${d.typst()}`)}: ${math(matText(inv))}. Check: ${math('A A^(-1) = I')}.`
        : `Row-reduce ${math('[A | I]')} to ${math('[I | A^(-1)]')}: ${math(matText(inv))}. Check: ${math('A A^(-1) = I')}.`,
    };
  },
});

export const xMatSolveInverse = mb10i('10i-x-mat-solve-inverse', {
  levels: { 1: '2 × 2, inverse given', 2: '2 × 2, find the inverse', 3: '3 × 3, inverse given' },
  options: [
    radioOption('form', 'Matrix', [['1', '2 × 2, inverse given'], ['2', '2 × 2, find the inverse'], ['3', '3 × 3, inverse given']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the solution'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const n = difficulty === 3 ? 3 : 2;
    const A = unimodular(rng, n);
    const x = Array.from({ length: n }, () => rng.int(-optNum(o, 'size', 6), optNum(o, 'size', 6)));
    const b = A.map((row) => dot(row, x));
    const inv = inverse(matQ(A))!;
    const answer = solutionText({ kind: 'unique', values: qs(x) }, n);
    const given = difficulty === 2 ? '' : ` given ${math(`A^(-1) = ${matText(inv)}`)}`;
    return {
      body: `Write the system as ${math('A X = B')} and solve it with ${math('X = A^(-1) B')}${given}: ${math(systemText(A, b))}`,
      answer: math(answer),
      distractors: distinct(math(answer), wrongSolutions(rng, { kind: 'unique', values: qs(x) }, n).slice(0, 4).map(math)),
      solution: `${difficulty === 2 ? `${math(`A^(-1) = ${matText(inv)}`)}. ` : ''}${math(`X = A^(-1) B = ${matText(inv)} ${matText(b.map((v) => [v]))} = ${matText(x.map((v) => [v]))}`)}.`,
    };
  },
});

// ── Lines and planes ──────────────────────────────────────────────────────

const plane = (n: number[], d: number) => equation(n, d);
function randomNormal(rng: Rng): V3 {
  for (;;) { const v: V3 = [rng.int(-5, 5), rng.int(-5, 5), rng.int(-5, 5)]; if (v.filter((x) => x !== 0).length >= 2) return v; }
}
const lineText = (p: number[], d: number[], param: string) => `(x, y, z) = ${vec(p)} + ${param} ${vec(d)}`;

export const xPlaneNormal = mb10i('10i-x-plane-normal', {
  points: 1,
  levels: { 1: 'Normal vector', 2: 'Is a point on the plane?', 3: 'Write the plane from a normal and a point' },
  options: [
    radioOption('form', 'Task', [['1', 'Normal vector'], ['2', 'Is a point on the plane?'], ['3', 'Write the plane from a normal and a point']], ['1', '2', '3']),
    sizeOption([2, 4, 6], [4, 4, 4], 'Size of the point'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const n = randomNormal(rng), p = [0, 0, 0].map(() => rng.int(-optNum(o, 'size', 4), optNum(o, 'size', 4))), d = dot(n, p);
    if (difficulty === 1) {
      return {
        body: `Give a normal vector of the plane ${math(plane(n, d))}.`,
        answer: math(vec(n)),
        distractors: distinct(math(vec(n)), [vec([n[0], n[1], d]), vec([n[1], n[0], n[2]]), vec(p), vec([n[0], n[1], -n[2]])].map(math)),
        solution: `The coefficients of ${math('x, y, z')} form a normal vector: ${math(vec(n))} (any non-zero multiple also works).`,
      };
    }
    if (difficulty === 2) {
      const on = rng.next() < 0.5, q = on ? p : p.map((v, i) => (i === 0 ? v + 1 : v));
      const val = dot(n, q);
      const answer = on ? `Yes: ${math(`${val} = ${d}`)}` : `No: the left side is ${math(String(val))}, not ${math(String(d))}`;
      return {
        body: `Is ${math(vec(q))} on the plane ${math(plane(n, d))}?`,
        answer,
        distractors: distinct(answer, [on ? `No: the left side is ${math(String(val + 1))}, not ${math(String(d))}` : `Yes: ${math(`${d} = ${d}`)}`, 'Yes: every point with integer coordinates is on it', `No: the point is a normal vector`]),
        solution: `Substitute: ${math(`${n.map((c, i) => `(${c})(${q[i]})`).join(' + ')} = ${val}`)}. ${on ? 'It equals the constant, so the point is on the plane.' : 'It does not equal the constant.'}`,
      };
    }
    return {
      body: `Write the equation of the plane through ${math(vec(p))} with normal vector ${math(vec(n))}.`,
      answer: math(plane(n, d)),
      distractors: distinct(math(plane(n, d)), [plane(n, -d), plane(p, dot(p, n)), plane(n, d + 1), plane([n[0], n[1], -n[2]], d)].map(math)),
      solution: `The plane is ${math('a x + b y + c z = d')} with ${math(`(a, b, c) = ${vec(n)}`)}; substitute the point for ${math('d')}: ${math(`d = ${d}`)}.`,
    };
  },
});

type PlaneRel = 'parallel' | 'coincident' | 'perpendicular' | 'intersecting';
const REL_TEXT: Record<PlaneRel, string> = { parallel: 'Parallel (distinct)', coincident: 'Coincident (the same plane)', perpendicular: 'Perpendicular', intersecting: 'Intersecting in a line, not perpendicular' };

export const xPlaneRelation = mb10i('10i-x-plane-relation', {
  points: 1,
  levels: { 1: 'Parallel or not', 2: 'Parallel, coincident, or intersecting', 3: 'Including perpendicular planes' },
  options: [
    radioOption('form', 'Planes', [['1', 'Parallel or not'], ['2', 'Parallel, coincident, or intersecting'], ['3', 'Including perpendicular planes']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const kinds: PlaneRel[] = difficulty === 1 ? ['parallel', 'intersecting'] : difficulty === 2 ? ['parallel', 'coincident', 'intersecting'] : ['parallel', 'coincident', 'perpendicular', 'intersecting'];
    const kind = rng.pick(kinds);
    const n1 = randomNormal(rng), d1 = rng.int(-9, 9), k = rng.pick([2, -2, 3, -1]);
    let n2: number[], d2: number;
    if (kind === 'parallel') { n2 = n1.map((v) => v * k); d2 = d1 * k + rng.nonZero(-4, 4); }
    else if (kind === 'coincident') { n2 = n1.map((v) => v * k); d2 = d1 * k; }
    else {
      for (;;) {
        if (kind === 'perpendicular') {
          // A vector perpendicular to n1: the cross product with any non-parallel vector, reduced.
          const c = cross(n1, randomNormal(rng));
          const g = c.reduce((a, b) => gcdN(a, b), 0);
          if (!g) continue;
          n2 = c.map((v) => v / g);
          if (n2.some((v) => Math.abs(v) > 12)) continue;
          break;
        }
        n2 = randomNormal(rng);
        if (isZero(cross(n1, n2 as V3)) || dot(n1, n2) === 0) continue;
        break;
      }
      d2 = rng.int(-9, 9);
    }
    const answer = REL_TEXT[kind];
    return {
      body: `How are the planes ${math(plane(n1, d1))} and ${math(plane(n2, d2))} related?`,
      answer,
      distractors: Object.values(REL_TEXT).filter((t) => t !== answer),
      solution: kind === 'parallel' ? `The normals are proportional (factor ${k}) but the constants are not, so the planes are parallel and distinct.` : kind === 'coincident' ? `The whole second equation is ${k} times the first, so they describe the same plane.` : `The normals are not proportional, so the planes meet in a line. Their dot product is ${math(`${vec(n1)} dot ${vec(n2)} = ${dot(n1, n2)}`)}${kind === 'perpendicular' ? ', so they are perpendicular.' : ', so they are not perpendicular.'}`,
    };
  },
});
function gcdN(a: number, b: number): number { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }

export const xPlaneIntersection = mb10i('10i-x-plane-intersection', {
  levels: { 1: 'Small coefficients', 2: 'Any coefficients', 3: 'Write it as a point and a direction vector' },
  options: [
    radioOption('form', 'Coefficients', [['1', 'Small coefficients'], ['2', 'Any coefficients'], ['3', 'Write it as a point and a direction vector']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const s = randomSystem(rng, { vars: 3, eqs: 2, rank: 2, consistent: true, bound: difficulty === 1 ? 5 : 9 });
    const sol = s.solution as Extract<Solution, { kind: 'param' }>;
    const P = sol.exprs.map((e) => e.c), D = sol.exprs.map((e) => e.coefs[0]);
    const answer = difficulty === 3 ? `(x, y, z) = ${vec(P)} + t ${vec(D)}` : solutionText(sol, 3);
    const wrongs = difficulty === 3
      ? [`(x, y, z) = ${vec(D)} + t ${vec(P)}`, `(x, y, z) = ${vec(P)} + t ${vec(D.map((v, i) => (i === 0 ? v.neg() : v)))}`, `(x, y, z) = ${vec(P.map((v) => v.neg()))} + t ${vec(D)}`]
      : wrongSolutions(rng, sol, 3).slice(0, 4);
    return {
      body: `Find the line of intersection of the planes ${math(plane(s.A[0], s.b[0]))} and ${math(plane(s.A[1], s.b[1]))}${difficulty === 3 ? ', as a point plus a multiple of a direction vector' : `. Use ${math('t')} for the free variable`}.`,
      answer: math(answer),
      distractors: distinct(math(answer), wrongs.map(math)),
      solution: `Solve the two equations together: ${rowReduction(s)}. With the free variable as ${math('t')}: ${math(solutionText(sol, 3))}, which is the point ${math(vec(P))} plus ${math('t')} times the direction ${math(vec(D))}.`,
    };
  },
});

type Config = 'point' | 'line' | 'prism' | 'parallelPair' | 'allParallel' | 'same' | 'twoSame';
const CONFIG_TEXT: Record<Config, string> = {
  point: 'They meet at a single point',
  line: 'They meet in a common line',
  twoSame: 'Two are the same plane, and the third cuts it in a line',
  prism: 'No common point: each pair meets in a line (a triangular prism)',
  parallelPair: 'No common point: two of the planes are parallel',
  allParallel: 'No common point: all three planes are parallel',
  same: 'They are all the same plane',
};
const proportional = (a: number[], b: number[]) => isZero(cross(a as V3, b as V3));

export const xThreePlanes = mb10i('10i-x-three-planes', {
  levels: { 1: 'A point, a line, or no common point', 2: 'Prism or parallel planes', 3: 'Any arrangement' },
  options: [
    radioOption('form', 'Arrangement', [['1', 'A point, a line, or no common point'], ['2', 'Prism or parallel planes'], ['3', 'Any arrangement']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const pool: Config[] = difficulty === 1 ? ['point', 'line', 'prism'] : difficulty === 2 ? ['prism', 'parallelPair', 'allParallel', 'line'] : ['point', 'line', 'twoSame', 'prism', 'parallelPair', 'allParallel', 'same'];
    const kind = rng.pick(pool);
    let A: number[][] = [], b: number[] = [];
    for (let tries = 0; tries < 200; tries++) {
      if (kind === 'point') { const s = randomSystem(rng, { vars: 3, eqs: 3, rank: 3, consistent: true }); A = s.A; b = s.b; }
      else if (kind === 'line' || kind === 'prism') { const s = randomSystem(rng, { vars: 3, eqs: 3, rank: 2, consistent: kind === 'line' }); A = s.A; b = s.b; }
      else {
        const n1 = randomNormal(rng), d1 = rng.int(-6, 6);
        const k2 = rng.pick([2, -1, 3]), k3 = rng.pick([-2, 1, 2]);
        if (kind === 'allParallel') { A = [n1, n1.map((v) => v * k2), n1.map((v) => v * k3)]; b = [d1, d1 * k2 + rng.nonZero(-4, 4), d1 * k3 + rng.nonZero(-4, 4)]; if (b[1] / k2 === b[2] / k3) continue; }
        else if (kind === 'same') { A = [n1, n1.map((v) => v * k2), n1.map((v) => v * k3)]; b = [d1, d1 * k2, d1 * k3]; }
        else { const n3 = randomNormal(rng); if (proportional(n1, n3)) continue; const d3 = rng.int(-6, 6); A = [n1, n1.map((v) => v * k2), n3]; b = [d1, kind === 'twoSame' ? d1 * k2 : d1 * k2 + rng.nonZero(-4, 4), d3]; }
        const order = rng.shuffle([0, 1, 2]); A = order.map((i) => A[i]); b = order.map((i) => b[i]);
      }
      // A prism or a common line has no two parallel planes.
      const pairs = [[0, 1], [0, 2], [1, 2]].some(([i, j]) => proportional(A[i], A[j]));
      if ((kind === 'prism' || kind === 'line' || kind === 'point') && pairs) continue;
      break;
    }
    const s = solve(toQ(A), qs(b));
    const answer = kind === 'point' ? `${CONFIG_TEXT.point}, ${math(solutionText(s, 3))}` : CONFIG_TEXT[kind];
    const others = (Object.keys(CONFIG_TEXT) as Config[]).filter((c) => c !== kind).map((c) => (c === 'point' ? `${CONFIG_TEXT.point}, ${math('(0, 0, 0)')}` : CONFIG_TEXT[c]));
    const rA = rank(toQ(A)), rAb = rank(toQ(A.map((r, i) => [...r, b[i]])));
    return {
      body: `Describe how the three planes intersect: ${math(systemText(A, b))}`,
      answer,
      distractors: rng.shuffle(others).slice(0, 3),
      solution: `The coefficient matrix has rank ${rA} and the augmented matrix has rank ${rAb}. ${rAb > rA ? `The system is inconsistent, so there is no common point; ${kind === 'prism' ? 'no two normals are parallel, so the planes form a prism' : kind === 'parallelPair' ? 'two normals are proportional, so two planes are parallel' : 'all three normals are proportional, so all three planes are parallel'}.` : rA === 3 ? `The solution is unique: ${math(solutionText(s, 3))}.` : rA === 2 ? `One free variable: the solutions form a line${kind === 'twoSame' ? ' (two equations are multiples of each other)' : ''}.` : 'Every equation is a multiple of the first: one plane.'}`,
    };
  },
});

type LineRel = 'parallel' | 'coincident' | 'intersecting' | 'skew';

export const xLineRelation = mb10i('10i-x-line-relation', {
  levels: { 1: 'Parallel or intersecting', 2: 'Parallel, intersecting, or skew', 3: 'Any, with the point of intersection' },
  options: [
    radioOption('form', 'Lines', [['1', 'Parallel or intersecting'], ['2', 'Parallel, intersecting, or skew'], ['3', 'Any, with the point of intersection']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const kinds: LineRel[] = difficulty === 1 ? ['parallel', 'intersecting'] : difficulty === 2 ? ['parallel', 'intersecting', 'skew'] : ['parallel', 'coincident', 'intersecting', 'skew'];
    const kind = rng.pick(kinds);
    const d1 = randomNormal(rng);
    let p1: number[], p2: number[], d2: number[], X: number[] | null = null;
    for (;;) {
      p1 = [rng.int(-5, 5), rng.int(-5, 5), rng.int(-5, 5)];
      if (kind === 'parallel' || kind === 'coincident') {
        const k = rng.pick([2, -1, -2, 3]);
        d2 = d1.map((v) => v * k);
        const a = rng.nonZero(-3, 3);
        p2 = kind === 'coincident' ? p1.map((v, i) => v + a * d1[i]) : p1.map((v, i) => v + a * d1[i] + (i === 0 ? rng.nonZero(-3, 3) : 0));
        if (kind === 'parallel' && isZero(cross(d1, p2.map((v, i) => v - p1[i]) as V3))) continue;
      } else {
        d2 = randomNormal(rng);
        if (isZero(cross(d1, d2 as V3))) continue;
        if (kind === 'intersecting') { const a = rng.nonZero(-3, 3), c = rng.nonZero(-3, 3); X = p1.map((v, i) => v + a * d1[i]); p2 = X.map((v, i) => v - c * d2[i]); }
        else { p2 = [rng.int(-5, 5), rng.int(-5, 5), rng.int(-5, 5)]; }
        const meet = solve(toQ([0, 1, 2].map((i) => [d1[i], -d2[i]])), qs(p2.map((v, i) => v - p1[i])));
        if (kind === 'skew' && meet.kind !== 'none') continue;
      }
      break;
    }
    const text = { parallel: 'Parallel and distinct', coincident: 'Coincident (the same line)', skew: 'Skew: not parallel and never meeting', intersecting: `Intersecting${difficulty === 3 && X ? ` at ${math(vec(X))}` : ''}` };
    const answer = text[kind];
    const wrongPoint = X ? `Intersecting at ${math(vec(X.map((v, i) => v + d1[i])))}` : `Intersecting at ${math(vec(p1))}`;
    return {
      body: `How are the lines ${math(lineText(p1, d1, 't'))} and ${math(lineText(p2, d2, 's'))} related?`,
      answer,
      distractors: distinct(answer, [...(Object.keys(text) as LineRel[]).filter((k) => k !== kind).map((k) => (k === 'intersecting' && difficulty === 3 ? wrongPoint : text[k].replace(/ at .*/, ''))), ...(kind === 'intersecting' && difficulty === 3 ? [wrongPoint] : [])]).slice(0, 3),
      solution: kind === 'parallel' || kind === 'coincident'
        ? `The directions are proportional, so the lines are parallel. ${kind === 'coincident' ? `The point ${math(vec(p2))} is on the first line, so they are the same line.` : `The point ${math(vec(p2))} is not on the first line, so they are distinct.`}`
        : `The directions are not proportional. Setting the coordinates equal gives three equations in ${math('t')} and ${math('s')}; ${kind === 'intersecting' ? `they have a solution, giving the point ${math(vec(X!))}.` : 'they have no solution, so the lines are skew.'}`,
    };
  },
});

export const xLinePlane = mb10i('10i-x-line-plane', {
  levels: { 1: 'Where a line meets a plane', 2: 'Parallel or meeting at a point', 3: 'Parallel, in the plane, or meeting at a point' },
  options: [
    radioOption('form', 'Question', [['1', 'Where a line meets a plane'], ['2', 'Parallel or meeting at a point'], ['3', 'Parallel, in the plane, or meeting at a point']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const n = randomNormal(rng);
    const kind = difficulty === 1 ? 'point' : rng.pick(difficulty === 2 ? ['point', 'parallel'] : ['point', 'parallel', 'inside']);
    let d: number[];
    for (;;) { d = randomNormal(rng); const nd = dot(n, d); if ((kind === 'point') === (nd !== 0)) break; if (kind !== 'point') { const c = cross(n as V3, randomNormal(rng)); if (!isZero(c) && c.every((v) => Math.abs(v) <= 12)) { d = c; break; } } }
    const X = [rng.int(-4, 4), rng.int(-4, 4), rng.int(-4, 4)], c0 = dot(n, X);
    const t0 = rng.nonZero(-3, 3);
    const P = kind === 'parallel' ? X.map((v, i) => v + n[i] - t0 * d[i]) : X.map((v, i) => v - t0 * d[i]);
    const c = kind === 'parallel' ? c0 : c0;
    const texts = { point: `They meet at ${math(vec(X))}`, parallel: 'The line is parallel to the plane and does not meet it', inside: 'The line lies in the plane' };
    const answer = texts[kind as keyof typeof texts];
    return {
      body: `How does the line ${math(lineText(P, d, 't'))} meet the plane ${math(plane(n, c))}?`,
      answer,
      distractors: distinct(answer, [texts.parallel, texts.inside, `They meet at ${math(vec(P))}`, `They meet at ${math(vec(X.map((v, i) => v + d[i])))}`, texts.point]).slice(0, 3),
      solution: `Substitute the line into the plane: the coefficient of ${math('t')} is ${math(`${vec(n)} dot ${vec(d)} = ${dot(n, d)}`)}. ${kind === 'point' ? `So ${math(`t = ${t0}`)}, giving the point ${math(vec(X))}.` : kind === 'inside' ? 'It is 0 and the equation holds for every t, so the line lies in the plane.' : 'It is 0 but the constants disagree, so there is no solution: the line is parallel to the plane.'}`,
    };
  },
});

export const ADVANCED_10I = [
  xSysSolve, xSysVerify, xSysClassify, xSysParametric, xSysParameterK, xSysRrefRead, xSysProblem,
  xMatDimensions, xMatAugmented, xMatAddScalar, xMatMultiply, xMatRowOps, xMatRref, xMatDeterminant, xMatInverse, xMatSolveInverse,
  xPlaneNormal, xPlaneRelation, xPlaneIntersection, xThreePlanes, xLineRelation, xLinePlane,
];

