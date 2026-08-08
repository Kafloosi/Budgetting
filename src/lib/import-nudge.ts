/**
 * Reminding someone their ledger has gone quiet.
 *
 * Kept away from the notification API so the rule about *when* is checkable, in
 * the same way `lib/fingerprint.ts` is kept away from the digest.
 */

/**
 * Long enough that a monthly statement does not get nagged about twice, short
 * enough that a forgotten month is caught inside it.
 */
export const NUDGE_AFTER_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between the last import and now. Null when nothing was imported. */
export function daysSinceImport(last: string | null, now: Date): number | null {
  if (!last) return null;
  const then = new Date(last);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((now.getTime() - then.getTime()) / DAY_MS);
}

/**
 * Whether to say something.
 *
 * Silent until the first import has happened. Reminding someone to do a thing
 * they have never done is not a reminder, and the first import is also the one
 * that teaches Fare the format — before that, the nudge cannot deliver what it
 * offers.
 *
 * At most one nudge per quiet spell: `nudgedAt` is when the last one went out,
 * and staying silent once it is no older than the last import is the whole
 * de-dupe — hearing the same thing twice is noise, and noise is what gets an
 * app's notifications switched off for good. An import moves `lastImport` past
 * `nudgedAt` again, which is what lets the next quiet spell nudge at all.
 */
export function shouldNudge(
  lastImport: string | null,
  nudgedAt: string | null,
  now: Date,
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  if (!lastImport) return false;
  const days = daysSinceImport(lastImport, now);
  if (days === null || days < NUDGE_AFTER_DAYS) return false;
  return nudgedAt === null || nudgedAt < lastImport;
}
