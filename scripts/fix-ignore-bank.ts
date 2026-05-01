import { readFileSync, writeFileSync } from 'node:fs';

type Question = {
  body?: string;
  solution?: string;
  choices?: Record<string, string>;
  [key: string]: unknown;
};

type Bank = {
  questions: Question[];
  [key: string]: unknown;
};

const BANK_PATH = 'ignore/test-generator-bank/custom-ap-calculus-1777525408203.json';

function extractBalanced(src: string, openIndex: number): { inner: string; end: number } | null {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) {
        return { inner: src.slice(openIndex + 1, i), end: i + 1 };
      }
    }
  }
  return null;
}

function replaceWrappedFunction(src: string, name: string, fn: (inner: string) => string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src.startsWith(`${name}(`, i)) {
      const balanced = extractBalanced(src, i + name.length);
      if (!balanced) {
        out += src[i];
        i++;
        continue;
      }
      out += fn(balanced.inner);
      i = balanced.end;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

function extractBraces(src: string, pos: number): [string, number] {
  let depth = 0;
  let start = -1;
  for (let i = pos; i < src.length; i++) {
    if (src[i] === '{') {
      if (depth === 0) start = i + 1;
      depth++;
      continue;
    }
    if (src[i] === '}') {
      depth--;
      if (depth === 0) return [src.slice(start, i), i + 1];
    }
  }
  return [src.slice(pos), src.length];
}

function convertFrac(src: string): string {
  let s = src;
  while (true) {
    const idx = s.search(/\\frac\s*\{/);
    if (idx === -1) break;
    const brace = s.indexOf('{', idx);
    const [num, afterNum] = extractBraces(s, brace);
    const nextBrace = s.indexOf('{', afterNum);
    if (nextBrace === -1) break;
    const [den, afterDen] = extractBraces(s, nextBrace);
    s = `${s.slice(0, idx)}frac(${num}, ${den})${s.slice(afterDen)}`;
  }
  return s;
}

function convertSqrt(src: string): string {
  let s = src;
  s = s.replace(/\\sqrt\s*\[([^\]]+)\]\s*\{([^{}]+)\}/g, (_, deg: string, rad: string) => `root(${deg.trim()}, ${rad.trim()})`);
  s = s.replace(/\\sqrt\s*\{([^{}]+)\}/g, (_, inner: string) => `sqrt(${inner.trim()})`);
  return s;
}

function fixLatexMath(src: string): string {
  let s = src;
  s = s.replace(/\\begin\s*\{cases\}/g, 'cases(');
  s = s.replace(/\\end\s*\{cases\}/g, ')');
  s = s.replace(/\\\\/g, ', ');
  s = s.replace(/\\text\s*\{([^}]*)\}/g, '$1');
  s = s.replace(/\\\(/g, '$');
  s = s.replace(/\\\)/g, '$');
  s = s.replace(/\\\[/g, '$');
  s = s.replace(/\\\]/g, '$');
  s = s.replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\s*/g, '');
  s = s.replace(/\\left\s*/g, '');
  s = s.replace(/\\right\s*/g, '');
  s = s.replace(/\\mathrm\s*\{d\}\s*([A-Za-z])/g, 'dif $1');
  s = s.replace(/\\mathrm\s*\{d\}/g, 'dif');
  s = s.replace(/([A-Za-z0-9)])\^\{([^{}]+)\}/g, '$1^($2)');
  s = s.replace(/([A-Za-z0-9)])_\{([^{}]+)\}/g, '$1_($2)');
  s = convertFrac(s);
  s = convertSqrt(s);

  const replacements: Array<[RegExp, string]> = [
    [/\\to(?![A-Za-z])/g, '->'],
    [/\\pi(?![A-Za-z])/g, 'pi'],
    [/\\theta(?![A-Za-z])/g, 'theta'],
    [/\\alpha(?![A-Za-z])/g, 'alpha'],
    [/\\beta(?![A-Za-z])/g, 'beta'],
    [/\\gamma(?![A-Za-z])/g, 'gamma'],
    [/\\Delta(?![A-Za-z])/g, 'Delta'],
    [/\\delta(?![A-Za-z])/g, 'delta'],
    [/\\lambda(?![A-Za-z])/g, 'lambda'],
    [/\\mu(?![A-Za-z])/g, 'mu'],
    [/\\sigma(?![A-Za-z])/g, 'sigma'],
    [/\\omega(?![A-Za-z])/g, 'omega'],
    [/\\infty(?![A-Za-z])/g, 'infinity'],
    [/\\neq(?![A-Za-z])/g, '!='],
    [/\\leq?(?![A-Za-z])/g, '<='],
    [/\\geq?(?![A-Za-z])/g, '>='],
    [/\\cdot(?![A-Za-z])/g, ' dot.op '],
    [/\\pm(?![A-Za-z])/g, 'plus.minus'],
    [/\\mp(?![A-Za-z])/g, 'minus.plus'],
    [/\\sin(?![A-Za-z])/g, 'sin'],
    [/\\cos(?![A-Za-z])/g, 'cos'],
    [/\\tan(?![A-Za-z])/g, 'tan'],
    [/\\sec(?![A-Za-z])/g, 'sec'],
    [/\\csc(?![A-Za-z])/g, 'csc'],
    [/\\cot(?![A-Za-z])/g, 'cot'],
    [/\\ln(?![A-Za-z])/g, 'ln'],
    [/\\log(?![A-Za-z])/g, 'log'],
    [/\\arcsin(?![A-Za-z])/g, 'arcsin'],
    [/\\arccos(?![A-Za-z])/g, 'arccos'],
    [/\\arctan(?![A-Za-z])/g, 'arctan'],
    [/\\lim(?![A-Za-z])/g, 'lim'],
    [/\\int(?![A-Za-z])/g, 'integral'],
    [/\\sum(?![A-Za-z])/g, 'sum'],
    [/\\partial(?![A-Za-z])/g, 'partial'],
    [/\\approx(?![A-Za-z])/g, 'approx'],
    [/\\Rightarrow(?![A-Za-z])/g, '=>'],
  ];
  for (const [re, replacement] of replacements) s = s.replace(re, replacement);
  s = s.replace(/\\Big\|/g, '|');
  s = s.replace(/\\bigg\|/g, '|');
  s = s.replace(/\\[{}[\]]/g, '');
  s = s.replace(/\\,/g, ' ');
  s = s.replace(/\\;/g, ' ');
  s = s.replace(/\\!/g, '');
  s = s.replace(/\\quad/g, ' ');
  s = s.replace(/\\qquad/g, ' ');
  return s;
}

function fixPlainTextArtifacts(src: string): string {
  let s = src;
  s = replaceWrappedFunction(s, 'display', (inner) => inner);
  s = s.replace(/\bupright\(d\)\s*([A-Za-z])/g, 'dif $1');
  s = s.replace(/\bupright\(d\)/g, 'dif');
  s = s.replace(/\bdfrac\(/g, 'frac(');
  s = s.replace(/\bdot\.c\b/g, 'dot.op');
  s = s.replace(/\bdots\.h\.c\b/g, 'dots.h');
  s = s.replace(/#textmath\[([^\]]*)\]/g, (_, inner: string) => inner.trim());
  s = s.replace(/\bsqrt\(\[\s*([^\]]+?)\s*\],\s*([^()]+?)\)/g, (_, deg: string, inner: string) => `root(${deg.trim()}, ${inner.trim()})`);
  s = s.replace(/\(\|\)_/g, '|_');
  s = s.replace(/\boo\b/g, 'infinity');
  s = s.replace(/\bplus\.minus\s+infinity\b/g, 'plus.minus infinity');
  s = s.replace(/##image\s*\(/g, '#image(');
  s = s.replace(/#{2,}\s*image\s*\(/g, '#image(');
  s = s.replace(/\bimage\s*\(/g, '#image(');
  s = s.replace(/\bi\.e\./g, 'i.e.');
  s = s.replace(/\be\.g\./g, 'e.g.');
  s = s.replace(/\b(arcsin|arccos|arctan|sin|cos|tan|sec|csc|cot|ln|log)frac\(/g, '$1(frac(');
  s = replaceWrappedFunction(s, 'arcsin', (inner) => `arcsin(${inner})`);
  s = replaceWrappedFunction(s, 'arccos', (inner) => `arccos(${inner})`);
  s = replaceWrappedFunction(s, 'arctan', (inner) => `arctan(${inner})`);
  s = replaceWrappedFunction(s, 'sin', (inner) => `sin(${inner})`);
  s = replaceWrappedFunction(s, 'cos', (inner) => `cos(${inner})`);
  s = replaceWrappedFunction(s, 'tan', (inner) => `tan(${inner})`);
  s = replaceWrappedFunction(s, 'ln', (inner) => `ln(${inner})`);
  s = replaceWrappedFunction(s, 'log', (inner) => `log(${inner})`);
  s = s.replace(/\b(sin|cos|tan|sec|csc|cot|dif)(theta|pi)\b/g, '$1 $2');
  s = s.replace(/\blim\\limits_\(([^)]+)\)/g, 'lim_($1)');
  s = s.replace(/\blim_\{([^{}]+)\}/g, 'lim_($1)');
  s = s.replace(/\bintegral_\{([^{}]+)\}\^\{([^{}]+)\}/g, 'integral_($1)^($2)');
  s = s.replace(/\bintegral_\{([^{}]+)\}/g, 'integral_($1)');
  s = s.replace(/\bsum_\{([^{}]+)\}\^\{([^{}]+)\}/g, 'sum_($1)^($2)');
  s = s.replace(/\bsum_\{([^{}]+)\}/g, 'sum_($1)');
  s = s.replace(/piintegral_/g, 'pi integral_');
  s = s.replace(/\bthin\b/g, '');
  s = s.replace(/\bquad\b/g, '');
  s = s.replace(/frac\(dif,\s*dif/g, 'frac(dif, dif');
  s = s.replace(/frac\(([^,]+),([^ ])/g, 'frac($1, $2');
  return s;
}

function fixPiecewiseCases(src: string): string {
  let s = src;
  s = s.replace(/&\s*for\s*;?/g, '&');
  s = s.replace(/&\s*for\b/g, '&');
  s = s.replace(/&\s*where\b/g, '&');
  s = s.replace(/&\s*is a real number\b/g, '&');
  s = s.replace(/&\s*except\b/g, '&');
  s = s.replace(/&\s*only\./g, '&');
  s = s.replace(/&\s*elsewhere\b/g, '& otherwise');
  return s;
}

function fixSpacedCoordinates(src: string): string {
  return src.replace(/\(\s*(-?(?:\d+(?:\.\d+)?|frac\([^)]*\)))\s{2,}(-?(?:\d+(?:\.\d+)?|frac\([^)]*\)|[A-Za-z][^),]*))\s*\)/g, '($1, $2)');
}

function fixNumbers(src: string): string {
  let s = src;

  do {
    const prev = s;
    s = s.replace(/(\d)\s*\.\s*(\d)/g, '$1.$2');
    s = s.replace(/(\d\.\d+)\s+(\d)/g, '$1$2');
    s = s.replace(/(\.\d)\s+(\d)/g, '$1$2');
    s = s.replace(/(^|[\s$=([{,;+\-*/])(\d(?:\s+\d)+)(?=(\s*(?:[A-Za-z$)=,\]};:+\-*/]|$)))/g, (_, prefix: string, digits: string) => prefix + digits.replace(/\s+/g, ''));
    s = s.replace(/frac\(\s*(\d(?:\s+\d)+)\s*,/g, (_, digits: string) => `frac(${digits.replace(/\s+/g, '')},`);
    s = s.replace(/,\s*(\d(?:\s+\d)+)\s*\)/g, (_, digits: string) => `, ${digits.replace(/\s+/g, '')})`);
    if (s === prev) break;
  } while (true);

  return s;
}

function cleanSpacing(src: string): string {
  let s = src;
  s = s.replace(/##+image/g, '#image');
  s = s.replace(/1 2 >/g, '12 >');
  s = s.replace(/= 1 2 \(/g, '= 12 (');
  s = s.replace(/0\.01 2/g, '0.012');
  s = s.replace(/\$\$/g, '$');
  s = s.replace(/([A-Za-z0-9.,)])\$/g, '$1 $');
  s = s.replace(/\$([A-Za-z])/g, '$ $1');
  s = s.replace(/\$([#(])/g, '$ $1');
  s = s.replace(/([A-Za-z0-9)])\$(?=[A-Za-z0-9(])/g, '$1 $');
  s = s.replace(/\$(?=[A-Za-z0-9#(])/g, (m, offset, str) => (offset > 0 && !/\s/.test(str[offset - 1]) ? ` ${m}` : m));
  s = s.replace(/\$(?![\s.,;:!?)]|$)/g, '$ ');
  s = s.replace(/\s{2,}/g, ' ');
  s = s.replace(/ ?\n ?/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.replace(/ \)/g, ')');
  s = s.replace(/\( /g, '(');
  s = s.replace(/ ,/g, ',');
  s = s.replace(/\s+;/g, ';');
  s = s.replace(/\s+:/g, ':');
  return s.trim();
}

function normalizeString(src: string): string {
  let s = src;
  s = fixLatexMath(s);
  s = fixPlainTextArtifacts(s);
  s = fixPiecewiseCases(s);
  s = fixSpacedCoordinates(s);
  s = fixNumbers(s);
  s = cleanSpacing(s);
  return s;
}

function normalizeQuestion(question: Question): Question {
  const next: Question = { ...question };
  if (typeof next.body === 'string') next.body = normalizeString(next.body);
  if (typeof next.solution === 'string') next.solution = normalizeString(next.solution);
  if (next.choices && typeof next.choices === 'object') {
    next.choices = Object.fromEntries(
      Object.entries(next.choices).map(([key, value]) => [key, normalizeString(value)])
    );
  }
  return next;
}

const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8')) as Bank;
bank.questions = bank.questions.map(normalizeQuestion);
writeFileSync(BANK_PATH, `${JSON.stringify(bank, null, 2)}\n`);
