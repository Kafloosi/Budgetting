/**
 * A CSV reader for bank statements.
 *
 * Deliberately bank-agnostic. Every bank exports the same three things under
 * different headings — a day, an amount and a description — so the app reads
 * the shape of the file and lets the user say which column is which, instead of
 * carrying a table of per-bank formats that goes stale the moment one of them
 * redesigns their export.
 */

export interface ParsedCsv {
  header: string[];
  rows: string[][];
  delimiter: string;
}

const DELIMITERS = [',', ';', '\t', '|'];

/** Picks whichever delimiter yields the most consistent column count. */
function sniffDelimiter(sample: string): string {
  let best = ',';
  let bestScore = -1;

  for (const delimiter of DELIMITERS) {
    const lines = sample.split(/\r?\n/).filter(Boolean).slice(0, 10);
    if (lines.length === 0) continue;
    const counts = lines.map((line) => splitLine(line, delimiter).length);
    const columns = counts[0];
    if (columns < 2) continue;
    const consistent = counts.filter((count) => count === columns).length;
    const score = consistent * 100 + columns;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

/** One line, respecting `""`-escaped quoted fields. */
function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields.map((value) => value.trim());
}

export function parseCsv(text: string): ParsedCsv {
  // Strip a UTF-8 BOM — plenty of bank exports carry one and it would otherwise
  // become part of the first column's heading.
  const clean = text.replace(/^﻿/, '');
  const delimiter = sniffDelimiter(clean);

  // Split on newlines that are not inside quotes.
  const lines: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < clean.length; index++) {
    const char = clean[index];
    if (char === '"') quoted = !quoted;
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && clean[index + 1] === '\n') index++;
      lines.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) lines.push(current);

  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) return { header: [], rows: [], delimiter };

  const header = splitLine(nonEmpty[0], delimiter).map((value) => value.replace(/^"|"$/g, ''));
  const rows = nonEmpty.slice(1).map((line) => splitLine(line, delimiter));

  return { header, rows, delimiter };
}

export type DateFormat = 'iso' | 'dmy' | 'mdy' | 'compact';

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  iso: '2026-08-04',
  dmy: '04-08-2026',
  mdy: '08/04/2026',
  compact: '20260804',
};

/** `YYYY-MM-DD`, or null when the value is not a date in the stated format. */
export function parseDate(value: string, format: DateFormat): string | null {
  const digits = value.trim();
  if (!digits) return null;

  if (format === 'compact') {
    const match = digits.match(/(\d{4})(\d{2})(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  }

  const parts = digits.split(/[^0-9]+/).filter(Boolean);
  if (parts.length < 3) return null;

  let year: string;
  let month: string;
  let day: string;

  if (format === 'iso') {
    [year, month, day] = parts;
  } else if (format === 'dmy') {
    [day, month, year] = parts;
  } else {
    [month, day, year] = parts;
  }

  if (year.length === 2) year = `20${year}`;
  if (year.length !== 4) return null;

  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (!monthNumber || monthNumber > 12 || !dayNumber || dayNumber > 31) return null;

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Guesses the date format from a column's values, defaulting to ISO. */
export function guessDateFormat(values: string[]): DateFormat {
  const sample = values.find((value) => value.trim().length > 0) ?? '';
  if (/^\d{8}$/.test(sample.trim())) return 'compact';
  if (/^\d{4}[^0-9]\d{1,2}[^0-9]\d{1,2}/.test(sample)) return 'iso';
  // Anything above 12 in the first position can only be a day.
  const first = Number(sample.split(/[^0-9]+/).filter(Boolean)[0]);
  if (first > 12) return 'dmy';
  return 'dmy';
}

/**
 * Guesses which column is which from the headings, so the common case needs no
 * mapping at all. Matches on substrings in English and Dutch, since those are
 * the exports this is built against.
 */
export function guessColumns(header: string[]): {
  date: number;
  amount: number;
  description: number;
} {
  const find = (patterns: RegExp) =>
    header.findIndex((name) => patterns.test(name.toLowerCase()));

  return {
    date: Math.max(0, find(/date|datum|boekdatum|transactiedatum/)),
    amount: Math.max(0, find(/amount|bedrag|value|mutatie/)),
    description: Math.max(0, find(/description|omschrijving|naam|name|payee|mededeling|memo/)),
  };
}
