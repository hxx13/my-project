/** Format seconds as MM:SS countdown string */
export function formatCountdown(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 解析后端 scheduled_exit_at（yyyy-MM-dd HH:mm:ss，本地时区）并返回剩余秒数 */
export function remainingSecondsFromScheduledAt(
    scheduledAt: string | null | undefined,
    nowMs = Date.now()
): number | null {
    const raw = (scheduledAt ?? "").trim();
    if (!raw) return null;
    const target = Date.parse(raw.replace(" ", "T"));
    if (!Number.isFinite(target)) return null;
    const rem = Math.ceil((target - nowMs) / 1000);
    return rem > 0 ? rem : 0;
}

/** 联动计时器文案：待激活 vs 延时签退 */
export function resolveAutoSignoutCountdownCopy(state: string | null | undefined): {
    badge: string;
    hint: string;
} {
    if (state === "PENDING_ACTIVATION") {
        return {
            badge: "待激活",
            hint: "须在倒计时内刷激活门完成卡片激活；超时系统将自动签退。",
        };
    }
    return {
        badge: "自动签退",
        hint: "当前已进入延时签退阶段，系统将在倒计时结束后自动签退。要现在手动签退吗？",
    };
}
