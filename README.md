# Wildward

A playable Phaser tower defense prototype: defend a woodland trail through 30 waves with Arrow, Ember, and Frost towers. Includes upgrades, selling, bosses, pause, double speed, victory/defeat, and touch controls.

## Run

Install dependencies and start the Vite development server:

```sh
npm install
npm start
```

Open the URL printed by Vite (normally http://localhost:5173). Create a production bundle with `npm run build`; the generated `dist` directory can be hosted by any static file server. Fonts use Google Fonts, with local fallbacks when offline.

## Play

Select a tower and click clear ground. The small circle marks its footprint and the cursor marks its ground anchor. While building, shaded trails, circles around existing towers, and map edges show where the new tower's center cannot go. Both trails are reserved, including the unopened southern route. Invalid clicks keep build mode active, and tower artwork never intercepts placement. Press Escape (or toggle the tower card off) before clicking placed towers to upgrade or sell.

The first wave starts automatically after 5 seconds, with a 5-second countdown after each cleared wave. Click Send wave to start early. Pausing also pauses the countdown; double speed only affects combat. Press 1–3 to choose towers, Space to pause, or Escape to deselect. Survive 30 waves without losing all 20 lives. The difficulty selector below the wave controls applies when you click New game or Play again.

## Verify

```sh
npm test
```

Deterministic game rules remain isolated in `src/engine.js` for fast headless testing. Phaser owns the browser game loop, input, asset loading, scaling, and entity rendering in `src/game-scene.js`; DOM controls live in `src/main.js`. This prototype uses a provisional fantasy theme, fixed routes, and approachable tactical play pending design feedback.

## Combat balance

Arrow, Ember, and Frost use the prepared three-level sprite sheets in
`assets/towers/*-prepared/`. Towers and placement previews display at 64×96
with a shared ground anchor; upgrades select the corresponding frame.
Phaser falls back to procedural tower drawings if a sheet cannot load.
The image URLs are included in Vite's asset pipeline for production hosting.

- Waves contain `7 + 3 × wave` enemies (10 in wave 1, 97 in wave 30), with gradually shorter spawn intervals.
- Enemy health scales quadratically with wave number; speed increases 1.2% per wave after the first.
- Heavy enemies appear from wave 3 with 2.2× normal health. Their 45% slow resistance reduces Frost’s speed reduction to 28.6% for 1.1 seconds.
- Bosses have 75% slow resistance: 13% speed reduction for 0.5 seconds. Normal enemies are slowed by 52% for 2 seconds. Repeated hits refresh the duration without stacking the strength.
- Arrow fires 1.61 shots/s, Ember 0.71 shots/s, and Frost 1.18 shots/s. Each upgrade adds 15% of the base fire rate, alongside damage and range upgrades. Rates use game time.
- Standard starts with 150 gold; opening normal and heavy enemies award 5 gold, bosses award 25. From waves 8–16, a gradual ramp adds up to 25% health and reduces both kill and completion rewards by up to 40%. Rewards round to whole gold. At wave 16, regular kills pay 3, bosses pay 15, and wave completion pays 50. A fully cleared wave 16 pays 227 total gold, compared with 379 under the previous economy.

Tower prices rise by 20% of their original cost after each three purchases of the same type (Arrow: 70 → 84 → 98). Selling does not reset purchase counts; refunds use the amount actually spent. Upgrade prices keep their existing formula.

At wave 20, the southern trail opens and spawns alternate between both routes. Its marked ground is reserved from the start. Both routes end at the same gate, and towers prioritize enemies with the least distance left to travel. Victory comes after wave 30.

## Tuning difficulty

Edit `src/balance.js` to change the defaults in one place. `BALANCE` controls campaign length, starting resources, wave size, health growth, speed growth, spawn timing, rewards, purchase price increases, refunds, and the midgame ramp. `DIFFICULTIES` supplies the player-facing presets:

| Preset | Health | Speed | Base rewards | Midgame ramp strength |
| --- | --- | --- | --- | --- |
| Relaxed | 0.85× | 0.95× | 1× | Off |
| Standard | 1× | 1× | 1× | 1× |
| Hard | 1.2× | 1.08× | 0.8× | 1.25× |

The health multiplier includes the usual linear and quadratic wave growth. The midgame ramp adds further health and reduces rewards; it starts at zero on `startWave` and reaches its maximum `rampWaves` later. More enemies still produce more total income; tune `countPerWave` alongside rewards when changing wave sizes.

| Setting | Effect |
| --- | --- |
| `midgame.startWave`, `midgame.rampWaves` | Move the ramp earlier or make it more gradual. |
| `midgame.rewardReduction` | Raise above `0.4` to further restrict midgame income. |
| `midgame.healthBonus` | Raise above `0.25` to increase midgame combat pressure. |
| `waves.healthPerWave`, `waves.healthQuadratic` | Tune sustained enemy health growth. |
| `waves.baseCount`, `waves.countPerWave` | Tune wave size, also affecting available kill gold. |
| `economy.killGold`, `economy.bossGold` | Tune base kill bounties. |
| `economy.waveGold`, `economy.waveGoldPerWave` | Tune completion income before difficulty scaling. |
| `economy.purchasesPerIncrease`, `economy.priceIncrease` | Tune how quickly repeated tower purchases become expensive. |

For an isolated experiment, pass partial overrides to the model or the scene's `gameOptions`. Nested groups merge with defaults, and the scene preserves overrides on restart:

```js
new Game({
  difficulty: "standard",
  balance: {
    midgame: { startWave: 6, rampWaves: 6, rewardReduction: 0.5 },
    economy: { priceIncrease: 0.25 },
  },
});
```

Set `midgame.healthBonus` and `midgame.rewardReduction` to zero on Standard to restore the previous combat and reward curves. Tower damage, range, base prices, and attack intervals remain in `TOWERS` in `src/engine.js`.

Placement dimensions live in `src/board.js`. Road clearance is the visible road's half-width plus the tower footprint radius; tower spacing is two footprint radii. Rendering and placement use these same values, and Phaser converts both hover and click positions through the battlefield camera.
