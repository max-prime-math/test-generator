import { readBrowserAppData } from '../git/repoDataBridge';
import type { RepoDataImage } from '../git/repoDataModel';
import { bankWorkspaces } from './bank-workspaces.svelte';
import { workspaceCatalog } from './workspace-catalog.svelte';
import { banksFolderSync } from './banks-folder-sync.svelte';
import { customClasses } from './custom-classes.svelte';
import { CLASSES, DEMO_CLASSES } from './curriculum';
import { imageStore } from './image-store.svelte';
import { testLibrary } from './test-library.svelte';
import { bankOnlyData, firstById, mergeWorkspaceClasses } from './workspace-format';
import { readTestAssets } from './test-assets';
import { bank } from './bank.svelte';
import { narratives } from './narratives.svelte';
import { copySharedTests, writeShareZip, writeTestsZip } from './share-package-client';
import { createId } from './id';
import type { SharePackage } from './share-package';
import type { Question, SavedTest } from './types';

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export async function exportBankZip(bankId: string): Promise<Uint8Array> {
  const bank = bankWorkspaces.banks.find(entry => entry.id === bankId);
  if (!bank || bankWorkspaces.switching) throw new Error('Wait for the bank to finish loading, then try again.');
  const activeId = bankWorkspaces.activeBankId;
  const data = bankId === activeId ? await readBrowserAppData({ tests: false }) : await bankWorkspaces.readBankSnapshot(bankId);
  if (bankWorkspaces.activeBankId !== activeId || bankWorkspaces.switching) throw new Error('The bank changed. Choose the bank again before exporting.');
  if (!data) throw new Error('This bank is not available. Open it, then try again.');
  const referenced = new Set(data.questions.map(question => question.classId));
  data.customClasses = mergeWorkspaceClasses([...data.customClasses, ...[...customClasses.catalog, ...CLASSES, ...DEMO_CLASSES].filter(cls => referenced.has(cls.id))]);
  const onlyBank = bankOnlyData(data);
  return writeShareZip({ kind: 'bank', items: [{ name: bank.name, data: { ...onlyBank, customClasses: plain(onlyBank.customClasses) } }] });
}

export async function exportTestsZip(tests: SavedTest[]): Promise<Uint8Array> {
  if (!tests.length) throw new Error('Choose at least one test.');
  const activeId = bankWorkspaces.activeBankId;
  const copies: SavedTest[] = [];
  const bankQuestions = firstById([...workspaceCatalog.questions, ...bank.questions]);
  const usedQuestions = new Map<string, Question>();
  const images = new Map<string, RepoDataImage>();
  for (const test of tests) {
    const saved = await testLibrary.read(test.id);
    if (!saved) throw new Error(`“${test.name}” is no longer available. Reopen Saved Tests and try again.`);
    copies.push(plain(saved));
    const frozen = firstById([...(saved.config.ownQuestions ?? []), ...(saved.questionSnapshots ?? [])]);
    const questions = saved.config.selectedIds.flatMap(id => {
      const question = frozen.get(id) ?? bankQuestions.get(id);
      if (question && !frozen.has(id)) usedQuestions.set(id, question);
      return question ? [question] : [];
    });
    const ids = new Set(questions.map(question => question.narrativeId));
    const leads = [...firstById([...(saved.narrativeSnapshots ?? []), ...narratives.narratives]).values()].filter(n => ids.has(n.id));
    for (const image of await readTestAssets(questions, leads, saved.config)) images.set(image.name, image);
  }
  if (activeId !== bankWorkspaces.activeBankId || bankWorkspaces.switching) throw new Error('The bank changed. Try exporting again.');
  return writeTestsZip(copies, {
    questions: plain([...usedQuestions.values()]),
    narratives: plain(narratives.narratives),
    savedTests: [],
    customClasses: plain(mergeWorkspaceClasses([...customClasses.catalog, ...workspaceCatalog.classes, ...CLASSES, ...DEMO_CLASSES])),
    images: [...images.values()],
  });
}

export async function importBankZip(pack: SharePackage, name: string): Promise<{ id: string; name: string }> {
  if (pack.kind !== 'bank' || pack.items.length !== 1 || !name.trim()) throw new Error('Choose a bank ZIP and enter a name for the new bank.');
  if (bankWorkspaces.switching) throw new Error('Wait for the bank switch to finish, then import again.');
  const entry = { id: createId(), name: name.trim(), data: pack.items[0].data };
  // Prepare the optional workspace catalog before publishing the new bank.
  // Its immutable assets cannot collide with the active bank's image names.
  const shared = workspaceCatalog.banks.length > 0;
  if (shared) {
    const { WorkspaceCatalog } = await import('./workspace-catalog.svelte');
    const prepared = new WorkspaceCatalog();
    for (const image of await prepared.updateBank(entry)) {
      if (!imageStore.has(image.name)) await imageStore.put(image.name, image.bytes, image.ext);
    }
  }
  customClasses.rememberImported(entry.data.customClasses);
  await bankWorkspaces.registerNewFolderBanks([entry]);
  if (shared) {
    banksFolderSync.addToFolder(entry.id);
    await workspaceCatalog.updateBank(entry);
  }
  return { id: entry.id, name: entry.name };
}

export async function importTestsZip(pack: SharePackage): Promise<SavedTest[]> {
  if (pack.kind !== 'tests' || !pack.items.length) throw new Error('Choose at least one test from a test ZIP.');
  if (bankWorkspaces.switching) throw new Error('Wait for the bank switch to finish, then import again.');
  const activeId = bankWorkspaces.activeBankId;
  const prepared = await copySharedTests(pack, plain(testLibrary.tests));
  const written: string[] = [];
  try {
    for (const image of prepared.images) {
      if (activeId !== bankWorkspaces.activeBankId) throw new Error('The bank changed. Reopen the import in the intended bank.');
      await imageStore.put(image.name, image.bytes, image.ext);
      written.push(image.name);
    }
    if (activeId !== bankWorkspaces.activeBankId || bankWorkspaces.switching) throw new Error('The bank changed. Reopen the import in the intended bank.');
    // Shared course metadata is additive; importing a test never adds questions
    // or class membership to the current question bank.
    customClasses.rememberImported(pack.items.flatMap(item => item.data.customClasses));
    await testLibrary.addImportedCopies(prepared.tests);
    return prepared.tests;
  } catch (error) {
    if (activeId === bankWorkspaces.activeBankId) {
      for (const name of written) await imageStore.remove(name).catch(() => undefined);
    }
    throw error;
  }
}

export function downloadShareZip(bytes: Uint8Array, name: string) {
  const safe = name.trim().replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 100) || 'TestGen';
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url; link.download = `${safe}.zip`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
