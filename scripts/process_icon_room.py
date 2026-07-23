"""Process room icon: remove black bg, export transparent PNG."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

SRC = Path(
    r"d:\codex\verson.1.2\20260416\aroapp\miniprogram\pages\assets\images\icon-room.png"
)
OUT = SRC  # overwrite in place

BLACK_THRESHOLD = 35


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    pixels = im.load()

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r <= BLACK_THRESHOLD and g <= BLACK_THRESHOLD and b <= BLACK_THRESHOLD:
                pixels[x, y] = (0, 0, 0, 0)

    bbox = im.getbbox()
    if not bbox:
        raise SystemExit("No visible pixels after processing")
    im = im.crop(bbox)
    im.save(OUT, format="PNG", optimize=True)
    print(f"Saved {OUT} size={im.size} mode={im.mode}")


if __name__ == "__main__":
    main()
