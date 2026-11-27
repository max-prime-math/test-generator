const READ_TIMEOUT_MS = 15_000;

export class WorkspaceReadTimeout extends Error {
  constructor(operation: string) {
    super(`The workspace did not respond while ${operation}. Check that the folder is available on this device.`);
    this.name = 'WorkspaceReadTimeout';
  }
}

/** Bound waits on browser reads. The late result is ignored, so this must only wrap reads. */
export async function waitForWorkspaceRead<T>(operation: string, read: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WorkspaceReadTimeout(operation)), READ_TIMEOUT_MS);
  });
  try { return await Promise.race([timeout, read()]); }
  finally { clearTimeout(timer); }
}

/** Use the active directory to resolve an older handle. Only the directory itself resolves to []. */
export async function matchesWorkspaceFolder(
  root: FileSystemDirectoryHandle,
  saved: FileSystemDirectoryHandle,
): Promise<boolean> {
  if (root === saved) return true;
  const path = await waitForWorkspaceRead('verifying the saved workspace folder against the connected folder', () => root.resolve(saved));
  return path?.length === 0;
}
