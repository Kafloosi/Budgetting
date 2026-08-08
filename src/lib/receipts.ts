/**
 * Receipt photos.
 *
 * The image is copied into the app's own document directory and only its file name
 * goes in the database. Two reasons: the picker hands back a cache URI that the OS
 * is free to delete, and an absolute path recorded today is a broken path after the
 * next install or OS upgrade. The name is resolved against the directory at read
 * time instead.
 *
 * Photos are deliberately *not* in the JSON backup. A single-file export with
 * base64 images turns 200 KB into tens of megabytes, and the failure shows up as a
 * restore that does not work — which is the worst possible moment to find out. The
 * backup screen says so plainly.
 */

import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';

import { newId } from '@/db/util';

const FOLDER = 'receipts';

function folder(): Directory {
  return new Directory(Paths.document, FOLDER);
}

/** The stored file, or null when the row has no receipt or the file has gone. */
function receiptFile(name: string | null): File | null {
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
