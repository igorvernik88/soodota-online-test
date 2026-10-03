import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/logic.js";
import { ITEMS } from "../src/config.js";
for (const [id, interval, count] of [
  ["sharpener", 6, 3],
  ["sharpener2", 1, 10],
]) {
  test(`${id} heals exact number and restocks personally`, () => {
    const g = new Game(81, { role: "intellect" });
    g.start();
    g.sandbox = true;
    g.combat.structureTick = () => {};
    const h = g.player,
      enemy = g.heroes.find((u) => u.team !== h.team),
      item = ITEMS.find((i) => i.id === id),
      board = h.hp.boards[1 - h.team];
    for (let i = 0; i < 12; i++)
      board[i] = h.hp.puzzles[1 - h.team].solution[i];
    h.consumables[id] = 1;
    h.regenAt = 10000;
    assert.ok(g.useItem(h, id).ok);
    for (let i = 1; i <= count; i++) {
      g.time = i * interval;
      h.regenAt = 10000;
      g.combat.tick(0);
    }
    assert.equal(board.filter(Boolean).length, 12 - count);
    h.consumables[id] = 1;
    assert.ok(g.useItem(h, id).ok);
    g.combat.hit(enemy, h.hp, 15, h.hp.puzzles[enemy.team].solution[15]);
    assert.equal(h.itemHealing.length, id === "sharpener2" ? 0 : 1);
    const stock = g.itemStock(h, item);
    stock.available = 0;
    stock.nextAt = g.time + item.restock;
    g.time += item.restock;
    assert.equal(g.itemStock(h, item).available, 1);
  });
}
test("chat records message age without deleting history", () => {
  const g = new Game(81);
  g.chat.send(g.player, "hello");
  g.time = 20;
  assert.equal(g.chat.visible(g.player.team)[0].at, 0);
});
