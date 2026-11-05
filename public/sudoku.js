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

// ---------- Widget ----------
export function mountSudoku(root) {
  let game, cells;

  root.innerHTML = `
    <button class="sdk-toggle" aria-expanded="false" title="Sudoku">🧩 Sudoku</button>
    <div class="sdk-panel" hidden>
      <div class="sdk-grid" role="grid" aria-label="Sudoku"></div>
      <div class="sdk-bar">
        <button class="secondary sdk-new">New</button>
        <span class="sdk-msg muted" role="status"></span>
      </div>
    </div>`;
  const toggle = root.querySelector(".sdk-toggle");
  const panel = root.querySelector(".sdk-panel");
  const gridEl = root.querySelector(".sdk-grid");
  const msg = root.querySelector(".sdk-msg");

  function current() {
    return cells.map((el, i) => game.puzzle[i] || Number(el.value) || 0);
  }

  function refresh() {
    const g = current();
    cells.forEach((el, i) => el.classList.toggle("bad", g[i] !== 0 && !canPlace(g, i, g[i])));
    if (isSolved(g, game.solution)) msg.textContent = "Solved! 🎉";
    else msg.textContent = `${g.filter((v) => !v).length} left`;
  }

  function newGame() {
    game = generate(40);
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
      el.addEventListener("input", () => {
        el.value = el.value.replace(/[^1-9]/g, "").slice(-1);
        refresh();
      });
      gridEl.append(el);
      return el;
    });
    refresh();
  }

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden && !game) newGame();
  });
  root.querySelector(".sdk-new").addEventListener("click", newGame);
}
