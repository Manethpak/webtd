import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "./engine.js";
import { PATH_CLEARANCE, PLACEMENT, TOWER_SPACING, interactWithBoard } from "./board.js";

test("building through another tower's artwork places on valid ground without cancelling", () => {
  const model = new Game();
  model.gold = 1000;
  const existing = model.build("arrow", 130, 300);
  existing.level = 3;
  const state = { model, buildType: "arrow", selected: null };
  const result = interactWithBoard(state, 130, 240);
  assert.equal(result.action, "build");
  assert.ok(result.tower);
  assert.equal(result.tower.x, 130);
  assert.equal(result.tower.y, 240);
  assert.equal(state.buildType, "arrow");
  assert.equal(state.selected, null);
  assert.equal(model.towers.length, 2);
});

test("blocked ground and insufficient gold preserve build mode and investment", () => {
  const model = new Game();
  const existing = model.build("arrow", 130, 300);
  const state = { model, buildType: "arrow", selected: null };
  for (const [x, y] of [[130, 300], [130, 160], [10, 10]]) {
    assert.equal(interactWithBoard(state, x, y).tower, null);
    assert.equal(state.buildType, "arrow");
    assert.equal(state.selected, null);
    assert.equal(model.gold, 80);
    assert.deepEqual(model.towers, [existing]);
  }
  model.gold = 0;
  assert.equal(interactWithBoard(state, 130, 240).tower, null);
  assert.equal(state.buildType, "arrow");
});

test("selection still accepts tower bases and artwork outside build mode", () => {
  const model = new Game();
  const tower = model.build("arrow", 130, 300);
  tower.level = 3;
  const state = { model, buildType: null, selected: null };
  interactWithBoard(state, 130, 240);
  assert.equal(state.selected, tower);
  interactWithBoard(state, 130, 300, () => false);
  assert.equal(state.selected, tower);
  interactWithBoard(state, 130, 240, () => false);
  assert.equal(state.selected, null);
  model.status = "lost";
  assert.equal(interactWithBoard(state, 130, 300).action, "ignored");
});

test("trail clearance follows the rendered road plus the tower footprint on both routes", () => {
  const model = new Game();
  for (const pathY of [160, 455]) {
    const x = pathY === 160 ? 130 : 300;
    const direction = pathY === 160 ? -1 : 1;
    assert.equal(model.canBuild("arrow", x, pathY + direction * PATH_CLEARANCE), false);
    assert.equal(model.canBuild("arrow", x, pathY + direction * (PATH_CLEARANCE + 0.1)), true);
  }
  // Outside the first turn, both segments end at the same rounded corner.
  const offset = PATH_CLEARANCE / Math.sqrt(2);
  assert.equal(model.canBuild("arrow", 215 + offset - 0.1, 160 - offset), false);
  assert.equal(model.canBuild("arrow", 215 + offset + 0.1, 160 - offset), true);
});

test("placement guides share exact spacing and board boundaries with validation", () => {
  const model = new Game();
  const tower = model.build("arrow", 130, 300);
  assert.equal(model.canBuild("arrow", tower.x, tower.y - TOWER_SPACING), false);
  assert.equal(model.canBuild("arrow", tower.x, tower.y - TOWER_SPACING - 0.1), true);
  const { left, right, top, bottom } = PLACEMENT.bounds;
  for (const [x, y] of [[left, 90], [right, 90], [350, top], [350, bottom]]) {
    assert.equal(model.canBuild("arrow", x, y), false);
  }
  for (const [x, y] of [[left + 0.1, 90], [right - 0.1, 90], [350, top + 0.1], [350, bottom - 0.1]]) {
    assert.equal(model.canBuild("arrow", x, y), true);
  }
});
