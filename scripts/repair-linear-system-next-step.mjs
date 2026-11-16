import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Supply the TestGen workspace path');
const file = path.join(root, 'curriculum/comment-language.json');
const data = JSON.parse(await readFile(file, 'utf8'));
const now = Date.now();
let changed = 0;
for (const [key, entry] of Object.entries(data.outcomes)) {
  const [classId, unitId, sectionId, indicatorId] = JSON.parse(key);
  const ref = entry.nextStepIndicator;
  // Correct only the automatically migrated section-level recommendation.
  if (sectionId !== '10I.R.9' || indicatorId !== null || !ref ||
      ref.classId !== classId || ref.unitId !== unitId || ref.sectionId !== sectionId ||
      ref.indicatorId !== '10I.R.9.7') continue;
  entry.nextStepIndicator = { ...ref, indicatorId: '10I.R.9.5' };
  entry.updatedAt = now;
  changed++;
}
if (changed) {
  const backup = path.join(root, 'backups', `linear-system-next-step-before-${new Date(now).toISOString().replaceAll(':', '-')}`);
  await mkdir(backup, { recursive: true });
  await copyFile(file, path.join(backup, 'comment-language.json'));
  data.updatedAt = now;
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`Corrected ${changed} next-step links. Backup: ${backup}`);
} else console.log('No matching section-level links found.');
