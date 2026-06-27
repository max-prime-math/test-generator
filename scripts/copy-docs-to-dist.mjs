import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const docsBuildDir = resolve('docs-build');
const docsIndex = resolve(docsBuildDir, 'index.html');
const distDir = resolve('dist');
const docsDistDir = resolve(distDir, 'docs');

try {
  await stat(docsIndex);
} catch {
  throw new Error('Missing docs-build/index.html. Run npm run docs:build before copying docs.');
}

await mkdir(distDir, { recursive: true });
await rm(docsDistDir, { recursive: true, force: true });
await cp(docsBuildDir, docsDistDir, { recursive: true });

console.log(`Copied docs build to ${docsDistDir}`);
