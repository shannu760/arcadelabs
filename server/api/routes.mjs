/* Student Icon API — F3 slice: session sync and profiles.

   Mounted into the static server, so it is same-origin: no CORS, no second
   process, no cookie domain to reason about.

   Security posture
     * Authentication is required for /api/me and /api/session/sync.
     * Every query is scoped by the session user id. The local service connects
       as owner (like Supabase's service role), so RLS is not the defence here —
       the route code is.
     * Only whitelisted columns can be patched; handles are immutable after
       creation so public URLs never break.
*/

import { getDb, DB_KIND, DB_TARGET, ensureAuthRow, asUser } from './db.mjs';
import { authenticate, authMode, UUID_RE } from './auth.mjs';
import { handleAuth } from './auth-routes.mjs';
import { HttpError, readJson, send, fail } from './http.mjs';
import { skillProgress } from './skills.mjs';
import { supabaseBase } from './supabase.mjs';
import { throttle, clientIp } from './ratelimit.mjs';
import { reportError } from './monitor.mjs';

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const VISIBILITY = new Set(['public', 'unlisted']);
const PROJECT_CATEGORIES = new Set([
  'software',
  'research',
  'ai',
  'creative',
  'business',
  'community',
]);
const PROJECT_STATUS = new Set(['draft', 'published', 'archived']);

/* Every table that holds rows belonging to one player. Used by data export and
   by account deletion; the column is fixed here, never taken from a request. */
const PLAYER_TABLES = [
  ['profiles', 'id'],
  ['player_interests', 'user_id'],
  ['player_careers', 'user_id'],
  ['player_skills', 'user_id'],
  ['learning_attempts', 'user_id'],
  ['player_achievements', 'user_id'],
  ['xp_events', 'user_id'],
  ['projects', 'user_id'],
  ['arcade_profiles', 'id'],
];

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

function shapeProject(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    category: row.category,
    links: Array.isArray(row.links) ? row.links : [],
    media: Array.isArray(row.media) ? row.media : [],
    collaborators: Array.isArray(row.collaborators) ? row.collaborators : [],
    visibility: row.visibility,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* Account deletion on the auth side needs the service-role key, which this API
   otherwise never uses. Without it the player's data still goes; the email
   account is left for the owner (or support) to remove, and the response says
   which of the two happened. */
async function deleteAuthAccount(userId) {
  const base = supabaseBase();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !key) return false;

  try {
    const res = await fetch(`${base}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const shapeProfile = (row, interests = [], careers = []) => ({
  id: row.id,
  handle: row.handle,
  displayName: row.display_name,
  bio: row.bio,
  country: row.country ? String(row.country).trim() : null,
  educationStage: row.education_stage,
  avatarUrl: row.avatar_url,
  visibility: row.visibility,
  xp: Number(row.xp),
  rankIndex: row.rank_index,
  reputation: row.reputation,
  createdAt: row.created_at,
  interests,
  careers,
});

async function loadProfile(db, userId) {
  const { rows } = await db.query('select * from public.profiles where id = $1', [userId]);
  if (!rows.length) return null;

  const interests = await db.query(
    'select interest from public.player_interests where user_id = $1 order by interest',
    [userId]
  );
  const careers = await db.query(
    'select career_slug from public.player_careers where user_id = $1 order by career_slug',
    [userId]
  );

  return shapeProfile(
    rows[0],
    interests.rows.map((r) => r.interest),
    careers.rows.map((r) => r.career_slug)
  );
}

export async function handleApi(req, res, url) {
  const method = (req.method || 'GET').toUpperCase();
  const path = url.pathname.replace(/\/+$/, '') || '/api';

  try {
    // Account routes own their own authentication and talk to Supabase Auth,
    // not the database, so they must answer even when no database is set.
    if (path.startsWith('/api/auth/')) {
      return await handleAuth(req, res, url, method, path);
    }

    /* Client-side failures from monitor.js. Deliberately unauthenticated and
       deliberately forgiving: a browser that cannot report is not an error the
       visitor should see, and no payload is echoed back. */
    if (path === '/api/errors' && method === 'POST') {
      await throttle(`errors:${clientIp(req)}`, 30, 10 * 60 * 1000).catch(() => null);
      const body = await readJson(req);
      const message = String(body.message || '').slice(0, 500);
      if (message) {
        reportError(new Error(message), {
          source: 'client',
          route: String(body.url || '').slice(0, 300),
          stack: String(body.stack || '').slice(0, 4000),
        });

        try {
          const db = await getDb();
          await db.query(
            `insert into public.error_reports (source, message, stack, url, context)
             values ('client', $1, $2, $3, $4::jsonb)`,
            [
              message,
              String(body.stack || '').slice(0, 4000) || null,
              String(body.url || '').slice(0, 300) || null,
              JSON.stringify({ userAgent: String(body.userAgent || '').slice(0, 300) }),
            ]
          );
        } catch {
          /* the JSON log line above is the record; a database is optional here */
        }
      }
      return send(res, 202, { ok: true });
    }

    const db = await getDb();

    const session = await authenticate(req);

    if (path === '/api/health' && method === 'GET') {
      const { rows } = await db.query(`
        select (select count(*)::int from public.profiles)     as profiles,
               (select count(*)::int from public.icon_ranks)   as ranks,
               (select count(*)::int from public.industries)   as industries
      `);
      return send(res, 200, {
        ok: true,
        auth: authMode(),
        db: DB_KIND,
        dbTarget: DB_TARGET,
        migrations: '0001-0008',
        ...rows[0],
      });
    }

    if (path === '/api/ranks' && method === 'GET') {
      const { rows } = await db.query(
        'select rank_index, slug, title, min_xp from public.icon_ranks order by rank_index'
      );
      return send(res, 200, { ranks: rows });
    }

    if (path === '/api/careers' && method === 'GET') {
      const { rows } = await db.query(
        'select slug, title, description from public.careers order by title'
      );
      return send(res, 200, { careers: rows });
    }

    /* The skill tree is public: anyone can read the catalogue. Levels are the
       caller's own and come from player_skills, which only the server writes.
       A signed-out caller gets the tree with every level at zero. */
    if (path === '/api/skills' && method === 'GET') {
      const BRANCHES = [
        ['technical', 'Technical'],
        ['business', 'Business'],
        ['creative', 'Creative'],
      ];

      const { rows: catalogue } = await db.query(
        'select slug, branch, title, description, max_level from public.skills order by title'
      );

      const owned = new Map();
      if (session) {
        const { rows } = await db.query(
          'select skill_slug, level, xp from public.player_skills where user_id = $1',
          [session.userId]
        );
        for (const row of rows) owned.set(row.skill_slug, row);
      }

      const branches = BRANCHES.map(([slug, title]) => ({ slug, title, skills: [] }));
      const totals = { skills: catalogue.length, started: 0, levels: 0, maxLevels: 0, xp: 0 };

      for (const row of catalogue) {
        const mine = owned.get(row.slug);
        const xp = mine ? Number(mine.xp) : 0;
        const maxLevel = Number(row.max_level);

        // One mapping module, shared with the pages and tested directly, so
        // the thresholds cannot drift from icon_submit_challenge().
        const mapping = skillProgress(xp, maxLevel);

        if (mapping.level > 0) totals.started += 1;
        totals.levels += mapping.level;
        totals.maxLevels += maxLevel;
        totals.xp += xp;

        const branch = branches.find((entry) => entry.slug === row.branch);
        if (!branch) continue;

        branch.skills.push({
          slug: row.slug,
          title: row.title,
          description: row.description,
          ...mapping,
        });
      }

      return send(res, 200, { branches, totals });
    }

    /* The challenge list is public, but answer_key and explanation never leave
       the server until a submission has been scored. */
    if (path === '/api/challenges' && method === 'GET') {
      const { rows } = await db.query(`
        select c.id, c.tier, c.difficulty, c.title, c.objective, c.brief, c.tasks,
               c.kind, c.payload, c.xp_reward, c.skill_slug,
               lc.slug as category_slug, lc.title as category_title
          from public.learning_challenges c
          join public.learning_categories lc on lc.slug = c.category_slug
         where c.is_active
      order by lc.title, c.tier, c.title
      `);

      const passed = new Set();
      if (session) {
        const attempts = await db.query(
          'select challenge_id from public.learning_attempts where user_id = $1 and passed',
          [session.userId]
        );
        for (const attempt of attempts.rows) passed.add(attempt.challenge_id);
      }

      return send(res, 200, {
        challenges: rows.map((row) => ({
          id: row.id,
          tier: Number(row.tier),
          difficulty: row.difficulty,
          title: row.title,
          objective: row.objective,
          brief: row.brief,
          tasks: row.tasks,
          kind: row.kind,
          payload: row.payload,
          xpReward: row.xp_reward,
          skill: row.skill_slug,
          category: { slug: row.category_slug, title: row.category_title },
          passed: passed.has(row.id),
        })),
      });
    }

    // Public profiles are readable without a session; the row decides.
    if (method === 'GET' && path.startsWith('/api/profiles/')) {
      const handle = decodeURIComponent(path.slice('/api/profiles/'.length)).toLowerCase();
      if (!HANDLE_RE.test(handle)) {
        return fail(res, 400, 'invalid_handle', 'Handle must be 3-20 chars: a-z, 0-9, _');
      }

      const { rows } = await db.query('select * from public.profiles where handle = $1', [handle]);
      if (!rows.length) return fail(res, 404, 'not_found', 'No player with that handle');

      const row = rows[0];
      const isOwner = session?.userId === row.id;
      if (row.visibility !== 'public' && !isOwner) {
        return fail(res, 404, 'not_found', 'No player with that handle');
      }

      const profile = await loadProfile(db, row.id);
      return send(res, 200, { profile, isOwner });
    }

    /* Public reads that a signed-out visitor still needs: the arcade's code
       bank and leaderboard, and another player's published projects. */
    if (method === 'GET' && path === '/api/arcade/challenges') {
      const { rows } = await db.query(
        `select slug, level, difficulty, language, kind, title, prompt, code, options, source
           from public.arcade_code_challenges
          where is_active
          order by level`
      );
      return send(res, 200, { challenges: rows });
    }

    if (method === 'GET' && path === '/api/arcade/leaderboard') {
      const kind = String(url.searchParams.get('kind') || 'xp-all').slice(0, 40);
      const game = url.searchParams.get('game');
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 25, 1), 100);

      const { rows } = await db.query(
        'select * from public.arcade_leaderboard($1, $2, $3, 0)',
        [kind, game ? String(game).slice(0, 60) : null, limit]
      );
      return send(res, 200, { leaderboard: rows });
    }

    if (method === 'GET' && path === '/api/projects' && url.searchParams.get('handle')) {
      const handle = String(url.searchParams.get('handle') || '').toLowerCase();
      if (!HANDLE_RE.test(handle)) {
        return fail(res, 400, 'invalid_handle', 'Handle must be 3-20 chars: a-z, 0-9, _');
      }

      const owner = await db.query('select id, visibility from public.profiles where handle = $1', [
        handle,
      ]);
      if (!owner.rows.length) return fail(res, 404, 'not_found', 'No player with that handle');

      if (owner.rows[0].visibility !== 'public' && session?.userId !== owner.rows[0].id) {
        return fail(res, 404, 'not_found', 'No player with that handle');
      }

      const { rows } = await db.query(
        `select * from public.projects
          where user_id = $1 and status = 'published' and visibility = 'public'
          order by created_at desc`,
        [owner.rows[0].id]
      );
      return send(res, 200, { projects: rows.map(shapeProject) });
    }

    if (!session) {
      return fail(res, 401, 'unauthorized', 'Sign in to continue');
    }

    /* Scoring is the server's job. The browser sends answers, never a score,
       and icon_submit_challenge() decides pass/fail, awards XP once, and moves
       the named skill's level. */
    const submit = /^\/api\/challenges\/([^/]+)\/submit$/.exec(path);
    if (submit && method === 'POST') {
      const challengeId = submit[1];
      if (!UUID_RE.test(challengeId)) {
        return fail(res, 400, 'invalid_challenge', 'That is not a challenge id');
      }

      const body = await readJson(req);
      const answers = body?.answers;
      if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
        return fail(res, 400, 'invalid_answers', 'Send answers as an object');
      }

      const { rows } = await db.query(
        'select id, explanation from public.learning_challenges where id = $1 and is_active',
        [challengeId]
      );
      if (!rows.length) return fail(res, 404, 'not_found', 'No such challenge');

      // The profile FK requires the auth row, exactly as session sync does.
      await ensureAuthRow(db, session.userId);

      const scored = await db.query(
        'select public.icon_submit_challenge($1, $2, $3::jsonb) as result',
        [session.userId, challengeId, JSON.stringify(answers)]
      );

      const result = scored.rows[0]?.result || {};
      return send(res, 200, {
        ...result,
        explanation: result.passed ? rows[0].explanation : null,
      });
    }

    if (path === '/api/me' && method === 'GET') {
      const profile = await loadProfile(db, session.userId);
      if (!profile) {
        return fail(res, 404, 'no_profile', 'Call POST /api/session/sync to create your profile');
      }
      return send(res, 200, { profile });
    }

    if (path === '/api/session/sync' && method === 'POST') {
      const body = await readJson(req);
      const handle = String(body.handle || '').trim().toLowerCase();
      if (!HANDLE_RE.test(handle)) {
        return fail(res, 400, 'invalid_handle', 'Handle must be 3-20 chars: a-z, 0-9, _');
      }

      const displayName = String(body.displayName || handle).trim();
      if (displayName.length < 1 || displayName.length > 40) {
        return fail(res, 400, 'invalid_display_name', 'Display name must be 1-40 characters');
      }

      await ensureAuthRow(db, session.userId);

      /* Names the project itself answers to. Checked before the insert so the
         message is the same whether or not the row already exists. */
      const reserved = await db.query('select reason from public.reserved_handles where handle = $1', [
        handle,
      ]);
      if (reserved.rows.length) {
        return fail(res, 409, 'handle_reserved', 'That handle is reserved for the project');
      }

      const existing = await db.query('select * from public.profiles where id = $1', [
        session.userId,
      ]);

      if (existing.rows.length) {
        const current = existing.rows[0];
        if (current.handle !== handle && body.renameHandle === true) {
          return fail(res, 409, 'handle_locked', 'Handles cannot change; the public URL depends on it');
        }
        const updated = await db.query(
          'update public.profiles set display_name = $2 where id = $1 returning *',
          [session.userId, displayName]
        );
        const profile = await loadProfile(db, session.userId);
        return send(res, 200, { created: false, profile, row: updated.rows.length });
      }

      let inserted;
      try {
        inserted = await db.query(
          `insert into public.profiles (id, handle, display_name)
           values ($1, $2, $3)
           returning *`,
          [session.userId, handle, displayName]
        );
      } catch (err) {
        if (/duplicate key|unique constraint/i.test(err.message)) {
          return fail(res, 409, 'handle_taken', 'That handle is already taken');
        }
        throw err;
      }

      return send(res, 201, {
        created: true,
        profile: shapeProfile(inserted.rows[0], [], []),
      });
    }

    if (path === '/api/me' && method === 'PATCH') {
      const body = await readJson(req);
      const sets = [];
      const values = [];
      let index = 1;

      const push = (column, value) => {
        sets.push(`${column} = $${index++}`);
        values.push(value);
      };

      if (body.displayName !== undefined) {
        const value = String(body.displayName).trim();
        if (value.length < 1 || value.length > 40) {
          return fail(res, 400, 'invalid_display_name', 'Display name must be 1-40 characters');
        }
        push('display_name', value);
      }

      if (body.bio !== undefined) {
        const value = String(body.bio);
        if (value.length > 280) {
          return fail(res, 400, 'invalid_bio', 'Bio must be 280 characters or fewer');
        }
        push('bio', value);
      }

      if (body.country !== undefined) {
        const raw = body.country === null ? null : String(body.country).toUpperCase();
        if (raw !== null && !COUNTRY_RE.test(raw)) {
          return fail(res, 400, 'invalid_country', 'Country must be a two-letter code');
        }
        push('country', raw);
      }

      if (body.educationStage !== undefined) {
        const raw = body.educationStage === null ? null : String(body.educationStage).trim();
        if (raw !== null && raw.length > 40) {
          return fail(res, 400, 'invalid_education_stage', 'Education stage must be 40 characters or fewer');
        }
        push('education_stage', raw);
      }

      if (body.visibility !== undefined) {
        const raw = String(body.visibility);
        if (!VISIBILITY.has(raw)) {
          return fail(res, 400, 'invalid_visibility', 'Visibility must be public or unlisted');
        }
        push('visibility', raw);
      }

      if (body.avatarUrl !== undefined) {
        const raw = body.avatarUrl === null ? null : String(body.avatarUrl).trim();
        if (raw !== null && !/^https?:\/\//i.test(raw)) {
          return fail(res, 400, 'invalid_avatar_url', 'Avatar URL must start with http(s)://');
        }
        push('avatar_url', raw);
      }

      if (!sets.length) {
        return fail(res, 400, 'nothing_to_update', 'Send at least one editable field');
      }

      values.push(session.userId);
      const { rows } = await db.query(
        `update public.profiles set ${sets.join(', ')} where id = $${index} returning id`,
        values
      );
      if (!rows.length) {
        return fail(res, 404, 'no_profile', 'Call POST /api/session/sync to create your profile');
      }

      return send(res, 200, { profile: await loadProfile(db, session.userId) });
    }

    if (path === '/api/me/interests' && method === 'PUT') {
      const body = await readJson(req);
      const list = (value, label) => {
        if (value === undefined) return null;
        if (!Array.isArray(value)) {
          throw new HttpError(400, `invalid_${label}`, `${label} must be an array of strings`);
        }
        const cleaned = [...new Set(value.map((v) => String(v).trim()).filter(Boolean))];
        if (cleaned.length > 12) {
          throw new HttpError(400, `too_many_${label}`, `Pick at most 12 ${label}`);
        }
        if (cleaned.some((v) => v.length > 40)) {
          throw new HttpError(400, `invalid_${label}`, `${label} entries must be 40 characters or fewer`);
        }
        return cleaned;
      };

      const interests = list(body.interests, 'interests');
      const careers = list(body.careers, 'careers');

      if (interests === null && careers === null) {
        return fail(res, 400, 'nothing_to_update', 'Send interests, careers or both');
      }

      const profile = await db.transaction(async (tx) => {
        if (interests) {
          await tx.query('delete from public.player_interests where user_id = $1', [session.userId]);
          for (const interest of interests) {
            await tx.query(
              'insert into public.player_interests (user_id, interest) values ($1, $2) on conflict do nothing',
              [session.userId, interest]
            );
          }
        }
        if (careers) {
          await tx.query('delete from public.player_careers where user_id = $1', [session.userId]);
          for (const slug of careers) {
            const known = await tx.query('select 1 from public.careers where slug = $1', [slug]);
            if (!known.rows.length) continue;
            await tx.query(
              'insert into public.player_careers (user_id, career_slug) values ($1, $2) on conflict do nothing',
              [session.userId, slug]
            );
          }
        }
        return true;
      });

      if (!profile) return fail(res, 500, 'server_error', 'Interest update failed');

      return send(res, 200, { profile: await loadProfile(db, session.userId) });
    }

    /* ------------------------------------------------------------ export */

    /* Everything this API holds about the caller, as one JSON file. Reads only
       tables that exist on this deployment; an older schema simply contributes
       fewer sections. */
    if (path === '/api/me/export' && method === 'GET') {
      const data = { exportedAt: new Date().toISOString(), userId: session.userId, tables: {} };

      for (const [table, column] of PLAYER_TABLES) {
        try {
          const { rows } = await db.query(
            `select * from public.${table} where ${column} = $1`,
            [session.userId]
          );
          data.tables[table] = rows;
        } catch {
          data.tables[table] = null;
        }
      }

      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="student-icon-${session.userId}.json"`,
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(data, null, 2));
      return undefined;
    }

    /* ------------------------------------------------------------ deletion */

    if (path === '/api/me' && method === 'DELETE') {
      const body = await readJson(req);
      if (String(body.confirm || '').trim().toLowerCase() !== 'delete') {
        return fail(
          res,
          400,
          'confirm_required',
          'Send { "confirm": "delete" } to remove this account and its player'
        );
      }

      await throttle(`delete:${session.userId}`, 3, 24 * 60 * 60 * 1000);

      const removed = {};
      for (const [table, column] of PLAYER_TABLES) {
        try {
          const { rowCount } = await db.query(
            `delete from public.${table} where ${column} = $1`,
            [session.userId]
          );
          removed[table] = rowCount ?? 0;
        } catch {
          removed[table] = null;
        }
      }

      const authAccountDeleted = await deleteAuthAccount(session.userId);

      return send(res, 200, {
        ok: true,
        removed,
        authAccountDeleted,
        message: authAccountDeleted
          ? 'Your player and your sign-in account are gone.'
          : 'Your player and all its records are gone. The email account itself still exists; contact support to have it removed, or set SUPABASE_SERVICE_ROLE_KEY so the API can do it.',
      });
    }

    /* ------------------------------------------------------------ projects */

    if (path === '/api/projects' && method === 'GET') {
      const { rows } = await db.query(
        'select * from public.projects where user_id = $1 order by created_at desc',
        [session.userId]
      );
      return send(res, 200, { projects: rows.map(shapeProject) });
    }

    if (path === '/api/projects' && method === 'POST') {
      const body = await readJson(req);
      const title = String(body.title || '').trim();
      if (title.length < 2 || title.length > 80) {
        return fail(res, 400, 'invalid_title', 'Title must be 2-80 characters');
      }

      const summary = String(body.summary || '').trim();
      if (summary.length > 400) {
        return fail(res, 400, 'invalid_summary', 'Summary must be 400 characters or fewer');
      }

      const category = String(body.category || 'software');
      if (!PROJECT_CATEGORIES.has(category)) {
        return fail(res, 400, 'invalid_category', 'Unknown project category');
      }

      const visibility = String(body.visibility || 'public');
      if (!VISIBILITY.has(visibility)) {
        return fail(res, 400, 'invalid_visibility', 'Visibility must be public or unlisted');
      }

      const status = String(body.status || 'published');
      if (!PROJECT_STATUS.has(status)) {
        return fail(res, 400, 'invalid_status', 'Status must be draft, published or archived');
      }

      const links = Array.isArray(body.links) ? body.links.slice(0, 6) : [];
      if (links.some((link) => !/^https?:\/\//i.test(String(link?.url || '')))) {
        return fail(res, 400, 'invalid_link', 'Every link needs an http(s) URL');
      }

      const profile = await db.query('select 1 from public.profiles where id = $1', [
        session.userId,
      ]);
      if (!profile.rows.length) {
        return fail(res, 404, 'no_profile', 'Create your player before adding a project');
      }

      const base = slugify(title) || 'project';
      let row = null;

      for (let attempt = 0; attempt < 20 && !row; attempt += 1) {
        const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
        try {
          const inserted = await db.query(
            `insert into public.projects (user_id, title, slug, summary, category, links, visibility, status)
             values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
             returning *`,
            [session.userId, title, slug, summary, category, JSON.stringify(links), visibility, status]
          );
          row = inserted.rows[0];
        } catch (err) {
          if (!/duplicate key|unique constraint/i.test(err.message)) throw err;
        }
      }

      if (!row) return fail(res, 409, 'slug_taken', 'Could not find a unique address for that title');
      return send(res, 201, { project: shapeProject(row) });
    }

    const projectPath = /^\/api\/projects\/([^/]+)$/.exec(path);
    if (projectPath && (method === 'PATCH' || method === 'DELETE')) {
      const projectId = projectPath[1];
      if (!UUID_RE.test(projectId)) {
        return fail(res, 400, 'invalid_project', 'That is not a project id');
      }

      if (method === 'DELETE') {
        const { rowCount } = await db.query(
          'delete from public.projects where id = $1 and user_id = $2',
          [projectId, session.userId]
        );
        if (!rowCount) return fail(res, 404, 'not_found', 'No project of yours with that id');
        return send(res, 200, { ok: true });
      }

      const body = await readJson(req);
      const sets = [];
      const values = [];
      let index = 1;
      const push = (column, value) => {
        sets.push(`${column} = $${index++}`);
        values.push(value);
      };

      if (body.title !== undefined) {
        const value = String(body.title).trim();
        if (value.length < 2 || value.length > 80) {
          return fail(res, 400, 'invalid_title', 'Title must be 2-80 characters');
        }
        push('title', value);
      }
      if (body.summary !== undefined) {
        const value = String(body.summary).trim();
        if (value.length > 400) {
          return fail(res, 400, 'invalid_summary', 'Summary must be 400 characters or fewer');
        }
        push('summary', value);
      }
      if (body.category !== undefined) {
        const value = String(body.category);
        if (!PROJECT_CATEGORIES.has(value)) {
          return fail(res, 400, 'invalid_category', 'Unknown project category');
        }
        push('category', value);
      }
      if (body.visibility !== undefined) {
        const value = String(body.visibility);
        if (!VISIBILITY.has(value)) {
          return fail(res, 400, 'invalid_visibility', 'Visibility must be public or unlisted');
        }
        push('visibility', value);
      }
      if (body.status !== undefined) {
        const value = String(body.status);
        if (!PROJECT_STATUS.has(value)) {
          return fail(res, 400, 'invalid_status', 'Status must be draft, published or archived');
        }
        push('status', value);
      }
      if (body.links !== undefined) {
        const links = Array.isArray(body.links) ? body.links.slice(0, 6) : [];
        if (links.some((link) => !/^https?:\/\//i.test(String(link?.url || '')))) {
          return fail(res, 400, 'invalid_link', 'Every link needs an http(s) URL');
        }
        push('links', JSON.stringify(links));
      }

      if (!sets.length) {
        return fail(res, 400, 'nothing_to_update', 'Send at least one editable field');
      }

      sets.push('updated_at = now()');
      values.push(projectId, session.userId);

      const { rows } = await db.query(
        `update public.projects set ${sets.join(', ')}
          where id = $${index} and user_id = $${index + 1}
          returning *`,
        values
      );
      if (!rows.length) return fail(res, 404, 'not_found', 'No project of yours with that id');
      return send(res, 200, { project: shapeProject(rows[0]) });
    }

    /* -------------------------------------------------------------- arcade */

    /* The arcade used to hold a second identity system: a Supabase client in
       the browser with its own anon key and free-text nickname. These routes
       retire it — the arcade now reads and writes the same account as the rest
       of Student Icon, and the reward maths still runs inside Postgres. */

    if (path === '/api/arcade/profile' && method === 'GET') {
      const { rows } = await db.query('select * from public.arcade_profiles where id = $1', [
        session.userId,
      ]);
      return send(res, 200, { profile: rows[0] || null });
    }

    if (path === '/api/arcade/sessions' && method === 'POST') {
      const body = await readJson(req);
      const game = String(body.game || '').slice(0, 60);
      const clientId = String(body.clientId || '').slice(0, 100);
      const payload = body.payload;

      if (!game || !clientId || typeof payload !== 'object' || payload === null) {
        return fail(res, 400, 'invalid_session', 'Send game, clientId and the session payload');
      }

      await ensureAuthRow(db, session.userId);

      const result = await asUser(db, session.userId, (tx) =>
        tx
          .query('select public.arcade_complete_session($1, $2::jsonb, $3) as result', [
            game,
            JSON.stringify(payload),
            clientId,
          ])
          .then((out) => out.rows[0]?.result || null)
      );

      return send(res, 200, { result });
    }

    if (path === '/api/arcade/code-solves' && method === 'POST') {
      const body = await readJson(req);
      const slugs = Array.isArray(body.slugs) ? body.slugs.slice(0, 60).map(String) : [];
      if (!slugs.length) return fail(res, 400, 'nothing_to_sync', 'Send at least one solved challenge');

      await ensureAuthRow(db, session.userId);

      const result = await asUser(db, session.userId, (tx) =>
        tx
          .query('select public.arcade_code_solve($1::text[]) as result', [slugs])
          .then((out) => out.rows[0]?.result || null)
      );

      return send(res, 200, { result });
    }

    return fail(res, 404, 'not_found', `${method} ${path} is not an endpoint`);
  } catch (err) {
    if (err instanceof HttpError) return fail(res, err.status, err.code, err.message);
    reportError(err, { source: 'api', route: `${method} ${path}` });
    return fail(res, 500, 'server_error', 'Something went wrong on our side');
  }
}

export { UUID_RE };
