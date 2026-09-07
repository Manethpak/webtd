# Prepared ember towers

Derived from `../ember.png`; the source is unchanged.

- `level-1.png` through `level-3.png`: transparent 128×192 frames.
- `sheet.png`: 384×192 sheet, levels 1–3 from left to right (upgrade variants, not animation frames).
- `sheet.json`: source rectangles and rendering dimensions.
- `preview.png`: actual 64×96 display size on dark and light backgrounds; preview only.

Draw at 64×96 with image smoothing enabled. The shared ground anchor is
(64,184) in each source frame, or (32,92) at display size, matching the other
tower assets. After loading the sheet image:

```js
ctx.drawImage(sheet, (level - 1) * 128, 0, 128, 192, x - 32, y - 92, 64, 96);
```

Preparation trims empty padding and uses a common proportional scale and
baseline, preserving upgrade height differences. Color-based edge cleanup
is disabled for Ember to preserve the saturated fire colors. PNG compression
is lossless; resizing reduces resolution. No game renderer changes are included.

Regenerate from the project root:

```sh
uv run --with pillow python scripts/prepare_towers.py ember
```
