import test from "node:test";
import assert from "node:assert/strict";
import { HeroAnimator } from "../src/hero-animation.js";
import {
  DUEL_ANIMATIONS,
  DUEL_START_SECONDS,
  DUEL_END_SECONDS,
  DUEL_ASHES_SECONDS,
  duelAnimationPose,
} from "../src/animations/duet.js";
import { Renderer } from "../src/render.js";
import { Game } from "../src/logic.js";
import { SKILLS } from "../src/config.js";
import { puzzleHTML } from "../src/ui/puzzle.js";
import { heroAnimationFiles } from "../src/animations/manifest.js";
function setup(rank = 2) {
  const g = new Game(31, { role: "duet" });
  g.start();
  g.bot = () => {};
  g.combat.creeps = [];
  g.combat.nextWave = Infinity;
  g.vision.visible = () => true;
  const h = g.player,
    e = g.heroes.find((u) => u.team !== h.team);
  h.x = e.x = 2000;
  h.y = e.y = 2000;
  h.regenAt = Infinity;
  for (const id of Object.keys(h.skillRanks)) h.skillRanks[id] = rank;
  return { g, h, e };
}
test("duet has four configured abilities with agreed ranks and throw timings", () => {
  assert.deepEqual(
    SKILLS.throwOka.ranks.map((p) => p.duration),
    [8, 12, 16, 20],
  );
  assert.deepEqual(
    SKILLS.throwOka.ranks.map((p) => p.cooldown),
    [60, 52, 44, 36],
  );
  assert.equal(SKILLS.headOn.ranks.length, 3);
});
test("shield reserves cells after armor and applies queued hits once with fresh lifetimes", () => {
  const { g, h, e } = setup();
  h.hp.armor[e.team][0] = Infinity;
  g.duet.shield(h);
  assert.equal(g.combat.hit(e, h.hp, 0), false);
  assert.equal(g.duet.state(h).queue.length, 0);
  g.combat.hit(e, h.hp, 1, h.hp.puzzles[e.team].solution[1], true);
  g.combat.hit(e, h.hp, 1);
  assert.equal(g.duet.state(h).queue.length, 1);
  assert.equal(h.hp.boards[e.team][1], 0);
  assert.equal(g.duet.throw(h, e).ok, false);
  g.time = 5;
  g.duet.tick(0.1);
  assert.ok(h.hp.boards[e.team][1]);
  assert.ok(h.hp.universal[e.team][1] > 5);
  assert.equal(g.duet.state(h).queue.length, 0);
});
test("split keeps source boards, masks all pages and shares resources without healing", () => {
  for (const size of [4, 6, 9]) {
    const { g, h } = setup();
    g.combat.upgradeHealth(h, size);
    const source = h.hp;
    source.boards[1 - h.team][0] = source.puzzles[1 - h.team].solution[0];
    g.duet.split(h);
    const s = g.duet.state(h),
      o = s.oka;
    for (const [i, p] of (source.pages || [source]).entries()) {
      assert.equal(h.hp.pages[i].boards, p.boards);
      assert.equal(o.hp.pages[i].boards, p.boards);
      assert.equal(
        o.hp.pages[i].ownedIndices.length,
        Math.floor(p.puzzles[0].rules.size / 3) * p.puzzles[0].rules.size,
      );
      assert.equal(
        new Set([...h.hp.pages[i].ownedIndices, ...o.hp.pages[i].ownedIndices])
          .size,
        p.boards[0].length,
      );
    }
    o.gold += 5;
    assert.equal(o.gold, h.gold);
    const next = h.nextNormal;
    g.duet.switch(h, "oka");
    assert.equal(g.player, o);
    assert.equal(g.cooldown(o), 1);
    g.duet.switch(o, "sud");
    assert.equal(h.nextNormal, next);
    const html = puzzleHTML(g, o.hp, h, {
      spy: true,
      selected: -1,
      notes: false,
    });
    assert.ok(html.includes("torn-missing"));
    g.duet.merge(h);
    assert.equal(h.hp, source);
    assert.ok(h.hp.boards[1 - h.team][0]);
  }
});
test("last empty lower cell is retained as protrusion and partial death gives one total bounty", () => {
  const { g, h, e } = setup();
  const b = h.hp.boards[e.team],
    p = h.hp.puzzles[e.team];
  for (let i = 4; i < 16; i++) b[i] = p.solution[i];
  g.duet.split(h);
  const s = g.duet.state(h),
    o = s.oka;
  assert.ok(h.hp.pages[0].ownedIndices.includes(0));
  assert.ok(!o.hp.pages[0].ownedIndices.includes(0));
  const gold = e.gold;
  g.combat.damage(e, h.hp, 20);
  assert.equal(h.dead, true);
  assert.equal(h.deaths, 0);
  assert.equal(e.gold, gold);
  assert.equal(o.dead, false);
  g.combat.damage(e, o.hp, 20);
  assert.equal(h.deaths, 1);
  assert.ok(e.gold > gold);
  assert.equal(s.split, false);
  assert.equal(g.actors().includes(o), false);
});
test("collecting a dead part does not heal it or restore it on a second throw", () => {
  const { g, h, e } = setup();
  g.duet.split(h);
  const s = g.duet.state(h);
  g.combat.damage(e, s.oka.hp, 20);
  assert.equal(s.oka.dead, true);
  g.duet.merge(h);
  g.duet.split(h);
  assert.equal(s.oka.dead, true);
});
test("throw mounts for the selected rank, misses fixed destinations and detaches on movement", () => {
  for (let rank = 1; rank <= 4; rank++) {
    const { g, h, e } = setup(rank);
    e.x += 100;
    assert.ok(g.duet.throw(h, e).ok);
    assert.equal(h.throwOkaAt, SKILLS.throwOka.ranks[rank - 1].cooldown);
    g.time = 0.2;
    g.duet.tick(0.2);
    const s = g.duet.state(h);
    assert.equal(
      s.mounted.until,
      0.2 + SKILLS.throwOka.ranks[rank - 1].duration,
    );
    g.move(s.oka, 2200, 2200);
    assert.equal(s.mounted, null);
    assert.ok(s.split);
    assert.ok(Number.isFinite(s.oka.x));
  }
  const { g, h, e } = setup();
  e.x += 100;
  g.duet.throw(h, e);
  e.x += 200;
  g.time = 1;
  g.duet.tick(0.1);
  assert.equal(g.duet.state(h).mounted, undefined);
  assert.ok(g.duet.state(h).split);
});
test("bruteforce picks closest eligible cells, applies holes to armor and no resource awards", () => {
  const { g, h, e } = setup();
  h.skillRanks.bruteforce = 4;
  g.random = () => 0;
  e.hp.armor[h.team][0] = Infinity;
  const gold = h.gold,
    digits = h.digits;
  assert.ok(g.duet.brute(h, e.hp, 0).ok);
  assert.equal(e.hp.boards[h.team][0], 0);
  assert.equal(e.hp.holes[h.team].length, 4);
  assert.equal(h.gold, gold);
  assert.equal(h.digits, digits);
  assert.equal(h.lockedUntil, 0);
});
test("duel uses an atomic shared board, rejects outside hits and resumes effect deadlines", () => {
  const { g, h, e } = setup();
  e.speedEffect = { until: 10, factor: 0.5 };
  e.regenAt = 8;
  const other = g.heroes.find((u) => u !== h && u !== e);
  g.duet.startDuel(h, e, SKILLS.headOn.ranks[0]);
  g.time += DUEL_START_SECONDS;
  const d = h.duel;
  assert.equal(d.boards[0], d.boards[1]);
  assert.equal(g.combat.hit(other, h.hp, 0), false);
  assert.equal(g.useItem(h, "veil").ok, false);
  const i = d.boards[0].findIndex((v) => !v),
    v = d.puzzles[0].solution[i];
  assert.ok(g.place(h, d, i, v, "pen").ok);
  assert.equal(g.place(e, d, i, v, "pen").ok, false);
  assert.equal(g.place(e, d, i, v, "universal").ok, false);
  g.time = 3;
  g.duet.finishDuel(d);
  assert.equal(h.duel, d);
  assert.equal(g.place(h, d, i, v, "pen").ok, false);
  g.time += DUEL_END_SECONDS;
  g.duet.tick(DUEL_END_SECONDS);
  assert.equal(e.speedEffect.until, 13 + DUEL_END_SECONDS);
  assert.equal(e.regenAt, 11 + DUEL_END_SECONDS);
  assert.equal(h.duel, null);
  assert.equal(g.combat.hpLeft(e), 15);
});
test("all supplied solo and combined sheets are in the runtime manifest", () => {
  const files = heroAnimationFiles();
  for (const name of [
    "duet-running.webp",
    "sud-idle.webp",
    "sud-death.webp",
    "oka-idle.webp",
    "oka-attack.webp",
    "oka-stun.webp",
  ])
    assert.ok(files.includes(name), name);
});

test("poison and burning defer their actual digits and lifetimes through the shield", () => {
  for (const type of ["poison", "burning"]) {
    const { g, h, e } = setup(1);
    g.duet.shield(h);
    if (type === "poison") {
      g.sudzh.poison(e, h, 8);
      g.heroEffects.tick();
    } else g.heroEffects.fillBurning(e, h.hp, [0], 4, e.team);
    assert.equal(g.combat.hpLeft(h), 16);
    assert.equal(g.duet.state(h).queue.length, 1);
    g.time = 5;
    g.duet.tick(0.1);
    assert.equal(g.combat.hpLeft(h), 15);
    const page = h.hp;
    if (type === "burning") assert.equal(page.burning[e.team][0].until, 9);
    else assert.ok(Object.keys(page.poison[e.team]).length);
    g.time = type === "burning" ? 10 : 14;
    g.heroEffects.tick();
    assert.equal(g.combat.hpLeft(h), 16);
  }
});
test("shield targets both split fragments and keeps queued page identity", () => {
  const { g, h, e } = setup();
  g.combat.upgradeHealth(h, 9);
  g.duet.split(h);
  const o = g.duet.state(h).oka;
  g.duet.shield(h);
  g.selectPage(o.hp, 1);
  g.combat.hit(e, o.hp, 0);
  g.selectPage(o.hp, 0);
  g.combat.hit(e, h.hp, 12);
  assert.equal(g.duet.state(h).queue.length, 2);
  g.time = 5;
  g.duet.tick(0.1);
  assert.ok(o.hp.pages[1].boards[e.team][0]);
  assert.ok(h.hp.pages[0].boards[e.team][12]);
  assert.equal(o.hp.activePage, 0);
  assert.equal(g.combat.hpLeft(o), 15);
});
test("bruteforce wrong digits do not lock the pen, expire and cannot target other fragments", () => {
  const { g, h, e } = setup();
  g.random = () => 0.999;
  const p = e.hp.puzzles[h.team],
    i = p.solution.findIndex((v) => v !== 4);
  assert.ok(g.duet.brute(h, e.hp, i).ok);
  assert.equal(h.lockedUntil, 0);
  assert.equal(e.hp.errors[h.team][i].until, 2);
  g.time = 3;
  g.combat.tick(0);
  assert.equal(e.hp.errors[h.team][i], undefined);
  const duo = g.heroes.find((u) => u.role === "duet" && u !== h);
  if (duo) {
    g.duet.split(duo);
    h.bruteforceAt = 0;
    assert.equal(g.duet.brute(h, duo.hp, 0).ok, false);
  }
});
test("return approach is cancelled by a new move and joins without resetting throw cooldown", () => {
  const { g, h, e } = setup();
  e.x += 200;
  g.duet.throw(h, e);
  g.time = 1;
  g.duet.tick(1);
  const s = g.duet.state(h),
    o = s.oka,
    cd = h.throwOkaAt;
  g.duet.returnPart(o);
  assert.equal(o.duetReturn, h.id);
  g.move(o, 2800, 2800);
  assert.equal(o.duetReturn, null);
  o.x = h.x + 50;
  o.y = h.y;
  g.duet.returnPart(o);
  g.duet.tick(0.1);
  assert.equal(s.split, false);
  assert.equal(h.throwOkaAt, cd);
});
test("dash catches the first enemy along its path and consumes misses", () => {
  const { g, h, e } = setup();
  e.x = h.x + 160;
  const other = g.heroes.find((u) => u.team === e.team && u !== e);
  other.x = h.x + 140;
  other.y = h.y;
  g.duet.dash(h, { x: h.x + 900, y: h.y });
  g.time = 0.7;
  g.duet.tick(0.2);
  assert.ok(h.duel);
  assert.ok(h.duel.participants.includes(other));
  const miss = setup();
  for (const u of miss.g.heroes) if (u.team !== miss.h.team) u.y += 2000;
  assert.ok(miss.g.duet.dash(miss.h, { x: miss.h.x + 900, y: miss.h.y }).ok);
  for (let i = 0; i < 20; i++) {
    miss.g.time += 0.1;
    miss.g.duet.tick(0.1);
  }
  assert.equal(miss.h.duetDash, null);
  assert.ok(miss.h.headOnAt > miss.g.time);
});
test("duel tie ends without damage, wrong input locks, and bots solve larger seeded boards", () => {
  const { g, h, e } = setup();
  g.duet.startDuel(h, e, SKILLS.headOn.ranks[0]);
  g.time += DUEL_START_SECONDS;
  let d = h.duel,
    i = d.boards[0].findIndex((v) => !v);
  assert.equal(
    g.place(h, d, i, (d.puzzles[0].solution[i] % 4) + 1, "pen").ok,
    false,
  );
  assert.equal(g.canPen(h), false);
  g.time = DUEL_START_SECONDS + 2.1;
  assert.equal(g.canPen(h), true);
  g.time = Math.max(g.time, d.startedAt + DUEL_START_SECONDS);
  g.duet.finishDuel(d);
  g.time += DUEL_END_SECONDS;
  g.duet.tick(DUEL_END_SECONDS);
  assert.equal(g.combat.hpLeft(h), 16);
  assert.equal(g.combat.hpLeft(e), 16);
  assert.equal(g.place(h, d, i, 1, "pen").ok, false);
  g.combat.upgradeHealth(h, 6);
  g.autoPlayer = true;
  g.duet.startDuel(h, e, SKILLS.headOn.ranks[2]);
  d = h.duel;
  for (let k = 0; k < 100 && h.duel; k++) {
    g.time += 0.3;
    g.duet.tick(0.3);
  }
  assert.ok(d.scores.get(h.id) + d.scores.get(e.id) > 0);
  assert.equal(h.duel, null);
});

test("duel animation release precedes enlarged ashes and tracks enemy digit authorship", () => {
  const { g, h, e } = setup();
  g.duet.startDuel(h, e, SKILLS.headOn.ranks[0]);
  g.time += DUEL_START_SECONDS;
  const d = h.duel,
    i = d.boards[0].findIndex((v) => !v);
  assert.equal(g.place(e, d, i, d.puzzles[0].solution[i], "pen").ok, true);
  assert.equal(d.owners[i], e.id);
  assert.match(
    puzzleHTML(g, d, h, { spy: false, selected: -1, notes: false }),
    /duel-enemy-digit/,
  );
  assert.doesNotMatch(
    puzzleHTML(g, d, e, { spy: false, selected: -1, notes: false }),
    /duel-enemy-digit/,
  );
  g.time = DUEL_START_SECONDS;
  g.duet.finishDuel(d);
  g.time += DUEL_END_SECONDS - 0.01;
  g.duet.tick(DUEL_END_SECONDS - 0.01);
  assert.equal(h.duel, d);
  assert.equal(g.duet.duelRemains.length, 0);
  g.time += 0.02;
  g.duet.tick(0.02);
  assert.equal(h.duel, null);
  assert.equal(g.duet.duelRemains.length, 1);
  g.time += DUEL_ASHES_SECONDS + 0.01;
  g.duet.tick(DUEL_ASHES_SECONDS + 0.01);
  assert.equal(g.duet.duelRemains.length, 0);
});

test("windup precedes running, mounted Oka uses supplied sheet, and all duel assets are bundled", () => {
  const { g, h, e } = setup(),
    animator = new HeroAnimator(g);
  g.duet.dash(h, { x: h.x + 500, y: h.y });
  assert.equal(animator.pose(h).file, "duet-duel-windup.webp");
  g.time = 0.61;
  h.x += 10;
  assert.equal(animator.pose(h).name, "running");
  h.duetDash = null;
  g.duet.split(h);
  const o = g.duet.state(h).oka;
  g.duet.state(h).mounted = { target: e, until: 10 };
  assert.equal(animator.pose(o).file, "oka-mounted.webp");
  for (const a of Object.values(DUEL_ANIMATIONS))
    assert.ok(heroAnimationFiles().includes(a.file));
  assert.equal(DUEL_ANIMATIONS.ashes.width, DUEL_ANIMATIONS.ends.width);
  assert.equal(DUEL_ANIMATIONS.ashes.height, DUEL_ANIMATIONS.ends.height);
});

test("duel intro and ending play every frame before heroes return and ashes begin", () => {
  const { g, h, e } = setup();
  g.duet.startDuel(h, e, SKILLS.headOn.ranks[0]);
  const d = h.duel;
  d.scores.set(e.id, 1);
  for (let frame = 0; frame < 6; frame++) {
    const pose = duelAnimationPose(d, frame * (1 / 6) + 0.001);
    assert.equal(pose.name, "start");
    assert.equal(pose.frame, frame);
  }
  assert.equal(duelAnimationPose(d, DUEL_START_SECONDS).name, "enemy");
  g.duet.finishDuel(d); // Even an early finish must complete the intro.
  assert.equal(d.endingAt, DUEL_START_SECONDS);
  for (let frame = 0; frame < 6; frame++) {
    g.time = d.endingAt + frame * (1 / 6) + 0.001;
    g.duet.tick(0.165);
    const pose = duelAnimationPose(d, g.time);
    assert.equal(pose.name, "ends");
    assert.equal(pose.frame, frame);
    assert.equal(h.duel, d);
    assert.equal(g.duet.duelRemains.length, 0);
  }
  g.time = d.endingAt + DUEL_END_SECONDS;
  g.duet.tick(0.165);
  assert.equal(h.duel, null);
  assert.equal(
    duelAnimationPose(g.duet.duelRemains[0], g.time, true).name,
    "ashes",
  );
  for (const animation of Object.values(DUEL_ANIMATIONS)) {
    assert.equal(animation.width, 108);
    assert.equal(animation.height, 195);
    assert.equal(
      animation.frameMs,
      animation === DUEL_ANIMATIONS.start || animation === DUEL_ANIMATIONS.ends
        ? 1000 / 6
        : 247.5,
    );
  }
});

test("intro opens a disabled board, duel bruteforce claims cells without unlocking the pen, and progress uses colored segments", () => {
  const { g, h, e } = setup();
  g.duet.startDuel(h, e, SKILLS.headOn.ranks[0]);
  const d = h.duel,
    i = d.boards[0].findIndex((v) => !v);
  assert.equal(g.canPen(h), false);
  assert.equal(g.place(h, d, i, d.puzzles[0].solution[i], "pen").ok, false);
  assert.equal(g.duet.brute(h, d, i).ok, false);
  assert.equal(g.duet.brute(h, e.hp, i).ok, false);
  assert.match(
    puzzleHTML(g, d, h, { spy: false, selected: i }),
    /ввод пока недоступен/,
  );
  assert.doesNotMatch(
    puzzleHTML(g, d, h, { spy: false, selected: i }),
    /digit-pad|data-digit=/,
  );
  g.time = 1;
  assert.equal(g.canPen(h), true);
  g.random = () => 0;
  d.locks.set(h.id, 3);
  assert.equal(g.duet.brute(h, d, i).ok, true);
  assert.equal(
    d.scores.get(h.id),
    SKILLS.bruteforce.ranks[h.skillRanks.bruteforce - 1].count,
  );
  assert.equal(d.boards[0][i], -1);
  assert.equal(d.owners[i], h.id);
  assert.equal(g.canPen(h), false);
  assert.equal(g.place(e, d, i, 1, "pen").ok, false);
  assert.ok(h.bruteforceAt > g.time);
  const html = puzzleHTML(g, d, h, { spy: false, selected: -1 });
  assert.match(html, /duel-score-bar/);
  assert.match(html, /duel-score-own/);
  assert.match(html, /duel-score-enemy/);
  assert.doesNotMatch(html, /digit-pad|data-digit=/);
});
test("ashes advances every supplied frame and survives until its full strip has played", () => {
  const { g, h, e } = setup();
  g.duet.startDuel(h, e, SKILLS.headOn.ranks[0]);
  const d = h.duel;
  g.time = 1;
  g.duet.finishDuel(d);
  g.time = 2;
  g.duet.tick(1);
  const remains = g.duet.duelRemains[0];
  assert.ok(remains);
  for (let frame = 0; frame < 6; frame++) {
    g.time = 2 + (frame * DUEL_ANIMATIONS.ashes.frameMs) / 1000 + 0.001;
    g.duet.tick(0.1);
    assert.ok(g.duet.duelRemains.includes(remains));
    assert.equal(duelAnimationPose(remains, g.time, true).frame, frame);
  }
  g.time = 2 + DUEL_ASHES_SECONDS + 0.001;
  g.duet.tick(0.1);
  assert.equal(g.duet.duelRemains.length, 0);
  assert.equal(DUEL_START_SECONDS, 1);
  assert.equal(DUEL_END_SECONDS, 1);
});

test("actual duel rendering uses match time even when browser uptime is far ahead", () => {
  const { g, h, e } = setup();
  g.duet.startDuel(h, e, SKILLS.headOn.ranks[0]);
  const d = h.duel;
  const calls = [];
  const context = {
    save() {},
    restore() {},
    translate() {},
    scale() {},
    clearRect() {},
  };
  const renderer = {
    game: g,
    ctx: context,
    p: () => ({ x: 0, y: 0 }),
    spriteScale: 1,
    heroAnimator: {
      drawPose(_ctx, pose) {
        calls.push(pose);
      },
    },
  };
  for (let frame = 0; frame < 6; frame++) {
    g.time = frame / 6 + 0.001;
    Renderer.prototype.duelSprite.call(renderer, d, 9000 + g.time);
    assert.equal(calls.at(-1).name, "start");
    assert.equal(calls.at(-1).frame, frame);
  }
  g.time = 1;
  g.duet.finishDuel(d);
  for (let frame = 0; frame < 6; frame++) {
    g.time = 1 + frame / 6 + 0.001;
    Renderer.prototype.duelSprite.call(renderer, d, 9000 + g.time);
    assert.equal(calls.at(-1).name, "ends");
    assert.equal(calls.at(-1).frame, frame);
  }
  g.time = 2;
  g.duet.tick(0.1);
  for (let frame = 0; frame < 6; frame++) {
    g.time = 2 + (frame * DUEL_ANIMATIONS.ashes.frameMs) / 1000 + 0.001;
    Renderer.prototype.duelSprite.call(
      renderer,
      g.duet.duelRemains[0],
      9000 + g.time,
      true,
    );
    assert.equal(calls.at(-1).name, "ashes");
    assert.equal(calls.at(-1).frame, frame);
  }
  g.time += DUEL_ASHES_SECONDS;
  g.duet.tick(0.1);
  assert.equal(g.duet.duelRemains.length, 0);
});

test("duel bots have a seeded 40 percent mistake threshold with normal pen lock", () => {
  for (const [roll, mistake] of [
    [0, true],
    [0.399999, true],
    [0.4, false],
    [0.999999, false],
  ]) {
    const { g, h, e } = setup();
    g.duet.startDuel(h, e, SKILLS.headOn.ranks[0]);
    const d = h.duel;
    g.time = 1;
    let calls = 0;
    g.random = () => {
      calls++;
      return roll;
    };
    g.duet.tick(0.1);
    assert.equal(d.scores.get(e.id), mistake ? 0 : 1);
    assert.equal(d.scores.get(h.id), 0);
    assert.equal(d.locks.has(e.id), mistake);
    if (mistake) {
      const errors = Object.entries(d.errors[e.team]);
      assert.equal(errors.length, 1);
      const [i, error] = errors[0];
      assert.notEqual(error.value, d.puzzles[0].solution[i]);
      assert.ok(error.value >= 1 && error.value <= d.puzzles[0].rules.size);
      assert.equal(g.canPen(e), false);
      const previous = calls;
      g.duet.tick(0.1);
      assert.equal(calls, previous);
    }
  }
});

test("tied duel loops only the first two supplied frames and preserves intro and ending", () => {
  const { g, h, e } = setup();
  g.duet.startDuel(h, e, SKILLS.headOn.ranks[0]);
  const d = h.duel;
  assert.equal(duelAnimationPose(d, 0.5).name, "start");
  const ms = DUEL_ANIMATIONS.tie.frameMs;
  for (let k = 0; k < 10; k++) {
    const pose = duelAnimationPose(d, 1 + (k * ms) / 1000 + 0.001);
    assert.equal(pose.name, "tie");
    assert.equal(pose.frame, k % 2);
    assert.equal(pose.sourceFrames[pose.frame].x, (k % 2) * 362);
    assert.equal(pose.sourceFrames[pose.frame].width, 362);
  }
  d.scores.set(h.id, 1);
  assert.equal(duelAnimationPose(d, 4).name, "winning");
  d.scores.set(e.id, 1);
  d.leadAt = 5;
  assert.equal(duelAnimationPose(d, 5).frame, 0);
  assert.equal(duelAnimationPose(d, 5 + ms / 1000 + 0.001).frame, 1);
  g.time = 6;
  g.duet.finishDuel(d);
  assert.equal(duelAnimationPose(d, 6).name, "ends");
  assert.ok(heroAnimationFiles().includes("duet-duel-tie.webp"));
});

test("stubborn blue outline stays on both fragments until shield expiration using match time", () => {
  const { g, h } = setup();
  g.duet.split(h);
  const o = g.duet.state(h).oka;
  g.time = 2;
  assert.equal(g.duet.shield(h).ok, true);
  const outlines = [];
  const ctx = new Proxy(
    {},
    {
      get: (_o, key) => (key === "globalAlpha" ? 1 : () => {}),
      set: () => true,
    },
  );
  const renderer = Object.create(Renderer.prototype);
  Object.assign(renderer, {
    game: g,
    ctx,
    spriteScale: 1,
    hover: null,
    unitPoint: () => ({ x: 0, y: 0 }),
    label: () => {},
    heroAnimator: {
      draw(_c, _h, outline) {
        outlines.push(outline);
        return true;
      },
      drawSolvingOverlay() {},
      manifest: {},
    },
  });
  for (const time of [2, 3, g.duet.state(h).shieldUntil - 0.01]) {
    g.time = time;
    for (const hero of [h, o]) {
      renderer.hero(hero, 9000);
      assert.equal(outlines.at(-1).color, "#318cff");
      assert.equal(outlines.at(-1).width, 1.25);
    }
  }
  g.time = g.duet.state(h).shieldUntil;
  renderer.hero(h, 9000);
  assert.equal(outlines.at(-1), null);
});
