import { BASES, CONFIG, RULES, ITEMS, LANES, PROGRESSION } from "./config.js";
import { dist } from "./sudoku.js";
import { makePage, makeSparsePage, bindPage } from "./boards.js";

export const COMBAT = Object.freeze({
  waveSeconds: 40,
  creepSpeed: 120,
  creepAttackSeconds: 5,
  creepMissChance: 0.1,
  towerAttackSeconds: 1,
  attackRadius: 312,
  creepRadius: 200,
  creepSpacing: 90,
  backdoorExtraRadius: 70,
  backdoorDelay: 5,
  regenSeconds: 12,
  baseRegenSeconds: 1,
  pageRecoverySeconds: 30,
  basePageRecoveryFactor: 2,
});
const healthRules = (size) =>
  size === 4 ? RULES.camp : size === 6 ? RULES.lane : RULES.tower;

// Combat owns units, clocks and damage. Game owns purchases and Sudoku input.
export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.creeps = [];
    this.nextWave = COMBAT.waveSeconds;
    this.serial = 0;
    this.resetHeroes();
  }
  resetHeroes() {
    for (const h of this.game.heroes) this.initializeHero(h);
  }
  initializeHero(h) {
    h.dead = false;
    h.healthSize = 4;
    h.deaths = 0;
    h.kills = 0;
    h.praise = 0;
    h.praiseAt = {};
    h.regenAt = 0;
    h.requests = [];
    h.armorStock = 5;
    h.armorRestockAt = null;
    this.newHealth(h, 4);
  }
  newHealth(unit, size) {
    const g = this.game,
      seed =
        g.seed +
        3000 +
        (unit.id * 79 || this.serial) +
        (unit.deaths || 0) * 997,
      sizes = size >= 9 ? [6, 4] : [size],
      pages = sizes.map((pageSize, index) =>
        makePage(healthRules(pageSize), seed + index * 541, 0),
      );
    unit.healthSize = size;
    unit.contributors = {};
    const hp = {
      id: `hp-${unit.kind === "creep" ? "creep" : "hero"}-${unit.id}`,
      kind: "health",
      name: `Здоровье · ${unit.name}`,
      defender: unit.team,
      unit,
      pages: sizes.length > 1 ? pages : undefined,
    };
    if (sizes.length > 1) bindPage(hp, 0);
    else Object.assign(hp, pages[0]);
    unit.hp = hp;
    this.sync(unit);
  }
  healthPages(target) {
    return target?.pages || [target];
  }
  completePage(target, team) {
    target.completed[team] = true;
    if (target.kind === "tower" || target.kind === "health") {
      const page = target.pages[target.activePage];
      page.recovery ||= [null, null];
      page.recovery[team] = {
        remaining: COMBAT.pageRecoverySeconds,
        updatedAt: this.game.time,
        nextEraseAt: 0,
      };
    }
  }
  recoverPages(target) {
    const g = this.game;
    if (target.destroyed || target.unit?.dead) return;
    for (const page of target.pages || []) {
      for (const team of [0, 1]) {
        const recovery = page.recovery?.[team];
        if (!recovery) continue;
        const factor =
          target.unit && g.atBase(target.unit, CONFIG.baseRegenRadius)
            ? COMBAT.basePageRecoveryFactor
            : 1;
        const elapsed = Math.max(0, g.time - recovery.updatedAt);
        recovery.updatedAt = g.time;
        if (target.kind === "health") {
          recovery.remaining = Math.max(
            0,
            recovery.remaining - elapsed * factor,
          );
          if (recovery.remaining === 0) {
            page.completed[team] = false;
            page.recovery[team] = null;
          }
          continue;
        }
        if (recovery.remaining > 0) {
          recovery.remaining = Math.max(
            0,
            recovery.remaining - elapsed * factor,
          );
          if (recovery.remaining > 0) continue;
          recovery.nextEraseAt = g.time;
        }
        if (g.time < recovery.nextEraseAt) continue;
        const eligible = page.boards[team].flatMap((value, index) =>
          value &&
          !page.puzzles[team].givens[index] &&
          !(
            typeof page.universal[team][index] === "number" &&
            page.universal[team][index] > g.time
          )
            ? [index]
            : [],
        );
        if (!eligible.length) {
          if (!page.completed[team]) page.recovery[team] = null;
          continue;
        }
        const index = eligible[Math.floor(g.random() * eligible.length)];
        page.boards[team][index] = 0;
        page.holes[team] = page.holes[team].filter((i) => i !== index);
        page.completed[team] = false;
        if (target.kind === "health") {
          page.recovery[team] = null;
          target.unit.regenAt = g.time + this.updateRegenInterval(target.unit);
        } else recovery.nextEraseAt = g.time + COMBAT.regenSeconds;
      }
    }
  }
  healthCapacity(unit) {
    return this.healthPages(unit.hp).reduce(
      (total, page) =>
        total +
        (page.ownedIndices?.length ?? page.boards[1 - unit.team].length),
      0,
    );
  }
  filledHealth(unit, team = 1 - unit.team) {
    return this.healthPages(unit.hp).reduce(
      (total, page) => total + page.boards[team].filter(Boolean).length,
      0,
    );
  }
  sync(unit) {
    unit.hp.x = unit.x;
    unit.hp.y = unit.y;
  }
  target(id) {
    return [...this.game.actors(), ...this.creeps]
      .map((u) => u.hp)
      .find((t) => t?.id === id);
  }
  units() {
    return [...this.game.actors(), ...this.creeps].filter(
      (u) => !u.dead && !u.duel,
    );
  }
  access(h, t) {
    if (t.completed[h.team])
      return { ok: false, message: "Лист временно закрыт" };
    return t.unit.dead
      ? { ok: false, message: "Цель уже погибла" }
      : h.team === t.defender
        ? { ok: false, message: "Это здоровье союзника" }
        : { ok: true };
  }
  engage(attacker, target) {
    if (target?.kind === "health" && target.unit?.kind !== "creep")
      attacker.fighting = target.id;
  }
  attackSlow(target) {
    const g = this.game,
      active = g.heroes.filter((attacker) => {
        const hp = this.target(attacker.fighting);
        return (
          !attacker.dead &&
          attacker.stunnedUntil <= g.time &&
          hp?.unit === target &&
          g.vision.visible(attacker.team, target) &&
          dist(attacker, target) <= CONFIG.effectRadius
        );
      });
    if (!active.length) return 0;
    return target.healthSize >= 9 ? 0.5 : target.healthSize >= 6 ? 0.3 : 0.2;
  }
  committedHealth(h) {
    return Math.max(
      h.healthSize || 4,
      this.game.duet.state(h)?.pendingHealth || 4,
      ...this.game
        .pendingOrders(h)
        .map((o) => ITEMS.find((i) => i.id === o.id)?.healthSize || 4),
    );
  }
  upgradeHealth(h, size) {
    h = this.game.duet.root(h);
    const state = this.game.duet.state(h);
    if (state?.split) {
      state.pendingHealth = Math.max(state.pendingHealth || 0, size);
      return;
    }
    if (size <= h.healthSize) return;
    const team = 1 - h.team,
      oldPages = this.healthPages(h.hp),
      oldFilled = this.filledHealth(h),
      oldCapacity = this.healthCapacity(h),
      ratio = oldCapacity ? oldFilled / oldCapacity : 0,
      armor = oldPages
        .flatMap((page) => Object.values(page.armor[team]))
        .filter((until) => until > this.game.time),
      universal = oldPages.flatMap((page) =>
        Object.entries(page.universal[team])
          .filter(
            ([index, expiry]) =>
              typeof expiry === "number" &&
              expiry > this.game.time &&
              page.boards[team][Number(index)],
          )
          .map(([, expiry]) => expiry),
      );
    this.newHealth(h, size);
    let toFill = Math.floor(ratio * this.healthCapacity(h));
    for (const page of this.healthPages(h.hp)) {
      const board = page.boards[team],
        puzzle = page.puzzles[team];
      let offset = 0;
      while (
        universal.length &&
        toFill > 0 &&
        offset < puzzle.hintOrder.length
      ) {
        const index = puzzle.hintOrder[offset++];
        board[index] = puzzle.solution[index];
        page.universal[team][index] = universal.shift();
        toFill--;
      }
      while (toFill > 0 && offset < puzzle.hintOrder.length) {
        const index = puzzle.hintOrder[offset++];
        board[index] = puzzle.solution[index];
        toFill--;
      }
      const free = puzzle.hintOrder.filter((index) => !board[index]);
      for (const index of free.slice(0, armor.length))
        page.armor[team][index] = armor.shift();
    }
    this.refreshArmor(h);
  }
  armorLimit(h) {
    return [5, 7, 10][this.game.healthTier(h)];
  }
  armorPrice(h) {
    return [8, 16, 32][this.game.healthTier(h)];
  }
  refreshArmor(h) {
    const g = this.game,
      limit = this.armorLimit(h);
    if (h.armorStock < limit && h.armorRestockAt === null)
      h.armorRestockAt = g.time + 20;
    while (
      h.armorRestockAt !== null &&
      g.time >= h.armorRestockAt &&
      h.armorStock < limit
    ) {
      h.armorStock++;
      h.armorRestockAt = h.armorStock < limit ? h.armorRestockAt + 20 : null;
    }
    for (const page of this.healthPages(h.hp))
      for (const [i, until] of Object.entries(page.armor[1 - h.team]))
        if (until <= g.time) delete page.armor[1 - h.team][i];
  }
  buyArmor(h) {
    const g = this.game;
    this.refreshArmor(h);
    if (!h.dead && g.heroEffects.trapped(h))
      return { ok: false, message: "Броня сейчас недоступна" };
    if (h.dead) {
      const price = this.armorPrice(h);
      if (!h.armorStock || h.gold < price)
        return { ok: false, message: "Недостаточно монет или запаса брони" };
      h.gold -= price;
      h.spent += price;
      h.armorStock--;
      h.pendingArmor = (h.pendingArmor || 0) + 1;
      if (h.armorRestockAt === null) h.armorRestockAt = g.time + 20;
      return { ok: true, instant: false, carrier: "Броня после возрождения" };
    }
    const team = 1 - h.team,
      t = h.hp,
      price = this.armorPrice(h);
    const free = this.healthPages(t).flatMap((page, pageIndex) =>
      page.boards[team].flatMap((v, index) =>
        !v &&
        !page.armor[team][index] &&
        !page.stones[team][index] &&
        !(page.errors[team][index]?.until > g.time)
          ? [{ page, pageIndex, index }]
          : [],
      ),
    );
    if (!free.length || !h.armorStock || h.gold < price)
      return {
        ok: false,
        message: "Нет свободной клетки, запаса брони или монет",
      };
    const { page, pageIndex, index } =
      free[Math.floor(g.random() * free.length)];
    if (t.pages) bindPage(t, pageIndex);
    page.armor[team][index] = g.time + 180;
    h.gold -= price;
    h.spent += price;
    h.armorStock--;
    if (h.armorRestockAt === null) h.armorRestockAt = g.time + 20;
    return { ok: true, instant: true };
  }
  hit(
    attacker,
    t,
    index,
    value = t.puzzles[attacker.team].solution[index],
    universal = false,
    metadata = {},
  ) {
    t = this.game.duet.resolve(t, index);
    if (
      !this.game.duet.allowed(attacker, t.unit) ||
      !this.game.duet.owns(t, index) ||
      this.game.duet.reserved(t, index)
    )
      return false;
    const team = attacker.team;
    const newDamage = !t.boards[team][index];
    if (t.kind === "health" && this.game.heroEffects.protected(t.unit))
      return false;
    if (t.kind === "core" && t.backdoorArmor > 0) {
      t.backdoorArmor--;
      return false;
    }
    if (t.armor[team][index] > this.game.time) {
      delete t.armor[team][index];
      if (["tower", "core"].includes(t.kind)) {
        t.armorRegenAt ||= this.game.time + COMBAT.regenSeconds;
        t.backdoorArmor = (t.pages || [t]).reduce(
          (count, page) =>
            count +
            Object.values(page.armor[team]).filter(
              (until) => until > this.game.time,
            ).length,
          0,
        );
      }
      this.recordEntry(attacker, t, index);
      return false;
    }
    delete t.armor[team][index];
    if (
      t.kind === "health" &&
      this.game.duet.defer(attacker, t, index, value, universal, metadata)
    )
      return false;
    if (t.kind === "health" && attacker.role && attacker.team !== t.unit.team)
      t.unit.itemHealing = (t.unit.itemHealing || []).filter(
        (effect) => !effect.cancelOnHeroDamage,
      );
    t.boards[team][index] = value;
    if (universal)
      t.universal[team][index] =
        t.kind === "health" && this.game.actors().includes(t.unit)
          ? this.game.time + PROGRESSION.universalHealthLifetime
          : true;
    else delete t.universal[team][index];
    delete t.doubleStroke[team][index];
    delete t.poison[team][index];
    delete t.burning?.[team]?.[index];
    if (newDamage && t.kind === "health")
      this.game.sudzh.recordDamage(attacker, t);
    this.game.fire.convertHit(attacker, t, index);
    if (metadata.poison && !t.burning?.[team]?.[index]) {
      t.poison[team][index] = metadata.poison.token;
      metadata.poison.entries.push(index);
      metadata.poison.until = Math.max(
        metadata.poison.until,
        this.game.time + metadata.poison.duration,
      );
    }
    this.recordEntry(attacker, t, index);
    if (metadata.burning)
      this.game.heroEffects.markBurning(
        attacker,
        t,
        [index],
        metadata.burning,
        team,
      );
    if (
      metadata.poison &&
      !this.game.heroEffects.poison.includes(metadata.poison)
    )
      this.game.heroEffects.poison.push(metadata.poison);
    if (t.kind === "health") {
      this.game.runes.active(t);
      if (this.game.duet.state(t.unit)?.split && this.hpLeft(t.unit) === 0)
        this.kill(t.unit, attacker);
    }
    return true;
  }
  hpLeft(u) {
    return this.healthPages(u.hp).reduce(
      (total, page) =>
        total +
        page.boards[1 - u.team].filter(
          (v, i) => !v && this.game.duet.owns(u.hp, i, page),
        ).length,
      0,
    );
  }
  expireUniversalHealth(u) {
    if (u.kind === "creep") return;
    for (const page of this.healthPages(u.hp)) {
      const team = 1 - u.team;
      for (const [rawIndex, expiresAt] of Object.entries(
        page.universal[team],
      )) {
        const index = Number(rawIndex);
        if (typeof expiresAt !== "number" || expiresAt > this.game.time)
          continue;
        if (!page.completed[team]) {
          page.boards[team][index] = 0;
          page.holes[team] = page.holes[team].filter((i) => i !== index);
        }
        delete page.universal[team][index];
      }
    }
  }
  recordEntry(attacker, t, index) {
    if (attacker.id !== this.game.player.id || !attacker.role)
      t.arrivals[attacker.team][index] = this.game.time;
    if (t.kind === "health" && t.unit.kind !== "creep" && attacker.role)
      t.unit.contributors[attacker.id] = this.game.time;
  }
  kill(u, attacker) {
    if (u.dead) return;
    if (this.game.duet.partialKill(u, attacker)) return;
    attacker = this.game.duet.root(attacker);
    const g = this.game;
    u.dead = true;
    g.sudzh.endFresh(u);
    u.pendingFresh = null;
    u.stench = null;
    for (const caster of g.heroes)
      if (caster.freshSudoku?.targetId === u.id) g.sudzh.endFresh(caster);
    u.pencilBrokenUntil = 0;
    u.hp.armor = [{}, {}];
    u.target = null;
    u.prison = null;
    u.boxProtection = null;
    u.followTarget = null;
    u.lasso = null;
    u.task = null;
    u.flowerRun = false;
    u.comboUntil = 0;
    u.deaths = (u.deaths || 0) + 1;
    if (u.kind !== "creep") {
      g.erasers.drop(u);
      u.deathAt = g.time;
      const bounty =
        250 +
        Math.min(300, Math.floor(g.time / 60) * 20) +
        (u.healthSize >= 9 ? 200 : u.healthSize >= 6 ? 100 : 0);
      const assists = Object.entries(u.contributors || {})
        .filter(([id, at]) => {
          const hero = g.heroes[Number(id)];
          return (
            hero &&
            hero.team !== u.team &&
            hero !== attacker &&
            g.time - at <= 30
          );
        })
        .map(([id]) => g.heroes[Number(id)])
        .sort((a, b) => a.id - b.id);
      if (assists.length) {
        for (const hero of assists)
          g.progression.progress(
            hero,
            PROGRESSION.assistSeconds / assists.length,
            "assist",
          );
        const pool = Math.floor(bounty * 0.3);
        assists.forEach((hero, i) =>
          g.grant(
            hero,
            Math.floor(pool / assists.length) +
              (i < pool % assists.length ? 1 : 0),
            "assist",
          ),
        );
      }
      u.respawnAt = g.time + Math.min(40, 10 + Math.floor(g.time / 60) * 2);
      if (attacker?.role && attacker.team !== u.team) {
        attacker.kills++;
        g.grant(attacker, bounty, "kill");
        g.progression.add(attacker, PROGRESSION.killDigits, "kill");
      }
    }
    if (u.kind === "creep") {
      u.deathAt = g.time;
      u.removeAt = g.time + 0.72;
      if (attacker?.role) g.grant(attacker, 43, "creep");
      if (attacker && attacker.team !== u.team) {
        const nearby = g.heroes.filter(
          (h) =>
            !h.dead &&
            h.team === attacker.team &&
            dist(h, u) <= PROGRESSION.creepRadius,
        );
        for (const h of nearby)
          g.progression.progress(
            h,
            PROGRESSION.creepSeconds / nearby.length,
            "creep",
          );
      }
    }
    g.emit("death", {
      hero: u.kind === "creep" ? null : u.id,
      unit: u.hp.id,
      killer: attacker?.id,
    });
  }
  respawn(h) {
    const g = this.game;
    h.dead = false;
    h.deathAt = null;
    Object.assign(h, h.spawnPoint);
    this.newHealth(h, h.healthSize);
    for (const page of this.healthPages(h.hp)) {
      for (
        let index = 0;
        index < page.boards[1 - h.team].length && h.pendingArmor > 0;
        index++
      ) {
        page.armor[1 - h.team][index] = g.time + 180;
        h.pendingArmor--;
      }
    }
    h.nextNormal = g.time;
    h.lockedUntil = 0;
    h.comboUntil = 0;
    h.regenAt = g.time + 12;
    h.regenBase = true;
    h.task = null;
    h.retreatTowerRoute = null;
    h.regenBoosts = [];
    h.itemHealing = [];
    h.regenInterval = COMBAT.baseRegenSeconds;
    g.emit("respawn", { hero: h.id });
  }
  prepareTarget(t, team) {
    if (t?.pages && t.completed[team]) {
      const i = t.pages.findIndex((p) => !p.completed[team]);
      if (i >= 0) this.game.selectPage(t, i);
    }
    return t;
  }
  spawnWave() {
    const g = this.game;
    for (const team of [0, 1])
      for (let lane = 0; lane < 3; lane++)
        for (let slot = 0; slot < 3; slot++) {
          const path = LANES[lane].map(([x, y]) => ({
            x: x * CONFIG.mapMultiplier,
            y: y * CONFIG.mapMultiplier,
          }));
          if (team) path.reverse();
          const u = {
            id: ++this.serial,
            kind: "creep",
            name: "Бумажный крип",
            team,
            lane,
            ...BASES[team],
            dead: false,
            attackAt: g.time + 2,
            structureDamage: 0,
            route: path,
            waypoint: 1,
            slot,
            spawnAt: g.time + slot * 0.7,
          };
          const gateDistance = dist(path[0], path[1]);
          const along = 76 + slot * COMBAT.creepSpacing;
          u.x += ((path[1].x - path[0].x) / gateDistance) * along;
          u.y += ((path[1].y - path[0].y) / gateDistance) * along;
          const p = makeSparsePage(RULES.camp, g.seed + this.serial, 0);
          u.hp = {
            id: `hp-creep-${u.id}`,
            kind: "health",
            name: "Микросудоку крипа",
            defender: team,
            unit: u,
            ...p,
          };
          u.healthSize = 4;
          const initialFilled = 8 + Math.floor(g.random() * 4);
          const fillOrder = p.puzzles[0].hintOrder
            .slice()
            .sort(() => g.random() - 0.5);
          for (const index of fillOrder.slice(0, initialFilled))
            for (const team of [0, 1])
              p.boards[team][index] = p.puzzles[team].solution[index];
          u.spawnHp = this.hpLeft(u);
          u.animationState = "run";
          this.sync(u);
          this.creeps.push(u);
        }
    g.emit("wave");
  }
  damage(attacker, t, count) {
    const g = this.game,
      team = attacker.team;
    if (
      g.phase !== "playing" ||
      !t ||
      t.destroyed ||
      t.unit?.dead ||
      !g.duet.allowed(attacker, t.unit)
    )
      return;
    this.prepareTarget(t, team);
    if (t.kind === "health" && t.completed[team]) return;
    const board = t.boards[team],
      p = t.puzzles[team];
    for (let k = 0; k < count; k++) {
      const free = board
        .map((v, i) =>
          !v &&
          g.duet.owns(t, i) &&
          !g.duet.reserved(t, i) &&
          !t.stones[team][i] &&
          !(t.errors[team][i]?.until > g.time)
            ? i
            : -1,
        )
        .filter((i) => i >= 0);
      if (!free.length) break;
      const index = free[Math.floor(g.random() * free.length)];
      this.hit(attacker, t, index, p.solution[index]);
    }
    if (g.solved({ team }, t))
      g.complete({ ...attacker, x: t.x, y: t.y }, t, true);
  }
  creepTick(u, dt) {
    const g = this.game;
    if (
      u.dead ||
      g.time < u.spawnAt ||
      u.stunnedUntil > g.time ||
      g.sudzh.held(u)
    )
      return;
    const foes = this.creeps.filter(
      (e) =>
        !e.dead &&
        e.spawnAt <= g.time &&
        e.team !== u.team &&
        dist(u, e) <= COMBAT.creepRadius &&
        g.vision.visible(u.team, e),
    );
    let target = foes.sort((a, b) => {
      const untouchedA = this.hpLeft(a) === this.healthCapacity(a) ? 0 : 1;
      const untouchedB = this.hpLeft(b) === this.healthCapacity(b) ? 0 : 1;
      return untouchedA - untouchedB || dist(u, a) - dist(u, b);
    })[0]?.hp;
    const structure = g.attackTarget(u.lane, u.team);
    if (
      !target &&
      structure &&
      !structure.destroyed &&
      dist(u, structure) <= COMBAT.creepRadius &&
      g.objectiveAccess(u, structure).ok
    )
      target = structure;
    if (!target)
      target = g.heroes
        .filter(
          (h) =>
            !h.dead &&
            h.team !== u.team &&
            dist(u, h) <= COMBAT.creepRadius &&
            g.vision.visible(u.team, h),
        )
        .sort((a, b) => dist(u, a) - dist(u, b))[0]?.hp;
    if (!target) target = foes[0]?.hp;
    if (target) {
      u.animationState = "fight";
      if (g.time >= u.attackAt) {
        u.attackAt =
          g.time +
          COMBAT.creepAttackSeconds * (target.unit?.kind === "creep" ? 1.5 : 1);
        if (g.random() >= COMBAT.creepMissChance) this.damage(u, target, 1);
      }
      return;
    }
    u.animationState = "run";
    const to = u.route[u.waypoint];
    if (!to) return;
    const d = dist(u, to),
      step = COMBAT.creepSpeed * (1 - g.heroEffects.acidSlow(u)) * dt;
    if (d <= Math.max(step, 32)) {
      Object.assign(u, to);
      u.waypoint++;
    } else {
      u.x += ((to.x - u.x) / d) * step;
      u.y += ((to.y - u.y) / d) * step;
    }
    this.sync(u);
  }
  separateCreeps() {
    const active = this.creeps.filter(
      (u) => !u.dead && u.spawnAt <= this.game.time,
    );
    // Physical separation; waypoint tolerance prevents traffic jams at corners.
    for (let pass = 0; pass < 4; pass++)
      for (let i = 0; i < active.length; i++)
        for (let j = i + 1; j < active.length; j++) {
          const a = active[i],
            b = active[j],
            d = dist(a, b);
          if (d >= COMBAT.creepSpacing) continue;
          const dx = d ? (b.x - a.x) / d : 1;
          const dy = d ? (b.y - a.y) / d : 0;
          const push = (COMBAT.creepSpacing - d) / 2;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
    for (const u of active) this.sync(u);
  }
  structureArmor(t, team, protectedBefore) {
    const g = this.game;
    const pages = t.pages || [t];
    t.armoredCells ||= [];
    if (!t.backdoor) {
      for (const { page, index } of t.armoredCells)
        delete page.armor[team][index];
      t.armoredCells = [];
      t.armorInitialized = false;
      t.backdoorArmor = 0;
      return;
    }
    t.armoredCells = t.armoredCells.filter(
      ({ page, index }) => page.armor[team][index] > g.time,
    );
    const limit = t.kind === "core" ? 10 : [5, 7, 10][t.step] || 5;
    const first = !t.armorInitialized || !protectedBefore;
    const add = first ? limit : g.time >= (t.armorRegenAt || Infinity) ? 1 : 0;
    let remaining = Math.min(add, limit - t.armoredCells.length);
    for (const page of pages) {
      if (page.completed[team]) continue;
      for (
        let index = 0;
        index < page.boards[team].length && remaining > 0;
        index++
      ) {
        if (
          page.boards[team][index] ||
          page.puzzles[team].givens[index] ||
          page.stones?.[team]?.[index] ||
          page.armor[team][index] > g.time
        )
          continue;
        page.armor[team][index] = Infinity;
        t.armoredCells.push({ page, index });
        remaining--;
      }
    }
    t.armorInitialized = true;
    if (first || add) t.armorRegenAt = g.time + COMBAT.regenSeconds;
    t.backdoorArmor = t.armoredCells.length;
  }
  structureTick(t) {
    const g = this.game;
    if (t.destroyed) return;
    this.recoverPages(t);
    const animatedTower = t.kind === "tower";
    if (animatedTower) t.animationState = "idle";
    const delay = t.kind === "core" || t.step > 0 ? 2 : COMBAT.backdoorDelay,
      enemy = 1 - t.defender,
      near = this.creeps.filter(
        (c) =>
          !c.dead &&
          c.spawnAt <= g.time &&
          c.team === enemy &&
          dist(c, t) <= COMBAT.attackRadius + COMBAT.backdoorExtraRadius,
      );
    const protectedBefore = t.backdoor;
    if (g.sandbox || near.length) {
      if (near.length) t.lastCreepAt = g.time;
      t.backdoor = false;
    } else if (g.time >= (t.lastCreepAt || 0) + delay) {
      t.backdoor = true;
    }
    if (t.kind === "tower") this.structureArmor(t, enemy, protectedBefore);
    else t.backdoorArmor = t.backdoor ? 10 : 0;

    const attackCreeps = near.filter((c) => dist(c, t) <= COMBAT.attackRadius);
    const targets = attackCreeps.length
      ? attackCreeps
      : g.heroes.filter(
          (h) =>
            !h.dead && h.team === enemy && dist(h, t) <= COMBAT.attackRadius,
        );
    const victim = targets.sort(
      (a, b) =>
        (a.kind === "creep" && b.kind === "creep"
          ? (a.structureDamage || 0) - (b.structureDamage || 0)
          : 0) || dist(t, a) - dist(t, b),
    )[0];
    if (animatedTower && t.pendingStun) {
      const pending = t.pendingStun,
        pendingTarget =
          pending.targetKind === "creep"
            ? this.creeps.find((unit) => unit.id === pending.targetId)
            : g.heroes.find((unit) => unit.id === pending.targetId);
      if (
        pendingTarget &&
        targets.includes(pendingTarget) &&
        g.time >= pending.at
      ) {
        pendingTarget.stunnedUntil = Math.max(
          pendingTarget.stunnedUntil || 0,
          g.time + 2,
        );
        t.pendingStun = null;
      } else if (!pendingTarget || !targets.includes(pendingTarget)) {
        t.pendingStun = null;
      }
    }
    if (!victim) return;
    if (animatedTower) t.animationState = "attack";
    if (animatedTower && !t.pendingStun && g.time >= (t.stunAt || 0)) {
      const stunTarget = [...targets].sort(
        (a, b) => dist(t, a) - dist(t, b),
      )[0];
      t.stunAnimationAt = g.time;
      t.stunAnimationUntil = g.time + 0.72;
      t.pendingStun = {
        targetId: stunTarget.id,
        targetKind: stunTarget.kind === "creep" ? "creep" : "hero",
        at: g.time + 0.3,
      };
      t.stunAt = g.time + 5;
    } else if (!animatedTower && g.time >= (t.stunAt || 0)) {
      const stunTarget = [...targets].sort(
        (a, b) => dist(t, a) - dist(t, b),
      )[0];
      stunTarget.stunnedUntil = Math.max(
        stunTarget.stunnedUntil || 0,
        g.time + 2,
      );
      t.stunAt = g.time + 5;
    }
    if (victim.kind === "creep") {
      if (g.time < (t.creepAttackAt || 0)) return;
      t.creepAttackAt = g.time + 2;
      victim.structureDamage = (victim.structureDamage || 0) + 1;
      this.damage({ team: t.defender, id: t.id }, victim.hp, 1);
      return;
    }
    if (g.time < (t.attackAt || 0)) return;
    t.attackAt = g.time + COMBAT.towerAttackSeconds;
    // Twice the former 3/4 digits per six seconds, distributed every second.
    t.damageRemainder =
      (t.damageRemainder || 0) +
      (t.kind === "tower" && t.step === 0 ? 1 : 4 / 3);
    const digits = Math.floor(t.damageRemainder + 1e-9);
    t.damageRemainder -= digits;
    this.damage({ team: t.defender, id: t.id }, victim.hp, digits);
  }
  forcedSolve(h) {
    const g = this.game,
      force = h.forcedSolve,
      target = g.heroes.find((unit) => unit.id === force?.targetId);
    if (!force || force.until <= g.time || !target || target.dead) return false;
    const t = target.hp;
    h.target = null;
    h.followTarget = null;
    h.fighting = t.id;
    if (!g.near(h, t) || !g.objectiveAccess(h, t).ok) return true;
    if (g.time < h.thinkAt) return true;
    h.thinkAt = g.time + 0.8;
    const move = g.botMove(h, t);
    if (!move) return true;
    const result = g.place(h, t, move.index, move.value, "pen");
    if (!result.ok && result.error) g.botError(h, t, move);
    return true;
  }
  retreatDestination(h) {
    const g = this.game,
      base = g.baseOf(h.team),
      route = h.retreatTowerRoute;
    if (route) {
      const tower = g.towers.find((item) => item.id === route.towerId);
      if (tower && !tower.destroyed && dist(h, route.point) > 28)
        return { ...route.point, viaTower: true };
      h.retreatTowerRoute = null;
    }

    const pursuedByHero = g.heroes.some((enemy) => {
      if (
        enemy.dead ||
        enemy.team === h.team ||
        dist(h, enemy) > CONFIG.effectRadius + 80
      )
        return false;
      const fighting = this.target(enemy.fighting)?.unit === h,
        chasing = enemy.target?.pursueEnemy && dist(enemy.target, h) < 120;
      return fighting || chasing || dist(h, enemy) < 140;
    });
    const pursuedByCreep = this.creeps.some(
      (creep) =>
        !creep.dead &&
        creep.team !== h.team &&
        g.vision.visible(h.team, creep) &&
        dist(h, creep) < COMBAT.creepRadius,
    );
    const pursued = pursuedByHero || pursuedByCreep;
    if (!pursued) return { x: base.x, y: base.y, viaTower: false };

    const dx = base.x - h.x,
      dy = base.y - h.y,
      lengthSquared = dx * dx + dy * dy,
      length = Math.sqrt(lengthSquared);
    if (length < 1) return { x: base.x, y: base.y, viaTower: false };
    const candidates = g.towers
      .filter((tower) => !tower.destroyed && tower.defender === h.team)
      .map((tower) => {
        const tx = tower.x - h.x,
          ty = tower.y - h.y,
          along = (tx * dx + ty * dy) / lengthSquared;
        if (along < 0.12 || along > 0.9) return null;
        const closestX = h.x + dx * along,
          closestY = h.y + dy * along,
          offset = Math.hypot(tower.x - closestX, tower.y - closestY),
          towardBaseX = base.x - tower.x,
          towardBaseY = base.y - tower.y,
          towardBaseLength = Math.hypot(towardBaseX, towardBaseY) || 1,
          routePoint = {
            x:
              tower.x +
              (towardBaseX / towardBaseLength) * COMBAT.attackRadius * 0.45,
            y:
              tower.y +
              (towardBaseY / towardBaseLength) * COMBAT.attackRadius * 0.45,
          },
          detour = dist(h, routePoint) + dist(routePoint, base) - dist(h, base);
        if (
          offset > COMBAT.attackRadius * 1.25 ||
          detour > COMBAT.attackRadius * 0.8 ||
          dist(h, tower) < COMBAT.attackRadius * 0.7
        )
          return null;
        return {
          tower,
          point: routePoint,
          score: detour + offset * 0.2,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score);
    const candidate = candidates[0];
    if (!candidate) return { x: base.x, y: base.y, viaTower: false };
    h.retreatTowerRoute = {
      towerId: candidate.tower.id,
      point: candidate.point,
    };
    return { ...candidate.point, viaTower: true };
  }
  botCombat(h) {
    const g = this.game;
    if (h.stunnedUntil > g.time) return true;
    if (h.healthSize < 6 && g.time > 240 && h.gold >= g.itemPrice(h, "health6"))
      g.buy(h, "health6");
    if (
      h.healthSize === 6 &&
      g.time > 650 &&
      h.gold >= g.itemPrice(h, "health9")
    )
      g.buy(h, "health9");
    if (h.role === "intellect" && this.hpLeft(h) < this.healthCapacity(h) * 0.8)
      g.heroSkill(h);
    if (this.hpLeft(h) < this.healthCapacity(h) * 0.3) {
      h.retreat = true;
    }
    if (h.retreat) {
      if (this.hpLeft(h) >= this.healthCapacity(h) * 0.8) {
        h.retreat = false;
        h.retreatTowerRoute = null;
      } else {
        const destination = this.retreatDestination(h);
        g.move(h, destination.x, destination.y);
        return true;
      }
    }
    const creepTarget = this.units()
      .filter(
        (u) =>
          u.kind === "creep" &&
          u.team !== h.team &&
          g.vision.visible(h.team, u) &&
          dist(h, u) <= CONFIG.effectRadius,
      )
      .sort((a, b) => {
        const untouchedA = this.hpLeft(a) === this.healthCapacity(a) ? 0 : 1;
        const untouchedB = this.hpLeft(b) === this.healthCapacity(b) ? 0 : 1;
        return untouchedA - untouchedB || dist(h, a) - dist(h, b);
      })[0];
    if (creepTarget) {
      h.fighting = creepTarget.hp.id;
      if (!g.near(h, creepTarget.hp)) {
        const angle = ((h.id % 5) * Math.PI * 2) / 5;
        const radius =
          CONFIG.interactRadius * CONFIG.combatRangeMultiplier * 0.82;
        g.move(
          h,
          creepTarget.x + Math.cos(angle) * radius,
          creepTarget.y + Math.sin(angle) * radius,
          { pursueEnemy: true },
        );
        return true;
      }
      h.target = null;
      if (g.time < h.thinkAt) return true;
      h.thinkAt = g.time + 0.8;
      const move = g.botMove(h, creepTarget.hp);
      if (move) {
        g.botError(h, creepTarget.hp, move);
        g.place(
          h,
          creepTarget.hp,
          move.index,
          move.value,
          !g.canPen(h) && g.progression.available(h) > 0 ? "universal" : "pen",
        );
      }
      return true;
    }
    const threat = g.heroes
      .filter(
        (u) =>
          !u.dead &&
          u.team !== h.team &&
          g.vision.visible(h.team, u) &&
          !g.atBase(u) &&
          (dist(h, u) < 140 ||
            (dist(h, u) < 350 &&
              g.towers.some(
                (t) =>
                  !t.destroyed && t.defender === h.team && dist(t, u) < 100,
              ))),
      )
      .sort((a, b) => dist(h, a) - dist(h, b))[0];
    if (threat) {
      if (h.role === "editor") {
        g.editorTempo(h, "slow", threat);
        g.inkBinding.cast(h, h);
        if (g.abduction.cast(h, threat).ok) return true;
      }
      if (h.role === "combinator") {
        g.heroSkill(h, threat);
        g.heroEffects.acid(h, threat);
      }
      if (h.role === "sudaks") {
        g.heroSkill(h, threat);
        g.burningSkill(h, threat);
        g.fire.tornado(h);
      }
      if (h.role === "intellect") g.lassoSkill(h, threat);
      h.fighting = threat.hp.id;
      if (h.role === "agile") {
        g.heroSkill(h, threat);
        g.dust.cast(h);
      }
      if (h.role === "strong" && dist(h, threat) <= CONFIG.effectRadius) {
        g.areaStun(h);
        if (h.role === "strong") g.breakPencil(h, threat);
        g.errorFocusSkill(h);
      }
      if (!g.near(h, threat.hp)) {
        g.move(h, threat.x, threat.y, { pursueEnemy: true });
        return true;
      }
      h.target = null;
      if (g.time < h.thinkAt) return true;
      h.thinkAt = g.time + 0.8;
      const move = g.botMove(h, threat.hp);
      if (move) {
        g.botError(h, threat.hp, move);
        g.place(
          h,
          threat.hp,
          move.index,
          move.value,
          !g.canPen(h) && g.progression.available(h) > 0 ? "universal" : "pen",
        );
      }
      return true;
    }
    const siege = g.attackTarget(h.preferred, h.team);
    if (siege && siege.kind !== "core" && !h.retreat) {
      const creep = this.creeps
        .filter(
          (u) =>
            !u.dead &&
            u.team !== h.team &&
            g.vision.visible(h.team, u) &&
            u.lane === h.preferred &&
            dist(h, u) < 200 &&
            dist(u, siege) < dist(h, siege) + 30,
        )
        .sort((a, b) => dist(h, a) - dist(h, b))[0];
      if (creep && !g.near(h, creep.hp)) {
        g.move(h, creep.x, creep.y, { pursueEnemy: true });
        return true;
      }
    }
    const enemies = this.units()
      .filter(
        (u) =>
          u.team !== h.team &&
          g.vision.visible(h.team, u) &&
          g.near(h, u.hp) &&
          (u.kind === "creep" || !g.atBase(u)),
      )
      .sort(
        (a, b) =>
          (a.kind === "creep" ? 0 : 1) - (b.kind === "creep" ? 0 : 1) ||
          this.hpLeft(a) - this.hpLeft(b),
      );
    const enemy = enemies[0];
    if (!enemy) {
      h.fighting = null;
      return false;
    }
    h.fighting = enemy.hp.id;
    if (g.time < h.thinkAt) return true;
    h.thinkAt = g.time + 0.6;
    const t = enemy.hp,
      m = g.botMove(h, t);
    if (m)
      g.place(
        h,
        t,
        m.index,
        m.value,
        !g.canPen(h) && g.progression.available(h) > 0 ? "universal" : "pen",
      );
    return true;
  }
  praise(from, to) {
    const g = this.game;
    if (!to || from === to || g.time < (from.praiseAt[to.id] || 0))
      return false;
    from.praiseAt[to.id] = g.time + 60;
    g.chat.system(`${from.name} хвалит ${to.name} — хорошо сыграно!`);
    to.praise++;
    g.emit("praise", { from: from.id, hero: to.id });
    return true;
  }
  request(h, type) {
    if (!["delivery", "shovel", "lane"].includes(type)) return;
    const old = h.requests.find((r) => r.type === type);
    if (old) old.until = this.game.time + 60;
    else h.requests.push({ type, until: this.game.time + 60 });
    if (type === "lane") this.game.signal(h.lastLane);
  }
  updateRegenInterval(h) {
    const g = this.game;
    h.regenBoosts = h.regenBoosts.filter((b) => b.until > g.time);
    const factor = Math.max(1, ...h.regenBoosts.map((b) => b.factor));
    const atBase = g.atBase(h, CONFIG.baseRegenRadius);
    const base = atBase ? COMBAT.baseRegenSeconds : COMBAT.regenSeconds;
    const interval = base / factor;
    if (h.regenBase !== atBase)
      h.regenAt = Math.min(h.regenAt || Infinity, g.time + interval);
    else if (h.regenInterval && h.regenInterval !== interval)
      h.regenAt =
        g.time + (Math.max(0, h.regenAt - g.time) * interval) / h.regenInterval;
    else if (!h.regenInterval && factor > 1)
      h.regenAt = g.time + Math.max(0, h.regenAt - g.time) / factor;
    h.regenInterval = interval;
    return interval;
  }
  tick(dt) {
    const g = this.game;
    if (!g.sandbox && g.time >= this.nextWave) {
      this.spawnWave();
      this.nextWave += COMBAT.waveSeconds;
    }
    for (const h of g.actors()) {
      if (
        h.duel ||
        (h.dead && h.duetRoot) ||
        (h.dead && this.game.duet.state(h)?.split)
      )
        continue;
      this.expireUniversalHealth(h);
      this.refreshArmor(h);
      h.requests = h.requests.filter((r) => r.until > g.time);
      if (h.dead) {
        if (g.time >= h.respawnAt) this.respawn(h);
        continue;
      }
      const fightTarget = this.target(h.fighting);
      if (
        !fightTarget ||
        fightTarget.unit.dead ||
        h.stunnedUntil > g.time ||
        dist(h, fightTarget.unit) > CONFIG.effectRadius
      )
        h.fighting = null;
      this.sync(h);
      if (!h.hp.duetFragment) this.recoverPages(h.hp);
      for (const effect of h.itemHealing || []) {
        while (effect.nextAt <= g.time && effect.nextAt <= effect.until) {
          const cells = this.healthPages(h.hp).flatMap((page) =>
            page.boards[1 - h.team].flatMap((value, index) =>
              value &&
              this.game.duet.owns(h.hp, index, page) &&
              !page.completed[1 - h.team]
                ? [{ page, index }]
                : [],
            ),
          );
          if (cells.length) {
            const { page, index } =
              cells[Math.floor(g.random() * cells.length)];
            page.boards[1 - h.team][index] = 0;
            for (const field of [
              "universal",
              "poison",
              "burning",
              "doubleStroke",
            ])
              delete page[field]?.[1 - h.team]?.[index];
            page.holes[1 - h.team] = page.holes[1 - h.team].filter(
              (i) => i !== index,
            );
          }
          effect.nextAt += effect.interval;
        }
      }
      h.itemHealing = (h.itemHealing || []).filter(
        (effect) => effect.until > g.time,
      );
      const interval = this.updateRegenInterval(h);
      h.regenBase = g.atBase(h, CONFIG.baseRegenRadius);
      if (g.time >= h.regenAt) {
        h.regenAt = g.time + interval;
        const eligible = this.healthPages(h.hp).flatMap((page, pageIndex) =>
          page.boards[1 - h.team].flatMap((value, index) =>
            value &&
            this.game.duet.owns(h.hp, index, page) &&
            (!page.completed[1 - h.team] ||
              page.recovery?.[1 - h.team]?.remaining > 0) &&
            !(
              typeof page.universal[1 - h.team][index] === "number" &&
              page.universal[1 - h.team][index] > g.time
            )
              ? [{ page, pageIndex, index }]
              : [],
          ),
        );
        if (eligible.length) {
          const { page, index } =
            eligible[Math.floor(g.random() * eligible.length)];
          page.boards[1 - h.team][index] = 0;
          page.holes[1 - h.team] = page.holes[1 - h.team].filter(
            (i) => i !== index,
          );
        }
      }
    }
    for (const u of this.creeps) this.creepTick(u, dt);
    this.separateCreeps();
    for (const t of [...g.towers, ...g.cores]) {
      if (g.phase !== "playing") break;
      this.structureTick(t);
    }
    for (const u of this.units())
      for (const errors of u.hp.errors)
        for (const [i, e] of Object.entries(errors))
          if (e.until <= g.time) delete errors[i];
    this.creeps = this.creeps.filter(
      (u) => !u.dead || this.game.time < (u.removeAt || 0),
    );
  }
}
