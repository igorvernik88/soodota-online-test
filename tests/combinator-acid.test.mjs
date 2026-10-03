import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/logic.js";
import { HeroAnimator } from "../src/hero-animation.js";
import {
  BOX_PROTECTION_ANIMATIONS,
  TRAPPED_ANIMATION,
} from "../src/animations/manifest.js";
import { SKILLS } from "../src/config.js";
function setup() {
  const g = new Game(42, { role: "combinator" });
  g.start();
  const h = g.player,
    ally = g.heroes.find((u) => u !== h && u.team === h.team),
    enemy = g.heroes.find((u) => u.team !== h.team);
  for (const u of [h, ally, enemy]) {
    u.x = 1000;
    u.y = 1000;
  }
  g.vision.visible = () => true;
  return { g, h, ally, enemy };
}
test("box ultimate supports self, ally and enemy with shared protection puzzle and independent HP", () => {
  const { g, h, ally, enemy } = setup();
  for (const rank of [1, 2, 3]) {
    h.skillRanks.box = rank;
    h.heroSkillAt = 0;
    assert.equal(g.heroEffects.box(h, ally).ok, true);
    const shield = ally.boxProtection,
      before = g.combat.hpLeft(ally),
      destination = { x: 1100, y: 1100 };
    ally.target = destination;
    assert.equal(g.heroEffects.trapped(ally), false);
    assert.ok(g.heroSpeed(ally) > 0);
    assert.equal(
      new HeroAnimator(g).pose(ally).file,
      BOX_PROTECTION_ANIMATIONS.idle.file,
    );
    g.combat.damage(enemy, ally.hp, 3);
    assert.equal(g.combat.hpLeft(ally), before);
    assert.equal(g.getTarget(shield.id), shield);
    assert.equal(g.near(enemy, shield), true);
    for (const index of Object.keys(shield.armor[enemy.team]))
      assert.equal(g.combat.hit(enemy, shield, Number(index)), false);
    // Solve through the protected HP model path, as bots do.
    for (let i = 0; i < shield.boards[enemy.team].length; i++) {
      if (shield.boards[enemy.team][i]) continue;
      enemy.nextNormal = 0;
      assert.equal(
        g.place(
          enemy,
          ally.hp,
          i,
          shield.puzzles[enemy.team].solution[i],
          "pen",
        ).ok,
        true,
      );
    }
    assert.equal(ally.boxProtection, null);
    assert.equal(ally.target, destination);
    assert.equal(g.combat.hpLeft(ally), before);
    g.combat.damage(enemy, ally.hp, 1);
    assert.ok(g.combat.hpLeft(ally) < before);
  }
  h.heroSkillAt = 0;
  assert.equal(g.heroEffects.box(h, h).ok, true);
  g.time = h.boxProtection.until;
  g.heroEffects.tick();
  assert.equal(h.boxProtection, null);
  h.heroSkillAt = 0;
  assert.equal(g.heroEffects.box(h, enemy).ok, true);
  assert.ok(g.heroEffects.trapped(enemy));
  assert.equal(new HeroAnimator(g).pose(enemy).file, TRAPPED_ANIMATION.file);
});
for (const rank of [1, 2, 3, 4])
  test(`acid rank ${rank}: slow, timed damage, leaving resets exposure and expiry`, () => {
    const { g, h, ally, enemy } = setup();
    h.skillRanks.acid = rank;
    const params = g.skill(h, "acid"),
      hp = g.combat.hpLeft(enemy),
      allyHp = g.combat.hpLeft(ally),
      speed = g.heroSpeed(enemy);
    assert.equal(g.heroEffects.acid(h, { x: h.x, y: h.y }).ok, true);
    assert.equal(g.heroSpeed(enemy), speed * (1 - params.slow));
    g.heroEffects.tick();
    assert.equal(g.combat.hpLeft(enemy), hp - 1);
    g.time = params.interval;
    g.heroEffects.tick();
    assert.equal(g.combat.hpLeft(enemy), hp - 2);
    assert.equal(g.combat.hpLeft(ally), allyHp);
    enemy.x = 1500;
    g.heroEffects.tick();
    assert.equal(g.heroSpeed(enemy), speed);
    enemy.x = 1000;
    g.heroEffects.tick();
    g.time += 0.1;
    g.heroEffects.tick();
    assert.equal(g.combat.hpLeft(enemy), hp - 3);
    g.time = 12;
    g.heroEffects.tick();
    assert.equal(g.heroEffects.acidZones.length, 0);
    assert.equal(g.heroSpeed(enemy), speed);
  });
test("box custom ultimate prices, ordinary acid prices and all tornado ranks halve pen cooldown", () => {
  assert.deepEqual(SKILLS.box.costs, [5, 8, 11]);
  assert.equal(SKILLS.box.ranks.length, 3);
  assert.equal(SKILLS.acid.ranks.length, 4);
  assert.equal(SKILLS.acid.costs, undefined);
  const g = new Game(42, { role: "sudaks" });
  g.start();
  const h = g.player;
  h.hasteTier = 6;
  const normal = g.cooldown(h);
  for (const rank of [1, 2, 3]) {
    h.skillRanks.tornado = rank;
    h.tornadoUntil = g.time + 10;
    h.tornadoParams = g.skill(h, "tornado");
    assert.equal(g.cooldown(h), normal / 2);
  }
});

test("box supports universal digits, passive combo/phantoms/poison/hole and active burning/focus", () => {
  const { g, h, enemy } = setup();
  h.skillRanks.box = 3;
  const trap = (role) => {
    enemy.role = role;
    enemy.skillRanks = {
      combo: 1,
      phantoms: 1,
      poison: 1,
      hole: 1,
      focus: 1,
      burning: 1,
    };
    h.heroSkillAt = 0;
    enemy.prison = null;
    enemy.lockedUntil = 0;
    enemy.digits = 99;
    enemy.nextNormal = 0;
    assert.equal(g.heroEffects.box(h, enemy).ok, true);
    return enemy.prison;
  };
  g.random = () => 0;
  let box = trap("agile"),
    index = box.boards[enemy.team].findIndex((v) => !v);
  assert.equal(
    g.place(enemy, box, index, box.puzzles[enemy.team].solution[index], "pen")
      .ok,
    true,
  );
  assert.ok(g.comboActive(enemy));
  const digits = enemy.digits;
  index = box.boards[enemy.team].findIndex((v) => !v);
  const card = g.place(enemy, box, index, 1, "universal");
  assert.equal(card.ok, true, card.message);
  assert.equal(enemy.digits, digits - 1);
  box = trap("intellect");
  index = box.boards[enemy.team].findIndex((v) => !v);
  g.place(enemy, box, index, box.puzzles[enemy.team].solution[index], "pen");
  assert.ok(enemy.phantoms);
  box = trap("combinator");
  index = box.boards[enemy.team].findIndex((v) => !v);
  enemy.poisonAt = 0;
  g.place(enemy, box, index, box.puzzles[enemy.team].solution[index], "pen");
  assert.ok(g.heroEffects.poison.some((e) => e.t === box));
  g.time += 4;
  g.heroEffects.tick();
  assert.ok(Object.keys(box.poison[enemy.team]).length);
  box = trap("strong");
  assert.equal(g.errorFocusSkill(enemy).ok, true);
  index = box.boards[enemy.team].findIndex((v) => !v);
  const wrong = (box.puzzles[enemy.team].solution[index] % 4) + 1;
  assert.ok(g.place(enemy, box, index, wrong, "pen").hole >= 0);
  box = trap("sudaks");
  const hp = g.combat.hpLeft(enemy);
  assert.equal(g.burningSkill(enemy, box).ok, true);
  assert.ok(Object.keys(box.burning[enemy.team]).length);
  assert.equal(g.combat.hpLeft(enemy), hp);
  enemy.prison = null;
  h.heroSkillAt = 0;
  g.heroEffects.box(h, h);
  enemy.fireCharges = { count: 1, nextAt: g.time + 60 };
  enemy.lockedUntil = 0;
  enemy.nextNormal = 0;
  assert.equal(g.burningSkill(enemy, h.boxProtection).ok, true);
  assert.ok(Object.keys(h.boxProtection.burning[enemy.team]).length);
});

test("box approaches its chosen target and rank three adds five armor cells", () => {
  const { g, h, ally } = setup();
  h.skillRanks.box = 3;
  ally.x = h.x + 700;
  assert.ok(g.heroEffects.box(h, ally).queued);
  assert.equal(h.heroSkillAt, 0);
  h.x = ally.x - 100;
  g.heroEffects.tick();
  const box = ally.boxProtection;
  assert.ok(box);
  assert.equal(Object.keys(box.armor[1 - ally.team]).length, 5);
  assert.equal(SKILLS.box.ranks[2].hints, SKILLS.box.ranks[1].hints);
  const animator = new HeroAnimator(g);
  assert.equal(animator.pose(ally).file, BOX_PROTECTION_ANIMATIONS.idle.file);
  ally.x += 10;
  assert.equal(animator.pose(ally).file, BOX_PROTECTION_ANIMATIONS.walk.file);
  h.heroSkillAt = 0;
  ally.boxProtection = null;
  ally.x = h.x + 700;
  g.heroEffects.box(h, ally);
  g.move(h, h.x, h.y + 100);
  assert.equal(h.pendingBox, null);
});
