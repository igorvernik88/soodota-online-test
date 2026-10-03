import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/logic.js";
import { FIRE } from "../src/config.js";
import { HERO_ANIMATION_MANIFEST } from "../src/hero-animation.js";
function setup(rank = 4) {
  const g = new Game(42, { role: "sudaks" });
  g.start();
  const h = g.player;
  for (const u of g.heroes) if (u !== h) u.dead = true;
  h.skillRanks.burning = rank;
  h.x = 1000;
  h.y = 1000;
  g.vision.visible = () => true;
  return { g, h };
}
function revive(g, u, x = 1400, y = 1000) {
  u.dead = false;
  u.x = x;
  u.y = y;
  g.combat.newHealth(u, 4);
  for (const side of u.hp.armor)
    for (const key of Object.keys(side)) delete side[key];
  return u;
}
for (const rank of [1, 2, 3, 4])
  test(`burning rank ${rank} gets one charge and sequential regeneration capped at three`, () => {
    const { g, h } = setup(rank),
      p = g.skill(h, "burning"),
      s = g.fire.charges(h);
    assert.equal(s.count, 1);
    assert.equal(s.nextAt, p.cooldown);
    g.time = p.cooldown;
    assert.equal(g.fire.charges(h).count, 2);
    g.time = 2 * p.cooldown;
    assert.equal(g.fire.charges(h).count, 3);
    g.time = 1000;
    assert.equal(g.fire.charges(h).count, 3);
    assert.ok(g.fire.consume(h, 1));
    assert.equal(s.count, 2);
    assert.equal(s.nextAt, 1000 + p.cooldown);
  });
test("point burning spends one charge, keeps two, and fireball preview splits nine digits round-robin", () => {
  const { g, h } = setup();
  const enemy = revive(
    g,
    g.heroes.find((u) => u.team !== h.team),
    h.x + 40,
    h.y,
  );
  const s = g.fire.charges(h);
  s.count = 3;
  s.nextAt = null;
  assert.ok(g.burningSkill(h, enemy).ok);
  assert.equal(s.count, 2);
  s.count = 3;
  s.nextAt = null;
  const point = { x: 1400, y: 1000 };
  enemy.x = 1400;
  const ally = revive(
    g,
    g.heroes.find((u) => u !== h && u.team === h.team),
    1400,
    1010,
  );
  const other = revive(
    g,
    g.heroes.find((u) => u !== enemy && u.team !== h.team),
    1400,
    1020,
  );
  assert.deepEqual(
    g.fire.distribution(h, point).map((e) => e.count),
    [3, 3, 3],
  );
  assert.ok(g.fire.ball(h, point).ok);
  assert.equal(s.count, 0);
  assert.equal(Object.keys(ally.hp.burning[1 - ally.team]).length, 0);
  g.time = FIRE.castDelay;
  g.fire.tick();
  assert.equal(Object.keys(ally.hp.burning[1 - ally.team]).length, 3);
  assert.equal(Object.keys(other.hp.burning[1 - other.team]).length, 3);
});
test("friendly fire can kill an ally with no kill reward or resurrection; survivor burns heal one old cell", () => {
  const { g, h } = setup();
  const ally = revive(
    g,
    g.heroes.find((u) => u !== h && u.team === h.team),
  );
  const team = 1 - ally.team,
    p = ally.hp.puzzles[team];
  ally.hp.boards[team] = p.solution.slice();
  ally.hp.boards[team][0] = 0;
  const money = h.gold,
    digits = h.digits,
    kills = h.kills;
  assert.ok(g.fire.ball(h, { x: ally.x, y: ally.y }).ok);
  g.time = 0.3;
  g.fire.tick();
  assert.ok(ally.dead);
  assert.equal(h.gold, money);
  assert.equal(h.digits, digits);
  assert.equal(h.kills, kills);
  g.time = 20;
  g.heroEffects.tick();
  assert.ok(ally.dead);
  revive(g, ally);
  const t = ally.hp;
  t.boards[team][0] = t.puzzles[team].solution[0];
  g.fire.charges(h).count = 1;
  assert.ok(g.fire.ball(h, { x: ally.x, y: ally.y }).ok);
  g.time += 0.3;
  g.fire.tick();
  assert.equal(t.boards[team].filter(Boolean).length, 4);
  const burnDuration = g.skill(h, "burning").duration;
  g.time += burnDuration;
  g.heroEffects.tick();
  assert.equal(t.boards[team].filter(Boolean).length, 1);
  assert.equal(Object.keys(t.burning[team]).length, 1);
  g.time += burnDuration;
  g.heroEffects.tick();
  assert.equal(t.boards[team].filter(Boolean).length, 0);
});
for (const rank of [1, 2, 3])
  test(`tornado rank ${rank} starts after delay, converts incoming/outgoing damage and restores speed`, () => {
    const { g, h } = setup();
    h.skillRanks.tornado = rank;
    const p = g.skill(h, "tornado"),
      enemy = revive(
        g,
        g.heroes.find((u) => u.team !== h.team),
      );
    const speed = g.heroSpeed(h),
      cooldown = g.cooldown(h),
      digits = h.digits;
    assert.ok(g.fire.tornado(h).ok);
    assert.equal(g.fire.active(h), null);
    assert.equal(h.digits, digits);
    g.time = 0.3;
    g.fire.tick();
    assert.ok(g.fire.active(h));
    assert.equal(g.heroSpeed(h), speed * (1 + p.speed));
    assert.equal(g.cooldown(h), cooldown * (1 - p.pen));
    g.combat.hit(enemy, h.hp, 0, h.hp.puzzles[enemy.team].solution[0]);
    assert.equal(h.hp.burning[enemy.team][0].until, g.time + p.incoming);
    const tower = g.towers[0];
    tower.backdoorArmor = 0;
    g.combat.hit(h, tower, 0, tower.puzzles[h.team].solution[0]);
    assert.equal(
      tower.burning[h.team][0].until,
      g.time + g.skill(h, "burning").duration,
    );
    g.time += g.skill(h, "burning").duration;
    g.heroEffects.tick();
    assert.equal(tower.boards[h.team][0], 0);
    g.time = h.tornadoUntil;
    g.fire.tick();
    assert.equal(g.heroSpeed(h), speed);
    assert.equal(g.cooldown(h), cooldown);
  });
test("tornado costs 5/8/11 and reverse exit reuses entry sprite frames", () => {
  const { g, h } = setup();
  h.digits = 30;
  for (const remaining of [25, 17, 6]) {
    assert.ok(g.upgradeSkill(h, "tornado").ok);
    assert.equal(h.digits, remaining);
  }
  assert.ok(!g.upgradeSkill(h, "tornado").ok);
  const m = HERO_ANIMATION_MANIFEST.sudaks;
  assert.equal(m.tornadoEnter.file, m.tornadoExit.file);
  assert.equal(m.tornadoExit.sourceFrames[0].x, 5 * 362);
});

test("fireball completes just one health page and expiry stays on that page", () => {
  const { g, h } = setup();
  const enemy = revive(
    g,
    g.heroes.find((u) => u.team !== h.team),
  );
  g.combat.newHealth(enemy, 9);
  const t = enemy.hp,
    team = h.team,
    first = t.pages[0],
    second = t.pages[1];
  first.boards[team] = first.puzzles[team].solution.slice();
  first.boards[team][0] = 0;
  g.selectPage(t, 0);
  assert.ok(g.fire.ball(h, { x: enemy.x, y: enemy.y }).ok);
  g.time = 0.3;
  g.fire.tick();
  assert.equal(enemy.dead, false);
  assert.ok(first.completed[team]);
  assert.equal(second.completed[team], false);
  assert.equal(second.boards[team].filter(Boolean).length, 0);
  g.time += g.skill(h, "burning").duration;
  g.heroEffects.tick();
  assert.equal(first.boards[team][0], 0);
  assert.equal(second.boards[team].filter(Boolean).length, 0);
});

test("tornado incoming damage remains lethal before burning and does not resurrect", () => {
  const { g, h } = setup();
  h.skillRanks.tornado = 1;
  const enemy = revive(
    g,
    g.heroes.find((u) => u.team !== h.team),
  );
  assert.ok(g.fire.tornado(h).ok);
  g.time = 0.3;
  g.fire.tick();
  const t = h.hp,
    team = enemy.team;
  t.boards[team] = t.puzzles[team].solution.slice();
  t.boards[team][0] = 0;
  g.combat.damage(enemy, t, 1);
  assert.ok(h.dead);
  g.time += 6;
  g.fire.tick();
  g.heroEffects.tick();
  assert.ok(h.dead);
  assert.equal(g.fire.active(h), null);
});
test("delayed poison into tornado becomes burning without the shorter poison expiry", () => {
  const { g, h } = setup();
  h.skillRanks.tornado = 1;
  const enemy = revive(
    g,
    g.heroes.find((u) => u.team !== h.team),
  );
  enemy.role = "combinator";
  enemy.skillRanks.poison = 1;
  g.random = () => 0;
  assert.ok(g.fire.tornado(h).ok);
  g.time = 0.3;
  g.fire.tick();
  g.heroEffects.schedule(enemy, h.hp);
  const effect = g.heroEffects.poison.at(-1);
  g.time = effect.at;
  g.heroEffects.tick();
  assert.equal(Object.keys(h.hp.burning[enemy.team]).length, 1);
  g.time = effect.until;
  g.heroEffects.tick();
  assert.equal(h.hp.boards[enemy.team].filter(Boolean).length, 1);
});

test("delayed casts retain their rank parameters if upgraded during windup", () => {
  const { g, h } = setup(1);
  h.skillRanks.tornado = 1;
  const enemy = revive(
    g,
    g.heroes.find((u) => u.team !== h.team),
  );
  assert.ok(g.fire.ball(h, { x: enemy.x, y: enemy.y }).ok);
  assert.ok(g.fire.tornado(h).ok);
  h.skillRanks.burning = 4;
  h.skillRanks.tornado = 3;
  g.time = 0.3;
  g.fire.tick();
  assert.equal(Object.keys(enemy.hp.burning[h.team]).length, 1);
  assert.equal(g.fire.active(h).duration, 8);
  assert.equal(g.fire.active(h).speed, 0.1);
});

test("battle cry keeps active tornado animation and effect", async () => {
  const { HeroAnimator } = await import("../src/hero-animation.js");
  const { g, h } = setup();
  h.skillRanks.tornado = 1;
  h.skillRanks.cry = 1;
  h.tornadoUntil = g.time + 8;
  h.tornadoParams = g.skill(h, "tornado");
  const animator = new HeroAnimator(g);
  assert.equal(g.heroSkill(h).ok, true);
  animator.syncEvents();
  assert.equal(animator.chooseState(h), "tornadoLoop");
  assert.ok(g.fire.active(h));
});

test("old entries burn after a second full interval without spreading again", () => {
  const { g, h } = setup(1);
  const victim = g.heroes.find((u) => u.team !== h.team);
  revive(g, victim);
  const t = victim.hp,
    team = h.team;
  for (const i of [0, 1, 2]) t.boards[team][i] = t.puzzles[team].solution[i];
  g.heroEffects.markBurning(h, t, [0], 7);
  g.time = 7;
  g.heroEffects.tick();
  assert.equal(t.boards[team][0], 0);
  assert.ok(t.boards[team][1]);
  assert.equal(t.burning[team][1].until, 14);
  g.time = 13.99;
  g.heroEffects.tick();
  assert.ok(t.boards[team][1]);
  g.time = 14;
  g.heroEffects.tick();
  assert.equal(t.boards[team][1], 0);
  assert.ok(t.boards[team][2]);
  assert.equal(Object.keys(t.burning[team]).length, 0);
  g.time = 30;
  g.heroEffects.tick();
  assert.ok(t.boards[team][2]);
});
