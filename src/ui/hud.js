import { BROKEN_PENCIL_ANIMATION } from "../animations/manifest.js";
import { settings } from "../settings.js";
import { skillDetails } from "./skill-details.js";
import { shopIcon } from "./shop.js";
import { skillDescription } from "../progression.js";
import { renderMarkup } from "./dom.js";
import {
  CONFIG,
  HEROES,
  ITEMS,
  ROLE_SKILLS,
  SKILLS,
  PROGRESSION,
} from "../config.js";
import { combatHUD } from "../combat-ui.js";
import { sudaksIcon, sudzhIcon, duetIcon } from "./icons.js";
import { renderMatchScore } from "./match-score.js";
const $ = (s) => document.querySelector(s);
const SKILL_ICONS = new Set([
  "stubborn",
  "bruteforce",
  "throwOka",
  "headOn",
  "breakPencil",
  "tornado",
  "rune",
  "combo",
  "dust",
  "slow",
  "phantoms",
  "heal",
  "lasso",
  "hole",
  "stun",
  "focus",
  "poison",
  "box",
  "acid",
  "caustic",
  "thickBinding",
  "cry",
  "burning",
  "erase",
  "tempo",
  "support",
  "inkBinding",
  "abduction",
]);
function digitCount(n) {
  const last = n % 10,
    hundred = n % 100;
  return `${n} ${hundred >= 11 && hundred <= 14 ? "цифр" : last === 1 ? "цифра" : last >= 2 && last <= 4 ? "цифры" : "цифр"}`;
}
function skillIcon(id) {
  if (!SKILL_ICONS.has(id)) return null;
  const file = `${id}.webp`,
    src =
      globalThis.SUDOTA_SKILL_ASSETS?.[file] || `assets/skill-icons/${file}`;
  return `<img class="skill-icon" src="${src}" alt="" aria-hidden="true">`;
}
export function itemSlotsHTML(game, eraserSelected = false) {
  const h = game.player,
    hotkeys = {
      ward: "D",
      stone: "",
      shovel: "V",
      sharpener: "G",
      sharpener2: "H",
      miniInk: "P",
      stun1: "J",
      stun2: "J",
      stun3: "J",
      lasso: "L",
      veil: "Z",
      invert: "X",
      eraser: "C",
    };
  const slots = Object.keys(hotkeys)
    .filter((id) => h.consumables[id] > 0)
    .map((id, slot) => {
      const item = ITEMS.find((i) => i.id === id);
      return `<button class="action-slot" data-use="${id}" title="${item.name}. ${item.description}">${shopIcon(id)}${h.consumables[id] > 1 ? `<b>${h.consumables[id]}</b>` : ""}<kbd>${settings.label("Key" + "XCVB"[slot])}</kbd></button>`;
    })
    .join("");
  const tool = h.eraserTool;
  const emptySlots = Array.from(
    {
      length: Math.max(
        0,
        CONFIG.inventorySlots -
          Object.keys(hotkeys).filter((id) => h.consumables[id] > 0).length -
          (tool ? 1 : 0),
      ),
    },
    (_, i) =>
      `<div class="action-slot empty-item-slot" data-ui-key="empty-item-${i}" aria-label="Пустой слот"></div>`,
  ).join("");
  if (!tool) return slots + emptySlots;
  const item = ITEMS.find((entry) => entry.id === "eraserTool"),
    left = (at) =>
      at > game.time ? `${Math.ceil(at - game.time)} с` : "готово";
  return `${slots}<button class="action-slot ${eraserSelected ? "active" : ""}" data-use="eraserTool" data-ui-key="item-eraserTool" aria-pressed="${eraserSelected}" title="${item.description}">${shopIcon("eraserTool")}<kbd>${settings.label("Key" + "XCVB"[Object.keys(hotkeys).filter((id) => h.consumables[id] > 0).length])}</kbd><small>Ластик</small><small>Цифра: ${left(tool.digitReadyAt)}</small><small>Вард: ${left(tool.wardReadyAt)}</small></button>${emptySlots}`;
}
function actionsHTML(game) {
  const h = game.player,
    role = HEROES.find((r) => r.id === h.role),
    active = {
      stubborn: ["duet-shield", "◈", "stubbornTimer", "Q"],
      bruteforce: ["duet-brute", "✊", "bruteforceTimer", "W"],
      throwOka: ["duet-throw", "↗", "throwOkaTimer", "E"],
      headOn: ["duet-dash", "⚔", "headOnTimer", "R"],
      hook: ["hook-skill", sudzhIcon, "hookTimer", "Q"],
      stench: ["stench-skill", "☁", "stenchTimer", "T"],
      freshSudoku: ["fresh-sudoku", "▦", "freshTimer", "E"],
      breakPencil: ["break-pencil", "✎", "breakPencilTimer", "E"],
      tornado: ["tornado-skill", "↻", "tornadoTimer", "E"],
      rune: ["rune-skill", "⌘", "runeTimer", "Q"],
      dust: ["dust-skill", "⁙", "dustTimer", "E"],
      slow: ["hero-skill", "⇣", "heroSkillTimer", "T"],
      heal: ["hero-skill", "♡", "heroSkillTimer", "T"],
      lasso: ["lasso-skill", "◯", "lassoTimer", "Y"],
      stun: ["hero-skill", "✹", "heroSkillTimer", "T"],
      focus: ["strong-focus", "◎", "focusTimer", "Q"],
      box: ["box-skill", "▦", "heroSkillTimer", "E"],
      acid: ["acid-skill", "≋", "acidTimer", "T"],
      cry: ["hero-skill", "◉", "heroSkillTimer", "T"],
      burning: ["burning-skill", sudaksIcon, "burningSkillTimer", "Q"],
      erase: ["editor-erase", "⌫", "eraseTimer", "Q"],
      tempo: ["editor-slow", "⇣", "tempoTimer", "T"],
      abduction: ["abduction-skill", "↟", "abductionTimer", "F"],
      inkBinding: ["ink-binding", "▧", "inkBindingTimer", "E"],
    },
    radiusSkills = new Set(["slow", "lasso", "stun", "box", "cry"]);
  if (h.duetPart === "oka")
    return (
      '<button class="action-slot" data-action="duet-return" data-skill-hotkey="Q"><span>↩</span><small>Вернуться к Суду</small><kbd>' +
      settings.label("KeyQ") +
      "</kbd></button>"
    );
  if (h.role === "duet" && game.duet.state(h).split)
    active.throwOka = ["duet-return", "↩", "returnOkaTimer", "E"];
  const keyMap = Object.fromEntries(
    ROLE_SKILLS[h.role]
      .filter((id) => active[id])
      .map((id, i) => [id, "QWERT"[i]]),
  );
  const skillSlot = (id) => {
    if (id === "throwOka" && game.duet.state(h)?.split)
      return `<div class="skill-slot-wrap" data-ui-key="skill-throwOka"><button class="action-slot" data-action="duet-return" data-skill-hotkey="${keyMap[id]}"><span>↩</span><small>Забрать Оку</small><kbd>${settings.label("Key" + keyMap[id])}</kbd></button></div>`;
    const rank = h.skillRanks[id] || 0,
      p = game.skill(h, id),
      spec = active[id],
      maxRank = SKILLS[id].ranks.length,
      cost = rank < maxRank ? (SKILLS[id].costs || PROGRESSION.costs)[rank] : 0,
      canUpgrade = rank < maxRank && h.digits >= cost,
      radius =
        p?.range ||
        p?.radius ||
        (radiusSkills.has(id) ? CONFIG.effectRadius : 0),
      icon = skillIcon(id) || spec?.[1] || role.symbol,
      detail = skillDetails(
        id,
        rank,
        icon,
        keyMap[id] ? settings.label("Key" + keyMap[id]) : null,
      );
    return `<div class="skill-slot-wrap" data-skill-radius="${radius}" data-ui-key="skill-${id}">${rank < maxRank ? `<span class="skill-upgrade-cost">${digitCount(cost)}</span>` : ""}${canUpgrade ? `<button class="skill-upgrade-arrow" data-upgrade="${id}" aria-label="Повысить ${SKILLS[id].name}">↑</button>` : ""}${spec ? `<button class="action-slot skill-button skill-${role.id}" data-action="${spec[0]}" data-skill-id="${id}" data-skill-hotkey="${keyMap[id]}" data-skill-cooldown="${p?.cooldown || 0}" ${p && !(id === "headOn" && game.duet.state(h)?.split) ? "" : "disabled"} style="--skill-color:${role.color};--cooldown-progress:100%" aria-label="${SKILLS[id].name}"><span>${icon}</span><small id="${spec[2]}">${SKILLS[id].name}</small><kbd>${settings.label("Key" + keyMap[id])}</kbd></button>` : `<div class="action-slot passive-token skill-${role.id} ${rank ? "" : "locked-skill"}"><span>${icon}</span><small ${id === "caustic" ? 'id="causticTimer"' : ""}>${SKILLS[id].name} ${rank}/${maxRank}</small></div>`}<div class="skill-detail">${detail}</div></div>`;
  };
  return [...ROLE_SKILLS[h.role]]
    .sort(
      (a, b) =>
        Number(SKILLS[a].ranks.length === 3) -
        Number(SKILLS[b].ranks.length === 3),
    )
    .map(skillSlot)
    .join("");
}
export function renderHUD(game, eraserSelected = false) {
  combatHUD(game);
  renderMatchScore(game);
  const h = game.player;
  const hp = $("#playerHealthBar");
  if (hp) {
    const value = h.dead ? 0 : game.combat.hpLeft(h),
      max = game.combat.healthCapacity(h);
    const team = 1 - h.team;
    const segments = game.combat.healthPages(h.hp).flatMap((page) =>
      page.boards[team].flatMap((v, i) => {
        if (!game.duet.owns(h.hp, i, page)) return [];
        const classes = ["hp-segment", h.dead || v ? "damaged" : "healthy"];
        if (page.armor[team][i] > game.time) classes.push("armored");
        if (v && page.poison[team][i]) classes.push("poisoned");
        if (v && page.universal[team][i]) classes.push("universal");
        if (v && page.doubleStroke[team][i]) classes.push("double-stroke");
        if (v && page.burning?.[team]?.[i]?.until > game.time)
          classes.push("burning");
        return `<i class="${classes.join(" ")}" aria-hidden="true"></i>`;
      }),
    );
    segments.sort(
      (a, b) => Number(a.includes("damaged")) - Number(b.includes("damaged")),
    );
    const markup = `<div class="hp-segments" aria-hidden="true">${segments.join("")}</div><span class="hp-label">${h.dead ? `Возрождение через ${Math.max(0, Math.ceil(h.respawnAt - game.time))} с` : `${value}/${max}`}</span>`;
    if (hp.dataset.sig !== markup) {
      hp.dataset.sig = markup;
      renderMarkup(hp, markup);
    }
    hp.setAttribute("aria-valuenow", String(value));
    hp.setAttribute("aria-valuemin", "0");
    hp.setAttribute("aria-valuemax", String(max));
  }
  $("#gold").textContent = "◉ " + h.gold;
  $("#heroName").textContent = h.name;
  $("#heroRole").textContent = HEROES.find((r) => r.id === h.role).title;
  $("#heroSymbol").innerHTML =
    h.role === "duet"
      ? duetIcon
      : h.role === "sudaks"
        ? sudaksIcon
        : h.role === "sudzh"
          ? sudzhIcon
          : HEROES.find((r) => r.id === h.role).symbol;
  $("#penLevel").textContent = h.hasteTier
    ? "УРОВЕНЬ ПЕРА " + h.hasteTier
    : "УРОВЕНЬ ПЕРА · БАЗОВЫЙ";
  const editor = false;
  if (editor) $("#penLevel").textContent = "ЛАСТИК";
  const combo = game.comboActive(h),
    left = Math.max(
      0,
      (editor
        ? h.eraserAt
        : combo
          ? h.comboUntil
          : h.duel
            ? Math.max(h.duel.pen.get(h.id) || 0, h.duel.locks.get(h.id) || 0)
            : h.nextNormal) - game.time,
    );
  $("#cooldownText").textContent = editor
    ? left
      ? `Ластик: ${left.toFixed(1)} с`
      : game.skill(h, "erase")
        ? "Ластик готов"
        : "Ластик закрыт"
    : combo
      ? `Серия ${h.comboCount + 1} · ${left.toFixed(2)} с`
      : left
        ? `Перо: ${left.toFixed(1)} с`
        : "Перо готово";
  $("#cooldownBar").style.width =
    `${left ? Math.max(0, Math.min(1, left / (combo ? h.comboWindow || 1 : h.lastCooldown))) * 100 : 100}%`;
  $("#cooldownBar").classList.toggle("combo-bar", combo);
  $("#cooldownCaption").textContent = editor
    ? "Стирайте цифры и ставьте камни на чужом листе"
    : `${game.cooldown(h, { kind: "tower" }).toFixed(1)} с · лес / крипы ${game.cooldown(h, { kind: "camp" }).toFixed(2)} с`;
  $("#bagCount").textContent = document.body.classList.contains("alt-held")
    ? `${Math.ceil(PROGRESSION.seconds - h.digitProgress)}с`
    : String(h.digits);
  const chatLog = $("#chatLog");
  if (chatLog) {
    const escape = (text) =>
      String(text).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
    const chatOpen = !$("#chatComposer")?.hidden;
    chatLog.classList.toggle("chat-open", chatOpen);
    renderMarkup(
      chatLog,
      game.chat
        .visible(h.team)
        .slice(chatOpen ? -80 : -6)
        .map(
          (m) =>
            `<div data-ui-key="chat-${m.id}" style="opacity:${chatOpen ? 1 : Math.max(0, 1 - (game.time - m.at - 7))}">${escape(m.system ? m.text : `${m.channel === "team" ? "[Команда] " : ""}${m.name}: ${m.text}`)}</div>`,
        )
        .join(""),
    );
  }
  const pending = new Set(game.pendingOrders(h).map((o) => o.id));
  const passives = ITEMS.filter(
    (i) =>
      (i.id === `health${h.healthSize}` && h.healthSize > 4) ||
      (i.id === `quill${h.hasteTier}` && h.hasteTier) ||
      (i.bootTier === h.bootTier && h.bootTier) ||
      (i.id === "double" && h.double) ||
      (i.id === "misfire" && h.misfire) ||
      (pending.has(i.id) &&
        (i.healthSize ||
          i.tier ||
          i.bootTier ||
          i.id === "double" ||
          i.id === "misfire")),
  );
  renderMarkup(
    $("#passiveItems"),
    passives
      .map(
        (i) =>
          `<button class="action-slot" data-item="${i.id}" data-ui-key="passive-${i.id}" title="${i.name}${pending.has(i.id) ? " · в доставке" : ""}">${shopIcon(i.id)}${pending.has(i.id) ? "<small>В пути</small>" : ""}</button>`,
      )
      .join(""),
  );
  const ring = $("#digitRing");
  ring.style.setProperty(
    "--digit-progress",
    `${(h.digitProgress / PROGRESSION.seconds) * 360}deg`,
  );
  ring.title = `${digitCount(h.digits)} · следующая через ${(PROGRESSION.seconds - h.digitProgress).toFixed(1)} с · Пробел — мгновенный ход`;
  $("#lastUpgrade").textContent = h.lastUpgrade
    ? `${SKILLS[h.lastUpgrade].name} ${h.skillRanks[h.lastUpgrade]}/${SKILLS[h.lastUpgrade].ranks.length}: ${skillDescription(h.lastUpgrade, h.skillRanks[h.lastUpgrade])}`
    : "Выберите первый навык: 3 цифры";
  const duetEl = $("#duetControls"),
    duetState = game.duet.state(h);
  if (duetEl) {
    renderMarkup(
      duetEl,
      duetState?.split
        ? [game.duet.root(h), duetState.oka]
            .map((u) => {
              const file =
                  u.duetPart === "oka" ? "oka-idle.webp" : "sud-idle.webp",
                src =
                  globalThis.SUDOTA_HERO_ASSETS?.[file] ||
                  "assets/heroes/" + file;
              return `<button data-duet-part="${u.duetPart || "sud"}" title="Переключить героя · Tab" class="duet-portrait ${u === h ? "selected" : ""}" ${u.dead ? "disabled" : ""}><span style="background-image:url('${src}')"></span><small>${u.dead ? "Погиб" : game.combat.hpLeft(u) + "/" + game.combat.healthCapacity(u)}</small></button>`;
            })
            .join("")
        : "",
    );
  }
  const effectRows = [];
  const addEffect = (id, name, icon, until, positive) => {
    if (until > game.time && !h.dead)
      effectRows.push({ id, name, icon, until, positive });
  };
  addEffect(
    "speed",
    h.speedEffect?.multiplier > 1 ? "Ускорение" : "Замедление",
    h.speedEffect?.multiplier > 1 ? "↟" : "⇣",
    h.speedEffect?.until,
    h.speedEffect?.multiplier > 1,
  );
  (h.regenBoosts || []).forEach((effect, i) =>
    addEffect(
      "regen" + i,
      "Восстановление / точилка",
      shopIcon("sharpener"),
      effect.until,
      true,
    ),
  );
  addEffect(
    "box",
    "Защитная коробка",
    skillIcon("box"),
    h.boxProtection?.until,
    true,
  );
  addEffect(
    "prison",
    "Судоку-коробка",
    skillIcon("box"),
    h.prison?.until,
    false,
  );
  addEffect(
    "stubborn",
    "Упёртость",
    "◈",
    game.duet.state(h)?.shieldUntil,
    true,
  );
  addEffect("stun", "Оглушение", skillIcon("stun"), h.stunnedUntil, false);
  addEffect("pencil", "Сломанный карандаш", "✎", h.pencilBrokenUntil, false);
  addEffect(
    "binding",
    "Чернильный переплёт",
    skillIcon("inkBinding"),
    h.inkBinding?.until,
    true,
  );
  (h.itemHealing || []).forEach((effect) =>
    addEffect(
      effect.id,
      effect.id === "sharpener2" ? "Большая точилка" : "Точилка",
      shopIcon(effect.id),
      effect.until,
      true,
    ),
  );
  addEffect(
    "ink",
    "Защитные чернила",
    shopIcon("veil"),
    h.hp.effects[1 - h.team]?.until,
    true,
  );
  addEffect(
    "taunt",
    "Боевой клич",
    skillIcon("cry"),
    h.forcedSolve?.until,
    false,
  );
  addEffect(
    "focus",
    "Неточная рука",
    skillIcon("focus"),
    h.errorFocusUntil,
    true,
  );
  addEffect("armor", "Броня клича", skillIcon("cry"), h.sudaksArmorUntil, true);
  const effectsEl = $("#playerEffects");
  if (effectsEl) {
    effectsEl.effectStarts ||= new Map();
    const starts = effectsEl.effectStarts;
    for (const id of starts.keys())
      if (!effectRows.some((effect) => effect.id === id)) starts.delete(id);
    renderMarkup(
      effectsEl,
      effectRows
        .map((effect) => {
          let state = starts.get(effect.id);
          if (!state || state.until !== effect.until) {
            state = { until: effect.until, start: game.time };
            starts.set(effect.id, state);
          }
          const remaining = effect.until - game.time;
          const angle = Math.max(
            0,
            Math.min(
              360,
              (remaining / Math.max(0.001, effect.until - state.start)) * 360,
            ),
          );
          return `<div class="player-effect ${effect.positive ? "positive" : "negative"}" data-ui-key="effect-${effect.id}" style="--effect-angle:${angle}deg" title="${effect.name}: ${Math.ceil(remaining)} с"><span>${effect.icon || "◉"}</span><small>${Math.ceil(remaining)}</small></div>`;
        })
        .join(""),
    );
  }
  const actionSig = JSON.stringify([
    settings.version,
    h.role,
    h.duetPart,
    game.duet.state(h)?.split,
    h.skillRanks,
    h.digits,
    h.double,
    game.depots[0].length,
    h.flowers,
    h.lastLane,
  ]);
  if ($("#actionBar").dataset.sig !== actionSig) {
    $("#actionBar").dataset.sig = actionSig;
    renderMarkup($("#actionBar"), actionsHTML(game));
  }
  const itemSig = JSON.stringify([
    settings.version,
    h.consumables,
    h.eraserTool?.id,
    Math.ceil(Math.max(0, (h.eraserTool?.digitReadyAt || 0) - game.time)),
    Math.ceil(Math.max(0, (h.eraserTool?.wardReadyAt || 0) - game.time)),
    eraserSelected,
  ]);
  if ($("#purchasedItems").dataset.sig !== itemSig) {
    $("#purchasedItems").dataset.sig = itemSig;
    renderMarkup($("#purchasedItems"), itemSlotsHTML(game, eraserSelected));
  }
  for (const [id, at, ready] of [
    [
      "causticTimer",
      h.causticAt || 0,
      `Едкая среда ${h.skillRanks.caustic || 0}/4`,
    ],
    ["stubbornTimer", game.duet.root(h).stubbornAt || 0, "Упёртость"],
    ["bruteforceTimer", game.duet.root(h).bruteforceAt || 0, "Брутфорс"],
    ["throwOkaTimer", game.duet.root(h).throwOkaAt || 0, "Бросок Оки"],
    ["headOnTimer", game.duet.root(h).headOnAt || 0, "Лоб в лоб"],
    ["hookTimer", h.hookAt || 0, "Крюк"],
    ["stenchTimer", 0, h.stench ? "Вонь: включена" : "Вонь"],
    ["freshTimer", h.freshAt || 0, "Свежий судоку"],
    ["eraseTimer", h.eraserAt, "Ластик"],
    ["abductionTimer", h.abductionAt || 0, "Похищение"],
    ["inkBindingTimer", h.inkBindingAt || 0, "Переплёт"],
    ["lassoTimer", h.lassoAt, "Лассо"],
    ["focusTimer", h.errorFocusAt, "Неточная рука"],
    ["tempoTimer", h.tempoAt, "Темп"],
    ["hasteTimer", h.tempoAt, "Темп"],
    [
      "heroSkillTimer",
      h.role === "strong" ? h.areaStunAt : h.heroSkillAt,
      h.role === "combinator"
        ? "Коробка"
        : h.role === "sudaks"
          ? "Боевой клич"
          : h.role === "strong"
            ? "Удар"
            : h.role === "intellect"
              ? "Лечение"
              : "Замедлить",
    ],
    ["breakPencilTimer", h.breakPencilAt || 0, "Сломать карандаш"],
    ["acidTimer", h.acidAt || 0, "Кислота"],
    ["dustTimer", h.dustAt || 0, "Пыль в глаза"],
    ["tornadoTimer", h.tornadoAt || 0, "Торнадо"],
    ["runeTimer", h.runeAt || 0, "Рунный переплёт"],
  ]) {
    const el = $("#" + id);
    if (el && !el.closest("button")?.disabled)
      el.textContent =
        at > game.time ? Math.ceil(at - game.time) + " с" : ready;
  }
  const chargeState = game.fire.charges(h),
    burningButton = $("#burningSkillTimer");
  if (burningButton && chargeState)
    burningButton.textContent = `Горение ${chargeState.count}/3${chargeState.nextAt ? " · " + Math.ceil(chargeState.nextAt - game.time) + " с" : ""}`;
  for (const el of document.querySelectorAll(".skill-button")) {
    const cooldown = Number(el.dataset.skillCooldown) || 0,
      until =
        {
          stubborn: game.duet.root(h).stubbornAt || 0,
          bruteforce: game.duet.root(h).bruteforceAt || 0,
          throwOka: game.duet.root(h).throwOkaAt || 0,
          headOn: game.duet.root(h).headOnAt || 0,
          hook: h.hookAt || 0,
          freshSudoku: h.freshAt || 0,
          rune: h.runeAt,
          burning: game.fire.charges(h)?.nextAt || 0,
          breakPencil: h.breakPencilAt || 0,
          acid: h.acidAt || 0,
          tornado: h.tornadoAt || 0,
          stun: h.areaStunAt,
          lasso: h.lassoAt,
          erase: h.eraserAt,
          rock: h.rockAt,
          focus: h.errorFocusAt,
          tempo: h.tempoAt,
          inkBinding: h.inkBindingAt || 0,
          abduction: h.abductionAt || 0,
        }[el.dataset.skillId] ?? h.heroSkillAt,
      progress = cooldown
        ? Math.max(
            0,
            Math.min(1, 1 - Math.max(0, until - game.time) / cooldown),
          )
        : 1;
    el.style.setProperty("--cooldown-progress", `${progress * 100}%`);
  }
  const c = h.courier,
    status =
      {
        idle: "ожидает",
        outbound: "в пути",
        delivering: "доставляет",
        returning: "возвращается",
      }[c.state] || c.state;
  $("#courierStatus").textContent =
    `Самолётик ${status}${c.state === "idle" ? "" : " · ~" + Math.ceil(game.courierETA(h)) + " с"} · В доставке: ${game.depots[h.team].length + c.cargo.length} вещей`;
  const cores = game.cores.find((t) => t.defender === 1).pages;
  $("#objectiveText").textContent = game.sandbox
    ? "Тестовое поле · одна башня"
    : game.coreUnlocked(0)
      ? `База открыта · листы ${cores.filter((t) => t.completed[0]).length}/3`
      : "Пройдите три башни любой линии";
  return { combo, left };
}

export function updateCursorPen(game, stopped, eraserSelected = false) {
  const el = document.getElementById("cursorPen");
  if (!el) return;
  el.hidden =
    stopped ||
    game.phase !== "playing" ||
    game.player.dead ||
    !el.dataset.visible;
  if (
    !(game.player.pencilBrokenUntil > game.time) &&
    el.querySelector(".broken-pencil-cursor")
  ) {
    el.replaceChildren();
    el.hidden = true;
    return;
  }
  if (eraserSelected) {
    el.textContent = "▱ Ластик · выберите цель";
    return;
  }
  const h = game.player;
  if (h.pencilBrokenUntil > game.time) {
    const a = BROKEN_PENCIL_ANIMATION,
      frame =
        Math.floor(((game.time - h.pencilBrokenAt) * 1000) / a.frameMs) %
        a.frames;
    const src =
      globalThis.SUDOTA_HERO_ASSETS?.[a.file] || "assets/heroes/" + a.file;
    const crop = a.sourceFrames[frame];
    if (!el.querySelector(".broken-pencil-cursor"))
      el.innerHTML = '<span class="broken-pencil-cursor"></span>';
    const sprite = el.firstElementChild;
    sprite.style.cssText = `display:block;width:48px;height:24px;background-image:url("${src}");background-size:288px 96px;background-position:${(-crop.x * 48) / 362}px ${(-crop.y * 24) / 180}px;image-rendering:pixelated`;
    return;
  }
  const until =
    h.stunnedUntil > game.time
      ? h.stunnedUntil
      : game.comboActive(h)
        ? h.comboUntil
        : h.duel
          ? Math.max(h.duel.pen.get(h.id) || 0, h.duel.locks.get(h.id) || 0)
          : h.nextNormal;
  const left = Math.max(0, until - game.time);
  el.hidden ||= left <= 0;
  el.textContent =
    h.stunnedUntil > game.time
      ? `СТАН ${left.toFixed(1)} с`
      : left
        ? `✒ ${left.toFixed(1)} с`
        : "✒ Готово";
}
