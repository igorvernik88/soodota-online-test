export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function seeded(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function candidates(cells, i, rules) {
  if (cells[i]) return [];
  const { size: n, blockRows: br, blockCols: bc } = rules,
    r = Math.floor(i / n),
    c = i % n,
    used = new Set();
  for (let k = 0; k < n; k++) {
    used.add(cells[r * n + k]);
    used.add(cells[k * n + c]);
  }
  for (let y = Math.floor(r / br) * br; y < Math.floor(r / br) * br + br; y++)
    for (let x = Math.floor(c / bc) * bc; x < Math.floor(c / bc) * bc + bc; x++)
      used.add(cells[y * n + x]);
  return Array.from({ length: n }, (_, k) => k + 1).filter((v) => !used.has(v));
}
export function countSolutions(input, rules, limit = 2) {
  const a = input.slice();
  let count = 0;
  function visit() {
    let i = -1,
      opts;
    for (let k = 0; k < a.length; k++)
      if (!a[k]) {
        const c = candidates(a, k, rules);
        if (!c.length) return;
        if (!opts || c.length < opts.length) {
          i = k;
          opts = c;
        }
        if (c.length === 1) break;
      }
    if (i < 0) {
      count++;
      return;
    }
    for (const v of opts) {
      a[i] = v;
      visit();
      if (count >= limit) break;
    }
    a[i] = 0;
  }
  visit();
  return count;
}
export function makePuzzle(
  rules,
  seed,
  blanks = { 4: 8, 6: 23, 9: 52, 12: 98 }[rules.size],
) {
  const random = seeded(seed),
    { size: n, blockRows: br, blockCols: bc } = rules;
  const digits = Array.from({ length: n }, (_, i) => i + 1).sort(
    () => random() - 0.5,
  );
  const solution = Array.from(
    { length: n * n },
    (_, i) =>
      digits[
        (Math.floor(i / n) * bc +
          Math.floor(Math.floor(i / n) / br) +
          (i % n)) %
          n
      ],
  );
  const givens = solution.slice(),
    order = Array.from({ length: n * n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    let j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let removed = 0;
  for (const i of order) {
    const old = givens[i];
    givens[i] = 0;
    if (!solvableByLogic(givens, rules)) givens[i] = old;
    else removed++;
    if (removed >= blanks) break;
  }
  return { rules, givens, solution };
}
export function logicalMove(cells, rules, excluded = new Set()) {
  const { size: n, blockRows: br, blockCols: bc } = rules;
  const opts = cells.map((_, i) => candidates(cells, i, rules));
  for (let i = 0; i < opts.length; i++)
    if (opts[i].length === 1 && !excluded.has(i))
      return { index: i, value: opts[i][0] };
  const units = [];
  for (let k = 0; k < n; k++) {
    units.push(Array.from({ length: n }, (_, j) => k * n + j));
    units.push(Array.from({ length: n }, (_, j) => j * n + k));
  }
  for (let r = 0; r < n; r += br)
    for (let c = 0; c < n; c += bc) {
      const u = [];
      for (let y = 0; y < br; y++)
        for (let x = 0; x < bc; x++) u.push((r + y) * n + c + x);
      units.push(u);
    }
  for (const u of units)
    for (let v = 1; v <= n; v++) {
      const slots = u.filter((i) => opts[i].includes(v));
      if (slots.length === 1 && !excluded.has(slots[0]))
        return { index: slots[0], value: v };
    }
  return null;
}

export function solvableByLogic(input, rules) {
  const a = input.slice();
  while (a.includes(0)) {
    const m = logicalMove(a, rules);
    if (!m) return false;
    a[m.index] = m.value;
  }
  return true;
}
