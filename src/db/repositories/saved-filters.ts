/**
 * A named combination of the ledger's own filters.
 *
 * "Dining out, this month" and "everything I paid Ikea" are questions people ask
 * repeatedly, and re-typing the search each time is the papercut. Nothing new is
 * computed — this stores the four controls the ledger already has.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import type { SyncableRecord } from '../types';
import { newId, nowIso } from '../util';

export type FilterDirection = 'all' | 'in' | 'out';
export type FilterScope = 'month' | 'all';

export interface SavedFilter extends SyncableRecord {
  name: string;
  search: string | null;
  direction: FilterDirection;
  category_id: string | null;
  scope: FilterScope;
  sort_order: number;
}

export interface SavedFilterInput {
  name: string;
  search: string | null;
  direction: FilterDirection;
  category_id: string | null;
  scope: FilterScope;
}

export async function listSavedFilters(db: SQLiteDatabase): Promise<SavedFilter[]> {
  return db.getAllAsync<SavedFilter>(
    'SELECT * FROM saved_filters WHERE deleted_at IS NULL ORDER BY sort_order, name COLLATE NOCASE',
  );
}

/**
 * Saves under a name, replacing anything already saved under it.
 *
 * Upserts rather than failing: re-saving "Groceries" after tightening the search is
 * the common case, and demanding the old one be deleted first would be pedantry.
 */
export async function saveFilter(
  db: SQLiteDatabase,
  input: SavedFilterInput,
): Promise<string> {
  const now = nowIso();
  const name = input.name.trim();
  const search = input.search?.trim() || null;

  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM saved_filters WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL',
    [name],
  );

  if (existing) {
    await db.runAsync(
      `UPDATE saved_filters
          SET search = ?, direction = ?, category_id = ?, scope = ?, updated_at = ?
        WHERE id = ?`,
      [search, input.direction, input.category_id, input.scope, now, existing.id],
    );
    return existing.id;
  }

  const next = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM saved_filters WHERE deleted_at IS NULL',
  );

  const id = newId();
  await db.runAsync(
    `INSERT INTO saved_filters
       (id, household_id, name, search, direction, category_id, scope, sort_order,
        created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [id, name, search, input.direction, input.category_id, input.scope, next?.next ?? 0, now, now],
  );
  return id;
}

export async function deleteSavedFilter(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.runAsync('UPDATE saved_filters SET deleted_at = ?, updated_at = ? WHERE id = ?', [
    now,
    now,
    id,
  ]);
}
