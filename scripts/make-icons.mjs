/**
 * Draws Fare's roundel to the PNGs Expo needs for the icon, the splash and the
 * Android adaptive layers.
 *
 * There is no image tooling on this machine, so the roundel is rasterised here:
 * supersampled 4x and box-filtered down, then written as a plain PNG through
 * node's zlib. Re-run with `node scripts/make-icons.mjs` after changing the
 * mark; the outputs are committed.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ENAMEL = [0x0a, 0x13, 0x30];
const SCARLET = [0xe7, 0x00, 0x2a];
const PORCELAIN = [0xff, 0xff, 0xff];

const SS = 4; // supersampling factor

/**
 * Renders the roundel — ring struck through by a bar — into an RGBA buffer.
 *
 * `scale` is the mark's diameter as a fraction of the canvas, which is how the
 * Android foreground layer keeps clear of the 66% safe zone.
 */
function drawRoundel(size, { background, ring, bar, scale = 0.62 }) {
  const big = size * SS;
  const pixels = new Float32Array(big * big * 4);

  const cx = big / 2;
  const cy = big / 2;
  const outer = (big * scale) / 2;
  const thickness = outer * 0.3;
  const inner = outer - thickness;
  const barHalfHeight = thickness / 2;
  const barHalfWidth = outer * 1.14;

  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const index = (y * big + x) * 4;
      let colour = null;

      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const distance = Math.hypot(dx, dy);

      if (distance <= outer && distance >= inner) colour = ring;
      if (Math.abs(dy) <= barHalfHeight && Math.abs(dx) <= barHalfWidth) colour = bar;

      if (colour) {
        pixels[index] = colour[0];
        pixels[index + 1] = colour[1];
        pixels[index + 2] = colour[2];
        pixels[index + 3] = 255;
      } else if (background) {
        pixels[index] = background[0];
        pixels[index + 1] = background[1];
        pixels[index + 2] = background[2];
        pixels[index + 3] = 255;
      }
    }
  }

  return downsample(pixels, big, size);
}

function solid(size, colour) {
  const data = Buffer.alloc(size * size * 4);
  for (let index = 0; index < size * size; index++) {
    data[index * 4] = colour[0];
    data[index * 4 + 1] = colour[1];
    data[index * 4 + 2] = colour[2];
    data[index * 4 + 3] = 255;
  }
  return data;
}

/** Box filter from the supersampled buffer down to the target size. */
function downsample(pixels, big, size) {
  const out = Buffer.alloc(size * size * 4);
  const samples = SS * SS;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const index = ((y * SS + sy) * big + (x * SS + sx)) * 4;
          const alpha = pixels[index + 3] / 255;
          // Premultiply so transparent pixels do not drag colour toward black.
          r += pixels[index] * alpha;
          g += pixels[index + 1] * alpha;
          b += pixels[index + 2] * alpha;
          a += pixels[index + 3];
        }
      }
      const outIndex = (y * size + x) * 4;
      const alpha = a / samples;
      const coverage = alpha / 255 || 1;
      out[outIndex] = Math.round(r / samples / coverage);
      out[outIndex + 1] = Math.round(g / samples / coverage);
      out[outIndex + 2] = Math.round(b / samples / coverage);
      out[outIndex + 3] = Math.round(alpha);
    }
  }

  return out;
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
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(path, rgba, size) {
  const full = resolve(ROOT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, encodePng(rgba, size));
  console.log(`wrote ${path} (${size}x${size})`);
}

write(
  'assets/images/icon.png',
  drawRoundel(1024, { background: ENAMEL, ring: SCARLET, bar: PORCELAIN, scale: 0.6 }),
  1024,
);
write(
  'assets/images/splash-icon.png',
  drawRoundel(512, { background: null, ring: SCARLET, bar: PORCELAIN, scale: 0.86 }),
  512,
);
write(
  'assets/images/android-icon-foreground.png',
  drawRoundel(1024, { background: null, ring: SCARLET, bar: PORCELAIN, scale: 0.44 }),
  1024,
);
write('assets/images/android-icon-background.png', solid(1024, ENAMEL), 1024);
write(
  'assets/images/android-icon-monochrome.png',
  drawRoundel(1024, { background: null, ring: PORCELAIN, bar: PORCELAIN, scale: 0.44 }),
  1024,
);
write(
  'assets/images/favicon.png',
  drawRoundel(64, { background: ENAMEL, ring: SCARLET, bar: PORCELAIN, scale: 0.66 }),
  64,
);
