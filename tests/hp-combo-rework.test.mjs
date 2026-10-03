import test from "node:test";
import assert from "node:assert/strict";
import { Game, CONFIG } from "../src/logic.js";
import { SKILLS } from "../src/config.js";
test("tower tiers have one, two and three 6x6 pages", () => {
  const g = new Game();
  for (const t of g.towers) {
    assert.equal(t.pages.length, t.step + 1);
    assert.ok(t.pages.every((p) => p.puzzles[0].rules.size === 6));
  }
});
for (const rank of [1, 2, 3])
  test(`combo ultimate ${rank} ends on its configured pen limit`, () => {
    const g = new Game(42, { role: "agile" });
    g.start();
    g.vision.visible = () => true;
    const h = g.player,
      t = g.camps[0];
    h.skillRanks.combo = rank;
    h.x = t.x;
    h.y = t.y;
    const p = SKILLS.combo.ranks[rank - 1];
    for (let n = 0; n < p.limit; n++) {
      const i = t.boards[h.team].findIndex((v) => !v);
      assert.ok(g.place(h, t, i, t.puzzles[h.team].solution[i], "pen").ok);
    }
    assert.equal(g.comboActive(h), false);
    assert.equal(g.canPen(h), false);
    assert.equal(h.nextNormal, g.time + h.lastCooldown);
  });
test("closed health page regenerates while remaining inaccessible until thirty seconds", () => {
  const g = new Game();
  g.start();
  const h = g.player;
  g.combat.newHealth(h, 9);
  Object.assign(h, { x: 2500, y: 2500, regenAt: 12 });
  const t = h.hp,
    team = 1 - h.team,
    page = t.pages[0];
  page.boards[team] = page.puzzles[team].solution.slice();
  g.selectPage(t, 0);
  g.combat.completePage(t, team);
  const before = g.combat.hpLeft(h);
  g.time = 12;
  g.combat.tick(0);
  assert.ok(g.combat.hpLeft(h) > before);
  assert.equal(page.completed[team], true);
  assert.equal(page.recovery[team].remaining, 18);
  g.selectPage(t, 0);
  const attacker = g.heroes.find((u) => u.team === team);
  assert.equal(g.combat.access(attacker, t).ok, false);
  g.time = 30;
  g.combat.tick(0);
  assert.equal(page.completed[team], false);
});
test("upper hero click area takes priority over an overlapping creep", async () => {
  const { Renderer } = await import("../src/render.js");
  const g = new Game();
  g.start();
  g.vision.visible = () => true;
  const enemy = g.heroes.find((h) => h.team !== g.player.team);
  Object.assign(enemy, { x: 2500, y: 2000 });
  const creep = g.combat.creeps.find((u) => u.team === enemy.team);
  Object.assign(creep, { x: 2500, y: 1770 });
  g.combat.units = () => [enemy, creep];
  const r = {
    game: g,
    allySkillTargeting: { active: false },
    spriteScale: 1,
    unitPoint: (u) => ({ x: u.x, y: u.y }),
    p: (x, y) => ({ x, y }),
  };
  assert.equal(Renderer.prototype.hit.call(r, 2500, 1690), enemy.hp);
});
