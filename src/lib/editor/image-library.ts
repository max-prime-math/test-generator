import { bank } from '../bank.svelte';
import { narratives } from '../narratives.svelte';
import { testLibrary } from '../test-library.svelte';
import { imageStore, splitFilename, imageKeyFromReference } from '../image-store.svelte';
import { editor } from './editor-state.svelte';
import { rewriteImageReferences, usesImage } from './image-references';

export const IMAGE_RENAMED_EVENT = 'tg-image-reference-changed';
export function imageUsage(name: string) {
  return {
    questions: [...bank.userQuestions, ...bank.demoQuestions].filter(q => usesImage(q, name)),
    drafts: editor.session.drafts.filter(d => usesImage(d, name)),
    narratives: narratives.narratives.filter(n => usesImage(n, name)),
    tests: testLibrary.tests.filter(t => usesImage(t, name)),
    testDraft: usesImage([testLibrary.draft, testLibrary.draftContext.unnamedDraft], name),
    ingest: Boolean(localStorage.getItem('ingest-draft') && usesImage(readIngest(), name)),
  };
}
function readIngest(): unknown {
  const raw = localStorage.getItem('ingest-draft');
  try { return raw ? JSON.parse(raw) : null; } catch { return raw; }
}
export function usageCount(usage: ReturnType<typeof imageUsage>) {
  return usage.questions.length + usage.drafts.length + usage.narratives.length + usage.tests.length + Number(usage.testDraft) + Number(usage.ingest);
}
export function validateImageName(name: string): string {
  const trimmed = name.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,119}$/.test(trimmed) || trimmed.endsWith('.') || trimmed.includes('..')) throw new Error('Use a name starting with a letter or number, with letters, numbers, spaces, dots, hyphens or underscores.');
  return imageKeyFromReference(trimmed);
}
function rewriteEverywhere(oldName: string, name: string, ext: string) {
  const rewrite = <T>(value: T) => rewriteImageReferences(value, oldName, name, ext);
  for (const q of [...bank.userQuestions, ...bank.demoQuestions]) {
    if (usesImage(q, oldName)) bank.update(q.id, { ...rewrite(q), checked: undefined, renderError: undefined });
  }
  for (const n of narratives.narratives) if (usesImage(n, oldName)) narratives.update(n.id, rewrite(n));
  for (const test of testLibrary.tests) if (usesImage(test, oldName)) testLibrary.replaceWithRemote({ ...rewrite(test), updatedAt: Date.now() });
  if (testLibrary.draft) {
    const context = { ...testLibrary.draftContext };
    if (context.unnamedDraft) context.unnamedDraft = rewrite(context.unnamedDraft);
    if (context.savedConfig) context.savedConfig = JSON.stringify(rewrite(JSON.parse(context.savedConfig)));
    testLibrary.saveDraft(rewrite(testLibrary.draft), context);
  }
  // Transform original snapshots too, so a library rename cannot manufacture an
  // edit conflict. Real prior content conflicts remain detectable after rewriting.
  editor.session.drafts = editor.session.drafts.map(rewrite);
  editor.persist();
  const ingest = readIngest();
  if (ingest && usesImage(ingest, oldName)) localStorage.setItem('ingest-draft', JSON.stringify(rewrite(ingest)));
  window.dispatchEvent(new CustomEvent(IMAGE_RENAMED_EVENT, { detail: { oldName, name, ext } }));
}
export async function renameImage(oldName: string, nextName: string): Promise<string> {
  const image = await imageStore.get(oldName);
  if (!image) throw new Error('The image could not be found.');
  const name = validateImageName(nextName);
  if (name === image.name) return name;
  if (imageStore.has(name)) throw new Error('An image already uses that name.');
  // Write the destination first and remove the original only after every reference
  // was updated. A persistence failure leaves the original bytes recoverable.
  await imageStore.put(name, image.bytes, image.ext);
  rewriteEverywhere(image.name, name, image.ext);
  await imageStore.remove(image.name);
  return name;
}
export async function replaceImage(name: string, file: File): Promise<void> {
  const image = await imageStore.get(name);
  if (!image) throw new Error('The image could not be found.');
  const { ext } = splitFilename(file.name);
  if (!['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext)) throw new Error('Choose a PNG, JPEG, SVG, WebP or GIF image.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  await imageStore.put(image.name, bytes, ext);
  rewriteEverywhere(image.name, image.name, ext);
}
export async function deleteImage(name: string): Promise<void> {
  if (usageCount(imageUsage(name))) throw new Error('This image is still used. Remove or replace its references before deleting the file.');
  await imageStore.remove(name);
}
