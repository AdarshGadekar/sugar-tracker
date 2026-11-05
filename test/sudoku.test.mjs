import { test } from "node:test";
import assert from "node:assert/strict";
import { generate, canPlace, isSolved, LEVELS } from "../public/sudoku.js";

test("difficulty levels: more blanks as it gets harder, hard generates quickly", () => {
  assert.ok(LEVELS.easy < LEVELS.medium && LEVELS.medium < LEVELS.hard);
  const t = Date.now();
  const { puzzle } = generate(LEVELS.hard);
  const blanks = puzzle.filter((v) => v === 0).length;
  assert.ok(blanks >= 45 && blanks <= LEVELS.hard, `hard blanks = ${blanks}`);
  assert.ok(Date.now() - t < 3000, "hard puzzle took too long");
});

test("generated solution is a valid full grid", () => {
  const { solution } = generate(40);
  assert.equal(solution.length, 81);
  solution.forEach((v, i) => assert.ok(v >= 1 && v <= 9 && canPlace(solution, i, v)));
});

test("puzzle has 40 blanks and matches the solution on givens", () => {
  const { puzzle, solution } = generate(40);
  assert.equal(puzzle.filter((v) => v === 0).length, 40);
  puzzle.forEach((v, i) => v && assert.equal(v, solution[i]));
  assert.equal(isSolved(puzzle, solution), false);
  assert.equal(isSolved(solution, solution), true);
});
