import duet, {
  SUD_ANIMATIONS,
  OKA_ANIMATIONS,
  DUEL_ANIMATIONS,
} from "./duet.js";
import { strip } from "./strip.js";
import editor from "./editor.js";
import sudaks from "./sudaks.js";
import combinator from "./combinator.js";
import intellect from "./intellect.js";
import strong from "./strong.js";
import agile from "./agile.js";
import sudzh from "./sudzh.js";

export const HOOK_ANIMATION = strip("sudzh-hook-flying.webp", {
  frames: 1,
  width: 32,
  height: 16,
  sourceAssetWidth: 512,
  sourceAssetHeight: 256,
});

export const HERO_ANIMATION_STATES = [
  "idle",
  "running",
  "runningAttack",
  "attack",
  "solving",
  "stun",
  "celebrate",
  "death",
];
export const EDITOR_ANIMATION_STATES = ["idle", "running", "celebrate"];
export const COMBAT_ANIMATION_SPEED = 1.3;
export const COMBAT_STATES = new Set([
  "attack",
  "runningAttack",
  "solving",
  "battleCry",
  "stunCast",
]);

export const TRAPPED_ANIMATION = strip("sudoku-box-trapped.webp", {
  frameMs: 150,
  width: 65,
  height: 100,
  anchorY: 0.78,
  imageSmoothing: false,
});

export const BOX_PROTECTION_ANIMATION = strip("box-protection.webp", {
  frameMs: 150,
  width: 65,
  height: 100,
  anchorY: 0.78,
});

export const BOX_PROTECTION_ANIMATIONS = Object.fromEntries(
  ["idle", "walk", "attack"].map((state) => [
    state,
    strip(`sudoku-armor-${state}.webp`, {
      frameMs: state === "idle" ? 150 : 110,
      width: 65,
      height: 100,
      anchorY: 0.78,
      imageSmoothing: false,
    }),
  ]),
);

export const ACID_POOL_ANIMATION = strip("acid-pool.webp", {
  frameMs: 160,
  sourceAssetWidth: 2172,
  sourceAssetHeight: 724,
  sourceFrameWidth: 362,
});

export const BROKEN_PENCIL_ANIMATION = {
  ...strip("broken-pencil.webp", {
    frames: 6,
    frameMs: 130,
    width: 48,
    height: 24,

    sourceFrames: Array.from({ length: 6 }, (_, i) => ({
      x: i * 362,
      y: 280,
      width: 362,
      height: 180,
    })),
  }),
  offsetY: -108,
  timerY: -85,
};

export const SOUL_ANIMATION = {
  ...strip("sudoku-soul.webp", {
    frames: 6,
    frameMs: 170,
    loop: true,
    width: 36 / 1.3,
    height: 44,
    imageSmoothing: false,
    anchorY: 0.9,
  }),
  riseSpeed: 32 * 1.7,
};

export const HERO_ANIMATION_MANIFEST = {
  duet,
  editor,
  sudaks,
  combinator,
  intellect,
  strong,
  agile,
  sudzh,
};

// Shared by the offline build and runtime asset definitions; no source-text scanning.
export function heroAnimationFiles(manifest = HERO_ANIMATION_MANIFEST) {
  return [
    ...new Set(
      [
        ...Object.values(manifest).flatMap(Object.values),
        ...Object.values(SUD_ANIMATIONS),
        ...Object.values(OKA_ANIMATIONS),
        ...Object.values(DUEL_ANIMATIONS),
        TRAPPED_ANIMATION,
        BOX_PROTECTION_ANIMATION,
        ...Object.values(BOX_PROTECTION_ANIMATIONS),
        SOUL_ANIMATION,
        BROKEN_PENCIL_ANIMATION,
        HOOK_ANIMATION,
        ACID_POOL_ANIMATION,
        { file: "courier-green.webp" },
        { file: "courier-red.webp" },
        { file: "base-green.webp" },
        { file: "base-red.webp" },
      ]
        .map((animation) => animation.file)
        .filter(Boolean),
    ),
  ];
}
