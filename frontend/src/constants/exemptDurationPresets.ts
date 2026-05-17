/** 豁免时效选项：durationMinutes 传后端；-1=当日 23:59:59 */
export const EXEMPT_DURATION_PRESETS: { label: string; durationMinutes: number }[] = [
    { label: "1 小时", durationMinutes: 60 },
    { label: "2 小时", durationMinutes: 120 },
    { label: "4 小时", durationMinutes: 240 },
    { label: "8 小时", durationMinutes: 480 },
    { label: "24 小时", durationMinutes: 1440 },
    { label: "今日有效（至 24:00）", durationMinutes: -1 },
];

export function formatExemptExpireAt(expireAt?: string | null): string {
    if (!expireAt || !String(expireAt).trim()) return "";
    const raw = String(expireAt).trim().replace("T", " ");
    const t = Date.parse(raw.replace(/-/g, "/"));
    if (Number.isNaN(t)) return raw.slice(0, 16);
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
