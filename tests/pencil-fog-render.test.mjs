import test from "node:test";
import assert from "node:assert/strict";
import { BROKEN_PENCIL_ANIMATION as pencil } from "../src/animations/manifest.js";
import { Renderer } from "../src/render.js";

test("pencil position survives strip creation and fallback fog has dense normalized taps", () => {
  assert.ok(
    Number.isFinite(pencil.offsetY) && pencil.offsetY + pencil.height < -73,
  );
  assert.ok(Number.isFinite(pencil.timerY));
  const previous = globalThis.document;
  const surfaces = [];
  const context = () => ({
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    clearRect() {},
    setTransform() {},
    fillRect() {},
    save() {},
    restore() {},
    drawImage(...args) {
      this.draws.push({ args, alpha: this.globalAlpha });
    },
    draws: [],
  });
  globalThis.document = {
    createElement() {
      const c = context();
      const canvas = { width: 0, height: 0, getContext: () => c };
      surfaces.push(canvas);
      return canvas;
    },
  };
  try {
    const r = Object.create(Renderer.prototype);
    r.game = {
      player: { team: 0 },
      vision: { refresh() {}, fogSources: () => [] },
    };
    const output = context();
    r.drawFog(output, 1440, 670);
    const blur = surfaces.slice(1);
    assert.equal(blur.length, 3);
    assert.equal(blur[0].width, 360);
    for (const surface of blur.slice(1)) {
      const draws = surface.getContext().draws;
      assert.equal(draws.length, 25);
      assert.ok(
        Math.abs(draws.reduce((sum, d) => sum + d.alpha, 0) - 1) < 1e-10,
      );
      assert.ok(draws.every((d) => d.args.slice(1).every(Number.isFinite)));
    }
    assert.equal(output.draws.length, 1);
  } finally {
    globalThis.document = previous;
  }
});
