import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

// --duration 600 stops at a fixed game time without requiring a finished match.
// --source accepts the preserved baseline so both versions use this reporter.
const args = process.argv.slice(2);
const option = (key, fallback) =>
  args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const duration = Number(option("--duration", 2400));
const fixed = args.includes("--duration");
if (!Number.isFinite(duration) || duration <= 0)
  throw new Error("Invalid duration");
const source = path.resolve(option("--source", "src/logic.js"));
const { Game, CONFIG, HEROES } = await import(pathToFileURL(source));
const runs = [];
for (const seed of [42, 98, 1234]) {
  for (const role of HEROES.map((r) => r.id)) {
    const g = new Game(seed, { autoPlayer: true, role });
    g.start();
    for (
      let elapsed = 0;
      elapsed < duration && g.phase === "playing";
      elapsed += 0.25
    )
      g.tick(Math.min(0.25, duration - elapsed));
    if (!fixed)
      assert.equal(
        g.phase,
        "ended",
        `Seed ${seed}, role ${role}: unfinished match`,
      );
    const cards = g.heroes.reduce((n, h) => n + h.cardCount, 0);
    const pen = g.heroes.reduce((n, h) => n + h.normalCount, 0);
    runs.push({
      seed,
      role,
      seconds: g.time,
      phase: g.phase,
      winner: g.winner,
      score: g.score,
      cardShare: cards / Math.max(1, cards + pen),
      creepDeaths: g.events.filter((e) => e.type === "death" && e.hero === null)
        .length,
      creepsAlive: g.combat.creeps.filter((c) => !c.dead).length,
      heroes: g.heroes.map((h) => ({
        id: h.id,
        team: h.team,
        role: h.role,
        gold: h.gold,
        earned: h.earned,
        spent: h.spent,
        income: h.income,
        health: h.healthSize,
        deaths: h.deaths,
        kills: h.kills,
        digits: h.digits ?? h.cards?.length,
        progress: h.digitProgress,
        digitIncome: h.digitIncome,
        digitsSpent: h.digitsSpent,
        ranks: h.skillRanks,
        cards: h.cardCount,
        pen: h.normalCount,
        healthPurchases: g.events.filter(
          (e) =>
            e.type === "itemReceived" &&
            e.hero === h.id &&
            ["health6", "health9"].includes(e.item),
        ),
      })),
    });
    console.log(seed, role, g.time, g.phase);
  }
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = option("--out", `reports/balance-${stamp}.json`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  JSON.stringify({ source, fixed, duration, config: CONFIG, runs }, null, 2),
  { flag: "wx" },
);
console.log(`Report: ${output}`);
