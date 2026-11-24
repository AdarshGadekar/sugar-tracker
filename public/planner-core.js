// Day planner: pure helpers (no DOM), unit-tested in test/planner.test.mjs.
// Times are minutes after midnight: 0 = 00:00, 1440 = 24:00 (end of the day).

export const DAY_MIN = 1440;
export const SNAP = 5;                       // drag/draw snaps to 5 minutes
export const TAGS = {
  work:   { label: "Work",   emoji: "💼" },
  health: { label: "Health", emoji: "🏃" },
  me:     { label: "Me",     emoji: "🌿" },
  learn:  { label: "Learn",  emoji: "📚" },
  other:  { label: "Other",  emoji: "📝" },
};

const pad = (n) => String(n).padStart(2, "0");

/** 545 -> "09:05", 1440 -> "24:00" */
export function fmt(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** "09:05" -> 545. "24:00" -> 1440. Returns null for anything else. */
export function parse(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (mi > 59 || h > 24 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}

/** End time from an <input type="time">: "00:00" as an end time means midnight at the end of the day. */
export function parseEnd(hhmm, start) {
  const v = parse(hhmm);
  if (v === 0 && start > 0) return DAY_MIN;
  return v;
}

/** 95 -> "1h 35m", 60 -> "1h", 20 -> "20m", 0 -> "0m" */
export function dur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const snap = (min, step = SNAP) => Math.max(0, Math.min(DAY_MIN, Math.round(min / step) * step));

/** Problems with a block before saving, or null if it's fine. */
export function validate({ title, start_min, end_min }) {
  if (!String(title || "").trim()) return "Give it a name.";
  if (String(title).trim().length > 120) return "Keep the name under 120 characters.";
  if (start_min == null || end_min == null) return "Pick a start and an end time.";
  if (start_min < 0 || end_min > DAY_MIN) return "Times must be within the day.";
  if (end_min <= start_min) return "The end time has to be after the start.";
  return null;
}

/**
 * Side-by-side layout for overlapping blocks (like a calendar app).
 * Returns [{ block, col, cols, span }] — col is this block's column, cols how many columns its overlap group
 * uses, span how many columns it may stretch across (to the right, where nothing else overlaps it).
 */
export function layout(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start_min - b.start_min || b.end_min - a.end_min);
  const out = [];
  let group = [], groupEnd = -1, colEnds = [];
  const overlaps = (a, b) => a.start_min < b.end_min && b.start_min < a.end_min;
  const flush = () => {
    const cols = colEnds.length || 1;
    group.forEach((g) => {
      g.cols = cols;
      // stretch to the right over columns that are free for this block's whole time (no needless squeezing)
      let span = 1;
      while (g.col + span < cols && !group.some((o) => o.col === g.col + span && overlaps(o.block, g.block))) span++;
      g.span = span;
      out.push(g);
    });
    group = []; colEnds = [];
  };
  for (const b of sorted) {
    if (b.start_min >= groupEnd && group.length) flush();
    let col = colEnds.findIndex((end) => end <= b.start_min);
    if (col === -1) { col = colEnds.length; colEnds.push(b.end_min); } else colEnds[col] = b.end_min;
    group.push({ block: b, col, cols: 1 });
    groupEnd = Math.max(groupEnd, b.end_min);
  }
  flush();
  return out;
}

/** Free stretches of the day not covered by any block: [{ start, end }] */
export function gaps(blocks, from = 0, to = DAY_MIN) {
  const spans = blocks.map((b) => [b.start_min, b.end_min]).sort((a, b) => a[0] - b[0]);
  const free = [];
  let t = from;
  for (const [s, e] of spans) {
    if (s > t) free.push({ start: t, end: Math.min(s, to) });
    t = Math.max(t, e);
    if (t >= to) break;
  }
  if (t < to) free.push({ start: t, end: to });
  return free.filter((g) => g.end > g.start);
}

/** Totals for the day: planned (union of blocks, overlaps counted once), done, free. */
export function summary(blocks) {
  const free = gaps(blocks).reduce((n, g) => n + g.end - g.start, 0);
  const planned = DAY_MIN - free;
  const doneFree = gaps(blocks.filter((b) => b.done)).reduce((n, g) => n + g.end - g.start, 0);
  return { planned, done: DAY_MIN - doneFree, free, count: blocks.length, ticked: blocks.filter((b) => b.done).length };
}

/** The block happening at `min` (latest-starting one if several), and the next one after it. */
export function nowAndNext(blocks, min) {
  const sorted = [...blocks].sort((a, b) => a.start_min - b.start_min);
  const now = sorted.filter((b) => b.start_min <= min && min < b.end_min).at(-1) || null;
  const next = sorted.find((b) => b.start_min > min) || null;
  return { now, next };
}

/** A sensible new block for a free stretch: starts at the gap (or now, if inside it), up to 1 hour. */
export function suggest(gap, nowMin = null) {
  let start = gap.start;
  if (nowMin != null && nowMin > gap.start && nowMin < gap.end) start = snap(nowMin, 15);
  const end = Math.min(gap.end, start + 60);
  return end > start ? { start_min: start, end_min: end } : { start_min: gap.start, end_min: gap.end };
}
