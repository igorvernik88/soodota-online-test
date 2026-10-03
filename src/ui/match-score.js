import { praiseIcon } from "./icons.js";
import { HEROES } from "../config.js";
import { HERO_ANIMATION_MANIFEST } from "../hero-animation.js";
import { renderMarkup } from "./dom.js";
import { timeLabel } from "./shared.js";

// Crop the first idle frame to the head without creating another sprite asset.
const portraitTop = {
  duet: 0.22,
  sudzh: 208 / 768,
  agile: 0.22,
  intellect: 0.2,
  strong: 0.23,
  editor: 41 / 240,
  combinator: 0.24,
  sudaks: 0.23,
};

export function renderMatchScore(game) {
  document.querySelector("#clock").textContent = ["select", "buy"].includes(
    game.phase,
  )
    ? "Подготовка"
    : timeLabel(game.time);

  for (const team of [0, 1]) {
    const roster = document.querySelector(team ? "#matchTeamB" : "#matchTeamA"),
      heroes = game.heroes.filter((hero) => hero.team === team),
      signature = heroes.map((hero) => `${hero.id}:${hero.role}`).join(",");
    // Tower and creep kills of heroes count too; individual kills omit these.
    document.querySelector(team ? "#scoreB" : "#scoreA").textContent = String(
      game.heroes
        .filter((hero) => hero.team !== team)
        .reduce((total, hero) => total + (hero.deaths || 0), 0),
    );

    if (roster.dataset.signature !== signature) {
      renderMarkup(
        roster,
        heroes
          .map((hero) => {
            const role = HEROES.find(
              (definition) => definition.id === hero.role,
            );
            return `<div class="match-hero" data-match-hero="${hero.id}" data-match-role="${hero.role}" data-ui-key="match-hero-${hero.id}" role="group" style="--portrait-color:${role.color};--portrait-top:${-portraitTop[hero.role]}"><span class="match-portrait"><img alt="" draggable="false"></span><span class="match-health"><i></i></span><span class="match-respawn" aria-hidden="true"></span><button class="match-praise" data-praise="${hero.id}" aria-label="Похвалить ${hero.name}">${praiseIcon}</button></div>`;
          })
          .join(""),
      );
      roster.dataset.signature = signature;
      for (const hero of heroes) {
        const file = HERO_ANIMATION_MANIFEST[hero.role].idle.file;
        roster.querySelector(`[data-match-hero="${hero.id}"] img`).src =
          globalThis.SUDOTA_HERO_ASSETS?.[file] || `assets/heroes/${file}`;
      }
    }

    for (const hero of heroes) {
      const duet = game.duet.state(hero),
        wholeDead = hero.dead && !duet?.split,
        selected = game.duet.root(game.player) === hero,
        card = roster.querySelector(`[data-match-hero="${hero.id}"]`),
        visible =
          hero.team === game.player.team ||
          game.vision.visible(game.player.team, hero),
        remaining = Math.max(0, Math.ceil(hero.respawnAt - game.time)),
        health =
          game.combat.hpLeft(hero) +
          (duet?.split ? game.combat.hpLeft(duet.oka) : 0),
        capacity =
          game.combat.healthCapacity(hero) +
          (duet?.split ? game.combat.healthCapacity(duet.oka) : 0),
        status = wholeDead
          ? `Погиб · возрождение через ${remaining} с`
          : visible
            ? `Здоровье ${health}/${capacity}`
            : "В строю",
        label = `${hero.name}${selected ? " · вы" : ""} · ${status}`;
      card.classList.toggle("dead", wholeDead);
      card.classList.toggle("you", selected);
      card.classList.toggle("health-hidden", !visible && !wholeDead);
      const praise = card.querySelector(".match-praise");
      praise.disabled =
        selected || (game.player.praiseAt[hero.id] || 0) > game.time;
      praise.title = `Хорошо сыграно! · ${hero.praise}`;
      card.title = label;
      card.setAttribute("aria-label", label);
      card.querySelector(".match-health i").style.width =
        `${wholeDead ? 0 : visible ? (health / capacity) * 100 : 100}%`;
      card.querySelector(".match-respawn").textContent = wholeDead
        ? String(remaining)
        : "";
    }
  }
}
