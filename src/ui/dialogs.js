import { HEROES } from "../config.js";
import { timeLabel } from "./shared.js";
import { sudaksIcon, sudzhIcon, duetIcon } from "./icons.js";
const $ = (s) => document.querySelector(s);
export function chooseScreen(sandbox = false) {
  const dialog = $("#heroSelect");
  dialog.innerHTML = `<span class="eyebrow">${sandbox ? "ТЕСТОВОЕ ПОЛЕ" : "ПЯТЬ ГЕРОЕВ В КОМАНДЕ"}</span><h2>${sandbox ? "Кого проверить первым?" : "Кто напишет вашу историю?"}</h2><p class="panel-description">${sandbox ? "Одна башня и два героя. Во время игры заменяйте любого из них и переключайте сторону для её обзора." : "Выберите героя; четыре союзника и пять противников будут ботами."}</p><div class="mode-choice"><button data-mode="match" ${sandbox ? "" : 'aria-current="true"'}>Обычный матч</button><button data-mode="sandbox" ${sandbox ? 'aria-current="true"' : ""}>Тестовое поле</button></div><div class="hero-select-grid">${HEROES.map((r) => `<button class="hero-option" data-role="${r.id}" style="--hero-color:${r.color}"><span class="hero-symbol">${r.id === "duet" ? duetIcon : r.id === "sudaks" ? sudaksIcon : r.id === "sudzh" ? sudzhIcon : r.symbol}</span><small>${r.title}</small><h3>${r.name}</h3><p>${r.description}</p><b>Выбрать →</b></button>`).join("")}</div>`;
  if (!dialog.open) dialog.showModal();
}
export function showResult(game) {
  const h = game.player;
  $("#result").innerHTML =
    `<span class="eyebrow">ТРИ ЛИСТА СОБРАНЫ</span><h2>${game.winner === 0 ? "История за Листьями." : "Кляксы написали финал."}</h2><p>Победитель собрал все три судоку 9×9 на вражеской базе.</p><div class="result-stats"><div><b>${timeLabel(game.time)}</b><span>время</span></div><div><b>${h.cardCount}</b><span>мгновенные цифры</span></div><div><b>${h.normalCount}</b><span>ходы пером</span></div><div><b>${h.earned}</b><span>монеты</span></div></div><button class="primary" data-action="restart">Новый герой, новая история →</button>`;
  $("#result").showModal();
}
