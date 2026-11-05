import { test } from "node:test";
import assert from "node:assert/strict";
import { toDate } from "../public/chat.js";

const iso = (v) => toDate(v).toISOString();

test("toDate: REST format with zone", () => {
  assert.equal(iso("2026-11-05T08:50:30.565778+00:00"), "2026-11-05T08:50:30.565Z");
});

test("toDate: Realtime format (space, microseconds, no zone) is treated as UTC", () => {
  assert.equal(iso("2026-11-05 08:50:30.565778"), "2026-11-05T08:50:30.565Z");
});

test("toDate: short zone and no fraction", () => {
  assert.equal(iso("2026-11-05 08:50:30+00"), "2026-11-05T08:50:30.000Z");
  assert.equal(iso("2026-11-05 14:20:30+05:30"), "2026-11-05T08:50:30.000Z");
});

test("toDate: garbage never throws", () => {
  assert.ok(toDate("not a date") instanceof Date);
  assert.ok(toDate(undefined) instanceof Date);
});
