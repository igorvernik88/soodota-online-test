import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { Game } from "../src/logic.js";
import { itemSlotsHTML } from "../src/ui/hud.js";
test("four backpack slots use shop WebP icons and stack consumables", () => {
  const g = new Game();
  const w = new Window();
  w.document.body.innerHTML = itemSlotsHTML(g);
  assert.equal(w.document.querySelectorAll(".action-slot").length, 4);
  g.player.consumables.ward = 2;
  g.player.consumables.miniInk = 3;
  w.document.body.innerHTML = itemSlotsHTML(g);
  assert.equal(w.document.querySelectorAll(".action-slot").length, 4);
  assert.equal(
    w.document.querySelector('[data-use="ward"] b').textContent,
    "2",
  );
  assert.match(w.document.querySelector("img").src, /ward.webp$/);
  w.happyDOM.abort();
});
test("inventory limit counts pending deliveries but allows stacking and permanent gear", () => {
  const g = new Game();
  g.start();
  const h = g.player;
  h.gold = 9999;
  h.x = 1000;
  h.y = 1000;
  for (const id of ["ward", "miniInk", "veil", "lasso"])
    assert.ok(g.buy(h, id).ok, id);
  const gold = h.gold;
  assert.equal(g.buy(h, "invert").ok, false);
  assert.equal(h.gold, gold);
  assert.ok(g.buy(h, "miniInk").ok);
  assert.ok(g.buy(h, "quill1").ok);
  assert.equal(g.inventoryItems(h).size, 4);
  assert.equal(h.consumables.miniInk, 0);
  assert.ok(g.pendingOrders(h).length >= 4);
});
