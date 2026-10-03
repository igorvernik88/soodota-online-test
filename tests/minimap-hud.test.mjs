import test from "node:test";
import assert from "node:assert/strict";
import { Game, CONFIG } from "../src/logic.js";
import { itemSlotsHTML } from "../src/ui/hud.js";
import { skillDetails } from "../src/ui/skill-details.js";
import {
  HERO_ANIMATION_MANIFEST,
  heroAnimationFiles,
} from "../src/animations/manifest.js";
test("four inventory slots use X C V B including the eraser tool", () => {
  const g = new Game(83);
  Object.assign(g.player.consumables, { ward: 1, stone: 1, shovel: 1 });
  g.player.eraserTool = { digitReadyAt: 0, wardReadyAt: 0 };
  const html = itemSlotsHTML(g);
  assert.deepEqual(
    [...html.matchAll(/<kbd>(.*?)<\/kbd>/g)].map((m) => m[1]),
    ["X", "C", "V", "B"],
  );
});
test("skill tooltip explains mechanics and shows every rank with current highlight", () => {
  const html = skillDetails("hook", 2, "", "Q");
  assert.match(html, /Герой или крип/);
  assert.match(html, />700/);
  assert.match(html, />1000/);
  assert.match(html, /current-rank/);
  assert.doesNotMatch(html, /Прокачка|применение бесплатно/);
});
test("updated editor action assets use uniform 512-pixel frames and WebP", () => {
  for (const name of [
    "attack",
    "solving",
    "runningAttack",
    "inkCast",
    "stun",
    "death",
  ]) {
    const a = HERO_ANIMATION_MANIFEST.editor[name];
    assert.equal(a.sourceFrameWidth, 512);
    assert.equal(a.sourceAssetWidth, 3072);
    assert.ok(heroAnimationFiles().includes(a.file));
    assert.ok(a.file.endsWith(".webp"));
  }
});
test("seeded enemy picks differ across seeds and spawn locations remain separate", () => {
  const a = new Game(82),
    b = new Game(93),
    c = new Game(82);
  const roles = (g) => g.heroes.filter((h) => h.team === 1).map((h) => h.role);
  assert.deepEqual(roles(a), roles(c));
  assert.notDeepEqual(roles(a), roles(b));
  assert.equal(new Set(roles(a)).size, CONFIG.teamSize);
  for (const team of [0, 1]) {
    const heroes = a.heroes.filter((h) => h.team === team);
    for (let i = 0; i < heroes.length; i++)
      for (let j = i + 1; j < heroes.length; j++)
        assert.ok(
          Math.hypot(heroes[i].x - heroes[j].x, heroes[i].y - heroes[j].y) >=
            220,
        );
  }
});

test("minimap uses a square projection with reversible coordinates", async () => {
  const { Renderer } = await import("../src/render.js");
  const r = Object.create(Renderer.prototype);
  assert.deepEqual(r.miniProject(0, 0), { x: 8, y: 8 });
  assert.deepEqual(r.miniProject(CONFIG.worldSize, CONFIG.worldSize), {
    x: 248,
    y: 248,
  });
  const p = r.miniProject(1000, 3000),
    w = r.miniUnproject(p.x, p.y);
  assert.ok(Math.abs(w.x - 1000) < 1e-9 && Math.abs(w.y - 3000) < 1e-9);
});
