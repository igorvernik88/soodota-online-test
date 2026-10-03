import { strip } from "./strip.js";

const fresh = (name, options = {}) =>
  strip(`editor-${name}.webp`, {
    // Match the corrected attack scale; stun stars still fit the running silhouette height.
    width: 96,
    height: 144,
    anchorY: 640 / 768,
    imageSmoothing: false,
    sourceAssetWidth: 3072,
    sourceAssetHeight: 768,
    sourceFrameWidth: 512,
    ...options,
  });
export default {
  attack: fresh("fighting"),
  solving: fresh("drawing"),
  runningAttack: fresh("flying-attack", { frameMs: 110 }),
  inkCast: fresh("ink-throw", { loop: false }),
  stun: fresh("stunned"),
  death: fresh("death", { loop: false, frameMs: 180 }),
  idle: strip("editor-idle.webp", {
    frameMs: 180,
    width: 58,
    height: 105,
    anchorY: 0.775,
    imageSmoothing: false,
    sourceFrameWidth: 362,
    sourceFrames: [
      { x: 0, width: 386, offsetX: -12 },
      { x: 386, width: 343, offsetX: 11 },
      { x: 729, width: 356, offsetX: 14 },
      { x: 1085, width: 330, offsetX: 27 },
      { x: 1415, width: 384, offsetX: -17 },
      { x: 1799, width: 373, offsetX: 16 },
    ],
  }),
  running: strip("editor-running.webp", {
    frameMs: 110,
    width: 58,
    height: 105,
    anchorX: 0.5,
    anchorY: 0.7333,
    imageSmoothing: false,
    sourceFrameWidth: 362,
    sourceFrames: [
      { x: 0, width: 373, offsetX: -19 },
      { x: 373, width: 352, offsetX: 8 },
      { x: 725, width: 361, offsetX: 5 },
      { x: 1086, width: 361, offsetX: -2 },
      { x: 1447, width: 373, offsetX: -19 },
      { x: 1820, width: 352, offsetX: 13 },
    ],
  }),
  celebrate: strip("editor-celebrate.webp", {
    frameMs: 160,
    loop: false,
    width: 58,
    height: 105,
    anchorY: 0.775,
    imageSmoothing: false,
    sourceFrameWidth: 362,
    sourceFrames: [
      { x: 0, width: 394, offsetX: -13 },
      { x: 394, width: 340, offsetX: 19 },
      { x: 734, width: 335, offsetX: 16 },
      { x: 1069, width: 346, offsetX: -4 },
      { x: 1415, width: 395, offsetX: -4 },
      { x: 1810, width: 362, offsetX: 0 },
    ],
  }),
};
