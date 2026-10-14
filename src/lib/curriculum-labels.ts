// How units and sections are named in menus and lists. A numbered unit reads "Unit 3: Name"; a
// section shows its ID when the ID means something (a number like "1.2" or an outcome code like
// "9.N.1"), but not a slug ID such as "cayley-number-sense", which only repeats the name. A nickname,
// when the curriculum gives one, stands in for a wordy name.
const SLUG = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

export function unitLabel(unit: { id: string; name: string }): string {
  return /^\d+$/.test(unit.id) ? `Unit ${unit.id}: ${unit.name}` : unit.name;
}

export function sectionLabel(section: { id: string; name: string; nickname?: string }, separator = ' '): string {
  const name = section.nickname || section.name;
  return SLUG.test(section.id) || name.startsWith(section.id) ? name : `${section.id}${separator}${name}`;
}

/** Numbered units in number order; others keep the order the class lists them in. */
export function compareUnits(a: { id: string }, b: { id: string }): number {
  const x = parseFloat(a.id), y = parseFloat(b.id);
  return Number.isNaN(x) || Number.isNaN(y) ? 0 : x - y;
}
