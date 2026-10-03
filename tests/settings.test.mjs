import test from "node:test";
import assert from "node:assert/strict";
import { Settings } from "../src/settings.js";
import { Game } from "../src/logic.js";
import { Renderer } from "../src/render.js";
function storage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_, next) => {
      value = next;
    },
  };
}
test("rebinding persists, disables the previous key and swaps conflicts", () => {
  const store = storage(),
    s = new Settings(store);
  assert.ok(s.bind("skill1", "KeyU"));
  assert.equal(s.canonicalCode("KeyU"), "KeyQ");
  assert.equal(s.canonicalCode("KeyQ"), "");
  assert.ok(s.bind("item1", "KeyW"));
  assert.equal(s.canonicalCode("KeyW"), "KeyX");
  assert.equal(s.canonicalCode("KeyX"), "KeyW");
  const loaded = new Settings(store);
  assert.equal(loaded.label("KeyQ"), "U");
  assert.equal(loaded.label("KeyX"), "W");
  assert.equal(s.bind("skill1", "Escape"), false);
  assert.equal(s.bind("skill1", "Digit1"), false);
  s.reset();
  assert.equal(s.canonicalCode("KeyQ"), "KeyQ");
  assert.equal(s.miniSize, 220);
});
test("settings tolerate malformed storage and clamp minimap size", () => {
  const s = new Settings(storage("broken"));
  assert.equal(s.miniSize, 220);
  s.resize(1000);
  assert.equal(s.miniSize, 420);
  s.resize(10);
  assert.equal(s.miniSize, 180);
  assert.equal(new Settings(s.storage).miniSize, 180);
  const duplicate = new Settings(
    storage(JSON.stringify({ bindings: { skill1: "KeyW" } })),
  );
  assert.equal(duplicate.bindings.skill1, "KeyQ");
});
test("minimap renders river, forest, bridges and round tower markers", () => {
  const g = new Game(18);
  g.vision.visible = () => false;
  g.vision.appearance = (_, t) => t;
  const colors = [],
    arcs = [];
  const c = new Proxy(
    {},
    {
      get: (o, key) =>
        o[key] ||
        ((...args) => {
          if (key === "arc") arcs.push(args);
        }),
      set: (o, key, value) => {
        if (key === "strokeStyle" || key === "fillStyle") colors.push(value);
        o[key] = value;
        return true;
      },
    },
  );
  const r = Object.create(Renderer.prototype);
  Object.assign(r, { game: g, mini: { getContext: () => c } });
  r.drawMini();
  assert.ok(colors.includes("#639eac"));
  assert.ok(colors.includes("#527547"));
  assert.ok(colors.includes("#cdbb8c"));
  assert.ok(
    arcs.filter((a) => a[2] === 3).length >=
      g.towers.filter((t) => !t.destroyed).length,
  );
});
