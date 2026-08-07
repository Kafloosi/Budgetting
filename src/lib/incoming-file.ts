/**
 * A file handed to Fare by another app.
 *
 * Different from a file the user picked, in one way that matters: nobody chose
 * it inside Fare, so nothing about it has been looked at. It is checked for size
 * before it is read, because `File.text()` on something large enough is a crash
 * rather than an error message, and it is deleted afterwards, because iOS leaves
 * received documents sitting in the app's Inbox until something removes them.
 */

import { File } from 'expo-file-system';

/**
 * Two orders of magnitude above a year of statements, and far below anything
 * that costs memory. A real monthly export is tens of kilobytes.
 */
export const MAX_INCOMING_BYTES = 10 * 1024 * 1024;

export interface IncomingFile {
  name: string;
  text: string;
}

/** Refused for a reason the user can act on, rather than a stack trace. */
export class IncomingFileError extends Error {}

export async function readIncomingFile(uri: string): Promise<IncomingFile> {
  const file = new File(uri);

  if (!file.exists) {
    throw new IncomingFileError('That file is no longer there.');
  }

  if (file.size > MAX_INCOMING_BYTES) {
    const megabytes = Math.round(file.size / (1024 * 1024));
    throw new IncomingFileError(
      `${file.name} is ${megabytes} MB. A statement is normally a few hundred kilobytes, so this is not one.`,
    );
  }

  const name = file.name;
  const text = await file.text();

  // Best effort. A copy left behind is untidy rather than dangerous, and on
  // Android the URI often belongs to the sending app and is not ours to remove.
  try {
    file.delete();
  } catch {
    // Nothing to do about it, and nothing that depends on it having worked.
  }

  return { name, text };
}
