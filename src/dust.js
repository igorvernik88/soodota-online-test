// Personal inspection windows never change the shared board or input rules.
export class DustVision {
  constructor(game) {
    this.game = game;
    this.windows = new WeakMap();
  }
  active(viewer, target) {
    return (
      target?.kind === "health" &&
      !target.unit.dead &&
      viewer.team !== target.unit.team &&
      target.unit.dustUntil > this.game.time
    );
  }
  cast(hero) {
    const g = this.game,
      p = g.skill(hero, "dust");
    if (
      !p ||
      hero.role !== "agile" ||
      hero.dead ||
      hero.duel ||
      g.phase !== "playing" ||
      hero.stunnedUntil > g.time ||
      g.heroEffects.trapped(hero)
    )
      return { ok: false, message: "Пыль недоступна" };
    if (hero.dustAt > g.time)
      return { ok: false, message: "Пыль перезаряжается" };
    hero.dustUntil = g.time + p.duration;
    hero.dustAt = g.time + p.cooldown;
    return { ok: true };
  }
  window(viewer, target) {
    let pages = this.windows.get(viewer);
    if (!pages) this.windows.set(viewer, (pages = new WeakMap()));
    const page = target.pages?.[target.activePage || 0] || target;
    let state = pages.get(page);
    if (!state || state.until !== target.unit.dustUntil) {
      state = {
        center: 0,
        until: target.unit.dustUntil,
        nextScan: 0,
        memory: [],
      };
      pages.set(page, state);
    }
    return state;
  }
  select(viewer, target, index) {
    if (!this.active(viewer, target)) return;
    const size = this.game.puzzle(viewer, target).rules.size;
    if (index >= 0 && index < size * size)
      this.window(viewer, target).center = index;
  }
  readable(viewer, target, index) {
    if (!this.active(viewer, target)) return true;
    const n = this.game.puzzle(viewer, target).rules.size,
      center = this.window(viewer, target).center;
    return (
      Math.abs(Math.floor(index / n) - Math.floor(center / n)) <= 1 &&
      Math.abs((index % n) - (center % n)) <= 1
    );
  }
  inspectBot(viewer, target, visible, blocked) {
    if (!this.active(viewer, target)) return null;
    const g = this.game,
      state = this.window(viewer, target),
      p = g.puzzle(viewer, target);
    if (g.time >= state.nextScan) {
      state.center = (state.center + 1) % visible.length;
      state.nextScan = g.time + 0.5;
    }
    const hints = g.hints(viewer, target);
    for (let i = 0; i < visible.length; i++) {
      if (!this.readable(viewer, target, i)) continue;
      const hint = hints.find((h) => h.index === i);
      state.memory[i] =
        visible[i] ||
        (hint ? g.displayDigit(target, viewer.team, hint.value) : 0);
    }
    return {
      visible: visible.map((v, i) =>
        this.readable(viewer, target, i) ? v : state.memory[i] || 0,
      ),
      hint: hints.find(
        (h) => this.readable(viewer, target, h.index) && !blocked.has(h.index),
      ),
      memory: state.memory,
    };
  }
}
