/* A stand-in for Supabase Auth, for local verification only.

   This is NOT Supabase. It speaks the small part of the GoTrue REST surface
   that Student Icon uses (signup, token, user, logout, recover) so the real
   integration code can be exercised without a hosted project. It exists to
   prove our wiring, error mapping and throttling; it says nothing about the
   hosted service, and the app never talks to it unless SUPABASE_URL points
   here.

   Run standalone:  node .labtest/supabase-stub.mjs
*/

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.STUB_PORT || 8101);
const APIKEY = process.env.STUB_ANON_KEY || 'test-anon-key';

const users = new Map(); // email -> { id, password, confirmed }
const accessTokens = new Map(); // access token -> email
const refreshTokens = new Map(); // refresh token -> email

const json = (res, status, body) => {
  const payload = JSON.stringify(body ?? {});
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
};

const readBody = async (req) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const issue = (email) => {
  const user = users.get(email);
  const access = `at_${randomUUID()}`;
  const refresh = `rt_${randomUUID()}`;
  accessTokens.set(access, email);
  refreshTokens.set(refresh, email);
  return {
    access_token: access,
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: refresh,
    user: { id: user.id, aud: 'authenticated', email },
  };
};

const bearer = (req) => {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

export const startStub = (port = PORT) =>
  new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      const path = url.pathname.replace(/\/+$/, '');
      const method = (req.method || 'GET').toUpperCase();

      if (req.headers.apikey !== APIKEY) {
        return json(res, 401, { message: 'Invalid API key' });
      }

      if (path === '/auth/v1/signup' && method === 'POST') {
        const { email, password } = await readBody(req);
        if (!email || !password) return json(res, 422, { msg: 'Email and password are required' });
        if (users.has(email)) {
          return json(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
        }
        const id = randomUUID();
        // STUB_AUTOCONFIRM=1 mirrors a project with "Confirm email" switched off:
        // GoTrue returns a full session straight away instead of a bare user.
        const autoConfirm = process.env.STUB_AUTOCONFIRM === '1';
        users.set(email, { id, password, confirmed: autoConfirm });
        if (autoConfirm) return json(res, 200, issue(email));
        // No access_token: Supabase returns without a session when it requires
        // email confirmation, which is exactly what our route keys off.
        return json(res, 200, { id, aud: 'authenticated', email, confirmation_sent_at: new Date().toISOString() });
      }

      if (path === '/auth/v1/token' && method === 'POST') {
        const grant = url.searchParams.get('grant_type');
        const body = await readBody(req);

        if (grant === 'refresh_token') {
          const email = refreshTokens.get(body.refresh_token);
          if (!email) return json(res, 400, { error_code: 'invalid_grant', msg: 'Invalid Refresh Token' });
          refreshTokens.delete(body.refresh_token);
          return json(res, 200, issue(email));
        }

        const email = String(body.email || '').toLowerCase();
        const user = users.get(email);
        if (!user || user.password !== body.password) {
          return json(res, 400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        }
        if (!user.confirmed) {
          return json(res, 400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
        }
        return json(res, 200, issue(email));
      }

      if (path === '/auth/v1/user' && method === 'GET') {
        const email = accessTokens.get(bearer(req));
        if (!email) return json(res, 401, { msg: 'Invalid or expired token' });
        const user = users.get(email);
        return json(res, 200, { id: user.id, aud: 'authenticated', email });
      }

      if (path === '/auth/v1/logout' && method === 'POST') {
        accessTokens.delete(bearer(req));
        res.writeHead(204);
        return res.end();
      }

      if (path === '/auth/v1/recover' && method === 'POST') {
        await readBody(req);
        return json(res, 200, {});
      }

      // Test-only helper: click the confirmation link.
      if (path === '/auth/v1/admin/confirm' && method === 'POST') {
        const { email } = await readBody(req);
        const user = users.get(String(email || '').toLowerCase());
        if (!user) return json(res, 404, { msg: 'No such user' });
        user.confirmed = true;
        return json(res, 200, { ok: true });
      }

      return json(res, 404, { msg: 'Not found' });
    });

    server.listen(port, '127.0.0.1', () => resolve(server));
  });

if (process.argv[1]?.endsWith('supabase-stub.mjs')) {
  startStub().then(() => console.log(`supabase stub listening on ${PORT}`));
}
