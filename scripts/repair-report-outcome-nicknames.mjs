import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Supply the TestGen workspace path');
const file = path.join(root, 'curriculum/comment-language.json');
const data = JSON.parse(await readFile(file, 'utf8'));
const reviewed = {
  '11P.A.2': 'simplify expressions involving square roots',
  '11P.A.3': 'solve equations involving square roots',
  '11P.A.4': 'simplify rational expressions',
  '11P.A.5': 'add, subtract, multiply, and divide rational expressions',
  '11P.A.6': 'solve rational equations',
  '11P.R.1': 'factor quadratic expressions',
  '11P.R.2': 'graph and analyze absolute value functions',
  '11P.T.1': 'work with angles in standard position',
  '11P.T.2': 'use sine, cosine, and tangent ratios',
  '11P.T.3': 'use the sine and cosine laws',
};
const now = Date.now();
const previous = {
  '11P.A.2': 'Radical expressions.', '11P.A.3': 'Radical equations.',
  '11P.A.4': 'Rational expressions.', '11P.A.5': 'Operations on rational expressions.',
  '11P.A.6': 'Rational equations.', '11P.R.1': 'Factor quadratics.',
  '11P.R.2': 'Absolute value functions.', '11P.T.1': 'Angles in standard position.',
  '11P.T.2': 'Primary trig ratios.', '11P.T.3': 'Sine law and cosine law.',
};
let changed = 0;
for (const [key, entry] of Object.entries(data.outcomes)) {
  const [, , id, indicator] = JSON.parse(key);
  if (indicator !== null || !reviewed[id] || entry.nickname !== previous[id]) continue;
  entry.nickname = reviewed[id];
  entry.updatedAt = now;
  changed++;
}
if (changed) {
  const backup = path.join(root, 'backups', `outcome-nicknames-before-${new Date(now).toISOString().replaceAll(':', '-')}`);
  await mkdir(backup, { recursive: true });
  await copyFile(file, path.join(backup, 'comment-language.json'));
  data.updatedAt = now;
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`Updated ${changed} outcome labels. Backup: ${backup}`);
}
