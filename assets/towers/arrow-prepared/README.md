# Prepared arrow towers

Derived from `../arrow.png`; the source is unchanged.

- `level-1.png` through `level-3.png`: transparent 128×192 frames.
- `sheet.png`: 384×192 sheet, levels 1–3 from left to right (upgrade variants, not animation frames).
- `sheet.json`: source rectangles and rendering dimensions.
- `preview.png`: actual 64×96 display size on dark and light backgrounds; preview only.

Draw at 64×96 with image smoothing enabled. The shared ground anchor is
(64,184) in each source frame, or (32,92) at display size. Example after
loading the sheet image:

```js
ctx.drawImage(sheet, (level - 1) * 128, 0, 128, 192, x - 32, y - 92, 64, 96);
```

Preparation trims empty padding, conservatively removes extreme colored
edge contamination, and uses a common proportional scale and baseline.
It preserves upgrade height differences. PNG compression is lossless;
resizing reduces resolution. The game renderer loads `sheet.json` and `sheet.png` for placed towers and placement previews, selecting the frame by upgrade level. The build card uses `level-1.png`. If the sheet cannot load, the renderer falls back to the original drawn tower.

Regenerate from the project root with Pillow installed:

```sh
uv run --with pillow python scripts/prepare_towers.py
```
