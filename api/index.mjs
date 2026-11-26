/* Vercel entry point for the Student Icon API.

   The same handleApi() the local server mounts on /api, so there is one set of
   routes and no second implementation to keep in step. Vercel's Node runtime
   hands us Node's own req/res, which is exactly what the routes expect, and the
   function sits on the same origin as the pages — no CORS, no API base URL in
   the frontend.

   Storage comes from server/api/db.mjs: without SUPABASE_DB_URL / DATABASE_URL
   it would try an embedded database, which a serverless filesystem cannot
   support, so /api/health is the place to check after deploying.
*/

import { handleApi } from '../server/api/routes.mjs';
import { applySecurityHeaders } from '../server/api/headers.mjs';
import { reportError, watchProcess } from '../server/api/monitor.mjs';

watchProcess();

// The routes read the request body themselves; Vercel must not consume it.
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);

  applySecurityHeaders(res);

  try {
    await handleApi(req, res, url);
  } catch (err) {
    // handleApi turns its own failures into JSON; anything reaching here is a
    // bug, and the message must not reach the client.
    reportError(err, { source: 'vercel', route: `${req.method} ${url.pathname}` });
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { code: 'server_error', message: 'Server error' } }));
    }
  }
}
