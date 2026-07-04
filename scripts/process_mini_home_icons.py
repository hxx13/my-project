#!/usr/bin/env python3
"""清理 AI 水印，去除黑底，导出透明 PNG 小程序图标。"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(
    r"C:\Users\admin\.cursor\projects\d-codex-verson-1-2-20260416\assets"
)
OUT_DIR = ROOT / "aroapp" / "miniprogram" / "pages" / "assets" / "images"

# 用户提供的图标：房间 + 出入记录 / 活跃度 / 笼架 / 违规记录
SOURCES = [
    (
        "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_e528b38a70cdc6b19df2fc852d12b3b9_images______________________10_-654541b1-30d0-4017-8750-59de2d7c3326.png",
        "icon-room.png",
    ),
    (
        "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_e528b38a70cdc6b19df2fc852d12b3b9_images______________________9_-65e8d27d-b1d0-40de-ac1c-d802c49f197a.png",
        "icon-records.png",
    ),
    (
        "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_e528b38a70cdc6b19df2fc852d12b3b9_images______________________6_-cec37e70-37f5-4417-a314-dd3f2a0cf493.png",
        "icon-group.png",
    ),
    (
        "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_e528b38a70cdc6b19df2fc852d12b3b9_images______________________7_-131ca73b-7ca8-426a-9520-6022b3c94cd8.png",
        "icon-cage.png",
    ),
    (
        "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_e528b38a70cdc6b19df2fc852d12b3b9_images______________________8_-e4d3090b-11fd-408d-b21d-bbcd7f1fd6f3.png",
        "icon-violation.png",
    ),
]

MAX_SIDE = 256
BG_THRESH = 36
PAD_PX = 2


def scrub_watermark(arr: np.ndarray) -> None:
    """仅涂黑右下角水印区（含白色文字），不裁切图标主体。"""
    h, w = arr.shape[:2]
    y0 = int(h * 0.875)
    x0 = int(w * 0.62)
    arr[y0:h, x0:w] = 0


def edge_black_background(rgb: np.ndarray, thresh: int = BG_THRESH) -> np.ndarray:
    """从四边泛洪标记与画布黑底连通的区域（保留图标内部深色块）。"""
    h, w, _ = rgb.shape
    dark = rgb.max(axis=2) <= thresh
    bg = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        for y in (0, h - 1):
            if dark[y, x]:
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if dark[y, x]:
                q.append((y, x))

    while q:
        y, x = q.popleft()
        if bg[y, x] or not dark[y, x]:
            continue
        bg[y, x] = True
        if y > 0 and dark[y - 1, x]:
            q.append((y - 1, x))
        if y + 1 < h and dark[y + 1, x]:
            q.append((y + 1, x))
        if x > 0 and dark[y, x - 1]:
            q.append((y, x - 1))
        if x + 1 < w and dark[y, x + 1]:
            q.append((y, x + 1))
    return bg


def build_rgba(rgb: np.ndarray) -> Image.Image:
    bg = edge_black_background(rgb)
    lum = rgb.max(axis=2).astype(np.float32)

    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # 边缘抗锯齿：靠近背景阈值的像素做半透明过渡
    edge = (~bg) & (lum <= BG_THRESH + 48)
    if edge.any():
        soft = np.clip((lum[edge] - BG_THRESH) / 48.0 * 255.0, 0, 255).astype(np.uint8)
        alpha[edge] = np.maximum(alpha[edge], soft)

    rgba = np.dstack([rgb, alpha])
    return Image.fromarray(rgba, mode="RGBA")


def tight_crop(rgba: Image.Image) -> Image.Image:
    arr = np.array(rgba)
    mask = arr[:, :, 3] > 8
    if not mask.any():
        return rgba
    ys, xs = np.where(mask)
    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    y0 = max(0, y0 - PAD_PX)
    x0 = max(0, x0 - PAD_PX)
    y1 = min(arr.shape[0] - 1, y1 + PAD_PX)
    x1 = min(arr.shape[1] - 1, x1 + PAD_PX)
    return rgba.crop((x0, y0, x1 + 1, y1 + 1))


def scale_to_max_side(rgba: Image.Image, max_side: int = MAX_SIDE) -> Image.Image:
    w, h = rgba.size
    scale = max_side / max(w, h)
    if scale >= 1.0:
        return rgba
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    return rgba.resize((nw, nh), Image.Resampling.LANCZOS)


def process_one(src: Path, dst: Path) -> None:
    rgb = np.array(Image.open(src).convert("RGB"), copy=True)
    scrub_watermark(rgb)
    rgba = build_rgba(rgb)
    rgba = tight_crop(rgba)
    rgba = scale_to_max_side(rgba)
    dst.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(dst, format="PNG", optimize=True)
    arr = np.array(rgba)
    corners = [arr[0, 0, 3], arr[0, -1, 3], arr[-1, 0, 3], arr[-1, -1, 3]]
    print(f"OK  {dst.name}  {rgba.size}  RGBA  corner_alpha={corners}")


def main() -> None:
    for src_name, out_name in SOURCES:
        src = ASSETS / src_name
        if not src.is_file():
            raise FileNotFoundError(f"源图不存在: {src}")
        process_one(src, OUT_DIR / out_name)
    print("done.")


if __name__ == "__main__":
    main()
