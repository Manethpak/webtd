import Phaser from "phaser";
import { Game as GameModel, PATH, SECOND_PATH, TOWERS, distanceToPath } from "./engine.js";
import { BOARD, ROAD, PLACEMENT, PATH_CLEARANCE, TOWER_SPACING, interactWithBoard } from "./board.js";

const { width: WIDTH, height: HEIGHT } = BOARD;
const TOWER_FRAME = { width: 128, height: 192, displayWidth: 64, displayHeight: 96 };
const TOWER_SHEETS = {
  arrow: new URL("../assets/towers/arrow-prepared/sheet.png", import.meta.url).href,
  frost: new URL("../assets/towers/frost-prepared/sheet.png", import.meta.url).href,
  ember: new URL("../assets/towers/ember-prepared/sheet.png", import.meta.url).href,
};
const ENEMY_FRAME = { width: 96, height: 96, originX: 48 / 96, originY: 88 / 96 };
const ENEMY_SHEETS = {
  small: {
    url: new URL("../assets/enemies/small-prepared/sheet.png", import.meta.url).href,
    displaySize: 36,
  },
  normal: {
    url: new URL("../assets/enemies/normal-prepared/sheet.png", import.meta.url).href,
    displaySize: 48,
  },
  heavy: {
    url: new URL("../assets/enemies/heavy-prepared/sheet.png", import.meta.url).href,
    displaySize: 64,
  },
  boss: {
    url: new URL("../assets/enemies/boss-prepared/sheet.png", import.meta.url).href,
    displaySize: 80,
  },
};
const color = (hex) => Number.parseInt(hex.replace("#", ""), 16);

function seededScenery() {
  let seed = 128;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const trees = [];
  for (let i = 0; i < 100; i++) {
    const x = random() * WIDTH;
    const y = random() * HEIGHT;
    if (distanceToPath(x, y) > 62 && (y < 85 || y > 490 || x < 60 || x > 815 || random() > 0.62)) {
      trees.push({ x, y, radius: 13 + random() * 15 });
    }
  }
  const grass = Array.from({ length: 460 }, () => ({
    x: random() * WIDTH,
    y: random() * HEIGHT,
    size: random() * 3 + 1,
  }));
  return { trees, grass };
}

function strokeRoute(graphics, route, tint, width, alpha = 1) {
  graphics.lineStyle(width, tint, alpha);
  graphics.beginPath();
  route.forEach((point, index) => {
    if (index === 0) graphics.moveTo(point.x, point.y);
    else graphics.lineTo(point.x, point.y);
  });
  graphics.strokePath();
  // Round caps and joins match the segment-distance placement rule.
  graphics.fillStyle(tint, alpha);
  for (const point of route) graphics.fillCircle(point.x, point.y, width / 2);
}

function strokeDashedRoute(graphics, route, tint, width, dash = 6, gap = 12) {
  graphics.lineStyle(width, tint, 0.34);
  for (let index = 1; index < route.length; index++) {
    const start = route[index - 1];
    const end = route[index];
    const length = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y);
    const dx = (end.x - start.x) / length;
    const dy = (end.y - start.y) / length;
    for (let distance = 0; distance < length; distance += dash + gap) {
      const stop = Math.min(distance + dash, length);
      graphics.beginPath();
      graphics.moveTo(start.x + dx * distance, start.y + dy * distance);
      graphics.lineTo(start.x + dx * stop, start.y + dy * stop);
      graphics.strokePath();
    }
  }
}

function fillCircle(graphics, x, y, radius, tint, alpha = 1) {
  graphics.fillStyle(tint, alpha);
  graphics.fillCircle(x, y, radius);
}

export class BattlefieldScene extends Phaser.Scene {
  constructor({ isOverlayOpen, onStateChange, onSelectionChange, onHint, gameOptions = {} } = {}) {
    super({ key: "battlefield" });
    this.gameOptions = gameOptions;
    this.model = new GameModel(gameOptions);
    this.buildType = null;
    this.selected = null;
    this.hover = null;
    this.paused = false;
    this.speed = 1;
    this.isOverlayOpen = isOverlayOpen ?? (() => false);
    this.onStateChange = onStateChange ?? (() => {});
    this.onSelectionChange = onSelectionChange ?? (() => {});
    this.onHint = onHint ?? (() => {});
    this.scenery = seededScenery();
    this.towerViews = new Map();
    this.enemyViews = new Map();
    this.lastUiState = "";
    this.renderedSecondPath = null;
  }

  preload() {
    for (const [type, url] of Object.entries(TOWER_SHEETS)) {
      this.load.spritesheet(`${type}-towers`, url, {
        frameWidth: TOWER_FRAME.width,
        frameHeight: TOWER_FRAME.height,
      });
    }
    for (const [type, sheet] of Object.entries(ENEMY_SHEETS)) {
      this.load.spritesheet(`${type}-enemy`, sheet.url, {
        frameWidth: ENEMY_FRAME.width,
        frameHeight: ENEMY_FRAME.height,
      });
    }
  }

  create() {
    this.mapGraphics = this.add.graphics().setDepth(0);
    this.rangeGraphics = this.add.graphics().setDepth(50);
    this.ghostGraphics = this.add.graphics().setDepth(850);
    this.placementGraphics = this.add.graphics().setDepth(900);
    this.ghostTower = this.add
      .image(0, 0, "__DEFAULT")
      .setDisplaySize(TOWER_FRAME.displayWidth, TOWER_FRAME.displayHeight)
      .setOrigin(0.5, 92 / 96)
      .setAlpha(0.6)
      .setDepth(850)
      .setVisible(false);
    this.effectGraphics = this.add.graphics().setDepth(1000);
    this.ambientGraphics = this.add.graphics().setDepth(1100);
    this.createEnemyAnimations();
    this.createMapLabels();
    this.drawMap();

    this.input.on("pointermove", (pointer) => {
      this.hover = pointer.positionToCamera(this.cameras.main);
    });
    this.input.on("gameout", () => {
      this.hover = null;
    });
    this.input.on("pointerup", (pointer) => {
      const { x, y } = pointer.positionToCamera(this.cameras.main);
      this.hover = { x, y };
      this.handlePointer(x, y);
    });
    this.input.keyboard?.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE]);
    this.onSelectionChange();
  }

  createEnemyAnimations() {
    for (const type of Object.keys(ENEMY_SHEETS)) {
      const texture = `${type}-enemy`;
      const animation = `${type}-enemy-run`;
      if (!this.textures.exists(texture) || this.anims.exists(animation)) continue;
      this.anims.create({
        key: animation,
        frames: this.anims.generateFrameNumbers(texture, { start: 0, end: 7 }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }

  createMapLabels() {
    const style = {
      fontFamily: '"Arial Narrow", sans-serif',
      fontSize: "13px",
      fontStyle: "bold",
      color: "#f2f0d8",
      stroke: "#122219",
      strokeThickness: 3,
    };
    this.add.text(28, 108, "ENTRY →", style).setDepth(10);
    this.secondEntryLabel = this.add.text(105, 523, "", style).setDepth(10);
    this.add.text(786, 499, "THE GATE", style).setDepth(10);
  }

  drawMap() {
    const graphics = this.mapGraphics;
    graphics.clear();
    graphics.fillStyle(0x233a2c);
    graphics.fillRect(0, 0, WIDTH, HEIGHT);
    graphics.fillStyle(0x1c3024, 0.48);
    graphics.fillCircle(420, 270, 520);

    for (const blade of this.scenery.grass) {
      graphics.lineStyle(1, 0x78945b, 0.15);
      graphics.beginPath();
      graphics.moveTo(blade.x, blade.y);
      graphics.lineTo(blade.x - 2, blade.y - blade.size);
      graphics.strokePath();
    }

    const routes = this.model.secondPathOpen ? [PATH, SECOND_PATH] : [PATH];
    for (const route of routes) {
      strokeRoute(graphics, route, 0x142a20, ROAD.shadowWidth);
      strokeRoute(graphics, route, 0x767c5a, ROAD.width);
      strokeRoute(graphics, route, 0x969675, ROAD.innerWidth);
    }
    if (!this.model.secondPathOpen) {
      strokeDashedRoute(graphics, SECOND_PATH.slice(0, 4), 0xc5bc79, ROAD.innerWidth);
    }

    graphics.fillStyle(0x576555);
    for (let y = 427; y < 484; y += 43) {
      graphics.fillRect(846, y, 22, 22);
      graphics.fillStyle(0xa8b38a);
      graphics.fillRect(844, y - 5, 26, 10);
      graphics.fillStyle(0x576555);
    }
    graphics.lineStyle(3, 0xc0cea3);
    graphics.beginPath();
    graphics.moveTo(857, 438);
    graphics.lineTo(857, 470);
    graphics.strokePath();

    for (const tree of this.scenery.trees) this.drawTree(graphics, tree);
    this.renderedSecondPath = this.model.secondPathOpen;
    this.secondEntryLabel?.setText(this.model.secondPathOpen
      ? "ENTRY 2 ↑" : `OPENS WAVE ${this.model.config.secondPathWave} ↑`);
  }

  drawTree(graphics, tree) {
    graphics.fillStyle(0x10271b, 0.4);
    graphics.fillEllipse(tree.x + 6, tree.y + 7, tree.radius * 1.8, tree.radius * 0.9);
    graphics.fillStyle(0x4f5940);
    graphics.fillRect(tree.x - 2, tree.y - 6, 4, 16);
    [0x193c2b, 0x264b32, 0x345b3a].forEach((tint, index) => {
      graphics.fillStyle(tint);
      graphics.fillTriangle(
        tree.x,
        tree.y - tree.radius * 1.4 - index * 5,
        tree.x + tree.radius * (1 - index * 0.18),
        tree.y + 3 - index * 9,
        tree.x - tree.radius * (1 - index * 0.18),
        tree.y + 3 - index * 9,
      );
    });
  }

  update(time, deltaMs) {
    const realDelta = Math.min(deltaMs / 1000, 0.05);
    if (!this.paused && !this.isOverlayOpen()) {
      this.model.update(realDelta * this.speed, realDelta);
    }
    if (this.renderedSecondPath !== this.model.secondPathOpen) this.drawMap();
    this.syncTowers();
    this.syncEnemies();
    this.drawRanges();
    this.drawEffects();
    this.drawAmbient(time);
    this.notifyUiWhenChanged();
  }

  syncTowers() {
    const activeIds = new Set(this.model.towers.map((tower) => tower.id));
    for (const [id, view] of this.towerViews) {
      if (!activeIds.has(id)) {
        view.destroy();
        this.towerViews.delete(id);
      }
    }
    for (const tower of this.model.towers) {
      let view = this.towerViews.get(tower.id);
      if (!view) {
        view = this.createTowerView(tower);
        this.towerViews.set(tower.id, view);
      }
      view.setPosition(tower.x, tower.y).setDepth(100 + tower.y);
      if (view.getData("level") !== tower.level) {
        if (view.getData("spriteFrames")) {
          view.setFrame(tower.level - 1);
          view.setData("level", tower.level);
        } else {
          this.drawTower(view, tower);
        }
      }
    }
  }

  createTowerView(tower) {
    const texture = `${tower.type}-towers`;
    if (this.textures.exists(texture)) {
      return this.add
        .image(tower.x, tower.y, texture, tower.level - 1)
        .setDisplaySize(TOWER_FRAME.displayWidth, TOWER_FRAME.displayHeight)
        .setOrigin(0.5, 92 / 96)
        .setData("spriteFrames", true)
        .setData("level", tower.level);
    }
    const graphics = this.add.graphics({ x: tower.x, y: tower.y });
    this.drawTower(graphics, tower);
    return graphics;
  }

  drawTower(graphics, tower, alpha = 1) {
    graphics.clear();
    graphics.setAlpha(alpha);
    const tint = color(TOWERS[tower.type].color);
    graphics.fillStyle(0x0b171b, 0.34);
    graphics.fillEllipse(5, 17, 48, 20);
    fillCircle(graphics, 0, 5, 20, 0x3a4940);
    fillCircle(graphics, 0, 2, 16, 0x75816b);
    graphics.fillStyle(0x344a42);
    graphics.fillRect(-11, -14, 22, 25);
    graphics.fillStyle(0x587061);
    graphics.fillRect(-11, -14, 7, 25);
    graphics.fillStyle(tint);
    if (tower.type === "arrow") {
      graphics.fillRect(-14, -21, 28, 10);
      for (let x = -14; x < 15; x += 11) graphics.fillRect(x, -27, 6, 9);
      graphics.lineStyle(3, tint);
      graphics.beginPath();
      graphics.moveTo(0, -19);
      graphics.lineTo(0, -36);
      graphics.lineTo(5, -30);
      graphics.moveTo(0, -36);
      graphics.lineTo(-5, -30);
      graphics.strokePath();
    } else if (tower.type === "ember") {
      fillCircle(graphics, 0, -18, 13, 0x4c3830);
      graphics.fillStyle(tint);
      graphics.fillTriangle(-9, -16, -4, -29, 0, -24);
      graphics.fillTriangle(-9, -16, 0, -24, 10, -16);
      graphics.fillTriangle(0, -24, 5, -36, 10, -16);
      fillCircle(graphics, 1, -16, 4, 0xffe1a4);
    } else {
      graphics.fillStyle(tint);
      graphics.fillTriangle(0, -37, 12, -20, 0, -8);
      graphics.fillTriangle(0, -37, 0, -8, -12, -20);
      graphics.fillStyle(0xd3f2e5);
      graphics.fillTriangle(0, -37, 0, -8, -7, -20);
    }
    for (let index = 0; index < tower.level; index++) {
      fillCircle(graphics, (index - (tower.level - 1) / 2) * 6, 14, 2, tint);
    }
    graphics.setData("level", tower.level);
  }

  syncEnemies() {
    const activeIds = new Set(this.model.enemies.map((enemy) => enemy.id));
    for (const [id, view] of this.enemyViews) {
      if (!activeIds.has(id)) {
        view.container.destroy();
        this.enemyViews.delete(id);
      }
    }
    for (const enemy of this.model.enemies) {
      let view = this.enemyViews.get(enemy.id);
      if (!view) {
        view = this.createEnemyView(enemy);
        this.enemyViews.set(enemy.id, view);
      }
      this.drawEnemy(view, enemy);
    }
  }

  createEnemyView(enemy) {
    const type = enemy.boss
      ? "boss"
      : enemy.heavy
        ? "heavy"
        : enemy.fast
          ? "small"
          : "normal";
    const displaySize = ENEMY_SHEETS[type].displaySize;
    const shadow = this.add.graphics();
    const texture = `${type}-enemy`;
    let sprite = null;
    let fallback = null;

    if (this.textures.exists(texture)) {
      sprite = this.add
        .sprite(0, 0, texture)
        .setOrigin(ENEMY_FRAME.originX, ENEMY_FRAME.originY)
        .setDisplaySize(displaySize, displaySize)
        .play(`${type}-enemy-run`);
    } else {
      fallback = this.add.graphics();
    }

    const health = this.add.graphics();
    const container = this.add.container(enemy.x, enemy.y, [shadow, sprite ?? fallback, health]);
    return {
      container,
      sprite,
      fallback,
      shadow,
      health,
      displaySize,
      healthWidth: enemy.boss
        ? displaySize - 20
        : enemy.heavy
          ? displaySize - 16
          : Math.max(26, displaySize - 10),
      lastX: enemy.x,
    };
  }

  drawEnemy(view, enemy) {
    const { container, sprite, fallback, shadow, health, displaySize, healthWidth } = view;
    container.setPosition(enemy.x, enemy.y).setDepth(600 + enemy.y);

    const horizontalMovement = enemy.x - view.lastX;
    if (sprite && Math.abs(horizontalMovement) > 0.01) sprite.setFlipX(horizontalMovement < 0);
    view.lastX = enemy.x;

    shadow.clear();
    shadow.fillStyle(0x0c211b, enemy.boss ? 0.45 : 0.32);
    shadow.fillEllipse(3, -1, displaySize * 0.72, displaySize * 0.2);

    if (sprite) {
      if (enemy.slow) sprite.setTint(0x8fd9df);
      else sprite.clearTint();
      const slowMultiplier = enemy.slow ? 1 - 0.52 * (1 - (enemy.slowResist ?? 0)) : 1;
      sprite.anims.timeScale = this.paused || this.isOverlayOpen()
        ? 0
        : this.speed * Math.max(0.65, Math.min(1.75, enemy.speed / 45)) * slowMultiplier;
    } else {
      this.drawFallbackEnemy(fallback, enemy);
    }

    const healthY = -displaySize * ENEMY_FRAME.originY - 6;
    const healthTint = enemy.slow
      ? 0x9cdfdf
      : enemy.boss
        ? 0xef9a7d
        : enemy.heavy
          ? 0xd6bd8d
          : 0xc6dc93;
    health.clear();
    health.fillStyle(0x13251c);
    health.fillRect(-healthWidth / 2, healthY, healthWidth, 3);
    health.fillStyle(healthTint);
    health.fillRect(
      -healthWidth / 2,
      healthY,
      healthWidth * Math.max(0, enemy.hp / enemy.maxHp),
      3,
    );
  }

  drawFallbackEnemy(graphics, enemy) {
    const radius = enemy.boss ? 19 : enemy.heavy ? 15 : enemy.fast ? 8 : 11;
    const tint = enemy.slow
      ? 0x78b7bc
      : enemy.boss
        ? 0xb56b58
        : enemy.heavy
          ? 0xa28d70
          : enemy.fast
            ? 0xb9ad77
            : 0x8b7188;
    graphics.clear();
    fillCircle(graphics, 0, -radius, radius, tint);
    fillCircle(graphics, -3, -radius - 2, 2, 0xf6e3bd);
    fillCircle(graphics, 4, -radius - 2, 2, 0xf6e3bd);
    if (enemy.boss) {
      graphics.fillStyle(0xdcb47b);
      graphics.fillRect(-10, -radius - 20, 20, 5);
      for (let x = -10; x <= 10; x += 8) graphics.fillRect(x, -radius - 25, 4, 7);
    }
  }

  drawRanges() {
    const graphics = this.rangeGraphics;
    graphics.clear();
    this.ghostGraphics.clear();
    this.placementGraphics.clear();
    this.ghostTower.setVisible(false);
    if (this.selected) {
      this.drawRange(
        graphics,
        this.selected.x,
        this.selected.y,
        this.model.stats(this.selected).range,
        color(TOWERS[this.selected.type].color),
      );
    }
    if (this.buildType && this.model.status === "playing" && !this.isOverlayOpen()) {
      this.drawBuildArea(graphics);
      if (!this.hover) return;
      const valid = this.model.canBuild(this.buildType, this.hover.x, this.hover.y);
      const tint = valid ? 0xd5e79a : 0xef8c78;
      this.drawRange(
        graphics,
        this.hover.x,
        this.hover.y,
        TOWERS[this.buildType].range,
        tint,
      );
      const texture = `${this.buildType}-towers`;
      if (this.textures.exists(texture)) {
        this.ghostTower
          .setTexture(texture, 0)
          .setDisplaySize(TOWER_FRAME.displayWidth, TOWER_FRAME.displayHeight)
          .setPosition(this.hover.x, this.hover.y)
          .setTint(tint)
          .setVisible(true);
      } else {
        this.ghostGraphics.setPosition(this.hover.x, this.hover.y);
        this.drawTower(this.ghostGraphics, { type: this.buildType, level: 1 }, 0.6);
      }
      const marker = this.placementGraphics;
      marker.lineStyle(2, tint, 0.95);
      marker.strokeCircle(this.hover.x, this.hover.y, PLACEMENT.radius);
      fillCircle(marker, this.hover.x, this.hover.y, 3, tint);
    }
  }

  drawBuildArea(graphics) {
    const { left, right, top, bottom } = PLACEMENT.bounds;
    graphics.fillStyle(0xef8c78, 0.12);
    graphics.fillRect(0, 0, WIDTH, top);
    graphics.fillRect(0, bottom, WIDTH, HEIGHT - bottom);
    graphics.fillRect(0, top, left, bottom - top);
    graphics.fillRect(right, top, WIDTH - right, bottom - top);
    graphics.lineStyle(1, 0xef8c78, 0.4);
    graphics.strokeRect(left, top, right - left, bottom - top);
    for (const route of [PATH, SECOND_PATH]) {
      strokeRoute(graphics, route, 0xef8c78, PATH_CLEARANCE * 2, 0.08);
    }
    for (const tower of this.model.towers) {
      fillCircle(graphics, tower.x, tower.y, TOWER_SPACING, 0xef8c78, 0.1);
      graphics.lineStyle(1, 0xef8c78, 0.4);
      graphics.strokeCircle(tower.x, tower.y, TOWER_SPACING);
      graphics.strokeCircle(tower.x, tower.y, PLACEMENT.radius);
    }
  }

  drawRange(graphics, x, y, radius, tint) {
    graphics.fillStyle(tint, 0.07);
    graphics.fillCircle(x, y, radius);
    graphics.lineStyle(1, tint, 0.46);
    graphics.strokeCircle(x, y, radius);
  }

  drawEffects() {
    const graphics = this.effectGraphics;
    graphics.clear();
    for (const effect of this.model.effects) {
      const alpha = effect.life / 0.18;
      const source = this.model.towers.find(
        (tower) => tower.x === effect.x && tower.y === effect.y,
      );
      const shotHeight = source && this.textures.exists(`${source.type}-towers`)
        ? [46, 58, 68][source.level - 1]
        : 20;
      graphics.lineStyle(2, color(effect.color), alpha);
      graphics.beginPath();
      graphics.moveTo(effect.x, effect.y - shotHeight);
      graphics.lineTo(effect.tx, effect.ty);
      graphics.strokePath();
      fillCircle(
        graphics,
        effect.tx,
        effect.ty,
        effect.splash ? (1 - alpha) * effect.splash : 5,
        color(effect.color),
        0.27 * alpha,
      );
    }
  }

  drawAmbient(time) {
    const graphics = this.ambientGraphics;
    graphics.clear();
    for (let index = 0; index < 12; index++) {
      const x = (index * 137 + Math.sin(time * 0.0003 + index) * 16) % 880;
      const y = (index * 83 + Math.cos(time * 0.0002 + index) * 14) % 540;
      fillCircle(graphics, x, y, 1.4, 0xd5e79a, 0.34);
    }
  }

  handlePointer(x, y) {
    if (this.isOverlayOpen()) return;
    const result = interactWithBoard(this, x, y, (type) => this.textures.exists(`${type}-towers`));
    if (result.action === "ignored") return;
    if (result.action === "build") {
      this.onHint(
        result.tower
          ? `${TOWERS[this.buildType].name} tower built. Select it to upgrade.`
          : this.model.gold < this.model.towerCost(this.buildType)
            ? "You need more gold for this tower."
            : "Move the base marker outside the shaded trails, tower circles, and map edges.",
      );
    }
    this.onSelectionChange();
  }

  choose(type) {
    this.buildType = this.buildType === type ? null : type;
    this.selected = null;
    this.onSelectionChange();
  }

  deselect() {
    this.selected = null;
    this.buildType = null;
    this.onSelectionChange();
  }

  upgradeSelected() {
    if (this.selected) this.model.upgrade(this.selected);
    this.onSelectionChange();
  }

  sellSelected() {
    if (this.selected) this.model.sell(this.selected);
    this.selected = null;
    this.onSelectionChange();
  }

  startWave() {
    this.model.startWave();
    this.paused = false;
    this.onStateChange();
  }

  togglePaused() {
    this.paused = !this.paused;
    this.onStateChange();
  }

  cycleSpeed() {
    this.speed = this.speed === 1 ? 2 : 1;
    this.onStateChange();
  }

  resetGame(gameOptions = this.gameOptions) {
    this.gameOptions = gameOptions;
    this.model = new GameModel(gameOptions);
    this.selected = null;
    this.buildType = null;
    this.hover = null;
    this.paused = false;
    this.speed = 1;
    this.lastUiState = "";
    for (const view of this.towerViews.values()) view.destroy();
    for (const view of this.enemyViews.values()) view.container.destroy();
    this.towerViews.clear();
    this.enemyViews.clear();
    if (this.mapGraphics) this.drawMap();
  }

  notifyUiWhenChanged() {
    const state = [
      this.model.gold,
      this.model.lives,
      this.model.wave,
      this.model.status,
      this.model.active,
      this.model.remaining,
      this.model.enemies.length,
      this.model.kills,
      Math.ceil(this.model.waveCountdown),
      this.paused,
      this.speed,
    ].join(":");
    if (state !== this.lastUiState) {
      this.lastUiState = state;
      this.onStateChange();
    }
  }
}
