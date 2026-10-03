// Shared team sight is model state; every target selector uses the same predicate.
export class Vision {
  constructor(game) {
    this.game = game;
    this.forest = game.forest ||= new ForestGeometry(game);
    this.sources = [[], []];
    this.nextUpdate = -1;
    this.heroSightStates = new Map();
    this.known = [new Map(), new Map()];
  }
  refresh(force = false) {
    const g = this.game;
    if (this.forestRevision !== this.forest.revision) {
      force = true;
      this.forestRevision = this.forest.revision;
    }
    if (
      !force &&
      g.time < this.nextUpdate &&
      !g
        .actors()
        .some(
          (hero) =>
            !hero.dead &&
            this.heroSightStates.get(hero)?.region !==
              this.forest.regionAt(hero),
        )
    )
      return;
    this.nextUpdate = g.time + 0.1;
    for (const hero of g.actors())
      if (hero.dead) this.heroSightStates.delete(hero);
    this.sources = [0, 1].map((team) => [
      ...g
        .actors()
        .filter((h) => h.team === team && !h.dead)
        .map((unit) => this.heroSource(unit)),
      ...(g.combat?.creeps || [])
        .filter((u) => u.team === team && !u.dead && u.spawnAt <= g.time)
        .map((unit) => this.source(unit, CONFIG.creepVisionRadius)),
      ...[...g.towers, ...g.cores]
        .filter((t) => t.defender === team && !t.destroyed)
        .map((unit) => this.source(unit, CONFIG.structureVisionRadius)),
      ...g.wards.active(team).map((unit) => this.wardSource(unit)),
    ]);
    for (const team of [0, 1])
      for (const t of g.locations) {
        if (this.visible(team, t, false))
          this.known[team].set(t.id, {
            ...t,
            completed: [...t.completed],
            boards: t.boards.map((b) => [...b]),
            pages: t.pages?.map((p) => ({
              ...p,
              completed: [...p.completed],
              boards: p.boards.map((b) => [...b]),
            })),
          });
      }
  }
  visible(team, target, refresh = true) {
    if (!target) return false;
    if (refresh) this.refresh();
    const u = target.unit || target;
    if (target.kind === "ward" && !this.game.wards.isActive(target))
      return false;
    if (target.kind === "prison")
      return target.protective
        ? this.visible(team, target.unit, false)
        : this.game.actors().find((hero) => hero.id === target.owner)?.team ===
            team;
    if (u.dead || (u.kind === "creep" && u.spawnAt > this.game.time))
      return false;
    if (u.team === team || target.defender === team) return true;
    const region = this.forest.regionAt(u);
    return this.sources[team].some((source) => this.reveals(source, u, region));
  }
  source(unit, radius, reduced = false) {
    const region = this.forest.regionAt(unit);
    return {
      unit,
      region,
      radius: region && reduced ? radius / FOREST.visionDivisor : radius,
    };
  }
  heroSource(unit) {
    const source = this.source(unit, CONFIG.heroVisionRadius, true);
    source.forestPeekRadius = source.region
      ? 0
      : CONFIG.heroVisionRadius / FOREST.visionDivisor;
    const previous = this.heroSightStates.get(unit);
    let transition = previous?.transition;
    if (previous && previous.region !== source.region) {
      let radius = previous.radius;
      if (transition && !previous.region) {
        const progress = Math.min(
          1,
          Math.max(
            0,
            (this.game.time - transition.at) / FOREST.transitionSeconds,
          ),
        );
        const eased = progress * progress * (3 - 2 * progress);
        radius =
          transition.from.radius + (radius - transition.from.radius) * eased;
      }
      transition = {
        from: {
          unit: { x: previous.x, y: previous.y },
          radius,
          region: previous.region,
          forestPeekRadius: previous.forestPeekRadius,
        },
        at: this.game.time,
      };
    } else if (
      transition &&
      this.game.time - transition.at >= FOREST.transitionSeconds
    ) {
      transition = null;
    }
    this.heroSightStates.set(unit, {
      x: unit.x,
      y: unit.y,
      radius: source.radius,
      region: source.region,
      forestPeekRadius: source.forestPeekRadius,
      transition,
    });
    return { ...source, fogTransition: transition };
  }
  fogSources(team) {
    const layers = this.sources[team].flatMap((source) => {
      if (source.unit.dead || source.unit.destroyed) return [];
      const transition = source.fogTransition;
      if (!transition) return [source];
      const progress = Math.min(
        1,
        Math.max(
          0,
          (this.game.time - transition.at) / FOREST.transitionSeconds,
        ),
      );
      if (progress === 1) return [source];
      const eased = progress * progress * (3 - 2 * progress);
      if (source.region) {
        return [
          {
            ...transition.from,
            region: 0,
            forestPeekRadius: 0,
            radius: transition.from.radius * (1 - eased),
          },
          source,
        ];
      }
      return [
        {
          ...source,
          radius:
            transition.from.radius +
            (source.radius - transition.from.radius) * eased,
        },
      ];
    });
    return layers.flatMap((source) =>
      source.forestPeekRadius
        ? [
            source,
            {
              ...source,
              radius: source.forestPeekRadius,
              region: null,
              forestOnly: true,
            },
          ]
        : [source],
    );
  }
  wardSource(point) {
    return this.source(point, WARDS.visionRadius, true);
  }
  reveals(
    { unit, radius, region, forestPeekRadius = 0 },
    point,
    targetRegion = this.forest.regionAt(point),
  ) {
    const distance = Math.hypot(unit.x - point.x, unit.y - point.y);
    if (distance > radius || unit.dead || unit.destroyed) return false;
    const hit = this.forest.sightHit(unit, point, region);
    const peek = Boolean(
      !region && targetRegion && distance <= forestPeekRadius,
    );
    return (
      (!targetRegion || targetRegion === region || peek) &&
      (!hit ||
        (peek &&
          hit.region === targetRegion &&
          !this.forest.sightHit(unit, point, targetRegion)))
    );
  }
  appearance(team, t) {
    if (this.visible(team, t)) return t;
    return (
      this.known[team].get(t.id) || {
        ...t,
        destroyed: false,
        completed: [false, false],
        boards: t.puzzles.map((p) => p.givens.slice()),
        pages: t.pages?.map((p) => ({
          ...p,
          completed: [false, false],
          boards: p.puzzles.map((q) => q.givens.slice()),
        })),
        owner: null,
        respawnAt: 0,
        backdoor: false,
      }
    );
  }
}
import { CONFIG, WARDS, FOREST } from "./config.js";
import { ForestGeometry } from "./forest.js";
