/**
 * Domain types.
 *
 * Two conventions run through the whole schema and are worth knowing up front:
 *
 * 1. Money is always an integer number of cents. Floats lose precision on
 *    values as ordinary as 0.10 + 0.20, which is unacceptable for a ledger.
 * 2. Amounts are signed: expenses are negative, income positive. This matches
 *    how banks export CSV and makes any total a plain SUM.
 */

/** ISO-8601 UTC instant, e.g. `2026-08-04T12:30:00.000Z`. */
export type Timestamp = string;

/** Calendar day in the user's local zone, `YYYY-MM-DD`. */
export type DateOnly = string;

/** Budget period, `YYYY-MM`. */
export type MonthKey = string;

/**
 * Columns shared by every table. They exist from day one because retrofitting
 * them onto a database that already lives on someone's phone is painful:
 *
 * - `id` is a UUID rather than an autoincrementing int, so two devices can
 *   create rows offline without colliding.
 * - `updated_at` gives a future sync layer a conflict-resolution key.
 * - `deleted_at` makes deletes soft, so a delete on one device can propagate
 *   instead of being silently resurrected by the other device's copy.
 * - `household_id` is unused today and always null. It is the seam for sharing
 *   a budget with family members later.
 */
export interface SyncableRecord {
  id: string;
  household_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

export type CategoryKind = 'expense' | 'income';

export interface Category extends SyncableRecord {
  name: string;
  kind: CategoryKind;
  /** Hex colour used by charts and the category chips. */
  color: string;
  /** Emoji shown next to the name. Cheap, cross-platform, no icon font. */
  icon: string;
  sort_order: number;
  /** Archived categories stay attached to old transactions but are hidden. */
  archived: number;
}

export interface Account extends SyncableRecord {
  name: string;
  /** Free-form, e.g. `checking`, `savings`, `cash`. */
  kind: string;
  currency: string;
}

/** Where a transaction came from — hand-entered or a bank CSV. */
export type TransactionSource = 'manual' | 'import';

export interface Transaction extends SyncableRecord {
  account_id: string | null;
  category_id: string | null;
  /** Signed cents: negative for spending, positive for income. */
  amount_cents: number;
  date: DateOnly;
  description: string;
  notes: string | null;
  source: TransactionSource;
  /**
   * Fingerprint of the original CSV row, used to skip rows that were already
   * imported. Null for manual entries. See `importHash` in ./hash.
   */
  import_hash: string | null;
  /** Set when a recurring rule materialised this row. */
  recurring_id: string | null;
  /**
   * Shared by the two rows of a transfer between your own accounts — negative in
   * the account it left, positive in the one it reached.
   *
   * Non-null means this row is not spending and not income. Every aggregate that
   * measures either must exclude it, or moving money between your own accounts
   * shows up as earning it.
   */
  transfer_group_id: string | null;
  /**
   * Shared by the parts of one payment divided across categories.
   *
   * The parts add up to what was paid, so no aggregate needs to know about them —
   * unlike a parent row holding the total, which every aggregate would have to
   * exclude.
   */
  split_group_id: string | null;
  /**
   * File name of a receipt photo inside the app's `receipts` directory. Not a path
   * — the directory moves between installs, so it is resolved at read time.
   */
  receipt_file: string | null;
}

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly';

/**
 * A timetabled service: an entry that repeats on its own.
 *
 * Occurrences are not stored. `anchor_date` fixes the pattern and
 * `last_applied_date` records how far it has run, so catch-up can work out
 * exactly what became due while the app was closed without walking history.
 */
export interface RecurringRule extends SyncableRecord {
  category_id: string | null;
  /** Signed cents, same convention as a transaction. */
  amount_cents: number;
  description: string;
  notes: string | null;
  frequency: RecurringFrequency;
  anchor_date: DateOnly;
  last_applied_date: DateOnly | null;
}

/** A savings target. Money set aside is tracked here, not in the ledger. */
export interface Goal extends SyncableRecord {
  name: string;
  target_cents: number;
  saved_cents: number;
  deadline: DateOnly | null;
  color: string;
  sort_order: number;
}

/** A one-tap entry for something bought at the same price over and over. */
export interface Template extends SyncableRecord {
  label: string;
  amount_cents: number;
  category_id: string | null;
  description: string;
  sort_order: number;
}

export interface Budget extends SyncableRecord {
  category_id: string;
  /**
   * `null` means "the recurring limit that applies to every month".
   * A `YYYY-MM` value overrides the recurring limit for that month only.
   */
  month: MonthKey | null;
  limit_cents: number;
  /**
   * 1 when what is left over at the end of a month is added to the next one.
   * Held on every budget row for the category, since it describes the limit
   * rather than one month of it.
   */
  rollover: number;
}

/**
 * A remembered statement format, so a bank's columns are mapped once.
 *
 * Column positions are indices into the CSV's rows. `header_signature` is the
 * flattened heading row, used to recognise the same export next month.
 */
export interface ImportPreset extends SyncableRecord {
  name: string;
  header_signature: string | null;
  date_column: number;
  amount_column: number;
  description_column: number;
  /** One of `lib/csv`'s `DateFormat` values. */
  date_format: string;
  /** 1 when the bank exports every amount unsigned. */
  all_negative: number;
}

/** How an import rule matches a bank description. */
export type RuleMatchType = 'contains' | 'starts_with' | 'equals';

/** Maps a bank description onto a category so imports self-categorise. */
export interface ImportRule extends SyncableRecord {
  pattern: string;
  match_type: RuleMatchType;
  category_id: string;
  /** Higher priority wins when several rules match the same description. */
  priority: number;
}
