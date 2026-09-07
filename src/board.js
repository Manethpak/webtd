// All dimensions use game coordinates; Phaser scales input and rendering together.
export const BOARD = { width: 900, height: 560 };
export const ROAD = { shadowWidth: 65, width: 53, innerWidth: 43 };
export const PLACEMENT = {
  radius: 23,
  bounds: { left: 35, right: 865, top: 40, bottom: 520 },
};
export const PATH_CLEARANCE = ROAD.width / 2 + PLACEMENT.radius;
export const TOWER_SPACING = PLACEMENT.radius * 2;

// Sprite hit areas are for selection only. Build mode always targets ground.
export function interactWithBoard(state, x, y, hasSprite = () => true) {
  const { model, buildType } = state;
  if (model.status !== "playing") return { action: "ignored" };
  if (buildType) {
    const tower = model.build(buildType, x, y);
    return { action: "build", tower };
  }
  const tower = model.towers.find((candidate) =>
    Math.hypot(x - candidate.x, y - candidate.y) < 25,
  ) ?? [...model.towers].sort((a, b) => b.y - a.y).find((candidate) =>
    hasSprite(candidate.type) && Math.abs(x - candidate.x) < 24 &&
    y >= candidate.y - [65, 78, 92][candidate.level - 1] && y <= candidate.y + 4,
  );
  state.selected = tower ?? null;
  return { action: "select", tower };
}
