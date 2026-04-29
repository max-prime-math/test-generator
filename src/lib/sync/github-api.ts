import type { GitHubUser, RepoInfo, RepoFile } from './types';
import { GistApiError } from './types';

const API = 'https://api.github.com';

// All functions take token: string as the first parameter — no module state.

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Accept': 'application/vnd.github+json',
  };
}

async function request<T>(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: headers(token),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new GistApiError(response.status, `GitHub API error (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

// ── User ─────────────────────────────────────────────────────────────────────

/** Get the authenticated user's profile. Use to validate a PAT. */
export async function getCurrentUser(token: string): Promise<GitHubUser> {
  return request<GitHubUser>('GET', `${API}/user`, token);
}

// ── Repo operations ──────────────────────────────────────────────────────────

/** Get a repo by owner + name. Returns null if 404. */
export async function getRepo(
  token: string,
  owner: string,
  name: string,
): Promise<RepoInfo | null> {
  try {
    const repo = await request<{
      name: string;
      owner: { login: string };
      default_branch: string;
      private: boolean;
    }>('GET', `${API}/repos/${owner}/${name}`, token);
    return {
      owner: repo.owner.login,
      name: repo.name,
      defaultBranch: repo.default_branch,
    };
  } catch (e) {
    if (e instanceof GistApiError && e.status === 404) return null;
    throw e;
  }
}

/** Create a new private repo for the authenticated user. */
export async function createRepo(
  token: string,
  name: string,
  description: string,
): Promise<RepoInfo> {
  const repo = await request<{
    name: string;
    owner: { login: string };
    default_branch: string;
  }>('POST', `${API}/user/repos`, token, {
    name,
    description,
    private: true,
    auto_init: true, // creates a README so the repo has a default branch
  });
  return {
    owner: repo.owner.login,
    name: repo.name,
    defaultBranch: repo.default_branch || 'main',
  };
}

// ── File contents ────────────────────────────────────────────────────────────

/** Get a file from a repo. Returns null if 404. */
export async function getFile(
  token: string,
  repo: RepoInfo,
  path: string,
): Promise<RepoFile | null> {
  try {
    const file = await request<{
      name: string;
      path: string;
      sha: string;
      content: string;
      encoding: string;
    }>('GET', `${API}/repos/${repo.owner}/${repo.name}/contents/${path}`, token);

    if (file.encoding !== 'base64') {
      throw new Error(`Unexpected encoding: ${file.encoding}`);
    }
    // GitHub returns base64-encoded content with newlines
    const decoded = atob(file.content.replace(/\n/g, ''));
    // Re-encode through Uint8Array to get a UTF-8 string properly
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    const text = new TextDecoder().decode(bytes);

    return {
      path: file.path,
      sha: file.sha,
      content: text,
    };
  } catch (e) {
    if (e instanceof GistApiError && e.status === 404) return null;
    throw e;
  }
}

/** Create or update a file in a repo. Returns the new SHA. */
export async function putFile(
  token: string,
  repo: RepoInfo,
  path: string,
  content: string,
  commitMessage: string,
  prevSha?: string,
): Promise<string> {
  // Encode content as base64 (UTF-8 safe)
  const utf8 = new TextEncoder().encode(content);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < utf8.length; i += chunk) {
    const slice = utf8.subarray(i, Math.min(i + chunk, utf8.length));
    binary += String.fromCharCode(...Array.from(slice));
  }
  const base64 = btoa(binary);

  const body: Record<string, string> = {
    message: commitMessage,
    content: base64,
  };
  if (prevSha) body.sha = prevSha;

  const response = await request<{ content: { sha: string } }>(
    'PUT',
    `${API}/repos/${repo.owner}/${repo.name}/contents/${path}`,
    token,
    body,
  );
  return response.content.sha;
}

/** List files in a directory of a repo. Returns empty array if directory doesn't exist. */
export async function listDirectory(
  token: string,
  repo: RepoInfo,
  path: string = '',
): Promise<Array<{ name: string; path: string; sha: string; type: string }>> {
  try {
    const items = await request<
      Array<{ name: string; path: string; sha: string; type: string }>
    >('GET', `${API}/repos/${repo.owner}/${repo.name}/contents/${path}`, token);
    return Array.isArray(items) ? items : [];
  } catch (e) {
    if (e instanceof GistApiError && e.status === 404) return [];
    throw e;
  }
}
