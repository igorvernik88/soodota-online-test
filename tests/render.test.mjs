import test from "node:test";
import assert from "node:assert/strict";
import { Game, CONFIG } from "../src/logic.js";
import {
  HERO_ANIMATION_MANIFEST,
  HERO_ANIMATION_STATES,
  HeroAnimator,
  validateHeroAnimationManifest,
} from "../src/hero-animation.js";
import {
  CREEP_ANIMATION_FILES,
  CREEP_ANIMATION_TEAMS,
  Renderer,
  creepAnimationFile,
  creepHealthTier,
  riverDistance,
} from "../src/render.js";
const context = new Proxy(
  { createRadialGradient: () => ({ addColorStop() {} }) },
  {
    get: (o, k) => (k in o ? o[k] : () => {}),
    set: (o, k, v) => ((o[k] = v), true),
  },
);
const canvas = (width, height) => ({
  width,
  height,
  getContext: () => context,
  getBoundingClientRect: () => ({ width, height }),
});
globalThis.window = { devicePixelRatio: 1 };
test("map, eight biome camps, two planes and every hero render at desktop and narrow sizes", () => {
  const g = new Game();
  g.start();
  g.tick(180);
  for (const [w, h] of [
    [1440, 670],
    [1024, 538],
    [390, 490],
  ]) {
    const r = new Renderer(canvas(w, h), canvas(160, 106), g);
    assert.ok(
      r.trees.every(
        (t) =>
          riverDistance(
            t.x / CONFIG.mapMultiplier,
            t.y / CONFIG.mapMultiplier,
          ) >= 6,
      ),
    );
    for (const zoom of [1, 4.5, 8.75]) {
      r.setZoom(zoom);
      r.draw(0, 0.016);
      for (const p of [
        { x: 0, y: 0 },
        { x: 875, y: 875 },
        { x: 4830, y: 420 },
      ]) {
        const s = r.p(p.x, p.y),
          v = r.unproject(s.x, s.y),
          m = r.miniProject(p.x, p.y),
          mv = r.miniUnproject(m.x, m.y);
        assert.ok(Math.abs(v.x - p.x) < 1e-8 && Math.abs(v.y - p.y) < 1e-8);
        assert.ok(Math.abs(mv.x - p.x) < 1e-8 && Math.abs(mv.y - p.y) < 1e-8);
      }
      for (const t of g.locations) {
        const p = r.p(t.x, t.y),
          offset =
            t.kind === "tower"
              ? (18 + t.step * 9) * r.spriteScale * 4
              : t.kind === "core"
                ? 35 * r.spriteScale
                : t.kind === "camp"
                  ? 12 * r.spriteScale * 2.5
                  : 12;
        assert.equal(r.hit(p.x, p.y - offset)?.id, t.id);
      }
    }
    r.overview();
    assert.equal(r.camera.x, CONFIG.worldSize / 2);
    r.pan(30, -10);
    assert.notEqual(r.camera.x, CONFIG.worldSize / 2);
    r.focusHero();
    assert.ok(r.follow);
    r.confetti(g.towers[0], 0);
    r.draw(1, 0.1);
    assert.equal(r.particles.length, 45);
  }
});

test("enlarged creep model remains clickable while hidden enemy units cannot be clicked", () => {
  const g = new Game();
  g.start();
  const u = g.combat.creeps.find((c) => c.team === 1 && c.slot === 0);
  Object.assign(u, { x: 1050, y: 1050 });
  g.combat.sync(u);
  Object.assign(g.player, { x: 1050, y: 1050 });
  g.vision.refresh(true);
  const r = new Renderer(canvas(1440, 670), canvas(160, 106), g);
  const point = r.unitPoint(u);
  assert.equal(r.hit(point.x, point.y - 80 * r.spriteScale)?.id, u.hp.id);
  for (const h of g.heroes.filter((h) => h.team === 0)) {
    h.x = 0;
    h.y = CONFIG.worldSize;
  }
  g.combat.creeps = g.combat.creeps.filter((c) => c.team === 1);
  for (const t of [...g.towers, ...g.cores])
    if (t.defender === 0) t.destroyed = true;
  g.vision.refresh(true);
  assert.notEqual(r.hit(point.x, point.y - 80 * r.spriteScale)?.id, u.hp.id);
});

test("green creeps select run/fight sprites from damage since spawn", () => {
  const g = new Game();
  g.start();
  const u = g.combat.creeps.find((creep) => creep.team === 0);
  assert.equal(CREEP_ANIMATION_FILES.length, 7);
  assert.equal(creepHealthTier(u, g.combat), "fresh");
  assert.equal(creepAnimationFile(u, g.combat), "run_fresh.webp");
  const board = u.hp.boards[1 - u.team],
    empty = () => board.findIndex((value) => !value);
  for (let i = 0; i < Math.ceil(u.spawnHp * 0.35); i++) board[empty()] = 1;
  assert.equal(creepHealthTier(u, g.combat), "half");
  u.animationState = "fight";
  assert.equal(creepAnimationFile(u, g.combat), "fight_half.webp");
  while ((u.spawnHp - g.combat.hpLeft(u)) / u.spawnHp < 0.7) board[empty()] = 1;
  assert.equal(creepHealthTier(u, g.combat), "almost");
  g.combat.kill(u, g.player);
  assert.equal(creepAnimationFile(u, g.combat), "death.webp");
  assert.ok(g.combat.creeps.includes(u));
  g.time = u.removeAt;
  g.combat.tick(0);
  assert.ok(!g.combat.creeps.includes(u));
});

test("red creeps use enemy sprites mirrored horizontally", () => {
  const g = new Game();
  g.start();
  const u = g.combat.creeps.find((creep) => creep.team === 1),
    scales = [],
    draws = [],
    r = new Renderer(canvas(1440, 670), canvas(160, 106), g);
  assert.deepEqual(CREEP_ANIMATION_TEAMS, ["team1", "enemy"]);
  r.ctx = {
    save() {},
    restore() {},
    translate() {},
    scale(x, y) {
      scales.push([x, y]);
    },
    drawImage(...args) {
      draws.push(args);
    },
    imageSmoothingEnabled: true,
  };
  r.creepImages.set("enemy/run_fresh.webp", {
    complete: true,
    naturalWidth: 2172,
    naturalHeight: 724,
  });
  assert.equal(r.creepSprite(u, 0), true);
  assert.ok(scales[0][0] < 0 && scales[0][1] > 0);
  assert.equal(draws.length, 1);
});

test("Shustrik animation manifest is complete and resolves action states", () => {
  assert.deepEqual(validateHeroAnimationManifest(), []);
  assert.deepEqual(
    HERO_ANIMATION_STATES.map(
      (state) => HERO_ANIMATION_MANIFEST.intellect[state].file,
    ),
    [
      "intel-idle.webp",
      "intel-running.webp",
      "../animations/running-attacks/blue-glasses.webp",
      "intel-attack.webp",
      "intel-solving.webp",
      "intel-stun.webp",
      "intel-celebrate.webp",
      "intel-death.webp",
    ],
  );
  assert.deepEqual(
    HERO_ANIMATION_STATES.map(
      (state) => HERO_ANIMATION_MANIFEST.strong[state].file,
    ),
    [
      "dyrokol-idle.webp",
      "dyrokol-running.webp",
      "../animations/running-attacks/brown-cap.webp",
      "dyrokol-attack.webp",
      "dyrokol-solving.webp",
      "dyrokol-stun.webp",
      "dyrokol-celebrate.webp",
      "dyrokol-death.webp",
    ],
  );
  assert.deepEqual(
    HERO_ANIMATION_STATES.map(
      (state) => HERO_ANIMATION_MANIFEST.agile[state].file,
    ),
    [
      "shustrick-idle.webp",
      "shustrick-running.webp",
      "../animations/running-attacks/green-artist.webp",
      "shustrick-attack.webp",
      "shustrick-solving.webp",
      "shustrick-stun.webp",
      "shustrick-celebrate.webp",
      "shustrick-death.webp",
    ],
  );
  assert.deepEqual(
    HERO_ANIMATION_STATES.map((state) => [
      HERO_ANIMATION_MANIFEST.agile[state].width,
      HERO_ANIMATION_MANIFEST.agile[state].height,
    ]),
    [
      [41, 85],
      [48, 141],
      [68, 129],
      [68, 129],
      [49, 93],
      [41, 85],
      [52, 101],
      [48, 141],
    ],
  );
  const g = new Game();
  g.start();
  const descriptor = {
      file: "test.png",
      frames: 6,
      frameMs: 100,
      loop: true,
      width: 72,
      height: 80,
      anchorX: 0.5,
      anchorY: 0.93,
    },
    manifest = Object.fromEntries(
      ["strong", "agile"].map((role) => [
        role,
        Object.fromEntries(
          HERO_ANIMATION_STATES.map((state) => [
            state,
            { ...descriptor, loop: state !== "celebrate" },
          ]),
        ),
      ]),
    ),
    animator = new HeroAnimator(g, manifest),
    hero = g.heroes.find((unit) => unit.role === "strong"),
    camp = g.camps[0],
    tower = g.nextTower(hero.preferred, hero.team);
  assert.equal(animator.pose(hero).name, "idle");
  Object.assign(hero, { x: camp.x, y: camp.y });
  Object.assign(animator.heroState(hero), { x: hero.x, y: hero.y });
  hero.animationTargetId = camp.id;
  assert.equal(animator.pose(hero).name, "solving");
  hero.animationTargetId = tower.id;
  Object.assign(hero, { x: tower.x, y: tower.y });
  Object.assign(animator.heroState(hero), { x: hero.x, y: hero.y });
  assert.equal(animator.pose(hero).name, "attack");
  hero.x -= 1;
  assert.equal(animator.pose(hero).name, "running");
  assert.equal(animator.pose(hero).facingLeft, true);
  animator.celebrate(hero);
  hero.x -= 1;
  assert.equal(animator.pose(hero).name, "celebrate");
  g.time += 0.61;
  hero.x -= 1;
  assert.equal(animator.pose(hero).name, "running");
});

test("Shustrik blends quickly between running and attack", () => {
  const game = { time: 0, events: [] },
    animator = new HeroAnimator(game),
    hero = { id: "shustrik", role: "agile", x: 0, y: 0 },
    draws = [],
    stack = [],
    ctx = {
      globalAlpha: 1,
      imageSmoothingEnabled: true,
      save() {
        stack.push([this.globalAlpha, this.imageSmoothingEnabled]);
      },
      restore() {
        [this.globalAlpha, this.imageSmoothingEnabled] = stack.pop();
      },
      translate() {},
      scale() {},
      drawImage(image) {
        draws.push([image.name, this.globalAlpha]);
      },
    };
  for (const name of ["running", "attack"])
    animator.images.set(HERO_ANIMATION_MANIFEST.agile[name].file, {
      name,
      complete: true,
      naturalWidth: name === "running" ? 1600 : 2172,
      naturalHeight: 724,
    });
  let name = "running";
  animator.chooseState = () => name;
  animator.draw(ctx, hero);
  draws.length = 0;
  name = "attack";
  game.time = 0.01;
  animator.draw(ctx, hero);
  assert.deepEqual(
    draws.map(([source]) => source),
    ["running", "attack"],
  );
  draws.length = 0;
  game.time = 0.05;
  animator.draw(ctx, hero);
  assert.deepEqual(
    draws.map(([, alpha]) => alpha),
    [0.5, 0.5],
  );
  draws.length = 0;
  game.time = 0.1;
  animator.draw(ctx, hero);
  assert.deepEqual(draws, [["attack", 1]]);
  draws.length = 0;
  name = "running";
  game.time = 0.11;
  animator.draw(ctx, hero);
  assert.deepEqual(
    draws.map(([source]) => source),
    ["attack", "running"],
  );
});

test("Intellect solving body stays on the hero while its bubble overlaps the health bar", () => {
  const game = { time: 0, events: [] },
    animator = new HeroAnimator(game),
    hero = { id: "intellect", role: "intellect", x: 0, y: 0 },
    draws = [],
    translations = [],
    ctx = {
      imageSmoothingEnabled: true,
      save() {},
      restore() {},
      translate(x, y) {
        translations.push([x, y]);
      },
      scale() {},
      drawImage(...args) {
        draws.push(args);
      },
    };
  animator.chooseState = () => "solving";
  animator.images.set("intel-solving.webp", {
    complete: true,
    naturalWidth: 720,
    naturalHeight: 240,
  });
  assert.equal(animator.draw(ctx, hero), true);
  assert.ok(Math.abs(draws[0][2] - (228 * 240) / 724) < 1e-8);
  assert.ok(Math.abs(draws[0][4] - (496 * 240) / 724) < 1e-8);
  animator.drawSolvingOverlay(ctx, hero);
  assert.equal(draws[1][2], 0);
  assert.ok(Math.abs(draws[1][4] - (228 * 240) / 724) < 1e-8);
  assert.ok(translations.some(([x, y]) => x === 0 && y === -5));
});

test("player runs with the combat animation while pursuing enemy health", () => {
  const g = new Game();
  g.start();
  const hero = g.player;
  const enemy = g.heroes.find((unit) => unit.team !== hero.team);
  Object.assign(enemy, { x: hero.x, y: hero.y });
  g.combat.sync(enemy);
  const animator = new HeroAnimator(g);
  hero.animationTargetId = enemy.hp.id;
  hero.fighting = enemy.hp.id;
  assert.equal(animator.pose(hero).name, "attack");
  hero.animationTargetId = null;
  assert.equal(animator.pose(hero).name, "idle");
  hero.animationTargetId = enemy.hp.id;
  hero.fighting = null;
  hero.x += 1;
  assert.equal(animator.pose(hero).name, "runningAttack");
  hero.animationTargetId = null;
  assert.equal(animator.pose(hero).name, "idle");
});

test("hero death animation freezes on its last frame and fades before respawn", () => {
  const g = new Game();
  g.start();
  const hero = g.player,
    animator = new HeroAnimator(g);
  hero.dead = true;
  hero.deathAt = 0;
  hero.respawnAt = 20;
  assert.equal(animator.pose(hero).name, "death");
  g.time = 3;
  const pose = animator.pose(hero);
  assert.equal(pose.frame, pose.frames - 1);
  assert.equal(pose.opacity, 1);
  g.time = 18.5;
  assert.equal(animator.pose(hero).opacity, 0.5);
  for (const role of ["sudaks", "combinator", "intellect", "strong", "agile"])
    assert.match(HERO_ANIMATION_MANIFEST[role].death.file, /-death\.webp$/);
  // A death observed after an off-screen life must restart rather than reuse the corpse frame.
  g.time = 30;
  hero.deathAt = 30;
  hero.respawnAt = 50;
  assert.equal(animator.pose(hero).frame, 0);
});
test("scene renders visible corpses until respawn without making them targets", () => {
  const g = new Game();
  g.start();
  const hero = g.player,
    ally = g.heroes.find(
      (h) => h.team === hero.team && h !== hero && h.role !== "editor",
    ),
    enemy = g.heroes.find((h) => h.team !== hero.team && h.role !== "editor"),
    editor = g.heroes.find((h) => h.role === "editor");
  enemy.x = ally.x;
  enemy.y = ally.y;
  g.combat.kill(hero, enemy);
  g.combat.kill(enemy, ally);
  g.combat.kill(editor, ally);
  g.vision.refresh(true);
  const r = new Renderer(canvas(1024, 600), canvas(160, 106), g),
    seen = [];
  r.hero = (h) => seen.push(h.id);
  r.draw(50000, 0);
  assert.ok(seen.includes(hero.id));
  assert.ok(seen.includes(enemy.id));
  assert.ok(!seen.includes(editor.id));
  assert.equal(g.vision.visible(hero.team, hero), false);
  assert.equal(g.vision.visible(hero.team, enemy), false);
  enemy.x = -10000;
  enemy.y = -10000;
  seen.length = 0;
  g.time = hero.respawnAt - 1.5;
  r.draw(g.time, 0);
  assert.ok(seen.includes(hero.id));
  assert.ok(!seen.includes(enemy.id));
  seen.length = 0;
  g.time = hero.respawnAt;
  r.draw(g.time, 0);
  assert.ok(!seen.includes(hero.id));
});

test("death souls draw above live hero sprites using game time", () => {
  const g = new Game();
  g.start();
  g.combat.kill(g.player);
  g.time = g.player.respawnAt - 1;
  const r = new Renderer(canvas(1024, 600), canvas(160, 106), g),
    calls = [];
  r.hero = (h) => calls.push(["hero", h.id]);
  r.deathSoul = (h) => calls.push(["soul", h.id]);
  r.draw(50000, 0);
  assert.deepEqual(calls.at(-1), ["soul", g.player.id]);
  assert.ok(calls.some(([type, id]) => type === "hero" && id === g.player.id));
});

test("heroes stop combat animations for dead, completed or distant targets", () => {
  const g = new Game();
  g.start();
  const hero = g.player,
    enemy = g.heroes.find((h) => h.team !== hero.team),
    animator = new HeroAnimator(g);
  Object.assign(enemy, { x: hero.x, y: hero.y });
  g.combat.sync(enemy);
  hero.animationTargetId = enemy.hp.id;
  assert.equal(animator.pose(hero).name, "attack");
  enemy.dead = true;
  assert.equal(animator.pose(hero).name, "idle");
  hero.x += 1;
  assert.equal(animator.pose(hero).name, "running");
  enemy.dead = false;
  enemy.x += 10000;
  g.combat.sync(enemy);
  assert.equal(animator.pose(hero).name, "idle");
  const tower = g.nextTower(0, hero.team);
  hero.animationTargetId = tower.id;
  tower.destroyed = true;
  assert.equal(animator.pose(hero).name, "idle");
});

test("combat animations play 1.3 times faster and running combat uses the requested sizes", () => {
  const g = new Game(),
    animator = new HeroAnimator(g),
    hero = g.player;
  animator.chooseState = () => "attack";
  const first = animator.pose(hero),
    base = HERO_ANIMATION_MANIFEST[hero.role].attack;
  assert.equal(first.frameMs, base.frameMs / 1.3);
  g.time = base.frameMs / 1.3 / 1000 + 0.00001;
  assert.equal(animator.pose(hero).frame, 1);
  assert.equal(HERO_ANIMATION_MANIFEST.intellect.runningAttack.width, 55 / 1.5);
  assert.equal(HERO_ANIMATION_MANIFEST.strong.runningAttack.height, 149 / 1.5);
  assert.equal(HERO_ANIMATION_MANIFEST.sudaks.runningAttack.width, 58 * 1.5);
  assert.equal(HERO_ANIMATION_MANIFEST.sudaks.runningAttack.height, 118 * 1.5);
});

test("successful battle cry and area stun play their own cast strips once", () => {
  for (const [role, name] of [
    ["sudaks", "battleCry"],
    ["strong", "stunCast"],
  ]) {
    const g = new Game(42, { role });
    g.start();
    const h = g.player,
      enemy = g.heroes.find((u) => u.team !== h.team);
    h.skillRanks[role === "sudaks" ? "cry" : "stun"] = 1;
    Object.assign(enemy, { x: h.x + 40, y: h.y });
    g.combat.sync(enemy);
    const animator = new HeroAnimator(g);
    assert.ok(g.heroSkill(h).ok);
    const pose = animator.pose(h);
    assert.equal(pose.name, name);
    assert.equal(pose.loop, false);
    g.time = (pose.frames * pose.frameMs) / 1000 + 0.01;
    assert.equal(animator.pose(h).name, "idle");
  }
});

test("soul rises from the corpse only in the last three seconds", () => {
  const g = new Game(),
    animator = new HeroAnimator(g),
    hero = g.player;
  hero.dead = true;
  hero.respawnAt = 10;
  animator.images.set("sudoku-soul.webp", {
    complete: true,
    naturalWidth: 2172,
    naturalHeight: 724,
  });
  const translations = [],
    draws = [],
    ctx = {
      globalAlpha: 1,
      save() {},
      restore() {},
      scale() {},
      translate(x, y) {
        translations.push([x, y]);
      },
      drawImage(...args) {
        draws.push(args);
      },
    };
  g.time = 6.9;
  assert.equal(animator.drawDeathSoul(ctx, hero), false);
  g.time = 7.5;
  assert.equal(animator.drawDeathSoul(ctx, hero), true);
  const firstHeight = translations[0][1];
  assert.equal(firstHeight, -8 - 0.5 * 32 * 1.7);
  assert.equal(draws[0][7], 36 / 1.3);
  translations.length = 0;
  g.time = 9;
  assert.equal(animator.drawDeathSoul(ctx, hero), true);
  assert.ok(translations[0][1] < firstHeight);
  assert.equal(draws.length, 2);
  g.time = 10;
  assert.equal(animator.drawDeathSoul(ctx, hero), false);
});

test("enemy outline draws a cached alpha mask around the sprite before its pixels", () => {
  const g = new Game(),
    animator = new HeroAnimator(g),
    hero = g.player;
  const image = { complete: true, naturalWidth: 2172, naturalHeight: 724 },
    draws = [],
    masks = [];
  animator.images.set(HERO_ANIMATION_MANIFEST[hero.role].idle.file, image);
  globalThis.document = {
    createElement() {
      const ctx = { drawImage() {}, fillRect() {} },
        mask = { getContext: () => ctx };
      masks.push({ mask, ctx });
      return mask;
    },
  };
  try {
    const ctx = {
      globalAlpha: 1,
      save() {},
      restore() {},
      translate() {},
      scale() {},
      drawImage(...args) {
        draws.push(args);
      },
    };
    animator.draw(ctx, hero, { color: "#df514b", width: 1.3, opacity: 0.7 });
    assert.equal(draws.length, 2);
    assert.equal(draws.at(-1)[0], image);
    assert.equal(masks[0].ctx.globalCompositeOperation, "source-in");
    assert.equal(masks[0].ctx.fillStyle, "#df514b");
    assert.equal(masks[1].ctx.globalCompositeOperation, "destination-out");
    assert.ok(masks[0].mask.width < 200);
    animator.draw(ctx, hero, { color: "#df514b", width: 1.3, opacity: 0.7 });
    assert.equal(masks.length, 2);
  } finally {
    delete globalThis.document;
  }
});

test("a hero uses the box animation only while trapped", () => {
  const g = new Game();
  g.start();
  const hero = g.player;
  const animator = new HeroAnimator(g);
  const previousImage = globalThis.Image;
  globalThis.Image = class {
    set src(value) {
      this.url = value;
    }
  };
  try {
    animator.preload();
    assert.ok(animator.images.has("sudoku-box-trapped.webp"));
  } finally {
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
  }
  hero.prison = { until: g.time + 2 };
  assert.equal(animator.pose(hero).name, "trapped");
  assert.equal(animator.pose(hero).file, "sudoku-box-trapped.webp");
  g.time += 2;
  assert.equal(animator.pose(hero).name, "idle");
  hero.boxProtection = { until: g.time + 2 };
  assert.equal(animator.pose(hero).name, "boxProtection");
  assert.equal(animator.pose(hero).file, "box-protection.webp");
});
test("abduction keeps the victim's own sprite and renders without a prison", () => {
  const g = new Game(42, { role: "editor" });
  g.start();
  const hero = g.player,
    victim = g.heroes.find((h) => h.team !== hero.team);
  hero.skillRanks.abduction = 1;
  Object.assign(victim, { x: hero.x, y: hero.y });
  g.vision.visible = () => true;
  assert.ok(g.abduction.cast(hero, victim).ok);
  assert.equal(victim.prison, null);
  assert.ok(g.heroEffects.trapped(victim));
  const renderer = new Renderer(canvas(1440, 670), canvas(160, 106), g);
  assert.equal(renderer.heroAnimator.pose(victim).name, "stun");
  assert.notEqual(renderer.heroAnimator.pose(victim).name, "boxProtection");
  assert.doesNotThrow(() => renderer.hero(victim, g.time));
  assert.doesNotThrow(() => renderer.draw(g.time, 0));
  g.abduction.release(hero);
  assert.doesNotThrow(() => renderer.hero(victim, g.time));
});

test("hero picking keeps vertical reach but no longer catches wide side clicks", () => {
  const g = new Game();
  g.start();
  const enemy = g.heroes.find((h) => h.team !== g.player.team);
  Object.defineProperty(g, "locations", { value: [] });
  g.combat.creeps = [];
  for (const h of g.heroes) if (h !== enemy && h !== g.player) h.dead = true;
  Object.assign(enemy, { x: 2000, y: 2000 });
  g.combat.sync(enemy);
  g.vision.visible = () => true;
  const r = new Renderer(canvas(1440, 670), canvas(160, 106), g);
  const p = r.unitPoint(enemy),
    s = r.spriteScale;
  assert.equal(r.hit(p.x, p.y - 140 * s)?.id, enemy.hp.id);
  assert.notEqual(r.hit(p.x + 90 * s, p.y - 140 * s)?.id, enemy.hp.id);
  assert.equal(r.hit(p.x, p.y - 230 * s)?.id, enemy.hp.id);
});

test("hero hover outline exists only for the actual hovered target", () => {
  const g = new Game();
  g.start();
  const r = new Renderer(canvas(1440, 670), canvas(160, 106), g);
  let outline;
  r.heroAnimator.draw = (_ctx, _hero, value) => {
    outline = value;
    return true;
  };
  const enemy = g.heroes.find((h) => h.team !== g.player.team);
  for (const hero of [g.player, enemy]) {
    for (const hover of [undefined, null, "unrelated-target"]) {
      r.hover = hover;
      r.hero(hero, 0);
      assert.equal(outline, null);
    }
    r.hover = hero.hp.id;
    r.hero(hero, 0);
    assert.equal(outline.color, "#fff18a");
  }
});
