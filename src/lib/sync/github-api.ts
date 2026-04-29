import type { GistResponse, GitHubUser } from './types';
import { GistApiError } from './types';

const API = 'https://api.github.com';

// All functions take token: string as the first parameter — no module state.
// Every request includes Authorization and API version headers.

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
    throw new GistApiError(response.status, `GitHub API error: ${text}`);
  }

  return response.json() as Promise<T>;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Get the authenticated user's profile. Use to validate a PAT. */
export async function getCurrentUser(token: string): Promise<GitHubUser> {
  return request<GitHubUser>('GET', `${API}/user`, token);
}

/** Get a gist by its ID. */
export async function getGist(token: string, gistId: string): Promise<GistResponse> {
  return request<GistResponse>('GET', `${API}/gists/${gistId}`, token);
}

/** List all gists for the authenticated user.
 *  Paginates through all pages to get the complete list. */
export async function listGists(token: string): Promise<GistResponse[]> {
  const allGists: GistResponse[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const gists = await request<GistResponse[]>(
      'GET',
      `${API}/user/gists?per_page=100&page=${page}`,
      token,
    );
    allGists.push(...gists);
    hasMore = gists.length === 100;
    page++;
  }

  return allGists;
}

/** Find a gist by a specific filename it contains.
 *  Returns null if not found. Searches through all gists. */
export async function findGistByFilename(
  token: string,
  filename: string,
): Promise<GistResponse | null> {
  const gists = await listGists(token);
  return gists.find((g) => filename in g.files) ?? null;
}

/** Create a new gist.
 *  @param description - Human-readable description
 *  @param files - Record mapping filenames to content strings
 *  @param isPublic - Defaults to false (secret gist)
 */
export async function createGist(
  token: string,
  description: string,
  files: Record<string, string>,
  isPublic: boolean = false,
): Promise<GistResponse> {
  return request<GistResponse>('POST', `${API}/gists`, token, {
    description,
    public: isPublic,
    files: Object.fromEntries(
      Object.entries(files).map(([name, content]) => [
        name,
        { content },
      ]),
    ),
  });
}

/** Update an existing gist.
 *  Pass null as content to delete a file.
 *  Pass new content to create or update a file. */
export async function updateGist(
  token: string,
  gistId: string,
  files: Record<string, string | null>,
): Promise<GistResponse> {
  return request<GistResponse>('PATCH', `${API}/gists/${gistId}`, token, {
    files: Object.fromEntries(
      Object.entries(files).map(([name, content]) => [
        name,
        content === null ? null : { content },
      ]),
    ),
  });
}

/** Read file content from a gist response.
 *  Handles truncation: if file.truncated, fetches file.raw_url instead.
 *  Returns null if file not found in gist. */
export async function getGistFileContent(
  token: string,
  gist: GistResponse,
  filename: string,
): Promise<string | null> {
  const file = gist.files[filename];
  if (!file) return null;

  if (file.truncated && file.raw_url) {
    // GitHub has truncated the content. Fetch from the raw URL instead.
    const response = await fetch(file.raw_url);
    if (!response.ok) return null;
    return response.text();
  }

  return file.content;
}
