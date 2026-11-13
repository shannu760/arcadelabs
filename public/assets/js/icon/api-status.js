/* Is this the local dev server, or a static deployment?

   When `npm run dev` serves the site it also serves /api on the same origin, so
   a failed API call there means the server is not running and the developer
   needs to start it. On a static host (Vercel and friends) there is no /api at
   all — the call is expected to fail, and telling a visitor to run a command
   would be nonsense. The copy differs; the pages ask this to choose.
*/

export function isLocalHost() {
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);
}
