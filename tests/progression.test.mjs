import test from "node:test";
import assert from "node:assert/strict";
import { Progression } from "../src/progression.js";
import { PROGRESSION, ROLE_SKILLS, SKILLS } from "../src/config.js";
import { Game } from "../src/logic.js";

function fixture(role = "agile") {
  const game = { phase: "playing", emit() {} };
  const p = new Progression(game),
    h = { role };
  p.initialize(h);
  return { p, h, game };
}

test("all roles start with three digits and locked skills", () => {
  for (const role of Object.keys(ROLE_SKILLS)) {
    const { p, h } = fixture(role);
    assert.equal(h.digits, 3);
    for (const id of ROLE_SKILLS[role]) assert.equal(p.skill(h, id), null);
  }
});
test("timer grants multiple digits and retains fractional progress without capacity", () => {
  const { p, h } = fixture();
  p.progress(h, 365.75);
  assert.equal(h.digits, 6);
  assert.equal(h.digitProgress, 5.75);
  p.add(h, 1000, "reward");
  assert.equal(h.digits, 1006);
});
test("one to three recipients share the progress pool exactly", () => {
  for (const size of [1, 2, 3]) {
    const heroes = Array.from({ length: size }, () => fixture());
    for (const { p, h } of heroes)
      p.progress(h, PROGRESSION.creepSeconds / size, "creep");
    assert.ok(
      Math.abs(heroes.reduce((sum, { h }) => sum + h.digitProgress, 0) - 10) <
        1e-9,
    );
    for (const { p, h } of heroes)
      p.progress(h, PROGRESSION.assistSeconds / size, "assist");
    const total = heroes.reduce(
      (sum, { h }) => sum + h.digitProgress + (h.digits - 3) * 120,
      0,
    );
    assert.ok(Math.abs(total - 130) < 1e-9);
  }
});
test("rank spending, cap, order and reserves use one resource", () => {
  const { p, h } = fixture();
  assert.equal(p.upgrade(h, "combo").ok, true);
  assert.equal(h.digits, 0);
  assert.equal(p.upgrade(h, "slow").ok, false);
  p.add(h, 4, "reward");
  p.bot(h);
  assert.deepEqual(h.skillRanks, { combo: 1, slow: 1 });
  assert.equal(p.available(h), 0);
  p.add(h, 100, "reward");
  p.bot(h);
  assert.deepEqual(h.skillRanks, { combo: 4, slow: 4 });
  assert.equal(h.digitsSpent.skills, 42);
  assert.equal(p.upgrade(h, "combo").ok, false);
});
test("health does not change skills or running cooldowns", () => {
  const { p, h } = fixture("combinator");
  p.upgrade(h, "box");
  h.heroSkillAt = 75;
  const launch = p.skill(h, "box");
  h.healthSize = 9;
  p.add(h, 5, "reward");
  p.upgrade(h, "box");
  assert.equal(h.heroSkillAt, 75);
  assert.equal(launch.duration, 10);
  assert.equal(p.skill(h, "box").duration, 15);
});
test("rank tables expose their declared ranks and valid probabilities", () => {
  for (const [id, def] of Object.entries(SKILLS)) {
    assert.equal(
      def.ranks.length,
      [
        "rune",
        "tornado",
        "breakPencil",
        "box",
        "inkBinding",
        "abduction",
        "freshSudoku",
        "combo",
        "headOn",
      ].includes(id)
        ? 3
        : 4,
    );
    for (const rank of def.ranks)
      if (rank.chance !== undefined)
        assert.ok(rank.chance >= 0 && rank.chance <= 1);
  }
});
test("death and respawn preserve personal progression", () => {
  const g = new Game(42);
  g.chooseHero("agile");
  g.start();
  const h = g.player;
  g.upgradeSkill(h, "combo");
  g.progression.progress(h, 119.5);
  g.combat.kill(h, { team: 1, id: "tower" });
  g.progression.progress(h, 1);
  g.combat.respawn(h);
  assert.equal(h.digits, 1);
  assert.equal(h.digitProgress, 0.5);
  assert.equal(h.skillRanks.combo, 1);
  assert.equal(g.buy(h, 1).ok, false);
});
