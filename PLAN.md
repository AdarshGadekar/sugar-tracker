# Sugar Tracker — Plan

## Problem statement
People trying to quit sugar want a dead-simple daily log. Each user marks every day on a
calendar as **Sugar** or **No sugar**. Everyone gets **3 chances** (3 sugar days). The 4th sugar
day locks that user's tracker for good — it becomes read-only.

## Product decisions (defaults — change if you disagree)
| Question | Decision |
|---|---|
| "3 chances" | Up to 3 sugar days are allowed. Recording a **4th** sugar day locks the account. |
| Period | Lifetime of the account (no monthly reset). |
| Which days can be marked | Today and past days. No future days. |
| Can a mark be changed? | No. A mark is final after the confirmation step (otherwise the limit is easy to cheat). |
| Locked user | Can sign in and view the calendar, cannot mark anything. Unlock = admin deletes rows in Supabase. |
| Auth | Supabase email + password (sign up, sign in, sign out). Supabase email confirmation stays on. |

## Architecture
```
Browser (static HTML/CSS/JS, supabase-js from CDN)
   │  auth (email/password)            │ select own rows      │ rpc mark_day()
   ▼                                   ▼                      ▼
Supabase Auth                    day_marks table (RLS)   mark_day() SECURITY DEFINER
                                                         — the only write path, enforces all rules
```
- **No build framework.** Plain `index.html`, `styles.css`, `app.js`. Hosted as a Render **Static Site**.
- `config.js` holds the Supabase URL + anon (public) key. It is generated from env vars by
  `scripts/build-config.mjs` (Render build command), and git-ignored.
- **Rules live in the database**, not the browser: the client cannot insert/update/delete directly
  (no RLS write policies); it can only call `mark_day(day, had_sugar)`, which:
  1. requires a signed-in user,
  2. serializes per user (advisory lock) so double-clicks can't sneak past the limit,
  3. rejects if the user is already locked (sugar days > 3),
  4. rejects future days (tolerant of time zones: up to UTC+14) and already-marked days,
  5. inserts the mark, returns `{sugar_count, locked}`.

## Files
- `supabase/schema.sql` — table, RLS, `mark_day` RPC.
- `public/index.html`, `public/styles.css`, `public/app.js` — UI.
- `public/calendar.js` — pure date helpers (unit-tested with `node --test`).
- `public/config.example.js`, `scripts/build-config.mjs` — config.
- `render.yaml` — Render static-site blueprint.

## Verification
1. Offline: `node --test` on calendar/date helpers.
2. Live (needs Supabase connected + your OK): apply `schema.sql`, then sign up 1 test user and
   walk the flow: mark no-sugar, 3 sugar days, 4th sugar → locked, future day rejected,
   re-mark rejected, second user cannot see first user's rows.
3. Browser check of the page against the live project.

## Open
- Supabase connector not authenticated yet → run `/mcp` → "claude.ai Supabase".
- Which Supabase project to use (existing or new free one).
