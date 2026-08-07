/**
 * What an imported row is fingerprinted on.
 *
 * Separate from `db/hash.ts` because that file reaches for `expo-crypto` to do the
 * digest, and the part worth testing is not the digest — it is the decision about
 * which rows count as the same transaction. This file has no native dependency, so
 * that decision can be checked directly.
 */

/**
 * Flattens a bank's own wording so the same transaction fingerprints the same way
 * across exports.
 *
 * Banks pad, re-case and re-space descriptions between exports of the same account,
 * and none of that is a difference in the transaction.
 */
export function normaliseDescription(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The exact string that gets hashed.
 *
 * `nth` is the row's occurrence index *within the file being imported* — how many
 * earlier rows in that same file had an identical date, amount and description. It
 * is what makes two genuinely separate coffees on one day two transactions instead
 * of one, while keeping a re-import of the whole statement a no-op: the same file
 * produces the same ordinals, so every row still collides with itself.
 *
 * `nth === 0` deliberately produces the pre-ordinal string, byte for byte. Rows
 * already fingerprinted on someone's phone keep matching, so the fix needs no
 * migration and re-importing an old statement still skips what is already there —
 * while the duplicate it wrongly dropped last time finally lands.
 */
export function fingerprintInput(
  date: string,
  amountCents: number,
  description: string,
  nth = 0,
): string {
  const base = `${date}|${amountCents}|${normaliseDescription(description)}`;
  return nth === 0 ? base : `${base}|${nth}`;
}

/**
 * Numbers each row by how many identical ones came before it in the same file.
 *
 * Order matters and is the file's own: a statement is a sequence, and re-importing
 * it presents the same sequence again.
 */
export function assignOrdinals<T extends { date: string; amount_cents: number; description: string }>(
  rows: T[],
): (T & { nth: number })[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = `${row.date}|${row.amount_cents}|${normaliseDescription(row.description)}`;
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    return { ...row, nth };
  });
}
