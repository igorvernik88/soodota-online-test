import { strip } from "./strip.js";
const sprite = (prefix, state, options = {}) =>
  strip(`${prefix}-${state}.webp`, {
    width: 72,
    height: 130,
    anchorY: 0.79,
    imageSmoothing: false,
    ...options,
    frameMs: (options.frameMs || 150) * 1.5,
  });
const states = (prefix) => ({
  idle: sprite(prefix, "idle"),
  running: sprite(prefix, prefix === "oka" ? "idle" : "running", {
    frameMs: 110,
  }),
  runningAttack: sprite(
    prefix,
    prefix === "duet"
      ? "running-attack"
      : prefix === "oka"
        ? "attack"
        : "running",
    { frameMs: 110 },
  ),
  attack: sprite(prefix, "attack", { frameMs: 110 }),
  solving: sprite(prefix, prefix === "oka" ? "attack" : "solving"),
  stun: sprite(prefix, "stun"),
  death: sprite(prefix, "death", { loop: false }),
  celebrate: sprite(prefix, "idle"),
});
export const SUD_ANIMATIONS = states("sud");
export const OKA_ANIMATIONS = Object.fromEntries(
  Object.entries(states("oka")).map(([key, animation]) => [
    key,
    { ...animation, width: 48, height: 104, anchorY: 0.65 },
  ]),
);
const duelSprite = (state, options = {}) =>
  sprite("duet-duel", state, {
    width: 108,
    height: 195,
    frameMs: 165,
    ...options,
  });
export const DUEL_ANIMATIONS = {
  start: { ...duelSprite("start", { loop: false }), frameMs: 1000 / 6 },
  enemy: duelSprite("enemy"),
  tie: duelSprite("tie", {
    frames: 2,
    sourceFrames: [
      { x: 0, width: 362 },
      { x: 362, width: 362 },
    ],
  }),
  winning: duelSprite("winning"),
  ends: { ...duelSprite("ends", { loop: false }), frameMs: 1000 / 6 },
  ashes: duelSprite("ashes", { loop: false }),
};
const duration = (a) => (a.frames * a.frameMs) / 1000;
export const DUEL_START_SECONDS = duration(DUEL_ANIMATIONS.start);
export const DUEL_END_SECONDS = duration(DUEL_ANIMATIONS.ends);
export const DUEL_ASHES_SECONDS = duration(DUEL_ANIMATIONS.ashes);
export function duelAnimationPose(d, time, ashes = false) {
  const [hero, enemy] = d.participants;
  const ending = d.finished && time >= d.endingAt;
  const name = ashes
    ? "ashes"
    : ending
      ? "ends"
      : time - d.startedAt < DUEL_START_SECONDS
        ? "start"
        : d.scores.get(enemy.id) === d.scores.get(hero.id)
          ? "tie"
          : d.scores.get(enemy.id) > d.scores.get(hero.id)
            ? "enemy"
            : "winning";
  const animation = DUEL_ANIMATIONS[name];
  const startedAt = ashes
    ? d.ashesAt
    : ending
      ? d.endingAt
      : name === "start"
        ? d.startedAt
        : Math.max(d.startedAt + DUEL_START_SECONDS, d.leadAt || d.startedAt);
  const raw = Math.floor(
    (Math.max(0, time - startedAt) * 1000) / animation.frameMs,
  );
  return {
    ...animation,
    name,
    frame: animation.loop
      ? raw % animation.frames
      : Math.min(animation.frames - 1, raw),
    facingLeft: false,
  };
}
OKA_ANIMATIONS.mounted = sprite("oka", "mounted", {
  width: 48,
  height: 104,
  anchorY: 0.65,
  frameMs: 110,
});
export default {
  ...states("duet"),
  windup: sprite("duet-duel", "windup", { frameMs: 400 / 6, loop: false }),
  stubborn: sprite("duet", "stubborn", { frameMs: 110, loop: false }),
};
