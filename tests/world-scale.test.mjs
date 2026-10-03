import test from "node:test";
import assert from "node:assert/strict";
import { Game, BASES, CONFIG, dist } from "../src/logic.js";
import { LANES, TRAILS, WARDS } from "../src/config.js";
import { COMBAT } from "../src/combat.js";
import { Renderer } from "../src/render.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function quiet() {
  const g = new Game();
  g.start();
  g.bot = () => {};
  g.depots = [[], []];
  for (const h of g.heroes) {
    h.target = null;
    h.cargo = [];
  }
  return g;
}

test("map geometry is converted once, with unchanged populations and local formations", () => {
  const g = quiet();
  assert.deepEqual(BASES, [
    { x: 420, y: 4830 },
    { x: 4830, y: 420 },
  ]);
  assert.equal(g.camps.length, 8);
  assert.equal(g.towers.length, 18);
  assert.equal(g.cores.length, 2);
  assert.equal(g.camps[0].x, 25 * 52.5);
  assert.equal(g.camps[0].y, 39 * 52.5);
  for (const object of [...g.locations, ...g.heroes, ...g.couriers])
    assert.ok(
      object.x >= 0 && object.x <= 5250 && object.y >= 0 && object.y <= 5250,
    );
  for (const creep of g.combat.creeps) {
    const path = LANES[creep.lane].map(([x, y]) => ({
      x: x * 52.5,
      y: y * 52.5,
    }));
    if (creep.team) path.reverse();
    assert.deepEqual(creep.route, path);
    close(dist(creep, BASES[creep.team]), 76 + creep.slot * 34);
  }
  close(dist(g.heroes[1], BASES[0]), CONFIG.heroSpawnSpacing);
  assert.ok(TRAILS.every((trail) => trail.length >= 2));
});

test("heroes and creeps move at new speeds through side routes, preserving local contact distances", () => {
  const g = quiet(),
    h = g.player;
  for (const t of g.towers) t.destroyed = true;
  for (const other of g.heroes) if (other !== h) other.dead = true;
  Object.assign(h, { x: 2000, y: 2000 });
  const fork = { x: 40 * 52.5, y: 72 * 52.5 },
    distance = dist(h, fork);
  g.move(h, fork.x, fork.y);
  g.advanceHero(h, 1);
  close(dist(h, { x: 2000, y: 2000 }), CONFIG.moveSpeed);
  g.advanceHero(h, distance / CONFIG.moveSpeed);
  assert.equal(h.target, null);
  close(dist(h, fork), 0);
  const creep = g.combat.creeps[0];
  g.combat.creeps = [creep];
  const before = { x: creep.x, y: creep.y };
  g.combat.creepTick(creep, 1);
  close(dist(creep, before), 120);
  const routeLength = LANES[1]
    .slice(1)
    .reduce(
      (sum, [x, y], i) =>
        sum + Math.hypot(x - LANES[1][i][0], y - LANES[1][i][1]),
      0,
    );
  close(
    (routeLength * 52.5) / CONFIG.moveSpeed / ((routeLength * 21) / 120),
    5 / 3 / 1.2,
  );
  close((routeLength * 52.5) / 120 / ((routeLength * 21) / 80), 5 / 3);
  assert.ok(g.near(h, { x: h.x + 26, y: h.y }));
  assert.ok(!g.near(h, { x: h.x + 26.01, y: h.y }));
  Object.assign(h, BASES[0]);
  h.x += 78;
  assert.ok(g.atBase(h));
  h.x += 0.01;
  assert.ok(!g.atBase(h));
  assert.equal(COMBAT.attackRadius, 312);
  assert.equal(CONFIG.lassoRadius, 260);
});

test("a plane delivers across the enlarged world at the preserved trip speed", () => {
  const g = quiet(),
    plane = g.couriers[0],
    h = g.player;
  Object.assign(h, { x: 4300, y: 1400, gold: 1000 });
  assert.ok(g.buy(h, "boots1").ok);
  g.tickCourier(plane, 0);
  const distance = dist(plane, h),
    eta = g.courierETA(h);
  close(eta, distance / 2.5 / 92);
  for (let i = 0; i < Math.ceil(eta * 10) + 2 && !h.bootTier; i++)
    g.tickCourier(plane, 0.1);
  assert.equal(h.bootTier, 1);
  assert.equal(g.pendingOrders(h).length, 0);
  assert.ok(dist(h, plane) <= CONFIG.courierReach);
});

test("team vision uses 560/687.5/780 boundaries and ward approaches stay local", () => {
  const g = quiet(),
    h = g.player,
    creep = g.combat.creeps[0];
  g.forest.regionAt = () => 0;
  g.forest.sightHit = () => null;
  for (const other of g.heroes) if (other !== h) other.dead = true;
  for (const t of [...g.towers, ...g.cores]) t.destroyed = true;
  g.combat.creeps = [];
  Object.assign(h, { x: 2500, y: 2500 });
  g.vision.refresh(true);
  assert.ok(
    g.vision.visible(0, { x: 2500 + CONFIG.heroVisionRadius, y: 2500 }),
  );
  assert.ok(
    !g.vision.visible(0, { x: 2500 + CONFIG.heroVisionRadius + 0.01, y: 2500 }),
  );
  h.dead = true;
  Object.assign(creep, { x: 2500, y: 2500 });
  g.combat.creeps = [creep];
  g.vision.refresh(true);
  assert.ok(
    g.vision.visible(0, { x: 2500 + CONFIG.creepVisionRadius, y: 2500 }),
  );
  assert.ok(
    !g.vision.visible(0, {
      x: 2500 + CONFIG.creepVisionRadius + 0.01,
      y: 2500,
    }),
  );
  g.combat.creeps = [];
  const tower = g.towers.find((t) => t.defender === 0);
  tower.destroyed = false;
  g.vision.refresh(true);
  assert.ok(g.vision.visible(0, { x: tower.x + 400, y: tower.y }));
  assert.ok(!g.vision.visible(0, { x: tower.x + 400.01, y: tower.y }));
  tower.destroyed = true;
  h.dead = false;
  h.consumables.ward = 1;
  const placed = g.useItem(h, "ward", h),
    ward = g.getTarget(placed.target);
  assert.ok(placed.ok);
  h.dead = true;
  g.vision.refresh(true);
  assert.equal(WARDS.visionRadius, 780);
  assert.ok(g.vision.visible(0, { x: ward.x + 780, y: ward.y }));
  assert.ok(!g.vision.visible(0, { x: ward.x + 780.01, y: ward.y }));
  const enemy = g.heroes[6];
  enemy.dead = false;
  Object.assign(enemy, { x: ward.x + 65.01, y: ward.y });
  assert.ok(!g.near(enemy, ward));
  enemy.x -= 0.01;
  assert.ok(g.near(enemy, ward));
  assert.equal(ward.expiresAt, 120);
  assert.equal(WARDS.shopCooldown, 180);
});

test("ward bots reach a forest entrance beyond the former detour limit", () => {
  const g = quiet(),
    h = g.heroes[1];
  for (const t of [...g.towers, ...g.cores]) t.destroyed = true;
  g.combat.creeps = [];
  const site = g.wards.usefulSites(0)[0];
  Object.assign(h, { x: site.x - 800, y: site.y });
  h.consumables.ward = 1;
  g.vision.refresh(true);
  assert.equal(g.wards.bot(h), true);
  for (let i = 0; i < 120 && h.consumables.ward; i++) {
    g.advanceHero(h, 0.05);
    g.wards.bot(h);
  }
  assert.equal(g.wards.active(0).length, 1);
  assert.ok(
    g.wards.usefulSites(0).every((p) => dist(p, g.wards.active(0)[0]) >= 390),
  );
});

test("normal camera preserves old pixel scale; overview, bounds and clicks span the new world", () => {
  const g = quiet(),
    context = new Proxy({}, { get: (o, key) => o[key] || (() => {}) }),
    canvas = {
      getContext: () => context,
      getBoundingClientRect: () => ({ width: 1440, height: 670 }),
    };
  globalThis.window = { devicePixelRatio: 1 };
  try {
    const r = new Renderer(canvas, null, g),
      oldScale = Math.min(1350 / (2100 * 2.05), 610 / (2100 * 1.12)) * 1.8;
    close(r.scale, oldScale);
    const site = { x: 4830, y: 420 },
      screen = r.p(site.x, site.y),
      point = r.unproject(screen.x, screen.y);
    close(point.x, site.x);
    close(point.y, site.y);
    r.setZoom(100);
    assert.equal(r.zoom, 10);
    r.pan(1e6, -1e6);
    assert.ok(
      r.camera.x >= 0 &&
        r.camera.x <= 5250 &&
        r.camera.y >= 0 &&
        r.camera.y <= 5250,
    );
    r.overview();
    assert.deepEqual(r.camera, { x: 2625, y: 2625 });
    assert.equal(r.zoom, 1);
    r.setZoom(0);
    assert.equal(r.zoom, 0.85);
    r.focusHero();
    close(r.scale, oldScale);
    assert.ok(r.trees.length > 200);
  } finally {
    delete globalThis.window;
  }
});
