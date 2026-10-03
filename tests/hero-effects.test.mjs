import test from "node:test";
import assert from "node:assert/strict";
import { Game, CONFIG, dist } from "../src/logic.js";

function setup(role = "combinator") {
  const g = new Game(42, { role });
  g.start();
  g.bot = () => {};
  // Effect regression fixtures use rank 2; progression tests cover locked starts.
  for (const hero of g.heroes)
    for (const id of Object.keys(hero.skillRanks)) hero.skillRanks[id] = 2;
  g.combat.tick = () => {};
  g.random = () => 0;
  for (const t of g.towers) t.backdoorArmor = 0;
  const h = g.player,
    enemy = g.heroes.find((a) => a.team !== h.team);
  for (const a of g.heroes) {
    a.autoDeliver = false;
    a.target = null;
  }
  Object.assign(h, { x: 1000, y: 1000 });
  Object.assign(enemy, { x: 1050, y: 1000 });
  for (const a of g.heroes) g.combat.sync(a);
  return { g, h, enemy };
}
function enter(g, h, t, i) {
  h.nextNormal = 0;
  return g.place(h, t, i, t.puzzles[h.team].solution[i], "pen");
}

test("poison waits four seconds, lasts four seconds and confirmation survives", () => {
  const { g, h, enemy } = setup(),
    t = enemy.hp;
  assert.ok(enter(g, h, t, 0).ok);
  assert.equal(h.poisonAt, 15);
  assert.ok(enter(g, h, t, 1).ok);
  assert.equal(g.heroEffects.poison.length, 1);
  g.time = 3.99;
  g.heroEffects.tick();
  assert.equal(t.boards[0].filter(Boolean).length, 2);
  g.time = 4;
  g.heroEffects.tick();
  const i = Number(Object.keys(t.poison[0])[0]);
  assert.equal(t.boards[0][i], t.puzzles[0].solution[i]);
  assert.ok(enter(g, h, t, i).ok);
  g.time = 8;
  g.heroEffects.tick();
  assert.ok(t.boards[0][i]);
  g.time = 15;
  const free = t.boards[0].findIndex((v) => !v);
  assert.ok(enter(g, h, t, free).ok);
  g.time = 19;
  g.heroEffects.tick();
  const j = Number(Object.keys(t.poison[0])[0]);
  g.time = 23;
  g.heroEffects.tick();
  assert.equal(t.boards[0][j], 0);
});

test("poison snapshots its tier, retains its page, and never transfers to a new life", () => {
  const { g, h, enemy } = setup(),
    t = g.attackTowers(0, 0)[1];
  g.attackTowers(0, 0)[0].destroyed = true;
  Object.assign(h, { x: t.x, y: t.y });
  g.combat.upgradeHealth(h, 6);
  h.skillRanks.poison = 3;
  assert.ok(enter(g, h, t, 0).ok);
  assert.equal(h.poisonAt, 12.5);
  g.combat.upgradeHealth(h, 9);
  h.skillRanks.poison = 4;
  g.selectPage(t, 1);
  g.time = 4;
  g.heroEffects.tick();
  assert.equal(Object.keys(t.pages[0].poison[0]).length, 2);
  assert.equal(t.pages[1].boards[0].filter(Boolean).length, 0);
  assert.equal(t.activePage, 1);
  g.time = 13;
  Object.assign(h, { x: enemy.x, y: enemy.y });
  assert.ok(enter(g, h, enemy.hp, 0).ok);
  assert.equal(h.poisonAt, 23);
  g.combat.newHealth(enemy, 4);
  g.time = 17;
  g.heroEffects.tick();
  assert.equal(enemy.hp.boards[0].filter(Boolean).length, 0);
});

test("poison can kill after its caster leaves and death reward belongs to real caster", () => {
  const { g, h, enemy } = setup(),
    t = enemy.hp;
  for (let i = 0; i < 14; i++) t.boards[0][i] = t.puzzles[0].solution[i];
  assert.ok(enter(g, h, t, 14).ok);
  const gold = h.gold;
  h.x = 300;
  g.time = 4;
  g.heroEffects.tick();
  assert.ok(enemy.dead);
  assert.equal(h.gold - gold, 250);
  g.time = 8;
  g.heroEffects.tick();
  assert.equal(t.boards[0].filter(Boolean).length, 16);
});

test("box cooldown tiers, fixed 4×4 hints, free escape for Editor, and blocked actions", () => {
  const { g, h } = setup(),
    victim = g.editor(1);
  Object.assign(victim, { x: h.x + 20, y: h.y });
  for (const [size, duration, cooldown, hintCount] of [
    [4, 15, 60, 4],
    [6, 20, 45, 2],
    [9, 25, 30, 2],
  ]) {
    if (size > 4) g.combat.upgradeHealth(h, size);
    for (const id of Object.keys(h.skillRanks))
      h.skillRanks[id] = { 4: 2, 6: 3, 9: 4 }[size];
    h.heroSkillAt = 0;
    assert.ok(g.heroSkill(h, victim).ok);
    const box = victim.prison;
    assert.equal(box.until - g.time, duration);
    assert.equal(h.heroSkillAt - g.time, cooldown);
    assert.equal(g.heroSpeed(victim), 0);
    g.move(victim, 600, 600);
    assert.equal(victim.target, null);
    victim.consumables.sharpener = 1;
    assert.equal(g.useItem(victim, "sharpener").ok, false);
    h.heroSkillAt = 0;
    assert.equal(g.heroSkill(h, victim).ok, false);
    assert.equal(h.heroSkillAt, 0);
    const cards = victim.digits,
      normal = victim.nextNormal;
    assert.equal(box.pages.length, size === 9 ? 2 : 1);
    assert.equal(box.puzzles[1].rules.size, 4);
    assert.equal(box.puzzles[1].hints.filter(Boolean).length, hintCount);
    while (victim.prison) {
      const i = box.boards[1].findIndex((v) => !v);
      assert.ok(i >= 0);
      assert.ok(g.place(victim, box, i, box.puzzles[1].solution[i]).ok);
    }
    assert.equal(victim.prison, null);
    assert.equal(victim.digits, cards);
    assert.equal(victim.nextNormal, normal);
  }
});

test("Sudaкс exposes its health Sudoku and receives temporary tiered armor", () => {
  for (const [size, duration, cooldown, armorCount] of [
    [4, 7, 60, 5],
    [6, 10, 50, 7],
    [9, 15, 40, 10],
  ]) {
    const { g, h, enemy } = setup("sudaks");
    if (size > 4) g.combat.upgradeHealth(h, size);
    for (const id of Object.keys(h.skillRanks))
      h.skillRanks[id] = { 4: 2, 6: 3, 9: 4 }[size];
    assert.ok(g.heroSkill(h).ok);
    assert.equal(h.sudaksExposeUntil, g.time + duration);
    assert.equal(h.heroSkillAt, g.time + cooldown);
    assert.equal(
      Object.values(h.hp.armor[1 - h.team]).filter((until) => until > g.time)
        .length,
      armorCount,
    );
    assert.equal(enemy.forcedSolve.targetId, h.id);
    assert.equal(enemy.forcedSolve.until, g.time + duration);
    assert.ok(dist(enemy, h) <= CONFIG.lassoRadius / 2 + 1e-6);
    assert.ok(g.near(enemy, h.hp));
    assert.ok(g.objectiveAccess(enemy, h.hp).ok);
    assert.equal(
      g.objectiveAccess(enemy, g.nextTower(0, enemy.team)).ok,
      false,
    );
    const oldPosition = { x: enemy.x, y: enemy.y };
    g.move(enemy, enemy.x + 100, enemy.y);
    assert.deepEqual({ x: enemy.x, y: enemy.y }, oldPosition);
    assert.equal(g.buy(enemy, "universal").ok, false);
    assert.equal(g.useItem(enemy, "miniInk").ok, false);
    g.time += duration;
    g.heroEffects.tick();
    assert.equal(h.sudaksExposeUntil, 0);
    assert.equal(enemy.forcedSolve, null);
    assert.equal(
      Object.values(h.hp.armor[1 - h.team]).filter((until) => until > g.time)
        .length,
      0,
    );
  }
});

test("Battle Cry keeps compelled enemies within half the lasso radius as Sudaks moves", () => {
  const { g, h, enemy } = setup("sudaks");
  enemy.x = h.x + CONFIG.effectRadius - 1;
  enemy.y = h.y;
  g.combat.sync(enemy);
  assert.ok(g.heroSkill(h).ok);
  assert.ok(dist(enemy, h) <= CONFIG.lassoRadius / 2 + 1e-6);
  h.x += 100;
  g.constrainForcedSolve(enemy);
  assert.ok(dist(enemy, h) <= CONFIG.lassoRadius / 2 + 1e-6);
  assert.equal(enemy.hp.x, enemy.x);
  g.time = enemy.forcedSolve.until;
  g.heroEffects.tick();
  assert.equal(enemy.forcedSolve, null);
});

test("burning digits can finish hero health and award Sudaks the kill", () => {
  const { g, h, enemy } = setup("sudaks"),
    t = enemy.hp,
    team = h.team;
  for (let i = 0; i < t.boards[team].length - 1; i++)
    t.boards[team][i] = t.puzzles[team].solution[i];
  const gold = h.gold;
  assert.ok(g.burningSkill(h, enemy).ok);
  assert.equal(enemy.dead, true);
  assert.equal(h.gold - gold, 250);
  assert.equal(enemy.contributors[h.id], g.time);
  g.time += 5;
  g.heroEffects.tick();
  assert.equal(t.boards[team].filter(Boolean).length, 16);
});

test("burning damage counts toward an assist when a creep finishes the target", () => {
  const { g, h, enemy } = setup("sudaks"),
    gold = h.gold;
  assert.ok(g.burningSkill(h, enemy).ok);
  g.combat.kill(enemy, { id: "creep-1", team: h.team });
  assert.equal(h.gold - gold, 75);
});

test("Sudaкс burning digits fade by expiry and burn one nearby normal entry", () => {
  for (const [size, count, duration, cooldown] of [
    [4, 1, 9, 45],
    [6, 2, 10, 30],
    [9, 3, 12, 20],
  ]) {
    const { g, h, enemy } = setup("sudaks");
    h.healthSize = size;
    h.skillRanks.burning = { 4: 2, 6: 3, 9: 4 }[size];
    const t = enemy.hp,
      team = h.team,
      ordinary = 0;
    t.boards[team][ordinary] = t.puzzles[team].solution[ordinary];
    const result = g.burningSkill(h, enemy);
    assert.ok(result.ok);
    assert.equal(result.count, count);
    assert.equal(result.duration, duration);
    assert.equal(g.fire.charges(h).count, 0);
    assert.equal(g.fire.charges(h).nextAt, g.time + cooldown);
    assert.equal(Object.keys(t.burning[team]).length, count);
    assert.equal(g.solved(h, t), false);
    g.time += duration;
    g.heroEffects.tick();
    assert.equal(Object.keys(t.burning[team]).length, 1);
    assert.equal(t.boards[team].filter(Boolean).length, 1);
    g.time += duration;
    g.heroEffects.tick();
    assert.equal(Object.keys(t.burning[team]).length, 0);
    assert.equal(t.boards[team].filter(Boolean).length, 0);
  }
});

test("box expires, permits damage and bot escape, and clears on death", () => {
  const { g, h, enemy } = setup();
  assert.ok(g.heroSkill(h, enemy).ok);
  g.combat.damage(h, enemy.hp, 1);
  assert.equal(g.combat.hpLeft(enemy), 15);
  const box = enemy.prison,
    before = box.boards[1].filter(Boolean).length;
  g.time = 0.8;
  g.heroEffects.tick();
  assert.equal(box.boards[1].filter(Boolean).length, before + 1);
  g.time = 15;
  g.heroEffects.tick();
  assert.equal(enemy.prison, null);
  h.heroSkillAt = 0;
  assert.ok(g.heroSkill(h, enemy).ok);
  g.combat.kill(enemy, h);
  assert.equal(enemy.prison, null);
});

test("Sudaкс compulsion makes bots solve only his health Sudoku", () => {
  const { g, h, enemy } = setup("sudaks");
  enemy.autoDeliver = true;
  assert.ok(g.heroSkill(h).ok);
  enemy.thinkAt = 0;
  const armorBefore = Object.keys(h.hp.armor[enemy.team]).length;
  const before = g.progress(g.nextTower(0, enemy.team), enemy.team).filled;
  Game.prototype.bot.call(g, enemy);
  assert.equal(
    g.progress(g.nextTower(0, enemy.team), enemy.team).filled,
    before,
  );
  assert.equal(g.heroEffects.follow(enemy, h), false);
  assert.equal(Object.keys(h.hp.armor[enemy.team]).length, armorBefore - 1);
});

test("Editor bot retreats from nearby visible attackers", () => {
  const { g, h } = setup("sudaks"),
    editor = g.heroes.find((unit) => unit.role === "editor" && unit.team === 0),
    enemy = g.heroes.find((unit) => unit.team === 1);
  Object.assign(editor, { x: 1000, y: 1000, target: null });
  Object.assign(enemy, { x: 1100, y: 1000 });
  for (const unit of g.heroes) g.combat.sync(unit);
  g.vision.refresh();
  Game.prototype.bot.call(g, editor);
  assert.equal(editor.retreat, true);
  assert.ok(editor.target);
  assert.ok(dist(editor.target, { x: 1000, y: 1000 }) > 0);
});

test("all heroes claim flowers, advance HP preserving damage ratio and retain gold at max HP", () => {
  const { g, h } = setup("strong");
  for (let i = 0; i < 8; i++) h.hp.boards[1][i] = h.hp.puzzles[1].solution[i];
  const gold = h.gold;
  for (const size of [6, 9, 9]) {
    g.flower = { active: true, x: h.x, y: h.y };
    assert.ok(g.claimFlower(h));
    assert.equal(h.healthSize, size);
    assert.equal(g.claimFlower(h), false);
  }
  assert.equal(h.gold - gold, 210);
  assert.equal(g.combat.hpLeft(h), 26);
});

test("follow tracks moving enemies, cancels on move/death; lasso stays in range each tick", () => {
  const { g, h, enemy } = setup("intellect");
  enemy.x = h.x + 200;
  g.combat.sync(enemy);
  assert.ok(g.heroEffects.follow(h, enemy));
  g.tick(0.1);
  assert.ok(h.x > 1000);
  g.move(h, 900, 900);
  assert.equal(h.followTarget, null);
  assert.ok(g.heroEffects.follow(h, enemy));
  enemy.dead = true;
  g.tick(0.1);
  assert.equal(h.followTarget, null);
  enemy.dead = false;
  enemy.x = h.x + CONFIG.lassoRadius;
  g.bindLasso(h, enemy);
  for (let i = 0; i < 50; i++) {
    g.move(h, h.x - 100, h.y);
    g.move(enemy, enemy.x + 100, enemy.y);
    g.tick(0.1);
    assert.ok(dist(h, enemy) <= CONFIG.lassoRadius + 0.0001);
    assert.ok(g.near(h, enemy.hp));
    assert.equal(enemy.hp.x, enemy.x);
  }
});

test("Battle Cry lets every nearby role contribute to the same Sudaks board", () => {
  const { g, h } = setup("sudaks"),
    editor = g.heroes.find(
      (hero) => hero.team !== h.team && hero.role === "editor",
    );
  Object.assign(editor, { x: h.x + 40, y: h.y, nextNormal: 0 });
  assert.ok(g.heroSkill(h).ok);
  assert.equal(editor.forcedSolve.targetId, h.id);
  const board = h.hp.boards[editor.team],
    index = board.findIndex((value) => !value),
    value = h.hp.puzzles[editor.team].solution[index];
  assert.ok(g.place(editor, h.hp, index, value, "pen").ok);
  assert.equal(board[index], value);
});

test("Dyrkol focus halves the error lock for its active duration", () => {
  const { g, h, enemy } = setup("strong");
  h.skillRanks.focus = 2;
  assert.ok(g.errorFocusSkill(h).ok);
  assert.equal(h.errorFocusUntil, 15);
  const board = enemy.hp.boards[h.team],
    first = board.findIndex((value) => !value),
    solution = enemy.hp.puzzles[h.team].solution;
  assert.equal(
    g.place(h, enemy.hp, first, (solution[first] % 4) + 1, "pen").ok,
    false,
  );
  assert.equal(h.lockedUntil, 1);
  g.time = 16;
  h.lockedUntil = 0;
  h.nextNormal = 0;
  const second = board.findIndex((value, index) => !value && index !== first);
  assert.equal(
    g.place(h, enemy.hp, second, (solution[second] % 4) + 1, "pen").ok,
    false,
  );
  assert.equal(h.lockedUntil, 18);
});
