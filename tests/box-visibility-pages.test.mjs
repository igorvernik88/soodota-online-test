import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/logic.js";
test("enemy can keep viewing a protective box on a visible hero", () => {
  const g = new Game(81, { role: "combinator" });
  g.start();
  const h = g.player,
    ally = g.heroes.find((u) => u.team === h.team && u !== h),
    enemy = g.heroes.find((u) => u.team !== h.team);
  h.skillRanks.box = 1;
  ally.x = h.x;
  ally.y = h.y;
  enemy.x = h.x + 10;
  enemy.y = h.y;
  assert.ok(g.heroEffects.box(h, ally).ok);
  g.vision.invalidate?.();
  const box = ally.boxProtection;
  assert.ok(g.vision.visible(enemy.team, ally));
  assert.ok(g.vision.visible(enemy.team, box));
  assert.ok(g.near(enemy, box));
  assert.ok(g.objectiveAccess(enemy, box).ok);
});
test("health regeneration on another page preserves the selected page", () => {
  const g = new Game(81);
  g.start();
  g.sandbox = true;
  g.combat.structureTick = () => {};
  const h = g.player;
  h.healthSize = 9;
  g.combat.newHealth(h, 9);
  assert.ok(h.hp.pages.length > 1);
  const first = h.hp.pages[0],
    team = 1 - h.team;
  first.boards[team][0] = first.puzzles[team].solution[0];
  g.selectPage(h.hp, 1);
  g.time = 1;
  h.regenBase = g.atBase(h);
  h.regenInterval = g.combat.updateRegenInterval(h);
  h.regenAt = g.time;
  g.combat.tick(0);
  assert.equal(first.boards[team][0], 0);
  assert.equal(h.hp.activePage, 1);
  assert.equal(h.hp.boards, h.hp.pages[1].boards);
});
