# Prepared enemy assets

`small-prepared/`, `normal-prepared/`, `heavy-prepared/`, and `boss-prepared/`
are derived from their matching source PNGs. Original source images are
unchanged. Each folder contains:

- `run-1.png` through `run-8.png`: transparent 96×96 frames.
- `sheet.png`: a 768×96 sheet with eight running poses, ordered left to right
  across the source's top row, then its bottom row.
- `sheet.json`: source rectangles, display dimensions, ground anchor, and a
  suggested looping run animation (10 fps; tune when integrating).
- `preview.png`: frames at display size on dark and light backgrounds; preview only.

The shared ground anchor is (48,88), with centered, bottom-aligned poses.
All poses within an enemy use one proportional scale; frames are not stretched
individually. Preparation trims transparent padding, conservatively removes
extreme colored edge contamination like the tower pipeline, and resizes using
premultiplied alpha to avoid dark halos. Resizing reduces resolution; PNG
compression is lossless.

Suggested display sizes and anchors are:

| Enemy | Display size | Display anchor |
| --- | --- | --- |
| Small | 36×36 | (18,33) |
| Normal | 48×48 | (24,44) |
| Heavy | 64×64 | (32,59) |
| Boss | 80×80 | (40,73) |

All enemies face right; flip horizontally for leftward movement. These sheets
provide one running direction, not separate directional animations. Runtime
enemy rendering is not changed by preparation.

## Phaser import

Example from a module under `src/`, following the tower loader's URL pattern:

```js
const smallEnemyUrl = new URL("../assets/enemies/small-prepared/sheet.png", import.meta.url).href;

// In preload():
this.load.spritesheet("small-enemy", smallEnemyUrl, {
  frameWidth: 96,
  frameHeight: 96,
});

// In create(), after loading:
this.anims.create({
  key: "small-enemy-run",
  frames: this.anims.generateFrameNumbers("small-enemy", { start: 0, end: 7 }),
  frameRate: 10,
  repeat: -1,
});
this.add.sprite(x, y, "small-enemy")
  .setOrigin(48 / 96, 88 / 96)
  .setDisplaySize(36, 36)
  .play("small-enemy-run");
```

For other enemies, use the matching prepared folder, unique texture/animation
keys, and the display size listed above. `sheet.json` is descriptive metadata,
matching the tower convention; load `sheet.png` as a spritesheet, not a Phaser
atlas.

## Regenerate

From the project root with Pillow:

```sh
uv run --with pillow python scripts/prepare_enemies.py
```

Append `small`, `normal`, `heavy`, or `boss` to regenerate only that enemy.
