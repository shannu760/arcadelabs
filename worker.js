/* Static asset Worker for Freebuff Sites.
   Student Icon owns the root; the arcade lives under /arcade/.
   Legacy arcade URLs are redirected permanently so shared links survive. */

const LEGACY_PAGES = {
  '/memory.html': '/arcade/memory.html',
  '/race.html': '/arcade/race.html',
  '/chess.html': '/arcade/chess.html',
  '/labs.html': '/arcade/labs.html',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let target = LEGACY_PAGES[url.pathname];

    if (!target && url.pathname.startsWith('/labs/')) {
      target = `/arcade${url.pathname}`;
    }

    if (target) {
      return new Response(`Moved permanently to ${target}`, {
        status: 308,
        headers: { location: target, 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
