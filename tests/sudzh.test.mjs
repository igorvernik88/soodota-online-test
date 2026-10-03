import test from "node:test";
import assert from "node:assert/strict";
import { Game, CONFIG, HEROES } from "../src/logic.js";
import { SKILLS } from "../src/config.js";
import {
  HERO_ANIMATION_MANIFEST,
  heroAnimationFiles,
} from "../src/animations/manifest.js";
import { HeroAnimator } from "../src/hero-animation.js";
function setup(rank = 1) {
  const g = new Game(71, { role: "sudzh", sandbox: true });
  g.start();
  g.bot = () => {};
  g.combat.creeps = [];
  g.combat.nextWave = Infinity;
  const h = g.player,
    e = g.heroes.find((u) => u.team !== h.team);
  Object.assign(h, { x: 2000, y: 2000 });
  Object.assign(e, { x: 2300, y: 2000 });
  for (const id of Object.keys(h.skillRanks))
    h.skillRanks[id] = Math.min(rank, SKILLS[id].ranks.length);
  for (const u of g.heroes) g.combat.sync(u);
  g.vision.visible = () => true;
  return { g, h, e };
}
function hookTicks(g, count = 20) {
  for (let i = 0; i < count; i++) {
    g.time += 0.05;
    g.sudzh.tick(0.05);
  }
}
test("Sudzh is the seventh selectable hero with embedded animations; rosters stay seeded 5×5", () => {
  assert.equal(HEROES.length, 7);
  assert.ok(heroAnimationFiles().includes("sudzh-hook-flying.webp"));
  assert.equal(HERO_ANIMATION_MANIFEST.sudzh.idle.sourceAssetWidth, 3072);
  const a = new Game(83, { role: "sudzh" }),
    b = new Game(83, { role: "sudzh" });
  assert.deepEqual(
    a.heroes.map((h) => h.role),
    b.heroes.map((h) => h.role),
  );
  for (const team of [0, 1]) {
    const roles = a.heroes.filter((h) => h.team === team).map((h) => h.role);
    assert.equal(roles.length, 5);
    assert.equal(new Set(roles).size, 5);
  }
});
test("hook pulls the first ally/enemy/creep, blocks actions during pull and preserves HP", () => {
  for (const kind of ["enemy", "ally", "creep"]) {
    const { g, h, e } = setup();
    if (kind === "ally") e.team = h.team;
    if (kind === "creep") {
      e.kind = "creep";
      g.combat.creeps.push(e);
      g.heroes = g.heroes.filter((u) => u !== e);
    }
    const hp = g.combat.hpLeft(e);
    assert.ok(g.sudzh.hook(h, { x: 2600, y: 2000 }).ok);
    g.time += 0.3;
    g.sudzh.tick(0.3);
    assert.equal(g.sudzh.hooks[0].victim, e);
    assert.equal(g.heroEffects.trapped(e), true);
    assert.equal(new HeroAnimator(g).chooseState(e), "stun");
    assert.equal(g.objectiveAccess(e, h.hp).ok, false);
    hookTicks(g);
    assert.equal(g.sudzh.hooks.length, 0);
    assert.equal(g.combat.hpLeft(e), hp);
    assert.equal(e.x, h.x);
    assert.equal(e.y, h.y);
  }
});
test("hook miss spends cooldown; box absorbs it and lasso is detached on hit", () => {
  const { g, h, e } = setup();
  e.y += 200;
  assert.ok(g.sudzh.hook(h, { x: 3000, y: 2000 }).ok);
  hookTicks(g);
  assert.equal(g.sudzh.hooks.length, 0);
  assert.equal(h.hookAt, 18);
  h.hookAt = 0;
  e.y = h.y;
  e.boxProtection = { until: g.time + 10 };
  g.sudzh.hook(h, e);
  hookTicks(g);
  assert.equal(e.x, 2300);
  e.boxProtection = null;
  h.hookAt = 0;
  e.lasso = { partner: h.id, until: g.time + 10 };
  h.lasso = { partner: e.id, until: g.time + 10 };
  g.sudzh.hook(h, e);
  hookTicks(g);
  assert.equal(h.lasso, null);
  assert.equal(e.lasso, null);
});
test("stench waits one interval, poisons enemies and self, expires and stops on toggle", () => {
  for (const rank of [1, 2, 3, 4]) {
    const { g, h, e } = setup(rank);
    e.x = h.x + 100;
    g.combat.sync(e);
    const before = g.combat.hpLeft(h),
      enemyBefore = g.combat.hpLeft(e);
    assert.ok(g.sudzh.toggleStench(h).ok);
    g.time = SKILLS.stench.ranks[rank - 1].interval - 0.01;
    g.sudzh.tick(0.1);
    g.heroEffects.tick();
    assert.equal(g.combat.hpLeft(h), before);
    g.time += 0.01;
    g.sudzh.tick(0.01);
    g.heroEffects.tick();
    assert.equal(g.combat.hpLeft(h), before - 1);
    assert.equal(g.combat.hpLeft(e), enemyBefore - 1);
    assert.equal(Object.keys(h.hp.poison[1 - h.team]).length, 1);
    g.sudzh.toggleStench(h);
    g.time += 8;
    g.heroEffects.tick();
    assert.equal(g.combat.hpLeft(h), before);
    assert.equal(g.combat.hpLeft(e), enemyBefore);
    assert.equal(g.heroEffects.poison.length, 0);
  }
});
test("self poison can kill without rewarding the caster or affecting allied heroes", () => {
  const { g, h, e } = setup();
  e.team = h.team;
  const board = h.hp.boards[1 - h.team];
  board.splice(0, board.length, ...h.hp.puzzles[1 - h.team].solution);
  board[0] = 0;
  const gold = h.gold,
    kills = h.kills,
    allyHp = g.combat.hpLeft(e);
  g.sudzh.toggleStench(h);
  g.time = 7;
  g.sudzh.tick(7);
  g.heroEffects.tick();
  assert.ok(h.dead);
  assert.equal(h.kills, kills);
  assert.equal(h.gold, gold);
  assert.equal(g.combat.hpLeft(e), allyHp);
});
test("fresh Sudoku ranks halve the pen only for target and end on movement/time/stun/death", () => {
  for (const rank of [1, 2, 3])
    for (const reason of ["move", "time", "stun", "death", "casterDeath"]) {
      const { g, h, e } = setup(rank);
      const ordinary = g.cooldown(h, e.hp);
      assert.ok(g.sudzh.fresh(h, e).ok);
      assert.equal(h.freshAt, SKILLS.freshSudoku.ranks[rank - 1].cooldown);
      assert.equal(g.cooldown(h, e.hp), ordinary / 2);
      assert.equal(g.cooldown(h, g.towers[0]), ordinary);
      assert.ok(e.stunnedUntil > g.time);
      if (reason === "move") g.move(h, h.x - 100, h.y);
      if (reason === "time") g.time = h.freshSudoku.until;
      if (reason === "stun") h.stunnedUntil = g.time + 2;
      if (reason === "death") g.combat.kill(e, h);
      if (reason === "casterDeath") g.combat.kill(h, e);
      g.sudzh.tick(0.1);
      assert.equal(h.freshSudoku, null);
      assert.equal(g.cooldown(h, e.hp), ordinary);
      if (!e.dead) assert.equal(e.stunnedUntil, 0);
    }
});
test("fresh Sudoku approaches, handles lost vision and supports independent 4×4/6×6 HP", () => {
  for (const size of [4, 6, 9]) {
    const { g, h, e } = setup();
    g.combat.newHealth(e, size);
    e.x = h.x + 600;
    g.combat.sync(e);
    assert.ok(g.sudzh.fresh(h, e).queued);
    const lastX = h.target.x;
    g.vision.visible = () => false;
    e.x += 300;
    g.sudzh.approach(h);
    assert.equal(h.target.x, lastX);
    assert.equal(h.freshAt, undefined);
    g.vision.visible = () => true;
    e.x = h.x + 100;
    g.combat.sync(e);
    g.sudzh.approach(h);
    assert.ok(h.freshSudoku);
    for (const page of g.combat.healthPages(e.hp))
      assert.equal(
        g.cooldown(h, { ...e.hp, ...page }),
        CONFIG.normalCooldown / 2,
      );
  }
});
test("Sudzh bot channels and enters correct digits against its target", () => {
  const { g, h, e } = setup();
  const before = g.combat.hpLeft(e);
  assert.ok(g.sudzh.bot(h));
  assert.ok(h.freshSudoku);
  g.time = 0.1;
  h.thinkAt = 0;
  assert.ok(g.sudzh.bot(h));
  assert.ok(g.combat.hpLeft(e) < before);
});

test("tower HP sums all independent pages for either team without selecting a page", async () => {
  const { structureHealth } = await import("../src/render.js");
  const g = new Game(71);
  for (const team of [0, 1]) {
    const tower = g.towers.find((t) => t.defender === team && t.step === 2);
    tower.pages[0].boards[1 - team][0] = 1;
    tower.pages[2].boards[1 - team][0] = 1;
    g.selectPage(tower, 1);
    assert.deepEqual(structureHealth(tower), { capacity: 108, hp: 106 });
    assert.equal(tower.activePage, 1);
  }
});
test("poison owns its original health page and expires after active page switches", () => {
  for (const size of [4, 6, 9]) {
    const { g, h, e } = setup();
    g.combat.newHealth(e, size);
    g.sudzh.poison(h, e, 8);
    g.heroEffects.tick();
    const page = g.combat.healthPages(e.hp)[0];
    assert.equal(page.boards[h.team].filter(Boolean).length, 1);
    if (g.combat.healthPages(e.hp).length > 1) g.selectPage(e.hp, 1);
    g.time = 8;
    g.heroEffects.tick();
    assert.equal(page.boards[h.team].filter(Boolean).length, 0);
    if (g.combat.healthPages(e.hp).length > 1) assert.equal(e.hp.activePage, 1);
  }
});
test("fresh Sudoku refuses boxed targets, can be cancelled during approach and switches battle targets", () => {
  const { g, h, e } = setup();
  e.boxProtection = { until: 10 };
  assert.equal(g.sudzh.fresh(h, e).ok, false);
  assert.equal(h.freshAt, undefined);
  e.boxProtection = null;
  e.x = h.x + 600;
  g.combat.sync(e);
  g.sudzh.fresh(h, e);
  g.move(h, h.x - 100, h.y);
  assert.equal(h.pendingFresh, null);
  e.x = h.x + 100;
  g.combat.sync(e);
  g.sudzh.fresh(h, e);
  g.interact(h, g.towers[0]);
  assert.equal(h.freshSudoku, null);
  assert.equal(e.stunnedUntil, 0);
});

test("wider hook captures near misses at 65 units but not outside its 70-unit radius", () => {
  for (const offset of [65, 80]) {
    const { g, h, e } = setup();
    e.y = h.y + offset;
    g.sudzh.hook(h, { x: 2700, y: h.y });
    g.time = 0.3;
    g.sudzh.tick(0.3);
    assert.equal(g.sudzh.hooks[0]?.victim === e, offset === 65);
  }
});

test("Sudzh uses normal hero dimensions and draws the supplied hook at hero scale", async () => {
  const { Renderer } = await import("../src/render.js");
  const { HOOK_ANIMATION } = await import("../src/animations/manifest.js");
  const { praiseIcon, sudzhIcon } = await import("../src/ui/icons.js");
  assert.equal(HERO_ANIMATION_MANIFEST.sudzh.idle.width, 70.8);
  assert.equal(HERO_ANIMATION_MANIFEST.sudzh.idle.height, 106.2);
  assert.match(sudzhIcon, /sudzh-hook-flying.webp/);
  assert.match(praiseIcon, /shape-rendering="crispEdges"/);
  const { g, h } = setup();
  g.sudzh.hook(h, { x: 2700, y: h.y });
  for (const scale of [0.5, 1, 2]) {
    const calls = [];
    const ctx = new Proxy(
      {
        drawImage(...args) {
          calls.push(args);
        },
      },
      { get: (o, k) => (k in o ? o[k] : () => {}) },
    );
    const r = Object.create(Renderer.prototype);
    Object.assign(r, {
      game: g,
      ctx,
      spriteScale: scale,
      hookImage: { complete: true, naturalWidth: 512 },
      p: (x, y) => ({ x, y }),
    });
    r.drawHooks();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], r.hookImage);
    assert.equal(calls[0][3], HOOK_ANIMATION.width * scale * 4);
    assert.equal(calls[0][4], HOOK_ANIMATION.height * scale * 4);
    assert.equal(ctx.imageSmoothingEnabled, false);
  }
});
