import test from "node:test";
import assert from "node:assert/strict";
import { Game, BASES, CONFIG, countSolutions, dist } from "../src/logic.js";
import { COMBAT } from "../src/combat.js";
function setup(role = "intellect") {
  const g = new Game(31, { role });
  g.start();
  g.bot = () => {};
  // Effect regression fixtures use rank 2; progression tests cover locked starts.
  for (const hero of g.heroes)
    for (const id of Object.keys(hero.skillRanks)) hero.skillRanks[id] = 2;
  g.combat.creeps = [];
  g.combat.nextWave = Infinity;
  for (const t of g.towers) t.backdoorArmor = 0;
  return g;
}
function near(g, h, t) {
  h.x = t.x;
  h.y = t.y;
  h.target = null;
  g.combat.sync(h);
}
function fill(g, h, t) {
  near(g, h, t);
  const p = g.puzzle(h, t);
  t.boards[h.team] = p.solution.slice();
  if (t.pages) t.pages[t.activePage].boards = t.boards;
  return g.complete(h, t);
}
function tower(g, h, t) {
  for (let i = 0; i < t.pages.length; i++) {
    g.selectPage(t, i);
    assert.ok(fill(g, h, t));
  }
}

test("every building and hero starts empty; phantom guides alone determine a unique answer", () => {
  const g = setup();
  for (const t of [
    ...g.locations.filter((t) => t.pages),
    ...g.heroes.map((h) => h.hp),
  ]) {
    for (const page of t.pages || [t])
      for (const p of page.puzzles) {
        assert.ok(p.givens.every((v) => v === 0));
        assert.ok(p.hints.some(Boolean));
        assert.equal(countSolutions(p.hints, p.rules), 1);
      }
    assert.ok(t.boards.every((b) => b.every((v) => v === 0)));
  }
});
test("guide is not damage: explicit correct card input confirms it", () => {
  const g = setup(),
    h = g.player,
    t = g.nextTower(0, 0);
  near(g, h, t);
  const hint = g.hints(h, t)[0];
  assert.equal(g.progress(t, 0).filled, 0);
  h.digits = 1;
  assert.ok(g.place(h, t, hint.index, hint.value).ok);
  assert.equal(g.progress(t, 0).filled, 1);
  assert.equal(
    g.hints(h, t).some((e) => e.index === hint.index),
    false,
  );
});
test("T2 requires both independent pages, pays once, and unlocks digits 7–9", () => {
  const g = setup(),
    h = g.player;
  tower(g, h, g.nextTower(0, 0));
  assert.equal(g.nineUnlocked(), false);
  const t = g.nextTower(0, 0),
    gold = h.gold;
  assert.equal(t.pages.length, 2);
  fill(g, h, t);
  assert.equal(t.destroyed, false);
  assert.equal(h.gold, gold);
  g.selectPage(t, 1);
  assert.equal(g.progress(t, 0).filled, 0);
  fill(g, h, t);
  assert.equal(t.destroyed, true);
  assert.equal(h.gold, gold + CONFIG.towerGold[1]);
  assert.equal(g.nineUnlocked(), true);
  assert.equal(g.complete(h, t), false);
});
test("base is one unit with three independently hinted pages and needs all three", () => {
  const g = setup(),
    h = g.player;
  for (const t of g.attackTowers(0, 0)) tower(g, h, t);
  const base = g.nextCore(0);
  assert.equal(g.cores.length, 2);
  assert.equal(base.pages.length, 3);
  assert.equal(base.pages[0].difficulty, 3);
  assert.equal(base.pages[1].difficulty, 0);
  assert.ok(
    base.pages[0].puzzles[0].hints.filter(Boolean).length >
      base.pages[1].puzzles[0].hints.filter(Boolean).length,
  );
  for (let i = 0; i < 3; i++) {
    g.selectPage(base, i);
    fill(g, h, base);
    assert.equal(g.phase, i === 2 ? "ended" : "playing");
  }
  assert.equal(g.winner, 0);
});
test("an attack solves enemy HP, kills once, and later deaths have longer respawns", () => {
  const g = setup(),
    h = g.player,
    e = g.heroes[6];
  near(g, h, e);
  const t = e.hp;
  for (let i = 0; i < 15; i++) t.boards[0][i] = t.puzzles[0].solution[i];
  const v = t.puzzles[0].solution[15];
  h.digits = 1;
  assert.ok(g.place(h, t, 15, v).ok);
  assert.ok(e.dead);
  assert.equal(e.respawnAt, 10);
  assert.equal(e.deathAt, g.time);
  const gold = h.gold;
  g.combat.kill(e, h);
  assert.equal(h.gold, gold);
  g.time = 10;
  g.combat.tick(0);
  assert.equal(e.dead, false);
  assert.equal(e.deathAt, null);
  assert.equal(g.combat.hpLeft(e), 16);
  assert.equal(e.x, e.spawnPoint.x);
  g.time = 600;
  g.combat.kill(e, h);
  assert.equal(e.respawnAt, 630);
});
test("dead heroes cannot move, enter numbers, spy or activate consumables", () => {
  const g = setup(),
    h = g.player,
    t = g.nextTower(0, 0);
  g.combat.kill(h);
  g.move(h, t.x, t.y);
  assert.equal(h.target, null);
  assert.equal(g.place(h, t, 0, 1).ok, false);
  h.consumables.invert = 1;
  assert.equal(g.useItem(h, "invert").ok, false);
  assert.equal(h.consumables.invert, 1);
});
test("regeneration clears damage; home interval is shorter", () => {
  const g = setup(),
    h = g.player;
  near(g, h, { x: 400, y: 400 });
  const b = h.hp.boards[1],
    p = h.hp.puzzles[1];
  for (let i = 0; i < 6; i++) b[i] = p.solution[i];
  h.regenAt = 12;
  h.regenBase = false;
  g.time = 11;
  g.combat.tick(0);
  assert.equal(g.combat.hpLeft(h), 10);
  g.time = 12;
  g.combat.tick(0);
  assert.equal(g.combat.hpLeft(h), 11);
  near(g, h, BASES[0]);
  g.time = 13;
  g.combat.tick(0);
  assert.equal(h.regenAt, 14);
  g.time = 14;
  g.combat.tick(0);
  assert.equal(g.combat.hpLeft(h), 12);
});
test("base healing radius triples without extending instant item delivery", () => {
  const g = setup(),
    h = g.player,
    base = BASES[h.team];
  assert.equal(CONFIG.baseRegenRadius, 234);
  near(g, h, { x: base.x + CONFIG.baseRegenRadius - 0.1, y: base.y });
  assert.equal(g.combat.updateRegenInterval(h), 1);
  assert.equal(g.atBase(h), false);
  near(g, h, { x: base.x + CONFIG.baseRegenRadius + 0.1, y: base.y });
  assert.equal(g.combat.updateRegenInterval(h), 12);
  h.dead = true;
  assert.equal(g.atBase(h, CONFIG.baseRegenRadius), false);
});
test("team spawn points stay separated inside healing range and persist through respawn", () => {
  const g = setup();
  for (const h of g.heroes) {
    assert.ok(g.atBase(h, CONFIG.baseRegenRadius));
    for (const other of g.heroes.filter((u) => u.team === h.team && u !== h))
      assert.ok(dist(h, other) >= CONFIG.heroSpawnSpacing);
    const spawn = { x: h.x, y: h.y };
    g.combat.kill(h, { team: 1 - h.team, id: "tower" });
    h.x = 2500;
    h.y = 2500;
    g.combat.respawn(h);
    assert.deepEqual({ x: h.x, y: h.y }, spawn);
  }
});
test("health upgrades preserve damage ratio, charge only difference, and travel via plane", () => {
  const g = setup(),
    h = g.player;
  h.gold = 2000;
  near(g, h, BASES[0]);
  for (let i = 0; i < 8; i++) h.hp.boards[1][i] = h.hp.puzzles[1].solution[i];
  assert.ok(g.buy(h, "health6").ok);
  assert.equal(h.healthSize, 6);
  assert.equal(g.combat.hpLeft(h), 18);
  assert.equal(g.itemPrice(h, "health9"), 900);
  near(g, h, g.camps[0]);
  assert.ok(g.buy(h, "health9").ok);
  assert.equal(h.healthSize, 6);
  assert.equal(g.pendingOrders(h).length, 1);
  assert.equal(g.buy(h, "health9").ok, false);
  for (let i = 0; i < 100 && h.healthSize < 9; i++) g.tickCourier(h.courier, 1);
  assert.equal(h.healthSize, 9);
  assert.equal(g.combat.hpLeft(h), 26);
  assert.equal(h.spent, 1500);
});
test("orders wait for dead recipient and survive editor death", () => {
  const g = setup("editor"),
    h = g.player,
    ed = g.editor(0),
    plane = h.courier;
  g.combat.kill(h);
  g.deliver(h, { type: "item", id: "quill1", recipient: h.id });
  assert.equal(g.pendingOrders(h).length, 1);
  g.tickCourier(plane, 1);
  assert.equal(h.hasteTier, 0);
  g.combat.kill(ed);
  assert.equal(g.pendingOrders(h).length, 1);
  assert.equal(plane.cargo.filter((o) => o.recipient === h.id).length, 1);
});
test("each wave has three 4x4 creeps per lane and team", () => {
  const g = setup();
  g.combat.spawnWave();
  assert.equal(g.combat.creeps.length, 18);
  for (const team of [0, 1])
    for (let lane = 0; lane < 3; lane++)
      assert.equal(
        g.combat.creeps.filter((u) => u.team === team && u.lane === lane)
          .length,
        3,
      );
  for (const u of g.combat.creeps) {
    assert.ok(g.combat.hpLeft(u) >= 5 && g.combat.hpLeft(u) <= 8);
    assert.equal(u.hp.puzzles[0].rules.size, 4);
  }
  g.combat.nextWave = 30;
  g.time = 30;
  g.combat.tick(0);
  assert.equal(g.combat.creeps.length, 36);
});
test("towers prioritize creeps and deal twice the old DPS in second ticks", () => {
  const g = setup(),
    h = g.player,
    t = g.nextTower(0, 0);
  g.combat.spawnWave();
  const c = g.combat.creeps.find((c) => c.team === 0);
  near(g, h, t);
  Object.assign(c, { x: t.x, y: t.y });
  g.combat.sync(c);
  const start = g.combat.hpLeft(c);
  g.combat.structureTick(t);
  assert.equal(g.combat.hpLeft(c), start - 1);
  assert.equal(g.combat.hpLeft(h), g.combat.hpLeft(h));
  g.time = 6;
  g.combat.structureTick(t);
  assert.equal(g.combat.hpLeft(c), start - 2);
  g.time = 12;
  g.combat.structureTick(t);
  assert.equal(g.combat.hpLeft(c), start - 3);
  assert.equal(g.combat.hpLeft(h), g.combat.hpLeft(h));
  c.dead = true;
  g.time = 18;
  g.combat.structureTick(t);
  assert.equal(g.combat.hpLeft(h), 15);
  const t2 = g.attackTowers(0, 0)[1];
  near(g, h, t2);
  g.combat.structureTick(t2);
  assert.equal(g.combat.hpLeft(h), 14);
  g.time++;
  g.combat.structureTick(t2);
  g.time++;
  g.combat.structureTick(t2);
  assert.equal(g.combat.hpLeft(h), 11);
});
test("creep hits are always correct and do not consume cards", () => {
  const g = setup(),
    t = g.nextTower(0, 0);
  g.combat.spawnWave();
  const c = g.combat.creeps.find((c) => c.team === 0 && c.lane === 0);
  Object.assign(c, { x: t.x, y: t.y, attackAt: 0 });
  g.combat.creepTick(c, 0.1);
  assert.equal(g.progress(t, 0).filled, 1);
  assert.ok(t.boards[0].every((v, i) => !v || v === t.puzzles[0].solution[i]));
  g.combat.creepTick(c, 0.1);
  assert.equal(g.progress(t, 0).filled, 1);
  assert.equal(COMBAT.creepAttackSeconds, 5);
});
test("attacking hero health slows its owner until the attacker leaves", () => {
  const g = setup(),
    attacker = g.player,
    target = g.heroes[6];
  near(g, attacker, target);
  g.combat.engage(attacker, target.hp);
  assert.equal(g.combat.attackSlow(target), 0.2);
  assert.equal(g.heroSpeed(target), CONFIG.moveSpeed * 0.8);
  attacker.x += CONFIG.effectRadius + 1;
  g.combat.tick(0.01);
  assert.equal(attacker.fighting, null);
  assert.equal(g.combat.attackSlow(target), 0);
});
test("backdoor grants tower armor without restoring Sudoku cells", () => {
  const g = setup(),
    t = g.attackTowers(0, 0)[1];
  const p = t.pages[0];
  p.completed[0] = true;
  p.boards[0] = p.puzzles[0].solution.slice();
  g.selectPage(t, 1);
  t.boards[0][0] = -1;
  t.holes[0].push(0);
  const hints = t.puzzles[0].hints.slice();
  g.time = 6;
  g.combat.structureTick(t);
  assert.equal(t.boards[0][0], -1);
  assert.equal(t.holes[0].length, 1);
  assert.equal(t.backdoorArmor, 7);
  assert.deepEqual(t.puzzles[0].hints, hints);
  assert.equal(p.boards[0].filter(Boolean).length, 36);
});
test("nearby creeps remove backdoor armor; it returns after they leave", () => {
  const g = setup(),
    t = g.nextTower(0, 0);
  t.boards[0][0] = t.puzzles[0].solution[0];
  g.combat.spawnWave();
  const c = g.combat.creeps[0];
  Object.assign(c, { x: t.x, y: t.y });
  g.time = 20;
  g.combat.structureTick(t);
  assert.equal(t.backdoor, false);
  assert.equal(t.backdoorArmor, 0);
  assert.ok(t.boards[0][0]);
  c.dead = true;
  g.time = 24;
  g.combat.structureTick(t);
  assert.ok(t.boards[0][0]);
  g.time = 25;
  g.combat.structureTick(t);
  assert.equal(t.boards[0][0], t.puzzles[0].solution[0]);
  assert.equal(t.backdoorArmor, 5);
});

test("tower armor absorbs digit hits until a creep removes the backdoor shield", () => {
  const g = setup(),
    h = g.player,
    t = g.nextTower(0, 0);
  near(g, h, t);
  t.backdoor = true;
  g.time = 6;
  g.combat.structureTick(t);
  const first = t.boards[h.team].findIndex((v) => !v),
    value = t.puzzles[h.team].solution[first];
  h.nextNormal = 0;
  assert.ok(g.place(h, t, first, value, "pen").ok);
  assert.equal(t.boards[h.team][first], 0);
  assert.equal(t.backdoorArmor, 4);
  g.combat.spawnWave();
  const creep = g.combat.creeps.find((unit) => unit.team === h.team);
  Object.assign(creep, { x: t.x, y: t.y });
  g.combat.sync(creep);
  g.combat.structureTick(t);
  assert.equal(t.backdoor, false);
  assert.equal(t.backdoorArmor, 0);
  h.stunnedUntil = 0;
  h.nextNormal = 0;
  const second = t.boards[h.team].findIndex((v) => !v);
  assert.ok(
    g.place(h, t, second, t.puzzles[h.team].solution[second], "pen").ok,
  );
  assert.equal(t.boards[h.team][second], t.puzzles[h.team].solution[second]);
});

test("base shares ten backdoor armor across its Sudoku pages until creeps arrive", () => {
  const g = setup(),
    base = g.cores.find((unit) => unit.defender === 1),
    page = base.pages[0],
    index = page.boards[0].findIndex((v) => !v);
  assert.equal(base.backdoorArmor, 10);
  g.combat.hit(g.player, base, index, page.puzzles[0].solution[index]);
  assert.equal(page.boards[0][index], 0);
  assert.equal(base.backdoorArmor, 9);
  g.combat.spawnWave();
  const creep = g.combat.creeps.find((unit) => unit.team === 0);
  Object.assign(creep, { x: base.x, y: base.y });
  g.combat.sync(creep);
  g.combat.structureTick(base);
  assert.equal(base.backdoor, false);
  assert.equal(base.backdoorArmor, 0);
});
test("praise works for any other hero, throttles duplicates and gives no gold", () => {
  const g = setup(),
    h = g.player,
    e = g.heroes[6],
    gold = e.gold;
  assert.ok(g.combat.praise(h, e));
  assert.equal(e.praise, 1);
  assert.equal(e.gold, gold);
  assert.equal(g.combat.praise(h, e), false);
  assert.equal(g.combat.praise(h, h), false);
  g.time = 59;
  assert.equal(g.combat.praise(h, e), false);
  g.time = 60;
  assert.ok(g.combat.praise(h, e));
  assert.equal(g.chat.messages.length, 2);
});

test("creep roads include lane corners, formation preserves movement, and untouched creeps outrank heroes", () => {
  const g = setup();
  g.combat.spawnWave();
  const c = g.combat.creeps[0],
    enemy = g.heroes[6];
  assert.ok(
    c.route.some(
      (p) =>
        p.x === 10 * CONFIG.mapMultiplier && p.y === 10 * CONFIG.mapMultiplier,
    ),
  );
  g.time = 10;
  near(g, c, { x: 1000, y: 1000 });
  near(g, enemy, c);
  const other = g.combat.creeps.find((u) => u.team === 1);
  near(g, other, c);
  g.combat.creepTick(c, 0);
  assert.ok(g.combat.hpLeft(other) <= 8);
  g.combat.separateCreeps();
  assert.ok(Math.hypot(c.x - other.x, c.y - other.y) >= 0);
  enemy.dead = true;
  other.dead = true;
  const before = { x: c.x, y: c.y };
  g.combat.creepTick(c, 0.1);
  assert.ok(Math.hypot(c.x - before.x, c.y - before.y) > 0);
});
test("hero kill bounty belongs to killer and tower backdoor armor scales by tier", () => {
  const g = setup(),
    h = g.player,
    gold = h.gold;
  g.combat.kill(g.heroes[6], h);
  assert.equal(h.gold - gold, 250);
  for (const [step, armor] of [
    [0, 5],
    [1, 7],
    [2, 10],
  ]) {
    const t = g.attackTowers(0, 0)[step];
    t.boards[0][0] = t.puzzles[0].solution[0];
    g.time = 10;
    g.combat.structureTick(t);
    assert.equal(t.boards[0][0], t.puzzles[0].solution[0]);
    assert.equal(t.backdoorArmor, armor);
  }
});

test("area stun scales cooldown with health and stops creeps", () => {
  const g = new Game(31, { role: "strong" });
  g.start();
  g.player.skillRanks.stun = 2;
  const h = g.heroes.find((u) => u.role === "strong" && u.team === 0);
  g.combat.spawnWave();
  const creep = g.combat.creeps.find((u) => u.team === 1);
  near(g, creep, h);
  assert.ok(g.areaStun(h).ok);
  assert.equal(h.areaStunAt, g.time + 45);
  assert.equal(g.areaStun(h).ok, false);
  assert.ok(!(creep.stunnedUntil > g.time));
  g.bot = () => {};
  g.combat.nextWave = Infinity;
  g.combat.structureTick = () => {};
  g.tick(0.29);
  assert.ok(!(creep.stunnedUntil > g.time));
  g.tick(0.01);
  assert.ok(creep.stunnedUntil > g.time);
  const x = creep.x;
  g.combat.creepTick(creep, 0.1);
  assert.equal(creep.x, x);
});

test("bot chooses a nearby enemy hero and large camps preserve their size", () => {
  const g = setup(),
    h = g.heroes[1],
    enemy = g.heroes[6];
  near(g, h, { x: 1000, y: 1000 });
  near(g, enemy, { x: 1060, y: 1000 });
  assert.equal(g.combat.botCombat(h), true);
  assert.equal(h.fighting, enemy.hp.id);
  assert.equal(h.target, null);
  assert.ok(g.near(h, enemy.hp));
  const camps = g.camps.filter((c) => c.puzzles[0].rules.size === 6);
  assert.equal(camps.length, 2);
  for (const c of camps) c.respawnAt = 1;
  g.time = 2;
  g.tick(0.01);
  assert.ok(camps.every((c) => c.puzzles[0].rules.size === 6));
});

test("creep duels use five seconds, kills pay 43 and corners advance despite separation", () => {
  const g = setup();
  g.combat.spawnWave();
  const c = g.combat.creeps[0],
    enemy = g.combat.creeps.find((u) => u.team === 1);
  near(g, c, { x: 1000, y: 1000 });
  near(g, enemy, c);
  c.attackAt = 0;
  g.combat.creepTick(c, 0.1);
  assert.equal(c.attackAt, 7.5);
  const gold = g.player.gold;
  g.combat.kill(enemy, g.player);
  assert.equal(g.player.gold - gold, 43);
  const corner = c.route[c.waypoint],
    waypoint = c.waypoint;
  near(g, c, { x: corner.x + 20, y: corner.y });
  g.combat.creepTick(c, 0.1);
  assert.equal(c.waypoint, waypoint + 1);
});

test("creep health Sudoku spawns without hints and backdoor range adds 70", () => {
  const g = setup();
  g.combat.spawnWave();
  const c = g.combat.creeps.find((u) => u.team === 0),
    t = g.nextTower(0, 0);
  assert.ok(c.hp.puzzles[0].hints.every((v) => v === 0));
  assert.equal(COMBAT.creepRadius, 200);
  assert.equal(COMBAT.backdoorExtraRadius, 70);
  g.combat.creeps = [c];
  c.spawnAt = 0;
  near(g, c, { x: t.x + COMBAT.attackRadius + 69, y: t.y });
  g.time = 1;
  g.combat.structureTick(t);
  assert.equal(t.backdoor, false);
  assert.equal(t.lastCreepAt, 1);
});

test("creep bounty stays 43 after destroyed towers on its lane", () => {
  const g = setup(),
    h = g.player;
  g.combat.spawnWave();
  for (let stage = 0; stage < 3; stage++) {
    if (!g.combat.creeps.some((u) => !u.dead && u.team === 1 && u.lane === 0))
      g.combat.spawnWave();
    const creep = g.combat.creeps.find(
      (u) => !u.dead && u.team === 1 && u.lane === 0,
    );
    if (stage) g.attackTowers(0, 0)[stage - 1].destroyed = true;
    const gold = h.gold;
    g.combat.kill(creep, h);
    assert.equal(h.gold - gold, 43);
  }
});

test("healing acceleration changes actual recovery timing and expires", () => {
  const g = setup(),
    h = g.player;
  near(g, h, { x: 1000, y: 800 });
  h.regenAt = 12;
  h.regenBase = false;
  const board = h.hp.boards[1];
  for (let i = 0; i < 8; i++) board[i] = h.hp.puzzles[1].solution[i];
  g.boostRegen(h, 4, 5);
  assert.equal(h.regenAt, 3);
  g.time = 3;
  g.combat.tick(0);
  assert.equal(g.combat.hpLeft(h), 9);
  g.time = 5;
  g.combat.tick(0);
  assert.equal(h.regenInterval, 12);
  assert.equal(h.regenAt, 9);
});
test("tower attack range is doubled to 312 and excludes heroes outside it", () => {
  const g = setup(),
    h = g.player,
    tower = g.nextTower(0, 0);
  assert.equal(COMBAT.attackRadius, 312);
  near(g, h, { x: tower.x + COMBAT.attackRadius + 1, y: tower.y });
  g.combat.structureTick(tower);
  assert.equal(g.combat.hpLeft(h), 16);
  near(g, h, { x: tower.x + COMBAT.attackRadius - 1, y: tower.y });
  g.combat.structureTick(tower);
  assert.equal(g.combat.hpLeft(h), 15);
});

test("hero assists share 30% of the bounty and do not repeat", () => {
  const g = setup(),
    h = g.player,
    ally = g.heroes[1],
    enemy = g.heroes[6];
  g.combat.damage(h, enemy.hp, 1);
  g.combat.damage(ally, enemy.hp, 1);
  const gold = h.gold,
    allyGold = ally.gold;
  g.combat.kill(enemy, ally);
  assert.equal(h.gold - gold, 75);
  assert.equal(ally.gold - allyGold, 250);
  g.combat.kill(enemy, ally);
  assert.equal(h.gold - gold, 75);
});

test("bounty scales with time and victim health; non-hero last hits pay only assists", () => {
  for (const [time, size, bounty] of [
    [0, 4, 250],
    [60, 6, 370],
    [900, 9, 750],
  ]) {
    const g = setup(),
      killer = g.player,
      victim = g.heroes[6],
      gold = killer.gold;
    g.time = time;
    victim.healthSize = size;
    g.combat.kill(victim, killer);
    assert.equal(killer.gold - gold, bounty);
  }
  for (const finalBlow of ["creep", "tower"]) {
    const g = setup(),
      victim = g.heroes[6],
      first = g.player,
      second = g.heroes[1],
      before = [first.gold, second.gold];
    g.time = 60;
    victim.healthSize = 6;
    victim.contributors = { [first.id]: g.time, [second.id]: g.time };
    g.combat.kill(victim, { id: finalBlow, team: first.team });
    assert.deepEqual(
      [first.gold - before[0], second.gold - before[1]],
      [56, 55],
    );
  }
});

test("creeps entering tower range immediately disable backdoor even between attacks", () => {
  const g = setup(),
    t = g.nextTower(0, 0);
  g.time = 20;
  g.combat.structureTick(t);
  assert.equal(t.backdoor, true);
  g.combat.spawnWave();
  const c = g.combat.creeps.find((c) => c.team === 0);
  near(g, c, { x: t.x + COMBAT.attackRadius - 1, y: t.y });
  t.attackAt = 100;
  g.combat.structureTick(t);
  assert.equal(t.backdoor, false);
});

test("heroes hold outside an active tower backdoor until creeps disable its armor", () => {
  const g = setup();
  const h = g.heroes.find((u) => u.team === 1);
  h.role = "intellect";
  g.progression.initialize(h);
  for (const id of Object.keys(h.skillRanks)) h.skillRanks[id] = 2;
  const t = g.nextTower(h.preferred, h.team);
  h.x = t.x + COMBAT.attackRadius + COMBAT.backdoorExtraRadius + 120;
  h.y = t.y;
  g.combat.sync(h);
  h.thinkAt = 0;
  g.time = 200;
  g.bot = Game.prototype.bot;
  g.bot(h);
  assert.equal(h.task, t.id);
  assert.equal(t.backdoor, true);
  assert.equal(h.target, null);
  t.backdoor = false;
  t.backdoorArmor = 0;
  h.thinkAt = 0;
  g.bot(h);
  assert.notEqual(h.target, null);
  for (const tower of g.attackTowers(h.preferred, h.team))
    tower.destroyed = true;
  const base = g.nextCore(h.team);
  Object.assign(h, {
    x: base.x + COMBAT.attackRadius + COMBAT.backdoorExtraRadius + 120,
    y: base.y,
    target: null,
    thinkAt: 0,
  });
  g.combat.sync(h);
  g.bot(h);
  assert.equal(h.task, base.id);
  assert.equal(h.target, null);
});

test("bot escorts its wave toward T2 while backdoor is active", () => {
  const g = setup(),
    h = g.heroes.find((hero) => hero.team === 0 && hero.preferred === 1),
    towers = g.attackTowers(h.preferred, h.team),
    t = towers[1];
  towers[0].destroyed = true;
  h.gold = 0;
  h.thinkAt = 0;
  h.laneWaypoint = 2;
  h.x = 50 * CONFIG.mapMultiplier;
  h.y = 50 * CONFIG.mapMultiplier;
  g.combat.sync(h);
  g.time = 30;
  g.bot = Game.prototype.bot;
  const escort = {
    dead: false,
    team: h.team,
    lane: t.lane,
    spawnAt: 0,
    x: t.x + COMBAT.attackRadius + COMBAT.backdoorExtraRadius + 280,
    y: t.y,
  };
  g.combat.creeps.push(escort);
  g.bot(h);
  assert.equal(h.task, t.id);
  assert.ok(h.target);
  assert.ok(
    dist(h.target, t) >= COMBAT.attackRadius + COMBAT.backdoorExtraRadius + 35,
  );
});

test("middle bot does not turn back for a creep behind it near its own T2", () => {
  const g = setup(),
    h = g.heroes.find((hero) => hero.team === 0 && hero.preferred === 1),
    ownT2 = g.attackTowers(1, 1)[1],
    enemyT1 = g.attackTowers(1, 0)[0];
  h.gold = 0;
  h.thinkAt = 0;
  h.laneWaypoint = 3;
  h.x = ownT2.x + 8;
  h.y = ownT2.y - 8;
  g.combat.sync(h);
  g.time = 30;
  g.bot = Game.prototype.bot;
  g.combat.creeps.push({
    dead: false,
    team: h.team,
    lane: 1,
    spawnAt: 0,
    x: h.x - 140,
    y: h.y + 140,
  });

  const before = dist(h, enemyT1);
  g.bot(h);

  assert.equal(h.task, enemyT1.id);
  assert.ok(h.target);
  assert.ok(dist(h.target, enemyT1) < before);
  assert.ok(
    dist(h.target, enemyT1) >=
      COMBAT.attackRadius + COMBAT.backdoorExtraRadius + 35 - 1e-9,
  );
});

test("opening bot advances beyond a waypoint inside the protected T1 area", () => {
  const g = setup(),
    h = g.heroes.find((hero) => hero.team === 0 && hero.preferred === 1),
    t = g.nextTower(h.preferred, h.team);
  h.gold = 0;
  t.backdoor = false;
  t.backdoorArmor = 0;
  h.thinkAt = 0;
  h.laneWaypoint = 2;
  h.x = 50 * CONFIG.mapMultiplier;
  h.y = 50 * CONFIG.mapMultiplier;
  g.combat.sync(h);
  g.time = 30;
  g.bot = Game.prototype.bot;
  g.bot(h);
  assert.equal(h.laneWaypoint, 3);
  assert.equal(h.task, t.id);
});

test("lane waypoints do not make bots pause before choosing their objective", () => {
  const g = setup(),
    h = g.heroes.find((hero) => hero.team === 0 && hero.preferred === 1),
    t = g.nextTower(h.preferred, h.team);
  h.gold = 0;
  h.thinkAt = 100;
  h.laneWaypoint = 1;
  h.x = 31 * CONFIG.mapMultiplier;
  h.y = 70 * CONFIG.mapMultiplier;
  g.combat.sync(h);
  g.time = 30;
  g.bot = Game.prototype.bot;
  g.bot(h);
  assert.equal(h.laneWaypoint, 2);
  assert.equal(h.target.x, 50 * CONFIG.mapMultiplier);
  assert.equal(h.target.y, 50 * CONFIG.mapMultiplier);
  Object.assign(h, { x: h.target.x, y: h.target.y, target: null });
  g.combat.sync(h);
  g.bot(h);
  assert.equal(h.laneWaypoint, 3);
  assert.equal(h.task, t.id);
  assert.ok(h.thinkAt < 100);
});

test("traveling bots go around enemy tower range without pausing; pursuits and sieges may enter", () => {
  const g = setup(),
    h = g.heroes.find(
      (hero) => hero.team === 0 && hero !== g.player && hero.role !== "editor",
    ),
    t = g.attackTowers(1, 0)[0],
    start = { x: t.x - 400, y: t.y },
    destination = { x: t.x + 400, y: t.y };
  g.bot = () => {};
  g.combat.tick = () => {};
  Object.assign(h, start);
  g.combat.sync(h);
  g.move(h, destination.x, destination.y);
  let closest = Infinity;
  for (let i = 0; i < 300 && h.target; i++) {
    const before = { x: h.x, y: h.y };
    g.tick(0.05);
    closest = Math.min(closest, dist(h, t));
    if (h.target) assert.ok(dist(h, before) > 0.1);
  }
  assert.equal(h.target, null);
  assert.ok(closest >= COMBAT.attackRadius + 34);
  assert.ok(dist(h, destination) < 1);

  Object.assign(h, start);
  g.move(h, destination.x, destination.y, { pursueEnemy: true });
  g.tick(400 / CONFIG.moveSpeed);
  assert.ok(dist(h, t) < COMBAT.attackRadius);

  Object.assign(h, start);
  g.move(h, t.x, t.y, { ignoreTowerId: t.id });
  g.tick(400 / CONFIG.moveSpeed);
  assert.ok(dist(h, t) < COMBAT.attackRadius);
});

test("living heroes keep separate bases without losing movement orders", () => {
  const g = setup();
  g.combat.tick = () => {};
  for (const hero of g.heroes) {
    hero.x = 100 + hero.id * 100;
    hero.y = 100;
    hero.target = null;
  }
  const [a, b] = g.heroes;
  Object.assign(a, { x: 600, y: 600 });
  Object.assign(b, { x: 610, y: 600 });
  g.move(a, 900, 600);
  g.move(b, 900, 600);

  g.tick(0.01);

  assert.ok(dist(a, b) >= CONFIG.heroSeparation - 1e-8);
  assert.ok(a.target);
  assert.ok(b.target);
});

test("regular waves spawn at the configured forty second interval", () => {
  const g = setup();
  g.combat.spawnWave();
  g.combat.nextWave = 40;
  const initial = g.combat.creeps.length;
  g.time = 39.9;
  g.combat.tick(0);
  assert.equal(g.combat.creeps.length, initial);
  g.time = 40;
  g.combat.tick(0);
  assert.equal(g.combat.creeps.length, initial * 2);
  assert.equal(COMBAT.waveSeconds, 40);
});

test("creeps attack untouched opposing creeps before heroes and buildings", () => {
  const g = setup();
  g.combat.spawnWave();
  const attacker = g.combat.creeps.find((c) => c.team === 0 && c.lane === 0);
  const untouched = g.combat.creeps.find((c) => c.team === 1 && c.lane === 0);
  const touched = g.combat.creeps.find((c) => c.team === 1 && c.lane === 1);
  for (const c of g.combat.creeps)
    if (c !== attacker && c !== untouched && c !== touched) c.dead = true;
  Object.assign(attacker, { x: 1000, y: 1000, attackAt: 0 });
  Object.assign(untouched, { x: 1010, y: 1000 });
  Object.assign(touched, { x: 1001, y: 1000 });
  g.combat.hit(attacker, touched.hp, 0);
  g.vision.refresh(true);
  const before = g.combat.hpLeft(untouched);
  g.random = () => 1;
  g.combat.creepTick(attacker, 0.1);
  assert.ok(g.combat.hpLeft(untouched) <= before);
  assert.ok(g.combat.hpLeft(touched) <= 8);
});

test("bots engage visible creeps before nearby enemy heroes", () => {
  const g = setup();
  g.combat.spawnWave();
  const bot = g.heroes.find((h) => h.team === 1 && h.role !== "editor");
  const creep = g.combat.creeps.find((c) => c.team === 0 && c.lane === 0);
  for (const u of g.combat.creeps) if (u !== creep) u.dead = true;
  for (const h of g.heroes)
    if (h !== bot) {
      h.x = 1800;
      h.y = 1800;
      if (h.team === 0) h.dead = true;
    }
  Object.assign(bot, { x: 1000, y: 1000, thinkAt: 0 });
  Object.assign(creep, { x: 1040, y: 1000 });
  g.combat.sync(bot);
  g.combat.sync(creep);
  g.vision.refresh(true);
  let attacked = null;
  g.botMove = (_h, t) => ({ index: 0, value: t.puzzles[1].solution[0] });
  g.place = (_h, t) => {
    attacked = t.unit;
    return { ok: true };
  };
  assert.equal(g.combat.botCombat(bot), true);
  assert.equal(attacked, creep);
});

test("tower armor belongs to cells and regenerates one cell at HP speed", () => {
  const g = setup(),
    t = g.nextTower(0, 0),
    h = g.player;
  g.time = 6;
  g.combat.structureTick(t);
  const cells = t.armoredCells.slice();
  assert.equal(cells.length, 5);
  const { page, index } = cells[0];
  assert.equal(page.armor[h.team][index], Infinity);
  g.selectPage(t, t.pages.indexOf(page));
  assert.equal(g.combat.hit(h, t, index), false);
  assert.equal(page.boards[h.team][index], 0);
  g.combat.structureTick(t);
  assert.equal(t.backdoorArmor, 4);
  g.time = 17.9;
  g.combat.structureTick(t);
  assert.equal(t.backdoorArmor, 4);
  g.time = 18;
  g.combat.structureTick(t);
  assert.equal(t.backdoorArmor, 5);
  const free = t.boards[h.team].findIndex(
    (value, i) => !value && !t.armor[h.team][i],
  );
  assert.ok(free >= 0);
  assert.equal(g.combat.hit(h, t, free), true);
  assert.ok(t.boards[h.team][free]);
});
