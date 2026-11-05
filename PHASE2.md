# Phase 2 plan — bigger calendar + "today isn't over yet"

## 1. Make it fit the screen (calendar feels small)
Today everything lives in a 520px column, so on a laptop the calendar is a narrow strip.

- **Desktop (≥ 900px):** widen the page to ~1040px and use two columns:
  - left (sticky while scrolling): player card (name, hearts, streak) + "How everyone's doing"
  - right: a large calendar — day cells ~80–90px, bigger numbers, month title + arrows on top
- **Tablet (600–900px):** single column, ~680px wide, calendar first after the player card.
- **Phone:** unchanged single column, cells scale to the screen width.
- Calendar cells get a small ✓ / ✕ under the number for marked days so they read at a glance.

## 2. Today can't be marked (the day isn't over)
- **Rule:** only *past* days can be marked. Today and future days are not markable.
- **Today's cell:** shows a small "today" tag + ⏳; clicking or hovering it shows a playful line
  (random each time) in a little speech bubble with a wiggle, e.g.
  - "Nice try! The day isn't over — that 11 PM cookie still counts 🍪"
  - "Come back tomorrow. Today is still writing its story 📖"
  - "Patience, champ. Mark it once the day is done 🌙"
- **Future days:** same bubble with future-themed lines ("Whoa, time traveller! 🚀").
- **Server (Supabase):** `mark_day` must enforce the same rule, or someone could bypass the UI.
  The server doesn't know each person's time zone, so the browser sends it (e.g. `Asia/Kolkata`)
  and the database rejects `day >= local today`. Old 2-argument function is replaced, not overloaded
  (an overload would make existing calls ambiguous). Existing marks — including any already made
  for today — stay as they are.
- Streaks keep working: they already count back from yesterday when today is unmarked.

## 3. Files
| File | Change |
|---|---|
| `public/styles.css` | wider container, 2-column grid on desktop, bigger day cells, bubble + wiggle |
| `public/index.html` | wrap player + board in a left column, calendar in the right |
| `public/calendar.js` | `canMark` → past days only; tests updated |
| `public/app.js` | today/future click → funny bubble; send time zone to `mark_day` |
| `public/messages.js` | funny "not yet" lines for today and future |
| `public/mock-supabase.js` | same new rule, so local mock matches |
| `supabase/phase2.sql` | new `mark_day(p_day, p_had_sugar, p_tz)` |

## 4. Order & verification
1. Build locally; test in mock mode (`/?mock`) at desktop, tablet and phone widths.
2. Unit tests (`npm test`) for the new `canMark` rule.
3. SQL dry-run against the real DB inside a rolled-back transaction (no change kept).
4. Only when you say "deploy": apply the SQL, push, redeploy Render — DB and site together.

## Risk
- Someone who sets a fake time zone could mark at most ~1 day early. Acceptable for a friendly app.

## 5. Sudoku score (decided: wins + 3 lives, saved per device)
- A wrong number (doesn't match the solution) costs a life; it turns red and shakes. 3 wrong = puzzle lost.
- Header shows hearts left and a running timer; footer shows wins, losses and best time.
- Stats are saved in this browser (localStorage) — no database change.

## Decisions
- Layout: two columns on desktop (chosen).
- Sudoku: wins + 3 lives, per device (chosen).
- Nothing is pushed or applied to the live DB until you say "deploy".
