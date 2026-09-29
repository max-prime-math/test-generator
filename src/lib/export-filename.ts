/**
 * The base name for a test's exported files: "AP Calculus - Test 1" from the title and the
 * subtitle (test name). Characters that are not allowed in file names are removed.
 */
export function exportBaseName(title: string, subtitle: string): string {
  const clean = (text: string) => text
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim();
  const name = [clean(title), clean(subtitle)].filter(Boolean).join(' - ');
  return name.slice(0, 120).trim() || 'Test';
}
