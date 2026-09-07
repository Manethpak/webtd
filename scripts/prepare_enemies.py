"""Prepare the supplied 4x2 enemy run sheets; requires Pillow.

Run: uv run --with pillow python scripts/prepare_enemies.py
Or pass an enemy type to prepare just one enemy.
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
FRAME = (96, 96)
ANCHOR = (48, 88)
DISPLAY = {
    "small": (36, 36),
    "normal": (48, 48),
    "heavy": (64, 64),
    "boss": (80, 80),
}
COLUMNS, ROWS = 4, 2


def prepare(enemy):
    source_path = ROOT / f"assets/enemies/{enemy}.png"
    out = ROOT / f"assets/enemies/{enemy}-prepared"
    with Image.open(source_path) as image:
        source = image.convert("RGBA")

    crops = []
    for row in range(ROWS):
        for column in range(COLUMNS):
            # The supplied dimensions are not exact multiples of the grid.
            crop = source.crop((
                round(column * source.width / COLUMNS),
                round(row * source.height / ROWS),
                round((column + 1) * source.width / COLUMNS),
                round((row + 1) * source.height / ROWS),
            ))
            # Match tower preparation: remove faint pixels and only extreme
            # red/yellow/green contamination at transparent cutout edges.
            interior = list(crop.getchannel("A").filter(ImageFilter.MinFilter(7)).getdata())
            pixels = list(crop.getdata())
            for i, (r, g, b, a) in enumerate(pixels):
                fringe = ((r > 210 and g < 100 and b < 100)
                          or (g > 210 and r < 100 and b < 100)
                          or (r > 210 and g > 210 and b < 80))
                if a < 16 or (interior[i] < 128 and fringe):
                    pixels[i] = (0, 0, 0, 0)
            crop.putdata(pixels)
            bounds = crop.getchannel("A").getbbox()
            if bounds is None:
                raise ValueError(f"{enemy}: empty frame at row {row}, column {column}")
            crops.append(crop.crop(bounds))

    # Share one proportional scale across the animation to preserve pose sizes.
    scale = min(80 / max(c.width for c in crops), 80 / max(c.height for c in crops))
    out.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (FRAME[0] * len(crops), FRAME[1]))
    entries = []
    for index, crop in enumerate(crops):
        size = tuple(max(1, round(d * scale)) for d in crop.size)
        sprite = crop.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")
        frame = Image.new("RGBA", FRAME)
        frame.alpha_composite(sprite, (ANCHOR[0] - size[0] // 2, ANCHOR[1] - size[1]))
        frame.save(out / f"run-{index + 1}.png", optimize=True)
        sheet.alpha_composite(frame, (index * FRAME[0], 0))
        entries.append({"frame": index, "x": index * FRAME[0], "y": 0, "w": FRAME[0], "h": FRAME[1]})
    sheet.save(out / "sheet.png", optimize=True)
    display = DISPLAY[enemy]
    metadata = {
        "image": "sheet.png",
        "frameSize": list(FRAME),
        "displaySize": list(display),
        "anchor": list(ANCHOR),
        "displayAnchor": [round(ANCHOR[i] * display[i] / FRAME[i]) for i in range(2)],
        "animations": {"run": {"start": 0, "end": 7, "frameRate": 10, "repeat": -1}},
        "frames": entries,
    }
    (out / "sheet.json").write_text(json.dumps(metadata, indent=2) + "\n")

    preview = Image.new("RGB", (display[0] * len(crops), display[1] * 2))
    small = sheet.convert("RGBa").resize((preview.width, display[1]), Image.Resampling.LANCZOS).convert("RGBA")
    for y, color in [(0, "#233a2c"), (display[1], "#eeeeee")]:
        preview.paste(color, (0, y, preview.width, y + display[1]))
        preview.paste(small, (0, y), small)
    preview.save(out / "preview.png", optimize=True)
    print(f"Prepared {enemy}: {len(crops)} frames in {out.relative_to(ROOT)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("enemy", nargs="?", choices=tuple(DISPLAY))
    args = parser.parse_args()
    for enemy in (args.enemy,) if args.enemy else DISPLAY:
        prepare(enemy)
