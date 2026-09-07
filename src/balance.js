// Tune the campaign here. Growth values are per wave after wave 1.
export const BALANCE = {
  startingGold: 150,
  startingLives: 20,
  maxWaves: 30,
  waveDelay: 5,
  secondPathWave: 20,
  waves: {
    baseCount: 7,
    countPerWave: 3,
    baseHealth: 51,
    healthPerWave: 13,
    healthQuadratic: 0.5,
    speedPerWave: 0.012,
    spawnInterval: 0.73,
    spawnIntervalDecay: 0.012,
    minSpawnInterval: 0.45,
  },
  economy: {
    killGold: 5,
    bossGold: 25,
    waveGold: 20,
    waveGoldPerWave: 4,
    purchasesPerIncrease: 3,
    priceIncrease: 0.2,
    sellRefund: 0.7,
  },
  // Starts at wave 8 and reaches full strength at wave 16.
  midgame: { startWave: 8, rampWaves: 8, healthBonus: 0.25, rewardReduction: 0.4 },
};

export const DIFFICULTIES = {
  relaxed: { label: "Relaxed", health: 0.85, speed: 0.95, rewards: 1, midgame: 0 },
  standard: { label: "Standard", health: 1, speed: 1, rewards: 1, midgame: 1 },
  hard: { label: "Hard", health: 1.2, speed: 1.08, rewards: 0.8, midgame: 1.25 },
};

// Partial overrides allow experiments without changing other games or defaults.
export function createBalance(overrides = {}) {
  const config = { ...BALANCE, ...overrides };
  for (const group of ["waves", "economy", "midgame"]) {
    config[group] = { ...BALANCE[group], ...overrides[group] };
  }
  const integerKeys = new Set([
    "startingGold", "startingLives", "maxWaves", "secondPathWave",
    "baseCount", "countPerWave", "purchasesPerIncrease", "startWave",
  ]);
  const positiveKeys = new Set([
    "startingLives", "maxWaves", "secondPathWave", "baseHealth",
    "spawnInterval", "minSpawnInterval", "purchasesPerIncrease", "startWave", "rampWaves",
  ]);
  function validate(values) {
    for (const [key, value] of Object.entries(values)) {
      if (value && typeof value === "object") {
        validate(value);
        continue;
      }
      if (!Number.isFinite(value) || value < 0 ||
          (positiveKeys.has(key) && value === 0) ||
          (integerKeys.has(key) && !Number.isInteger(value))) {
        throw new RangeError(`Invalid balance setting: ${key}`);
      }
    }
  }
  validate(config);
  if (config.economy.sellRefund > 1 || config.midgame.rewardReduction > 1) {
    throw new RangeError("Refund and reward reduction must be between 0 and 1");
  }
  return config;
}
