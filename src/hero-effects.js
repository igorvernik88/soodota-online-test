import { dataFields, bindPage, sparsePuzzle } from "./boards.js";
import { dist } from "./sudoku.js";
import { RULES, CONFIG } from "./config.js";

// Delayed effects own references to a specific board/life, never the visible page.
export class HeroEffects {
  constructor(game) {
    this.game = game;
    this.poison = [];
    this.burningEffects = [];
    this.acidZones = [];
    this.serial = 0;
  }
  trapped(h) {
    return (
      !h.dead &&
      (h.prison?.until > this.game.time ||
        this.game.abduction.carried(h) ||
        this.game.sudzh?.held(h))
    );
  }
  protected(h) {
    return !h.dead && h.boxProtection?.until > this.game.time;
  }
  acid(h, point) {
    const g = this.game,
      params = g.skill(h, "acid");
    if (h.duel) return { ok: false, message: "Навык недоступен в дуэли" };
    if (
      !params ||
      h.role !== "combinator" ||
      h.dead ||
      this.trapped(h) ||
      h.stunnedUntil > g.time ||
      g.phase !== "playing"
    )
      return { ok: false, message: "Кислота недоступна" };
    if (h.acidAt > g.time)
      return { ok: false, message: "Кислота перезаряжается" };
    if (
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x > CONFIG.worldSize ||
      point.y > CONFIG.worldSize ||
      dist(h, point) > params.range
    )
      return { ok: false, message: "Точка вне радиуса применения" };
    this.acidZones.push({
      ...point,
      ...params,
      owner: h,
      team: h.team,
      until: g.time + params.duration,
      nextHits: new Map(),
    });
    h.acidAt = g.time + params.cooldown;
    return { ok: true };
  }
  acidSlow(h) {
    return this.acidZones.reduce(
      (slow, zone) =>
        zone.until > this.game.time &&
        zone.team !== h.team &&
        dist(h, zone) <= zone.radius
          ? Math.max(slow, zone.slow)
          : slow,
      0,
    );
  }
  box(h, preferred) {
    const g = this.game;
    if (
      h.dead ||
      this.trapped(h) ||
      h.stunnedUntil > g.time ||
      g.phase !== "playing" ||
      h.role !== "combinator" ||
      h.heroSkillAt > g.time
    )
      return { ok: false, message: "Коробка недоступна или перезаряжается" };
    const victim =
      preferred &&
      g.actors().includes(preferred) &&
      !preferred.duel &&
      !preferred.dead &&
      g.vision.visible(h.team, preferred)
        ? preferred
        : !preferred
          ? g.nearestHero(h, 1 - h.team)
          : null;
    if (!victim || this.trapped(victim) || this.protected(victim))
      return {
        ok: false,
        message: "Нужен свободный вражеский герой в радиусе",
      };
    const params = g.skill(h, "box");
    if (!params) return { ok: false, message: "Откройте навык Коробка" };
    if (dist(h, victim) > CONFIG.effectRadius) {
      g.move(h, victim.x, victim.y, { pursueEnemy: true });
      h.pendingBox = { targetId: victim.id };
      return { ok: true, queued: true };
    }
    h.pendingBox = null;
    h.target = null;
    h.followTarget = null;
    const serial = ++this.serial,
      pages = Array.from({ length: params.pages }, (_, i) => {
        const p = sparsePuzzle(
          RULES.camp,
          g.seed + 19000 + serial * 17 + i,
          params.hints,
        );
        return dataFields([structuredClone(p), structuredClone(p)]);
      });
    const protective = victim.team === h.team;
    const box = bindPage(
      {
        id: `box-${this.serial}`,
        kind: "prison",
        name: "Судоку-коробка",
        owner: victim.id,
        protective,
        penReduction: protective ? params.pen : 0,
        unit: victim,
        x: victim.x,
        y: victim.y,
        until: g.time + params.duration,
        thinkAt: g.time + 0.8,
        pages,
      },
      0,
    );
    if (params.armor) {
      const team = 1 - victim.team;
      for (const page of pages) {
        const cells = page.boards[team]
          .map((value, index) => (!value ? index : -1))
          .filter((index) => index >= 0);
        for (let n = 0; n < params.armor && cells.length; n++) {
          const offset = Math.floor(g.random() * cells.length);
          page.armor[team][cells.splice(offset, 1)[0]] = box.until;
        }
      }
    }
    if (protective) victim.boxProtection = box;
    else {
      victim.prison = box;
      victim.target = null;
      victim.followTarget = null;
      victim.flowerRun = false;
    }
    h.heroSkillAt = g.time + params.cooldown;
    return { ok: true };
  }
  sudaks(h) {
    const g = this.game;
    if (
      h.dead ||
      h.role !== "sudaks" ||
      h.stunnedUntil > g.time ||
      g.phase !== "playing" ||
      h.heroSkillAt > g.time
    )
      return {
        ok: false,
        message: "Навык Судакса недоступен или перезаряжается",
      };
    const params = g.skill(h, "cry");
    if (!params) return { ok: false, message: "Откройте Боевой клич" };
    const duration = params.duration,
      count = params.armor,
      team = 1 - h.team,
      t = h.hp,
      p = t.puzzles[team],
      b = t.boards[team],
      free = p.hintOrder.filter(
        (i) => !b[i] && !t.armor[team][i] && !t.stones[team][i],
      );
    h.sudaksExposeUntil = g.time + duration;
    h.sudaksArmorUntil = g.time + duration;
    h.sudaksArmor = free.slice(0, count);
    for (const i of h.sudaksArmor) t.armor[team][i] = h.sudaksArmorUntil;
    let affected = 0;
    for (const enemy of g.actors()) {
      if (enemy.duel) continue;
      if (
        enemy.team === h.team ||
        enemy.dead ||
        g.heroEffects.trapped(enemy) ||
        dist(enemy, h) > CONFIG.effectRadius
      )
        continue;
      enemy.forcedSolve = { targetId: h.id, until: h.sudaksExposeUntil };
      enemy.target = null;
      enemy.followTarget = null;
      enemy.fighting = null;
      enemy.flowerRun = false;
      g.constrainForcedSolve(enemy);
      affected++;
    }
    h.heroSkillAt = g.time + params.cooldown;
    g.emit("battleCry", { hero: h.id });
    return { ok: true, armor: h.sudaksArmor.length, duration, affected };
  }
  burning(h, preferred) {
    const g = this.game;
    if (g.abduction.carried(h)) return { ok: false, message: "Герой похищен" };
    let box = this.trapped(h)
      ? h.prison
      : preferred?.kind === "prison"
        ? preferred
        : null;
    if (
      h.dead ||
      h.role !== "sudaks" ||
      h.stunnedUntil > g.time ||
      g.phase !== "playing"
    )
      return { ok: false, message: "Горящие цифры недоступны" };
    if (!g.fire.charges(h)?.count)
      return { ok: false, message: "Горящие цифры перезаряжаются" };
    const target = box
      ? box.unit
      : g.nearestHero(h, 1 - h.team, preferred?.unit || preferred);
    if (!target)
      return { ok: false, message: "Рядом нет видимого вражеского героя" };
    if (!box && this.protected(target)) box = target.boxProtection;
    const params = g.skill(h, "burning");
    if (!params) return { ok: false, message: "Откройте Горящие цифры" };
    const t = box || target.hp,
      team = h.team,
      board = t.boards[team],
      p = t.puzzles[team],
      free = p.hintOrder.filter(
        (i) =>
          !board[i] &&
          g.duet.owns(t, i) &&
          !g.duet.reserved(t, i) &&
          !t.armor[team][i] &&
          !t.stones[team][i] &&
          !(t.errors[team][i]?.until > g.time),
      ),
      count = params.count,
      duration = params.duration;
    if (!free.length)
      return { ok: false, message: "У врага нет свободных клеток" };
    const access = g.interact(h, t);
    if (!access.ok) return access;
    const cells = free.slice(0, count);
    this.fillBurning(h, t, cells, duration, team);
    g.fire.consume(h, 1);
    g.emit("burning", { hero: h.id, target: target.id, count: cells.length });
    g.complete(h, t, true);
    return { ok: true, count: cells.length, target: target.id, duration };
  }
  fillBurning(h, t, cells, duration, team = h.team) {
    if (t.kind === "health" && this.protected(t.unit)) return;
    duration = this.game.fire.active(t.unit)?.incoming || duration;
    const page = t.pages?.[t.activePage || 0] || t,
      p = page.puzzles[team];
    for (const i of cells)
      this.game.combat.hit(
        { ...h, team },
        { ...t, ...page },
        i,
        p.solution[i],
        false,
        { burning: duration },
      );
    if (t.kind === "health") this.game.runes.active(t);
  }
  markBurning(h, t, cells, duration, team = h.team, spread = true) {
    const token = ++this.serial,
      root =
        t.kind === "prison" ? t : t.unit?.hp || this.game.getTarget(t.id) || t,
      page =
        root.pages?.find((page) => page.boards[team] === t.boards[team]) || t;
    for (const i of cells)
      page.burning[team][i] = { token, until: this.game.time + duration };
    this.burningEffects.push({
      token,
      h,
      target: root.unit,
      t: root,
      page,
      team,
      cells,
      until: this.game.time + duration,
      duration,
      spread,
    });
  }
  enterBox(h, t, i, value) {
    return this.game.place(h, t, i, value, "pen");
  }
  schedule(h, t) {
    const g = this.game;
    if (h.role !== "combinator" || h.poisonAt > g.time) return;
    const params = g.skill(h, "poison");
    if (!params || g.random() >= params.chance) return;
    const page = t.pages?.[t.activePage] || t;
    h.poisonAt = g.time + params.cooldown;
    this.poison.push({
      token: ++this.serial,
      h,
      t,
      page,
      board: page.boards[h.team],
      at: g.time + params.delay,
      count: params.count,
      entries: null,
      until: g.time + params.delay + params.duration,
    });
  }
  tick() {
    const g = this.game;
    for (const h of g.actors()) {
      if (!h.pendingBox) continue;
      const victim = g.actors().find((u) => u.id === h.pendingBox.targetId);
      if (
        !victim ||
        victim.dead ||
        h.dead ||
        h.stunnedUntil > g.time ||
        this.trapped(h) ||
        this.trapped(victim) ||
        this.protected(victim) ||
        !g.vision.visible(h.team, victim)
      ) {
        h.pendingBox = null;
        h.target = null;
        continue;
      }
      if (dist(h, victim) <= CONFIG.effectRadius) {
        this.box(h, victim);
        h.pendingBox = null;
      } else if (h.target)
        Object.assign(h.target, { x: victim.x, y: victim.y });
      else h.pendingBox = null;
    }
    this.acidZones = this.acidZones.filter((zone) => zone.until > g.time);
    for (const zone of this.acidZones) {
      const enemies = g.combat.units().filter((u) => u.team !== zone.team);
      for (const u of enemies) {
        if (dist(u, zone) > zone.radius) {
          zone.nextHits.delete(u);
          continue;
        }
        const at = zone.nextHits.get(u);
        if (at === undefined || g.time >= at) {
          zone.nextHits.set(u, g.time + zone.interval);
          g.sudzh.poison(zone.owner, u, 8);
        }
      }
    }
    for (const h of g.actors())
      if (h.boxProtection) {
        if (!this.protected(h)) h.boxProtection = null;
        else {
          h.boxProtection.x = h.x;
          h.boxProtection.y = h.y;
        }
      }
    for (const h of g.actors()) {
      if (h.forcedSolve) {
        const target = g
          .actors()
          .find((unit) => unit.id === h.forcedSolve.targetId);
        if (
          h.dead ||
          h.forcedSolve.until <= g.time ||
          !target ||
          target.dead ||
          target.role !== "sudaks" ||
          this.trapped(h)
        ) {
          h.forcedSolve = null;
          if (h.target?.forcedSolve) h.target = null;
        }
      }
      if (h.sudaksArmorUntil && h.sudaksArmorUntil <= g.time) {
        for (const i of h.sudaksArmor || [])
          if (h.hp?.armor?.[1 - h.team]?.[i] === h.sudaksArmorUntil)
            delete h.hp.armor[1 - h.team][i];
        h.sudaksArmor = [];
        h.sudaksArmorUntil = 0;
      }
      if (h.sudaksExposeUntil <= g.time) h.sudaksExposeUntil = 0;
    }
    const secondaryBurns = [];
    this.burningEffects = this.burningEffects.filter((effect) => {
      const { h, target, t, team, cells, token, until } = effect,
        data = effect.page || t,
        board = data.boards[team];
      if (
        t.destroyed ||
        target?.dead ||
        (target && target.hp !== t && g.duet.state(target)?.source !== t)
      )
        return false;
      if (target?.duel || g.time < until) return true;
      let burned = false;
      for (const i of cells)
        if (data.burning[team][i]?.token === token) {
          g.erasers.eraseEntry(data, team, i);
          burned = true;
        }
      if (!burned || effect.spread === false) return false;
      const anchor = cells[0] ?? 0,
        width = data.puzzles[team].rules.size,
        candidates = board
          .map((v, i) =>
            v &&
            !data.burning[team][i] &&
            !secondaryBurns.some(
              (b) => b.data === data && b.team === team && b.i === i,
            ) &&
            !data.puzzles[team].givens[i] &&
            !data.holes[team].includes(i)
              ? i
              : -1,
          )
          .filter((i) => i >= 0)
          .sort(
            (a, b) =>
              Math.abs(Math.floor(a / width) - Math.floor(anchor / width)) +
              Math.abs((a % width) - (anchor % width)) -
              (Math.abs(Math.floor(b / width) - Math.floor(anchor / width)) +
                Math.abs((b % width) - (anchor % width))),
          );
      if (candidates.length) {
        const i = candidates[0];
        secondaryBurns.push({ h, t, data, team, i, duration: effect.duration });
      }
      return false;
    });
    for (const { h, t, data, team, i, duration } of secondaryBurns)
      this.markBurning(h, { ...t, ...data }, [i], duration, team, false);
    for (const h of g.actors()) {
      if (h.prison && !this.trapped(h)) h.prison = null;
      if (
        h.prison?.until > g.time &&
        !g.abduction.carried(h) &&
        (h.id !== g.player.id || g.autoPlayer) &&
        g.time >= h.prison.thinkAt
      ) {
        const box = h.prison;
        box.thinkAt = g.time + 0.8;
        const m = g.botMove(h, box);
        if (m) this.enterBox(h, box, m.index, m.value);
      }
    }
    this.poison = this.poison.filter((effect) => {
      const { h, t, page, board } = effect,
        team = h.team;
      if (
        t.destroyed ||
        page.completed[team] ||
        t.unit?.dead ||
        (t.kind === "health" &&
          t.unit &&
          t.unit.hp !== t &&
          g.duet.state(t.unit)?.source !== t) ||
        page.boards[team] !== board
      )
        return false;
      if (t.unit?.duel) return true;
      if (effect.entries === null && g.time >= effect.at) {
        if (g.time >= effect.until) return false;
        const free = board
          .map((v, i) =>
            !v &&
            g.duet.owns(t, i, page) &&
            !g.duet.reserved({ ...t, ...page }, i) &&
            !page.stones[team][i] &&
            !(page.errors[team][i]?.until > g.time)
              ? i
              : -1,
          )
          .filter((i) => i >= 0);
        effect.entries = [];
        effect.duration = effect.until - effect.at;
        for (let n = 0; n < effect.count && free.length; n++) {
          const i = free.splice(Math.floor(g.random() * free.length), 1)[0];
          if (
            g.combat.hit(
              h,
              { ...t, ...page },
              i,
              page.puzzles[team].solution[i],
              false,
              { poison: effect },
            )
          ) {
            if (!page.burning[team][i]) {
              page.poison[team][i] = effect.token;
              if (!effect.entries.includes(i)) effect.entries.push(i);
            }
          }
        }
        const original = t.activePage;
        if (t.pages) g.selectPage(t, t.pages.indexOf(page));
        // Damage belongs to its caster even if the caster has moved or died.
        g.complete(h, t, true);
        if (t.pages) g.selectPage(t, original);
      }
      if (g.time < effect.until) return true;
      if (!t.destroyed && !page.completed[team] && !t.unit?.dead)
        for (const i of effect.entries || [])
          if (page.poison[team][i] === effect.token) {
            board[i] = 0;
            delete page.poison[team][i];
          }
      return false;
    });
  }
  follow(h, target) {
    const g = this.game;
    if (
      g.phase !== "playing" ||
      h.dead ||
      h.forcedSolve?.until > g.time ||
      this.trapped(h) ||
      !target ||
      target.dead ||
      !g.vision.visible(h.team, target) ||
      target.team === h.team
    )
      return false;
    h.followTarget = target.hp.id;
    h.followLastSeen = { x: target.x, y: target.y };
    h.flowerRun = false;
    return true;
  }
  updateFollow(h) {
    if (!h.followTarget) return;
    const g = this.game,
      t = g.getTarget(h.followTarget);
    if (h.forcedSolve?.until > g.time) {
      h.followTarget = null;
      h.target = null;
      return;
    }
    if (!t || t.unit.dead || h.dead) {
      h.followTarget = null;
      h.target = null;
      return;
    }
    if (!g.vision.visible(h.team, t)) {
      h.followTarget = null;
      h.target = h.followLastSeen ? { ...h.followLastSeen } : null;
      return;
    }
    h.followLastSeen = { x: t.unit.x, y: t.unit.y };
    const radius = g.lassoActive(h, t.unit)
      ? CONFIG.lassoRadius
      : CONFIG.interactRadius *
        CONFIG.combatRangeMultiplier *
        (t.unit.kind === "creep" ? 1 : 2);
    const d = dist(h, t.unit),
      stop = radius * 0.85;
    h.target =
      d > stop
        ? {
            x: t.unit.x + ((h.x - t.unit.x) / d) * stop,
            y: t.unit.y + ((h.y - t.unit.y) / d) * stop,
            pursueEnemy: true,
          }
        : null;
  }
}
