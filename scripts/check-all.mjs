/**
 * Every check, in one run. `npm run check`.
 *
 * Not a test runner and not trying to be one. These guard the rules that are cheap
 * to break and expensive to notice — money arithmetic, import dedupe, the schema,
 * and the aggregates a transfer must not touch — and they run on Node with no
 * dependency, which is why they exist at all.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const CHECKS = [
  'check-migrations.mjs',
  'check-money.mjs',
  'check-fingerprint.mjs',
  'check-ledger.mjs',
  'check-backup.mjs',
];

let failed = 0;

for (const check of CHECKS) {
  console.log(`\n${'─'.repeat(60)}\n${check}\n${'─'.repeat(60)}`);
  const result = spawnSync(process.execPath, [join(HERE, check)], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}

console.log(`\n${'═'.repeat(60)}`);
if (failed > 0) {
  console.error(`${failed} of ${CHECKS.length} check files FAILED`);
  process.exit(1);
}
console.log(`all ${CHECKS.length} check files passed`);
