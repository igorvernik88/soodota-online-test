import { ITEMS, WARDS } from "../config.js";
import { header } from "./shared.js";
const shopIconFiles = {
  stone: "stone.webp",
  shovel: "shovel.webp",
  eraserTool: "eraser-tool.webp",
  ward: "ward.webp",
  sharpener: "sharpener.webp",
  sharpener2: "automatic-sharpener.webp",
  health6: "health-binding.webp",
  health9: "great-binding.webp",
  quill1: "quill.webp",
  quill2: "quill.webp",
  quill3: "rune-quill-silver.webp",
  quill4: "chronograph-quill.webp",
  double: "double-stroke.webp",
  boots1: "boots.webp",
  bootsMid: "boots.webp",
  boots2: "winged-boots.webp",
  stun1: "stun.webp",
  stun2: "stun.webp",
  stun3: "stun.webp",
  miniInk: "ink.webp",
  veil: "ink.webp",
  lasso: "lasso.webp",
  invert: "mirror.webp",
  eraser: "eraser-enemy.webp",
  armor: "armor.webp",
  misfire: "misfire.webp",
};
export const shopIcon = (id) => {
  const file = shopIconFiles[id],
    src = globalThis.SUDOTA_SHOP_ASSETS?.[file] || `assets/shop-icons/${file}`;
  return `<img class="shop-item-icon" src="${src}" alt="" aria-hidden="true" draggable="false">`;
};
export function shopHTML(game, recipientId) {
  const h = game.player,
    r = game.heroes[recipientId] || h;
  if (r.team !== 0) recipientId = 0;
  const recipient = game.heroes[recipientId],
    orders = game.pendingOrders(recipient),
    wardStock = game.wards.stock(h.team),
    ward = ITEMS.find((item) => item.id === "ward");
  const groups = [
    ["НАЧАЛЬНЫЕ ПРЕДМЕТЫ", (item) => item.price <= 100],
    ["РАННЯЯ ИГРА", (item) => item.price > 100 && item.price <= 360],
    ["СЕРЕДИНА ИГРЫ", (item) => item.price > 360 && item.price <= 760],
    ["ПОЗДНЯЯ ИГРА", (item) => item.price > 760],
  ];
  const itemButton = (item) => {
    const owned =
      item.id === "misfire"
        ? recipient.misfire || orders.some((o) => o.id === "misfire")
        : item.healthSize
          ? game.combat.committedHealth(recipient) >= item.healthSize
          : item.tier
            ? game.committedTier(recipient) >= item.tier
            : item.bootTier
              ? game.committedBootTier(recipient) >= item.bootTier
              : item.id === "eraserTool"
                ? game.erasers.owns(h.team)
                : item.id === "double" &&
                  (recipient.double || orders.some((o) => o.id === item.id));
    const stock = game.itemStock(recipient, item);
    const price = game.itemPrice(h, item.id, recipient);
    return `<button class="shop-icon" data-item="${item.id}" ${owned || (stock && !stock.available) || h.gold < price || (item.id === "stone" && game.stoneReadyAt[h.team] > game.time) ? "disabled" : ""} title="${item.name} · ${item.description} · ${owned ? "есть или заказано" : price + " монет"}">${shopIcon(item.id)}<small>${stock ? `${stock.available}/${item.stockLimit}${stock.nextAt !== null ? " · " + Math.ceil(stock.nextAt - game.time) + "с" : ""} · ` : ""}${owned ? "✓" : item.id === "stone" && game.stoneReadyAt[h.team] > game.time ? Math.ceil(game.stoneReadyAt[h.team] - game.time) + "с" : price + "◉"}</small></button>`;
  };
  return (
    header("ЕДИНАЯ ЛАВКА", "Снаряжение") +
    `<div class="shop-wallet"><span>◉ ${h.gold}</span><small>Цифры — личный ресурс боя и навыков</small></div>${
      h.role === "editor"
        ? `<label class="target-label">Для кого покупаем?<select id="recipientSelect">${game.heroes
            .filter((a) => a.team === 0)
            .map(
              (a) =>
                `<option value="${a.id}" ${a.id === recipientId ? "selected" : ""}>${a.id === 0 ? "Вы · " : ""}${a.name}</option>`,
            )
            .join("")}</select></label>`
        : ""
    }${game.phase === "buy" ? '<button class="primary start-button" data-action="start">Начать поход →</button>' : ""}<section class="ward-shop"><button class="shop-icon" data-item="ward" ${!wardStock.available ? "disabled" : ""} title="${ward.description}">${shopIcon("ward")}<small>Бесплатно</small></button><div><b>Вард · общий запас ${wardStock.available}/${Math.max(WARDS.stockLimit, wardStock.available)}</b><small>${wardStock.available ? "Доступен всей команде" : `Восстановление через ${Math.ceil(wardStock.remaining)} с`}</small></div></section><div class="shop-grid"><button class="shop-card armor-card" data-item="armor" ${!h.armorStock || h.gold < game.combat.armorPrice(h) || (!h.dead && !game.combat.healthPages(h.hp).some((page) => page.boards[1 - h.team].some((v, i) => !v && !page.armor[1 - h.team][i]))) ? "disabled" : ""} title="Броня на себя: случайная клетка требует два попадания. Действует 3 минуты. Запас +1 каждые 20 с."><b>${shopIcon("armor")}</b><span>${game.combat.armorPrice(h)} ◉</span><small>${h.armorStock}/${game.combat.armorLimit(h)}${h.armorRestockAt !== null ? " · " + Math.max(0, Math.ceil(h.armorRestockAt - game.time)) + " с" : ""}</small></button></div><div class="item-shop icon-shop">${groups
      .map(
        ([name, includes], tier) =>
          `<section class="shop-tier" data-cost-tier="${tier}"><b>${name}</b><div>${ITEMS.filter(
            (item) => item.id !== "ward" && includes(item),
          )
            .map(itemButton)
            .join("")}</div></section>`,
      )
      .join(
        "",
      )}</div><p class="courier-box">Цифры не продаются и не передаются. Снаряжение забирает на базе и доставляет командный самолётик. На базе получателя покупка выдаётся сразу.</p><button class="help-line" data-action="tutorial">Полевой справочник ↗</button>`
  );
}
