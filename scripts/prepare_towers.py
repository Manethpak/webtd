"""Prepare a supplied tower sheet; requires Pillow.

Run: uv run --with pillow python scripts/prepare_towers.py
Frost: uv run --with pillow python scripts/prepare_towers.py frost
Ember: uv run --with pillow python scripts/prepare_towers.py ember
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
FRAME = (128, 192)
ANCHOR = (64, 184)


def prepare(tower="arrow"):
    SOURCE = ROOT / f"assets/towers/{tower}.png"
    OUT = ROOT / f"assets/towers/{tower}-prepared"
    source = Image.open(SOURCE).convert("RGBA")
    alpha = source.getchannel("A")
    # Discover separated tower columns, ignoring nearly invisible pixels.
    spans = []
    start = None
    for x in range(source.width + 1):
        occupied = x < source.width and alpha.crop((x, 0, x + 1, source.height)).getextrema()[1] > 32
        if occupied and start is None:
            start = x
        if not occupied and start is not None:
            if x - start > 20:
                spans.append((start, x))
            start = None
    if len(spans) != 3:
        raise ValueError(f"Expected three separated towers, found {len(spans)}")

    crops = []
    for left, right in spans:
        crop = source.crop((left, 0, right, source.height))
        # Remove only extreme red/yellow/green contamination at cutout edges.
        edge_interior = crop.getchannel("A").filter(ImageFilter.MinFilter(7))
        pixels = list(crop.getdata())
        interior = list(edge_interior.getdata())
        for i, (r, g, b, a) in enumerate(pixels):
            fringe = (r > 210 and g < 100 and b < 100) or (g > 210 and r < 100 and b < 100) or (r > 210 and g > 210 and b < 80)
            # Ember's fire uses these saturated colors intentionally.
            if a < 16 or (tower != "ember" and interior[i] < 128 and fringe):
                pixels[i] = (0, 0, 0, 0)
        crop.putdata(pixels)
        crop = crop.crop(crop.getchannel("A").getbbox())
        crops.append(crop)

    # One scale preserves the upgrade size progression without stretching.
    scale = min(96 / max(c.width for c in crops), 176 / max(c.height for c in crops))
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (FRAME[0] * 3, FRAME[1]))
    entries = []
    for level, crop in enumerate(crops, 1):
        size = tuple(round(d * scale) for d in crop.size)
        # Premultiplied alpha prevents dark halos during resampling.
        sprite = crop.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")
        frame = Image.new("RGBA", FRAME)
        frame.alpha_composite(sprite, (ANCHOR[0] - size[0] // 2, ANCHOR[1] - size[1]))
        frame.save(OUT / f"level-{level}.png", optimize=True)
        sheet.alpha_composite(frame, ((level - 1) * FRAME[0], 0))
        entries.append({"level": level, "x": (level - 1) * FRAME[0], "y": 0, "w": FRAME[0], "h": FRAME[1]})
    sheet.save(OUT / "sheet.png", optimize=True)
    metadata = {"image": "sheet.png", "frameSize": list(FRAME), "displaySize": [64, 96], "anchor": list(ANCHOR), "displayAnchor": [32, 92], "frames": entries}
    (OUT / "sheet.json").write_text(json.dumps(metadata, indent=2) + "\n")

    # Preview at actual display size on light and game-colored backgrounds.
    preview = Image.new("RGB", (192, 192))
    small = sheet.convert("RGBa").resize((192, 96), Image.Resampling.LANCZOS).convert("RGBA")
    for y, color in [(0, "#233a2c"), (96, "#eeeeee")]:
        preview.paste(color, (0, y, 192, y + 96))
        preview.paste(small, (0, y), small)
    preview.save(OUT / "preview.png", optimize=True)
    for path in sorted(OUT.glob("*.png")):
        with Image.open(path) as image:
            print(f"{path.relative_to(ROOT)}: {image.size}, {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tower", nargs="?", default="arrow", choices=("arrow", "frost", "ember"))
    prepare(parser.parse_args().tower)
