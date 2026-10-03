import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/logic.js";
import { CONFIG, FOREST } from "../src/config.js";
import { COMBAT } from "../src/combat.js";
import { AllySkillTargeting } from "../src/ally-skill-targeting.js";

for (const rank of [1, 2, 3])
  test(`pencil rank ${rank}: enemy targeting, input lock, expiry, separate automatic damage`, () => {
    const g = new Game(42, { role: "strong" });
    g.start();
    const h = g.player,
      enemy = g.heroes.find((u) => u.team !== h.team);
    h.skillRanks.breakPencil = rank;
    enemy.x = h.x + 50;
    enemy.y = h.y;
    g.vision.visible = () => true;
    assert.equal(g.breakPencil(h, h).ok, false);
    assert.equal(h.breakPencilAt, undefined);
    assert.equal(g.breakPencil(h, enemy).ok, true);
    assert.equal(enemy.pencilBrokenUntil, g.time + [10, 15, 20][rank - 1]);
    assert.equal(h.breakPencilAt, g.time + [100, 85, 70][rank - 1]);
    assert.match(g.place(enemy, h.hp, 0, 1, "pen").message, /Карандаш сломан/);
    assert.match(
      g.place(enemy, h.hp, 0, 1, "universal").message,
      /Карандаш сломан/,
    );
    const before = g.combat.hpLeft(h);
    g.combat.damage(enemy, h.hp, 1);
    assert.ok(g.combat.hpLeft(h) < before);
    g.time = enemy.pencilBrokenUntil;
    assert.doesNotMatch(
      g.place(enemy, h.hp, 0, 1, "pen").message || "",
      /Карандаш сломан/,
    );
  });

test("enemy click-to-cast reuses mode without cancelling movement", () => {
  const g = new Game(42, { role: "strong" });
  g.start();
  const enemy = g.heroes.find((u) => u.team !== g.player.team);
  g.player.skillRanks.breakPencil = 1;
  enemy.x = g.player.x + 50;
  enemy.y = g.player.y;
  g.vision.visible = () => true;
  const destination = (g.player.target = { x: 1000, y: 1000 });
  const mode = new AllySkillTargeting({ game: g });
  mode.toggle("breakPencil");
  assert.equal(mode.eligible(g.player), false);
  assert.equal(mode.eligible(enemy), true);
  assert.equal(mode.apply(enemy.hp).ok, true);
  assert.equal(mode.active, false);
  assert.equal(g.player.target, destination);
});

test("tornado burns shared forest geometry, sight and radius restore after 90 game seconds", () => {
  const g = new Game(42, { role: "sudaks" });
  g.start();
  const region = g.forest.regions[0];
  let point;
  const step = FOREST.cellSize * CONFIG.mapMultiplier;
  for (let y = region.minY; y <= region.maxY && !point; y += step)
    for (let x = region.minX; x <= region.maxX && !point; x += step)
      if (g.forest.regionAt({ x, y }) === region.id) point = { x, y };
  assert.ok(point);
  Object.assign(g.player, point);
  g.player.tornadoUntil = g.time + 8;
  g.player.tornadoParams = { duration: 8 };
  g.fire.tick();
  assert.equal(g.forest.regionAt(point), 0);
  assert.equal(g.forest.isBurned(region.id), true);
  const other = new Game(42);
  assert.equal(
    other.forest.regionAt(point),
    region.id,
    "shared geometry must not share burn state",
  );
  assert.equal(g.forest.burnProgress(region.id), 0);
  g.time += 5;
  assert.equal(g.forest.burnProgress(region.id), 1);
  g.time += 84;
  g.fire.tick();
  assert.equal(g.forest.isBurned(region.id), true);
  g.time += 1;
  g.fire.tick();
  assert.equal(g.forest.regionAt(point), region.id);
});

test("creeps separate to configured spacing", () => {
  const g = new Game();
  g.start();
  g.combat.spawnWave();
  g.time = 10;
  const units = g.combat.creeps.slice(0, 3);
  g.combat.creeps = units;
  for (const u of units) {
    u.x = 1000;
    u.y = 1000;
  }
  g.combat.separateCreeps();
  for (let i = 0; i < units.length; i++)
    for (let j = i + 1; j < units.length; j++)
      assert.ok(
        Math.hypot(units[i].x - units[j].x, units[i].y - units[j].y) >=
          COMBAT.creepSpacing * 0.98,
      );
});

test("pencil walks into cast range, tracks visible target, and manual movement cancels", () => {
  const g = new Game(42, { role: "strong" });
  g.start();
  const h = g.player,
    target = g.heroes.find((u) => u.team !== h.team);
  h.skillRanks.breakPencil = 1;
  h.x = 1000;
  h.y = 1000;
  target.x = 1500;
  target.y = 1000;
  g.vision.visible = () => true;
  assert.equal(g.breakPencil(h, target).queued, true);
  assert.equal(h.breakPencilAt, undefined);
  target.x = 1600;
  g.updatePencilCast(h);
  assert.equal(h.target.x, 1600);
  h.x = target.x - CONFIG.effectRadius;
  g.updatePencilCast(h);
  assert.equal(h.pendingPencilCast, null);
  assert.equal(target.pencilBrokenUntil, g.time + 10);
  g.time = h.breakPencilAt;
  target.pencilBrokenUntil = 0;
  h.x = 1000;
  g.breakPencil(h, target);
  g.move(h, 900, 900);
  assert.equal(h.pendingPencilCast, null);
});
