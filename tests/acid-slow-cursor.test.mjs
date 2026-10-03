import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { Game, CONFIG } from "../src/logic.js";
import { updateCursorPen } from "../src/ui/hud.js";
import { heroAnimationFiles } from "../src/animations/manifest.js";
test("Shustrik slows every visible enemy in range and leaves allies and distant enemies unchanged", () => {
  const g = new Game(91, { role: "agile" });
  g.start();
  const h = g.player;
  h.skillRanks.slow = 1;
  g.vision.visible = () => true;
  const enemies = g.heroes.filter((u) => u.team !== h.team);
  enemies.forEach((u, i) =>
    Object.assign(u, {
      x: h.x + (i < 2 ? 20 : CONFIG.effectRadius + 10),
      y: h.y,
    }),
  );
  assert.ok(g.heroSkill(h).ok);
  assert.ok(enemies[0].speedEffect.multiplier < 1);
  assert.ok(enemies[1].speedEffect.multiplier < 1);
  assert.ok(!enemies[2].speedEffect);
  assert.ok(
    g.heroes.filter((u) => u.team === h.team).every((u) => !u.speedEffect),
  );
});
test("broken pencil cursor is removed when its effect expires", () => {
  const w = new Window(),
    previous = globalThis.document;
  globalThis.document = w.document;
  try {
    document.body.innerHTML = '<div id="cursorPen" data-visible="true"></div>';
    const g = new Game();
    g.start();
    g.player.pencilBrokenAt = 0;
    g.player.pencilBrokenUntil = 2;
    updateCursorPen(g, false);
    assert.ok(document.querySelector(".broken-pencil-cursor"));
    g.time = 2;
    updateCursorPen(g, false);
    assert.equal(document.querySelector(".broken-pencil-cursor"), null);
    assert.ok(document.getElementById("cursorPen").hidden);
  } finally {
    globalThis.document = previous;
    w.happyDOM.abort();
  }
});
test("acid pool WebP is included in the standalone asset list", () => {
  assert.ok(heroAnimationFiles().includes("acid-pool.webp"));
});
