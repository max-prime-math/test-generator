// All functions are pure async with no side effects. No module state. Uses WebCrypto API.

// ── Key derivation ───────────────────────────────────────────────────────────

/** Derive a KEK (Key Encryption Key) from a password + salt using PBKDF2.
 *  Returns a non-extractable AES-GCM CryptoKey suitable for wrapKey/unwrapKey. */
export async function deriveKEK(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 200000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable
    ['wrapKey', 'unwrapKey'],
  );
}

/** Derive verification bytes from a password + salt.
 *  Uses the password + '\x00verify' suffix to ensure the output is
 *  computationally independent from the KEK derivation.
 *  Returns 32 bytes as base64 string for storage. */
export async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
): Promise<string> {
  // Append a suffix to the password to derive independent key material
  const hashPassword = password + '\x00verify';
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(hashPassword) as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const hashBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 200000,
      hash: 'SHA-256',
    },
    passwordKey,
    256, // 32 bytes
  );

  return toBase64(new Uint8Array(hashBits));
}

/** Verify a password against a stored hash. */
export async function verifyPassword(
  password: string,
  salt: Uint8Array,
  storedHash: string,
): Promise<boolean> {
  const computed = await derivePasswordHash(password, salt);
  return computed === storedHash;
}

/** Generate a random 16-byte salt. */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** Generate a random 12-byte AES-GCM IV. */
export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

// ── DEK management — use wrapKey/unwrapKey ──────────────────────────────────

/** Generate a new random 256-bit AES-GCM DEK (extractable for wrapping). */
export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — required for wrapKey
    ['encrypt', 'decrypt'],
  );
}

/** Wrap a DEK with a KEK using AES-GCM.
 *  Returns {encryptedDEK, dekIv} both base64. */
export async function wrapDEK(
  dek: CryptoKey,
  kek: CryptoKey,
): Promise<{ encryptedDEK: string; dekIv: string }> {
  const iv = generateIV();
  const wrapped = await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv: iv as BufferSource });
  return {
    encryptedDEK: toBase64(new Uint8Array(wrapped)),
    dekIv: toBase64(iv),
  };
}

/** Unwrap a DEK using a KEK. Returns the DEK as a CryptoKey. */
export async function unwrapDEK(
  encryptedDEK: string, // base64
  dekIv: string,        // base64
  kek: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    fromBase64(encryptedDEK) as BufferSource,
    kek,
    { name: 'AES-GCM', iv: fromBase64(dekIv) as BufferSource },
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt'],
  );
}

// ── Data encryption ──────────────────────────────────────────────────────────

/** Encrypt a JSON-serializable payload with the DEK using AES-GCM.
 *  Returns {iv, ciphertext} both base64.
 *  CRITICAL: Every call generates a fresh IV — never reuse an IV with the same key. */
export async function encryptData(
  plaintext: string,
  dek: CryptoKey,
): Promise<{ iv: string; ciphertext: string }> {
  const iv = generateIV();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dek,
    new TextEncoder().encode(plaintext),
  );
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Decrypt base64 ciphertext with the DEK. Returns original string. */
export async function decryptData(
  ciphertext: string, // base64
  iv: string,         // base64
  dek: CryptoKey,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) as BufferSource },
    dek,
    fromBase64(ciphertext) as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}

// ── Token encryption (uses KEK directly, not DEK) ────────────────────────────

/** Encrypt a GitHub PAT with the user's KEK.
 *  CRITICAL: Every call generates a fresh IV. */
export async function encryptToken(
  token: string,
  kek: CryptoKey,
): Promise<{ iv: string; ciphertext: string }> {
  const iv = generateIV();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    kek,
    new TextEncoder().encode(token),
  );
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Decrypt a stored token with the user's KEK. */
export async function decryptToken(
  ciphertext: string,
  iv: string,
  kek: CryptoKey,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) as BufferSource },
    kek,
    fromBase64(ciphertext) as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}

// ── Encoding utilities ───────────────────────────────────────────────────────

/** Convert bytes to base64. Uses chunked approach to avoid stack overflow on large inputs. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode(...Array.from(slice));
  }
  return btoa(binary);
}

/** Convert base64 string to bytes. */
export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
