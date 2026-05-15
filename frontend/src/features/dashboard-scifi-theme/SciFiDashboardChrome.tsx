import type { CSSProperties, ReactNode } from "react";
import "./sciFiDashboardTheme.css";
import { sciFiDashboardFeatureFlags, sciFiDashboardMotion } from "./sciFiDashboardTheme.config";

export type SciFiDashboardChromeProps = {
    enabled: boolean;
    children: ReactNode;
};

/**
 * 首页科幻视觉壳层：叠层背景；主题切换由 Twin 全域右键菜单 / 程序坞入口负责（无 FAB）。
 */
export function SciFiDashboardChrome({ enabled, children }: SciFiDashboardChromeProps) {
    const motionStyle: CSSProperties | undefined = enabled
        ? {
              ["--scifi-aurora-s" as string]: `${sciFiDashboardMotion.auroraRotateSec}s`,
              ["--scifi-border-flow-s" as string]: `${sciFiDashboardMotion.borderFlowSec}s`,
          }
        : undefined;

    return (
        <div
            className={`dashboard-home-root relative box-border flex min-h-0 w-full flex-1 flex-col overflow-hidden ${
                enabled ? "dashboard-home-root--scifi" : ""
            }`}
            data-scifi-dashboard={enabled ? "1" : "0"}
            data-scifi-scanlines={enabled && sciFiDashboardFeatureFlags.enableScanlines ? "1" : "0"}
            style={motionStyle}
        >
            {enabled ? (
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
