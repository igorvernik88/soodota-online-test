import { PROGRESSION, SKILLS, ROLE_SKILLS } from "./config.js";

// Personal state survives death; only a new game resets it.
export class Progression {
  constructor(game) {
    this.game = game;
  }
  initialize(h) {
    h.digits = PROGRESSION.start;
    h.digitProgress = 0;
    h.skillRanks = Object.fromEntries(ROLE_SKILLS[h.role].map((id) => [id, 0]));
    h.lastUpgrade = null;
    h.digitIncome = {};
    h.digitsSpent = { skills: 0, moves: 0 };
  }
  skill(h, id) {
    const rank = h.skillRanks?.[id] || 0;
    return rank ? SKILLS[id].ranks[rank - 1] : null;
  }
  add(h, count, reason) {
    h.digits += count;
    h.digitIncome[reason] = (h.digitIncome[reason] || 0) + count;
  }
  progress(h, seconds, reason = "timer") {
    if (!(seconds > 0)) return;
    h.digitProgress += seconds;
    const count = Math.floor((h.digitProgress + 1e-9) / PROGRESSION.seconds);
    if (count) {
      h.digitProgress = Math.max(
        0,
        h.digitProgress - count * PROGRESSION.seconds,
      );
      this.add(h, count, reason);
    }
  }
  spend(h, count, reason) {
    if (h.digits < count) return false;
    h.digits -= count;
    h.digitsSpent[reason] += count;
    return true;
  }
  upgrade(h, id) {
    const rank = h.skillRanks?.[id];
    if (
      !["buy", "playing"].includes(this.game.phase) ||
      rank === undefined ||
      rank >= SKILLS[id].ranks.length
    )
      return { ok: false, message: "Навык недоступен" };
    const cost = (SKILLS[id].costs || PROGRESSION.costs)[rank];
    if (!this.spend(h, cost, "skills"))
      return { ok: false, message: `Нужно ${cost} цифр` };
    h.skillRanks[id]++;
    if (id === "burning") this.game.fire.charges(h);
    h.lastUpgrade = id;
    this.game.emit("upgrade", { hero: h.id, skill: id, rank: rank + 1, cost });
    return { ok: true };
  }
  next(h) {
    return ROLE_SKILLS[h.role]
      .filter((id) => h.skillRanks[id] < SKILLS[id].ranks.length)
      .sort((a, b) => h.skillRanks[a] - h.skillRanks[b])[0];
  }
  bot(h) {
    let id;
    while (
      (id = this.next(h)) &&
      h.digits >= (SKILLS[id].costs || PROGRESSION.costs)[h.skillRanks[id]]
    ) {
      if (!this.upgrade(h, id).ok) break;
    }
  }
  available(h) {
    const id = this.next(h);
    return Math.max(
      0,
      h.digits -
        (id ? (SKILLS[id].costs || PROGRESSION.costs)[h.skillRanks[id]] : 0),
    );
  }
}
export function skillDescription(id, rank) {
  if (!rank) return "Закрыт";
  const p = SKILLS[id].ranks[rank - 1],
    labels = {
      speed: "ускорение",
      hitRadius: "радиус попадания",
      projectileSpeed: "скорость крюка",
      range: "дальность",
      radius: "радиус",
      interval: "интервал урона",
      limit: "цифр в серии",
      cap: "предел цифр на героя",
      pen: "сокращение кулдауна пера",
      incoming: "входящее горение",
      keys: "ключей",
      window: "окно",
      reduction: "уменьшение за ход",
      minimum: "минимум",
      strength: "сила",
      duration: "длительность",
      cooldown: "перезарядка",
      chance: "шанс",
      factor: "восстановление ×",
      count: "цифр",
      delay: "задержка",
      pages: "листов 4×4",
      hints: "подсказок на лист",
      armor: "брони",
      discount: "скидка",
    };
  return Object.entries(p)
    .map(
      ([k, v]) =>
        `${labels[k] || k} ${["chance", "strength", "discount", "speed", "pen"].includes(k) ? Math.round(v * 100) + "%" : v + (["window", "reduction", "minimum", "duration", "cooldown", "delay", "interval"].includes(k) ? " с" : "")}`,
    )
    .join(" · ");
}
