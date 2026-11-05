// Copy to config.js (git-ignored) or let scripts/build-config.mjs generate it from env vars.
// The anon key is public by design; security comes from RLS + the mark_day() function.
window.SUGAR_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",
};
