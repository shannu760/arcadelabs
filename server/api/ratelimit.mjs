/* Shared throttling.

   The counter lives in Postgres (public.icon_throttle), so every instance of
   the API sees the same numbers. When the database is unreachable — or the
   deployment has no database at all — we fall back to this process's memory and
   say so in the log rather than silently turning protection off.

   Keys are built by the caller: `signin:<ip>:<email>`, `signup:<ip>`, and so on.
   A 429 is the only error this module throws on purpose.
*/

import { getDb } from './db.mjs';
import { HttpError } from './http.mjs';

const memory = new Map();

function memoryThrottle(key, max, windowMs) {
  const now = Date.now();
  const bucket = memory.get(key);

  if (!bucket || bucket.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > max) {
    throw new HttpError(429, 'rate_limited', 'Too many attempts. Try again in a few minutes.');
  }
}

function sweep() {
  if (memory.size < 500) return;
  const now = Date.now();
  for (const [key, bucket] of memory) if (bucket.resetAt <= now) memory.delete(key);
}

async function sharedThrottle(key, max, windowMs) {
  const db = await getDb();
  const { rows } = await db.query('select * from public.icon_throttle($1, $2, $3)', [
    key,
    max,
    Math.max(1, Math.ceil(windowMs / 1000)),
  ]);

  const row = rows[0];
  if (!row) return;

  if (!row.allowed) {
    throw new HttpError(429, 'rate_limited', 'Too many attempts. Try again in a few minutes.');
  }

  /* Opportunistic cleanup: one attempt in a hundred clears expired counters.
     Nothing depends on it; it just keeps the table from growing forever. */
  if (Math.random() < 0.01) {
    db.query("delete from public.rate_limits where reset_at < now() - interval '1 day'").catch(
      () => null
    );
  }
}

/** Counts one attempt. Throws HttpError(429) when the key is over its limit. */
export async function throttle(key, max, windowMs) {
  sweep();

  try {
    await sharedThrottle(key, max, windowMs);
    return;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // No database (or no migration yet): keep protecting this process.
    console.warn(`[throttle] shared counter unavailable, using memory: ${err.message}`);
    memoryThrottle(key, max, windowMs);
  }
}

/** Best-effort IP used for throttling. Honours the proxy headers a host sets. */
export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}
