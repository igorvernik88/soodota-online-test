import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { Game } from "../src/logic.js";
import { puzzleHTML } from "../src/ui/puzzle.js";
import { showItemDescription } from "../src/ui/item-description.js";
function setup(size = 4) {
  const g = new Game(42, { role: "agile" });
  g.start();
  const h = g.player,
    a = g.heroes.find((u) => u.team !== h.team),
    b = g.heroes.find((u) => u.team !== h.team && u !== a);
  for (const u of [h, a, b]) {
    u.x = 1000;
    u.y = 1000;
  }
  g.vision.visible = () => true;
  g.combat.newHealth(h, size);
  h.skillRanks.dust = 1;
  return { g, h, a, b };
}
for (const size of [4, 6, 9])
  test(`dust hides only information, independent windows and pages size ${size}`, () => {
    const { g, h, a, b } = setup(size);
    const original = g.board(a, h.hp).slice();
    h.target = { x: 1400, y: 1000 };
    assert.ok(g.dust.cast(h).ok);
    assert.deepEqual(h.target, { x: 1400, y: 1000 });
    for (let page = 0; page < (h.hp.pages?.length || 1); page++) {
      g.selectPage(h.hp, page);
      const n = g.puzzle(a, h.hp).rules.size;
      g.dust.select(a, h.hp, n + 1);
      g.dust.select(b, h.hp, n * n - 1);
      assert.ok(g.dust.readable(a, h.hp, 0));
      assert.equal(g.dust.readable(a, h.hp, n * n - 1), false);
      assert.ok(g.dust.readable(b, h.hp, n * n - 1));
      assert.equal(g.dust.readable(b, h.hp, 0), false);
      const html = puzzleHTML(g, h.hp, a, { selected: n + 1, notes: true });
      const w = new Window();
      w.document.body.innerHTML = html;
      const cell = w.document.querySelector(`[data-cell="${n * n - 1}"]`);
      assert.equal(cell.textContent, "");
      assert.match(cell.getAttribute("aria-label"), /скрыто пылью/);
      assert.equal(cell.getAttribute("title"), null);
      const index = g
        .board(a, h.hp)
        .findIndex((v, i) => !v && !g.dust.readable(a, h.hp, i));
      if (index >= 0) {
        a.nextNormal = 0;
        assert.ok(
          g.place(a, h.hp, index, g.puzzle(a, h.hp).solution[index], "pen").ok,
        );
      }
      w.happyDOM.abort();
    }
    g.time = h.dustUntil;
    assert.equal(g.dust.active(a, h.hp), false);
    assert.equal(g.dust.readable(a, h.hp, 0), true);
    assert.equal(g.dust.cast(h).ok, false);
    g.time = h.dustAt;
    assert.ok(g.dust.cast(h).ok);
  });
for (let rank = 1; rank <= 4; rank++)
  test(`dust rank ${rank} has normal costs, duration and cooldown`, () => {
    const { g, h } = setup();
    h.skillRanks.dust = rank;
    assert.ok(g.dust.cast(h).ok);
    assert.equal(h.dustUntil - g.time, [10, 12, 14, 16][rank - 1]);
    assert.equal(h.dustAt - g.time, [60, 55, 50, 45][rank - 1]);
  });
test("bots scan, remember only inspected cells and continue solving", () => {
  const { g, h, a } = setup(6);
  g.dust.cast(h);
  for (let step = 0; step < 36; step++) {
    g.time = step * 0.1;
    const move = g.botMove(a, h.hp);
    if (move) {
      a.nextNormal = 0;
      assert.ok(g.place(a, h.hp, move.index, move.value, "pen").ok);
    }
  }
  const state = g.dust.window(a, h.hp);
  assert.ok(state.center > 1);
  assert.ok(state.memory.some((v) => v));
  assert.ok(state.memory.filter((v) => v).length < 36);
});
test("ally and enemy box expire after the same duration at every rank", () => {
  const g = new Game(42, { role: "combinator" });
  g.start();
  const h = g.player,
    ally = g.heroes[1],
    enemy = g.heroes.find((u) => u.team !== h.team);
  g.vision.visible = () => true;
  for (const target of [ally, enemy]) {
    target.x = h.x;
    target.y = h.y;
  }
  for (let rank = 1; rank <= 3; rank++) {
    h.skillRanks.box = rank;
    h.heroSkillAt = 0;
    assert.ok(g.heroEffects.box(h, ally).ok);
    const until = ally.boxProtection.until;
    h.heroSkillAt = 0;
    assert.ok(g.heroEffects.box(h, enemy).ok);
    assert.equal(enemy.prison.until, until);
    g.time = until;
    g.heroEffects.tick();
    assert.equal(g.heroEffects.protected(ally), false);
    assert.equal(g.heroEffects.trapped(enemy), false);
    enemy.prison = null;
  }
});
test("Alt item description includes price and effect without guide", () => {
  const w = new Window();
  globalThis.document = w.document;
  try {
    document.body.innerHTML = '<aside id="panel" class="shop-panel"></aside>';
    document.querySelector("#panel").getBoundingClientRect = () => ({
      right: 431,
      height: 600,
      top: 76,
    });
    showItemDescription("ward");
    const d = document.querySelector("#itemDescription");
    assert.equal(d.tagName, "ASIDE");
    assert.equal(d.hidden, false);
    assert.equal(d.style.left, "443px");
    assert.equal(d.style.top, "376px");
    assert.match(d.textContent, /Бесплатно/);
    assert.doesNotMatch(d.textContent, /Item Guide/);
    showItemDescription("eraserTool");
    assert.match(d.textContent, /Ластик/);
  } finally {
    delete globalThis.document;
    w.happyDOM.abort();
  }
});
