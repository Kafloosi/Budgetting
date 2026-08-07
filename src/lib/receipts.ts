/**
 * Receipt photos.
 *
 * The image is copied into the app's own document directory and only its file name
 * goes in the database. Two reasons: the picker hands back a cache URI that the OS
 * is free to delete, and an absolute path recorded today is a broken path after the
 * next install or OS upgrade. The name is resolved against the directory at read
 * time instead.
 *
 * Photos travel *inside* the encrypted backup, as base64. They were left out
 * while the backup was plaintext, for size — but a photograph of a receipt is
 * exactly the kind of thing the encryption exists for, and a restore that
 * silently drops it hands the user a ledger with holes in it. The size is real
 * and the export says so before it starts.
 */

import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';

import { newId } from '@/db/util';
import { isSafeReceiptName, type ReceiptEntry } from '@/lib/backup-format';

const FOLDER = 'receipts';

function folder(): Directory {
  return new Directory(Paths.document, FOLDER);
}

/** The stored file, or null when the row has no receipt or the file has gone. */
export function receiptFile(name: string | null): File | null {
  if (!name) return null;
  const file = new File(folder(), name);
  return file.exists ? file : null;
}

export function receiptUri(name: string | null): string | null {
  return receiptFile(name)?.uri ?? null;
}

/**
 * Copies a picked image in and returns the name to store.
 *
 * A fresh id rather than the original file name: two photos called `IMG_0001.jpg`
 * would otherwise overwrite each other, and the name a camera roll chose is not
 * information worth keeping.
 */
async function keep(uri: string): Promise<string> {
  const directory = folder();
  if (!directory.exists) directory.create({ intermediates: true });

  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  const name = `${newId()}.${extension && extension.length <= 5 ? extension : 'jpg'}`;
  new File(uri).copy(new File(directory, name));
  return name;
}

/** Asks for the library, picks one image, keeps it. Null when cancelled or refused. */
export async function pickReceipt(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    allowsMultipleSelection: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return keep(result.assets[0].uri);
}

/** Same, from the camera. */
export async function shootReceipt(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return keep(result.assets[0].uri);
}

/**
 * Deletes the image behind a row.
 *
 * Called when a receipt is replaced or removed. Not called on a soft delete — the
 * row is recoverable from the trash for 30 days and should come back with its photo.
 */
export function discardReceipt(name: string | null): void {
  const file = receiptFile(name);
  if (file) file.delete();
}

/**
 * Every stored photo, base64'd, for the encrypted backup.
 *
 * Read one at a time and reported as it goes, because this is the slow half of
 * an export and a progress bar that sits at zero for forty seconds is a hung app
 * as far as anyone can tell.
 */
export async function packReceipts(
  onProgress?: (done: number, total: number) => void,
): Promise<ReceiptEntry[]> {
  const directory = folder();
  if (!directory.exists) return [];

  const files = directory.list().filter((entry): entry is File => entry instanceof File);
  const packed: ReceiptEntry[] = [];

  for (const [index, file] of files.entries()) {
    // A name this app did not write cannot come back out of a restore, so there is
    // no point carrying it in. Skipped rather than refused: the export must not
    // fail because something else dropped a file in the folder.
    if (isSafeReceiptName(file.name)) {
      packed.push({ name: file.name, base64: await file.base64() });
    }
    onProgress?.(index + 1, files.length);
  }
  return packed;
}

/**
 * Writes photos back from a backup. Returns how many landed.
 *
 * Called after the rows are in, and deliberately not inside the database
 * transaction: a photo that fails to write is a missing image on one row, while
 * a rolled-back restore is the whole ledger gone.
 */
export function unpackReceipts(receipts: readonly ReceiptEntry[]): number {
  if (receipts.length === 0) return 0;

  const directory = folder();
  if (!directory.exists) directory.create({ intermediates: true });

  let written = 0;
  for (const receipt of receipts) {
    // Validated already, and checked again here: this name is about to be joined
    // onto a path, and the two call sites are far enough apart to be edited
    // separately.
    if (!isSafeReceiptName(receipt.name)) continue;

    const file = new File(directory, receipt.name);
    if (file.exists) file.delete();
    file.create();
    file.write(receipt.base64, { encoding: 'base64' });
    written++;
  }
  return written;
}

/** Total bytes held in receipts, for the backup screen's warning. */
export function receiptsSize(): { count: number; bytes: number } {
  const directory = folder();
  if (!directory.exists) return { count: 0, bytes: 0 };

  let count = 0;
  let bytes = 0;
  for (const entry of directory.list()) {
    if (entry instanceof File) {
      count++;
      bytes += entry.size ?? 0;
    }
  }
  return { count, bytes };
}
