import { Duet } from "./duet.js";
import {
  dist,
  seeded,
  candidates,
  countSolutions,
  makePuzzle,
  logicalMove,
  solvableByLogic,
} from "./sudoku.js";
export {
  dist,
  seeded,
  candidates,
  countSolutions,
  makePuzzle,
  logicalMove,
  solvableByLogic,
};
import {
  CONFIG,
  RULES,
  BASES,
  RIVER,
  HEROES,
  ITEMS,
  LANES,
  SKILLS,
  FIRE,
} from "./config.js";
export { CONFIG, RULES, BASES, RIVER, HEROES, ITEMS };
import { CombatSystem, COMBAT } from "./combat.js";
import { Chat } from "./chat.js";
import { SudzhSkills } from "./sudzh.js";
import { Abduction } from "./abduction.js";
import { InkBinding } from "./ink-binding.js";
import { DustVision } from "./dust.js";
import { FireSkills } from "./fire-skills.js";
import { RuneBinding } from "./rune-binding.js";
import { Vision } from "./vision.js";
import { HeroEffects } from "./hero-effects.js";
import { Progression } from "./progression.js";
import { PROGRESSION } from "./config.js";
import { dataFields, makePage, bindPage } from "./boards.js";
import { WardSystem } from "./wards.js";
import { EraserSystem } from "./erasers.js";
import { WARDS } from "./config.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Constraint reasoning only: bots never read a stored solution. Backtracking is for sparse base pages.
export function reasonedMove(input, rules, excluded = new Set()) {
  const a = input.slice();
  for (let guard = 0; guard < a.length; guard++) {
    const m = logicalMove(a, rules);
    if (!m) break;
    if (!excluded.has(m.index)) return m;
    a[m.index] = m.value;
  }
  let index = -1,
    opts;
  for (let i = 0; i < a.length; i++)
    if (!a[i] && !excluded.has(i)) {
      const c = candidates(a, i, rules);
      if (c.length && (!opts || c.length < opts.length)) {
        index = i;
        opts = c;
      }
    }
  if (index < 0) return null;
  // Only a value with a valid completion is a logically supported move.
  for (const value of opts) {
    const b = a.slice();
    b[index] = value;
    if (countSolutions(b, rules, 1) > 0) return { index, value };
  }
  return null;
}
export class Game {
  constructor(
    seed = 42,
    { autoPlayer = false, role = "intellect", sandbox = false } = {},
  ) {
    this.sandbox = sandbox;
    this.controlledId = 0;
    this.seed = seed;
    this.random = seeded(seed);
    this.autoPlayer = autoPlayer;
    this.time = 0;
    this.phase = "select";
    this.score = [0, 0];
    this.winner = null;
    this.events = [];
    this.help = null;
    this.flower = null;
    this.nextFlower = 180;
    this.flowerRound = 0;
    const points = [
      [
        [43, 10],
        [66, 9],
        [83, 8],
      ],
      [
        [58, 42],
        [72, 28],
        [85, 15],
      ],
      [
        [90, 62],
        [91, 36],
        [92, 17],
      ],
    ];
    this.lanes = ["Верхняя", "Средняя", "Нижняя"].map((name, lane) => ({
      name,
      index: lane,
      towers: [0, 1].flatMap((defender) =>
        points[defender ? lane : 2 - lane].map(([x, y], step) => {
          if (!defender) {
            x = 100 - x;
            y = 100 - y;
          }
          const rules = RULES.lane;
          const pages = Array.from(
            { length: step === 0 ? 1 : step === 2 ? 3 : 2 },
            (_, page) =>
              makePage(
                rules,
                seed + lane * 137 + step * 37 + page * 991,
                step === 0 ? 0 : 12,
              ),
          );
          return bindPage(
            {
              id: `tower${defender}-${lane}-${step}`,
              kind: "tower",
              name: `${name} · T${step + 1}`,
              lane,
              step,
              defender,
              x: x * CONFIG.mapMultiplier,
              y: y * CONFIG.mapMultiplier,
              pages,
              activePage: 0,
              destroyed: false,
              backdoor: true,
              backdoorArmor: [5, 7, 10][step],
            },
            0,
          );
        }),
      ),
    }));
    this.cores = [0, 1].map((defender) =>
      bindPage(
        {
          id: `base${defender}`,
          kind: "core",
          name: defender ? "База Клякс" : "База Листьев",
          lane: 0,
          defender,
          ...BASES[defender],
          pages: [0, 1, 2].map((lane) => ({
            ...makePage(RULES.core, seed + 900 + lane * 101, 14),
            lane,
            difficulty: 0,
          })),
          activePage: 0,
          destroyed: false,
          backdoor: true,
          backdoorArmor: 10,
        },
        0,
      ),
    );
    const campPoints = [
      [25, 39, "Полянка чертополоха", "clearing"],
      [34, 73, "Мшистая пещера", "cave"],
      [61, 24, "Роща синих листьев", "grove"],
      [77, 57, "Пещера клякс", "cave"],
      [20, 58, "Лисья поляна", "clearing"],
      [45, 82, "Грибная лощина", "mushroom"],
      [55, 17, "Тихий сад", "grove"],
      [80, 41, "Янтарная лощина", "mushroom"],
    ];
    this.camps = campPoints.map(([x, y, name, biome], i) => {
      const p = makePuzzle(
        i === 1 || i === 3 ? RULES.lane : RULES.camp,
        seed + 111 + i * 14,
      );
      return {
        id: "camp" + i,
        kind: "camp",
        name,
        biome,
        x: x * CONFIG.mapMultiplier,
        y: y * CONFIG.mapMultiplier,
        owner: null,
        respawnAt: 0,
        round: 0,
        ...dataFields([p, p]),
      };
    });
    this.couriers = [0, 1].map((team) => ({
      team,
      ...BASES[team],
      state: "idle",
      cargo: [],
      queue: [],
      flowers: 0,
    }));
    this.depots = [[], []];
    this.stoneReadyAt = [0, 0];
    this.wards = new WardSystem(this);
    this.heroes = [];
    this.chooseHero(role, false);
    this.chat = new Chat(this);
    this.combat = new CombatSystem(this);
  }
  actors() {
    return this.duet?.actors() || this.heroes;
  }
  get player() {
    return (
      this.actors().find((h) => h.id === this.controlledId) || this.heroes[0]
    );
  }
  get towers() {
    return this.lanes.flatMap((l) => l.towers);
  }
  get locations() {
    return this.sandbox
      ? this.towers
      : [...this.towers, ...this.camps, ...this.cores];
  }
  getTarget(id) {
    return (
      this.locations.find((t) => t.id === id) ||
      this.wards.get(id) ||
      this.combat?.target(id) ||
      this.duet?.duels.find((d) => d.id === id) ||
      this.erasers.get(id) ||
      this.actors().find((h) => h.prison?.id === id)?.prison ||
      this.actors().find((h) => h.boxProtection?.id === id)?.boxProtection
    );
  }
  emit(type, data = {}) {
    this.events.push({ type, time: this.time, ...data });
  }
  chooseHero(role, confirm = true) {
    if (
      !["select", "buy"].includes(this.phase) ||
      !HEROES.some((r) => r.id === role)
    )
      return false;
    if (
      this.phase === "buy" &&
      (this.heroes.some((h) => h.spent) ||
        this.wards.readyAt.some((at) => at > 0))
    )
      return false;
    const random = seeded(
      this.seed + 701 + HEROES.findIndex((r) => r.id === role),
    );
    const roles = this.sandbox
      ? [role, "strong"]
      : [
          role,
          ...shuffle(
            HEROES.filter((r) => r.id !== role).map((r) => r.id),
            random,
          ).slice(0, CONFIG.teamSize - 1),
          ...shuffle(
            HEROES.map((r) => r.id),
            random,
          ).slice(0, CONFIG.teamSize),
        ];
    const spawnOffsets = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 0],
      [0, 2],
    ];
    this.heroes = roles.map((r, i) => {
      const team = this.sandbox ? i : i < CONFIG.teamSize ? 0 : 1;
      const base = BASES[team];
      const [spawnX, spawnY] = spawnOffsets[i % CONFIG.teamSize];
      const direction = team ? -1 : 1;
      const spawnPoint = this.sandbox
        ? this.sandboxSpawn(team)
        : {
            x: base.x + direction * spawnX * CONFIG.heroSpawnSpacing,
            y: base.y - direction * spawnY * CONFIG.heroSpawnSpacing,
          };
      return this.makeHero(r, i, team, spawnPoint);
    });
    this.progression = new Progression(this);
    this.erasers = new EraserSystem(this);
    this.runes = new RuneBinding(this);
    this.fire = new FireSkills(this);
    for (const h of this.heroes) this.progression.initialize(h);
    // Extra resources are exclusive to the sandbox map.
    if (this.sandbox)
      for (const hero of this.heroes) {
        hero.gold = 9999;
        hero.digits = 99;
      }
    this.heroEffects = new HeroEffects(this);
    this.dust = new DustVision(this);
    this.abduction = new Abduction(this);
    this.sudzh = new SudzhSkills(this);
    this.duet = new Duet(this);
    this.inkBinding = new InkBinding(this);
    this.vision = new Vision(this);
    if (this.sandbox) {
      const tower = this.lanes[0].towers.find((t) => t.defender === 1);
      tower.x = 3110;
      tower.y = 2630;
      tower.backdoor = false;
      tower.backdoorArmor = 0;
      this.lanes = [{ name: "Испытание", index: 0, towers: [tower] }];
      this.camps = [];
      for (const core of this.cores) core.destroyed = true;
      for (const courier of this.couriers)
        Object.assign(courier, this.baseOf(courier.team));
      this.forest.regions = [];
      this.forest.revision++;
      this.forest.regionAt = () => 0;
      this.forest.sightHit = () => null;
      this.nextFlower = Infinity;
    }
    if (this.combat) this.combat.resetHeroes();
    if (confirm) this.phase = "buy";
    return true;
  }
  sandboxSpawn(team) {
    return team ? { x: 2820, y: 2690 } : { x: 2460, y: 2490 };
  }
  baseOf(team) {
    return this.sandbox ? this.sandboxSpawn(team) : BASES[team];
  }
  makeHero(r, i, team, spawnPoint) {
    const def = HEROES.find((d) => d.id === r);
    return {
      id: i,
      team,
      role: r,
      name: def.name,
      ...spawnPoint,
      spawnPoint,
      gold: 100,
      digits: 3,
      hasteTier: 0,
      bootTier: 0,
      double: false,
      consumables: {
        ward: 0,
        veil: 0,
        stone: 0,
        shovel: 0,
        invert: 0,
        eraser: 0,
        stun1: 0,
        stun2: 0,
        stun3: 0,
        miniInk: 0,
        sharpener: 0,
        sharpener2: 0,
        lasso: 0,
      },
      courier: this.couriers[team],
      nextNormal: 0,
      lastCooldown: CONFIG.normalCooldown,
      lockedUntil: 0,
      comboUntil: 0,
      comboCount: 0,
      laneWaypoint: 1,
      phantoms: null,
      eraserAt: 0,
      rockAt: 0,
      tempoAt: 0,
      areaStunAt: 0,
      errorFocusAt: 0,
      errorFocusUntil: 0,
      heroSkillAt: 0,
      burningAt: 0,
      sudaksExposeUntil: 0,
      sudaksArmorUntil: 0,
      sudaksArmor: [],
      lassoAt: 0,
      poisonAt: 0,
      prison: null,
      followTarget: null,
      regenBoosts: [],
      stunnedUntil: 0,
      speedEffect: null,
      miniInk: null,
      lasso: null,
      eraserTool: null,
      eraserPickup: null,
      flowers: 0,
      flowerRun: false,
      preferred: {
        sudzh: 0,
        agile: 0,
        intellect: 1,
        strong: 2,
        editor: 0,
        combinator: 1,
        sudaks: 0,
      }[r],
      task: null,
      target: null,
      animationTargetId: null,
      thinkAt: 2 + i,
      shopAt: 0,
      farmAfter: 150 + i * 12,
      notes: {},
      normalCount: 0,
      cardCount: 0,
      bonusCount: 0,
      campsWon: 0,
      earned: 100,
      spent: 0,
      income: {},
      lastLane: 1,
    };
  }
  spawnTestHero(role, team) {
    if (
      !this.sandbox ||
      this.phase !== "playing" ||
      ![0, 1].includes(team) ||
      !HEROES.some((r) => r.id === role)
    )
      return false;
    this.depots[team] = [];
    this.couriers[team].cargo = [];
    this.erasers.list = this.erasers.list.filter((item) => item.team !== team);
    const hero = this.makeHero(role, team, team, this.sandboxSpawn(team));
    this.progression.initialize(hero);
    hero.gold = 9999;
    hero.digits = 99;
    this.combat.initializeHero(hero);
    this.heroes[team] = hero;
    this.vision.heroSightStates.clear();
    this.vision.refresh(true);
    this.emit("testHeroSpawn", { hero: hero.id, team, role });
    return true;
  }
  resetTestCooldowns() {
    if (!this.sandbox || this.phase !== "playing") return false;
    const fields = new Set([
      ...Object.keys(SKILLS).map((id) => id + "At"),
      "heroSkillAt",
      "errorFocusAt",
      "areaStunAt",
      "freshAt",
      "eraserAt",
      "nextNormal",
      "nextAttack",
    ]);
    for (const hero of this.actors()) {
      for (const field of fields) if (field in hero) hero[field] = this.time;
      const charges = this.fire.charges(hero);
      if (charges) {
        charges.count = FIRE.maxCharges;
        charges.nextAt = null;
      }
      if (hero.duel) {
        hero.duel.pen.set(hero.id, this.time);
      }
    }
    for (const item of this.erasers.list) {
      item.digitReadyAt = this.time;
      item.wardReadyAt = this.time;
    }
    this.wards.readyAt.fill(this.time);
    this.emit("testCooldownReset");
    return true;
  }
  controlTestTeam(team) {
    if (!this.sandbox || this.phase !== "playing" || ![0, 1].includes(team))
      return false;
    this.controlledId = team;
    this.vision.refresh(true);
    return true;
  }
  editor(team) {
    return this.heroes.find((h) => h.team === team && h.role === "editor");
  }
  puzzle(h, t) {
    return t.puzzles[h.team];
  }
  board(h, t) {
    return t.boards[h.team];
  }
  near(h, t) {
    if (t?.kind === "duel") return t.participants.includes(h);
    if (h.duetPart === "oka" && this.duet.state(h)?.mounted?.target === t?.unit)
      return true;
    if (h.freshSudoku && h.freshSudoku.targetId === t?.unit?.id) return true;
    if (t?.kind === "prison")
      return t.protective
        ? this.near(h, {
            kind: "health",
            unit: t.unit,
            x: t.unit.x,
            y: t.unit.y,
          })
        : h.prison === t;
    if (t?.kind === "ward") return dist(h, t) <= WARDS.interactRadius;
    if (
      t?.kind === "health" &&
      t.unit?.role === "sudaks" &&
      h.forcedSolve?.targetId === t.unit.id &&
      h.forcedSolve.until > this.time
    )
      return true;
    if (
      t?.kind === "health" &&
      t.unit?.kind !== "creep" &&
      this.lassoActive(h, t.unit)
    )
      return dist(h, t.unit) <= CONFIG.lassoRadius + 0.05;
    return (
      !!t &&
      dist(h, t.unit || t) <=
        CONFIG.interactRadius *
          (t.kind === "health" ? CONFIG.combatRangeMultiplier : 1) *
          (t.kind === "health" && t.unit?.kind !== "creep" ? 2 : 1) *
          (["health", "tower", "core"].includes(t.kind)
            ? CONFIG.heroAttackMultiplier
            : 1)
    );
  }
  atBase(h, radius = CONFIG.baseServiceRadius) {
    return !h.dead && dist(h, this.baseOf(h.team)) <= radius;
  }
  skill(h, id) {
    return this.progression.skill(h, id);
  }
  upgradeSkill(h, id) {
    return this.progression.upgrade(h, id);
  }
  assaultTier(t) {
    return t.step;
  }
  attackTowers(lane, team) {
    return this.lanes[lane].towers
      .filter((t) => t.defender !== team)
      .sort((a, b) => a.step - b.step);
  }
  nextTower(lane, team) {
    return this.attackTowers(lane, team).find((t) => !t.destroyed);
  }
  broken(lane, team) {
    return this.attackTowers(lane, team).filter((t) => t.destroyed).length;
  }
  laneDone(lane, team) {
    return this.broken(lane, team) === 3;
  }
  coreUnlocked(team) {
    return this.lanes.some((l) => this.laneDone(l.index, team));
  }
  coreFor(lane, team) {
    return this.cores.find((c) => c.defender !== team);
  }
  nextCore(team) {
    return this.cores.find((c) => c.defender !== team && !c.destroyed);
  }
  attackTarget(lane, team) {
    return this.nextTower(Number(lane) || 0, team) || this.nextCore(team);
  }
  nineUnlocked() {
    return (
      this.towers.some((t) => t.step === 1 && t.destroyed) ||
      this.heroes.some((h) => h.healthSize === 9)
    );
  }
  selectPage(t, index) {
    if (!t?.pages || !Number.isInteger(index) || !t.pages[index]) return false;
    bindPage(t, index);
    return true;
  }
  hints(h, t) {
    const p = this.puzzle(h, t),
      inkHint = this.inkBinding.hint(h, t);
    return p.givens
      .map((_, index) => ({
        index,
        value: inkHint?.index === index ? inkHint.value : p.hints?.[index],
      }))
      .filter(
        (e) =>
          e.value &&
          !this.runes.active(t)?.keys.includes(e.index) &&
          !this.board(h, t)[e.index] &&
          !this.blockedIndices(h, t).has(e.index),
      );
  }
  objectiveAccess(h, t) {
    if (h.duel || t?.unit?.duel || t?.kind === "duel")
      return t === h.duel && t.participants.includes(h)
        ? { ok: true }
        : { ok: false, message: "Участники дуэли изолированы" };
    if (this.abduction.carried(h))
      return { ok: false, message: "Герой похищен" };
    if (h.dead) return { ok: false, message: "Герой возрождается" };
    if (t?.kind === "prison" && t.protective)
      return this.heroEffects.protected(t.unit) && h.team !== t.unit.team
        ? { ok: true }
        : { ok: false, message: "Коробка уже снята или союзная" };
    if (t?.kind === "prison" && h.prison === t && this.heroEffects.trapped(h))
      return { ok: true };
    if (this.heroEffects.trapped(h))
      return { ok: false, message: "Сначала решите коробку" };
    if (this.sudzh.held(h) || h.stunnedUntil > this.time)
      return { ok: false, message: "Герой оглушён" };
    if (!t) return { ok: false, message: "Неизвестная цель" };
    if (h.forcedSolve?.until > this.time) {
      const compelled =
        t.kind === "health" && t.unit?.id === h.forcedSolve.targetId;
      if (!compelled)
        return {
          ok: false,
          message: "Решайте судоку Судакса, пока действует навык",
        };
    }
    const compelledTarget =
      h.forcedSolve?.until > this.time &&
      t.kind === "health" &&
      t.unit?.id === h.forcedSolve.targetId;
    if (!compelledTarget && !this.vision.visible(h.team, t))
      return { ok: false, message: "Цель вне обзора команды" };
    if (t.kind === "health") return this.combat.access(h, t);
    if (t.kind === "ward") return this.wards.access(h, t);
    if (t.kind !== "camp") {
      if (t.defender === h.team)
        return { ok: false, message: "Это союзная защита" };
      if (t.destroyed) return { ok: false, message: "Тетрадь уже завершена" };
      if (t.kind === "tower" && this.nextTower(t.lane, h.team) !== t)
        return { ok: false, message: "Сначала предыдущая башня этой линии" };
      if (t.kind === "core" && !this.coreUnlocked(h.team))
        return {
          ok: false,
          message: "База защищена: пройдите одну линию целиком",
        };
    } else {
      if (t.respawnAt > this.time)
        return { ok: false, message: "Лагерь восстанавливается" };
      if (t.owner !== null && t.owner !== h.team)
        return { ok: false, message: "Лагерь занят соперниками" };
    }
    return { ok: true };
  }
  interact(h, t) {
    if (h.freshSudoku && t?.unit?.id !== h.freshSudoku.targetId)
      this.sudzh.endFresh(h);
    if (this.phase !== "playing")
      return { ok: false, message: "Матч сейчас не идёт" };
    if (!this.near(h, t)) return { ok: false, message: "Подойдите к тетради" };
    const access = this.objectiveAccess(h, t);
    if (!access.ok) return access;
    if (t.kind === "camp" && t.owner === null) t.owner = h.team;
    if (!["camp", "health", "ward"].includes(t.kind)) h.lastLane = t.lane;
    if (t.pages && this.solved(h, t)) {
      this.complete(h, t);
      return { ok: false, message: "Лист уже собран благодаря снятой защите" };
    }
    return { ok: true };
  }
  cooldown(h, t) {
    if (h.duetPart === "oka") return 1;
    return (
      Math.max(
        0.35,
        (CONFIG.normalCooldown *
          (1 - (ITEMS.find((i) => i.tier === h.hasteTier)?.reduction || 0))) /
          (t?.kind === "camp" || t?.unit?.kind === "creep" ? 1.5 : 1),
      ) *
      (1 - (this.fire.active(h)?.pen || 0)) *
      (h.freshSudoku && h.freshSudoku.targetId === t?.unit?.id ? 0.5 : 1) *
      (1 -
        (this.heroEffects.protected(h) ? h.boxProtection.penReduction || 0 : 0))
    );
  }
  comboActive(h) {
    return h.role === "agile" && h.comboUntil > this.time;
  }
  canPen(h) {
    if (h.duel)
      return (
        this.duet.duelInputReady(h.duel) &&
        (h.duel.pen.get(h.id) || 0) <= this.time &&
        (h.duel.locks.get(h.id) || 0) <= this.time
      );
    return this.comboActive(h) || h.nextNormal <= this.time;
  }
  move(h, x, y, { ignoreTowerId = null, pursueEnemy = false } = {}) {
    h.pendingBox = null;
    h.duetReturn = null;
    if (h.duetPart === "oka") this.duet.detach(h);
    if (h.duel) return;
    if (
      h.freshSudoku &&
      !h.dead &&
      h.stunnedUntil <= this.time &&
      !this.heroEffects.trapped(h)
    )
      this.sudzh.endFresh(h);
    if (this.heroEffects.trapped(h) || h.forcedSolve?.until > this.time) return;
    if (
      h.dead ||
      h.stunnedUntil > this.time ||
      this.heroEffects.trapped(h) ||
      this.phase !== "playing" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      return;
    this.sudzh.endFresh(h);
    h.pendingFresh = null;
    h.animationTargetId = null;
    h.followTarget = null;
    h.pendingPencilCast = null;
    h.pendingAbduction = null;
    h.wardPlacement = null;
    h.eraserPickup = null;
    h.target = {
      x: clamp(x, 3, CONFIG.worldSize - 3),
      y: clamp(y, 3, CONFIG.worldSize - 3),
      ignoreTowerId,
      pursueEnemy,
    };
  }
  advanceHero(h, dt) {
    if (this.abduction.carried(h) || this.sudzh.held(h) || h.freshSudoku)
      return;
    const target = h.target;
    if (!target) return;
    const distance = dist(h, target),
      step = Math.min(distance, this.heroSpeed(h) * dt);
    if (distance <= 1e-6) {
      h.target = null;
      return;
    }
    if (!step) return;
    let vx = (target.x - h.x) / distance,
      vy = (target.y - h.y) / distance;
    const automated = h !== this.player || this.autoPlayer;
    if (automated && !target.pursueEnemy) {
      const margin = COMBAT.attackRadius + 35;
      const obstacle = this.towers
        .filter(
          (tower) =>
            !tower.destroyed &&
            tower.defender !== h.team &&
            tower.id !== target.ignoreTowerId,
        )
        .sort((a, b) => dist(h, a) - dist(h, b))
        .find((tower) => {
          const next = { x: h.x + vx * step, y: h.y + vy * step };
          return dist(h, tower) < margin || dist(next, tower) < margin;
        });
      if (obstacle) {
        const radius = dist(h, obstacle) || 1,
          rx = (h.x - obstacle.x) / radius,
          ry = (h.y - obstacle.y) / radius;
        if (radius < margin) {
          vx = rx;
          vy = ry;
        } else {
          const inward = vx * rx + vy * ry;
          if (inward < 0) {
            vx -= inward * rx;
            vy -= inward * ry;
            const length = Math.hypot(vx, vy);
            if (length > 1e-6) {
              vx /= length;
              vy /= length;
            } else {
              const side = h.id % 2 ? 1 : -1;
              vx = -ry * side;
              vy = rx * side;
            }
          }
        }
        const next = { x: h.x + vx * step, y: h.y + vy * step },
          nextRadius = dist(next, obstacle);
        if (nextRadius < margin) {
          next.x =
            obstacle.x +
            (nextRadius ? (next.x - obstacle.x) / nextRadius : rx) * margin;
          next.y =
            obstacle.y +
            (nextRadius ? (next.y - obstacle.y) / nextRadius : ry) * margin;
        }
        h.x = next.x;
        h.y = next.y;
        return;
      }
    }
    h.x += vx * step;
    h.y += vy * step;
    if (step >= distance) h.target = null;
  }
  separateHeroes() {
    const active = this.actors().filter(
        (hero) =>
          !hero.dead &&
          !hero.duel &&
          !this.duet.state(hero)?.flight &&
          !(hero.duetPart === "oka" && this.duet.state(hero)?.mounted) &&
          !this.abduction.carried(hero) &&
          !this.sudzh.held(hero),
      ),
      minimum = CONFIG.heroSeparation;
    for (let pass = 0; pass < 4; pass++)
      for (let i = 0; i < active.length; i++)
        for (let j = i + 1; j < active.length; j++) {
          const a = active[i],
            b = active[j],
            distance = dist(a, b);
          if (distance >= minimum) continue;
          const angle =
              (((Number(a.id) || this.duet.root(a).id) * 17 +
                (Number(b.id) || this.duet.root(b).id) * 31) %
                360) *
              (Math.PI / 180),
            dx = distance ? (b.x - a.x) / distance : Math.cos(angle),
            dy = distance ? (b.y - a.y) / distance : Math.sin(angle),
            overlap = minimum - distance,
            aFixed = this.heroEffects.trapped(a),
            bFixed = this.heroEffects.trapped(b);
          if (aFixed && bFixed) continue;
          const aPush = aFixed ? 0 : bFixed ? overlap : overlap / 2,
            bPush = bFixed ? 0 : aFixed ? overlap : overlap / 2;
          a.x = clamp(a.x - dx * aPush, 3, CONFIG.worldSize - 3);
          a.y = clamp(a.y - dy * aPush, 3, CONFIG.worldSize - 3);
          b.x = clamp(b.x + dx * bPush, 3, CONFIG.worldSize - 3);
          b.y = clamp(b.y + dy * bPush, 3, CONFIG.worldSize - 3);
        }
  }
  lassoActive(a, b) {
    return (
      a?.lasso?.until > this.time &&
      b?.lasso?.until > this.time &&
      a.lasso.partner === b.id &&
      b.lasso.partner === a.id
    );
  }
  bindLasso(h, target, duration = 10) {
    const until = this.time + duration;
    h.lasso = { partner: target.id, until };
    target.lasso = { partner: h.id, until };
    h.target = null;
    target.target = null;
  }
  lassoSkill(h, preferred = null) {
    if (h.duel || preferred?.duel)
      return { ok: false, message: "Цель участвует в дуэли" };
    if (
      h.forcedSolve?.until > this.time ||
      h.role !== "intellect" ||
      h.dead ||
      h.stunnedUntil > this.time ||
      this.heroEffects.trapped(h) ||
      this.phase !== "playing" ||
      h.lassoAt > this.time
    )
      return { ok: false, message: "Лассо недоступно или перезаряжается" };
    const target = this.nearestHero(h, 1 - h.team, preferred);
    if (!target) return { ok: false, message: "Подойдите к вражескому герою" };
    const params = this.skill(h, "lasso");
    if (!params) return { ok: false, message: "Откройте навык Лассо" };
    this.bindLasso(h, target, params.duration);
    h.lassoAt = this.time + params.cooldown;
    return { ok: true, target: target.hp.id };
  }
  constrainLassos(positions) {
    for (const a of this.heroes) {
      const b = this.heroes.find((h) => h.id === a.lasso?.partner);
      if (!b || a.dead || b.dead || !this.lassoActive(a, b)) {
        a.lasso = null;
        continue;
      }
      if (a.duel || b.duel || a.id > b.id) continue;
      const d = dist(a, b);
      if (d <= CONFIG.lassoRadius || d === 0) continue;
      const ux = (a.x - b.x) / d,
        uy = (a.y - b.y) / d;
      const oldA = positions.get(a.id) || a,
        oldB = positions.get(b.id) || b;
      const ma = Math.max(0, (a.x - oldA.x) * ux + (a.y - oldA.y) * uy),
        mb = Math.max(0, (oldB.x - b.x) * ux + (oldB.y - b.y) * uy);
      let weightA = ma + mb ? mb / (ma + mb) : 0.5;
      if (this.heroEffects.trapped(a)) weightA = 0;
      else if (this.heroEffects.trapped(b)) weightA = 1;
      const excess = d - CONFIG.lassoRadius;
      a.x -= ux * excess * weightA;
      a.y -= uy * excess * weightA;
      b.x += ux * excess * (1 - weightA);
      b.y += uy * excess * (1 - weightA);
      this.combat.sync(a);
      this.combat.sync(b);
    }
  }
  constrainForcedSolve(h) {
    const force = h.forcedSolve;
    if (
      h.duel ||
      !force ||
      force.until <= this.time ||
      this.heroEffects.trapped(h)
    )
      return;
    const target = this.heroes.find((hero) => hero.id === force.targetId);
    if (h.dead || !target || target.dead) return;
    const d = dist(h, target),
      radius = CONFIG.lassoRadius / 2;
    if (d <= radius || d === 0) return;
    h.x = target.x + ((h.x - target.x) / d) * radius;
    h.y = target.y + ((h.y - target.y) / d) * radius;
    h.target = null;
    this.combat.sync(h);
  }
  start() {
    if (this.phase === "select") this.phase = "buy";
    if (this.phase !== "buy") return;
    for (const h of this.heroes.filter(
      (h) => !this.sandbox && (h.id || this.autoPlayer),
    )) {
      this.progression.bot(h);
      this.buy(h, "quill1");
    }
    this.phase = "playing";
    if (!this.sandbox) this.combat.spawnWave();
    this.emit("start");
  }
  grant(h, amount, reason) {
    h.gold += amount;
    h.earned += amount;
    h.income[reason] = (h.income[reason] || 0) + amount;
  }
  pendingOrders(h) {
    h = this.duet.root(h);
    return [...this.depots[h.team], ...this.couriers[h.team].cargo].filter(
      (o) => o.recipient === h.id,
    );
  }
  inventoryItems(h) {
    return new Set([
      ...Object.keys(h.consumables).filter((id) => h.consumables[id] > 0),
      ...(h.eraserTool ? ["eraserTool"] : []),
      ...this.pendingOrders(h)
        .filter((o) => o.id in h.consumables || o.id === "eraserTool")
        .map((o) => o.id),
    ]);
  }
  inventoryAccess(h, id) {
    const items = this.inventoryItems(h);
    return items.has(id) || items.size < CONFIG.inventorySlots
      ? { ok: true }
      : { ok: false, message: "Рюкзак заполнен: четыре вида предметов" };
  }
  committedTier(h) {
    return Math.max(
      h.hasteTier,
      ...this.pendingOrders(h).map(
        (o) => ITEMS.find((i) => i.id === o.id)?.tier || 0,
      ),
    );
  }
  committedBootTier(h) {
    return Math.max(
      h.bootTier,
      ...this.pendingOrders(h).map(
        (o) => ITEMS.find((i) => i.id === o.id)?.bootTier || 0,
      ),
    );
  }
  discount(h) {
    return 0;
  }

  itemPrice(h, id, recipient = h) {
    const item = ITEMS.find((i) => i.id === id);
    if (!item) return Infinity;
    const raw = item.healthSize
      ? Math.max(
          0,
          item.price -
            (ITEMS.find(
              (i) => i.healthSize === this.combat.committedHealth(recipient),
            )?.price || 0),
        )
      : item.tier
        ? Math.max(
            0,
            item.price -
              (ITEMS.find((i) => i.tier === this.committedTier(recipient))
                ?.price || 0),
          )
        : item.bootTier
          ? Math.max(
              0,
              item.price -
                (ITEMS.find(
                  (i) => i.bootTier === this.committedBootTier(recipient),
                )?.price || 0),
            )
          : item.price;
    return Math.ceil(raw * (1 - this.discount(h)));
  }
  itemStock(h, item) {
    if (!item.stockLimit) return null;
    h.itemStocks ||= {};
    const stock = (h.itemStocks[item.id] ||= {
      available: item.stockLimit,
      nextAt: null,
    });
    while (stock.nextAt !== null && this.time >= stock.nextAt) {
      stock.available++;
      stock.nextAt =
        stock.available >= item.stockLimit ? null : stock.nextAt + item.restock;
    }
    return stock;
  }
  buy(h, product, recipient = h) {
    h = this.duet.root(h);
    recipient = this.duet.root(recipient);
    if (h.duel)
      return { ok: false, message: "Покупки недоступны во время дуэли" };
    if (!h.dead && h.forcedSolve?.until > this.time)
      return {
        ok: false,
        message: "Навык Судакса заставляет решать его судоку",
      };
    if (!["buy", "playing"].includes(this.phase))
      return { ok: false, message: "Покупки сейчас недоступны" };
    if (
      !this.heroes.includes(recipient) ||
      recipient.team !== h.team ||
      (recipient !== h && h.role !== "editor")
    )
      return { ok: false, message: "Только Правщик покупает для союзника" };
    if (product === "armor") return this.combat.buyArmor(h);
    const item = ITEMS.find((i) => i.id === product),
      orders = this.pendingOrders(recipient);
    if (!item)
      return { ok: false, message: "Цифры накапливаются лично и не продаются" };
    if (item.id in recipient.consumables || item.id === "eraserTool") {
      const space = this.inventoryAccess(recipient, item.id);
      if (!space.ok) return space;
    }
    if (item.id === "eraserTool" && this.erasers.owns(h.team))
      return {
        ok: false,
        message: "У команды уже есть Ластик: у героя, в доставке или на земле",
      };
    if (
      item?.healthSize &&
      item.healthSize <= this.combat.committedHealth(recipient)
    )
      return { ok: false, message: "Переплёт уже есть или заказан" };
    if (item?.tier && item.tier <= this.committedTier(recipient))
      return { ok: false, message: "Перо уже есть или заказано" };
    if (item?.bootTier && item.bootTier <= this.committedBootTier(recipient))
      return { ok: false, message: "Эти сапоги уже есть или заказаны" };
    if (
      item?.id === "double" &&
      (recipient.double || orders.some((o) => o.id === "double"))
    )
      return { ok: false, message: "Росчерк уже есть или заказан" };
    if (
      item.id === "misfire" &&
      (recipient.misfire || orders.some((o) => o.id === "misfire"))
    )
      return { ok: false, message: "Осечка уже есть или заказана" };
    const price = this.itemPrice(h, item.id, recipient);
    if (h.gold < price) return { ok: false, message: "Недостаточно монет" };
    if (item.id === "stone" && this.stoneReadyAt[h.team] > this.time)
      return {
        ok: false,
        message: `Камень восстановится через ${Math.ceil(this.stoneReadyAt[h.team] - this.time)} с`,
      };
    if (item.id === "ward" && !this.wards.reserve(h.team))
      return {
        ok: false,
        message: `Общий запас вардов восстановится через ${Math.ceil(this.wards.stock(h.team).remaining)} с`,
      };
    if (item.id === "stone")
      this.stoneReadyAt[h.team] = this.time + CONFIG.stoneRestock;
    const stock = this.itemStock(recipient, item);
    if (stock && !stock.available)
      return { ok: false, message: "Личный запас предмета восстанавливается" };
    if (stock) {
      stock.available--;
      stock.nextAt ??= this.time + item.restock;
    }
    h.gold -= price;
    h.spent += price;
    const batch = [
      { recipient: recipient.id, price, type: "item", id: item.id },
    ];
    if (item.id === "eraserTool")
      batch[0].eraserId = this.erasers.reserve(h.team).id;
    if (this.atBase(recipient)) {
      for (const order of batch) this.deliver(recipient, order);
      return { ok: true, instant: true };
    }
    this.depots[h.team].push(...batch);
    this.emit("ordered", { hero: h.id, recipient: recipient.id, product });
    return {
      ok: true,
      instant: false,
      carrier: "Самолётик",
    };
  }
  deliver(h, o) {
    if (o.type !== "item") return;
    if (h.dead) {
      this.depots[h.team].push(o);
      return;
    }
    const item = ITEMS.find((i) => i.id === o.id);
    if (item.id === "eraserTool") this.erasers.deliver(h, o.eraserId);
    else if (item.healthSize) this.combat.upgradeHealth(h, item.healthSize);
    else if (item.tier) h.hasteTier = Math.max(h.hasteTier, item.tier);
    else if (item.bootTier) h.bootTier = Math.max(h.bootTier, item.bootTier);
    else if (item.id === "double") h.double = true;
    else if (item.id === "misfire") h.misfire = true;
    else h.consumables[item.id]++;
    this.emit("itemReceived", { hero: h.id, item: item.id });
  }
  courierSpeed(c) {
    return CONFIG.courierSpeed;
  }
  heroSpeed(h) {
    if (this.heroEffects.trapped(h) || this.sudzh.held(h) || h.freshSudoku)
      return 0;
    if (h.stunnedUntil > this.time) return 0;
    const boots = ITEMS.find((i) => i.bootTier === h.bootTier)?.speedBonus || 0,
      flower =
        h.role === "editor"
          ? CONFIG.flowerSpeedBonus * Math.min(5, h.flowers)
          : 0,
      tempo = h.speedEffect?.until > this.time ? h.speedEffect.multiplier : 1,
      attackSlow = this.combat.attackSlow(h);
    return (
      CONFIG.moveSpeed *
      (1 + boots + flower) *
      tempo *
      (1 - attackSlow) *
      (1 - this.heroEffects.acidSlow(h)) *
      (1 + (this.fire.active(h)?.speed || 0)) *
      (1 + (h.abduction?.speed || 0))
    );
  }
  editorSkillCooldown(h, base) {
    return base * (1 - CONFIG.flowerSkillBonus * Math.min(5, h.flowers));
  }
  courierTarget(c) {
    if (c.state === "delivering")
      return (
        this.heroes.find((h) => h.id === c.recipient && !h.dead) ||
        this.baseOf(c.team)
      );
    return this.baseOf(c.team);
  }
  courierETA(h) {
    return (
      dist(h.courier, this.courierTarget(h.courier)) /
      this.courierSpeed(h.courier)
    );
  }
  requestFlower(h) {
    if (!this.heroes.includes(h) || h.dead || this.heroEffects.trapped(h))
      return { ok: false, message: "Цветок сейчас недоступен" };
    if (!this.flower?.active || this.phase !== "playing")
      return {
        ok: false,
        message:
          "Следующий цветок на отметке " +
          Math.ceil(this.nextFlower / 60) +
          " мин",
      };
    h.flowerRun = true;
    return { ok: true };
  }
  claimFlower(h) {
    if (
      h.dead ||
      !this.heroes.includes(h) ||
      this.heroEffects.trapped(h) ||
      !this.flower?.active ||
      dist(h, this.flower) > CONFIG.courierReach
    )
      return false;
    this.flower.active = false;
    this.flower.winner = h.team;
    h.flowers++;
    h.flowerRun = false;
    h.target = null;
    this.grant(h, CONFIG.flowerGold, "flower");
    if (h.healthSize < 9)
      this.combat.upgradeHealth(h, h.healthSize < 6 ? 6 : 9);
    this.emit("flower", { team: h.team, hero: h.id, stacks: h.flowers });
    return true;
  }
  editorFlower(h) {
    if (!h.flowerRun) return false;
    if (!this.flower?.active) {
      h.flowerRun = false;
      return false;
    }
    if (dist(h, this.flower) <= CONFIG.courierReach) this.claimFlower(h);
    else this.move(h, this.flower.x, this.flower.y);
    return true;
  }
  requestShovel(h, t, index) {
    return this.fieldItem(h, "shovel", t, index);
  }
  fieldItem(h, id, t, index) {
    const access = this.erasers.actorAccess(h);
    if (!access.ok) return access;
    if (!h.consumables[id])
      return { ok: false, message: "Предмета нет в рюкзаке" };
    if (
      !t ||
      t.kind !== "tower" ||
      t.destroyed ||
      dist(h, t) > CONFIG.editorRange ||
      !Number.isInteger(index)
    )
      return {
        ok: false,
        message: "Выберите клетку живой башни в радиусе 350",
      };
    const team = id === "stone" ? 1 - h.team : h.team,
      b = t.boards[team];
    if (index < 0 || index >= b.length || t.completed[team])
      return { ok: false, message: "Лист уже завершён или клетка недоступна" };
    if (id === "stone") {
      if (
        t.defender !== h.team ||
        b[index] ||
        t.stones[team][index] ||
        t.holes[team].includes(index)
      )
        return {
          ok: false,
          message: "Для камня нужна пустая клетка союзной башни",
        };
      t.stones[team][index] = { by: h.id, at: this.time };
    } else {
      if (t.defender === h.team || !t.stones[team][index])
        return {
          ok: false,
          message: "Выберите камень на своей атакующей странице",
        };
      delete t.stones[team][index];
    }
    h.consumables[id]--;
    return { ok: true };
  }
  tickCourier(c, dt) {
    const base = this.baseOf(c.team);
    if (dist(c, base) <= CONFIG.courierReach && this.depots[c.team].length)
      c.cargo.push(...this.depots[c.team].splice(0));
    const order = c.cargo.find((o) =>
      this.heroes.some((h) => h.id === o.recipient && !h.dead),
    );
    c.recipient = order?.recipient;
    c.state = order
      ? "delivering"
      : dist(c, base) > CONFIG.courierReach
        ? "returning"
        : "idle";
    if (c.state === "idle") return;
    const target = this.courierTarget(c),
      d = dist(c, target),
      step = this.courierSpeed(c) * dt;
    if (d > step + CONFIG.courierReach) {
      c.x += ((target.x - c.x) / d) * step;
      c.y += ((target.y - c.y) / d) * step;
      return;
    }
    c.x = target.x;
    c.y = target.y;
    if (order && !target.dead) {
      const batch = c.cargo.filter((o) => o.recipient === target.id);
      c.cargo = c.cargo.filter((o) => o.recipient !== target.id);
      for (const o of batch) this.deliver(target, o);
      target.requests = target.requests.filter((r) => r.type !== "delivery");
      this.emit("courierDelivery", { hero: target.id, count: batch.length });
    }
  }
  maskedIndices(t, team) {
    const e = t.effects[team];
    return e && e.until > this.time ? e.indices : [];
  }
  inverted(t, team) {
    return t.invertedUntil[team] > this.time;
  }
  displayDigit(t, team, value) {
    return value > 0 && this.inverted(t, team)
      ? t.puzzles[team].rules.size + 1 - value
      : value;
  }
  view(h, t) {
    const personalMask = this.personalMask(h, t);
    return this.board(h, t).map((v, i) =>
      !this.duet.owns(t, i) ||
      t.holes[h.team].includes(i) ||
      this.maskedIndices(t, h.team).includes(i) ||
      personalMask.includes(i) ||
      !this.dust.readable(h, t, i)
        ? 0
        : this.displayDigit(t, h.team, v),
    );
  }
  visibleBoard(h, t) {
    return this.view(h, t);
  }
  blockedIndices(h, t) {
    return new Set([
      ...this.board(h, t)
        .map((_, i) =>
          !this.duet.owns(t, i) || this.duet.reserved(t, i) ? i : -1,
        )
        .filter((i) => i >= 0),
      ...this.inkBinding.blocked(h, t),
      ...t.holes[h.team],
      ...this.maskedIndices(t, h.team),
      ...this.personalMask(h, t),
      ...Object.keys(t.stones[h.team]).map(Number),
      ...Object.entries(t.errors[h.team])
        .filter(([, e]) => e.until > this.time)
        .map(([i]) => Number(i)),
    ]);
  }
  personalMask(h, t) {
    if (!h.miniInk || h.miniInk.until <= this.time) return [];
    const filled = this.board(h, t)
      .map((v, i) => (v ? i : -1))
      .filter((i) => i >= 0);
    if (!filled.length) return [];
    const offset = h.miniInk.seed % filled.length;
    return [...filled.slice(offset), ...filled.slice(0, offset)].slice(0, 4);
  }
  enemyTargets(h, lane = h.lastLane) {
    const enemy = 1 - h.team;
    return this.attackTowers(lane, enemy).filter(
      (t) => !t.completed[enemy] && this.vision.visible(h.team, t),
    );
  }
  nearestHero(h, team, preferred = null) {
    if (
      preferred?.kind !== "creep" &&
      preferred?.team === team &&
      !preferred.dead &&
      !preferred.duel &&
      this.vision.visible(h.team, preferred) &&
      dist(h, preferred) <= CONFIG.effectRadius
    )
      return preferred;
    return this.actors()
      .filter(
        (target) =>
          !target.dead &&
          !target.duel &&
          target.team === team &&
          target !== h &&
          this.vision.visible(h.team, target) &&
          dist(h, target) <= CONFIG.effectRadius,
      )
      .sort((a, b) => dist(h, a) - dist(h, b))[0];
  }
  useItem(h, id, preferred = null) {
    if (id === "eraserTool") return this.erasers.use(h, preferred);
    if (
      h.dead ||
      h.stunnedUntil > this.time ||
      h.forcedSolve?.until > this.time ||
      this.heroEffects.trapped(h) ||
      this.phase !== "playing" ||
      !h.consumables[id]
    )
      return {
        ok: false,
        message: "Предмет ещё не доставлен или уже использован",
      };
    const item = ITEMS.find((candidate) => candidate.id === id);
    if (h.duel) return { ok: false, message: "Предметы недоступны в дуэли" };
    if (id === "ward") return this.wards.place(h, preferred || undefined);
    if (id === "miniInk" || id === "veil") {
      const target = id === "miniInk" ? h : preferred || h;
      const t = target.hp || target;
      if (
        target.dead ||
        target.duel ||
        (target.team ?? t.defender) !== h.team ||
        !(
          this.actors().includes(target) ||
          (id === "veil" && this.towers.includes(t))
        ) ||
        dist(h, target) > (id === "veil" ? 1200 : 0)
      )
        return {
          ok: false,
          message: "Выберите себя, союзника или союзную башню в радиусе 1200",
        };
      const team = 1 - h.team;
      if (t.completed[team] || this.maskedIndices(t, team).length)
        return {
          ok: false,
          message: "Поле уже закрыто чернилами или завершено",
        };
      const indices = shuffle(
        t.boards[team].map((_, i) => i),
        this.random,
      ).slice(0, id === "miniInk" ? 5 : CONFIG.veilCount);
      t.effects[team] = {
        until: this.time + (id === "miniInk" ? 9 : CONFIG.veilDuration),
        indices,
      };
      h.consumables[id]--;
      return { ok: true, target: t.id, count: indices.length };
    }
    if (item?.regenFactor) {
      h.itemHealing ||= [];
      h.itemHealing.push({
        id,
        until: this.time + item.regenDuration,
        nextAt: this.time + item.healInterval,
        interval: item.healInterval,
        cancelOnHeroDamage: !!item.cancelOnHeroDamage,
      });
      h.consumables[id]--;
      return { ok: true, target: h.hp.id };
    }
    if (item?.stunDuration || item?.inkDuration || item?.lassoDuration) {
      const target = this.nearestHero(h, 1 - h.team, preferred);
      if (!target)
        return {
          ok: false,
          message: "Подойдите ближе к вражескому герою; предмет сохранён",
        };
      if (item.stunDuration) {
        target.stunnedUntil = Math.max(
          target.stunnedUntil,
          this.time + item.stunDuration,
        );
        target.target = null;
      } else if (item.inkDuration) {
        target.miniInk = {
          until: this.time + item.inkDuration,
          seed: Math.floor(this.random() * 10000),
        };
      } else {
        this.bindLasso(h, target, item.lassoDuration);
      }
      h.consumables[id]--;
      this.emit("heroItem", { hero: h.id, target: target.id, item: id });
      return { ok: true, target: target.hp.id, heroTarget: target.id };
    }
    const team = 1 - h.team;
    let options = this.enemyTargets(h).filter(
      (t) => id !== "veil" || !this.maskedIndices(t, team).length,
    );
    if (id === "eraser")
      options = options.filter((t) =>
        t.boards[team].some((v, i) => v > 0 && !t.puzzles[team].givens[i]),
      );
    if (id === "invert")
      options = options.filter((t) => !this.inverted(t, team));
    if (!options.length)
      return {
        ok: false,
        message:
          "На этой линии нет подходящей вражеской тетради; предмет сохранён",
      };
    const t = options[Math.floor(this.random() * options.length)];
    let count = 0;
    if (id === "invert") {
      t.invertedUntil[team] = this.time + CONFIG.invertDuration;
      count = t.puzzles[team].rules.size;
    } else {
      const indices = shuffle(
        t.boards[team]
          .map((v, i) =>
            v > 0 && (id === "veil" || !t.puzzles[team].givens[i]) ? i : -1,
          )
          .filter((i) => i >= 0),
        this.random,
      ).slice(0, id === "veil" ? CONFIG.veilCount : 6);
      if (!indices.length) return { ok: false, message: "Нет подходящих цифр" };
      count = indices.length;
      if (id === "veil") t.effects[team] = { until: this.time + 35, indices };
      else for (const i of indices) t.boards[team][i] = 0;
    }
    h.consumables[id]--;
    this.emit("sabotage", { hero: h.id, team, target: t.id, item: id, count });
    return { ok: true, count, target: t.id };
  }
  healthTier(h) {
    return h.healthSize >= 9 ? 2 : h.healthSize >= 6 ? 1 : 0;
  }
  boostRegen(h, factor, duration) {
    h.regenBoosts.push({ factor, until: this.time + duration });
    this.combat.updateRegenInterval(h);
  }
  heroSkill(h, preferred = null) {
    if (h.duel || preferred?.duel)
      return { ok: false, message: "Цель участвует в дуэли" };
    if (h.forcedSolve?.until > this.time)
      return {
        ok: false,
        message: "Навык Судакса заставляет решать его судоку",
      };
    if (this.heroEffects.trapped(h))
      return { ok: false, message: "Сначала решите коробку" };
    if (h.role === "combinator") return this.heroEffects.box(h, preferred);
    if (h.role === "sudaks") return this.heroEffects.sudaks(h);
    if (h.role === "strong") return this.areaStun(h);
    if (
      h.dead ||
      h.stunnedUntil > this.time ||
      this.heroEffects.trapped(h) ||
      this.phase !== "playing" ||
      !["agile", "intellect"].includes(h.role)
    )
      return { ok: false, message: "Навык недоступен" };
    if (h.heroSkillAt > this.time)
      return { ok: false, message: "Навык перезаряжается" };
    const params = this.skill(h, h.role === "intellect" ? "heal" : "slow");
    if (!params) return { ok: false, message: "Навык ещё закрыт" };
    if (h.role === "intellect")
      this.boostRegen(h, params.factor, params.duration);
    else {
      const targets = this.actors().filter(
        (target) =>
          !target.dead &&
          !target.duel &&
          target.team !== h.team &&
          dist(h, target) <= CONFIG.effectRadius &&
          this.vision.visible(h.team, target),
      );
      if (!targets.length)
        return { ok: false, message: "В радиусе нет вражеских героев" };
      for (const target of targets)
        target.speedEffect = {
          until: this.time + params.duration,
          multiplier: 1 - params.strength,
          by: h.id,
        };
    }
    h.heroSkillAt = this.time + params.cooldown;
    return { ok: true };
  }
  errorFocusSkill(h) {
    if (
      h.forcedSolve?.until > this.time ||
      h.role !== "strong" ||
      h.dead ||
      h.stunnedUntil > this.time ||
      this.phase !== "playing"
    )
      return { ok: false, message: "Неточная рука сейчас недоступна" };
    if (h.errorFocusAt > this.time)
      return { ok: false, message: "Неточная рука перезаряжается" };
    const params = this.skill(h, "focus");
    if (!params) return { ok: false, message: "Откройте Неточную руку" };
    h.errorFocusUntil = this.time + params.duration;
    h.errorFocusAt = this.time + params.cooldown;
    return { ok: true, duration: params.duration };
  }
  burningSkill(h, preferred = null) {
    if (h.forcedSolve?.until > this.time)
      return {
        ok: false,
        message: "Решайте судоку Судакса, пока действует навык",
      };
    return this.heroEffects.burning(h, preferred);
  }
  areaStun(h) {
    if (h.duel) return { ok: false, message: "Цель участвует в дуэли" };
    if (
      h.forcedSolve?.until > this.time ||
      h.role !== "strong" ||
      h.dead ||
      h.stunnedUntil > this.time ||
      this.heroEffects.trapped(h) ||
      this.phase !== "playing"
    )
      return { ok: false, message: "Навык доступен живому Дыроколу" };
    if (h.areaStunAt > this.time)
      return { ok: false, message: "Удар перезаряжается" };
    const params = this.skill(h, "stun");
    if (!params) return { ok: false, message: "Откройте навык Оглушение" };
    const targets = this.combat
      .units()
      .filter(
        (u) =>
          u.team !== h.team &&
          this.vision.visible(h.team, u) &&
          dist(h, u) <= CONFIG.effectRadius,
      );
    if (!targets.length) return { ok: false, message: "В радиусе нет врагов" };
    h.pendingAreaStun = {
      at: this.time + 0.3,
      duration: params.duration,
      targets,
    };
    h.areaStunAt = this.time + params.cooldown;
    this.emit("areaStun", { hero: h.id });
    return { ok: true, count: targets.length };
  }
  botError(h, t, move) {
    if (this.random() < (h.team === 1 ? 0.07 : h.role === "strong" ? 0.08 : 0))
      move.value =
        (move.value %
          (this.puzzle(h, t).rules.digitMax || this.puzzle(h, t).rules.size)) +
        1;
  }
  editorTempo(h, mode, preferred = null) {
    if (h.duel || preferred?.duel)
      return { ok: false, message: "Цель участвует в дуэли" };
    if (h.forcedSolve?.until > this.time)
      return {
        ok: false,
        message: "Решайте судоку Судакса, пока действует навык",
      };
    if (
      h.dead ||
      h.stunnedUntil > this.time ||
      this.heroEffects.trapped(h) ||
      h.role !== "editor" ||
      this.phase !== "playing"
    )
      return { ok: false, message: "Ускорение доступно только Правщику" };
    if (this.time < h.tempoAt)
      return { ok: false, message: "Правка темпа перезаряжается" };
    const params = this.skill(h, "tempo");
    if (!params) return { ok: false, message: "Откройте навык Темп" };
    const duration = params.duration,
      team = mode === "slow" ? 1 - h.team : h.team,
      target = this.nearestHero(h, team, preferred);
    if (!target) return { ok: false, message: "Рядом нет подходящего героя" };
    target.speedEffect = {
      until: this.time + duration,
      multiplier: mode === "slow" ? 1 - params.strength : 1 + params.strength,
      by: h.id,
    };
    h.tempoAt = this.time + this.editorSkillCooldown(h, params.cooldown);
    this.emit("editorTempo", { hero: h.id, target: target.id, mode, duration });
    return { ok: true, target: target.hp.id, duration };
  }
  canSpy(h, t) {
    return (
      !!t &&
      !h.duel &&
      !t.unit?.duel &&
      ((t.kind === "health" &&
        this.actors().includes(t.unit) &&
        t.unit.team === h.team) ||
        (t.kind === "tower" && t.defender === h.team))
    );
  }
  inspectionTarget(t, index = 0) {
    const page = t.pages?.[index] || t;
    return { ...t, ...page, pages: t.pages, activePage: index, rootTarget: t };
  }
  editorAction(h, action, t, index) {
    const access = this.erasers.actorAccess(h);
    if (!access.ok) return access;
    if (
      action !== "erase" ||
      h.role !== "editor" ||
      !this.skill(h, "erase") ||
      !this.canSpy(h, t)
    )
      return {
        ok: false,
        message: "Ластик доступен только Правщику на союзном поле",
      };
    if (
      t.unit?.dead ||
      t.destroyed ||
      dist(h, t.unit || t) > CONFIG.editorRange
    )
      return { ok: false, message: "Подойдите к живому союзнику или башне" };
    if (h.eraserAt > this.time)
      return { ok: false, message: "Ластик перезаряжается" };
    const team = 1 - h.team,
      b = t.boards[team],
      p = t.puzzles[team];
    if (
      !Number.isInteger(index) ||
      !b[index] ||
      p.givens[index] ||
      t.completed[team]
    )
      return {
        ok: false,
        message: "Выберите вписанную цифру незавершённого листа",
      };
    this.erasers.eraseEntry(t, team, index);
    h.eraserAt =
      this.time + this.editorSkillCooldown(h, this.skill(h, "erase").cooldown);
    return { ok: true };
  }
  editorSupport(h) {
    if (h.role !== "editor") return;
    const targets = [
      ...this.heroes
        .filter((u) => u.team === h.team && !u.dead)
        .map((u) => u.hp),
      ...this.towers.filter((t) => t.defender === h.team && !t.destroyed),
    ];
    for (const root of targets) {
      if (dist(h, root.unit || root) > CONFIG.editorRange) continue;
      for (let page = 0; page < (root.pages?.length || 1); page++) {
        const t = this.inspectionTarget(root, page),
          team = 1 - h.team;
        const i = t.boards[team].findIndex(
          (v, i) => v && !t.puzzles[team].givens[i],
        );
        if (i >= 0) {
          this.editorAction(h, "erase", t, i);
          if (root.unit) this.inkBinding.cast(h, root.unit);
        }
      }
    }
  }
  phantoms(h, t) {
    const params = this.skill(h, "phantoms");
    if (!params || this.random() >= params.chance) return;
    const p = this.puzzle(h, t),
      free = shuffle(
        this.board(h, t)
          .map((v, i) =>
            !v && !p.hints?.[i] && !this.blockedIndices(h, t).has(i) ? i : -1,
          )
          .filter((i) => i >= 0),
        this.random,
      ),
      n = p.rules.size === 4 ? 2 : 3,
      indices = free.slice(0, n);
    if (!indices.length) {
      h.phantoms = null;
      return;
    }
    const correct = Math.floor(this.random() * indices.length);
    h.phantoms = {
      target: t.id,
      page: t.activePage || 0,
      at: this.time,
      until: this.time + params.duration,
      entries: indices.map((index, j) => ({
        index,
        value:
          j === correct
            ? p.solution[index]
            : (p.solution[index] % p.rules.size) + 1,
      })),
    };
  }
  breakPencil(h, target) {
    const params = this.skill(h, "breakPencil");
    if (
      h.role !== "strong" ||
      !params ||
      h.dead ||
      h.stunnedUntil > this.time ||
      this.heroEffects.trapped(h) ||
      h.forcedSolve?.until > this.time
    )
      return { ok: false, message: "Навык недоступен" };
    if (h.breakPencilAt > this.time)
      return { ok: false, message: "Карандаш ещё восстанавливается" };
    if (
      !this.heroes.includes(target) ||
      target.dead ||
      target.duel ||
      target.team === h.team ||
      !this.vision.visible(h.team, target)
    )
      return { ok: false, message: "Выберите обнаруженного вражеского героя" };
    if (target.pencilBrokenUntil > this.time)
      return { ok: false, message: "Карандаш цели уже сломан" };
    if (dist(h, target) > CONFIG.effectRadius) {
      this.move(h, target.x, target.y, { pursueEnemy: true });
      h.pendingPencilCast = { targetId: target.id };
      return { ok: true, queued: true };
    }
    target.pencilBrokenAt = this.time;
    target.pencilBrokenUntil = this.time + params.duration;
    h.breakPencilAt = this.time + params.cooldown;
    this.emit("breakPencil", { hero: h.id, target: target.id });
    return { ok: true };
  }
  updatePencilCast(h) {
    const pending = h.pendingPencilCast;
    if (!pending) return;
    const target = this.heroes.find((u) => u.id === pending.targetId);
    if (
      h.dead ||
      !target ||
      target.dead ||
      target.duel ||
      target.pencilBrokenUntil > this.time ||
      h.breakPencilAt > this.time
    ) {
      h.pendingPencilCast = null;
      h.target = null;
      return;
    }
    if (this.vision.visible(h.team, target)) {
      if (dist(h, target) <= CONFIG.effectRadius) {
        const result = this.breakPencil(h, target);
        if (result.ok) {
          h.pendingPencilCast = null;
          h.target = null;
        }
      } else if (h.target) {
        h.target.x = target.x;
        h.target.y = target.y;
      }
    } else if (!h.target) h.pendingPencilCast = null;
  }
  place(h, t, index, displayValue, mode = "auto") {
    if (t?.kind === "duel")
      return this.duet.duelPlace(h, t, index, displayValue, mode);
    if (this.abduction.carried(h))
      return { ok: false, message: "Герой похищен" };
    if (h.pencilBrokenUntil > this.time && mode !== "note")
      return {
        ok: false,
        message:
          "Карандаш сломан: " +
          Math.ceil(h.pencilBrokenUntil - this.time) +
          " с",
      };
    if (t?.kind === "health" && this.heroEffects.protected(t.unit))
      t = t.unit.boxProtection;
    const freeBoxPen = t?.kind === "prison" && !t.protective;
    if (!this.duet.owns(t, index) || this.duet.reserved(t, index))
      return { ok: false, message: "Клетка недоступна" };
    const previousNormal = h.nextNormal;
    const compelledSudaks =
      h.forcedSolve?.until > this.time &&
      t?.kind === "health" &&
      t.unit?.id === h.forcedSolve.targetId;
    if (h.stunnedUntil > this.time)
      return { ok: false, message: "Герой оглушён" };
    const access = this.interact(h, t);
    if (!access.ok) return access;
    if (t.kind === "health") this.combat.engage(h, t);
    if (t.kind === "ward") this.wards.regenerate(t);
    const b = this.board(h, t),
      p = this.puzzle(h, t);
    if (!Number.isInteger(index) || index < 0 || index >= b.length)
      return { ok: false, message: "Выберите клетку" };
    if (t.errors[h.team][index]?.until > this.time)
      return {
        ok: false,
        message: "Эту ошибку ещё видно союзникам: подождите 2 с",
      };
    if (t.stones[h.team][index])
      return { ok: false, message: "Камень: отправьте самолётик с лопатой" };
    if (
      (b[index] && !t.poison[h.team][index] && !t.burning?.[h.team]?.[index]) ||
      t.holes[h.team].includes(index) ||
      this.maskedIndices(t, h.team).includes(index) ||
      this.personalMask(h, t).includes(index)
    )
      return { ok: false, message: "Нужна доступная пустая клетка" };
    if (this.inkBinding.blocked(h, t).includes(index))
      return { ok: false, message: "Клетка закрыта Чернильным переплётом" };
    const rune = this.runes.active(t);
    if (rune && rune.team === h.team && rune.z === index && mode !== "note")
      return {
        ok: false,
        message: "Клетка Z запечатана: заполните все ключи руны",
      };
    if (mode === "universal") {
      if (!h.digits) return { ok: false, message: "Нет универсальных цифр" };
      displayValue = this.displayDigit(t, h.team, p.solution[index]);
    }
    if (
      !Number.isInteger(displayValue) ||
      displayValue < 1 ||
      displayValue > (p.rules.digitMax || p.rules.size)
    )
      return { ok: false, message: "Цифра вне диапазона поля" };
    let value = this.displayDigit(t, h.team, displayValue);
    const usesCard = mode === "universal";
    if (mode === "note") {
      const key = (t.rootId || t.id) + ":" + (t.activePage || 0) + ":" + index,
        a = h.notes[key] || [];
      h.notes[key] = a.includes(value)
        ? a.filter((v) => v !== value)
        : [...a, value];
      return { ok: true, note: true };
    }
    if (this.time < h.lockedUntil)
      return { ok: false, message: "Перо заблокировано ошибкой на 2 с" };
    if (!usesCard && !freeBoxPen && !this.canPen(h))
      return {
        ok: false,
        message: "Перо перезаряжается; Пробел использует универсальную цифру",
      };
    const caustic =
      t.unit?.role === "combinator" ? this.skill(t.unit, "caustic") : null;
    const hostileEntry =
      p.solution[index] === value &&
      t.kind === "health" &&
      t.unit &&
      t.unit.team !== h.team;
    const passiveEvaded =
      hostileEntry &&
      caustic &&
      this.time >= (t.unit.causticAt || 0) &&
      this.random() < caustic.chance;
    if (passiveEvaded) t.unit.causticAt = this.time + caustic.cooldown;
    const evaded =
      passiveEvaded ||
      (hostileEntry &&
        t.unit.misfire &&
        this.random() < ITEMS.find((item) => item.id === "misfire").evasion);
    const attempted = value;
    if (evaded) value = (value % p.rules.size) + 1;
    if (p.solution[index] !== value) {
      const errorLock =
        h.role === "strong" && h.errorFocusUntil > this.time
          ? CONFIG.errorLock / 2
          : CONFIG.errorLock;
      h.lockedUntil = this.time + errorLock;
      t.errors[h.team][index] = {
        value,
        attempted: evaded ? attempted : undefined,
        misfire: !!evaded,
        caustic: !!passiveEvaded,
        at: this.time,
        until: this.time + errorLock,
      };
      if (h.role === "agile") {
        h.comboUntil = 0;
        h.comboCount = 0;
        h.nextNormal = Math.max(h.nextNormal, this.time + this.cooldown(h, t));
      }
      let hole = -1;
      if (
        t.kind !== "ward" &&
        this.skill(h, "hole") &&
        this.random() < this.skill(h, "hole").chance
      ) {
        const free = b
          .map((v, i) =>
            !v && i !== index && !this.blockedIndices(h, t).has(i) ? i : -1,
          )
          .filter((i) => i >= 0);
        if (free.length) {
          hole = free[Math.floor(this.random() * free.length)];
          if (this.combat.hit(h, t, hole, -1)) t.holes[h.team].push(hole);
          this.emit("hole", { hero: h.id, target: t.id, index: hole });
        }
      }
      this.emit("error", { hero: h.id, target: t.id, index, value });
      if (hole >= 0) this.complete(h, t);
      return {
        ok: false,
        error: true,
        hole,
        message:
          hole >= 0
            ? "Ошибка! Дырокол пробил другую клетку."
            : `Ошибка: красная цифра исчезнет через ${errorLock} с. Ресурсы сохранены.`,
      };
    }
    this.combat.hit(h, t, index, value, usesCard);
    if (t.kind === "ward") this.wards.recordEntry(t, index);
    delete h.notes[
      (t.rootId || t.id) + ":" + (t.activePage || 0) + ":" + index
    ];
    if (usesCard) {
      this.progression.spend(h, 1, "moves");
      h.cardCount++;
    } else {
      h.lastCooldown = this.cooldown(h, t);
      h.nextNormal = this.time + h.lastCooldown;
      if (!["ward", "prison"].includes(t.kind)) this.grant(h, 3, "normal");
      h.normalCount++;
      if (this.skill(h, "combo")) {
        h.comboCount = this.comboActive(h) ? h.comboCount + 1 : 0;
        const params = this.skill(h, "combo");
        const window = Math.max(
          params.minimum,
          params.window - h.comboCount * params.reduction,
        );
        h.comboWindow = window;
        const finished = h.comboCount + 1 >= params.limit;
        h.comboUntil = finished ? 0 : this.time + window;
        h.nextNormal = finished
          ? this.time + h.lastCooldown
          : h.comboUntil + h.lastCooldown;
      }
    }
    this.emit("placed", {
      hero: h.id,
      target: t.id,
      index,
      value,
      mode: usesCard ? "card" : "normal",
    });
    if (!usesCard && h.double && this.random() < 0.18) {
      const bonus = this.botMove(h, t);
      if (bonus) {
        const actual = this.displayDigit(t, h.team, bonus.value);
        if (this.combat.hit(h, t, bonus.index, actual)) {
          if (t.kind === "ward") this.wards.recordEntry(t, bonus.index);
          t.doubleStroke[h.team][bonus.index] = this.time;
          h.bonusCount++;
          this.emit("bonus", { hero: h.id, target: t.id, index: bonus.index });
        }
      }
    }
    if (!usesCard && t.kind !== "ward") {
      if (h.role === "intellect") this.phantoms(h, t);
      this.heroEffects.schedule(h, t);
    }
    this.complete(h, t);
    if (freeBoxPen) h.nextNormal = previousNormal;
    return { ok: true, card: usesCard };
  }
  solved(h, t) {
    return this.board(h, t).every(
      (v, i) =>
        !this.duet.owns(t, i) ||
        t.holes[h.team].includes(i) ||
        v === this.puzzle(h, t).solution[i],
    );
  }
  refreshCore(lane, team) {
    const c = this.coreFor(lane, team),
      page = c.pages[lane];
    page.difficulty = this.broken(lane, team);
    const count = [14, 22, 32, 44][page.difficulty];
    for (const p of page.puzzles) {
      const order = p.hintOrder;
      for (const i of order.slice(0, count)) p.hints[i] = p.solution[i];
    }
  }
  complete(h, t, remoteDamage = false) {
    if (
      this.phase !== "playing" ||
      (!remoteDamage && (!this.near(h, t) || !this.objectiveAccess(h, t).ok)) ||
      !this.solved(h, t)
    )
      return false;
    if (t.kind === "prison") {
      t.completed[h.team] = true;
      const next = t.pages.findIndex((page) => !page.completed[h.team]);
      if (next >= 0) bindPage(t, next);
      else if (t.protective) t.unit.boxProtection = null;
      else t.unit.prison = null;
      return true;
    }
    if (t.kind === "ward") return this.wards.destroy(t);
    if (t.kind === "health") {
      if (t.duetFragment) {
        if (this.duet.remaining(t.unit) === 0) this.combat.kill(t.unit, h);
        else {
          const next = t.pages.findIndex((p) =>
            p.ownedIndices.some((i) => !p.boards[h.team][i]),
          );
          if (next >= 0) this.selectPage(t, next);
        }
        return true;
      }
      if (t.pages?.length > 1) {
        if (t.completed[h.team]) return false;
        this.combat.completePage(t, h.team);
        this.emit("healthPage", {
          target: t.id,
          page: t.activePage,
          team: h.team,
        });
        if (
          t.pages.every((page) => page.completed[h.team]) &&
          this.combat.hpLeft(t.unit) === 0
        )
          this.combat.kill(t.unit, h);
        else {
          const nextPage = t.pages.findIndex((page) => !page.completed[h.team]);
          if (nextPage >= 0) this.selectPage(t, nextPage);
        }
        return true;
      }
      this.combat.kill(t.unit, h);
      return true;
    }
    if (t.pages) {
      if (t.completed[h.team]) return false;
      if (t.kind === "tower") this.combat.completePage(t, h.team);
      else t.completed[h.team] = true;
      this.emit("page", { target: t.id, page: t.activePage, team: h.team });
      if (!t.pages.every((p) => p.completed[h.team])) return true;
      if (t.kind === "tower") t.destroyedAt = this.time;
      t.destroyed = true;
      if (t.kind === "tower") {
        this.score[h.team]++;
        for (const a of this.heroes.filter((a) => a.team === h.team)) {
          this.grant(a, CONFIG.towerGold[t.step], "tower");
          this.progression.add(a, PROGRESSION.towerDigits[t.step], "tower");
        }
        this.refreshCore(t.lane, h.team);
        this.emit("tower", {
          target: t.id,
          team: h.team,
          hero: h.id,
          gold: CONFIG.towerGold[t.step],
        });
        if (this.laneDone(t.lane, h.team)) {
          for (const a of this.heroes.filter((a) => a.team === h.team)) {
            this.grant(a, 170, "line");
            this.progression.add(a, PROGRESSION.lineDigits, "line");
          }
          this.emit("line", { target: t.id, team: h.team, lane: t.lane });
        }
      } else {
        this.phase = "ended";
        this.winner = h.team;
        this.emit("end", { team: h.team });
      }
      return true;
    }
    t.respawnAt = this.time + 45;
    t.owner = null;
    h.campsWon++;
    const campGold =
      t.puzzles[0].rules.size === 6 ? CONFIG.campGold * 2 : CONFIG.campGold;
    this.grant(h, campGold, "camp");
    this.progression.progress(
      h,
      PROGRESSION.campSeconds[t.puzzles[0].rules.size === 6 ? 1 : 0],
      "camp",
    );
    this.emit("camp", { target: t.id, hero: h.id, gold: campGold });
    return true;
  }
  progress(t, team) {
    const h = this.heroes.find((a) => a.team === team),
      p = this.puzzle(h, t);
    return {
      filled: this.board(h, t).filter((v, i) => v !== 0 && !p.givens[i]).length,
      total: p.givens.filter((v) => !v).length,
    };
  }
  signal(index) {
    if (this.phase === "playing") this.help = { index, until: this.time + 30 };
  }
  botMove(h, t) {
    if (t?.kind === "health" && this.heroEffects.protected(t.unit))
      t = t.unit.boxProtection;
    let visible = this.view(h, t);
    const blocked = this.blockedIndices(h, t);
    const hints = this.hints(h, t);
    const dust = this.dust.inspectBot(h, t, visible, blocked);
    if (dust) {
      visible = dust.visible;
      visible.forEach((_, i) => {
        if (!this.dust.readable(h, t, i)) blocked.add(i);
      });
    }
    const hinted = dust ? dust.hint : hints[0];
    if (hinted)
      return {
        index: hinted.index,
        value: this.displayDigit(t, h.team, hinted.value),
      };
    for (let i = 0; i < visible.length; i++) {
      const v = dust ? dust.memory[i] : this.puzzle(h, t).hints?.[i];
      if (v && !blocked.has(i))
        visible[i] = dust ? v : this.displayDigit(t, h.team, v);
    }
    const m = logicalMove(visible, this.puzzle(h, t).rules, blocked);
    if (m) return m;
    if (this.maskedIndices(t, h.team).length) return null;
    return dust
      ? null
      : reasonedMove(visible, this.puzzle(h, t).rules, blocked);
  }
  botShop(h) {
    if (this.time < h.shopAt) return;
    h.shopAt = this.time + 20;
    this.wards.botPurchase(h);
    const pendingItems = this.pendingOrders(h).map((o) => o.id);
    const activeItems = ITEMS.filter(
      (item) =>
        item.stunDuration ||
        item.inkDuration ||
        item.lassoDuration ||
        item.regenFactor ||
        ["veil", "invert", "eraser"].includes(item.id),
    ).sort((a, b) => a.price - b.price);
    for (const item of activeItems) {
      const pendingCount = pendingItems.filter((id) => id === item.id).length;
      if ((h.consumables[item.id] || 0) + pendingCount >= 2) continue;
      if (
        item.regenFactor &&
        this.combat.hpLeft(h) >= this.combat.healthCapacity(h) * 0.8
      )
        continue;
      if (h.gold >= this.itemPrice(h, item.id)) {
        if (this.buy(h, item.id).ok) return;
      }
    }
    if (h.healthSize === 4 && this.time > 120) return;
    const tier = this.committedTier(h),
      next = ITEMS.find((i) => i.tier === tier + 1);
    if (next && h.gold >= this.itemPrice(h, next.id)) {
      this.buy(h, next.id);
      return;
    }
    if (
      tier >= 2 &&
      !h.double &&
      !this.pendingOrders(h).some((o) => o.id === "double") &&
      h.gold >= this.itemPrice(h, "double")
    ) {
      this.buy(h, "double");
      return;
    }
    for (const id of ["veil", "invert", "eraser"])
      if (h.consumables[id]) this.useItem(h, id);
    const id = this.time > 600 ? "eraser" : h.id % 2 ? "invert" : "veil";
    if (
      tier >= 2 &&
      h.gold >= this.itemPrice(h, id) &&
      !this.pendingOrders(h).some((o) => o.id === id)
    )
      this.buy(h, id);
  }
  botUseItems(h) {
    const stoneTarget = this.towers.find(
      (t) =>
        !t.destroyed &&
        t.defender !== h.team &&
        dist(h, t) <= CONFIG.editorRange &&
        Object.keys(t.stones[h.team]).length,
    );
    if (stoneTarget) {
      if (h.consumables.shovel) {
        this.requestShovel(
          h,
          stoneTarget,
          Number(Object.keys(stoneTarget.stones[h.team])[0]),
        );
      } else if (!this.pendingOrders(h).some((o) => o.id === "shovel"))
        this.buy(h, "shovel");
    }
    const allyTower = this.towers.find(
      (t) =>
        !t.destroyed &&
        t.defender === h.team &&
        dist(h, t) <= CONFIG.editorRange &&
        t.boards[1 - h.team].some(Boolean),
    );
    if (allyTower && h.consumables.stone) {
      const team = 1 - h.team;
      const i = allyTower.boards[team].findIndex(
        (v, i) => !v && !allyTower.stones[team][i],
      );
      if (i >= 0) this.fieldItem(h, "stone", allyTower, i);
    }
    const active = [
      "stun3",
      "stun2",
      "stun1",
      "lasso",
      "miniInk",
      "invert",
      "veil",
      "eraser",
      "sharpener2",
      "sharpener",
    ];
    if (this.combat.hpLeft(h) < this.combat.healthCapacity(h) * 0.65) {
      for (const id of ["sharpener2", "sharpener"])
        if (h.consumables[id] && this.useItem(h, id).ok) return true;
    }
    for (const id of active)
      if (h.consumables[id] && this.useItem(h, id).ok) return true;
    return false;
  }
  bot(h) {
    this.progression.bot(h);
    if (h.duel || this.duet.bot(h)) return;
    if (this.sudzh.bot(h)) return;
    if (h.abduction || h.pendingAbduction) return;
    if (h.dead || this.heroEffects.trapped(h)) return;
    if (h.forcedSolve?.until > this.time) {
      if (this.combat.forcedSolve(h)) return;
    }
    if (
      this.flower?.active &&
      (h.role === "editor" ||
        dist(h, this.flower) < CONFIG.botFlowerSearchRadius)
    )
      h.flowerRun = true;
    if (this.editorFlower(h)) return;
    this.botShop(h);
    this.botUseItems(h);
    this.editorSupport(h);
    if (h.role === "editor") {
      const victim = this.heroes
        .filter(
          (u) =>
            !u.dead &&
            u.team !== h.team &&
            !this.abduction.carried(u) &&
            !u.abduction &&
            !this.heroEffects.trapped(u) &&
            !this.heroEffects.protected(u) &&
            dist(h, u) <= CONFIG.editorRange &&
            this.vision.visible(h.team, u),
        )
        .sort((a, b) => dist(h, a) - dist(h, b))[0];
      if (victim && this.abduction.cast(h, victim).ok) return;
    }
    if (this.combat.botCombat(h)) return;
    if (this.erasers.bot(h)) return;
    if (this.wards.bot(h)) return;
    if (this.time < 180 && !this.broken(h.preferred, h.team)) {
      const road = h.team
        ? [...LANES[h.preferred]].reverse()
        : LANES[h.preferred];
      let advanced = false;
      while (h.laneWaypoint <= 2 && road[h.laneWaypoint]) {
        const waypoint = road[h.laneWaypoint];
        const point = {
          x: waypoint[0] * CONFIG.mapMultiplier,
          y: waypoint[1] * CONFIG.mapMultiplier,
        };
        if (
          this.towers.some(
            (tower) =>
              !tower.destroyed &&
              tower.defender !== h.team &&
              dist(point, tower) <
                COMBAT.attackRadius + COMBAT.backdoorExtraRadius + 35,
          )
        ) {
          h.laneWaypoint++;
          advanced = true;
        } else if (dist(h, point) > CONFIG.interactRadius) {
          this.move(h, point.x, point.y);
          return;
        } else {
          h.laneWaypoint++;
          advanced = true;
        }
      }
      if (advanced) h.thinkAt = Math.min(h.thinkAt, this.time);
    }
    if (this.time < h.thinkAt) return;
    h.thinkAt =
      this.time + CONFIG.botThinkMin + this.random() * CONFIG.botThinkSpread;
    let t = h.task ? this.getTarget(h.task) : null;
    if (t && !this.objectiveAccess(h, t).ok) t = null;
    if (h.team === 0 && this.help) t = this.attackTarget(this.help.index, 0);
    if (!t) {
      t = this.nextTower(h.preferred, h.team) || this.nextCore(h.team);
      if (
        this.time >= h.farmAfter &&
        this.time < 540 &&
        !this.coreUnlocked(h.team) &&
        this.random() < 0.35
      ) {
        const camps = this.camps.filter((c) => this.objectiveAccess(h, c).ok);
        if (camps.length) t = camps.sort((a, b) => dist(h, a) - dist(h, b))[0];
        h.farmAfter = this.time + 220;
      }
    }
    if (!t) return;
    if (["tower", "core"].includes(t.kind) && t.backdoor !== false) {
      h.task = t.id;
      h.target = null;
      const d = dist(h, t),
        safe = COMBAT.attackRadius + COMBAT.backdoorExtraRadius + 35;
      const escort = this.combat.creeps
        .filter(
          (creep) =>
            !creep.dead &&
            creep.team === h.team &&
            creep.lane === t.lane &&
            creep.spawnAt <= this.time,
        )
        .sort((a, b) => dist(a, t) - dist(b, t))[0];
      if (escort && d > safe + 4) {
        const fromTower = dist(escort, t) || 1;
        const escortPoint = {
          x: escort.x + ((escort.x - t.x) / fromTower) * 70,
          y: escort.y + ((escort.y - t.y) / fromTower) * 70,
        };
        const pointDistance = dist(escortPoint, t) || 1;
        if (pointDistance < safe) {
          escortPoint.x = t.x + ((escortPoint.x - t.x) / pointDistance) * safe;
          escortPoint.y = t.y + ((escortPoint.y - t.y) / pointDistance) * safe;
        }
        const approachPoint = {
          x: t.x + ((h.x - t.x) / d) * safe,
          y: t.y + ((h.y - t.y) / d) * safe,
        };
        const escortMakesProgress = dist(escortPoint, t) < d - 24;
        const destination = escortMakesProgress ? escortPoint : approachPoint;
        this.move(h, destination.x, destination.y);
        return;
      }
      if (d < safe) {
        const away = d || 1;
        this.move(
          h,
          t.x + ((h.x - t.x) / away) * safe,
          t.y + ((h.y - t.y) / away) * safe,
        );
      } else h.target = null;
      return;
    }
    this.combat.prepareTarget(t, h.team);
    h.task = t.id;
    if (!this.near(h, t)) {
      const distance = dist(h, t);
      const radius = CONFIG.interactRadius * 0.8;
      this.move(
        h,
        t.x + ((h.x - t.x) / distance) * radius,
        t.y + ((h.y - t.y) / distance) * radius,
        { ignoreTowerId: t.kind === "tower" ? t.id : null },
      );
      return;
    }
    h.target = null;
    if (!this.interact(h, t).ok) {
      h.task = null;
      return;
    }
    const stones = Object.keys(t.stones[h.team]);
    if (stones.length) this.requestShovel(h, t, Number(stones[0]));
    if (this.solved(h, t)) {
      this.complete(h, t);
      return;
    }
    const m = this.botMove(h, t);
    if (!m) return;
    this.botError(h, t, m);
    const r = this.place(
      h,
      t,
      m.index,
      m.value,
      !this.canPen(h) && this.progression.available(h) > 0
        ? "universal"
        : "pen",
    );
    if (h.role === "agile" && r.ok && !r.card && this.random() < 0.84)
      h.thinkAt =
        this.time +
        Math.max(
          0.2,
          (h.comboUntil - this.time) * (0.55 + this.random() * 0.35),
        );
    else if (!r.ok && h.nextNormal > this.time)
      h.thinkAt = Math.min(h.thinkAt, h.nextNormal);
  }
  tick(dt) {
    if (this.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return;
    const old = this.time;
    const positions = new Map(
      this.heroes.map((h) => [h.id, { x: h.x, y: h.y }]),
    );
    this.time += dt;
    for (const h of this.heroes) {
      const pending = h.pendingAreaStun;
      if (!pending || this.time < pending.at) continue;
      h.pendingAreaStun = null;
      if (h.dead) continue;
      for (const u of pending.targets) {
        if (u.dead) continue;
        u.stunnedUntil = Math.max(
          u.stunnedUntil || 0,
          this.time + pending.duration,
        );
        u.target = null;
      }
    }
    this.duet.tick(dt);
    this.sudzh.tick(dt);
    this.abduction.tick();
    const income =
      Math.floor(this.time * CONFIG.passiveGoldPerSecond + 1e-9) -
      Math.floor(old * CONFIG.passiveGoldPerSecond + 1e-9);
    if (this.help && this.time > this.help.until) this.help = null;
    for (const h of this.heroes) {
      this.progression.progress(h, dt);
      if (h.dead) {
        h.pendingPencilCast = null;
        h.pendingAbduction = null;
        if (income) this.grant(h, income, "passive");
        continue;
      }
      if (income) this.grant(h, income, "passive");
      if (h.duel || h.duetDash) continue;
      this.heroEffects.updateFollow(h);
      this.updatePencilCast(h);
      this.abduction.approach(h);
      this.sudzh.approach(h);
      this.advanceHero(h, dt);
      if (h.phantoms?.until <= this.time) h.phantoms = null;
    }
    for (const h of this.duet.parts) {
      if (
        !h.dead &&
        !h.duel &&
        !this.duet.state(h).mounted &&
        !this.duet.state(h).flight
      )
        this.advanceHero(h, dt);
      this.combat.sync(h);
    }
    this.constrainLassos(positions);
    for (const h of this.heroes) {
      if (!h.dead) {
        this.constrainForcedSolve(h);
      }
    }
    this.separateHeroes();
    this.abduction.tick();
    for (const h of this.heroes) {
      this.combat.sync(h);
    }
    this.wards.tick();
    this.fire.tick();
    this.vision.refresh();
    this.erasers.tick();
    this.heroEffects.tick();
    if (this.time >= this.nextFlower) {
      const locations = [
          [46, 36],
          [52, 53],
          [59, 68],
        ],
        p = locations[this.flowerRound++ % 3];
      this.flower = {
        id: "flower",
        kind: "flower",
        x: p[0] * CONFIG.mapMultiplier,
        y: p[1] * CONFIG.mapMultiplier,
        active: true,
        at: this.time,
      };
      this.nextFlower += 180;
      this.emit("flowerSpawn");
    }
    // Alternate update order so exact ties do not always favour one team.
    for (const c of this.flowerRound % 2
      ? this.couriers
      : [...this.couriers].reverse())
      this.tickCourier(c, dt);
    for (const t of this.locations)
      for (let team = 0; team < 2; team++) {
        for (const [i, e] of Object.entries(t.errors[team]))
          if (e.until <= this.time) delete t.errors[team][i];
        if (t.effects[team]?.until <= this.time) t.effects[team] = null;
      }
    for (const c of this.camps) {
      if (c.respawnAt && this.time >= c.respawnAt) {
        const p = makePuzzle(
          c.puzzles[0].rules,
          this.seed + 600 + ++c.round * 29 + this.camps.indexOf(c),
        );
        Object.assign(c, dataFields([p, p]));
        c.respawnAt = 0;
      }
      if (
        c.owner !== null &&
        !this.heroes.some((h) => h.team === c.owner && this.near(h, c))
      ) {
        const owner = c.owner;
        c.owner = null;
        c.boards[owner] = c.puzzles[owner].givens.slice();
        c.holes[owner] = [];
        c.errors[owner] = {};
        c.stones[owner] = {};
        for (const h of this.heroes)
          for (const key of Object.keys(h.notes))
            if (key.startsWith(c.id + ":")) delete h.notes[key];
      }
    }
    this.combat.tick(dt);
    this.abduction.tick();
    if (!this.player.dead && !this.autoPlayer) this.editorFlower(this.player);
    for (const h of this.heroes.filter(
      (h) =>
        !this.sandbox &&
        (this.duet.root(h) !== this.duet.root(this.player) || this.autoPlayer),
    )) {
      if (this.phase !== "playing") break;
      this.bot(h);
    }
  }
}
