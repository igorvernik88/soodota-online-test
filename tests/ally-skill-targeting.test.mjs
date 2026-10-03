import test from "node:test";
import assert from "node:assert/strict";
import { AllySkillTargeting } from "../src/ally-skill-targeting.js";
import { Renderer } from "../src/render.js";
import { CONFIG } from "../src/config.js";

function fixture() {
  const player = {
      id: 0,
      team: 0,
      x: 0,
      y: 0,
      target: { x: 500, y: 200 },
      hp: { id: "self", kind: "health" },
    },
    ally = { id: 1, team: 0, x: 50, y: 0, hp: { id: "ally", kind: "health" } },
    enemy = {
      id: 2,
      team: 1,
      x: 50,
      y: 0,
      hp: { id: "enemy", kind: "health" },
    };
  for (const h of [player, ally, enemy]) h.hp.unit = h;
  const game = {
    player,
    heroes: [player, ally, enemy],
    locations: [],
    wards: { active: () => [] },
    erasers: { ground: () => [] },
    combat: { units: () => [player, ally, enemy] },
    vision: { visible: () => true },
    runes: { cast: (_, h) => ({ ok: !!h }) },
  };
  const renderer = {
    game,
    spriteScale: 1,
    unitPoint: (h) => ({ x: h.x, y: h.y }),
    p: (x, y) => ({ x, y }),
  };
  renderer.allySkillTargeting = new AllySkillTargeting(renderer);
  return {
    game,
    renderer,
    player,
    ally,
    enemy,
    mode: renderer.allySkillTargeting,
  };
}
test("ally click-to-cast retains movement and supports self, ally, hover radius and cancellation", () => {
  const { mode, player, ally, enemy } = fixture(),
    movement = player.target;
  mode.toggle("rune");
  assert.equal(player.target, movement);
  assert.equal(mode.radius, CONFIG.effectRadius);
  assert.ok(mode.eligible(player));
  assert.ok(mode.eligible(ally));
  assert.ok(!mode.eligible(enemy));
  ally.x = CONFIG.effectRadius + 1;
  assert.ok(!mode.eligible(ally));
  assert.ok(!mode.apply(null).ok);
  assert.ok(mode.active);
  assert.ok(mode.apply(player.hp).ok);
  assert.ok(!mode.active);
  assert.equal(player.target, movement);
  mode.toggle("rune");
  mode.toggle("rune");
  assert.ok(!mode.active);
});
test("skill hit testing includes allied heroes and ignores overlapping enemies and map objects", () => {
  const { renderer, ally, player, game, mode } = fixture();
  mode.toggle("rune");
  player.x = -1000;
  game.locations = [{ id: "tower", kind: "tower", x: 50, y: 0, step: 1 }];
  assert.equal(Renderer.prototype.hit.call(renderer, 50, -80), ally.hp);
  assert.equal(Renderer.prototype.hit.call(renderer, -1000, -80), player.hp);
});

test("one tempo targeting mode chooses haste for an ally and slow for an enemy", () => {
  const player = { team: 0 },
    ally = { team: 0 },
    enemy = { team: 1 };
  const calls = [];
  const targeting = new AllySkillTargeting({
    game: {
      player,
      heroes: [player, ally, enemy],
      editorTempo: (_player, mode, target) => {
        calls.push([mode, target]);
        return { ok: true };
      },
    },
  });
  for (const target of [ally, enemy]) {
    targeting.toggle("tempoSlow");
    assert.ok(targeting.accepts(target));
    targeting.apply({ unit: target });
  }
  assert.deepEqual(calls, [
    ["haste", ally],
    ["slow", enemy],
  ]);
});
