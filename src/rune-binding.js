import { candidates, logicalMove, dist } from "./sudoku.js";
import { CONFIG } from "./config.js";

// Constraint propagation only: no guessed Sudoku moves enter the proof.
export function runeDeductible(cells, rules, keys, sum) {
  const board = cells.slice();
  for (let step = 0; step < board.length; step++) {
    if (keys.every((i) => board[i])) return true;
    const options = keys.map((i) =>
      board[i] ? [board[i]] : candidates(board, i, rules),
    );
    const tuples = [];
    function visit(values, total) {
      const k = values.length;
      if (k === keys.length) {
        if (total === sum) tuples.push(values);
        return;
      }
      for (const value of options[k]) {
        const i = keys[k],
          n = rules.size;
        if (
          values.some(
            (v, j) =>
              v === value &&
              (Math.floor(keys[j] / n) === Math.floor(i / n) ||
                keys[j] % n === i % n ||
                (Math.floor(keys[j] / n / rules.blockRows) ===
                  Math.floor(i / n / rules.blockRows) &&
                  Math.floor((keys[j] % n) / rules.blockCols) ===
                    Math.floor((i % n) / rules.blockCols))),
          )
        )
          continue;
        if (total + value <= sum) visit([...values, value], total + value);
      }
    }
    visit([], 0);
    if (!tuples.length) return false;
    let changed = false;
    keys.forEach((i, k) => {
      const values = new Set(tuples.map((tuple) => tuple[k]));
      if (!board[i] && values.size === 1) {
        board[i] = [...values][0];
        changed = true;
      }
    });
    if (!changed) {
      const move = logicalMove(board, rules);
      if (!move) return false;
      board[move.index] = move.value;
    }
  }
  return keys.every((i) => board[i]);
}

export class RuneBinding {
  constructor(game) {
    this.game = game;
  }
  page(t) {
    return t.pages?.[t.activePage || 0] || t;
  }
  active(t, page = this.page(t)) {
    const effect = page.runeBinding;
    if (
      !effect ||
      effect.resolved ||
      effect.until <= this.game.time ||
      t.unit?.dead
    )
      return null;
    const board = page.boards[effect.team];
    if (effect.keys.every((i) => board[i])) {
      effect.resolved = true;
      return null;
    }
    return effect;
  }
  cast(hero, target = hero) {
    const g = this.game,
      params = g.skill(hero, "rune");
    if (
      g.phase !== "playing" ||
      hero.role !== "intellect" ||
      hero.dead ||
      hero.duel ||
      hero.forcedSolve?.until > g.time ||
      hero.stunnedUntil > g.time ||
      g.heroEffects.trapped(hero) ||
      !params
    )
      return { ok: false, message: "Рунный переплёт недоступен" };
    if (hero.runeAt > g.time)
      return { ok: false, message: "Рунный переплёт перезаряжается" };
    if (
      !target ||
      !g.actors().includes(target) ||
      target.dead ||
      target.duel ||
      target.team !== hero.team ||
      dist(hero, target) > CONFIG.effectRadius
    )
      return { ok: false, message: "Выберите себя или союзного героя рядом" };
    const t = target.hp,
      team = 1 - target.team;
    if (
      (t.pages || [t]).some((page) => {
        const e = page.runeBinding;
        return (
          e &&
          !e.resolved &&
          e.until > g.time &&
          !page.completed[team] &&
          !e.keys.every((k) => page.boards[team][k])
        );
      })
    )
      return { ok: false, message: "На цели уже действует переплёт" };
    const viewer = { team },
      page = this.page(t),
      p = page.puzzles[team],
      board = page.boards[team];
    if (page.completed[team])
      return { ok: false, message: "Выберите незавершённый лист здоровья" };
    const blocked = g.blockedIndices(viewer, t);
    const hints = g
      .hints(viewer, t)
      .filter((e) => p.hints?.[e.index] && !blocked.has(e.index));
    const order = hints.map((e) => e.index);
    // One seeded shuffle, followed by a bounded search of visible clues.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(g.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let chosen = null;
    function search(keys, start) {
      if (chosen) return;
      if (keys.length === params.keys) {
        if (params.keys === 4) {
          let pair = null;
          const n = p.rules.size;
          for (let a = 0; a < keys.length; a++)
            for (let b = a + 1; b < keys.length; b++) {
              if (
                Math.abs(keys[a] - keys[b]) === n ||
                (Math.floor(keys[a] / n) === Math.floor(keys[b] / n) &&
                  Math.abs(keys[a] - keys[b]) === 1)
              )
                pair ||= [keys[a], keys[b]];
            }
          if (!pair) return;
          keys = [...keys.filter((i) => !pair.includes(i)), ...pair];
        }
        const z = board.findIndex(
          (v, i) => !v && !keys.includes(i) && !blocked.has(i),
        );
        if (z < 0) return;
        const sum = keys.reduce((s, i) => s + p.solution[i], 0);
        const visible = board.map((v, i) =>
          blocked.has(i)
            ? 0
            : v ||
              (keys.includes(i)
                ? 0
                : hints.find((e) => e.index === i)?.value || 0),
        );
        if (runeDeductible(visible, p.rules, keys, sum))
          chosen = { keys: [...keys], z, sum };
        return;
      }
      for (let i = start; i < order.length; i++)
        search([...keys, order[i]], i + 1);
    }
    search([], 0);
    if (!chosen)
      return {
        ok: false,
        message: "Нет логически разрешимых ключей и отдельной клетки Z",
      };
    page.runeBinding = {
      ...chosen,
      team,
      until: g.time + params.duration,
      level: hero.skillRanks.rune,
    };
    hero.runeAt = g.time + params.cooldown;
    g.emit("runeBinding", { hero: hero.id, target: target.id });
    return { ok: true };
  }
}
