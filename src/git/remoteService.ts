import {
  formatRepoError,
  type RepoBackend,
  type RepoCommitDetails,
  type RepoResult,
  type RepoStatus,
  type RepoTreeEntry,
  type TestGeneratorRepository,
} from './repoBackend.ts';
import { trackedFilesToRepoEntries, prepareRepoEntriesForAppRestore } from './repoDataBridge.ts';
import {
  REPO_DATA_LIMITS,
  REPO_MANIFEST_PATH,
  normalizeRepoPath,
  type RepoDataEntry,
} from './repoDataModel.ts';
import { redactGitSecrets } from './credentials.ts';
import {
  normalizeRemoteConfig,
  remoteTrackingRef,
  validateBranchName,
  validateGitHubOwner,
  validateGitHubRepo,
  validateRemoteName,
  type GitRemoteConfig,
} from './remoteConfig.ts';

export interface RemoteGitProgress {
  phase: 'connect' | 'inspect' | 'fetch' | 'pull' | 'push' | 'clone' | 'checkout' | 'import';
  message: string;
  current?: number;
  total?: number;
}

export interface RemoteGitOptions {
  signal?: AbortSignal;
  onProgress?: (progress: RemoteGitProgress) => void;
}

export interface RemoteGitResult {
  ok: boolean;
  message: string;
  repo?: TestGeneratorRepository;
  status?: RepoStatus;
}

export interface UpstreamTracking {
  branch: string;
  remoteName: string;
  remoteRef: string;
  localSha: string | null;
  remoteSha: string | null;
  ahead: number;
  behind: number;
}

export interface RemoteGitAccount {
  login: string;
  type: 'user' | 'org';
}

export interface RemoteGitRepositorySummary {
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
}

export interface RemoteGitBranchSummary {
  name: string;
  sha: string;
}

export type RemoteGitDiscoveryResult<T> =
  | { ok: true; value: T; message: string }
  | { ok: false; message: string };

export interface RemoteGitConnectionInfo {
  user: RemoteGitAccount;
  owners: RemoteGitAccount[];
}

export interface RemoteGitVerboseSummary {
  name: string;
  fetch: string;
  push: string;
}

interface GitHubCommitResponse {
  sha: string;
  message: string;
  tree: { sha: string };
  parents: Array<{ sha: string }>;
  author: GitHubSignature | null;
  committer: GitHubSignature | null;
  verification?: {
    signature?: string | null;
    payload?: string | null;
  } | null;
}

interface GitHubSignature {
  name?: string;
  email?: string;
  date?: string;
}

interface GitHubTreeResponse {
  sha: string;
  truncated?: boolean;
  tree: Array<{
    path?: string;
    mode?: string;
    type?: 'blob' | 'tree' | 'commit';
    sha?: string;
    size?: number;
  }>;
}

interface GitHubBlobResponse {
  sha: string;
  content: string;
  encoding: string;
}

interface GitHubUserResponse {
  login?: string;
}

interface GitHubOrgResponse {
  login?: string;
}

interface GitHubRepoResponse {
  name?: string;
  full_name?: string;
  private?: boolean;
  default_branch?: string;
  owner?: { login?: string };
}

interface GitHubBranchResponse {
  name?: string;
  commit?: { sha?: string };
}

type GitHubRemoteConfig = GitRemoteConfig & {
  kind: 'github';
  github: { owner: string; repo: string };
};

const GITHUB_API_ORIGIN = 'https://api.github.com';
const TEXT_EXTENSIONS = new Set(['json', 'md', 'txt', 'csv', 'yaml', 'yml']);

export const REMOTE_TRANSPORT_STRATEGY = [
  'Test Generator browser GitHub remotes use the GitHub Git Database REST API.',
  'The adapter talks only to https://api.github.com with bearer tokens.',
  'It reads and writes Git blobs, trees, commits, and refs; GitHub Contents API sync is not used.',
  'Tokens are never embedded in remote URLs or repo config.',
  'Empty GitHub repositories are rejected; initialize the repo on GitHub with a README/default branch before connecting.',
].join('\n');

export function createRemoteGitService(options: {
  repoBackend: RepoBackend;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function fetchRemote(
    repo: TestGeneratorRepository,
    config: GitRemoteConfig,
    getToken: () => string | Promise<string>,
    remoteOptions: RemoteGitOptions = {},
  ): Promise<RemoteGitResult> {
    const token = (await getToken()).trim();
    const validation = validateGitHubRemoteConfig(config, token);
    if (!validation.ok) return validation.result;
    const remoteConfig = validation.config;

    try {
      await ensureRemoteRepository(fetchImpl, remoteConfig, token, remoteOptions.signal);
      emit(remoteOptions, 'fetch', 'Reading remote branch.');
      const remoteSha = await getRemoteBranchSha(fetchImpl, remoteConfig, token, remoteOptions.signal);
      if (!remoteSha) {
        return {
          ok: false,
          message: `Remote branch ${remoteConfig.branch} was not found. Initialize or select an existing branch before connecting.`,
        };
      }

      await importCommitGraph(fetchImpl, options.repoBackend, repo, remoteConfig, token, remoteSha, {
        ...remoteOptions,
        includeBlobs: true,
      });
      emit(remoteOptions, 'fetch', 'Validating remote snapshot.');
      await validateCommitSnapshot(options.repoBackend, repo, remoteSha);
      const refResult = await options.repoBackend.setRef(repo, remoteTrackingRef(remoteConfig), remoteSha);
      if (!refResult.ok) return repoErrorResult(refResult);

      return {
        ok: true,
        message: `Fetched ${remoteConfig.name}/${remoteConfig.branch} at ${remoteSha.slice(0, 7)}.`,
      };
    } catch (error) {
      return { ok: false, message: redactGitSecrets(formatUnknownError(error), [token]) };
    }
  }

  async function pullRemote(
    repo: TestGeneratorRepository,
    config: GitRemoteConfig,
    getToken: () => string | Promise<string>,
    remoteOptions: RemoteGitOptions = {},
  ): Promise<RemoteGitResult> {
    const statusResult = await options.repoBackend.status(repo);
    if (!statusResult.ok) return repoErrorResult(statusResult);
    if (statusResult.value.entries.length > 0) {
      return { ok: false, message: 'git pull: commit local app changes before pulling.' };
    }
    if (statusResult.value.branch !== config.branch.trim()) {
      return { ok: false, message: 'git pull: the configured branch must match the current local branch.' };
    }

    const fetchResult = await fetchRemote(repo, config, getToken, {
      ...remoteOptions,
      onProgress: (progress) => remoteOptions.onProgress?.({ ...progress, phase: 'pull' }),
    });
    if (!fetchResult.ok) return fetchResult;

    const remoteConfig = normalizeRemoteConfig(config);
    const remoteRefResult = await options.repoBackend.getRef(repo, remoteTrackingRef(remoteConfig));
    if (!remoteRefResult.ok) return repoErrorResult(remoteRefResult);
    const remoteSha = remoteRefResult.value;
    if (!remoteSha) return { ok: false, message: `No fetched ref exists for ${remoteConfig.name}/${remoteConfig.branch}.` };

    const localRef = `refs/heads/${remoteConfig.branch}`;
    const localShaResult = await options.repoBackend.getRef(repo, localRef);
    if (!localShaResult.ok) return repoErrorResult(localShaResult);
    const localSha = localShaResult.value;
    if (localSha === remoteSha) return { ok: true, message: 'Already up to date.', status: statusResult.value };

    if (localSha) {
      const fastForward = await options.repoBackend.isAncestor(repo, localSha, remoteSha);
      if (!fastForward.ok) return repoErrorResult(fastForward);
      if (!fastForward.value) {
        const localAhead = await options.repoBackend.isAncestor(repo, remoteSha, localSha);
        if (!localAhead.ok) return repoErrorResult(localAhead);
        if (localAhead.value) return { ok: true, message: 'Already up to date.', status: statusResult.value };
        return {
          ok: false,
          message:
            `git pull: stopped because local ${localSha.slice(0, 7)} and ${remoteConfig.name}/${remoteConfig.branch} ${remoteSha.slice(0, 7)} diverged. ` +
            'Fast-forward-only pull left local refs and app data unchanged.',
        };
      }
    }

    emit(remoteOptions, 'pull', 'Fast-forwarding local branch.');
    const checkout = await options.repoBackend.fastForwardBranch(repo, remoteConfig.branch, remoteSha);
    if (!checkout.ok) return repoErrorResult(checkout);
    await validateCommitSnapshot(options.repoBackend, checkout.value.repo, remoteSha);
    return {
      ok: true,
      message: `Fast-forwarded ${remoteConfig.branch} to ${remoteSha.slice(0, 7)}.`,
      repo: checkout.value.repo,
      status: checkout.value.status,
    };
  }

  async function pushRemote(
    repo: TestGeneratorRepository,
    config: GitRemoteConfig,
    getToken: () => string | Promise<string>,
    remoteOptions: RemoteGitOptions = {},
  ): Promise<RemoteGitResult> {
    const token = (await getToken()).trim();
    const validation = validateGitHubRemoteConfig(config, token);
    if (!validation.ok) return validation.result;
    const remoteConfig = validation.config;

    try {
      await ensureRemoteRepository(fetchImpl, remoteConfig, token, remoteOptions.signal);
      const localShaResult = await getPushSourceSha(options.repoBackend, repo, remoteConfig.branch);
      if (!localShaResult.ok) return repoErrorResult(localShaResult);
      const localSha = localShaResult.value.sha;
      if (!localSha) return { ok: false, message: 'git push: current branch has no commits.' };
      await validateCommitSnapshot(options.repoBackend, repo, localSha);

      emit(remoteOptions, 'push', 'Reading remote branch.');
      const remoteSha = await getRemoteBranchSha(fetchImpl, remoteConfig, token, remoteOptions.signal);
      if (remoteSha) {
        await importCommitGraph(fetchImpl, options.repoBackend, repo, remoteConfig, token, remoteSha, {
          ...remoteOptions,
          includeBlobs: false,
        });
        const fastForward = await options.repoBackend.isAncestor(repo, remoteSha, localSha);
        if (!fastForward.ok) return repoErrorResult(fastForward);
        if (!fastForward.value && remoteSha !== localSha) {
          return {
            ok: false,
            message:
              `git push: stopped because local ${localSha.slice(0, 7)} does not contain ${remoteConfig.name}/${remoteConfig.branch} ${remoteSha.slice(0, 7)}. ` +
              'Pull fast-forward-only first. Local refs and app data were left unchanged.',
          };
        }
      }

      if (remoteSha === localSha) {
        const refResult = await options.repoBackend.setRef(repo, remoteTrackingRef(remoteConfig), localSha);
        if (!refResult.ok) return repoErrorResult(refResult);
        return { ok: true, message: 'Everything up to date.' };
      }

      emit(remoteOptions, 'push', 'Preparing local commits.');
      const commits = await collectCommitsToPush(options.repoBackend, repo, localSha, remoteSha);
      const pushPlans = await preparePushCommitPlans(options.repoBackend, repo, commits);
      const totalUploadSteps = pushPlans.reduce((total, plan) => total + plan.treeEntries.length + 2, 0);
      let completedUploadSteps = 0;
      const remoteCommitShas = new Map<string, string>();
      if (remoteSha) remoteCommitShas.set(remoteSha, remoteSha);
      let remoteHeadSha = remoteSha;

      for (const [index, plan] of pushPlans.entries()) {
        emit(
          remoteOptions,
          'push',
          `Uploading commit ${index + 1} of ${pushPlans.length} (${plan.commit.sha.slice(0, 7)}).`,
          completedUploadSteps,
          totalUploadSteps,
        );
        remoteHeadSha = await pushCommit(
          fetchImpl,
          options.repoBackend,
          repo,
          remoteConfig,
          token,
          plan.commit,
          plan.treeEntries,
          remoteCommitShas,
          remoteOptions.signal,
          () => {
            completedUploadSteps += 1;
            emit(remoteOptions, 'push', `Uploaded ${completedUploadSteps} of ${totalUploadSteps} Git objects.`, completedUploadSteps, totalUploadSteps);
          },
        );
        remoteCommitShas.set(plan.commit.sha, remoteHeadSha);
      }

      if (!remoteHeadSha) return { ok: false, message: 'git push: no local commits were selected for upload.' };

      emit(remoteOptions, 'push', 'Updating remote branch.', totalUploadSteps, totalUploadSteps);
      await updateRemoteBranch(fetchImpl, remoteConfig, token, remoteHeadSha, Boolean(remoteSha), remoteOptions.signal);
      if (remoteHeadSha !== localSha) {
        await importCommitGraph(fetchImpl, options.repoBackend, repo, remoteConfig, token, remoteHeadSha, {
          ...remoteOptions,
          includeBlobs: true,
        });
        const localRefResult = await options.repoBackend.setRef(repo, `refs/heads/${remoteConfig.branch}`, remoteHeadSha);
        if (!localRefResult.ok) return repoErrorResult(localRefResult);
      }
      const refResult = await options.repoBackend.setRef(repo, remoteTrackingRef(remoteConfig), remoteHeadSha);
      if (!refResult.ok) return repoErrorResult(refResult);
      const statusResult = await options.repoBackend.status(repo);
      return {
        ok: true,
        message: `Pushed ${commits.length} commit${commits.length === 1 ? '' : 's'} to ${remoteConfig.name}/${remoteConfig.branch}.`,
        status: statusResult.ok ? statusResult.value : undefined,
      };
    } catch (error) {
      return { ok: false, message: redactGitSecrets(formatUnknownError(error), [token]) };
    }
  }

  async function inspectUpstream(repo: TestGeneratorRepository, config: GitRemoteConfig): Promise<RepoResult<UpstreamTracking>> {
    const remoteConfig = normalizeRemoteConfig(config);
    const localRef = await options.repoBackend.getRef(repo, `refs/heads/${remoteConfig.branch}`);
    if (!localRef.ok) return localRef;
    const remoteRef = await options.repoBackend.getRef(repo, remoteTrackingRef(remoteConfig));
    if (!remoteRef.ok) return remoteRef;
    const ahead = await countReachableExcluding(options.repoBackend, repo, localRef.value, remoteRef.value);
    if (!ahead.ok) return ahead;
    const behind = await countReachableExcluding(options.repoBackend, repo, remoteRef.value, localRef.value);
    if (!behind.ok) return behind;
    return {
      ok: true,
      value: {
        branch: remoteConfig.branch,
        remoteName: remoteConfig.name,
        remoteRef: remoteTrackingRef(remoteConfig),
        localSha: localRef.value,
        remoteSha: remoteRef.value,
        ahead: ahead.value,
        behind: behind.value,
      },
    };
  }

  async function inspectToken(
    getToken: () => string | Promise<string>,
    remoteOptions: RemoteGitOptions = {},
  ): Promise<RemoteGitDiscoveryResult<RemoteGitConnectionInfo>> {
    const token = (await getToken()).trim();
    if (!token) return { ok: false, message: 'Add a GitHub token before connecting.' };

    try {
      const user = await githubApiJson<GitHubUserResponse>(fetchImpl, token, '/user', remoteOptions.signal);
      if (!user.login) return { ok: false, message: 'GitHub token is valid, but the account login was unavailable.' };
      const orgs = await githubApiJson<GitHubOrgResponse[]>(fetchImpl, token, '/user/orgs?per_page=100', remoteOptions.signal);
      const owners = [
        { login: user.login, type: 'user' as const },
        ...orgs
          .map((org) => org.login?.trim())
          .filter((login): login is string => Boolean(login))
          .map((login) => ({ login, type: 'org' as const })),
      ];
      return { ok: true, value: { user: { login: user.login, type: 'user' }, owners }, message: `Connected as ${user.login}.` };
    } catch (error) {
      return { ok: false, message: redactGitSecrets(formatUnknownError(error), [token]) };
    }
  }

  async function listRepositories(
    owner: string,
    getToken: () => string | Promise<string>,
    remoteOptions: RemoteGitOptions = {},
  ): Promise<RemoteGitDiscoveryResult<RemoteGitRepositorySummary[]>> {
    const token = (await getToken()).trim();
    if (!token) return { ok: false, message: 'Add a GitHub token before loading repositories.' };
    let normalizedOwner: string;
    try {
      normalizedOwner = validateGitHubOwner(owner);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Invalid GitHub owner.' };
    }

    try {
      const repos = await githubApiJson<GitHubRepoResponse[]>(
        fetchImpl,
        token,
        '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
        remoteOptions.signal,
      );
      const filteredRepos = repos
        .filter((repo) => repo.owner?.login?.toLowerCase() === normalizedOwner.toLowerCase())
        .map((repo) => ({
          name: repo.name ?? '',
          fullName: repo.full_name ?? `${repo.owner?.login ?? normalizedOwner}/${repo.name ?? ''}`,
          owner: repo.owner?.login ?? normalizedOwner,
          private: Boolean(repo.private),
          defaultBranch: repo.default_branch ?? 'main',
        }))
        .filter((repo) => repo.name)
        .sort((left, right) => left.name.localeCompare(right.name));
      return { ok: true, value: filteredRepos, message: `Loaded ${filteredRepos.length} repositories for ${normalizedOwner}.` };
    } catch (error) {
      return { ok: false, message: redactGitSecrets(formatUnknownError(error), [token]) };
    }
  }

  async function listBranches(
    config: { owner: string; repo: string },
    getToken: () => string | Promise<string>,
    remoteOptions: RemoteGitOptions = {},
  ): Promise<RemoteGitDiscoveryResult<RemoteGitBranchSummary[]>> {
    const token = (await getToken()).trim();
    if (!token) return { ok: false, message: 'Add a GitHub token before loading branches.' };
    let owner: string;
    let repoName: string;
    try {
      owner = validateGitHubOwner(config.owner);
      repoName = validateGitHubRepo(config.repo);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Invalid GitHub repository.' };
    }

    try {
      const branches = await githubApiJson<GitHubBranchResponse[]>(
        fetchImpl,
        token,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/branches?per_page=100`,
        remoteOptions.signal,
      );
      const summaries = branches
        .map((branch) => ({ name: branch.name ?? '', sha: branch.commit?.sha ?? '' }))
        .filter((branch) => branch.name)
        .sort((left, right) => left.name.localeCompare(right.name));
      return { ok: true, value: summaries, message: `Loaded ${summaries.length} branches for ${owner}/${repoName}.` };
    } catch (error) {
      return { ok: false, message: redactGitSecrets(formatUnknownError(error), [token]) };
    }
  }

  return {
    fetch: fetchRemote,
    pull: pullRemote,
    push: pushRemote,
    inspectToken,
    listRepositories,
    listBranches,
    inspectUpstream,
    getRemoteUrl,
    getVerboseSummaries: (configs: GitRemoteConfig[]): RemoteGitVerboseSummary[] =>
      configs.map((config) => {
        const remoteConfig = normalizeRemoteConfig(config);
        const url = getRemoteUrl(remoteConfig);
        return { name: remoteConfig.name, fetch: url, push: url };
      }),
  };
}

async function getPushSourceSha(
  repoBackend: RepoBackend,
  repo: TestGeneratorRepository,
  configuredBranch: string,
): Promise<RepoResult<{ branch: string; sha: string | null }>> {
  const configuredRef = await repoBackend.getRef(repo, `refs/heads/${configuredBranch}`);
  if (!configuredRef.ok) return configuredRef;
  if (configuredRef.value) return { ok: true, value: { branch: configuredBranch, sha: configuredRef.value } };

  const currentBranch = await repoBackend.getCurrentBranch(repo);
  if (!currentBranch.ok) return currentBranch;
  const currentRef = await repoBackend.getRef(repo, `refs/heads/${currentBranch.value}`);
  if (!currentRef.ok) return currentRef;
  return { ok: true, value: { branch: currentBranch.value, sha: currentRef.value } };
}

async function importCommitGraph(
  fetchImpl: typeof fetch,
  repoBackend: RepoBackend,
  repo: TestGeneratorRepository,
  config: GitHubRemoteConfig,
  token: string,
  sha: string,
  options: RemoteGitOptions & { includeBlobs: boolean },
): Promise<void> {
  const commitSha = validateSha(sha);
  const existing = await repoBackend.hasObject(repo, commitSha);
  if (existing.ok && existing.value) {
    if (options.includeBlobs) await importCommitBlobs(fetchImpl, repoBackend, repo, config, token, commitSha, options.signal);
    return;
  }

  const commit = await githubJson<GitHubCommitResponse>(fetchImpl, config, token, `/git/commits/${commitSha}`, options.signal);
  if (validateSha(commit.sha) !== commitSha) throw new Error('GitHub returned a commit with an unexpected object id.');
  for (const parent of commit.parents) {
    await importCommitGraph(fetchImpl, repoBackend, repo, config, token, validateSha(parent.sha), {
      ...options,
      includeBlobs: false,
    });
  }
  await importTree(fetchImpl, repoBackend, repo, config, token, validateSha(commit.tree.sha), {
    includeBlobs: options.includeBlobs,
    signal: options.signal,
    onProgress: options.onProgress,
  });
  const commitObject = await buildMatchingCommitObject(commit);
  const written = await repoBackend.writeObject(repo, 'commit', encodeUtf8(commitObject));
  if (!written.ok) throw new Error(formatRepoError(written.error));
  if (written.value !== commitSha) {
    throw new Error(
      `Remote commit ${commitSha.slice(0, 7)} cannot be reconstructed from GitHub commit metadata in browser mode.`,
    );
  }
}

async function importTree(
  fetchImpl: typeof fetch,
  repoBackend: RepoBackend,
  repo: TestGeneratorRepository,
  config: GitHubRemoteConfig,
  token: string,
  treeSha: string,
  options: { includeBlobs: boolean; signal?: AbortSignal; onProgress?: (progress: RemoteGitProgress) => void },
): Promise<void> {
  const tree = await githubJson<GitHubTreeResponse>(fetchImpl, config, token, `/git/trees/${treeSha}?recursive=1`, options.signal);
  if (validateSha(tree.sha) !== treeSha) throw new Error('GitHub returned a tree with an unexpected object id.');
  if (tree.truncated) throw new Error('Remote tree is too large for the browser GitHub adapter response.');

  if (options.includeBlobs && !tree.tree.some((entry) => entry.type === 'blob' && entry.path === REPO_MANIFEST_PATH)) {
    const jsonExport = tree.tree.find((entry) => entry.type === 'blob' && entry.path?.endsWith('.json') && !entry.path.includes('/'));
    throw new Error(
      `Remote branch ${config.branch} is missing ${REPO_MANIFEST_PATH}, so it does not look like a repo-backed Test Generator bank. ` +
      (jsonExport?.path
        ? `It appears to contain an older JSON export (${jsonExport.path}). Import that JSON into Test Generator first, then commit and push from the Git panel to create the repo layout.`
        : 'Open a bank in Test Generator, commit it from the Git panel, and push that repo layout before using clone/import.'),
    );
  }

  const entries: RepoTreeEntry[] = [];
  const normalizedPaths = new Map<string, string>();
  let totalBytes = 0;
  const totalBlobs = tree.tree.filter((entry) => entry.type === 'blob').length;
  let importedBlobs = 0;
  for (const entry of tree.tree) {
    if (entry.type === 'tree') continue;
    if (entry.type !== 'blob' || !entry.sha || !entry.path) {
      throw new Error(`Unsupported remote tree entry at ${entry.path ?? '(unknown path)'}.`);
    }
    if (entry.mode !== '100644') {
      throw new Error(`Unsupported remote tree mode ${String(entry.mode)} at ${entry.path}.`);
    }
    const path = validateRemoteTreePath(entry.path);
    const duplicateKey = path.normalize('NFC').toLowerCase();
    const duplicate = normalizedPaths.get(duplicateKey);
    if (duplicate) throw new Error(`Duplicate normalized remote path: ${duplicate} and ${path}.`);
    normalizedPaths.set(duplicateKey, path);
    const oid = validateSha(entry.sha);
    const size = entry.size ?? 0;
    validateRemoteObjectSize(path, size);
    totalBytes += size;
    if (totalBytes > REPO_DATA_LIMITS.maxTotalBytes) throw new Error('Remote repository exceeds total import size limit.');

    if (options.includeBlobs) {
      await yieldToBrowser();
      importedBlobs += 1;
      options.onProgress?.({
        phase: 'fetch',
        message: `Downloading remote file ${importedBlobs} of ${totalBlobs}: ${path}`,
        current: importedBlobs,
        total: totalBlobs,
      });
      const blob = await githubJson<GitHubBlobResponse>(fetchImpl, config, token, `/git/blobs/${oid}`, options.signal);
      if (validateSha(blob.sha) !== oid) throw new Error(`GitHub returned an unexpected blob id for ${path}.`);
      if (blob.encoding !== 'base64') throw new Error(`Unsupported GitHub blob encoding for ${path}.`);
      const bytes = await decodeBase64FromGitHub(blob.content, options.signal);
      validateRemoteObjectSize(path, bytes.byteLength);
      const written = await repoBackend.writeObject(repo, 'blob', bytes);
      if (!written.ok) throw new Error(formatRepoError(written.error));
      if (written.value !== oid) throw new Error(`Blob ${path} did not round-trip to the expected object id.`);
    }

    entries.push({ path, oid, mode: '100644', size });
  }

  const writtenTree = await repoBackend.writeTree(repo, entries);
  if (!writtenTree.ok) throw new Error(formatRepoError(writtenTree.error));
  if (writtenTree.value !== treeSha) throw new Error(`Remote tree ${treeSha.slice(0, 7)} could not be reconstructed locally.`);
}

async function importCommitBlobs(
  fetchImpl: typeof fetch,
  repoBackend: RepoBackend,
  repo: TestGeneratorRepository,
  config: GitHubRemoteConfig,
  token: string,
  commitSha: string,
  signal?: AbortSignal,
): Promise<void> {
  const treeEntries = await repoBackend.listCommitTree(repo, commitSha);
  if (!treeEntries.ok) throw new Error(formatRepoError(treeEntries.error));
  for (const entry of treeEntries.value) {
    await yieldToBrowser();
    const existingBlob = await repoBackend.readObject(repo, entry.oid);
    if (existingBlob.ok) continue;
    const blob = await githubJson<GitHubBlobResponse>(fetchImpl, config, token, `/git/blobs/${entry.oid}`, signal);
    if (blob.encoding !== 'base64') throw new Error(`Unsupported GitHub blob encoding for ${entry.path}.`);
    const bytes = await decodeBase64FromGitHub(blob.content, signal);
    validateRemoteObjectSize(entry.path, bytes.byteLength);
    const written = await repoBackend.writeObject(repo, 'blob', bytes);
    if (!written.ok) throw new Error(formatRepoError(written.error));
    if (written.value !== entry.oid) throw new Error(`Blob ${entry.path} did not round-trip to the expected object id.`);
  }
}

async function validateCommitSnapshot(repoBackend: RepoBackend, repo: TestGeneratorRepository, commitSha: string): Promise<void> {
  const treeEntries = await repoBackend.listCommitTree(repo, commitSha);
  if (!treeEntries.ok) throw new Error(formatRepoError(treeEntries.error));
  const tracked = [];
  for (const entry of treeEntries.value) {
    const object = await repoBackend.readObject(repo, entry.oid);
    if (!object.ok) throw new Error(formatRepoError(object.error));
    if (object.value.type !== 'blob') throw new Error(`Expected blob object for ${entry.path}.`);
    tracked.push({ path: entry.path, content: decodeRepoContent(entry.path, object.value.content) });
  }
  prepareRepoEntriesForAppRestore(trackedFilesToRepoEntries(tracked));
}

async function pushCommit(
  fetchImpl: typeof fetch,
  repoBackend: RepoBackend,
  repo: TestGeneratorRepository,
  config: GitHubRemoteConfig,
  token: string,
  commit: RepoCommitDetails,
  treeEntries: RepoTreeEntry[],
  remoteCommitShas: Map<string, string>,
  signal?: AbortSignal,
  onUploadStep?: () => void | Promise<void>,
): Promise<string> {
  const remoteTreeEntries = [];
  for (const entry of treeEntries) {
    await yieldToBrowser();
    validateRemoteTreePath(entry.path);
    if (entry.mode !== '100644') throw new Error(`Unsupported local tree mode for ${entry.path}.`);
    const blob = await repoBackend.readObject(repo, entry.oid);
    if (!blob.ok) throw new Error(formatRepoError(blob.error));
    if (blob.value.type !== 'blob') throw new Error(`Expected blob object for ${entry.path}.`);
    validateRemoteObjectSize(entry.path, blob.value.content.byteLength);
    const content = await encodeBase64ForUpload(blob.value.content, signal);
    const createdBlob = await githubJson<{ sha: string }>(fetchImpl, config, token, '/git/blobs', signal, {
      method: 'POST',
      body: JSON.stringify({ content, encoding: 'base64' }),
    });
    if (validateSha(createdBlob.sha) !== entry.oid) throw new Error(`GitHub returned an unexpected blob id for ${entry.path}.`);
    await onUploadStep?.();
    remoteTreeEntries.push({ path: entry.path, mode: '100644', type: 'blob', sha: entry.oid });
  }

  await yieldToBrowser();
  const createdTree = await githubJson<{ sha: string }>(fetchImpl, config, token, '/git/trees', signal, {
    method: 'POST',
    body: JSON.stringify({ tree: remoteTreeEntries }),
  });
  if (validateSha(createdTree.sha) !== commit.treeSha) throw new Error(`GitHub returned an unexpected tree id for ${commit.sha.slice(0, 7)}.`);
  await onUploadStep?.();

  await yieldToBrowser();
  const createdCommit = await githubJson<{ sha: string }>(fetchImpl, config, token, '/git/commits', signal, {
    method: 'POST',
    body: JSON.stringify({
      message: commit.message,
      tree: commit.treeSha,
      parents: commit.parentShas.map((sha) => remoteCommitShas.get(sha) ?? sha),
      author: {
        name: commit.authorName,
        email: commit.authorEmail,
        date: formatGitHubDate(commit.authoredAt, commit.authorTimezone),
      },
      committer: {
        name: commit.committerName,
        email: commit.committerEmail,
        date: formatGitHubDate(commit.committedAt, commit.committerTimezone),
      },
    }),
  });
  await onUploadStep?.();
  return validateSha(createdCommit.sha);
}

async function preparePushCommitPlans(
  repoBackend: RepoBackend,
  repo: TestGeneratorRepository,
  commits: RepoCommitDetails[],
): Promise<Array<{ commit: RepoCommitDetails; treeEntries: RepoTreeEntry[] }>> {
  const plans = [];
  for (const commit of commits) {
    await yieldToBrowser();
    const treeEntries = await repoBackend.listCommitTree(repo, commit.sha);
    if (!treeEntries.ok) throw new Error(formatRepoError(treeEntries.error));
    plans.push({ commit, treeEntries: treeEntries.value });
  }
  return plans;
}

async function collectCommitsToPush(
  repoBackend: RepoBackend,
  repo: TestGeneratorRepository,
  localSha: string,
  remoteSha: string | null,
): Promise<RepoCommitDetails[]> {
  const excluded = await collectReachableCommitShas(repoBackend, repo, remoteSha);
  const commits: RepoCommitDetails[] = [];
  const seen = new Set<string>();

  async function visit(sha: string | null): Promise<void> {
    if (!sha || seen.has(sha) || excluded.has(sha)) return;
    seen.add(sha);
    const commit = await repoBackend.readCommitDetails(repo, sha);
    if (!commit.ok) throw new Error(formatRepoError(commit.error));
    for (const parentSha of commit.value.parentShas) await visit(parentSha);
    commits.push(commit.value);
  }

  await visit(localSha);
  return commits;
}

async function countReachableExcluding(
  repoBackend: RepoBackend,
  repo: TestGeneratorRepository,
  startSha: string | null,
  excludeSha: string | null,
): Promise<RepoResult<number>> {
  if (!startSha || startSha === excludeSha) return { ok: true, value: 0 };
  const excluded = await collectReachableCommitShasResult(repoBackend, repo, excludeSha);
  if (!excluded.ok) return excluded;
  const seen = new Set<string>();
  const stack = [startSha];
  while (stack.length > 0) {
    const sha = stack.pop();
    if (!sha || seen.has(sha) || excluded.value.has(sha)) continue;
    seen.add(sha);
    const commit = await repoBackend.readCommitDetails(repo, sha);
    if (!commit.ok) return commit;
    stack.push(...commit.value.parentShas);
  }
  return { ok: true, value: seen.size };
}

async function collectReachableCommitShas(repoBackend: RepoBackend, repo: TestGeneratorRepository, startSha: string | null): Promise<Set<string>> {
  const result = await collectReachableCommitShasResult(repoBackend, repo, startSha);
  if (!result.ok) throw new Error(formatRepoError(result.error));
  return result.value;
}

async function collectReachableCommitShasResult(
  repoBackend: RepoBackend,
  repo: TestGeneratorRepository,
  startSha: string | null,
): Promise<RepoResult<Set<string>>> {
  const seen = new Set<string>();
  const stack = startSha ? [startSha] : [];
  while (stack.length > 0) {
    const sha = stack.pop();
    if (!sha || seen.has(sha)) continue;
    seen.add(sha);
    const commit = await repoBackend.readCommitDetails(repo, sha);
    if (!commit.ok) return commit;
    stack.push(...commit.value.parentShas);
  }
  return { ok: true, value: seen };
}

async function getRemoteBranchSha(
  fetchImpl: typeof fetch,
  config: GitHubRemoteConfig,
  token: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await githubFetch(fetchImpl, config, token, `/git/ref/heads/${encodeURIComponent(config.branch)}`, signal);
  if (response.status === 404) return null;
  if (!response.ok) {
    const message = await formatGitHubError(response);
    if (response.status === 409 || /empty/i.test(message)) {
      throw new Error('GitHub reports this repository is empty. Initialize it on GitHub first, for example with a README/default branch.');
    }
    throw new Error(message);
  }
  const payload = (await response.json()) as { object?: { sha?: string } };
  return payload.object?.sha ? validateSha(payload.object.sha) : null;
}

async function ensureRemoteRepository(
  fetchImpl: typeof fetch,
  config: GitHubRemoteConfig,
  token: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await githubFetch(fetchImpl, config, token, '', signal);
  if (response.status === 404) {
    throw new Error(`Repository ${config.github.owner}/${config.github.repo} was not found, or this token does not have access.`);
  }
  if (!response.ok) throw new Error(await formatGitHubError(response));
}

async function updateRemoteBranch(
  fetchImpl: typeof fetch,
  config: GitHubRemoteConfig,
  token: string,
  sha: string,
  exists: boolean,
  signal?: AbortSignal,
): Promise<void> {
  if (exists) {
    await githubJson(fetchImpl, config, token, `/git/refs/heads/${encodeURIComponent(config.branch)}`, signal, {
      method: 'PATCH',
      body: JSON.stringify({ sha: validateSha(sha), force: false }),
    });
    return;
  }
  await githubJson(fetchImpl, config, token, '/git/refs', signal, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${config.branch}`, sha: validateSha(sha) }),
  });
}

async function githubJson<T>(
  fetchImpl: typeof fetch,
  config: GitHubRemoteConfig,
  token: string,
  path: string,
  signal?: AbortSignal,
  init: RequestInit = {},
): Promise<T> {
  const response = await githubFetch(fetchImpl, config, token, path, signal, init);
  if (!response.ok) throw new Error(await formatGitHubError(response));
  return (await response.json()) as T;
}

async function githubApiJson<T>(
  fetchImpl: typeof fetch,
  token: string,
  path: string,
  signal?: AbortSignal,
  init: RequestInit = {},
): Promise<T> {
  const response = await githubApiFetch(fetchImpl, token, path, signal, init);
  if (!response.ok) throw new Error(await formatGitHubError(response));
  return (await response.json()) as T;
}

function githubFetch(
  fetchImpl: typeof fetch,
  config: GitHubRemoteConfig,
  token: string,
  path: string,
  signal?: AbortSignal,
  init: RequestInit = {},
): Promise<Response> {
  return githubApiFetch(
    fetchImpl,
    token,
    `/repos/${encodeURIComponent(config.github.owner)}/${encodeURIComponent(config.github.repo)}${path}`,
    signal,
    init,
  );
}

function githubApiFetch(
  fetchImpl: typeof fetch,
  token: string,
  path: string,
  signal?: AbortSignal,
  init: RequestInit = {},
): Promise<Response> {
  if (!path.startsWith('/')) throw new Error('GitHub API path must be relative to https://api.github.com.');
  const url = new URL(path, GITHUB_API_ORIGIN);
  if (url.origin !== GITHUB_API_ORIGIN) throw new Error('Refusing to send a token outside https://api.github.com.');
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  return fetchImpl(url.toString(), { ...init, signal, redirect: 'error', headers });
}

async function formatGitHubError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    if (payload.message) return payload.message;
  } catch {
    // Use fallback below.
  }
  return `GitHub remote operation failed (${response.status}).`;
}

async function buildMatchingCommitObject(commit: GitHubCommitResponse): Promise<string> {
  const signedCommit = buildSignedCommitObject(commit);
  if (signedCommit && (await gitObjectSha('commit', signedCommit)) === commit.sha) return signedCommit;
  for (const commitObject of buildUnsignedCommitObjectCandidates(commit)) {
    if ((await gitObjectSha('commit', commitObject)) === commit.sha) return commitObject;
  }
  return buildUnsignedCommitObject(commit);
}

function* buildUnsignedCommitObjectCandidates(commit: GitHubCommitResponse): Generator<string> {
  const seen = new Set<string>();
  for (const commitObject of buildUnsignedCommitObjectCandidateSequence(commit)) {
    if (!seen.has(commitObject)) {
      seen.add(commitObject);
      yield commitObject;
    }
  }
}

function* buildUnsignedCommitObjectCandidateSequence(commit: GitHubCommitResponse): Generator<string> {
  yield buildUnsignedCommitObject(commit);
  yield* buildSameTimezoneCommitObjects(commit);
  yield* buildTimezonePairCommitObjects(commit);
}

function buildUnsignedCommitObject(commit: GitHubCommitResponse): string {
  return buildUnsignedCommitObjectWithMessage(commit, ensureTrailingNewline(commit.message));
}

function buildUnsignedCommitObjectWithMessage(commit: GitHubCommitResponse, message: string): string {
  const headers = [
    `tree ${commit.tree.sha}`,
    ...commit.parents.map((parent) => `parent ${parent.sha}`),
    `author ${formatSignature(commit.author)}`,
    `committer ${formatSignature(commit.committer ?? commit.author)}`,
    '',
  ];
  return `${headers.join('\n')}\n${message}`;
}

function buildUnsignedCommitObjectWithTimezones(
  commit: GitHubCommitResponse,
  authorTimezone: string,
  committerTimezone: string,
  message = ensureTrailingNewline(commit.message),
): string {
  const headers = [
    `tree ${commit.tree.sha}`,
    ...commit.parents.map((parent) => `parent ${parent.sha}`),
    `author ${formatSignature(commit.author, authorTimezone)}`,
    `committer ${formatSignature(commit.committer ?? commit.author, committerTimezone)}`,
    '',
  ];
  return `${headers.join('\n')}\n${message}`;
}

function* buildSameTimezoneCommitObjects(commit: GitHubCommitResponse): Generator<string> {
  for (const timezone of getGitTimezoneCandidates()) {
    for (const message of getCommitMessageCandidates(commit.message)) {
      yield buildUnsignedCommitObjectWithTimezones(commit, timezone, timezone, message);
    }
  }
}

function* buildTimezonePairCommitObjects(commit: GitHubCommitResponse): Generator<string> {
  const candidates = getGitTimezoneCandidates();
  for (const authorTimezone of candidates) {
    for (const committerTimezone of candidates) {
      for (const message of getCommitMessageCandidates(commit.message)) {
        yield buildUnsignedCommitObjectWithTimezones(commit, authorTimezone, committerTimezone, message);
      }
    }
  }
}

function getCommitMessageCandidates(message: string): string[] {
  const candidates = [ensureTrailingNewline(message), message];
  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
}

function buildSignedCommitObject(commit: GitHubCommitResponse): string | null {
  const payload = commit.verification?.payload;
  const signature = commit.verification?.signature;
  if (!payload || !signature) return null;
  const separatorIndex = payload.indexOf('\n\n');
  if (separatorIndex < 0) return null;
  const headers = payload.slice(0, separatorIndex);
  const message = payload.slice(separatorIndex + 2);
  const signatureHeader = signature
    .split('\n')
    .map((line, index) => (index === 0 ? `gpgsig ${line}` : ` ${line}`))
    .join('\n');
  return `${headers}\n${signatureHeader}\n\n${message}`;
}

function formatSignature(signature: GitHubSignature | null, timezoneOverride?: string): string {
  const date = parseGitDate(signature?.date ?? new Date().toISOString());
  return `${signature?.name ?? 'Unknown'} <${signature?.email ?? 'unknown@example.invalid'}> ${date.timestamp} ${timezoneOverride ?? date.timezone}`;
}

function parseGitDate(dateText: string): { timestamp: number; timezone: string } {
  const date = new Date(dateText);
  const timestamp = Math.floor(date.getTime() / 1000);
  const offsetMatch = /([+-]\d{2}):?(\d{2})$/.exec(dateText);
  if (offsetMatch) return { timestamp, timezone: `${offsetMatch[1]}${offsetMatch[2]}` };
  return { timestamp, timezone: '+0000' };
}

function formatGitHubDate(isoDate: string, timezone: string): string {
  const date = new Date(isoDate);
  const offsetMinutes = parseTimezoneOffset(timezone);
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const min = String(local.getUTCMinutes()).padStart(2, '0');
  const ss = String(local.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}${timezone.slice(0, 3)}:${timezone.slice(3)}`;
}

function parseTimezoneOffset(timezone: string): number {
  const match = /^([+-])(\d{2})(\d{2})$/.exec(timezone);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

let gitTimezoneCandidates: string[] | null = null;

function getGitTimezoneCandidates(): string[] {
  if (gitTimezoneCandidates) return gitTimezoneCandidates;
  const timezones = ['+0000'];
  for (let minutes = -12 * 60; minutes <= 14 * 60; minutes += 15) {
    const sign = minutes < 0 ? '-' : '+';
    const absolute = Math.abs(minutes);
    const timezone = `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}${String(absolute % 60).padStart(2, '0')}`;
    if (!timezones.includes(timezone)) timezones.push(timezone);
  }
  gitTimezoneCandidates = timezones;
  return timezones;
}

async function gitObjectSha(type: 'commit' | 'tree' | 'blob', content: string): Promise<string> {
  const body = encodeUtf8(content);
  const payload = concatBytes([encodeUtf8(`${type} ${body.byteLength}\0`), body]);
  return sha1Hex(payload);
}

function validateGitHubRemoteConfig(
  config: GitRemoteConfig,
  token: string,
): { ok: true; config: GitHubRemoteConfig } | { ok: false; result: RemoteGitResult } {
  try {
    const normalized = normalizeRemoteConfig(config);
    if (normalized.kind !== 'github' || !normalized.github) {
      return { ok: false, result: { ok: false, message: 'Only GitHub remotes are implemented in this phase.' } };
    }
    validateRemoteName(normalized.name);
    validateGitHubOwner(normalized.github.owner);
    validateGitHubRepo(normalized.github.repo);
    validateBranchName(normalized.branch);
    if (!token) return { ok: false, result: { ok: false, message: 'Add a GitHub token before using remotes.' } };
    return { ok: true, config: normalized as GitHubRemoteConfig };
  } catch (error) {
    return { ok: false, result: { ok: false, message: error instanceof Error ? error.message : 'Invalid remote configuration.' } };
  }
}

function getRemoteUrl(config: GitRemoteConfig): string {
  const remoteConfig = normalizeRemoteConfig(config);
  if (remoteConfig.kind !== 'github' || !remoteConfig.github) return `${remoteConfig.kind}:${remoteConfig.name}`;
  return `https://github.com/${encodeURIComponent(remoteConfig.github.owner)}/${encodeURIComponent(remoteConfig.github.repo)}.git`;
}

function validateRemoteTreePath(path: string): string {
  const normalized = normalizeRepoPath(path);
  if (normalized !== path) throw new Error(`Remote path is not normalized: ${path}`);
  return normalized;
}

function validateRemoteObjectSize(path: string, size: number): void {
  if (!Number.isFinite(size) || size < 0) throw new Error(`Remote object has an invalid size: ${path}.`);
  const limit = path.startsWith('images/') ? REPO_DATA_LIMITS.maxImageFileBytes : REPO_DATA_LIMITS.maxTextFileBytes;
  if (size > limit) throw new Error(`Remote object exceeds size limit: ${path}.`);
}

function decodeRepoContent(path: string, bytes: Uint8Array): RepoDataEntry['content'] {
  const extension = path.includes('.') ? path.split('.').at(-1)?.toLowerCase() : null;
  return extension && TEXT_EXTENSIONS.has(extension) ? new TextDecoder('utf-8', { fatal: true }).decode(bytes) : bytes;
}

function validateSha(sha: string): string {
  const value = sha.trim();
  if (!/^[a-f0-9]{40}$/i.test(value)) throw new Error(`Invalid git object id '${sha}'.`);
  return value.toLowerCase();
}

function repoErrorResult<T>(result: RepoResult<T>): RemoteGitResult {
  return result.ok ? { ok: true, message: '' } : { ok: false, message: formatRepoError(result.error) };
}

function emit(options: RemoteGitOptions, phase: RemoteGitProgress['phase'], message: string, current?: number, total?: number): void {
  options.onProgress?.({ phase, message, current, total });
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : 'Remote git operation failed.';
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function encodeBase64ForUpload(content: Uint8Array, signal?: AbortSignal): Promise<string> {
  const chunkSize = 49_152;
  const chunks = [];
  for (let offset = 0; offset < content.byteLength; offset += chunkSize) {
    if (signal?.aborted) throw new Error('Remote git operation was aborted.');
    const chunk = content.subarray(offset, Math.min(offset + chunkSize, content.byteLength));
    chunks.push(btoa(String.fromCharCode(...chunk)));
    if (offset + chunkSize < content.byteLength) await yieldToBrowser();
  }
  return chunks.join('');
}

async function decodeBase64FromGitHub(content: string, signal?: AbortSignal): Promise<Uint8Array> {
  const normalized = content.replace(/\n/g, '');
  const chunkSize = 65_536;
  const chunks = [];
  let totalLength = 0;
  for (let offset = 0; offset < normalized.length; offset += chunkSize) {
    if (signal?.aborted) throw new Error('Remote git operation was aborted.');
    const decoded = atob(normalized.slice(offset, Math.min(offset + chunkSize, normalized.length)));
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
    chunks.push(bytes);
    totalLength += bytes.byteLength;
    if (offset + chunkSize < normalized.length) await yieldToBrowser();
  }
  const result = new Uint8Array(totalLength);
  let resultOffset = 0;
  for (const chunk of chunks) {
    result.set(chunk, resultOffset);
    resultOffset += chunk.byteLength;
  }
  return result;
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

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
