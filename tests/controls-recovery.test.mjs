import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { Game } from "../src/logic.js";
import { CONFIG, FOREST, BASES } from "../src/config.js";
import { combatHUD } from "../src/combat-ui.js";

function setup() {
  const g = new Game();
  g.start();
  for (const h of g.heroes) if (h !== g.player) h.dead = true;
  g.combat.creeps = [];
  for (const t of [...g.towers, ...g.cores]) t.destroyed = true;
  return g;
}
test("health upgrades replace the miniature with 6x6 then independent 6x6 + 4x4", async () => {
  const w = new Window();
  globalThis.document = w.document;
  try {
    document.body.innerHTML =
      '<div id="healthHUD"></div><div id="teamRoster"></div><aside id="questBoard"></aside>';
    const g = setup(),
      h = g.player;
    for (const [size, cells, columns] of [
      [4, 16, "repeat(4,1fr)"],
      [6, 36, "repeat(6,1fr)"],
      [9, 52, "repeat(6,1fr)"],
    ]) {
      if (size > 4) g.combat.upgradeHealth(h, size);
      combatHUD(g);
      assert.equal(document.querySelectorAll(".health-cell").length, cells);
      assert.equal(
        document.querySelector(".health-grid").style.gridTemplateColumns,
        columns,
      );
    }
    assert.equal(document.querySelectorAll(".health-grid").length, 2);
  } finally {
    delete globalThis.document;
    await w.happyDOM.abort();
  }
});
test("completed health page stays intact for 30 seconds and base counts twice as fast", () => {
  for (const atBase of [false, true]) {
    const g = setup(),
      h = g.player,
      attacker = g.heroes.find((a) => a.team !== h.team);
    Object.assign(h, atBase ? BASES[h.team] : { x: 2500, y: 2500 });
    g.combat.upgradeHealth(h, 9);
    const page = h.hp.pages[0];
    page.boards[attacker.team] = page.puzzles[attacker.team].solution.slice();
    // Rebind replaced board arrays before completing through the model.
    g.selectPage(h.hp, 0);
    assert.ok(g.complete(attacker, h.hp, true));
    assert.equal(h.hp.activePage, 1);
    const duration = atBase ? 15 : 30;
    g.time = duration - 0.1;
    g.combat.tick(0);
    assert.equal(page.boards[attacker.team].filter(Boolean).length, 36);
    assert.equal(page.completed[attacker.team], true);
    g.time = duration;
    g.combat.tick(0);
    assert.equal(page.completed[attacker.team], false);
    assert.equal(page.boards[attacker.team].filter(Boolean).length, 35);
    assert.equal(h.dead, false);
  }
});
test("every tower has two pages; completed page recovers after 30 seconds without touching the other", () => {
  const g = setup(),
    h = g.player;
  for (const t of g.towers) {
    assert.equal(t.pages.length, 2);
    t.destroyed = false;
    const page = t.pages[0],
      team = 1 - t.defender;
    page.boards[team] = page.puzzles[team].solution.slice();
    g.selectPage(t, 0);
    const attacker = g.heroes.find((hero) => hero.team === team);
    assert.ok(g.complete(attacker, t, true));
    g.time += 29;
    g.combat.recoverPages(t);
    assert.equal(page.completed[team], true);
    g.time += 1;
    g.combat.recoverPages(t);
    assert.equal(page.completed[team], false);
    assert.equal(t.destroyed, false);
    assert.equal(t.pages[1].boards[team].filter(Boolean).length, 0);
  }
});
test("lost enemy follow moves to last visible position and never reads hidden motion", () => {
  const g = setup(),
    h = g.player,
    enemy = g.heroes.find((a) => a.team !== h.team);
  g.forest.regionAt = () => 0;
  g.forest.sightHit = () => null;
  Object.assign(h, { x: 2000, y: 2000 });
  Object.assign(enemy, { x: 2400, y: 2000, dead: false });
  g.vision.refresh(true);
  assert.ok(g.heroEffects.follow(h, enemy));
  enemy.x = 2500;
  g.heroEffects.updateFollow(h);
  enemy.x = 4000;
  g.vision.refresh(true);
  g.heroEffects.updateFollow(h);
  assert.deepEqual(h.target, { x: 2500, y: 2000 });
  assert.equal(h.followTarget, null);
  enemy.x = 4500;
  g.heroEffects.updateFollow(h);
  assert.deepEqual(h.target, { x: 2500, y: 2000 });
});
test("forest entry shrinks only exterior sight and exit smoothly expands sight", () => {
  const g = setup(),
    h = g.player;
  let forest = false;
  g.forest.regionAt = () => (forest ? 1 : 0);
  g.vision.heroSource(h);
  forest = true;
  h.x += 10;
  const inside = g.vision.heroSource(h);
  assert.equal(inside.radius, CONFIG.heroVisionRadius / 3);
  g.vision.sources[h.team] = [inside];
  const initial = g.vision.fogSources(h.team);
  assert.equal(initial.length, 2);
  assert.equal(initial[0].region, 0);
  assert.equal(initial[0].forestPeekRadius, 0);
  assert.equal(initial[0].opacity, undefined);
  assert.equal(initial[0].radius, CONFIG.heroVisionRadius);
  assert.equal(initial[1].region, 1);
  assert.equal(initial[1].radius, CONFIG.heroVisionRadius / 3);
  assert.equal(initial[1].opacity, undefined);
  h.x += 100;
  g.time += FOREST.transitionSeconds / 2;
  const middle = g.vision.fogSources(h.team);
  assert.equal(middle.length, 2);
  assert.equal(middle[0].region, 0);
  assert.equal(middle[0].opacity, undefined);
  assert.equal(middle[0].radius, CONFIG.heroVisionRadius / 2);
  assert.equal(middle[1].region, 1);
  assert.equal(middle[1].radius, CONFIG.heroVisionRadius / 3);
  assert.equal(middle[1].opacity, undefined);
  g.time += FOREST.transitionSeconds / 2;
  assert.equal(g.vision.fogSources(h.team).length, 1);
  assert.equal(
    g.vision.fogSources(h.team)[0].radius,
    CONFIG.heroVisionRadius / 3,
  );
  forest = false;
  const outside = g.vision.heroSource(h);
  g.vision.sources[h.team] = [outside];
  assert.equal(
    g.vision.fogSources(h.team)[0].radius,
    CONFIG.heroVisionRadius / 3,
  );
  g.time += FOREST.transitionSeconds / 2;
  const expanding = g.vision.fogSources(h.team)[0];
  assert.ok(
    expanding.radius > CONFIG.heroVisionRadius / 3 &&
      expanding.radius < CONFIG.heroVisionRadius,
  );
  assert.equal(expanding.opacity, undefined);
  g.time += FOREST.transitionSeconds / 2;
  assert.equal(g.vision.fogSources(h.team)[0].radius, CONFIG.heroVisionRadius);
  h.dead = true;
  assert.equal(g.vision.fogSources(h.team).length, 0);
  g.vision.refresh(true);
  assert.equal(g.vision.heroSightStates.has(h), false);
});
test("ward preview toggle keeps walking; hints have a persistent separate toggle", () => {
  const g = setup(),
    h = g.player;
  h.target = { x: 2000, y: 2000 };
  h.wardPlacement = { x: 1800, y: 1800 };
  g.wards.cancelPlacement(h, false);
  assert.deepEqual(h.target, { x: 2000, y: 2000 });
  const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const wardToggle = app
    .split('if (b.dataset.use === "ward")')[1]
    .split("const viewed")[0];
  assert.ok(!wardToggle.includes("game.player.target = null"));
  assert.ok(app.includes('localStorage.setItem("sudota-hints"'));
  assert.ok(
    app.includes('toast("Это ваша защита. Идите к башням Клякс.", true)'),
  );
});

test("reentering forest during exit expansion preserves the current exterior radius", () => {
  const g = setup(),
    h = g.player;
  let forest = true;
  g.forest.regionAt = () => (forest ? 1 : 0);
  g.vision.heroSource(h);
  forest = false;
  g.vision.sources[h.team] = [g.vision.heroSource(h)];
  g.time += FOREST.transitionSeconds / 2;
  const radius = g.vision.fogSources(h.team)[0].radius;
  forest = true;
  g.vision.sources[h.team] = [g.vision.heroSource(h)];
  assert.equal(g.vision.fogSources(h.team)[0].radius, radius);
  g.time += FOREST.transitionSeconds / 2;
  assert.equal(g.vision.fogSources(h.team)[0].radius, radius / 2);
});

test("forest boundary refresh starts shrinking before the normal sight update interval", () => {
  const g = setup(),
    h = g.player;
  let forest = false;
  g.forest.regionAt = () => (forest ? 1 : 0);
  g.vision.refresh(true);
  const previous = { x: h.x, y: h.y };
  g.time += 0.001;
  h.x += 1;
  forest = true;
  g.vision.refresh();
  const layers = g.vision.fogSources(h.team);
  assert.equal(layers.length, 2);
  assert.equal(layers[0].region, 0);
  assert.deepEqual(layers[0].unit, previous);
  assert.equal(layers[0].radius, CONFIG.heroVisionRadius);
  assert.equal(layers[1].region, 1);
  assert.equal(layers[1].radius, CONFIG.heroVisionRadius / 3);
  forest = false;
  g.time += 0.001;
  g.vision.refresh();
  assert.equal(g.vision.sources[h.team][0].region, 0);
});
