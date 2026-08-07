/**
 * Resolves the `@/` path alias so the check scripts can import from `src/`.
 *
 * `tsconfig.json` maps `@/*` to `src/*` and Metro honours it; plain Node does not,
 * which would otherwise mean only alias-free files could be checked. A module
 * resolve hook is the smallest way to close that gap without a bundler.
 *
 * TypeScript extensions are appended here too, because the source omits them.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');

const CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, next) {
  if (!specifier.startsWith('@/')) return next(specifier, context);

  const base = join(SRC, specifier.slice(2));
  for (const suffix of CANDIDATES) {
    const candidate = `${base}${suffix}`;
    if (existsSync(candidate)) {
      return next(pathToFileURL(candidate).href, context);
    }
  }

  return next(specifier, context);
}
