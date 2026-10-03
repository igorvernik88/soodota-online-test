export function wardStatusText(game, ward) {
  const status = game.wards.status(ward);
  return `Осталось ${Math.ceil(status.lifetime)} с · ${status.regen === null ? "Регенерация начнётся после первого верного ввода" : `Восстановление через ${status.regen.toFixed(1)} с · 1 цифра / ${status.interval} с`}${status.suppressed ? " · Регенерация подавлена союзником" : ""}`;
}
export function wardStatusHTML(game, ward) {
  const suppressed = game.wards.status(ward).suppressed;
  return `<p data-ui-key="ward-status-${ward.id}" class="ward-status${suppressed ? " suppressed" : ""}" role="status">${wardStatusText(game, ward)}</p>`;
}
