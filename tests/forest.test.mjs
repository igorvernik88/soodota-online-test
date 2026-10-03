import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/logic.js";
import { CONFIG, FOREST, BASES } from "../src/config.js";
import { ForestGeometry } from "../src/forest.js";
import { Renderer } from "../src/render.js";

function setup() {
  const g = new Game();
  g.start();
  g.combat.creeps = [];
  for (const t of [...g.towers, ...g.cores]) t.destroyed = true;
  for (const h of g.heroes) h.dead = true;
  return g;
}
function inside(g, region = g.forest.regions[0]) {
  const step = FOREST.cellSize * CONFIG.mapMultiplier;
  for (let y = region.minY + step / 2; y < region.maxY; y += step)
    for (let x = region.minX + step / 2; x < region.maxX; x += step)
      if (g.forest.regionAt({ x, y }) === region.id) return { x, y };
  throw new Error("Empty forest region");
}
function outside(g, p, minimumDistance = 20) {
  for (let d = minimumDistance; d <= 500; d += 20)
    for (let i = 0; i < 16; i++) {
      const q = {
        x: p.x + Math.cos((i * Math.PI) / 8) * d,
        y: p.y + Math.sin((i * Math.PI) / 8) * d,
      };
      if (!g.forest.regionAt(q)) return q;
    }
  throw new Error("No nearby clearing");
}
test("forest regions are stable, rounded patches excluding roads, camps and bases", () => {
  const g = setup(),
    other = new Game();
  assert.deepEqual(g.forest.regions, other.forest.regions);
  for (const p of [...BASES, ...g.camps, ...g.towers])
    assert.equal(g.forest.regionAt(p), 0);
  for (const r of g.forest.regions) {
    assert.equal(g.forest.regionAt(inside(g, r)), r.id);
    assert.ok(r.loops.every((loop) => loop.length >= 12));
  }
});
test("forest hides its interior and blocks sight behind it while allowing sight outward from inside", () => {
  const g = setup(),
    p = inside(g),
    open = outside(g, p),
    other = inside(g, g.forest.regions[1]);
  const exterior = g.vision.source(open, 1e6);
  assert.equal(g.vision.reveals(exterior, p), false);
  assert.equal(
    g.vision.reveals(exterior, {
      x: p.x + (p.x - open.x) * 3,
      y: p.y + (p.y - open.y) * 3,
    }),
    false,
  );
  const interior = g.vision.source(p, 1e6);
  assert.equal(g.vision.reveals(interior, p), true);
  assert.equal(g.vision.reveals(interior, open), true);
  assert.equal(g.vision.reveals(interior, other), false);
});
test("heroes and wards lose two thirds of their range inside; creeps and buildings keep theirs", () => {
  const g = setup(),
    p = inside(g),
    open = outside(g, p);
  assert.equal(g.vision.source(p, 400, true).radius, 400 / 3);
  assert.equal(g.vision.source(open, 400, true).radius, 400);
  assert.equal(g.vision.wardSource(p).radius, 260);
  assert.equal(g.vision.wardSource(open).radius, 780);
  assert.equal(g.vision.source(p, 275).radius, 275);
  assert.equal(g.vision.source(p, 400).radius, 400);
});
test("allied forest vision is shared from outside, restores after exit and disappears on death for both teams", () => {
  for (const team of [0, 1]) {
    const g = setup(),
      p = inside(g),
      open = outside(g, p, CONFIG.heroVisionRadius / 3 + 20),
      ally = g.heroes.find((h) => h.team === team),
      viewer = g.heroes.filter((h) => h.team === team)[1],
      enemy = g.heroes.find((h) => h.team !== team);
    Object.assign(viewer, open, { dead: false });
    Object.assign(enemy, p, { dead: false });
    g.vision.refresh(true);
    assert.equal(g.vision.visible(team, enemy.hp), false);
    Object.assign(ally, p, { dead: false });
    g.vision.refresh(true);
    assert.equal(g.vision.visible(team, ally.hp), true);
    assert.equal(g.vision.visible(team, enemy.hp), true);
    assert.equal(
      g.vision.sources[team].find((s) => s.unit === ally).radius,
      CONFIG.heroVisionRadius / 3,
    );
    Object.assign(ally, open);
    g.vision.refresh(true);
    assert.equal(
      g.vision.sources[team].find((s) => s.unit === ally).radius,
      CONFIG.heroVisionRadius,
    );
    Object.assign(ally, p);
    g.vision.refresh(true);
    ally.dead = true;
    g.vision.refresh(true);
    assert.equal(g.vision.visible(team, enemy.hp), false);
  }
});
test("ward preview and installed source share radius, forest clipping, cursor position and label at every zoom", () => {
  const g = setup(),
    p = inside(g),
    open = outside(g, p),
    h = g.player;
  Object.assign(h, p, { dead: false });
  h.consumables.ward = 1;
  const ward = g.getTarget(g.wards.place(h, p).target);
  assert.equal(
    g.vision.sources[h.team].find((s) => s.unit === ward).radius,
    260,
  );
  h.dead = true;
  g.vision.refresh(true);
  assert.equal(
    g.vision.sources[h.team].find((s) => s.unit === ward).radius,
    260,
  );
  h.dead = false;
  const calls = [],
    ctx = new Proxy(
      {},
      {
        get: (o, k) => o[k] || (() => {}),
        set: (o, k, v) => ((o[k] = v), true),
      },
    );
  const canvas = {
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 1440, height: 670 }),
  };
  const previous = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  try {
    const r = new Renderer(canvas, null, g);
    r.clipForest = (_, region) => calls.push(["clip", region]);
    r.label = (x, y, text) => calls.push(["label", text]);
    r.ward = () => {};
    r.path = (points) => calls.push(["circle", points]);
    for (const zoom of [1, 4.5, 8.75])
      for (const point of [p, open]) {
        r.setZoom(zoom);
        calls.length = 0;
        r.wardPreview = { screen: r.p(point.x, point.y) };
        r.drawWardPreview(0);
        const source = g.vision.wardSource(point);
        assert.equal(calls[0][1], source.region);
        assert.ok(
          Math.abs(
            calls.find((c) => c[0] === "circle")[1][0][0] -
              point.x -
              source.radius,
          ) < 1e-7,
        );
        assert.equal(
          calls.at(-1)[1],
          `Обзор: ${source.radius}${source.region ? " · лес" : ""}`,
        );
      }
    g.time = ward.expiresAt;
    g.wards.tick();
    g.vision.refresh(true);
    assert.equal(
      g.vision.sources[0].some((s) => s.unit === ward),
      false,
    );
  } finally {
    globalThis.window = previous;
  }
});

test("fog masks exclude only other forests and track camera/zoom projection", () => {
  const g = setup(),
    previousWindow = globalThis.window,
    previousPath = globalThis.Path2D;
  class RecordedPath {
    moves = [];
    rectangles = [];
    rect(...args) {
      this.rectangles.push(args);
    }
    lineTo() {}
    closePath() {}
    moveTo(x, y) {
      this.moves.push({ x, y });
    }
  }
  const clips = [],
    ctx = new Proxy(
      { clip: (path, rule) => clips.push({ path, rule }) },
      {
        get: (o, k) => o[k] || (() => {}),
        set: (o, k, v) => ((o[k] = v), true),
      },
    );
  const canvas = {
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 1440, height: 670 }),
  };
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.Path2D = RecordedPath;
  try {
    const r = new Renderer(canvas, null, g),
      own = g.forest.regions[0];
    for (const zoom of [1, 4.5, 8.75]) {
      r.setZoom(zoom);
      r.camera.x += 40;
      for (const region of [0, own.id]) {
        r.clipForest(ctx, region);
        const first = clips.at(-1);
        assert.equal(first.rule, "evenodd");
        assert.deepEqual(
          first.path.moves,
          g.forest.regions
            .filter((f) => f.id !== region)
            .flatMap((f) => f.loops.map((loop) => r.p(...loop[0]))),
        );
        r.clipForest(ctx, region);
        assert.equal(clips.at(-1).path, first.path);
      }
      r.clipForest(ctx, 0, false, true);
      assert.equal(clips.at(-1).path.rectangles.length, 0);
      assert.deepEqual(
        clips.at(-1).path.moves,
        g.forest.regions.flatMap((f) => f.loops.map((loop) => r.p(...loop[0]))),
      );
      r.clipForest(ctx, 0, true);
      assert.deepEqual(
        clips.at(-1).path.moves,
        g.forest.regions.flatMap((f) =>
          f.loops.map((loop) => r.miniProject(...loop[0])),
        ),
      );
    }
  } finally {
    globalThis.window = previousWindow;
    globalThis.Path2D = previousPath;
  }
});

test("fog renders each transition layer with its own radius and opacity on both maps", () => {
  const previousDocument = globalThis.document;
  const scales = [];
  const context = new Proxy(
    {
      scale: (x, y) => scales.push([x, y]),
      createRadialGradient: () => ({ addColorStop() {} }),
    },
    { get: (object, key) => object[key] || (() => {}) },
  );
  globalThis.document = {
    createElement: () => ({ getContext: () => context }),
  };
  try {
    const renderer = Object.create(Renderer.prototype);
    renderer.scale = 2;
    renderer.p = renderer.miniProject = () => ({ x: 0, y: 0 });
    renderer.clipForest = () => {};
    renderer.clipSight = () => {};
    const source = {
      unit: { x: 0, y: 0 },
      region: 1,
      radius: CONFIG.heroVisionRadius / 3,
    };
    renderer.game = {
      player: { team: 0 },
      vision: { refresh() {}, fogSources: () => [source] },
    };
    for (const mini of [false, true]) {
      for (const radius of [560, 280, CONFIG.heroVisionRadius / 3, 100]) {
        source.radius = radius;
        source.opacity = 0.5;
        renderer.drawFog(context, 1440, 670, mini);
        const expectedRadius = radius;
        assert.equal(context.globalAlpha, 0.5);
        assert.deepEqual(scales.at(-1), [
          expectedRadius *
            Math.SQRT2 *
            (mini ? 0.72 / CONFIG.mapMultiplier : renderer.scale),
          expectedRadius *
            Math.SQRT2 *
            (mini ? 0.44 / CONFIG.mapMultiplier : renderer.scale * 0.51),
        ]);
      }
    }
  } finally {
    globalThis.document = previousDocument;
  }
});

test("hero exterior sight overlaps a small forest peek without revealing deep forest", () => {
  const g = setup(),
    hero = g.player;
  g.forest.regionAt = (point) => (point.x > 0 ? 1 : 0);
  Object.assign(hero, { x: -1, y: 0, dead: false });
  const source = g.vision.heroSource(hero);
  assert.equal(source.radius, CONFIG.heroVisionRadius);
  assert.equal(source.forestPeekRadius, CONFIG.heroVisionRadius / 3);
  assert.equal(g.vision.reveals(source, { x: 100, y: 0 }), true);
  assert.equal(g.vision.reveals(source, { x: 200, y: 0 }), false);
  assert.equal(g.vision.reveals(source, { x: -500, y: 0 }), true);
  g.vision.sources[hero.team] = [source];
  const layers = g.vision.fogSources(hero.team);
  assert.equal(layers.length, 2);
  assert.equal(layers[0].region, 0);
  assert.equal(layers[1].region, null);
  assert.equal(layers[1].forestOnly, true);
  assert.equal(layers[1].radius, source.forestPeekRadius);
  assert.equal(layers[0].unit, layers[1].unit);
  assert.equal(
    g.vision.reveals(g.vision.wardSource(hero), { x: 100, y: 0 }),
    false,
  );
});

test("forest blocks open ground behind its contour for targets and fog, preserving the edge peek", () => {
  const g = setup(),
    forest = Object.create(ForestGeometry.prototype);
  const loop = [
    [100, -100],
    [200, -100],
    [200, 100],
    [100, 100],
  ];
  forest.regions = [
    {
      id: 1,
      minX: 100,
      maxX: 200,
      minY: -100,
      maxY: 100,
      loops: [loop],
      sightEdges: loop.map((a, i) => [a, loop[(i + 1) % 4]]),
    },
  ];
  g.forest = g.vision.forest = forest;
  const hero = g.player;
  Object.assign(hero, { x: 0, y: 0, dead: false });
  const source = g.vision.heroSource(hero);
  assert.equal(g.vision.reveals(source, { x: 300, y: 0 }), false);
  assert.equal(g.vision.reveals(source, { x: 300, y: 330 }), true);
  assert.equal(g.vision.reveals(source, { x: 120, y: 0 }), true);
  assert.equal(g.vision.reveals(source, { x: 190, y: 0 }), false);
  assert.equal(forest.sightPolygon(hero, 560)[0][0], 100);
  assert.equal(forest.sightHit({ x: 300, y: 0 }, { x: 0, y: 0 }).distance, 100);
  Object.assign(hero, { x: 150, y: 0 });
  assert.equal(
    g.vision.reveals(g.vision.heroSource(hero), { x: 250, y: 0 }),
    true,
  );
});
