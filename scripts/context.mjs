import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Keep ownership here: the local guide and the skill both route through this map.
const areas = {
  hud: {
    files: [
      "index.html",
      "src/ui/hud.js",
      "src/ui/match-score.js",
      "src/combat-ui.js",
      "styles/hud.css",
      "styles/skills.css",
      "styles/scoreboard.css",
      "styles/health-effects.css",
    ],
    symbols:
      "renderHUD, combatHUD, renderMatchScore, actionsHTML, itemSlotsHTML, #healthHUD, .action-bar, .item-shelf",
    tests: "tests/ui.test.mjs",
  },
  input: {
    files: ["src/app.js", "src/ui/dom.js", "src/erasers.js"],
    symbols:
      "skillModifierHeld, setSkillModifier, keydown, data-action, data-use, renderMarkup, eraserSelection, EraserSystem.use/requestPickup",
    tests: "tests/ui.test.mjs tests/erasers.test.mjs",
  },
  animations: {
    files: [
      "src/animations/manifest.js",
      "src/animations/strip.js",
      "src/animations/agile.js",
      "src/animations/intellect.js",
      "src/animations/strong.js",
      "src/animations/sudaks.js",
      "src/animations/combinator.js",
      "src/animations/editor.js",
      "src/hero-animation.js",
      "src/render.js",
    ],
    symbols:
      "role files: crop/size/timing; HeroAnimator: state/frame selection; Renderer.hero: placement; heroAnimationFiles: offline assets",
    tests: "tests/render.test.mjs",
  },
  skills: {
    files: [
      "src/config.js",
      "src/progression.js",
      "src/hero-effects.js",
      "src/logic.js",
      "src/ui/hud.js",
      "styles/skills.css",
    ],
    symbols:
      "SKILLS, ROLE_SKILLS, heroSkill, areaStun, burningSkill, errorFocusSkill, upgradeSkill, place",
    tests: "tests/progression.test.mjs tests/hero-effects.test.mjs",
  },
  combat: {
    files: [
      "src/combat.js",
      "src/boards.js",
      "src/combat-ui.js",
      "src/erasers.js",
    ],
    symbols:
      "kill, respawn, newHealth, healthPages, creepTick, structureTick, updateRegenInterval",
    tests: "tests/combat.test.mjs tests/erasers.test.mjs",
  },
  puzzles: {
    files: [
      "src/sudoku.js",
      "src/boards.js",
      "src/ui/puzzle.js",
      "src/ui/ward.js",
      "src/wards.js",
      "src/logic.js",
      "styles/puzzles.css",
      "styles/health-effects.css",
    ],
    symbols:
      "puzzleHTML, place, selectPage, visibleBoard, blockedIndices, .puzzle-panel",
    tests: "tests/game.test.mjs tests/ui.test.mjs tests/wards.test.mjs",
  },
  world: {
    files: [
      "src/config.js",
      "src/render.js",
      "src/vision.js",
      "src/logic.js",
      "src/wards.js",
    ],
    symbols:
      "LANES, TRAILS, BASES, RIVER, WARDS, WardSystem, Renderer, draw, drawFog, hit, advanceHero, separateHeroes",
    tests:
      "tests/render.test.mjs tests/armor-vision.test.mjs tests/wards.test.mjs tests/world-scale.test.mjs",
  },
  economy: {
    files: [
      "src/config.js",
      "src/progression.js",
      "src/logic.js",
      "src/wards.js",
      "src/erasers.js",
      "src/ui/shop.js",
      "styles/shop-layout.css",
    ],
    symbols:
      "ITEMS, WARDS, ERASER, WardSystem.stock/reserve, EraserSystem, itemPrice, buy, deliver, editorDelivery, tickCourier, pendingOrders",
    tests:
      "tests/item-changes.test.mjs tests/game.test.mjs tests/wards.test.mjs tests/erasers.test.mjs",
  },
  bots: {
    files: ["src/logic.js", "src/combat.js", "src/wards.js", "src/erasers.js"],
    symbols:
      "bot, botMove, botShop, botUseItems, botCombat, forcedSolve, WardSystem.botPurchase/usefulSites/bot",
    tests:
      "tests/game.test.mjs tests/combat.test.mjs tests/wards.test.mjs tests/world-scale.test.mjs tests/erasers.test.mjs",
  },
  build: {
    files: [
      "scripts/build.mjs",
      "index.html",
      "style.css",
      "src/animations/manifest.js",
      "package.json",
    ],
    symbols:
      "heroAnimationFiles, offline-fonts; sudota.html is generated, never edit it",
    tests: "tests/ui.test.mjs",
  },
};

const args = process.argv.slice(2);
const findIndex = args.indexOf("--find");
const query = findIndex < 0 ? null : args[findIndex + 1];
const areaName = args[0] && !args[0].startsWith("--") ? args[0] : null;
if ((areaName && !areas[areaName]) || (findIndex >= 0 && !query)) {
  console.error(
    "Usage: npm run context -- [area] [--find text]\nAreas: " +
      Object.keys(areas).join(", "),
  );
  process.exitCode = 1;
} else {
  const area = areas[areaName];
  if (area) {
    console.log(
      `${areaName}\n${area.files.map((file) => "  " + file).join("\n")}\nSearch: ${area.symbols}\nFocused checks: node --test ${area.tests}`,
    );
  } else if (!query) {
    console.log(
      "Areas: " +
        Object.keys(areas).join(", ") +
        "\nExamples: npm run context -- hud\n          npm run context -- --find .action-bar\nCSS matches are listed in cascade order; use the last applicable rule.",
    );
  }
  if (query) {
    const entry = await fs.readFile(path.join(root, "style.css"), "utf8");
    const styles = [...entry.matchAll(/@import\s+"\.\/(styles\/[^\"]+)"/g)].map(
      (match) => match[1],
    );
    const sources = area
      ? area.files
      : Object.values(areas).flatMap((item) => item.files);
    const files = [...new Set(["style.css", ...styles, ...sources])];
    const matches = [];
    for (const file of files) {
      const lines = (await fs.readFile(path.join(root, file), "utf8")).split(
        "\n",
      );
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(query.toLowerCase()))
          matches.push(`${file}:${index + 1}: ${line.trim().slice(0, 200)}`);
      });
    }
    console.log(
      `Matches for ${JSON.stringify(query)} (CSS in cascade order):\n` +
        (matches.slice(0, 60).join("\n") || "none"),
    );
    if (matches.length > 60)
      console.log(`${matches.length - 60} more matches; narrow the query.`);
  }
}
