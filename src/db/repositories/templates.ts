import type { SQLiteDatabase } from 'expo-sqlite';

import type { Template } from '../types';
import { newId, nowIso } from '../util';

export interface TemplateInput {
  label: string;
  amount_cents: number;
  category_id: string | null;
  description: string;
}

/** A template joined with the display fields of its category. */
export interface TemplateWithCategory extends Template {
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
}

export async function listTemplates(db: SQLiteDatabase): Promise<TemplateWithCategory[]> {
  return db.getAllAsync<TemplateWithCategory>(
    `SELECT t.*,
            c.name  AS category_name,
            c.color AS category_color,
            c.icon  AS category_icon
       FROM templates t
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.deleted_at IS NULL
      ORDER BY t.sort_order, t.label`,
  );
}

export async function createTemplate(db: SQLiteDatabase, input: TemplateInput): Promise<string> {
  const id = newId();
  const now = nowIso();
  const next = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM templates WHERE deleted_at IS NULL',
  );

  await db.runAsync(
    `INSERT INTO templates
       (id, household_id, label, amount_cents, category_id, description, sort_order,
        created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      id,
      input.label,
      input.amount_cents,
      input.category_id,
      input.description,
      next?.next ?? 0,
      now,
      now,
    ],
  );
  return id;
}

export async function deleteTemplate(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.runAsync('UPDATE templates SET deleted_at = ?, updated_at = ? WHERE id = ?', [
    now,
    now,
    id,
  ]);
}
