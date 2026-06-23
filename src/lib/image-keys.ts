/** Strip path, lowercase extension. Returns `{stem, ext}`. */
export function splitFilename(name: string): { stem: string; ext: string } {
  const last = name.split(/[/\\]/).pop() ?? name;
  const i = last.lastIndexOf('.');
  if (i <= 0) return { stem: last, ext: '' };
  return { stem: last.slice(0, i), ext: last.slice(i + 1).toLowerCase() };
}

const IMAGE_REFERENCE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'bmp', 'pdf']);

/** Canonical browser image key for references and uploaded filenames. */
export function imageKeyFromReference(value: string): string {
  let ref = value.trim();
  if (!ref || /^[a-z]+:\/\//i.test(ref)) return '';
  ref = ref.replace(/^['"]|['"]$/g, '');
  if (ref.startsWith('/imgs/')) ref = ref.slice('/imgs/'.length);
  ref = ref.split(/[?#]/, 1)[0] ?? '';
  try {
    ref = decodeURIComponent(ref);
  } catch {
    // Keep the raw reference if it is not percent-encoded cleanly.
  }
  const { stem, ext } = splitFilename(ref);
  return (ext && IMAGE_REFERENCE_EXTENSIONS.has(ext) ? stem : ref).trim();
}
