import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/logic.js";
function setup(role = "intellect") {
  const g = new Game(81, { role });
  g.start();
  const h = g.player,
    victim = g.heroes.find((u) => u.team !== h.team);
  Object.assign(victim, { x: h.x + 5, y: h.y });
  g.combat.sync(victim);
  g.vision.visible = () => true;
  victim.misfire = true;
  h.nextNormal = 0;
  return { g, h, victim };
}
test("misfire converts a correct enemy pen entry into a temporary error without HP damage", () => {
  const { g, h, victim } = setup();
  g.random = () => 0;
  const t = victim.hp,
    index = 0,
    before = g.combat.hpLeft(victim);
  const r = g.place(h, t, index, t.puzzles[h.team].solution[index], "pen");
  assert.ok(r.error);
  assert.ok(t.errors[h.team][index].misfire);
  assert.equal(t.boards[h.team][index], 0);
  assert.equal(g.combat.hpLeft(victim), before);
});
test("Dyrkol can still trigger hole piercing after misfire", () => {
  const { g, h, victim } = setup("strong");
  h.skillRanks.hole = 1;
  g.random = () => 0;
  const t = victim.hp;
  const r = g.place(h, t, 0, t.puzzles[h.team].solution[0], "pen");
  assert.ok(r.error);
  assert.ok(r.hole >= 0);
  assert.equal(t.boards[h.team][r.hole], -1);
});
test("misfire does not trigger above 18 percent threshold", () => {
  const { g, h, victim } = setup();
  g.random = () => 0.18;
  const t = victim.hp;
  assert.ok(g.place(h, t, 0, t.puzzles[h.team].solution[0], "pen").ok);
  assert.ok(t.boards[h.team][0]);
});

for (const [rank, chance, cooldown] of [
  [1, 0.1, 20],
  [2, 0.15, 16],
  [3, 0.2, 12],
  [4, 0.3, 8],
]) {
  test(`caustic rank ${rank} evades only while ready and recharges in ${cooldown}s`, () => {
    const { g, h, victim } = setup();
    victim.misfire = false;
    victim.role = "combinator";
    victim.skillRanks.caustic = rank;
    const t = victim.hp;
    g.random = () => chance;
    assert.ok(g.place(h, t, 0, t.puzzles[h.team].solution[0], "pen").ok);
    h.nextNormal = 0;
    g.random = () => chance - 0.001;
    assert.ok(g.place(h, t, 1, t.puzzles[h.team].solution[1], "pen").error);
    assert.ok(t.errors[h.team][1].caustic);
    assert.equal(victim.causticAt, g.time + cooldown);
    h.lockedUntil = 0;
    h.nextNormal = 0;
    assert.ok(g.place(h, t, 2, t.puzzles[h.team].solution[2], "pen").ok);
    g.time = victim.causticAt;
    h.nextNormal = 0;
    assert.ok(g.place(h, t, 3, t.puzzles[h.team].solution[3], "pen").error);
  });
}
