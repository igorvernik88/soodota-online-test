export class Chat {
  constructor(game) {
    this.game = game;
    this.messages = [];
    this.serial = 0;
  }
  add(message) {
    this.messages.push({ ...message, id: ++this.serial, at: this.game.time });
    if (this.messages.length > 80) this.messages.shift();
  }
  send(hero, text, channel = "all") {
    text = String(text).trim().slice(0, 200);
    if (!text || !["all", "team"].includes(channel)) return false;
    this.add({ text, name: hero.name, team: hero.team, channel });
    return true;
  }
  system(text) {
    this.add({ text, channel: "all", system: true });
  }
  visible(team) {
    return this.messages.filter((m) => m.channel === "all" || m.team === team);
  }
}
