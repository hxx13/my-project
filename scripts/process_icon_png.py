"""Make AI icon PNG transparent and trim watermark corner."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

BG_THRESHOLD = 40


def is_background(r: int, g: int, b: int) -> bool:
    return r <= BG_THRESHOLD and g <= BG_THRESHOLD and b <= BG_THRESHOLD


def process(src: Path, out: Path, trim_ratio: float = 0.06) -> None:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_background(r, g, b):
                px[x, y] = (0, 0, 0, 0)

    xs: list[int] = []
    ys: list[int] = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 0:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise SystemExit(f"empty after bg removal: {src}")

    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    bw, bh = right - left + 1, bottom - top + 1
    trim_x = max(4, int(bw * trim_ratio))
    trim_y = max(4, int(bh * trim_ratio))
    cropped = im.crop((left, top, right - trim_x + 1, bottom - trim_y + 1))

    cw, ch = cropped.size
    cpx = cropped.load()
    corner_x0 = int(cw * 0.88)
    corner_y0 = int(ch * 0.88)
    for y in range(corner_y0, ch):
        for x in range(corner_x0, cw):
            r, g, b, a = cpx[x, y]
            if a > 0 and is_background(r, g, b):
                cpx[x, y] = (0, 0, 0, 0)

    final_bbox = cropped.getbbox()
    if final_bbox:
        cropped = cropped.crop(final_bbox)

    out.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(out, format="PNG", optimize=True)
    print(f"Saved {out} size={cropped.size}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("src")
    parser.add_argument("out")
    parser.add_argument("--trim", type=float, default=0.06)
    args = parser.parse_args()
    process(Path(args.src), Path(args.out), args.trim)


if __name__ == "__main__":
    main()
