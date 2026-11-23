"""Draws the Android app's launcher icons and splash screens from
public/GameIcon.png. Run from the repository root after the game icon
changes: python3 scripts/android/icons.py (needs Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "android/app/src/main/res"
BG = (0x0d, 0x0b, 0x09, 255)
icon = Image.open(ROOT / "public/GameIcon.png").convert("RGBA")

def fit(size):
    return icon.resize((size, size), Image.LANCZOS)

for density, scale in {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}.items():
    out = RES / f"mipmap-{density}"
    side = round(48 * scale)
    fit(side).save(out / "ic_launcher.png")
    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, side - 1, side - 1), fill=255)
    round_icon = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    round_icon.paste(fit(side), (0, 0), mask)
    round_icon.save(out / "ic_launcher_round.png")
    # Adaptive icons: the 108dp foreground is cropped to a shape by the
    # launcher, so the picture fills it edge to edge.
    fit(round(108 * scale)).save(out / "ic_launcher_foreground.png")

for splash in RES.glob("drawable*/splash.png"):
    w, h = Image.open(splash).size
    canvas = Image.new("RGBA", (w, h), BG)
    side = min(w, h) // 3
    canvas.paste(fit(side), ((w - side) // 2, (h - side) // 2))
    canvas.convert("RGB").save(splash)
