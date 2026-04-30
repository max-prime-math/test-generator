/**
 * Client-side LaTeX → Typst converter.
 *
 * Handles the structural and text-mode pieces of LaTeX commonly found in math
 * textbook questions, while delegating actual math rendering to MiTeX.
 * Unknown commands outside math are stripped (the backslash + name removed)
 * rather than throwing, so partial conversions are always usable.
 */

import { splitFilename } from './image-store.svelte';
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';
import {
  createTypstCompiler,
  type TypstCompiler,
  FetchPackageRegistry,
  MemoryAccessModel,
  initOptions,
} from '@myriaddreamin/typst.ts';
import { disableDefaultFontAssets } from '@myriaddreamin/typst.ts/options.init';

// ── Format auto-detection ────────────────────────────────────────────────────

const LATEX_SIGNALS = [
  /\\frac\s*\{/,
  /\\begin\s*\{/,
  /\\sqrt\s*[\[{]/,
  /\\(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|omega|phi|psi|chi|rho|tau|nu|xi|eta|kappa)\b/,
  /\\(?:int|sum|prod|lim|infty|partial|nabla)\b/,
  /\\(?:leq|geq|neq|approx|equiv|in|notin|subset|cup|cap)\b/,
  /\\(?:textbf|textit|emph|text|mathbb|mathbf|vec|hat|bar|overline|tilde)\s*\{/,
  /\$\$[\s\S]+?\$\$/,
  /\\left\s*[([{|]/,
  /\\item\b/,
  /\\begin\s*\{tasks\}/,
  /\\task\b/,
  /\\[a-zA-Z]{2,}/,  // catch-all: any multi-letter backslash command is LaTeX
];

export function detectFormat(src: string): 'latex' | 'typst' {
  return LATEX_SIGNALS.some((re) => re.test(src)) ? 'latex' : 'typst';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the contents of the first balanced `{…}` group starting at `pos`
 * (pos should be the index of the opening brace).
 * Returns [content, indexAfterClosingBrace].
 */
function extractBraces(src: string, pos: number): [string, number] {
  let depth = 0;
  let start = -1;
  for (let i = pos; i < src.length; i++) {
    if (src[i] === '{') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (src[i] === '}') {
      depth--;
      if (depth === 0) return [src.slice(start, i), i + 1];
    }
  }
  return [src.slice(pos), src.length];
}

/** Replace all occurrences of a regex with a callback, non-overlapping. */
function replaceAll(src: string, re: RegExp, fn: (m: RegExpExecArray) => string): string {
  re.lastIndex = 0;
  let result = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    result += src.slice(last, m.index) + fn(m);
    last = m.index + m[0].length;
    if (!re.global) break;
  }
  return result + src.slice(last);
}

/** Legacy math converter retained as a fallback/reference implementation. */
function convertMath(math: string): string {
  let s = math;

  // \left / \right wrappers — strip, keep the delimiter
  s = s.replace(/\\left\s*\\\{/g, '{');
  s = s.replace(/\\right\s*\\\}/g, '}');
  s = s.replace(/\\left\s*\\\[/g, '[');
  s = s.replace(/\\right\s*\\\]/g, ']');
  s = s.replace(/\\left\s*\|/g, '|');
  s = s.replace(/\\right\s*\|/g, '|');
  s = s.replace(/\\left\s*\./g, '');
  s = s.replace(/\\right\s*\./g, '');
  s = s.replace(/\\left\s*([([<])/g, '$1');
  s = s.replace(/\\right\s*([)\]>])/g, '$1');

  // \frac{a}{b} → frac(a, b)  — must be done before generic brace stripping
  s = convertFrac(s);

  // \sqrt[n]{x} → root(n, x)  and  \sqrt{x} → sqrt(x)
  s = convertSqrt(s);

  // \text{…} → "…"
  s = s.replace(/\\text\s*\{([^}]*)\}/g, '"$1"');

  // \mathbb{R/Z/N/C/Q} → double-struck letters
  const MATHBB: Record<string, string> = {
    R: 'RR', Z: 'ZZ', N: 'NN', C: 'CC', Q: 'QQ',
  };
  s = s.replace(/\\mathbb\s*\{([A-Z])\}/g, (_, l) => MATHBB[l] ?? l);

  // \mathbf{x} → bold(x)
  s = s.replace(/\\mathbf\s*\{([^}]*)\}/g, 'bold($1)');

  // Decorators: \vec \hat \bar \overline \underline \tilde \widehat \widetilde
  const DECORATORS: Record<string, string> = {
    vec: 'arrow', hat: 'hat', bar: 'macron', overline: 'overline',
    underline: 'underline', tilde: 'tilde', widehat: 'hat', widetilde: 'tilde',
    dot: 'dot', ddot: 'dot.double',
  };
  for (const [cmd, typst] of Object.entries(DECORATORS)) {
    s = s.replace(new RegExp(`\\\\${cmd}\\s*\\{([^}]*)\\}`, 'g'), `${typst}($1)`);
  }

  // Greek letters
  const GREEK: Record<string, string> = {
    alpha: 'alpha', beta: 'beta', gamma: 'gamma', Gamma: 'Gamma',
    delta: 'delta', Delta: 'Delta', epsilon: 'epsilon', varepsilon: 'epsilon',
    zeta: 'zeta', eta: 'eta', theta: 'theta', Theta: 'Theta',
    vartheta: 'theta.alt', iota: 'iota', kappa: 'kappa',
    lambda: 'lambda', Lambda: 'Lambda', mu: 'mu', nu: 'nu',
    xi: 'xi', Xi: 'Xi', pi: 'pi', Pi: 'Pi', varpi: 'pi.alt',
    rho: 'rho', varrho: 'rho.alt', sigma: 'sigma', Sigma: 'Sigma',
    varsigma: 'sigma.alt', tau: 'tau', upsilon: 'upsilon', Upsilon: 'Upsilon',
    phi: 'phi', Phi: 'Phi', varphi: 'phi.alt', chi: 'chi',
    psi: 'psi', Psi: 'Psi', omega: 'omega', Omega: 'Omega',
  };
  for (const [cmd, typst] of Object.entries(GREEK)) {
    s = s.replace(new RegExp(`\\\\${cmd}(?![a-zA-Z])`, 'g'), typst);
  }

  // Named functions (strip backslash — Typst uses bare names).
  // Use (?![a-zA-Z]) instead of \b because JS \b treats _ as a word char,
  // which means \int\b fails to match \int_ (subscript without space).
  const FUNCS = [
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh',
    'ln', 'log', 'exp', 'det', 'dim', 'ker', 'deg',
    'gcd', 'lcm', 'min', 'max', 'inf', 'sup',
    'lim', 'liminf', 'limsup',
  ];
  for (const fn of FUNCS) {
    s = s.replace(new RegExp(`\\\\${fn}(?![a-zA-Z])`, 'g'), fn);
  }

  // Inverse trig not built into Typst math — render as upright operators
  const INV_TRIG: Record<string, string> = {
    arcsec: 'op("arcsec")', arccsc: 'op("arccsc")', arccot: 'op("arccot")',
  };
  for (const [cmd, typst] of Object.entries(INV_TRIG)) {
    s = s.replace(new RegExp(`\\\\${cmd}(?![a-zA-Z])`, 'g'), typst);
  }

  // Big operators
  const BIG_OPS: Record<string, string> = {
    int: 'integral', iint: 'integral.double', iiint: 'integral.triple',
    oint: 'integral.cont',
    sum: 'sum', prod: 'product', coprod: 'product.co',
    bigcup: 'union.big', bigcap: 'sect.big', bigoplus: 'plus.circle.big',
  };
  for (const [cmd, typst] of Object.entries(BIG_OPS)) {
    s = s.replace(new RegExp(`\\\\${cmd}(?![a-zA-Z])`, 'g'), typst);
  }

  // Relations and symbols
  const SYMBOLS: Record<string, string> = {
    infty: 'infinity', partial: 'partial', nabla: 'nabla',
    'ell': 'ell', hbar: 'planck.reduce',
    leq: '<=', le: '<=', geq: '>=', ge: '>=',
    neq: '!=', ne: '!=', approx: 'approx', equiv: 'equiv',
    sim: 'tilde.op', simeq: 'tilde.eq', cong: 'tilde.equiv',
    propto: 'prop',
    'in': 'in', notin: 'in.not',
    subset: 'subset', subseteq: 'subset.eq', supset: 'supset', supseteq: 'supset.eq',
    cup: 'union', cap: 'sect', setminus: 'without', emptyset: 'nothing',
    forall: 'forall', exists: 'exists', nexists: 'exists.not',
    neg: 'not', lnot: 'not', land: 'and', lor: 'or',
    cdot: 'dot.op', times: 'times', div: 'div', pm: 'plus.minus', mp: 'minus.plus',
    otimes: 'times.circle', oplus: 'plus.circle',
    to: '->', rightarrow: '->',  leftarrow: '<-',
    Rightarrow: '=>', Leftarrow: '<=',
    leftrightarrow: '<->', Leftrightarrow: '<=>',
    mapsto: '|->',
    uparrow: 'arrow.t', downarrow: 'arrow.b',
    ldots: 'dots.h', cdots: 'dots.h', vdots: 'dots.v', ddots: 'dots.down',
    'therefore': 'therefore', because: 'because',
    angle: 'angle', perp: 'perp', parallel: 'parallel',
    triangle: 'triangle', square: 'square',
    star: 'star', dagger: 'dagger', ddagger: 'dagger.double',
  };
  for (const [cmd, typst] of Object.entries(SYMBOLS)) {
    s = s.replace(new RegExp(`\\\\${cmd}(?![a-zA-Z])`, 'g'), typst);
  }

  // Differential notation: d followed by a single letter is a differential,
  // not a two-letter identifier. Add a space so Typst parses them separately.
  // Run after all other conversions so 'det', 'delta' etc. are already gone.
  s = s.replace(/\bd([a-zA-Z])(?=[^a-zA-Z]|$)/g, 'd $1');

  // \not\in → in.not, \not\subset → subset.not, etc. (generic \not)
  s = s.replace(/\\not\s*(<|>|=)/g, (_, c) => `${c}.not`);

  // \operatorname{name} → name
  s = s.replace(/\\operatorname\s*\{([^}]+)\}/g, '$1');

  // Spacing commands → single space or nothing
  s = s.replace(/\\(?:quad|qquad)/g, '  ');
  s = s.replace(/\\[,;:!]\s*/g, ' ');
  s = s.replace(/\\(?:,|;|:|!)\s*/g, ' ');

  // \over → /  (e.g.  a \over b → a / b)
  s = s.replace(/\s*\\over\s*/g, ' / ');

  // Strip \displaystyle, \textstyle, \scriptstyle, \scriptscriptstyle
  s = s.replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\s*/g, '');

  // Strip \color{…}{…} — just keep the content
  s = s.replace(/\\color\s*\{[^}]*\}\s*\{([^}]*)\}/g, '$1');
  s = s.replace(/\\color\s*\{[^}]*\}/g, '');

  // Strip any remaining unknown \command (single token)
  s = s.replace(/\\[a-zA-Z]+\s*/g, '');

  return s;
}

/** Convert all \frac{a}{b} occurrences (handles nesting). */
function convertFrac(s: string): string {
  // Iteratively replace outermost \frac until none remain
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(/\\frac\s*(?=\{)/, '__FRAC__');
    const idx = s.indexOf('__FRAC__');
    if (idx === -1) break;
    s = s.slice(0, idx) + convertFracAt(s, idx + 8);
  }
  return s;
}

function convertFracAt(s: string, pos: number): string {
  const [num, afterNum] = extractBraces(s, pos);
  const [den, afterDen] = extractBraces(s, afterNum);
  return `frac(${num}, ${den})` + s.slice(afterDen);
}

/** Convert \sqrt[n]{x} and \sqrt{x}. */
function convertSqrt(s: string): string {
  // \sqrt[n]{x}
  s = s.replace(/\\sqrt\s*\[([^\]]+)\]\s*\{([^}]*)\}/g, 'root($1, $2)');
  // \sqrt{x}
  s = s.replace(/\\sqrt\s*\{([^}]*)\}/g, 'sqrt($1)');
  return s;
}

// ── \includegraphics conversion ──────────────────────────────────────────────

const INCLUDEGRAPHICS_RE = /\\includegraphics\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}/g;

/**
 * Parse the bracketed options on `\includegraphics[...]` and translate the
 * subset we care about (width, height) to Typst `#image(...)` named args.
 * Unknown options (angle, trim, scale, keepaspectratio, …) are dropped.
 */
function convertGraphicsOpts(opts: string): string {
  if (!opts) return '';
  const out: string[] = [];
  for (const rawPart of opts.split(',')) {
    const m = /^\s*(width|height)\s*=\s*(.+?)\s*$/.exec(rawPart);
    if (!m) continue;
    const [, key, value] = m;
    const typst = convertGraphicsLength(value);
    if (typst) out.push(`${key}: ${typst}`);
  }
  return out.join(', ');
}

/** Convert a LaTeX length (`0.5\textwidth`, `5cm`, `\textwidth`) to Typst. */
function convertGraphicsLength(v: string): string | null {
  const scaled = /^([\d.]+)\s*\\(?:textwidth|linewidth|columnwidth|hsize)\s*$/.exec(v);
  if (scaled) return `${Math.round(parseFloat(scaled[1]) * 100)}%`;

  const full = /^\\(?:textwidth|linewidth|columnwidth|hsize)\s*$/.exec(v);
  if (full) return '100%';

  const abs = /^([\d.]+)\s*(cm|mm|in|pt|pc|em)\s*$/.exec(v);
  if (abs) return `${abs[1]}${abs[2]}`;

  return null;
}

/** Replace `\includegraphics[...]{name}` with `#image("/imgs/name", ...)`. */
function convertIncludegraphics(src: string): string {
  return src.replace(INCLUDEGRAPHICS_RE, (_, opts, pathArg) => {
    const { stem } = splitFilename(pathArg.trim());
    const args = convertGraphicsOpts(opts ?? '');
    return args
      ? `#image("/imgs/${stem}", ${args})`
      : `#image("/imgs/${stem}")`;
  });
}

/**
 * Extract the deduplicated list of image basenames referenced by
 * `\includegraphics{…}` in a LaTeX source block. Safe to run before conversion.
 */
export function extractImageNames(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(INCLUDEGRAPHICS_RE)) {
    const { stem } = splitFilename(m[2].trim());
    names.add(stem);
  }
  return [...names];
}

// ── Environment conversion ───────────────────────────────────────────────────

/** Convert LaTeX list environments to Typst markup lists. */
function convertLists(src: string): string {
  // enumerate → numbered (+)
  src = src.replace(
    /\\begin\s*\{enumerate\}([\s\S]*?)\\end\s*\{enumerate\}/g,
    (_, body) => body.replace(/\\item\s*/g, '\n+ ').trim(),
  );
  // itemize → bullet (-)
  src = src.replace(
    /\\begin\s*\{itemize\}([\s\S]*?)\\end\s*\{itemize\}/g,
    (_, body) => body.replace(/\\item\s*/g, '\n- ').trim(),
  );
  return src;
}

/**
 * Convert the `tasks` package environment to a Typst grid.
 *
 * Items are enumerated left-to-right across rows (reading order), matching the
 * default tasks behaviour.  A \task* item spanning a full row is treated the
 * same as a normal item for simplicity.
 *
 * Syntax handled:
 *   \begin{tasks}(N)          — N columns
 *   \begin{tasks}[opts](N)    — with options (opts ignored)
 *   \begin{tasks}             — default 2 columns
 */
function convertTasks(src: string): string {
  return src.replace(
    /\\begin\s*\{tasks\}\s*(?:\[[^\]]*\])?\s*(?:\((\d+)\))?([\s\S]*?)\\end\s*\{tasks\}/g,
    (_, colsStr, body) => {
      const cols = Math.max(1, parseInt(colsStr ?? '2', 10) || 2);

      // Split on \task or \task* — the first split element is empty (before first \task)
      const parts = body.split(/\\task\*?\s*/);
      const items = parts.slice(1).map((s: string) => s.trim()).filter(Boolean);

      if (items.length === 0) return '';

      // Label items (a), (b), (c), … using lowercase alphabet
      const labeled = items.map((content: string, i: number) => {
        const label = i < 26
          ? String.fromCharCode(97 + i)   // a–z
          : String.fromCharCode(65 + (i - 26) % 26); // A–Z fallback
        return `[*(${label})* ${content}]`;
      });

      // Pad last row so the grid is rectangular
      while (labeled.length % cols !== 0) labeled.push('[]');

      const colDef = Array(cols).fill('1fr').join(', ');
      return `#grid(\n  columns: (${colDef}),\n  column-gutter: 1em,\n  row-gutter: 0.65em,\n  ${labeled.join(',\n  ')},\n)`;
    },
  );
}

// ── Text-mode conversion ─────────────────────────────────────────────────────

/** Convert LaTeX text-mode formatting commands. */
function convertTextFormatting(src: string): string {
  // \textbf{…} → *…*
  src = src.replace(/\\textbf\s*\{([^}]*)\}/g, '*$1*');
  // \textit{…} / \emph{…} → _…_
  src = src.replace(/\\(?:textit|emph)\s*\{([^}]*)\}/g, '_$1_');
  // \underline{…} → #underline[…]
  src = src.replace(/\\underline\s*\{([^}]*)\}/g, '#underline[$1]');
  // \texttt{…} → `…` (code)
  src = src.replace(/\\texttt\s*\{([^}]*)\}/g, '`$1`');
  // \textrm / \textnormal → plain text (strip wrapper)
  src = src.replace(/\\text(?:rm|normal|sf)\s*\{([^}]*)\}/g, '$1');
  return src;
}

/** Clean up common copy-paste artifacts from PDFs. */
function normalizePaste(src: string): string {
  return src
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Ligatures
    .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff')
    .replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl').replace(/ﬆ/g, 'st')
    // Curly/smart quotes → straight
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    // Soft hyphen
    .replace(/\u00AD/g, '')
    // En/em dash that appears mid-word in PDF copies (keep em-dash for prose)
    .replace(/\u2013/g, '--').replace(/\u2014/g, '---')
    // Zero-width spaces
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
}

/** Strip LaTeX document-level wrappers and preamble commands from pasted text. */
function stripDocumentWrappers(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (/^\\documentclass\b/i.test(trimmed)) return '';
      if (/^\\usepackage\b/i.test(trimmed)) return '';
      if (/^\\(?:title|author|date)\b/i.test(trimmed)) return '';
      if (/^\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator)\b/i.test(trimmed)) return '';
      if (/^\\(?:sub)?section(?:\*?)\s*\{.*\}\s*$/i.test(trimmed)) return '';
      if (/^\\subsubsection(?:\*?)\s*\{.*\}\s*$/i.test(trimmed)) return '';
      if (/^\\begin\s*\{document\}\s*$/i.test(trimmed)) return '';
      if (/^\\end\s*\{document\}\s*$/i.test(trimmed)) return '';
      return line;
    })
    .join('\n');
}

// ── MiTeX conversion ────────────────────────────────────────────────────────

const MITEX_LABEL = '<converted>';
const MITEX_DOC_PATH = '/__mitex-convert.typ';

let mitexCompilerPromise: Promise<TypstCompiler> | null = null;
let mitexAccessModel: MemoryAccessModel | null = null;
const mitexCache = new Map<string, Promise<string>>();

async function getMitexCompiler(): Promise<TypstCompiler> {
  if (!mitexCompilerPromise) {
    mitexCompilerPromise = (async () => {
      const compiler = createTypstCompiler();
      mitexAccessModel = new MemoryAccessModel();
      await compiler.init({
        getModule: () => fetch(compilerWasmUrl).then((r) => r.arrayBuffer()),
        beforeBuild: [
          disableDefaultFontAssets(),
          initOptions.withAccessModel(mitexAccessModel),
          initOptions.withPackageRegistry(
            new FetchPackageRegistry(mitexAccessModel),
          ),
        ],
      });
      return compiler;
    })();
  }
  return mitexCompilerPromise;
}

function parseQueryResult(raw: unknown): string | null {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const first = parsed[0];
        if (typeof first === 'string') return first;
        if (first && typeof first === 'object' && 'value' in first && typeof (first as { value?: unknown }).value === 'string') {
          return (first as { value: string }).value;
        }
      }
      if (typeof parsed === 'string') return parsed;
    } catch {
      return raw;
    }
    return raw;
  }
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && 'value' in first && typeof (first as { value?: unknown }).value === 'string') {
      return (first as { value: string }).value;
    }
  }
  if (raw && typeof raw === 'object' && 'value' in raw && typeof (raw as { value?: unknown }).value === 'string') {
    return (raw as { value: string }).value;
  }
  return null;
}

/**
 * MiTeX sometimes emits helper wrappers like `mitexsqrt(...)` and escaped
 * delimiters such as `\(` / `\)`. Normalize those into plain Typst math.
 */
function normalizeMiTeXOutput(src: string): string {
  return src
    .replace(/\\([(){}\[\]])/g, '$1')
    .replace(/\s*\\\[\s*/g, ' ')
    .replace(/\s*\\\]\s*/g, ' ')
    .replace(/\bmitex([a-zA-Z]+)\(/g, '$1(')
    .replace(/\b([A-Za-z]+)\s+_/g, '$1_')
    .replace(/\b([A-Za-z]+)\s+\(/g, '$1(')
    .replace(/\(\s+/g, '(')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\)/g, ')')
    .replace(/\s+,/g, ', ')
    .trim();
}

async function convertWithMiTeX(math: string): Promise<string> {
  const cached = mitexCache.get(math);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const compiler = await getMitexCompiler();
      const payload = math.replace(/`/g, "'");
      const source = `#import "@preview/mitex:0.2.7": *\n#metadata(mitex-convert(\`${payload}\`)) <${MITEX_LABEL.slice(1, -1)}>`;
      compiler.addSource(MITEX_DOC_PATH, source);
      const converted = await compiler.runWithWorld(
        { mainFilePath: MITEX_DOC_PATH },
        async (world) => {
          await world.compile({ diagnostics: 'none' });
          const raw = await world.query({ selector: MITEX_LABEL, field: 'value' });
          return parseQueryResult(raw);
        },
      );
      if (converted && converted.trim()) return normalizeMiTeXOutput(converted.trim());
    } catch {
      // Fall through to the legacy converter below.
    }
    return convertMath(math);
  })();

  mitexCache.set(math, promise);
  return promise;
}

async function convertDisplayEnvs(src: string): Promise<string> {
  const DISPLAY_ENVS = [
    'equation', 'equation*', 'align', 'align*',
    'aligned', 'gather', 'gather*', 'multline', 'multline*',
    'eqnarray', 'eqnarray*',
  ];

  for (const env of DISPLAY_ENVS) {
    const beginToken = `\\begin{${env}}`;
    const endToken = `\\end{${env}}`;
    let out = '';
    let pos = 0;

    while (true) {
      const start = src.indexOf(beginToken, pos);
      if (start === -1) {
        out += src.slice(pos);
        break;
      }
      const end = src.indexOf(endToken, start + beginToken.length);
      if (end === -1) {
        out += src.slice(pos);
        break;
      }
      out += src.slice(pos, start);
      const body = src.slice(start + beginToken.length, end).trim();
      const converted = await convertWithMiTeX(body);
      out += `\n\n$ ${converted} $\n\n`;
      pos = end + endToken.length;
    }

    src = out;
  }

  return src;
}

/**
 * Walk through `src`, find math segments ($…$, $$…$$) and convert the math
 * content to Typst using MiTeX. Text outside math is processed by `textFn`.
 */
async function processMathSegments(src: string, textFn: (t: string) => string): Promise<string> {
  let result = '';
  let i = 0;

  while (i < src.length) {
    // Display math \[...\]
    if (src[i] === '\\' && src[i + 1] === '[') {
      const end = src.indexOf('\\]', i + 2);
      if (end === -1) { result += src.slice(i); break; }
      const inner = src.slice(i + 2, end);
      const converted = await convertWithMiTeX(inner);
      result += `\n\n$ ${converted} $\n\n`;
      i = end + 2;
      continue;
    }
    // Inline math \(...\)
    if (src[i] === '\\' && src[i + 1] === '(') {
      const end = src.indexOf('\\)', i + 2);
      if (end === -1) { result += src.slice(i); break; }
      const inner = src.slice(i + 2, end);
      const converted = await convertWithMiTeX(inner);
      result += `$${converted}$`;
      i = end + 2;
      continue;
    }
    // Display math $$…$$
    if (src[i] === '$' && src[i + 1] === '$') {
      const end = src.indexOf('$$', i + 2);
      if (end === -1) { result += src.slice(i); break; }
      const inner = src.slice(i + 2, end);
      const converted = await convertWithMiTeX(inner);
      result += `\n\n$ ${converted} $\n\n`;
      i = end + 2;
      continue;
    }
    // Inline math $…$
    if (src[i] === '$') {
      const end = src.indexOf('$', i + 1);
      if (end === -1) { result += src.slice(i); break; }
      const inner = src.slice(i + 1, end);
      const converted = await convertWithMiTeX(inner);
      result += `$${converted}$`;
      i = end + 1;
      continue;
    }
    // Find next $ boundary and flush text
    const next = src.indexOf('$', i);
    if (next === -1) {
      result += textFn(src.slice(i));
      break;
    }
    result += textFn(src.slice(i, next));
    i = next;
  }

  return result;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Convert a LaTeX question body (text + math) to Typst markup.
 *
 * Pass `normalize: true` (default) to also clean up PDF copy-paste artifacts.
 */
export async function latexToTypst(src: string, normalize = true): Promise<string> {
  let s = normalize ? normalizePaste(src) : src;

  // 1. Remove document wrappers and preamble commands that are not part of
  //    the question body.
  s = stripDocumentWrappers(s);

  // 2. Replace \includegraphics with Typst #image() before any other pass
  //    would otherwise strip unknown commands and lose the filename.
  s = convertIncludegraphics(s);

  // 3. Convert display math environments first (before $$…$$ pass)
  s = await convertDisplayEnvs(s);

  // 4. Convert list and tasks environments
  s = convertLists(s);
  s = convertTasks(s);

  // 5. Strip common document-structure commands (irrelevant in a question body)
  s = s.replace(/\\(?:noindent|medskip|bigskip|smallskip|vspace\s*\{[^}]*\}|hspace\s*\{[^}]*\})\s*/g, '');
  s = s.replace(/\\(?:centering|raggedright|raggedleft)\s*/g, '');
  s = s.replace(/\\(?:label|ref|eqref)\s*\{[^}]*\}/g, '');

  // 6. Process math segments + text formatting outside math
  s = await processMathSegments(s, convertTextFormatting);

  // 7. Clean up extra whitespace
  s = s.replace(/\n{3,}/g, '\n\n').trim();

  return s;
}
