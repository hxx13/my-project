/* eslint-disable react-refresh/only-export-components -- Provider + hook 同文件，仅 Dashboard 使用 */
import { createContext, useContext, type ReactNode } from "react";

export type DashboardVisualMode = {
    /** 亮色 + 用户开启科幻大屏：赛博流光样式 */
    sciFi: boolean;
    /** 暗色夜空：通透玻璃，非赛博 */
    night: boolean;
};

const defaultMode: DashboardVisualMode = { sciFi: false, night: false };

const DashboardVisualContext = createContext<DashboardVisualMode>(defaultMode);

/** 注入首页视觉模式：科幻（仅亮色开关）与夜空暗色互斥。 */
export function DashboardSciFiVisualProvider({
    value,
    children,
}: {
    value: DashboardVisualMode;
    children: ReactNode;
}) {
    return <DashboardVisualContext.Provider value={value}>{children}</DashboardVisualContext.Provider>;
}

export function useDashboardVisual(): DashboardVisualMode {
    return useContext(DashboardVisualContext);
}

/** 仅科幻赛博模式（暗色夜空时为 false） */
export function useDashboardSciFiVisual(): boolean {
    return useContext(DashboardVisualContext).sciFi;
}

export function useDashboardNightVisual(): boolean {
    return useContext(DashboardVisualContext).night;
}

/** Tailwind 三态：科幻 / 夜空 / 亮色 */
export function dashTone(
    mode: DashboardVisualMode,
    sciFiCls: string,
    nightCls: string,
    lightCls: string,
): string {
    if (mode.sciFi) return sciFiCls;
    if (mode.night) return nightCls;
    return lightCls;
}

/** 暗色模式拼接扫码令牌 class（见 dashboard-night-theme.css） */
export function dashNightClass(mode: DashboardVisualMode, tokenClass: string, lightCls = ""): string {
    if (mode.night) return tokenClass;
    return lightCls;
}
