/** 离开成功仓鼠/搬砖减速动画时长（与 exitCelebrateRoomId 清除对齐） */
export const EXIT_CELEBRATE_MS = 2600;
export const ENTER_REFRESH_MS = 1500;
/** 刷新 analyze 后等待 UI 切回「进入」按钮再显示离开提示 */
export const EXIT_NOTICE_AFTER_REFRESH_MS = 120;

const pickFirst = (config: Record<string, string> | undefined, keys: string[]): string => {
    for (const key of keys) {
        const v = (config?.[key] ?? "").trim();
        if (v) return v;
    }
    return "";
};

export const SCAN_ACCESS_NOTICE_KEYS = {
    enabled: [
        "scanner.access.notice.enabled",
        "twin.scanner.popup.notice.enabled",
    ],
    durationMs: [
        "scanner.access.notice.duration_ms",
        "twin.scanner.popup.notice.duration_ms",
    ],
    enterOwn: [
        "scanner.access.enter.own_text",
        "twin.scanner.popup.enter.own_text",
    ],
    enterBorrowed: [
        "scanner.access.enter.borrowed_text",
        "twin.scanner.popup.enter.borrowed_text",
    ],
    exitOwn: [
        "scanner.access.exit.own_text",
        "twin.scanner.popup.exit.own_text",
    ],
    exitBorrowed: [
        "scanner.access.exit.borrowed_text",
        "twin.scanner.popup.exit.borrowed_text",
    ],
} as const;

export const SCAN_ACCESS_NOTICE_DEFAULTS = {
    enabled: true,
    durationMs: 3000,
    enterOwn: "您已进入",
    enterBorrowed: "您已进入",
    exitOwn: "您已离开",
    exitBorrowed: "您已离开",
} as const;

const parseBool = (raw: string, fallback: boolean): boolean => {
    const v = raw.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
    return fallback;
};

const parseDurationMs = (raw: string, fallback: number): number => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 500) return fallback;
    return Math.min(Math.round(n), 30_000);
};

export type ScanAccessNoticeSettings = {
    enabled: boolean;
    durationMs: number;
};

export function parseScanAccessNoticeSettings(
    config: Record<string, string> | undefined
): ScanAccessNoticeSettings {
    return {
        enabled: parseBool(
            pickFirst(config, [...SCAN_ACCESS_NOTICE_KEYS.enabled]),
            SCAN_ACCESS_NOTICE_DEFAULTS.enabled
        ),
        durationMs: parseDurationMs(
            pickFirst(config, [...SCAN_ACCESS_NOTICE_KEYS.durationMs]),
            SCAN_ACCESS_NOTICE_DEFAULTS.durationMs
        ),
    };
}

export function resolveAccessNoticeText(
    action: "ENTER" | "EXIT",
    entryMode: "OWN" | "BORROWED",
    config: Record<string, string> | undefined
): string {
    const borrowed = entryMode === "BORROWED";
    let text: string;
    if (action === "ENTER") {
        text = borrowed
            ? pickFirst(config, [...SCAN_ACCESS_NOTICE_KEYS.enterBorrowed])
            : pickFirst(config, [...SCAN_ACCESS_NOTICE_KEYS.enterOwn]);
        if (!text) {
            text = borrowed
                ? SCAN_ACCESS_NOTICE_DEFAULTS.enterBorrowed
                : SCAN_ACCESS_NOTICE_DEFAULTS.enterOwn;
        }
    } else {
        text = borrowed
            ? pickFirst(config, [...SCAN_ACCESS_NOTICE_KEYS.exitBorrowed])
            : pickFirst(config, [...SCAN_ACCESS_NOTICE_KEYS.exitOwn]);
        if (!text) {
            text = borrowed
                ? SCAN_ACCESS_NOTICE_DEFAULTS.exitBorrowed
                : SCAN_ACCESS_NOTICE_DEFAULTS.exitOwn;
        }
    }
    return text;
}
