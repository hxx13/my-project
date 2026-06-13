import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/animation/PageTransition";
import DebugNav from "@/features/dev-tools/DebugNav";
import { TwinChromeContextMenu, type TwinChromeContextMenuPayload } from "@/features/twin-chrome/TwinChromeContextMenu";
import { twinChromeGlobalPointerShouldBypass } from "@/features/twin-chrome/twinChromeGlobalPointerBypass";
import { useTwinChromeTheme } from "@/features/twin-chrome/TwinChromeThemeContext";
import { useTheme } from "@/features/theme/ThemeProvider";
import "@/features/twin-chrome/twinChromeDebugOutlet.css";
import "@/features/twin-chrome/twinChromeDebugPipeline.css";
import "@/features/twin-chrome/twinChromeDebugNeonGlobal.css";
import "@/features/twin-chrome/twinChromeDebugNight.css";
import "@/features/twin-chrome/twinChromeAnimalTelemetrySciFi.css";
import "@/features/twin-chrome/twinChromeAnimalTelemetryRoomFx.css";
import { NightSkyBackdropDecor } from "@/features/night-sky/NightSkyBackdropDecor";
import { PageHelpHost } from "@/features/page-help/PageHelpHost";

function hideDockPath(pathname: string) {
    const p = pathname.replace(/\/+$/, "") || "/";
    return (
        p === "/animal-room-telemetry" ||
        p === "/animal-room-cockpit" ||
        p === "/digital-twin-screen"
    );
}

function isDebugShellPath(pathname: string): boolean {
    const p = pathname.replace(/\/+$/, "") || "/";
    return p === "/debug" || p.startsWith("/debug-");
}

/** 动物房温湿度 / 驾驶舱：科幻壳单独分层，避免与 debug 全局霓虹混用（报警色保持 index.css 语义） */
function isAnimalRoomTelemetryPath(pathname: string): boolean {
    const p = pathname.replace(/\/+$/, "") || "/";
    return p === "/animal-room-telemetry" || p === "/animal-room-cockpit";
}

export default function TwinLayoutInner() {
    const { pathname } = useLocation();
    const showDock = !hideDockPath(pathname);
    const { themeId } = useTwinChromeTheme();
    const { theme } = useTheme();
    const isDark = theme.mode === 'dark';
    const [ctxMenu, setCtxMenu] = useState<TwinChromeContextMenuPayload | null>(null);
    const debugShell = isDebugShellPath(pathname);
    const debugNightShell = debugShell && isDark;
    /** 驾驶舱页固定科幻壳；动物房页仍随 Twin 主题 dashboardSciFi 切换 */
    const pNorm = pathname.replace(/\/+$/, "") || "/";
    const isPreview = pNorm === "/dashboard-preview";
    const cockpitSciFi = pNorm === "/animal-room-cockpit";
    const animalSciFiShell =
        cockpitSciFi || (isAnimalRoomTelemetryPath(pathname) && themeId === "dashboardSciFi");

    useEffect(() => {
        const onCtx = (e: MouseEvent) => {
            if (twinChromeGlobalPointerShouldBypass(e.target)) return;
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY });
        };
        /**
         * 右键按下 capture 阶段 preventDefault：减轻 Chromium 下「右键按下 + 拖动」等浏览器默认前奏；
         * 无法禁用鼠标厂商/驱动级右键手势（在浏览器进程外）。不处理中键(auxclick)，避免影响中键滚动等。
         */
        const onPointerDownCapture = (e: PointerEvent) => {
            if (e.pointerType !== "mouse") return;
            if (e.button !== 2) return;
            if (twinChromeGlobalPointerShouldBypass(e.target)) return;
            e.preventDefault();
        };
        document.addEventListener("contextmenu", onCtx, true);
        document.addEventListener("pointerdown", onPointerDownCapture, true);
        return () => {
            document.removeEventListener("contextmenu", onCtx, true);
            document.removeEventListener("pointerdown", onPointerDownCapture, true);
        };
    }, []);

    useEffect(() => {
        const el = document.documentElement;
        if (animalSciFiShell) {
            el.setAttribute("data-twin-animal-telemetry-scifi", "1");
        } else {
            el.removeAttribute("data-twin-animal-telemetry-scifi");
        }
        return () => {
            el.removeAttribute("data-twin-animal-telemetry-scifi");
        };
    }, [animalSciFiShell]);

    return (
        <div
            className={cn("fixed inset-0 w-screen m-0 p-0 overflow-x-hidden", theme.className, isDark && 'dark', isPreview ? "min-h-screen overflow-y-auto" : "h-screen overflow-y-auto")}
            data-twin-debug-night={debugNightShell ? "1" : undefined}
            style={{
                backgroundColor: isPreview
                    ? "#0A0014"
                    : isDark
                      ? "var(--app-color-scan-backdrop-from)"
                      : "#f8f9fa",
            }}
        >
            <style>{`
                .nebula-bg {
                    overflow: clip;
                }
                .nebula-bg::before {
                    content: "";
                    position: absolute;
                    width: 140%;
                    height: 140%;
                    top: -20%;
                    left: -20%;
                    background: radial-gradient(circle at 20% 30%, rgba(0, 229, 255, 0.08) 0%, transparent 40%),
                                radial-gradient(circle at 80% 70%, rgba(112, 0, 255, 0.08) 0%, transparent 40%);
                    z-index: -1;
                    pointer-events: none;
                }
            `}</style>

            {!isDark && !isPreview ? <div className="nebula-bg absolute inset-0 z-0 pointer-events-none" /> : null}

            <div className={cn("relative z-10 w-full", isPreview ? "min-h-full" : "h-full min-h-0")}>
                <div
                    className={cn(
                        "relative",
                        isPreview ? "min-h-full w-full" : "h-full min-h-0 w-full",
                        debugNightShell && "twin-chrome-debug-root twin-chrome-debug-root--night-sky",
                        debugShell && !debugNightShell && themeId === "dashboardSciFi" && "twin-chrome-debug-root",
                        animalSciFiShell && "twin-chrome-animal-telemetry-scifi"
                    )}
                    data-twin-chrome-theme={themeId}
                >
                    {debugNightShell ? (
                        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
                            <NightSkyBackdropDecor ultraRich includeOrbs={false} />
                        </div>
                    ) : null}
                    <PageTransition
                        key={pathname}
                        variant="fadeIn"
                        duration={0.25}
                        className="relative z-[1] h-full min-h-0"
                    >
                        <Outlet />
                    </PageTransition>
                </div>
            </div>

            {showDock ? <DebugNav /> : null}

{/* TEMP: 暂时移除 PageHelpHost 以诊断 React 错误 #185 */}
            {/*
            {!isPreview ? (
                <div className="pointer-events-none fixed right-2.5 top-2.5 z-[var(--z-sticky)] sm:right-3 sm:top-3">
                    <div className="pointer-events-auto">
                        <PageHelpHost pagePath={pathname} variant="twin" enableFullHelpDialog />
                    </div>
                </div>
            ) : null}
            */}

            <TwinChromeContextMenu
                key={ctxMenu ? `${ctxMenu.x}-${ctxMenu.y}` : "twin-ctx-closed"}
                open={!!ctxMenu}
                payload={ctxMenu}
                onClose={() => setCtxMenu(null)}
            />
        </div>
    );
}
