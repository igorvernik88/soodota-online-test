import test from "node:test";
import assert from "node:assert/strict";
import { Game, BASES, CONFIG, HEROES } from "../src/logic.js";
import { SKILLS, ITEMS, ERASER } from "../src/config.js";
import { puzzleHTML } from "../src/ui/puzzle.js";
import { Window } from "happy-dom";
function setup(role = "editor", size = 4) {
  const g = new Game(42, { role });
  g.start();
  g.bot = () => {};
  g.combat.tick = () => {};
  g.vision.visible = () => true;
  const h = g.player,
    e = g.heroes.find((u) => u.team !== h.team),
    a = g.heroes[1];
  for (const u of [h, e, a]) {
    u.x = 1000;
    u.y = 1000;
    u.gold = 10000;
    u.digits = 99;
  }
  g.combat.newHealth(a, size);
  return { g, h, e, a };
}
test("seeded five versus five roster includes chosen player and no duplicate roles", () => {
  for (const r of HEROES) {
    const g = new Game(42, { role: r.id }),
      b = new Game(42, { role: r.id });
    assert.equal(g.heroes.length, 10);
    assert.equal(g.player.role, r.id);
    for (const team of [0, 1]) {
      const hs = g.heroes.filter((h) => h.team === team);
      assert.equal(hs.length, 5);
      assert.equal(new Set(hs.map((h) => h.role)).size, 5);
    }
    assert.deepEqual(
      g.heroes.map((h) => h.role),
      b.heroes.map((h) => h.role),
    );
  }
});
test("editor pen and universal inputs work across ordinary target types", () => {
  const { g, h, e } = setup();
  for (const t of [
    e.hp,
    g.combat.creeps.find((c) => c.team !== h.team).hp,
    g.camps[0],
    g.nextTower(0, h.team),
  ]) {
    h.x = (t.unit || t).x;
    h.y = (t.unit || t).y;
    if (t.kind === "tower") t.backdoorArmor = 0;
    const i = g.board(h, t).findIndex((v) => !v);
    h.nextNormal = 0;
    const before = h.gold;
    assert.ok(g.place(h, t, i, g.puzzle(h, t).solution[i], "pen").ok, t.kind);
    assert.equal(h.gold, before + 3);
    const j = g.board(h, t).findIndex((v) => !v);
    h.nextNormal = g.time + 100;
    assert.ok(
      g.place(h, t, j, g.puzzle(h, t).solution[j], "universal").ok,
      t.kind,
    );
  }
});
test("courier handles queued orders without an editor, skips dead recipient and keeps reservations", () => {
  const { g, h, a } = setup("agile");
  g.heroes = g.heroes.filter((u) => u.role !== "editor");
  assert.ok(g.buy(h, "quill1").ok);
  assert.ok(g.buy(a, "miniInk").ok);
  h.dead = true;
  for (let i = 0; i < 100; i++) g.tickCourier(g.couriers[0], 1);
  assert.equal(a.consumables.miniInk, 1);
  assert.equal(h.hasteTier, 0);
  assert.equal(g.pendingOrders(h).length, 1);
  h.dead = false;
  for (let i = 0; i < 100; i++) g.tickCourier(g.couriers[0], 1);
  assert.equal(h.hasteTier, 1);
  assert.equal(g.pendingOrders(h).length, 0);
});
test("inspection uses actual enemy board and never switches the active combat page", () => {
  const { g, h, a } = setup("editor", 9);
  for (const viewer of g.heroes) {
    const ally = g.heroes.find((u) => u.team === viewer.team);
    assert.ok(g.canSpy(viewer, ally.hp));
    assert.ok(
      g.canSpy(
        viewer,
        g.towers.find((t) => t.defender === viewer.team),
      ),
    );
  }
  a.hp.pages[1].boards[1 - h.team][2] = 3;
  const t = g.inspectionTarget(a.hp, 1);
  assert.equal(a.hp.activePage, 0);
  assert.equal(t.boards[1 - h.team][2], 3);
  assert.equal(g.canSpy(h, g.camps[0]), false);
});
test("selected editor erasure restores HP, clears metadata and protects completed pages/range", () => {
  const { g, h, a } = setup("editor", 9);
  h.skillRanks.erase = 1;
  const t = g.inspectionTarget(a.hp, 1),
    team = 1 - h.team;
  t.boards[team][1] = t.puzzles[team].solution[1];
  t.burning[team][1] = { until: 10 };
  const before = g.combat.hpLeft(a);
  assert.ok(g.editorAction(h, "erase", t, 1).ok);
  assert.equal(g.combat.hpLeft(a), before + 1);
  assert.equal(t.burning[team][1], undefined);
  assert.equal(h.eraserAt, 15);
  h.eraserAt = 0;
  t.completed[team] = true;
  t.boards[team][2] = 1;
  assert.equal(g.editorAction(h, "erase", t, 2).ok, false);
  assert.equal(h.eraserAt, 0);
  const tower = g.towers.find((t) => t.defender === h.team);
  h.x = tower.x;
  h.y = tower.y;
  tower.boards[team][0] = tower.puzzles[team].solution[0];
  assert.ok(g.editorAction(h, "erase", tower, 0).ok);
});
for (const rank of [1, 2, 3])
  for (const size of [4, 6, 9])
    test(`ink binding rank ${rank} health ${size}: windows, automatic damage, expiry and repeat`, () => {
      const { g, h, e, a } = setup("editor", size);
      h.skillRanks.inkBinding = rank;
      assert.ok(g.inkBinding.cast(h, a).ok);
      assert.equal(g.inkBinding.cast(h, a).ok, false);
      const until = a.inkBinding.until;
      for (let p = 0; p < (a.hp.pages?.length || 1); p++) {
        g.selectPage(a.hp, p);
        let t = a.hp;
        let hint = g.inkBinding.hint(e, t),
          blocked = g.inkBinding.blocked(e, t);
        assert.ok(hint);
        assert.ok(blocked.length >= t.boards[e.team].length - 3);
        assert.equal(blocked.includes(hint.index), false);
        e.nextNormal = 0;
        assert.ok(g.place(e, t, hint.index, hint.value, "pen").ok);
        hint = g.inkBinding.hint(e, t);
        assert.ok(hint);
        const closed = g.inkBinding.blocked(e, t)[0];
        e.nextNormal = 0;
        assert.equal(
          g.place(e, t, closed, g.puzzle(e, t).solution[closed], "universal")
            .ok,
          false,
        );
        const digits = e.digits;
        assert.ok(g.place(e, t, hint.index, hint.value, "universal").ok);
        assert.equal(e.digits, digits - 1);
        const before = g.combat.hpLeft(a);
        g.combat.damage(e, t, 1);
        assert.equal(g.combat.hpLeft(a), before - 1);
        assert.ok(g.inkBinding.hint(e, t));
        const w = new Window();
        w.document.body.innerHTML = puzzleHTML(g, t, e, {
          selected: -1,
          notes: true,
        });
        const hidden = g.inkBinding.blocked(e, t)[0];
        assert.equal(
          w.document.querySelector(`[data-cell="${hidden}"]`).textContent,
          "",
        );
        w.happyDOM.abort();
      }
      g.time = until;
      assert.equal(g.inkBinding.active(a.hp), null);
      assert.equal(g.inkBinding.blocked(e, a.hp).length, 0);
      g.time = h.inkBindingAt;
      assert.ok(g.inkBinding.cast(h, a).ok);
    });
test("ink failure spends nothing when no eligible keys and death does not carry it to new HP", () => {
  const { g, h, a } = setup();
  h.skillRanks.inkBinding = 1;
  const team = 1 - h.team;
  for (let i = 0; i < 16; i++) a.hp.stones[team][i] = {};
  assert.equal(g.inkBinding.cast(h, a).ok, false);
  assert.equal(h.inkBindingAt, undefined);
  a.hp.stones[team] = {};
  assert.ok(g.inkBinding.cast(h, a).ok);
  g.combat.newHealth(a, 4);
  assert.equal(g.inkBinding.active(a.hp), null);
});
test("stone team stock, paid consumption and shovel removal share page rules", () => {
  const { g, h, a, e } = setup();
  const t = g.towers.find((t) => t.defender === h.team);
  Object.assign(h, { x: t.x, y: t.y });
  assert.ok(g.buy(h, "stone").ok);
  for (let i = 0; i < 100 && !h.consumables.stone; i++)
    g.tickCourier(g.couriers[h.team], 1);
  assert.equal(g.buy(a, "stone").ok, false);
  assert.equal(g.stoneReadyAt[h.team], g.time + 180);
  assert.ok(g.fieldItem(h, "stone", t, 0).ok);
  assert.equal(h.consumables.stone, 0);
  e.x = t.x;
  e.y = t.y;
  e.consumables.shovel = 1;
  assert.ok(g.requestShovel(e, t, 0).ok);
  assert.equal(e.consumables.shovel, 0);
  assert.equal(t.stones[e.team][0], undefined);
  g.time = 180;
  assert.ok(g.buy(a, "stone").ok);
  assert.equal(ITEMS.find((i) => i.id === "stone").price, ERASER.price);
});
test("editor bot follows common combat pipeline", () => {
  const { g, h, e } = setup();
  const bot = g.heroes.find((u) => u.role === "editor" && u.id !== 0);
  assert.ok(bot);
  g.bot = Game.prototype.bot;
  g.flower = null;
  bot.x = e.x;
  bot.y = e.y;
  g.time = 50;
  let calls = 0;
  g.combat.botCombat = (unit) => {
    if (unit === bot) calls++;
    return true;
  };
  g.bot(bot);
  assert.equal(calls, 1);
});
