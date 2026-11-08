/* ARCADE LABS — Supabase connection settings.

   Paste your project values here (Supabase dashboard → Project Settings → API):
     url     = Project URL          e.g. https://abcdefghijkl.supabase.co
     anonKey = anon / public key    safe to ship, protected by RLS

   NEVER put the service_role key in this file: it bypasses every policy and
   would be readable by anyone who opens the page.

   While these are blank the arcade runs in LOCAL MODE: all games play and
   records are kept in this browser only. The header shows "LOCAL MODE" so it
   is never mistaken for a synced account. */

export const SUPABASE = {
  url: '',
  anonKey: '',
};

export const isConfigured = () =>
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE.url.trim()) &&
  SUPABASE.anonKey.trim().length > 20;
