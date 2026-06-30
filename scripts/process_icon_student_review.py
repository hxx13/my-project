"""Process student review icon: transparent bg, no watermark."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

SRC = Path(
    r"C:\Users\admin\.cursor\projects\d-codex-verson-1-2-20260416\assets"
    r"\c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_e528b38a70cdc6b19df2fc852d12b3b9"
    r"_images______________________13_-bfb7fd63-164a-4ef8-a51b-a9d42367e6ea.png"
)
OUT = Path(__file__).resolve().parents[1] / "aroapp/miniprogram/pages/assets/images/icon-student-review.png"

BG_THRESHOLD = 40


def is_background(r: int, g: int, b: int) -> bool:
    return r <= BG_THRESHOLD and g <= BG_THRESHOLD and b <= BG_THRESHOLD


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    px = im.load()

    # Step 1: black canvas -> transparent
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_background(r, g, b):
                px[x, y] = (0, 0, 0, 0)

    # Step 2: find icon bbox from non-transparent pixels
    xs: list[int] = []
    ys: list[int] = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 0:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise SystemExit("empty after bg removal")

    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    bw, bh = right - left + 1, bottom - top + 1

    # Step 3: watermark is tiny text hugging bottom-right outside the white tile.
    # Trim ~6% from bottom/right of bbox — stays inside the rounded white icon.
    trim_x = max(4, int(bw * 0.06))
    trim_y = max(4, int(bh * 0.06))
    crop_box = (left, top, right - trim_x + 1, bottom - trim_y + 1)
    cropped = im.crop(crop_box)

    # Step 4: any remaining dark specks in trimmed corner -> transparent
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

    OUT.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(OUT, format="PNG", optimize=True)
    print(f"Saved {OUT} size={cropped.size}")


if __name__ == "__main__":
    main()
