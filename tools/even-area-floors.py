"""Evens out the lighting baked into the area floor tiles (every area after
Mossbound Ruins) and frames each with a slab edge, so neighbouring tiles meet
as laid paving rather than as a checkerboard of brighter and darker squares.

Each tile's large-scale brightness (a wrap-around Gaussian blur of its
luminance) is divided out toward the mean of the area's four tiles, keeping
every stone's own shading; then its outer pixel ring is darkened as the joint
and the ring inside it lit along the top and left and shaded along the bottom
and right. Run once on the tiles from prepare-area-art.ps1:

    python3 tools/even-area-floors.py
"""
from pathlib import Path
import numpy as np
from PIL import Image

AREAS = ["desert", "ember", "drowned", "fungal", "frozen", "crystal", "obsidian", "astral"]
SIGMA, STRENGTH = 10.0, 0.9
ROOT = Path(__file__).resolve().parent.parent / "public/assets/defend/areas"


def blur(x, sigma):
    n = x.shape[0]
    f = np.fft.fftfreq(n)
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (f[:, None] ** 2 + f[None, :] ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(x) * g))


def luminance(t):
    return t[..., 0] * 0.3 + t[..., 1] * 0.59 + t[..., 2] * 0.11


for area in AREAS:
    paths = [ROOT / area / f"floor-{i}.png" for i in range(1, 5)]
    tiles = [np.asarray(Image.open(p).convert("RGBA")).astype(np.float64) for p in paths]
    target = np.mean([luminance(t).mean() for t in tiles])
    for path, t in zip(paths, tiles):
        k = (target / np.maximum(blur(luminance(t), SIGMA), 1)) ** STRENGTH
        rgb = t[..., :3] * k[..., None]
        n = rgb.shape[0]
        rgb[0, :] *= 0.66
        rgb[-1, :] *= 0.66
        rgb[:, 0] *= 0.66
        rgb[:, -1] *= 0.66
        rgb[1, 1:-1] *= 1.1
        rgb[1:-1, 1] *= 1.06
        rgb[-2, 1:-1] *= 0.86
        rgb[1:-1, -2] *= 0.89
        out = t.copy()
        out[..., :3] = np.clip(np.round(rgb), 0, 255)
        Image.fromarray(out.astype(np.uint8)).save(path)
