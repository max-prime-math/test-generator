import { imageKeyFromReference } from './image-keys.ts';
import { referencedImageNames, rewriteImageReferences } from './editor/image-references.ts';

/**
 * Older test snapshots renamed image declarations but missed extensionless
 * references in bodies/solutions. Recover only from the question's own declared
 * frozen assets; never guess from another bank's images or an ambiguous suffix.
 */
export function repairFrozenImageReferences<T extends { images?: string[] }>(value: T): T {
  const declared = new Set((value.images ?? []).map(imageKeyFromReference));
  const frozen = [...declared].filter(name => name.startsWith('testasset-'));
  if (!frozen.length) return value;
  let repaired = value;
  for (const reference of referencedImageNames(value)) {
    if (reference.startsWith('testasset-') || declared.has(reference)) continue;
    // snapshotTest preserves the last 35 characters of the original basename.
    const matches = frozen.filter(name => name.endsWith(`-${reference.slice(-35)}`));
    if (matches.length === 1) repaired = rewriteImageReferences(repaired, reference, matches[0]);
  }
  return repaired;
}
