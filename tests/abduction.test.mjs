import test from "node:test";
import assert from "node:assert/strict";
import { Game, CONFIG, dist } from "../src/logic.js";
import { SKILLS } from "../src/config.js";
import { AllySkillTargeting } from "../src/ally-skill-targeting.js";
import { Renderer } from "../src/render.js";
import { puzzleHTML } from "../src/ui/puzzle.js";
import { combatHUD } from "../src/combat-ui.js";
import { Window } from "happy-dom";
import { build } from "esbuild";
function setup(rank = 1) {
  const g = new Game(42, { role: "editor" });
  g.start();
  g.bot = () => {};
  g.combat.tick = () => {};
  g.vision.visible = () => true;
  const h = g.player,
    enemy = g.heroes.find((u) => u.team !== h.team);
  for (const u of g.heroes) if (u !== h && u !== enemy) u.dead = true;
  Object.assign(h, { x: 2000, y: 2000 });
  Object.assign(enemy, { x: 2100, y: 2000 });
  h.skillRanks.abduction = rank;
  g.combat.sync(h);
  g.combat.sync(enemy);
  return { g, h, enemy };
}
for (const rank of [1, 2, 3])
  test(`abduction rank ${rank}: shared position, speed, actions, damage and expiration`, () => {
    const { g, h, enemy } = setup(rank),
      p = SKILLS.abduction.ranks[rank - 1],
      speed = g.heroSpeed(h),
      digits = h.digits;
    g.move(h, 2600, 2000);
    const movement = h.target;
    assert.ok(g.abduction.cast(h, enemy).ok);
    assert.equal(h.target, movement);
    assert.equal(h.digits, digits);
    assert.equal(h.abduction.until, g.time + p.duration);
    assert.equal(h.abductionAt, g.time + p.cooldown);
    assert.equal(g.heroSpeed(h), speed * (1 + p.speed));
    assert.ok(!g.erasers.actorAccess(enemy).ok);
    const originalRole = enemy.role;
    enemy.role = "sudaks";
    enemy.skillRanks.burning = 1;
    assert.ok(!g.burningSkill(enemy, h.hp).ok);
    enemy.role = originalRole;
    const i = h.hp.boards[enemy.team].findIndex((v) => !v);
    assert.ok(
      !g.place(
        enemy,
        h.hp,
        i,
        h.hp.puzzles[enemy.team].solution[i],
        "universal",
      ).ok,
    );
    g.move(enemy, 3000, 3000);
    assert.equal(enemy.target, null);
    g.tick(0.1);
    assert.equal(dist(h, enemy), 0);
    const before = g.combat.hpLeft(enemy);
    g.combat.damage(h, enemy.hp, 1);
    assert.equal(g.combat.hpLeft(enemy), before - 1);
    g.time = h.abduction.until;
    g.abduction.tick();
    assert.equal(enemy.carriedBy, null);
    assert.equal(enemy.target, null);
    assert.equal(g.heroSpeed(h), speed);
  });
test("abduction approaches only visible targets, freezes at last sight and cancels on a new move", () => {
  const { g, h, enemy } = setup();
  enemy.x = 3000;
  assert.ok(g.abduction.cast(h, enemy).queued);
  assert.equal(h.abductionAt, undefined);
  enemy.x = 3100;
  g.abduction.approach(h);
  assert.equal(h.target.x, 3100);
  g.vision.visible = () => false;
  enemy.x = 4000;
  g.abduction.approach(h);
  assert.equal(h.target.x, 3100);
  h.x = 3100;
  h.target = null;
  g.abduction.approach(h);
  assert.equal(h.pendingAbduction, null);
  assert.equal(h.abduction, undefined);
  g.vision.visible = () => true;
  assert.ok(g.abduction.cast(h, enemy).queued);
  g.move(h, 2000, 2000);
  assert.equal(h.pendingAbduction, null);
});
test("capture breaks both lassos, rejects protective boxes/repeated targets and releases on interruption", () => {
  const { g, h, enemy } = setup();
  enemy.boxProtection = { until: 20 };
  assert.ok(!g.abduction.cast(h, enemy).ok);
  assert.equal(h.abductionAt, undefined);
  enemy.boxProtection = null;
  g.bindLasso(h, enemy, 10);
  assert.ok(g.abduction.cast(h, enemy).ok);
  assert.equal(h.lasso, null);
  assert.equal(enemy.lasso, null);
  assert.ok(!g.abduction.cast(h, enemy).ok);
  h.stunnedUntil = 5;
  g.abduction.tick();
  assert.equal(enemy.carriedBy, null);
  h.stunnedUntil = 0;
  h.abductionAt = 0;
  assert.ok(g.abduction.cast(h, enemy).ok);
  h.dead = true;
  g.abduction.tick();
  assert.equal(enemy.carriedBy, null);
  h.dead = false;
  h.abductionAt = 0;
  assert.ok(g.abduction.cast(h, enemy).ok);
  enemy.dead = true;
  g.abduction.tick();
  assert.equal(h.abduction, null);
  enemy.dead = false;
  h.abductionAt = 0;
  assert.ok(g.abduction.cast(h, enemy).ok);
  h.prison = { until: g.time + 2 };
  g.abduction.tick();
  assert.equal(enemy.carriedBy, null);
});
test("abduction uses existing targeting without stopping movement; bot carries toward nearest own tower", () => {
  const { g, h, enemy } = setup();
  const renderer = { game: g };
  const mode = new AllySkillTargeting(renderer);
  g.move(h, 2500, 2000);
  const movement = h.target;
  mode.toggle("abduction");
  assert.equal(mode.radius, 350);
  assert.equal(h.target, movement);
  assert.ok(mode.eligible(enemy));
  assert.ok(!mode.eligible(h));
  mode.cancel();
  assert.equal(h.target, movement);
  const bot = g.heroes.find((u) => u.team === 0 && u !== h);
  Object.assign(bot, { dead: false, role: "editor", x: enemy.x, y: enemy.y });
  bot.skillRanks.abduction = 1;
  const tower = g.towers
    .filter((t) => t.defender === bot.team && !t.destroyed)
    .sort((a, b) => dist(bot, a) - dist(bot, b))[0];
  assert.ok(g.abduction.cast(bot, enemy).ok);
  assert.equal(bot.target.x, tower.x);
  assert.equal(bot.target.y, tower.y);
});
test("lasso pulls in both directions, preserves orders and is independent of hero processing order", () => {
  const { g, h, enemy } = setup();
  for (const reversed of [false, true])
    for (const pulling of [h, enemy]) {
      h.x = 2000;
      enemy.x = 2260;
      h.y = enemy.y = 2000;
      g.bindLasso(h, enemy, 10);
      const positions = new Map(
        [h, enemy].map((u) => [u.id, { x: u.x, y: u.y }]),
      );
      const other = pulling === h ? enemy : h;
      const direction = pulling === h ? -1 : 1;
      pulling.x += direction * 30;
      pulling.target = { x: pulling.x + direction * 500, y: 2000 };
      const order = pulling.target;
      other.target = null;
      const old = other.x;
      if (reversed) g.heroes.reverse();
      g.constrainLassos(positions);
      if (reversed) g.heroes.reverse();
      assert.equal(pulling.target, order);
      assert.equal(other.x, old + direction * 30);
      assert.equal(dist(h, enemy), CONFIG.lassoRadius);
    }
});
test("burning miniatures and puzzle cells retain stable tracks, clear expired fire and keep errors distinct", async () => {
  const { g, h, enemy } = setup(),
    w = new Window();
  globalThis.document = w.document;
  try {
    document.body.innerHTML =
      '<div id="healthHUD"></div><div id="teamRoster"></div><aside id="questBoard"></aside>';
    h.hp.boards[enemy.team][0] = 1;
    h.hp.burning[enemy.team][0] = { until: 10 };
    combatHUD(g);
    assert.ok(document.querySelector(".health-cell.burning"));
    g.time = 11;
    combatHUD(g);
    assert.equal(document.querySelector(".health-cell.burning"), null);
    for (const size of [4, 6]) {
      g.combat.newHealth(enemy, size);
      const t = enemy.hp,
        i = t.boards[h.team].findIndex((v) => !v);
      t.boards[h.team][i] = t.puzzles[h.team].solution[i];
      t.burning[h.team][i] = { until: 20 };
      const html = puzzleHTML(g, t, h, { selected: i });
      assert.match(html, /grid-template-rows:repeat\(\d,minmax\(0,1fr\)\)/);
      assert.match(html, /entered burning/);
      g.time = 21;
      assert.doesNotMatch(
        puzzleHTML(g, t, h, { selected: i }),
        /entered burning/,
      );
      g.time = 11;
    }
    const css = await build({
      entryPoints: ["style.css"],
      bundle: true,
      write: false,
    });
    assert.match(css.outputFiles[0].text, /\.cell\.burning::after/);
    assert.match(css.outputFiles[0].text, /height: 108px/);
    assert.match(css.outputFiles[0].text, /min-height: 0/);
    assert.equal(
      SKILLS.tornado.ranks.every((p) => p.pen === 0.5),
      true,
    );
    const point = Renderer.prototype.unitPoint.call(
      { game: g, spriteScale: 1, p: (x, y) => ({ x, y }) },
      enemy,
    );
    assert.equal(point.y, enemy.y);
  } finally {
    delete globalThis.document;
    await w.happyDOM.abort();
  }
});

test("courier rendering triples its scale and carried hero drawing/hit point is raised", () => {
  const { g, h, enemy } = setup();
  const scales = [];
  const ctx = new Proxy(
    { scale: (...args) => scales.push(args) },
    { get: (o, k) => (k in o ? o[k] : () => {}) },
  );
  Renderer.prototype.courier.call(
    {
      ctx,
      spriteScale: 2,
      p: () => ({ x: 0, y: 0 }),
      poly: () => {},
      label: () => {},
    },
    g.couriers[0],
    0,
  );
  assert.deepEqual(scales[0], [6, 6]);
  g.abduction.cast(h, enemy);
  const point = Renderer.prototype.unitPoint.call(
    { game: g, spriteScale: 2, p: (x, y) => ({ x, y }) },
    enemy,
  );
  assert.equal(point.y, enemy.y);
  const carrierPoint = Renderer.prototype.unitPoint.call(
    { game: g, spriteScale: 2, p: (x, y) => ({ x, y }) },
    h,
  );
  assert.equal(carrierPoint.y, h.y - 280);
});
