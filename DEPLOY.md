# Deploy & credentials

## Supabase (done)
- Project: `sugar-tracker` (ref `ziwivltbkqapbfhawecg`), org "adarshgadekar@gmail.com's Org", region ap-south-1.
- Schema applied from `supabase/schema.sql` (migration `sugar_tracker_init`).
- Credentials are in `.env` (git-ignored):
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY` (a *publishable* key, safe in the browser; security comes from RLS + `mark_day()`)
- Never put the `service_role` / secret key anywhere in this app.

## Live
- Site: https://sugar-tracker-ki0k.onrender.com
- Repo: https://github.com/AdarshGadekar/sugar-tracker (public)
- Render service: srv-dbm1u3d9fdbs73bjft3g. Deployed from the public repo URL, so it does **not** auto-deploy on push: use Manual Deploy -> Deploy latest commit in Render.
- Supabase Auth: Site URL + redirect URLs set to the Render URL and http://localhost:5173.

## Render (static site)
1. Push this folder to a GitHub repo.
2. Render â†’ New â†’ Blueprint â†’ pick the repo (uses `render.yaml`), or New â†’ Static Site with:
   - Build command: `node scripts/build-config.mjs`
   - Publish directory: `public`
3. Set the two env vars from `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
4. After the first deploy, in Supabase â†’ Authentication â†’ URL Configuration:
   - Site URL = your Render URL (e.g. `https://sugar-tracker.onrender.com`)
   - Redirect URLs: add the Render URL and `http://localhost:5173`
   (Otherwise the sign-up confirmation email links to `localhost:3000`.)

## Notes
- Supabase's built-in email sender is rate-limited (a few emails/hour). Fine for a handful of users;
  add custom SMTP in Supabase if more people sign up.
- Unlock a locked user: delete some of their sugar rows in Table Editor â†’ `day_marks`.
- Free Supabase projects pause after ~1 week of no activity; restore from the dashboard.

## Run locally
```
npm run config   # needs SUPABASE_URL / SUPABASE_ANON_KEY in env, or use the existing public/config.js
npm run serve    # http://localhost:5173
npm test
```
