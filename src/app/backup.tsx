import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/field';
import { Screen, SectionLabel } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { IconTick } from '@/components/transit/icons';
import { Line, Radius, Space, Stroke } from '@/constants/theme';
import { exportBackup, exportCsv, restoreBackup } from '@/lib/backup';
import { decryptBackup, encryptBackup, isEnvelope, type Stage } from '@/lib/backup-crypto';
import { toDateOnly } from '@/lib/dates';
import { packReceipts, receiptsSize, unpackReceipts } from '@/lib/receipts';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger } from '@/providers/ledger';
import { useSettings } from '@/providers/settings';
import type { Backup } from '@/lib/backup-format';

/**
 * Moving the ledger off this phone, and back onto another one.
 *
 * There is no account and no server, so this is the only way a new phone gets
 * the old phone's history — and it is the only way the ledger ever leaves the
 * device, which is why it is encrypted by default. A plain file is still
 * available, once, behind a warning, because a format nobody can read without
 * this app is its own kind of data loss.
 *
 * The passphrase is the user's and is stored nowhere. There is no recovery, and
 * the screen says so before they type one rather than after they lose it.
 */

/** The shortest passphrase worth the eight seconds Argon2id spends on it. */
const MINIMUM_PASSPHRASE = 8;

function stageLabel(stage: Stage): string {
  switch (stage) {
    case 'deriving':
      return 'Making the key from your passphrase';
    case 'encrypting':
      return 'Encrypting';
    case 'verifying':
      return 'Checking it opens again';
    case 'decrypting':
      return 'Decrypting';
  }
}

/** Lets React paint before the next step takes the thread. */
function paint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export default function BackupScreen() {
  const router = useRouter();
  const theme = useTheme();
  const db = useSQLiteContext();
  const invalidate = useInvalidateLedger();
  const { update } = useSettings();

  const [busy, setBusy] = useState<'backup' | 'csv' | 'restore' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Which passphrase form is open, if any. */
  const [asking, setAsking] = useState<'export' | 'restore' | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState<Backup | null>(null);

  const [note, setNote] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const photos = receiptsSize();

  function reset() {
    setAsking(null);
    setPassphrase('');
    setConfirmation('');
    setPending(null);
    setNote(null);
    setProgress(null);
  }

  /** Announces a stage and gives the screen a frame to draw it before the work starts. */
  async function announce(stage: Stage) {
    setNote(stageLabel(stage));
    setProgress(stage === 'deriving' ? 0 : null);
    await paint();
  }

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

  async function runEncryptedBackup() {
    if (passphrase.length < MINIMUM_PASSPHRASE) {
      setError(`Use at least ${MINIMUM_PASSPHRASE} characters. A short passphrase is the weak part, not the encryption.`);
      return;
    }
    if (passphrase !== confirmation) {
      setError('Those two do not match. A backup you cannot open is worse than no backup.');
      return;
    }

    setBusy('backup');
    setError(null);
    setMessage(null);
    try {
      setNote('Reading the ledger');
      await paint();
      const backup = await exportBackup(db);
      const rows = Object.values(backup.tables).reduce((sum, table) => sum + table.length, 0);

      if (photos.count > 0) {
        setNote(`Packing ${photos.count} photo${photos.count === 1 ? '' : 's'}`);
        setProgress(0);
        await paint();
        backup.receipts = await packReceipts((done, total) => setProgress(done / total));
      }

      const { envelope, kdfMs } = await encryptBackup(JSON.stringify(backup), passphrase, {
        random: (length) => Crypto.getRandomBytes(length),
        onStage: announce,
        onProgress: setProgress,
      });

      setNote('Sharing');
      setProgress(null);
      await paint();
      const result = await share(
        `fare-backup-${toDateOnly(new Date())}.json`,
        JSON.stringify(envelope),
        'application/json',
      );

      const carried = backup.receipts?.length ?? 0;
      setMessage(
        `${rows} rows${carried > 0 ? ` and ${carried} photo${carried === 1 ? '' : 's'}` : ''}, encrypted. ${result}` +
          (__DEV__ ? ` (key took ${(kdfMs / 1000).toFixed(1)}s)` : ''),
      );
      reset();
    } catch (failure) {
      setError((failure as Error).message);
      setNote(null);
      setProgress(null);
    } finally {
      setBusy(null);
    }
  }

  /**
   * The plain file, behind a warning.
   *
   * Kept because the readable format is a real virtue — it survives this app
   * being uninstalled, and it is what a user opens in a text editor when they
   * want to know what Fare actually holds about them. Photos stay out of it: it
   * is meant to be a small readable file, and base64 images are neither.
   */
  function runPlainBackup() {
    Alert.alert(
      'Export without a passphrase?',
      'The file will hold every transaction, in readable text, wherever you put it. Anything that can read your files can read your ledger.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export in the clear',
          style: 'destructive',
          onPress: async () => {
            setBusy('backup');
            setError(null);
            setMessage(null);
            try {
              const backup = await exportBackup(db);
              const rows = Object.values(backup.tables).reduce((sum, table) => sum + table.length, 0);
              const result = await share(
                `fare-backup-${toDateOnly(new Date())}-unencrypted.json`,
                JSON.stringify(backup),
                'application/json',
              );
              setMessage(`${rows} rows, unencrypted. ${result}`);
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

  /** Reads the picked file and works out whether it needs a passphrase. */
  async function pickToRestore() {
    setError(null);
    setMessage(null);

    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;

    try {
      const text = await new File(picked.assets[0].uri).text();
      const file: unknown = JSON.parse(text);

      if (isEnvelope(file)) {
        setPending(file as unknown as Backup);
        setAsking('restore');
        return;
      }
      confirmRestore(file as Backup, 0);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  /** Decrypts the pending file, then hands it to the confirmation. */
  async function unlockToRestore() {
    if (!pending) return;
    setBusy('restore');
    setError(null);
    try {
      const opened = await decryptBackup(pending, passphrase, {
        onStage: announce,
        onProgress: setProgress,
      });
      const backup = JSON.parse(opened) as Backup;
      reset();
      confirmRestore(backup, backup.receipts?.length ?? 0);
    } catch (failure) {
      setError((failure as Error).message);
      setNote(null);
      setProgress(null);
    } finally {
      setBusy(null);
    }
  }

  /**
   * The last thing before the ledger is replaced.
   *
   * Deliberately after the decryption rather than before it: a passphrase that
   * turns out to be wrong should not have been preceded by a warning about
   * destroying everything.
   */
  function confirmRestore(backup: Backup, photoCount: number) {
    Alert.alert(
      'Replace everything on this phone?',
      'A restore is not a merge. Every transaction, category, budget, goal and schedule currently on this phone is replaced by the ones in that file.' +
        (photoCount > 0 ? ` ${photoCount} receipt photo${photoCount === 1 ? '' : 's'} will be written back too.` : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setBusy('restore');
            try {
              const result = await restoreBackup(db, backup);
              // Outside the transaction on purpose: a photo that fails to write
              // is one missing image, while a rolled-back restore is the ledger.
              const written = unpackReceipts(backup.receipts ?? []);
              // Settings came from the file too, so re-read them rather than
              // leaving the app showing the replaced phone's currency.
              await update({});
              invalidate();
              setMessage(
                `${result.total} rows restored${written > 0 ? `, and ${written} photo${written === 1 ? '' : 's'}` : ''}.`,
              );
            } catch (failure) {
              setError((failure as Error).message);
            } finally {
              setBusy(null);
              setNote(null);
              setProgress(null);
            }
          },
        },
      ],
    );
  }

  const working = busy !== null;

  return (
    <Screen>
      <SheetHeader title="Backup" accent={Line.green} leading="back" onClose={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {asking === 'export' ? (
          <View style={styles.section}>
            <SectionLabel>Choose a passphrase</SectionLabel>
            <Text variant="body" tone="muted" style={styles.copy}>
              It is not your app lock, and it is not stored anywhere. If you lose it the backup is
              gone — there is no reset, and nobody here can open it for you.
            </Text>
            <TextField
              label="Passphrase"
              value={passphrase}
              onChangeText={setPassphrase}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!working}
              hint={`At least ${MINIMUM_PASSPHRASE} characters. Longer beats stranger.`}
            />
            <TextField
              label="Again"
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!working}
            />
            {photos.count > 0 ? (
              <Text variant="caption" tone="faint" style={styles.copy}>
                {photos.count} receipt photo{photos.count === 1 ? '' : 's'} (
                {Math.max(1, Math.round(photos.bytes / 1024 / 1024))} MB) go inside the encrypted
                file. That is what makes this slow, and what makes a restore complete.
              </Text>
            ) : null}
            <Button
              label={working ? 'Working…' : 'Encrypt and export'}
              onPress={runEncryptedBackup}
              disabled={working}
            />
            <Button label="Cancel" onPress={reset} variant="secondary" disabled={working} showArrow={false} />
          </View>
        ) : asking === 'restore' ? (
          <View style={styles.section}>
            <SectionLabel>That backup is encrypted</SectionLabel>
            <Text variant="body" tone="muted" style={styles.copy}>
              Enter the passphrase it was made with. Nothing on this phone is touched until it
              opens.
            </Text>
            <TextField
              label="Passphrase"
              value={passphrase}
              onChangeText={setPassphrase}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!working}
            />
            <Button
              label={working ? 'Opening…' : 'Open it'}
              onPress={unlockToRestore}
              disabled={working || passphrase.length === 0}
            />
            <Button label="Cancel" onPress={reset} variant="secondary" disabled={working} showArrow={false} />
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <SectionLabel>Take a copy</SectionLabel>
              <Text variant="body" tone="muted" style={styles.copy}>
                A full backup is one file holding every row on this phone, encrypted with a
                passphrase you choose. Keep it somewhere you will still have it if the phone is
                lost — that file is the only copy.
              </Text>
              <Button
                label={busy === 'backup' ? 'Working…' : 'Export a backup'}
                onPress={() => {
                  setError(null);
                  setMessage(null);
                  setAsking('export');
                }}
                disabled={working}
              />
              <Button
                label={busy === 'csv' ? 'Working…' : 'Export transactions as CSV'}
                onPress={runCsv}
                variant="secondary"
                disabled={working}
              />
              <Button
                label="Export unencrypted…"
                onPress={runPlainBackup}
                variant="secondary"
                disabled={working}
                showArrow={false}
              />
              <Text variant="caption" tone="faint" style={styles.copy}>
                The unencrypted file is readable in any text editor, which is occasionally what you
                want and never what you want it to be if you lose it. Photos are not in it.
              </Text>
            </View>

            <View style={styles.section}>
              <SectionLabel>Move to a new phone</SectionLabel>
              <Text variant="body" tone="muted" style={styles.copy}>
                Restoring replaces everything here with the contents of the backup. It is not a
                merge — two ledgers cannot be combined without knowing which version of a row is
                right.
              </Text>
              <Button
                label={busy === 'restore' ? 'Restoring…' : 'Restore from a backup'}
                onPress={pickToRestore}
                variant="danger"
                disabled={working}
                showArrow={false}
              />
            </View>
          </>
        )}

        {note ? (
          <View style={styles.section}>
            <Text variant="body" tone="muted">
              {note}
              {progress !== null ? ` — ${Math.round(progress * 100)}%` : '…'}
            </Text>
            {progress !== null ? (
              <View style={[styles.track, { backgroundColor: theme.rule }]}>
                <View
                  style={[
                    styles.travelled,
                    { backgroundColor: Line.green, width: `${Math.round(progress * 100)}%` },
                  ]}
                />
              </View>
            ) : null}
          </View>
        ) : null}

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
  track: {
    height: Stroke.route,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  travelled: {
    height: '100%',
    borderRadius: Radius.full,
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
