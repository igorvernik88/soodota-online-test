import { CONFIG, ERASER, WARDS } from "./config.js";
import { dist } from "./sudoku.js";

// One instance survives orders, delivery, death and capture; clocks use game time.
export class EraserSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.serial = 0;
  }
  owns(team) {
    return this.list.some((item) => item.team === team);
  }
  reserve(team) {
    if (this.owns(team)) return null;
    const item = {
      id: `eraser-${++this.serial}`,
      kind: "eraser-drop",
      name: "Ластик",
      team,
      state: "ordered",
      owner: null,
      digitReadyAt: 0,
      wardReadyAt: 0,
    };
    this.list.push(item);
    return item;
  }
  deliver(hero, id) {
    const item = this.list.find((entry) => entry.id === id);
    if (!item || item.state !== "ordered" || item.team !== hero.team)
      return false;
    item.state = "carried";
    item.owner = hero.id;
    hero.eraserTool = item;
    return true;
  }
  ground() {
    return this.list.filter((item) => item.state === "ground");
  }
  get(id) {
    return this.ground().find((item) => item.id === id);
  }
  visible(team, item) {
    return (
      item.state === "ground" &&
      this.game.vision.visible(team, { x: item.x, y: item.y })
    );
  }
  drop(hero) {
    const items = [hero.eraserTool].filter(Boolean);
    hero.eraserTool = null;
    hero.eraserPickup = null;
    for (const item of items) {
      Object.assign(item, {
        state: "ground",
        owner: null,
        x: hero.x,
        y: hero.y,
      });
      this.game.emit("eraserDropped", { hero: hero.id, target: item.id });
    }
  }
  actorAccess(hero) {
    if (hero.duel)
      return {
        ok: false,
        message: "Во время дуэли доступно только обычное перо",
      };
    const g = this.game;
    return g.actors().includes(hero) &&
      g.phase === "playing" &&
      !hero.dead &&
      hero.stunnedUntil <= g.time &&
      !g.sudzh.held(hero) &&
      !g.heroEffects.trapped(hero) &&
      !(hero.forcedSolve?.until > g.time)
      ? { ok: true }
      : {
          ok: false,
          message: "Сейчас нельзя использовать или подобрать Ластик",
        };
  }
  pickupAccess(hero, item) {
    const access = this.actorAccess(hero);
    if (!access.ok) return access;
    if (!this.list.includes(item) || !this.visible(hero.team, item))
      return { ok: false, message: "Ластик больше не виден или уже подобран" };
    if (this.list.some((other) => other !== item && other.team === hero.team))
      return { ok: false, message: "У команды уже есть другой Ластик" };
    return this.game.inventoryAccess(hero, "eraserTool");
  }
  pickup(hero, item) {
    const access = this.pickupAccess(hero, item);
    if (!access.ok) return access;
    if (dist(hero, item) > CONFIG.interactRadius)
      return { ok: false, message: "Подойдите ближе, чтобы подобрать Ластик" };
    Object.assign(item, { state: "carried", owner: hero.id, team: hero.team });
    hero.eraserTool = item;
    hero.eraserPickup = null;
    this.game.emit("eraserPickedUp", { hero: hero.id, target: item.id });
    return { ok: true };
  }
  requestPickup(hero, item) {
    const access = this.pickupAccess(hero, item);
    if (!access.ok) return access;
    if (dist(hero, item) <= CONFIG.interactRadius)
      return this.pickup(hero, item);
    this.game.move(hero, item.x, item.y);
    hero.eraserPickup = item.id;
    return { ok: true, queued: true };
  }
  transfer(hero, ally) {
    const access = this.actorAccess(hero);
    if (!access.ok) return access;
    if (
      !hero.eraserTool ||
      !this.game.heroes.includes(ally) ||
      ally === hero ||
      ally.team !== hero.team ||
      ally.dead ||
      ally.eraserTool ||
      dist(hero, ally) > CONFIG.interactRadius
    )
      return { ok: false, message: "Передайте Ластик живому союзнику рядом" };
    const inventory = this.game.inventoryAccess(ally, "eraserTool");
    if (!inventory.ok) return inventory;
    ally.eraserTool = hero.eraserTool;
    ally.eraserTool.owner = ally.id;
    hero.eraserTool = null;
    return { ok: true };
  }
  access(hero, target) {
    const g = this.game,
      access = this.actorAccess(hero),
      item = hero?.eraserTool;
    if (!access.ok) return access;
    if (
      !item ||
      item.state !== "carried" ||
      item.owner !== hero.id ||
      !this.list.includes(item)
    )
      return { ok: false, message: "У героя нет Ластика" };
    if (target?.kind === "ward") {
      if (
        !g.wards.isActive(target) ||
        target.defender === hero.team ||
        !g.vision.visible(hero.team, target)
      )
        return { ok: false, message: "Выберите обнаруженный вражеский вард" };
      if (dist(hero, target) > WARDS.interactRadius)
        return { ok: false, message: "Подойдите ближе к варду" };
      if (item.wardReadyAt > g.time)
        return {
          ok: false,
          message: `Снятие варда перезаряжается: ${Math.ceil(item.wardReadyAt - g.time)} с`,
        };
      return { ok: true, effect: "ward" };
    }
    const unit = target?.unit || target,
      isHero = g.heroes.includes(unit),
      board = isHero ? unit.hp : target;
    if (
      !(isHero && unit.team === hero.team) &&
      !(g.towers.includes(board) && board.defender === hero.team)
    )
      return {
        ok: false,
        message: "Выберите себя, союзного героя или союзную башню",
      };
    if (unit.dead || board.destroyed)
      return {
        ok: false,
        message: "Ластик не воскрешает и не восстанавливает уничтоженную башню",
      };
    if (dist(hero, unit) > CONFIG.interactRadius)
      return { ok: false, message: "Подойдите ближе к союзнику или башне" };
    if (item.digitReadyAt > g.time)
      return {
        ok: false,
        message: `Стирание цифры перезаряжается: ${Math.ceil(item.digitReadyAt - g.time)} с`,
      };
    const team = 1 - hero.team,
      entries = (board.pages || [board]).flatMap((page) =>
        page.completed[team]
          ? []
          : page.boards[team].flatMap((value, index) =>
              value && !page.puzzles[team].givens[index]
                ? [{ page, index }]
                : [],
            ),
      );
    if (!entries.length)
      return {
        ok: false,
        message:
          "Нет вписанных цифр на незавершённых листах; подсказки защищены",
      };
    return { ok: true, effect: "digit", entries, team };
  }
  eraseEntry(page, team, index) {
    page.boards[team][index] = 0;
    page.holes[team] = page.holes[team].filter((i) => i !== index);
    for (const field of [
      "universal",
      "doubleStroke",
      "poison",
      "burning",
      "arrivals",
      "errors",
    ])
      delete page[field]?.[team]?.[index];
  }
  use(hero, target) {
    const access = this.access(hero, target);
    if (!access.ok) return access;
    const g = this.game,
      item = hero.eraserTool;
    if (access.effect === "ward") {
      g.wards.destroy(target, "eraser");
      item.wardReadyAt =
        g.time + WARDS.shopCooldown * ERASER.wardCooldownFactor;
    } else {
      const { page, index } =
          access.entries[Math.floor(g.random() * access.entries.length)],
        team = access.team;
      this.eraseEntry(page, team, index);
      item.digitReadyAt = g.time + ERASER.digitCooldown;
    }
    g.emit("eraserUsed", {
      hero: hero.id,
      effect: access.effect,
      target: target.id,
    });
    return { ok: true, effect: access.effect };
  }
  tick() {
    for (const hero of this.game.heroes) {
      if (!hero.eraserPickup) continue;
      const item = this.get(hero.eraserPickup);
      if (!item || hero.dead) {
        hero.eraserPickup = null;
        hero.target = null;
      } else if (dist(hero, item) <= CONFIG.interactRadius) {
        const result = this.pickup(hero, item);
        if (result.ok || this.actorAccess(hero).ok) {
          hero.eraserPickup = null;
          hero.target = null;
          if (!result.ok)
            this.game.emit("eraserPickupFailed", {
              hero: hero.id,
              message: result.message,
            });
        }
      }
    }
  }
  bot(hero) {
    if (hero.eraserTool) {
      const target = [
        ...this.game.wards.active(1 - hero.team),
        hero,
        ...this.game.heroes.filter((h) => h.team === hero.team && h !== hero),
        ...this.game.towers.filter((t) => t.defender === hero.team),
      ].find((t) => this.access(hero, t).ok);
      if (target) this.use(hero, target);
      return false;
    }
    const item = this.ground()
      .filter(
        (entry) =>
          this.pickupAccess(hero, entry).ok &&
          dist(hero, entry) <= CONFIG.heroVisionRadius,
      )
      .sort((a, b) => dist(hero, a) - dist(hero, b))[0];
    return item ? this.requestPickup(hero, item).ok : false;
  }
}
