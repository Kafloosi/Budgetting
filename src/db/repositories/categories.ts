import type { SQLiteDatabase } from 'expo-sqlite';

import type { Category, CategoryKind } from '../types';
import { newId, nowIso } from '../util';

export interface CategoryInput {
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
}

export async function listCategories(
  db: SQLiteDatabase,
  options: { includeArchived?: boolean; kind?: CategoryKind } = {},
): Promise<Category[]> {
  const clauses = ['deleted_at IS NULL'];
  const params: (string | number)[] = [];

  if (!options.includeArchived) clauses.push('archived = 0');
  if (options.kind) {
    clauses.push('kind = ?');
    params.push(options.kind);
  }

  return db.getAllAsync<Category>(
    `SELECT * FROM categories WHERE ${clauses.join(' AND ')} ORDER BY sort_order, name`,
    params,
  );
}

export async function getCategory(db: SQLiteDatabase, id: string): Promise<Category | null> {
  return db.getFirstAsync<Category>('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL', [
    id,
  ]);
}

export async function createCategory(db: SQLiteDatabase, input: CategoryInput): Promise<string> {
  const id = newId();
  const now = nowIso();
  const next = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM categories',
  );

  await db.runAsync(
    `INSERT INTO categories
       (id, household_id, name, kind, color, icon, sort_order, archived, created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, 0, ?, ?, NULL)`,
    [id, input.name, input.kind, input.color, input.icon, next?.next ?? 0, now, now],
  );

  return id;
}

export async function updateCategory(
  db: SQLiteDatabase,
  id: string,
  patch: Partial<CategoryInput & { archived: boolean }>,
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number)[] = [];

  if (patch.name !== undefined) (sets.push('name = ?'), params.push(patch.name));
  if (patch.kind !== undefined) (sets.push('kind = ?'), params.push(patch.kind));
  if (patch.color !== undefined) (sets.push('color = ?'), params.push(patch.color));
  if (patch.icon !== undefined) (sets.push('icon = ?'), params.push(patch.icon));
  if (patch.archived !== undefined) (sets.push('archived = ?'), params.push(patch.archived ? 1 : 0));
  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  params.push(nowIso(), id);

  await db.runAsync(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, params);
}

/**
 * Soft-deletes a category. Its transactions keep their history and fall back to
 * "Uncategorised" in reports, rather than disappearing along with the category.
 */
export async function deleteCategory(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?', [
      now,
      now,
      id,
    ]);
    await txn.runAsync(
      'UPDATE transactions SET category_id = NULL, updated_at = ? WHERE category_id = ?',
      [now, id],
    );
    await txn.runAsync('UPDATE budgets SET deleted_at = ?, updated_at = ? WHERE category_id = ?', [
      now,
      now,
      id,
    ]);
  });
}
