#!/usr/bin/env python3
"""Put the git-koi GIF (transparent background) into a pixel-art pond.

The engine swims the koi in one clockwise lap (or hovers, depending on the day's
activity) on a transparent 512 px canvas whose pixels are 2x2 blocks of a 256 px
native grid. This script leaves that motion untouched and adds what makes it
readable, all drawn on the same native grid so the result stays pixel art and the
GIF stays small:

* wake rings that spread from where the koi has just been (shows speed and heading),
* a hard drop shadow under the koi (depth),
* a posterized pond with a faint light pattern,
* two lily pads that frame the empty middle of the lap.

Every effect is periodic in the loop length, so the GIF still loops seamlessly.

Usage: koi_pond.py INPUT.gif OUTPUT.gif
"""
from __future__ import annotations

import math
import sys

import numpy as np
from PIL import Image, ImageDraw

SCALE = 2                     # engine pixels per native pixel
CROP = 12                     # native pixels trimmed from each side (empty margin)
NATIVE = 256 - 2 * CROP       # native canvas size (232) -> 464 px output
WAKE_EVERY = 3                # frames between wake rings
WAKE_LIFE = 27                # frames a ring lives
WAKE_SPEED = 1.7              # ring radius growth, native px per frame
WAKE_START = 3.0
SHADOW_OFFSET = (4, 6)        # native px
DEFAULT_DURATION_MS = 70

# Palette of the pond (RGB). Rings fade through RING_TONES as they age.
WATER_BANDS = [(9, 33, 48), (10, 36, 52), (11, 40, 57), (12, 43, 61)]
LIGHT_TONE = (14, 49, 68)
RING_TONES = [(66, 132, 150), (48, 104, 122), (34, 80, 98), (24, 62, 80)]
SHADOW_MULTIPLY = 0.55


def load_frames(path: str) -> tuple[list[np.ndarray], int]:
    """Return native-grid RGBA arrays (H, W, 4) and the GIF frame delay in ms."""
    src = Image.open(path)
    frames = []
    for index in range(src.n_frames):
        src.seek(index)
        full = np.asarray(src.convert("RGBA"))
        native = full[::SCALE, ::SCALE]                       # exact: 2x2 blocks
        frames.append(native[CROP:CROP + NATIVE, CROP:CROP + NATIVE].copy())
    return frames, int(src.info.get("duration", DEFAULT_DURATION_MS))


def koi_centers(frames: list[np.ndarray]) -> list[tuple[float, float]]:
    centers = []
    for frame in frames:
        ys, xs = np.nonzero(frame[..., 3] > 0)
        if len(xs) == 0:
            centers.append((NATIVE / 2, NATIVE / 2))
        else:
            centers.append((float(xs.mean()), float(ys.mean())))
    return centers


def base_water() -> np.ndarray:
    """Posterized radial pond (RGB, H x W x 3) with a faint static light pattern."""
    yy, xx = np.mgrid[0:NATIVE, 0:NATIVE].astype(np.float32)
    dist = np.hypot(xx - NATIVE / 2, yy - NATIVE / 2) / (NATIVE * 0.72)
    band = np.clip((1.0 - np.clip(dist, 0, 1) ** 1.3) * len(WATER_BANDS), 0, len(WATER_BANDS) - 1)
    rgb = np.array(WATER_BANDS, dtype=np.uint8)[band.astype(int)]
    light = np.sin(xx / 11.0 + 1.3 * np.sin(yy / 15.0)) * np.sin(yy / 9.5 + 1.2 * np.sin(xx / 13.0))
    rgb[light > 0.86] = LIGHT_TONE
    return rgb


def ring_layer(frame_index: int, centers: list[tuple[float, float]]) -> np.ndarray:
    """Tone index per pixel (-1 = no ring); rings wrap around the loop."""
    count = len(centers)
    yy, xx = np.mgrid[0:NATIVE, 0:NATIVE].astype(np.float32)
    tones = np.full((NATIVE, NATIVE), -1, dtype=np.int8)
    for age in range(WAKE_LIFE - 1, -1, -1):          # oldest first, newest on top
        if age % WAKE_EVERY != 0:
            continue
        cx, cy = centers[(frame_index - age) % count]
        radius = WAKE_START + age * WAKE_SPEED
        distance = np.hypot(xx - cx, yy - cy)
        tone = min(len(RING_TONES) - 1, int(age / WAKE_LIFE * len(RING_TONES)))
        tones[np.abs(distance - radius) < 0.62] = tone
    return tones


def lily_pads() -> tuple[np.ndarray, np.ndarray]:
    """Return (rgb, mask) of the lily pads, drawn once on the native grid."""
    layer = Image.new("RGB", (NATIVE, NATIVE), (0, 0, 0))
    mask = Image.new("L", (NATIVE, NATIVE), 0)
    paint, cut = ImageDraw.Draw(layer), ImageDraw.Draw(mask)

    def pad(cx: float, cy: float, r: int, notch: int, shade: tuple[int, int, int]) -> None:
        box = (cx - r, cy - r, cx + r, cy + r)
        paint.ellipse(box, fill=shade)
        cut.ellipse(box, fill=255)
        paint.pieslice(box, notch, notch + 30, fill=(0, 0, 0))
        cut.pieslice(box, notch, notch + 30, fill=0)
        vein = tuple(min(255, c + 20) for c in shade)
        paint.arc((cx - r * 0.55, cy - r * 0.55, cx + r * 0.55, cy + r * 0.55), notch + 40, notch + 320, fill=vein)

    pad(NATIVE * 0.13, NATIVE * 0.86, 15, 20, (22, 88, 56))
    pad(NATIVE * 0.89, NATIVE * 0.12, 11, 200, (28, 100, 62))
    bx, by = NATIVE * 0.145, NATIVE * 0.845                  # blossom on the big pad
    for k in range(6):
        angle = k * math.pi / 3
        px, py = bx + math.cos(angle) * 4, by + math.sin(angle) * 4
        paint.ellipse((px - 3, py - 3, px + 3, py + 3), fill=(236, 150, 178))
        cut.ellipse((px - 3, py - 3, px + 3, py + 3), fill=255)
    paint.ellipse((bx - 2, by - 2, bx + 2, by + 2), fill=(250, 214, 120))
    cut.ellipse((bx - 2, by - 2, bx + 2, by + 2), fill=255)
    return np.asarray(layer), np.asarray(mask) > 0


def compose(frames: list[np.ndarray], centers: list[tuple[float, float]]) -> list[Image.Image]:
    water = base_water()
    pad_rgb, pad_mask = lily_pads()
    dx, dy = SHADOW_OFFSET
    out: list[Image.Image] = []
    for index, koi in enumerate(frames):
        rgb = water.copy()
        tones = ring_layer(index, centers)
        for tone, colour in enumerate(RING_TONES):
            rgb[tones == tone] = colour
        rgb[pad_mask] = pad_rgb[pad_mask]
        # hard shadow: the koi's silhouette shifted down-right, only where the koi is not
        silhouette = koi[..., 3] > 0
        shadow = np.zeros_like(silhouette)
        shadow[dy:, dx:] = silhouette[:-dy, :-dx]
        shadow &= ~silhouette
        rgb[shadow] = (rgb[shadow] * SHADOW_MULTIPLY).astype(np.uint8)
        rgb[silhouette] = koi[..., :3][silhouette]
        native = Image.fromarray(rgb, "RGB")
        out.append(native.resize((NATIVE * SCALE, NATIVE * SCALE), Image.NEAREST))
    return out


def save_gif(frames: list[Image.Image], path: str, duration_ms: int) -> None:
    """Quantize every frame against one shared palette so colors never flicker."""
    side = frames[0].size[0]
    picks = frames[:: max(1, len(frames) // 24)][:24]
    sample = Image.new("RGB", (side * 6, side * 4))
    for slot, picked in enumerate(picks):
        sample.paste(picked, ((slot % 6) * side, (slot // 6) * side))
    palette = sample.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    paletted = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    paletted[0].save(
        path,
        save_all=True,
        append_images=paletted[1:],
        duration=duration_ms,
        loop=0,
        optimize=False,
        disposal=1,
    )


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    frames, duration = load_frames(argv[1])
    if not frames:
        print("koi_pond: input GIF has no frames", file=sys.stderr)
        return 1
    centers = koi_centers(frames)
    pond = compose(frames, centers)
    save_gif(pond, argv[2], duration)
    print(f"koi_pond: wrote {argv[2]} ({len(pond)} frames, {pond[0].size[0]}px)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
