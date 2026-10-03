import test from "node:test";
import assert from "node:assert/strict";
import { Game, BASES } from "../src/logic.js";
import { ITEMS } from "../src/config.js";
import { shopHTML } from "../src/ui/shop.js";
import { puzzleHTML } from "../src/ui/puzzle.js";

function gameAtBase() {
  const g = new Game(71);
  g.chooseHero("agile");
  g.start();
  const h = g.player;
  Object.assign(h, BASES[h.team]);
  g.combat.sync(h);
  h.gold = 10000;
  return { g, h };
}

test("shop prices and cumulative upgrade charges use the new item ladder", () => {
  const expected = {
    sharpener: 50,
    sharpener2: 100,
    health6: 600,
    health9: 1500,
    quill1: 80,
    quill2: 400,
    quill3: 900,
    quill4: 1600,
    double: 650,
    boots1: 80,
    bootsMid: 600,
    boots2: 1000,
    stun1: 100,
    stun2: 250,
    stun3: 600,
    miniInk: 150,
    lasso: 650,
    veil: 600,
    invert: 750,
    eraser: 1600,
  };
  for (const [id, price] of Object.entries(expected))
    assert.equal(ITEMS.find((item) => item.id === id)?.price, price, id);

  const { g, h } = gameAtBase();
  const actualPrices = [];
  for (const item of [
    "health6",
    "health9",
    "quill1",
    "quill2",
    "quill3",
    "quill4",
    "boots1",
    "bootsMid",
    "boots2",
  ]) {
    actualPrices.push(g.itemPrice(h, item));
    assert.ok(g.buy(h, item).ok, item);
  }
  assert.deepEqual(actualPrices, [600, 900, 80, 320, 500, 700, 80, 520, 400]);
  assert.equal(h.spent, 4100);
  assert.equal(h.healthSize, 9);
  assert.equal(h.hasteTier, 4);
  assert.equal(h.bootTier, 3);
});

test("shop exposes the new top stun price, name, description and exact duration", () => {
  const { g, h } = gameAtBase();
  const shop = shopHTML(g, h.id),
    stun = ITEMS.find((item) => item.id === "stun3");
  assert.equal(stun.name, "Стан 8 секунд");
  assert.equal(stun.stunDuration, 8);
  assert.match(stun.description, /8 с/);
  assert.doesNotMatch(stun.description, /12/);
  assert.match(shop, /data-item="stun3"[^>]*title="Стан 8 секунд/);
  assert.match(shop, /Стан 8 секунд[^>]*600/);
  assert.equal(ITEMS.find((item) => item.id === "stun1").stunDuration, 3);
  assert.equal(ITEMS.find((item) => item.id === "stun2").stunDuration, 5);
  h.consumables.stun3 = 1;
  const victim = g.heroes.find((hero) => hero.team !== h.team);
  victim.x = h.x + 12;
  victim.y = h.y;
  g.combat.sync(victim);
  g.vision.refresh(true);
  const result = g.useItem(h, "stun3", victim);
  assert.equal(result.ok, true);
  assert.equal(victim.stunnedUntil - g.time, 8);
});

test("health 9 upgrade is a 6x6 board plus a second 4x4 board", () => {
  const { g, h } = gameAtBase();
  assert.ok(g.buy(h, "health6").ok);
  assert.ok(g.buy(h, "health9").ok);
  assert.deepEqual(
    h.hp.pages.map((page) => page.puzzles[0].rules.size),
    [6, 4],
  );
  assert.equal(g.combat.healthCapacity(h), 52);
  assert.equal(g.combat.hpLeft(h), 52);
});

test("sharpeners accelerate actual health recovery", () => {
  for (const [item, factor] of [
    ["sharpener", 2],
    ["sharpener2", 4],
  ]) {
    const { g, h } = gameAtBase(),
      team = 1 - h.team;
    const page = g.combat.healthPages(h.hp)[0],
      index = 0;
    page.boards[team][index] = page.puzzles[team].solution[index];
    h.regenBase = g.atBase(h);
    h.regenAt = 4;
    h.regenInterval = 1;
    h.consumables[item] = 1;
    assert.equal(g.useItem(h, item).ok, true);
    const interval = 1 / factor;
    assert.ok(Math.abs(h.regenAt - 4 * interval) < 1e-9);
    g.time = h.regenAt - 0.01;
    g.combat.tick(0.01);
    assert.ok(page.boards[team][index]);
    g.time = h.regenAt;
    g.combat.tick(0.01);
    assert.equal(page.boards[team][index], 0);
  }
});

test("universal hits on hero health resist regeneration and expire after 30 seconds", () => {
  const { g, h } = gameAtBase(),
    victim = g.heroes.find((hero) => hero.team !== h.team);
  const page = g.combat.healthPages(victim.hp)[0],
    index = 0,
    team = h.team;
  g.combat.hit(h, victim.hp, index, page.puzzles[team].solution[index], true);
  assert.equal(page.universal[team][index], 30);
  Object.assign(victim, BASES[victim.team]);
  g.combat.sync(victim);
  victim.regenBase = true;
  victim.regenAt = 1;
  g.time = 1;
  g.combat.tick(0.01);
  assert.ok(page.boards[team][index]);
  g.time = 30;
  g.combat.tick(0.01);
  assert.equal(page.boards[team][index], 0);
  assert.equal(page.universal[team][index], undefined);
});

test("top health has two separate sheets; both must be completed to kill", () => {
  const { g, h } = gameAtBase(),
    victim = g.heroes.find((hero) => hero.team !== h.team);
  g.combat.upgradeHealth(victim, 6);
  g.combat.upgradeHealth(victim, 9);
  h.x = victim.x;
  h.y = victim.y;
  g.combat.sync(h);
  for (const [index, page] of victim.hp.pages.entries()) {
    g.selectPage(victim.hp, index);
    page.boards[h.team] = page.puzzles[h.team].solution.slice();
    assert.equal(g.complete(h, victim.hp, true), true);
    assert.equal(victim.dead, index === 1);
  }
});

test("Double Stroke adds a brief golden arrival effect to its bonus digit", () => {
  const g = new Game(29);
  g.chooseHero("agile");
  g.start();
  const h = g.player,
    t = g.nextTower(0, 0);
  t.backdoorArmor = 0;
  g.bot = () => {};
  Object.assign(h, { x: t.x, y: t.y, double: true });
  g.combat.sync(h);
  g.random = () => 0;
  const index = g.board(h, t).findIndex((v) => !v),
    value = g.puzzle(h, t).solution[index];
  assert.equal(g.place(h, t, index, value).ok, true);
  const bonusIndex = Object.keys(t.doubleStroke[h.team]).find(
    (i) => t.doubleStroke[h.team][i] === g.time,
  );
  assert.notEqual(bonusIndex, undefined);
  assert.match(
    puzzleHTML(g, t, h, { spy: false, selected: -1, notes: false }),
    /double-stroke-digit/,
  );
});
