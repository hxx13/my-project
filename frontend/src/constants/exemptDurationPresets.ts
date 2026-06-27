/** 豁免延长至当日时点（HH:mm），默认 18:00 */
export const DEFAULT_EXEMPT_UNTIL_TIME = "18:00";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 生成 30 分钟一档的「延长至」预设（含起止边界） */
export function buildExemptUntilTimePresets(
    startHour = 15,
    startMinute = 0,
    endHour = 23,
    endMinute = 30,
    stepMinutes = 30,
): { label: string; untilTime: string }[] {
    const out: { label: string; untilTime: string }[] = [];
    let cursor = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    while (cursor <= end) {
        const h = Math.floor(cursor / 60);
        const m = cursor % 60;
        const untilTime = `${pad2(h)}:${pad2(m)}`;
        out.push({ label: formatExemptUntilLabel(untilTime), untilTime });
        cursor += stepMinutes;
    }
    return out;
}

export const EXEMPT_UNTIL_TIME_PRESETS = buildExemptUntilTimePresets();

export function formatExemptUntilLabel(untilTime: string): string {
    return `延长至 ${untilTime}`;
}

/** @deprecated 使用 EXEMPT_UNTIL_TIME_PRESETS */
export const EXEMPT_DURATION_PRESETS = EXEMPT_UNTIL_TIME_PRESETS.map((p) => ({
    label: p.label,
    durationMinutes: 0,
    untilTime: p.untilTime,
}));

export function formatExemptExpireAt(expireAt?: string | null): string {
    if (!expireAt || !String(expireAt).trim()) return "";
    const raw = String(expireAt).trim().replace("T", " ");
    const t = Date.parse(raw.replace(/-/g, "/"));
    if (Number.isNaN(t)) return raw.slice(0, 16);
    const d = new Date(t);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatExemptRemaining(expireAt?: string | null): string {
    if (!expireAt) return "";
    const t = Date.parse(String(expireAt).trim().replace(/-/g, "/").replace("T", " "));
    if (Number.isNaN(t)) return "";
    const diffMs = t - Date.now();
    if (diffMs <= 0) return "已到期";
    const mins = Math.ceil(diffMs / 60_000);
    if (mins < 60) return `剩余 ${mins} 分钟`;
    const hours = Math.floor(mins / 60);
    const rm = mins % 60;
    if (hours < 24) return rm > 0 ? `剩余 ${hours} 小时 ${rm} 分` : `剩余 ${hours} 小时`;
    const days = Math.floor(hours / 24);
    return `剩余 ${days} 天`;
}

export const EXEMPT_MODE_OPTIONS: { label: string; value: string }[] = [
    { label: "时长限制", value: "TIME" },
    { label: "次数限制", value: "COUNT" },
    { label: "时长+次数", value: "BOTH" },
];

export function formatExemptStatus(row: {
    freezeExemptFlag?: number;
    freezeExemptMode?: string | null;
    freezeExemptExpireAt?: string | null;
    freezeExemptMaxCount?: number | null;
    freezeExemptUsedCount?: number | null;
}): string {
    if (!row.freezeExemptFlag || row.freezeExemptFlag !== 1) return "";
    const mode = row.freezeExemptMode || "TIME";
    const parts: string[] = [];
    if (mode === "TIME" || mode === "BOTH") {
        const remain = formatExemptRemaining(row.freezeExemptExpireAt);
        if (remain) parts.push(remain);
        const until = formatExemptExpireAt(row.freezeExemptExpireAt);
        if (until) parts.push(until);
    }
    if (mode === "COUNT" || mode === "BOTH") {
        const used = row.freezeExemptUsedCount ?? 0;
        const max = row.freezeExemptMaxCount ?? 0;
        parts.push(`剩余 ${max - used}/${max} 次`);
    }
    return parts.join(" · ");
}

/** 展示延迟/豁免规则文案：优先 extendUntilTime，兼容旧 durationMinutes */
export function formatExemptTimeRule(extendUntilTime?: string | null, durationMinutes?: number | null): string {
    if (extendUntilTime?.trim()) return formatExemptUntilLabel(extendUntilTime.trim());
    if (durationMinutes != null && durationMinutes > 0) return `延长 ${durationMinutes} 分钟（旧规则）`;
    if (durationMinutes === -1) return "今日有效（至 24:00）";
    return "—";
}

/** 从 freezeExemptRoomIds JSON 解析房间名数组。兼容旧格式 ["id1","id2"] 和新格式 [{"roomId":"x","roomName":"y"}] */
export function parseExemptRoomNames(roomIdsJson?: string | null): string[] {
    if (!roomIdsJson) return [];
    try {
        const arr = JSON.parse(roomIdsJson);
        if (!Array.isArray(arr) || arr.length === 0) return [];
        return arr.map((item: unknown) => {
            if (typeof item === 'object' && item !== null) {
                const name = (item as Record<string, unknown>).roomName;
                if (typeof name === 'string' && name.trim()) return name.trim();
                const id = (item as Record<string, unknown>).roomId;
                return typeof id === 'string' ? id : '';
            }
            if (typeof item === 'string') return item;
            return '';
        }).filter(Boolean);
    } catch {
        return [];
    }
}
