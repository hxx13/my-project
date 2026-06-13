import type { RoomActionDensity } from "@/components/scanner/roomActionDensity";
import type { AccessMotionVariant } from "@/components/scanner/accessMotionVariants";

/** 中心展示基准：屏高 40% × 展示系数（用户反馈略大，取 70%） */
export const ACCESS_MOTION_CENTER_MIN_VH = 40;
export const ACCESS_MOTION_CENTER_SCALE = 0.7;

/** 右下角模块内动效占模块比例 */
export const ACCESS_MOTION_CORNER_MODULE_RATIO = 0.65;

/** 扑克牌堆叠在角落相对锚点的视觉放大（牌堆偏高，避免裁切后显得过小） */
export const STACK_CORNER_SIZE_BOOST = 1.35;

/** 立方体相对其它动效的视觉缩放（用户反馈偏大，取一半） */
export const CUBE_VISUAL_SCALE = 0.5;

/** 右下角落点 fallback（未量到锚点时用） */
export const ACCESS_MOTION_LOADER_BOX_EM = 12;

export type AccessMotionDisplaySize = "center" | "corner";

export type AnchorMetrics = {
    x: number;
    y: number;
    size: number;
};

export function accessMotionEmScale(density: RoomActionDensity): string {
    return density === "dense" ? "12px" : density === "compact" ? "14px" : "16px";
}

/** 扑克牌堆叠原始高度（em） */
export const STACK_CARD_NATIVE_HEIGHT_EM = 32;

export function centerDisplayVh(): number {
    return ACCESS_MOTION_CENTER_MIN_VH * ACCESS_MOTION_CENTER_SCALE;
}

export function centerDisplayPx(): number {
    if (typeof window === "undefined") return 400 * ACCESS_MOTION_CENTER_SCALE;
    return window.innerHeight * (centerDisplayVh() / 100);
}

export function stackCenterFontSize(): string {
    return `calc(${centerDisplayVh()}vh / ${STACK_CARD_NATIVE_HEIGHT_EM})`;
}

export function squareCenterFontSize(): string {
    return `calc(${centerDisplayVh()}vh / ${ACCESS_MOTION_LOADER_BOX_EM})`;
}

export function measureAnchorElement(anchor: HTMLElement | null): AnchorMetrics | null {
    if (!anchor) return null;
    const r = anchor.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const size = Math.min(r.width, r.height);
    return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        size,
    };
}

/** 中心 → 右下角飞行结束时 scale：角落像素 / 中心像素（按变体实际中心尺寸） */
export function cornerScaleFromAnchor(
    anchor: HTMLElement | null,
    density: RoomActionDensity = "normal",
    variant?: AccessMotionVariant | null
): number {
    const metrics = measureAnchorElement(anchor);
    if (!metrics?.size) return cornerScaleRatioFallback(density, variant);
    let centerPx = centerDisplayPx();
    let targetPx = metrics.size;
    if (variant === "cube") {
        centerPx *= CUBE_VISUAL_SCALE;
    }
    if (variant === "stack") {
        targetPx = metrics.size * STACK_CORNER_SIZE_BOOST;
    }
    return Math.min(1, targetPx / centerPx);
}

/** @deprecated 仅作锚点未就绪时的 fallback */
export function cornerScaleRatio(density: RoomActionDensity = "normal"): number {
    return cornerScaleRatioFallback(density);
}

function cornerScaleRatioFallback(density: RoomActionDensity, variant?: AccessMotionVariant | null): number {
    const cornerPx =
        ACCESS_MOTION_LOADER_BOX_EM * parseFloat(accessMotionEmScale(density).replace("px", ""));
    let centerPx = centerDisplayPx();
    if (variant === "cube") centerPx *= CUBE_VISUAL_SCALE;
    return Math.min(1, cornerPx / centerPx);
}
