import { makePuzzle, seeded } from "./sudoku.js";

// A page owns its progress. Selecting a page only changes the building's view.
export function dataFields(puzzles) {
  return {
    puzzles,
    boards: puzzles.map((p) => p.givens.slice()),
    completed: [false, false],
    effects: [null, null],
    invertedUntil: [0, 0],
    holes: [[], []],
    errors: [{}, {}],
    stones: [{}, {}],
    arrivals: [{}, {}],
    universal: [{}, {}],
    doubleStroke: [{}, {}],
    poison: [{}, {}],
    armor: [{}, {}],
    burning: [{}, {}],
  };
}
export function emptyPuzzle(rules, seed, hintCount = 0) {
  const p = makePuzzle(rules, seed),
    random = seeded(seed + 77),
    hints = p.givens.slice();
  const hintOrder = Array.from({ length: rules.size ** 2 }, (_, i) => i);
  for (let i = hintOrder.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [hintOrder[i], hintOrder[j]] = [hintOrder[j], hintOrder[i]];
  }
  for (const i of hintOrder.slice(0, hintCount)) hints[i] = p.solution[i];
  return { ...p, givens: p.givens.map(() => 0), hints, hintOrder };
}
export function sparsePuzzle(rules, seed, hintCount = 0) {
  const p = makePuzzle(rules, seed),
    random = seeded(seed + 77),
    hints = Array(p.solution.length).fill(0),
    hintOrder = Array.from({ length: rules.size ** 2 }, (_, i) => i);
  for (let i = hintOrder.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [hintOrder[i], hintOrder[j]] = [hintOrder[j], hintOrder[i]];
  }
  for (const i of hintOrder.slice(0, hintCount)) hints[i] = p.solution[i];
  return { ...p, givens: p.givens.map(() => 0), hints, hintOrder };
}
export function makePage(rules, seed, hints) {
  const p = emptyPuzzle(rules, seed, hints);
  return dataFields([structuredClone(p), structuredClone(p)]);
}
export function makeSparsePage(rules, seed, hints = 0) {
  const p = sparsePuzzle(rules, seed, hints);
  return dataFields([structuredClone(p), structuredClone(p)]);
}
export function bindPage(target, index) {
  const page = target.pages[index];
  target.activePage = index;
  for (const key of [
    "puzzles",
    "boards",
    "completed",
    "effects",
    "invertedUntil",
    "holes",
    "errors",
    "stones",
    "arrivals",
    "universal",
    "doubleStroke",
    "poison",
    "armor",
    "burning",
  ])
    target[key] = page[key];
  return target;
}
