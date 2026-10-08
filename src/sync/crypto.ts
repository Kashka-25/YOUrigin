// End-to-end encryption for sync. The passphrase never leaves the device and
// the derived key is non-extractable; the server only ever sees ciphertext.

const PBKDF2_ITERATIONS = 600_000;
const VERIFIER_TEXT = 'yourigin-sync-v1';

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFKC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface Sealed {
  payload: string;
  iv: string;
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = randomBytes(12);
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { payload: toBase64(new Uint8Array(ct)), iv: toBase64(iv) };
}

export async function open<T = unknown>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.payload));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

export interface KeyInfo {
  salt: string;
  verifier: string;
  verifier_iv: string;
}

/** First device: create a fresh salt and a verifier that later devices use to check the passphrase. */
export async function createKeyInfo(passphrase: string): Promise<{ key: CryptoKey; info: KeyInfo }> {
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt);
  const v = await seal(key, VERIFIER_TEXT);
  return { key, info: { salt: toBase64(salt), verifier: v.payload, verifier_iv: v.iv } };
}

/** Other devices: derive the key and confirm the passphrase is right. Returns null if it is wrong. */
export async function unlockWithPassphrase(passphrase: string, info: KeyInfo): Promise<CryptoKey | null> {
  const key = await deriveKey(passphrase, fromBase64(info.salt));
  try {
    const text = await open<string>(key, { payload: info.verifier, iv: info.verifier_iv });
    return text === VERIFIER_TEXT ? key : null;
  } catch {
    return null;
  }
}
