import { test } from "node:test";
import assert from "node:assert/strict";
import {
  monthGrid, sugarCount, isLocked, chancesLeft, canMark, toISO, currentStreak,
} from "../public/calendar.js";

test("currentStreak: counts back from today, or from yesterday if today is unmarked", () => {
  const today = "2026-11-05";
  assert.equal(currentStreak({}, today), 0);
  assert.equal(currentStreak({ "2026-11-05": false, "2026-11-04": false, "2026-11-03": true }, today), 2);
  assert.equal(currentStreak({ "2026-11-04": false, "2026-11-03": false }, today), 2);   // today not marked yet
  assert.equal(currentStreak({ "2026-11-05": true, "2026-11-04": false }, today), 0);    // sugar today
  assert.equal(currentStreak({ "2026-11-04": false, "2026-11-02": false }, today), 1);   // gap breaks it
  assert.equal(currentStreak({ "2026-11-01": false, "2026-10-31": false, "2026-10-30": false, "2026-11-02": false,
    "2026-11-03": false, "2026-11-04": false }, today), 6);                               // crosses month
});

test("monthGrid: Nov 2026 starts on Sunday, has 30 days, Monday-first", () => {
  const weeks = monthGrid(2026, 10);
  assert.equal(weeks[0].slice(0, 6).every((c) => c === null), true);
  assert.equal(weeks[0][6], "2026-11-01");
  const days = weeks.flat().filter(Boolean);
  assert.equal(days.length, 30);
  assert.equal(days.at(-1), "2026-11-30");
  assert.ok(weeks.every((w) => w.length === 7));
});

test("monthGrid: Feb in leap year", () => {
  assert.equal(monthGrid(2028, 1).flat().filter(Boolean).length, 29);
});

test("toISO pads", () => {
  assert.equal(toISO(new Date(2026, 0, 5)), "2026-01-05");
});

test("counts and lock: 3 sugar days ok, 4th locks", () => {
  const m = { "2026-11-01": true, "2026-11-02": false, "2026-11-03": true, "2026-11-04": true };
  assert.equal(sugarCount(m), 3);
  assert.equal(chancesLeft(m), 0);
  assert.equal(isLocked(m), false);
  m["2026-11-05"] = true;
  assert.equal(isLocked(m), true);
  assert.equal(chancesLeft(m), 0);
});

test("canMark: past days only (not today, not future), no re-mark, nothing when locked", () => {
  const today = "2026-11-05";
  const m = { "2026-11-01": false };
  assert.equal(canMark("2026-11-04", m, today), true);
  assert.equal(canMark("2026-11-05", m, today), false);   // today isn't over yet
  assert.equal(canMark("2026-11-06", m, today), false);
  assert.equal(canMark("2026-11-01", m, today), false);
  const locked = { a: true, b: true, c: true, d: true };
  assert.equal(canMark("2026-11-04", locked, today), false);
});

test("forgiven (gift) sugar days don't cost a heart", () => {
  const m = { "2026-11-01": true, "2026-11-02": "gift", "2026-11-03": "gift", "2026-11-04": false };
  assert.equal(sugarCount(m), 1);
  assert.equal(chancesLeft(m), 2);
  assert.equal(isLocked({ a: "gift", b: "gift", c: "gift", d: "gift" }), false);
  assert.equal(currentStreak({ "2026-11-04": false, "2026-11-03": "gift" }, "2026-11-05"), 1); // still breaks a streak
});
