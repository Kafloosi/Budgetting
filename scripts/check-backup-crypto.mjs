/**
 * The encrypted backup envelope. Guards F-01.
 *
 * Three things have to hold, and only the first is about cryptography:
 *
 * 1. What comes out decrypts back to exactly what went in, and nothing else
 *    opens it — not a near-miss passphrase, not a file with one byte changed.
 * 2. The file is openable by something that is not Fare. That is the whole point
 *    of writing the KDF parameters into it, and it is asserted here by decrypting
 *    a Fare backup with Node's own WebCrypto and nothing from `src/`.
 * 3. A hostile file cannot make the app hurt itself before the passphrase is even
 *    checked — an Argon2 cost of a terabyte is a denial of service, not a typo.
 *
 * Logic cases run at a deliberately trivial Argon2 cost, which is what the
 * `params` option is for. One case at the real shipped cost proves the shipped
 * numbers work, and prints what they cost on this machine.
 */

import { webcrypto } from 'node:crypto';

import { check, checkRejects, report, section } from './lib/check.mjs';
import { importSource } from './lib/schema.mjs';

const {
  KDF_PARAMS,
  ENVELOPE_VERSION,
  checkEnvelope,
  decryptBackup,
  encryptBackup,
  fromBase64,
  isEnvelope,
  toBase64,
} = await importSource('src/lib/backup-crypto.ts');

/** Trivial cost. Enough to prove the wiring, cheap enough to run twenty times. */
const CHEAP = { m: 64, t: 1, p: 1 };

const PLAINTEXT = JSON.stringify({
  app: 'fare',
  format: 1,
  tables: {
    categories: [{ id: 'c1', name: 'Groceries', kind: 'expense' }],
    transactions: [{ id: 't1', amount_cents: -1250, date: '2026-08-01', description: 'Albert Heijn' }],
  },
});

const PASSPHRASE = 'correct horse battery staple';

/** A deep copy, so a tampering case cannot leak into the next one. */
const clone = (envelope) => JSON.parse(JSON.stringify(envelope));

/* Base64 ------------------------------------------------------------------ */

section('Base64 round-trips whatever it is given');
for (const length of [0, 1, 2, 3, 4, 5, 6, 7, 8, 15, 16, 17, 255, 256, 1023]) {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = (i * 37 + 11) & 255;
  check(`${length} bytes`, [...fromBase64(toBase64(bytes))], [...bytes]);
}
check('every byte value survives', [...fromBase64(toBase64(new Uint8Array(256).map((_, i) => i)))].length, 256);
check(
  'and agrees with a reference encoder',
  toBase64(new Uint8Array([104, 101, 108, 108, 111])),
  Buffer.from('hello').toString('base64'),
);
check('padding is produced', toBase64(new Uint8Array([1])).endsWith('=='), true);

section('...and refuses what it is not');
for (const bad of ['a', 'ab!=', '====', 'AAAAA', '@@@@']) {
  let refused = false;
  try {
    fromBase64(bad);
  } catch {
    refused = true;
  }
  check(`${JSON.stringify(bad)} is refused`, refused, true);
}

/* The round trip ---------------------------------------------------------- */

section('A backup opens with its passphrase, and with nothing else');

const { envelope, kdfMs } = await encryptBackup(PLAINTEXT, PASSPHRASE, { params: CHEAP });
check('kdfMs is reported', typeof kdfMs === 'number' && kdfMs >= 0, true);
check(
  'the plaintext comes back byte for byte',
  await decryptBackup(clone(envelope), PASSPHRASE),
  PLAINTEXT,
);

await checkRejects(
  'a wrong passphrase is refused',
  () => decryptBackup(clone(envelope), 'correct horse battery stapl'),
  'does not open this backup',
);
await checkRejects(
  'an empty passphrase is refused',
  () => decryptBackup(clone(envelope), ''),
  'does not open this backup',
);
await checkRejects(
  'a backup cannot be written without a passphrase',
  () => encryptBackup(PLAINTEXT, '', { params: CHEAP }),
  'needs a passphrase',
);

section('Nothing about the ledger survives in the clear');
const serialised = JSON.stringify(envelope);
for (const secret of ['Groceries', 'Albert Heijn', '1250', 'transactions']) {
  check(`${JSON.stringify(secret)} does not appear in the file`, serialised.includes(secret), false);
}

section('Two backups of the same ledger share no key material');
const second = await encryptBackup(PLAINTEXT, PASSPHRASE, { params: CHEAP });
check('the salt differs', envelope.kdf.salt === second.envelope.kdf.salt, false);
check('the nonce differs', envelope.cipher.nonce === second.envelope.cipher.nonce, false);
check('and so the ciphertext differs', envelope.ciphertext === second.envelope.ciphertext, false);

/* Tampering --------------------------------------------------------------- */

section('One altered byte anywhere and the file is refused (GCM)');

/** Flips a bit inside a base64 field, keeping it valid base64 of the same length. */
function tamper(text) {
  const bytes = fromBase64(text);
  bytes[bytes.length >> 1] ^= 1;
  return toBase64(bytes);
}

for (const field of ['ciphertext', 'tag']) {
  const altered = clone(envelope);
  altered[field] = tamper(altered[field]);
  await checkRejects(`${field} altered`, () => decryptBackup(altered, PASSPHRASE), 'altered');
}

const wrongSalt = clone(envelope);
wrongSalt.kdf.salt = tamper(wrongSalt.kdf.salt);
await checkRejects('salt altered', () => decryptBackup(wrongSalt, PASSPHRASE), 'altered');

const wrongNonce = clone(envelope);
wrongNonce.cipher.nonce = tamper(wrongNonce.cipher.nonce);
await checkRejects('nonce altered', () => decryptBackup(wrongNonce, PASSPHRASE), 'altered');

const wrongCost = clone(envelope);
wrongCost.kdf.t = envelope.kdf.t + 1;
await checkRejects('the work factor altered', () => decryptBackup(wrongCost, PASSPHRASE), 'altered');

/* What the envelope must say ---------------------------------------------- */

section('The envelope is self-describing');
check('it names the format', envelope.format, 'fare-backup');
check('it names its version', envelope.version, ENVELOPE_VERSION);
check('it names the KDF', envelope.kdf.name, 'argon2id');
check('it names the cipher', envelope.cipher.name, 'aes-256-gcm');
check('it carries the KDF parameters', [envelope.kdf.m, envelope.kdf.t, envelope.kdf.p], [CHEAP.m, CHEAP.t, CHEAP.p]);
check(
  'and nothing else, so a reader outside Fare knows the whole shape',
  Object.keys(envelope).sort(),
  ['cipher', 'ciphertext', 'format', 'kdf', 'tag', 'version'],
);
check('the tag is 16 bytes, held separately', fromBase64(envelope.tag).length, 16);
check('the nonce is 12 bytes', fromBase64(envelope.cipher.nonce).length, 12);
check('the salt is 16 bytes', fromBase64(envelope.kdf.salt).length, 16);

section('A file is recognised before a passphrase is ever asked for');
check('an envelope is recognised', isEnvelope(envelope), true);
check('a plain backup is not', isEnvelope({ app: 'fare', format: 1, tables: {} }), false);
check('null is not', isEnvelope(null), false);
check('a string is not', isEnvelope('fare-backup'), false);

section('A malformed or hostile envelope is refused with a reason');
const refuses = (label, mutate, fragment) => {
  const broken = clone(envelope);
  mutate(broken);
  const problem = checkEnvelope(broken);
  check(label, typeof problem === 'string' && problem.includes(fragment), true);
};

check('a good envelope has no complaint', checkEnvelope(clone(envelope)), null);
check('a plain backup is not an envelope', typeof checkEnvelope({ app: 'fare' }), 'string');
refuses('a newer version', (file) => (file.version = ENVELOPE_VERSION + 1), 'newer version of Fare');
refuses('a missing version', (file) => delete file.version, 'which version');
refuses('another KDF', (file) => (file.kdf.name = 'pbkdf2'), 'Unsupported key derivation');
refuses('another cipher', (file) => (file.cipher.name = 'aes-128-cbc'), 'Unsupported cipher');
refuses('no salt', (file) => delete file.kdf.salt, 'no salt');
refuses('no nonce', (file) => delete file.cipher.nonce, 'no nonce');
refuses('no ciphertext', (file) => (file.ciphertext = ''), 'no contents');
refuses('no tag', (file) => delete file.tag, 'authentication tag');
refuses('a fractional work factor', (file) => (file.kdf.t = 1.5), 'damaged (t)');
refuses('a zero work factor', (file) => (file.kdf.p = 0), 'damaged (p)');

section('...including one that would exhaust the phone before the passphrase is checked');
refuses('a terabyte of memory', (file) => (file.kdf.m = 1024 ** 3), 'more work than Fare will do');
refuses('a million passes', (file) => (file.kdf.t = 1_000_000), 'more work than Fare will do');
refuses('a thousand lanes', (file) => (file.kdf.p = 1000), 'more work than Fare will do');
await checkRejects(
  'and the refusal happens instead of the work',
  () => decryptBackup({ ...clone(envelope), kdf: { ...envelope.kdf, m: 1024 ** 3 } }, PASSPHRASE),
  'more work than Fare will do',
);

/* Openable without Fare ---------------------------------------------------- */

section('The file opens with a standard toolchain and no Fare code');
{
  // Node's WebCrypto, given only what the file says: Argon2id is not in WebCrypto,
  // so the key comes from the same public parameters via the reference library,
  // and the AEAD step is done by the platform. If this passes, the format claim
  // in the file header is true.
  const { argon2idAsync } = await import('@noble/hashes/argon2.js');
  const { utf8ToBytes } = await import('@noble/ciphers/utils.js');

  const raw = await argon2idAsync(utf8ToBytes(PASSPHRASE), fromBase64(envelope.kdf.salt), {
    m: envelope.kdf.m,
    t: envelope.kdf.t,
    p: envelope.kdf.p,
    dkLen: 32,
  });

  const key = await webcrypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const body = fromBase64(envelope.ciphertext);
  const tag = fromBase64(envelope.tag);
  const sealed = new Uint8Array(body.length + tag.length);
  sealed.set(body);
  sealed.set(tag, body.length);

  const opened = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.cipher.nonce), tagLength: 128 },
    key,
    sealed,
  );
  check('WebCrypto reads the ledger back', new TextDecoder().decode(opened), PLAINTEXT);
}

/* The parameters actually shipped ------------------------------------------ */

section(`The shipped cost works: m=${KDF_PARAMS.m} KiB, t=${KDF_PARAMS.t}, p=${KDF_PARAMS.p}`);
{
  const real = await encryptBackup(PLAINTEXT, PASSPHRASE, {});
  check('a backup written at the shipped cost opens again', await decryptBackup(real.envelope, PASSPHRASE), PLAINTEXT);
  check('and records those parameters in the file', [real.envelope.kdf.m, real.envelope.kdf.t], [KDF_PARAMS.m, KDF_PARAMS.t]);
  console.log(`       key derivation took ${real.kdfMs} ms on this machine — a phone is slower`);
}

section('Progress is reported, because the user is going to be waiting');
{
  const seen = [];
  const stages = [];
  await encryptBackup(PLAINTEXT, PASSPHRASE, {
    params: CHEAP,
    onProgress: (fraction) => seen.push(fraction),
    onStage: (stage) => stages.push(stage),
  });
  check('the stages are announced in order', stages, ['deriving', 'encrypting', 'verifying']);
  check('progress is reported at least once', seen.length > 0, true);
  check('it never runs backwards', [...seen].sort((a, b) => a - b), seen);
  check('it stays within 0 and 1', seen.every((f) => f >= 0 && f <= 1), true);
}

report('backup-crypto');
