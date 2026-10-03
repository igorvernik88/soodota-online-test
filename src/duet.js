import {
  DUEL_END_SECONDS,
  DUEL_START_SECONDS,
  DUEL_ASHES_SECONDS,
  default as DUET_ANIMATIONS,
} from "./animations/duet.js";
import { CONFIG, RULES, FIRE } from "./config.js";
import { bindPage, dataFields } from "./boards.js";
import { dist, makePuzzle, logicalMove } from "./sudoku.js";

const SHARED = [
  "gold",
  "digits",
  "spent",
  "earned",
  "income",
  "digitIncome",
  "digitsSpent",
  "skillRanks",
  "lastUpgrade",
  "digitProgress",
  "hasteTier",
  "bootTier",
  "double",
  "misfire",
  "normalCount",
  "cardCount",
  "bonusCount",
  "consumables",
  "notes",
  "courier",
  "armorStock",
  "armorRestockAt",
  "itemStocks",
  "eraserTool",
];
const CLOCK =
  /(?:Until|At|until|nextAt|nextEraseAt|updatedAt|at|nextNormal|nextAttack)$/;
export class Duet {
  constructor(game) {
    this.game = game;
    this.parts = [];
    this.duels = [];
    this.duelRemains = [];
    this.serial = 0;
  }
  root(h) {
    return h?.duetRoot || h;
  }
  actors() {
    return [...this.game.heroes, ...this.parts];
  }
  state(h) {
    const r = this.root(h);
    return r?.role === "duet"
      ? (r.duetState ||= { split: false, queue: [], shieldUntil: 0 })
      : null;
  }
  page(t) {
    return t.pages?.find((p) => p.boards === t.boards) || t;
  }
  owns(t, index, page = this.page(t)) {
    return !page.ownedIndices || page.ownedIndices.includes(index);
  }
  remaining(h) {
    return this.game.combat
      .healthPages(h.hp)
      .reduce(
        (n, p) =>
          n +
          p.boards[1 - h.team].filter((v, i) => !v && this.owns(h.hp, i, p))
            .length,
        0,
      );
  }
  access(h, id) {
    const g = this.game,
      r = this.root(h),
      s = this.state(h),
      p = g.skill(r, id);
    if (
      !s ||
      !p ||
      h.duetPart === "oka" ||
      h.dead ||
      (h.duel && (id !== "bruteforce" || !this.duelInputReady(h.duel))) ||
      h.forcedSolve?.until > g.time ||
      h.stunnedUntil > g.time ||
      g.heroEffects.trapped(h) ||
      g.abduction.carried(h) ||
      g.phase !== "playing"
    )
      return { ok: false, message: "Навык сейчас недоступен" };
    if ((r[id + "At"] || 0) > g.time)
      return { ok: false, message: "Навык перезаряжается" };
    return { ok: true, p, r, s };
  }
  shield(h) {
    const a = this.access(h, "stubborn");
    if (!a.ok) return a;
    const g = this.game;
    a.s.shieldUntil = g.time + a.p.duration;
    a.r.stubbornAt = g.time + a.p.cooldown;
    return { ok: true };
  }
  reserved(t, index) {
    const s = this.state(t?.unit);
    return (
      !!s?.queue.some(
        (e) => e.page === this.page(t).sourcePage && e.index === index,
      ) || !!s?.queue.some((e) => e.page === this.page(t) && e.index === index)
    );
  }
  defer(attacker, t, index, value, universal, metadata = {}) {
    const s = this.state(t.unit);
    if (!s || s.shieldUntil <= this.game.time) return false;
    const page = this.page(t).sourcePage || this.page(t);
    const incoming = this.game.fire.active(t.unit),
      outgoing = this.game.fire.active(attacker);
    if (incoming || outgoing)
      metadata = {
        ...metadata,
        burning:
          incoming?.incoming ||
          this.game.skill(attacker, "burning")?.duration ||
          FIRE.outgoingDuration,
      };
    if (!s.queue.some((e) => e.page === page && e.index === index)) {
      s.queue.push({ attacker, t, page, index, value, universal, metadata });
      this.game.emit("deferredHit", { hero: this.root(t.unit).id, index });
    }
    return true;
  }
  view(root, part, masks) {
    const source = root.duetState.source;
    const pages = (source.pages || [source]).map((page, i) => ({
      ...page,
      sourcePage: page,
      ownedIndices: masks[i],
      completed: [false, false],
    }));
    return bindPage(
      {
        ...source,
        id: part === "oka" ? `hp-oka-${root.id}` : source.id,
        unit: part === "oka" ? root.duetState.oka : root,
        duetFragment: part,
        rootId: source.id,
        pages,
      },
      Math.min(source.activePage || 0, pages.length - 1),
    );
  }
  split(h) {
    const r = this.root(h),
      s = this.state(r);
    if (s.split) return;
    const g = this.game;
    s.source = r.hp;
    s.split = true;
    s.splitAt = g.time;
    const oka = {
      ...r,
      id: `oka-${r.id}`,
      name: "Ока",
      duetRoot: r,
      duetPart: "oka",
      target: null,
      followTarget: null,
      fighting: null,
      dead: false,
      nextNormal: r.nextNormal,
      lockedUntil: r.lockedUntil,
      regenBoosts: [],
      itemHealing: [],
      stunnedUntil: 0,
      speedEffect: null,
      prison: null,
      boxProtection: null,
      abduction: null,
      lasso: null,
    };
    for (const key of SHARED)
      Object.defineProperty(oka, key, {
        get: () => r[key],
        set: (value) => (r[key] = value),
        enumerable: true,
        configurable: true,
      });
    s.oka = oka;
    const pages = s.source.pages || [s.source],
      upper = pages.map((p) =>
        Array.from(
          {
            length:
              Math.floor(p.puzzles[0].rules.size / 3) * p.puzzles[0].rules.size,
          },
          (_, i) => i,
        ),
      ),
      lower = pages.map((p, n) =>
        p.boards[0].map((_, i) => i).filter((i) => !upper[n].includes(i)),
      );
    if (!pages.some((p, n) => lower[n].some((i) => !p.boards[1 - r.team][i]))) {
      let found = false;
      pages.forEach((p, n) => {
        if (found) return;
        const i = upper[n].find((i) => !p.boards[1 - r.team][i]);
        if (i !== undefined) {
          upper[n] = upper[n].filter((k) => k !== i);
          lower[n].push(i);
          found = true;
        }
      });
    }
    r.hp = this.view(r, "sud", lower);
    oka.hp = this.view(r, "oka", upper);
    oka.dead = this.remaining(oka) === 0;
    this.parts.push(oka);
    g.emit("duetSplit", { hero: r.id });
  }
  throw(h, target) {
    if (this.state(h)?.split) return this.returnPart(h);
    const a = this.access(h, "throwOka");
    if (!a.ok) return a;
    const { r, s, p } = a,
      g = this.game;
    if (s.shieldUntil > g.time || s.queue.length)
      return { ok: false, message: "Дождитесь окончания Упёртости" };
    if (
      !target ||
      target.dead ||
      target.team === h.team ||
      target.duel ||
      g.heroEffects.protected(target) ||
      g.heroEffects.trapped(target) ||
      g.abduction.carried(target) ||
      !g.vision.visible(h.team, target) ||
      dist(h, target) > p.range
    )
      return { ok: false, message: "Выберите видимого врага в радиусе" };
    this.split(h);
    s.flight = {
      targetId: target.id,
      x: target.x,
      y: target.y,
      start: g.time,
      duration: dist(h, target) / p.projectileSpeed,
      from: { x: h.x, y: h.y },
      attach: p.duration,
    };
    r.throwOkaAt = g.time + p.cooldown;
    return { ok: true };
  }
  detach(h) {
    const s = this.state(h);
    if (!s?.mounted) return;
    s.mounted = null;
    h.x = Math.max(0, Math.min(CONFIG.worldSize, s.oka.x + 45));
    h.y = Math.max(0, Math.min(CONFIG.worldSize, s.oka.y + 45));
    h.fighting = null;
  }
  returnPart(h) {
    const g = this.game,
      r = this.root(h),
      s = this.state(h);
    if (
      !s?.split ||
      h.dead ||
      h.duel ||
      h.stunnedUntil > g.time ||
      g.heroEffects.trapped(h) ||
      g.abduction.carried(h)
    )
      return { ok: false, message: "Возвращение недоступно" };
    this.detach(s.oka);
    s.flight = null;
    const other = h === r ? s.oka : r;
    g.move(h, other.x, other.y);
    h.duetReturn = other.id;
    return { ok: true, queued: true };
  }
  merge(r) {
    const g = this.game,
      s = this.state(r),
      oka = s.oka;
    if (!s.split) return;
    r.x = r.dead ? oka.x : r.x;
    r.y = r.dead ? oka.y : r.y;
    r.hp = s.source;
    r.hp.unit = r;
    r.dead = false;
    s.split = false;
    s.flight = null;
    s.mounted = null;
    s.mergeAt = g.time;
    r.duetReturn = null;
    oka.duetReturn = null;
    this.parts = this.parts.filter((u) => u !== oka);
    if (g.controlledId === oka.id) g.controlledId = r.id;
    if (s.pendingHealth) {
      const size = s.pendingHealth;
      s.pendingHealth = 0;
      g.combat.upgradeHealth(r, size);
    }
    g.emit("duetMerge", { hero: r.id });
  }
  switch(h, part) {
    const r = this.root(h),
      s = this.state(r),
      u = part === "oka" ? s?.oka : r;
    if (!s?.split || !u || u.dead)
      return { ok: false, message: "Персонаж недоступен" };
    this.game.controlledId = u.id;
    return { ok: true };
  }
  partialKill(h, attacker) {
    const r = this.root(h),
      s = this.state(r);
    if (!s?.split) return false;
    h.dead = true;
    h.deathAt = this.game.time;
    h.target = null;
    h.fighting = null;
    h.duetReturn = null;
    this.detach(s.oka);
    this.game.emit("duetPartDeath", { hero: r.id, part: h.duetPart || "sud" });
    if (r.dead && s.oka.dead) {
      this.merge(r);
      r.dead = false;
      this.game.combat.kill(r, attacker);
    } else if (this.game.player === h)
      this.game.controlledId = (h === r ? s.oka : r).id;
    return true;
  }
  brute(h, t, index) {
    const a = this.access(h, "bruteforce");
    if (!a.ok) return a;
    const g = this.game;
    const duel = t === h.duel && t?.kind === "duel";
    if (
      !duel &&
      (t?.kind !== "health" ||
        t.unit.team === h.team ||
        !g.near(h, t) ||
        !g.objectiveAccess(h, t).ok)
    )
      return { ok: false, message: "Откройте здоровье врага в радиусе атаки" };
    const board = t.boards[h.team],
      p = t.puzzles[h.team],
      n = p.rules.size,
      blocked = g.blockedIndices(h, t);
    if (!Number.isInteger(index) || board[index] || blocked.has(index))
      return { ok: false, message: "Выберите доступную пустую клетку" };
    const cells = board
      .map((v, i) => (!v && !blocked.has(i) ? i : -1))
      .filter((i) => i >= 0)
      .sort(
        (i, j) =>
          Math.hypot(
            (i % n) - (index % n),
            Math.floor(i / n) - Math.floor(index / n),
          ) -
            Math.hypot(
              (j % n) - (index % n),
              Math.floor(j / n) - Math.floor(index / n),
            ) || i - j,
      )
      .slice(0, a.p.count);
    a.r.bruteforceAt = g.time + a.p.cooldown;
    for (const i of cells) {
      const hole = g.random() < a.p.chance,
        value = hole ? -1 : 1 + Math.floor(g.random() * n);
      if (hole || value === p.solution[i]) {
        if (duel) this.claimDuelCell(h, t, i, value);
        else if (g.combat.hit(h, t, i, value) && hole) t.holes[h.team].push(i);
      } else
        t.errors[h.team][i] = {
          value,
          at: g.time,
          until: g.time + CONFIG.errorLock,
        };
    }
    if (duel) {
      if (board.every(Boolean)) this.finishDuel(t);
    } else g.complete(h, t, true);
    g.emit("duetBrute", { hero: a.r.id, target: t.id, cells });
    return { ok: true };
  }
  resolve(t, index) {
    const s = this.state(t?.unit);
    if (!s?.split) return t;
    const source = this.page(t).sourcePage || this.page(t);
    const n = (s.source.pages || [s.source]).findIndex(
      (p) => p === source || p.boards === source.boards,
    );
    if (n < 0) return t;
    const owner = [this.root(t.unit), s.oka].find((u) =>
      u.hp.pages[n].ownedIndices.includes(index),
    );
    return owner ? { ...owner.hp, ...owner.hp.pages[n], activePage: n } : t;
  }
  allowed(attacker, target) {
    return !attacker?.duel && !target?.duel;
  }
  dash(h, point) {
    const a = this.access(h, "headOn");
    if (!a.ok) return a;
    const g = this.game;
    if (a.s.split || a.s.shieldUntil > g.time || a.s.queue.length)
      return {
        ok: false,
        message: "Нужно объединиться и дождаться окончания щита",
      };
    const d = dist(h, point);
    if (!Number.isFinite(d) || !d)
      return { ok: false, message: "Выберите направление" };
    a.r.headOnAt = g.time + a.p.cooldown;
    h.duetDash = {
      at:
        g.time +
        Math.max(
          a.p.delay,
          (DUET_ANIMATIONS.windup.frames * DUET_ANIMATIONS.windup.frameMs) /
            1000,
        ),
      left: a.p.range,
      dx: (point.x - h.x) / d,
      dy: (point.y - h.y) / d,
      p: a.p,
    };
    h.target = null;
    return { ok: true };
  }
  pause(h) {
    const refs = [],
      seen = new Set();
    const visit = (o) => {
      if (!o || typeof o !== "object" || seen.has(o)) return;
      seen.add(o);
      for (const [key, value] of Object.entries(o)) {
        if (
          typeof value === "number" &&
          Number.isFinite(value) &&
          value > this.game.time &&
          CLOCK.test(key)
        ) {
          refs.push([o, key, value]);
          o[key] = Infinity;
        }
      }
    };
    for (const [key, value] of Object.entries(h))
      if (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value > this.game.time &&
        (key.endsWith("Until") || key === "regenAt")
      ) {
        refs.push([h, key, value]);
        h[key] = Infinity;
      }
    for (const field of [
      "speedEffect",
      "inkBinding",
      "miniInk",
      "forcedSolve",
      "freshSudoku",
      "stench",
      "itemHealing",
      "regenBoosts",
      "prison",
      "boxProtection",
      "lasso",
      "thickBinding",
    ]) {
      const v = h[field];
      if (Array.isArray(v)) v.forEach(visit);
      else visit(v);
    }
    for (const page of this.game.combat.healthPages(h.hp)) {
      visit(page.runeBinding);
      for (const field of ["effects", "burning", "errors"])
        for (const team of [0, 1]) {
          const v = page[field]?.[team];
          visit(v);
          Object.values(v || {}).forEach(visit);
        }
      for (const [team, value] of page.invertedUntil.entries())
        if (value > this.game.time && Number.isFinite(value)) {
          refs.push([page.invertedUntil, team, value]);
          page.invertedUntil[team] = Infinity;
        }
      for (const field of ["armor", "universal"])
        for (const team of [0, 1])
          for (const [key, value] of Object.entries(page[field]?.[team] || {}))
            if (
              typeof value === "number" &&
              Number.isFinite(value) &&
              value > this.game.time
            ) {
              refs.push([page[field][team], key, value]);
              page[field][team][key] = Infinity;
            }
    }
    for (const e of [
      ...this.game.heroEffects.poison,
      ...this.game.heroEffects.burningEffects,
    ])
      if (e.t.unit === h) visit(e);
    return refs;
  }
  startDuel(h, enemy, p) {
    const g = this.game,
      puzzle = makePuzzle(
        h.healthSize === 4 ? RULES.camp : RULES.lane,
        g.seed + 90000 + ++this.serial * 71,
      ),
      fields = dataFields([puzzle, puzzle]);
    fields.boards[1] = fields.boards[0];
    const duel = {
      id: `duel-${this.serial}`,
      kind: "duel",
      name: "Лоб в лоб",
      x: h.x,
      y: h.y,
      ...fields,
      participants: [h, enemy],
      owners: {},
      scores: new Map([
        [h.id, 0],
        [enemy.id, 0],
      ]),
      pen: new Map(),
      locks: new Map(),
      until: g.time + DUEL_START_SECONDS + p.duration,
      startedAt: g.time,
      paused: [],
    };
    for (const u of duel.participants) {
      if (u.duetPart === "oka") this.detach(u);
      duel.paused.push(...this.pause(u));
      u.duel = duel;
      u.target = null;
      u.fighting = null;
    }
    this.duels.push(duel);
    h.duetDash = null;
    g.emit("duetDuel", {
      target: duel.id,
      heroes: duel.participants.map((u) => u.id),
    });
  }
  duelInputReady(t) {
    return !t.finished && this.game.time >= t.startedAt + DUEL_START_SECONDS;
  }
  claimDuelCell(h, t, index, value) {
    if (t.boards[0][index]) return false;
    delete t.errors[0][index];
    delete t.errors[1][index];
    t.boards[0][index] = value;
    t.owners[index] = h.id;
    if (value === -1) {
      t.holes[0].push(index);
      t.holes[1].push(index);
    }
    const [first, second] = t.participants;
    const leaderBefore = Math.sign(
      t.scores.get(first.id) - t.scores.get(second.id),
    );
    t.scores.set(h.id, t.scores.get(h.id) + 1);
    if (
      Math.sign(t.scores.get(first.id) - t.scores.get(second.id)) !==
      leaderBefore
    )
      t.leadAt = this.game.time;
    return true;
  }
  duelPlace(h, t, index, value, mode) {
    const g = this.game;
    if (
      !this.duelInputReady(t) ||
      t !== h.duel ||
      g.phase !== "playing" ||
      !t.participants.includes(h) ||
      h.dead ||
      mode === "note" ||
      mode === "universal"
    )
      return { ok: false, message: "В дуэли доступно только обычное перо" };
    if ((t.pen.get(h.id) || 0) > g.time || (t.locks.get(h.id) || 0) > g.time)
      return { ok: false, message: "Перо перезаряжается" };
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= t.boards[0].length ||
      t.boards[0][index]
    )
      return { ok: false, message: "Клетка уже занята" };
    if (value !== t.puzzles[0].solution[index]) {
      t.locks.set(h.id, g.time + CONFIG.errorLock);
      t.errors[h.team][index] = {
        value,
        at: g.time,
        until: g.time + CONFIG.errorLock,
      };
      return { ok: false, error: true, message: "Неверная цифра" };
    }
    this.claimDuelCell(h, t, index, value);
    t.pen.set(h.id, g.time + g.cooldown(h));
    if (t.boards[0].every(Boolean)) this.finishDuel(t);
    return { ok: true };
  }
  finishDuel(t) {
    const g = this.game;
    if (t.finished) return;
    t.finished = true;
    t.endingAt = Math.max(g.time, t.startedAt + DUEL_START_SECONDS);
  }
  releaseDuel(t) {
    const g = this.game;
    for (const [o, key, value] of t.paused)
      o[key] = value + g.time - t.startedAt;
    for (const h of t.participants) h.duel = null;
    const [a, b] = t.participants,
      difference = t.scores.get(a.id) - t.scores.get(b.id);
    g.emit("duetDuelEnd", {
      target: t.id,
      scores: [t.scores.get(a.id), t.scores.get(b.id)],
      difference,
    });
    this.duels = this.duels.filter((d) => d !== t);
    this.duelRemains.push({ ...t, ashesAt: g.time });
    if (difference)
      g.combat.damage(
        difference > 0 ? a : b,
        (difference > 0 ? b : a).hp,
        Math.abs(difference),
      );
  }
  tick(dt) {
    const g = this.game;
    for (const r of g.heroes.filter((h) => h.role === "duet")) {
      const s = this.state(r);
      if (r.dead && !s.split) {
        s.queue = [];
        s.shieldUntil = 0;
        continue;
      }
      if (s.shieldUntil <= g.time && s.queue.length) {
        const queue = s.queue.splice(0);
        for (const e of queue) {
          const victim = e.t.unit;
          if (victim.dead) continue;
          const original = victim.hp.activePage || 0,
            index =
              victim.hp.pages?.findIndex(
                (p) => (p.sourcePage || p) === e.page,
              ) ?? 0;
          if (index < 0) continue;
          if (victim.hp.pages) g.selectPage(victim.hp, index);
          const t = victim.hp;
          if (
            g.combat.hit(
              e.attacker,
              t,
              e.index,
              e.value,
              e.universal,
              e.metadata,
            )
          ) {
            if (e.value === -1 && !t.holes[e.attacker.team].includes(e.index))
              t.holes[e.attacker.team].push(e.index);
            g.complete(e.attacker, t, true);
          }
          if (
            !victim.dead &&
            victim.hp.pages &&
            !victim.hp.completed[e.attacker.team]
          )
            g.selectPage(victim.hp, original);
        }
      }
      if (s.split) {
        const oka = s.oka;
        if (s.flight) {
          const f = s.flight,
            q = Math.min(1, (g.time - f.start) / Math.max(0.001, f.duration));
          oka.x = f.from.x + (f.x - f.from.x) * q;
          oka.y = f.from.y + (f.y - f.from.y) * q;
          if (q === 1) {
            const enemy = this.actors().find((u) => u.id === f.targetId);
            if (
              enemy &&
              !enemy.dead &&
              !enemy.duel &&
              !g.heroEffects.protected(enemy) &&
              !g.abduction.carried(enemy) &&
              !g.heroEffects.trapped(enemy) &&
              g.vision.visible(r.team, enemy) &&
              dist(oka, enemy) <= 70
            ) {
              s.mounted = { target: enemy, until: g.time + f.attach };
              oka.fighting = enemy.hp.id;
              g.emit("okaMounted", { hero: oka.id, target: enemy.hp.id });
            }
            s.flight = null;
          }
        }
        if (s.mounted) {
          const m = s.mounted;
          if (m.until <= g.time || m.target.dead || oka.dead) this.detach(oka);
          else {
            oka.x = m.target.x;
            oka.y = m.target.y;
          }
        }
        for (const u of [r, oka])
          if (u.duetReturn != null) {
            const other = u === r ? oka : r;
            if (dist(u, other) <= 100) {
              this.merge(r);
              break;
            }
            if (u.target) Object.assign(u.target, { x: other.x, y: other.y });
            else u.duetReturn = null;
          }
      }
      const dash = r.duetDash;
      if (dash && g.time >= dash.at) {
        const step = Math.min(dash.left, dash.p.projectileSpeed * dt),
          from = { x: r.x, y: r.y };
        g.move(r, r.x + dash.dx * step, r.y + dash.dy * step, {
          pursueEnemy: true,
        });
        g.advanceHero(r, step / Math.max(1, g.heroSpeed(r)));
        r.target = null;
        dash.left -= step;
        const victim = this.actors()
          .filter(
            (u) =>
              u.team !== r.team &&
              !u.dead &&
              !u.duel &&
              !g.heroEffects.protected(u) &&
              !g.heroEffects.trapped(u) &&
              !g.abduction.carried(u) &&
              !this.state(u)?.queue.length &&
              !(this.state(u)?.shieldUntil > g.time) &&
              g.vision.visible(r.team, u),
          )
          .filter((u) => {
            const dx = r.x - from.x,
              dy = r.y - from.y,
              q = Math.max(
                0,
                Math.min(
                  1,
                  ((u.x - from.x) * dx + (u.y - from.y) * dy) /
                    (dx * dx + dy * dy || 1),
                ),
              );
            return (
              Math.hypot(u.x - from.x - q * dx, u.y - from.y - q * dy) <= 70
            );
          })
          .sort((a, b) => dist(from, a) - dist(from, b))[0];
        if (victim) this.startDuel(r, victim, dash.p);
        else if (dash.left <= 0 || dist(from, r) < 0.01) r.duetDash = null;
      }
    }
    this.duelRemains = this.duelRemains.filter(
      (d) => g.time - d.ashesAt < DUEL_ASHES_SECONDS,
    );
    for (const d of [...this.duels]) {
      if (d.finished) {
        if (g.time >= d.endingAt + DUEL_END_SECONDS) this.releaseDuel(d);
        continue;
      }
      for (const errors of d.errors)
        for (const [i, e] of Object.entries(errors))
          if (e.until <= g.time) delete errors[i];
      if (g.time >= d.until) {
        this.finishDuel(d);
        continue;
      }
      if (!this.duelInputReady(d)) continue;
      for (const h of d.participants)
        if (h !== g.player || g.autoPlayer) {
          if (
            (d.pen.get(h.id) || 0) > g.time ||
            (d.locks.get(h.id) || 0) > g.time
          )
            continue;
          const move = logicalMove(d.boards[0], d.puzzles[0].rules);
          if (move) {
            let value = move.value;
            if (g.random() < CONFIG.duelBotErrorChance) {
              const correct = d.puzzles[0].solution[move.index];
              const alternative =
                1 + Math.floor(g.random() * (d.puzzles[0].rules.size - 1));
              value = alternative >= correct ? alternative + 1 : alternative;
            }
            this.duelPlace(h, d, move.index, value, "pen");
          }
        }
    }
  }
  bot(h) {
    const r = this.root(h),
      s = this.state(h),
      g = this.game;
    if (!s || (h.dead && !s.split)) return false;
    if (h.duel) return true;
    if (s.split) {
      if (s.mounted) {
        const oka = s.oka;
        if (!oka.dead && g.canPen(oka)) {
          const t = s.mounted.target.hp,
            move = g.botMove(oka, t);
          if (move) {
            const result = g.place(oka, t, move.index, move.value, "pen");
            if (result.ok) this.returnPart(oka);
          } else this.returnPart(oka);
        }
        return true;
      }
      if (!s.flight && r.duetReturn == null && s.oka.duetReturn == null)
        this.returnPart(r.dead ? s.oka : r);
      return true;
    }
    const enemies = g.heroes.filter(
        (u) => u.team !== h.team && !u.dead && g.vision.visible(h.team, u),
      ),
      enemy = enemies.sort((a, b) => dist(h, a) - dist(h, b))[0];
    if (!enemy) return false;
    if (dist(h, enemy) < CONFIG.effectRadius) {
      if (
        g.skill(h, "stubborn") &&
        s.shieldUntil <= g.time &&
        this.remaining(h) < g.combat.healthCapacity(h) * 0.7
      )
        this.shield(h);
      const i = enemy.hp.boards[h.team].findIndex(
        (v, i) => !v && !g.blockedIndices(h, enemy.hp).has(i),
      );
      if (i >= 0) this.brute(h, enemy.hp, i);
    }
    if (!s.queue.length && s.shieldUntil <= g.time) {
      if (g.skill(h, "headOn") && this.dash(h, enemy).ok) return true;
      if (g.skill(h, "throwOka") && this.throw(h, enemy).ok) return true;
    }
    return false;
  }
}
