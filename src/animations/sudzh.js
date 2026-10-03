import { strip } from "./strip.js";
const sprite = (name, options = {}) =>
  strip(`sudzh-${name}.webp`, {
    width: 70.8,
    height: 106.2,
    anchorY: 640 / 768,
    sourceAssetWidth: 3072,
    sourceAssetHeight: 768,
    sourceFrameWidth: 512,
    imageSmoothing: false,
    ...options,
  });
export default {
  idle: sprite("idle", { frameMs: 180 }),
  running: sprite("running", { frameMs: 110 }),
  runningAttack: sprite("running-attack", { frameMs: 150 }),
  attack: sprite("fighting", { frameMs: 150 }),
  freshSudoku: sprite("fresh-sudoku", {
    frameMs: 150,
    width: 92.04,
    height: 138.06,
  }),
  solving: sprite("drawing", { frameMs: 150 }),
  stun: sprite("idle", { frameMs: 200 }),
  celebrate: sprite("idle", { loop: false }),
  death: sprite("death", { frameMs: 180, loop: false }),
};
