import './server/api/env.mjs'; // must come first: loads .env before config is read
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { handleApi } from './server/api/routes.mjs';
import { authMode } from './server/api/auth.mjs';

const root = resolve(process.argv[2] || 'public');
const port = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/* The arcade moved to /arcade/ in F1 of Student Icon. Old links keep working. */
const LEGACY_PAGES = new Map([
  ['/memory.html', '/arcade/memory.html'],
  ['/race.html', '/arcade/race.html'],
  ['/chess.html', '/arcade/chess.html'],
  ['/labs.html', '/arcade/labs.html'],
]);

/* /ada is a player, not a file. Bare handles render the profile page; the
   page itself reads the handle out of the URL. */
const HANDLE_PATH = /^\/[a-z0-9_]{3,20}$/;

function legacyRedirect(pathname) {
  if (LEGACY_PAGES.has(pathname)) return LEGACY_PAGES.get(pathname);
  if (pathname.startsWith('/labs/')) return `/arcade${pathname}`;
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const moved = legacyRedirect(pathname);
    if (moved) {
      res.writeHead(308, { location: moved, 'content-type': 'text/plain; charset=utf-8' });
      res.end(`Moved permanently to ${moved}`);
      return;
    }

    if (HANDLE_PATH.test(pathname)) {
      const candidate = normalize(join(root, pathname));
      const exists = await stat(candidate).catch(() => null);
      if (!exists) pathname = '/profile.html';
    }

    const filePath = normalize(join(root, pathname));
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    // Same-origin API. Handled before the static lookup so no file shadows it.
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': TYPES[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

server.listen(port, '127.0.0.1', { reuseAddress: true }, () => {
  console.log(`dev server → http://127.0.0.1:${port}/ (root: ${root})`);
  console.log(
    authMode() === 'supabase'
      ? 'accounts → Supabase (bearer tokens verified per request)'
      : 'accounts → loopback dev identity (SUPABASE_URL / SUPABASE_ANON_KEY not set)'
  );
});