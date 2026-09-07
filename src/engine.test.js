import test from "node:test";
import assert from "node:assert/strict";
import { Game, PATH_LENGTH, PATH_LENGTHS, pointAt } from "./engine.js";
test("placement enforces gold, trail clearance and tower spacing", () => {
  const g = new Game();
  g.gold = 230;
  assert.equal(g.build("arrow", 100, 160), null);
  const t = g.build("arrow", 130, 260);
  assert.ok(t);
  assert.equal(g.gold, 160);
  assert.equal(g.build("arrow", 140, 265), null);
  assert.ok(g.build("ember", 340, 270));
  assert.equal(g.build("arrow", 540, 270), null);
});
test("upgrades and selling preserve the economy", () => {
  const g = new Game(),
    t = g.build("arrow", 130, 260);
  assert.ok(g.upgrade(t));
  assert.equal(t.level, 2);
  assert.equal(g.gold, 10);
  assert.equal(g.stats(t).damage, 28.9);
  g.sell(t);
  assert.equal(g.gold, 108);
  assert.equal(g.towers.length, 0);
  assert.equal(g.upgrade(t), false);
});
test("an undefended wave leaks once per enemy and awards completion gold", () => {
  const g = new Game();
  g.startWave();
  assert.equal(g.startWave(), false);
  for (let i = 0; i < 20000 && g.active; i++) g.update(0.05);
  assert.equal(g.lives, 10);
  assert.equal(g.active, false);
  assert.equal(g.gold, 174);
});
test("frost slows targets and attacks award kills", () => {
  const g = new Game();
  g.build("frost", 130, 90);
  g.startWave();
  let slowed = false;
  for (let i = 0; i < 300; i++) {
    g.update(0.05);
    slowed ||= g.enemies.some((e) => e.slow > 0);
  }
  assert.ok(slowed);
  const h = new Game();
  h.gold = 1000;
  h.build("arrow", 130, 90);
  h.build("arrow", 160, 230);
  h.startWave();
  for (let i = 0; i < 400; i++) h.update(0.05);
  assert.ok(h.kills > 0);
});
test("bosses cost four lives and defeat stops progression", () => {
  const g = new Game();
  g.lives = 4;
  g.active = true;
  g.enemies = [{ distance: PATH_LENGTH - 1, hp: 20, speed: 40, slow: 0, boss: true }];
  g.update(0.05);
  assert.equal(g.status, "lost");
  assert.equal(g.lives, 0);
  assert.equal(g.startWave(), false);
});
test("final wave completion wins and freezes building", () => {
  const g = new Game();
  g.wave = g.maxWaves;
  g.active = true;
  g.remaining = 0;
  g.update(0.05);
  assert.equal(g.status, "won");
  assert.equal(g.startWave(), false);
  assert.equal(g.build("arrow", 130, 90), null);
});
test("path interpolates and clamps endpoints", () => {
  assert.deepEqual(pointAt(0), { x: -25, y: 160 });
  assert.deepEqual(pointAt(PATH_LENGTH + 100), { x: 925, y: 455 });
});
test("first wave starts automatically after five seconds", () => {
  const g = new Game();
  g.update(4.9);
  assert.equal(g.wave, 0);
  assert.equal(g.active, false);
  g.update(0.1);
  assert.equal(g.wave, 1);
  assert.equal(g.active, true);
});
test("clearing a wave starts a fresh five-second countdown", () => {
  const g = new Game();
  g.startWave();
  g.remaining = 0;
  g.update(0.05);
  assert.equal(g.waveCountdown, 5);
  g.update(4.9);
  assert.equal(g.wave, 1);
  g.update(0.1);
  assert.equal(g.wave, 2);
  assert.equal(g.active, true);
});
test("countdown uses unscaled time and manual starts do not duplicate waves", () => {
  const g = new Game();
  g.update(8, 4);
  assert.equal(g.wave, 0);
  assert.equal(g.startWave(), true);
  g.update(2, 1);
  assert.equal(g.wave, 1);
});
test("terminal games never auto-start and a new game resets the timer", () => {
  for (const status of ["won", "lost"]) {
    const g = new Game();
    g.status = status;
    g.update(10);
    assert.equal(g.wave, 0);
  }
  assert.equal(new Game().waveCountdown, 5);
});

test("later waves have more enemies with higher health and speed", () => {
  const sample = (wave) => {
    const g = new Game();
    g.wave = wave - 1;
    g.startWave();
    const count = g.remaining;
    g.remaining = 3;
    g.spawn();
    return { count, enemy: g.enemies[0] };
  };
  const first = sample(1),
    last = sample(20);
  assert.equal(first.count, 10);
  assert.equal(last.count, 67);
  assert.ok(last.enemy.hp > first.enemy.hp);
  assert.ok(last.enemy.speed > first.enemy.speed);
});

test("larger enemies resist Frost strength and duration without stacking", () => {
  for (const [remaining, resistance, heavy, boss] of [
    [3, 0, false, false],
    [5, 0.45, true, false],
    [1, 0.75, false, true],
  ]) {
    const g = new Game();
    const t = g.build("frost", 130, 90);
    g.wave = 4;
    g.active = true;
    g.remaining = remaining;
    g.spawn();
    const e = g.enemies[0];
    assert.equal(e.heavy, heavy);
    assert.equal(e.boss, boss);
    assert.equal(e.slowResist, resistance);
    e.distance = 150;
    g.remaining = 0;
    g.update(0.01);
    assert.equal(e.slow, 2 * (1 - resistance));
    const previous = e.distance;
    g.update(0.1);
    assert.ok(
      Math.abs(e.distance - previous - 0.1 * e.speed * (1 - 0.52 * (1 - resistance))) < 1e-8,
    );
    t.cooldown = 0;
    g.update(0.01);
    assert.equal(e.slow, 2 * (1 - resistance));
  }
});

test("fire-rate upgrades shorten actual time between shots", () => {
  function shots(level) {
    const g = new Game();
    const t = g.build("arrow", 130, 90);
    t.level = level;
    g.active = true;
    g.enemies = [{ distance: 150, hp: 10000, maxHp: 10000, speed: 0, slow: 0, reward: 5 }];
    let count = 0;
    for (let i = 0; i < 600; i++) {
      const hp = g.enemies[0].hp;
      g.update(0.01);
      if (g.enemies[0].hp < hp) count++;
    }
    return { count, stats: g.stats(t) };
  }
  const base = shots(1),
    upgraded = shots(3);
  assert.ok(upgraded.count > base.count);
  assert.ok(Math.abs(upgraded.stats.fireRate / base.stats.fireRate - 1.3) < 1e-8);
  assert.ok(Math.abs(upgraded.stats.fireRate * upgraded.stats.rate - 1) < 1e-8);
});

test("purchase prices rise per type every three purchases and survive selling", () => {
  const g = new Game();
  g.gold = 2000;
  for (let i = 0; i < 7; i++) {
    const expected = i < 3 ? 70 : i < 6 ? 84 : 98;
    assert.equal(g.towerCost("arrow"), expected);
    const before = g.gold;
    const t = g.build("arrow", 130, 260);
    assert.ok(t);
    assert.equal(t.spent, expected);
    assert.equal(g.gold, before - expected);
    g.sell(t);
    assert.equal(g.gold, before - expected + Math.floor(expected * 0.7));
  }
  assert.equal(g.towerCost("frost"), 95);
  g.gold = 70;
  assert.equal(g.build("arrow", 130, 260), null);
  assert.equal(g.purchases.arrow, 7);
  assert.equal(new Game().towerCost("arrow"), 70);
});

test("second route unlocks at wave 20 and spawns on both routes", () => {
  const g = new Game();
  assert.equal(g.build("arrow", 300, 455), null);
  g.wave = 18;
  g.startWave();
  g.spawn();
  g.spawn();
  assert.ok(g.enemies.every((e) => e.route === 0));
  g.enemies = [];
  g.active = false;
  g.startWave();
  assert.equal(g.secondPathOpen, true);
  g.spawn();
  g.spawn();
  assert.deepEqual(
    g.enemies.map((e) => e.route),
    [0, 1],
  );
  assert.deepEqual(pointAt(0, 1), { x: 80, y: 585 });
  assert.deepEqual(pointAt(PATH_LENGTHS[1], 1), { x: 925, y: 455 });
  assert.equal(new Game().secondPathOpen, false);
});

test("enemies on the second route leak at their own endpoint", () => {
  const g = new Game();
  g.active = true;
  g.enemies = [{ route: 1, distance: PATH_LENGTHS[1] - 1, hp: 10, speed: 40, slow: 0 }];
  g.update(0.05);
  assert.equal(g.lives, 19);
  assert.equal(g.enemies.length, 0);
});

test("targeting compares distance left to the gate across routes", () => {
  const g = new Game();
  g.build("arrow", 790, 380);
  g.active = true;
  const enemy = (route, left) => ({
    route,
    distance: PATH_LENGTHS[route] - left,
    hp: 100,
    speed: 0,
    slow: 0,
  });
  const original = enemy(0, 100),
    second = enemy(1, 90);
  g.enemies = [original, second];
  g.update(0.01);
  assert.equal(original.hp, 100);
  assert.equal(second.hp, 83);
});

test("campaign continues past wave 20 and wins only at wave 30", () => {
  const g = new Game();
  assert.equal(g.maxWaves, 30);
  for (let wave = 20; wave <= 30; wave++) {
    g.wave = wave;
    g.active = true;
    g.remaining = 0;
    g.update(0.01);
    assert.equal(g.status, wave === 30 ? "won" : "playing");
  }
});
