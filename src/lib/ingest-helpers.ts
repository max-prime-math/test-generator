/** Detect and strip a leading MCQ answer label from a solution line. */
export function stripLeadingAnswerLabel(line: string): { letter: string; text: string } {
  const trimmed = line.trim();
  if (!trimmed) return { letter: '', text: '' };

  const single = /^\(?([A-Ea-e])\)?\.?\s*$/.exec(trimmed);
  if (single) return { letter: single[1].toUpperCase(), text: '' };

  const inline = /^\(?([A-Ea-e])\)?\.?\s+(.*)$/.exec(trimmed);
  if (inline) return { letter: inline[1].toUpperCase(), text: inline[2].trim() };

  return { letter: '', text: trimmed };
}
