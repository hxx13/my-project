import { useTwinChromeTheme } from "@/features/twin-chrome/TwinChromeThemeContext";

/**
 * Twin 首页科幻壳：与 `useTwinChromeTheme` 同源（账号 mini_preferences + 本地缓存）。
 * 保留此名以便 Dashboard 既有 import 不变；新代码请直接用 `useTwinChromeTheme`。
 */
export function useSciFiDashboardTheme() {
    return useTwinChromeTheme();
}
