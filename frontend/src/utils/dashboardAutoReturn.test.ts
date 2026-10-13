import { describe, expect, it } from "vitest";
import {
    DASHBOARD_AUTO_RETURN_DEFAULT_MINUTES,
    isDashboardPath,
    normalizeIdleMinutes,
} from "./dashboardAutoReturn";

describe("isDashboardPath", () => {
    it("认仪表盘的两条入口（含尾斜杠）", () => {
        expect(isDashboardPath("/console")).toBe(true);
        expect(isDashboardPath("/console/")).toBe(true);
        expect(isDashboardPath("/console/dashboard")).toBe(true);
        expect(isDashboardPath("/console/dashboard/")).toBe(true);
    });

    it("后台与其它前台页都不算仪表盘 —— 判宽了会把正在干活的人拽走 / 在大屏预览上反复跳", () => {
        expect(isDashboardPath("/console/admin")).toBe(false);
        expect(isDashboardPath("/console/admin/personnel")).toBe(false);
        expect(isDashboardPath("/console/dashboard-preview")).toBe(false);
        expect(isDashboardPath("/console/animal-room-telemetry")).toBe(false);
        expect(isDashboardPath("/")).toBe(false);
        expect(isDashboardPath("")).toBe(false);
    });
});

describe("normalizeIdleMinutes", () => {
    it("夹在 1..120 之间", () => {
        expect(normalizeIdleMinutes(5)).toBe(5);
        expect(normalizeIdleMinutes(0)).toBe(1);
        expect(normalizeIdleMinutes(-3)).toBe(1);
        expect(normalizeIdleMinutes(9999)).toBe(120);
    });

    it("非法输入回默认值，不抛", () => {
        expect(normalizeIdleMinutes(undefined)).toBe(DASHBOARD_AUTO_RETURN_DEFAULT_MINUTES);
        expect(normalizeIdleMinutes(null)).toBe(DASHBOARD_AUTO_RETURN_DEFAULT_MINUTES);
        expect(normalizeIdleMinutes("")).toBe(DASHBOARD_AUTO_RETURN_DEFAULT_MINUTES);
        expect(normalizeIdleMinutes("abc")).toBe(DASHBOARD_AUTO_RETURN_DEFAULT_MINUTES);
        expect(normalizeIdleMinutes("7")).toBe(7);
        expect(normalizeIdleMinutes("6.4")).toBe(6);
    });
});
