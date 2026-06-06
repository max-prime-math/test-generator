import type { RepoInfo } from './types';

export interface GitHubApiUser {
  login: string;
}

export interface GitHubDirectoryItem {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir';
}

export interface GitHubFile {
  path: string;
  sha: string;
  content: string;
}

function disabled(): never {
  throw new Error('Legacy GitHub Contents API sync is disabled. Use src/git/remoteService.ts instead.');
}

export async function getCurrentUser(_token: string): Promise<GitHubApiUser> {
  disabled();
}

export async function getRepo(_token: string, _owner: string, _name: string): Promise<RepoInfo | null> {
  disabled();
}

export async function createRepo(_token: string, _name: string, _description: string): Promise<RepoInfo> {
  disabled();
}

export async function listDirectory(_token: string, _repo: RepoInfo, _path: string): Promise<GitHubDirectoryItem[]> {
  disabled();
}

export async function getFile(_token: string, _repo: RepoInfo, _path: string): Promise<GitHubFile | null> {
  disabled();
}

export async function putFile(
  _token: string,
  _repo: RepoInfo,
  _path: string,
  _content: string,
  _message: string,
  _sha?: string,
): Promise<string> {
  disabled();
}

export async function getUser(_token: string, _username: string): Promise<GitHubApiUser> {
  disabled();
}

export async function addCollaborator(
  _token: string,
  _repo: RepoInfo,
  _username: string,
  _permission: 'pull' | 'push' | 'admin' = 'push',
): Promise<void> {
  disabled();
}
