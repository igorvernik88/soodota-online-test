import { settings } from "./settings.js";
import { setupSettings, captureBinding, cancelBinding } from "./ui/settings.js";
import { renderMarkup, animateHints } from "./ui/dom.js";
import { header } from "./ui/shared.js";
import {
  showItemDescription,
  positionItemDescription,
} from "./ui/item-description.js";
import { shopHTML } from "./ui/shop.js";
import { puzzleHTML } from "./ui/puzzle.js";
import { wardStatusText } from "./ui/ward.js";
import { renderHUD, updateCursorPen } from "./ui/hud.js";
import { chooseScreen, showResult } from "./ui/dialogs.js";
import { Game, CONFIG, HEROES } from "./logic.js";
import { combatClick } from "./combat-ui.js";
import { Renderer } from "./render.js";
const $ = (s) => document.querySelector(s);
let game = new Game(Math.floor(Math.random() * 1000000)),
  renderer = new Renderer($("#map"), $("#miniMap"), game),
  open = null,
  paused = false,
  pendingOpen = null,
  selected = -1,
  notes = false,
  spy = false,
  inspectionPage = 0,
  skill = null,
  recipientId = 0,
  seen = 0,
  lastSignature = "",
  lastPanel = null,
  toastTimer,
  mapPointer = null,
  drag = null,
  endShown = false,
  altHeld = false,
  commandHeld = false;
function skillModifierHeld() {
  return altHeld || commandHeld;
}
function updateSkillModifier() {
  document.body.classList.toggle("alt-held", skillModifierHeld());
  if (!skillModifierHeld()) {
    renderer.skillPreviewRadius = 0;
    const description = document.getElementById("itemDescription");
    if (description) description.hidden = true;
  }
  renderHUD(game, renderer.eraserSelection);
}
let hintsEnabled = localStorage.getItem("sudota-hints") === "on";
$("#hintsButton").setAttribute("aria-pressed", String(hintsEnabled));
$("#hintsButton").onclick = () => {
  hintsEnabled = !hintsEnabled;
  localStorage.setItem("sudota-hints", hintsEnabled ? "on" : "off");
  $("#hintsButton").setAttribute("aria-pressed", String(hintsEnabled));
  if (!hintsEnabled) $("#toast").classList.remove("toast");
};
function toast(text) {
  if (!hintsEnabled) return;
  $("#toast").textContent = text;
  $("#toast").classList.add("toast");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("toast"), 3500);
}
function stopped() {
  return paused || $("#tutorial").open || $("#heroSelect").open;
}
function wardPointAtCursor() {
  if (!mapPointer) return { x: game.player.x, y: game.player.y };
  const box = $("#map").getBoundingClientRect(),
    screen = { x: mapPointer.x - box.left, y: mapPointer.y - box.top };
  return { ...renderer.unproject(screen.x, screen.y), screen };
}
function update() {
  ui();
}
function goTo(t) {
  if (!t || stopped()) return;
  if (game.phase === "buy") {
    open = "shop";
    update();
    toast("Сначала начните поход");
    return;
  }
  if (game.phase !== "playing") return;
  if (t.kind === "ward" && t.defender === game.player.team) {
    toast(wardStatusText(game, t));
    return;
  }
  if (t.kind === "flower") {
    const r = game.requestFlower(game.player);
    toast(r.ok ? "Герой идёт за цветком" : r.message);
    return;
  }
  const own =
    t.defender === game.player.team && t.kind !== "camp" && t.kind !== "health";
  if (own) {
    if (game.player.role === "editor") {
      openSpy(t);
      return;
    }
    toast(
      `Это ваша защита. Идите к башне ${game.player.team ? "Листьев" : "Клякс"}.`,
      true,
    );
    return;
  }
  const a = game.objectiveAccess(game.player, t);
  if (!a.ok) {
    toast(a.message);
    return;
  }
  if (game.player.role === "editor") {
    game.player.flowerRun = false;
  }
  game.move(game.player, t.x, t.y);
  pendingOpen = t.id;
  open = null;
  renderer.follow = true;
  update();
}
function openPuzzle(t) {
  if (
    game.player.freshSudoku &&
    game.player.freshSudoku.targetId !== t?.unit?.id
  )
    game.sudzh.endFresh(game.player);
  const a = game.interact(game.player, t);
  if (!a.ok) {
    toast(a.message);
    return;
  }
  game.wards.cancelPlacement(game.player);
  open = t.id;
  game.player.animationTargetId = t.id;
  if (t.kind === "health") game.combat.engage(game.player, t);
  spy = false;
  skill = null;
  notes = false;
  selected = game
    .board(game.player, t)
    .findIndex((v, i) => !v && !t.stones[game.player.team][i]);
  update();
}
function openSpy(t) {
  if (!game.canSpy(game.player, t)) {
    toast("Выберите союзного героя или башню");
    return;
  }
  open = t.id;
  spy = true;
  inspectionPage = 0;
  skill = null;
  selected = -1;
  update();
}
function spyTarget() {
  return game.player.hp;
}
function targetView() {
  const t = game.getTarget(open);
  return t
    ? {
        t: spy ? game.inspectionTarget(t, inspectionPage) : t,
        viewer: spy
          ? { ...game.player, team: 1 - game.player.team }
          : game.player,
      }
    : null;
}
function panel() {
  const el = $("#panel"),
    h = game.player,
    scroll = lastPanel === open ? el.scrollTop : 0;
  lastPanel = open;
  el.classList.toggle("shop-panel", open === "shop");
  positionItemDescription();
  el.classList.toggle("duel-panel", game.getTarget(open)?.kind === "duel");
  el.classList.toggle("prison-panel", game.getTarget(open)?.kind === "prison");
  el.classList.toggle(
    "creep-panel",
    game.getTarget(open)?.unit?.kind === "creep",
  );
  if (!el.classList.contains("creep-panel")) {
    el.style.left = "";
    el.style.top = "";
  }
  el.classList.toggle("puzzle-panel", !!game.getTarget(open));
  el.classList.remove("giant-panel");
  el.classList.toggle(
    "enemy-panel",
    spy || game.getTarget(open)?.kind === "health",
  );
  if (!open) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  if (open === "shop") renderMarkup(el, shopHTML(game, recipientId));
  else {
    for (const [action, active] of [
      ["hook-skill", !!renderer.fireballAim?.hook],
      ["stench-skill", !!game.player.stench],
    ]) {
      const button = document.querySelector(`[data-action="${action}"]`);
      button?.classList.toggle("active", active);
      button?.setAttribute("aria-pressed", String(active));
    }
    const view = targetView();
    if (!view) {
      open = null;
      el.hidden = true;
      return;
    }
    el.classList.toggle(
      "giant-panel",
      game.puzzle(view.viewer, view.t).rules.size === 9,
    );
    renderMarkup(
      el,
      puzzleHTML(game, view.t, view.viewer, { spy, selected, notes, skill }),
    );
  }
  el.scrollTop = scroll;
}
function ui() {
  const focusKey = document.querySelector("#followButton kbd");
  if (focusKey) focusKey.hidden = game.player.role === "editor";
  const h = game.player;
  const sandboxControls = $("#sandboxControls");
  sandboxControls.hidden = !game.sandbox || game.phase !== "playing";
  $("#enemyBaseButton").hidden = game.sandbox;
  if (!sandboxControls.hidden)
    for (const team of [0, 1]) {
      const side = sandboxControls.querySelector(
        `[data-sandbox-team="${team}"]`,
      );
      side.classList.toggle("controlled", h.team === team);
      side.querySelector("span").textContent =
        `${team ? "Кляксы" : "Листья"} · ${game.heroes[team].name}`;
    }
  if (!spy && h.forcedSolve?.until > game.time) {
    const target = game.heroes.find(
      (unit) => unit.id === h.forcedSolve.targetId,
    );
    if (target && !target.dead) {
      if (open !== target.hp.id) {
        open = target.hp.id;
        selected = target.hp.boards[h.team].findIndex((v) => !v);
      }
      spy = false;
      notes = false;
      skill = null;
    }
  }
  if (!spy && h.prison && game.heroEffects.trapped(h)) {
    if (open !== h.prison.id)
      selected = h.prison.boards[h.team].findIndex((v) => !v);
    open = h.prison.id;
    spy = false;
    notes = false;
    skill = null;
  }
  if (h.duel) {
    open = h.duel.id;
    spy = false;
    notes = false;
    skill = null;
  }
  const healthTarget = game.getTarget(open);
  if (
    healthTarget?.kind === "health" &&
    healthTarget.unit.team !== h.team &&
    game.heroEffects.protected(healthTarget.unit)
  ) {
    open = healthTarget.unit.boxProtection.id;
    selected = -1;
  }
  if (!spy) h.animationTargetId = !h.dead && game.getTarget(open) ? open : null;
  $("#map").classList.toggle("eraser-targeting", !!renderer.eraserSelection);
  const cameraHint = document.getElementById("cameraReturnHint");
  if (cameraHint) {
    cameraHint.hidden = renderer.follow;
    cameraHint.textContent = `Вернуть камеру на героя — ${settings.label("KeyF")}`;
  }
  const { combo, left } = renderHUD(game, renderer.eraserSelection);
  $("#map").classList.toggle(
    "rune-targeting",
    renderer.allySkillTargeting.active,
  );
  const pencilButton = document.querySelector('[data-action="break-pencil"]');
  pencilButton?.classList.toggle(
    "active",
    renderer.allySkillTargeting.id === "breakPencil",
  );
  pencilButton?.setAttribute(
    "aria-pressed",
    String(renderer.allySkillTargeting.id === "breakPencil"),
  );
  const boxButton = document.querySelector('[data-action="box-skill"]');
  boxButton?.classList.toggle(
    "active",
    renderer.allySkillTargeting.id === "box",
  );
  boxButton?.setAttribute(
    "aria-pressed",
    String(renderer.allySkillTargeting.id === "box"),
  );
  const runeButton = document.querySelector('[data-action="rune-skill"]');
  runeButton?.classList.toggle("active", renderer.allySkillTargeting.active);
  runeButton?.setAttribute(
    "aria-pressed",
    String(renderer.allySkillTargeting.active),
  );
  for (const [id, action] of [
    ["freshSudoku", "fresh-sudoku"],
    ["inkBinding", "ink-binding"],
    ["abduction", "abduction-skill"],
    ["tempoSlow", "editor-slow"],
    ["tempoHaste", "editor-haste"],
  ]) {
    const button = document.querySelector(`[data-action="${action}"]`);
    button?.classList.toggle("active", renderer.allySkillTargeting.id === id);
    button?.setAttribute(
      "aria-pressed",
      String(renderer.allySkillTargeting.id === id),
    );
  }
  for (const [action, active] of [
    ["hook-skill", !!renderer.fireballAim?.hook],
    ["stench-skill", !!game.player.stench],
  ]) {
    const button = document.querySelector(`[data-action="${action}"]`);
    button?.classList.toggle("active", active);
    button?.setAttribute("aria-pressed", String(active));
  }
  const view = targetView();
  const state =
    open === "shop"
      ? [
          "shop",
          recipientId,
          h.gold,
          h.skillRanks,
          h.armorStock,
          Math.ceil((h.armorRestockAt || 0) - game.time),
          Math.ceil(game.wards.stock(h.team).remaining),
          game.erasers.owns(h.team),
          Math.ceil(Math.max(0, game.stoneReadyAt[h.team] - game.time)),
          h.hp.armor,
          game.heroes[recipientId]?.digits,
          game.heroes[recipientId]?.hasteTier,
          game.heroes[recipientId]?.healthSize,
          game.heroes[recipientId]?.double,
          game.pendingOrders(game.heroes[recipientId] || h),
          game.phase,
          game.nineUnlocked(),
          game.score,
        ]
      : view
        ? [
            open,
            selected,
            notes,
            spy,
            skill,
            h.digits,
            h.notes,
            h.phantoms,
            game.phase,
            h.dead,
            view.t.boards,
            game.inkBinding.blocked(view.viewer, view.t),
            game.inkBinding.active(view.t)
              ? Math.ceil(game.inkBinding.active(view.t).until - game.time)
              : null,
            spy ? Math.floor(game.time) : null,
            view.t.puzzles[view.viewer.team].hints,
            view.t.holes,
            view.t.errors,
            view.t.stones,
            view.t.poison,
            view.t.armor,
            view.t.burning,
            (() => {
              const e = game.runes.active(view.t);
              return e
                ? [e.keys, e.z, e.sum, Math.ceil(e.until - game.time)]
                : null;
            })(),
            view.t.kind === "ward" ? game.wards.status(view.t) : null,
            view.t.kind === "duel"
              ? [Math.ceil(view.t.until - game.time), [...view.t.scores]]
              : null,
            view.t.kind === "prison"
              ? Math.ceil(view.t.until - game.time)
              : null,
            view.t.effects,
            game.inverted(view.t, view.viewer.team),
            view.t.completed,
            view.t.pages?.map((p) => [
              p.completed,
              p.difficulty,
              p.recovery?.map((r) => r && Math.ceil(r.remaining)),
            ]),
            view.t.activePage,
            view.t.backdoor,
            game.near(h, view.t),
            game.objectiveAccess(game.player, view.t).ok,
          ]
        : [open];
  const signature = JSON.stringify(state);
  if (signature !== lastSignature) {
    lastSignature = signature;
    panel();
  }
  const caption = $("#inputCaption");
  if (caption)
    caption.textContent = notes
      ? "Без расхода цифр"
      : combo
        ? "Серия! Успейте продолжить"
        : left
          ? "Пробел — универсальная цифра"
          : "Ввод цифры — перо";
}
function inputDigit(value, forcePen = false) {
  if (stopped() || spy || game.player.dead) return;
  const t = game.getTarget(open);
  if (!t) {
    toast("Откройте тетрадь у башни или лагеря");
    return;
  }
  if (selected < 0) {
    toast("Выберите пустую клетку");
    return;
  }
  const r = game.place(
    game.player,
    t,
    selected,
    value,
    forcePen ? "pen" : notes ? "note" : "auto",
  );
  if (!r.ok) toast(r.message);
  else if (r.card) toast("Мгновенная цифра · −1 из личного запаса");
  update();
  if (r.ok && !r.note) $(`[data-cell="${selected}"]`)?.classList.add("stamp");
}
function buy(product) {
  if (stopped()) return;
  const r = game.buy(
    game.player,
    product,
    game.heroes[recipientId] || game.player,
  );
  toast(
    r.ok
      ? r.instant
        ? "Покупка получена"
        : `Оплачено. Доставит ${r.carrier}.`
      : r.message,
  );
  update();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if ((e.altKey || e.metaKey) && (b.dataset.item || b.dataset.use)) {
    e.preventDefault();
    if (!b.closest(".shop-panel"))
      showItemDescription(
        b.dataset.item || b.dataset.use,
        game.combat.armorPrice(game.player),
      );
    return;
  }
  if (b.disabled) return;
  if (b.dataset.duetPart) {
    const result = game.duet.switch(game.player, b.dataset.duetPart);
    if (result.ok) {
      open = null;
      pendingOpen = null;
      selected = -1;
      renderer.focusHero();
    } else toast(result.message);
    update();
    return;
  }
  if (b.dataset.mode) {
    if (game.sandbox !== (b.dataset.mode === "sandbox"))
      restart(b.dataset.mode === "sandbox");
    return;
  }
  if (b.dataset.sandboxSpawn !== undefined) {
    const team = Number(b.dataset.sandboxSpawn),
      role = $(`#sandboxRole${team}`).value;
    if (game.spawnTestHero(role, team)) {
      renderer.heroAnimator.heroes.delete(team);
      if (game.player.team === team) resetTestView();
      update();
      toast(`${game.heroes[team].name}: готов к проверке`);
    }
    return;
  }
  if (b.dataset.sandboxControl !== undefined) {
    if (game.controlTestTeam(Number(b.dataset.sandboxControl))) {
      resetTestView();
      update();
    }
    return;
  }
  if (b.dataset.upgrade) {
    if (paused) return;
    const r = game.upgradeSkill(game.player, b.dataset.upgrade);
    if (!r.ok) toast(r.message);
    update();
    return;
  }
  if (
    combatClick(game, b, {
      toast,
      goTo,
      update,
      openShop: () => {
        open = "shop";
        update();
      },
    })
  )
    return;
  if (b.dataset.page !== undefined) {
    if (spy) inspectionPage = Number(b.dataset.page);
    else game.selectPage(game.getTarget(open), Number(b.dataset.page));
    selected = -1;
    update();
    return;
  }
  if (b.dataset.role) {
    game.chooseHero(b.dataset.role);
    if (game.sandbox)
      for (const team of [0, 1]) {
        const select = $(`#sandboxRole${team}`);
        select.innerHTML = HEROES.map(
          (hero) => `<option value="${hero.id}">${hero.name}</option>`,
        ).join("");
        select.value = game.heroes[team].role;
      }
    $("#heroSelect").close();
    open = "shop";
    renderer.focusHero();
    update();
    return;
  }
  if (b.dataset.buy) buy(Number(b.dataset.buy));
  if (b.dataset.item && !b.closest("#passiveItems")) buy(b.dataset.item);
  if (b.dataset.digit) inputDigit(Number(b.dataset.digit));
  if (b.dataset.cell !== undefined) {
    selected = Number(b.dataset.cell);
    if (spy && skill && !stopped()) {
      const t = targetView().t,
        r =
          skill === "stone"
            ? game.fieldItem(game.player, "stone", t, selected)
            : game.editorAction(game.player, skill, t, selected);
      toast(
        r.ok
          ? skill === "erase"
            ? "Цифра стёрта"
            : "Камень на чужом листе"
          : r.message,
      );
    }
    update();
  }
  if (b.dataset.use && !stopped()) {
    if (b.dataset.use === "stone") {
      skill = "stone";
      if (!spy)
        openSpy(
          game.towers.find(
            (t) => t.defender === game.player.team && !t.destroyed,
          ),
        );
      skill = "stone";
      toast("Выберите пустую клетку союзной башни рядом");
      update();
      return;
    }
    if (b.dataset.use === "shovel") {
      const result = game.requestShovel(
        game.player,
        game.getTarget(open),
        selected,
      );
      toast(result.ok ? "Камень снят" : result.message);
      update();
      return;
    }
    if (b.dataset.use === "eraserTool") {
      renderer.fireballAim = null;
      const access = game.erasers.actorAccess(game.player);
      if (!access.ok || !game.player.eraserTool) {
        toast(access.message || "Ластик ещё не доставлен");
        return;
      }
      renderer.allySkillTargeting.cancel();
      renderer.eraserSelection = !renderer.eraserSelection;
      renderer.wardPreview = null;
      game.wards.cancelPlacement(game.player);
      game.player.target = null;
      game.player.eraserPickup = null;
      game.player.animationTargetId = null;
      open = null;
      pendingOpen = null;
      toast(
        renderer.eraserSelection
          ? "Ластик: выберите себя, союзника, башню или вражеский вард"
          : "Выбор Ластика отменён",
      );
      update();
      return;
    }
    if (b.dataset.use === "ward") {
      renderer.fireballAim = null;
      renderer.allySkillTargeting.cancel();
      if (game.phase !== "playing" || game.player.dead) return;
      game.wards.cancelPlacement(game.player, false);
      renderer.eraserSelection = false;
      renderer.wardPreview = renderer.wardPreview ? null : wardPointAtCursor();
      open = null;
      pendingOpen = null;
      toast(
        renderer.wardPreview
          ? "Выберите место под курсором. ЛКМ — подойти и установить вард; Esc — отменить"
          : "Установка отменена",
      );
      update();
      return;
    }
    if (b.dataset.use === "veil") {
      renderer.allySkillTargeting.toggle("veil");
      renderer.fireballAim = null;
      toast("Выберите себя, союзника или союзную башню для больших чернил");
      update();
      return;
    }
    const viewed = game.getTarget(open)?.unit,
      r = game.useItem(game.player, b.dataset.use, viewed);
    toast(
      r.ok
        ? `Предмет применён: ${game.getTarget(r.target)?.name || game.player.name}`
        : r.message,
    );
    update();
  }
  if (b.dataset.skill) {
    skill = b.dataset.skill;
    const t = spy ? game.getTarget(open) : spyTarget();
    openSpy(t);
  }
  if (b.dataset.openCore) {
    const t = game.getTarget(b.dataset.openCore);
    if (spy) openSpy(t);
    else if (t && game.near(game.player, t)) openPuzzle(t);
    else goTo(t);
  }
  if (b.dataset.next !== undefined)
    goTo(game.attackTarget(Number(b.dataset.next), 0));
  if (b.dataset.help !== undefined) {
    game.signal(Number(b.dataset.help));
    toast("Союзники идут на помощь");
  }
  switch (b.dataset.action) {
    case "duet-shield": {
      if (stopped()) break;
      const result = game.duet.shield(game.player);
      toast(result.ok ? "Упёртость применена" : result.message);
      update();
      break;
    }
    case "sandbox-reset-cooldowns": {
      if (game.resetTestCooldowns()) {
        toast("Кулдауны сброшены");
        update();
      }
      break;
    }
    case "duet-brute": {
      if (stopped()) break;
      const result = game.duet.brute(
        game.player,
        game.getTarget(open),
        selected,
      );
      toast(result.ok ? "Брутфорс применён" : result.message);
      update();
      break;
    }
    case "duet-return": {
      if (stopped()) break;
      const result = game.duet.returnPart(game.player);
      toast(result.ok ? "Иду на воссоединение" : result.message);
      update();
      break;
    }
    case "duet-throw": {
      if (stopped()) break;
      renderer.allySkillTargeting.toggle("throwOka");
      renderer.fireballAim = null;
      renderer.wardPreview = null;
      renderer.eraserSelection = false;
      toast("Выберите видимого врага для броска Оки");
      update();
      break;
    }
    case "duet-dash": {
      if (stopped()) break;
      renderer.fireballAim = { ...wardPointAtCursor(), duet: true };
      renderer.allySkillTargeting.cancel();
      renderer.wardPreview = null;
      toast("Выберите направление рывка");
      update();
      break;
    }
    case "rune-skill": {
      if (stopped()) break;
      renderer.fireballAim = null;
      renderer.allySkillTargeting.toggle("rune");
      renderer.eraserSelection = false;
      renderer.wardPreview = null;
      open = null;
      pendingOpen = null;
      game.player.animationTargetId = null;
      toast(
        renderer.allySkillTargeting.active
          ? "Выберите себя или союзного героя для переплёта"
          : "Выбор отменён",
      );
      update();
      break;
    }
    case "lasso-skill": {
      if (stopped()) break;
      const r = game.lassoSkill(game.player, game.getTarget(open)?.unit);
      toast(r.ok ? "Лассо применено" : r.message);
      update();
      break;
    }
    case "dust-skill": {
      if (stopped()) break;
      const result = game.dust.cast(game.player);
      toast(result.ok ? "Пыль в глаза применена" : result.message);
      update();
      break;
    }
    case "hero-skill":
    case "area-stun": {
      if (stopped()) break;
      const r = game.heroSkill(game.player, game.getTarget(open)?.unit);
      toast(r.ok ? "Навык применён" : r.message);
      update();
      break;
    }
    case "box-skill": {
      if (stopped()) break;
      renderer.allySkillTargeting.toggle("box");
      renderer.fireballAim = null;
      renderer.eraserSelection = false;
      renderer.wardPreview = null;
      open = null;
      pendingOpen = null;
      game.player.animationTargetId = null;
      toast(
        renderer.allySkillTargeting.active
          ? "Выберите героя для коробки"
          : "Выбор отменён",
      );
      update();
      break;
    }
    case "hook-skill": {
      if (stopped()) break;
      renderer.fireballAim = renderer.fireballAim?.hook
        ? null
        : { ...wardPointAtCursor(), hook: true };
      renderer.allySkillTargeting.cancel();
      renderer.wardPreview = null;
      renderer.eraserSelection = false;
      update();
      break;
    }
    case "stench-skill": {
      if (stopped()) break;
      const result = game.sudzh.toggleStench(game.player);
      if (!result.ok) toast(result.message);
      update();
      break;
    }
    case "fresh-sudoku": {
      if (stopped()) break;
      if (game.player.pendingFresh) {
        game.player.pendingFresh = null;
        game.player.target = null;
        renderer.allySkillTargeting.cancel();
      } else renderer.allySkillTargeting.toggle("freshSudoku");
      renderer.fireballAim = null;
      renderer.wardPreview = null;
      renderer.eraserSelection = false;
      update();
      break;
    }
    case "acid-skill": {
      if (stopped()) break;
      renderer.fireballAim = renderer.fireballAim?.acid
        ? null
        : { ...wardPointAtCursor(), acid: true };
      renderer.allySkillTargeting.cancel();
      renderer.wardPreview = null;
      renderer.eraserSelection = false;
      open = null;
      pendingOpen = null;
      toast(
        renderer.fireballAim ? "Выберите место для кислоты" : "Выбор отменён",
      );
      update();
      break;
    }
    case "break-pencil": {
      if (stopped()) break;
      renderer.allySkillTargeting.toggle("breakPencil");
      renderer.eraserSelection = false;
      renderer.wardPreview = null;
      renderer.fireballAim = null;
      open = null;
      pendingOpen = null;
      game.player.animationTargetId = null;
      toast(
        renderer.allySkillTargeting.active
          ? "Выберите врага: сломать карандаш"
          : "Выбор отменён",
      );
      update();
      break;
    }
    case "tornado-skill": {
      if (stopped()) break;
      const result = game.fire.tornado(game.player);
      toast(result.ok ? "Огненное торнадо" : result.message);
      update();
      break;
    }
    case "burning-skill": {
      if (stopped()) break;
      const field = game.getTarget(open);
      if (field) {
        const result = game.burningSkill(game.player, field);
        toast(result.ok ? `Горящие цифры: ${result.count}` : result.message);
      } else if (!game.fire.charges(game.player)?.count)
        toast("Нет зарядов Горящих цифр");
      else {
        renderer.fireballAim = renderer.fireballAim
          ? null
          : wardPointAtCursor();
        if (renderer.fireballAim) {
          renderer.allySkillTargeting.cancel();
          renderer.eraserSelection = false;
          renderer.wardPreview = null;
          pendingOpen = null;
        }
      }
      update();
      break;
    }
    case "strong-focus": {
      if (stopped()) break;
      const r = game.errorFocusSkill(game.player);
      toast(r.ok ? "Неточная рука активна" : r.message);
      update();
      break;
    }
    case "editor-erase": {
      if (!spy) openSpy(game.player.hp);
      skill = "erase";
      toast("Выберите вписанную цифру союзного поля");
      update();
      break;
    }
    case "abduction-skill":
    case "ink-binding": {
      if (stopped()) break;
      if (
        b.dataset.action === "abduction-skill" &&
        game.player.pendingAbduction
      ) {
        game.player.pendingAbduction = null;
        game.player.target = null;
        renderer.allySkillTargeting.cancel();
        update();
        break;
      }
      renderer.allySkillTargeting.toggle(
        b.dataset.action === "abduction-skill" ? "abduction" : "inkBinding",
      );
      renderer.fireballAim = null;
      renderer.wardPreview = null;
      renderer.eraserSelection = false;
      update();
      break;
    }
    case "close":
      open = null;
      game.player.animationTargetId = null;
      spy = false;
      update();
      break;
    case "shop":
      open = open === "shop" ? null : "shop";
      game.player.animationTargetId = null;
      spy = false;
      update();
      break;
    case "start":
      game.start();
      open = null;
      update();
      toast("Начните с башни T1. Клик по тетради ведёт к ней.", true);
      break;
    case "notes":
      notes = !notes;
      update();
      break;
    case "tutorial":
      $("#tutorial").showModal();
      break;
    case "spy":
      skill = null;
      openSpy(spyTarget());
      break;
    case "flower": {
      const r = game.requestFlower(game.player);
      toast(
        r.ok ? "К цветку! Любой герой может забрать его первым." : r.message,
      );
      break;
    }
    case "editor-slow":
    case "editor-haste": {
      if (stopped()) break;
      renderer.allySkillTargeting.toggle(
        b.dataset.action === "editor-slow" ? "tempoSlow" : "tempoHaste",
      );
      update();
      break;
    }
    case "shovel": {
      const t = game.getTarget(open),
        r = game.requestShovel(game.player, t, selected);
      toast(r.ok ? "Камень снят" : r.message);
      update();
      break;
    }
    case "restart":
      restart();
      break;
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "recipientSelect") {
    recipientId = Number(e.target.value);
    update();
  }
});
$("#shopArrow").onclick = () => {
  open = open === "shop" ? null : "shop";
  game.player.animationTargetId = null;
  spy = false;
  update();
};
$("#enemyBaseButton").onclick = () => goTo(game.nextCore(0));
$("#map").addEventListener("click", (e) => {
  if (stopped() || drag?.moved) return;
  const box = $("#map").getBoundingClientRect(),
    x = e.clientX - box.left,
    y = e.clientY - box.top,
    t = renderer.hit(x, y, { inspectAllies: e.altKey || e.metaKey });
  if ((e.altKey || e.metaKey) && game.canSpy(game.player, t)) {
    openSpy(t);
    return;
  }
  if (spy) {
    spy = false;
    open = null;
    skill = null;
  }
  if (renderer.fireballAim) {
    const acid = renderer.fireballAim.acid;
    const result = renderer.fireballAim.duet
      ? game.duet.dash(game.player, renderer.unproject(x, y))
      : renderer.fireballAim.hook
        ? game.sudzh.hook(game.player, renderer.unproject(x, y))
        : acid
          ? game.heroEffects.acid(game.player, renderer.unproject(x, y))
          : game.fire.ball(game.player, renderer.unproject(x, y));
    if (result.ok) renderer.fireballAim = null;
    toast(result.ok ? "Навык применён" : result.message);
    update();
    return;
  }
  if (renderer.allySkillTargeting.active) {
    const selectedSkill = renderer.allySkillTargeting.id;
    const result = renderer.allySkillTargeting.apply(t);
    toast(
      result.queued
        ? "Подхожу для применения навыка"
        : result.ok
          ? selectedSkill === "veil"
            ? "Чернила применены"
            : selectedSkill === "abduction"
              ? "Враг похищен"
              : selectedSkill === "breakPencil"
                ? "Карандаш врага сломан"
                : selectedSkill === "box"
                  ? "Коробка применена"
                  : "Рунный переплёт применён"
          : result.message,
    );
    update();
    return;
  }
  if (renderer.eraserSelection) {
    const transfer =
        e.shiftKey && t?.kind === "health" && t.unit.team === game.player.team,
      result = transfer
        ? game.erasers.transfer(game.player, t.unit)
        : game.useItem(game.player, "eraserTool", t);
    if (result.ok) renderer.eraserSelection = false;
    toast(
      result.ok
        ? transfer
          ? "Ластик передан союзнику"
          : result.effect === "ward"
            ? "Вард уничтожен Ластиком"
            : "Цифра стёрта"
        : result.message,
    );
    update();
    return;
  }
  if (game.heroEffects.trapped(game.player)) return;
  if (renderer.wardPreview) {
    const result = game.wards.requestPlacement(
      game.player,
      renderer.unproject(x, y),
    );
    if (result.ok) renderer.wardPreview = null;
    toast(
      result.ok
        ? result.queued
          ? "Герой идёт устанавливать вард"
          : "Вард установлен"
        : result.message,
    );
    update();
    return;
  }
  game.wards.cancelPlacement(game.player);
  if (t) {
    if (t.kind === "eraser-drop") {
      const result = game.erasers.requestPickup(game.player, t);
      if (result.ok) {
        pendingOpen = null;
        open = null;
        game.player.flowerRun = false;
      }
      toast(
        result.ok
          ? result.queued
            ? "Герой идёт за Ластиком"
            : "Ластик подобран"
          : result.message,
      );
      update();
      return;
    }
    if (t.kind === "ward" && t.defender === game.player.team) {
      toast(wardStatusText(game, t));
      return;
    }
    if (
      e.shiftKey &&
      t.kind === "health" &&
      game.heroEffects.follow(game.player, t.unit)
    ) {
      pendingOpen = t.id;
      if (game.near(game.player, t)) openPuzzle(t);
      renderer.follow = true;
      return;
    }
    if (t.kind === "flower") {
      goTo(t);
      return;
    }
    if (game.near(game.player, t) && game.phase === "playing") openPuzzle(t);
    else goTo(t);
    return;
  }
  if (game.phase === "buy") {
    open = "shop";
    update();
    return;
  }
  const p = renderer.unproject(x, y);
  if (p.x < 0 || p.y < 0 || p.x > CONFIG.worldSize || p.y > CONFIG.worldSize)
    return;
  game.player.flowerRun = false;
  game.move(game.player, p.x, p.y);
  open = null;
  pendingOpen = null;
  renderer.marker = { ...p, time: performance.now() / 1000 };
  update();
});
$("#map").addEventListener("contextmenu", (e) => {
  e.preventDefault();
  renderer.wardPreview = null;
});
$("#map").addEventListener("pointerdown", (e) => {
  if (e.button === 2 || e.button === 1) {
    e.preventDefault();
    drag = { x: e.clientX, y: e.clientY, moved: false };
    $("#map").setPointerCapture(e.pointerId);
  }
});
$("#map").addEventListener("pointerleave", () => {
  renderer.hover = null;
});
$("#map").addEventListener("pointermove", (e) => {
  mapPointer = { x: e.clientX, y: e.clientY };
  if (drag && e.buttons & 6) {
    renderer.pan(e.clientX - drag.x, e.clientY - drag.y);
    drag = { x: e.clientX, y: e.clientY, moved: true };
    return;
  }
  const r = $("#map").getBoundingClientRect(),
    x = e.clientX - r.left,
    y = e.clientY - r.top,
    t = renderer.hit(x, y);
  if (renderer.fireballAim)
    renderer.fireballAim = {
      ...wardPointAtCursor(),
      acid: renderer.fireballAim.acid,
      hook: renderer.fireballAim.hook,
      duet: renderer.fireballAim.duet,
    };
  if (renderer.wardPreview) {
    renderer.wardPreview = wardPointAtCursor();
    $("#tooltip").style.display = "none";
    return;
  }
  if (renderer.eraserSelection) {
    $("#tooltip").style.display = "none";
    return;
  }
  renderer.hover = t?.id;
  const tip = $("#tooltip");
  tip.style.display = t ? "block" : "none";
  if (t) {
    tip.textContent =
      t.kind === "flower"
        ? "Цветок: заберите раньше другой команды"
        : t.kind === "ward"
          ? `${t.name} · ${wardStatusText(game, t)}`
          : t.kind === "eraser-drop"
            ? "Ластик · подойти и подобрать"
            : `${t.name} · ${game.puzzle(game.player, t).rules.size}×${game.puzzle(game.player, t).rules.size}${t.defender === 0 ? " · ваша защита" : ""}`;
    tip.style.left = Math.max(0, Math.min(x + 15, renderer.width - 240)) + "px";
    tip.style.top = Math.min(y + 18, renderer.height - 40) + "px";
  }
});
$("#map").addEventListener("pointerup", () => {
  drag = null;
});
$("#map").addEventListener("mouseleave", () => {
  $("#tooltip").style.display = "none";
});
$("#map").addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    renderer.setZoom(renderer.zoom * Math.exp(-e.deltaY * 0.001));
  },
  { passive: false },
);
$("#overviewButton").onclick = () => renderer.overview();
$("#miniMap").addEventListener("pointerdown", (e) => {
  if (stopped() || e.button !== 0) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const point = renderer.miniUnproject(
    ((e.clientX - rect.left) * 256) / rect.width,
    ((e.clientY - rect.top) * 256) / rect.height,
  );
  renderer.camera = {
    x: Math.max(0, Math.min(CONFIG.worldSize, point.x)),
    y: Math.max(0, Math.min(CONFIG.worldSize, point.y)),
  };
  renderer.follow = false;
  update();
});
$("#followButton").onclick = () => renderer.focusHero();
$("#zoomIn").onclick = () => renderer.setZoom(renderer.zoom * 1.2);
$("#zoomOut").onclick = () => renderer.setZoom(renderer.zoom / 1.2);
function pause() {
  if (game.phase !== "playing") return;
  paused = !paused;
  $("#pauseOverlay").hidden = !paused;
  if (!paused) cancelBinding();
  $("#pauseButton").textContent = paused ? "▷" : "Ⅱ";
}
$("#pauseButton").onclick = $("#resumeButton").onclick = pause;
setupSettings(() => {
  $("#actionBar").dataset.sig = "";
  $("#purchasedItems").dataset.sig = "";
  ui();
});
$("#helpButton").onclick = () => $("#tutorial").showModal();
$("#closeTutorial").onclick = $("#tutorialDone").onclick = () =>
  $("#tutorial").close();
$("#heroSelect").addEventListener("cancel", (e) => e.preventDefault());
$("#result").addEventListener("cancel", (e) => e.preventDefault());
let chatChannel = "all";
document.addEventListener("keydown", (e) => {
  if (captureBinding(e)) return;
  const code = settings.canonicalCode(e.code);
  const composer = $("#chatComposer"),
    input = $("#chatInput");
  if (e.target === input) {
    const code = e.code;
    if (code === "Tab") {
      e.preventDefault();
      chatChannel = chatChannel === "all" ? "team" : "all";
      $("#chatScope").textContent = chatChannel === "all" ? "Всем" : "Команде";
    }
    if (code === "Enter" || code === "Escape") {
      e.preventDefault();
      if (code === "Enter")
        game.chat.send(game.player, input.value, chatChannel);
      input.value = "";
      composer.hidden = true;
      input.blur();
      update();
    }
    return;
  }
  if (
    code === "Enter" &&
    game.phase === "playing" &&
    !paused &&
    !document.querySelector("dialog[open]")
  ) {
    e.preventDefault();
    composer.hidden = false;
    input.focus();
    return;
  }

  if (code === "F1") e.preventDefault();
  if (e.key === "Alt") {
    e.preventDefault();
    altHeld = true;
    updateSkillModifier();
  }
  if (e.key === "Meta") {
    commandHeld = true;
    updateSkillModifier();
  }
  if (
    $("#tutorial").open ||
    $("#heroSelect").open ||
    $("#result").open ||
    ["SELECT", "INPUT", "TEXTAREA"].includes(e.target.tagName) ||
    e.target.isContentEditable
  )
    return;
  const k = /^Key[A-Z]$/.test(code)
    ? code.slice(3).toLowerCase()
    : code || !e.code
      ? e.key.toLowerCase()
      : "";
  if (code === "F1") {
    e.preventDefault();
    if (!e.repeat) pause();
    return;
  }
  if (paused) return;
  if (code === "Tab" && game.duet.state(game.player)?.split) {
    e.preventDefault();
    if (!e.repeat) {
      const part = game.player.duetPart === "oka" ? "sud" : "oka";
      document
        .querySelector(`#duetControls [data-duet-part="${part}"]`)
        ?.click();
    }
    return;
  }
  if (code === "Space") {
    e.preventDefault();
    if (!e.repeat && !stopped() && !spy && !game.player.dead) {
      const t = game.getTarget(open);
      if (t && selected >= 0) {
        const r = game.place(game.player, t, selected, 1, "universal");
        if (!r.ok) toast(r.message);
        update();
      }
    }
    return;
  }
  if (k === "escape") {
    if (game.player.pendingAbduction) {
      game.player.pendingAbduction = null;
      game.player.target = null;
    }
    if (game.player.pendingFresh) {
      game.player.pendingFresh = null;
      game.player.target = null;
    }
    renderer.fireballAim = null;
    renderer.allySkillTargeting.cancel();
    renderer.eraserSelection = false;
    renderer.wardPreview = null;
    game.wards.cancelPlacement(game.player);
    open = null;
    game.player.animationTargetId = null;
    update();
  }
  if (code === "KeyI") {
    open = open === "shop" ? null : "shop";
    game.player.animationTargetId = null;
    spy = false;
    update();
  }
  if (k === "n" || k === "т") {
    notes = !notes;
    update();
  }
  if (k === "m" || k === "ь") renderer.overview();
  if (code === "KeyF") renderer.focusHero();
  if (/^Key[QWERT]$/.test(code)) {
    e.preventDefault();
    if (!e.repeat)
      document.querySelector(`[data-skill-hotkey="${code.slice(3)}"]`)?.click();
    return;
  }
  if (/^Key[XCVB]$/.test(code)) {
    e.preventDefault();
    if (!e.repeat)
      document
        .querySelectorAll("#purchasedItems [data-use]")
        ["XCVB".indexOf(code.slice(3))]?.click();
    return;
  }
  if (/^[1-9]$/.test(k)) inputDigit(Number(k));
  if (k.startsWith("arrow") && game.getTarget(open)) {
    e.preventDefault();
    const n = game.puzzle(game.player, targetView().t).rules.size;
    selected = Math.max(
      0,
      Math.min(
        n * n - 1,
        Math.max(0, selected) +
          ({ arrowup: -n, arrowdown: n, arrowleft: -1, arrowright: 1 }[k] || 0),
      ),
    );
    update();
  }
});
document.addEventListener("keyup", (e) => {
  if (e.key === "Alt") altHeld = false;
  else if (e.key === "Meta") commandHeld = false;
  else return;
  updateSkillModifier();
});
document.addEventListener("pointerdown", (e) => {
  const item = e.target.closest?.("[data-item], [data-use]");
  if ((e.altKey || e.metaKey) && item) {
    e.preventDefault();
    if (!item.closest(".shop-panel"))
      showItemDescription(
        item.dataset.item || item.dataset.use,
        game.combat.armorPrice(game.player),
      );
    return;
  }
  const cell = e.target.closest?.("#panel [data-cell]");
  const target = game.getTarget(open);
  if (cell && game.dust.active(game.player, target)) {
    selected = Number(cell.dataset.cell);
    update();
  }
});
document.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "touch") return;
  const target = game.getTarget(open);
  if (!game.dust.active(game.player, target)) return;
  const cell = document
    .elementFromPoint(e.clientX, e.clientY)
    ?.closest("#panel [data-cell]");
  if (cell && selected !== Number(cell.dataset.cell)) {
    selected = Number(cell.dataset.cell);
    update();
  }
});
document.addEventListener("pointerover", (e) => {
  const shopItem = e.target.closest?.(".shop-panel [data-item]");
  if (shopItem && (skillModifierHeld() || e.altKey))
    showItemDescription(
      shopItem.dataset.item,
      game.combat.armorPrice(game.player),
    );
  const cell = e.target.closest?.("#panel [data-cell]");
  const target = game.getTarget(open);
  if (cell && game.dust.active(game.player, target)) {
    const index = Number(cell.dataset.cell);
    if (selected !== index) {
      selected = index;
      update();
    }
  }
  const slot = e.target.closest?.(".skill-slot-wrap");
  if (!skillModifierHeld() || !slot) return;
  renderer.skillPreviewRadius = Number(slot.dataset.skillRadius) || 0;
});
document.addEventListener("pointerout", (e) => {
  const slot = e.target.closest?.(".skill-slot-wrap");
  if (slot && !slot.contains(e.relatedTarget)) renderer.skillPreviewRadius = 0;
});
window.addEventListener("blur", () => {
  altHeld = false;
  commandHeld = false;
  updateSkillModifier();
});
function resetTestView() {
  open = null;
  spy = false;
  skill = null;
  selected = -1;
  pendingOpen = null;
  recipientId = game.player.id;
  lastSignature = "";
  renderer.wardPreview = null;
  renderer.eraserSelection = false;
  renderer.allySkillTargeting.cancel();
  renderer.fireballAim = null;
  renderer.focusHero();
}
function restart(sandbox = game.sandbox) {
  if ($("#result").open) $("#result").close();
  if ($("#heroSelect").open) $("#heroSelect").close();
  game = new Game(42 + Math.floor(Math.random() * 10000), { sandbox });
  renderer.game = game;
  renderer.heroAnimator.game = game;
  renderer.heroAnimator.heroes.clear();
  renderer.focusHero();
  renderer.particles = [];
  renderer.wardPreview = null;
  renderer.eraserSelection = false;
  renderer.allySkillTargeting.cancel();
  renderer.fireballAim = null;
  open = null;
  paused = false;
  spy = false;
  seen = 0;
  selected = -1;
  recipientId = 0;
  pendingOpen = null;
  endShown = false;
  $("#pauseOverlay").hidden = true;
  $("#actionBar").dataset.sig = "";
  chooseScreen(sandbox);
  update();
}
function frame(now) {
  const dt = Math.min((now - (frame.last || now)) / 1000, 0.1);
  frame.last = now;
  if (!stopped()) game.tick(dt);
  if (game.player.dead || !game.player.consumables.ward)
    renderer.wardPreview = null;
  if (
    game.player.role !==
    (renderer.fireballAim?.duet
      ? "duet"
      : renderer.fireballAim?.hook
        ? "sudzh"
        : renderer.fireballAim?.acid
          ? "combinator"
          : "sudaks")
  )
    renderer.fireballAim = null;
  if (game.player.dead) {
    renderer.allySkillTargeting.cancel();
    renderer.fireballAim = null;
  }
  if (game.player.dead || !game.player.eraserTool)
    renderer.eraserSelection = false;
  const openedTarget = game.getTarget(open);
  if (
    openedTarget &&
    (!game.vision.visible(game.player.team, openedTarget) ||
      (!spy && !game.near(game.player, openedTarget)))
  ) {
    open = null;
    game.player.animationTargetId = null;
    selected = -1;
    update();
  }
  if (!spy && pendingOpen && !stopped() && !game.player.dead) {
    const t = game.getTarget(pendingOpen);
    if (!t) pendingOpen = null;
    if (t && game.near(game.player, t)) {
      pendingOpen = null;
      game.player.target = null;
      openPuzzle(t);
    }
  }
  for (const e of game.events.slice(seen)) {
    if (e.type === "duetDuel" && e.heroes.includes(game.player.id)) {
      openPuzzle(game.getTarget(e.target));
      spy = false;
      notes = false;
    }
    if (e.type === "duetDuelEnd" && open === e.target) {
      open = null;
      toast(`Дуэль завершена · ${e.scores.join(" : ")}`);
      update();
    }
    if (
      e.type === "okaMounted" &&
      game.duet.root(game.player).id ===
        game.duet.root(game.actors().find((u) => u.id === e.hero))?.id
    ) {
      game.duet.switch(game.player, "oka");
      openPuzzle(game.getTarget(e.target));
      update();
    }
    if (
      (e.type === "duetMerge" || e.type === "duetPartDeath") &&
      e.hero === game.duet.root(game.player).id
    ) {
      open = null;
      pendingOpen = null;
      selected = -1;
      update();
    }
    if (
      e.type === "freshSudoku" &&
      e.hero === game.player.id &&
      game.player.freshSudoku
    ) {
      spy = false;
      openPuzzle(game.getTarget(e.target));
    }
    if (e.type === "praise")
      toast(
        `${game.heroes[e.from].name}: ${game.heroes[e.hero].name}, Хорошо сыграно!`,
      );
    if (e.type === "death" && e.hero === 0) {
      open = null;
      pendingOpen = null;
      toast("Герой погиб. Возрождение на базе.");
    }
    if (e.type === "respawn" && e.hero === 0) toast("Вы снова в игре!");
    if (e.type === "wardPlaced" && e.hero === game.player.id)
      toast("Вард установлен");
    if (e.type === "eraserPickedUp" && e.hero === game.player.id)
      toast("Ластик подобран");
    if (e.type === "eraserPickupFailed" && e.hero === game.player.id)
      toast(e.message);
    if (e.type === "wardPlacementFailed" && e.hero === game.player.id)
      toast(e.message);
    if (e.type === "wardRemoved" && open === e.target) {
      open = null;
      selected = -1;
      game.player.animationTargetId = null;
      update();
    }
    if (e.type === "page") toast("Лист завершён");
    if (e.type === "tower") {
      renderer.confetti(game.getTarget(e.target), e.team);
      if (e.team === 0) {
        toast(`Башня пройдена · каждому +${e.gold}. Лист базы стал проще.`);
        if (open === e.target) open = null;
      }
    }
    if (e.type === "core") {
      renderer.confetti(game.getTarget(e.target), e.team);
      toast("Один из трёх листов базы завершён");
      if (open === e.target) open = null;
    }
    if (e.type === "camp" && e.hero === 0) {
      toast(`Лагерь: +${e.gold} монет и две цифры`);
      open = null;
    }
    if ((e.type === "delivery" || e.type === "courierDelivery") && e.hero === 0)
      toast(
        e.type === "delivery"
          ? "Самолётик доставил цифры"
          : "Правщик передал снаряжение",
      );
    if (e.type === "flowerSpawn") toast("На реке распустился цветок здоровья");
    if (e.type === "flower")
      toast(`${game.heroes[e.hero].name} забрал цветок здоровья`);
    if (e.type === "end" && !endShown) {
      endShown = true;
      showResult(game);
    }
  }
  seen = game.events.length;
  renderer.draw(now / 1000, stopped() ? 0 : dt);
  const creepTarget = game.getTarget(open);
  if (creepTarget?.unit?.kind === "creep" && !$("#panel").hidden) {
    const pos = renderer.unitPoint(creepTarget.unit),
      rect = $("#map").getBoundingClientRect();
    const panel = $("#panel");
    panel.style.left =
      Math.max(
        6,
        Math.min(
          window.innerWidth - panel.offsetWidth - 6,
          rect.left + pos.x - panel.offsetWidth / 2,
        ),
      ) + "px";
    panel.style.top =
      Math.max(
        6,
        Math.min(
          window.innerHeight - panel.offsetHeight - 6,
          rect.top + pos.y - panel.offsetHeight - 12,
        ),
      ) + "px";
    if (creepTarget.unit.dead) {
      open = null;
      update();
    }
  }
  if (now - (frame.hudAt || 0) >= 100) {
    ui();
    frame.hudAt = now;
  }
  updateCursorPen(game, stopped(), renderer.eraserSelection);
  animateHints($("#panel"), game.time);
  requestAnimationFrame(frame);
}
window.addEventListener("resize", () => {
  renderer.resize();
  positionItemDescription();
});
function autoPause() {
  if (game.phase === "playing" && !paused) {
    paused = true;
    $("#pauseOverlay").hidden = false;
  }
}
window.addEventListener("blur", autoPause);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) autoPause();
});
chooseScreen(game.sandbox);
ui();
requestAnimationFrame(frame);

document.addEventListener("pointermove", (event) => {
  const el = document.getElementById("cursorPen");
  el.dataset.visible = "1";
  el.style.left =
    Math.max(6, Math.min(window.innerWidth - 115, event.clientX + 12)) + "px";
  el.style.top = Math.max(6, event.clientY - 34) + "px";
});
document.addEventListener("pointerout", (event) => {
  if (!event.relatedTarget)
    delete document.getElementById("cursorPen").dataset.visible;
});
