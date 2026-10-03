import { dist } from "./sudoku.js";

// World-space projectiles and channels; the renderer only projects this state.
export class SudzhSkills {
  constructor(game) {
    this.game = game;
    this.hooks = [];
  }
  held(unit) {
    return this.hooks.some((hook) => hook.victim === unit);
  }
  access(hero, id) {
    const g = this.game,
      p = g.skill(hero, id),
      access = g.erasers.actorAccess(hero);
    if (!access.ok) return access;
    if (
      hero.role !== "sudzh" ||
      !p ||
      hero.freshSudoku ||
      (hero[id === "freshSudoku" ? "freshAt" : "hookAt"] > g.time &&
        id !== "stench")
    )
      return { ok: false, message: "Навык недоступен или перезаряжается" };
    return { ok: true, p };
  }
  hook(hero, point) {
    const g = this.game,
      access = this.access(hero, "hook");
    if (!access.ok) return access;
    if (this.hooks.some((hook) => hook.hero === hero))
      return { ok: false, message: "Крюк ещё в полёте" };
    const length = dist(hero, point);
    if (!Number.isFinite(length) || length < 1)
      return { ok: false, message: "Выберите направление" };
    const { p } = access;
    this.hooks.push({
      hero,
      x: hero.x,
      y: hero.y,
      dx: (point.x - hero.x) / length,
      dy: (point.y - hero.y) / length,
      travelled: 0,
      range: p.range,
      speed: p.projectileSpeed,
      hitRadius: p.hitRadius,
      victim: null,
    });
    hero.hookAt = g.time + p.cooldown;
    g.emit("hookCast", { hero: hero.id });
    return { ok: true };
  }
  toggleStench(hero) {
    if (hero.stench) {
      hero.stench = null;
      return { ok: true };
    }
    const access = this.access(hero, "stench");
    if (!access.ok) return access;
    hero.stench = { nextAt: this.game.time + access.p.interval };
    return { ok: true };
  }
  endFresh(hero) {
    const effect = hero.freshSudoku;
    if (!effect) return;
    const target = this.game.actors().find((u) => u.id === effect.targetId);
    if (target?.stunnedUntil === effect.until)
      target.stunnedUntil = effect.previousStun;
    hero.freshSudoku = null;
  }
  fresh(hero, target) {
    const g = this.game,
      access = this.access(hero, "freshSudoku");
    if (!access.ok) return access;
    if (
      !g.actors().includes(target) ||
      target.dead ||
      target.duel ||
      target.team === hero.team ||
      !g.vision.visible(hero.team, target) ||
      g.heroEffects.trapped(target) ||
      g.heroEffects.protected(target) ||
      target.abduction ||
      this.held(target)
    )
      return { ok: false, message: "Выберите доступного вражеского героя" };
    const { p } = access;
    if (dist(hero, target) > p.range) {
      g.move(hero, target.x, target.y, { pursueEnemy: true });
      hero.pendingFresh = { targetId: target.id };
      return { ok: true, queued: true };
    }
    hero.target = null;
    hero.followTarget = null;
    hero.pendingFresh = null;
    hero.freshSudoku = {
      targetId: target.id,
      until: g.time + p.duration,
      previousStun: target.stunnedUntil || 0,
    };
    target.stunnedUntil = Math.max(
      target.stunnedUntil || 0,
      hero.freshSudoku.until,
    );
    hero.freshAt = g.time + p.cooldown;
    hero.fighting = target.hp.id;
    hero.animationTargetId = target.hp.id;
    g.emit("freshSudoku", { hero: hero.id, target: target.hp.id });
    return { ok: true };
  }
  approach(hero) {
    if (!hero.pendingFresh) return;
    const g = this.game,
      target = g.actors().find((u) => u.id === hero.pendingFresh.targetId);
    if (!target || target.dead || !g.erasers.actorAccess(hero).ok) {
      hero.pendingFresh = null;
      hero.target = null;
      return;
    }
    if (!g.vision.visible(hero.team, target)) {
      if (!hero.target) hero.pendingFresh = null;
      return;
    }
    if (dist(hero, target) <= g.skill(hero, "freshSudoku").range) {
      const result = this.fresh(hero, target);
      hero.pendingFresh = null;
      if (!result.ok) hero.target = null;
    } else if (hero.target)
      Object.assign(hero.target, { x: target.x, y: target.y });
  }
  poison(hero, unit, duration) {
    const g = this.game,
      t = unit.hp,
      team = 1 - unit.team;
    const original = t.activePage;
    g.combat.prepareTarget(t, team);
    if (t.completed[team] || g.heroEffects.protected(unit)) {
      if (t.pages) g.selectPage(t, original);
      return;
    }
    const page = t.pages?.[t.activePage] || t;
    // Self damage uses the actual enemy attack page without granting a self-kill bounty.
    const attacker = unit === hero ? { ...hero, team, role: undefined } : hero;
    g.heroEffects.poison.push({
      token: ++g.heroEffects.serial,
      h: attacker,
      t,
      page,
      board: page.boards[team],
      at: g.time,
      count: 1,
      entries: null,
      until: g.time + duration,
    });
    if (t.pages) g.selectPage(t, original);
  }
  recordDamage(attacker, target) {
    const g = this.game,
      hero = target.unit;
    const p = hero?.role === "sudzh" && g.skill(hero, "thickBinding");
    if (!p || !attacker.role || attacker.team === hero.team || hero.dead)
      return;
    const state = (hero.thickBinding ||= { hits: 0, charges: [], decayAt: 0 });
    this.pruneArmor(hero);
    state.decayAt = g.time + p.delay + p.interval;
    state.hits++;
    if (state.hits < p.hits) return;
    state.hits = 0;
    if (state.charges.length >= p.armor) return;
    const team = 1 - hero.team;
    const cells = g.combat
      .healthPages(hero.hp)
      .flatMap((page) =>
        page.completed[team]
          ? []
          : page.boards[team].flatMap((value, index) =>
              !value &&
              !(page.armor[team][index] > g.time) &&
              !page.stones[team][index]
                ? [{ page, index }]
                : [],
            ),
      );
    if (!cells.length) return;
    const charge = cells[Math.floor(g.random() * cells.length)];
    charge.until = g.time + 1000000;
    charge.page.armor[team][charge.index] = charge.until;
    state.charges.push(charge);
  }
  pruneArmor(hero) {
    const state = hero.thickBinding;
    if (!state) return;
    const team = 1 - hero.team;
    state.charges = state.charges.filter(
      (charge) =>
        charge.page.armor[team][charge.index] === charge.until &&
        !charge.page.boards[team][charge.index] &&
        !charge.page.completed[team],
    );
  }
  tick(dt) {
    const g = this.game;
    for (const hero of g.actors()) {
      if (hero.dead) {
        hero.thickBinding = null;
        continue;
      }
      this.pruneArmor(hero);
      const state = hero.thickBinding,
        p = g.skill(hero, "thickBinding");
      while (state?.charges.length && p && g.time >= state.decayAt) {
        const charge = state.charges.shift();
        delete charge.page.armor[1 - hero.team][charge.index];
        state.decayAt += p.interval;
      }
      if (state && p && g.time >= state.decayAt) state.hits = 0;
    }
    this.hooks = this.hooks.filter((hook) => {
      const { hero } = hook;
      if (
        hero.dead ||
        hero.stunnedUntil > g.time ||
        g.heroEffects.trapped(hero)
      )
        return false;
      if (hook.victim) {
        const unit = hook.victim;
        if (
          unit.dead ||
          unit.prison?.until > g.time ||
          g.abduction.carried(unit) ||
          g.heroEffects.protected(unit) ||
          unit.abduction
        )
          return false;
        const length = dist(unit, hero),
          step = Math.min(length, hook.speed * dt);
        if (length > 0) {
          unit.x += ((hero.x - unit.x) / length) * step;
          unit.y += ((hero.y - unit.y) / length) * step;
        }
        hook.x = unit.x;
        hook.y = unit.y;
        g.combat.sync(unit);
        return length > step;
      }
      const step = Math.min(hook.speed * dt, hook.range - hook.travelled),
        from = { x: hook.x, y: hook.y };
      hook.x += hook.dx * step;
      hook.y += hook.dy * step;
      hook.travelled += step;
      const contacts = g.combat
        .units()
        .filter((u) => u !== hero && !(u.spawnAt > g.time))
        .map((unit) => {
          const along = Math.max(
            0,
            Math.min(
              step,
              (unit.x - from.x) * hook.dx + (unit.y - from.y) * hook.dy,
            ),
          );
          return {
            unit,
            along,
            gap: Math.hypot(
              unit.x - from.x - hook.dx * along,
              unit.y - from.y - hook.dy * along,
            ),
          };
        })
        .filter((c) => c.gap <= hook.hitRadius)
        .sort((a, b) => a.along - b.along || a.unit.id - b.unit.id);
      const unit = contacts[0]?.unit;
      if (unit) {
        if (
          g.heroEffects.trapped(unit) ||
          g.heroEffects.protected(unit) ||
          unit.abduction ||
          this.held(unit)
        )
          return false;
        const partner = g.actors().find((u) => u.id === unit.lasso?.partner);
        if (partner?.lasso?.partner === unit.id) partner.lasso = null;
        Object.assign(unit, { lasso: null, target: null, followTarget: null });
        if (g.actors().includes(unit)) this.endFresh(unit);
        for (const caster of g.heroes)
          if (caster.freshSudoku?.targetId === unit.id) this.endFresh(caster);
        hook.victim = unit;
        hook.x = unit.x;
        hook.y = unit.y;
        return true;
      }
      return hook.travelled < hook.range;
    });
    for (const hero of g.actors()) {
      if (hero.freshSudoku) {
        const effect = hero.freshSudoku,
          target = g.actors().find((u) => u.id === effect.targetId);
        if (
          hero.dead ||
          !target ||
          target.dead ||
          effect.until <= g.time ||
          hero.stunnedUntil > g.time ||
          g.heroEffects.trapped(hero) ||
          g.heroEffects.trapped(target) ||
          g.heroEffects.protected(target)
        )
          this.endFresh(hero);
      }
      if (!hero.stench) continue;
      if (hero.dead) {
        hero.stench = null;
        continue;
      }
      const p = g.skill(hero, "stench");
      if (g.time >= hero.stench.nextAt) {
        hero.stench.nextAt = g.time + p.interval;
        for (const unit of g.combat.units())
          if (
            (unit === hero || unit.team !== hero.team) &&
            dist(hero, unit) <= p.radius
          )
            this.poison(hero, unit, p.duration);
      }
    }
  }
  bot(hero) {
    const g = this.game;
    if (hero.role !== "sudzh" || hero.dead || this.held(hero)) return false;
    if (hero.pendingFresh) return true;
    if (hero.freshSudoku) {
      const target = g
        .actors()
        .find((u) => u.id === hero.freshSudoku.targetId)?.hp;
      if (target && g.time >= hero.thinkAt) {
        g.combat.prepareTarget(target, hero.team);
        hero.thinkAt = g.time + 0.25;
        const move = g.botMove(hero, target);
        if (move) g.place(hero, target, move.index, move.value);
      }
      return true;
    }
    const enemies = g.combat
      .units()
      .filter((u) => u.team !== hero.team && g.vision.visible(hero.team, u))
      .sort((a, b) => dist(hero, a) - dist(hero, b));
    const nearby = enemies.some((u) => dist(hero, u) <= 220);
    if (nearby !== !!hero.stench && g.skill(hero, "stench"))
      this.toggleStench(hero);
    const target = enemies.find(
      (u) => g.actors().includes(u) && dist(hero, u) <= 350,
    );
    if (target && this.fresh(hero, target).ok) return true;
    const hookTarget = enemies[0],
      p = g.skill(hero, "hook");
    if (hookTarget && p && dist(hero, hookTarget) <= p.range)
      this.hook(hero, hookTarget);
    return false;
  }
}
