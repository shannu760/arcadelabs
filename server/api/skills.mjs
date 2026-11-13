/* Skill level mapping — the single source of truth on the JavaScript side.

   It mirrors public.icon_submit_challenge() exactly:

     level = least(max_level, greatest(1, 1 + floor(xp / 3)))   -- for xp >= 1

   which means the thresholds to *reach* a level are:

     level 1 at 1 XP   (the first passing challenge that names the skill)
     level 2 at 3 XP
     level 3 at 6 XP
     level 4 at 9 XP
     level 5 at 12 XP  (typical cap)

   An untrained skill has no player_skills row and reads as level 0 with 0 XP.

   Keeping this in one module means the API, the pages and the tests cannot
   drift from the SQL rule without a test failing. If the SQL changes, change
   this and re-run `npm run test:api`.
*/

export const DEFAULT_MAX_LEVEL = 5;

/** The level a skill is at for a given skill XP total (0 = untrained). */
export function levelForXp(xp, maxLevel = DEFAULT_MAX_LEVEL) {
  const value = Number(xp);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Number(maxLevel) || DEFAULT_MAX_LEVEL, Math.max(1, 1 + Math.floor(value / 3)));
}

/** The XP at which that level was reached (0 for untrained). */
export function xpToReach(level) {
  if (level <= 0) return 0;
  if (level === 1) return 1;
  return 3 * (level - 1);
}

/** The XP total that promotes to the next level, or null at the cap. */
export function nextLevelXp(level, maxLevel = DEFAULT_MAX_LEVEL) {
  if (level >= Number(maxLevel)) return null;
  return level === 0 ? 1 : 3 * level;
}

/** Everything a skill node needs: level, XP, cap, next threshold, 0–1 progress. */
export function skillProgress(xp, maxLevel = DEFAULT_MAX_LEVEL) {
  const total = Math.max(0, Number(xp) || 0);
  const level = levelForXp(total, maxLevel);
  const nextAtXp = nextLevelXp(level, maxLevel);
  const floorXp = xpToReach(level);

  const progress =
    nextAtXp === null
      ? 1
      : Math.min(1, Math.max(0, (total - floorXp) / (nextAtXp - floorXp)));

  return {
    level,
    xp: total,
    maxLevel: Number(maxLevel) || DEFAULT_MAX_LEVEL,
    nextAtXp,
    progress: Number(progress.toFixed(2)),
  };
}
