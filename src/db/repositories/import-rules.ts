/**
 * Rules that map a bank's wording onto a category.
 *
 * The table has shipped since migration 1 and nothing read it, so every imported
 * row landed uncategorised and the work of sorting a statement fell on whoever
 * imported it. A rule is the answer to "this is always groceries": say it once
 * and every future statement files itself.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import { normaliseDescription } from '../hash';
import type { ImportRule, RuleMatchType } from '../types';
import { newId, nowIso, withTransaction } from '../util';

export interface ImportRuleInput {
  pattern: string;
  match_type: RuleMatchType;
  category_id: string;
  priority?: number;
}

/** A rule joined with the display fields of the category it points at. */
export interface ImportRuleWithCategory extends ImportRule {
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
}

/**
 * Ordered the same way `loadRuleMatcher` resolves them, so the list on screen
 * reads top-down in the order the rules actually win.
 */
const RULE_ORDER = 'ORDER BY r.priority DESC, LENGTH(r.pattern) DESC, r.pattern';

export async function listImportRules(db: SQLiteDatabase): Promise<ImportRuleWithCategory[]> {
  return db.getAllAsync<ImportRuleWithCategory>(
    `SELECT r.*,
            c.name  AS category_name,
            c.color AS category_color,
            c.icon  AS category_icon
       FROM import_rules r
       LEFT JOIN categories c ON c.id = r.category_id
      WHERE r.deleted_at IS NULL
      ${RULE_ORDER}`,
  );
}

export async function getImportRule(db: SQLiteDatabase, id: string): Promise<ImportRule | null> {
  return db.getFirstAsync<ImportRule>(
    'SELECT * FROM import_rules WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
}

export async function createImportRule(
  db: SQLiteDatabase,
  input: ImportRuleInput,
): Promise<string> {
  const id = newId();
  const now = nowIso();

  await db.runAsync(
    `INSERT INTO import_rules
       (id, household_id, pattern, match_type, category_id, priority, created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL)`,
    [id, input.pattern.trim(), input.match_type, input.category_id, input.priority ?? 0, now, now],
  );

  return id;
}

export async function updateImportRule(
  db: SQLiteDatabase,
  id: string,
  patch: Partial<ImportRuleInput>,
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number)[] = [];

  const set = (column: string, value: string | number) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (patch.pattern !== undefined) set('pattern', patch.pattern.trim());
  if (patch.match_type !== undefined) set('match_type', patch.match_type);
  if (patch.category_id !== undefined) set('category_id', patch.category_id);
  if (patch.priority !== undefined) set('priority', patch.priority);
  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  params.push(nowIso(), id);

  await db.runAsync(`UPDATE import_rules SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function deleteImportRule(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.runAsync('UPDATE import_rules SET deleted_at = ?, updated_at = ? WHERE id = ?', [
    now,
    now,
    id,
  ]);
}

/** Resolves a bank description to a category id, or null when nothing matches. */
export type RuleMatcher = (description: string) => string | null;

/**
 * Loads every rule once and returns a matcher that runs in memory.
 *
 * An import is hundreds of rows, and asking the database per row would be
 * hundreds of round trips for a table that fits in a breath. Matching uses
 * `normaliseDescription` on both sides — the same flattening the dedupe
 * fingerprint uses — so a rule written against one export still matches the next
 * one after the bank re-cases or re-pads its wording.
 *
 * First match wins, in the order rules are listed: priority first, then the
 * longer pattern, because "albert heijn to go" is a more specific claim than
 * "albert heijn" and should not be shadowed by it.
 */
export async function loadRuleMatcher(db: SQLiteDatabase): Promise<RuleMatcher> {
  const rules = await db.getAllAsync<{
    pattern: string;
    match_type: RuleMatchType;
    category_id: string;
  }>(
    `SELECT r.pattern, r.match_type, r.category_id
       FROM import_rules r
      WHERE r.deleted_at IS NULL
      ${RULE_ORDER}`,
  );

  // An empty pattern would match every description, so it is dropped rather
  // than allowed to swallow a whole statement.
  const prepared = rules
    .map((rule) => ({ ...rule, needle: normaliseDescription(rule.pattern) }))
    .filter((rule) => rule.needle.length > 0);

  return (description: string) => {
    const haystack = normaliseDescription(description);
    if (!haystack) return null;

    for (const rule of prepared) {
      const hit =
        rule.match_type === 'equals'
          ? haystack === rule.needle
          : rule.match_type === 'starts_with'
            ? haystack.startsWith(rule.needle)
            : haystack.includes(rule.needle);
      if (hit) return rule.category_id;
    }

    return null;
  };
}

/**
 * Files every uncategorised transaction that a rule now matches.
 *
 * Run after saving a rule, so writing one clears the backlog it describes
 * instead of only affecting statements you have not imported yet. Only touches
 * rows with no category — a category you set by hand is never overwritten.
 */
export async function applyRulesToUncategorised(db: SQLiteDatabase): Promise<number> {
  const matcher = await loadRuleMatcher(db);

  const rows = await db.getAllAsync<{ id: string; description: string }>(
    `SELECT id, description FROM transactions
      WHERE deleted_at IS NULL AND category_id IS NULL`,
  );

  const updates: { id: string; categoryId: string }[] = [];
  for (const row of rows) {
    const categoryId = matcher(row.description);
    if (categoryId) updates.push({ id: row.id, categoryId });
  }

  if (updates.length === 0) return 0;

  const now = nowIso();
  await withTransaction(db, async (txn) => {
    for (const update of updates) {
      await txn.runAsync('UPDATE transactions SET category_id = ?, updated_at = ? WHERE id = ?', [
        update.categoryId,
        now,
        update.id,
      ]);
    }
  });

  return updates.length;
}

/** Tokens that identify a payment method or a reference, not a payee. */
const NOISE = /^(sepa|ideal|incasso|overboeking|betaalautomaat|bea|gea|pos|card|nr|ref|iban|eur|transactie|omschrijving|naam|pasvolgnr|term)$/;

/**
 * A first guess at the pattern for a rule made from one transaction.
 *
 * Bank descriptions bury the payee in scaffolding — "SEPA iDEAL 12-08 ALBERT
 * HEIJN 1234 PASVOLGNR 003" — so this drops the scaffolding, the dates and the
 * reference numbers, and keeps the first few words that look like a name. It is
 * a starting point shown in an editable field, never applied behind your back.
 */
export function suggestPattern(description: string): string {
  const tokens = normaliseDescription(description)
    .split(' ')
    .filter((token) => token.length > 1)
    // Anything containing a digit is a date, a card number or a reference.
    .filter((token) => !/\d/.test(token))
    .filter((token) => !NOISE.test(token));

  const kept = tokens.slice(0, 3).join(' ');
  // Everything looked like scaffolding — fall back to the bank's own wording and
  // let it be edited by hand.
  return kept || normaliseDescription(description);
}
