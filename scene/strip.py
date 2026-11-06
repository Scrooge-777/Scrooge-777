#!/usr/bin/env python3
"""Pack the 8 in-place swimming frames of one koi size into a cropped horizontal strip.

Usage: strip.py SPRITE_DIR TOTAL OUT.json

SPRITE_DIR holds roam_<TOTAL>_<0..7>.png from the git-koi `roam_sprites` example. The
JSON has the strip (base64 PNG), its frame size, the fish length and a pivot: a point on
the body axis 30% of the body length behind the nose, which the scene steers along the
route so the head leads and the body trails.
"""
import base64
import io
import json
import sys

import numpy as np
from PIL import Image

FRAMES = 8
PAD = 3


def main(argv):
    if len(argv) != 4:
        print(__doc__, file=sys.stderr)
        return 2
    sprite_dir, total, out_path = argv[1], argv[2], argv[3]
    frames = [Image.open(f"{sprite_dir}/roam_{total}_{i}.png").convert("RGBA") for i in range(FRAMES)]
    boxes, noses, axes = [], [], []
    for frame in frames:
        ys, xs = np.nonzero(np.asarray(frame)[:, :, 3] > 0)
        boxes.append((xs.min(), ys.min(), xs.max(), ys.max()))
        noses.append(xs.max())
        head = xs > xs.max() - max(8, (xs.max() - xs.min()) // 8)
        axes.append(ys[head].mean())
    boxes = np.array(boxes)
    x0, y0 = boxes[:, 0].min() - PAD, boxes[:, 1].min() - PAD
    x1, y1 = boxes[:, 2].max() + PAD + 1, boxes[:, 3].max() + PAD + 1
    w, h = int(x1 - x0), int(y1 - y0)
    strip = Image.new("RGBA", (w * FRAMES, h), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        strip.paste(frame.crop((x0, y0, x1, y1)), (i * w, 0))
    buffer = io.BytesIO()
    strip.save(buffer, "PNG", optimize=True)
    nose, axis = float(np.median(noses)), float(np.median(axes))
    length = nose - float(boxes[:, 0].min())
    result = {
        "w": w,
        "h": h,
        "frames": FRAMES,
        "length": int(length),
        "pivot": [round(nose - 0.30 * length - x0, 1), round(axis - y0, 1)],
        "b64": base64.b64encode(buffer.getvalue()).decode(),
    }
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(result, handle)
    print(f"strip: {w}x{h} frames={FRAMES} length={int(length)} -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
