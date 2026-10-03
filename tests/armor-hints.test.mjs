import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/logic.js";
import { puzzleHTML } from "../src/ui/puzzle.js";
test("armor preserves existing hints and never reveals an unhinted cell", () => {
  const g = new Game(81);
  const h = g.player;
  const victim = g.heroes.find((u) => u.team !== h.team);
  const t = victim.hp;
  const p = g.puzzle(h, t);
  p.hints.fill(0);
  p.hints[0] = p.solution[0];
  const before = g.hints(h, t);
  t.armor[h.team][0] = 180;
  t.armor[h.team][1] = 180;
  assert.deepEqual(g.hints(h, t), before);
  const html = puzzleHTML(g, t, h, {
    spy: false,
    selected: null,
    notes: false,
    skill: null,
  });
  assert.equal((html.match(/class="guide-digit"/g) || []).length, 1);
  assert.ok(html.includes("armored"));
});
