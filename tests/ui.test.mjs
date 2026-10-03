import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { Window } from "happy-dom";
import { build } from "esbuild";
import { renderMarkup, animateHints } from "../src/ui/dom.js";
import { combatHUD } from "../src/combat-ui.js";
import { Game } from "../src/logic.js";
import { puzzleHTML } from "../src/ui/puzzle.js";
import { renderMatchScore } from "../src/ui/match-score.js";

test("match scoreboard shows team hero kills, health and respawn without replacing portraits", async () => {
  const w = new Window();
  globalThis.document = w.document;
  try {
    document.body.innerHTML =
      '<div id="matchTeamA"></div><b id="scoreA"></b><span id="clock"></span><b id="scoreB"></b><div id="matchTeamB"></div>';
    const g = new Game();
    g.start();
    g.time = 70;
    g.score = [4, 2];
    g.vision.visible = () => false;
    renderMatchScore(g);
    assert.equal(
      document.querySelectorAll("#matchTeamA .match-hero").length,
      5,
    );
    assert.equal(
      document.querySelectorAll("#matchTeamB .match-hero").length,
      5,
    );
    assert.equal(document.querySelector("#scoreA").textContent, "0");
    assert.equal(document.querySelector("#scoreB").textContent, "0");
    assert.equal(document.querySelector("#clock").textContent, "01:10");

    const h = g.player,
      ally = g.heroes.find((hero) => hero.team === h.team && hero !== h),
      enemy = g.heroes.find((hero) => hero.team !== h.team),
      liveEnemy = g.heroes.find(
        (hero) => hero.team !== h.team && hero !== enemy,
      ),
      card = document.querySelector(`[data-match-hero="${enemy.id}"]`),
      portrait = card.querySelector("img"),
      playerCard = document.querySelector(`[data-match-hero="${h.id}"]`),
      liveEnemyCard = document.querySelector(
        `[data-match-hero="${liveEnemy.id}"]`,
      );
    assert.ok(playerCard.classList.contains("you"));
    assert.ok(
      portrait.src.endsWith(
        (await import("../src/hero-animation.js")).HERO_ANIMATION_MANIFEST[
          enemy.role
        ].idle.file,
      ),
    );

    g.combat.kill(enemy, h);
    // A tower kill still belongs to its team even without a hero kill credit.
    g.combat.kill(ally, { team: enemy.team, id: "tower" });
    h.hp.boards[1 - h.team].fill(1, 0, 8);
    liveEnemy.hp.boards[h.team].fill(1, 0, 8);
    renderMatchScore(g);
    assert.equal(document.querySelector("#scoreA").textContent, "1");
    assert.equal(document.querySelector("#scoreB").textContent, "1");
    assert.deepEqual(g.score, [4, 2]);
    assert.equal(
      document.querySelector(`[data-match-hero="${enemy.id}"]`),
      card,
    );
    assert.equal(card.querySelector("img"), portrait);
    assert.ok(card.classList.contains("dead"));
    assert.equal(card.querySelector(".match-respawn").textContent, "12");
    assert.equal(card.querySelector(".match-health i").style.width, "0%");
    assert.equal(
      playerCard.querySelector(".match-health i").style.width,
      "50%",
    );
    assert.match(playerCard.getAttribute("aria-label"), /Здоровье 8\/16/);
    assert.equal(
      liveEnemyCard.querySelector(".match-health i").style.width,
      "100%",
    );
    assert.ok(liveEnemyCard.classList.contains("health-hidden"));
    assert.match(liveEnemyCard.title, /В строю/);

    g.time += 2.2;
    g.vision.visible = () => true;
    renderMatchScore(g);
    assert.equal(card.querySelector(".match-respawn").textContent, "10");
    assert.equal(
      liveEnemyCard.querySelector(".match-health i").style.width,
      "50%",
    );
    assert.ok(!liveEnemyCard.classList.contains("health-hidden"));

    g.time = enemy.respawnAt;
    g.combat.respawn(enemy);
    renderMatchScore(g);
    assert.ok(!card.classList.contains("dead"));
    assert.equal(card.querySelector(".match-respawn").textContent, "");
    assert.equal(card.querySelector(".match-health i").style.width, "100%");
    assert.equal(document.querySelector("#scoreA").textContent, "1");
    assert.equal(card.querySelector("img"), portrait);

    g.combat.newHealth(h, 9);
    g.combat.healthPages(h.hp)[1].boards[1 - h.team].fill(1);
    renderMatchScore(g);
    assert.match(playerCard.title, /Здоровье 36\/52/);
  } finally {
    delete globalThis.document;
    await w.happyDOM.abort();
  }
});

test("match portraits follow hero selection and reuse the standalone sprite assets", async () => {
  const w = new Window();
  globalThis.document = w.document;
  globalThis.SUDOTA_HERO_ASSETS = {
    "sudaks-idle.webp": "data:image/webp;base64,c3ByaXRl",
  };
  try {
    document.body.innerHTML =
      '<div id="matchTeamA"></div><b id="scoreA"></b><span id="clock"></span><b id="scoreB"></b><div id="matchTeamB"></div>';
    const g = new Game();
    renderMatchScore(g);
    assert.equal(document.querySelector("#clock").textContent, "Подготовка");
    const card = document.querySelector('[data-match-hero="0"]');
    g.chooseHero("sudaks");
    renderMatchScore(g);
    assert.equal(document.querySelector('[data-match-hero="0"]'), card);
    assert.match(card.title, /^Судакс · вы/);
    assert.equal(
      card.querySelector("img").src,
      SUDOTA_HERO_ASSETS["sudaks-idle.webp"],
    );
  } finally {
    delete globalThis.document;
    delete globalThis.SUDOTA_HERO_ASSETS;
    await w.happyDOM.abort();
  }
});

test("automatic digits fade in over one second", () => {
  const w = new Window();
  const root = w.document.createElement("div");
  renderMarkup(root, '<span data-appear-at="10">4</span>');
  const digit = root.firstChild;
  animateHints(root, 10);
  assert.equal(digit.style.opacity, "0");
  animateHints(root, 10.5);
  assert.ok(Math.abs(Number(digit.style.opacity) - 0.5) < 0.001);
  animateHints(root, 11);
  assert.equal(digit.style.opacity, "1");
});

test("unchanged markup preserves focused buttons despite boolean-attribute normalization", async () => {
  const w = new Window();
  try {
    const root = w.document.createElement("div");
    w.document.body.append(root);
    const html =
      '<button data-praise="1" disabled>Хорошо сыграно!</button><button data-cell="0">1</button>';
    renderMarkup(root, html);
    const disabled = root.firstChild,
      cell = root.lastChild;
    cell.focus();
    assert.equal(renderMarkup(root, html), false);
    assert.equal(root.firstChild, disabled);
    renderMarkup(root, html.replace(">1<", ">2<"));
    assert.equal(root.lastChild, cell);
    assert.equal(cell.textContent, "2");
    assert.equal(w.document.activeElement, cell);
  } finally {
    await w.happyDOM.abort();
  }
});
test("inserting an optional heading preserves keyed grid and existing cells", async () => {
  const w = new Window();
  try {
    const root = w.document.createElement("div");
    renderMarkup(
      root,
      '<div data-ui-key="grid"><button data-cell="0">1</button></div>',
    );
    const grid = root.firstChild,
      cell = grid.firstChild;
    renderMarkup(
      root,
      '<p>Бекдор</p><div data-ui-key="grid"><button data-cell="0">2</button></div>',
    );
    assert.equal(root.lastChild, grid);
    assert.equal(grid.firstChild, cell);
    assert.equal(cell.textContent, "2");
    renderMarkup(
      root,
      '<div data-ui-key="grid"><button data-cell="0">3</button></div>',
    );
    assert.equal(root.firstChild, grid);
    assert.equal(root.childNodes.length, 1);
  } finally {
    await w.happyDOM.abort();
  }
});
test("combat HUD reuses roster and health elements on identical state", async () => {
  const w = new Window();
  globalThis.document = w.document;
  try {
    document.body.innerHTML =
      '<div id="healthHUD"></div><div id="teamRoster"></div><aside id="questBoard"></aside>';
    const g = new Game();
    combatHUD(g);
    const button = document.querySelector("[data-praise]"),
      health = document.querySelector("#healthHUD strong");
    combatHUD(g);
    assert.equal(document.querySelector("[data-praise]"), button);
    assert.equal(document.querySelector("#healthHUD strong"), health);
  } finally {
    delete globalThis.document;
    await w.happyDOM.abort();
  }
});
test("health miniature projects burning, poison and rune effects on independent pages", () => {
  const w = new Window();
  globalThis.document = w.document;
  try {
    document.body.innerHTML =
      '<div id="healthHUD"></div><div id="teamRoster"></div><aside id="questBoard"></aside>';
    const g = new Game(),
      h = g.player,
      team = 1 - h.team;
    g.combat.newHealth(h, 9);
    const [first, second] = h.hp.pages;
    first.boards[team][0] = first.puzzles[team].solution[0];
    first.burning[team][0] = { until: 10, token: 1 };
    first.boards[team][1] = first.puzzles[team].solution[1];
    first.poison[team][1] = 1;
    second.runeBinding = { team, until: 10, keys: [2, 3], z: 4, level: 1 };
    combatHUD(g);
    const burning = document.querySelector('[data-ui-key="health-cell-0-0"]');
    assert.ok(burning.classList.contains("burning"));
    assert.ok(
      document
        .querySelector('[data-ui-key="health-cell-0-1"]')
        .classList.contains("poisoned"),
    );
    assert.match(
      document.querySelector('[data-ui-key="health-cell-1-2"]').textContent,
      /A/,
    );
    assert.ok(
      document
        .querySelector('[data-ui-key="health-cell-1-4"]')
        .classList.contains("rune-sealed"),
    );
    g.time = 11;
    combatHUD(g);
    assert.equal(
      document.querySelector('[data-ui-key="health-cell-0-0"]'),
      burning,
    );
    assert.ok(!burning.classList.contains("burning"));
    assert.ok(
      !document
        .querySelector('[data-ui-key="health-cell-1-4"]')
        .classList.contains("rune-sealed"),
    );
    assert.equal(h.hp.activePage, 0);
  } finally {
    delete globalThis.document;
    w.happyDOM.abort();
  }
});
test("hero health miniature shows numeric damage with independent page cells", async () => {
  const w = new Window();
  globalThis.document = w.document;
  try {
    document.body.innerHTML =
      '<div id="healthHUD"></div><div id="teamRoster"></div><aside id="questBoard"></aside>';
    const g = new Game(),
      h = g.player,
      team = 1 - h.team;
    h.hp.boards[team][0] = 4;
    combatHUD(g);
    const cell = document.querySelector('[data-ui-key="health-cell-0-0"]');
    assert.equal(document.querySelectorAll(".health-cell").length, 16);
    assert.equal(cell.textContent, "4");
    assert.ok(cell.classList.contains("hurt"));
    assert.equal(
      document.querySelector('[data-ui-key="health-cell-0-1"]').textContent,
      "",
    );
    assert.ok(
      document
        .querySelector('[data-ui-key="health-cell-0-1"]')
        .classList.contains("block-right"),
    );
    h.hp.boards[team][0] = 2;
    combatHUD(g);
    assert.equal(
      document.querySelector('[data-ui-key="health-cell-0-0"]'),
      cell,
    );
    assert.equal(cell.textContent, "2");
    g.combat.newHealth(h, 9);
    const pages = g.combat.healthPages(h.hp);
    pages[0].boards[team][0] = 6;
    pages[1].boards[team][0] = 3;
    combatHUD(g);
    assert.equal(document.querySelectorAll(".health-cell").length, 52);
    assert.equal(
      document.querySelector('[data-ui-key="health-cell-0-0"]').textContent,
      "6",
    );
    assert.equal(
      document.querySelector('[data-ui-key="health-cell-1-0"]').textContent,
      "3",
    );
    assert.equal(document.querySelectorAll(".health-page").length, 2);
  } finally {
    delete globalThis.document;
    await w.happyDOM.abort();
  }
});

test("armored Sudoku cells have a gray class and reveal no solution or hint digit", async () => {
  const w = new Window(),
    g = new Game();
  g.start();
  const enemy = g.heroes.find((h) => h.team !== g.player.team),
    t = enemy.hp,
    team = g.player.team;
  Object.assign(enemy, { x: g.player.x, y: g.player.y });
  g.combat.sync(enemy);
  t.armor[team][0] = g.time + 10;
  g.hints = () => [{ index: 0, value: t.puzzles[team].solution[0] }];
  const root = w.document.createElement("div");
  renderMarkup(
    root,
    puzzleHTML(g, t, g.player, {
      selected: 0,
      notes: false,
      spy: false,
      skill: null,
    }),
  );
  const cell = root.querySelector('[data-cell="0"]');
  assert.ok(cell.classList.contains("armored"));
  assert.equal(cell.textContent, "");
  assert.equal(cell.querySelector(".armor-digit"), null);
  await w.happyDOM.abort();
});
test("application bundles and keeps a selected Sudoku cell through income, input and shop updates", async () => {
  const entry = await fs.readFile("src/app.js", "utf8");
  const bundle = await build({
    stdin: {
      contents:
        entry +
        "\nglobalThis.probe={get game(){return game},get renderer(){return renderer},openPuzzle,openSpy,ui,inputDigit,frame,toast};",
      resolveDir: path.resolve("src"),
    },
    bundle: true,
    write: false,
    format: "iife",
    target: "es2022",
  });
  const w = new Window({
    settings: {
      disableCSSFileLoading: true,
      disableJavaScriptFileLoading: true,
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
  try {
    w.document.write(
      (await fs.readFile("index.html", "utf8")).replace(
        /<script[\s\S]*?<\/script>/g,
        "",
      ),
    );
    const ctx = new Proxy(
      { createRadialGradient: () => ({ addColorStop() {} }) },
      {
        get: (o, k) => (k in o ? o[k] : () => {}),
        set: (o, k, v) => ((o[k] = v), true),
      },
    );
    w.HTMLCanvasElement.prototype.getContext = () => ctx;
    w.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
      width: 1440,
      height: 670,
      left: 0,
      top: 0,
    });
    w.requestAnimationFrame = () => 1;
    w.structuredClone = structuredClone;
    w.eval(bundle.outputFiles[0].text);
    const d = w.document;
    const hintsButton = d.querySelector("#hintsButton");
    assert.equal(hintsButton.getAttribute("aria-pressed"), "false");
    w.probe.toast("Установка отменена");
    assert.ok(!d.querySelector("#toast").classList.contains("toast"));
    hintsButton.click();
    assert.equal(w.localStorage.getItem("sudota-hints"), "on");
    w.probe.toast("Выберите место");
    assert.ok(d.querySelector("#toast").classList.contains("toast"));
    hintsButton.click();
    assert.equal(w.localStorage.getItem("sudota-hints"), "off");
    assert.ok(!d.querySelector("#toast").classList.contains("toast"));
    assert.equal(d.querySelectorAll("[data-role]").length, 7);
    d.querySelector('[data-role="intellect"]').click();
    assert.ok(d.querySelector('[data-upgrade="phantoms"]'));
    assert.ok(
      d.querySelector(
        '[data-ui-key="skill-phantoms"] .action-slot.passive-token',
      ),
    );
    assert.equal(d.querySelector('[title="Пассивная особенность"]'), null);
    d.querySelector('[data-action="start"]').click();
    const g = w.probe.game,
      t = g.nextTower(0, 0);
    assert.equal(d.querySelector("#playerHealthBar").textContent, "16/16");
    const hpPage = g.combat.healthPages(g.player.hp)[0],
      attackTeam = 1 - g.player.team;
    for (const i of [0, 7, 12])
      hpPage.boards[attackTeam][i] = hpPage.puzzles[attackTeam].solution[i];
    hpPage.poison[attackTeam][0] = g.time + 8;
    hpPage.universal[attackTeam][7] = g.time + 20;
    hpPage.burning[attackTeam][12] = { until: g.time + 7 };
    w.probe.ui();
    const hpSegments = [...d.querySelectorAll("#playerHealthBar .hp-segment")];
    assert.equal(hpSegments.length, 16);
    assert.ok(
      hpSegments
        .slice(0, 13)
        .every((cell) => cell.classList.contains("healthy")),
    );
    assert.ok(
      hpSegments.slice(13).every((cell) => cell.classList.contains("damaged")),
    );
    assert.ok(hpSegments[13].classList.contains("poisoned"));
    assert.ok(hpSegments[14].classList.contains("universal"));
    assert.ok(d.querySelector("#healthHUD .universal-digit"));
    assert.ok(hpSegments[15].classList.contains("burning"));
    for (const i of [0, 7, 12]) hpPage.boards[attackTeam][i] = 0;
    delete hpPage.poison[attackTeam][0];
    delete hpPage.universal[attackTeam][7];
    delete hpPage.burning[attackTeam][12];
    w.probe.ui();

    assert.equal(d.querySelector("#healthHUD .health-value"), null);
    assert.equal(d.querySelector("#praiseArrow"), null);
    assert.equal(d.querySelectorAll(".match-praise").length, 10);
    assert.equal(d.querySelectorAll(".match-praise .praise-icon").length, 10);
    t.backdoorArmor = 0;
    Object.assign(g.player, { x: t.x, y: t.y });
    w.probe.openPuzzle(t);
    const guide = g.hints(g.player, t)[0],
      cell = d.querySelector(`[data-cell="${guide.index}"]`),
      grid = cell.parentNode;
    cell.click();
    cell.focus();
    assert.equal(d.querySelector(`[data-cell="${guide.index}"]`), cell);
    g.player.gold++;
    w.probe.ui();
    assert.equal(d.querySelector(".sudoku-grid"), grid);
    assert.equal(d.activeElement, cell);
    g.player.digits = 1;
    w.probe.ui();
    d.querySelector(`[data-digit="${guide.value}"]`).click();
    assert.equal(t.boards[0][guide.index], guide.value);
    assert.equal(d.querySelector(`[data-cell="${guide.index}"]`), cell);
    const universalIndex = t.boards[0].findIndex((v) => !v);
    d.querySelector(`[data-cell="${universalIndex}"]`).dispatchEvent(
      new w.MouseEvent("click", { bubbles: true }),
    );
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", {
        code: "Space",
        key: " ",
        bubbles: true,
      }),
    );
    assert.equal(
      t.boards[0][universalIndex],
      t.puzzles[0].solution[universalIndex],
    );
    assert.equal(g.player.digits, 0);
    g.player.digits = 1;
    const repeatIndex = t.boards[0].findIndex((v) => !v);
    d.querySelector(`[data-cell="${repeatIndex}"]`).click();
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", {
        code: "Space",
        key: " ",
        repeat: true,
        bubbles: true,
      }),
    );
    assert.equal(g.player.digits, 1);
    const panelBeforePause = d.querySelector(".sudoku-grid");
    const pauseKey = new w.KeyboardEvent("keydown", {
      code: "F1",
      key: "F1",
      bubbles: true,
      cancelable: true,
    });
    d.dispatchEvent(pauseKey);
    assert.equal(pauseKey.defaultPrevented, true);
    assert.equal(d.querySelector("#pauseOverlay").hidden, false);
    const miniSize = d.querySelector("#miniSize");
    miniSize.value = "320";
    miniSize.dispatchEvent(new w.Event("input", { bubbles: true }));
    assert.equal(
      d.documentElement.style.getPropertyValue("--mini-size"),
      "320px",
    );
    d.querySelector('[data-bind="skill1"]').click();
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "u", code: "KeyU", bubbles: true }),
    );
    assert.equal(d.querySelector('[data-bind="skill1"]').textContent, "U");
    assert.equal(
      d.querySelector('[data-skill-hotkey="Q"] kbd').textContent,
      "U",
    );
    assert.match(w.localStorage.getItem("sudota-settings"), /KeyU/);
    d.querySelector("#resetSettings").click();

    assert.equal(d.querySelector(".sudoku-grid"), panelBeforePause);
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { code: "F1", key: "F1", bubbles: true }),
    );
    assert.equal(d.querySelector("#pauseOverlay").hidden, true);

    const creep = g.combat.creeps.find((u) => u.team === 1);
    Object.assign(g.player, { x: creep.x, y: creep.y });
    w.probe.openPuzzle(creep.hp);
    assert.ok(d.querySelector("#panel").classList.contains("creep-panel"));
    assert.equal(d.querySelectorAll("#panel [data-cell]").length, 16);
    assert.equal(d.querySelector("#panel .panel-heading"), null);
    assert.equal(d.querySelector("#panel .digit-pad"), null);
    assert.deepEqual(g.hints(g.player, creep.hp), []);
    const creepIndex = creep.hp.boards[0].findIndex((v) => !v),
      creepValue = creep.hp.puzzles[0].solution[creepIndex];
    d.querySelector(`#panel [data-cell="${creepIndex}"]`).click();
    g.player.nextNormal = 0;
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", {
        key: String(creepValue),
        bubbles: true,
      }),
    );
    assert.equal(creep.hp.boards[0][creepIndex], creepValue);
    g.player.role = "editor";
    w.probe.openSpy(g.nextTower(0, 1));
    assert.ok(d.querySelector("#panel").classList.contains("enemy-panel"));
    d.querySelector("#shopArrow").click();
    const select = d.querySelector("#recipientSelect");
    select.value = "1";
    select.dispatchEvent(new w.Event("change", { bubbles: true }));
    assert.equal(d.querySelector("#recipientSelect"), select);
    assert.equal(select.value, "1");
    const praiseMovement = g.player.target;
    d.querySelector('[data-praise="1"]').click();
    assert.equal(g.player.target, praiseMovement);
    assert.ok(d.querySelector('[data-praise="1"]').disabled);
    assert.equal(g.heroes[1].praise, 1);
    const captor = g.heroes.find((h) => h.team === 1);
    captor.role = "combinator";
    g.progression.initialize(captor);
    Object.assign(captor, { x: g.player.x, y: g.player.y });
    captor.skillRanks.box = 1;
    assert.ok(g.heroSkill(captor, g.player).ok);
    w.probe.ui();
    assert.match(d.querySelector("#panel h2").textContent, /Судоку-коробка/);
    assert.equal(d.querySelector("#panel .close"), null);
    assert.ok(d.querySelector("#panel").classList.contains("prison-panel"));
    assert.equal(d.querySelectorAll("#panel [data-cell]").length, 16);
    const box = g.player.prison;
    for (let i = 0; i < 16; i++) {
      if (box.boards[0][i]) continue;
      d.querySelector(`#panel [data-cell="${i}"]`).click();
      w.probe.inputDigit(box.puzzles[0].solution[i]);
    }
    assert.equal(g.player.prison, null);
    w.probe.frame(1000);
    w.probe.frame(1120);
    g.player.role = "sudaks";
    g.player.skillRanks.cry = 1;
    g.player.skillRanks.burning = 1;
    w.probe.ui();
    assert.equal(d.querySelectorAll(".skill-button").length, 3);
    assert.equal(d.querySelector(".passive-token"), null);
    assert.ok(d.querySelector('[data-action="burning-skill"] .skill-icon'));
    assert.match(
      d.querySelector('[data-action="hero-skill"] + .skill-detail').textContent,
      /Боевой клич/,
    );
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Alt", bubbles: true }),
    );
    assert.ok(d.body.classList.contains("alt-held"));
    d.dispatchEvent(
      new w.KeyboardEvent("keyup", { key: "Alt", bubbles: true }),
    );
    assert.ok(!d.body.classList.contains("alt-held"));
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Meta", bubbles: true }),
    );
    assert.ok(d.body.classList.contains("alt-held"));
    d.dispatchEvent(
      new w.KeyboardEvent("keyup", { key: "Meta", bubbles: true }),
    );
    assert.ok(!d.body.classList.contains("alt-held"));
    assert.equal(
      d.querySelector('[data-action="burning-skill"] kbd').textContent,
      "W",
    );
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    const chatInput = d.querySelector("#chatInput");
    assert.equal(d.querySelector("#chatComposer").hidden, false);
    chatInput.dispatchEvent(
      new w.KeyboardEvent("keydown", {
        key: "Tab",
        code: "Tab",
        bubbles: true,
      }),
    );
    assert.equal(d.querySelector("#chatScope").textContent, "Команде");
    chatInput.value = "<hello>";
    chatInput.dispatchEvent(
      new w.KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    assert.equal(g.chat.messages.at(-1).channel, "team");
    assert.match(d.querySelector("#chatLog").textContent, /<hello>/);
    assert.equal(d.querySelector("#chatLog hello"), null);
    g.player.bootTier = 1;
    w.probe.ui();
    assert.ok(d.querySelector('#passiveItems [data-item="boots1"] img'));
    assert.match(
      d.querySelector('[data-ui-key="skill-burning"] .skill-detail')
        .textContent,
      /огненный шар/,
    );
    assert.equal(
      d.querySelector('[data-ui-key="skill-burning"] .skill-ranks').children
        .length,
      4,
    );
    assert.ok(d.querySelector("#miniMap"));
    g.player.bootTier = 0;
    g.player.heroSkillAt = g.time + 30;
    g.player.fireCharges = { count: 0, nextAt: g.time + 22.5 };
    w.probe.ui();
    assert.equal(
      d
        .querySelector('[data-action="hero-skill"]')
        .style.getPropertyValue("--cooldown-progress"),
      "60%",
    );
    assert.equal(
      d
        .querySelector('[data-action="burning-skill"]')
        .style.getPropertyValue("--cooldown-progress"),
      "62.5%",
    );
    const enemy = g.heroes.find((unit) => unit.team !== g.player.team);
    Object.assign(enemy, { dead: false, x: g.player.x + 40, y: g.player.y });
    g.player.dead = false;
    g.combat.sync(enemy);
    g.vision.refresh();
    g.player.stunnedUntil = 0;
    g.player.fireCharges = { count: 1, nextAt: g.time + 60 };
    w.probe.ui();
    let qPressed = 0;
    const burningButton = d.querySelector('[data-action="burning-skill"]');
    burningButton.addEventListener("click", () => qPressed++);
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "w", code: "KeyW", bubbles: true }),
    );
    assert.equal(qPressed, 1);
    const sudaks = g.heroes.find((unit) => unit.team !== g.player.team);
    sudaks.role = "sudaks";
    Object.assign(sudaks, { dead: false, x: g.player.x, y: g.player.y });
    g.combat.sync(sudaks);
    g.player.forcedSolve = { targetId: sudaks.id, until: g.time + 10 };
    g.player.role = "intellect";
    g.player.stunnedUntil = 0;
    sudaks.hp.boards[0].fill(0);
    w.probe.ui();
    d.querySelector('#panel [data-cell="5"]').click();
    g.player.nextNormal = 0;
    g.player.digits = 0;
    w.probe.inputDigit(sudaks.hp.puzzles[0].solution[5], true);
    w.probe.ui();
    assert.ok(
      d.querySelector('#panel [data-cell="5"]').classList.contains("selected"),
    );
    d.querySelector('#panel [data-cell="9"]').click();
    w.probe.ui();
    assert.ok(
      d.querySelector('#panel [data-cell="9"]').classList.contains("selected"),
    );
    g.player.forcedSolve = null;
    d.querySelector('[data-action="close"]').click();
    assert.equal(g.player.animationTargetId, null);

    // Real input handlers: preview at the last mouse position, then walk and place.
    g.bot = () => {};
    g.combat.tick = () => {};
    g.heroEffects.tick = () => {};
    g.wards.list = [];
    for (const hero of g.heroes)
      if (hero !== g.player)
        Object.assign(hero, { x: 100, y: 2000, target: null });
    Object.assign(g.player, {
      dead: false,
      x: 1000,
      y: 1000,
      target: null,
      forcedSolve: null,
      stunnedUntil: 0,
    });
    g.player.consumables.ward = 2;
    const renderer = w.probe.renderer,
      map = d.querySelector("#map"),
      chosen = { x: 1250, y: 1100 };
    renderer.follow = false;
    const mouse = renderer.p(chosen.x, chosen.y);
    w.probe.ui();
    map.dispatchEvent(
      new w.PointerEvent("pointermove", {
        clientX: mouse.x,
        clientY: mouse.y,
        bubbles: true,
      }),
    );
    const wardKey = () =>
      d.dispatchEvent(
        new w.KeyboardEvent("keydown", {
          key: "xcvb"[
            [...d.querySelectorAll("#purchasedItems [data-use]")].findIndex(
              (b) => b.dataset.use === "ward",
            )
          ],
          code:
            "Key" +
            "XCVB"[
              [...d.querySelectorAll("#purchasedItems [data-use]")].findIndex(
                (b) => b.dataset.use === "ward",
              )
            ],
          bubbles: true,
        }),
      );
    const confirmWard = () =>
      map.dispatchEvent(
        new w.MouseEvent("click", {
          clientX: mouse.x,
          clientY: mouse.y,
          bubbles: true,
        }),
      );
    wardKey();
    assert.ok(Math.abs(renderer.wardPreview.x - chosen.x) < 1e-7);
    assert.ok(Math.abs(renderer.wardPreview.y - chosen.y) < 1e-7);
    assert.equal(g.wards.active(0).length, 0);
    confirmWard();
    assert.equal(renderer.wardPreview, null);
    assert.ok(g.player.wardPlacement);
    assert.equal(g.player.consumables.ward, 2);
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    assert.equal(g.player.wardPlacement, null);
    assert.equal(g.player.target, null);
    wardKey();
    confirmWard();
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "F1", code: "F1", bubbles: true }),
    );
    const pausedAt = g.time;
    w.probe.frame(2000);
    w.probe.frame(2200);
    assert.equal(g.time, pausedAt);
    assert.equal(g.player.consumables.ward, 2);
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "F1", code: "F1", bubbles: true }),
    );
    for (let i = 0; i < 60 && g.player.wardPlacement; i++)
      w.probe.frame(2300 + i * 100);
    const placedWard = g.wards.active(0)[0];
    assert.ok(placedWard);
    assert.ok(Math.abs(placedWard.x - chosen.x) < 1e-7);
    assert.ok(Math.abs(placedWard.y - chosen.y) < 1e-7);
    assert.equal(g.player.consumables.ward, 1);
    assert.equal(g.player.wardPlacement, null);
    const inspected = g.heroes.find(
      (u) => u.team === g.player.team && u !== g.player,
    );
    g.combat.newHealth(inspected, 9);
    inspected.hp.pages[1].boards[1 - g.player.team][1] =
      inspected.hp.pages[1].puzzles[1 - g.player.team].solution[1];
    const priorHit = w.probe.renderer.hit;
    w.probe.renderer.hit = () => inspected.hp;
    g.player.target = { x: 1300, y: 1400 };
    const priorTarget = g.player.target;
    d.querySelector("#map").dispatchEvent(
      new w.MouseEvent("click", {
        bubbles: true,
        altKey: true,
        clientX: 10,
        clientY: 10,
      }),
    );
    assert.equal(g.player.target, priorTarget);
    assert.match(d.querySelector("#panel").textContent, /Предметы:/);
    d.querySelector('[data-page="1"]').click();
    assert.equal(inspected.hp.activePage, 0);
    assert.equal(d.querySelectorAll("#panel [data-cell]").length, 16);
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    assert.equal(d.querySelector("#panel").hidden, true);
    w.probe.renderer.hit = priorHit;
    g.player.role = "editor";
    g.player.skillRanks.abduction = 1;
    g.player.target = { x: 1500, y: 1500 };
    w.probe.ui();
    const movementBeforeAim = g.player.target;
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "r", code: "KeyR", bubbles: true }),
    );
    assert.equal(renderer.allySkillTargeting.id, "abduction");
    assert.equal(g.player.target, movementBeforeAim);
    assert.equal(
      d
        .querySelector('[data-action="abduction-skill"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    assert.ok(!renderer.allySkillTargeting.active);
    const carrier = g.heroes.find((u) => u.team !== g.player.team);
    carrier.dead = false;
    carrier.role = "editor";
    carrier.skillRanks.abduction = 1;
    carrier.x = g.player.x;
    carrier.y = g.player.y;
    assert.ok(g.abduction.cast(carrier, g.player).ok);
    assert.doesNotThrow(() => w.probe.ui());
    g.abduction.release(carrier);
  } finally {
    await w.happyDOM.abort();
  }
});

test("styles parse and no longer contain removed lane, card-mode or 12×12 UI", async () => {
  const { default: postcss } = await import("postcss");
  const styles = await build({
    entryPoints: ["style.css"],
    bundle: true,
    write: false,
  });
  const root = postcss.parse(styles.outputFiles[0].text);
  const rules = new Map();
  root.walkRules((rule) => rules.set(rule.selector, rule));
  assert.equal(
    rules
      .get(".alt-held .skill-slot-wrap:hover .skill-detail")
      ?.nodes.find((node) => node.prop === "display")?.value,
    "block",
  );
  assert.equal(
    rules
      .get("#healthHUD .health-pages")
      ?.nodes.find((node) => node.prop === "display")?.value,
    "flex",
  );
  assert.equal(
    rules
      .get(".alt-held #healthHUD .health-pages")
      ?.nodes.find((node) => node.prop === "visibility")?.value,
    undefined,
  );
  assert.equal(
    rules
      .get(".puzzle-panel .cell.armored")
      ?.nodes.find((node) => node.prop === "background")?.value,
    "#bfc5c8",
  );
  assert.equal(
    rules
      .get("#healthHUD .health-cell")
      ?.nodes.find((node) => node.prop === "aspect-ratio")?.value,
    "1",
  );
  root.walkRules((rule) =>
    assert.doesNotMatch(
      rule.selector,
      /\.(lane-tracker|mode-tabs|size-12|gear-summary)(?![\w-])/,
    ),
  );
});
