import type {
  LocalFile,
  ProviderConnectionInfo,
  RemoteFile,
  StorageLike,
  SyncProvider,
  SyncProviderAuthInput,
} from '../types';

const CLIENT_ID_KEY = 'tg-google-drive-client-id-v1';
const API_KEY_KEY = 'tg-google-drive-api-key-v1';
const PROJECT_NUMBER_KEY = 'tg-google-drive-project-number-v1';
const FOLDER_ID_KEY = 'tg-google-drive-folder-id-v1';
const FOLDER_NAME_KEY = 'tg-google-drive-folder-name-v1';
const FOLDER_URL_KEY = 'tg-google-drive-folder-url-v1';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const GAPI_SRC = 'https://apis.google.com/js/api.js';

const ENV_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '';
const ENV_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY?.trim() || '';
const ENV_PROJECT_NUMBER = import.meta.env.VITE_GOOGLE_CLOUD_PROJECT_NUMBER?.trim() || '';

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
};

type GoogleTokenClient = {
  callback: ((response: GoogleTokenResponse) => void) | null;
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

type GapiWindow = Window & typeof globalThis & {
  gapi?: {
    load: (library: string, callback: () => void) => void;
  };
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (response: GoogleTokenResponse) => void;
        }) => GoogleTokenClient;
        revoke: (token: string, callback?: () => void) => void;
      };
    };
    picker?: {
      Action: { PICKED: string; CANCEL: string };
      DocsViewMode: { LIST: unknown };
      Feature: { NAV_HIDDEN: unknown };
      Response: { ACTION: string; DOCUMENTS: string };
      Document: { ID: string; NAME: string; URL: string };
      ViewId: { FOLDERS: unknown };
      DocsView: new (viewId?: unknown) => {
        setIncludeFolders: (enabled: boolean) => unknown;
        setSelectFolderEnabled: (enabled: boolean) => unknown;
        setMimeTypes: (types: string) => unknown;
        setMode: (mode: unknown) => unknown;
      };
      PickerBuilder: new () => {
        addView: (view: unknown) => unknown;
        enableFeature: (feature: unknown) => unknown;
        setOAuthToken: (token: string) => unknown;
        setDeveloperKey: (key: string) => unknown;
        setCallback: (callback: (data: Record<string, unknown>) => void) => unknown;
        setAppId: (appId: string) => unknown;
        build: () => { setVisible: (visible: boolean) => void };
      };
    };
  };
};

type DriveFileResource = {
  id: string;
  name: string;
  modifiedTime?: string;
  md5Checksum?: string;
};

type FolderSelection = {
  id: string;
  name: string;
  url: string;
};

function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function encodeDriveName(path: string): string {
  return encodeURIComponent(path);
}

function decodeDriveName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function toMillis(value?: string): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

let gisPromise: Promise<void> | null = null;
let gapiPromise: Promise<void> | null = null;
let pickerPromise: Promise<void> | null = null;

function requireBrowser(): void {
  if (typeof window === 'undefined') {
    throw new Error('Google Drive sync requires a browser environment');
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadGoogleIdentityScript(): Promise<void> {
  requireBrowser();
  if ((window as GapiWindow).google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) gisPromise = loadScript(GIS_SRC);
  return gisPromise;
}

function loadGapiScript(): Promise<void> {
  requireBrowser();
  if ((window as GapiWindow).gapi?.load) return Promise.resolve();
  if (!gapiPromise) gapiPromise = loadScript(GAPI_SRC);
  return gapiPromise;
}

async function loadPickerLibrary(): Promise<void> {
  await loadGapiScript();
  if ((window as GapiWindow).google?.picker) return;
  if (!pickerPromise) {
    pickerPromise = new Promise<void>((resolve, reject) => {
      const gapi = (window as GapiWindow).gapi;
      if (!gapi?.load) {
        reject(new Error('Google API loader is unavailable'));
        return;
      }
      gapi.load('picker', () => resolve());
    });
  }
  await pickerPromise;
}

async function parseDriveError(response: Response): Promise<Error> {
  try {
    const payload = await response.json() as {
      error?: {
        message?: string;
      };
    };
    const message = payload.error?.message?.trim();
    if (message) return new Error(message);
  } catch {
    // Fall through to status text.
  }
  return new Error(`Google Drive request failed (${response.status} ${response.statusText})`);
}

function deriveProjectNumber(clientId: string): string {
  const prefix = clientId.split('-')[0]?.trim() ?? '';
  return /^\d+$/.test(prefix) ? prefix : '';
}

export class GoogleDriveSyncProvider implements SyncProvider {
  readonly id = 'googleDrive';
  readonly displayName = 'Google Drive';
  readonly isStub = false;

  #storage: StorageLike;
  #envClientId: string | null;
  #envApiKey: string | null;
  #envProjectNumber: string | null;
  #clientId: string | null = null;
  #apiKey: string | null = null;
  #projectNumber: string | null = null;
  #folderId: string | null = null;
  #folderName: string | null = null;
  #folderUrl: string | null = null;
  #accessToken: string | null = null;
  #tokenExpiresAt = 0;
  #fileIndex = new Map<string, RemoteFile>();

  constructor(storage: StorageLike) {
    this.#storage = storage;
    this.#envClientId = ENV_CLIENT_ID || null;
    this.#envApiKey = ENV_API_KEY || null;
    this.#envProjectNumber = ENV_PROJECT_NUMBER || null;
    this.#clientId = this.#envClientId || storage.getItem(CLIENT_ID_KEY);
    this.#apiKey = this.#envApiKey || storage.getItem(API_KEY_KEY);
    this.#projectNumber =
      this.#envProjectNumber ||
      storage.getItem(PROJECT_NUMBER_KEY) ||
      (this.#clientId ? deriveProjectNumber(this.#clientId) : null);
    this.#folderId = storage.getItem(FOLDER_ID_KEY);
    this.#folderName = storage.getItem(FOLDER_NAME_KEY);
    this.#folderUrl = storage.getItem(FOLDER_URL_KEY);
  }

  isConfigured(): boolean {
    return Boolean(this.#clientId && this.#apiKey && this.#projectNumber && this.#folderId);
  }

  async isAuthenticated(): Promise<boolean> {
    return Boolean(this.isConfigured() && this.#accessToken && Date.now() < this.#tokenExpiresAt);
  }

  async authenticate(input?: SyncProviderAuthInput): Promise<void> {
    const providedClientId = typeof input?.clientId === 'string' ? input.clientId.trim() : '';
    const providedApiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : '';
    const providedProjectNumber = typeof input?.projectNumber === 'string' ? input.projectNumber.trim() : '';
    const changeFolder = Boolean(input?.changeFolder);

    if (providedClientId) {
      this.#clientId = providedClientId;
      this.#storage.setItem(CLIENT_ID_KEY, providedClientId);
    }
    if (providedApiKey) {
      this.#apiKey = providedApiKey;
      this.#storage.setItem(API_KEY_KEY, providedApiKey);
    }
    if (providedProjectNumber) {
      this.#projectNumber = providedProjectNumber;
      this.#storage.setItem(PROJECT_NUMBER_KEY, providedProjectNumber);
    } else if (!this.#projectNumber && this.#clientId) {
      this.#projectNumber = deriveProjectNumber(this.#clientId);
    }

    const clientId = this.#clientId;
    const apiKey = this.#apiKey;
    const projectNumber = this.#projectNumber;

    if (!clientId) throw new Error('Google OAuth client ID required');
    if (!apiKey) throw new Error('Google Picker API key required');
    if (!projectNumber) throw new Error('Google Cloud project number required');

    await Promise.all([loadGoogleIdentityScript(), loadPickerLibrary()]);
    const token = await this.#requestAccessToken(clientId, false)
      .catch(() => this.#requestAccessToken(clientId, true));

    this.#accessToken = token.access_token ?? null;
    this.#tokenExpiresAt = Date.now() + Math.max((token.expires_in ?? 0) - 30, 0) * 1000;

    if (!this.#folderId || changeFolder) {
      const folder = await this.#pickFolder(apiKey, projectNumber, this.#requireToken());
      this.#folderId = folder.id;
      this.#folderName = folder.name;
      this.#folderUrl = folder.url;
      this.#storage.setItem(FOLDER_ID_KEY, folder.id);
      this.#storage.setItem(FOLDER_NAME_KEY, folder.name);
      this.#storage.setItem(FOLDER_URL_KEY, folder.url);
    }
  }

  async disconnect(): Promise<void> {
    if (this.#accessToken) {
      try {
        const oauth2 = (window as GapiWindow).google?.accounts?.oauth2;
        oauth2?.revoke(this.#accessToken);
      } catch {
        // Clear local state even if revoke fails.
      }
    }

    this.#accessToken = null;
    this.#tokenExpiresAt = 0;
    this.#fileIndex.clear();
    this.#clientId = this.#envClientId;
    this.#apiKey = this.#envApiKey;
    this.#projectNumber = this.#envProjectNumber || (this.#clientId ? deriveProjectNumber(this.#clientId) : null);
    this.#folderId = null;
    this.#folderName = null;
    this.#folderUrl = null;
    this.#storage.removeItem(CLIENT_ID_KEY);
    this.#storage.removeItem(API_KEY_KEY);
    this.#storage.removeItem(PROJECT_NUMBER_KEY);
    this.#storage.removeItem(FOLDER_ID_KEY);
    this.#storage.removeItem(FOLDER_NAME_KEY);
    this.#storage.removeItem(FOLDER_URL_KEY);
  }

  async listFiles(): Promise<RemoteFile[]> {
    const folderId = this.#requireFolderId();
    const files: DriveFileResource[] = [];
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,modifiedTime,md5Checksum)',
        pageSize: '1000',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await this.#driveFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
      const payload = await response.json() as {
        files?: DriveFileResource[];
        nextPageToken?: string;
      };
      files.push(...(payload.files ?? []));
      pageToken = payload.nextPageToken ?? '';
    } while (pageToken);

    this.#fileIndex.clear();
    const mapped = files.map((file) => {
      const path = decodeDriveName(file.name);
      const remote: RemoteFile = {
        id: file.id,
        path,
        name: basename(path),
        modifiedTime: toMillis(file.modifiedTime),
        hash: file.md5Checksum ?? null,
        providerId: this.id,
        raw: file,
      };
      this.#fileIndex.set(path, remote);
      return remote;
    });

    return mapped;
  }

  async uploadFile(file: LocalFile): Promise<RemoteFile> {
    const folderId = this.#requireFolderId();
    const existing = this.#fileIndex.get(file.path) ?? null;
    const metadata = existing
      ? { name: encodeDriveName(file.path) }
      : { name: encodeDriveName(file.path), parents: [folderId] };
    const boundary = `tg-sync-${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      '\r\n',
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      file.content,
      '\r\n',
      `--${boundary}--`,
    ], { type: `multipart/related; boundary=${boundary}` });

    const url = existing
      ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id,name,modifiedTime,md5Checksum`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,md5Checksum';
    const response = await this.#driveFetch(url, {
      method: existing ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    const uploaded = await response.json() as DriveFileResource;
    const remote: RemoteFile = {
      id: uploaded.id,
      path: file.path,
      name: basename(file.path),
      modifiedTime: toMillis(uploaded.modifiedTime) ?? file.modifiedTime,
      hash: uploaded.md5Checksum ?? file.hash,
      providerId: this.id,
      raw: uploaded,
    };
    this.#fileIndex.set(file.path, remote);
    return remote;
  }

  async downloadFile(remoteId: string): Promise<LocalFile> {
    const metaResponse = await this.#driveFetch(`https://www.googleapis.com/drive/v3/files/${remoteId}?fields=id,name,modifiedTime,md5Checksum`);
    const meta = await metaResponse.json() as DriveFileResource;
    const dataResponse = await this.#driveFetch(`https://www.googleapis.com/drive/v3/files/${remoteId}?alt=media`);
    const content = await dataResponse.text();
    const path = decodeDriveName(meta.name);
    const local: LocalFile = {
      path,
      name: basename(path),
      content,
      modifiedTime: toMillis(meta.modifiedTime) ?? Date.now(),
      hash: meta.md5Checksum ?? '',
      raw: meta,
    };
    this.#fileIndex.set(path, {
      id: meta.id,
      path,
      name: basename(path),
      modifiedTime: local.modifiedTime,
      hash: meta.md5Checksum ?? null,
      providerId: this.id,
      raw: meta,
    });
    return local;
  }

  async deleteFile(remoteId: string): Promise<void> {
    await this.#driveFetch(`https://www.googleapis.com/drive/v3/files/${remoteId}`, {
      method: 'DELETE',
    });
    for (const [path, file] of this.#fileIndex.entries()) {
      if (file.id === remoteId) this.#fileIndex.delete(path);
    }
  }

  async getConnectionInfo(): Promise<ProviderConnectionInfo> {
    return this.#clientId && this.#folderId
      ? {
          accountLabel: this.#envClientId ? 'App OAuth' : 'Manual OAuth',
          remoteLabel: this.#folderName || 'Chosen Drive folder',
          remoteUrl: this.#folderUrl || `https://drive.google.com/drive/folders/${this.#folderId}`,
        }
      : {};
  }

  async #requestAccessToken(clientId: string, interactive: boolean): Promise<GoogleTokenResponse> {
    const oauth2 = (window as GapiWindow).google?.accounts?.oauth2;
    if (!oauth2) throw new Error('Google Identity Services is unavailable');

    return new Promise<GoogleTokenResponse>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          if (!response.access_token) {
            reject(new Error('Google Drive did not return an access token'));
            return;
          }
          resolve(response);
        },
      });

      client.callback = (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error('Google Drive did not return an access token'));
          return;
        }
        resolve(response);
      };

      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  }

  async #pickFolder(apiKey: string, projectNumber: string, accessToken: string): Promise<FolderSelection> {
    const pickerApi = (window as GapiWindow).google?.picker;
    if (!pickerApi) throw new Error('Google Picker is unavailable');

    return new Promise<FolderSelection>((resolve, reject) => {
      const folderView = new pickerApi.DocsView(pickerApi.ViewId.FOLDERS);
      folderView.setIncludeFolders(true);
      folderView.setSelectFolderEnabled(true);
      folderView.setMimeTypes('application/vnd.google-apps.folder');
      folderView.setMode(pickerApi.DocsViewMode.LIST);

      const builder = new pickerApi.PickerBuilder() as {
        addView: (view: unknown) => void;
        enableFeature: (feature: unknown) => void;
        setOAuthToken: (token: string) => void;
        setDeveloperKey: (key: string) => void;
        setCallback: (callback: (data: Record<string, unknown>) => void) => void;
        setAppId: (appId: string) => void;
        build: () => { setVisible: (visible: boolean) => void };
      };
      builder.addView(folderView);
      builder.enableFeature(pickerApi.Feature.NAV_HIDDEN);
      builder.setOAuthToken(accessToken);
      builder.setDeveloperKey(apiKey);
      builder.setAppId(projectNumber);
      builder.setCallback((data: Record<string, unknown>) => {
          const action = data[pickerApi.Response.ACTION];
          if (action === pickerApi.Action.CANCEL) {
            reject(new Error('Google Drive folder selection was cancelled'));
            return;
          }
          if (action !== pickerApi.Action.PICKED) return;

          const docs = data[pickerApi.Response.DOCUMENTS];
          if (!Array.isArray(docs) || docs.length === 0) {
            reject(new Error('No Google Drive folder was selected'));
            return;
          }

          const folder = docs[0] as Record<string, unknown>;
          const id = typeof folder[pickerApi.Document.ID] === 'string' ? folder[pickerApi.Document.ID] as string : '';
          const name = typeof folder[pickerApi.Document.NAME] === 'string' ? folder[pickerApi.Document.NAME] as string : 'Drive Folder';
          const url = typeof folder[pickerApi.Document.URL] === 'string'
            ? folder[pickerApi.Document.URL] as string
            : `https://drive.google.com/drive/folders/${id}`;

          if (!id) {
            reject(new Error('Selected Google Drive folder is missing an ID'));
            return;
          }

          resolve({ id, name, url });
        });
      const picker = builder.build();
      picker.setVisible(true);
    });
  }

  #requireToken(): string {
    if (!this.#accessToken || Date.now() >= this.#tokenExpiresAt) {
      throw new Error('Google Drive needs to be reconnected');
    }
    return this.#accessToken;
  }

  #requireFolderId(): string {
    if (!this.#folderId) throw new Error('Google Drive backup folder is not configured');
    return this.#folderId;
  }

  async #driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const token = this.#requireToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers });
    if (!response.ok) throw await parseDriveError(response);
    return response;
  }
}
