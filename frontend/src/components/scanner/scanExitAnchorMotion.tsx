import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Z_INDEX } from "@/constants/zIndex";
import { ENTER_FLY_MOTION_MS, ENTER_FLY_TRANSITION } from "./accessMotionConfig";

type Point = { x: number; y: number };

function viewportCenter(): Point {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function anchorCenter(anchor: HTMLElement): Point {
    const r = anchor.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function layoutOffsetFromCenter(el: HTMLElement): Point {
    const r = el.getBoundingClientRect();
    const c = viewportCenter();
    return {
        x: c.x - (r.left + r.width / 2),
        y: c.y - (r.top + r.height / 2),
    };
}

function resolveAnchorElement(roomId: string | null | undefined): HTMLElement | null {
    if (!roomId) return document.querySelector<HTMLElement>("[data-scan-exit-anchor]");
    return document.querySelector<HTMLElement>(`[data-scan-exit-anchor="${roomId}"]`);
}

type FlyFromCenterPortalProps = {
    active: boolean;
    /** 目标房间 id，对应 ActionButtons 内 data-scan-exit-anchor */
    roomId?: string | null;
    children: ReactNode;
    onComplete?: () => void;
};

/** 屏幕中心 → 离开按钮锚点（无遮罩，仅位移动画） */
export function FlyFromCenterPortal({ active, roomId, children, onComplete }: FlyFromCenterPortalProps) {
    const [target, setTarget] = useState<Point | null>(null);

    useLayoutEffect(() => {
        if (!active) {
            setTarget(null);
            return;
        }

        let raf = 0;
        const update = () => {
            const anchor = resolveAnchorElement(roomId);
            if (!anchor) {
                raf = requestAnimationFrame(update);
                return;
            }
            setTarget(anchorCenter(anchor));
        };
        update();
        window.addEventListener("resize", update);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", update);
        };
    }, [active, roomId]);

    if (!active || !target || typeof document === "undefined") return null;

    const center = viewportCenter();

    return createPortal(
        <motion.div
            className="pointer-events-none"
            style={{
                position: "fixed",
                zIndex: Z_INDEX.popupNotice,
                left: target.x,
                top: target.y,
                x: "-50%",
                y: "-50%",
            }}
            initial={{
                left: center.x,
                top: center.y,
            }}
            animate={{
                left: target.x,
                top: target.y,
            }}
            transition={ENTER_FLY_TRANSITION}
            onAnimationComplete={onComplete}
        >
            {children}
        </motion.div>,
        document.body
    );
}

type FlyInLayoutMotionProps = {
    /** 首次挂载时从屏幕中心飞入到当前布局位置 */
    play: boolean;
    children: ReactNode;
};

/** 布局内元素：与 FlyFromCenterPortal 相同轨迹，用于仓鼠跑轮 */
export function FlyInLayoutMotion({ play, children }: FlyInLayoutMotionProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [offset, setOffset] = useState<Point | null>(null);
    const [ready, setReady] = useState(!play);

    useLayoutEffect(() => {
        if (!play) {
            setReady(true);
            setOffset(null);
            return;
        }
        setReady(false);
        const measure = () => {
            if (!hostRef.current) {
                setOffset({ x: 0, y: 0 });
                setReady(true);
                return;
            }
            setOffset(layoutOffsetFromCenter(hostRef.current));
            setReady(true);
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [play]);

    if (!play || !ready) {
        return <div ref={hostRef}>{children}</div>;
    }

    const from = offset ?? { x: 0, y: 0 };

    return (
        <motion.div
            ref={hostRef}
            initial={{ x: from.x, y: from.y, opacity: 0.9 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            transition={ENTER_FLY_TRANSITION}
            style={{ willChange: "transform" }}
        >
            {children}
        </motion.div>
    );
}

export { ENTER_FLY_MOTION_MS };
