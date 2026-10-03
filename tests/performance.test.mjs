import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/logic.js";
import { COMBAT } from "../src/combat.js";
import {
  fogSourceInView,
  recentFireballCasts,
  Renderer,
} from "../src/render.js";
test("creeps reject distant units before invoking visibility and retain untouched-target priority", () => {
  const g = new Game(91);
  g.start();
  g.combat.spawnWave();
  g.time = 10;
  const u = g.combat.creeps.find((u) => u.team === 0),
    foes = g.combat.creeps.filter((u) => u.team === 1).slice(0, 2);
  g.combat.creeps = [u, ...foes];
  Object.assign(u, { x: 1000, y: 1000, spawnAt: 0, attackAt: 0 });
  for (const e of foes) Object.assign(e, { x: 4000, y: 4000, spawnAt: 0 });
  for (const h of g.heroes) Object.assign(h, { x: 5000, y: 5000 });
  g.attackTarget = () => ({ x: 5000, y: 5000 });
  g.objectiveAccess = () => {
    throw new Error("distant structure access checked");
  };
  let checks = 0;
  g.vision.visible = () => {
    checks++;
    return true;
  };
  g.combat.creepTick(u, 0);
  assert.equal(checks, 0);
  Object.assign(foes[0], { x: 1010, y: 1000 });
  Object.assign(foes[1], { x: 1000 + COMBAT.creepRadius - 1, y: 1000 });
  foes[0].hp.boards[0][0] = 1;
  g.combat.hpLeft = (e) => (e === foes[0] ? 1 : 2);
  g.combat.healthCapacity = () => 2;
  let attacked;
  g.combat.damage = (_, t) => {
    attacked = t;
  };
  g.random = () => 1;
  g.combat.creepTick(u, 0);
  assert.equal(attacked, foes[1].hp);
  assert.equal(checks, 2);
});
test("fog culling preserves light touching the viewport including blur", () => {
  assert.equal(fogSourceInView({ x: -1000, y: 50 }, 100, 100, 800, 600), false);
  assert.equal(fogSourceInView({ x: -125, y: 50 }, 100, 100, 800, 600), true);
  assert.equal(fogSourceInView({ x: 900, y: 50 }, 100, 100, 800, 600), true);
  assert.equal(fogSourceInView({ x: 400, y: 800 }, 100, 100, 800, 600), false);
});
test("fireball lookup does not traverse old history and keeps chronological draw order", () => {
  const events = [
    {
      get time() {
        throw new Error("old history read");
      },
    },
    { type: "fireballCast", time: 1 },
    { type: "fireballCast", time: 9.8 },
    { type: "hit", time: 9.9 },
    { type: "fireballCast", time: 10 },
  ];
  assert.deepEqual(
    [...recentFireballCasts(events, 10)].map((e) => e.time),
    [9.8, 10],
  );
});
test("off-screen creep culling leaves margin for sprites and death effects", () => {
  const r = Object.create(Renderer.prototype);
  Object.assign(r, {
    width: 800,
    height: 600,
    spriteScale: 1,
    p: (x, y) => ({ x, y }),
  });
  assert.equal(r.creepOnScreen({ x: -100, y: 50 }), true);
  assert.equal(r.creepOnScreen({ x: -1000, y: 50 }), false);
});
