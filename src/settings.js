export const BINDINGS = [
  ["skill1", "Навык 1", "KeyQ"],
  ["skill2", "Навык 2", "KeyW"],
  ["skill3", "Навык 3", "KeyE"],
  ["skill4", "Навык 4", "KeyR"],
  ["skill5", "Навык 5", "KeyT"],
  ["item1", "Предмет 1", "KeyX"],
  ["item2", "Предмет 2", "KeyC"],
  ["item3", "Предмет 3", "KeyV"],
  ["item4", "Предмет 4", "KeyB"],
  ["shop", "Магазин", "KeyI"],
  ["notes", "Заметки", "KeyN"],
  ["overview", "Обзор карты", "KeyM"],
  ["focus", "Следовать за героем", "KeyF"],
  ["universal", "Универсальная цифра", "Space"],
  ["pause", "Пауза", "F1"],
  ["chat", "Открыть чат", "Enter"],
];
const defaults = () =>
  Object.fromEntries(
    BINDINGS.map(([id, , code]) => [
      id,
      {
        item1: "KeyD",
        item2: "KeyF",
        item3: "KeyG",
        item4: "KeyH",
        pause: "Digit0",
        focus: "F2",
      }[id] || code,
    ]),
  );
const allowed = (code) =>
  /^(Key[A-Z]|Digit0|F([1-9]|1[0-2])|Space|Enter)$/.test(code);
export const keyLabel = (code) =>
  code === "Space" ? "Пробел" : code.replace(/^(Key|Digit)/, "");
export class Settings {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.bindings = defaults();
    this.miniSize = 220;
    this.version = 0;
    try {
      const saved = JSON.parse(storage?.getItem("sudota-settings") || "null");
      if (saved) {
        const keys = { ...this.bindings, ...saved.bindings };
        if (
          BINDINGS.every(([id]) => allowed(keys[id])) &&
          new Set(BINDINGS.map(([id]) => keys[id])).size === BINDINGS.length
        )
          this.bindings = Object.fromEntries(
            BINDINGS.map(([id]) => [id, keys[id]]),
          );
        if (Number.isFinite(saved.miniSize))
          this.miniSize = Math.max(180, Math.min(420, saved.miniSize));
      }
    } catch {}
  }
  save() {
    this.version++;
    try {
      this.storage?.setItem(
        "sudota-settings",
        JSON.stringify({ bindings: this.bindings, miniSize: this.miniSize }),
      );
    } catch {}
  }
  bind(id, code) {
    if (!BINDINGS.some(([key]) => key === id) || !allowed(code)) return false;
    const other = BINDINGS.find(
      ([key]) => key !== id && this.bindings[key] === code,
    );
    if (other) this.bindings[other[0]] = this.bindings[id];
    this.bindings[id] = code;
    this.save();
    return true;
  }
  canonicalCode(code) {
    const action = BINDINGS.find(([id]) => this.bindings[id] === code);
    return action
      ? action[2]
      : BINDINGS.some(([, , original]) => original === code)
        ? ""
        : code;
  }
  label(canonical) {
    const action = BINDINGS.find(([, , code]) => code === canonical);
    return keyLabel(action ? this.bindings[action[0]] : canonical);
  }
  resize(size) {
    this.miniSize = Math.max(180, Math.min(420, Number(size) || 220));
    this.save();
  }
  reset() {
    this.bindings = defaults();
    this.miniSize = 220;
    this.save();
  }
}
export const settings = new Settings();
