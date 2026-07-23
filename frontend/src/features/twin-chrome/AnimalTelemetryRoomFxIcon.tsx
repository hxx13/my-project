import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { AirVent, Wind, WindArrowDown, Zap } from "lucide-react";
import type { AnimalTelemetryRoomFxKind } from "./animalTelemetryRoomFx";
import { useAnimalTelemetryFxIconVariant } from "./AnimalTelemetryFxIconVariantContext";

/** 科幻壳：圆角方框 + 描边发光（与扫码 AIPredictionCard 小图标一致） */
const shellSciFi =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-400/40 bg-cyan-500/15 shadow-[0_0_12px_rgba(34,211,238,0.28)]";

const strokeIconSciFi = "h-5 w-5 text-cyan-200 drop-shadow-[0_0_3px_rgba(34,211,238,0.85)]";

/** 标准动物房页：白底卡片上可读（无强 glow） */
const shellStandard =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-sky-300/90 bg-sky-50 shadow-sm ring-1 ring-sky-900/10";

const strokeIconStandard = "h-5 w-5 text-sky-800 drop-shadow-none";

function SvgMonkey({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden
        >
            <path d="M8 5c1.5-1 4.5-1 6 0" />
            <ellipse cx="12" cy="14" rx="5" ry="4.5" />
            <circle cx="9.5" cy="12.5" r="0.55" fill="currentColor" stroke="none" />
            <circle cx="14.5" cy="12.5" r="0.55" fill="currentColor" stroke="none" />
            <path d="M10 16.5q2 1.2 4 0" />
            <path d="M6 9c-1.5 2-1 4.5 0.5 6M18 9c1.5 2 1 4.5-0.5 6" />
        </svg>
    );
}

function SvgPig({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className={className}
            aria-hidden
        >
            <ellipse cx="12" cy="14" rx="6" ry="4.5" />
            <ellipse cx="16" cy="13" rx="1.8" ry="1.2" />
            <circle cx="9" cy="12" r="0.5" fill="currentColor" stroke="none" />
            <circle cx="11" cy="12" r="0.5" fill="currentColor" stroke="none" />
            <path d="M6 14c-1.5 0-2 1.5-1 2.5M18 14c1.5 0 2 1.5 1 2.5" />
        </svg>
    );
}

function SvgDog({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden
        >
            <path d="M5 11l2-3h3l2 2 3-1 2 3-1 6H6z" />
            <circle cx="9.5" cy="12" r="0.55" fill="currentColor" stroke="none" />
            <circle cx="14" cy="12" r="0.55" fill="currentColor" stroke="none" />
            <path d="M10 15.5h3" />
        </svg>
    );
}

function SvgRabbit({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className={className}
            aria-hidden
        >
            <path d="M9 4.5L8 11M11 3.5L10.5 11" />
            <path d="M14 4.5L15 11M12 3.5L13.5 11" />
            <ellipse cx="12" cy="15" rx="4.5" ry="3.5" />
            <circle cx="10" cy="14.5" r="0.45" fill="currentColor" stroke="none" />
            <circle cx="13.5" cy="14.5" r="0.45" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** 与 AIPredictionCard 中「赛博小鼠」同构：线描 + drop-shadow */
function SvgMouse({ className, style }: { className?: string; style?: CSSProperties }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            style={style}
            aria-hidden
        >
            <path d="M4 14c-4 0-4 6 1 6h2" />
            <path d="M6 16h9l4-2l-2-3h-3l-2-2H8a4 4 0 0 0-4 4v3z" />
            <circle cx="13" cy="9" r="2" />
            <circle cx="16.5" cy="12.5" r="0.5" fill="currentColor" stroke="none" />
            <path d="M19 13.5l3-1.5" />
            <path d="M19 14.5l3 1.5" />
        </svg>
    );
}

export function AnimalTelemetryRoomFxIcon({
    kind,
    className,
}: {
    kind: AnimalTelemetryRoomFxKind;
    className?: string;
}) {
    const variant = useAnimalTelemetryFxIconVariant();
    const scifi = variant === "scifi";
    const wrapBase = scifi ? shellSciFi : shellStandard;
    const stroke = scifi ? strokeIconSciFi : strokeIconStandard;
    const wrap = cn(wrapBase, className);
    switch (kind) {
        case "supply-air":
            return (
                <div className={wrap} title="送风">
                    <Wind className={cn(stroke, scifi ? "text-sky-300" : "text-sky-700")} strokeWidth={2} />
                </div>
            );
        case "exhaust-air":
            return (
                <div className={wrap} title="排风">
                    <WindArrowDown className={cn(stroke, scifi ? "text-slate-300" : "text-slate-600")} strokeWidth={2} />
                </div>
            );
        case "power-plant":
            return (
                <div
                    className={cn(
                        scifi
                            ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-amber-400/45 bg-amber-500/15 shadow-[0_0_14px_rgba(251,191,36,0.35)]"
                            : "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-amber-300/90 bg-amber-50 shadow-sm ring-1 ring-amber-900/10",
                        className
                    )}
                    title="动力 / 冷站"
                >
                    <Zap
                        className={cn(
                            "h-5 w-5",
                            scifi ? "text-amber-200 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]" : "text-amber-800 drop-shadow-none"
                        )}
                        strokeWidth={2.2}
                    />
                </div>
            );
        case "breed-monkey":
            return (
                <div
                    className={cn(
                        wrap,
                        scifi ? "border-amber-300/35 bg-amber-500/10" : "border-amber-300/80 bg-amber-50/95"
                    )}
                    title="猴饲养"
                >
                    <SvgMonkey className={cn(stroke, scifi ? "text-amber-100" : "text-amber-900")} />
                </div>
            );
        case "breed-pig":
            return (
                <div
                    className={cn(
                        wrap,
                        scifi ? "border-rose-300/35 bg-rose-500/10" : "border-rose-300/80 bg-rose-50/95"
                    )}
                    title="猪饲养"
                >
                    <SvgPig className={cn(stroke, scifi ? "text-rose-100" : "text-rose-900")} />
                </div>
            );
        case "breed-dog":
            return (
                <div
                    className={cn(
                        wrap,
                        scifi ? "border-orange-300/35 bg-orange-500/10" : "border-orange-300/80 bg-orange-50/95"
                    )}
                    title="犬饲养"
                >
                    <SvgDog className={cn(stroke, scifi ? "text-orange-100" : "text-orange-900")} />
                </div>
            );
        case "breed-rabbit":
            return (
                <div
                    className={cn(
                        wrap,
                        scifi ? "border-fuchsia-300/35 bg-fuchsia-500/10" : "border-fuchsia-300/80 bg-fuchsia-50/95"
                    )}
                    title="兔饲养"
                >
                    <SvgRabbit className={cn(stroke, scifi ? "text-fuchsia-100" : "text-fuchsia-900")} />
                </div>
            );
        case "breed-mouse":
            return (
                <div className={wrap} title="鼠饲养">
                    <SvgMouse
                        className={stroke}
                        style={scifi ? { filter: "drop-shadow(0 0 2px currentColor)" } : { filter: "none" }}
                    />
                </div>
            );
        default:
            return (
                <div className={wrap} title="监测区">
                    <AirVent className={cn(stroke, scifi ? "text-slate-200" : "text-slate-700")} strokeWidth={2} />
                </div>
            );
    }
}
