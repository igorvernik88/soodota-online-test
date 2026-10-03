import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/logic.js";
import {
  HERO_ANIMATION_MANIFEST,
  heroAnimationFiles,
} from "../src/animations/manifest.js";
test("chat filters team messages, rejects empty input and bounds history", () => {
  const g = new Game(23);
  const h = g.player;
  assert.equal(g.chat.send(h, "   "), false);
  g.chat.send(h, "<script>test</script>", "team");
  g.chat.send(h, "hello", "all");
  assert.equal(g.chat.visible(h.team).length, 2);
  assert.equal(g.chat.visible(1 - h.team).length, 1);
  for (let i = 0; i < 100; i++) g.chat.system(String(i));
  assert.equal(g.chat.messages.length, 80);
});
test("all protective box ranks reduce pen cooldown until expiration", () => {
  const g = new Game(23, { role: "combinator" });
  g.start();
  const h = g.player,
    ally = g.heroes.find((u) => u.team === h.team && u !== h);
  g.vision.visible = () => true;
  Object.assign(ally, { x: h.x, y: h.y });
  for (let rank = 1; rank <= 3; rank++) {
    h.skillRanks.box = rank;
    h.heroSkillAt = 0;
    const normal = g.cooldown(ally, { kind: "tower" });
    assert.equal(g.heroEffects.box(h, ally).ok, true);
    assert.ok(
      Math.abs(
        g.cooldown(ally, { kind: "tower" }) -
          normal * (1 - [0.15, 0.25, 0.35][rank - 1]),
      ) < 1e-9,
    );
    g.time = ally.boxProtection.until;
    assert.equal(g.cooldown(ally, { kind: "tower" }), normal);
  }
});
test("Fresh Sudoku loops and all enumerated runtime sprites use WebP", () => {
  assert.notEqual(HERO_ANIMATION_MANIFEST.sudzh.freshSudoku.loop, false);
  assert.ok(heroAnimationFiles().every((f) => f.endsWith(".webp")));
  assert.ok(heroAnimationFiles().includes("base-green.webp"));
});
