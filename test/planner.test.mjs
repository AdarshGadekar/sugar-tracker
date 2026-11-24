import { test } from "node:test";
import assert from "node:assert/strict";
import { fmt, parse, parseEnd, dur, snap, validate, layout, gaps, summary, nowAndNext, suggest } from "../public/planner-core.js";

const B = (start_min, end_min, extra = {}) => ({ id: `${start_min}-${end_min}`, start_min, end_min, title: "x", ...extra });

test("format and parse times", () => {
  assert.equal(fmt(0), "00:00");
  assert.equal(fmt(545), "09:05");
  assert.equal(fmt(1440), "24:00");
  assert.equal(parse("09:05"), 545);
  assert.equal(parse("9:05"), 545);
  assert.equal(parse("24:00"), 1440);
  assert.equal(parse("24:01"), null);
  assert.equal(parse("12:60"), null);
  assert.equal(parse("abc"), null);
});

test("an end time of 00:00 means the end of the day", () => {
  assert.equal(parseEnd("00:00", 1380), 1440);
  assert.equal(parseEnd("00:00", 0), 0);
  assert.equal(parseEnd("10:30", 600), 630);
});

test("durations read naturally", () => {
  assert.equal(dur(0), "0m");
  assert.equal(dur(20), "20m");
  assert.equal(dur(60), "1h");
  assert.equal(dur(95), "1h 35m");
});

test("snap to 5 minutes, clamped to the day", () => {
  assert.equal(snap(62), 60);
  assert.equal(snap(63), 65);
  assert.equal(snap(-10), 0);
  assert.equal(snap(1500), 1440);
});

test("validate catches empty names and backwards times", () => {
  assert.equal(validate({ title: "Gym", start_min: 360, end_min: 420 }), null);
  assert.match(validate({ title: "  ", start_min: 360, end_min: 420 }), /name/);
  assert.match(validate({ title: "Gym", start_min: 420, end_min: 420 }), /after/);
  assert.match(validate({ title: "Gym", start_min: null, end_min: 420 }), /start/);
});

test("overlapping blocks sit side by side, separate ones get the full width", () => {
  const l = layout([B(540, 600), B(570, 660), B(600, 630), B(720, 780)]);
  const by = Object.fromEntries(l.map((x) => [x.block.id, x]));
  assert.equal(by["540-600"].cols, 2);
  assert.equal(by["570-660"].cols, 2);
  assert.notEqual(by["540-600"].col, by["570-660"].col);
  assert.equal(by["600-630"].col, by["540-600"].col);        // reuses the column that freed up at 10:00
  assert.equal(by["720-780"].cols, 1);
  assert.equal(by["720-780"].col, 0);
});

test("blocks stretch over free columns instead of staying squeezed", () => {
  // long 9:00–12:30, then three that overlap each other between 10:00 and 11:00, then 11:30–12:00 alone beside it
  const l = layout([B(540, 750), B(600, 620), B(605, 660), B(607, 643), B(690, 720)]);
  const by = Object.fromEntries(l.map((x) => [x.block.id, x]));
  assert.equal(by["540-750"].cols, 4);
  assert.equal(by["540-750"].span, 1);
  assert.equal(by["607-643"].span, 1);                       // last column: nothing to stretch into
  assert.equal(by["690-720"].col, 1);
  assert.equal(by["690-720"].span, 3);                       // 11:30 is free in columns 1–3, so it takes them all
});

test("free gaps across the whole day", () => {
  assert.deepEqual(gaps([]), [{ start: 0, end: 1440 }]);
  assert.deepEqual(gaps([B(0, 420), B(400, 600), B(1380, 1440)]), [{ start: 600, end: 1380 }]);
});

test("summary counts overlaps once and tracks done time", () => {
  const s = summary([B(540, 600, { done: true }), B(570, 660), B(720, 780, { done: true })]);
  assert.equal(s.planned, 180);         // 9:00–11:00 + 12:00–13:00
  assert.equal(s.done, 120);
  assert.equal(s.free, 1260);
  assert.equal(s.count, 3);
  assert.equal(s.ticked, 2);
});

test("now and next", () => {
  const blocks = [B(540, 600), B(570, 660), B(720, 780)];
  assert.equal(nowAndNext(blocks, 580).now.id, "570-660");
  assert.equal(nowAndNext(blocks, 580).next.id, "720-780");
  assert.equal(nowAndNext(blocks, 700).now, null);
  assert.equal(nowAndNext(blocks, 800).next, null);
});

test("suggest a 1-hour slot inside a gap, starting now if now is inside it", () => {
  assert.deepEqual(suggest({ start: 600, end: 1380 }), { start_min: 600, end_min: 660 });
  assert.deepEqual(suggest({ start: 600, end: 1380 }, 727), { start_min: 720, end_min: 780 });
  assert.deepEqual(suggest({ start: 600, end: 630 }), { start_min: 600, end_min: 630 });
});
