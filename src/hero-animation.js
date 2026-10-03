import {
  SUD_ANIMATIONS,
  OKA_ANIMATIONS,
  DUEL_ANIMATIONS,
} from "./animations/duet.js";
import {
  HERO_ANIMATION_STATES,
  EDITOR_ANIMATION_STATES,
  COMBAT_ANIMATION_SPEED,
  COMBAT_STATES,
  TRAPPED_ANIMATION,
  BOX_PROTECTION_ANIMATION,
  BOX_PROTECTION_ANIMATIONS,
  SOUL_ANIMATION,
  HERO_ANIMATION_MANIFEST,
} from "./animations/manifest.js";
// Preserve existing imports used by the scoreboard and rendering tests.
export {
  HERO_ANIMATION_STATES,
  HERO_ANIMATION_MANIFEST,
} from "./animations/manifest.js";

export function validateHeroAnimationManifest(
  manifest = HERO_ANIMATION_MANIFEST,
) {
  const errors = [];
  for (const [role, animations] of Object.entries(manifest)) {
    for (const state of role === "editor"
      ? EDITOR_ANIMATION_STATES
      : HERO_ANIMATION_STATES) {
      const animation = animations[state];
      if (!animation) errors.push(`${role}.${state}: отсутствует описание`);
      else if (!Number.isInteger(animation.frames) || animation.frames < 1)
        errors.push(`${role}.${state}: frames должно быть целым числом ≥ 1`);
      else if (!(animation.frameMs > 0))
        errors.push(`${role}.${state}: frameMs должно быть больше нуля`);
    }
  }
  return errors;
}

export class HeroAnimator {
  constructor(game, manifest = HERO_ANIMATION_MANIFEST) {
    this.game = game;
    this.manifest = manifest;
    this.images = new Map();
    this.outlineMasks = new Map();
    this.heroes = new Map();
    this.eventCursor = 0;
    if (typeof Image !== "undefined") this.preload();
  }

  preload() {
    for (const animations of [
      ...Object.values(this.manifest),
      SUD_ANIMATIONS,
      OKA_ANIMATIONS,
      DUEL_ANIMATIONS,
    ]) {
      for (const animation of Object.values(animations)) {
        if (!animation.file || this.images.has(animation.file)) continue;
        const image = new Image();
        image.src =
          globalThis.SUDOTA_HERO_ASSETS?.[animation.file] ||
          `assets/heroes/${animation.file}`;
        this.images.set(animation.file, image);
      }
    }
    for (const animation of Object.values(BOX_PROTECTION_ANIMATIONS)) {
      const image = new Image();
      image.src =
        globalThis.SUDOTA_HERO_ASSETS?.[animation.file] ||
        `assets/heroes/${animation.file}`;
      this.images.set(animation.file, image);
    }
    const protectionImage = new Image();
    protectionImage.src =
      globalThis.SUDOTA_HERO_ASSETS?.[BOX_PROTECTION_ANIMATION.file] ||
      `assets/heroes/${BOX_PROTECTION_ANIMATION.file}`;
    this.images.set(BOX_PROTECTION_ANIMATION.file, protectionImage);
    const trappedImage = new Image();
    trappedImage.src =
      globalThis.SUDOTA_HERO_ASSETS?.[TRAPPED_ANIMATION.file] ||
      `assets/heroes/${TRAPPED_ANIMATION.file}`;
    this.images.set(TRAPPED_ANIMATION.file, trappedImage);
    const soulImage = new Image();
    soulImage.src =
      globalThis.SUDOTA_HERO_ASSETS?.[SOUL_ANIMATION.file] ||
      `assets/heroes/${SOUL_ANIMATION.file}`;
    this.images.set(SOUL_ANIMATION.file, soulImage);
  }

  syncEvents() {
    const events = this.game.events || [];
    for (; this.eventCursor < events.length; this.eventCursor++) {
      const event = events[this.eventCursor];
      const cast =
        event.type === "inkBindingCast"
          ? "inkCast"
          : event.type === "hookCast"
            ? "attack"
            : event.type === "tornadoEnter" || event.type === "tornadoExit"
              ? event.type
              : event.type === "runeBinding"
                ? "runeCast"
                : event.type === "battleCry"
                  ? "battleCry"
                  : event.type === "areaStun"
                    ? "stunCast"
                    : null;
      if (cast) {
        const hero = this.game.heroes[event.hero];
        if (hero && !hero.dead) this.cast(hero, cast, event.time);
        continue;
      }
      if (event.type !== "tower" && event.type !== "death") continue;
      const heroId = event.type === "tower" ? event.hero : event.killer;
      const hero = this.game.heroes[heroId];
      if (hero && !hero.dead) this.celebrate(hero, event.time);
    }
  }

  cast(hero, name, startedAt) {
    if (name === "battleCry" && this.game.fire?.active(hero)) return;
    const animation = this.manifest[hero.role]?.[name];
    if (!animation?.file) return;
    const state = this.heroState(hero);
    state.castName = name;
    state.castAt = startedAt;
    state.castUntil =
      startedAt +
      (animation.frames * animation.frameMs) / COMBAT_ANIMATION_SPEED / 1000;
  }

  celebrate(hero, startedAt = this.game.time) {
    const animation = this.manifest[hero.role]?.celebrate;
    if (!animation?.file) return;
    const state = this.heroState(hero);
    state.celebrateAt = startedAt;
    state.celebrateUntil =
      startedAt + (animation.frames * animation.frameMs) / 1000;
  }

  heroState(hero) {
    let state = this.heroes.get(hero.id);
    if (!state) {
      state = {
        name: "idle",
        startedAt: this.game.time,
        x: hero.x,
        y: hero.y,
        facingLeft: false,
        celebrateAt: -Infinity,
        celebrateUntil: -Infinity,
      };
      this.heroes.set(hero.id, state);
    }
    return state;
  }

  actionTarget(hero) {
    const id =
      hero === this.game.player
        ? hero.animationTargetId
        : hero.animationTargetId || hero.fighting || hero.task;
    const target = id ? this.game.getTarget(id) : null;
    if (
      !target ||
      target.destroyed ||
      target.unit?.dead ||
      target.completed?.[hero.team]
    )
      return null;
    if (
      this.game.objectiveAccess &&
      !this.game.objectiveAccess(hero, target).ok
    )
      return null;
    return target;
  }

  chooseState(hero) {
    const state = this.heroState(hero),
      screenDelta = hero.x - state.x - (hero.y - state.y),
      moved = Math.hypot(hero.x - state.x, hero.y - state.y) > 0.01;
    if (moved && Math.abs(screenDelta) > 0.001)
      state.facingLeft = screenDelta < 0;
    state.x = hero.x;
    state.y = hero.y;
    if (hero.dead) return "death";
    if (hero.duetDash?.at > this.game.time) return "windup";
    if (hero.duetPart === "oka" && this.game.duet.state(hero)?.mounted)
      return "mounted";
    if (
      hero.role === "duet" &&
      this.game.duet.state(hero)?.shieldUntil > this.game.time &&
      this.game.time <
        this.game.duet.root(hero).stubbornAt -
          this.game.skill(hero, "stubborn").cooldown +
          (this.manifest.duet.stubborn.frames *
            this.manifest.duet.stubborn.frameMs) /
            1000
    )
      return "stubborn";
    if (this.game.heroEffects?.protected(hero)) {
      if (moved) return "boxProtectionWalk";
      const target = this.actionTarget(hero);
      return target && (!this.game.near || this.game.near(hero, target))
        ? "boxProtectionAttack"
        : "boxProtection";
    }
    if (hero.prison?.until > this.game.time) return "trapped";
    if (
      this.game.abduction.carried(hero) ||
      this.game.sudzh?.held(hero) ||
      hero.stunnedUntil > this.game.time
    )
      return "stun";
    if (state.castUntil > this.game.time) return state.castName;
    if (hero.freshSudoku) return "freshSudoku";
    if (this.game.fire?.active(hero)) return "tornadoLoop";
    if (state.celebrateUntil > this.game.time) return "celebrate";
    const target = this.actionTarget(hero),
      inRange = target && (!this.game.near || this.game.near(hero, target)),
      solvingHero =
        inRange && target?.kind === "health" && target.unit?.kind !== "creep";
    if (moved) return solvingHero ? "runningAttack" : "running";
    if (!inRange) return "idle";
    if (target.kind === "camp" || target.unit?.kind === "creep")
      return "solving";
    if (["tower", "core", "health"].includes(target.kind)) return "attack";
    return "idle";
  }

  pose(hero) {
    this.syncEvents();
    const state = this.heroState(hero),
      name = this.chooseState(hero),
      animation =
        name === "mounted"
          ? OKA_ANIMATIONS.mounted
          : name === "boxProtection"
            ? BOX_PROTECTION_ANIMATIONS.idle
            : name === "boxProtectionWalk"
              ? BOX_PROTECTION_ANIMATIONS.walk
              : name === "boxProtectionAttack"
                ? BOX_PROTECTION_ANIMATIONS.attack
                : name === "trapped"
                  ? TRAPPED_ANIMATION
                  : this.manifest[hero.role]?.[name] ||
                    (name === "stun" ? this.manifest[hero.role]?.idle : null);
    if (!animation?.file) return null;
    if (
      state.name !== name ||
      (name === "death" &&
        Number.isFinite(hero.deathAt) &&
        state.startedAt !== hero.deathAt) ||
      (name === state.castName && state.startedAt !== state.castAt)
    ) {
      state.transitionFrom =
        (state.name === "running" && name === "attack") ||
        (state.name === "attack" && name === "running")
          ? state.lastPose
          : null;
      state.transitionAt = this.game.time;
      state.name = name;
      state.startedAt =
        name === "celebrate"
          ? state.celebrateAt
          : name === "death"
            ? (hero.deathAt ?? this.game.time)
            : name === state.castName
              ? state.castAt
              : this.game.time;
    }
    const selectedAnimation =
      hero.role === "duet" &&
      this.game.duet.state(hero)?.split &&
      ![
        "trapped",
        "boxProtection",
        "boxProtectionWalk",
        "boxProtectionAttack",
      ].includes(name)
        ? (hero.duetPart === "oka" ? OKA_ANIMATIONS : SUD_ANIMATIONS)[name] ||
          (hero.duetPart === "oka" ? OKA_ANIMATIONS : SUD_ANIMATIONS).idle
        : animation;
    const frameMs =
      selectedAnimation.frameMs /
      (COMBAT_STATES.has(name) ? COMBAT_ANIMATION_SPEED : 1);
    const elapsedMs = Math.max(0, (this.game.time - state.startedAt) * 1000),
      rawFrame = Math.floor(elapsedMs / frameMs),
      frame = selectedAnimation.loop
        ? rawFrame % selectedAnimation.frames
        : Math.min(selectedAnimation.frames - 1, rawFrame);
    const pose = {
      ...selectedAnimation,
      frameMs,
      name,
      frame,
      facingLeft: state.facingLeft,
      opacity:
        name === "death"
          ? Math.max(
              0,
              Math.min(
                1,
                (hero.duetRoot || this.game.duet?.state(hero)?.split
                  ? 3
                  : hero.respawnAt - this.game.time) / 3,
              ),
            )
          : 1,
    };
    state.lastPose = pose;
    return pose;
  }

  draw(ctx, hero, outline = null) {
    const pose = this.pose(hero);
    if (!pose) return false;
    if (hero.role === "intellect" && pose.name === "solving")
      return this.drawPose(ctx, pose, 1, 228, null, outline);
    const state = this.heroState(hero),
      blend = Math.min(1, (this.game.time - state.transitionAt) / 0.08);
    if (state.transitionFrom && blend < 1) {
      this.drawPose(ctx, state.transitionFrom, 1 - blend, 0, null, outline);
      return this.drawPose(ctx, pose, blend, 0, null, outline);
    }
    state.transitionFrom = null;
    return this.drawPose(ctx, pose, pose.opacity, 0, null, outline);
  }

  drawDeathSoul(ctx, hero) {
    if (this.game.duet?.state(hero)?.split) return false;
    const startedAt = hero.respawnAt - 3,
      elapsed = this.game.time - startedAt;
    if (elapsed < 0 || elapsed >= 3) return false;
    const image = this.images.get(SOUL_ANIMATION.file);
    if (!image?.complete || !image.naturalWidth || !image.naturalHeight)
      return false;
    const frame =
      Math.floor((elapsed * 1000) / SOUL_ANIMATION.frameMs) %
      SOUL_ANIMATION.frames;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, elapsed / 0.25);
    ctx.translate(
      Math.sin(elapsed * 2) * 4,
      -8 - elapsed * SOUL_ANIMATION.riseSpeed,
    );
    const pose = { ...SOUL_ANIMATION, frame, facingLeft: false };
    this.drawPose(ctx, pose);
    ctx.restore();
    return true;
  }

  drawSolvingOverlay(ctx, hero, outline = null) {
    if (hero.role !== "intellect") return;
    const pose = this.heroState(hero).lastPose;
    if (pose?.name !== "solving") return;
    ctx.save();
    ctx.translate(0, -5);
    this.drawPose(ctx, pose, 1, 0, 228, outline);
    ctx.restore();
  }

  drawPose(
    ctx,
    pose,
    opacity = 1,
    sourceY = 0,
    sourceHeight = null,
    outline = null,
  ) {
    const image = this.images.get(pose.file);
    if (!image?.complete || !image.naturalWidth || !image.naturalHeight)
      return false;
    const coordinateScaleX = pose.sourceAssetWidth
        ? image.naturalWidth / pose.sourceAssetWidth
        : 1,
      coordinateScaleY = pose.sourceAssetHeight
        ? image.naturalHeight / pose.sourceAssetHeight
        : 1,
      configuredFrame = pose.sourceFrames?.[pose.frame],
      sourceFrame = configuredFrame
        ? {
            x: configuredFrame.x * coordinateScaleX,
            width: configuredFrame.width * coordinateScaleX,
            offsetX: (configuredFrame.offsetX ?? 0) * coordinateScaleX,
          }
        : null,
      frameStart =
        sourceFrame?.x ??
        Math.round((image.naturalWidth * pose.frame) / pose.frames),
      frameEnd = sourceFrame
        ? sourceFrame.x + sourceFrame.width
        : Math.round((image.naturalWidth * (pose.frame + 1)) / pose.frames),
      frameWidth = frameEnd - frameStart,
      scaledSourceY = sourceY * coordinateScaleY,
      scaledSourceHeight = sourceHeight
        ? sourceHeight * coordinateScaleY
        : null,
      cropHeight = scaledSourceHeight ?? image.naturalHeight - scaledSourceY,
      scaledFramePaddingX = pose.framePaddingX * coordinateScaleX,
      cropStart = Math.max(0, frameStart - scaledFramePaddingX),
      cropEnd = Math.min(image.naturalWidth, frameEnd + scaledFramePaddingX),
      cropWidth = cropEnd - cropStart,
      sourceScale =
        pose.width /
        (pose.sourceFrameWidth
          ? pose.sourceFrameWidth * coordinateScaleX
          : frameWidth),
      drawX = -pose.width * pose.anchorX,
      drawY =
        -pose.height *
        (pose.groundY?.[pose.frame] !== undefined
          ? pose.groundY[pose.frame] / pose.sourceAssetHeight
          : pose.anchorY),
      cropDrawY = drawY + (pose.height * scaledSourceY) / image.naturalHeight,
      cropDrawHeight = (pose.height * cropHeight) / image.naturalHeight,
      cropDrawX =
        drawX +
        ((sourceFrame?.offsetX ?? 0) - (frameStart - cropStart)) * sourceScale,
      cropDrawWidth = cropWidth * sourceScale,
      retreat =
        pose.frame >= pose.frames - pose.retreatFrames ? pose.retreatX : 0;
    ctx.save();
    const imageSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = pose.imageSmoothing;
    if (opacity < 1) ctx.globalAlpha *= opacity;
    ctx.translate(pose.facingLeft ? retreat : -retreat, 0);
    if (pose.facingLeft) ctx.scale(-1, 1);
    // Some strips overlap horizontally: retain the weapon without drawing
    // the neighbouring pose's feet. Clip points use authored asset coordinates.
    if (configuredFrame?.clip) {
      ctx.beginPath();
      configuredFrame.clip.forEach(([x, y], index) => {
        const clipX =
          drawX +
          ((sourceFrame.offsetX ?? 0) + x * coordinateScaleX - frameStart) *
            sourceScale;
        const clipY = drawY + (pose.height * y) / pose.sourceAssetHeight;
        if (index === 0) ctx.moveTo(clipX, clipY);
        else ctx.lineTo(clipX, clipY);
      });
      ctx.closePath();
      ctx.clip();
    }
    if (outline && typeof document !== "undefined") {
      const maskWidth = Math.ceil(cropDrawWidth * 2),
        maskHeight = Math.ceil(cropDrawHeight * 2),
        scaleX = cropDrawWidth / maskWidth,
        scaleY = cropDrawHeight / maskHeight,
        padding = Math.ceil(outline.width / Math.min(scaleX, scaleY)) + 1,
        key = [
          pose.file,
          cropStart,
          scaledSourceY,
          cropWidth,
          cropHeight,
          maskWidth,
          maskHeight,
          outline.color,
          outline.width,
        ].join(":");
      let mask = this.outlineMasks.get(key);
      if (!mask) {
        const silhouette = document.createElement("canvas");
        silhouette.width = maskWidth;
        silhouette.height = maskHeight;
        mask = document.createElement("canvas");
        mask.width = maskWidth + padding * 2;
        mask.height = maskHeight + padding * 2;
        const silhouetteContext = silhouette.getContext("2d"),
          maskContext = mask.getContext("2d");
        if (silhouetteContext && maskContext) {
          silhouetteContext.imageSmoothingEnabled = pose.imageSmoothing;
          silhouetteContext.drawImage(
            image,
            cropStart,
            scaledSourceY,
            cropWidth,
            cropHeight,
            0,
            0,
            maskWidth,
            maskHeight,
          );
          silhouetteContext.globalCompositeOperation = "source-in";
          silhouetteContext.fillStyle = outline.color;
          silhouetteContext.fillRect(0, 0, maskWidth, maskHeight);
          for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
            [-0.7, -0.7],
            [0.7, -0.7],
            [-0.7, 0.7],
            [0.7, 0.7],
          ])
            maskContext.drawImage(
              silhouette,
              padding + (dx * outline.width) / scaleX,
              padding + (dy * outline.width) / scaleY,
            );
          // Remove the interior so fading corpses keep their original colors.
          maskContext.globalCompositeOperation = "destination-out";
          maskContext.drawImage(silhouette, padding, padding);
          // Cache destination-sized masks, rather than another full sprite sheet.
          if (this.outlineMasks.size >= 512) this.outlineMasks.clear();
          this.outlineMasks.set(key, mask);
        } else mask = null;
      }
      if (mask) {
        ctx.save();
        ctx.globalAlpha *= outline.opacity;
        ctx.drawImage(
          mask,
          cropDrawX - padding * scaleX,
          cropDrawY - padding * scaleY,
          mask.width * scaleX,
          mask.height * scaleY,
        );
        ctx.restore();
      }
    }
    ctx.drawImage(
      image,
      cropStart,
      scaledSourceY,
      cropWidth,
      cropHeight,
      cropDrawX,
      cropDrawY,
      cropDrawWidth,
      cropDrawHeight,
    );
    ctx.imageSmoothingEnabled = imageSmoothing;
    ctx.restore();
    return true;
  }
}
