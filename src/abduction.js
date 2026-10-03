import { CONFIG, BASES } from "./config.js";
import { dist } from "./sudoku.js";

export class Abduction {
  constructor(game) {
    this.game = game;
  }
  carried(hero) {
    return hero?.carriedBy != null;
  }
  release(hero) {
    const victim = this.game
      .actors()
      .find((h) => h.id === hero.abduction?.targetId);
    if (victim?.carriedBy === hero.id) {
      victim.carriedBy = null;
      victim.target = null;
      victim.followTarget = null;
    }
    hero.abduction = null;
  }
  cast(hero, victim) {
    const g = this.game,
      p = g.skill(hero, "abduction"),
      access = g.erasers.actorAccess(hero);
    if (!access.ok) return access;
    if (
      hero.role !== "editor" ||
      !p ||
      hero.abduction ||
      hero.abductionAt > g.time
    )
      return { ok: false, message: "Похищение недоступно или перезаряжается" };
    if (
      !g.actors().includes(victim) ||
      victim.dead ||
      victim.duel ||
      victim.team === hero.team ||
      !g.vision.visible(hero.team, victim)
    )
      return { ok: false, message: "Выберите обнаруженного вражеского героя" };
    if (
      this.carried(victim) ||
      victim.abduction ||
      g.heroEffects.trapped(victim) ||
      g.heroEffects.protected(victim)
    )
      return {
        ok: false,
        message: "Цель уже захвачена или находится в коробке",
      };
    if (dist(hero, victim) > CONFIG.editorRange) {
      g.move(hero, victim.x, victim.y, { pursueEnemy: true });
      hero.pendingAbduction = { targetId: victim.id };
      return { ok: true, queued: true };
    }
    for (const unit of [hero, victim]) {
      const partner = g.actors().find((h) => h.id === unit.lasso?.partner);
      if (partner?.lasso?.partner === unit.id) partner.lasso = null;
      unit.lasso = null;
    }
    hero.pendingAbduction = null;
    hero.abduction = {
      targetId: victim.id,
      until: g.time + p.duration,
      speed: p.speed,
    };
    hero.abductionAt = g.time + g.editorSkillCooldown(hero, p.cooldown);
    victim.carriedBy = hero.id;
    Object.assign(victim, {
      target: null,
      followTarget: null,
      pendingPencilCast: null,
      pendingAbduction: null,
      wardPlacement: null,
      eraserPickup: null,
      flowerRun: false,
      fighting: null,
      task: null,
      animationTargetId: null,
    });
    victim.x = hero.x;
    victim.y = hero.y;
    g.combat.sync(victim);
    if (hero !== g.player || g.autoPlayer) {
      const tower = g.towers
        .filter((t) => t.defender === hero.team && !t.destroyed)
        .sort((a, b) => dist(hero, a) - dist(hero, b))[0];
      const destination = tower || BASES[hero.team];
      g.move(hero, destination.x, destination.y);
    }
    return { ok: true };
  }
  approach(hero) {
    const pending = hero.pendingAbduction;
    if (!pending) return;
    const g = this.game,
      victim = g.actors().find((h) => h.id === pending.targetId);
    if (
      !g.erasers.actorAccess(hero).ok ||
      !victim ||
      victim.dead ||
      this.carried(victim) ||
      g.heroEffects.trapped(victim) ||
      g.heroEffects.protected(victim)
    ) {
      hero.pendingAbduction = null;
      hero.target = null;
      return;
    }
    if (!g.vision.visible(hero.team, victim)) {
      if (!hero.target) hero.pendingAbduction = null;
      return;
    }
    if (dist(hero, victim) <= CONFIG.editorRange) {
      const result = this.cast(hero, victim);
      hero.pendingAbduction = null;
      if (!result.ok) hero.target = null;
    } else if (hero.target) {
      hero.target.x = victim.x;
      hero.target.y = victim.y;
    }
  }
  tick() {
    const g = this.game;
    for (const hero of g.actors()) {
      if (!hero.abduction) continue;
      const victim = g.actors().find((h) => h.id === hero.abduction.targetId);
      if (
        hero.dead ||
        !victim ||
        victim.dead ||
        hero.abduction.until <= g.time ||
        hero.stunnedUntil > g.time ||
        g.heroEffects.trapped(hero)
      ) {
        this.release(hero);
        continue;
      }
      victim.x = hero.x;
      victim.y = hero.y;
      g.combat.sync(victim);
    }
  }
}
