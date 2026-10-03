import test from "node:test";
import assert from "node:assert/strict";
import { Game, CONFIG } from "../src/logic.js";
import { Renderer } from "../src/render.js";
const context = new Proxy({}, { get: () => () => {} });
const canvas = () => ({
  getContext: () => context,
  getBoundingClientRect: () => ({ width: 1200, height: 700 }),
  width: 1200,
  height: 700,
});
test("minimap projection round trips and normal camera zoom is limited", () => {
  const g = new Game();
  const previousWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  const r = new Renderer(canvas(), canvas(), g);
  globalThis.window = previousWindow;
  assert.equal(r.zoom, 3.3);
  r.setZoom(0.1);
  assert.equal(r.zoom, 3.3);
  const p = r.miniProject(1500, 2000),
    world = r.miniUnproject(p.x, p.y);
  assert.ok(Math.abs(world.x - 1500) < 1e-8);
  assert.ok(Math.abs(world.y - 2000) < 1e-8);
  r.overview();
  assert.equal(r.zoom, 1);
  assert.equal(r.follow, false);
  r.focusHero();
  assert.equal(r.zoom, 3.3);
  assert.equal(r.follow, true);
});
test("a dead hero can order equipment and armor is applied only after respawn", () => {
  const g = new Game();
  g.start();
  const h = g.player;
  h.gold = 3000;
  h.dead = true;
  assert.ok(g.buy(h, "double").ok);
  assert.ok(g.pendingOrders(h).some((o) => o.id === "double"));
  assert.ok(g.buy(h, "armor").ok);
  assert.equal(h.pendingArmor, 1);
  g.combat.respawn(h);
  assert.equal(h.pendingArmor, 0);
  assert.equal(
    g.combat.healthPages(h.hp).flatMap((p) => Object.keys(p.armor[1 - h.team]))
      .length,
    1,
  );
});
