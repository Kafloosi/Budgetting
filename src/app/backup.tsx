import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen, SectionLabel } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { IconTick } from '@/components/transit/icons';
import { Line, Radius, Space, Stroke } from '@/constants/theme';
import { exportBackup, exportCsv, restoreBackup } from '@/lib/backup';
import { toDateOnly } from '@/lib/dates';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger } from '@/providers/ledger';
import { useSettings } from '@/providers/settings';

/**
 * Moving the ledger off this phone, and back onto another one.
 *
 * There is no account and no server, so this is the only way a new phone gets
 * the old phone's history. The backup is plain JSON on purpose: readable,
 * portable, and not dependent on this app still existing.
 */
export default function BackupScreen() {
  const router = useRouter();
  const theme = useTheme();
  const db = useSQLiteContext();
  const invalidate = useInvalidateLedger();
  const { update } = useSettings();

  const [busy, setBusy] = useState<'backup' | 'csv' | 'restore' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Hands the file to the platform.
   *
   * Native writes it to the cache and opens the share sheet, which is how a
   * backup gets off the phone at all. The web build has no share sheet and no
   * filesystem to write to, so it does what a browser does: downloads it.
   */
  async function share(name: string, contents: string, mimeType: string) {
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
      return `Downloaded ${name}.`;
    }

    const directory = new Directory(Paths.cache, 'fare-export');
    if (!directory.exists) directory.create({ intermediates: true });

    const file = new File(directory, name);
    if (file.exists) file.delete();
    file.create();
    file.write(contents);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
      return `Shared ${name}.`;
    }
    return `Saved to ${file.uri}.`;
  }

  async function runBackup() {
    setBusy('backup');
    setError(null);
    setMessage(null);
    try {
      const backup = await exportBackup(db);
      const total = Object.values(backup.tables).reduce((sum, rows) => sum + rows.length, 0);
      const result = await share(
        `fare-backup-${toDateOnly(new Date())}.json`,
        JSON.stringify(backup),
        'application/json',
      );
      setMessage(`${total} rows. ${result}`);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runCsv() {
    setBusy('csv');
    setError(null);
    setMessage(null);
    try {
      const csv = await exportCsv(db);
      const result = await share(`fare-${toDateOnly(new Date())}.csv`, csv, 'text/csv');
      setMessage(result);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runRestore() {
    setError(null);
    setMessage(null);

    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;

    Alert.alert(
      'Replace everything on this phone?',
      'A restore is not a merge. Every transaction, category, budget, goal and schedule currently on this phone is replaced by the ones in that file.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setBusy('restore');
            try {
              const text = await new File(picked.assets[0].uri).text();
              const result = await restoreBackup(db, JSON.parse(text));
              // Settings came from the file too, so re-read them rather than
              // leaving the app showing the replaced phone's currency.
              await update({});
              invalidate();
              setMessage(`${result.total} rows restored.`);
            } catch (failure) {
              setError((failure as Error).message);
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <SheetHeader
        title="Backup"
        accent={Line.green}
        leading="back"
        onClose={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <SectionLabel>Take a copy</SectionLabel>
          <Text variant="body" tone="muted" style={styles.copy}>
            A full backup is one JSON file holding every row on this phone. Keep it somewhere you
            will still have it if the phone is lost — that file is the only copy.
          </Text>
          <Button
            label={busy === 'backup' ? 'Working…' : 'Export a backup'}
            onPress={runBackup}
            disabled={busy !== null}
          />
          <Button
            label={busy === 'csv' ? 'Working…' : 'Export transactions as CSV'}
            onPress={runCsv}
            variant="secondary"
            disabled={busy !== null}
          />
        </View>

        <View style={styles.section}>
          <SectionLabel>Move to a new phone</SectionLabel>
          <Text variant="body" tone="muted" style={styles.copy}>
            Restoring replaces everything here with the contents of the backup. It is not a merge —
            two ledgers cannot be combined without knowing which version of a row is right.
          </Text>
          <Button
            label={busy === 'restore' ? 'Restoring…' : 'Restore from a backup'}
            onPress={runRestore}
            variant="danger"
            disabled={busy !== null}
            showArrow={false}
          />
        </View>

        {message ? (
          <View style={[styles.result, { borderColor: Line.green }]}>
            <IconTick size={20} color={theme.onGround.green} />
            <Text variant="body" style={styles.resultText}>
              {message}
            </Text>
          </View>
        ) : null}

        {error ? (
          <Text variant="body" color={theme.onGround.scarlet}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Space.lg,
    gap: Space.xxl,
  },
  section: {
    gap: Space.md,
  },
  copy: {
    paddingHorizontal: Space.xs,
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
});
