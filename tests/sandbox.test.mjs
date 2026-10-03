import test from "node:test";
import assert from "node:assert/strict";
import { Game, HEROES } from "../src/logic.js";
import { chooseScreen } from "../src/ui/dialogs.js";
import { Window } from "happy-dom";

test("test field has one tower, two live sides and no automated waves or bots", () => {
  const game = new Game(42, { sandbox: true, role: "agile" });
  assert.equal(game.towers.length, 1);
  assert.deepEqual(
    game.locations.map((target) => target.kind),
    ["tower"],
  );
  assert.deepEqual(
    game.heroes.map((hero) => hero.team),
    [0, 1],
  );
  assert.ok(
    game.heroes.every((hero) => hero.gold === 9999 && hero.digits === 99),
  );
  game.start();
  game.tick(81);
  assert.equal(game.combat.creeps.length, 0);
  assert.equal(game.heroes[1].gold, 10039); // passive income, no bot purchases
  assert.equal(game.heroes[1].target, null);
});

test("any role can replace either test hero; switching side changes the actual player POV", () => {
  const game = new Game(42, { sandbox: true });
  game.start();
  for (const team of [0, 1])
    for (const role of HEROES) {
      assert.equal(game.spawnTestHero(role.id, team), true);
      assert.equal(game.heroes[team].role, role.id);
      assert.equal(game.heroes[team].hp.unit, game.heroes[team]);
      assert.equal(game.controlTestTeam(team), true);
      assert.equal(game.player, game.heroes[team]);
      assert.equal(game.vision.visible(team, game.player), true);
      assert.ok(game.vision.visible(team, game.heroes[1 - team]));
    }
  assert.equal(game.spawnTestHero("unknown", 0), false);
  assert.equal(game.controlTestTeam(2), false);
});

test("test hero skills and Sudoku damage still use the shared combat model", () => {
  const game = new Game(43, { sandbox: true, role: "editor" });
  game.start();
  const editor = game.player,
    enemy = game.heroes[1];
  assert.ok(game.upgradeSkill(editor, "inkBinding").ok);
  assert.ok(game.inkBinding.cast(editor, editor).ok);
  assert.ok(game.inkBinding.blocked(enemy, editor.hp).length > 0);
  const index = game.inkBinding.state(enemy, editor.hp).available[0];
  enemy.x = editor.x + 10;
  enemy.y = editor.y + 10;
  game.vision.refresh(true);
  assert.ok(
    game.place(
      enemy,
      editor.hp,
      index,
      editor.hp.puzzles[1].solution[index],
      "universal",
    ).ok,
  );
  assert.equal(game.controlTestTeam(1), true);
  assert.equal(game.player, enemy);
  assert.equal(game.board(enemy, editor.hp)[index] > 0, true);
});

test("the lone tower remains attackable after the normal backdoor delay", () => {
  const game = new Game(43, { sandbox: true });
  game.start();
  const tower = game.towers[0];
  game.time = 10;
  game.combat.structureTick(tower);
  assert.equal(tower.backdoor, false);
  const hero = game.player;
  hero.x = tower.x + 1;
  hero.y = tower.y + 1;
  game.combat.sync(hero);
  game.vision.refresh(true);
  const index = tower.boards[hero.team].findIndex((value) => !value);
  assert.ok(
    game.place(
      hero,
      tower,
      index,
      tower.puzzles[hero.team].solution[index],
      "pen",
    ).ok,
  );
});

test("hero selection exposes the separate test field", () => {
  const window = new Window();
  globalThis.document = window.document;
  try {
    document.body.innerHTML = '<dialog id="heroSelect"></dialog>';
    chooseScreen(true);
    assert.ok(
      document.querySelector('[data-mode="sandbox"][aria-current="true"]'),
    );
    assert.equal(
      document.querySelectorAll("[data-role]").length,
      HEROES.length,
    );
    document.querySelector("#heroSelect").close();
  } finally {
    delete globalThis.document;
    window.happyDOM.abort();
  }
});

test("ordinary match roster remains five per side", () => {
  const game = new Game(42);
  assert.deepEqual(
    [0, 1].map(
      (team) => game.heroes.filter((hero) => hero.team === team).length,
    ),
    [5, 5],
  );
  assert.equal(game.sandbox, false);
});

test("normal matches keep ordinary starting resources for every hero", () => {
  for (const role of ["agile", "editor", "sudzh"]) {
    const game = new Game(42, { role });
    assert.ok(
      game.heroes.every((hero) => hero.gold === 100 && hero.digits === 3),
    );
  }
});

test("test cooldown reset restores both sides without ending effects or changing normal matches", () => {
  const game = new Game(42, { sandbox: true, role: "duet" });
  game.start();
  game.time = 5;
  const h = game.player;
  h.stubbornAt = 80;
  h.throwOkaAt = 90;
  h.headOnAt = 100;
  h.nextNormal = 20;
  h.stunnedUntil = 30;
  game.heroes[1].heroSkillAt = 50;
  game.heroes[1].nextNormal = 15;
  game.duet.state(h).shieldUntil = 8;
  assert.equal(game.resetTestCooldowns(), true);
  for (const field of ["stubbornAt", "throwOkaAt", "headOnAt", "nextNormal"])
    assert.equal(h[field], 5);
  assert.equal(game.heroes[1].heroSkillAt, 5);
  assert.equal(game.heroes[1].nextNormal, 5);
  assert.equal(h.stunnedUntil, 30);
  assert.equal(game.duet.state(h).shieldUntil, 8);
  const normal = new Game(42, { role: "duet" });
  normal.start();
  normal.player.stubbornAt = 30;
  assert.equal(normal.resetTestCooldowns(), false);
  assert.equal(normal.player.stubbornAt, 30);
});
