import { renderMarkup } from "./ui/dom.js";
import { CONFIG } from "./config.js";
// UI renders a projection of combat state; mutations go through the model.
export function combatHUD(game) {
  const h = game.player,
    health = document.querySelector("#healthHUD");
  const pages = game.combat.healthPages(h.hp),
    total = game.combat.healthCapacity(h),
    text = h.dead
      ? `Возрождение через ${Math.ceil(h.respawnAt - game.time)} с`
      : `♡ ${game.combat.hpLeft(h)}/${total} · здоровье ${h.healthSize >= 9 ? "6×6 + 4×4" : h.healthSize + "×" + h.healthSize}`;
  const grids = pages
    .map((page, pageIndex) => {
      const board = page.boards[1 - h.team],
        rules = page.puzzles[1 - h.team].rules,
        size = rules.size,
        team = 1 - h.team,
        masked = game.maskedIndices(page, team),
        rune = game.runes.active(h.hp, page);
      const cells = board
        .map((v, i) => {
          if (!game.duet.owns(h.hp, i, page))
            return `<span class="torn-missing" data-ui-key="missing-${pageIndex}-${i}"></span>`;
          const classes = ["health-cell"];
          if (
            h.hp.duetFragment &&
            i >= size &&
            !game.duet.owns(h.hp, i - size, page)
          )
            classes.push("torn-top");
          if (
            h.hp.duetFragment &&
            i + size < board.length &&
            !game.duet.owns(h.hp, i + size, page)
          )
            classes.push("torn-bottom");
          if (v) classes.push("hurt");
          else if (page.armor[1 - h.team][i] > game.time)
            classes.push("armored");
          if (v && page.burning?.[team]?.[i]?.until > game.time)
            classes.push("burning");
          if (v && page.poison[team][i]) classes.push("poisoned");
          if (page.holes[team].includes(i)) classes.push("hole");
          if (page.stones[team][i]) classes.push("stone");
          if (masked.includes(i)) classes.push("masked");
          if (page.errors[team][i]?.until > game.time) classes.push("error");
          if (rune?.keys.includes(i)) classes.push("rune-key");
          if (rune?.z === i) classes.push("rune-sealed");
          if (typeof page.universal[1 - h.team][i] === "number")
            classes.push("universal-hp");
          if (((i % size) + 1) % rules.blockCols === 0 && i % size !== size - 1)
            classes.push("block-right");
          if (
            (Math.floor(i / size) + 1) % rules.blockRows === 0 &&
            i < size * (size - 1)
          )
            classes.push("block-bottom");
          let digit = masked.includes(i)
            ? "▨"
            : page.stones[team][i]
              ? "⬟"
              : page.holes[team].includes(i)
                ? "•"
                : v > 0
                  ? game.displayDigit(page, team, v)
                  : "";
          if (!digit && page.errors[team][i]?.until > game.time)
            digit = game.displayDigit(page, team, page.errors[team][i].value);
          if (rune?.keys.includes(i)) {
            const labels =
              rune.level === 3 ? ["A", "B", "C₁", "C₂"] : ["A", "B", "C"];
            digit += `<small class="health-rune-label">${labels[rune.keys.indexOf(i)]}</small>`;
          }
          if (rune?.z === i)
            digit += '<small class="health-rune-label">Z</small>';
          if (v > 0 && typeof page.universal[team][i] === "number")
            digit = `<span class="universal-digit">${digit}</span>`;
          return `<span data-ui-key="health-cell-${pageIndex}-${i}" class="${classes.join(" ")}">${digit}</span>`;
        })
        .join("");
      return `<div class="health-page" data-ui-key="health-page-${pageIndex}" style="--health-size:${size}" title="${page.recovery?.[1 - h.team]?.remaining > 0 ? `Восстановление листа через ${Math.ceil(page.recovery[1 - h.team].remaining / (game.atBase(h, CONFIG.baseRegenRadius) ? 2 : 1))} с` : `Здоровье ${size}×${size}`}">${pages.length > 1 ? `<small>Лист ${size}×${size}</small>` : ""}<div class="health-grid" data-ui-key="health-grid-${pageIndex}-${size}" style="grid-template-columns:repeat(${size},minmax(0,1fr));grid-template-rows:repeat(${size},minmax(0,1fr))" aria-label="Судоку здоровья героя ${size}×${size}">${cells}</div></div>`;
    })
    .join("");
  const detail = h.dead
    ? "Покупки доступны во время возрождения"
    : game.atBase(h, CONFIG.baseRegenRadius)
      ? `Восстановление: 1 клетка / 1 с · радиус базы ${CONFIG.baseRegenRadius}`
      : "Регенерация: 1 клетка / 12 с";
  const html = `<div class="health-summary"><strong>${text}</strong><small>${detail}</small>${pages.map((page, i) => (page.recovery?.[1 - h.team]?.remaining > 0 ? `<small>Лист ${i + 1}: восстановление через ${Math.ceil(page.recovery[1 - h.team].remaining / (game.atBase(h, CONFIG.baseRegenRadius) ? 2 : 1))} с</small>` : "")).join("")}</div><div class="health-pages">${grids}</div>`;
  health.classList.toggle("multi-page", pages.length > 1);
  renderMarkup(health, html);
  const panel = document.querySelector("#questBoard");
  const arrow = document.querySelector("#questArrow");
  if (arrow) {
    arrow.hidden = h.role !== "editor";
    arrow.textContent = panel.dataset.open ? "← Задачи" : "Задачи →";
  }
  panel.hidden = h.role !== "editor" || !panel.dataset.open;
  if (panel.hidden) return;
  const jobs = [];
  for (const ally of game.heroes.filter((a) => a.team === h.team)) {
    const orders = game.pendingOrders(ally).filter((o) => o.type === "item");
    if (orders.length)
      jobs.push({
        title: `${ally.name} · доставка`,
        text: `${orders.length} вещей. Доставит командный самолётик.${ally.dead ? " Адресат возрождается." : ""}`,
        action: "delivery",
        id: ally.id,
      });
    for (const req of ally.requests)
      jobs.push({
        title: `${ally.name} · запрос`,
        text: {
          delivery: "Нужна доставка снаряжения",
          shovel: "Нужна лопата для камня",
          lane: "Нужна помощь на линии",
        }[req.type],
        action: req.type,
        id: ally.id,
      });
  }
  for (const t of game.locations) {
    const team = h.team;
    if (game.vision.visible(team, t) && Object.keys(t.stones[team]).length)
      jobs.push({
        title: t.name,
        text: "Камень блокирует клетку. Подойдите с покупной Лопатой.",
        action: "stone",
        id: t.id,
      });
  }
  if (game.flower?.active)
    jobs.push({
      title: "Цветок на реке",
      text: "Забрать раньше врага: следующая ступень здоровья и +70 монет.",
      action: "flower",
      id: "flower",
    });
  const body = `<span class="eyebrow">ПРАВЩИК · ЗАДАЧИ КОМАНДЫ</span><h3>Доска поручений</h3>${jobs.length ? jobs.map((j) => `<article><b>${j.title}</b><p>${j.text}</p><button data-job="${j.action}" data-job-id="${j.id}">Выполнить →</button></article>`).join("") : "<p>Нет срочных запросов. Помогайте на линии или наблюдайте за чужим полем.</p>"}`;
  renderMarkup(panel, body);
}
export function combatClick(game, button, ui) {
  const h = game.player;
  if (button.dataset.action === "quests") {
    const panel = document.querySelector("#questBoard");
    if (panel.dataset.open) delete panel.dataset.open;
    else panel.dataset.open = "1";
    ui.update();
    return true;
  }
  if (button.dataset.praise !== undefined) {
    game.combat.praise(h, game.heroes[Number(button.dataset.praise)]);
    ui.update();
    return true;
  }
  if (button.dataset.request) {
    game.combat.request(h, button.dataset.request);
    ui.toast("Запрос передан команде");
    ui.update();
    return true;
  }
  if (!button.dataset.job) return false;
  if (h.dead) {
    ui.toast("Дождитесь возрождения");
    return true;
  }
  const id = button.dataset.jobId,
    ally = game.heroes[Number(id)];
  switch (button.dataset.job) {
    case "delivery":
      ui.toast("Заказы доставляет командный самолётик");
      break;
    case "flower":
      game.requestFlower(h);
      break;
    case "stone": {
      const t = game.getTarget(id),
        index = Number(Object.keys(t.stones[h.team])[0]);
      const r = game.requestShovel(h, t, index);
      ui.toast(r.ok ? "Камень снят" : r.message);
      break;
    }
    case "shovel": {
      const t = game.locations.find(
        (t) => Object.keys(t.stones[h.team]).length,
      );
      if (t) {
        const r = game.requestShovel(
          h,
          t,
          Number(Object.keys(t.stones[h.team])[0]),
        );
        ui.toast(r.ok ? "Камень снят" : r.message);
      } else ui.toast("Камней на ваших листах нет");
      break;
    }
    case "lane":
      if (ally) ui.goTo(game.attackTarget(ally.lastLane, h.team));
      break;
  }
  ui.update();
  return true;
}
