import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/logic.js";
import { runeDeductible } from "../src/rune-binding.js";
import { puzzleHTML } from "../src/ui/puzzle.js";

function fixture(size, level) {
  const g = new Game(42, { role: "intellect" });
  g.start();
  const h = g.player;
  h.skillRanks.rune = level;
  g.combat.newHealth(h, size);
  const t = h.hp,
    team = 1 - h.team,
    p = t.puzzles[team];
  // Visible clues provide a reproducible logically solvable defence.
  p.hints = p.solution.slice();
  const enemies = g.heroes.filter((u) => u.team === team).slice(0, 2);
  for (const e of enemies) {
    e.x = h.x;
    e.y = h.y;
    e.dead = false;
    e.digits = 100;
  }
  g.vision.visible = () => true;
  return { g, h, t, team, p, enemies };
}
for (const size of [4, 6])
  for (const level of [1, 2, 3]) {
    test(`rune rank ${level} on ${size}x${size}: shared keys, protected Z, universal moves, expiry`, () => {
      const { g, h, t, team, p, enemies } = fixture(size, level);
      const before = [...p.hints],
        digits = h.digits;
      assert.ok(g.runes.cast(h).ok);
      assert.equal(h.digits, digits);
      const e = g.runes.active(t);
      assert.equal(e.keys.length, level + 1);
      assert.equal(
        e.sum,
        e.keys.reduce((sum, i) => sum + p.solution[i], 0),
      );
      assert.ok(!e.keys.includes(e.z));
      if (level === 3) {
        const [a, b] = e.keys.slice(2);
        assert.ok(
          Math.abs(a - b) === size ||
            (Math.floor(a / size) === Math.floor(b / size) &&
              Math.abs(a - b) === 1),
        );
      }
      const visible = t.boards[team].map(
        (v, i) => v || (e.keys.includes(i) ? 0 : p.hints[i]),
      );
      assert.ok(runeDeductible(visible, p.rules, e.keys, e.sum));
      assert.ok(
        g.hints(enemies[0], t).every((hint) => !e.keys.includes(hint.index)),
      );
      const markup = puzzleHTML(g, t, enemies[0], { spy: false, selected: -1 });
      assert.match(markup, /rune-status/);
      assert.match(markup, /rune-active/);
      assert.match(markup, /--rune-remaining:100%/);
      assert.doesNotMatch(markup, /\d+ с · Z/);
      assert.match(markup, /rune-sealed/);
      const cd = h.runeAt;
      assert.ok(!g.runes.cast(h).ok);
      assert.equal(h.runeAt, cd);
      assert.ok(!g.place(enemies[0], t, e.z, p.solution[e.z], "universal").ok);
      for (const [k, i] of e.keys.entries()) {
        assert.ok(g.place(enemies[k % 2], t, i, p.solution[i], "universal").ok);
        if (k < e.keys.length - 1) assert.ok(g.runes.active(t));
      }
      assert.equal(g.runes.active(t), null);
      assert.deepEqual(p.hints, before);
      assert.ok(g.place(enemies[0], t, e.z, p.solution[e.z], "universal").ok);
    });
  }
test("expiry restores hidden clues without altering progress or notes; no cells wastes no cooldown", () => {
  const { g, h, t, team, p, enemies } = fixture(6, 3);
  assert.ok(g.runes.cast(h).ok);
  const e = g.runes.active(t),
    i = e.keys[0];
  assert.ok(g.place(enemies[0], t, i, p.solution[i], "universal").ok);
  enemies[0].notes[`${t.id}:0:${e.z}`] = [1, 2];
  g.time = e.until;
  assert.equal(g.runes.active(t), null);
  assert.equal(t.boards[team][i], p.solution[i]);
  assert.deepEqual(enemies[0].notes[`${t.id}:0:${e.z}`], [1, 2]);
  h.runeAt = 0;
  p.hints.fill(0);
  assert.ok(!g.runes.cast(h).ok);
  assert.equal(h.runeAt, 0);
});
test("rune upgrades cap at three and cost 6/8/10; selection is seeded", () => {
  const a = fixture(4, 1),
    b = fixture(4, 1);
  a.h.skillRanks.rune = 0;
  a.h.digits = 30;
  for (const remaining of [24, 16, 6]) {
    assert.ok(a.g.progression.upgrade(a.h, "rune").ok);
    assert.equal(a.h.digits, remaining);
  }
  assert.ok(!a.g.progression.upgrade(a.h, "rune").ok);
  a.h.skillRanks.rune = 1;
  assert.ok(a.g.runes.cast(a.h).ok);
  assert.ok(b.g.runes.cast(b.h).ok);
  assert.deepEqual(a.g.runes.active(a.t).keys, b.g.runes.active(b.t).keys);
});

test("automatic damage ignores the seal and solved keys never reseal after regeneration", () => {
  const { g, h, t, team, p, enemies } = fixture(4, 1);
  assert.ok(g.runes.cast(h).ok);
  const e = g.runes.active(t);
  // Force automatic damage to select Z in its list of free cells.
  g.random = () => (e.z + 0.1) / t.boards[team].length;
  g.combat.damage(enemies[0], t, 1);
  assert.equal(t.boards[team][e.z], p.solution[e.z]);
  for (const i of e.keys) g.combat.hit(enemies[0], t, i, p.solution[i]);
  assert.equal(g.runes.active(t), null);
  t.boards[team][e.keys[0]] = 0;
  assert.equal(g.runes.active(t), null);
});
test("rune belongs to the chosen unfinished health page, not the neighbouring page", () => {
  const { g, h, team } = fixture(6, 3);
  g.combat.newHealth(h, 9);
  const t = h.hp;
  for (const page of t.pages)
    page.puzzles[team].hints = page.puzzles[team].solution.slice();
  g.selectPage(t, 1);
  assert.ok(g.runes.cast(h).ok);
  assert.equal(t.pages[0].runeBinding, undefined);
  assert.ok(t.pages[1].runeBinding);
  g.selectPage(t, 0);
  assert.equal(g.runes.active(t), null);
  h.runeAt = 0;
  assert.ok(!g.runes.cast(h).ok);
  g.selectPage(t, 1);
  assert.ok(g.runes.active(t));
});
test("a sum with no logical deduction is rejected", () => {
  const { p } = fixture(4, 1);
  assert.equal(runeDeductible(Array(16).fill(0), p.rules, [0, 1], 3), false);
});
