import { CONFIG } from "./config.js";
import { dist, logicalMove } from "./sudoku.js";
// Windows belong to a specific health life/page and are shared by its attackers.
export class InkBinding {
  constructor(game) {
    this.game = game;
    this.pages = new WeakMap();
  }
  active(target) {
    const effect = target?.kind === "health" && target.unit.inkBinding;
    return effect &&
      effect.life === target.unit.hp &&
      !target.unit.dead &&
      effect.until > this.game.time
      ? effect
      : null;
  }
  cast(hero, ally) {
    const g = this.game,
      p = g.skill(hero, "inkBinding"),
      access = g.erasers.actorAccess(hero);
    if (!access.ok) return access;
    if (
      hero.role !== "editor" ||
      !p ||
      !g.actors().includes(ally) ||
      ally.dead ||
      ally.duel ||
      ally.team !== hero.team ||
      dist(hero, ally) > CONFIG.editorRange
    )
      return { ok: false, message: "Выберите живого союзника в радиусе 350" };
    if (
      hero.inkBindingAt > g.time ||
      this.active(ally.hp) ||
      g.heroEffects.protected(ally)
    )
      return {
        ok: false,
        message: "Переплёт уже действует или перезаряжается",
      };
    const until = g.time + p.duration,
      team = 1 - ally.team;
    const states = (ally.hp.pages || [ally.hp]).map((page, index) => ({
      page,
      index,
      state: this.create(page, team, until),
    }));
    if (
      states.some(
        ({ page, state }) => !page.completed[team] && !state?.available.length,
      )
    )
      return { ok: false, message: "Нет доступного логического хода" };
    for (const { page, state } of states)
      if (state) this.pages.set(page, state);
    ally.inkBinding = { until, owner: hero.id, life: ally.hp };
    g.emit("inkBindingCast", { hero: hero.id });
    hero.inkBindingAt = g.time + g.editorSkillCooldown(hero, p.cooldown);
    return { ok: true };
  }
  create(page, team, until, previous = []) {
    if (page.completed[team]) return null;
    const b = page.boards[team],
      p = page.puzzles[team],
      g = this.game;
    const eligible = b.flatMap((v, i) =>
      !v &&
      !page.stones[team][i] &&
      !page.holes[team].includes(i) &&
      !(
        page.runeBinding?.until > g.time &&
        !page.runeBinding.resolved &&
        (page.runeBinding.z === i || page.runeBinding.keys.includes(i))
      ) &&
      !(
        page.effects[team]?.until > g.time &&
        page.effects[team].indices?.includes(i)
      ) &&
      !(page.errors[team][i]?.until > g.time)
        ? [i]
        : [],
    );
    const move = logicalMove(
      b,
      p.rules,
      new Set(b.map((_, i) => i).filter((i) => !eligible.includes(i))),
    );
    const order = p.hintOrder || b.map((_, i) => i);
    const available = [...previous.filter((i) => eligible.includes(i))];
    if (
      move &&
      eligible.includes(move.index) &&
      !available.includes(move.index)
    )
      available.unshift(move.index);
    for (const i of order)
      if (
        eligible.includes(i) &&
        !available.includes(i) &&
        available.length < 3
      )
        available.push(i);
    available.splice(3);
    const index =
      move && available.includes(move.index) ? move.index : available[0];
    return {
      until,
      available,
      hint: index === undefined ? null : { index, value: p.solution[index] },
      signature: b.join(",") + ":" + eligible.join(","),
    };
  }
  state(viewer, target) {
    const effect = this.active(target);
    if (!effect || viewer.team === target.unit.team) return null;
    const page =
      target.pages?.[target.activePage || 0] || target.rootTarget || target;
    let state = this.pages.get(page);
    const fresh = this.create(
      page,
      viewer.team,
      effect.until,
      state?.available || [],
    );
    if (!state || state.signature !== fresh?.signature) {
      state = fresh;
      if (state) this.pages.set(page, state);
    }
    return state;
  }
  blocked(viewer, target) {
    const state = this.state(viewer, target);
    return state
      ? target.boards[viewer.team].flatMap((v, i) =>
          !v && !state.available.includes(i) ? [i] : [],
        )
      : [];
  }
  hint(viewer, target) {
    return this.state(viewer, target)?.hint;
  }
}
