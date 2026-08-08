/**
 * Remembered statement formats.
 *
 * A bank's export keeps the same columns every month. Saying which column is
 * which belongs to the bank, not to the file, so it is said once and recognised
 * from then on.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import type { ImportPreset } from '../types';
import { newId, nowIso } from '../util';

export interface ImportPresetInput {
  name: string;
  header_signature: string | null;
  date_column: number;
  amount_column: number;
  description_column: number;
  date_format: string;
  all_negative: boolean;
}

/**
 * Flattens a heading row into something comparable between exports.
 *
 * Case and padding change between a bank's own exports and are not a difference
 * in the format. Column order is, so the order is kept.
 */
export function headerSignature(header: string[]): string | null {
  const cleaned = header
    .map((name) => name.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter((name) => name.length > 0);
  // A file whose headings are all blank has nothing to recognise it by. Null
  // rather than an empty string, so it cannot collide with another such file.
  return cleaned.length === 0 ? null : cleaned.join('|');
}

/** The preset that recognises this file's headings, if one does. */
export async function findPresetForHeader(
  db: SQLiteDatabase,
  header: string[],
): Promise<ImportPreset | null> {
  const signature = headerSignature(header);
  if (!signature) return null;

  return db.getFirstAsync<ImportPreset>(
    'SELECT * FROM import_presets WHERE header_signature = ? AND deleted_at IS NULL',
    [signature],
  );
}

/**
 * Saves a format under a name, replacing one already saved under it.
 *
 * Upserts rather than failing, so re-saving "ING" after a column moved corrects
 * the preset instead of demanding the old one be deleted first.
 */
export async function saveImportPreset(
  db: SQLiteDatabase,
  input: ImportPresetInput,
): Promise<string> {
  const now = nowIso();
  const name = input.name.trim();

  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM import_presets WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL',
    [name],
  );

  if (existing) {
    await db.runAsync(
      `UPDATE import_presets
          SET header_signature = ?, date_column = ?, amount_column = ?,
              description_column = ?, date_format = ?, all_negative = ?, updated_at = ?
        WHERE id = ?`,
      [
        input.header_signature,
        input.date_column,
        input.amount_column,
        input.description_column,
        input.date_format,
        input.all_negative ? 1 : 0,
        now,
        existing.id,
      ],
    );
    return existing.id;
  }

  const id = newId();
  await db.runAsync(
    `INSERT INTO import_presets
       (id, household_id, name, header_signature, date_column, amount_column,
        description_column, date_format, all_negative, created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      id,
      name,
      input.header_signature,
      input.date_column,
      input.amount_column,
      input.description_column,
      input.date_format,
      input.all_negative ? 1 : 0,
      now,
      now,
    ],
  );
  return id;
}
