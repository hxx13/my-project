/* eslint-disable react-refresh/only-export-components -- Provider + hook 同文件，仅 Dashboard 使用 */
import { createContext, useContext, type ReactNode } from "react";

const DashboardSciFiVisualContext = createContext(false);

/** 与首页 FAB / localStorage 同源，仅 DashboardPage 注入为 true。 */
export function DashboardSciFiVisualProvider({ value, children }: { value: boolean; children: ReactNode }) {
    return <DashboardSciFiVisualContext.Provider value={value}>{children}</DashboardSciFiVisualContext.Provider>;
}

export function useDashboardSciFiVisual() {
    return useContext(DashboardSciFiVisualContext);
}
