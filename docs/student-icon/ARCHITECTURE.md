# STUDENT ICON — System Architecture (M2 draft)

Status: **awaiting approval**.

---

## 1. Runtime topology

```
                 ┌──────────────────────────────────────────────┐
   browser  ───► │  static frontend  (public/, no build step)   │
                 │  Student Icon shell  ·  /arcade/ (untouched) │
                 └───────────────┬──────────────────────────────┘
                                 │  fetch (JSON, SSE for AI)
                                 ▼
                 ┌──────────────────────────────────────────────┐
                 │  Node 26 API — Fastify  ·  server/api        │
                 │  auth verify · game rules · economy · AI      │
                 │  holds SUPABASE_SERVICE_ROLE_KEY (server only)│
                 └───────┬───────────────────────┬──────────────┘
                         │                       │
                         ▼                       ▼
        ┌────────────────────────────┐   ┌──────────────────────┐
        │ Supabase                   │   │ AI providers          │
        │ Postgres + RLS             │   │ · Ollama  (local)     │
        │ Auth (email/password)      │   │ · OpenRouter (cloud)  │
        │ Realtime (channels)        │   └──────────────────────┘
        │ Storage (avatars, logos)   │
        └────────────────────────────┘
```

Why this shape:
- The frontend stays dependency-free and instant, matching what exists.
- One Node process owns every rule that can move money. Nothing else can.
- Supabase supplies the three hard things (Postgres, auth, realtime) without us building them,
  and the repo already targets it (`supabase/migrations/0001`, `0002`).
- AI providers are behind an adapter so the game never depends on which one answered.

---

## 2. Route plan (D2: Student Icon at root, arcade preserved)

```
public/
  index.html                 → Student Icon: landing
  app/                       → Student Icon views (static HTML shells + ES modules)
    onboarding.html  student.html  skills.html  projects.html
    startup.html  company.html  milestones.html  discover.html
  arcade/                    → moved arcade (memory, race, chess, labs/*)
  assets/
    css/pixel.css            → shared design tokens (unchanged)
    css/icon.css             → Student Icon layout layer
    js/icon/                 → Student Icon modules
      core/ (api, session, store, router, ui)
      views/ (onboarding, student, skills, projects, startup, company, milestones)
      ai/  (client streaming only — never model logic)
  assets/js/arcade/**        → untouched
```

Arcade relocation is a one-time, reviewable change:
1. `git mv` arcade pages into `public/arcade/`.
2. Rewrite `./assets/...` → `../assets/...` inside those pages (relative links only).
3. Old URLs (`/memory.html`, `/labs.html`, …) get 308 redirects in `server.mjs` and in `worker.js`
   so shared links and the arcade's own history keep working.
4. Verify every arcade page and all 6 lab games still load before deleting anything.

No arcade game logic is edited during the move.

---

## 3. Frontend conventions

- ES modules, no bundler, no framework — consistent with the existing codebase.
- Each view = one HTML shell + one module exporting `mount(root, ctx)`.
- Shared state in a single store module; no direct DOM access outside view modules.
- `ui.js` provides: toast, modal, confirm, field, pixel-button, stat-chip, pixel chart.
- Server is the only source of truth; the client store holds a cache and never computes balances.
- Rendering is escaped by default (`textContent`, or the `h()` helper); user data never reaches `innerHTML`.

---

## 4. API surface (v1)

All routes under `/api`. JSON in, JSON out. `204` for deletes. Errors: `{ error: { code, message } }`.

```
POST   /api/session/sync                → create/sync profile after sign-in
GET    /api/me                          → identity + rank + XP + reputation + currency summary
PATCH  /api/me                          → profile edits
POST   /api/me/avatar                   → signed upload URL (Storage)
GET    /api/skills                      → tree + my levels + effects
GET    /api/learning/:category          → challenge set for my tier
POST   /api/learning/:id/submit         → server-scored result, XP award (idempotent)
GET    /api/projects                    → mine + public
POST   /api/projects                    → create
PATCH  /api/projects/:id                → edit
POST   /api/projects/:id/promote        → draft company
GET    /api/startups/drafts             → resumable wizard drafts
PUT    /api/startups/drafts/:id         → save step
POST   /api/startups                    → launch company (single transaction)
GET    /api/companies                   → mine
GET    /api/companies/:id               → dashboard snapshot
POST   /api/companies/:id/actions       → simulate an action (price, hire, campaign…)
GET    /api/companies/:id/ledger        → paginated transactions
GET    /api/milestones                  → per-currency progress + verified history
GET    /api/discover                    → public projects/companies
POST   /api/reports                     → abuse report
GET    /api/health                      → build + DB + AI provider status
```

Stage two adds `/api/ai/*` (SSE) and `/api/chat/*`.

Every mutating route requires: valid session → rate limit → schema validation → authorization →
domain rule → transaction → audit entry.

---

## 5. Identity and sessions

- Supabase Auth (email + password, email verification on).
- The browser never talks to Supabase and never holds the anon key. It calls our own
  `/api/auth/{signup,signin,refresh,signout,recover}`, which proxy Supabase Auth server-side and
  return only a session (access token, refresh token, expiry, `user.id`).
- Each API call sends `Authorization: Bearer <access token>`. Node verifies it by calling Supabase's
  `/auth/v1/user` — no signing keys, JWKS cache or JWT library live in this repo — and takes the
  returned id as `user_id`. A Supabase outage fails closed as `401`.
- Server-side authorization is mandatory even though RLS also exists — defence in depth, because the
  service role bypasses RLS.
- Tokens are refreshed shortly before expiry; a dead refresh token clears the session and returns the
  player to step 00. Failed sign-ins are throttled per IP + email, in memory — a multi-instance
  launch needs a shared counter.
- With `SUPABASE_URL` unset the server falls back to a loopback-only dev identity (`x-dev-user`);
  `NODE_ENV=production` refuses it outright.

---

## 6. Server authority for the economy

```
ledger_transactions (append-only)
  id, company_id, user_id, kind, amount_minor, currency,
  balance_after_minor, ref_type, ref_id, idempotency_key, created_at
```

- `amount_minor` is a **bigint in paise/cents**. No floats anywhere in money code.
- Posting a transaction and updating `companies.cash_minor` happen in one SQL transaction.
- `idempotency_key` is unique per (company, key) so a double-click cannot double-charge.
- Revenue is only counted when a `sale` transaction is posted; refunds post negative sales.
- Valuation is computed on demand:
  `valuation = max(revenue_multiple × trailing_revenue, profit_multiple × annualised_profit, asset_floor)`
  with multipliers from a config table — never stored as a mutable number.

`companies.cash_minor` is a cached projection; a `reconcile_ledger()` function recomputes it from the
ledger and any drift is a bug surfaced in the health check.

---

## 7. Simulation tick

- Server-driven, hourly, plus catch-up when a company is opened.
- Deterministic: `seed = hash(company_id, tick_index)`; the same seed and actions replay identically.
- A tick writes a `game_events` row and never writes a ledger entry directly without a transaction.
- Max catch-up 168 ticks (7 days); beyond that the company is "dormant" and resumes gently.

---

## 8. ICON AI orchestration (stage two)

```
/api/ai/ask  →  orchestrator
                 ├─ intent + context assembly (player, company, skills, objectives)
                 ├─ route: deterministic | local | cloud
                 ├─ provider adapter (OpenAI-compatible contract)
                 ├─ retry / fallback ladder
                 ├─ budget guard (per user/day and per month)
                 ├─ usage log (tokens, model, latency, cost)
                 └─ stream (SSE) or single response
```

- Providers: `ollama` (`LOCAL_AI_BASE_URL`), `openrouter` (`OPENROUTER_API_KEY`), `echo` (offline
  fake used only in tests and clearly labelled).
- Routing table lives in config, not code, so models can be swapped without touching game logic.
- Free-tier models return 429 frequently; the ladder is: chosen free model → next free model →
  local model → "degraded: explain what to do" deterministic answer.
- The AI has **no write path** to the database. It can propose; a server rule validates and applies.
- Budget: `AI_MONTHLY_BUDGET_USD` (default 5) checked before every call; exceeded → hard 402 with a
  clear message, never a silent fallback to a paid model.

Memory (stage two): `ai_memory` rows (profile facts, decisions, objectives) + embeddings in pgvector;
retrieval is scoped by `user_id` and company membership, and never crosses accounts.

---

## 9. Realtime

- Supabase Realtime channels: `dm:{a}:{b}`, `company:{id}`.
- Authorization is per channel and enforced by RLS on the underlying tables; the client cannot
  subscribe to a room it can't read.
- Presence for online status; typing indicators are ephemeral broadcast, not rows.
- Messages are rows first, delivered second: always fetch-then-subscribe so reload is consistent.

---

## 10. Storage

- `avatars/{user_id}/…`, `logos/{company_id}/…`, `content/{user_id}/…`.
- Uploads go through signed URLs issued by the API after validation (size, mime).
- Public read for avatars/logos; everything else private and served via signed URL.

---

## 11. Security checklist (applies from stage one)

| Risk | Control |
|---|---|
| Key leakage | `.env` only, server-side; `.gitignore`d; never imported by browser code |
| Token forgery | JWT verified against Supabase JWKS; `sub` is the only identity source |
| Cross-user reads | RLS + explicit `user_id` scoping in every query |
| Money tampering | Append-only ledger, server-computed totals, unique idempotency keys |
| Spam / abuse | Per-route rate limits, per-day action caps, report + block |
| Injection | Parameterised SQL only; zod-style schema validation at the edge |
| XSS | No `innerHTML` with user data; escape by default |
| Public sign-up abuse | Email verification, IP + account throttles on auth |

---

## 12. Environment matrix

| Variable | Where | Used by |
|---|---|---|
| `OPENROUTER_API_KEY` | `.env` (server) | AI adapter |
| `OPENROUTER_BASE_URL` | `.env` | AI adapter |
| `AI_MONTHLY_BUDGET_USD` | `.env` | budget guard |
| `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` | `.env` | Ollama adapter |
| `DATABASE_URL` | `.env` (server) | migrations, tests |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `.env` (server) | account proxy, token verification |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` (server only) | API writes |

---

## 13. Deployment

- Stage one runs locally: `node server.mjs` (static) + `node server/api/index.mjs` (API) + Supabase cloud.
- Sites/Cloudflare can host the static frontend but **not the Node API** — so production needs one
  small Node host (Render/Railway/Fly free tier) or a migration of the API into Supabase Edge
  Functions later. Decision deferred to M14, as agreed.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Sign-up spam now public | verification + throttles from day one |
| Free-model outages | fallback ladder + deterministic degraded answers |
| Economy tuning makes ₹2B trivial or impossible | calibration script that simulates 18 months before launch |
| Scope creep across 20 industries | 4 real, 16 parameterised |
| Arcade breakage during move | move + verify in one commit, old URLs redirected |
| Pixel design hurting readability at scale | strict type/contrast rules, 390 px checks |
