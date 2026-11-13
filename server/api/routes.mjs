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

import { getDb, DB_PATH } from './db.mjs';
import { authenticate, authMode, UUID_RE } from './auth.mjs';
import { handleAuth } from './auth-routes.mjs';
import { HttpError, readJson, send, fail } from './http.mjs';
import { skillProgress } from './skills.mjs';

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const VISIBILITY = new Set(['public', 'unlisted']);

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
    const db = await getDb();

    // Account routes own their own authentication; they proxy Supabase Auth.
    if (path.startsWith('/api/auth/')) {
      return await handleAuth(req, res, url, method, path);
    }

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
        db: 'pglite',
        dbPath: DB_PATH,
        migrations: '0003-0007',
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
      await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [
        session.userId,
      ]);

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

      await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [
        session.userId,
      ]);

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

    return fail(res, 404, 'not_found', `${method} ${path} is not an endpoint`);
  } catch (err) {
    if (err instanceof HttpError) return fail(res, err.status, err.code, err.message);
    return fail(res, 500, 'server_error', err.message);
  }
}

export { UUID_RE };
