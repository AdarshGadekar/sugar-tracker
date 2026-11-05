// Pure date helpers. All dates are local "YYYY-MM-DD" strings.

export const MAX_SUGAR = 3;

const pad = (n) => String(n).padStart(2, "0");

export function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO(now = new Date()) {
  return toISO(now);
}

/** Weeks (arrays of 7) for a month grid, Monday first. Empty cells are null. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toISO(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function sugarCount(marks) {
  return Object.values(marks).filter(Boolean).length;
}

export function isLocked(marks) {
  return sugarCount(marks) > MAX_SUGAR;
}

export function chancesLeft(marks) {
  return Math.max(0, MAX_SUGAR - sugarCount(marks));
}

/** Can this day be clicked? Not future, not already marked, account not locked. */
export function canMark(iso, marks, today) {
  return iso <= today && !(iso in marks) && !isLocked(marks);
}

export function formatDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
