import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Window } from "happy-dom";
import { Game, BASES } from "../src/logic.js";
import { WARDS, ITEMS } from "../src/config.js";
import { puzzleHTML } from "../src/ui/puzzle.js";
import { shopHTML } from "../src/ui/shop.js";
import { renderMarkup } from "../src/ui/dom.js";
import { Renderer } from "../src/render.js";

function setup(role = "intellect") {
  const g = new Game(42, { role });
  g.start();
  g.bot = () => {};
  g.combat.tick = () => {};
  g.combat.creeps = [];
  g.depots = [[], []];
  for (const t of [...g.towers, ...g.cores]) t.destroyed = true;
  for (const h of g.heroes)
    Object.assign(h, { ...BASES[h.team], target: null });
  g.vision.refresh(true);
  return g;
}
function install(g, owner, point = { x: 1000, y: 1000 }) {
  owner.consumables.ward++;
  Object.assign(owner, point, { target: null });
  const result = g.useItem(owner, "ward", point);
  assert.ok(result.ok, result.message);
  return g.getTarget(result.target);
}
function removalFixture(role) {
  const g = setup(role),
    h = g.player,
    owner = g.heroes.find((hero) => hero.team !== h.team),
    ward = install(g, owner);
  Object.assign(owner, BASES[owner.team]);
  Object.assign(h, { x: ward.x, y: ward.y + 38, digits: 10 });
  g.vision.refresh(true);
  return {
    g,
    h,
    owner,
    ward,
    blanks: ward.boards[h.team].flatMap((v, i) => (v ? [] : [i])),
  };
}
function enter(g, h, ward, index, mode = "pen") {
  const result = g.place(
    h,
    ward,
    index,
    ward.puzzles[h.team].solution[index],
    mode,
  );
  assert.ok(result.ok, result.message);
}
function advance(g, seconds) {
  g.time += seconds;
  g.wards.tick();
  g.vision.refresh(true);
}

test("free shop stock is shared, independent by team, starts on purchase, and never accumulates", () => {
  const g = setup(),
    h = g.player,
    ally = g.heroes[1],
    enemy = g.heroes[6],
    gold = h.gold;
  assert.deepEqual(g.wards.stock(0), { available: 2, remaining: 0 });
  assert.ok(g.buy(h, "ward").instant);
  assert.equal(h.gold, gold);
  assert.equal(h.consumables.ward, 1);
  assert.equal(g.wards.stock(0).available, 1);
  advance(g, 1);
  assert.ok(g.buy(ally, "ward").ok);
  assert.equal(g.wards.stock(0).remaining, 179);
  assert.equal(g.buy(ally, "ward").ok, false);
  assert.ok(g.buy(enemy, "ward").ok);
  advance(g, 178.9);
  assert.equal(g.buy(ally, "ward").ok, false);
  advance(g, 0.1);
  assert.equal(g.wards.stock(0).available, 1);
  advance(g, 1000);
  assert.equal(g.wards.stock(0).available, 1);
  assert.ok(g.buy(ally, "ward").ok);
  assert.equal(g.wards.stock(0).remaining, WARDS.shopCooldown);
});

test("ward orders use the depot and physical editor delivery, including a dead recipient", () => {
  const g = setup(),
    h = g.player,
    editor = g.editor(0);
  Object.assign(h, { x: 500, y: 1500 });
  const result = g.buy(h, "ward");
  assert.equal(result.instant, false);
  assert.equal(result.carrier, "Правщик");
  assert.equal(h.consumables.ward, 0);
  assert.equal(g.pendingOrders(h).filter((o) => o.id === "ward").length, 1);
  assert.equal(g.wards.stock(0).remaining, 180);
  g.editorDelivery(editor);
  assert.equal(g.depots[0].length, 0);
  assert.equal(
    editor.cargo.find((order) => order.recipient === h.id)?.id,
    "ward",
  );
  h.dead = true;
  Object.assign(editor, { x: h.x, y: h.y, target: null });
  assert.equal(g.editorDelivery(editor), false);
  assert.equal(h.consumables.ward, 0);
  h.dead = false;
  g.editorDelivery(editor);
  assert.equal(h.consumables.ward, 1);
  assert.equal(editor.cargo.length, 0);
});

test("shop stock, ward lifetime and erasure clocks stop with the game clock", () => {
  const { g, h, owner, ward, blanks } = removalFixture();
  assert.ok(g.buy(owner, "ward").ok);
  enter(g, h, ward, blanks[0]);
  const status = g.wards.status(ward),
    stock = g.wards.stock(owner.team);
  g.phase = "paused";
  g.tick(100);
  assert.equal(g.time, 0);
  assert.deepEqual(g.wards.status(ward), status);
  assert.deepEqual(g.wards.stock(owner.team), stock);
  g.phase = "playing";
  g.tick(0.5);
  assert.equal(g.wards.stock(owner.team).remaining, 179.5);
  assert.equal(g.wards.status(ward).lifetime, 119.5);
  assert.equal(g.wards.status(ward).regen, 0.5);
});

test("placement is near the hero, checks active cap and does not consume on rejection", () => {
  const g = setup(),
    h = g.player;
  h.consumables.ward = 4;
  Object.assign(h, { x: 1000, y: 1000 });
  assert.equal(g.useItem(h, "ward", { x: 1100, y: 1000 }).ok, false);
  assert.equal(g.useItem(h, "ward", { x: NaN, y: 1000 }).ok, false);
  assert.equal(h.consumables.ward, 4);
  const point = g.wards.placementPoint(h, { x: 2000, y: 1000 });
  assert.deepEqual(point, { x: 1038, y: 1000 });
  assert.ok(g.useItem(h, "ward", point).ok);
  assert.ok(g.useItem(h, "ward").ok);
  assert.equal(g.useItem(h, "ward").ok, false);
  assert.equal(h.consumables.ward, 2);
  const first = g.wards.active(0)[0];
  advance(g, 119.9);
  assert.equal(g.wards.active(0).length, 2);
  advance(g, 0.1);
  assert.equal(g.getTarget(first.id), undefined);
  assert.equal(g.wards.active(0).length, 0);
  assert.ok(g.useItem(h, "ward").ok);
  h.dead = true;
  assert.equal(g.useItem(h, "ward").ok, false);
});

test("a bought free ward cannot be lost by changing hero during preparation", () => {
  const g = new Game();
  assert.ok(g.chooseHero("intellect"));
  assert.ok(g.buy(g.player, "ward").ok);
  assert.equal(g.player.spent, 0);
  assert.equal(g.chooseHero("strong"), false);
  assert.equal(g.player.consumables.ward, 1);
});

test("a distant placement order walks to the chosen point and consumes the ward only on arrival", () => {
  const g = setup(),
    h = g.player,
    point = { x: 1250, y: 1100 };
  Object.assign(h, { x: 1000, y: 1000 });
  h.consumables.ward = 1;
  assert.equal(g.wards.requestPlacement(h, point).queued, true);
  assert.deepEqual(h.wardPlacement, point);
  assert.equal(h.target.x, point.x);
  assert.equal(h.consumables.ward, 1);
  g.tick(0.5);
  assert.ok(h.x > 1000);
  assert.equal(g.wards.active(0).length, 0);
  const position = { x: h.x, y: h.y },
    time = g.time;
  g.phase = "paused";
  g.tick(10);
  assert.deepEqual({ x: h.x, y: h.y }, position);
  assert.equal(g.time, time);
  assert.equal(h.consumables.ward, 1);
  g.phase = "playing";
  for (let i = 0; i < 60 && h.wardPlacement; i++) g.tick(0.1);
  const ward = g.wards.active(0)[0];
  assert.ok(ward);
  assert.deepEqual({ x: ward.x, y: ward.y }, point);
  assert.equal(ward.expiresAt, g.time + WARDS.lifetime);
  assert.equal(h.consumables.ward, 0);
  assert.equal(h.wardPlacement, null);
  assert.equal(h.target, null);
});

test("new movement, explicit cancellation and death cancel queued placement without consuming it", () => {
  const g = setup(),
    h = g.player,
    point = { x: 1300, y: 1000 };
  Object.assign(h, { x: 1000, y: 1000 });
  h.consumables.ward = 1;
  assert.equal(g.wards.requestPlacement(h, { x: -1, y: 1000 }).ok, false);
  assert.equal(g.wards.requestPlacement(h, point).queued, true);
  g.move(h, 900, 900);
  assert.equal(h.wardPlacement, null);
  g.tick(1);
  assert.equal(g.wards.active(0).length, 0);
  assert.equal(g.wards.requestPlacement(h, point).queued, true);
  g.wards.cancelPlacement(h);
  assert.equal(h.target, null);
  assert.equal(g.wards.requestPlacement(h, point).queued, true);
  h.dead = true;
  g.tick(0.1);
  assert.equal(h.wardPlacement, null);
  assert.equal(h.consumables.ward, 1);
  assert.equal(g.wards.active(0).length, 0);
});

test("the active-team cap is checked again on arrival and failed placement keeps the item", () => {
  const g = setup(),
    h = g.player,
    ally = g.heroes[1],
    point = { x: 1200, y: 1000 };
  Object.assign(h, { x: 1000, y: 1000 });
  h.consumables.ward = 1;
  assert.equal(g.wards.requestPlacement(h, point).queued, true);
  install(g, ally, { x: 1500, y: 1500 });
  install(g, ally, { x: 1700, y: 1600 });
  for (let i = 0; i < 60 && h.wardPlacement; i++) g.tick(0.1);
  assert.equal(h.wardPlacement, null);
  assert.equal(h.consumables.ward, 1);
  assert.equal(g.wards.active(0).length, WARDS.maxActive);
  assert.ok(
    g.events.some(
      (event) => event.type === "wardPlacementFailed" && event.hero === h.id,
    ),
  );
});

test("a fast pen can remove a ward alone through the normal cooldown, without rewards", () => {
  const { g, h, ward } = removalFixture();
  h.hasteTier = 4;
  h.digits = 0;
  const gold = h.gold;
  for (let moves = 0; moves < 30 && g.getTarget(ward.id); moves++) {
    enter(
      g,
      h,
      ward,
      ward.boards[0].findIndex((value) => !value),
    );
    if (g.getTarget(ward.id)) advance(g, g.cooldown(h, ward));
  }
  assert.equal(g.getTarget(ward.id), undefined);
  assert.equal(h.gold, gold);
  assert.equal(h.digits, 0);
  assert.ok(g.time < WARDS.lifetime);
});

test("ward texture is rendered at two and a half times its original size", () => {
  assert.equal(WARDS.spriteSize, 130);
});

test("ward vision is shared and outlives the owner without allowing remote interaction", () => {
  const g = setup(),
    h = g.player,
    enemy = g.heroes[6],
    ward = install(g, h);
  g.forest.regionAt = () => 0;
  g.forest.sightHit = () => null;
  Object.assign(h, BASES[0]);
  Object.assign(enemy, { x: ward.x + WARDS.visionRadius, y: ward.y });
  g.combat.sync(enemy);
  g.vision.refresh(true);
  assert.ok(g.vision.visible(0, enemy.hp));
  assert.equal(g.interact(h, enemy.hp).ok, false);
  assert.equal(g.interact(enemy, ward).ok, false);
  assert.equal(g.vision.visible(1, ward), false);
  g.combat.kill(h, enemy);
  g.vision.refresh(true);
  assert.ok(g.vision.visible(0, enemy.hp));
  enemy.x += 1;
  g.combat.sync(enemy);
  assert.equal(g.vision.visible(0, enemy.hp), false);
  Object.assign(enemy, BASES[1]);
  g.vision.refresh(true);
  assert.equal(g.vision.visible(1, ward), false);
  advance(g, WARDS.lifetime);
  assert.equal(
    g.vision.sources[0].some(({ unit }) => unit === ward),
    false,
  );
});

test("four blanks are independent, givens are protected, and wrong/note inputs do not start regeneration", () => {
  const { g, h, ward, blanks } = removalFixture("strong");
  assert.equal(blanks.length, 4);
  assert.equal(ward.puzzles[0].rules.size, 4);
  h.skillRanks.hole = 4;
  g.random = () => 0;
  const given = ward.boards[0].findIndex(Boolean);
  assert.equal(g.place(h, ward, given, 1).ok, false);
  enter(g, h, ward, blanks[0], "note");
  assert.equal(ward.regenStarted, false);
  const correct = ward.puzzles[0].solution[blanks[0]],
    wrong = (correct % 4) + 1;
  assert.equal(g.place(h, ward, blanks[0], wrong).ok, false);
  assert.equal(ward.regenStarted, false);
  assert.equal(ward.holes[0].length, 0);
  assert.equal(ward.boards[1].filter((v) => !v).length, 4);
});

test("regeneration erases newest entries each second without restarting on later input or erasing clues", () => {
  const { g, h, ward, blanks } = removalFixture(),
    givens = [...ward.puzzles[0].givens];
  enter(g, h, ward, blanks[0]);
  advance(g, 0.4);
  enter(g, h, ward, blanks[1], "universal");
  assert.equal(g.wards.status(ward).regen, 0.6);
  advance(g, 0.6);
  assert.equal(ward.boards[0][blanks[1]], 0);
  assert.ok(ward.boards[0][blanks[0]]);
  advance(g, 1);
  assert.deepEqual(ward.boards[0], givens);
  advance(g, 0.7);
  enter(g, h, ward, blanks[2], "universal");
  assert.ok(Math.abs(g.wards.status(ward).regen - 0.3) < 1e-8);
  advance(g, 0.3);
  assert.deepEqual(ward.boards[0], givens);
  assert.equal(Object.keys(ward.universal[0]).length, 0);
});

test("one additional living allied hero halves regeneration; creeps, couriers and further allies do not stack", () => {
  const { g, h, ward, blanks } = removalFixture(),
    ally = g.heroes[1],
    third = g.heroes[2];
  g.combat.creeps.push({
    team: 0,
    x: ward.x,
    y: ward.y,
    spawnAt: 0,
    dead: false,
  });
  Object.assign(g.couriers[0], ward);
  assert.equal(g.wards.status(ward).suppressed, false);
  enter(g, h, ward, blanks[0]);
  advance(g, 0.5);
  Object.assign(ally, { x: ward.x + WARDS.supportRadius, y: ward.y });
  assert.equal(g.wards.status(ward).interval, 2);
  assert.equal(g.wards.status(ward).regen, 1);
  Object.assign(third, { x: ward.x, y: ward.y });
  assert.equal(g.wards.status(ward).interval, 2);
  advance(g, 0.9);
  assert.ok(ward.boards[0][blanks[0]]);
  advance(g, 0.1);
  assert.equal(ward.boards[0][blanks[0]], 0);
  third.dead = true;
  ally.x += 1;
  assert.equal(g.wards.status(ward).suppressed, false);
  ally.x -= 1;
  ally.dead = true;
  assert.equal(g.wards.status(ward).interval, 1);
});

test("solo universal digits remove wards with no cell/completion rewards or side effects", () => {
  const { g, h, ward, blanks } = removalFixture("combinator"),
    before = {
      gold: h.gold,
      earned: h.earned,
      digitProgress: h.digitProgress,
      digits: h.digits,
      score: [...g.score],
    };
  h.skillRanks.poison = 4;
  for (const i of blanks) enter(g, h, ward, i, "universal");
  assert.equal(g.getTarget(ward.id), undefined);
  assert.equal(g.wards.active(1).length, 0);
  assert.equal(h.gold, before.gold);
  assert.equal(h.earned, before.earned);
  assert.equal(h.digitProgress, before.digitProgress);
  assert.equal(h.digits, before.digits - 4);
  assert.deepEqual(g.score, before.score);
  assert.equal(
    g.events.some((event) => ["camp", "tower", "core"].includes(event.type)),
    false,
  );
  assert.equal(g.place(h, ward, blanks[0], 1).ok, false);
});

test("ordinary pen/double/combo remain available without granting ward rewards or phantoms", () => {
  const { g, h, ward, blanks } = removalFixture("agile"),
    gold = h.gold;
  h.skillRanks.combo = 4;
  h.double = true;
  g.random = () => 0;
  enter(g, h, ward, blanks[0]);
  assert.equal(ward.history.length, 2);
  assert.ok(g.comboActive(h));
  assert.equal(h.gold, gold);
  enter(
    g,
    h,
    ward,
    ward.boards[0].findIndex((v) => !v),
  );
  assert.equal(g.getTarget(ward.id), undefined);
  const other = removalFixture("intellect");
  other.h.skillRanks.phantoms = 4;
  enter(other.g, other.h, other.ward, other.blanks[0]);
  assert.equal(other.h.phantoms, null);
  assert.equal(other.h.gold, 100);
});

test("all hero roles including the editor can install and solve enemy wards", () => {
  for (const role of [
    "editor",
    "sudaks",
    "strong",
    "agile",
    "intellect",
    "combinator",
  ]) {
    const { g, h, ward, blanks } = removalFixture(role);
    enter(g, h, ward, blanks[0]);
    assert.equal(g.canSpy(h, ward), false);
    const ownWard = install(g, h, { x: 1200, y: 1200 });
    assert.equal(
      g.place(
        h,
        ownWard,
        ownWard.boards[0].findIndex((v) => !v),
        1,
      ).ok,
      false,
    );
  }
});

test("bots share stock and route to useful sites without duplicating stationary vision", () => {
  const g = setup(),
    bot = g.heroes[1],
    other = g.heroes[2],
    enemy = g.heroes[6];
  Object.assign(bot, { x: g.player.x, y: g.player.y });
  Object.assign(other, { x: g.player.x, y: g.player.y });
  g.wards.botPurchase(bot);
  g.wards.botPurchase(other);
  g.wards.botPurchase(enemy);
  assert.equal(bot.consumables.ward, 1);
  assert.equal(other.consumables.ward, 1);
  assert.equal(g.wards.stock(0).available, 0);
  assert.equal(enemy.consumables.ward, 1);
  const site = g.wards.usefulSites(0)[0];
  Object.assign(bot, { x: site.x - 100, y: site.y });
  assert.equal(g.wards.bot(bot), true);
  assert.deepEqual({ x: bot.target.x, y: bot.target.y }, site);
  Object.assign(bot, site, { target: null });
  g.wards.bot(bot);
  assert.equal(g.wards.active(0).length, 1);
  other.consumables.ward = 1;
  Object.assign(other, site);
  g.wards.bot(other);
  assert.equal(g.wards.active(0).length, 1);
  assert.ok(
    g.wards
      .usefulSites(0)
      .every(
        (point) =>
          Math.hypot(point.x - site.x, point.y - site.y) >=
          WARDS.botWardSeparation,
      ),
  );
});

test("bots can finish an enemy ward using reasoned moves and the same pen/card rules", () => {
  const { g, h, ward } = removalFixture();
  for (let i = 0; i < 8 && g.getTarget(ward.id); i++) {
    assert.equal(g.wards.bot(h), true);
    advance(g, WARDS.botThinkInterval);
  }
  assert.equal(g.getTarget(ward.id), undefined);
});

test("shop and keyed puzzle UI expose stock, lifetime, recovery and ally suppression", () => {
  const { g, h, owner, ward, blanks } = removalFixture(),
    w = new Window();
  assert.equal((shopHTML(g, h.id).match(/data-item="ward"/g) || []).length, 1);
  assert.match(shopHTML(g, h.id), /Бесплатно/);
  assert.ok(g.buy(h, "ward").ok);
  assert.ok(g.buy(h, "ward").ok);
  assert.match(shopHTML(g, h.id), /data-item="ward" disabled/);
  assert.match(shopHTML(g, h.id), /через 180 с/);
  const root = w.document.createElement("div"),
    render = () =>
      renderMarkup(
        root,
        puzzleHTML(g, ward, h, {
          spy: false,
          selected: blanks[0],
          notes: false,
        }),
      );
  render();
  const cell = root.querySelector(`[data-cell="${blanks[0]}"]`),
    grid = root.querySelector(".sudoku-grid");
  assert.equal(root.querySelectorAll(".cell.given").length, 12);
  assert.match(root.textContent, /Осталось 120 с/);
  assert.match(root.textContent, /после первого верного ввода/);
  enter(g, h, ward, blanks[0]);
  Object.assign(g.heroes[1], { x: ward.x, y: ward.y });
  advance(g, 0.5);
  render();
  assert.equal(root.querySelector(".sudoku-grid"), grid);
  assert.equal(root.querySelector(`[data-cell="${blanks[0]}"]`), cell);
  assert.match(root.textContent, /Восстановление через 1.5 с/);
  assert.match(root.textContent, /Регенерация подавлена союзником/);
  assert.ok(root.querySelector(".ward-status.suppressed"));
  assert.equal(g.wards.stock(owner.team).available, 2);
});

test("ward WebP assets preserve sources and renderer crops/hit targets respect visibility", async () => {
  const g = setup(),
    h = g.player,
    owner = g.heroes[6],
    ward = install(g, owner),
    draws = [];
  g.forest.regionAt = () => 0;
  g.forest.sightHit = () => null;
  Object.assign(owner, BASES[1]);
  const context = new Proxy(
    { drawImage: (...args) => draws.push(args) },
    {
      get: (o, k) => (k in o ? o[k] : () => {}),
      set: (o, k, v) => ((o[k] = v), true),
    },
  );
  const canvas = {
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 1440, height: 670 }),
  };
  const oldWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  try {
    const renderer = new Renderer(canvas, null, g);
    const point = renderer.p(ward.x, ward.y),
      y = point.y - (WARDS.spriteSize / 2) * renderer.spriteScale;
    assert.notEqual(renderer.hit(point.x, y)?.id, ward.id);
    Object.assign(h, { x: ward.x + 200, y: ward.y });
    g.vision.refresh(true);
    assert.equal(renderer.hit(point.x, y)?.id, ward.id);
    renderer.wardPreview = g.wards.placementPoint(h);
    const quantity = h.consumables.ward;
    for (const [team, sprite] of WARDS.sprites.entries()) {
      const bytes = await fs.readFile(
        new URL(`../assets/wards/${sprite.file}`, import.meta.url),
      );
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
      await fs.access(
        new URL(
          `../assets/wards/${sprite.file.replace(".webp", ".png")}`,
          import.meta.url,
        ),
      );
      renderer.wardImages.set(sprite.file, {
        complete: true,
        naturalWidth: 2172,
      });
      renderer.ward({ ...ward, defender: team }, WARDS.spriteFrameMs / 1000);
      const call = draws.at(-1);
      assert.equal(call[1], 362);
      assert.equal(call[2], sprite.top);
      assert.equal(call[4], sprite.height);
      assert.equal(call[7], WARDS.spriteSize * renderer.spriteScale);
      assert.equal(call[8], WARDS.spriteSize * renderer.spriteScale);
    }
    assert.equal(h.consumables.ward, quantity);
    const previews = [],
      circles = [];
    renderer.ward = (preview) => previews.push(preview);
    renderer.path = (circle) => circles.push(circle);
    const chosen = { x: 1700, y: 1100 };
    renderer.wardPreview = chosen;
    renderer.drawWardPreview(0);
    assert.equal(previews.at(-1).x, chosen.x);
    assert.equal(previews.at(-1).y, chosen.y);
    assert.equal(
      circles.at(-1)[0][0],
      chosen.x + g.vision.wardSource(chosen).radius,
    );
    const screen = renderer.p(chosen.x, chosen.y);
    renderer.wardPreview = { ...chosen, screen };
    renderer.camera.x += 100;
    renderer.drawWardPreview(0);
    const underCursor = renderer.p(previews.at(-1).x, previews.at(-1).y);
    assert.ok(Math.abs(underCursor.x - screen.x) < 1e-7);
    assert.ok(Math.abs(underCursor.y - screen.y) < 1e-7);
    renderer.wardPreview = null;
    h.wardPlacement = chosen;
    renderer.drawWardPreview(0);
    assert.equal(previews.at(-1).x, chosen.x);
    assert.equal(previews.at(-1).y, chosen.y);
    assert.equal(ITEMS.find((item) => item.id === "ward").price, 0);
  } finally {
    globalThis.window = oldWindow;
  }
});
