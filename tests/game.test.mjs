import test from "node:test";
import assert from "node:assert/strict";
import {
  Game,
  CONFIG,
  HEROES,
  BASES,
  seeded,
  countSolutions,
  dist,
} from "../src/logic.js";
const template = new Game(42);
function setup(role = "intellect") {
  const g = new Game(42);
  g.combat.tick = () => {};
  g.random = seeded(42);
  g.chooseHero(role);
  g.start();
  g.bot = () => {};
  // Effect regression fixtures use rank 2; progression tests cover locked starts.
  for (const hero of g.heroes)
    for (const id of Object.keys(hero.skillRanks)) hero.skillRanks[id] = 2;
  for (const tower of g.towers) tower.backdoorArmor = 0;
  for (const h of g.heroes) h.autoDeliver = false;
  const h = g.player,
    t = g.nextTower(0, 0);
  move(h, t);
  return { g, h, t };
}
function move(h, t) {
  h.x = t.x;
  h.y = t.y;
  h.target = null;
}
function next(g, h, t) {
  const p = g.puzzle(h, t),
    index = g.board(h, t).findIndex((v, i) => !v && !t.stones[h.team][i]);
  return {
    index,
    value: p.solution[index],
    display: gameDigit(g, t, h, p.solution[index]),
  };
}
function gameDigit(g, t, h, v) {
  return g.displayDigit(t, h.team, v);
}
function finish(g, h, t) {
  move(h, t);
  const p = g.puzzle(h, t),
    b = g.board(h, t);
  for (let i = 0; i < b.length; i++)
    if (!t.holes[h.team].includes(i)) b[i] = p.solution[i];
  return g.complete(h, t);
}
function editorFixture(g, team) {
  const existing = g.editor(team);
  if (existing) return existing;
  const hero = g.heroes.find((h) => h.team === team && h !== g.player);
  hero.role = "editor";
  g.progression.initialize(hero);
  for (const id of Object.keys(hero.skillRanks)) hero.skillRanks[id] = 2;
  return hero;
}
function close(a, b) {
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
}

test("seven hero choices produce five distinct roles per team and two shared planes", () => {
  for (const role of HEROES.map((r) => r.id)) {
    const { g, h } = setup(role);
    assert.equal(h.role, role);
    assert.equal(g.heroes.length, 10);
    assert.equal(g.couriers.length, 2);
    for (const team of [0, 1]) {
      assert.equal(
        new Set(g.heroes.filter((h) => h.team === team).map((h) => h.role))
          .size,
        5,
      );
      assert.ok(
        g.heroes
          .filter((h) => h.team === team)
          .every((h) => h.courier === g.couriers[team]),
      );
      const sudaks = g.heroes.find(
        (hero) => hero.team === team && hero.role === "sudaks",
      );
      if (sudaks) assert.equal(sudaks.preferred, 0);
    }
    assert.equal(g.chooseHero("strong"), false);
  }
});
test("5250 world keeps eight camps and mirrored T3 towers just before each base", () => {
  const { g } = setup();
  assert.equal(CONFIG.worldSize, 5250);
  assert.equal(CONFIG.moveSpeed, 216);
  assert.equal(g.camps.length, 8);
  assert.equal(g.towers.length, 18);
  assert.equal(g.cores.length, 2);
  for (const team of [0, 1])
    for (let lane = 0; lane < 3; lane++) {
      const towers = g.attackTowers(lane, team);
      assert.equal(towers.length, 3);
      assert.ok(dist(towers[2], BASES[1 - team]) < 562.5);
      assert.ok(
        dist(towers[2], BASES[1 - team]) < dist(towers[1], BASES[1 - team]),
      );
    }
});
test("all prepared fields, including sparse bases, retain a unique solution", () => {
  for (const t of template.locations) {
    assert.equal(
      countSolutions(
        t.puzzles[0].hints || t.puzzles[0].givens,
        t.puzzles[0].rules,
      ),
      1,
      t.id,
    );
  }
  for (const c of template.cores)
    assert.ok(c.puzzles[0].givens.filter(Boolean).length <= 28);
});
test("personal digits cannot be purchased or queued for delivery", () => {
  const { g, h } = setup();
  h.gold = 1000;
  assert.equal(g.buy(h, "universal").ok, false);
  assert.equal(g.buy(h, 1).ok, false);
  assert.equal(h.digits, 3);
  assert.equal(g.pendingOrders(h).length, 0);
  g.progression.add(h, 100, "reward");
  g.combat.upgradeHealth(h, 9);
  assert.equal(h.digits, 103);
});
test("universal digit is explicit and works during pen cooldown", () => {
  const { g, h, t } = setup();
  const m = next(g, h, t);
  h.digits = 1;
  h.nextNormal = 20;
  assert.equal(g.place(h, t, m.index, m.value).ok, false);
  assert.ok(g.place(h, t, m.index, 1, "universal").ok);
  assert.equal(h.digits, 0);
  assert.equal(h.nextNormal, 20);
  assert.equal(h.gold, 100);
  assert.equal(h.cardCount, 1);
  assert.equal(g.place(h, t, m.index, m.value).ok, false);
});
test("default input uses pen; forest reduces its timer by 1.5", () => {
  const { g, h, t } = setup();
  let m = next(g, h, t);
  assert.ok(g.place(h, t, m.index, m.value).ok);
  assert.equal(h.nextNormal, 1.5);
  assert.equal(h.gold, 103);
  const c = g.camps[0];
  move(h, c);
  m = next(g, h, c);
  assert.equal(g.place(h, c, m.index, m.value).ok, false);
  g.time = 10;
  assert.ok(g.place(h, c, m.index, m.value).ok);
  close(h.nextNormal - 10, 1.5 / 1.5);
  move(h, t);
  close(h.nextNormal - 10, 1.5 / 1.5);
});
test("red errors are shared by allies, lock the cell for two seconds, consume nothing", () => {
  const { g, h, t } = setup(),
    a = g.heroes[1],
    m = next(g, h, t),
    wrong = (m.value % 6) + 1;
  move(a, t);
  h.digits = 1;
  assert.equal(g.place(h, t, m.index, wrong).ok, false);
  assert.equal(t.errors[0][m.index].value, wrong);
  assert.equal(g.board(h, t)[m.index], 0);
  assert.equal(h.nextNormal, 0);
  assert.equal(h.digits, 1);
  a.digits = 1;
  assert.equal(g.place(a, t, m.index, m.value).ok, false);
  g.tick(1.99);
  assert.equal(g.place(a, t, m.index, m.value).ok, false);
  g.tick(0.02);
  assert.equal(t.errors[0][m.index], undefined);
  assert.ok(g.place(a, t, m.index, m.value).ok);
});
test("notes neither spend an instant digit nor trigger hero passives", () => {
  const { g, h, t } = setup(),
    m = next(g, h, t);
  h.digits = 1;
  h.nextNormal = 100;
  assert.ok(g.place(h, t, m.index, m.value, "note").ok);
  assert.equal(h.digits, 1);
  assert.equal(g.board(h, t)[m.index], 0);
  assert.equal(h.phantoms, null);
  assert.equal(h.nextNormal, 100);
});
test("agile combo permits immediate pen moves, shrinks by 10 ms and expires into cooldown", () => {
  const { g, h, t } = setup("agile");
  let m = next(g, h, t);
  g.place(h, t, m.index, m.value);
  close(h.comboUntil, 1.5);
  assert.ok(g.canPen(h));
  g.time = 1;
  m = next(g, h, t);
  g.place(h, t, m.index, m.value);
  assert.equal(h.comboCount, 1);
  close(h.comboUntil - g.time, 1.49);
  g.time = 2.5;
  assert.equal(g.canPen(h), false);
  g.time = h.nextNormal;
  assert.ok(g.canPen(h));
});
test("agile window has a floor and instant digits do not reset it", () => {
  const { g, h, t } = setup("agile");
  h.comboUntil = 1;
  h.comboCount = 500;
  let m = next(g, h, t);
  g.place(h, t, m.index, m.value);
  close(h.comboUntil, 0.35);
  const end = h.nextNormal;
  g.time = 0.1;
  m = next(g, h, t);
  h.digits = 1;
  g.place(h, t, m.index, m.value, "universal");
  close(h.comboUntil, 0.35);
  close(h.nextNormal, end);
});
test("intellect ghosts: 3 in 6×6, 2 in 4×4, exactly one correct and fade lifetime 5.5 s", () => {
  const { g, h, t } = setup();
  g.random = () => 0;
  for (const target of [t, g.camps[0]]) {
    move(h, target);
    h.nextNormal = g.time;
    const m = next(g, h, target);
    g.place(h, target, m.index, m.value);
    const ghosts = h.phantoms;
    assert.equal(ghosts.entries.length, target.kind === "camp" ? 2 : 3);
    assert.equal(
      ghosts.entries.filter(
        (e) => e.value === g.puzzle(h, target).solution[e.index],
      ).length,
      1,
    );
    assert.ok(ghosts.entries.every((e) => g.board(h, target)[e.index] === 0));
    close(ghosts.until - ghosts.at, 5.5);
    g.tick(5.51);
    assert.equal(h.phantoms, null);
  }
});
test("strong wrong input has a 50% branch producing one unknown but counted hole", () => {
  const { g, h, t } = setup("strong");
  g.random = () => 0;
  const m = next(g, h, t),
    r = g.place(h, t, m.index, (m.value % 6) + 1);
  assert.equal(r.ok, false);
  assert.ok(r.hole >= 0 && r.hole !== m.index);
  assert.equal(g.board(h, t)[r.hole], -1);
  assert.equal(g.visibleBoard(h, t)[r.hole], 0);
  assert.equal(t.holes[0].length, 1);
  assert.equal(g.progress(t, 0).filled, 1);
  assert.ok(finish(g, h, t));
});
test("strong failure of chance roll leaves no hole; hole cannot be entered or revealed", () => {
  const { g, h, t } = setup("strong");
  g.random = () => 0.99;
  const m = next(g, h, t);
  g.place(h, t, m.index, (m.value % 6) + 1);
  assert.equal(t.holes[0].length, 0);
  g.time = 2;
  g.random = () => 0;
  const r = g.place(h, t, m.index, (m.value % 6) + 1);
  g.time = 4;
  assert.equal(
    g.place(h, t, r.hole, g.puzzle(h, t).solution[r.hole]).ok,
    false,
  );
});
test("inspection belongs to all heroes and editor prices have no discount", () => {
  const { g, h, t } = setup("editor");
  assert.equal(g.discount(h), 0);
  assert.equal(g.itemPrice(h, "quill1"), 80);
  const ally = g.nextTower(0, 1);
  for (const u of g.heroes.filter((u) => u.team === h.team))
    assert.ok(g.canSpy(u, ally));
  assert.equal(g.canSpy(h, t), false);
});
test("editor erase cannot alter a clue, erases additions and obeys its own 10 s cooldown", () => {
  const { g, h } = setup("editor"),
    e = g.heroes[6],
    t = g.nextTower(0, 1),
    p = g.puzzle(e, t),
    i = p.givens.findIndex((v) => !v),
    given = p.givens.findIndex((v, j) => j !== i);
  move(h, t);
  t.boards[1][i] = p.solution[i];
  assert.equal(g.editorAction(h, "erase", t, given).ok, false);
  assert.ok(g.editorAction(h, "erase", t, i).ok);
  assert.equal(t.boards[1][i], 0);
  assert.equal(h.eraserAt, 10);
  t.boards[1][i] = p.solution[i];
  assert.equal(g.editorAction(h, "erase", t, i).ok, false);
  g.time = 10;
  assert.ok(g.editorAction(h, "erase", t, i).ok);
});
test("stone consumable blocks input until a nearby hero spends a shovel", () => {
  const { g, h } = setup("editor"),
    enemy = g.heroes.find((u) => u.team !== h.team),
    t = g.nextTower(0, 1);
  move(h, t);
  move(enemy, t);
  h.consumables.stone = 1;
  enemy.consumables.shovel = 1;
  enemy.digits = 1;
  const i = t.boards[enemy.team].findIndex((v) => !v),
    value = t.puzzles[enemy.team].solution[i];
  g.vision.visible = () => true;
  assert.ok(g.fieldItem(h, "stone", t, i).ok);
  assert.equal(g.place(enemy, t, i, value, "universal").ok, false);
  assert.ok(g.requestShovel(enemy, t, i).ok);
  assert.equal(enemy.consumables.shovel, 0);
  assert.ok(g.place(enemy, t, i, value, "universal").ok);
});
test("planes deliver paid equipment and never transport digits", () => {
  const { g, h } = setup();
  h.gold = 1000;
  assert.ok(g.buy(h, "quill2").ok);
  assert.equal(g.buy(h, 3).ok, false);
  for (let i = 0; i < 100 && h.hasteTier !== 2; i++)
    g.tickCourier(h.courier, 1);
  assert.equal(h.hasteTier, 2);
  assert.equal(g.pendingOrders(h).length, 0);
});
test("editor can buy for allies at the ordinary price but other roles cannot", () => {
  const { g, h } = setup("editor"),
    ally = g.heroes[1];
  ally.hasteTier = 0;
  g.depots[ally.team] = g.depots[ally.team].filter(
    (o) => o.recipient !== ally.id,
  );
  h.gold = 200;
  move(ally, g.camps[0]);
  assert.ok(g.buy(h, "quill1", ally).ok);
  assert.equal(h.gold, 120);
  assert.equal(g.pendingOrders(ally)[0].recipient, ally.id);
  assert.equal(g.buy(ally, "quill1", h).ok, false);
});
test("tower distance/order and one-time allied rewards remain enforced", () => {
  const { g, h, t } = setup();
  move(h, g.attackTowers(0, 0)[2]);
  assert.equal(g.interact(h, g.attackTowers(0, 0)[2]).ok, false);
  assert.equal(g.interact(h, t).ok, false);
  const gold = g.heroes.map((a) => a.gold);
  for (let page = 0; page < t.pages.length; page++) {
    g.selectPage(t, page);
    finish(g, h, t);
  }
  assert.deepEqual(
    g.heroes.slice(0, 5).map((a) => a.gold - gold[a.id]),
    [100, 100, 100, 100, 100],
  );
  assert.equal(g.complete(h, t), false);
});
test("random consumables stay on the hero line without requiring a target selector", () => {
  const { g, h } = setup();
  h.lastLane = 2;
  h.consumables.veil = 1;
  for (const t of g.enemyTargets(h)) {
    t.boards[1][0] = t.puzzles[1].solution[0];
  }
  g.random = () => 0.7;
  const r = g.useItem(h, "veil");
  assert.ok(r.ok);
  const t = g.getTarget(r.target);
  assert.equal(t.lane, 2);
  assert.equal(t.defender, 0);
  assert.ok(g.maskedIndices(t, 1).length);
  assert.equal(h.consumables.veil, 0);
});
test("inversion changes display and accepted input together, including automatic cards", () => {
  const { g, h } = setup(),
    enemy = g.heroes[6];
  h.lastLane = 0;
  h.consumables.invert = 1;
  g.random = () => 0;
  const r = g.useItem(h, "invert"),
    t = g.getTarget(r.target),
    p = g.puzzle(enemy, t),
    b = g.board(enemy, t);
  move(enemy, t);
  assert.ok(g.inverted(t, 1));
  const i = b.findIndex((v) => !v),
    display = p.rules.size + 1 - p.solution[i];
  enemy.digits = 1;
  const before = enemy.nextNormal;
  assert.ok(g.place(enemy, t, i, display, "universal").ok);
  assert.equal(b[i], p.solution[i]);
  assert.equal(enemy.digits, 0);
  assert.equal(enemy.nextNormal, before);
  g.tick(40);
  assert.equal(g.inverted(t, 1), false);
  assert.equal(g.view(enemy, t)[i], p.solution[i]);
});
test("eraser removes additions only; no charge when no eligible target exists", () => {
  const { g, h } = setup(),
    enemy = g.heroes[6],
    t = g.nextTower(0, 1),
    p = g.puzzle(enemy, t);
  h.lastLane = 0;
  h.consumables.eraser = 1;
  assert.equal(g.useItem(h, "eraser").ok, false);
  assert.equal(h.consumables.eraser, 1);
  let count = 0;
  for (let i = 0; i < 81 && i < t.boards[1].length; i++)
    if (!p.givens[i] && count++ < 8) t.boards[1][i] = p.solution[i];
  const before = t.boards[1].filter((v) => v > 0).length;
  assert.equal(g.useItem(h, "eraser").count, 6);
  assert.equal(before - t.boards[1].filter((v) => v > 0).length, 6);
  assert.ok(p.givens.every((v, i) => !v || t.boards[1][i] === v));
});
test("flowers spawn every three minutes and can be won once by a nearby hero", () => {
  const { g, h } = setup();
  g.tick(179.9);
  assert.equal(g.flower, null);
  g.tick(0.1);
  assert.ok(g.flower.active);
  const ed = editorFixture(g, 0),
    other = editorFixture(g, 1);
  move(h, g.flower);
  move(ed, g.flower);
  move(other, g.flower);
  // All heroes may collect; this round is claimed by the nearby Editor.
  assert.equal(g.claimFlower(g.couriers[0]), false);
  const gold = ed.gold;
  assert.ok(g.claimFlower(ed));
  assert.equal(ed.gold - gold, 70);
  assert.equal(g.claimFlower(other), false);
  assert.equal(ed.flowers, 1);
  close(g.heroSpeed(ed), CONFIG.moveSpeed * 1.04);
  close(g.editorSkillCooldown(ed, 10), 9.7);
  g.tick(180);
  assert.ok(g.flower.active);
  assert.equal(g.nextFlower, 540);
});
test("flower bonuses cap at five and do not speed up planes or the other heroes", () => {
  const { g, h } = setup();
  const ed = editorFixture(g, 0);
  ed.flowers = 30;
  close(g.heroSpeed(ed), CONFIG.moveSpeed * 1.2);
  close(g.editorSkillCooldown(ed, 30), 25.5);
  assert.equal(g.heroSpeed(h), CONFIG.moveSpeed);
  assert.equal(g.courierSpeed(h.courier), 230);
  assert.equal(CONFIG.shovelPrice, 2000);
});
test("forest claim resets with team departure, reward is once and respawn is 45 s", () => {
  const { g, h } = setup(),
    c = g.camps[0];
  move(h, c);
  g.interact(h, c);
  let m = next(g, h, c);
  g.place(h, c, m.index, m.value);
  move(h, BASES[0]);
  g.tick(0.1);
  assert.equal(c.owner, null);
  assert.deepEqual(c.boards[0], c.puzzles[0].givens);
  finish(g, h, c);
  assert.equal(h.campsWon, 1);
  assert.equal(h.digits, 3);
  close(h.digitProgress, 15.1);
  assert.equal(g.complete(h, c), false);
  const end = c.respawnAt;
  g.time = end;
  g.tick(0.01);
  assert.equal(c.respawnAt, 0);
  assert.deepEqual(c.boards[0], c.puzzles[0].givens);
});
test("large 6x6 forest Sudoku pays twice the normal camp reward", () => {
  const { g, h } = setup(),
    camp = g.camps.find((c) => c.puzzles[0].rules.size === 6),
    gold = h.gold;
  move(h, camp);
  finish(g, h, camp);
  assert.equal(h.gold - gold, CONFIG.campGold * 2);
});
test("bots reason from board data, not the stored solution", () => {
  const { g, h, t } = setup(),
    p = g.puzzle(h, t),
    solution = p.solution;
  Object.defineProperty(p, "solution", {
    get() {
      throw new Error("Bot read the answer");
    },
    configurable: true,
  });
  assert.ok(g.botMove(h, t));
  Object.defineProperty(p, "solution", { value: solution, configurable: true });
});
test("haste upgrades still charge only price difference and do not reset active timers", () => {
  const { g, h, t } = setup();
  h.gold = 2000;
  move(h, BASES[0]);
  h.nextNormal = 10;
  assert.ok(g.buy(h, "quill1").ok);
  assert.ok(g.buy(h, "quill4").ok);
  assert.equal(h.spent, 1600);
  assert.equal(h.nextNormal, 10);
  assert.ok(Math.abs(g.cooldown(h, t) - 0.675) < 1e-9);
  assert.equal(g.buy(h, "quill2").ok, false);
});
test("boots upgrade by price difference and speed the hero", () => {
  const { g, h } = setup();
  h.gold = 2000;
  move(h, BASES[0]);
  assert.ok(g.buy(h, "boots1").ok);
  close(g.heroSpeed(h), CONFIG.moveSpeed * 1.1);
  assert.ok(g.buy(h, "bootsMid").ok);
  assert.equal(h.spent, 600);
  close(g.heroSpeed(h), CONFIG.moveSpeed * 1.18);
  assert.ok(g.buy(h, "boots2").ok);
  assert.equal(h.spent, 1000);
  close(g.heroSpeed(h), CONFIG.moveSpeed * 1.25);
});
test("stun, mini ink and Editor tempo target nearby heroes", () => {
  const { g, h } = setup("editor"),
    enemy = g.heroes[6],
    ally = g.heroes[1];
  move(enemy, h);
  move(ally, h);
  h.consumables.stun2 = 1;
  h.consumables.miniInk = 1;
  assert.ok(g.useItem(h, "stun2", enemy).ok);
  assert.equal(enemy.stunnedUntil, g.time + 5);
  assert.equal(g.heroSpeed(enemy), 0);
  assert.ok(g.useItem(h, "miniInk", enemy).ok);
  assert.equal(enemy.miniInk.until, g.time + 9);
  assert.ok(g.editorTempo(h, "slow", enemy).ok);
  close(g.heroSpeed(enemy), 0);
  h.tempoAt = 0;
  assert.ok(g.editorTempo(h, "haste", ally).ok);
  close(g.heroSpeed(ally), CONFIG.moveSpeed * 1.3);
});

test("lasso keeps two heroes in range and extends health interaction", () => {
  const { g, h } = setup(),
    enemy = g.heroes[6];
  move(enemy, h);
  h.consumables.lasso = 1;
  assert.ok(g.useItem(h, "lasso", enemy).ok);
  enemy.x = h.x + CONFIG.lassoRadius * 2;
  g.constrainLasso(enemy);
  close(Math.hypot(enemy.x - h.x, enemy.y - h.y), CONFIG.lassoRadius);
  assert.ok(g.near(h, enemy.hp));
  g.time = 10;
  assert.equal(g.lassoActive(h, enemy), false);
});

test("intellect has a separate lasso cooldown and rock rejects a base", () => {
  const { g, h } = setup("intellect"),
    enemy = g.heroes[6];
  move(enemy, h);
  assert.ok(g.lassoSkill(h, enemy).ok);
  assert.equal(h.lassoAt, g.time + 45);
  assert.equal(h.heroSkillAt, 0);
  assert.equal(g.lassoSkill(h, enemy).ok, false);
  const editor = editorFixture(g, 0),
    base = g.cores.find((t) => t.defender === 0);
  assert.equal(g.editorAction(editor, "rock", base, 0).ok, false);
  assert.equal(editor.rockAt, 0);
});

test("hero attack input range doubles while preserving the creep baseline", () => {
  const { g, h } = setup(),
    enemy = g.heroes[6];
  move(enemy, { x: h.x + 259, y: h.y });
  g.combat.sync(enemy);
  assert.ok(g.near(h, enemy.hp));
  enemy.x = h.x + 261;
  g.combat.sync(enemy);
  assert.equal(g.near(h, enemy.hp), false);
  const creep = g.combat.creeps.find((u) => u.team !== h.team);
  move(creep, { x: h.x + 129, y: h.y });
  g.combat.sync(creep);
  assert.ok(g.near(h, creep.hp));
  creep.x = h.x + 131;
  g.combat.sync(creep);
  assert.equal(g.near(h, creep.hp), false);
});

test("explicit pen preserves a matching card and respects cooldown", () => {
  const { g, h, t } = setup();
  const m = next(g, h, t);
  h.digits = 1;
  h.nextNormal = g.time + 10;
  assert.equal(g.place(h, t, m.index, m.value, "pen").ok, false);
  assert.equal(h.digits, 1);
  h.nextNormal = g.time;
  const result = g.place(h, t, m.index, m.value, "pen");
  assert.ok(result.ok);
  assert.equal(result.card, false);
  assert.equal(h.digits, 1);
  assert.ok(h.nextNormal > g.time);
});

test("agile cards no longer permanently accelerate pen; roles cover every lane", () => {
  const { g, h, t } = setup("agile");
  for (const [size, reduction] of [
    [4, 0.5],
    [6, 0.3],
    [9, 0.1],
  ]) {
    h.healthSize = size;
    const before = g.cooldown(h, t),
      m = next(g, h, t);
    h.digits = 1;
    assert.ok(g.place(h, t, m.index, m.value).ok);
    close(g.cooldown(h, t), before);
  }
  for (const team of [0, 1])
    assert.equal(
      new Set(g.heroes.filter((u) => u.team === team).map((u) => u.preferred))
        .size,
      3,
    );
});

test("skill ranks scale active skills and consumable healing does not multiply", () => {
  const { g, h } = setup("intellect");
  for (const [size, duration, cooldown] of [
    [4, 5, 45],
    [6, 7.5, 32],
    [9, 10, 25],
  ]) {
    h.healthSize = size;
    h.skillRanks.heal = { 4: 2, 6: 3, 9: 4 }[size];
    h.heroSkillAt = 0;
    h.regenBoosts = [];
    assert.ok(g.heroSkill(h).ok);
    assert.equal(h.regenBoosts[0].until, g.time + duration);
    assert.equal(h.heroSkillAt, g.time + cooldown);
    assert.equal(g.combat.updateRegenInterval(h), 3);
  }
  h.consumables.sharpener = 1;
  assert.ok(g.useItem(h, "sharpener").ok);
  assert.equal(g.combat.updateRegenInterval(h), 3);
  g.time += 11;
  assert.equal(g.combat.updateRegenInterval(h), 12);
  const agile = g.heroes.find((u) => u.role === "agile" && u.team === 0),
    enemy = g.heroes[6];
  move(agile, h);
  move(enemy, h);
  agile.healthSize = 9;
  agile.skillRanks.slow = 4;
  assert.ok(g.heroSkill(agile, enemy).ok);
  assert.equal(enemy.speedEffect.multiplier, 0.5);
  assert.equal(enemy.speedEffect.until, g.time + 9);
  assert.equal(agile.heroSkillAt, g.time + 25);
});

test("creep pen uses forest timing and editor can enter numbers", () => {
  const { g, h } = setup();
  g.combat.spawnWave();
  const creep = g.combat.creeps.find((u) => u.team === 1);
  close(g.cooldown(h, creep.hp), g.cooldown(h, g.camps[0]));
  const editor = editorFixture(g, 0),
    t = g.nextTower(0, 0);
  move(editor, t);
  const m = next(g, editor, t),
    before = g.board(editor, t).slice();
  editor.digits = 1;
  assert.equal(g.place(editor, t, m.index, m.value).ok, true);
  assert.notDeepEqual(g.board(editor, t), before);
  assert.equal(editor.digits, 1);
  const enemy = g.heroes[6];
  move(enemy, { x: h.x + CONFIG.interactRadius * 1.5, y: h.y });
  g.combat.sync(enemy);
  assert.ok(g.near(h, enemy.hp));
});

test("bots buy and activate consumable combat items", () => {
  const { g } = setup(),
    bot = g.heroes.find((h) => h.team === 1 && h.role !== "editor");
  bot.digits = 20;
  bot.gold = 200;
  bot.shopAt = 0;
  const before = bot.gold;
  g.botShop(bot);
  assert.ok(
    bot.consumables.stun1 || g.pendingOrders(bot).some((o) => o.id === "stun1"),
  );
  assert.ok(bot.gold < before);
  bot.consumables.stun1 = 1;
  const foe = g.heroes.find((h) => h.team === 0);
  Object.assign(bot, { x: 1000, y: 1000 });
  Object.assign(foe, { x: 1010, y: 1000 });
  g.vision.refresh(true);
  assert.ok(g.botUseItems(bot));
  assert.equal(bot.consumables.stun1, 0);
  assert.ok(foe.stunnedUntil > g.time);
});
