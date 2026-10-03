export function header(tag, title) {
  return `<div class="panel-heading"><div><span class="eyebrow">${tag}</span><h2>${title}</h2></div><button class="close" data-action="close" aria-label="Закрыть">×</button></div>`;
}

export const timeLabel = (t) =>
  `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
