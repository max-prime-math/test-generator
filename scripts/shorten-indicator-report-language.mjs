import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const rootArg = args.find(argument => !argument.startsWith('--'));
if (!rootArg) {
  console.error('Usage: node scripts/shorten-indicator-report-language.mjs /path/to/TestGen [--model=qwen3.5:4b] [--max-length=90] [--apply]');
  process.exit(2);
}

const option = (name, fallback) => args.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const root = path.resolve(rootArg);
const apply = args.includes('--apply');
const model = option('model', 'qwen3.5:4b');
const maxLength = Number(option('max-length', '90'));
const batchSize = Number(option('batch-size', '20'));
const checkpointPath = option('checkpoint', '');
const ollamaHost = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
if (!Number.isInteger(maxLength) || maxLength < 40 || maxLength > 140) throw new Error('max-length must be an integer from 40 to 140');

const catalogPath = path.join(root, 'curriculum', 'catalog.json');
const languagePath = path.join(root, 'curriculum', 'comment-language.json');
const [catalog, language] = await Promise.all([
  readFile(catalogPath, 'utf8').then(JSON.parse),
  readFile(languagePath, 'utf8').then(JSON.parse),
]);

/** This is intentionally identical to the original population pass. */
function originalGeneratedNickname(text) {
  let phrase = String(text).replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  phrase = phrase.replace(/^Determine,? with technology,? /i, 'use technology to determine ')
    .replace(/^Verify,? with examples,? /i, 'use examples to verify ')
    .replace(/^Explain,? using examples,? /i, 'use examples to explain ')
    .replace(/^Demonstrate an understanding of /i, 'show understanding of ')
    .replace(/^Provide examples of /i, 'give examples of ')
    .replace(/^Solve (?:a )?problems? that involves? /i, 'solve problems involving ')
    .replace(/\ba problem that involves\b/gi, 'problems involving')
    .replace(/\bproblems that involve\b/gi, 'problems involving')
    .replace(/\bconcretely, pictorially, and symbolically\b/gi, 'using models, pictures, and symbols')
    .replace(/\bconcrete, pictorial, and symbolic representations\b/gi, 'models, pictures, and symbols')
    .replace(/\bnumerical and algebraic examples\b/gi, 'number and algebra examples');
  return /^[A-Z][a-z]/.test(phrase) ? phrase[0].toLocaleLowerCase() + phrase.slice(1) : phrase;
}

const catalogEntries = new Map();
for (const course of catalog.courses ?? []) for (const unit of course.units ?? []) for (const section of unit.sections ?? []) {
  for (const indicator of section.indicators ?? []) {
    const key = JSON.stringify([course.id, unit.id, section.id, indicator.id]);
    catalogEntries.set(key, { officialText: String(indicator.text), indicatorId: String(indicator.id) });
  }
}

// Only revise phrases produced verbatim by the earlier automated pass. Any
// teacher-edited nickname is preserved, regardless of length.
const candidates = [];
for (const [key, entry] of Object.entries(language.outcomes ?? {})) {
  const catalogEntry = catalogEntries.get(key);
  if (!catalogEntry || typeof entry?.nickname !== 'string' || entry.nickname.length <= maxLength) continue;
  if (entry.nickname !== originalGeneratedNickname(catalogEntry.officialText)) continue;
  candidates.push({ key, ...catalogEntry, currentNickname: entry.nickname });
}

const unique = [...new Map(candidates.map(candidate => [candidate.officialText, candidate])).values()];
if (!unique.length) {
  console.log(`No generated indicator nicknames exceed ${maxLength} characters.`);
  process.exit(0);
}

const shortened = new Map(checkpointPath ? await readFile(checkpointPath, 'utf8').then(JSON.parse).catch(() => []) : []);
function firstJsonObject(text) {
  let depth = 0, quoted = false, escaped = false, start = -1;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') { if (depth++ === 0) start = index; }
    else if (char === '}' && depth && --depth === 0) return JSON.parse(text.slice(start, index + 1));
  }
  throw new Error(`Model did not return a complete JSON object: ${text}`);
}
async function rewrite(items, targetLength, extra = '') {
  const response = await fetch(`${ollamaHost}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      keep_alive: '5m',
      format: 'json',
      options: { temperature: 0.1, num_ctx: 16384 },
      messages: [{
        role: 'system',
        content: `Rewrite each official mathematics achievement indicator as a concise, parent-readable verb phrase of at most ${targetLength} characters. The phrase must naturally complete “The student can …”. Preserve the assessed mathematical action and concept. Remove examples, exhaustive lists, classroom directions, and phrases such as “using a variety of strategies” when they are not the core skill. Do not invent a broader skill. Use sentence case beginning with a lowercase verb, no terminal punctuation, no bullets, and no newline. ${extra} Return JSON only, exactly in the form {"items":[{"id":"the supplied id","nickname":"the phrase"}]}. Return every id exactly once.`,
      }, { role: 'user', content: JSON.stringify({ items }) }],
    }),
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const result = firstJsonObject(payload.message?.content ?? '{}');
  return new Map((result.items ?? []).map(item => [String(item.id), String(item.nickname ?? '').replace(/\s+/g, ' ').trim()]));
}

for (let offset = 0; offset < unique.length; offset += batchSize) {
  const batch = unique.slice(offset, offset + batchSize).map((candidate, index) => ({
    id: String(offset + index),
    indicatorId: candidate.indicatorId,
    officialText: candidate.officialText,
  }));
  const pending = batch.filter(item => !shortened.has(item.officialText));
  const byId = pending.length ? await rewrite(pending, maxLength) : new Map();
  for (const item of pending) {
    let nickname = byId.get(item.id);
    if (!nickname || nickname.length > maxLength + 20) {
      const retried = await rewrite([item], maxLength - 15,
        'This is a retry: compress the wording substantially and omit secondary details.');
      nickname = retried.get(item.id);
    }
    if (!nickname || nickname.length > maxLength + 20) {
      const retried = await rewrite([item], maxLength - 30,
        'This is a final retry: keep only the central assessed action and mathematical concept.');
      nickname = retried.get(item.id);
    }
    if (!nickname || nickname.length > maxLength + 20) throw new Error(`Model could not shorten item ${item.id}: ${nickname ?? '(missing)'}`);
    nickname = nickname.replace(/[.!?]+$/u, '');
    if (/\n|^[-•]/u.test(nickname)) throw new Error(`Invalid nickname for ${item.id}: ${nickname}`);
    shortened.set(item.officialText, nickname[0]?.toLocaleLowerCase() + nickname.slice(1));
  }
  if (checkpointPath) await writeFile(checkpointPath, JSON.stringify([...shortened]) + '\n');
  console.log(`Reviewed ${Math.min(offset + batch.length, unique.length)}/${unique.length} distinct long indicators.`);
}

const now = Date.now();
let changed = 0;
for (const candidate of candidates) {
  const nickname = shortened.get(candidate.officialText);
  if (!nickname || nickname === candidate.currentNickname) continue;
  language.outcomes[candidate.key] = { ...language.outcomes[candidate.key], nickname, updatedAt: now };
  changed++;
}

const preview = candidates.slice(0, 12).map(candidate => ({
  indicatorId: candidate.indicatorId,
  before: candidate.currentNickname,
  after: shortened.get(candidate.officialText),
}));
const draftPath = option('draft', '');
if (draftPath) await writeFile(draftPath, JSON.stringify(unique.map(candidate => ({
  indicatorId: candidate.indicatorId, before: candidate.currentNickname,
  officialText: candidate.officialText, after: shortened.get(candidate.officialText),
})), null, 2) + '\n');
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', model, maxLength, distinct: unique.length, placements: candidates.length, changed, preview }, null, 2));
if (!apply || !changed) process.exit(0);

language.schemaVersion = 2;
language.updatedAt = now;
const stamp = new Date(now).toISOString().replaceAll(':', '-');
const backupDir = path.join(root, 'backups', `indicator-nicknames-before-${stamp}`);
await mkdir(backupDir, { recursive: true });
await copyFile(languagePath, path.join(backupDir, 'comment-language.json'));
await writeFile(languagePath, `${JSON.stringify(language, null, 2)}\n`);
console.log(`Updated ${changed} indicator placements. Backup: ${backupDir}`);
