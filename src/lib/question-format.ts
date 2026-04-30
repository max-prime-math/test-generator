/** Typst grid layout for MCQ choices. */
export function formatBody(stem: string, choices: Record<string, string>): string {
  const letters = ['A', 'B', 'C', 'D', 'E'].filter(l => choices[l]);
  if (!letters.length) return stem;

  // Prefer a single row. With five choices, fall back to a compact two-row grid.
  const cols = letters.length <= 4 ? letters.length : 3;
  const cells = letters.map(l => `[*(${l})* ${choices[l]}]`).join(', ');
  const colDef = Array(cols).fill('1fr').join(', ');
  const grid = `#grid(columns: (${colDef}), column-gutter: 1.5em, row-gutter: 0.6em, ${cells})`;

  return `${stem}\n\n${grid}`;
}

/** Extract the stem from a body produced by formatBody (strips the trailing grid). */
export function stemOf(body: string): string {
  const idx = body.lastIndexOf('\n\n#grid(');
  return idx >= 0 ? body.slice(0, idx).trim() : body;
}
