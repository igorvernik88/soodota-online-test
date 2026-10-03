import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { heroAnimationFiles } from "../src/animations/manifest.js";
import { HEROES, WARDS } from "../src/config.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [javascript, styles, template] = await Promise.all([
  build({
    absWorkingDir: root,
    entryPoints: ["src/app.js"],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2022",
    minify: true,
    legalComments: "none",
    metafile: true,
  }),
  build({
    absWorkingDir: root,
    entryPoints: ["style.css"],
    bundle: true,
    write: false,
    minify: true,
    legalComments: "none",
    plugins: [
      {
        name: "offline-fonts",
        setup(b) {
          b.onLoad({ filter: /style\.css$/ }, async (args) => ({
            contents: (await fs.readFile(args.path, "utf8")).replace(
              /^@import\s+url\([^)]+\);\s*/m,
              "",
            ),
            loader: "css",
          }));
        },
      },
    ],
  }),
  fs.readFile(path.join(root, "index.html"), "utf8"),
]);
const css = styles.outputFiles[0].text,
  js = javascript.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const assetDataUrl = async (file) => {
  const mime = file.endsWith(".webp") ? "image/webp" : "image/png";
  return `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`;
};
const heroFiles = heroAnimationFiles(),
  heroAssets = Object.fromEntries(
    await Promise.all(
      heroFiles.map(async (file) => [
        file,
        await assetDataUrl(path.join(root, "assets/heroes", file)),
      ]),
    ),
  ),
  minimapHeroAssets = Object.fromEntries(
    await Promise.all(
      HEROES.map(async ({ id: role }) => [
        role,
        await assetDataUrl(
          path.join(root, "assets/heroes/minimap", `${role}.png`),
        ),
      ]),
    ),
  ),
  creepDirectories = ["team1", "enemy"],
  creepAssets = Object.fromEntries(
    await Promise.all(
      creepDirectories.map(async (directory) => {
        const assetDirectory = path.join(
            root,
            "assets/animations/sudoku-runner",
            directory,
          ),
          files = (await fs.readdir(assetDirectory)).filter((file) =>
            file.endsWith(".webp"),
          );
        return [
          directory,
          Object.fromEntries(
            await Promise.all(
              files.map(async (file) => [
                file,
                await assetDataUrl(path.join(assetDirectory, file)),
              ]),
            ),
          ),
        ];
      }),
    ),
  ),
  wardAssets = Object.fromEntries(
    await Promise.all(
      WARDS.sprites.map(async ({ file }) => [
        file,
        await assetDataUrl(path.join(root, "assets/wards", file)),
      ]),
    ),
  ),
  shopIconAssets = Object.fromEntries(
    await Promise.all(
      (await fs.readdir(path.join(root, "assets/shop-icons")))
        .filter((file) => file.endsWith(".webp"))
        .map(async (file) => [
          file,
          await assetDataUrl(path.join(root, "assets/shop-icons", file)),
        ]),
    ),
  ),
  skillIconAssets = Object.fromEntries(
    await Promise.all(
      (await fs.readdir(path.join(root, "assets/skill-icons")))
        .filter((file) => file.endsWith(".webp"))
        .map(async (file) => [
          file,
          await assetDataUrl(path.join(root, "assets/skill-icons", file)),
        ]),
    ),
  ),
  towerAssets = await loadAnimationAssets("sudoku-tower"),
  blotTowerAssets = await loadAnimationAssets("sudoku-blot-tower");

async function loadAnimationAssets(directory) {
  const assetDirectory = path.join(root, "assets/animations", directory);
  return Object.fromEntries(
    await Promise.all(
      (await fs.readdir(assetDirectory))
        .filter((file) => file.endsWith(".webp"))
        .map(async (file) => [
          file,
          await assetDataUrl(path.join(assetDirectory, file)),
        ]),
    ),
  );
}
const stylesheet = /<link rel="stylesheet" href="style.css"\s*\/?>/;
const entry = '<script type="module" src="src/app.js"></script>';
if (!stylesheet.test(template) || !template.includes(entry))
  throw new Error("Missing stylesheet or script entry in index.html");
const html = template
  .replace(stylesheet, () => `<style>${css}</style>`)
  .replace(
    entry,
    () =>
      `<script>globalThis.SUDOTA_HERO_ASSETS=${JSON.stringify(heroAssets)};globalThis.SUDOTA_MINIMAP_HERO_ASSETS=${JSON.stringify(minimapHeroAssets)};globalThis.SUDOTA_CREEP_ASSETS=${JSON.stringify(creepAssets)};globalThis.SUDOTA_WARD_ASSETS=${JSON.stringify(wardAssets)};globalThis.SUDOTA_SHOP_ASSETS=${JSON.stringify(shopIconAssets)};globalThis.SUDOTA_SKILL_ASSETS=${JSON.stringify(skillIconAssets)};globalThis.SUDOTA_TOWER_ASSETS=${JSON.stringify(towerAssets)};globalThis.SUDOTA_BLOT_TOWER_ASSETS=${JSON.stringify(blotTowerAssets)}</script><script>${js}</script>`,
  );
await fs.writeFile(path.join(root, "sudota.html"), html);
console.log(
  `Built sudota.html (${Buffer.byteLength(html)} bytes); ${Object.keys(javascript.metafile.inputs).length} JavaScript modules bundled.`,
);
