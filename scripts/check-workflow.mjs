/**
 * The release workflow. Guards F-07.
 *
 * This workflow holds the four Android signing secrets, and losing that keystore ends
 * the app's upgrade path for every user — no update can install over an existing Fare,
 * and uninstalling deletes the ledger. So the rules about what runs inside it are
 * worth enforcing rather than remembering.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { check, report, section } from './lib/check.mjs';
import { ROOT } from './lib/schema.mjs';

// Normalised because git may hand this file back with CRLF, which would otherwise
// defeat every anchored pattern below — as it did on the first run of this check.
const text = readFileSync(join(ROOT, '.github/workflows/android.yml'), 'utf8').replace(/\r\n/g, '\n');

section('Every action is pinned to a commit, not a tag');
const refs = [...text.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
check('the workflow uses some actions', refs.length > 0, true);
for (const ref of refs) {
  check(`${ref.split('@')[0]} is pinned`, /@[0-9a-f]{40}$/.test(ref), true);
}
check(
  'and each records the version it corresponds to',
  refs.every((ref) => new RegExp(`${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*#\\s*v`).test(text)),
  true,
);

section('The default token is read-only');
check(
  'top-level permissions is contents: read',
  /^permissions:\n {2}contents: read$/m.test(text),
  true,
);
check(
  'write is granted to the release job only',
  (text.match(/contents: write/g) ?? []).length,
  1,
);
check(
  'and that job runs no repository code — it only downloads and publishes',
  / {2}release:[\s\S]*?steps:([\s\S]*)$/.test(text) &&
    !/ {2}release:[\s\S]*?(npm |gradlew|prebuild)/.test(text),
  true,
);

section('No secret reaches a shell where a trace could echo it');
const runBlocks = [...text.matchAll(/run: \|([\s\S]*?)(?=\n {6}[-a-z]|\n {4}[-a-z]|$)/g)].map(
  (match) => match[1],
);
check('there are run blocks to check', runBlocks.length > 0, true);
check(
  'none interpolates a secret directly',
  runBlocks.filter((block) => /\$\{\{\s*secrets\./.test(block)).length,
  0,
);

section('The checkout does not leave a token behind');
check('persist-credentials: false', /persist-credentials: false/.test(text), true);

section('Structure');
check('no tabs', text.includes('\t'), false);
check('publishing is gated on a tag', /if: startsWith\(github\.ref, 'refs\/tags\/v'\)/.test(text), true);

report('workflow');
