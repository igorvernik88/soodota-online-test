import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Window } from "happy-dom";
import { Game, BASES, CONFIG, seeded } from "../src/logic.js";
import { ERASER, ITEMS, WARDS, SKILLS } from "../src/config.js";
import { itemSlotsHTML, updateCursorPen } from "../src/ui/hud.js";
import { shopHTML } from "../src/ui/shop.js";
import { renderMarkup } from "../src/ui/dom.js";

function setup(role = "intellect") {
  const g = new Game(42, { role });
  g.start();
  g.bot = () => {};
  g.combat.tick = () => {};
  g.combat.creeps = [];
  g.depots = [[], []];
  for (const h of g.heroes) {
    h.gold = 10000;
    h.target = null;
    h.cargo = [];
  }
  return g;
}
function equip(g, h = g.player) {
  Object.assign(h, BASES[h.team]);
  assert.ok(g.buy(h, "eraserTool").instant);
  return h.eraserTool;
}
function damage(h, index = 0) {
  h.hp.boards[1 - h.team][index] = h.hp.puzzles[1 - h.team].solution[index];
}
function enemyWard(g, point) {
  const owner = g.heroes[6];
  Object.assign(owner, point);
  owner.consumables.ward++;
  const result = g.useItem(owner, "ward", point);
  assert.ok(result.ok, result.message);
  return g.getTarget(result.target);
}

test("late price, team reservation, dead recipient and physical delivery share one instance", () => {
  const g = setup(),
    h = g.player,
    ally = g.heroes[1],
    editor = g.editor(0);
  assert.equal(ITEMS.find((i) => i.id === "eraserTool").price, ERASER.price);
  assert.ok(
    ERASER.price >
      Math.max(
        ...ITEMS.filter((i) => !["eraserTool", "stone"].includes(i.id)).map(
          (i) => i.price,
        ),
      ),
  );
  Object.assign(h, { x: 1500, y: 4200 });
  const gold = h.gold;
  assert.equal(g.buy(h, "eraserTool").instant, false);
  const order = g.pendingOrders(h)[0],
    instance = g.erasers.list[0];
  assert.equal(order.eraserId, instance.id);
  assert.equal(h.gold, gold - ERASER.price);
  assert.equal(g.buy(ally, "eraserTool").ok, false);
  assert.equal(ally.gold, 10000);
  const plane = g.couriers[0];
  g.tickCourier(plane, 0);
  assert.equal(plane.cargo[0], order);
  h.dead = true;
  g.tickCourier(plane, 1);
  assert.equal(instance.state, "ordered");
  h.dead = false;
  for (let i = 0; i < 100 && !h.eraserTool; i++) g.tickCourier(plane, 1);
  assert.equal(h.eraserTool, instance);
  assert.equal(g.erasers.list.length, 1);
  assert.equal(instance.digitReadyAt, 0);
  assert.equal(instance.wardReadyAt, 0);
  assert.equal(g.buy(ally, "eraserTool").ok, false);
});

test("one digit clock covers self, allies and towers; seeded choice clears damage metadata", () => {
  const g = setup(),
    h = g.player,
    ally = g.heroes[1],
    item = equip(g);
  damage(h, 0);
  damage(h, 1);
  damage(h, 2);
  const team = 1 - h.team;
  for (const field of [
    "poison",
    "burning",
    "universal",
    "doubleStroke",
    "arrivals",
    "errors",
  ])
    for (const i of [0, 1, 2]) h.hp[field][team][i] = { test: true };
  const random = seeded(123),
    index = Math.floor(random() * 3);
  g.random = seeded(123);
  assert.ok(g.useItem(h, "eraserTool", h.hp).ok);
  assert.equal(h.hp.boards[team][index], 0);
  for (const field of [
    "poison",
    "burning",
    "universal",
    "doubleStroke",
    "arrivals",
    "errors",
  ])
    assert.equal(h.hp[field][team][index], undefined);
  assert.equal(item.digitReadyAt, 10);
  Object.assign(ally, { x: h.x + 20, y: h.y });
  damage(ally);
  assert.equal(g.useItem(h, "eraserTool", ally).ok, false);
  assert.equal(item.digitReadyAt, 10);
  g.time = 10;
  assert.ok(g.useItem(h, "eraserTool", ally.hp).ok);
  assert.equal(ally.hp.boards[team][0], 0);
  const tower = g.towers.find((t) => t.defender === h.team);
  Object.assign(h, { x: tower.x, y: tower.y });
  tower.boards[team][0] = tower.puzzles[team].solution[0];
  assert.equal(g.useItem(h, "eraserTool", tower).ok, false);
  g.time = 20;
  assert.ok(g.useItem(h, "eraserTool", tower).ok);
  assert.equal(tower.boards[team][0], 0);
  assert.equal(item.digitReadyAt, 30);
  assert.equal(item.wardReadyAt, 0);
  assert.equal(h.eraserTool, item);
});

test("ward removal has an independent clock derived from stock, validates sight/range/team and pauses", () => {
  const g = setup(),
    h = g.player,
    item = equip(g);
  Object.assign(h, { x: 2500, y: 2500 });
  const ward = enemyWard(g, { x: 2540, y: 2500 }),
    second = enemyWard(g, { x: 2530, y: 2510 });
  damage(h);
  assert.ok(g.useItem(h, "eraserTool", h).ok);
  assert.ok(g.useItem(h, "eraserTool", ward).ok);
  assert.equal(g.getTarget(ward.id), undefined);
  assert.equal(
    item.wardReadyAt,
    WARDS.shopCooldown * ERASER.wardCooldownFactor,
  );
  assert.equal(item.wardReadyAt, 144);
  assert.equal(item.digitReadyAt, 10);
  assert.equal(g.useItem(h, "eraserTool", second).ok, false);
  g.phase = "paused";
  g.tick(100);
  assert.equal(g.time, 0);
  assert.equal(item.wardReadyAt, 144);
  g.phase = "playing";
  g.time = 144;
  g.wards.tick();
  const fresh = enemyWard(g, { x: 2565.01, y: 2500 });
  const ready = item.wardReadyAt;
  assert.equal(g.useItem(h, "eraserTool", fresh).ok, false);
  assert.equal(item.wardReadyAt, ready);
  h.x += 0.01;
  g.vision.refresh(true);
  assert.ok(g.useItem(h, "eraserTool", fresh).ok);
  const own = { ...fresh, defender: h.team };
  assert.equal(g.useItem(h, "eraserTool", own).ok, false);
  const hidden = enemyWard(g, { x: 4000, y: 4000 });
  g.vision.refresh(true);
  assert.equal(g.useItem(h, "eraserTool", hidden).ok, false);
});

test("givens, finished pages, dead heroes and destroyed structures are protected; failures spend nothing", () => {
  const g = setup(),
    h = g.player,
    item = equip(g),
    tower = g.towers.find((t) => t.defender === h.team && t.step === 1),
    team = 1 - h.team;
  Object.assign(h, { x: tower.x, y: tower.y });
  const [finished, current] = tower.pages;
  finished.completed[team] = true;
  finished.boards[team].fill(1);
  current.puzzles[team].givens[1] = 2;
  current.boards[team][1] = 2;
  current.boards[team][0] = 1;
  assert.ok(g.useItem(h, "eraserTool", tower).ok);
  assert.ok(finished.boards[team].every(Boolean));
  assert.equal(current.boards[team][1], 2);
  assert.equal(current.boards[team][0], 0);
  g.time = 10;
  for (const target of [tower, g.heroes[6], g.cores[0], g.camps[0], null]) {
    assert.equal(g.useItem(h, "eraserTool", target).ok, false);
    assert.equal(item.digitReadyAt, 10);
  }
  current.boards[team][0] = 1;
  tower.destroyed = true;
  assert.equal(g.useItem(h, "eraserTool", tower).ok, false);
  const ally = g.heroes[1];
  Object.assign(ally, { x: h.x, y: h.y, dead: true });
  assert.equal(g.useItem(h, "eraserTool", ally).ok, false);
  assert.equal(item.digitReadyAt, 10);
  // Existing consumable and editor skill retain separate definitions and clocks.
  assert.equal(ITEMS.find((i) => i.id === "eraser").name, "Ластик забвения");
  assert.deepEqual(
    SKILLS.erase.ranks.map((rank) => rank.cooldown),
    [15, 10, 8, 6],
  );
});

test("death, respawn, capture and transfer keep instance clocks and move the team limit", () => {
  const g = setup(),
    h = g.player,
    item = equip(g),
    enemy = g.heroes[6],
    ally = g.heroes[7];
  item.digitReadyAt = 10;
  item.wardReadyAt = 144;
  Object.assign(h, { x: 2200, y: 2200 });
  g.combat.kill(h, { team: 1, id: "tower" });
  assert.equal(h.eraserTool, null);
  assert.equal(g.getTarget(item.id), item);
  assert.deepEqual({ x: item.x, y: item.y }, { x: 2200, y: 2200 });
  assert.ok(g.erasers.owns(0));
  assert.equal(g.buy(g.heroes[1], "eraserTool").ok, false);
  g.combat.respawn(h);
  assert.equal(h.eraserTool, null);
  Object.assign(enemy, { x: item.x + 20, y: item.y });
  g.vision.refresh(true);
  assert.ok(g.erasers.pickup(enemy, item).ok);
  assert.equal(enemy.eraserTool, item);
  assert.equal(g.erasers.owns(0), false);
  assert.ok(g.erasers.owns(1));
  Object.assign(ally, { x: enemy.x, y: enemy.y + 10 });
  assert.ok(g.erasers.transfer(enemy, ally).ok);
  assert.equal(ally.eraserTool, item);
  assert.equal(enemy.eraserTool, null);
  assert.equal(item.digitReadyAt, 10);
  assert.equal(item.wardReadyAt, 144);
  const replacement = equip(g, h);
  g.combat.kill(ally, { team: 0, id: "tower" });
  Object.assign(h, { x: item.x, y: item.y });
  g.vision.refresh(true);
  assert.equal(g.erasers.pickup(h, item).ok, false);
  assert.equal(h.eraserTool, replacement);
  assert.equal(item.team, 1);
  assert.equal(g.erasers.list.length, 2);
});

test("editor death does not interrupt the plane or drop an undelivered item", () => {
  const g = setup("editor"),
    h = g.heroes.find((hero) => hero.team === 0 && hero !== g.player),
    editor = g.editor(0);
  Object.assign(h, { x: 1400, y: 4100 });
  assert.ok(g.buy(h, "eraserTool").ok);
  g.tickCourier(g.couriers[0], 0);
  const item = g.erasers.list[0];
  g.combat.kill(editor, { team: 1, id: "tower" });
  assert.equal(g.pendingOrders(h).length, 1);
  assert.equal(item.state, "ordered");
  for (let i = 0; i < 100 && !h.eraserTool; i++)
    g.tickCourier(g.couriers[0], 1);
  assert.equal(h.eraserTool, item);
  assert.equal(g.erasers.list.length, 1);
});

test("item HUD reuses its button, shows both clocks and selection cursor; shop respects ground ownership", async () => {
  const w = new Window();
  globalThis.document = w.document;
  try {
    const g = setup(),
      h = g.player,
      item = equip(g),
      root = document.createElement("div");
    renderMarkup(root, itemSlotsHTML(g, true));
    const button = root.querySelector('[data-use="eraserTool"]');
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.match(button.textContent, /Цифра: готово.*Вард: готово/);
    item.digitReadyAt = 10;
    item.wardReadyAt = 144;
    renderMarkup(root, itemSlotsHTML(g));
    assert.equal(root.querySelector('[data-use="eraserTool"]'), button);
    assert.match(button.textContent, /Цифра: 10 с.*Вард: 144 с/);
    document.body.innerHTML = '<div id="cursorPen" data-visible="1"></div>';
    updateCursorPen(g, false, true);
    assert.equal(document.querySelector("#cursorPen").hidden, false);
    assert.match(document.querySelector("#cursorPen").textContent, /Ластик/);
    g.combat.kill(h, { team: 1, id: "tower" });
    root.innerHTML = shopHTML(g, 0);
    assert.ok(root.querySelector('[data-item="eraserTool"]').disabled);
  } finally {
    delete globalThis.document;
    await w.happyDOM.abort();
  }
});

test("real input routes eraser clicks before movement/Sudoku, preserves failed selection and cancels with Escape", async () => {
  const w = new Window({
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
  try {
    const g = setup(),
      h = g.player;
    equip(g);
    for (const other of g.heroes) if (other !== h) other.dead = true;
    damage(h);
    w.__testGame = g;
    w.requestAnimationFrame = () => 0;
    const context = new Proxy(
      {},
      {
        get: (o, k) => o[k] || (() => {}),
        set: (o, k, v) => ((o[k] = v), true),
      },
    );
    w.HTMLCanvasElement.prototype.getContext = () => context;
    w.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1440,
      height: 670,
    });
    w.document.body.innerHTML = await fs.readFile(
      new URL("../index.html", import.meta.url),
      "utf8",
    );
    const app = await fs.readFile(
        new URL("../src/app.js", import.meta.url),
        "utf8",
      ),
      source = app.replace(
        "let game = new Game(Math.floor(Math.random() * 1000000)),",
        "let game = globalThis.__testGame,",
      );
    assert.notEqual(source, app);
    const bundle = await build({
      stdin: {
        contents: source,
        resolveDir: fileURLToPath(new URL("../src", import.meta.url)),
      },
      bundle: true,
      write: false,
      format: "iife",
    });
    w.eval(bundle.outputFiles[0].text);
    w.document.querySelector("#heroSelect").close();
    const button = () => w.document.querySelector('[data-use="eraserTool"]'),
      map = w.document.querySelector("#map");
    button().click();
    assert.equal(button().getAttribute("aria-pressed"), "true");
    map.dispatchEvent(
      new w.MouseEvent("click", { clientX: 100, clientY: 100, bubbles: true }),
    );
    assert.equal(button().getAttribute("aria-pressed"), "true");
    assert.equal(h.target, null);
    assert.equal(h.eraserTool.digitReadyAt, 0);
    const scale = Math.min(1350 / (5250 * 2.05), 610 / (5250 * 1.12)) * 4.5;
    map.dispatchEvent(
      new w.MouseEvent("click", {
        clientX: 720,
        clientY: 335 - 80 * scale * 1.5,
        bubbles: true,
      }),
    );
    assert.equal(button().getAttribute("aria-pressed"), "false");
    assert.equal(h.eraserTool.digitReadyAt, 10);
    assert.equal(h.target, null);
    assert.equal(w.document.querySelectorAll("#panel .sudoku-grid").length, 0);
    button().click();
    button().click();
    assert.equal(button().getAttribute("aria-pressed"), "false");
    button().click();
    w.document.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    assert.equal(button().getAttribute("aria-pressed"), "false");
  } finally {
    await w.happyDOM.abort();
  }
});
