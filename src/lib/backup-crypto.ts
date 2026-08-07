/**
 * The encrypted backup envelope.
 *
 * A backup is the whole ledger in its most portable form, and it lands in a
 * downloads folder a dozen other apps can read. Encrypted is therefore the
 * default and plaintext is the deliberate exception, which is the opposite of
 * how this used to work.
 *
 * Nothing here touches SQLite, the filesystem or any Expo module, so the format
 * can be checked on Node alone — see `scripts/check-backup-crypto.mjs`. The
 * caller supplies the plaintext and, on a device, the random bytes.
 *
 * The envelope is self-describing on purpose. A user locked out of their own
 * data by an app that stopped working is a worse outcome than the one this
 * protects against, so the file names its KDF, its parameters and its cipher,
 * and any competent tool can open it without Fare:
 *
 *   argon2id(passphrase, salt, m, t, p) -> 32-byte key
 *   aes-256-gcm(key, nonce) over the UTF-8 JSON, tag stored separately
 *
 * Keeping the parameters in the file rather than in this source is what lets a
 * future version raise them without stranding an old backup.
 */

import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { randomBytes } from '@noble/hashes/utils.js';

export const ENVELOPE_FORMAT = 'fare-backup';

/** Bump when the envelope changes in a way an older reader cannot handle. */
export const ENVELOPE_VERSION = 1;

/**
 * Argon2id's cost, as §4.3 specifies: 64 MiB, three passes, one lane.
 *
 * Pure JS, so this is seconds rather than milliseconds on a phone — which is
 * what a password KDF is for, and why the export reports a percentage rather
 * than spinning. `encryptBackup` returns how long it actually took, so the
 * number can be measured on a real device instead of guessed at.
 */
export const KDF_PARAMS = { m: 65536, t: 3, p: 1 } as const;

const KEY_BYTES = 32;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface Envelope {
  format: typeof ENVELOPE_FORMAT;
  version: number;
  kdf: { name: 'argon2id'; salt: string; m: number; t: number; p: number };
  cipher: { name: 'aes-256-gcm'; nonce: string };
  ciphertext: string;
  tag: string;
}

/** What the caller is waiting on. Only the KDF stage reports a fraction. */
export type Stage = 'deriving' | 'encrypting' | 'verifying' | 'decrypting';

export interface CryptoOptions {
  /** Awaited between steps, so a UI can paint its label before the next one starts. */
  onStage?: (stage: Stage) => void | Promise<void>;
  /** Key derivation progress, 0 to 1. Argon2id yields to the thread as it runs. */
  onProgress?: (fraction: number) => void;
  /** Overridden on a device with `expo-crypto`, which knows the platform CSPRNG. */
  random?: (length: number) => Uint8Array;
  /**
   * Cost to write a new backup at, defaulting to `KDF_PARAMS`.
   *
   * This is the mechanism the format exists for: a future version raises the
   * cost here and every old backup still opens, because a restore reads the
   * parameters out of the file rather than from this source. The checks use it
   * to run their logic cases in milliseconds instead of seconds.
   */
  params?: { m: number; t: number; p: number };
}

export interface EncryptResult {
  envelope: Envelope;
  /** Milliseconds spent in Argon2id, for the dev-build readout. */
  kdfMs: number;
}

/* Base64 ------------------------------------------------------------------ */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Written out rather than taken from a dependency because neither runtime
 * agrees on one: `btoa` is browser-only, `Buffer` is Node-only, and the envelope
 * has to round-trip identically in Hermes and in a check script.
 */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : ALPHABET[c & 63];
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    throw new Error('That file is damaged — part of it is not valid base64.');
  }

  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((clean.length / 4) * 3 - padding);

  let at = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const chunk =
      (ALPHABET.indexOf(clean[i]) << 18) |
      (ALPHABET.indexOf(clean[i + 1]) << 12) |
      ((clean[i + 2] === '=' ? 0 : ALPHABET.indexOf(clean[i + 2])) << 6) |
      (clean[i + 3] === '=' ? 0 : ALPHABET.indexOf(clean[i + 3]));

    if (at < out.length) out[at++] = (chunk >> 16) & 255;
    if (at < out.length) out[at++] = (chunk >> 8) & 255;
    if (at < out.length) out[at++] = chunk & 255;
  }
  return out;
}

/* Envelope ---------------------------------------------------------------- */

/**
 * Is this file an encrypted backup?
 *
 * Deliberately shallow. Restore uses it to decide whether to ask for a
 * passphrase, and a damaged encrypted file has to reach `checkEnvelope`'s
 * specific complaint rather than be mistaken for a plain backup and refused for
 * the wrong reason.
 */
export function isEnvelope(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { format?: unknown }).format === ENVELOPE_FORMAT
  );
}

/** The problem with this envelope, or null. Runs before a passphrase is asked for. */
export function checkEnvelope(value: unknown): string | null {
  if (!isEnvelope(value)) return 'That file is not a Fare backup.';
  const file = value as Partial<Envelope>;

  if (typeof file.version !== 'number' || !Number.isInteger(file.version)) {
    return 'That backup does not say which version it is.';
  }
  if (file.version > ENVELOPE_VERSION) {
    return `That backup was written by a newer version of Fare (version ${file.version}). Update the app and try again.`;
  }

  const kdf = file.kdf;
  if (!kdf || typeof kdf !== 'object') return 'That backup does not say how its key was made.';
  if (kdf.name !== 'argon2id') return `Unsupported key derivation: ${String(kdf.name)}.`;
  if (typeof kdf.salt !== 'string' || kdf.salt.length === 0) return 'That backup has no salt.';
  for (const [name, cost] of [
    ['m', kdf.m],
    ['t', kdf.t],
    ['p', kdf.p],
  ] as const) {
    if (typeof cost !== 'number' || !Number.isInteger(cost) || cost < 1) {
      return `That backup's key settings are damaged (${name}).`;
    }
  }
  // A crafted file could otherwise ask for a terabyte of memory and take the app
  // down before the passphrase is even wrong.
  if (kdf.m > 1048576 || kdf.t > 64 || kdf.p > 16) {
    return 'That backup asks for more work than Fare will do. It may have been tampered with.';
  }

  const cipher = file.cipher;
  if (!cipher || typeof cipher !== 'object') return 'That backup does not say how it was encrypted.';
  if (cipher.name !== 'aes-256-gcm') return `Unsupported cipher: ${String(cipher.name)}.`;
  if (typeof cipher.nonce !== 'string' || cipher.nonce.length === 0) {
    return 'That backup has no nonce.';
  }

  if (typeof file.ciphertext !== 'string' || file.ciphertext.length === 0) {
    return 'That backup has no contents.';
  }
  if (typeof file.tag !== 'string' || file.tag.length === 0) {
    return 'That backup has no authentication tag.';
  }
  return null;
}

/* Encrypt and decrypt ----------------------------------------------------- */

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  params: { m: number; t: number; p: number },
  options: CryptoOptions | undefined,
): Promise<Uint8Array> {
  await options?.onStage?.('deriving');
  // The async variant yields to the thread as it works, which is the only reason
  // a progress bar is possible at all: the sync one holds the thread for the
  // whole derivation and the UI never repaints.
  return argon2idAsync(utf8ToBytes(passphrase), salt, {
    m: params.m,
    t: params.t,
    p: params.p,
    dkLen: KEY_BYTES,
    onProgress: options?.onProgress,
  });
}

/**
 * Encrypts, then decrypts what it just produced before returning.
 *
 * The verify pass is not doubt about the cipher — it is about the twenty lines
 * around it. A backup that cannot be restored is worse than no backup, because
 * the user stops making real ones.
 */
export async function encryptBackup(
  plaintext: string,
  passphrase: string,
  options?: CryptoOptions,
): Promise<EncryptResult> {
  if (passphrase.length === 0) throw new Error('A backup needs a passphrase.');

  const random = options?.random ?? randomBytes;
  const params = options?.params ?? KDF_PARAMS;
  const salt = random(SALT_BYTES);
  const nonce = random(NONCE_BYTES);

  const startedAt = Date.now();
  const key = await deriveKey(passphrase, salt, params, options);
  const kdfMs = Date.now() - startedAt;

  await options?.onStage?.('encrypting');
  // GCM appends its tag to the ciphertext. Split it back out, because the format
  // documents them as separate fields and a reader outside Fare follows the
  // format, not this implementation.
  const sealed = gcm(key, nonce).encrypt(utf8ToBytes(plaintext));
  const body = sealed.subarray(0, sealed.length - TAG_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);

  const envelope: Envelope = {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    kdf: { name: 'argon2id', salt: toBase64(salt), m: params.m, t: params.t, p: params.p },
    cipher: { name: 'aes-256-gcm', nonce: toBase64(nonce) },
    ciphertext: toBase64(body),
    tag: toBase64(tag),
  };

  await options?.onStage?.('verifying');
  // Round-tripped through JSON so the check covers serialisation too: this is
  // the exact text that will be written to the file.
  const readBack = openEnvelope(JSON.parse(JSON.stringify(envelope)) as Envelope, key);
  if (readBack !== plaintext) {
    throw new Error('The backup could not be read back after writing. Nothing was saved.');
  }

  return { envelope, kdfMs };
}

/** Opens an envelope with a key already derived. Shared by the verify pass and restore. */
function openEnvelope(envelope: Envelope, key: Uint8Array): string {
  const nonce = fromBase64(envelope.cipher.nonce);
  const body = fromBase64(envelope.ciphertext);
  const tag = fromBase64(envelope.tag);

  const sealed = new Uint8Array(body.length + tag.length);
  sealed.set(body);
  sealed.set(tag, body.length);

  try {
    return bytesToUtf8(gcm(key, nonce).decrypt(sealed));
  } catch {
    // GCM refuses to say which it was, and that is correct: a wrong passphrase
    // and an altered file are indistinguishable to it, and so to us.
    throw new Error(
      'That passphrase does not open this backup — or the file has been altered since it was made.',
    );
  }
}

export async function decryptBackup(
  value: unknown,
  passphrase: string,
  options?: CryptoOptions,
): Promise<string> {
  const problem = checkEnvelope(value);
  if (problem) throw new Error(problem);
  const envelope = value as Envelope;

  const key = await deriveKey(passphrase, fromBase64(envelope.kdf.salt), envelope.kdf, options);

  await options?.onStage?.('decrypting');
  return openEnvelope(envelope, key);
}
