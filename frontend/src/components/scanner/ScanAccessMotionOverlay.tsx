import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate, motion, useMotionValue, useTransform, type MotionValue } from "framer-motion";
import { Z_INDEX } from "@/constants/zIndex";
import {
    ACCESS_MOTION_CENTER_HOLD_MS,
    ACCESS_MOTION_EXIT_FLY_MS,
    ACCESS_MOTION_EXIT_SLOW_MS,
    ACCESS_MOTION_FADE_MS,
    ACCESS_MOTION_FLY_EASE,
    ACCESS_MOTION_FLY_MS,
    ACCESS_MOTION_TEXT,
} from "@/components/scanner/accessMotionConfig";
import {
    cornerScaleFromAnchor,
    measureAnchorElement,
} from "@/components/scanner/accessMotionLoaderScale";
import { AccessMotionLoader, type AccessMotionVariant } from "@/components/scanner/accessMotionVariants";
import { HandDrawnBounceText } from "@/components/scanner/HandDrawnBounceText";
import type { RoomActionDensity } from "@/components/scanner/roomActionDensity";
import { scanPaletteCssVars } from "@/components/scanner/scanPopupTheme";

type Point = { x: number; y: number };
type MotionMode = "enter" | "exit";

type Phase =
    | "idle"
    | "hold-center"
    | "fly-to-anchor"
    | "landed-at-anchor"
    | "fly-from-anchor"
    | "fade-out";

function viewportCenter(): Point {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function toCenterOffset(point: Point): Point {
    const c = viewportCenter();
    return { x: point.x - c.x, y: point.y - c.y };
}

function resolveAnchorElement(roomId: string | null | undefined): HTMLElement | null {
    if (!roomId) return document.querySelector<HTMLElement>("[data-scan-exit-anchor]");
    return document.querySelector<HTMLElement>(`[data-scan-exit-anchor="${roomId}"]`);
}

function readAnchorMetrics(roomId: string | null | undefined) {
    return measureAnchorElement(resolveAnchorElement(roomId));
}

function placeAtAnchor(
    roomId: string | null | undefined,
    offsetX: MotionValue<number>,
    offsetY: MotionValue<number>,
    scale: MotionValue<number>
) {
    const metrics = readAnchorMetrics(roomId);
    if (metrics) {
        const off = toCenterOffset({ x: metrics.x, y: metrics.y });
        offsetX.set(off.x);
        offsetY.set(off.y);
    } else {
        offsetX.set(0);
        offsetY.set(0);
    }
    scale.set(1);
}

type Props = {
    mode: MotionMode;
    active: boolean;
    roomId?: string | null;
    /** 由弹窗状态传入；进入/离开闭环内保持一致 */
    variant?: AccessMotionVariant | null;
    density?: RoomActionDensity;
    startAtCorner?: boolean;
    onComplete?: () => void;
    /** 进入：中心停留结束、开始飞向右下角时 */
    onFlyStart?: () => void;
    onCornerReady?: () => void;
    themeClassName?: string;
    isDark?: boolean;
};

export function ScanAccessMotionOverlay({
    mode,
    active,
    roomId,
    variant: variantProp,
    density = "normal",
    startAtCorner = false,
    onComplete,
    onFlyStart,
    onCornerReady,
    themeClassName = "",
    isDark = false,
}: Props) {
    const variant = variantProp;

    const [phase, setPhase] = useState<Phase>("idle");
    const [caption, setCaption] = useState("");
    const [captionDone, setCaptionDone] = useState(false);
    /** 仅在落点减速段改一次，禁止每帧 setState（会重置 CSS animation-duration 导致卡顿） */
    const [speedFactor, setSpeedFactor] = useState(1);
    const [cornerBoxPx, setCornerBoxPx] = useState<number | undefined>();

    const offsetX = useMotionValue(0);
    const offsetY = useMotionValue(0);
    const portalX = useTransform(offsetX, (v) => `calc(-50% + ${v}px)`);
    const portalY = useTransform(offsetY, (v) => `calc(-50% + ${v}px)`);
    const scale = useMotionValue(1);
    const opacity = useMotionValue(1);
    const timersRef = useRef<number[]>([]);
    const startedRef = useRef(false);
    const flyControlsRef = useRef<ReturnType<typeof animate>[]>([]);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    const onFlyStartRef = useRef(onFlyStart);
    onFlyStartRef.current = onFlyStart;
    const onCornerReadyRef = useRef(onCornerReady);
    onCornerReadyRef.current = onCornerReady;

    const markCornerReady = () => onCornerReadyRef.current?.();

    const clearTimers = () => {
        timersRef.current.forEach((id) => window.clearTimeout(id));
        timersRef.current = [];
    };

    const stopFlyMotion = () => {
        flyControlsRef.current.forEach((c) => c.stop());
        flyControlsRef.current = [];
    };

    const schedule = (fn: () => void, ms: number) => {
        const id = window.setTimeout(fn, ms);
        timersRef.current.push(id);
    };

    const flyMotion = (
        target: Point,
        targetScale: number,
        onDone?: () => void,
        durationMs = ACCESS_MOTION_FLY_MS
    ) => {
        stopFlyMotion();
        const dur = durationMs / 1000;
        const ease = ACCESS_MOTION_FLY_EASE;
        const targetOff = toCenterOffset(target);
        flyControlsRef.current = [
            animate(offsetX, targetOff.x, { duration: dur, ease }),
            animate(offsetY, targetOff.y, { duration: dur, ease }),
            animate(scale, targetScale, { duration: dur, ease }),
        ];
        void Promise.all(flyControlsRef.current).then(() => onDone?.());
    };

    const syncAnchorLayout = (pinPosition: boolean) => {
        const metrics = readAnchorMetrics(roomId);
        if (!metrics) return;
        if (pinPosition) {
            const off = toCenterOffset({ x: metrics.x, y: metrics.y });
            offsetX.set(off.x);
            offsetY.set(off.y);
        }
        setCornerBoxPx(metrics.size);
    };

    useLayoutEffect(() => {
        if (!active) {
            clearTimers();
            stopFlyMotion();
            startedRef.current = false;
            setPhase("idle");
            setCaption("");
            setCaptionDone(false);
            setSpeedFactor(1);
            setCornerBoxPx(undefined);
            offsetX.set(0);
            offsetY.set(0);
            scale.set(1);
            opacity.set(1);
            return;
        }
        return () => {
            clearTimers();
            stopFlyMotion();
        };
    }, [active, offsetX, offsetY, scale, opacity]);

    useEffect(() => {
        if (!active || !roomId) return;
        if (phase === "fly-from-anchor" || phase === "fly-to-anchor") return;

        const pinPosition = phase === "landed-at-anchor" || (mode === "enter" && startAtCorner);
        const sync = () => syncAnchorLayout(pinPosition);
        sync();

        const anchor = resolveAnchorElement(roomId);
        if (!anchor) return;

        const ro = new ResizeObserver(sync);
        ro.observe(anchor);
        const module = anchor.closest("[data-scan-action-module]");
        if (module) ro.observe(module);

        window.addEventListener("resize", sync);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", sync);
        };
    }, [active, roomId, phase, mode, startAtCorner, offsetX, offsetY]);

    useEffect(() => {
        if (!active || startedRef.current) return;
        if (!roomId) return;

        startedRef.current = true;
        clearTimers();
        stopFlyMotion();
        const center = viewportCenter();
        opacity.set(1);
        setSpeedFactor(1);

        const flyToCorner = (attempt = 0) => {
            const anchor = resolveAnchorElement(roomId);
            const metrics = readAnchorMetrics(roomId);
            if (!metrics && attempt < 10) {
                requestAnimationFrame(() => flyToCorner(attempt + 1));
                return;
            }
            const target = metrics ? { x: metrics.x, y: metrics.y } : center;
            const cornerScale = cornerScaleFromAnchor(anchor, density, variant);
            if (metrics) setCornerBoxPx(metrics.size);

            flyMotion(target, cornerScale, () => {
                setPhase("landed-at-anchor");
                syncAnchorLayout(true);
                markCornerReady();
            });
        };

        if (mode === "enter" && startAtCorner) {
            setPhase("landed-at-anchor");
            onFlyStartRef.current?.();
            requestAnimationFrame(() => {
                placeAtAnchor(roomId, offsetX, offsetY, scale);
                syncAnchorLayout(true);
                markCornerReady();
            });
            return clearTimers;
        }

        if (mode === "enter") {
            offsetX.set(0);
            offsetY.set(0);
            scale.set(1);
            setCaption(ACCESS_MOTION_TEXT.enterLoading);
            setCaptionDone(false);
            setPhase("hold-center");

            schedule(() => {
                setCaption(ACCESS_MOTION_TEXT.enterDone);
                setCaptionDone(true);
                setPhase("fly-to-anchor");
                onFlyStartRef.current?.();
                requestAnimationFrame(() => flyToCorner());
            }, ACCESS_MOTION_CENTER_HOLD_MS);
        } else {
            const anchor = resolveAnchorElement(roomId);
            const metrics = readAnchorMetrics(roomId);
            const cornerScale = cornerScaleFromAnchor(anchor, density, variant);
            if (metrics) {
                const off = toCenterOffset({ x: metrics.x, y: metrics.y });
                offsetX.set(off.x);
                offsetY.set(off.y);
                setCornerBoxPx(metrics.size);
            } else {
                offsetX.set(0);
                offsetY.set(0);
            }
            scale.set(cornerScale);
            setCaption(ACCESS_MOTION_TEXT.exitLoading);
            setCaptionDone(false);
            setPhase("fly-from-anchor");

            requestAnimationFrame(() => {
                flyMotion(
                    center,
                    1,
                    () => {
                        setCaption(ACCESS_MOTION_TEXT.exitDone);
                        setCaptionDone(true);
                        setPhase("fade-out");
                        setSpeedFactor(0.25);
                        schedule(() => {
                            void animate(opacity, 0, {
                                duration: ACCESS_MOTION_FADE_MS / 1000,
                                ease: "easeOut",
                            }).then(() => {
                                setPhase("idle");
                                startedRef.current = false;
                                onCompleteRef.current?.();
                            });
                        }, ACCESS_MOTION_EXIT_SLOW_MS);
                    },
                    ACCESS_MOTION_EXIT_FLY_MS
                );
            });
        }

        return clearTimers;
    }, [active, roomId, mode, startAtCorner, offsetX, offsetY, scale, opacity, density, variant]);

    /** 进入飞行全程保持 center 尺寸 + scale 过渡，避免切换 corner 布局闪现 */
    const displaySize =
        mode === "enter" && startAtCorner ? "corner" : "center";
    /** 进入飞向右下角时收起文案，避免与缩小的动效叠在一起 */
    const showCaption =
        phase !== "landed-at-anchor" &&
        phase !== "idle" &&
        !(mode === "enter" && phase === "fly-to-anchor");
    const captionBelowLoader = showCaption && phase === "hold-center";
    const isInFlight = phase === "fly-from-anchor" || phase === "fly-to-anchor";
    const ready = active && phase !== "idle";

    if (!ready || !variant || typeof document === "undefined") return null;

    return createPortal(
        <div
            className={`${themeClassName} ${isDark ? "dark" : ""}`.trim()}
            style={scanPaletteCssVars() as React.CSSProperties}
        >
            <motion.div
                className={`access-motion-portal${captionBelowLoader ? " access-motion-portal--caption-below" : ""}${isInFlight ? " access-motion-portal--flying" : ""}`}
                role="status"
                aria-live="polite"
                style={{
                    position: "fixed",
                    left: "50%",
                    top: "50%",
                    zIndex: Z_INDEX.popupNotice,
                    x: portalX,
                    y: portalY,
                    scale,
                    opacity,
                }}
            >
                <AccessMotionLoader
                    variant={variant}
                    density={density}
                    displaySize={displaySize}
                    cornerBoxPx={displaySize === "corner" ? cornerBoxPx : undefined}
                    speedFactor={speedFactor}
                />
                {showCaption ? (
                    <HandDrawnBounceText
                        text={caption}
                        className={captionDone ? "access-motion-doodle-text--done" : ""}
                    />
                ) : null}
            </motion.div>
        </div>,
        document.body
    );
}

/** @deprecated 使用 ScanAccessMotionOverlay */
export function ScanEnterCelebrateOverlay(props: Omit<Props, "mode"> & { active: boolean }) {
    return <ScanAccessMotionOverlay mode="enter" {...props} />;
}
