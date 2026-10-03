import { duelAnimationPose } from "./animations/duet.js";
import { AllySkillTargeting } from "./ally-skill-targeting.js";
import { COMBAT } from "./combat.js";
import { riverDistance } from "./forest.js";
import { LANES, TRAILS, WARDS, FIRE, RIVER } from "./config.js";
import {
  HOOK_ANIMATION,
  ACID_POOL_ANIMATION,
  BROKEN_PENCIL_ANIMATION,
} from "./animations/manifest.js";
import { HeroAnimator } from "./hero-animation.js";
import { BASES, seeded, CONFIG, HEROES } from "./logic.js";
// Include the gradient fringe and blur so off-screen light still reaches the edge.
export function fogSourceInView(p, rx, ry, width, height) {
  const padding = 28;
  return (
    p.x + rx * 1.04 + padding >= 0 &&
    p.x - rx * 1.04 - padding <= width &&
    p.y + ry * 1.04 + padding >= 0 &&
    p.y - ry * 1.04 - padding <= height
  );
}
export function* recentFireballCasts(events, time) {
  let start = events.length;
  while (start > 0 && time - events[start - 1].time <= FIRE.castDelay) start--;
  for (let i = start; i < events.length; i++)
    if (events[i].type === "fireballCast") yield events[i];
}

const C = {
  ink: "#38523e",
  grass: "#b5c792",
  edge: "#7f9369",
  green: "#447557",
  red: "#b86451",
  paper: "#fff5d9",
};
export const CREEP_ANIMATION_FRAMES = 6;
export const CREEP_ANIMATION_FRAME_MS = 120;
export const TOWER_ANIMATION_FRAME_MS = 120;
export const TOWER_ANIMATION_FRAMES = 6;
export const TOWER_ANIMATION_FILES = [
  "idle.webp",
  "attack.webp",
  "stun.webp",
  "death.webp",
];
export const CREEP_ANIMATION_FILES = [
  "death.webp",
  "fight_fresh.webp",
  "fight_half.webp",
  "fight_almost.webp",
  "run_fresh.webp",
  "run_half.webp",
  "run_almost.webp",
];
export const CREEP_ANIMATION_TEAMS = ["team1", "enemy"];
export function creepHealthTier(u, combat) {
  const initial = Math.max(1, u.spawnHp || combat.hpLeft(u)),
    filled = Math.max(0, initial - combat.hpLeft(u)),
    ratio = filled / initial;
  return ratio < 0.35 ? "fresh" : ratio < 0.7 ? "half" : "almost";
}
export function creepAnimationFile(u, combat) {
  if (u.dead) return "death.webp";
  return `${u.animationState === "fight" ? "fight" : "run"}_${creepHealthTier(u, combat)}.webp`;
}
export { riverDistance } from "./forest.js";
export function structureHealth(target) {
  const team = 1 - target.defender,
    pages = target.pages || [target];
  return {
    capacity: pages.reduce((sum, page) => sum + page.boards[team].length, 0),
    hp: pages.reduce(
      (sum, page) => sum + page.boards[team].filter((v) => !v).length,
      0,
    ),
  };
}
export class Renderer {
  constructor(canvas, mini, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.mini = mini;
    this.game = game;
    this.heroAnimator = new HeroAnimator(game);
    this.creepImages = new Map();
    this.miniHeroImages = new Map();
    if (typeof Image !== "undefined")
      for (const role of HEROES.map((hero) => hero.id)) {
        const image = new Image();
        image.src =
          globalThis.SUDOTA_MINIMAP_HERO_ASSETS?.[role] ||
          `assets/heroes/minimap/${role}.png`;
        this.miniHeroImages.set(role, image);
      }
    this.baseImages = [];
    if (typeof Image !== "undefined")
      for (const file of ["base-green.webp", "base-red.webp"]) {
        const image = new Image();
        image.src =
          globalThis.SUDOTA_HERO_ASSETS?.[file] || "assets/heroes/" + file;
        this.baseImages.push(image);
      }
    if (typeof Image !== "undefined") {
      this.courierImages = ["courier-green.webp", "courier-red.webp"].map(
        (file) => {
          const image = new Image();
          image.src =
            globalThis.SUDOTA_HERO_ASSETS?.[file] || "assets/heroes/" + file;
          return image;
        },
      );
      this.acidImage = new Image();
      this.acidImage.src =
        globalThis.SUDOTA_HERO_ASSETS?.[ACID_POOL_ANIMATION.file] ||
        "assets/heroes/" + ACID_POOL_ANIMATION.file;
      this.hookImage = new Image();
      this.hookImage.src =
        globalThis.SUDOTA_HERO_ASSETS?.[HOOK_ANIMATION.file] ||
        "assets/heroes/" + HOOK_ANIMATION.file;
      this.pencilImage = new Image();
      this.pencilImage.src =
        globalThis.SUDOTA_HERO_ASSETS?.[BROKEN_PENCIL_ANIMATION.file] ||
        "assets/heroes/" + BROKEN_PENCIL_ANIMATION.file;
    }
    this.towerImages = new Map();
    this.wardImages = new Map();
    this.wardPreview = null;
    if (typeof Image !== "undefined")
      for (const { file } of WARDS.sprites) {
        const image = new Image();
        image.src =
          globalThis.SUDOTA_WARD_ASSETS?.[file] || `assets/wards/${file}`;
        this.wardImages.set(file, image);
      }
    if (typeof Image !== "undefined")
      for (const team of CREEP_ANIMATION_TEAMS)
        for (const file of CREEP_ANIMATION_FILES) {
          const image = new Image();
          image.src =
            globalThis.SUDOTA_CREEP_ASSETS?.[team]?.[file] ||
            `assets/animations/sudoku-runner/${team}/${file}`;
          this.creepImages.set(`${team}/${file}`, image);
        }
    if (typeof Image !== "undefined")
      for (const defender of [0, 1])
        for (const file of TOWER_ANIMATION_FILES) {
          const directory =
              defender === 0 ? "sudoku-tower" : "sudoku-blot-tower",
            assets =
              defender === 0
                ? globalThis.SUDOTA_TOWER_ASSETS
                : globalThis.SUDOTA_BLOT_TOWER_ASSETS,
            image = new Image();
          image.src =
            assets?.[file] || `assets/animations/${directory}/${file}`;
          this.towerImages.set(`${defender}/${file}`, image);
        }
    this.width = 0;
    this.height = 0;
    this.particles = [];
    this.marker = null;
    this.hover = null;
    this.skillPreviewRadius = 0;
    this.eraserSelection = false;
    this.allySkillTargeting = new AllySkillTargeting(this);
    this.zoom = 3.3;
    this.follow = true;
    this.camera = { x: game.player.x, y: game.player.y };
    const r = seeded(219);
    this.trees = [];
    for (let i = 0; i < 6250; i++) {
      const x = 5 + r() * 90,
        y = 5 + r() * 90;
      if (
        riverDistance(x, y) < 6 ||
        !game.forest.regionAt({
          x: x * CONFIG.mapMultiplier,
          y: y * CONFIG.mapMultiplier,
        })
      )
        continue;
      this.trees.push({
        forestRegion: game.forest.regionAt({
          x: x * CONFIG.mapMultiplier,
          y: y * CONFIG.mapMultiplier,
        }),
        x: x * CONFIG.mapMultiplier,
        y: y * CONFIG.mapMultiplier,
        h: 18 + r() * 22,
        w: 12 + r() * 10,
        type: Math.floor(r() * 3),
        tone: r(),
      });
    }
    this.grass = [];
    for (let i = 0; i < 1125; i++)
      this.grass.push({ x: r() * 96 + 2, y: r() * 96 + 2, s: r() });
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fitScale = Math.min(
      (this.width - 90) / (CONFIG.worldSize * 2.05),
      (this.height - 60) / (CONFIG.worldSize * 1.12),
    );
    this.scale = this.fitScale * this.zoom;
    this.spriteScale = this.scale * 1.5;
    this.cx = this.width * 0.5;
    this.cy = this.height * 0.5;
  }
  setZoom(value, overview = false) {
    this.zoom = Math.max(overview ? 0.85 : 3.3, Math.min(10, value));
    this.scale = this.fitScale * this.zoom;
    this.spriteScale = this.scale * 1.5;
  }
  overview() {
    this.follow = false;
    this.camera = { x: CONFIG.worldSize / 2, y: CONFIG.worldSize / 2 };
    this.setZoom(1, true);
  }
  focusHero() {
    this.follow = true;
    this.setZoom(3.3);
    this.camera = { x: this.game.player.x, y: this.game.player.y };
  }
  pan(dx, dy) {
    this.follow = false;
    this.camera.x -= (dx / this.scale + dy / (this.scale * 0.51)) / 2;
    this.camera.y -= (-dx / this.scale + dy / (this.scale * 0.51)) / 2;
    this.camera.x = Math.max(0, Math.min(CONFIG.worldSize, this.camera.x));
    this.camera.y = Math.max(0, Math.min(CONFIG.worldSize, this.camera.y));
  }
  p(x, y, z = 0) {
    return {
      x: this.cx + (x - this.camera.x - (y - this.camera.y)) * this.scale,
      y:
        this.cy +
        (x - this.camera.x + (y - this.camera.y)) * this.scale * 0.51 -
        z * this.scale * 0.15,
    };
  }
  unproject(x, y) {
    const a = (x - this.cx) / this.scale,
      b = (y - this.cy) / (this.scale * 0.51);
    return { x: this.camera.x + (a + b) / 2, y: this.camera.y + (b - a) / 2 };
  }
  miniProject(x, y) {
    const scale = 240 / CONFIG.worldSize;
    return { x: 8 + x * scale, y: 8 + y * scale };
  }
  miniUnproject(x, y) {
    const scale = CONFIG.worldSize / 240;
    return { x: (x - 8) * scale, y: (y - 8) * scale };
  }
  poly(points, fill, stroke = C.ink, width = 1) {
    const c = this.ctx;
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }
  worldPoly(points, fill, stroke, width = 1) {
    this.poly(
      points.map(([x, y, z]) => {
        const p = this.p(
          x * CONFIG.mapMultiplier,
          y * CONFIG.mapMultiplier,
          (z || 0) * CONFIG.mapMultiplier,
        );
        return [p.x, p.y];
      }),
      fill,
      stroke,
      width,
    );
  }
  path(points, color, width, dash = [], raw = false) {
    const c = this.ctx;
    c.beginPath();
    points.forEach(([x, y], i) => {
      const p = this.p(
        raw ? x : x * CONFIG.mapMultiplier,
        raw ? y : y * CONFIG.mapMultiplier,
      );
      if (i) c.lineTo(p.x, p.y);
      else c.moveTo(p.x, p.y);
    });
    c.strokeStyle = color;
    // Raw paths (skill rings and ropes) retain their local thickness.
    c.lineWidth = width * this.scale * (raw ? 21 : CONFIG.mapMultiplier);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.setLineDash(dash);
    c.stroke();
    c.setLineDash([]);
  }
  label(x, y, text, color = "#526747", size = 10) {
    const c = this.ctx;
    c.font = `600 ${size}px "Golos Text",Arial`;
    c.textAlign = "center";
    c.fillStyle = color;
    c.fillText(text, x, y);
  }
  treeOnScreen(t) {
    const p = this.p(t.x, t.y),
      w = t.w * this.spriteScale,
      h = t.h * this.spriteScale;
    return (
      p.x >= -w * 4 &&
      p.x <= this.width + w * 4 &&
      p.y >= -h * 2 &&
      p.y <= this.height + h * 2
    );
  }
  tree(t) {
    if (!this.treeOnScreen(t)) return;
    const burn = this.game.forest.burnProgress(t.forestRegion);
    const c = this.ctx,
      p = this.p(t.x, t.y),
      k = this.spriteScale,
      w = t.w * k,
      h = t.h * k;
    c.save();
    c.translate(p.x, p.y);
    c.scale(2, 2);
    if (burn !== null) {
      this.poly(
        [
          [-w * 0.7, 3],
          [w * 0.8, 3],
          [w * 0.45, -5],
          [-w * 0.5, -6],
        ],
        "#59574b65",
        null,
      );
      this.poly(
        [
          [-2, 2],
          [3, 3],
          [2, -h],
          [-1, -h * 1.2],
        ],
        "#3e4037",
        "#646556",
        0.8,
      );
      c.strokeStyle = "#3e4037";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, -h * 0.5);
      c.lineTo(-w * 0.65, -h * 0.85);
      c.moveTo(1, -h * 0.7);
      c.lineTo(w * 0.6, -h * 1.1);
      c.stroke();
      if (burn < 1) {
        c.save();
        c.globalAlpha = 1 - burn;
        this.poly(
          [
            [-w, -h * 0.5],
            [-w * 0.4, -h * 1.4],
            [w * 0.3, -h * 1.5],
            [w, -h * 0.6],
          ],
          "#5c644b",
          "#51493b",
          0.8,
        );
        for (let i = 0; i < 3; i++) {
          const x = (i - 1) * w * 0.45;
          const flicker =
            0.8 + Math.sin(this.game.time * 13 + t.x + i * 2) * 0.2;
          const tall = h * (0.55 + 0.3 * flicker);
          this.poly(
            [
              [x - w * 0.3, -h * 0.35],
              [x - w * 0.16, -h * 0.65],
              [x + w * 0.05, -h * 0.35 - tall],
              [x + w * 0.28, -h * 0.55],
              [x + w * 0.2, -h * 0.3],
            ],
            "#e76c27",
            "#b74725",
            0.5,
          );
          this.poly(
            [
              [x - w * 0.14, -h * 0.35],
              [x, -h * 0.35 - tall * 0.55],
              [x + w * 0.16, -h * 0.35],
            ],
            "#ffd56a",
            null,
          );
        }
        c.restore();
      }
      c.restore();
      return;
    }
    c.fillStyle = "#536f4930";
    c.beginPath();
    c.ellipse(w * 0.25, 4, w * 0.8, w * 0.32, -0.2, 0, Math.PI * 2);
    c.fill();
    this.poly(
      [
        [-2, 2],
        [3, 3],
        [4, -h * 0.55],
        [-1, -h * 0.55],
      ],
      "#aa8f58",
      "#61714c",
      0.8,
    );
    let color =
      t.tone > 0.65 ? "#689574" : t.tone > 0.3 ? "#779d69" : "#567f60";
    if (t.type === 0) {
      this.poly(
        [
          [-w, -h * 0.4],
          [-w * 0.42, -h * 0.8],
          [-w * 0.3, -h * 0.73],
          [0, -h * 1.5],
          [w * 0.5, -h * 0.9],
          [w * 0.35, -h * 0.87],
          [w, -h * 0.42],
        ],
        color,
        "#456747",
        0.8,
      );
      this.poly(
        [
          [0, -h * 1.5],
          [w * 0.5, -h * 0.9],
          [w * 0.35, -h * 0.87],
          [w, -h * 0.42],
          [0, -h * 0.6],
        ],
        "#436d56",
        null,
      );
      c.strokeStyle = "#aac18b";
      c.lineWidth = 0.7;
      c.beginPath();
      c.moveTo(0, -h * 1.35);
      c.lineTo(0, -h * 0.48);
      c.stroke();
    } else {
      this.poly(
        [
          [-w * 0.9, -h * 0.52],
          [-w, -h],
          [-w * 0.42, -h * 1.4],
          [w * 0.25, -h * 1.55],
          [w * 0.95, -h],
          [w * 0.85, -h * 0.5],
          [0, -h * 0.38],
        ],
        color,
        "#446848",
        0.8,
      );
      this.poly(
        [
          [0, -h * 0.38],
          [w * 0.85, -h * 0.5],
          [w * 0.95, -h],
          [w * 0.25, -h * 1.55],
          [0, -h * 0.93],
        ],
        "#477752",
        null,
      );
      c.strokeStyle = "#abc18b";
      c.lineWidth = 0.7;
      c.beginPath();
      c.moveTo(-w * 0.42, -h * 1.3);
      c.lineTo(0, -h * 0.93);
      c.lineTo(0, -h * 0.4);
      c.stroke();
    }
    c.restore();
  }
  towerSprite(t) {
    const time = this.game.time,
      state = t.destroyed
        ? "death"
        : t.stunAnimationUntil > time
          ? "stun"
          : t.animationState === "attack"
            ? "attack"
            : "idle",
      file = `${state}.webp`,
      image = this.towerImages.get(`${t.defender}/${file}`);
    if (!image?.complete || !image.naturalWidth || !image.naturalHeight)
      return false;
    const frameWidth = image.naturalWidth / TOWER_ANIMATION_FRAMES,
      startedAt =
        state === "death"
          ? (t.destroyedAt ?? time)
          : state === "stun"
            ? (t.stunAnimationAt ?? time)
            : 0,
      frameDuration =
        state === "idle"
          ? TOWER_ANIMATION_FRAME_MS * 2
          : TOWER_ANIMATION_FRAME_MS,
      rawFrame = Math.floor(
        (Math.max(0, time - startedAt) * 1000) / frameDuration,
      ),
      frame =
        state === "death" || state === "stun"
          ? Math.min(TOWER_ANIMATION_FRAMES - 1, rawFrame)
          : rawFrame % TOWER_ANIMATION_FRAMES,
      enlargedBlotAttack = t.defender === 1 && state === "attack",
      drawScaleX = enlargedBlotAttack ? 1.15 * 1.15 : 1,
      drawScaleY = enlargedBlotAttack ? 1.15 : 1;
    this.ctx.save();
    if (state === "attack" && t.defender === 1) this.ctx.scale(-1, 1);
    this.ctx.drawImage(
      image,
      frame * frameWidth,
      0,
      frameWidth,
      image.naturalHeight,
      -28 * drawScaleX,
      -85 * drawScaleY,
      56 * drawScaleX,
      112 * drawScaleY,
    );
    this.ctx.restore();
    return true;
  }
  book(t, time) {
    t = this.game.vision.appearance(this.game.player.team, t);
    const c = this.ctx,
      p = this.p(t.x, t.y),
      s =
        this.spriteScale *
        (t.kind === "tower" ? 4 : t.kind === "camp" ? 2.5 : 1);
    c.save();
    c.translate(p.x, p.y);
    c.scale(s, s);
    const camp = t.kind === "camp",
      cool = camp && t.respawnAt > this.game.time,
      owner = camp ? t.owner : t.defender;
    const color = owner === 1 ? C.red : owner === 0 ? C.green : "#7c9367";
    c.fillStyle = "#3f5f4930";
    c.beginPath();
    c.ellipse(0, 9, camp ? 24 : 40, camp ? 10 : 16, 0, 0, Math.PI * 2);
    c.fill();
    const animatedTower = t.kind === "tower" && this.towerSprite(t);
    if (!camp) {
      const height = 12 + (t.step ?? 2) * 9;
      if (!animatedTower)
        this.poly(
          [
            [-18, -4],
            [0, 5],
            [19, -4],
            [19, -height],
            [0, -height + 9],
            [-18, -height],
          ],
          "#c6b784",
          "#77845c",
        );
      c.translate(0, -height + 6);
    }
    if (!animatedTower) {
      this.poly(
        [
          [-28, 0],
          [0, -14],
          [29, 0],
          [0, 15],
        ],
        camp ? "#b9bf91" : "#d8c78f",
        "#7b8960",
      );
      this.poly(
        [
          [-28, 0],
          [0, 15],
          [29, 0],
          [29, 7],
          [0, 23],
          [-28, 8],
        ],
        "#aeaa78",
        "#77845c",
      );
    }
    if (!animatedTower)
      for (let i = 0; i < 5; i++) {
        c.strokeStyle = "#94936366";
        c.beginPath();
        c.moveTo(-21 + i * 21, 8 + i * 3);
        c.lineTo(-20 + i * 21, 12 + i * 3);
        c.stroke();
      }
    if (cool) {
      this.label(0, -2, "↻", "#718160", 25);
      this.label(
        0,
        37,
        `${Math.ceil(t.respawnAt - this.game.time)} с`,
        "#6c795d",
        10,
      );
    } else if (!animatedTower) {
      c.save();
      c.translate(0, -9);
      const size = camp ? 0.75 : 1.15;
      c.scale(size, size);
      this.poly(
        [
          [-25, -2],
          [-4, -12],
          [0, -6],
          [4, -11],
          [25, -1],
          [21, 16],
          [1, 9],
          [-20, 15],
        ],
        "#638266",
        "#375b43",
      );
      this.poly(
        [
          [-24, -5],
          [-5, -15],
          [0, -9],
          [5, -14],
          [24, -4],
          [20, 11],
          [1, 6],
          [-19, 10],
        ],
        C.paper,
        "#78825a",
      );
      this.poly(
        [
          [0, -9],
          [5, -14],
          [24, -4],
          [20, 11],
          [1, 6],
        ],
        "#e8dbb7",
        null,
      );
      c.strokeStyle = "#a9ac85";
      c.lineWidth = 0.6;
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(-19 + i * 5, -5 - i * 2);
        c.lineTo(-16 + i * 4, 6 - i);
        c.stroke();
        c.beginPath();
        c.moveTo(-20, -3 + i * 3);
        c.lineTo(-3, -9 + i * 4);
        c.stroke();
      }
      this.label(
        10,
        4,
        String(this.game.puzzle(this.game.player, t).rules.size),
        "#6c7853",
        12,
      );
      c.restore();
    }
    if (!camp) {
      if (t.kind !== "tower") {
        c.strokeStyle = color;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(31, 5);
        c.lineTo(31, -47);
        c.stroke();
        this.poly(
          [
            [31, -47],
            [52, -41],
            [31, -31],
          ],
          owner === 1 ? "#c37862" : owner === 0 ? "#679470" : "#e3d39c",
          "#75855f",
        );
      }
      this.label(0, 45, t.name.toUpperCase(), color, 9);
      this.label(
        0,
        -34,
        t.completed[1 - t.defender]
          ? "✓"
          : t.kind === "core"
            ? "ЛИСТ " + (t.lane + 1)
            : "",
        color,
        14,
      );
      if (t.backdoor)
        this.label(
          0,
          72,
          ["tower", "core"].includes(t.kind)
            ? `БРОНЯ ${t.backdoorArmor || 0}`
            : "БЕКДОР ↺",
          color,
          9,
        );
      const { capacity, hp } = structureHealth(t);
      c.fillStyle = "#354734";
      c.fillRect(-44, 53, 88, 10);
      c.fillStyle = color;
      c.fillRect(-43, 54, (86 * hp) / capacity, 8);
      this.label(0, 61, `${hp}/${capacity}`, "#fff5d9", 7);
    } else if (!cool) {
      this.label(
        0,
        37,
        `ЛЕС · ${t.puzzles[0].rules.size}×${t.puzzles[0].rules.size}`,
        "#5e7753",
        8,
      );
      if (t.owner !== null)
        this.label(0, -29, t.owner === 0 ? "✦" : "◆", color, 15);
    }
    if (
      this.hover === t.id &&
      !(t.kind === "tower" && t.defender === this.game.player.team)
    ) {
      c.strokeStyle = "#f9f2c5";
      c.lineWidth = 2;
      c.setLineDash([4, 3]);
      c.beginPath();
      c.ellipse(0, 6, 38, 20, 0, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    c.restore();
  }
  base(team) {
    const p = this.p(BASES[team].x, BASES[team].y),
      c = this.ctx,
      s = this.spriteScale,
      col = team ? C.red : C.green;
    c.save();
    c.translate(p.x, p.y);
    c.scale(s, s);
    c.fillStyle = "#38523e20";
    c.beginPath();
    c.ellipse(0, 13, 45, 18, 0, 0, Math.PI * 2);
    c.fill();
    const image = this.baseImages[team];
    if (image?.complete && image.naturalWidth) {
      c.save();
      c.imageSmoothingEnabled = false;
      if (!team) c.scale(-1, 1);
      c.drawImage(image, -195, -315, 390, 390);
      c.restore();
    } else {
      this.poly(
        [
          [-34, 6],
          [0, -15],
          [36, 5],
          [2, 29],
        ],
        "#d7c998",
        "#8b9368",
      );
      this.poly(
        [
          [-22, -6],
          [0, 5],
          [0, -36],
          [-22, -47],
        ],
        "#f3ddb1",
        "#60724d",
      );
      this.poly(
        [
          [0, 5],
          [24, -8],
          [24, -47],
          [0, -36],
        ],
        "#d7c798",
        "#60724d",
      );
      this.poly(
        [
          [-29, -44],
          [-6, -71],
          [0, -39],
        ],
        team ? "#c78668" : "#8eab7c",
        "#4b6b4c",
      );
      this.poly(
        [
          [-6, -71],
          [30, -53],
          [30, -41],
          [0, -27],
          [0, -39],
        ],
        col,
        "#4b6b4c",
      );
      this.poly(
        [
          [-29, -44],
          [0, -27],
          [0, -39],
        ],
        team ? "#dda480" : "#a4ba80",
        "#4b6b4c",
      );
      this.poly(
        [
          [-16, -2],
          [-6, 3],
          [-6, -17],
          [-16, -21],
        ],
        col,
        "#5a744c",
      );
      this.poly(
        [
          [6, -16],
          [18, -22],
          [18, -35],
          [6, -28],
        ],
        "#f6edc5",
        "#77815a",
      );
      c.strokeStyle = "#6b7852";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-27, -19);
      c.lineTo(-27, -82);
      c.stroke();
      this.poly(
        [
          [-27, -82],
          [-3, -74],
          [-27, -64],
        ],
        col,
        "#587250",
      );
      this.label(-20, -71, team ? "◆" : "✦", "#f9ebc7", 10);
    }
    this.label(0, 49, team ? "БАЗА КЛЯКС" : "ВАША БАЗА", col, 10);
    this.label(
      0,
      62,
      team
        ? this.game.coreUnlocked(0)
          ? "ТРИ ЛИСТА 9×9 · ОТКРЫТО"
          : "ТРИ ЛИСТА 9×9 · ЗАЩИТА"
        : "ЛАВКА · КУРЬЕР",
      "#7b8467",
      8,
    );
    c.restore();
  }
  heroVisible(h) {
    const team = this.game.player.team;
    if (!h.dead) return this.game.vision.visible(team, h);
    if (
      !this.game.duet.state(h)?.split &&
      (h.role === "editor" || this.game.time >= (h.respawnAt || 0))
    )
      return false;
    // Corpses use sight at their position, without making dead heroes targetable.
    return (
      h.team === team || this.game.vision.visible(team, { x: h.x, y: h.y })
    );
  }
  deathSoul(h) {
    const c = this.ctx,
      p = this.unitPoint(h),
      s = this.spriteScale * 4;
    c.save();
    c.translate(p.x, p.y);
    c.scale(s, s);
    this.heroAnimator.drawDeathSoul(c, h);
    c.restore();
  }
  duelSprite(d, time, ashes = false) {
    const c = this.ctx,
      p = this.p(d.x, d.y),
      scale = this.spriteScale * 4;
    c.save();
    c.translate(p.x, p.y);
    c.scale(scale, scale);
    this.heroAnimator.drawPose(c, duelAnimationPose(d, this.game.time, ashes));
    c.restore();
  }
  hero(h, time) {
    if (h.duel) return;
    const c = this.ctx,
      p = this.unitPoint(h),
      s = this.spriteScale * 4,
      bob = h.target
        ? Math.sin(time * 11 + (Number(h.id) || 0)) * 2
        : Math.sin(time * 2 + (Number(h.id) || 0)) * 0.7;
    const col = h.team ? C.red : C.green,
      role = HEROES.find((r) => r.id === h.role);
    c.save();
    c.translate(p.x, p.y);
    c.scale(s, s);
    if (h.role === "editor") {
      c.translate(0, -18 - Math.sin(time * 4) * 2);
    }
    if (h.role === "strong") c.scale(1.2, 1);
    c.fillStyle = "#2d52332d";
    c.beginPath();
    c.ellipse(0, 3, 13, 6, 0, 0, Math.PI * 2);
    c.fill();
    if (h === this.game.player && !h.dead) {
      c.strokeStyle = "#f6f5c5";
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(0, 3, 17, 8, 0, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = "#42664b";
      c.lineWidth = 1;
      c.stroke();
    }
    const shield = this.game.duet.state(h);
    const outline =
      shield?.shieldUntil > this.game.time
        ? { color: "#318cff", width: 5 / s, opacity: 1 }
        : this.hover != null &&
            (this.hover === h.hp.id || this.hover === h.boxProtection?.id)
          ? { color: "#fff18a", width: 3 / s, opacity: 1 }
          : null;
    const duetState = this.game.duet.state(h);
    if (h.duetPart === "oka" && duetState?.flight)
      c.translate(
        0,
        -Math.sin(
          Math.min(
            1,
            (this.game.time - duetState.flight.start) /
              Math.max(0.001, duetState.flight.duration),
          ) * Math.PI,
        ) * 35,
      );
    if (h.duetPart === "oka" && duetState?.mounted) {
      const target = duetState.mounted.target;
      const pose = this.heroAnimator.manifest[target.role]?.idle;
      c.translate(
        0,
        -(pose ? pose.height * Math.max(0, pose.anchorY - 0.2) + 4 : 59),
      );
    }
    const animated = this.heroAnimator.draw(c, h, outline);
    if (h.role === "duet" && !h.duetRoot && duetState) {
      const joining = !duetState.split && duetState.mergeAt != null;
      const started = joining ? duetState.mergeAt : duetState.splitAt;
      const progress = (this.game.time - started) / 0.65;
      if (started != null && progress >= 0 && progress < 1) {
        const gap = (joining ? 1 - progress : progress) * 22;
        c.save();
        c.globalAlpha *= Math.sin(progress * Math.PI);
        c.translate(0, -65);
        for (const side of [-1, 1]) {
          c.save();
          c.translate(0, side * gap);
          c.beginPath();
          c.moveTo(-20, side * 18);
          c.lineTo(20, side * 18);
          c.lineTo(20, 0);
          for (let x = 16; x >= -20; x -= 4) c.lineTo(x, x % 8 ? 2 : -2);
          c.closePath();
          c.fillStyle = "#fff2cf";
          c.fill();
          c.strokeStyle = "#9b7150";
          c.lineWidth = 0.8;
          c.stroke();
          for (let x = -10; x <= 10; x += 10) {
            c.beginPath();
            c.moveTo(x, side * 3);
            c.lineTo(x, side * 15);
            c.stroke();
          }
          c.restore();
        }
        c.restore();
      }
    }
    if (shield?.shieldUntil > this.game.time)
      this.label(0, -85, `◈ ${shield.queue.length}`, "#69baff", 12);
    if (h.duel) this.label(0, -100, "ДУЭЛЬ", "#e8c66a", 12);
    if (h.dead) {
      c.restore();
      return;
    }
    if (
      h.pencilBrokenUntil > time &&
      this.pencilImage?.complete &&
      this.pencilImage.naturalWidth
    ) {
      const a = BROKEN_PENCIL_ANIMATION;
      const frame =
        Math.floor(((time - h.pencilBrokenAt) * 1000) / a.frameMs) % a.frames;
      const crop = a.sourceFrames[frame];
      c.drawImage(
        this.pencilImage,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        -a.width / 2,
        a.offsetY,
        a.width,
        a.height,
      );
      this.label(
        0,
        a.timerY,
        Math.ceil(h.pencilBrokenUntil - time) + " с",
        "#fff5d9",
        7,
      );
    }
    if (!animated) {
      if (h.role === "editor")
        this.poly(
          [
            [-24, 2],
            [25, -7],
            [1, 15],
            [-3, 6],
          ],
          "#eee2f1",
          "#856f93",
        );
      c.translate(0, bob);
      this.poly(
        [
          [-7, -8],
          [-2, -8],
          [-3, 3],
          [-8, 3],
        ],
        "#d3bd82",
        "#46664a",
      );
      this.poly(
        [
          [3, -7],
          [8, -7],
          [9, 2],
          [4, 3],
        ],
        "#d3bd82",
        "#46664a",
      );
      this.poly(
        [
          [-9, -23],
          [8, -24],
          [13, -6],
          [0, -2],
          [-12, -8],
        ],
        col,
        "#345d42",
      );
      this.poly(
        [
          [-9, -23],
          [-2, -16],
          [-5, -6],
          [-12, -8],
        ],
        h.team ? "#d49271" : "#92b17e",
        null,
      );
      this.poly(
        [
          [-11, -40],
          [8, -43],
          [13, -24],
          [-7, -19],
        ],
        "#fae6b8",
        "#466047",
      );
      this.poly(
        [
          [-15, -37],
          [-9, -49],
          [6, -52],
          [15, -40],
          [-4, -34],
        ],
        col,
        "#375e41",
      );
      this.poly(
        [
          [-9, -49],
          [-1, -42],
          [-4, -34],
          [-15, -37],
        ],
        h.team ? "#db9b7a" : "#9ab97e",
        null,
      );
      c.fillStyle = "#334d39";
      c.fillRect(-5, -32, 2.5, 3);
      c.fillRect(5, -34, 2.5, 3);
      c.strokeStyle = "#3c593d";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-1, -25);
      c.lineTo(4, -26);
      c.stroke();
      this.poly(
        [
          [12, -14],
          [17, -37],
          [20, -33],
          [16, -12],
        ],
        "#d9b76b",
        "#566a47",
      );
      if (h.team)
        this.poly(
          [
            [17, -37],
            [20, -45],
            [23, -37],
            [20, -33],
          ],
          "#b9654e",
          "#566a47",
        );
      else
        this.poly(
          [
            [17, -37],
            [22, -46],
            [22, -37],
            [20, -33],
          ],
          "#edf1cb",
          "#566a47",
        );
      if (h.role === "intellect") {
        c.strokeStyle = "#426d95";
        c.lineWidth = 1.5;
        c.strokeRect(-7, -34, 6, 6);
        c.strokeRect(3, -36, 6, 6);
      }
    }
    if (!h.dead && h.prison?.until > this.game.time) {
      if (!animated) {
        c.strokeStyle = "#82b923";
        c.lineWidth = 2;
        c.strokeRect(-30, -58, 60, 66);
        for (let i = 1; i < 4; i++) {
          c.beginPath();
          c.moveTo(-30 + i * 15, -58);
          c.lineTo(-30 + i * 15, 8);
          c.stroke();
          c.beginPath();
          c.moveTo(-30, -58 + i * 16.5);
          c.lineTo(30, -58 + i * 16.5);
          c.stroke();
        }
      }
      this.label(
        0,
        -90,
        `КОРОБКА ${Math.ceil(h.prison.until - this.game.time)} с`,
        "#6c9d16",
        10,
      );
    }
    if (this.game.abduction.carried(h) || h.stunnedUntil > this.game.time) {
      for (let i = 0; i < 3; i++) {
        const angle = time * 4 + (i * Math.PI * 2) / 3;
        this.label(
          Math.cos(angle) * 25,
          -78 + Math.sin(angle) * 8,
          "✦",
          "#e8ad36",
          18,
        );
      }
      if (!this.game.abduction.carried(h))
        this.label(
          0,
          -94,
          `СТАН ${(h.stunnedUntil - this.game.time).toFixed(1)} с`,
          "#a94d39",
          12,
        );
    }
    if (
      h.role !== "agile" &&
      h.role !== "strong" &&
      h.role !== "intellect" &&
      h.role !== "combinator" &&
      h.role !== "sudaks" &&
      h.role !== "editor" &&
      h.role !== "sudzh" &&
      h.role !== "duet"
    )
      this.label(0, -12, role?.symbol || "✦", role?.color || "#f5e4b3", 13);
    this.label(
      0,
      h.role === "duet" ? -104 : -59,
      h === this.game.player ? "ВЫ" : h.name,
      col,
      h === this.game.player ? 10 : 8,
    );
    const healthBarY = h.role === "duet" ? -92 : -73;
    c.fillStyle = "#553f3b";
    c.fillRect(-23, healthBarY, 46, 6);
    c.fillStyle = h.team ? "#dc7964" : "#7dbb68";
    c.fillRect(
      -22,
      healthBarY + 1,
      (44 * this.game.combat.hpLeft(h)) / this.game.combat.healthCapacity(h),
      4,
    );
    this.heroAnimator.drawSolvingOverlay(c, h, outline);
    if (this.game.time < h.nextNormal) {
      c.fillStyle = "#dbe3c4";
      c.fillRect(-10, 10, 20, 2);
      c.fillStyle = col;
      c.fillRect(
        -10,
        10,
        20 *
          (1 -
            (h.nextNormal - this.game.time) /
              (h.lastCooldown || CONFIG.normalCooldown)),
        2,
      );
    }
    c.restore();
  }
  confetti(t, team) {
    if (!t || !this.game.vision.visible(this.game.player.team, t)) return;
    const p = this.p(t.x, t.y);
    for (let i = 0; i < 45; i++)
      this.particles.push({
        x: p.x,
        y: p.y - 20,
        vx: (Math.random() - 0.5) * 180,
        vy: -60 - Math.random() * 130,
        life: 2.5,
        color: [team ? "#c77558" : "#578263", "#eed291", "#f7f0d5"][i % 3],
        angle: Math.random() * 6,
      });
  }
  draw(time, dt) {
    if (this.follow)
      this.camera = { x: this.game.player.x, y: this.game.player.y };
    const c = this.ctx,
      w = this.width,
      h = this.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#e7e9d9";
    c.fillRect(0, 0, w, h);
    const grad = c.createRadialGradient(
      w * 0.5,
      h * 0.45,
      0,
      w * 0.5,
      h * 0.5,
      w * 0.7,
    );
    grad.addColorStop(0, "#f2f0dc");
    grad.addColorStop(1, "#d9e0cc");
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
    if (this.game.sandbox) {
      this.worldPoly(
        [
          [35, 35],
          [65, 35],
          [65, 65],
          [35, 65],
        ],
        "#b9cb98",
        "#7d956f",
        1.5,
      );
      this.path(
        [
          [42, 50],
          [58, 50],
        ],
        "#ddcf9c",
        2.5,
      );
    } else {
      this.worldPoly(
        [
          [0, 0, -12],
          [100, 0, -12],
          [100, 100, -12],
          [0, 100, -12],
        ],
        "#79916c",
        null,
      );
      this.worldPoly(
        [
          [0, 100, 0],
          [100, 100, 0],
          [100, 100, -12],
          [0, 100, -12],
        ],
        "#a5a17a",
        "#8e9870",
      );
      this.worldPoly(
        [
          [100, 0, 0],
          [100, 100, 0],
          [100, 100, -12],
          [100, 0, -12],
        ],
        "#969770",
        "#84926a",
      );
      this.worldPoly(
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
        "#b9cb98",
        "#7d956f",
        1.5,
      );
      for (let i = 3; i < 99; i += 3)
        this.path(
          [
            [i, 100],
            [i + 1, 100],
          ],
          "#d0c49a",
          0.5,
        );
      this.worldPoly(
        [
          [18, 20],
          [42, 14],
          [46, 34],
          [35, 50],
          [19, 62],
          [17, 42],
        ],
        "#a4be88",
        null,
      );
      this.worldPoly(
        [
          [52, 18],
          [76, 16],
          [80, 40],
          [67, 48],
          [52, 39],
        ],
        "#a3bd88",
        null,
      );
      this.worldPoly(
        [
          [20, 62],
          [39, 51],
          [51, 70],
          [40, 82],
          [19, 83],
        ],
        "#a4bf88",
        null,
      );
      this.worldPoly(
        [
          [62, 54],
          [80, 48],
          [84, 80],
          [60, 83],
          [52, 70],
        ],
        "#a2bc85",
        null,
      );
      for (const points of LANES) {
        this.path(points, "#8c9f72", 6.3);
        this.path(points, "#dfd5ab", 5.7);
        this.path(points, "#e9dfb8", 3.9);
      }
      for (const tr of TRAILS) {
        this.path(tr, "#8ea875", 2.9);
        this.path(tr, "#cbd2a0", 2.4);
        this.path(tr, "#e1dab2", 0.25, [3, 5]);
      }
      this.path(
        [
          [34, 0],
          [35, 12],
          [43, 29],
          [47, 41],
          [52, 53],
          [59, 66],
          [63, 85],
          [66, 100],
        ],
        "#759b83",
        4,
      );
      this.path(
        [
          [34, 0],
          [35, 12],
          [43, 29],
          [47, 41],
          [52, 53],
          [59, 66],
          [63, 85],
          [66, 100],
        ],
        "#8fb9ad",
        3.1,
      );
      this.path(
        [
          [34, 0],
          [35, 12],
          [43, 29],
          [47, 41],
          [52, 53],
          [59, 66],
          [63, 85],
          [66, 100],
        ],
        "#bdd2b8",
        0.4,
      );
      for (const [x, y] of [
        [35, 10],
        [50, 50],
        [64, 90],
      ]) {
        this.worldPoly(
          [
            [x - 5, y - 3],
            [x + 5, y - 3],
            [x + 5, y + 3],
            [x - 5, y + 3],
          ],
          "#cdbb8c",
          "#7d8c65",
        );
        for (let i = -4; i < 5; i += 2)
          this.path(
            [
              [x + i, y - 3],
              [x + i, y + 3],
            ],
            "#9b966b",
            0.2,
          );
      }
      for (const camp of this.game.camps) this.campBiome(camp);
      for (const g of this.grass) {
        if (
          Math.abs(g.x + g.y - 100) < 5 ||
          g.x < 14 ||
          g.y < 14 ||
          g.x > 87 ||
          g.y > 87
        )
          continue;
        const p = this.p(
          g.x * CONFIG.mapMultiplier,
          g.y * CONFIG.mapMultiplier,
        );
        if (
          p.x < -5 ||
          p.x > this.width + 5 ||
          p.y < 0 ||
          p.y > this.height + 5
        )
          continue;
        c.strokeStyle = g.s > 0.5 ? "#73996588" : "#e4e4b7aa";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(p.x - 2, p.y);
        c.lineTo(p.x - 3, p.y - 4);
        c.moveTo(p.x, p.y);
        c.lineTo(p.x + 1, p.y - 5);
        c.stroke();
      }
    }
    if (this.marker) {
      const p = this.p(this.marker.x, this.marker.y);
      c.strokeStyle = "#faf4c9";
      c.lineWidth = 2;
      const pulse = 12 + Math.sin(time * 5) * 2;
      c.beginPath();
      c.ellipse(p.x, p.y, pulse, pulse * 0.5, 0, 0, Math.PI * 2);
      c.stroke();
      if (time - this.marker.time > 2) this.marker = null;
    }
    const player = this.game.player;
    if (player.target) {
      this.path(
        [
          [player.x, player.y],
          [player.target.x, player.target.y],
        ],
        "#fff5d799",
        0.12,
        [3, 7],
        true,
      );
    }
    for (const tower of this.game.towers
      .map((t) => this.game.vision.appearance(this.game.player.team, t))
      .filter((t) => !t.destroyed)) {
      const points = Array.from({ length: 49 }, (_, i) => {
        const a = (i * Math.PI * 2) / 48;
        return [
          tower.x + Math.cos(a) * COMBAT.attackRadius,
          tower.y + Math.sin(a) * COMBAT.attackRadius,
        ];
      });
      this.path(
        points,
        tower.defender ? "#bc665877" : "#56865b66",
        0.3,
        [5, 4],
        true,
      );
    }
    for (const zone of this.game.heroEffects.acidZones) {
      const points = Array.from({ length: 49 }, (_, i) => {
        const a = (i * Math.PI * 2) / 48;
        return [
          zone.x + Math.cos(a) * zone.radius,
          zone.y + Math.sin(a) * zone.radius,
        ];
      });
      c.save();
      c.beginPath();
      points.forEach(([x, y], i) => {
        const p = this.p(x, y);
        if (i) c.lineTo(p.x, p.y);
        else c.moveTo(p.x, p.y);
      });
      c.closePath();
      c.fillStyle = "#8aaa3e66";
      c.fill();
      c.restore();
      if (this.acidImage?.complete && this.acidImage.naturalWidth) {
        const projected = points.map(([x, y]) => this.p(x, y));
        const minX = Math.min(...projected.map((p) => p.x)),
          maxX = Math.max(...projected.map((p) => p.x));
        const minY = Math.min(...projected.map((p) => p.y)),
          maxY = Math.max(...projected.map((p) => p.y));
        const a = ACID_POOL_ANIMATION,
          frame = Math.floor((time * 1000) / a.frameMs) % a.frames;
        const sx = this.acidImage.naturalWidth / a.sourceAssetWidth,
          sy = this.acidImage.naturalHeight / a.sourceAssetHeight;
        c.save();
        c.imageSmoothingEnabled = false;
        c.drawImage(
          this.acidImage,
          frame * 362 * sx,
          180 * sy,
          362 * sx,
          340 * sy,
          minX,
          minY,
          maxX - minX,
          maxY - minY,
        );
        c.restore();
      }
      this.path(points, "#a5cf45", 0.6, [], true);
    }
    for (const hero of this.game.heroes.filter((h) => h.stench && !h.dead)) {
      if (!this.game.vision.visible(player.team, hero)) continue;
      const radius = this.game.skill(hero, "stench").radius;
      this.path(
        Array.from({ length: 49 }, (_, i) => [
          hero.x + Math.cos((i * Math.PI) / 24) * radius,
          hero.y + Math.sin((i * Math.PI) / 24) * radius,
        ]),
        "#87994099",
        1,
        [3, 3],
        true,
      );
    }
    if (this.fireballAim) {
      const point = this.fireballAim;
      const acid = point.acid ? this.game.skill(player, "acid") : null;
      const hook = point.hook
        ? this.game.skill(player, "hook")
        : point.duet
          ? this.game.skill(player, "headOn")
          : null;
      const circle = (center, radius) =>
        Array.from({ length: 49 }, (_, i) => {
          const a = (i * Math.PI * 2) / 48;
          return [
            center.x + Math.cos(a) * radius,
            center.y + Math.sin(a) * radius,
          ];
        });
      this.path(
        circle(player, hook?.range || acid?.range || FIRE.ballRange),
        "#df963baa",
        0.35,
        [4, 3],
        true,
      );
      if (!point.hook && !point.duet)
        this.path(
          circle(point, acid?.radius || FIRE.ballRadius),
          "#ed7139",
          0.7,
          [],
          true,
        );
      const p = this.p(point.x, point.y),
        charges = this.game.fire.charges(player)?.count || 0;
      c.save();
      c.font = "bold 14px sans-serif";
      c.fillStyle = "#fff0b2";
      c.strokeStyle = "#553420";
      c.lineWidth = 3;
      const text = point.duet
        ? "Лоб в лоб"
        : point.hook
          ? "Крюк"
          : point.acid
            ? "Кислотная зона"
            : `Шар: ${charges}/3 зарядов`;
      if (hook) {
        const distance =
          Math.hypot(point.x - player.x, point.y - player.y) || 1;
        this.path(
          [
            [player.x, player.y],
            [
              player.x + ((point.x - player.x) / distance) * hook.range,
              player.y + ((point.y - player.y) / distance) * hook.range,
            ],
          ],
          "#babb8a",
          1,
          [3, 3],
        );
      }
      c.strokeText(text, p.x, p.y - 18);
      c.fillText(text, p.x, p.y - 18);
      for (const { hero, count } of point.acid || point.hook || point.duet
        ? []
        : this.game.fire.distribution(player, point, charges, true)) {
        const at = this.unitPoint(hero),
          label = `${hero.name}: ${count}`;
        c.strokeText(label, at.x, at.y - 80 * this.spriteScale);
        c.fillText(label, at.x, at.y - 80 * this.spriteScale);
      }
      c.restore();
    }
    for (const event of recentFireballCasts(this.game.events, this.game.time)) {
      const progress = Math.max(
          0,
          (this.game.time - event.time) / FIRE.castDelay,
        ),
        p = this.p(
          event.fromX + (event.x - event.fromX) * progress,
          event.fromY + (event.y - event.fromY) * progress,
        );
      c.save();
      c.fillStyle = "#ffb52f";
      c.shadowColor = "#ef5328";
      c.shadowBlur = 14;
      c.beginPath();
      c.arc(p.x, p.y - 20, 10, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    const skillRadius =
      this.allySkillTargeting.radius || this.skillPreviewRadius;
    if (skillRadius > 0) {
      const points = Array.from({ length: 49 }, (_, i) => {
        const a = (i * Math.PI * 2) / 48;
        return [
          player.x + Math.cos(a) * skillRadius,
          player.y + Math.sin(a) * skillRadius,
        ];
      });
      this.path(points, "#f0c45caa", 0.35, [4, 3], true);
    }
    for (const hero of this.game.heroes) {
      const partner = this.game.heroes.find(
        (h) => h.id === hero.lasso?.partner,
      );
      if (
        !partner ||
        hero.id > partner.id ||
        !this.game.lassoActive(hero, partner) ||
        !this.game.vision.visible(player.team, hero) ||
        !this.game.vision.visible(player.team, partner)
      )
        continue;
      const rope = [
        [hero.x, hero.y],
        [partner.x, partner.y],
      ];
      this.path(rope, "#5b4028cc", 0.85, [], true);
      this.path(rope, "#d6b77cdd", 0.28, [3, 2], true);
    }
    const visibleHeroes = this.game.actors().filter((h) => this.heroVisible(h));
    const objects = [
      ...(this.game.sandbox ? [] : this.trees)
        .filter((t) => this.treeOnScreen(t))
        .map((t) => ({
          depth: t.x + t.y,
          draw: () => this.tree(t),
        })),
      ...this.game.locations
        .filter((t) => t.kind !== "core")
        .map((t) => ({ depth: t.x + t.y, draw: () => this.book(t, time) })),
      ...(this.game.sandbox
        ? []
        : BASES.map((b, i) => ({
            depth: b.x + b.y,
            draw: () => this.base(i),
          }))),
      ...this.game.wards
        .active()
        .filter((ward) => this.game.vision.visible(player.team, ward))
        .map((ward) => ({
          depth: ward.x + ward.y,
          draw: () => this.ward(ward, time),
        })),
      ...this.game.erasers
        .ground()
        .filter((item) => this.game.erasers.visible(player.team, item))
        .map((item) => ({
          depth: item.x + item.y,
          draw: () => this.eraserDrop(item),
        })),
      ...visibleHeroes
        .filter(
          (h) => !(h.duetPart === "oka" && this.game.duet.state(h)?.mounted),
        )
        .map((h) => ({
          depth: h.x + h.y + 0.1,
          draw: () => this.hero(h, time),
        })),
      ...this.game.combat.creeps
        .filter(
          (u) =>
            this.creepOnScreen(u) &&
            (u.dead || this.game.vision.visible(this.game.player.team, u)),
        )
        .map((u) => ({
          depth: u.x + u.y,
          draw: () => this.creep(u, time),
        })),
    ].sort((a, b) => a.depth - b.depth);
    for (const o of objects) o.draw();
    for (const d of [...this.game.duet.duels, ...this.game.duet.duelRemains])
      if (
        d.participants.some(
          (h) =>
            h.team === player.team || this.game.vision.visible(player.team, h),
        )
      )
        this.duelSprite(d, time, d.ashesAt != null);
    for (const h of visibleHeroes)
      if (h.duetPart === "oka" && this.game.duet.state(h)?.mounted)
        this.hero(h, time);
    for (const courier of this.game.couriers)
      if (
        courier.state !== "idle" &&
        this.game.vision.visible(this.game.player.team, courier)
      )
        this.courier(courier, time);
    if (
      this.game.flower?.active &&
      this.game.vision.visible(this.game.player.team, this.game.flower)
    )
      this.flower(this.game.flower, time);
    if (this.game.help) {
      const t = this.game.attackTarget(this.game.help.index, 0),
        p = this.p(t.x, t.y);
      this.label(p.x, p.y - 65, "! НУЖНА ПОМОЩЬ", "#9b7136", 11);
    }
    for (const part of this.particles) {
      part.life -= dt;
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.vy += 110 * dt;
      part.angle += dt * 4;
      c.save();
      c.globalAlpha = Math.min(1, part.life);
      c.translate(part.x, part.y);
      c.rotate(part.angle);
      c.fillStyle = part.color;
      c.fillRect(-3, -2, 6, 4);
      c.restore();
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const h of visibleHeroes) if (h.dead) this.deathSoul(h);
    this.drawHooks();
    this.drawFog(this.ctx, this.width, this.height);
    if (this.eraserSelection) this.drawEraserTargets();
    this.drawWardPreview(time);
    if (this.mini && (!this.lastMiniAt || time - this.lastMiniAt >= 0.15)) {
      this.drawMini();
      this.lastMiniAt = time;
    }
  }
  drawHooks() {
    const c = this.ctx,
      scale = this.spriteScale * 4;
    for (const hook of this.game.sudzh.hooks) {
      if (!this.game.vision.visible(this.game.player.team, hook.hero)) continue;
      const from = this.unitPoint(hook.hero),
        to = this.p(hook.x, hook.y);
      c.save();
      const startY = from.y - 28 * scale,
        endY = to.y - 24 * scale,
        dx = to.x - from.x,
        dy = endY - startY,
        length = Math.hypot(dx, dy),
        angle = Math.atan2(dy, dx),
        spacing = Math.max(8, 6 * scale);
      c.save();
      c.translate(from.x, startY);
      c.rotate(angle);
      c.setLineDash([]);
      for (
        let distance = 0, link = 0;
        distance < length;
        distance += spacing, link++
      ) {
        c.beginPath();
        c.ellipse(
          distance,
          0,
          spacing * 0.64,
          (link % 2 ? 1.3 : 2.8) * scale,
          0,
          0,
          Math.PI * 2,
        );
        c.strokeStyle = "#35434b";
        c.lineWidth = Math.max(2, 2.4 * scale);
        c.stroke();
        c.strokeStyle = link % 2 ? "#8d9ba2" : "#d6e0e5";
        c.lineWidth = Math.max(1, 1.1 * scale);
        c.stroke();
      }
      c.restore();
      c.translate(to.x, to.y - 24 * scale);
      c.rotate(Math.atan2(to.y - from.y, to.x - from.x));
      c.imageSmoothingEnabled = false;
      if (this.hookImage?.complete && this.hookImage.naturalWidth)
        c.drawImage(
          this.hookImage,
          (-HOOK_ANIMATION.width * scale) / 2,
          (-HOOK_ANIMATION.height * scale) / 2,
          HOOK_ANIMATION.width * scale,
          HOOK_ANIMATION.height * scale,
        );
      c.restore();
    }
  }
  unitPoint(u) {
    const point = this.p(u.x, u.y);
    if (u.abduction) {
      point.y -= 140 * this.spriteScale;
      point.x += 60 * this.spriteScale;
    }
    return point;
  }
  eraserDrop(item) {
    const c = this.ctx,
      p = this.p(item.x, item.y),
      s = this.spriteScale;
    c.save();
    c.translate(p.x, p.y - 12 * s);
    c.scale(s, s);
    this.poly(
      [
        [-14, 0],
        [-4, -14],
        [14, -6],
        [4, 8],
      ],
      "#efc3b4",
      C.ink,
      2,
    );
    this.poly(
      [
        [-14, 0],
        [-4, -14],
        [1, -12],
        [-9, 2],
      ],
      "#c8d3bc",
      C.ink,
    );
    c.restore();
  }
  drawEraserTargets() {
    const player = this.game.player,
      c = this.ctx;
    for (const target of [
      ...this.game.actors(),
      ...this.game.towers,
      ...this.game.wards.active(),
    ]) {
      if (!this.game.erasers.access(player, target).ok) continue;
      const p = this.p(target.x, target.y),
        modelScale = target.kind === "ward" ? 1 : 2;
      c.beginPath();
      c.ellipse(
        p.x,
        p.y,
        44 * this.spriteScale * modelScale,
        22 * this.spriteScale * modelScale,
        0,
        0,
        Math.PI * 2,
      );
      c.fillStyle = "#f0c45c44";
      c.fill();
      c.strokeStyle = "#e6bd54";
      c.lineWidth = 2;
      c.stroke();
    }
  }
  drawWardPreview(time) {
    const player = this.game.player,
      preview = this.wardPreview,
      point = preview?.screen
        ? this.unproject(preview.screen.x, preview.screen.y)
        : preview || player.wardPlacement;
    if (!point || player.dead) return;
    const source = this.game.vision.wardSource(point);
    this.ctx.save();
    this.clipSight(this.ctx, source);
    this.clipForest(this.ctx, source.region);
    const center = this.p(point.x, point.y);
    this.ctx.beginPath();
    this.ctx.ellipse(
      center.x,
      center.y,
      source.radius * Math.SQRT2 * this.scale,
      source.radius * Math.SQRT2 * this.scale * 0.51,
      0,
      0,
      Math.PI * 2,
    );
    this.ctx.fillStyle = "#f0c45c22";
    this.ctx.fill();
    const points = Array.from({ length: 49 }, (_, i) => {
      const angle = (i * Math.PI * 2) / 48;
      return [
        point.x + Math.cos(angle) * source.radius,
        point.y + Math.sin(angle) * source.radius,
      ];
    });
    this.path(points, "#f0c45cdd", 0.5, [4, 3], true);
    this.ctx.restore();
    this.ward({ ...point, defender: player.team }, time, 0.55);
    this.label(
      center.x,
      center.y + 20,
      `Обзор: ${source.radius}${source.region ? " · лес" : ""}`,
      C.ink,
      12,
    );
  }
  ward(ward, time, opacity = 1) {
    const { file, top, height } = WARDS.sprites[ward.defender],
      image = this.wardImages.get(file),
      c = this.ctx,
      point = this.p(ward.x, ward.y),
      size = WARDS.spriteSize * this.spriteScale;
    c.save();
    c.globalAlpha = Math.min(1, opacity * 2);
    if (image?.complete && image.naturalWidth) {
      const width = image.naturalWidth / WARDS.spriteFrames,
        frame =
          Math.floor((time * 1000) / WARDS.spriteFrameMs) % WARDS.spriteFrames;
      c.imageSmoothingEnabled = false;
      c.drawImage(
        image,
        frame * width,
        top,
        width,
        height,
        point.x - size / 2,
        point.y - size,
        size,
        size,
      );
    } else
      this.label(
        point.x,
        point.y - size / 2,
        "◎",
        ward.defender ? C.red : C.green,
        size,
      );
    if (opacity === 1)
      this.label(
        point.x,
        point.y - size - 5,
        `${Math.ceil(this.game.wards.status(ward).lifetime)} с`,
        ward.defender ? C.red : C.green,
        11,
      );
    c.restore();
  }
  creepSprite(u, time) {
    const team = CREEP_ANIMATION_TEAMS[u.team],
      file = creepAnimationFile(u, this.game.combat),
      image = this.creepImages.get(`${team}/${file}`);
    if (!image?.complete || !image.naturalWidth) return false;
    const frameWidth = image.naturalWidth / CREEP_ANIMATION_FRAMES,
      startedAt = u.dead ? u.deathAt || time : 0,
      elapsedMs = Math.max(0, (time - startedAt) * 1000),
      rawFrame = Math.floor(
        elapsedMs /
          (u.dead ? CREEP_ANIMATION_FRAME_MS * 2 : CREEP_ANIMATION_FRAME_MS),
      ),
      frame = u.dead
        ? Math.min(CREEP_ANIMATION_FRAMES - 1, rawFrame)
        : (rawFrame + u.id) % CREEP_ANIMATION_FRAMES,
      c = this.ctx,
      p = this.unitPoint(u),
      s = this.spriteScale * 4 * 1.3;
    c.save();
    c.translate(p.x, p.y);
    c.scale(u.team ? -s : s, s);
    c.imageSmoothingEnabled = false;
    c.drawImage(
      image,
      frame * frameWidth,
      0,
      frameWidth,
      image.naturalHeight,
      -9.1,
      -36.4,
      18.2,
      36.4,
    );
    if (!u.dead && typeof document !== "undefined") {
      const lost = Math.max(
        0,
        1 -
          this.game.combat.hpLeft(u) /
            Math.max(1, u.spawnHp || this.game.combat.hpLeft(u)),
      );
      if (lost > 0) {
        const layer = (this.creepTint ||= document.createElement("canvas"));
        const maskWidth = Math.max(1, Math.ceil(18.2 * s));
        const maskHeight = Math.max(1, Math.ceil(36.4 * s));
        if (layer.width !== maskWidth || layer.height !== maskHeight) {
          layer.width = maskWidth;
          layer.height = maskHeight;
        }
        const mask = layer.getContext("2d");
        mask.clearRect(0, 0, layer.width, layer.height);
        mask.globalCompositeOperation = "source-over";
        mask.imageSmoothingEnabled = false;
        mask.drawImage(
          image,
          frame * frameWidth,
          0,
          frameWidth,
          image.naturalHeight,
          0,
          0,
          layer.width,
          layer.height,
        );
        mask.globalCompositeOperation = "source-in";
        mask.fillStyle = u.team ? C.red : C.green;
        mask.fillRect(
          0,
          layer.height * (1 - lost),
          layer.width,
          layer.height * lost,
        );
        c.globalAlpha = 0.4;
        c.drawImage(layer, -9.1, -36.4, 18.2, 36.4);
      }
    }
    c.restore();
    return true;
  }
  creep(u, time = this.game.time) {
    if (!u.dead && this.hover === u.hp.id) {
      const p = this.unitPoint(u),
        c = this.ctx;
      c.save();
      c.strokeStyle = "#fff18a";
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(
        p.x,
        p.y,
        54 * this.spriteScale,
        27 * this.spriteScale,
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
      c.restore();
    }
    if (this.creepSprite(u, time) || u.dead) return;
    const c = this.ctx,
      p = this.unitPoint(u),
      s = this.spriteScale * 4 * 1.3;
    c.save();
    c.translate(p.x, p.y);
    c.scale(s, s);
    const col = u.team ? C.red : C.green;
    this.poly(
      [
        [-9, 0],
        [-9, -20],
        [6, -25],
        [12, -8],
        [4, 2],
      ],
      "#f4e5be",
      col,
      2,
    );
    this.poly(
      [
        [6, -25],
        [6, -15],
        [12, -8],
      ],
      "#cebc91",
      col,
    );
    this.label(0, -8, "✎", col, 12);
    const lost =
      1 - this.game.combat.hpLeft(u) / this.game.combat.healthCapacity(u);
    c.save();
    c.beginPath();
    [
      [-9, 0],
      [-9, -20],
      [6, -25],
      [12, -8],
      [4, 2],
    ].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.clip();
    c.fillStyle = col;
    c.globalAlpha = 1;
    c.fillRect(-9, 2 - 27 * lost, 21, 27 * lost);
    c.restore();
    if (u.stunnedUntil > this.game.time) this.label(0, -30, "✹", "#e8aa29", 16);
    c.restore();
  }
  campBiome(t) {
    const c = this.ctx,
      p = this.p(t.x, t.y),
      s = this.spriteScale;
    c.save();
    c.translate(p.x, p.y);
    c.scale(s, s);
    this.poly(
      [
        [-58, 9],
        [-44, -21],
        [1, -33],
        [48, -16],
        [59, 12],
        [22, 37],
        [-30, 32],
      ],
      t.biome === "cave" ? "#aeb098" : "#d3d99e",
      "#91a475",
    );
    if (t.biome === "cave") {
      this.poly(
        [
          [-43, -1],
          [-52, -36],
          [-30, -65],
          [3, -74],
          [39, -56],
          [49, -8],
          [29, 8],
          [18, -33],
          [-8, -40],
          [-26, -27],
          [-24, 5],
        ],
        "#969c8d",
        "#576c58",
      );
      this.poly(
        [
          [-28, -5],
          [-18, -37],
          [7, -44],
          [25, -27],
          [29, 8],
        ],
        "#465749",
        "#3b4c41",
      );
      this.poly(
        [
          [-30, -65],
          [3, -74],
          [7, -44],
          [-18, -37],
        ],
        "#b3b4a0",
        null,
      );
    } else {
      for (let i = 0; i < 8; i++) {
        const a = i * 2.4,
          x = Math.cos(a) * 45,
          y = Math.sin(a) * 21;
        if (t.biome === "mushroom") {
          c.fillStyle = "#eee1b8";
          c.fillRect(x - 1, y - 7, 3, 9);
          this.poly(
            [
              [x - 7, y - 7],
              [x - 4, y - 13],
              [x + 4, y - 14],
              [x + 8, y - 7],
            ],
            "#ba7b68",
            "#856854",
          );
        } else {
          c.fillStyle = t.biome === "grove" ? "#9bb3c6" : "#e5c58b";
          c.beginPath();
          c.arc(x, y, 2.5, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    c.restore();
  }
  flower(t, time) {
    const c = this.ctx,
      p = this.p(t.x, t.y),
      s = this.spriteScale;
    c.save();
    c.translate(p.x, p.y - 12);
    c.scale(s, s);
    c.strokeStyle = "#7a985f";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 8);
    c.lineTo(0, -18);
    c.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.sin(time) * 0.12;
      c.fillStyle = i % 2 ? "#d49aae" : "#edc68b";
      c.beginPath();
      c.ellipse(
        Math.cos(a) * 8,
        -20 + Math.sin(a) * 8,
        7,
        4,
        a,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
    c.fillStyle = "#f8df9e";
    c.beginPath();
    c.arc(0, -20, 5, 0, Math.PI * 2);
    c.fill();
    this.label(0, -43, "ЦВЕТОК ПРАВЩИКОВ", "#89675a", 10);
    c.restore();
  }
  courier(courier, time) {
    const c = this.ctx,
      p = this.p(courier.x, courier.y);
    c.save();
    c.translate(p.x, p.y - 22 - Math.sin(time * 5) * 3);
    c.scale(this.spriteScale * 3, this.spriteScale * 3);
    const image = this.courierImages?.[courier.team];
    if (image?.complete && image.naturalWidth) {
      const frameWidth = image.naturalWidth / 6,
        frame = Math.floor((time * 1000) / 130) % 6;
      c.scale(courier.team ? -1 : 1, courier.team ? 1.3 : 1);
      c.imageSmoothingEnabled = false;
      c.drawImage(
        image,
        frame * frameWidth,
        image.naturalHeight * 0.2,
        frameWidth,
        image.naturalHeight * 0.6,
        -25,
        -20,
        50,
        36,
      );
      c.restore();
      return;
    }
    const col = courier.team ? C.red : C.green;
    this.poly(
      [
        [-22, -8],
        [28, 0],
        [-16, 16],
        [-7, 1],
      ],
      "#fff3d9",
      col,
      1.3,
    );
    this.poly(
      [
        [-7, 1],
        [28, 0],
        [-6, 8],
      ],
      "#d6c998",
      col,
    );
    this.poly(
      [
        [-22, -8],
        [2, -2],
        [-7, 1],
      ],
      "#e9dfc1",
      null,
    );
    c.restore();
  }
  creepOnScreen(u) {
    const p = this.p(u.x, u.y),
      margin = 180 * this.spriteScale;
    return (
      p.x >= -margin &&
      p.x <= this.width + margin &&
      p.y >= -margin &&
      p.y <= this.height + margin
    );
  }
  drawMini() {
    const c = this.mini.getContext("2d");
    c.clearRect(0, 0, 256, 256);
    c.fillStyle = "#dfe5cc";
    c.fillRect(0, 0, 256, 256);
    const p = (x, y) => this.miniProject(x, y);
    c.fillStyle = "#a7bd8b";
    c.strokeStyle = "#85976e";
    c.beginPath();
    [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ].forEach(([x, y], i) => {
      const q = p(x * CONFIG.mapMultiplier, y * CONFIG.mapMultiplier);
      i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y);
    });
    c.closePath();
    c.fill();
    c.stroke();
    for (const forest of this.game.forest.regions) {
      c.fillStyle = this.game.forest.isBurned(forest.id)
        ? "#776347"
        : "#527547";
      c.beginPath();
      for (const loop of forest.loops) {
        loop.forEach(([x, y], i) => {
          const q = p(x, y);
          i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y);
        });
        c.closePath();
      }
      c.fill("evenodd");
    }
    c.lineWidth = 7;
    c.strokeStyle = "#639eac";
    c.beginPath();
    RIVER.forEach(([x, y], i) => {
      const q = p(x * CONFIG.mapMultiplier, y * CONFIG.mapMultiplier);
      i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y);
    });
    c.stroke();
    c.lineWidth = 3;
    c.strokeStyle = "#e4d5aa";
    for (const arr of [
      [
        [8, 92],
        [10, 10],
        [92, 8],
      ],
      [
        [8, 92],
        [92, 8],
      ],
      [
        [8, 92],
        [90, 90],
        [92, 8],
      ],
    ]) {
      c.beginPath();
      arr.forEach(([x, y], i) => {
        const q = p(x * CONFIG.mapMultiplier, y * CONFIG.mapMultiplier);
        i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y);
      });
      c.stroke();
    }
    for (const [x, y] of [
      [35, 10],
      [50, 50],
      [64, 90],
    ]) {
      const a = p(
          (x - 5) * CONFIG.mapMultiplier,
          (y - 3) * CONFIG.mapMultiplier,
        ),
        b = p((x + 5) * CONFIG.mapMultiplier, (y + 3) * CONFIG.mapMultiplier);
      c.fillStyle = "#cdbb8c";
      c.strokeStyle = "#796a48";
      c.lineWidth = 1;
      c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      for (let plank = 1; plank < 5; plank++) {
        const at = a.x + ((b.x - a.x) * plank) / 5;
        c.beginPath();
        c.moveTo(at, a.y);
        c.lineTo(at, b.y);
        c.stroke();
      }
    }
    for (const original of this.game.locations) {
      const t = this.game.vision.appearance(this.game.player.team, original);
      const q = p(t.x, t.y);
      c.fillStyle =
        t.kind === "camp"
          ? t.respawnAt
            ? "#9aab87"
            : "#788c54"
          : t.completed[0]
            ? C.green
            : t.completed[1]
              ? C.red
              : "#f9e8b8";
      if (t.kind === "tower") {
        if (t.destroyed) continue;
        c.fillStyle = t.defender ? C.red : C.green;
        c.beginPath();
        c.arc(q.x, q.y, 3, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#fff5d9";
        c.lineWidth = 1;
        c.stroke();
      } else c.fillRect(q.x - 2, q.y - 2, 4, 4);
    }
    for (const h of this.game
      .actors()
      .filter(
        (h) => !h.dead && this.game.vision.visible(this.game.player.team, h),
      )) {
      const q = p(h.x, h.y);
      c.fillStyle = h.team ? C.red : C.green;
      c.beginPath();
      c.arc(q.x, q.y, h === this.game.player ? 22.8 : 17, 0, Math.PI * 2);
      c.fill();
      const image = this.miniHeroImages.get(h.role);
      if (image?.complete && image.naturalWidth) {
        const size = h === this.game.player ? 40 : 32;
        c.imageSmoothingEnabled = false;
        c.drawImage(image, q.x - size / 2, q.y - size / 2, size, size);
      }
      if (h === this.game.player) {
        c.strokeStyle = "#fff8da";
        c.lineWidth = 1.5;
        c.stroke();
      }
    }
    for (const courier of this.game.couriers.filter((c) =>
      this.game.vision.visible(this.game.player.team, c),
    )) {
      const q = p(courier.x, courier.y);
      c.fillStyle = "#f3d088";
      c.fillRect(q.x - 1, q.y - 1, 3, 3);
    }
    if (
      this.game.flower?.active &&
      this.game.vision.visible(this.game.player.team, this.game.flower)
    ) {
      const q = p(this.game.flower.x, this.game.flower.y);
      c.fillStyle = "#d794af";
      c.fillRect(q.x - 3, q.y - 3, 6, 6);
    }
    this.drawFog(c, 256, 256, true);
  }
  clipSight(ctx, source, mini = false) {
    const points = this.game.forest.sightPolygon(
      source.unit,
      source.radius,
      source.region || 0,
      Boolean(source.forestOnly),
    );
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      const p = mini ? this.miniProject(x, y) : this.p(x, y);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.clip();
  }
  clipForest(ctx, region, mini = false, forestOnly = false) {
    const key = [
      this.game.forest.revision,
      mini,
      this.camera.x,
      this.camera.y,
      this.scale,
      this.width,
      this.height,
    ].join(":");
    const caches = (this.forestClipCaches ||= new Map());
    let cache = caches.get(mini);
    if (!cache || cache.key !== key)
      caches.set(mini, (cache = { key, paths: new Map() }));
    const pathKey = `${region}:${forestOnly}`;
    let path = cache.paths.get(pathKey);
    if (!path) {
      path = typeof Path2D !== "undefined" ? new Path2D() : null;
      const painter = path || ctx;
      if (!path) painter.beginPath();
      if (!forestOnly)
        painter.rect(0, 0, mini ? 256 : this.width, mini ? 256 : this.height);
      for (const forest of this.game.forest.regions) {
        if (forest.id === region || this.game.forest.isBurned(forest.id))
          continue;
        for (const loop of forest.loops) {
          loop.forEach(([x, y], i) => {
            const p = mini ? this.miniProject(x, y) : this.p(x, y);
            if (i) painter.lineTo(p.x, p.y);
            else painter.moveTo(p.x, p.y);
          });
          painter.closePath();
        }
      }
      if (path) cache.paths.set(pathKey, path);
    }
    if (path) ctx.clip(path, "evenodd");
    else ctx.clip("evenodd");
  }
  drawFog(ctx, width, height, mini = false) {
    if (typeof document === "undefined") return;
    const key = mini ? "miniFog" : "fog";
    const layer = (this[key] ||= document.createElement("canvas"));
    const ratio = mini ? 1 : 0.5;
    const w = Math.ceil(width * ratio),
      h = Math.ceil(height * ratio);
    if (layer.width !== w || layer.height !== h) {
      layer.width = w;
      layer.height = h;
    }
    const c = layer.getContext("2d");
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, width, height);
    c.globalCompositeOperation = "source-over";
    c.fillStyle = "rgba(18,25,46,0.34)";
    c.fillRect(0, 0, width, height);
    c.globalCompositeOperation = "destination-out";
    this.game.vision.refresh();
    for (const {
      unit,
      radius,
      region,
      opacity = 1,
      forestOnly = false,
    } of this.game.vision.fogSources(this.game.player.team)) {
      if (unit.dead || unit.destroyed || opacity <= 0) continue;
      const p = mini
        ? this.miniProject(unit.x, unit.y)
        : this.p(unit.x, unit.y);
      const sightRadius = radius;
      const rx =
        sightRadius *
        Math.SQRT2 *
        (mini ? 240 / CONFIG.worldSize / Math.SQRT2 : this.scale);
      const ry =
        sightRadius *
        Math.SQRT2 *
        (mini ? 240 / CONFIG.worldSize / Math.SQRT2 : this.scale * 0.51);
      if (!fogSourceInView(p, rx, ry, width, height)) continue;
      c.save();
      c.globalAlpha = opacity;
      this.clipSight(c, { unit, radius, region, forestOnly }, mini);
      if (forestOnly) this.clipForest(c, 0, mini, true);
      else this.clipForest(c, region, mini);
      c.translate(p.x, p.y);
      c.scale(rx, ry);
      const gradient = c.createRadialGradient(0, 0, 0.88, 0, 0, 1.04);
      gradient.addColorStop(0, "rgba(0,0,0,1)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = gradient;
      c.beginPath();
      c.arc(0, 0, 1.04, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.globalCompositeOperation = "source-over";
    ctx.save();
    const blur = mini ? 2 : 24;
    if (typeof ctx.filter === "string") {
      ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(layer, 0, 0, width, height);
    } else {
      // Blur a smaller mask, with one-pixel taps instead of separated full-size copies.
      const blurRatio = mini ? 1 : 0.25;
      const bw = Math.ceil(width * blurRatio),
        bh = Math.ceil(height * blurRatio);
      const surfaces = (this[`${key}Blur`] ||= Array.from({ length: 3 }, () =>
        document.createElement("canvas"),
      ));
      for (const surface of surfaces) {
        if (surface.width !== bw || surface.height !== bh) {
          surface.width = bw;
          surface.height = bh;
        }
        surface.getContext("2d").clearRect(0, 0, bw, bh);
      }
      const input = surfaces[0].getContext("2d");
      const inputAlpha = input.globalAlpha;
      input.globalAlpha = 1;
      input.imageSmoothingEnabled = true;
      input.imageSmoothingQuality = "high";
      input.drawImage(layer, 0, 0, bw, bh);
      input.globalAlpha = inputAlpha;
      const sigma = blur * blurRatio;
      const reach = Math.ceil(sigma * 2);
      const weights = Array.from({ length: reach * 2 + 1 }, (_, i) =>
        Math.exp(-((i - reach) ** 2) / (2 * sigma ** 2)),
      );
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      let source = surfaces[0];
      for (let pass = 0; pass < 2; pass++) {
        const surface = surfaces[pass + 1],
          target = surface.getContext("2d");
        const savedAlpha = target.globalAlpha,
          savedOperation = target.globalCompositeOperation;
        target.globalCompositeOperation = "lighter";
        for (let i = 0; i < weights.length; i++) {
          target.globalAlpha = weights[i] / total;
          const offset = i - reach;
          target.drawImage(source, pass ? 0 : offset, pass ? offset : 0);
        }
        target.globalAlpha = savedAlpha;
        target.globalCompositeOperation = savedOperation;
        source = surface;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, 0, 0, width, height);
    }
    ctx.restore();
  }
  hit(x, y, { inspectAllies = false } = {}) {
    let best = null,
      distance = Infinity;
    for (const t of [
      ...(this.allySkillTargeting.active
        ? this.allySkillTargeting.id === "veil"
          ? this.game.towers.filter(
              (t) => t.defender === this.game.player.team && !t.destroyed,
            )
          : []
        : this.game.locations),
      ...this.game.wards
        .active()
        .filter((ward) =>
          this.game.vision.visible(this.game.player.team, ward),
        ),
      ...this.game.erasers
        .ground()
        .filter((item) =>
          this.game.erasers.visible(this.game.player.team, item),
        ),
      ...this.game.combat
        .units()
        .filter(
          (u) =>
            (this.allySkillTargeting.active
              ? this.allySkillTargeting.accepts(u)
              : inspectAllies ||
                this.eraserSelection ||
                u.team !== this.game.player.team) &&
            this.game.vision.visible(this.game.player.team, u),
        )
        .map((u) =>
          !inspectAllies &&
          !this.allySkillTargeting.active &&
          this.game.heroEffects.protected(u)
            ? u.boxProtection
            : u.hp,
        ),
      ...(this.game.flower?.active ? [this.game.flower] : []),
    ]) {
      if (
        this.allySkillTargeting.active &&
        t.kind !== "health" &&
        !(this.allySkillTargeting.id === "veil" && t.kind === "tower")
      )
        continue;
      const enlarged =
          t.kind === "tower" || t.kind === "health" || t.protective,
        modelScale = enlarged ? 4 : t.kind === "camp" ? 2.5 : 1,
        p = t.unit ? this.unitPoint(t.unit) : this.p(t.x, t.y),
        offset =
          t.kind === "tower"
            ? (18 + t.step * 9) * this.spriteScale * modelScale
            : t.kind === "core"
              ? 35 * this.spriteScale
              : t.kind === "health" || t.protective
                ? 20 * this.spriteScale * modelScale
                : t.kind === "ward"
                  ? (WARDS.spriteSize / 2) * this.spriteScale
                  : t.kind === "camp"
                    ? 12 * this.spriteScale * modelScale
                    : t.kind === "eraser-drop"
                      ? 12 * this.spriteScale
                      : 12,
        isHero = t.kind === "health" && t.unit?.kind !== "creep",
        d = Math.hypot(
          (p.x - x) * (isHero ? 2 : 1),
          (p.y - y - (isHero ? 140 * this.spriteScale : offset)) /
            (isHero ? 2 : 1),
        );
      if (
        d < Math.max(23, this.spriteScale * 32 * modelScale) &&
        d < distance
      ) {
        best = t;
        distance = d;
      }
    }
    return best;
  }
}
