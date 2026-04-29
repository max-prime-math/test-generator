// Google Drive API client for one-way exports (sharing only, not syncing back)
// Uses Google's client library (gapi.client.drive)

export interface GoogleAuthState {
  isSignedIn: boolean;
  userEmail: string | null;
}

let _authState = {
  isSignedIn: false,
  userEmail: null as string | null,
};

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// ── Initialization ───────────────────────────────────────────────────────────

/** Initialize Google API client. Must be called once on app startup. */
export async function initializeGoogleDrive(): Promise<void> {
  if (!CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID not set in .env');
  }

  return new Promise((resolve, reject) => {
    // Load gapi library
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      gapi.load('client:auth2', async () => {
        try {
          await gapi.client.init({
            clientId: CLIENT_ID,
            scope: SCOPES,
            discoveryDocs: [
              'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
            ],
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    };
    script.onerror = () => reject(new Error('Failed to load Google API'));
    document.head.appendChild(script);
  });
}

// ── Authentication ───────────────────────────────────────────────────────────

/** Sign in with Google. Opens consent screen if needed. */
export async function signInWithGoogle(): Promise<GoogleAuthState> {
  try {
    const auth2 = gapi.auth2.getAuthInstance();
    if (!auth2) throw new Error('Auth not initialized');

    const user = await auth2.signIn();
    const profile = user.getBasicProfile();

    _authState = {
      isSignedIn: true,
      userEmail: profile.getEmail(),
    };

    return _authState;
  } catch (error) {
    throw new Error(`Google Sign-In failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/** Sign out from Google. */
export async function signOutFromGoogle(): Promise<void> {
  try {
    const auth2 = gapi.auth2.getAuthInstance();
    if (auth2) {
      await auth2.signOut();
    }
    _authState = { isSignedIn: false, userEmail: null };
  } catch (error) {
    console.error('Sign out failed:', error);
  }
}

/** Get current auth state. */
export function getGoogleAuthState(): GoogleAuthState {
  return _authState;
}

// ── Drive operations ────────────────────────────────────────────────────────

/** Create or update a file on Google Drive.
 *  If file exists (by name), update it. Otherwise create new.
 *  File is created in the user's "My Drive" (not shared yet).
 */
export async function createOrUpdateDriveFile(
  filename: string,
  content: string,
): Promise<{ fileId: string; webViewLink: string }> {
  try {
    // First, check if file with this name already exists
    const existingFiles = await gapi.client.drive.files.list({
      q: `name="${filename}" and trashed=false and mimeType="application/json"`,
      spaces: 'drive',
      fields: 'files(id, webViewLink)',
      pageSize: 1,
    });

    if (existingFiles.result.files && existingFiles.result.files.length > 0) {
      // Update existing file
      const fileId = existingFiles.result.files[0].id;
      const blob = new Blob([content], { type: 'application/json' });
      const file = new File([blob], filename, { type: 'application/json' });

      const response = await gapi.client.drive.files.update(
        {
          fileId,
          uploadType: 'multipart',
        },
        file,
      );

      return {
        fileId: response.result.id,
        webViewLink: response.result.webViewLink,
      };
    } else {
      // Create new file
      const blob = new Blob([content], { type: 'application/json' });
      const file = new File([blob], filename, { type: 'application/json' });

      const response = await gapi.client.drive.files.create(
        {
          resource: {
            name: filename,
            mimeType: 'application/json',
          },
          uploadType: 'multipart',
          fields: 'id, webViewLink',
        },
        file,
      );

      return {
        fileId: response.result.id,
        webViewLink: response.result.webViewLink,
      };
    }
  } catch (error) {
    throw new Error(`Drive upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/** Share a Drive file with an email address.
 *  Gives the email read access. */
export async function shareDriveFileWithEmail(
  fileId: string,
  emailAddress: string,
): Promise<void> {
  try {
    await gapi.client.drive.permissions.create({
      fileId,
      sendNotificationEmail: true,
      resource: {
        type: 'user',
        role: 'reader',
        emailAddress,
      },
    });
  } catch (error) {
    throw new Error(`Share failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/** Get a shareable link for a file (assumes it's already shared with "anyone with link"). */
export async function getShareableLinkForFile(fileId: string): Promise<string> {
  try {
    // First make it "anyone with link" readable
    await gapi.client.drive.permissions.create({
      fileId,
      resource: {
        type: 'anyone',
        role: 'reader',
      },
    });

    // Get the file to get its webViewLink
    const response = await gapi.client.drive.files.get({
      fileId,
      fields: 'webViewLink',
    });

    return response.result.webViewLink;
  } catch (error) {
    // If permission already exists, just return the link
    try {
      const response = await gapi.client.drive.files.get({
        fileId,
        fields: 'webViewLink',
      });
      return response.result.webViewLink;
    } catch {
      throw new Error(`Get link failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
