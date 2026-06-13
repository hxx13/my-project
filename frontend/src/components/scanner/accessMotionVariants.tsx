import type { RoomActionDensity } from "@/components/scanner/roomActionDensity";
import { CubeSpinnerEnterLoader } from "@/components/scanner/CubeSpinnerEnterLoader";
import { HamsterWheelLoader } from "@/components/scanner/HamsterWheelLoader";
import { StackCardEnterLoader } from "@/components/scanner/StackCardEnterLoader";
import type { AccessMotionDisplaySize } from "@/components/scanner/accessMotionLoaderScale";

/** 可扩展：新增动效时在此注册 */
export type AccessMotionVariant = "stack" | "cube" | "hamster";

export const ALL_ACCESS_MOTION_VARIANTS: AccessMotionVariant[] = ["stack", "cube", "hamster"];

export function pickAccessMotionVariant(seed: string): AccessMotionVariant {
    let h = 5381;
    const s = seed || "default";
    for (let i = 0; i < s.length; i++) {
        h = (h * 33) ^ s.charCodeAt(i);
    }
    return ALL_ACCESS_MOTION_VARIANTS[(h >>> 0) % ALL_ACCESS_MOTION_VARIANTS.length];
}

/** 每次进入/场内打开弹窗时随机一种（非 roomId 固定） */
export function pickRandomAccessMotionVariant(): AccessMotionVariant {
    const idx = Math.floor(Math.random() * ALL_ACCESS_MOTION_VARIANTS.length);
    return ALL_ACCESS_MOTION_VARIANTS[idx];
}

type LoaderProps = {
    density?: RoomActionDensity;
    displaySize?: AccessMotionDisplaySize;
    /** 右下角锚点实测边长（px），为模块 50% */
    cornerBoxPx?: number;
    speedFactor?: number;
};

export function AccessMotionLoader({
    variant,
    density = "normal",
    displaySize = "corner",
    cornerBoxPx,
    speedFactor = 1,
}: LoaderProps & { variant: AccessMotionVariant }) {
    const common = { density, displaySize, cornerBoxPx, speedFactor };
    switch (variant) {
        case "cube":
            return <CubeSpinnerEnterLoader {...common} />;
        case "hamster":
            return <HamsterWheelLoader {...common} />;
        case "stack":
        default:
            return <StackCardEnterLoader {...common} />;
    }
}
