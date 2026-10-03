import { FIRE, CONFIG } from "./config.js";
import { dist } from "./sudoku.js";
export class FireSkills {
  constructor(game) {
    this.game = game;
    this.pending = [];
  }
  charges(h) {
    const p = this.game.skill(h, "burning");
    if (!p) return null;
    h.fireCharges ||= { count: 1, nextAt: this.game.time + p.cooldown };
    const s = h.fireCharges;
    while (s.count < FIRE.maxCharges && s.nextAt <= this.game.time) {
      s.count++;
      s.nextAt = s.count < FIRE.maxCharges ? s.nextAt + p.cooldown : null;
    }
    return s;
  }
  consume(h, count) {
    const s = this.charges(h),
      p = this.game.skill(h, "burning");
    if (!s || s.count < count) return false;
    if (s.count === FIRE.maxCharges) s.nextAt = this.game.time + p.cooldown;
    s.count -= count;
    return true;
  }
  active(h) {
    return !h?.dead && h?.tornadoUntil > this.game.time
      ? h.tornadoParams || this.game.skill(h, "tornado")
      : null;
  }
  access(h) {
    return (
      this.game.phase === "playing" &&
      !h.dead &&
      !h.duel &&
      h.role === "sudaks" &&
      !(h.stunnedUntil > this.game.time) &&
      !this.game.heroEffects.trapped(h) &&
      !(h.forcedSolve?.until > this.game.time)
    );
  }
  tornado(h) {
    const g = this.game,
      p = g.skill(h, "tornado");
    if (!p || !this.access(h))
      return { ok: false, message: "Торнадо недоступно" };
    if (h.tornadoAt > g.time)
      return { ok: false, message: "Торнадо перезаряжается" };
    h.tornadoAt = g.time + p.cooldown;
    this.pending.push({
      type: "tornado",
      h,
      params: { ...p },
      at: g.time + FIRE.castDelay,
    });
    g.emit("tornadoEnter", { hero: h.id });
    return { ok: true };
  }
  targetPage(h) {
    const t = this.game.heroEffects.protected(h) ? h.boxProtection : h.hp,
      team = 1 - h.team;
    const page = t.pages?.[t.activePage || 0] || t;
    return page.completed[team]
      ? t.pages?.find((p) => !p.completed[team]) || page
      : page;
  }
  free(h) {
    const t = this.targetPage(h),
      team = 1 - h.team,
      p = t.puzzles[team];
    if (t.completed[team]) return [];
    return p.hintOrder.filter(
      (i) =>
        !t.boards[team][i] &&
        this.game.duet.owns(h.hp, i, t) &&
        !this.game.duet.reserved({ ...h.hp, ...t }, i) &&
        !(t.armor[team][i] > this.game.time) &&
        !t.stones[team][i] &&
        !(t.errors[team][i]?.until > this.game.time),
    );
  }
  distribution(
    h,
    point,
    charges = this.charges(h)?.count || 0,
    preview = false,
    params = this.game.skill(h, "burning"),
  ) {
    const g = this.game,
      p = params;
    if (!p) return [];
    const targets = g
      .actors()
      .filter(
        (u) =>
          !u.dead &&
          !u.duel &&
          dist(u, point) <= FIRE.ballRadius &&
          (!preview || g.vision.visible(h.team, u)),
      )
      .sort((a, b) => dist(a, point) - dist(b, point) || a.id - b.id);
    const allocation = targets.map((hero) => ({
      hero,
      count: 0,
      capacity: Math.min(p.cap, this.free(hero).length),
    }));
    let budget = charges * p.count,
      moved = true;
    while (budget > 0 && moved) {
      moved = false;
      for (const e of allocation)
        if (budget > 0 && e.count < e.capacity) {
          e.count++;
          budget--;
          moved = true;
        }
    }
    return allocation.filter((e) => e.count);
  }
  ball(h, point) {
    const g = this.game,
      s = this.charges(h);
    if (!this.access(h) || !s?.count)
      return { ok: false, message: "Нет зарядов Горящих цифр" };
    if (
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x > CONFIG.worldSize ||
      point.y > CONFIG.worldSize ||
      dist(h, point) > FIRE.ballRange
    )
      return { ok: false, message: "Точка вне дальности броска" };
    const count = s.count;
    this.consume(h, count);
    this.pending.push({
      type: "ball",
      h,
      point: { x: point.x, y: point.y },
      charges: count,
      params: { ...g.skill(h, "burning") },
      at: g.time + FIRE.castDelay,
    });
    g.emit("fireballCast", {
      hero: h.id,
      x: point.x,
      y: point.y,
      fromX: h.x,
      fromY: h.y,
    });
    return { ok: true };
  }
  convertHit(attacker, t, index) {
    const incoming = this.active(t.unit),
      outgoing = this.active(attacker);
    if (!incoming && !outgoing) return;
    this.game.heroEffects.markBurning(
      attacker,
      t,
      [index],
      incoming?.incoming ||
        this.game.skill(attacker, "burning")?.duration ||
        FIRE.outgoingDuration,
      attacker.team,
    );
  }
  tick() {
    const g = this.game;
    g.forest.recover();
    for (const h of g.heroes) {
      this.charges(h);
      if (this.active(h)) g.forest.burn(h);
      if (h.tornadoUntil && (h.dead || h.tornadoUntil <= g.time)) {
        h.tornadoUntil = 0;
        if (!h.dead) g.emit("tornadoExit", { hero: h.id });
      }
    }
    this.pending = this.pending.filter((e) => {
      if (e.h.dead) return false;
      if (e.at > g.time) return true;
      if (e.type === "tornado") {
        e.h.tornadoParams = e.params;
        e.h.tornadoUntil = e.at + e.params.duration;
        g.forest.burn(e.h);
      } else {
        const p = e.params;
        for (const { hero, count } of this.distribution(
          e.h,
          e.point,
          e.charges,
          false,
          e.params,
        )) {
          const t = g.heroEffects.protected(hero)
              ? hero.boxProtection
              : hero.hp,
            team = 1 - hero.team;
          const page = this.targetPage(hero);
          if (t.pages) g.selectPage(t, t.pages.indexOf(page));
          const cells = this.free(hero).slice(0, count);
          g.heroEffects.fillBurning(e.h, t, cells, p.duration, team);
          if (t.kind === "prison") {
            g.complete({ ...e.h, team }, t, true);
            continue;
          }
          if (g.solved({ team }, t)) {
            if (t.pages?.length > 1) {
              g.combat.completePage(t, team);
              g.emit("healthPage", { target: t.id, page: t.activePage, team });
              if (t.pages.every((page) => page.completed[team]))
                g.combat.kill(hero, e.h);
              else
                g.selectPage(
                  t,
                  t.pages.findIndex((page) => !page.completed[team]),
                );
            } else g.combat.kill(hero, e.h);
          }
        }
        g.emit("fireballImpact", { hero: e.h.id, x: e.point.x, y: e.point.y });
      }
      return false;
    });
  }
}
