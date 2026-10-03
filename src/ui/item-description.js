import { ITEMS } from "../config.js";
export function positionItemDescription() {
  const message = document.getElementById("itemDescription");
  if (!message || message.hidden) return;
  const panel = document.getElementById("panel");
  if (!panel || panel.hidden || !panel.classList.contains("shop-panel")) {
    message.hidden = true;
    return;
  }
  const rect = panel.getBoundingClientRect();
  message.style.left = `${rect.right + 12}px`;
  message.style.top = `${rect.top + rect.height / 2}px`;
}
export function showItemDescription(id, armorPrice) {
  const item =
    id === "armor"
      ? {
          name: "Броня",
          price: armorPrice,
          description:
            "Бронирует случайную клетку здоровья серым цветом: первое попадание снимает броню, второе наносит урон. Действует 3 минуты. Запас восстанавливается на одну покупку каждые 20 секунд.",
        }
      : ITEMS.find((entry) => entry.id === id);
  if (!item) return;
  let message = document.getElementById("itemDescription");
  if (!message) {
    message = document.createElement("aside");
    message.id = "itemDescription";
    message.setAttribute("aria-live", "polite");
    message.innerHTML =
      '<h2></h2><p class="item-price"></p><p class="item-effect"></p><button aria-label="Закрыть описание">×</button>';
    message.querySelector("button").onclick = () => {
      message.hidden = true;
    };
    document.body.append(message);
  }
  message.querySelector("h2").textContent = item.name;
  message.querySelector(".item-price").textContent = item.price
    ? `${item.price} монет`
    : "Бесплатно";
  message.querySelector(".item-effect").textContent = item.description;
  message.hidden = false;
  positionItemDescription();
}
