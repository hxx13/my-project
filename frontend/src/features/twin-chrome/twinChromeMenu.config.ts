import type { TwinWebChromeThemeId } from "@/api/domains/me.api";

export type TwinThemeMenuRow =
    | { kind: "theme"; id: TwinWebChromeThemeId; label: string }
    | { kind: "placeholder"; label: string };

export const TWIN_THEME_MENU_ROWS: TwinThemeMenuRow[] = [
    { kind: "theme", id: "standard", label: "标准" },
    { kind: "theme", id: "dashboardSciFi", label: "科幻流光" },
    { kind: "placeholder", label: "更多主题敬请期待" },
];
