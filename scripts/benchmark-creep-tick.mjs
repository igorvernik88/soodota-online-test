import { Game } from "../src/logic.js";
import { performance } from "node:perf_hooks";
const g = new Game(812);
g.start();
while (g.combat.creeps.length < 180) g.combat.spawnWave();
g.combat.creeps = g.combat.creeps.slice(0, 180);
g.time = 100;
for (const [i, u] of g.combat.creeps.entries()) {
  u.spawnAt = 0;
  u.x = u.team ? 4500 : 300;
  u.y = 300 + (i % 90) * 45;
  u.attackAt = Infinity;
  g.combat.sync(u);
}
let calls = 0;
const original = g.vision.visible.bind(g.vision);
g.vision.visible = (...args) => {
  calls++;
  return original(...args);
};
g.vision.refresh(true);
const results = [];
for (let i = 0; i < 9; i++) {
  calls = 0;
  const start = performance.now();
  for (const u of g.combat.creeps) g.combat.creepTick(u, 0);
  results.push(performance.now() - start);
}
results.sort((a, b) => a - b);
const separation = [];
for (let i = 0; i < 9; i++) {
  const at = performance.now();
  g.combat.separateCreeps();
  separation.push(performance.now() - at);
}
separation.sort((a, b) => a - b);
console.log(
  JSON.stringify({
    creeps: 180,
    visibilityCalls: calls,
    creepTickMedianMs: results[4],
    separationMedianMs: separation[4],
  }),
);
