import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/logic.js";
import { AllySkillTargeting } from "../src/ally-skill-targeting.js";
function setup() {
  const g = new Game(81, { role: "sudzh" });
  g.start();
  g.sandbox = true;
  g.vision.visible = () => true;
  return g;
}
test("mini ink masks five own health cells, big ink accepts allies and towers within 1200", () => {
  const g = setup(),
    h = g.player;
  h.consumables.miniInk = 1;
  assert.ok(g.useItem(h, "miniInk").ok);
  assert.equal(g.maskedIndices(h.hp, 1 - h.team).length, 5);
  assert.equal(h.hp.effects[1 - h.team].until, 9);
  const ally = g.heroes.find((u) => u.team === h.team && u !== h);
  ally.x = h.x + 1000;
  ally.y = h.y;
  h.consumables.veil = 3;
  assert.ok(g.useItem(h, "veil", ally).ok);
  assert.equal(ally.hp.effects[1 - h.team].until, 20);
  const tower = g.towers.find((t) => t.defender === h.team);
  tower.x = h.x + 1100;
  tower.y = h.y;
  const targeting = new AllySkillTargeting({ game: g });
  targeting.toggle("veil");
  assert.ok(targeting.accepts(tower));
  assert.ok(targeting.apply(tower).ok);
  const enemy = g.heroes.find((u) => u.team !== h.team);
  assert.equal(g.useItem(h, "veil", enemy).ok, false);
  g.time = 21;
  assert.equal(g.maskedIndices(ally.hp, 1 - h.team).length, 0);
});
for (const [rank, cap] of [
  [1, 3],
  [2, 4],
  [3, 5],
  [4, 6],
])
  test(`thick binding rank ${rank} grants and decays armor`, () => {
    const g = setup(),
      h = g.player,
      enemy = g.heroes.find((u) => u.team !== h.team);
    h.skillRanks.thickBinding = rank;
    const hit = () => {
      const team = enemy.team;
      const i = h.hp.boards[team].findIndex(
        (v, i) => !v && !(h.hp.armor[team][i] > g.time),
      );
      assert.ok(i >= 0);
      g.combat.hit(enemy, h.hp, i);
    };
    hit();
    hit();
    assert.equal(h.thickBinding.charges.length, 0);
    hit();
    assert.equal(h.thickBinding.charges.length, 1);
    // Repeat attacks against an already filled cell never grant extra charges.
    const i = h.hp.boards[enemy.team].findIndex(Boolean);
    g.combat.hit(enemy, h.hp, i);
    assert.equal(h.thickBinding.hits, 0);
    // Release damaged cells to test all ranks on 4x4 health without finishing a page.
    for (let n = 0; n < cap * 3; n++) {
      h.hp.boards[enemy.team].fill(0);
      hit();
    }
    assert.equal(h.thickBinding.charges.length, cap);
    g.time = 10;
    g.sudzh.tick(0);
    assert.equal(h.thickBinding.charges.length, cap);
    g.time = 11;
    g.sudzh.tick(0);
    assert.equal(h.thickBinding.charges.length, cap - 1);
    g.time = 11 + cap * 3;
    g.sudzh.tick(0);
    assert.equal(h.thickBinding.charges.length, 0);
  });
test("self stench and creeps do not charge thick binding", () => {
  const g = setup(),
    h = g.player;
  h.skillRanks.thickBinding = 1;
  g.sudzh.recordDamage({ ...h, team: 1 - h.team, role: undefined }, h.hp);
  g.sudzh.recordDamage({ team: 1 - h.team, kind: "creep" }, h.hp);
  assert.equal(h.thickBinding, undefined);
});
