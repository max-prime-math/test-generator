/**
 * Package imports added automatically to a question's Typst source.
 *
 * Questions are authored as fragments, so a pasted drawing normally fails with
 * "Unknown variable: cetz" unless the author also pastes the import line. The
 * preview panes, the test template and the bank review all compile the same
 * fragments, so they share this one place rather than each hand-rolling the
 * imports they happen to know about.
 *
 * Packages are fetched from packages.typst.org on first use and cached for the
 * session, so a drawing needs the network once per page load.
 */

const SIMPLE_PLOT = '@preview/simple-plot:0.8.0';
const CETZ = '@preview/cetz:0.4.2';

/** True when the source calls simple-plot without importing it itself. */
function needsSimplePlot(source: string): boolean {
  if (source.includes('@preview/simple-plot')) return false;
  return source.includes('plot(');
}

/**
 * True when the source draws with CeTZ without importing it itself. An author
 * who pinned their own version keeps it: adding a second import of a different
 * version would rebind the name under them.
 */
function needsCetz(source: string): boolean {
  if (source.includes('@preview/cetz')) return false;
  return /\bcetz\s*\./.test(source)
    || /#canvas\s*\(/.test(source)
    || /(^|\n)[ \t]*canvas\s*\(/.test(source);
}

/**
 * The import lines a source needs, ending with a newline, or '' when it needs
 * none. Pass every fragment that will be compiled together.
 */
export function autoImports(...texts: Array<string | null | undefined>): string {
  const source = texts.filter(Boolean).join('\n');
  const lines: string[] = [];
  if (needsSimplePlot(source)) lines.push(`#import "${SIMPLE_PLOT}": plot, line-plot`);
  if (needsCetz(source)) {
    // Both spellings: `cetz.canvas(...)` as the docs write it, and a bare
    // `canvas(...)` from a snippet whose import line was left behind.
    lines.push(`#import "${CETZ}"`);
    lines.push(`#import "${CETZ}": canvas, draw`);
  }
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}
