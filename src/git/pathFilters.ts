export function normalizeRelativePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

export function joinRelativePaths(...paths: string[]): string {
  return normalizeRelativePath(paths.filter(Boolean).join('/'));
}

export function stripPathPrefix(path: string, prefix: string): string | null {
  const normalizedPath = normalizeRelativePath(path);
  const normalizedPrefix = normalizeRelativePath(prefix);

  if (!normalizedPrefix) return normalizedPath;
  if (normalizedPath === normalizedPrefix) return '';
  if (normalizedPath.startsWith(`${normalizedPrefix}/`)) {
    return normalizedPath.slice(normalizedPrefix.length + 1);
  }
  return null;
}

export function isReservedGitPath(path: string): boolean {
  return normalizeRelativePath(path)
    .split('/')
    .some((segment) => segment.toLowerCase() === '.git');
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function matchesIgnorePattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizeRelativePath(path);
  const normalizedPattern = pattern.trim();
  if (!normalizedPattern) return false;

  if (normalizedPattern.endsWith('/')) {
    const directoryPath = normalizeRelativePath(normalizedPattern.slice(0, -1));
    return normalizedPath === directoryPath || normalizedPath.startsWith(`${directoryPath}/`);
  }

  const regex = new RegExp(
    `^${escapeRegex(normalizedPattern)
      .replace(/\\\*\\\*/g, '.*')
      .replace(/\\\*/g, '[^/]*')}$`,
  );

  return regex.test(normalizedPath);
}

export function shouldIgnorePath(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesIgnorePattern(path, pattern));
}
