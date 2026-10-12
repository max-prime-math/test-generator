/**
 * A scrambled question order, as Kuta's "Scramble questions": questions that share a task
 * group (a generated section printed as one numbered item with lettered parts) stay
 * together and are shuffled among themselves; the groups and the other questions are
 * shuffled as units. `random` returns a number in [0, 1).
 */
export function scrambleOrder(ids: string[], groupOf: (id: string) => string | undefined, random: () => number = Math.random): string[] {
  const shuffle = <T>(items: T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const blocks: string[][] = [];
  const byGroup = new Map<string, string[]>();
  for (const id of ids) {
    const group = groupOf(id);
    if (!group) { blocks.push([id]); continue; }
    let block = byGroup.get(group);
    if (!block) { block = []; byGroup.set(group, block); blocks.push(block); }
    block.push(id);
  }
  return shuffle(blocks).flatMap((block) => shuffle(block));
}
