import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "./engine.js";
import { BALANCE } from "./balance.js";

function sample(wave, options) {
  const game = new Game(options);
  game.wave = wave;
  game.remaining = 3;
  game.spawn();
  return { game, enemy: game.enemies[0] };
}

test("standard preserves opening rewards and progressively tightens the midgame", () => {
  assert.equal(sample(1).enemy.hp, 51);
  assert.equal(sample(1).game.waveReward(), 24);
  assert.equal(sample(8).enemy.reward, 5);
  assert.equal(sample(12).enemy.reward, 4);
  assert.equal(sample(16).enemy.reward, 3);
  assert.equal(sample(30).enemy.reward, 3);
  for (const wave of [8, 12, 16, 30]) {
    const { game, enemy } = sample(wave);
    const legacy = sample(wave, { balance: { midgame: { healthBonus: 0, rewardReduction: 0 } } });
    assert.ok(enemy.hp >= legacy.enemy.hp);
    assert.ok(game.waveReward() <= legacy.game.waveReward());
    if (wave > 8) {
      assert.ok(enemy.hp > legacy.enemy.hp);
      assert.ok(game.waveReward() < legacy.game.waveReward());
    }
  }
});

test("midgame scaling applies to boss bounties, kill payouts and wave completion", () => {
  const { game } = sample(16);
  game.enemies = [];
  game.remaining = 1;
  game.spawn();
  assert.equal(game.enemies[0].boss, true);
  assert.equal(game.enemies[0].reward, 15);
  const tower = game.build("arrow", 130, 90);
  assert.ok(tower);
  const enemy = game.enemies[0];
  enemy.distance = 150;
  enemy.hp = 1;
  game.active = true;
  const before = game.gold;
  game.update(0.01);
  assert.equal(game.kills, 1);
  assert.equal(game.active, false);
  assert.equal(game.gold, before + 15 + 50);
});

test("difficulty presets change health, speed and rewards in the expected order", () => {
  for (const wave of [1, 16, 30]) {
    const relaxed = sample(wave, { difficulty: "relaxed" });
    const standard = sample(wave);
    const hard = sample(wave, { difficulty: "hard" });
    assert.ok(relaxed.enemy.hp < standard.enemy.hp);
    assert.ok(standard.enemy.hp < hard.enemy.hp);
    assert.ok(relaxed.enemy.speed < standard.enemy.speed);
    assert.ok(standard.enemy.speed < hard.enemy.speed);
    assert.ok(relaxed.enemy.reward >= standard.enemy.reward);
    assert.ok(standard.enemy.reward > hard.enemy.reward);
  }
});

test("partial balance overrides drive the campaign, spawning, prices and refunds", () => {
  const game = new Game({ balance: {
    startingGold: 500, startingLives: 40, maxWaves: 2, waveDelay: 10, secondPathWave: 2,
    waves: { baseCount: 2, countPerWave: 1, spawnInterval: 1, spawnIntervalDecay: 0 },
    economy: { purchasesPerIncrease: 1, priceIncrease: 0.5, sellRefund: 0.5 },
  } });
  assert.equal(game.gold, 500);
  assert.equal(game.lives, 40);
  assert.equal(game.waveCountdown, 10);
  const tower = game.build("arrow", 130, 90);
  assert.equal(game.towerCost("arrow"), 105);
  assert.equal(game.sellValue(tower), 35);
  game.sell(tower);
  assert.equal(game.gold, 465);
  game.update(10);
  assert.equal(game.remaining, 3);
  game.update(0.01);
  assert.equal(game.spawnTimer, 1);
  game.remaining = 0;
  game.enemies = [];
  game.update(0.01);
  assert.equal(game.waveCountdown, 10);
  game.startWave();
  assert.equal(game.secondPathOpen, true);
  game.remaining = 0;
  game.update(0.01);
  assert.equal(game.status, "won");
  assert.equal(BALANCE.economy.sellRefund, 0.7);
  assert.equal(new Game().config.waves.baseCount, 7);
});

test("invalid tuning fails early instead of producing broken prices or waves", () => {
  assert.throws(() => new Game({ difficulty: "missing" }), RangeError);
  for (const balance of [
    { economy: { purchasesPerIncrease: 0 } },
    { economy: { sellRefund: 1.1 } },
    { waves: { countPerWave: 0.5 } },
    { waves: { baseHealth: NaN } },
    { midgame: { rampWaves: 0 } },
    { midgame: { rewardReduction: 1.1 } },
    { startingGold: -1 },
  ]) assert.throws(() => new Game({ balance }), RangeError);
});
