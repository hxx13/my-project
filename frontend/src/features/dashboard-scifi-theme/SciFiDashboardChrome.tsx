import type { CSSProperties, ReactNode } from "react";
import "./sciFiDashboardTheme.css";
import { useTheme } from "@/features/theme/ThemeProvider";
import { NightSkyBackdropDecor } from "@/features/night-sky/NightSkyBackdropDecor";
import { sciFiDashboardFeatureFlags, sciFiDashboardMotion } from "./sciFiDashboardTheme.config";

export type SciFiDashboardChromeProps = {
    enabled: boolean;
    children: ReactNode;
};

/**
 * 首页视觉壳层：亮色默认 / 科幻叠层 / 暗色夜空（与扫码弹窗暗色共用 NightSkyBackdropDecor）
 */
export function SciFiDashboardChrome({ enabled, children }: SciFiDashboardChromeProps) {
    const { effectiveMode } = useTheme();
    const isDark = effectiveMode === "dark";
    const isNightSky = isDark;
    const showSciFiLayers = enabled && !isNightSky;

    const motionStyle: CSSProperties | undefined = showSciFiLayers
        ? {
              ["--scifi-aurora-s" as string]: `${sciFiDashboardMotion.auroraRotateSec}s`,
              ["--scifi-border-flow-s" as string]: `${sciFiDashboardMotion.borderFlowSec}s`,
          }
        : undefined;

    return (
        <div
            className={`dashboard-home-root relative box-border flex min-h-0 w-full flex-1 flex-col overflow-hidden ${
                enabled && !isNightSky ? "dashboard-home-root--scifi" : ""
            }${isNightSky ? " dashboard-home-root--night-sky" : ""}`}
            data-scifi-dashboard={enabled ? "1" : "0"}
            data-scifi-scanlines={showSciFiLayers && sciFiDashboardFeatureFlags.enableScanlines ? "1" : "0"}
            style={motionStyle}
        >
            {isNightSky ? (
                <div
                    className="scifi-layer--night-sky absolute inset-0 z-0 overflow-hidden pointer-events-none"
                    aria-hidden
                >
                    <NightSkyBackdropDecor ultraRich includeOrbs={false} />
                </div>
            ) : showSciFiLayers ? (
                <>
                    <div className="scifi-layer--base" aria-hidden />
                    {sciFiDashboardFeatureFlags.enableAurora ? <div className="scifi-layer--aurora" aria-hidden /> : null}
                    {sciFiDashboardFeatureFlags.enableOuterFlowRing ? (
                        <div className="scifi-layer--flowring" aria-hidden />
                    ) : null}
                    {sciFiDashboardFeatureFlags.enableScanlines ? (
                        <div className="scifi-layer--scanlines" aria-hidden />
                    ) : null}
                </>
            ) : null}
            <div className="scifi-content flex min-h-0 w-full flex-1 flex-col">{children}</div>
        </div>
    );
}
