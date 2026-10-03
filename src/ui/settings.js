import { BINDINGS, settings, keyLabel } from "../settings.js";
import { renderMarkup } from "./dom.js";
let waiting = null,
  changed = () => {};
function render() {
  renderMarkup(
    document.querySelector("#keyBindings"),
    BINDINGS.map(
      ([id, name]) =>
        `<label>${name}<button type="button" data-bind="${id}">${waiting === id ? "Нажмите клавишу…" : keyLabel(settings.bindings[id])}</button></label>`,
    ).join(""),
  );
  const size = document.querySelector("#miniSize");
  size.value = settings.miniSize;
  document.querySelector("#miniSizeValue").textContent =
    settings.miniSize + " px";
  for (const [selector, code] of [["#followButton kbd", "KeyF"]]) {
    const element = document.querySelector(selector);
    if (element) element.textContent = settings.label(code);
  }
  const pause = document.querySelector("#pauseButton");
  if (pause) pause.title = "Пауза · " + settings.label("F1");
  document.documentElement.style.setProperty(
    "--mini-size",
    settings.miniSize + "px",
  );
}
export function setupSettings(onChange) {
  changed = onChange;
  document.querySelector("#keyBindings").onclick = (e) => {
    const button = e.target.closest("[data-bind]");
    if (button) {
      waiting = button.dataset.bind;
      render();
    }
  };
  document.querySelector("#miniSize").oninput = (e) => {
    settings.resize(e.target.value);
    render();
    changed();
  };
  document.querySelector("#resetSettings").onclick = () => {
    waiting = null;
    settings.reset();
    render();
    changed();
  };
  render();
}
export function captureBinding(e) {
  if (!waiting) return false;
  e.preventDefault();
  if (e.code === "Escape") {
    waiting = null;
    render();
    return true;
  }
  if (e.repeat) return true;
  if (settings.bind(waiting, e.code)) {
    waiting = null;
    render();
    changed();
  }
  return true;
}
export function cancelBinding() {
  waiting = null;
  render();
}
