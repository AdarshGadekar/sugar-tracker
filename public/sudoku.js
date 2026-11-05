// Tiny Sudoku: generator + checks (pure), plus a corner widget.

const shuffle = (a, rnd) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function canPlace(grid, idx, v) {
  const r = Math.floor(idx / 9), c = idx % 9;
  const br = r - (r % 3), bc = c - (c % 3);
  for (let k = 0; k < 9; k++) {
    if (grid[r * 9 + k] === v && r * 9 + k !== idx) return false;
    if (grid[k * 9 + c] === v && k * 9 + c !== idx) return false;
    const bi = (br + Math.floor(k / 3)) * 9 + bc + (k % 3);
    if (grid[bi] === v && bi !== idx) return false;
  }
  return true;
}

function fill(grid, rnd) {
  const idx = grid.indexOf(0);
  if (idx === -1) return true;
  for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd)) {
    if (canPlace(grid, idx, v)) {
      grid[idx] = v;
      if (fill(grid, rnd)) return true;
      grid[idx] = 0;
    }
  }
  return false;
}

/** Count solutions up to `limit` (used to keep the puzzle uniquely solvable). */
function countSolutions(grid, limit = 2) {
  const idx = grid.indexOf(0);
  if (idx === -1) return 1;
  let n = 0;
  for (let v = 1; v <= 9 && n < limit; v++) {
    if (canPlace(grid, idx, v)) {
      grid[idx] = v;
      n += countSolutions(grid, limit - n);
      grid[idx] = 0;
    }
  }
  return n;
}

/** Returns { puzzle, solution } as 81-length arrays (0 = blank). */
export function generate(holes = 40, rnd = Math.random) {
  const solution = Array(81).fill(0);
  fill(solution, rnd);
  const puzzle = solution.slice();
  let removed = 0;
  for (const idx of shuffle([...Array(81).keys()], rnd)) {
    if (removed >= holes) break;
    const keep = puzzle[idx];
    puzzle[idx] = 0;
    if (countSolutions(puzzle.slice()) === 1) removed++;
    else puzzle[idx] = keep;
  }
  return { puzzle, solution };
}

export function isSolved(grid, solution) {
  return grid.every((v, i) => v === solution[i]);
}

/** Blanks per difficulty. Hard may end up with slightly fewer if uniqueness would break. */
export const LEVELS = { easy: 34, medium: 44, hard: 52 };
export const SUDOKU_LIVES = 3;

// ---------- Stats (this browser only) ----------
const STATS_KEY = "sugar_sudoku_v1";
function loadStats() {
  const blank = { level: "easy", easy: {}, medium: {}, hard: {} };
  try { return { ...blank, ...JSON.parse(localStorage.getItem(STATS_KEY)) }; } catch { return blank; }
}
function saveStats(s) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch { /* private mode: keep in memory */ }
}
const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ---------- Widget ----------
export function mountSudoku(root) {
  const stats = loadStats();
  let game = null, cells = [], mistakes = 0, over = false;
  let elapsed = 0, runningSince = null, tick = null;

  root.innerHTML = `
    <button class="sdk-toggle" aria-expanded="false" title="Sudoku">🧩 Sudoku</button>
    <div class="sdk-panel" hidden>
      <div class="sdk-levels" role="radiogroup" aria-label="Difficulty">
        ${Object.keys(LEVELS).map((l) => `<button type="button" role="radio" data-level="${l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join("")}
      </div>
      <div class="sdk-status">
        <span class="sdk-lives" aria-label="Lives"></span>
        <span class="sdk-time" aria-label="Time">0:00</span>
      </div>
      <div class="sdk-grid" role="grid" aria-label="Sudoku"></div>
      <div class="sdk-bar">
        <button type="button" class="secondary sdk-new">New game</button>
        <span class="sdk-msg muted" role="status"></span>
      </div>
      <div class="sdk-stats muted"></div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const toggle = $(".sdk-toggle"), panel = $(".sdk-panel"), gridEl = $(".sdk-grid");
  const msg = $(".sdk-msg"), livesEl = $(".sdk-lives"), timeEl = $(".sdk-time"), statsEl = $(".sdk-stats");

  // ----- timer (pauses while the panel is closed) -----
  const now = () => elapsed + (runningSince ? Date.now() - runningSince : 0);
  function startClock() {
    if (over || runningSince) return;
    runningSince = Date.now();
    tick = setInterval(() => (timeEl.textContent = fmtTime(now())), 1000);
  }
  function stopClock() {
    if (runningSince) elapsed += Date.now() - runningSince;
    runningSince = null;
    clearInterval(tick);
    timeEl.textContent = fmtTime(elapsed);
  }

  function renderLives(breaking = false) {
    livesEl.replaceChildren();
    for (let i = 0; i < SUDOKU_LIVES; i++) {
      const alive = i < SUDOKU_LIVES - mistakes;
      const h = Object.assign(document.createElement("span"), { textContent: alive ? "❤️" : "💔" });
      if (!alive) h.className = "lost";
      if (breaking && i === SUDOKU_LIVES - mistakes) h.classList.add("breaking");
      livesEl.append(h);
    }
  }

  function renderStats() {
    const s = stats[stats.level];
    const best = s.best ? ` · ⏱ best ${fmtTime(s.best)}` : "";
    statsEl.textContent = `${stats.level[0].toUpperCase() + stats.level.slice(1)}: 🏆 ${s.wins || 0} won · 💔 ${s.losses || 0} lost${best}`;
    root.querySelectorAll("[data-level]").forEach((b) => {
      const on = b.dataset.level === stats.level;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
  }

  function finish(won) {
    over = true;
    stopClock();
    const s = stats[stats.level];
    if (won) {
      s.wins = (s.wins || 0) + 1;
      if (!s.best || elapsed < s.best) s.best = elapsed;
      msg.textContent = `Solved in ${fmtTime(elapsed)}! 🎉`;
      cells.forEach((el, i) => { el.style.setProperty("--d", `${(Math.floor(i / 9) + (i % 9)) * 30}ms`); el.classList.add("win"); });
    } else {
      s.losses = (s.losses || 0) + 1;
      msg.textContent = "Out of lives 💔";
      gridEl.classList.add("lost");
    }
    cells.forEach((el) => (el.readOnly = true));
    saveStats(stats);
    renderStats();
  }

  function onInput(el, i) {
    el.value = el.value.replace(/[^1-9]/g, "").slice(-1);
    if (!el.value || over) return;
    const v = Number(el.value);
    if (v === game.solution[i]) {
      el.readOnly = true;
      el.classList.add("ok");
      const left = cells.filter((c) => !c.readOnly).length;
      if (left === 0) finish(true);
      else msg.textContent = `${left} left`;
      return;
    }
    // wrong: costs a life
    mistakes++;
    el.classList.remove("bad"); void el.offsetWidth; el.classList.add("bad");
    renderLives(true);
    setTimeout(() => { if (!el.classList.contains("ok")) { el.value = ""; el.classList.remove("bad"); } }, 700);
    if (mistakes >= SUDOKU_LIVES) finish(false);
    else msg.textContent = `Oops — ${SUDOKU_LIVES - mistakes} ${SUDOKU_LIVES - mistakes === 1 ? "life" : "lives"} left`;
  }

  function newGame() {
    stopClock();
    game = generate(LEVELS[stats.level]);
    mistakes = 0; over = false; elapsed = 0;
    gridEl.classList.remove("lost");
    gridEl.replaceChildren();
    cells = game.puzzle.map((v, i) => {
      const el = document.createElement("input");
      el.inputMode = "numeric";
      el.maxLength = 1;
      el.className = "sdk-cell";
      if (Math.floor(i / 9) % 3 === 2 && i < 72) el.classList.add("bb");
      if (i % 9 % 3 === 2 && i % 9 !== 8) el.classList.add("br");
      el.setAttribute("aria-label", `Row ${Math.floor(i / 9) + 1} column ${(i % 9) + 1}`);
      if (v) { el.value = v; el.readOnly = true; el.classList.add("given"); }
      el.addEventListener("input", () => onInput(el, i));
      gridEl.append(el);
      return el;
    });
    renderLives();
    msg.textContent = `${cells.filter((c) => !c.readOnly).length} left`;
    timeEl.textContent = "0:00";
    renderStats();
    if (!panel.hidden) startClock();
  }

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (panel.hidden) return stopClock();
    if (!game) newGame(); else startClock();
  });
  $(".sdk-new").addEventListener("click", newGame);
  root.querySelectorAll("[data-level]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.level === stats.level && game) return;
    stats.level = b.dataset.level;
    saveStats(stats);
    newGame();
  }));
  renderStats();
}

