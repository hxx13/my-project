/**
 * 「无人操作自动回大屏」的纯逻辑 —— 路径判定与分钟数收敛。
 *
 * <p>副作用（跳转、全屏、计时）都在 {@code DashboardAutoReturnContext} 里，这里只做判断，
 * 好让「什么算在仪表盘上」这条口径能被单测钉住：判宽了会把正在后台干活的人一把拽回大屏。
 */

export const DASHBOARD_AUTO_RETURN_MIN_MINUTES = 1;
export const DASHBOARD_AUTO_RETURN_MAX_MINUTES = 120;
export const DASHBOARD_AUTO_RETURN_DEFAULT_MINUTES = 5;

/** 仪表盘的规范路径。{@code /console} 的 index 与具名路由渲染的是同一个大屏 */
export const DASHBOARD_PATH = "/console/dashboard";

function normalizePath(pathname: string): string {
    const p = String(pathname || "").trim().replace(/\/+$/, "");
    return p || "/";
}

/**
 * 当前是不是就在仪表盘上。
 *
 * <p>**必须精确匹配，不能用前缀**：后台管理页全都在 {@code /console/admin/…} 下，
 * {@code /console/dashboard-preview} 也是另一个页面 —— 判宽了就会出现「怎么也回不到大屏」
 * 或者「在大屏预览上反复跳」。
 */
export function isDashboardPath(pathname: string): boolean {
    const p = normalizePath(pathname);
    return p === "/console" || p === DASHBOARD_PATH;
}

/**
 * 分钟数收敛到可配置区间；非法值给默认，不抛（输入框里可能是空串或乱敲的字符）。
 *
 * <p>**空值必须先挡掉**：`Number(null)` 是 0、`Number("")` 也是 0，直接算会得到「1 分钟」这个
 * 下限，而不是默认值 —— 字段没配过的账号会被莫名其妙设成 1 分钟就跳一次。
 */
export function normalizeIdleMinutes(raw: unknown): number {
    if (raw === null || raw === undefined || String(raw).trim() === "") {
        return DASHBOARD_AUTO_RETURN_DEFAULT_MINUTES;
    }
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return DASHBOARD_AUTO_RETURN_DEFAULT_MINUTES;
    return Math.min(
        DASHBOARD_AUTO_RETURN_MAX_MINUTES,
        Math.max(DASHBOARD_AUTO_RETURN_MIN_MINUTES, n),
    );
}
