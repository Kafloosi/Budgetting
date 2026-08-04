/**
 * Draws the two enamel surfaces the app is fired on.
 *
 * The world is vitreous enamel, which is never a flat fill: it has a fine
 * sprayed grain and a soft gloss where the light falls. Both are rendered here
 * as transparent overlays so one texture serves any ground colour, and written
 * as PNGs through node's zlib — there is no image tooling on this machine.
 *
 * Re-run with `node scripts/make-textures.mjs`. The outputs are committed.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 1024;

/**
 * Deterministic noise, so re-running the script does not produce a diff.
 * A plain LCG is more than random enough for a sprayed-enamel grain.
 */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/**
 * @param tint      grain colour: light flecks on a dark ground, dark on light
 * @param grain     peak alpha of a fleck, 0-255
 * @param gloss     peak alpha of the highlight, 0-255
 * @param glossTint highlight colour
 */
function enamel({ tint, grain, gloss, glossTint }) {
  const random = makeRandom(0x5eed);
  const data = Buffer.alloc(SIZE * SIZE * 4);

  // The gloss is a wide, soft ellipse up and left of centre — one light source,
  // high and to the side, the way a fired panel hangs on a wall.
  const cx = SIZE * 0.32;
  const cy = SIZE * 0.18;
  const rx = SIZE * 0.95;
  const ry = SIZE * 0.8;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const index = (y * SIZE + x) * 4;

      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const distance = Math.min(1, Math.hypot(dx, dy));
      // Smoothstep falloff: a linear ramp reads as a visible edge.
      const falloff = 1 - distance * distance * (3 - 2 * distance);
      const glossAlpha = falloff * gloss;

      // Two grain octaves: a fine spray plus a slower mottle, so the surface
      // does not read as television static.
      const fine = (random() - 0.5) * 2;
      const mottle = Math.sin(x * 0.021 + y * 0.013) * Math.sin(x * 0.007 - y * 0.019);
      const grainAlpha = Math.max(0, (fine * 0.7 + mottle * 0.3)) * grain;

      const total = Math.min(255, glossAlpha + grainAlpha);
      // Blend the two tints by which one is contributing more.
      const share = glossAlpha / (glossAlpha + grainAlpha || 1);
      data[index] = Math.round(glossTint[0] * share + tint[0] * (1 - share));
      data[index + 1] = Math.round(glossTint[1] * share + tint[1] * (1 - share));
      data[index + 2] = Math.round(glossTint[2] * share + tint[2] * (1 - share));
      data[index + 3] = Math.round(total);
    }
  }

  return data;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(rgba, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(path, rgba) {
  const full = resolve(ROOT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, encodePng(rgba, SIZE));
  console.log(`wrote ${path} (${SIZE}x${SIZE})`);
}

// Midnight enamel: light flecks, a cool white gloss.
write(
  'assets/images/enamel-surface.png',
  enamel({ tint: [180, 200, 255], grain: 12, gloss: 26, glossTint: [120, 160, 255] }),
);

// Porcelain tile: dark flecks in the fired glaze, a warmer gloss.
write(
  'assets/images/porcelain-surface.png',
  enamel({ tint: [10, 19, 48], grain: 9, gloss: 20, glossTint: [255, 255, 255] }),
);
