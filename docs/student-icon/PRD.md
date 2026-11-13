# STUDENT ICON — Product Requirements Document (M2 draft)

Status: **awaiting approval**. Nothing here is built yet.
Owner: you. Author: Buffy. Date: 2026-11-09.

---

## 1. Vision

A persistent virtual universe where an ordinary student learns, builds skills, creates projects,
founds companies, hires, markets, competes and grows a business until they are a global icon —
with one AI (ICON AI) woven through both halves of the world.

The design rule that governs every decision below:

> **A game engine with AI attached — not a chatbot with a game interface.**

The second rule:

> **The two universes are one save file.** Skills, projects, reputation and relationships earned as a
> student are the resources spent as a founder. If a feature doesn't feed the other universe, it is
> decoration and gets cut.

---

## 2. Decisions locked in this round

| # | Decision | Your answer | Consequence |
|---|---|---|---|
| D1 | Visual identity | **Pixel aesthetic across all of Student Icon** | Reuse `pixel.css` tokens; "premium" is achieved through layout, density, motion and data visualisation, not a new font stack. |
| D2 | Repo shape | **Same repo, Student Icon at root, arcade preserved and linked** | Root becomes Student Icon; arcade relocates to `/arcade/` with old URLs redirected. Its games keep working unchanged. |
| D3 | Stage-one scope | **Foundation**: accounts, student profile, skills, projects, startup wizard, dashboard, ledger, dual milestones | No AI and no chat in stage one. They land on a stable, server-authoritative base. |
| D4 | Currency | **Both INR and USD permanently available, chosen per company** | Currency is a property of a company, not of the player; all money is stored with its currency and never summed across currencies. |
| D5 | Local AI | **Install Ollama and pull a small model** | Ollama 0.33.1 is already installed here, but the runtime binary (`llama-server.exe`) is missing, so it cannot serve yet. Three models are already cached (gemma4:12b, mistral, llama3.2:3b — 13 GB), so only the runtime needs repair; no model download is required. Layer 1 counts as working only after a real completion returns. |
| D6 | AI budget | **Free OpenRouter models during development + hard spend cap from day one** | Multi-model fallback is mandatory (free pools return 429s); the orchestrator refuses to exceed the cap. |
| D7 | Audience | **Public sign-up from day one** | Email verification, rate limiting, abuse handling and moderation are stage-one requirements, not later polish. |

---

## 3. Users

**Primary:** a student (16–26) who wants to test whether they could build something real.
**Secondary:** a young founder using the simulation to rehearse decisions.
**Tertiary:** a curious visitor who plays the arcade and discovers the universe.

Accounts are real and public. There is no anonymous mode inside Student Icon (the arcade stays
account-free, exactly as it is today).

---

## 4. Universe A — Student Life

### A1. Identity
Player profile: display name, handle, avatar (pixel sprite composer or uploaded image), bio, country,
education stage, interests, career interests, joined date, visibility (`public` / `unlisted`).

**Acceptance:** a new account completes onboarding in under 2 minutes; profile persists across
devices; handle is unique and URL-safe; avatar renders in every surface (chat, leaderboards, cards).

### A2. Skills
A tree of three branches — Technical, Business, Creative — each with levels 1–5. Every level is
earned by doing (learning challenges, projects, competitions), never bought directly.

Skill effects are **bounded multipliers**, never guaranteed success:

| Skill | Effect | Cap |
|---|---|---|
| Programming | lowers product build cost/time | −25% |
| Marketing | raises campaign reach | +30% |
| Finance | improves forecast accuracy, unlocks ratios | +20% |
| Leadership | raises team output, lowers churn of employees | +15% |
| Design | raises product quality / brand strength | +20% |

**Acceptance:** skill level visible on profile; effects visible in the relevant screen's numbers;
no combination can exceed the caps; the caps are enforced server-side.

### A3. Learning
15 categories (Mathematics → Leadership), each with levels of interactive challenges. A challenge =
objective, difficulty, brief, tasks, assessment, reward, feedback.

Assessment is deterministic and server-scored for stage one (multiple choice, ordering, numeric,
short structured answers). Free-text answers may be AI-graded later, but only as a *recommendation*
that a rule layer can override.

**Acceptance:** completing a challenge awards XP once (idempotent), unlocks the next tier, records
history, and shows the explanation afterwards.

### A4. Projects
Player-created: software, research, AI experiment, creative, business concept, community initiative.
Fields: title, summary, category, links, media, collaborators, visibility, and an optional
**"promote to venture"** action that pre-fills the startup wizard.

**Acceptance:** projects are public at `/{handle}/{project-slug}` when visible; promoting a project
creates a draft company carrying its name, category and summary.

### A5. Competitions and careers
Competitions: individual or team, with a start/end window, a scored task and a public leaderboard.
Careers: 10 paths, each listing required skills and a "readiness %" derived from the player's real
skill levels. Both are read-mostly for stage one.

---

## 5. Universe B — Startup Life

### B1. Startup creation (13-step wizard, resumable)
Industry → problem → idea → solution → name → brand → logo (generated pixel mark or upload) →
product → target market → revenue model → initial capital → plan → launch.

Drafts are first-class: a player can leave at step 6 and return a week later.

**Acceptance:** drafts persist per user and resume at the saved step; launch is atomic (company,
first product and opening ledger entries are created in one transaction); a player can own several
companies.

### B2. Company dashboard
Money strip: cash, MRR, expenses, profit, valuation, runway. Then customers, churn, brand,
market share, team, products, milestones, latest events.

**Acceptance:** every number on the dashboard is derived from the ledger and the state tables at
request time — no stored "display" numbers that can drift.

### B3. Industries
20 industries exist as data. **Four ship with distinct mechanics in v1** — SaaS, AI/ML, EdTech,
E-commerce. The other 16 ship as parameterised variants (different demand curves, costs, market
sizes, event decks) and get mechanics in a later milestone. This is deliberate: 20 shallow clones
would be worse than 4 real ones.

### B4. Simulation loop
Server-side tick (hourly in the real world, with catch-up on request) applies: demand, churn,
pricing effects, salaries, hosting costs, event deck draws, competitor pressure. All money movement
goes through the ledger.

**Acceptance:** a company left alone for 7 days is in a plausible state when its owner returns; no
action can produce money from nothing; the same seed + same actions replay to the same numbers.

---

## 6. The connection between universes

| Student action | Startup consequence |
|---|---|
| Programming skill ↑ | product build cost/time ↓ |
| Marketing skill ↑ | campaign reach ↑ |
| Project promoted | company starts with a real product + small initial traction |
| Competition win | reputation ↑, better hire/investor offers |
| Co-founder collaboration | company gains a second founder with their skills |

**Acceptance:** at least four of these effects are observable in a scripted end-to-end test.

---

## 7. Progression

11 ranks: Dreamer → Explorer → Learner → Creator → Innovator → Founder → Entrepreneur →
Business Leader → Industry Pioneer → Business Titan → Global Icon.

XP from meaningful, non-repeatable acts: first challenge in a category, challenge tier completion,
project published, competition placed, company launched, first customer, first profit month, first
hire, first campaign, valuation/revenue milestones. Repeatable actions give diminishing returns and
a daily cap.

**Acceptance:** XP is server-awarded, idempotent per source event, capped per day, and rank changes
are recorded in an audit trail.

---

## 8. The dual milestone (precise definition)

Two independent financial achievements, in the **same currency**:

- **Valuation Icon** — one company's simulated valuation reaches 2,000,000,000 (₹ or $).
- **Revenue Icon** — cumulative *recorded* revenue across the player's companies reaches 2,000,000,000.
- **Dual Icon** — both achieved in the same currency.

Rules:
1. Valuation ≠ revenue. They are separate columns computed by separate functions.
2. Only ledger-posted revenue counts toward Revenue Icon. Projected, ARR-style or synthetic figures never do.
3. A company has exactly one currency, fixed at creation; changing it is not allowed.
4. Totals are never summed across currencies. Progress is displayed per currency.
5. Progress bars show achieved / target, plus a verified history of when each threshold was crossed.

**Acceptance:** unit tests prove (a) valuation changes never move revenue, (b) refunds reduce revenue,
(c) two currencies never combine, (d) the Dual Icon needs both, in one currency, on the server.

---

## 9. ICON AI

Ten personalities: Mentor, Founder, Strategist, Analyst, Creator, Negotiator, Investor, Customer,
Career Guide, Researcher. All share one orchestrator, one memory, one budget.

Routing: deterministic backend for all arithmetic; local model for short NPC lines, explanations and
simple idea generation; cloud for strategy, analysis, long-form content. Fallbacks are explicit and
logged.

**Acceptance (stage two):** an AI request that fails on the local model falls back to cloud and
still answers; every response is attributed to a model; spend never exceeds the cap; the AI cannot
write to the ledger by any path.

---

## 10. Social

Public accounts, discovery, friend requests, 1:1 chat, company teams with server-enforced roles
(CEO/CTO/CFO/CMO/PM/Dev/Design/Marketing), and a shared market view.

Chat is real: persisted messages, presence, read state, typing indicator, blocking, reporting,
search. No simulated conversations.

**Acceptance:** two signed-in browsers exchange messages in real time; a blocked user cannot deliver;
a non-member cannot read a company channel; messages survive reload.

---

## 11. Content studio (later milestone)

Formats: post, banner, brand identity, ad, video script, campaign, pitch deck, product description,
newsletter, press release, launch. Workflow: format → audience → objective → brand → generate →
edit → save → publish → simulated performance.

All performance is clearly labelled **simulated** and never presented as external platform data.

---

## 12. Design language: pixel, but grown up

Inherited tokens from `public/assets/css/pixel.css`:

| Token | Value | Use |
|---|---|---|
| `--bg` | `#06050f` | page base |
| `--neon` | `#c8ff3d` | primary action, money-positive |
| `--pink` | `#ff4fa3` | secondary accent, energy |
| `--cyan` | `#5ef1ff` | data, info |
| `--gold` | `#ffcf4d` | achievements, valuation |
| `--violet` | `#a78bfa` | AI surfaces |
| type | Press Start 2P (headings), VT323 (body) | unchanged |

Rules for making pixel feel premium rather than toy-like:
- Dense information layout with generous negative space between blocks, not inside them.
- Charts drawn as pixel/canvas art with real axes and numbers — no decorative fake graphs.
- Motion is short (120–200 ms), purposeful, and disabled by `prefers-reduced-motion`.
- Scanline/CRT effects limited to hero and transition surfaces; never over body text.
- Press Start 2P only at ≥12 px and short strings; VT323 at 18–20 px for body.
- Every screen must be legible at 390 px wide.

**Acceptance:** Lighthouse performance ≥ 90 on the landing page; no layout shift from fonts; WCAG AA
contrast on all body text; keyboard navigable.

---

## 13. Security and fairness (stage one, because sign-up is public)

- Email verification before any money feature.
- Rate limits on auth, profile writes, company creation, and any AI call.
- Input validation and output escaping on every field; no `innerHTML` with user data.
- Server-side authorization on every company action (membership + role).
- RLS on all tables; service-role key never leaves the server.
- Audit log for XP awards, ledger postings, role changes, and admin actions.
- Economy anti-exploit: idempotency keys, per-day action caps, anomaly detection on revenue jumps.

---

## 14. Non-goals for stage one

AI personalities, chat, content studio, competitions runner, admin dashboard, mobile apps, real
money, external social integrations, PDF export, 40-megapixel artwork.

---

## 15. Open questions for you

1. Should the arcade keep its own visual identity inside `/arcade/`, or be restyled into Student Icon's shell eventually? (I propose: leave it untouched.)
2. Onboarding: is education stage and country required, or can a player skip?
3. Do you want a public discover feed of projects/companies at launch, or only profiles?
