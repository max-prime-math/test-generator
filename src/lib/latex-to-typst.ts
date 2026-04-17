/**
 * Client-side LaTeX → Typst converter.
 *
 * Handles the subset of LaTeX commonly found in math textbook questions:
 * display/inline math, fractions, roots, Greek letters, common operators,
 * relations, arrows, and basic text formatting.  Unknown commands are stripped
 * (the backslash + name removed) rather than throwing, so partial conversions
 * are always usable.
 */

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

// ── Math-mode conversion ─────────────────────────────────────────────────────

/** Convert LaTeX math content (the stuff inside $…$) to Typst math content. */
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
    s = s.replace(new RegExp(`\\\\${cmd}\\b`, 'g'), typst);
  }

  // Named functions (strip backslash — Typst uses bare names)
  const FUNCS = [
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh',
    'ln', 'log', 'exp', 'det', 'dim', 'ker', 'deg',
    'gcd', 'lcm', 'min', 'max', 'inf', 'sup',
    'lim', 'liminf', 'limsup',
  ];
  for (const fn of FUNCS) {
    s = s.replace(new RegExp(`\\\\${fn}\\b`, 'g'), fn);
  }

  // Big operators
  const BIG_OPS: Record<string, string> = {
    int: 'integral', iint: 'integral.double', iiint: 'integral.triple',
    oint: 'integral.cont',
    sum: 'sum', prod: 'product', coprod: 'product.co',
    bigcup: 'union.big', bigcap: 'sect.big', bigoplus: 'plus.circle.big',
  };
  for (const [cmd, typst] of Object.entries(BIG_OPS)) {
    s = s.replace(new RegExp(`\\\\${cmd}\\b`, 'g'), typst);
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
    s = s.replace(new RegExp(`\\\\${cmd}\\b`, 'g'), typst);
  }

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

/** Convert display-math environments to Typst `$ … $`. */
function convertDisplayEnvs(src: string): string {
  const DISPLAY_ENVS = [
    'equation', 'equation\\*', 'align', 'align\\*',
    'aligned', 'gather', 'gather\\*', 'multline', 'multline\\*',
    'eqnarray', 'eqnarray\\*',
  ];
  for (const env of DISPLAY_ENVS) {
    const re = new RegExp(`\\\\begin\\s*\\{${env}\\}([\\s\\S]*?)\\\\end\\s*\\{${env}\\}`, 'g');
    src = src.replace(re, (_, body) => {
      // Strip alignment markers and numbering artifacts
      const cleaned = body
        .replace(/\\\\$/gm, '')
        .replace(/&/g, '')
        .replace(/\\nonumber/g, '')
        .trim();
      return `$ ${convertMath(cleaned)} $`;
    });
  }
  return src;
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

// ── Math-segment processor ───────────────────────────────────────────────────

/**
 * Walk through `src`, find math segments ($…$, $$…$$) and apply
 * `convertMath` inside each one.  Text outside math is processed by `textFn`.
 */
function processMathSegments(src: string, textFn: (t: string) => string): string {
  let result = '';
  let i = 0;

  while (i < src.length) {
    // Display math $$…$$
    if (src[i] === '$' && src[i + 1] === '$') {
      const end = src.indexOf('$$', i + 2);
      if (end === -1) { result += src.slice(i); break; }
      const inner = src.slice(i + 2, end);
      result += `$ ${convertMath(inner)} $`;
      i = end + 2;
      continue;
    }
    // Inline math $…$
    if (src[i] === '$') {
      const end = src.indexOf('$', i + 1);
      if (end === -1) { result += src.slice(i); break; }
      const inner = src.slice(i + 1, end);
      result += `$${convertMath(inner)}$`;
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
export function latexToTypst(src: string, normalize = true): string {
  let s = normalize ? normalizePaste(src) : src;

  // 1. Convert display math environments first (before $$…$$ pass)
  s = convertDisplayEnvs(s);

  // 2. Convert list environments
  s = convertLists(s);

  // 3. Strip common document-structure commands (irrelevant in a question body)
  s = s.replace(/\\(?:noindent|medskip|bigskip|smallskip|vspace\s*\{[^}]*\}|hspace\s*\{[^}]*\})\s*/g, '');
  s = s.replace(/\\(?:centering|raggedright|raggedleft)\s*/g, '');
  s = s.replace(/\\(?:label|ref|eqref)\s*\{[^}]*\}/g, '');

  // 4. Process math segments + text formatting outside math
  s = processMathSegments(s, convertTextFormatting);

  // 5. Clean up extra whitespace
  s = s.replace(/\n{3,}/g, '\n\n').trim();

  return s;
}
