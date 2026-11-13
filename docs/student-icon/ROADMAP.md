# STUDENT ICON — Implementation Roadmap (M2 draft)

Status: **awaiting approval**. Milestones are approved one at a time; each ends with a report and a
check you can run yourself.

---

## Stage 0 — this document set

| | Deliverable | State |
|---|---|---|
| M1 | Repository discovery + interview | done |
| M2 | PRD, architecture, database design, roadmap | **this set — awaiting approval** |

---

## Stage 1 — Foundation (decision D3)

Six increments. Nothing in stage 1 needs AI or chat.

### F1. Route restructure + design layer — **done**

Shipped: arcade moved to `public/arcade/` with rewritten asset paths, 308 redirects for all 10 old
URLs in both `server.mjs` and `worker.js`, new Student Icon landing at `/`, `icon.css` layer.
- Move the arcade to `public/arcade/`, rewrite its relative asset paths, add 308 redirects for old URLs.
- New `public/index.html` = Student Icon landing in the existing pixel language.
- `assets/css/icon.css` built from `pixel.css` tokens: layout grid, stat chips, pixel charts, panels.
- Shared shell: header with rank, XP bar, currency-less wallet, nav, account menu.

**Check:** every arcade page and all 6 lab games still load; old URLs redirect; landing is legible at 390 px.

### F2. Database foundation — **done**

Shipped: `0003_icon_core` (profiles, ranks, append-only XP, achievements), `0004_icon_student`
(skills, learning, attempts, projects, competitions, careers), `0005_icon_startup` (20 industries,
drafts, companies, members, products, employees, customers, events), `0006_icon_finance`
(ledger, posting, launch, valuation, per-currency milestones). Proven by `.labtest/icon.mjs`:
58 checks covering schema, idempotency, RLS isolation, ledger immutability and milestone maths.
- Supabase project wired; migrations `0003`–`0006` applied.
- Ledger invariants and RLS policies in place; `icon_*` functions created.
- Seed data: industries, skills, learning categories, careers, achievements.

**Check:** migrations apply from empty; PGlite/schema tests green; RLS test proves user A cannot read user B's rows.

### F3. Accounts and onboarding (public sign-up, D7) — **in progress**

Shipped so far: a same-origin API (`server/api/`) with session sync, profile read/patch,
public handle lookup, interest/career editing, career catalogue feed, whitelisted field updates,
and a dev-only loopback session mode. It runs on a real Postgres-compatible database (PGlite)
that applies migrations `0003`–`0006` on boot, so every constraint and trigger is exercised.
Proven by `.labtest/api.mjs`: 22 HTTP checks.

Onboarding UI ships at `/onboarding.html` (four steps: identity → profile → focus → ready) in the
pixel design language, with live handle availability, inline validation, interest and career chips,
a summary step, and resume-on-reload from the stored player id. Driven end to end in the browser:
handle created, profile written to Postgres, verification failed paths (invalid + taken handle) block
submission, reload returns to the summary, no horizontal overflow at 390 px. The page never invents
a session: when auth is not the loopback dev mode it shows a locked panel instead.

Accounts are wired: `/api/auth/*` proxies Supabase Auth server-side (sign-up, sign-in, refresh,
sign-out, password reset) and every protected route verifies the bearer token against Supabase. The
browser holds only a session token — the anon key never leaves the server. Onboarding gained step 00
(email + password, confirmation messaging, reset link) and a sign-out control. Proven by
`.labtest/auth.mjs`: 23 HTTP checks against a local stand-in for Supabase Auth
(`.labtest/supabase-stub.mjs`) covering confirmation gating, refresh rotation, replay, sign-out
revocation, throttling, and the refusal of dev identities once real auth is configured.

Configuration is now loaded from the project `.env` (`server/api/env.mjs`, imported first; real
environment variables win so the stubs keep working). `npm run check:auth` reports whether the two
values are present, which project they point at, and whether it is reachable — without printing
secrets. `npm run verify:live` then runs the whole account flow against the hosted project through
our own API: wrong-credential rejection, sign-up, duplicate refusal, confirmation gating, token
verification, profile write, refresh rotation and replay, sign-out revocation.

That verifier is itself tested: `npm run test:live` runs it against the local stub twice — once on a
fresh address that the stub requires to be confirmed (exercising sign-up, duplicate refusal and the
confirmation gate), then again on the same address after confirming it (exercising the token,
profile, refresh and sign-out checks). Its exit codes are meaningful: `0` all passed, `1` a check
failed, `2` the project requires email confirmation so the account-owner half could not run yet.

The public profile page ships at `/{handle}` — a bare handle is rewritten to `profile.html` only when
no file of that name exists, so nothing shadows a real asset. It renders the record (identicon
derived from the handle, display name, rank, XP, bio, education stage, country, interests, career
titles), shows a deterministic pixel avatar, and gives the owner an edit panel that patches the same
whitelisted fields onboarding writes. Visibility is enforced by the API, not the page: an unlisted
profile answers `404` to everyone except its owner, and the page says "no public player" instead of
leaking that the handle exists. Driven in the browser: rendered `@ada`, edited and saved from the
page (name and bio changed in Postgres, "Saved." shown, URL unchanged), flipped to unlisted and
confirmed a signed-out visitor got 404 and the empty state, restored to public, no overflow at
390 px. Onboarding's READY step now links to the profile.

Remaining: point `SUPABASE_URL` + `SUPABASE_ANON_KEY` at a hosted project (the only untested part —
the stub proves our wiring, not Supabase's service), move throttling to a shared counter, let players
edit interests and career paths from the profile page (the API supports it, the UI does not yet),
and settle where the Node API is hosted at launch (Sites hosts static only).
With `SUPABASE_URL` unset the server stays in dev identity mode; `NODE_ENV=production` refuses it.
- Email/password sign-up with verification, sign-in, sign-out, password reset.
- First-run onboarding: handle, display name, avatar, education stage, interests, career interests.
- Profile page, editable, public at `/{handle}`.
- Rate limits and audit entries on every auth-adjacent mutation.

**Check:** sign up → verify → onboard → refresh → still signed in; two accounts cannot see each other's private data; repeated failed logins are throttled.

### F4. Student Universe — **in progress**

Shipped so far: the skill tree read model and page at `/skills.html`. `GET /api/skills` publishes the
catalogue from Postgres — 16 skills across technical (6), business (6) and creative (4) branches,
each capped at 5 levels — and overlays the caller's own levels from `player_skills`, which only the
server writes. Each entry carries `level`, `xp`, `maxLevel`, `nextAtXp` and `progress` using the same
rule `icon_submit_challenge()` applies (one level per three skill XP, capped). The page shows the
three branches, level pips, a progress meter and "N XP to LV n+1", with a signed-out visitor getting
the full tree at zero rather than a locked screen. Profile pages link to it.

Proven by `.labtest/api.mjs` (33 checks): the tree is public and complete, caps are present, a
signed-out caller gets no levels, and a signed-in player gets their own. Also newly covered: profile
page routing (`/{handle}` serves the page, `/ab` does not get rewritten), malformed and too-short
handles rejected with `invalid_handle`, unlisted profiles 404 both with and without a session and
without leaking the handle or display name.

The level mapping lives in `server/api/skills.mjs` and is the one JavaScript copy of the SQL rule
(`1 + floor(xp/3)`, floored at 1, capped at `max_level`). It was wrong at first — the API used
`(level + 1) * 3`, so an untrained skill advertised 3 XP and a level-1 skill 6, while the SQL
promotes at 1 and 3. Fixed, and `.labtest/api.mjs` now tests the mapping directly against a table of
XP totals (0, 1, 2, 3, 5, 6, 9, 12, 41) so the drift cannot come back silently.

The learning half ships too: migration `0007_icon_challenges.sql` seeds nine challenges across nine
categories, each naming a skill, with choice/number/text answers. `GET /api/challenges` publishes
the list without `answer_key` or `explanation`; `POST /api/challenges/:id/submit` requires a session
and calls `icon_submit_challenge()`, which scores, awards XP once, and moves the skill level. The
page at `/learn.html` lists the challenges, opens a brief, submits answers and shows pass/fail, XP,
the new skill level and the explanation only after a pass. Driven in the browser: a wrong answer
failed with no XP, the right one passed, awarded 10 XP and put Programming at level 1, the card was
marked PASSED, a resubmit returned `repeat` without paying again, and the skill tree then showed
`Programming LV 1/5 · 2 XP TO LV 2 · 1 XP` with totals `1/80` levels and `1/16` skills started.

Still to come in F4: higher tiers and more categories, projects (create/edit/publish, public page,
promote-to-venture), and competitions.

- Skill tree with server-awarded levels and visible capped effects.
- Learning: categories, tiers, server-scored challenges, explanations, XP.
- Projects: create/edit/publish, public page, promote-to-venture.

**Check:** finish a challenge → XP lands once, tier unlocks, reload keeps it; promote a project → draft company appears.

### F5. Startup Universe
- 13-step resumable wizard with drafts.
- Launch transaction: company + first product + opening capital entry.
- Dashboard: cash, MRR, expenses, profit, valuation, runway, customers, team, events.
- 4 real industries (SaaS, AI/ML, EdTech, E-commerce); 16 parameterised variants.
- Deterministic hourly tick with 7-day catch-up.

**Check:** launch a company, run 24 ticks, numbers reconcile with the ledger; leave it 3 days, state stays plausible.

### F6. Dual milestone + economy hardening
- Per-currency milestone trackers (valuation vs cumulative revenue, strictly separate).
- Progress pages with verified crossing history.
- Detection of drift: `reconcile_ledger` mismatch fails health check.

**Check:** synthetic run reaching 2B in one currency triggers the correct achievement and not the other; INR and USD never sum; refunds reduce revenue.

---

## Stage 2 — ICON AI (M7)
Orchestrator, provider adapters (local + OpenRouter + test echo), routing config, budget guard,
usage logging, memory tables, SSE streaming, 10 personalities. Every AI surface shows which model
answered.
**Check:** live local completion, live cloud completion, forced-failure fallback, budget refusal.

## Stage 3 — Social (M8)
Discover, friend requests, 1:1 and company chat with realtime, presence, read state, blocking,
reporting, roles with server-side permissions.
**Check:** two browsers, real messages, blocked delivery refused, non-member denied.

## Stage 4 — Content Studio (M9)
Formats, generation, editing, saving, publishing, simulated analytics clearly labelled as simulated.

## Stage 5 — Admin + hardening (M10)
Player/company management, moderation queue, AI spend dashboard, economy settings, audit viewer,
health page.

## Stage 6 — Visual polish and launch (M11–M12)
Landing cinematic sequence, loading experience, motion pass, responsive pass, performance budgets,
accessibility pass, deployment.

---

## Testing strategy (every stage)

| Layer | Tool | What it proves |
|---|---|---|
| Schema + RLS | PGlite / pgTAP-style SQL tests | migrations apply, policies isolate users |
| Domain rules | Node test files | scoring, XP idempotency, ledger invariants, milestone math, tick determinism |
| API | HTTP tests against the running server | auth required, validation, authorization, rate limits |
| UI | browser checks on the preview | flows work end to end, no console errors |
| AI | real provider calls | a response actually came back, and from which model |

A feature is called **working** only after its own layer's check passes. Otherwise it is reported as
prototype / blocked / needs credentials.

---

## Decision log (from the interview)

| # | Decision | Effect on plan |
|---|---|---|
| D1 | Pixel aesthetic everywhere | F1 adds `icon.css` on existing tokens; no new font stack; charts drawn as pixel art |
| D2 | Student Icon at root, arcade kept | F1 includes the move + redirects, verified before anything is deleted |
| D3 | Foundation first, no AI/chat | Stage 1 = F1–F6 |
| D4 | INR and USD, per company | Currency column per company; milestone trackers keyed by currency; no cross-currency sums |
| D5 | Local AI via Ollama | Installed (v0.33.1) but **broken**: `lib/ollama` is empty and `llama-server.exe` is missing, so `/v1/chat/completions` returns 500. Models already cached: gemma4:12b, mistral, llama3.2:3b (13 GB). Runtime repair needed; no model download needed. |
| D6 | Free models + hard cap | Budget guard from the first AI call; fallback ladder mandatory |
| D7 | Public sign-up | F3 carries verification, throttles, moderation hooks |

---

## Known constraints on this machine

- Node 26.5.0, npm 11.17.0, Python 3.14.5 — fine.
- No local PostgreSQL (Supabase cloud is the database).
- **4.3 GB free on C:** (98% full) — a 20B model (~12 GB) will not fit, and a repair download is tight. `llama3.2:3b` is already on disk, so the ready path is repairing the runtime, not pulling more weights.
- Freebuff Sites hosts static assets only; the Node API needs its own host at launch.

---

## Where we are

1. M2 documents approved.
2. F1 shipped and verified (routes moved, redirects, landing).
3. F2 shipped and verified (migrations 0003–0006, 58 checks).
4. **F3 next** — accounts and onboarding. Needs a Supabase project URL plus anon and service-role
   keys; everything else can be built and tested locally first.
