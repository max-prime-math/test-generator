import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Supply the TestGen workspace path');
const file = path.join(root, 'curriculum/comment-language.json');
const data = JSON.parse(await readFile(file, 'utf8'));
if (data.schemaVersion !== 1) throw new Error('Expected a version 1 language file');
const backup = path.join(root, 'backups', `language-schema-before-${new Date().toISOString().replaceAll(':', '-')}`);
await mkdir(backup, { recursive: true });
await copyFile(file, path.join(backup, 'comment-language.json'));
data.schemaVersion = 2;
await writeFile(file, JSON.stringify(data, null, 2) + '\n');
console.log(`Upgraded language format. Backup: ${backup}`);
