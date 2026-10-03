import { CONFIG, RULES, WARDS } from "./config.js";
import { dist, makePuzzle } from "./sudoku.js";
import { dataFields } from "./boards.js";

// Wards own their stock, lifetime and regeneration; they are not buildings or units.
export class WardSystem {
  constructor(game) {
    this.game = game;
    this.readyAt = [0, 0];
    this.initialStock = [WARDS.initialStock, WARDS.initialStock];
    this.list = [];
    this.serial = 0;
  }
  stock(team) {
    const remaining = Math.max(0, this.readyAt[team] - this.game.time);
    return {
      available:
        this.initialStock[team] || (remaining === 0 ? WARDS.stockLimit : 0),
      remaining,
    };
  }
  reserve(team) {
    const stock = this.stock(team);
    if (!stock.available) return false;
    if (this.initialStock[team]) this.initialStock[team]--;
    if (!stock.remaining)
      this.readyAt[team] = this.game.time + WARDS.shopCooldown;
    return true;
  }
  isActive(ward) {
    return (
      !!ward &&
      !ward.destroyed &&
      ward.expiresAt > this.game.time &&
      this.list.includes(ward)
    );
  }
  active(team = null) {
    return this.list.filter(
      (ward) =>
        this.isActive(ward) && (team === null || ward.defender === team),
    );
  }
  get(id) {
    return this.active().find((ward) => ward.id === id);
  }
  placementPoint(
    hero,
    toward = { x: CONFIG.worldSize / 2, y: CONFIG.worldSize / 2 },
  ) {
    const dx = toward.x - hero.x,
      dy = toward.y - hero.y,
      length = Math.hypot(dx, dy),
      scale = length ? Math.min(1, WARDS.placementRadius / length) : 0;
    return {
      x: Math.max(0, Math.min(CONFIG.worldSize, hero.x + dx * scale)),
      y: Math.max(0, Math.min(CONFIG.worldSize, hero.y + dy * scale)),
    };
  }
  placementAccess(hero) {
    const g = this.game;
    if (
      g.phase !== "playing" ||
      hero.dead ||
      hero.stunnedUntil > g.time ||
      hero.forcedSolve?.until > g.time ||
      g.heroEffects.trapped(hero) ||
      !hero.consumables.ward
    )
      return { ok: false, message: "Сейчас нельзя установить вард" };
    if (this.active(hero.team).length >= WARDS.maxActive)
      return {
        ok: false,
        message: `У команды уже ${WARDS.maxActive} активных варда; предмет сохранён`,
      };
    return { ok: true };
  }
  validPoint(point) {
    return (
      !!point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x <= CONFIG.worldSize &&
      point.y <= CONFIG.worldSize
    );
  }
  cancelPlacement(hero, stop = true) {
    if (!hero.wardPlacement) return;
    hero.wardPlacement = null;
    if (stop) hero.target = null;
  }
  requestPlacement(hero, point) {
    const access = this.placementAccess(hero);
    if (!access.ok) return access;
    if (!this.validPoint(point))
      return {
        ok: false,
        message: "Выберите место на карте; предмет сохранён",
      };
    this.cancelPlacement(hero);
    if (dist(hero, point) <= WARDS.placementRadius)
      return this.game.useItem(hero, "ward", point);
    this.game.move(hero, point.x, point.y);
    hero.wardPlacement = { x: point.x, y: point.y };
    return { ok: true, queued: true };
  }
  place(hero, point = this.placementPoint(hero)) {
    const g = this.game,
      access = this.placementAccess(hero);
    if (!access.ok) return access;
    if (
      !this.validPoint(point) ||
      dist(hero, point) > WARDS.placementRadius + 1e-9
    )
      return {
        ok: false,
        message: "Вард нужно поставить рядом с героем; предмет сохранён",
      };
    const serial = ++this.serial,
      puzzle = makePuzzle(
        RULES.ward,
        g.seed + 17003 + serial * 137,
        WARDS.emptyCells,
      ),
      ward = {
        id: `ward-${serial}`,
        kind: "ward",
        name: `Вард ${hero.team ? "Клякс" : "Листьев"}`,
        defender: hero.team,
        owner: hero.id,
        x: point.x,
        y: point.y,
        expiresAt: g.time + WARDS.lifetime,
        destroyed: false,
        history: [],
        regenStarted: false,
        regenProgress: 0,
        regenUpdatedAt: g.time,
        ...dataFields([structuredClone(puzzle), structuredClone(puzzle)]),
      };
    hero.consumables.ward--;
    this.list.push(ward);
    g.vision.refresh(true);
    g.emit("wardPlaced", { hero: hero.id, target: ward.id, team: hero.team });
    return { ok: true, target: ward.id };
  }
  access(hero, ward) {
    if (!this.isActive(ward)) return { ok: false, message: "Вард уже исчез" };
    if (ward.defender === hero.team)
      return { ok: false, message: "Это союзный вард" };
    return { ok: true };
  }
  suppressed(ward) {
    return (
      this.game.heroes.filter(
        (hero) =>
          !hero.dead &&
          hero.team !== ward.defender &&
          dist(hero, ward) <= WARDS.supportRadius,
      ).length >= 2
    );
  }
  interval(ward) {
    return this.suppressed(ward)
      ? WARDS.supportedRegenInterval
      : WARDS.regenInterval;
  }
  status(ward) {
    const interval = this.interval(ward);
    return {
      lifetime: Math.max(0, ward.expiresAt - this.game.time),
      regen: ward.regenStarted
        ? Math.max(0, (1 - ward.regenProgress) * interval)
        : null,
      interval,
      suppressed: this.suppressed(ward),
    };
  }
  recordEntry(ward, index) {
    if (!ward.regenStarted) {
      ward.regenStarted = true;
      ward.regenUpdatedAt = this.game.time;
    }
    ward.history.push(index);
  }
  regenerate(ward) {
    const g = this.game;
    if (!ward.regenStarted) return;
    // Progress is a fraction of an erase cycle. Ally arrival changes its speed, not its start.
    ward.regenProgress +=
      Math.max(0, g.time - ward.regenUpdatedAt) / this.interval(ward);
    ward.regenUpdatedAt = g.time;
    const cycles = Math.floor(ward.regenProgress + 1e-9);
    ward.regenProgress = Math.max(0, ward.regenProgress - cycles);
    const team = 1 - ward.defender;
    for (let n = 0; n < cycles && ward.history.length; n++) {
      const index = ward.history.pop();
      if (ward.puzzles[team].givens[index]) continue;
      ward.boards[team][index] = 0;
      for (const field of ["arrivals", "universal", "doubleStroke", "errors"])
        delete ward[field][team][index];
      g.emit("wardRegen", { target: ward.id, index });
    }
  }
  destroy(ward, reason = "solved") {
    if (ward.destroyed) return false;
    ward.destroyed = true;
    this.list = this.list.filter((entry) => entry !== ward);
    for (const hero of this.game.heroes)
      for (const key of Object.keys(hero.notes))
        if (key.startsWith(ward.id + ":")) delete hero.notes[key];
    this.game.vision.refresh(true);
    this.game.emit("wardRemoved", { target: ward.id, reason });
    return true;
  }
  tick() {
    for (const ward of [...this.list]) {
      if (ward.expiresAt <= this.game.time) this.destroy(ward, "expired");
      else this.regenerate(ward);
    }
    for (const hero of this.game.heroes) {
      const point = hero.wardPlacement;
      if (!point) continue;
      if (
        hero.dead ||
        !hero.consumables.ward ||
        hero.forcedSolve?.until > this.game.time ||
        this.game.heroEffects.trapped(hero)
      ) {
        this.cancelPlacement(hero);
        continue;
      }
      if (hero.stunnedUntil > this.game.time) continue;
      if (dist(hero, point) > WARDS.placementRadius) {
        if (!hero.target) this.cancelPlacement(hero);
        continue;
      }
      this.cancelPlacement(hero);
      const result = this.game.useItem(hero, "ward", point);
      if (!result.ok)
        this.game.emit("wardPlacementFailed", {
          hero: hero.id,
          message: result.message,
        });
    }
  }
  usefulSites(team) {
    const sources = [...this.game.towers, ...this.game.cores].filter(
      (t) => t.defender === team && !t.destroyed,
    );
    return WARDS.botSites
      .map(([x, y]) => ({
        x: x * CONFIG.mapMultiplier,
        y: y * CONFIG.mapMultiplier,
      }))
      .filter(
        (point) =>
          !this.active(team).some(
            (ward) => dist(point, ward) < WARDS.botWardSeparation,
          ) &&
          !sources.some(
            (source) => dist(point, source) < WARDS.botStructureSeparation,
          ),
      );
  }
  botPurchase(hero) {
    const g = this.game,
      held = g.heroes
        .filter((h) => h.team === hero.team)
        .reduce(
          (count, h) =>
            count +
            h.consumables.ward +
            g.pendingOrders(h).filter((o) => o.id === "ward").length,
          0,
        );
    if (
      this.stock(hero.team).available &&
      held + this.active(hero.team).length < WARDS.maxActive &&
      this.usefulSites(hero.team).length
    )
      g.buy(hero, "ward");
  }
  bot(hero) {
    const g = this.game;
    if (hero.stunnedUntil > g.time || hero.forcedSolve?.until > g.time)
      return false;
    if (
      g.heroes.some(
        (enemy) =>
          !enemy.dead &&
          enemy.team !== hero.team &&
          g.vision.visible(hero.team, enemy) &&
          dist(hero, enemy) < WARDS.visionRadius,
      )
    )
      return false;
    const ward = this.active(1 - hero.team).find(
      (t) => g.vision.visible(hero.team, t) && g.near(hero, t),
    );
    if (ward) {
      hero.target = null;
      hero.animationTargetId = ward.id;
      if (g.time < (hero.wardThinkAt || 0)) return true;
      hero.wardThinkAt = g.time + WARDS.botThinkInterval;
      const move = g.botMove(hero, ward);
      if (move && (g.canPen(hero) || hero.digits))
        g.place(
          hero,
          ward,
          move.index,
          move.value,
          g.canPen(hero) ? "pen" : "universal",
        );
      return true;
    }
    if (
      !hero.consumables.ward ||
      this.active(hero.team).length >= WARDS.maxActive
    )
      return false;
    const site = this.usefulSites(hero.team)
      .filter(
        (point) =>
          !g.heroes.some(
            (ally) =>
              ally !== hero &&
              ally.team === hero.team &&
              !ally.dead &&
              ally.consumables.ward &&
              ally.wardSite &&
              dist(point, ally.wardSite) < WARDS.botWardSeparation,
          ),
      )
      .sort((a, b) => dist(hero, a) - dist(hero, b))[0];
    if (!site || dist(hero, site) > WARDS.botDetourRadius) return false;
    hero.wardSite = site;
    if (dist(hero, site) <= WARDS.placementRadius) {
      g.useItem(hero, "ward", site);
      hero.wardSite = null;
      return false;
    }
    g.move(hero, site.x, site.y);
    return true;
  }
}
