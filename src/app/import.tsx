import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { TextField } from '@/components/field';
import { Money } from '@/components/money';
import { Plate } from '@/components/plate';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { IconImport, IconTick } from '@/components/transit/icons';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import {
  findPresetForHeader,
  headerSignature,
  saveImportPreset,
} from '@/db/repositories/import-presets';
import { loadRuleMatcher } from '@/db/repositories/import-rules';
import {
  bulkInsertImported,
  countUncategorised,
  type TransactionInput,
} from '@/db/repositories/transactions';
import { importHash } from '@/db/hash';
import { assignOrdinals } from '@/lib/fingerprint';
import {
  DATE_FORMAT_LABELS,
  guessColumns,
  guessDateFormat,
  parseCsv,
  toDraft,
  type DateFormat,
  type Draft,
  type Mapping,
  type ParsedCsv,
} from '@/lib/csv';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger } from '@/providers/ledger';

/**
 * Reading a bank statement in.
 *
 * Three stages on one screen — pick the file, say which column is which, then
 * confirm — because a wizard would hide the thing that matters: what is about
 * to land in the ledger. Re-importing a statement that overlaps an earlier one
 * is safe; matching rows are skipped by content hash.
 */
export default function ImportScreen() {
  const router = useRouter();
  const theme = useTheme();
  const db = useSQLiteContext();
  const invalidate = useInvalidateLedger();

  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Name of the saved format that recognised this file, if one did. */
  const [recognised, setRecognised] = useState<string | null>(null);
  const [presetName, setPresetName] = useState('');
  /** The mapping as it stood when the format was last saved, if it has been. */
  const [savedMapping, setSavedMapping] = useState<string | null>(null);
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    /** Rows anywhere in the ledger still without a category, after this import. */
    waiting: number;
  } | null>(null);

  async function pick() {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;

    const asset = picked.assets[0];
    try {
      const text = await new File(asset.uri).text();
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) {
        setError('That file has a heading row but no transactions in it.');
        return;
      }
      setCsv(parsed);
      setFileName(asset.name);
      setResult(null);
      setSavedMapping(null);

      // A format saved from this bank's last export beats guessing at the
      // headings, so it is applied without asking.
      const preset = await findPresetForHeader(db, parsed.header);
      if (preset) {
        setRecognised(preset.name);
        setPresetName(preset.name);
        setMapping({
          date: preset.date_column,
          amount: preset.amount_column,
          description: preset.description_column,
          format: preset.date_format as DateFormat,
          allNegative: preset.all_negative === 1,
        });
        return;
      }

      setRecognised(null);
      setPresetName('');
      const guessed = guessColumns(parsed.header);
      setMapping({
        ...guessed,
        format: guessDateFormat(parsed.rows.map((row) => row[guessed.date] ?? '')),
        allNegative: false,
      });
    } catch (readError) {
      setError(`Could not read that file. ${(readError as Error).message}`);
    }
  }

  // Derived rather than a flag reset by an effect: editing a column after saving
  // makes the saved format out of date, and the button offers itself again.
  const mappingKey = mapping ? JSON.stringify(mapping) : null;
  const savedPreset = savedMapping !== null && savedMapping === mappingKey;

  async function savePreset() {
    if (!csv || !mapping) return;
    const name = presetName.trim();
    if (!name) return;

    await saveImportPreset(db, {
      name,
      header_signature: headerSignature(csv.header),
      date_column: mapping.date,
      amount_column: mapping.amount,
      description_column: mapping.description,
      date_format: mapping.format,
      all_negative: mapping.allNegative,
    });
    setSavedMapping(mappingKey);
    setRecognised(name);
    invalidate();
  }

  const preview = useMemo(() => {
    if (!csv || !mapping) return [];
    return csv.rows.slice(0, 200).map((row) => toDraft(row, mapping));
  }, [csv, mapping]);

  const valid = preview.filter((draft) => draft !== null) as Draft[];
  const invalid = preview.length - valid.length;

  async function run() {
    if (!csv || !mapping || busy) return;
    setBusy(true);
    try {
      const drafts = csv.rows
        .map((row) => toDraft(row, mapping))
        .filter((draft): draft is Draft => draft !== null);

      // Loaded once for the whole statement rather than queried per row.
      const matchCategory = await loadRuleMatcher(db);

      // Two identical coffees on one day are two transactions. Numbering each row
      // by how many identical ones preceded it in this file is what tells them
      // apart, while a re-import of the same file reproduces the same numbers and
      // so still collides with itself.
      const inputs: TransactionInput[] = [];
      for (const draft of assignOrdinals(drafts)) {
        inputs.push({
          amount_cents: draft.amount_cents,
          date: draft.date,
          description: draft.description,
          category_id: matchCategory(draft.description),
          source: 'import',
          import_hash: await importHash(
            draft.date,
            draft.amount_cents,
            draft.description,
            draft.nth,
          ),
        });
      }

      const outcome = await bulkInsertImported(db, inputs);
      invalidate();
      setResult({ ...outcome, waiting: await countUncategorised(db) });
    } catch (importError) {
      setError(`The import stopped. ${(importError as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <SheetHeader
        title="Import a statement"
        accent={Line.teal}
        leading="back"
        onClose={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!csv ? (
          <EmptyState
            accent={Line.teal}
            title="No file yet"
            body="Download a CSV statement from your bank, then pick it here. Nothing leaves the phone — the file is read on the device."
            action={{ label: 'Choose a CSV file', onPress: pick }}
          />
        ) : (
          <>
            <View style={styles.file}>
              <IconImport size={20} color={theme.inkMuted} />
              <Text variant="label" numberOfLines={1} style={styles.fileName}>
                {fileName}
              </Text>
              <Pressable onPress={pick} accessibilityRole="button" hitSlop={8}>
                <Text variant="station" color={theme.onGround.cobalt}>
                  Change
                </Text>
              </Pressable>
            </View>

            {recognised ? (
              <Text variant="caption" tone="muted" style={styles.groupLabel}>
                {`Read as ${recognised}. The columns below came from the saved format — change any of them if the bank has moved something.`}
              </Text>
            ) : null}

            {mapping ? (
              <>
                <ColumnPicker
                  label="Day"
                  header={csv.header}
                  selected={mapping.date}
                  sample={csv.rows[0]}
                  onSelect={(index) =>
                    setMapping({
                      ...mapping,
                      date: index,
                      format: guessDateFormat(csv.rows.map((row) => row[index] ?? '')),
                    })
                  }
                />

                <View style={styles.group}>
                  <Text variant="station" tone="muted" style={styles.groupLabel}>
                    Day is written as
                  </Text>
                  <View style={styles.chips}>
                    {(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((format) => (
                      <Plate
                        key={format}
                        style={styles.chip}
                        variant="label"
                        numberOfLines={1}
                        accent={Line.teal}
                        label={DATE_FORMAT_LABELS[format]}
                        active={mapping.format === format}
                        onPress={() => setMapping({ ...mapping, format })}
                      />
                    ))}
                  </View>
                </View>

                <ColumnPicker
                  label="Amount"
                  header={csv.header}
                  selected={mapping.amount}
                  sample={csv.rows[0]}
                  onSelect={(index) => setMapping({ ...mapping, amount: index })}
                />

                <View style={styles.group}>
                  <Text variant="station" tone="muted" style={styles.groupLabel}>
                    Signs
                  </Text>
                  <View style={styles.chips}>
                    <Plate
                      style={styles.chip}
                      variant="label"
                      numberOfLines={1}
                      accent={Line.teal}
                      label="As written"
                      active={!mapping.allNegative}
                      onPress={() => setMapping({ ...mapping, allNegative: false })}
                    />
                    <Plate
                      style={styles.chip}
                      variant="label"
                      numberOfLines={1}
                      accent={Line.teal}
                      label="All spending"
                      active={mapping.allNegative}
                      onPress={() => setMapping({ ...mapping, allNegative: true })}
                    />
                  </View>
                  <Text variant="caption" tone="muted" style={styles.groupLabel}>
                    Pick “all spending” when the export leaves every amount positive.
                  </Text>
                </View>

                <ColumnPicker
                  label="Description"
                  header={csv.header}
                  selected={mapping.description}
                  sample={csv.rows[0]}
                  onSelect={(index) => setMapping({ ...mapping, description: index })}
                />

                <View style={styles.group}>
                  <Text variant="station" tone="muted" style={styles.groupLabel}>
                    {`Preview — ${csv.rows.length} ${csv.rows.length === 1 ? 'row' : 'rows'} in the file`}
                  </Text>
                  {valid.slice(0, 4).map((draft, index) => (
                    <View key={index} style={[styles.previewRow, { borderColor: theme.rule }]}>
                      <View style={styles.previewBody}>
                        <Text variant="label" numberOfLines={1}>
                          {draft.description || 'No description'}
                        </Text>
                        <Text variant="caption" tone="muted">
                          {draft.date}
                        </Text>
                      </View>
                      <Money cents={draft.amount_cents} />
                    </View>
                  ))}
                  {invalid > 0 ? (
                    <Text variant="caption" color={theme.onGround.amber}>
                      {`${invalid} of the first ${preview.length} rows do not read as a day and an amount. Check the columns above — those rows will be skipped.`}
                    </Text>
                  ) : null}
                </View>

                {!result ? (
                  <View style={styles.group}>
                    <Text variant="station" tone="muted" style={styles.groupLabel}>
                      Remember this format
                    </Text>
                    <TextField
                      label="Name of the bank"
                      value={presetName}
                      onChangeText={setPresetName}
                      placeholder="ING, Rabobank, Revolut…"
                      hint="Next time a file with these headings is picked, the columns fill in on their own."
                      autoCapitalize="words"
                      autoCorrect={false}
                      returnKeyType="done"
                      style={styles.presetField}
                    />
                    <Button
                      label={savedPreset ? 'Format saved' : 'Save this format'}
                      variant="quiet"
                      showArrow={false}
                      disabled={presetName.trim().length === 0 || savedPreset}
                      onPress={savePreset}
                      style={styles.presetField}
                    />
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        )}

        {error ? (
          <Text variant="body" color={theme.onGround.scarlet}>
            {error}
          </Text>
        ) : null}

        {result ? (
          <View style={[styles.result, { borderColor: Line.green }]}>
            <IconTick size={22} color={theme.onGround.green} />
            <Text variant="body" style={styles.resultText}>
              {result.inserted === 0
                ? 'Everything in that file was already in the ledger. Nothing was added twice.'
                : `${result.inserted} added${result.skipped > 0 ? `, ${result.skipped} already there` : ''}. ${
                    result.waiting === 0
                      ? 'Your rules filed every one of them.'
                      : `${result.waiting} in the ledger still need a category.`
                  }`}
            </Text>
          </View>
        ) : null}

        {result && result.waiting > 0 ? (
          <Button label={`File ${result.waiting} rows`} onPress={() => router.push('/triage')} />
        ) : null}

        {csv && !result ? (
          <Button
            label={busy ? 'Reading…' : `Import ${valid.length > 0 ? valid.length : ''} rows`.trim()}
            onPress={run}
            disabled={busy || valid.length === 0}
          />
        ) : null}

        {result ? (
          <Button label="Back to settings" onPress={() => router.back()} variant="secondary" />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function ColumnPicker({
  label,
  header,
  selected,
  sample,
  onSelect,
}: {
  label: string;
  header: string[];
  selected: number;
  sample: string[] | undefined;
  onSelect: (index: number) => void;
}) {
  return (
    <View style={styles.group}>
      <Text variant="station" tone="muted" style={styles.groupLabel}>
        {label}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {header.map((name, index) => (
          <Plate
            key={`${name}-${index}`}
            style={styles.chip}
            variant="label"
            numberOfLines={1}
            accent={Line.teal}
            label={name || `Column ${index + 1}`}
            detail={sample?.[index]}
            active={selected === index}
            onPress={() => onSelect(index)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Space.lg,
    paddingBottom: Space.xxxl,
    gap: Space.xl,
  },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  fileName: {
    flex: 1,
  },
  group: {
    gap: Space.sm,
  },
  groupLabel: {
    paddingLeft: Space.xs,
  },
  chips: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingRight: Space.lg,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: TouchTarget,
    paddingHorizontal: Space.md,
    borderRadius: Radius.plate,
    borderWidth: Stroke.tick,
    maxWidth: 220,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: Stroke.hairline,
  },
  previewBody: {
    flex: 1,
    gap: 2,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    padding: Space.lg,
    borderRadius: Radius.panel,
    borderWidth: Stroke.tick,
  },
  resultText: {
    flex: 1,
  },
  presetField: {
    marginHorizontal: Space.lg,
  },
});
