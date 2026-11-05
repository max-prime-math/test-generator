import { strFromU8 } from 'fflate';
import { exportAppDataToRepoEntries, importRepoEntriesToAppData, REPO_DATA_LIMITS, type RepoAppData } from '../git/repoDataModel.ts';
import { parseBulkImportJson } from './bulk-import.ts';
import { mergeWorkspaceClasses } from './workspace-format.ts';
import { createId } from './id.ts';
import type { Class, Question } from './types';

/** Convert a collection of self-contained PQPs to one bank before anything is saved. */
export function decodePqpZip(files: Record<string, Uint8Array>): { name: string; data: RepoAppData } | null {
  const paths = Object.keys(files).filter(path => /\.pqp\.json$/i.test(path)).sort();
  if (!paths.length) return null;
  const questions = new Map<string, Question>();
  const images = new Map<string, { name: string; ext: string; base64: string; bytes: Uint8Array }>();
  const classes: Class[] = [];
  const createdAt = Date.now();
  let name = '';
  for (const path of paths) {
    const text = strFromU8(files[path]);
    let raw: Record<string, unknown>;
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
      raw = value as Record<string, unknown>;
    } catch {
      throw new Error(`Could not read ${path} as PQP JSON. Export that package again and retry.`);
    }
    if (raw.version !== undefined && raw.version !== '1.0') {
      throw new Error(`${path} uses unsupported PQP version ${String(raw.version)}. Export it as PQP version 1.0 and retry.`);
    }
    const parsed = parseBulkImportJson(text);
    if (raw?.format !== 'portable-question-package' || !parsed || parsed.kind !== 'portable-question-package' || parsed.error
      || !Array.isArray(raw.questions) || parsed.questions.length !== raw.questions.length) {
      throw new Error(`Could not read every question in ${path}. Check the PQP export and try again.`);
    }
    const source = raw.source && typeof raw.source === 'object' && !Array.isArray(raw.source)
      ? raw.source as Record<string, unknown>
      : null;
    if (!name && typeof source?.label === 'string') name = source.label.trim();
    // Use the normal bank validator for supplied curriculum, then merge by IDs.
    const metadata = importRepoEntriesToAppData(exportAppDataToRepoEntries({
      questions: [], savedTests: [], customClasses: Array.isArray(raw.classes) ? raw.classes : [],
    })).appData;
    classes.push(...metadata.customClasses);
    for (const [index, draft] of parsed.questions.entries()) {
      const { tagInput, className, unitName, sectionName, rawLatex: _latex, rawFormat: _format, ...fields } = draft;
      const id = typeof raw.questions[index]?.id === 'string' && raw.questions[index].id.trim() ? raw.questions[index].id.trim() : createId();
      const question: Question = { ...fields, id, createdAt,
        classId: draft.classId || undefined, unitId: draft.unitId || undefined, sectionId: draft.sectionId || undefined,
        tags: [...new Set(tagInput.split(',').map(tag => tag.trim()).filter(Boolean))],
      };
      const prior = questions.get(id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(question)) {
        throw new Error(`Question ${id} has different versions in this ZIP. Import those PQP files separately.`);
      }
      questions.set(id, question);
      if (draft.classId) classes.push({ id: draft.classId, name: className || draft.classId, units: draft.unitId ? [{
        id: draft.unitId, name: unitName || draft.unitId, sections: draft.sectionId ? [{ id: draft.sectionId, name: sectionName || draft.sectionId }] : [],
      }] : [] });
    }
    for (const image of parsed.embeddedImages ?? []) {
      const key = image.name.toLowerCase();
      const prior = images.get(key);
      if (prior) {
        if (prior.ext !== image.ext || prior.base64 !== image.base64) throw new Error(`Picture ${image.name} has different versions in this ZIP. Import those PQP files separately.`);
        continue;
      }
      // Bound the decoded allocation before atob; each embedded picture keeps the usual image limit.
      if (image.base64.length > Math.ceil(REPO_DATA_LIMITS.maxImageFileBytes / 3) * 4) throw new Error(`Picture ${image.name} exceeds the 10 MB image limit.`);
      let binary: string;
      try { binary = atob(image.base64); }
      catch { throw new Error(`Picture ${image.name} has invalid embedded data. Export the PQP again.`); }
      if (binary.length > REPO_DATA_LIMITS.maxImageFileBytes) throw new Error(`Picture ${image.name} exceeds the 10 MB image limit.`);
      images.set(key, { ...image, bytes: Uint8Array.from(binary, char => char.charCodeAt(0)) });
    }
  }
  // The bank format's existing per-question, image, reference and total limits still apply.
  const data = importRepoEntriesToAppData(exportAppDataToRepoEntries({
    questions: [...questions.values()], customClasses: mergeWorkspaceClasses(classes), savedTests: [],
    images: [...images.values()].map(({ name, ext, bytes }) => ({ name, ext, bytes })),
  })).appData;
  return { name: (name || 'Imported question bank').slice(0, 500), data };
}
