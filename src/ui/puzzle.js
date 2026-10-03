import { ITEMS, SKILLS } from "../config.js";
export function puzzleHTML(game, t, viewer, { spy, selected, notes, skill }) {
  const compact = t.unit?.kind === "creep",
    team = viewer.team,
    p = game.puzzle(viewer, t),
    b = game.board(viewer, t),
    n = p.rules.size,
    masked = [...game.maskedIndices(t, team), ...game.personalMask(viewer, t)],
    blocked = game.blockedIndices(viewer, t),
    holes = t.holes[team],
    phantoms =
      !spy &&
      game.player.phantoms?.target === t.id &&
      game.player.phantoms.page === (t.activePage || 0)
        ? game.player.phantoms
        : null,
    access =
      !spy &&
      game.near(game.player, t) &&
      game.objectiveAccess(game.player, t).ok;
  const ink = game.inkBinding.active(t);
  const closed = spy ? [] : game.inkBinding.blocked(viewer, t);
  const dust = !spy && game.dust.active(viewer, t);
  if (dust && selected >= 0) game.dust.select(viewer, t, selected);
  const hints = game.hints(viewer, t);
  const rune = game.runes.active(t);
  const keyLabels =
    rune?.level === 3 ? ["A", "B", "C₁", "C₂"] : ["A", "B", "C"];
  const runeSum = rune
    ? rune.keys.reduce(
        (sum, i) =>
          sum +
          game.displayDigit(t, rune.team, t.puzzles[rune.team].solution[i]),
        0,
      )
    : 0;
  const runeStatus = rune
    ? `<div class="rune-status" data-ui-key="rune-${t.id}-${t.activePage || 0}">${rune.level === 3 ? "A + B + (C₁ + C₂)" : rune.level === 2 ? "A + B + C" : "A + B"} = ${runeSum} · Z запечатана</div>`
    : "";
  const duelLocked = t.kind === "duel" && !game.duet.duelInputReady(t);
  const duelTotal =
    t.kind === "duel" ? p.solution.filter((_, i) => !p.givens[i]).length : 1;
  const duelStatus =
    t.kind === "duel"
      ? `<div class="duel-status" data-ui-key="duel-status"><span>${t.finished ? "Схватка завершена" : duelLocked ? "Захват · ввод пока недоступен" : Math.max(0, Math.ceil(t.until - game.time)) + " с"}</span><div class="duel-score-bar" role="img" aria-label="Прогресс схватки">${t.participants.map((u) => `<i class="${u.id === viewer.id ? "duel-score-own" : "duel-score-enemy"}" style="width:${(100 * t.scores.get(u.id)) / Math.max(1, duelTotal)}%"></i>`).join("")}</div></div>`
      : "";
  return `${compact ? "" : `<div class="panel-heading"><h2>${t.name}${t.kind === "prison" ? " · " + Math.ceil(t.until - game.time) + " с" : ""}</h2>${t.kind === "prison" ? "" : '<button class="close" data-action="close" aria-label="Закрыть">×</button>'}</div>`}${t.kind === "ward" ? wardStatusHTML(game, t) : ""}${duelStatus}${dust ? `<div class="dust-status">Пыль в глаза · ${Math.ceil(t.unit.dustUntil - game.time)} с · обзор 3×3</div>` : ""}${ink ? `<div class="dust-status">Чернильный переплёт · ${Math.ceil(ink.until - game.time)} с</div>` : ""}${spy ? inspectionDetails(game, t) : ""}${runeStatus}${t.pages?.length > 1 ? `<div class="core-tabs">${t.pages.map((page, i) => `<button data-page="${i}" class="${t.activePage === i ? "active" : ""}" title="${page.completed[team] ? "Завершено" : "Открыть лист"}">${i + 1}/${t.pages.length}${page.recovery?.[team]?.remaining > 0 ? ` · ${Math.ceil(page.recovery[team].remaining)} с` : page.completed[team] ? " ✓" : ""}</button>`).join("")}</div>` : ""}<div data-ui-key="grid-${t.id}-${t.activePage || 0}" class="sudoku-grid ${t.duetFragment ? "torn-grid fragment-" + t.duetFragment : ""} size-${n}${rune ? " rune-active" : ""}" style="grid-template-columns:repeat(${n},minmax(0,1fr));grid-template-rows:repeat(${n},minmax(0,1fr));--board-n:${n};--rune-remaining:${rune ? Math.max(0, Math.min(100, ((rune.until - game.time) / SKILLS.rune.ranks[rune.level - 1].duration) * 100)) : 0}%">${b
    .map((v, i) => {
      if (!game.duet.owns(t, i))
        return `<span class="torn-missing" data-ui-key="missing-${i}" aria-hidden="true"></span>`;
      const dusty =
        (!spy && !game.dust.readable(viewer, t, i)) || closed.includes(i);
      const hidden = masked.includes(i),
        hole = holes.includes(i),
        error = t.errors[team][i],
        stone = t.stones[team][i],
        ghost = phantoms?.entries.find((e) => e.index === i);
      let cls = "cell";
      if (t.duetFragment) {
        if (i >= n && !game.duet.owns(t, i - n)) cls += " torn-top";
        if (i + n < b.length && !game.duet.owns(t, i + n))
          cls += " torn-bottom";
      }
      if (
        t.kind === "duel" &&
        t.owners?.[i] != null &&
        t.owners[i] !== viewer.id
      )
        cls += " duel-enemy-digit";
      if (hole) cls += " hole";
      else if (stone) cls += " stone";
      else if (hidden) cls += " masked";
      else if (p.givens[i]) cls += " given";
      else if (v > 0) cls += " entered";
      if (t.poison[team][i] && v) cls += " poisoned";
      if (v && t.burning?.[team]?.[i]?.until > game.time) cls += " burning";
      const armored = t.armor[team][i] > game.time && !v;
      if (armored) cls += " armored";
      if (rune?.keys.includes(i)) cls += " rune-key";
      if (rune?.z === i) cls += " rune-sealed";
      if (selected === i) cls += " selected";
      if (((i % n) + 1) % p.rules.blockCols === 0 && i % n !== n - 1)
        cls += " block-right";
      if (
        (Math.floor(i / n) + 1) % p.rules.blockRows === 0 &&
        Math.floor(i / n) !== n - 1
      )
        cls += " block-bottom";
      let content = hole
        ? '<span class="hole-mark" aria-hidden="true"></span>'
        : stone
          ? "⬟"
          : hidden
            ? "▨"
            : v > 0
              ? game.displayDigit(t, team, v)
              : "";
      const arrival = t.arrivals?.[team]?.[i];
      if (v > 0 && !hole && !stone && !hidden) {
        const digit = game.displayDigit(t, team, v),
          digitMarkup = t.universal?.[team]?.[i]
            ? `<span class="universal-digit">${digit}</span>`
            : game.time - (t.doubleStroke?.[team]?.[i] ?? -Infinity) < 1.4
              ? `<span class="double-stroke-digit">${digit}</span>`
              : digit;
        content =
          arrival !== undefined
            ? `<span data-appear-at="${arrival}" style="opacity:${Math.max(0, Math.min(1, (game.time - arrival) / 1))}">${digitMarkup}</span>`
            : digitMarkup;
      }
      if (!content && error?.until > game.time)
        content = `<span class="error-digit" data-fade-at="${error.at}" data-fade-until="${error.until}">${game.displayDigit(t, team, error.value)}</span>`;
      if (!v && error?.misfire && error.until > game.time)
        content = `<span class="misfire-result${error.caustic ? " caustic-result" : ""}"><span class="misfire-digit">${game.displayDigit(t, team, error.attempted)}</span><span class="misfire-wrong error-digit">${game.displayDigit(t, team, error.value)}</span></span>`;
      else if (!content && ghost && phantoms.until > game.time)
        content = `<span class="phantom-digit" data-fade-at="${phantoms.at}" data-fade-until="${phantoms.until}">${game.displayDigit(t, team, ghost.value)}</span>`;
      else if (!content && hints.some((e) => e.index === i)) {
        content = `<span class="guide-digit">${game.displayDigit(t, team, hints.find((e) => e.index === i).value)}</span>`;
      } else if (!content && !spy) {
        const marks =
          game.player.notes[
            (t.rootId || t.id) + ":" + (t.activePage || 0) + ":" + i
          ] || [];
        content = `<span class="notes">${Array.from({ length: n }, (_, k) => `<span>${marks.includes(game.displayDigit(t, team, k + 1)) ? k + 1 : "&nbsp;"}</span>`).join("")}</span>`;
      }
      const label = dusty
        ? closed.includes(i)
          ? "закрыто Переплётом"
          : "скрыто пылью"
        : hole
          ? "дырка, засчитано"
          : stone
            ? "камень"
            : hidden
              ? "скрыто"
              : v > 0
                ? "цифра " + game.displayDigit(t, team, v)
                : "пусто";
      if (rune?.keys.includes(i))
        content += `<span class="rune-label">${keyLabels[rune.keys.indexOf(i)]}</span>`;
      if (rune?.z === i) content += '<span class="rune-label">Z · 🔒</span>';
      if (dusty) content = "";
      return `<button class="${dusty ? "cell dust-covered " + (cls.includes("block-right") ? "block-right " : "") + (cls.includes("block-bottom") ? "block-bottom " : "") + (selected === i ? "selected" : "") : cls}" data-cell="${i}" aria-label="Строка ${Math.floor(i / n) + 1}, столбец ${(i % n) + 1}, ${label}">${content}</button>`;
    })
    .join(
      "",
    )}</div>${spy || compact || t.kind === "duel" ? "" : `<div class="digit-pad digits-${n}"><button data-action="notes" class="${notes ? "active" : ""}" title="Заметки · N" aria-label="Заметки">✎</button>${Array.from({ length: p.rules.digitMax || n }, (_, i) => `<button data-digit="${i + 1}" ${!access || duelLocked ? "disabled" : ""} title="${"Ход пером; Пробел — универсальная цифра"}">${i + 1}</button>`).join("")}</div>`}`;
}
import { wardStatusHTML } from "./ward.js";

function inspectionDetails(game, t) {
  const h = t.unit,
    team = 1 - game.player.team;
  const progress = (t.pages || [t])
    .map(
      (p) =>
        `${p.boards[team].filter((v, i) => v && !p.puzzles[team].givens[i]).length}/${p.puzzles[team].givens.filter((v) => !v).length}`,
    )
    .join(" · ");
  if (!h) return `<p class="small-note">Атака врага: ${progress}</p>`;
  const items = [
    ...Object.entries(h.consumables)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => `${ITEMS.find((i) => i.id === id)?.name || id} ×${n}`),
    ...(h.eraserTool ? ["Ластик"] : []),
    ...ITEMS.filter(
      (i) =>
        (i.tier && i.tier === h.hasteTier) ||
        (i.bootTier && i.bootTier === h.bootTier) ||
        (i.healthSize && i.healthSize === h.healthSize) ||
        (i.id === "double" && h.double),
    ).map((i) => i.name),
  ];
  const effects = [
    ["Оглушение", h.stunnedUntil],
    ["Пыль", h.dustUntil],
    ["Карандаш сломан", h.pencilBrokenUntil],
    ["Темп", h.speedEffect?.until],
    ["Переплёт", h.inkBinding?.until],
    ["Коробка", h.boxProtection?.until],
    ["Торнадо", h.tornadoUntil],
  ]
    .filter(([, until]) => until > game.time)
    .map(([name, until]) => `${name}: ${Math.ceil(until - game.time)} с`);
  return `<p class="small-note">ХП: ${game.combat.hpLeft(h)}/${game.combat.healthCapacity(h)}${h.dead ? " · погиб" : ""}<br>Предметы: ${items.join(", ") || "нет"}<br>Эффекты: ${effects.join(", ") || "нет"}</p>`;
}
