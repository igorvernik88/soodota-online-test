import test from "node:test";
import assert from "node:assert/strict";
import { Game, BASES, CONFIG } from "../src/logic.js";
import { COMBAT } from "../src/combat.js";
import { puzzleHTML } from "../src/ui/puzzle.js";

function setup(role = "intellect") {
  const g = new Game(42, { role });
  g.start();
  g.bot = () => {};
  g.random = () => 0;
  // Effect regression fixtures use rank 2; progression tests cover locked starts.
  for (const hero of g.heroes)
    for (const id of Object.keys(hero.skillRanks)) hero.skillRanks[id] = 2;
  const h = g.player,
    enemy = g.heroes.find((a) => a.team !== h.team);
  Object.assign(h, { x: 1000, y: 1000, target: null, gold: 5000, digits: 0 });
  Object.assign(enemy, {
    x: 1050,
    y: 1000,
    target: null,
    gold: 5000,
    digits: 0,
  });
  g.combat.sync(h);
  g.combat.sync(enemy);
  g.vision.refresh(true);
  return { g, h, enemy };
}

test("armor absorbs exactly one hit from manual, universal, automatic and poison inputs", () => {
  const { g, h, enemy } = setup("combinator");
  for (const mode of ["pen", "universal", "auto-damage", "poison"]) {
    assert.ok(g.buy(enemy, "armor").ok);
    const i = Number(Object.keys(enemy.hp.armor[0])[0]),
      t = enemy.hp;
    const before = g.combat.hpLeft(enemy);
    const html = puzzleHTML(g, t, h, {
      spy: false,
      selected: -1,
      notes: false,
    });
    assert.match(html, /armor-digit/);
    if (mode === "auto-damage") {
      // Restrict automatic target selection without introducing direct damage.
      for (let j = 0; j < t.boards[0].length; j++)
        if (j !== i && !t.boards[0][j]) t.stones[0][j] = { at: 0 };
      g.combat.damage(h, t, 1);
      t.stones[0] = {};
    } else if (mode === "poison") {
      for (let j = 0; j < t.boards[0].length; j++)
        if (j !== i && !t.boards[0][j]) t.stones[0][j] = { at: 0 };
      h.poisonAt = 0;
      g.heroEffects.schedule(h, t);
      g.time += 4;
      g.heroEffects.tick();
      t.stones[0] = {};
      assert.equal(t.poison[0][i], undefined);
    } else {
      h.nextNormal = 0;
      h.digits = 1;
      assert.ok(g.place(h, t, i, t.puzzles[0].solution[i], mode).ok);
    }
    assert.equal(g.combat.hpLeft(enemy), before);
    assert.equal(t.boards[0][i], 0);
    assert.equal(t.armor[0][i], undefined);
    g.combat.hit(h, t, i);
    assert.equal(g.combat.hpLeft(enemy), before - 1);
    g.heroEffects.poison = [];
  }
});

test("armor stock is personal, sequential, expires, and survives upgrades without refilling", () => {
  const { g, h, enemy } = setup();
  for (let i = 0; i < 5; i++) assert.ok(g.buy(h, "armor").ok);
  assert.equal(h.gold, 4960);
  assert.equal(h.armorStock, 0);
  assert.equal(g.buy(h, "armor").ok, false);
  assert.equal(enemy.armorStock, 5);
  g.time = 39.9;
  g.combat.refreshArmor(h);
  assert.equal(h.armorStock, 1);
  g.time = 40;
  g.combat.refreshArmor(h);
  assert.equal(h.armorStock, 2);
  g.combat.upgradeHealth(h, 6);
  assert.equal(h.armorStock, 2);
  assert.equal(g.combat.armorLimit(h), 7);
  assert.equal(Object.keys(h.hp.armor[1]).length, 5);
  assert.ok(Object.values(h.hp.armor[1]).every((t) => t === 180));
  assert.ok(g.buy(h, "armor").ok);
  assert.equal(h.gold, 4944);
  g.combat.upgradeHealth(h, 9);
  assert.equal(g.combat.armorPrice(h), 32);
  g.time = 180;
  g.combat.refreshArmor(h);
  assert.equal(Object.keys(h.hp.armor[1]).length, 1);
  g.combat.kill(h, enemy);
  assert.deepEqual(h.hp.armor, [{}, {}]);
});

test("invalid armor purchase consumes neither coins nor stock", () => {
  const { g, h } = setup();
  h.hp.boards[1] = h.hp.puzzles[1].solution.slice();
  const gold = h.gold,
    stock = h.armorStock;
  assert.equal(g.buy(h, "armor").ok, false);
  assert.equal(h.gold, gold);
  assert.equal(h.armorStock, stock);
});

test("universal uses the correct canonical value under inversion and default pen preserves stock", () => {
  const { g, h, enemy } = setup();
  const t = enemy.hp;
  h.digits = 2;
  t.invertedUntil[0] = 100;
  const correct = g.displayDigit(t, 0, t.puzzles[0].solution[0]);
  assert.ok(g.place(h, t, 0, correct).ok);
  assert.equal(h.digits, 2);
  assert.equal(h.nextNormal, 1.5);
  assert.ok(g.place(h, t, 1, 999, "universal").ok);
  assert.equal(t.boards[0][1], t.puzzles[0].solution[1]);
  assert.equal(h.digits, 1);
  assert.equal(g.place(h, t, 1, 1, "universal").ok, false);
  assert.equal(h.digits, 1);
  h.digits = 0;
  h.nextNormal = 0;
  assert.equal(g.place(h, t, 2, 1, "universal").ok, false);
  assert.equal(t.boards[0][2], 0);
  assert.equal(h.nextNormal, 0);
});

test("tower stun prioritizes creeps, has an independent clock, and does not accumulate", () => {
  const { g, h } = setup();
  const t = g.nextTower(0, 0);
  g.combat.creeps = [];
  g.combat.spawnWave();
  const c = g.combat.creeps.find((u) => u.team === 0 && u.slot === 0);
  for (const a of g.heroes) Object.assign(a, BASES[a.team]);
  Object.assign(h, { x: t.x + 1, y: t.y });
  Object.assign(c, { x: t.x + 20, y: t.y });
  g.combat.sync(h);
  g.combat.sync(c);
  g.vision.refresh(true);
  g.combat.structureTick(t);
  assert.equal(c.stunnedUntil, 2);
  assert.equal(h.stunnedUntil, 0);
  g.time = 1;
  g.combat.structureTick(t);
  assert.equal(c.stunnedUntil, 2);
  c.dead = true;
  g.time = 5;
  h.stunnedUntil = 10;
  g.combat.structureTick(t);
  assert.equal(h.stunnedUntil, 10);
  assert.equal(t.stunAt, 10);
  Object.assign(h, BASES[0]);
  g.time = 10;
  g.combat.structureTick(t);
  assert.equal(t.stunAt, 10);
  assert.equal(COMBAT.creepRadius, 150);
});

test("team vision reveals units through allies and removes targeting and following when lost", () => {
  const { g, h, enemy } = setup();
  g.forest.regionAt = () => 0;
  g.forest.sightHit = () => null;
  g.vision.refresh(true);
  assert.ok(g.vision.visible(0, enemy));
  assert.ok(g.heroEffects.follow(h, enemy));
  for (const a of g.heroes.filter((a) => a.team === 0))
    Object.assign(a, BASES[0]);
  g.combat.creeps = [];
  for (const t of [...g.towers, ...g.cores])
    if (t.defender === 0) t.destroyed = true;
  g.vision.refresh(true);
  assert.equal(g.vision.visible(0, enemy), false);
  assert.equal(g.objectiveAccess(h, enemy.hp).ok, false);
  assert.equal(g.nearestHero(h, 1, enemy), undefined);
  g.heroEffects.updateFollow(h);
  assert.equal(h.followTarget, null);
  assert.deepEqual(h.target, { x: enemy.x, y: enemy.y });
  const ally = g.heroes.find((a) => a.team === 0 && a !== h);
  Object.assign(ally, { x: enemy.x + 300, y: enemy.y });
  g.vision.refresh(true);
  assert.ok(g.vision.visible(0, enemy));
  ally.dead = true;
  g.vision.refresh(true);
  assert.equal(g.vision.visible(0, enemy), false);
  const hiddenTower = g.towers.find((t) => t.defender === 1);
  const snapshot = g.vision.appearance(0, hiddenTower);
  hiddenTower.destroyed = true;
  assert.equal(
    g.vision.appearance(0, hiddenTower).destroyed,
    snapshot.destroyed,
  );
});

test("box at highest tier needs both independent pages with free input", () => {
  const { g, h, enemy } = setup("combinator");
  g.combat.upgradeHealth(h, 9);
  h.skillRanks.box = 4;
  assert.ok(g.heroSkill(h, enemy).ok);
  const t = enemy.prison;
  assert.equal(t.pages.length, 2);
  assert.equal(t.until, 25);
  const before = enemy.digits;
  while (!t.pages[0].completed[1]) {
    const i = t.boards[1].findIndex((v) => !v);
    assert.ok(g.place(enemy, t, i, t.puzzles[1].solution[i]).ok);
  }
  assert.equal(enemy.prison, t);
  assert.equal(t.activePage, 1);
  assert.equal(t.pages[1].completed[1], false);
  while (enemy.prison) {
    const i = t.boards[1].findIndex((v) => !v);
    assert.ok(g.place(enemy, t, i, t.puzzles[1].solution[i]).ok);
  }
  assert.equal(enemy.digits, before);
});
