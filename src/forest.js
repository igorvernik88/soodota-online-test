import { CONFIG, FOREST, LANES, TRAILS, RIVER } from "./config.js";
const geometryCache = new Map();

export function polylineDistance(x, y, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1],
      [bx, by] = points[i];
    const dx = bx - ax,
      dy = by - ay;
    const t = Math.max(
      0,
      Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)),
    );
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}
export const riverDistance = (x, y) => polylineDistance(x, y, RIVER);

function contains(loop, x, y) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i],
      b = loop[j];
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function smooth(loop) {
  return loop.flatMap((a, i) => {
    const b = loop[(i + 1) % loop.length];
    return [
      [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25],
      [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75],
    ];
  });
}

// Large connected forest patches, derived once from the map rather than tree sprites.
export class ForestGeometry {
  constructor(game) {
    this.game = game;
    this.burned = new Map();
    this.revision = 0;
    this.regions = [];
    const key = JSON.stringify([
      CONFIG.mapMultiplier,
      FOREST,
      LANES,
      TRAILS,
      RIVER,
      [...game.camps, ...game.towers].map((t) => [t.x, t.y]),
    ]);
    if (geometryCache.has(key)) {
      this.regions = geometryCache.get(key);
      return;
    }
    const n = Math.ceil(100 / FOREST.cellSize),
      grid = new Int32Array(n * n);
    const cell = FOREST.cellSize,
      worldCell = cell * CONFIG.mapMultiplier;
    const clearings = [
      ...game.camps.map((t) => ({ ...t, radius: 7 })),
      ...game.towers.map((t) => ({ ...t, radius: 6 })),
    ];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const mx = (x + 0.5) * cell,
          my = (y + 0.5) * cell;
        if (
          mx < 17 ||
          my < 17 ||
          mx > 83 ||
          my > 83 ||
          riverDistance(mx, my) < 6 ||
          LANES.some((p) => polylineDistance(mx, my, p) < 6) ||
          TRAILS.some((p) => polylineDistance(mx, my, p) < 2) ||
          clearings.some(
            (t) =>
              Math.hypot(
                t.x / CONFIG.mapMultiplier - mx,
                t.y / CONFIG.mapMultiplier - my,
              ) < t.radius,
          )
        )
          continue;
        grid[y * n + x] = -1;
      }
    const neighbors = (i) => [
      i % n ? i - 1 : -1,
      i % n < n - 1 ? i + 1 : -1,
      i >= n ? i - n : -1,
      i < n * (n - 1) ? i + n : -1,
    ];
    for (let first = 0; first < grid.length; first++) {
      if (grid[first] !== -1) continue;
      const id = this.regions.length + 1,
        cells = [first];
      grid[first] = id;
      for (let i = 0; i < cells.length; i++)
        for (const next of neighbors(cells[i])) {
          if (next >= 0 && grid[next] === -1) {
            grid[next] = id;
            cells.push(next);
          }
        }
      const edges = new Map();
      if (cells.length < FOREST.minCells) continue;
      const edge = (ax, ay, bx, by) => edges.set(`${ax},${ay}`, [bx, by]);
      for (const i of cells) {
        const x = i % n,
          y = Math.floor(i / n),
          [left, right, top, bottom] = neighbors(i);
        if (top < 0 || grid[top] !== id) edge(x, y, x + 1, y);
        if (right < 0 || grid[right] !== id) edge(x + 1, y, x + 1, y + 1);
        if (bottom < 0 || grid[bottom] !== id) edge(x + 1, y + 1, x, y + 1);
        if (left < 0 || grid[left] !== id) edge(x, y + 1, x, y);
      }
      const loops = [];
      while (edges.size) {
        const start = edges.keys().next().value,
          loop = [];
        let key = start;
        do {
          const point = key.split(",").map(Number),
            next = edges.get(key);
          if (!next) break;
          edges.delete(key);
          loop.push(point.map((v) => v * worldCell));
          key = next.join(",");
        } while (key !== start);
        if (loop.length >= 3) loops.push(smooth(smooth(loop)));
      }
      const xs = cells.map((i) => (i % n) * worldCell),
        ys = cells.map((i) => Math.floor(i / n) * worldCell);
      this.regions.push({
        id,
        loops,
        sightEdges: loops.flatMap((loop) => {
          const corners = loop.filter((b, i) => {
            const a = loop[(i + loop.length - 1) % loop.length],
              c = loop[(i + 1) % loop.length];
            return (
              Math.abs(
                (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]),
              ) > 1e-7
            );
          });
          return corners.map((a, i) => [a, corners[(i + 1) % corners.length]]);
        }),
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs) + worldCell,
        maxY: Math.max(...ys) + worldCell,
      });
    }
    geometryCache.set(key, this.regions);
  }
  isBurned(id) {
    const until = this.burned?.get(id);
    return !!until && until > this.game.time;
  }
  burnProgress(id) {
    if (!this.isBurned(id)) return null;
    return Math.min(
      1,
      (this.game.time - (this.burned.get(id) - FOREST.recoverySeconds)) /
        FOREST.burnSeconds,
    );
  }
  burn(point) {
    const id = this.regionAt(point);
    if (!id) return false;
    this.burned.set(id, this.game.time + FOREST.recoverySeconds);
    this.revision++;
    this.sightCache = new WeakMap();
    return true;
  }
  recover() {
    for (const [id, until] of this.burned)
      if (until <= this.game.time) {
        this.burned.delete(id);
        this.revision++;
        this.sightCache = new WeakMap();
      }
  }
  sightHit(from, to, ownRegion = 0) {
    const dx = to.x - from.x,
      dy = to.y - from.y;
    let closest = 1,
      region = 0;
    const minX = Math.min(from.x, to.x),
      maxX = Math.max(from.x, to.x),
      minY = Math.min(from.y, to.y),
      maxY = Math.max(from.y, to.y);
    for (const forest of this.regions) {
      if (
        this.isBurned(forest.id) ||
        forest.id === ownRegion ||
        forest.maxX < minX ||
        forest.minX > maxX ||
        forest.maxY < minY ||
        forest.minY > maxY
      )
        continue;
      for (const [a, b] of forest.sightEdges) {
        const sx = b[0] - a[0],
          sy = b[1] - a[1],
          denominator = dx * sy - dy * sx;
        if (Math.abs(denominator) < 1e-9) continue;
        const ax = a[0] - from.x,
          ay = a[1] - from.y;
        const t = (ax * sy - ay * sx) / denominator,
          u = (ax * dy - ay * dx) / denominator;
        if (t > 1e-7 && t < closest && u >= 0 && u <= 1) {
          closest = t;
          region = forest.id;
        }
      }
    }
    return region ? { region, distance: Math.hypot(dx, dy) * closest } : null;
  }
  sightPolygon(unit, radius, region = 0, peek = false) {
    this.sightCache ||= new WeakMap();
    const position = `${unit.x}:${unit.y}`;
    let cached = this.sightCache.get(unit);
    if (!cached || cached.position !== position) {
      cached = { position, shapes: new Map() };
      this.sightCache.set(unit, cached);
    }
    const key = `${radius}:${region}:${peek}`;
    if (cached.shapes.has(key)) return cached.shapes.get(key);
    const points = Array.from({ length: 128 }, (_, i) => {
      const angle = (i * Math.PI * 2) / 128,
        x = Math.cos(angle),
        y = Math.sin(angle);
      let hit = this.sightHit(
        unit,
        { x: unit.x + x * radius, y: unit.y + y * radius },
        region,
      );
      if (peek && hit)
        hit = this.sightHit(
          unit,
          { x: unit.x + x * radius, y: unit.y + y * radius },
          hit.region,
        );
      const distance = hit?.distance ?? radius;
      return [unit.x + x * distance, unit.y + y * distance];
    });
    cached.shapes.set(key, points);
    return points;
  }
  regionAt(point) {
    for (const r of this.regions) {
      if (this.isBurned(r.id)) continue;
      if (
        point.x < r.minX ||
        point.x > r.maxX ||
        point.y < r.minY ||
        point.y > r.maxY
      )
        continue;
      if (
        r.loops.reduce(
          (inside, loop) => inside !== contains(loop, point.x, point.y),
          false,
        )
      )
        return r.id;
    }
    return 0;
  }
}
