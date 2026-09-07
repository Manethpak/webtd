import { BALANCE, DIFFICULTIES, createBalance } from "./balance.js";
import { PLACEMENT, PATH_CLEARANCE, TOWER_SPACING } from "./board.js";

export const TOWERS = {
  arrow: {
    name: "Arrow",
    cost: 70,
    range: 155,
    damage: 17,
    rate: 0.62,
    color: "#c8d99b",
    description: "Quick, reliable single-target damage.",
  },
  ember: {
    name: "Ember",
    cost: 115,
    range: 125,
    damage: 30,
    rate: 1.4,
    splash: 52,
    color: "#f5a46b",
    description: "Explosive shots punish clustered enemies.",
  },
  frost: {
    name: "Frost",
    cost: 95,
    range: 140,
    damage: 7,
    rate: 0.85,
    slow: true,
    color: "#8fced8",
    description: "Slows enemies; heavy enemies and bosses resist the effect.",
  },
};
export const PATH = [
  { x: -25, y: 160 },
  { x: 215, y: 160 },
  { x: 215, y: 365 },
  { x: 445, y: 365 },
  { x: 445, y: 190 },
  { x: 675, y: 190 },
  { x: 675, y: 455 },
  { x: 925, y: 455 },
];
export const SECOND_PATH = [
  { x: 80, y: 585 },
  { x: 80, y: 455 },
  { x: 445, y: 455 },
  ...PATH.slice(3),
];
export const PATHS = [PATH, SECOND_PATH];
export const SECOND_PATH_WAVE = BALANCE.secondPathWave;
const routeSegments = PATHS.map((path) =>
  path.slice(1).map((p, i) => ({
    a: path[i],
    b: p,
    length: Math.hypot(p.x - path[i].x, p.y - path[i].y),
  })),
);
export const PATH_LENGTHS = routeSegments.map((segments) =>
  segments.reduce((n, s) => n + s.length, 0),
);
export const PATH_LENGTH = PATH_LENGTHS[0];
export function pointAt(distance, route = 0) {
  for (const s of routeSegments[route]) {
    if (distance <= s.length) {
      const t = Math.max(0, distance / s.length);
      return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
    }
    distance -= s.length;
  }
  return { ...PATHS[route].at(-1) };
}
// Reserve both trails from the start so unlocking a route never removes a tower.
export function distanceToPath(x, y, route) {
  const segments = route === undefined ? routeSegments.flat() : routeSegments[route];
  return Math.min(
    ...segments.map(({ a, b, length }) => {
      const t = Math.max(
        0,
        Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (length * length)),
      );
      return Math.hypot(x - a.x - (b.x - a.x) * t, y - a.y - (b.y - a.y) * t);
    }),
  );
}
export const WAVE_DELAY = BALANCE.waveDelay;
export class Game {
  constructor({ difficulty = "standard", balance = {} } = {}) {
    if (!Object.hasOwn(DIFFICULTIES, difficulty)) throw new RangeError("Unknown difficulty");
    this.difficulty = difficulty;
    this.config = createBalance(balance);
    this.gold = this.config.startingGold;
    this.lives = this.config.startingLives;
    this.wave = 0;
    this.maxWaves = this.config.maxWaves;
    this.purchases = Object.fromEntries(Object.keys(TOWERS).map((type) => [type, 0]));
    this.spawned = 0;
    this.towers = [];
    this.enemies = [];
    this.effects = [];
    this.active = false;
    this.status = "playing";
    this.spawnTimer = 0;
    this.remaining = 0;
    this.kills = 0;
    this.nextId = 1;
    this.waveCountdown = this.config.waveDelay;
  }
  towerCost(type) {
    const { purchasesPerIncrease, priceIncrease } = this.config.economy;
    return Math.round(TOWERS[type].cost *
      (1 + Math.floor(this.purchases[type] / purchasesPerIncrease) * priceIncrease));
  }
  get secondPathOpen() {
    return this.wave >= this.config.secondPathWave;
  }
  get midgameProgress() {
    const { startWave, rampWaves } = this.config.midgame;
    return Math.max(0, Math.min(1, (this.wave - startWave) / rampWaves));
  }
  rewardGold(base) {
    const preset = DIFFICULTIES[this.difficulty];
    const reduction = this.config.midgame.rewardReduction * this.midgameProgress * preset.midgame;
    return Math.max(0, Math.round(base * preset.rewards * Math.max(0, 1 - reduction)));
  }
  waveReward() {
    const { waveGold, waveGoldPerWave } = this.config.economy;
    return this.rewardGold(waveGold + this.wave * waveGoldPerWave);
  }
  sellValue(t) {
    return Math.floor(t.spent * this.config.economy.sellRefund);
  }
  canBuild(type, x, y) {
    return (
      !!TOWERS[type] &&
      this.status === "playing" &&
      this.gold >= this.towerCost(type) &&
      x > PLACEMENT.bounds.left &&
      x < PLACEMENT.bounds.right &&
      y > PLACEMENT.bounds.top &&
      y < PLACEMENT.bounds.bottom &&
      distanceToPath(x, y) > PATH_CLEARANCE &&
      this.towers.every((t) => Math.hypot(t.x - x, t.y - y) > TOWER_SPACING)
    );
  }
  build(type, x, y) {
    if (!this.canBuild(type, x, y)) return null;
    const t = { id: this.nextId++, type, x, y, level: 1, cooldown: 0, spent: this.towerCost(type) };
    this.gold -= t.spent;
    this.purchases[type]++;
    this.towers.push(t);
    return t;
  }
  stats(t) {
    const b = TOWERS[t.type];
    return {
      ...b,
      damage: b.damage * (1 + (t.level - 1) * 0.7),
      range: b.range + (t.level - 1) * 16,
      rate: b.rate / (1 + (t.level - 1) * 0.15),
      fireRate: (1 + (t.level - 1) * 0.15) / b.rate,
    };
  }
  upgradeCost(t) {
    return Math.round(TOWERS[t.type].cost * (0.7 + t.level * 0.3));
  }
  upgrade(t) {
    if (!this.towers.includes(t) || t.level >= 3 || this.status !== "playing") return false;
    const cost = this.upgradeCost(t);
    if (this.gold < cost) return false;
    this.gold -= cost;
    t.spent += cost;
    t.level++;
    return true;
  }
  sell(t) {
    if (this.status !== "playing" || !this.towers.includes(t)) return;
    this.gold += this.sellValue(t);
    this.towers = this.towers.filter((x) => x !== t);
  }
  startWave() {
    if (this.active || this.status !== "playing") return false;
    this.wave++;
    this.remaining = Math.max(1, this.config.waves.baseCount + this.wave * this.config.waves.countPerWave);
    this.spawned = 0;
    this.spawnTimer = 0;
    this.active = true;
    this.waveCountdown = 0;
    return true;
  }
  spawn() {
    const boss = this.wave % 4 === 0 && this.remaining === 1;
    const heavy = !boss && this.wave >= 3 && this.remaining % 5 === 0;
    const fast = !boss && !heavy && this.remaining % 4 === 0;
    const growth = this.wave - 1;
    const waves = this.config.waves;
    const preset = DIFFICULTIES[this.difficulty];
    const healthScale = preset.health *
      (1 + this.midgameProgress * this.config.midgame.healthBonus * preset.midgame);
    const hp = Math.max(1, Math.round(
      (waves.baseHealth + growth * waves.healthPerWave + growth * growth * waves.healthQuadratic) *
      (boss ? 7 : heavy ? 2.2 : fast ? 0.65 : 1) * healthScale,
    ));
    this.enemies.push({
      id: this.nextId++,
      distance: 0,
      route: this.secondPathOpen ? this.spawned % 2 : 0,
      hp,
      maxHp: hp,
      speed: (boss ? 31 : heavy ? 35 : fast ? 77 : 45) * (1 + growth * waves.speedPerWave) * preset.speed,
      slowResist: boss ? 0.75 : heavy ? 0.45 : 0,
      heavy,
      boss,
      fast,
      slow: 0,
      reward: this.rewardGold(boss ? this.config.economy.bossGold : this.config.economy.killGold),
    });
    this.remaining--;
    this.spawned++;
  }
  update(dt, countdownDt = dt) {
    if (this.status !== "playing") return;
    this.effects = this.effects.filter((e) => (e.life -= dt) > 0);
    if (!this.active) {
      this.waveCountdown = Math.max(0, this.waveCountdown - countdownDt);
      if (this.waveCountdown <= 1e-9) this.startWave();
      return;
    }
    this.spawnTimer -= dt;
    if (this.remaining > 0 && this.spawnTimer <= 0) {
      this.spawn();
      const waves = this.config.waves;
      this.spawnTimer = Math.max(waves.minSpawnInterval,
        waves.spawnInterval - (this.wave - 1) * waves.spawnIntervalDecay);
    }
    for (const e of this.enemies) {
      e.slow = Math.max(0, e.slow - dt);
      e.distance += dt * e.speed * (e.slow > 0 ? 1 - 0.52 * (1 - (e.slowResist ?? 0)) : 1);
      Object.assign(e, pointAt(e.distance, e.route ?? 0));
      if (e.distance >= PATH_LENGTHS[e.route ?? 0] && e.hp > 0) {
        e.hp = 0;
        this.lives -= e.boss ? 4 : 1;
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    for (const t of this.towers) {
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const s = this.stats(t);
      const target = this.enemies
        .filter((e) => e.hp > 0 && Math.hypot(e.x - t.x, e.y - t.y) <= s.range)
        .sort(
          (a, b) =>
            PATH_LENGTHS[a.route ?? 0] - a.distance - (PATH_LENGTHS[b.route ?? 0] - b.distance),
        )[0];
      if (!target) continue;
      t.cooldown = s.rate;
      this.effects.push({
        x: t.x,
        y: t.y,
        tx: target.x,
        ty: target.y,
        color: s.color,
        life: 0.18,
        splash: s.splash,
      });
      for (const e of this.enemies) {
        if (
          e.hp <= 0 ||
          !(e === target || (s.splash && Math.hypot(e.x - target.x, e.y - target.y) < s.splash))
        )
          continue;
        e.hp -= s.damage;
        if (s.slow) e.slow = Math.max(e.slow, 2 * (1 - (e.slowResist ?? 0)));
        if (e.hp <= 0) {
          this.gold += e.reward;
          this.kills++;
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    if (this.lives <= 0) {
      this.lives = 0;
      this.status = "lost";
      this.active = false;
    } else if (this.remaining === 0 && this.enemies.length === 0) {
      this.active = false;
      this.waveCountdown = this.config.waveDelay;
      this.gold += this.waveReward();
      if (this.wave === this.maxWaves) this.status = "won";
    }
  }
}
