/**
 * A statement, turned into rows the ledger will accept.
 *
 * Lifted out of the import screen so the automatic path and the manual one run
 * the same code. There is one rule about which rows count as the same
 * transaction, and a second copy of it is the last thing this repo needs.
 *
 * The digest and the rule matcher arrive as arguments rather than as imports.
 * Both reach for something native — `expo-crypto` and the database — and this
 * file is checked on Node, where neither exists. It is the same division as
 * `lib/fingerprint.ts` against `db/hash.ts`, for the same reason.
 */

import type { TransactionInput } from '@/db/repositories/transactions';
import { toDraft, type Draft, type Mapping } from '@/lib/csv';
import { assignOrdinals } from '@/lib/fingerprint';

/** `db/hash.ts`'s `importHash`, passed in. */
export type HashFn = (
  date: string,
  amountCents: number,
  description: string,
  nth: number,
) => Promise<string>;

/** `loadRuleMatcher`'s return, passed in. */
export type MatchFn = (description: string) => string | null;

export interface BuiltImport {
  /** Rows ready for `bulkInsertImported`, in the file's own order. */
  inputs: TransactionInput[];
  /**
   * How many rows the mapping could not read.
   *
   * The screen could count these from its own preview; an automatic import has
   * no preview, and dropping rows out of a file nobody looked at is the failure
   * worth refusing to make silent.
   */
  invalid: number;
}

export async function buildImportInputs(
  rows: string[][],
  mapping: Mapping,
  matchCategory: MatchFn,
  hash: HashFn,
): Promise<BuiltImport> {
  const drafts = rows
    .map((row) => toDraft(row, mapping))
    .filter((draft): draft is Draft => draft !== null);

  const inputs: TransactionInput[] = [];
  for (const draft of assignOrdinals(drafts)) {
    inputs.push({
      amount_cents: draft.amount_cents,
      date: draft.date,
      description: draft.description,
      category_id: matchCategory(draft.description),
      source: 'import',
      import_hash: await hash(draft.date, draft.amount_cents, draft.description, draft.nth),
    });
  }

  return { inputs, invalid: rows.length - drafts.length };
}
