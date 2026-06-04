import { unzlib, unzlibSync, zlib } from 'fflate';
import { isReservedGitPath } from './pathFilters.ts';
import { normalizeRepoPath } from './repoDataModel.ts';
import {
  createIndexedDbGitFileStorage,
  createMemoryGitFileStorage,
  type GitFileStorage,
} from './repoStorage.ts';

const DEFAULT_BRANCH = 'main';
const DEFAULT_AUTHOR: RepoAuthor = {
  name: 'Test Generator Local',
  email: 'test-generator-local@example.invalid',
};
const TEXT_EXTENSIONS = new Set(['json', 'md', 'txt', 'csv', 'yaml', 'yml']);

const ENGINE_NOTE = [
  'Test Generator browser git backend',
  '',
  'This repository is stored in browser-managed IndexedDB by local repo id.',
  'The working tree is generated from Test Generator repository data entries.',
  'The backend writes Git-compatible HEAD, refs, a binary index, and compressed loose objects.',
  'Remote transport and app-level conflict workflows are intentionally outside this local phase.',
  'File modes are normalized to 100644; symlinks, submodules, and executable bits are not supported.',
].join('\n');

export { createIndexedDbGitFileStorage, createMemoryGitFileStorage, type GitFileStorage };

export type RepoResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RepoError };

export interface RepoError {
  code:
    | 'not-found'
    | 'not-initialized'
    | 'invalid-path'
    | 'invalid-ref'
    | 'unsafe-worktree'
    | 'nothing-to-commit'
    | 'invalid-author'
    | 'invalid-message'
    | 'unsupported'
    | 'corrupt-repository'
    | 'storage-error'
    | 'locked';
  message: string;
  recoverable: boolean;
}

export interface RepoAuthor {
  name: string;
  email: string;
}

export interface RepoStatusEntry {
  path: string;
  staged: 'added' | 'modified' | 'deleted' | null;
  worktree: 'modified' | 'deleted' | 'untracked' | null;
}

export interface RepoStatus {
  branch: string;
  headSha: string | null;
  entries: RepoStatusEntry[];
}

export interface RepoBranch {
  name: string;
  sha: string | null;
  current: boolean;
}

export interface RepoCommit {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  parentShas: string[];
}

export interface RepoCommitDetails extends RepoCommit {
  treeSha: string;
  committerName: string;
  committerEmail: string;
  committedAt: string;
  authorTimezone: string;
  committerTimezone: string;
}

export interface RepoObject {
  type: 'blob' | 'tree' | 'commit';
  content: Uint8Array;
}

export interface RepoTreeEntry {
  path: string;
  oid: string;
  mode: '100644';
  size: number;
}

export interface RepoTrackedFile {
  path: string;
  content: RepoFileContent;
}

export interface RepoFileEntry {
  path: string;
  kind: 'file';
  content: RepoFileContent;
}

export type RepoFileContent = string | Uint8Array;

export interface TestGeneratorRepository {
  id: string;
  displayName: string;
  filesystem: {
    entries: Record<string, RepoFileEntry>;
    updatedAt: string;
  };
  git: {
    backend: 'browser-git';
    status: 'not-initialized' | 'ready' | 'needs-recovery';
    headRef: string | null;
    defaultBranch: string | null;
    initializedAt?: string | null;
    recoveryMessage?: string | null;
    remotes: Array<{ name: string; url: string }>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RepoBackend {
  initRepository(repo: TestGeneratorRepository): Promise<RepoResult<TestGeneratorRepository>>;
  openRepository(repo: TestGeneratorRepository): Promise<RepoResult<RepoStatus>>;
  getCurrentBranch(repo: TestGeneratorRepository): Promise<RepoResult<string>>;
  status(repo: TestGeneratorRepository): Promise<RepoResult<RepoStatus>>;
  stagePaths(repo: TestGeneratorRepository, paths: string[]): Promise<RepoResult<RepoStatus>>;
  stageAll(repo: TestGeneratorRepository): Promise<RepoResult<RepoStatus>>;
  commit(repo: TestGeneratorRepository, options: { message: string; author?: Partial<RepoAuthor> }): Promise<RepoResult<RepoCommit>>;
  log(repo: TestGeneratorRepository, limit?: number): Promise<RepoResult<RepoCommit[]>>;
  listBranches(repo: TestGeneratorRepository): Promise<RepoResult<RepoBranch[]>>;
  createBranch(repo: TestGeneratorRepository, name: string): Promise<RepoResult<RepoBranch>>;
  switchBranch(repo: TestGeneratorRepository, name: string): Promise<RepoResult<{ repo: TestGeneratorRepository; branch: RepoBranch }>>;
  readTrackedFiles(repo: TestGeneratorRepository): Promise<RepoResult<RepoTrackedFile[]>>;
  getRef(repo: TestGeneratorRepository, refPath: string): Promise<RepoResult<string | null>>;
  setRef(repo: TestGeneratorRepository, refPath: string, sha: string | null): Promise<RepoResult<void>>;
  listRefs(repo: TestGeneratorRepository, prefix?: string): Promise<RepoResult<Record<string, string>>>;
  hasObject(repo: TestGeneratorRepository, sha: string): Promise<RepoResult<boolean>>;
  readObject(repo: TestGeneratorRepository, sha: string): Promise<RepoResult<RepoObject>>;
  writeObject(repo: TestGeneratorRepository, type: RepoObject['type'], content: Uint8Array): Promise<RepoResult<string>>;
  readCommitDetails(repo: TestGeneratorRepository, sha: string): Promise<RepoResult<RepoCommitDetails>>;
  listCommitTree(repo: TestGeneratorRepository, commitSha: string): Promise<RepoResult<RepoTreeEntry[]>>;
  writeTree(repo: TestGeneratorRepository, entries: RepoTreeEntry[]): Promise<RepoResult<string>>;
  isAncestor(repo: TestGeneratorRepository, ancestorSha: string, descendantSha: string): Promise<RepoResult<boolean>>;
  fastForwardBranch(repo: TestGeneratorRepository, branch: string, sha: string): Promise<RepoResult<{ repo: TestGeneratorRepository; status: RepoStatus }>>;
}

export function createRepoBackend(storage: GitFileStorage = createIndexedDbGitFileStorage()): RepoBackend {
  return {
    initRepository: (repo) => asResult(() => initRepository(storage, repo)),
    openRepository: (repo) => asResult(() => openRepository(storage, repo)),
    getCurrentBranch: (repo) => asResult(() => getCurrentBranch(storage, repo)),
    status: (repo) => asResult(() => getStatus(storage, repo)),
    stagePaths: (repo, paths) => asResult(() => stagePaths(storage, repo, paths)),
    stageAll: (repo) => asResult(() => stagePaths(storage, repo, ['.'])),
    commit: (repo, options) => asResult(() => commit(storage, repo, options)),
    log: (repo, limit) => asResult(() => getLog(storage, repo, limit)),
    listBranches: (repo) => asResult(() => listBranches(storage, repo)),
    createBranch: (repo, name) => asResult(() => createBranch(storage, repo, name)),
    switchBranch: (repo, name) => asResult(() => switchBranch(storage, repo, name)),
    readTrackedFiles: (repo) => asResult(() => readTrackedFiles(storage, repo)),
    getRef: (repo, refPath) => asResult(() => getRef(storage, repo, refPath)),
    setRef: (repo, refPath, sha) => asResult(() => setRef(storage, repo, refPath, sha)),
    listRefs: (repo, prefix) => asResult(() => listRefs(storage, repo, prefix)),
    hasObject: (repo, sha) => asResult(() => hasObject(storage, repo, sha)),
    readObject: (repo, sha) => asResult(() => readAnyObject(storage, repo.id, validateSha(sha))),
    writeObject: (repo, type, content) =>
      asResult(async () => {
        await assertRepositoryExists(storage, repo.id);
        return writeObject(storage, repo.id, type, content);
      }),
    readCommitDetails: (repo, sha) => asResult(() => readCommit(storage, repo.id, validateSha(sha))),
    listCommitTree: (repo, commitSha) => asResult(() => listCommitTree(storage, repo, commitSha)),
    writeTree: (repo, entries) => asResult(() => writeTree(storage, repo, entries)),
    isAncestor: (repo, ancestorSha, descendantSha) => asResult(() => isAncestor(storage, repo, ancestorSha, descendantSha)),
    fastForwardBranch: (repo, branch, sha) => asResult(() => fastForwardBranch(storage, repo, branch, sha)),
  };
}

export function createEmptyRepository(options: { id: string; displayName: string }): TestGeneratorRepository {
  const now = new Date().toISOString();
  return {
    id: options.id,
    displayName: options.displayName,
    filesystem: { entries: {}, updatedAt: now },
    git: {
      backend: 'browser-git',
      status: 'not-initialized',
      headRef: null,
      defaultBranch: DEFAULT_BRANCH,
      remotes: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function formatRepoError(error: RepoError): string {
  return error.message;
}

async function initRepository(storage: GitFileStorage, repo: TestGeneratorRepository): Promise<TestGeneratorRepository> {
  const existingHead = await readTextFile(storage, repo.id, 'HEAD');
  if (existingHead !== null) {
    await recoverRepositoryFiles(storage, repo.id);
    return markRepoReady(repo, await getCurrentBranchName(storage, repo.id));
  }

  await writeTextFile(storage, repo.id, 'HEAD', `ref: refs/heads/${DEFAULT_BRANCH}\n`);
  await writeTextFile(storage, repo.id, 'config', [
    '[core]',
    '\trepositoryformatversion = 0',
    '\tfilemode = false',
    '\tbare = false',
    '\tlogallrefupdates = true',
    '[user]',
    `\tname = ${DEFAULT_AUTHOR.name}`,
    `\temail = ${DEFAULT_AUTHOR.email}`,
    '',
  ].join('\n'));
  await writeTextFile(storage, repo.id, 'ENGINE.md', ENGINE_NOTE);
  await writeIndex(storage, repo.id, []);

  return markRepoReady(repo, DEFAULT_BRANCH);
}

async function openRepository(storage: GitFileStorage, repo: TestGeneratorRepository): Promise<RepoStatus> {
  await assertRepositoryExists(storage, repo.id);
  return getStatus(storage, repo);
}

async function recoverRepositoryFiles(storage: GitFileStorage, repoId: string): Promise<void> {
  if ((await readTextFile(storage, repoId, 'HEAD')) === null) {
    await writeTextFile(storage, repoId, 'HEAD', `ref: refs/heads/${DEFAULT_BRANCH}\n`);
  }
  const index = await storage.readFile(repoId, 'index');
  if (index === null) {
    await writeIndex(storage, repoId, []);
  } else {
    try {
      parseIndex(index);
    } catch {
      await writeIndex(storage, repoId, []);
    }
  }
  if ((await readTextFile(storage, repoId, 'ENGINE.md')) === null) {
    await writeTextFile(storage, repoId, 'ENGINE.md', ENGINE_NOTE);
  }
}

async function getCurrentBranch(storage: GitFileStorage, repo: TestGeneratorRepository): Promise<string> {
  await assertRepositoryExists(storage, repo.id);
  return getCurrentBranchName(storage, repo.id);
}

async function getStatus(storage: GitFileStorage, repo: TestGeneratorRepository): Promise<RepoStatus> {
  await assertRepositoryExists(storage, repo.id);
  const branch = await getCurrentBranchName(storage, repo.id);
  const headSha = await getHeadSha(storage, repo.id);
  const headFiles = headSha ? await readCommitTreeFiles(storage, repo.id, headSha) : new Map<string, IndexEntry>();
  const index = await readIndex(storage, repo.id);
  const workingFiles = await buildWorkingFileMap(storage, repo);
  const indexByPath = new Map(index.map((entry) => [entry.path, entry]));
  const paths = new Set([...headFiles.keys(), ...indexByPath.keys(), ...workingFiles.keys()]);
  const entries: RepoStatusEntry[] = [];

  for (const path of [...paths].sort(compareStrings)) {
    const headEntry = headFiles.get(path) ?? null;
    const indexEntry = indexByPath.get(path) ?? null;
    const workEntry = workingFiles.get(path) ?? null;
    const staged = compareIndexEntries(indexEntry, headEntry) ? null : classifyChange(indexEntry, headEntry);
    const worktree = compareIndexEntries(workEntry, indexEntry) ? null : classifyWorktreeChange(workEntry, indexEntry);
    if (staged || worktree) entries.push({ path, staged, worktree });
  }

  return { branch, headSha, entries };
}

async function stagePaths(storage: GitFileStorage, repo: TestGeneratorRepository, paths: string[]): Promise<RepoStatus> {
  await assertRepositoryExists(storage, repo.id);
  const requestedPaths = normalizeRequestedPaths(paths);
  const status = await getStatus(storage, repo);
  const changedPaths =
    requestedPaths.length === 0 || requestedPaths.includes('.')
      ? status.entries.map((entry) => entry.path)
      : expandRequestedPaths(repo, requestedPaths, true).filter((path) =>
          status.entries.some((entry) => entry.path === path),
        );
  const index = await readIndex(storage, repo.id);
  const indexByPath = new Map(index.map((entry) => [entry.path, entry]));

  for (const path of changedPaths) {
    assertRepositoryPath(path);
    const bytes = readRepoFileBytes(repo, path);
    if (bytes === null) {
      indexByPath.delete(path);
      continue;
    }
    const oid = await writeObject(storage, repo.id, 'blob', bytes);
    indexByPath.set(path, { path, oid, mode: '100644', size: bytes.byteLength });
  }

  await writeIndex(storage, repo.id, [...indexByPath.values()].sort(comparePathEntries));
  return getStatus(storage, repo);
}

async function commit(
  storage: GitFileStorage,
  repo: TestGeneratorRepository,
  options: { message: string; author?: Partial<RepoAuthor> },
): Promise<RepoCommit> {
  await assertRepositoryExists(storage, repo.id);
  const message = validateCommitMessage(options.message);
  const author = validateAuthor(options.author);
  const status = await getStatus(storage, repo);
  if (!status.entries.some((entry) => entry.staged !== null)) {
    throw repoFailure('nothing-to-commit', 'git commit: nothing staged.', true);
  }

  const index = await readIndex(storage, repo.id);
  const treeSha = await writeTreeFromIndex(storage, repo.id, index);
  const parentSha = await getHeadSha(storage, repo.id);
  const commitObject = await writeCommitObject(storage, repo.id, {
    treeSha,
    parentShas: parentSha ? [parentSha] : [],
    message,
    author,
  });
  await readObject(storage, repo.id, commitObject.sha, 'commit');
  const branch = await getCurrentBranchName(storage, repo.id);
  await writeTextFile(storage, repo.id, `refs/heads/${branch}`, `${commitObject.sha}\n`);

  return commitObject;
}

async function getLog(storage: GitFileStorage, repo: TestGeneratorRepository, limit = 20): Promise<RepoCommit[]> {
  await assertRepositoryExists(storage, repo.id);
  const commits: RepoCommit[] = [];
  let sha = await getHeadSha(storage, repo.id);
  while (sha && commits.length < limit) {
    const parsed = await readCommit(storage, repo.id, sha);
    commits.push(parsed);
    sha = parsed.parentShas[0] ?? null;
  }
  return commits;
}

async function listBranches(storage: GitFileStorage, repo: TestGeneratorRepository): Promise<RepoBranch[]> {
  await assertRepositoryExists(storage, repo.id);
  const current = await getCurrentBranchName(storage, repo.id);
  const files = await storage.listFiles(repo.id, 'refs/heads/');
  const branches: RepoBranch[] = [];

  for (const file of files) {
    const name = file.slice('refs/heads/'.length);
    if (!name) continue;
    branches.push({
      name,
      sha: (await readTextFile(storage, repo.id, file))?.trim() || null,
      current: name === current,
    });
  }

  if (!branches.some((branch) => branch.name === current)) {
    branches.push({ name: current, sha: await getHeadSha(storage, repo.id), current: true });
  }

  return branches.sort((left, right) => left.name.localeCompare(right.name));
}

async function createBranch(storage: GitFileStorage, repo: TestGeneratorRepository, name: string): Promise<RepoBranch> {
  await assertRepositoryExists(storage, repo.id);
  const branchName = validateBranchName(name);
  if ((await readTextFile(storage, repo.id, `refs/heads/${branchName}`)) !== null) {
    throw repoFailure('invalid-ref', `git branch: branch '${branchName}' already exists.`, true);
  }
  const sha = await getHeadSha(storage, repo.id);
  if (sha) await readObject(storage, repo.id, sha, 'commit');
  await writeTextFile(storage, repo.id, `refs/heads/${branchName}`, sha ? `${sha}\n` : '');
  return { name: branchName, sha, current: false };
}

async function switchBranch(
  storage: GitFileStorage,
  repo: TestGeneratorRepository,
  name: string,
): Promise<{ repo: TestGeneratorRepository; branch: RepoBranch }> {
  await assertRepositoryExists(storage, repo.id);
  const branchName = validateBranchName(name);
  const branchSha = (await readTextFile(storage, repo.id, `refs/heads/${branchName}`))?.trim() ?? null;
  if (branchSha === null) throw repoFailure('not-found', `git switch: branch '${branchName}' does not exist.`, true);

  const status = await getStatus(storage, repo);
  if (status.entries.length > 0) {
    throw repoFailure('unsafe-worktree', 'git switch: commit local app changes before switching branches.', true);
  }

  const files = branchSha ? await readCommitTreeFiles(storage, repo.id, branchSha) : new Map<string, IndexEntry>();
  await writeIndex(storage, repo.id, [...files.values()].sort(comparePathEntries));
  await writeTextFile(storage, repo.id, 'HEAD', `ref: refs/heads/${branchName}\n`);

  return {
    repo: markRepoReady(await repoFromTrackedFiles(storage, repo, files), branchName),
    branch: { name: branchName, sha: branchSha || null, current: true },
  };
}

async function readTrackedFiles(storage: GitFileStorage, repo: TestGeneratorRepository): Promise<RepoTrackedFile[]> {
  await assertRepositoryExists(storage, repo.id);
  const headSha = await getHeadSha(storage, repo.id);
  if (!headSha) return [];
  const files = await readCommitTreeFiles(storage, repo.id, headSha);
  const tracked: RepoTrackedFile[] = [];

  for (const entry of [...files.values()].sort(comparePathEntries)) {
    const bytes = await readObject(storage, repo.id, entry.oid, 'blob');
    tracked.push({ path: entry.path, content: decodeRepoContent(entry.path, bytes) });
  }

  return tracked;
}

async function getRef(storage: GitFileStorage, repo: TestGeneratorRepository, refPath: string): Promise<string | null> {
  await assertRepositoryExists(storage, repo.id);
  return (await readTextFile(storage, repo.id, validateRefPath(refPath)))?.trim() || null;
}

async function setRef(storage: GitFileStorage, repo: TestGeneratorRepository, refPath: string, sha: string | null): Promise<void> {
  await assertRepositoryExists(storage, repo.id);
  const normalizedRef = validateRefPath(refPath);
  if (sha === null) {
    await storage.deleteFile(repo.id, normalizedRef);
    return;
  }
  const commitSha = validateSha(sha);
  await readObject(storage, repo.id, commitSha, 'commit');
  await writeTextFile(storage, repo.id, normalizedRef, `${commitSha}\n`);
}

async function listRefs(storage: GitFileStorage, repo: TestGeneratorRepository, prefix = 'refs/'): Promise<Record<string, string>> {
  await assertRepositoryExists(storage, repo.id);
  const refs: Record<string, string> = {};
  for (const file of await storage.listFiles(repo.id, validateRefPrefix(prefix))) {
    const value = (await readTextFile(storage, repo.id, file))?.trim();
    if (value) refs[file] = value;
  }
  return refs;
}

async function hasObject(storage: GitFileStorage, repo: TestGeneratorRepository, sha: string): Promise<boolean> {
  await assertRepositoryExists(storage, repo.id);
  const objectSha = validateSha(sha);
  return (await storage.readFile(repo.id, objectShaToObjectPath(objectSha))) !== null;
}

async function listCommitTree(storage: GitFileStorage, repo: TestGeneratorRepository, commitSha: string): Promise<RepoTreeEntry[]> {
  await assertRepositoryExists(storage, repo.id);
  return [...(await readCommitTreeFiles(storage, repo.id, validateSha(commitSha))).values()].sort(comparePathEntries);
}

async function writeTree(storage: GitFileStorage, repo: TestGeneratorRepository, entries: RepoTreeEntry[]): Promise<string> {
  await assertRepositoryExists(storage, repo.id);
  for (const entry of entries) {
    assertRepositoryPath(entry.path);
    validateSha(entry.oid);
    if (entry.mode !== '100644') {
      throw repoFailure('unsupported', `Unsupported tree entry mode ${String(entry.mode)} for ${entry.path}.`, true);
    }
  }
  return writeTreeFromIndex(storage, repo.id, entries);
}

async function isAncestor(storage: GitFileStorage, repo: TestGeneratorRepository, ancestorSha: string, descendantSha: string): Promise<boolean> {
  await assertRepositoryExists(storage, repo.id);
  const ancestor = validateSha(ancestorSha);
  const stack = [validateSha(descendantSha)];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const sha = stack.pop();
    if (!sha || seen.has(sha)) continue;
    if (sha === ancestor) return true;
    seen.add(sha);
    stack.push(...(await readCommit(storage, repo.id, sha)).parentShas);
  }
  return false;
}

async function fastForwardBranch(
  storage: GitFileStorage,
  repo: TestGeneratorRepository,
  branch: string,
  sha: string,
): Promise<{ repo: TestGeneratorRepository; status: RepoStatus }> {
  await assertRepositoryExists(storage, repo.id);
  const branchName = validateBranchName(branch);
  const currentBranch = await getCurrentBranchName(storage, repo.id);
  if (currentBranch !== branchName) {
    throw repoFailure('unsupported', 'Fast-forward pull only supports the current branch.', true);
  }

  const commitSha = validateSha(sha);
  await readObject(storage, repo.id, commitSha, 'commit');
  const files = await readCommitTreeFiles(storage, repo.id, commitSha);
  const nextRepo = markRepoReady(await repoFromTrackedFiles(storage, repo, files), branchName);
  const previousIndex = await readIndex(storage, repo.id);

  await writeIndex(storage, repo.id, [...files.values()].sort(comparePathEntries));
  try {
    await writeTextFile(storage, repo.id, `refs/heads/${branchName}`, `${commitSha}\n`);
  } catch (error) {
    await writeIndex(storage, repo.id, previousIndex);
    throw error;
  }

  return {
    repo: nextRepo,
    status: await getStatus(storage, nextRepo),
  };
}

async function buildWorkingFileMap(storage: GitFileStorage, repo: TestGeneratorRepository): Promise<Map<string, IndexEntry>> {
  const result = new Map<string, IndexEntry>();
  for (const file of listRepoFiles(repo)) {
    assertRepositoryPath(file.path);
    const bytes = typeof file.content === 'string' ? encodeUtf8(file.content) : file.content;
    const oid = await writeObject(storage, repo.id, 'blob', bytes);
    result.set(file.path, { path: file.path, oid, mode: '100644', size: bytes.byteLength });
  }
  return result;
}

async function repoFromTrackedFiles(
  storage: GitFileStorage,
  repo: TestGeneratorRepository,
  files: Map<string, IndexEntry>,
): Promise<TestGeneratorRepository> {
  const now = new Date().toISOString();
  const entries: Record<string, RepoFileEntry> = {};
  for (const entry of files.values()) {
    const bytes = await readObject(storage, repo.id, entry.oid, 'blob');
    entries[entry.path] = {
      path: entry.path,
      kind: 'file',
      content: decodeRepoContent(entry.path, bytes),
    };
  }
  return { ...repo, filesystem: { entries, updatedAt: now }, updatedAt: now };
}

async function writeCommitObject(
  storage: GitFileStorage,
  repoId: string,
  options: { treeSha: string; parentShas: string[]; message: string; author: RepoAuthor },
): Promise<RepoCommit> {
  const now = Math.floor(Date.now() / 1000);
  const timezone = formatTimezoneOffset(new Date());
  const header = [
    `tree ${validateSha(options.treeSha)}`,
    ...options.parentShas.map((parentSha) => `parent ${validateSha(parentSha)}`),
    `author ${options.author.name} <${options.author.email}> ${now} ${timezone}`,
    `committer ${options.author.name} <${options.author.email}> ${now} ${timezone}`,
    '',
  ];
  const sha = await writeObject(storage, repoId, 'commit', encodeUtf8(`${header.join('\n')}\n${options.message}\n`));

  return {
    sha,
    shortSha: sha.slice(0, 7),
    message: options.message,
    authorName: options.author.name,
    authorEmail: options.author.email,
    authoredAt: new Date(now * 1000).toISOString(),
    parentShas: options.parentShas,
  };
}

async function writeTreeFromIndex(storage: GitFileStorage, repoId: string, entries: IndexEntry[]): Promise<string> {
  return writeTreeNode(storage, repoId, buildTreeNode(entries));
}

async function writeTreeNode(storage: GitFileStorage, repoId: string, node: TreeNode): Promise<string> {
  const chunks: Uint8Array[] = [];
  const children = [...node.children.entries()].sort(([left], [right]) => compareStrings(left, right));

  for (const [name, child] of children) {
    if (child.kind === 'file') {
      chunks.push(encodeUtf8(`${child.entry.mode} ${name}\0`), hexToBytes(child.entry.oid));
      continue;
    }
    const treeSha = await writeTreeNode(storage, repoId, child.node);
    chunks.push(encodeUtf8(`40000 ${name}\0`), hexToBytes(treeSha));
  }

  return writeObject(storage, repoId, 'tree', concatBytes(chunks));
}

function buildTreeNode(entries: IndexEntry[]): TreeNode {
  const root: TreeNode = { children: new Map() };
  for (const entry of [...entries].sort(comparePathEntries)) {
    const segments = entry.path.split('/');
    const fileName = segments.pop();
    if (!fileName) continue;
    let node = root;
    for (const segment of segments) {
      const existing = node.children.get(segment);
      if (existing?.kind === 'tree') {
        node = existing.node;
        continue;
      }
      const child: TreeNode = { children: new Map() };
      node.children.set(segment, { kind: 'tree', node: child });
      node = child;
    }
    node.children.set(fileName, { kind: 'file', entry });
  }
  return root;
}

async function readCommitTreeFiles(storage: GitFileStorage, repoId: string, commitSha: string): Promise<Map<string, IndexEntry>> {
  const commitDetails = parseCommitText(decodeUtf8(await readObject(storage, repoId, commitSha, 'commit')), commitSha);
  const result = new Map<string, IndexEntry>();
  await collectTreeFiles(storage, repoId, commitDetails.treeSha, '', result);
  return result;
}

async function collectTreeFiles(
  storage: GitFileStorage,
  repoId: string,
  treeSha: string,
  prefix: string,
  result: Map<string, IndexEntry>,
): Promise<void> {
  const tree = await readObject(storage, repoId, treeSha, 'tree');
  let offset = 0;
  while (offset < tree.length) {
    const modeEnd = indexOfByte(tree, 0x20, offset);
    const nameEnd = indexOfByte(tree, 0x00, modeEnd + 1);
    const mode = decodeUtf8(tree.slice(offset, modeEnd));
    const name = decodeUtf8(tree.slice(modeEnd + 1, nameEnd));
    const oid = bytesToHex(tree.slice(nameEnd + 1, nameEnd + 21));
    const path = prefix ? `${prefix}/${name}` : name;
    offset = nameEnd + 21;

    if (mode === '40000') {
      await collectTreeFiles(storage, repoId, oid, path, result);
      continue;
    }
    if (mode !== '100644') {
      throw repoFailure('unsupported', `Unsupported git tree mode ${mode} at ${path}.`, true);
    }
    assertRepositoryPath(path);
    const bytes = await storage.readFile(repoId, objectShaToObjectPath(oid));
    result.set(path, { path, oid, mode: '100644', size: bytes ? unzlibObjectContentSize(bytes) : 0 });
  }
}

async function readCommit(storage: GitFileStorage, repoId: string, sha: string): Promise<RepoCommitDetails> {
  return parseCommitText(decodeUtf8(await readObject(storage, repoId, sha, 'commit')), sha);
}

function parseCommitText(text: string, sha: string): RepoCommitDetails {
  const [rawHeaders, ...messageParts] = text.split('\n\n');
  const headers = rawHeaders.split('\n');
  const treeSha = headers.find((line) => line.startsWith('tree '))?.slice(5).trim() ?? '';
  const parentShas = headers.filter((line) => line.startsWith('parent ')).map((line) => line.slice(7).trim());
  const authorLine = headers.find((line) => line.startsWith('author ')) ?? '';
  const committerLine = headers.find((line) => line.startsWith('committer ')) ?? '';
  const authorMatch = /^author (.*) <([^>]*)> (\d+) ([+-]\d{4})$/.exec(authorLine);
  const committerMatch = /^committer (.*) <([^>]*)> (\d+) ([+-]\d{4})$/.exec(committerLine);
  const message = messageParts.join('\n\n').trim();
  if (!treeSha) throw repoFailure('corrupt-repository', `Commit ${sha.slice(0, 7)} is missing a tree.`, true);

  return {
    sha,
    shortSha: sha.slice(0, 7),
    treeSha,
    message,
    authorName: authorMatch?.[1] ?? 'Unknown',
    authorEmail: authorMatch?.[2] ?? '',
    authoredAt: authorMatch ? new Date(Number(authorMatch[3]) * 1000).toISOString() : '',
    parentShas,
    committerName: committerMatch?.[1] ?? authorMatch?.[1] ?? 'Unknown',
    committerEmail: committerMatch?.[2] ?? authorMatch?.[2] ?? '',
    committedAt: committerMatch ? new Date(Number(committerMatch[3]) * 1000).toISOString() : '',
    authorTimezone: authorMatch?.[4] ?? '+0000',
    committerTimezone: committerMatch?.[4] ?? authorMatch?.[4] ?? '+0000',
  };
}

async function writeObject(storage: GitFileStorage, repoId: string, type: RepoObject['type'], content: Uint8Array): Promise<string> {
  const payload = concatBytes([encodeUtf8(`${type} ${content.byteLength}\0`), content]);
  const sha = await sha1Hex(payload);
  const path = objectShaToObjectPath(sha);
  if ((await storage.readFile(repoId, path)) === null) {
    await storage.writeFile(repoId, path, await zlibAsync(payload));
  }
  return sha;
}

async function readObject(storage: GitFileStorage, repoId: string, sha: string, expectedType: RepoObject['type']): Promise<Uint8Array> {
  const compressed = await storage.readFile(repoId, objectShaToObjectPath(sha));
  if (!compressed) throw repoFailure('corrupt-repository', `Missing git object ${sha}.`, true);
  const payload = await unzlibAsync(compressed);
  const headerEnd = indexOfByte(payload, 0x00, 0);
  const [type, sizeText] = decodeUtf8(payload.slice(0, headerEnd)).split(' ');
  if (type !== expectedType) {
    throw repoFailure('corrupt-repository', `Expected ${expectedType} object ${sha}, found ${type}.`, true);
  }
  const content = payload.slice(headerEnd + 1);
  if (content.byteLength !== Number(sizeText)) {
    throw repoFailure('corrupt-repository', `Git object ${sha} has an invalid size.`, true);
  }
  return content;
}

async function readAnyObject(storage: GitFileStorage, repoId: string, sha: string): Promise<RepoObject> {
  const compressed = await storage.readFile(repoId, objectShaToObjectPath(sha));
  if (!compressed) throw repoFailure('corrupt-repository', `Missing git object ${sha}.`, true);
  const payload = await unzlibAsync(compressed);
  const headerEnd = indexOfByte(payload, 0x00, 0);
  const [type, sizeText] = decodeUtf8(payload.slice(0, headerEnd)).split(' ');
  if (type !== 'blob' && type !== 'tree' && type !== 'commit') {
    throw repoFailure('unsupported', `Git object ${sha} has unsupported type ${type}.`, true);
  }
  const content = payload.slice(headerEnd + 1);
  if (content.byteLength !== Number(sizeText)) {
    throw repoFailure('corrupt-repository', `Git object ${sha} has an invalid size.`, true);
  }
  return { type, content };
}

function unzlibObjectContentSize(bytes: Uint8Array): number {
  try {
    const payload = unzlibSync(bytes);
    const headerEnd = indexOfByte(payload, 0x00, 0);
    return payload.byteLength - headerEnd - 1;
  } catch {
    return 0;
  }
}

async function readIndex(storage: GitFileStorage, repoId: string): Promise<IndexEntry[]> {
  const bytes = await storage.readFile(repoId, 'index');
  return bytes ? parseIndex(bytes) : [];
}

async function writeIndex(storage: GitFileStorage, repoId: string, entries: IndexEntry[]): Promise<void> {
  const bodyChunks: Uint8Array[] = [encodeUtf8('DIRC'), uint32be(2), uint32be(entries.length)];
  for (const entry of entries.sort(comparePathEntries)) {
    const pathBytes = encodeUtf8(entry.path);
    const fixed = new Uint8Array(62);
    const view = new DataView(fixed.buffer);
    view.setUint32(24, parseInt(entry.mode, 8));
    view.setUint32(36, entry.size);
    fixed.set(hexToBytes(entry.oid), 40);
    view.setUint16(60, Math.min(pathBytes.byteLength, 0xfff));
    const withoutPadding = concatBytes([fixed, pathBytes, new Uint8Array([0])]);
    bodyChunks.push(withoutPadding, new Uint8Array((8 - (withoutPadding.byteLength % 8)) % 8));
  }
  const body = concatBytes(bodyChunks);
  await storage.writeFile(repoId, 'index', concatBytes([body, hexToBytes(await sha1Hex(body))]));
}

function parseIndex(bytes: Uint8Array): IndexEntry[] {
  if (decodeUtf8(bytes.slice(0, 4)) !== 'DIRC') {
    throw repoFailure('corrupt-repository', 'The git index is not a DIRC index.', true);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4);
  if (version !== 2) throw repoFailure('unsupported', `Git index version ${version} is not supported.`, true);
  const count = view.getUint32(8);
  const entries: IndexEntry[] = [];
  let offset = 12;
  for (let index = 0; index < count; index += 1) {
    const mode = view.getUint32(offset + 24).toString(8);
    const size = view.getUint32(offset + 36);
    const oid = bytesToHex(bytes.slice(offset + 40, offset + 60));
    const flags = view.getUint16(offset + 60);
    const pathLength = flags & 0xfff;
    const pathStart = offset + 62;
    const path = decodeUtf8(bytes.slice(pathStart, pathStart + pathLength));
    const entryLength = 62 + pathLength + 1;
    offset += entryLength + ((8 - (entryLength % 8)) % 8);
    if (mode !== '100644') {
      throw repoFailure('unsupported', `Git index mode ${mode} is not supported for ${path}.`, true);
    }
    entries.push({ path: assertRepositoryPath(path), oid, mode: '100644', size });
  }
  return entries.sort(comparePathEntries);
}

async function getHeadSha(storage: GitFileStorage, repoId: string): Promise<string | null> {
  const branch = await getCurrentBranchName(storage, repoId);
  return (await readTextFile(storage, repoId, `refs/heads/${branch}`))?.trim() || null;
}

async function getCurrentBranchName(storage: GitFileStorage, repoId: string): Promise<string> {
  const head = await readTextFile(storage, repoId, 'HEAD');
  if (!head) {
    throw repoFailure('not-initialized', 'This installation does not have an initialized local git repository.', true);
  }
  const match = /^ref: refs\/heads\/(.+)\s*$/.exec(head);
  if (!match) throw repoFailure('unsupported', 'Detached HEAD is not supported by the browser git backend.', true);
  return match[1];
}

async function assertRepositoryExists(storage: GitFileStorage, repoId: string): Promise<void> {
  if ((await readTextFile(storage, repoId, 'HEAD')) === null) {
    throw repoFailure('not-initialized', 'This installation does not have an initialized local git repository.', true);
  }
}

function markRepoReady(repo: TestGeneratorRepository, branch: string): TestGeneratorRepository {
  const now = new Date().toISOString();
  return {
    ...repo,
    git: {
      ...repo.git,
      backend: 'browser-git',
      status: 'ready',
      headRef: `refs/heads/${branch}`,
      defaultBranch: repo.git.defaultBranch ?? DEFAULT_BRANCH,
      initializedAt: repo.git.initializedAt ?? now,
      recoveryMessage: null,
      remotes: repo.git.remotes ?? [],
    },
    updatedAt: now,
  };
}

function normalizeRequestedPaths(paths: string[]): string[] {
  return paths.map((path) => path.trim()).filter(Boolean).map((path) => (path === '.' ? '.' : assertRepositoryPath(path)));
}

function expandRequestedPaths(repo: TestGeneratorRepository, paths: string[], includeMissing = false): string[] {
  const files = listRepoFiles(repo).map((file) => file.path);
  const expanded = new Set<string>();
  for (const requested of paths) {
    if (requested === '.') {
      files.forEach((path) => expanded.add(path));
      continue;
    }
    const matchingFiles = files.filter((path) => path === requested || path.startsWith(`${requested}/`));
    matchingFiles.forEach((path) => expanded.add(path));
    if (includeMissing && matchingFiles.length === 0) expanded.add(requested);
  }
  return [...expanded].sort(compareStrings);
}

function assertRepositoryPath(path: string): string {
  let normalizedPath = '';
  try {
    normalizedPath = normalizeRepoPath(path);
  } catch (error) {
    throw repoFailure('invalid-path', error instanceof Error ? error.message : 'Invalid repository path.', true);
  }
  if (!normalizedPath || isReservedGitPath(normalizedPath)) {
    throw repoFailure('invalid-path', 'Direct access to .git internals is reserved for git storage.', true);
  }
  return normalizedPath;
}

function classifyChange(nextEntry: IndexEntry | null, previousEntry: IndexEntry | null): 'added' | 'modified' | 'deleted' {
  if (nextEntry && !previousEntry) return 'added';
  if (!nextEntry && previousEntry) return 'deleted';
  return 'modified';
}

function classifyWorktreeChange(nextEntry: IndexEntry | null, previousEntry: IndexEntry | null): 'modified' | 'deleted' | 'untracked' {
  if (nextEntry && !previousEntry) return 'untracked';
  if (!nextEntry && previousEntry) return 'deleted';
  return 'modified';
}

function compareIndexEntries(left: IndexEntry | null, right: IndexEntry | null): boolean {
  return !left && !right ? true : Boolean(left && right && left.oid === right.oid && left.mode === right.mode);
}

function comparePathEntries(left: { path: string }, right: { path: string }): number {
  return compareStrings(left.path, right.path);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateCommitMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) throw repoFailure('invalid-message', 'git commit: use a non-empty commit message.', true);
  return trimmed;
}

function validateAuthor(author: Partial<RepoAuthor> | undefined): RepoAuthor {
  const nextAuthor = {
    name: author?.name?.trim() || DEFAULT_AUTHOR.name,
    email: author?.email?.trim() || DEFAULT_AUTHOR.email,
  };
  if (!nextAuthor.name || /[<>\n]/.test(nextAuthor.name) || !/^[^@\s<>]+@[^@\s<>]+$/.test(nextAuthor.email)) {
    throw repoFailure('invalid-author', 'Local commits need a valid author name and email.', true);
  }
  return nextAuthor;
}

function validateBranchName(name: string): string {
  const branchName = name.trim();
  if (
    !branchName ||
    branchName.startsWith('/') ||
    branchName.endsWith('/') ||
    branchName.includes('..') ||
    branchName.includes('//') ||
    branchName.endsWith('.lock') ||
    /[\s~^:?*[\\\]\0]/.test(branchName) ||
    branchName.split('/').some((segment) => segment.startsWith('.') || segment.endsWith('.'))
  ) {
    throw repoFailure('invalid-ref', `Unsafe branch name '${name}'.`, true);
  }
  return branchName;
}

function validateSha(sha: string): string {
  const value = sha.trim();
  if (!/^[a-f0-9]{40}$/i.test(value)) throw repoFailure('invalid-ref', `Invalid git object id '${sha}'.`, true);
  return value.toLowerCase();
}

function validateRefPath(refPath: string): string {
  const value = normalizeGitStoragePath(refPath);
  if (!value.startsWith('refs/') || value.includes('..') || value.endsWith('.lock')) {
    throw repoFailure('invalid-ref', `Unsafe ref '${refPath}'.`, true);
  }
  return value;
}

function validateRefPrefix(prefix: string): string {
  const value = normalizeGitStoragePath(prefix || 'refs/');
  if (!value.startsWith('refs')) throw repoFailure('invalid-ref', `Unsafe ref prefix '${prefix}'.`, true);
  return value.endsWith('/') ? value : `${value}/`;
}

function normalizeGitStoragePath(path: string): string {
  return path.replace(/\\/g, '/').split('/').map((segment) => segment.trim()).filter(Boolean).join('/');
}

function decodeRepoContent(path: string, bytes: Uint8Array): RepoFileContent {
  const extension = path.includes('.') ? path.split('.').at(-1)?.toLowerCase() : null;
  return extension && TEXT_EXTENSIONS.has(extension) ? decodeUtf8(bytes) : bytes;
}

function listRepoFiles(repo: TestGeneratorRepository): RepoFileEntry[] {
  return Object.values(repo.filesystem.entries)
    .filter((entry): entry is RepoFileEntry => entry.kind === 'file')
    .sort(comparePathEntries);
}

function readRepoFileBytes(repo: TestGeneratorRepository, path: string): Uint8Array | null {
  const entry = repo.filesystem.entries[assertRepositoryPath(path)];
  if (!entry) return null;
  return typeof entry.content === 'string' ? encodeUtf8(entry.content) : entry.content;
}

function repoFailure(code: RepoError['code'], message: string, recoverable: boolean): RepoError {
  return { code, message, recoverable };
}

async function asResult<T>(operation: () => Promise<T>): Promise<RepoResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    if (isRepoError(error)) return { ok: false, error };
    return {
      ok: false,
      error: {
        code: 'storage-error',
        message: error instanceof Error ? error.message : 'Git storage operation failed.',
        recoverable: true,
      },
    };
  }
}

function isRepoError(error: unknown): error is RepoError {
  return Boolean(error && typeof error === 'object' && 'code' in error && 'message' in error && 'recoverable' in error);
}

async function readTextFile(storage: GitFileStorage, repoId: string, path: string): Promise<string | null> {
  const bytes = await storage.readFile(repoId, path);
  return bytes ? decodeUtf8(bytes) : null;
}

function writeTextFile(storage: GitFileStorage, repoId: string, path: string, text: string): Promise<void> {
  return storage.writeFile(repoId, path, encodeUtf8(text));
}

function zlibAsync(content: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zlib(content, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function unzlibAsync(content: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    unzlib(content, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-1', buffer);
  return bytesToHex(new Uint8Array(digest));
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function uint32be(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function indexOfByte(bytes: Uint8Array, byte: number, from: number): number {
  const index = bytes.indexOf(byte, from);
  if (index < 0) throw repoFailure('corrupt-repository', 'Git object data is truncated.', true);
  return index;
}

function objectShaToObjectPath(sha: string): string {
  return `objects/${sha.slice(0, 2)}/${sha.slice(2)}`;
}

function formatTimezoneOffset(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `${sign}${Math.floor(absolute / 60).toString().padStart(2, '0')}${(absolute % 60).toString().padStart(2, '0')}`;
}

interface IndexEntry {
  path: string;
  oid: string;
  mode: '100644';
  size: number;
}

interface TreeNode {
  children: Map<string, { kind: 'file'; entry: IndexEntry } | { kind: 'tree'; node: TreeNode }>;
}
