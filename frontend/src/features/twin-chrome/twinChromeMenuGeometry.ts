/** 右键菜单定位：与 AdminChromeContextMenu 同算法，避免超出视口 */

const VIEW_MARGIN = 8;

export function fitMenuAtPoint(px: number, py: number, width: number, height: number): { left: number; top: number } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const m = VIEW_MARGIN;

    let left = px;
    if (left + width > vw - m) {
        left = px - width;
    }
    if (left < m) left = m;
    if (left + width > vw - m) left = Math.max(m, vw - m - width);

    let top = py;
    if (top + height > vh - m) {
        const flippedUp = py - height;
        if (flippedUp >= m) top = flippedUp;
        else top = Math.max(m, vh - m - height);
    }
    if (top < m) top = m;
    if (top + height > vh - m) top = Math.max(m, vh - m - height);

    return { left, top };
}

const SUB_GAP = 6;
const SUB_PANEL_W = 220;

export function fitSubPanelNextToRoot(root: DOMRect, subWidth: number, subHeight: number): { left: number; top: number } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const m = VIEW_MARGIN;

    let left = root.right + SUB_GAP;
    if (left + subWidth > vw - m) {
        left = root.left - subWidth - SUB_GAP;
    }
    left = Math.max(m, Math.min(left, vw - subWidth - m));

    let top = root.top;
    if (top + subHeight > vh - m) {
        const alignBottom = root.bottom - subHeight;
        if (alignBottom >= m) top = alignBottom;
        else top = Math.max(m, vh - m - subHeight);
    }
    if (top < m) top = m;
    if (top + subHeight > vh - m) top = Math.max(m, vh - m - subHeight);

    return { left, top };
}

export const TWIN_CHROME_MENU_Z = {
    backdrop: 2649,
    root: 2650,
    sub: 2651,
} as const;
