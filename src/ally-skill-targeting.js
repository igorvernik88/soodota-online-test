import { CONFIG } from "./config.js";
import { dist } from "./sudoku.js";

// Reusable click-to-cast mode for skills targeting self or a nearby ally.
const skills = {
  throwOka: {
    enemy: true,
    radius: 700,
    apply: (game, target) => game.duet.throw(game.player, target),
  },
  veil: {
    radius: 1200,
    towers: true,
    apply: (game, target) => game.useItem(game.player, "veil", target),
  },
  freshSudoku: {
    enemy: true,
    radius: 350,
    apply: (game, target) => game.sudzh.fresh(game.player, target),
  },
  abduction: {
    enemy: true,
    radius: CONFIG.editorRange,
    apply: (game, target) => game.abduction.cast(game.player, target),
  },
  inkBinding: {
    radius: CONFIG.editorRange,
    apply: (game, target) => game.inkBinding.cast(game.player, target),
  },
  tempoSlow: {
    any: true,
    radius: CONFIG.effectRadius,
    apply: (game, target) =>
      target && game.actors().includes(target)
        ? game.editorTempo(
            game.player,
            target.team === game.player.team ? "haste" : "slow",
            target,
          )
        : { ok: false, message: "Выберите героя для Темпа" },
  },
  tempoHaste: {
    radius: CONFIG.effectRadius,
    apply: (game, target) => game.editorTempo(game.player, "haste", target),
  },
  box: {
    any: true,
    radius: CONFIG.effectRadius,
    apply: (game, target) => game.heroEffects.box(game.player, target),
  },
  breakPencil: {
    enemy: true,
    radius: CONFIG.effectRadius,
    apply: (game, target) => game.breakPencil(game.player, target),
  },
  rune: {
    radius: CONFIG.effectRadius,
    apply: (game, target) => game.runes.cast(game.player, target),
  },
};
export class AllySkillTargeting {
  constructor(renderer) {
    this.renderer = renderer;
    this.id = null;
  }
  get active() {
    return !!this.id;
  }
  get radius() {
    return skills[this.id]?.radius || 0;
  }
  toggle(id) {
    this.id = this.id === id ? null : skills[id] ? id : null;
  }
  cancel() {
    this.id = null;
  }
  accepts(hero) {
    const game = this.renderer.game;
    return (
      this.active &&
      (game.actors().includes(hero) ||
        (skills[this.id].towers && game.towers.includes(hero))) &&
      !hero.dead &&
      (skills[this.id].any ||
        (skills[this.id].enemy
          ? hero.team !== game.player.team
          : (hero.team ?? hero.defender) === game.player.team))
    );
  }
  eligible(hero) {
    return (
      this.accepts(hero) && dist(this.renderer.game.player, hero) <= this.radius
    );
  }
  apply(target) {
    if (!this.active) return { ok: false, message: "Выберите навык" };
    const result = skills[this.id].apply(
      this.renderer.game,
      target?.unit || (skills[this.id].towers ? target : null),
    );
    if (result.ok) this.cancel();
    return result;
  }
}
