// A small invalidation token avoids rereading every image just to detect edits.
// The storage token also invalidates other tabs on the same origin.
const KEY = 'tg-image-content-revision-v1';
let revision = 0;

export function noteBrowserImageChange(): void {
  revision += 1;
  try { localStorage.setItem(KEY, crypto.randomUUID()); } catch { /* In-tab revision still advances. */ }
}

export function browserImageRevision(): string {
  let shared = '';
  try { shared = localStorage.getItem(KEY) ?? ''; } catch { /* Storage may be unavailable. */ }
  return `${revision}:${shared}`;
}
