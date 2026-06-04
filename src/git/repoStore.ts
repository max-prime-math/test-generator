import {
  createRepoBackend,
  type GitFileStorage,
  type RepoAuthor,
  type RepoBackend,
  type RepoBranch,
  type RepoCommit,
  type RepoError,
  type RepoResult,
  type RepoStatus,
  type RepoTrackedFile,
  type TestGeneratorRepository,
} from './repoBackend.ts';
import {
  createTestGeneratorRepository,
  projectAppDataToRepository,
  readBrowserAppData,
  TEST_GENERATOR_REPO_ID,
  type RepoProjectionResult,
} from './repoDataBridge.ts';
import type { RepoAppData } from './repoDataModel.ts';

const DEFAULT_LOCK_TIMEOUT_MS = 12_000;

export interface TestGeneratorRepoService {
  initRepository(): Promise<RepoResult<{ repo: TestGeneratorRepository; status: RepoStatus }>>;
  status(): Promise<RepoResult<RepoStatus>>;
  stageAll(): Promise<RepoResult<RepoStatus>>;
  stagePaths(paths: string[]): Promise<RepoResult<RepoStatus>>;
  commit(options: { message: string; author?: Partial<RepoAuthor> }): Promise<RepoResult<{ commit: RepoCommit; status: RepoStatus }>>;
  log(limit?: number): Promise<RepoResult<RepoCommit[]>>;
  getCurrentBranch(): Promise<RepoResult<string>>;
  listBranches(): Promise<RepoResult<RepoBranch[]>>;
  createBranch(name: string): Promise<RepoResult<RepoBranch>>;
  switchBranch(name: string): Promise<RepoResult<{ repo: TestGeneratorRepository; branch: RepoBranch }>>;
  readTrackedFiles(): Promise<RepoResult<RepoTrackedFile[]>>;
  replaceRepository(nextRepo: TestGeneratorRepository): void;
  getRepository(): TestGeneratorRepository;
}

export interface CreateRepoServiceOptions {
  backend?: RepoBackend;
  storage?: GitFileStorage;
  repo?: TestGeneratorRepository;
  readAppData?: () => Promise<RepoAppData>;
  lockTimeoutMs?: number;
}

export const localRepoStore = createTestGeneratorRepoService();

export function createTestGeneratorRepoService(options: CreateRepoServiceOptions = {}): TestGeneratorRepoService {
  const backend = options.backend ?? createRepoBackend(options.storage);
  const readAppData = options.readAppData ?? readBrowserAppData;
  const lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  let repo = options.repo ?? createTestGeneratorRepository();

  async function withServiceLock<T>(operation: () => Promise<RepoResult<T>>): Promise<RepoResult<T>> {
    return withRepoOperationLock(repo.id, operation, { timeoutMs: lockTimeoutMs });
  }

  async function ensureInitialized(): Promise<RepoResult<void>> {
    const initialized = await backend.initRepository(repo);
    if (!initialized.ok) return initialized;
    repo = initialized.value;
    return { ok: true, value: undefined };
  }

  async function projectCurrentAppData(): Promise<RepoProjectionResult> {
    const projection = projectAppDataToRepository(repo, await readAppData());
    repo = projection.repo;
    return projection;
  }

  return {
    initRepository: () =>
      withServiceLock(async () => {
        const projection = await projectCurrentAppData();
        repo = projection.repo;
        const initialized = await backend.initRepository(repo);
        if (!initialized.ok) return initialized;
        repo = initialized.value;
        const status = await backend.status(repo);
        if (!status.ok) return status;
        return { ok: true, value: { repo, status: status.value } };
      }),

    status: () =>
      withServiceLock(async () => {
        const initialized = await ensureInitialized();
        if (!initialized.ok) return initialized;
        await projectCurrentAppData();
        return backend.status(repo);
      }),

    stageAll: () =>
      withServiceLock(async () => {
        const initialized = await ensureInitialized();
        if (!initialized.ok) return initialized;
        await projectCurrentAppData();
        return backend.stageAll(repo);
      }),

    stagePaths: (paths) =>
      withServiceLock(async () => {
        const initialized = await ensureInitialized();
        if (!initialized.ok) return initialized;
        await projectCurrentAppData();
        return backend.stagePaths(repo, paths);
      }),

    commit: (commitOptions) =>
      withServiceLock(async () => {
        const initialized = await ensureInitialized();
        if (!initialized.ok) return initialized;
        await projectCurrentAppData();
        const staged = await backend.stageAll(repo);
        if (!staged.ok) return staged;
        const commit = await backend.commit(repo, commitOptions);
        if (!commit.ok) return commit;
        const status = await backend.status(repo);
        if (!status.ok) return status;
        return { ok: true, value: { commit: commit.value, status: status.value } };
      }),

    log: (limit) =>
      withServiceLock(async () => {
        const initialized = await ensureInitialized();
        if (!initialized.ok) return initialized;
        return backend.log(repo, limit);
      }),

    getCurrentBranch: () =>
      withServiceLock(async () => {
        const initialized = await ensureInitialized();
        if (!initialized.ok) return initialized;
        return backend.getCurrentBranch(repo);
      }),

    listBranches: () =>
      withServiceLock(async () => {
        const initialized = await ensureInitialized();
        if (!initialized.ok) return initialized;
        return backend.listBranches(repo);
      }),

    createBranch: (name) =>
      withServiceLock(async () => {
        const initialized = await ensureInitialized();
        if (!initialized.ok) return initialized;
        return backend.createBranch(repo, name);
      }),

    switchBranch: (name) =>
      withServiceLock(async () => {
        const initialized = await ensureInitialized();
        if (!initialized.ok) return initialized;
        await projectCurrentAppData();
        const branches = await backend.listBranches(repo);
        if (!branches.ok) return branches;
        if (!branches.value.some((branch) => branch.name === name)) {
          return {
            ok: false,
            error: {
              code: 'not-found',
              message: `git switch: branch '${name}' does not exist.`,
              recoverable: true,
            },
          };
        }
        return {
          ok: false,
          error: {
            code: 'unsupported',
            message: 'Branch switching is validated but not exposed until a recoverable app restore workflow exists.',
            recoverable: true,
          },
        };
      }),

    readTrackedFiles: () =>
      withServiceLock(async () => {
        const initialized = await ensureInitialized();
        if (!initialized.ok) return initialized;
        return backend.readTrackedFiles(repo);
      }),

    replaceRepository: (nextRepo) => {
      repo = nextRepo;
    },

    getRepository: () => repo,
  };
}

interface RepoLockOptions {
  timeoutMs: number;
}

type LockNavigator = Navigator & {
  locks?: {
    request<T>(
      name: string,
      options: { mode: 'exclusive'; ifAvailable?: boolean },
      callback: (lock: unknown | null) => Promise<T>,
    ): Promise<T>;
  };
};

const fallbackLockQueues = new Map<string, Promise<void>>();

export async function withRepoOperationLock<T>(
  repoId: string,
  operation: () => Promise<RepoResult<T>>,
  options: RepoLockOptions = { timeoutMs: DEFAULT_LOCK_TIMEOUT_MS },
): Promise<RepoResult<T>> {
  const lockName = `test-generator-git:${repoId || TEST_GENERATOR_REPO_ID}`;
  const webLocks = typeof navigator !== 'undefined' ? (navigator as LockNavigator).locks : undefined;

  if (webLocks?.request) {
    try {
      return await webLocks.request(lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) {
          return { ok: false, error: lockTimeoutError() };
        }
        return operation();
      });
    } catch (error) {
      return { ok: false, error: repoErrorFromUnknown(error) };
    }
  }

  return withFallbackLock(lockName, operation, options.timeoutMs);
}

async function withFallbackLock<T>(
  lockName: string,
  operation: () => Promise<RepoResult<T>>,
  timeoutMs: number,
): Promise<RepoResult<T>> {
  const previous = fallbackLockQueues.get(lockName)?.catch(() => undefined) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.then(() => current);
  fallbackLockQueues.set(lockName, next);

  const start = Date.now();
  try {
    await withTimeout(previous, timeoutMs, lockTimeoutError());
  } catch (error) {
    return { ok: false, error: isRepoError(error) ? error : lockTimeoutError() };
  }
  if (Date.now() - start > timeoutMs) return { ok: false, error: lockTimeoutError() };

  try {
    return await operation();
  } catch (error) {
    return { ok: false, error: repoErrorFromUnknown(error) };
  } finally {
    release();
    if (fallbackLockQueues.get(lockName) === next) {
      fallbackLockQueues.delete(lockName);
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, error: RepoError): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(error), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function lockTimeoutError(): RepoError {
  return {
    code: 'locked',
    message: 'Another local git operation is already running for this Test Generator repo.',
    recoverable: true,
  };
}

function isRepoError(error: unknown): error is RepoError {
  return Boolean(error && typeof error === 'object' && 'code' in error && 'message' in error && 'recoverable' in error);
}

function repoErrorFromUnknown(error: unknown): RepoError {
  if (isRepoError(error)) return error;
  return {
    code: 'storage-error',
    message: error instanceof Error ? error.message : 'Local git operation failed.',
    recoverable: true,
  };
}
