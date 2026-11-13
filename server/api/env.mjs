/* Minimal .env loader.

   Imported for its side effect, first, in server.mjs — before any module that
   reads configuration while it is being evaluated (db.mjs resolves its
   database path at import time).

   Variables already present in the environment win. That matters for the test
   suites: they spawn the server with a stub SUPABASE_URL, and the loader must
   not quietly replace it with whatever is in .env.

   No dependency, no interpolation, no multiline values — this file holds
   simple KEY=value pairs, and anything fancier should be set in the real
   environment instead.
*/

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function parseEnv(text) {
  const out = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const split = withoutExport.indexOf('=');
    if (split < 1) continue;

    const key = withoutExport.slice(0, split).trim();
    let value = withoutExport.slice(split + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

export function loadEnvFile(path) {
  if (!existsSync(path)) return false;

  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return false;
  }

  for (const [key, value] of Object.entries(parseEnv(text))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return true;
}

export const envFileLoaded = loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
