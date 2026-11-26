# Student Icon — operations runbook

What to do when something is broken, and how to prove it is fixed. Written for
the person on call, not for a general audience.

Base URL: `https://arcadelabs-eight.vercel.app`

---

## 1. The two services behind the site

| Service | What breaks without it | How to check |
|---|---|---|
| Supabase Auth (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) | Sign-in and sign-up | `GET /api/auth/config` → `{"mode":"supabase","provider":"supabase"}` |
| Supabase Postgres (`SUPABASE_DB_URL`) | Players, XP, projects, arcade sync | `GET /api/health` → `200` with `"db":"postgres"` |

They fail independently. `/api/auth/config` answering does **not** mean the
database is connected, and `/api/health` failing does **not** mean sign-in is
down. Always check both.

A `503` from `/api/health` with `"code":"db_not_configured"` means the
deployment has no `SUPABASE_DB_URL`. Set it in Vercel (Production, Preview and
Development), then redeploy — environment variables are read at boot.

Use the **session pooler** URI for `SUPABASE_DB_URL`
(`aws-0-<region>.pooler.supabase.com:5432`). The direct `db.<ref>.supabase.co`
host is IPv6-only on new projects, and the migration advisory lock needs a
session-mode connection.

### Replacing a deleted project

The previous project (`kxflktuqgmhrqjbrjzng`) no longer resolves — `NXDOMAIN`, so
it was deleted rather than paused. Nothing in the repository has to change; only
three values are new.

1. **Create it.** [supabase.com/dashboard](https://supabase.com/dashboard) →
   **New project**. Name it `student-icon`, choose the closest region, and
   generate the database password. Copy that password somewhere safe now: the
   dashboard will not show it again, and `SUPABASE_DB_URL` needs it.
2. **Copy two public values.** Open the project's **Connect** dialog: it shows
   the project URL and the publishable key. (All keys, legacy and current, are
   under **Settings → API Keys**; there is no separate Settings → API page any
   more.)
3. **Copy the database string.** **Connect** → **Connection string** → **Session
   pooler** → URI. Replace `[YOUR-PASSWORD]`, percent-encoding `&`, `#`, `?` and
   spaces.
4. **Decide on email confirmation.** **Authentication → Providers → Email**.
   With confirmation on, sign-up returns `needsConfirmation`, sign-in fails until
   the link is clicked, and `npm run verify:live` exits `2`. The built-in mailer
   also sends only a few messages an hour, so repeated test sign-ups hit a limit
   that looks like a bug.
5. **Point the auth links at the site.** **Authentication → URL Configuration**:
   Site URL `https://arcadelabs-eight.vercel.app`, and add that origin to the
   redirect allow list. Otherwise confirmation and recovery links go to
   `localhost`.
6. **Fill `.env`** (three lines, never committed): `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` (the `sb_publishable_…` key or the legacy anon JWT — the
   code accepts either), `SUPABASE_DB_URL`.
7. **Verify locally** — `npm run check:auth`, `npm run test:pg -- --write`,
   `npm run dev` + `/api/health`, `npm run verify:live`, `npm run smoke
   http://127.0.0.1:8080`. Only then set the same values in Vercel
   (**Settings → Environment Variables**, all three environments) and redeploy;
   variables are read at boot, so an existing deployment keeps its old ones.

Optional fourth value: `SUPABASE_SERVICE_ROLE_KEY` (the `sb_secret_…` key or the
legacy service_role JWT). It is read only by account deletion, to remove the
Supabase Auth user after the player's rows are gone. Without it, deletion still
removes everything this project owns and says the email account was left behind.

---

## 2. Deploy checklist

1. `npm run test:api && npm run test:auth && npm run test:icon` — all green locally.
2. `npm run test:pg` against the hosted database (see §6).
3. `npm run backup` before a deploy that includes a migration.
4. Deploy.
5. `npm run smoke` — 13 checks; it must print `13/13 checks passed`.
6. Open `/onboarding.html` and confirm the wizard reaches step 01 (not the
   "player database is not connected" panel).
7. Sign in once with a real account and confirm `/api/me` answers `200`.

If step 5 fails on `health + database`, the deploy is up but the database is
not: see §1. Everything else in the smoke test failing at once means the
deployment itself did not ship.

---

## 3. Uptime and the Supabase pause

`.github/workflows/uptime.yml` runs every six hours:

* `scripts/smoke.mjs` against production;
* a `curl` of `/api/health`, which runs a real query.

The second job is the keep-alive. A free Supabase project pauses after about a
week without activity, and a paused project is exactly the outage that once
took sign-in down (the old host answered `NXDOMAIN`). Six-hourly traffic keeps
it awake.

To get notified, add a repository secret `ALERT_WEBHOOK` holding a Slack (or
compatible) incoming-webhook URL. Without it, a failure still appears as a red
run in the Actions tab; nothing emails you.

The workflow can be run by hand (Actions → uptime → Run workflow) with any
`base_url`, which makes it usable against a preview deployment.

---

## 4. Backups and restore

```bash
SUPABASE_DB_URL='postgres://…' npm run backup
# .backups/<timestamp>/manifest.json + one JSON file per public table

SUPABASE_DB_URL='postgres://…' npm run restore -- .backups/<timestamp> --yes
```

* The backup is **logical**: application rows only. It is not a substitute for
  the provider's point-in-time backups (Supabase dashboard → Database → Backups).
* `.backups/` is gitignored because it contains personal data. Keep it out of the
  repository and delete it when it is no longer needed.
* Restore truncates every table in the manifest and refills it inside one
  transaction. A failure rolls back and changes nothing.
* Take a fresh backup immediately before any restore.

Migration rollback: there is no down-migration. Migrations are additive
(`0001`–`0008`); to undo one, restore a backup taken before it ran.

---

## 5. Migrations

Migrations live in `supabase/migrations/` and are applied by the API on boot,
under `pg_advisory_lock(727272)`, recorded in `public.icon_migrations`. Adding a
file to `MIGRATIONS` in `server/api/db.mjs` is what makes it run.

`0001` and `0002` are the arcade's own schema. They were applied by hand before
this API existed, so they are listed first and are idempotent: the first boot
that sees them records them in `public.icon_migrations` without changing
anything.

`/api/health` reports `migrations: '0001-0008'` — the range the code expects,
not a live count. After adding `0009`, update that string in
`server/api/routes.mjs`.

Two rules, learned the hard way:

* keep migrations idempotent (`create table if not exists`, `on conflict do
  nothing`), because a cold start can overlap another cold start;
* never edit an applied migration. Add a new one.

---

## 6. Testing against the real database

`npm run test:api` and friends run on PGlite. `npm run test:pg` runs the read
checks against whatever `SUPABASE_DB_URL` points at, and `-- --write` also
creates a disposable player, project and interest and rolls them back.

A `SKIP` line about `auth.users` permissions is honest, not a pass: the
connection is not allowed to create auth users, so the write path is unverified.

The full account flow against the live project is `npm run verify:live`. Exit
code `2` means the project requires email confirmation, so the second half of
the flow could not run without a real inbox.

---

## 7. Abuse controls

| Control | Where | Notes |
|---|---|---|
| Shared throttling | `public.icon_throttle()` + `server/api/ratelimit.mjs` | Per key, in Postgres, so it holds across instances. Falls back to process memory (and logs) if the database is unreachable. |
| Reserved handles | `public.reserved_handles` | `admin`, `support`, `studenticon`, … Refused at `/api/session/sync` with `handle_reserved`. Add rows directly; no deploy needed. |
| Turnstile | `server/api/auth-routes.mjs` | Off until `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` are set. Then a sign-up without a valid token is refused. |
| Password rules | `MIN_PASSWORD = 8`, Supabase's own policy | Sign-in and reset are throttled by IP and by IP+email. |

Throttle keys in use: `signup:<ip>`, `signin:<ip>:<email>`, `recover:<ip>`,
`email-change:<userId>`, `delete:<userId>`, `errors:<ip>`.

If a legitimate user is locked out, delete their row:
`delete from public.rate_limits where key like 'signin:%:<email>';`

---

## 8. Security headers and CSP

One policy, three places that must stay in step:

* `vercel.json` → `headers` (production);
* `server/api/headers.mjs` (local server and the Vercel function);
* `worker.js` (Sites deployment).

The policy allows inline scripts because each page has one
(`document.documentElement.classList.add('js')`). Removing `'unsafe-inline'`
means hashing or nonce-ing that line; until then, an injected inline script
would not be blocked, although third-party script origins are restricted.

Check after a deploy: `curl -sI https://arcadelabs-eight.vercel.app | grep -i
content-security-policy`. `npm run smoke` fails if the header is missing.

---

## 9. Ads and consent

AdSense is **not** loaded from the HTML any more. `public/assets/js/consent.js`
asks first and only then injects the loader; `ad-units.js` fills a unit only
when consent is granted **and** `data-ad-slot` holds a real numeric slot ID.
With the slots empty the boxes stay hidden, which is the correct state until
slot IDs from the AdSense account are pasted into the two pages.

Choices are stored as `si.consent.v1` in local storage. "Cookie settings" on
`/privacy.html` (or any URL with `?consent=reset`) clears it and asks again.

Never add the AdSense loader back to the HTML directly — it would load before
consent and break both the policy and the promise on the privacy page.

---

## 10. Error reporting

* Server: every unexpected failure is one JSON line (`level:"error"`), and if
  `SENTRY_DSN` is set, also an event sent server-side. No browser-side Sentry
  SDK is shipped.
* Client: `public/assets/js/monitor.js` posts to `/api/errors` (capped at five
  per page load). The route writes the line and, when a database is connected,
  a row in `public.error_reports`.

Useful queries:

```sql
select created_at, source, message, url
  from public.error_reports
 order by created_at desc
 limit 50;

select count(*) from public.error_reports where created_at > now() - interval '1 day';
```

Rows are kept forever today; trim them when the table gets large
(`delete from public.error_reports where created_at < now() - interval '90 days';`).

---

## 11. Common incidents

**Sign-in says "Could not reach Supabase Auth (network error)".**
The Supabase project is paused or deleted. Check the project in the dashboard;
restore or unpause it. `GET /api/auth/config` will still answer `mode:"supabase"`
because that only reports configuration, so check sign-in itself.

**"The player database is not connected".**
`SUPABASE_DB_URL` is missing or wrong. `/api/health` gives the exact code:
`db_not_configured` (unset), `auth_unreachable` (bad credentials/host) or a
`500` (the connection is fine but a query failed — read the log line).

**The wizard is locked but accounts work.**
That is the database, not auth: onboarding hides every step when `/api/health`
is not `200`. See above.

**Delete account leaves the email behind.**
Expected without `SUPABASE_SERVICE_ROLE_KEY`. Player data is gone; the auth user
is not. Set the key (server-side only) to let the API remove it too.

**`/api/me` 401 after a long session.**
The access token expired and the refresh token was rejected — sign in again.
`session.js` refreshes automatically while the refresh token is valid.

---

## 12. Known gaps

Honest list, so nobody assumes otherwise:

* No automated browser test in CI. The suites are HTTP-level plus PGlite.
* `'unsafe-inline'` in the CSP (see §8).
* No moderation queue or report flow for handles, projects or profiles.
* No email sending of our own: confirmation and reset mail come from Supabase.
* The API has one region and no read replica; the pool caps at three
  connections, which is enough for this size and not for a launch spike.
