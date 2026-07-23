/** 流水线表格：由 aro_access_log.feed_* 推导展示列 */

function str(v: unknown): string {
    if (v == null) return "";
    return String(v).trim();
}

function feedSource(log: Record<string, unknown>): string {
    return str(log.feed_source ?? log.feedSource);
}

function feedSummary(log: Record<string, unknown>): string {
    return str(log.feed_summary_zh ?? log.feedSummaryZh);
}

function feedDetail(log: Record<string, unknown>): string {
    return str(log.feed_detail_zh ?? log.feedDetailZh);
}

function accessType(log: Record<string, unknown>): number {
    const v = log.accessType ?? log.access_type;
    return typeof v === "number" ? v : Number(v);
}

const PREVIEW_CHARS = 44;

/** 进入 / 离开合并为一列「操作来源」 */
export function labelOperationSource(log: Record<string, unknown>): string {
    const at = accessType(log);
    const src = feedSource(log);
    if (!src) return at === 1 || at === 2 ? "未标注" : "—";
    const map = (s: string): string => {
        if (s === "WEB_SCAN") return "Web 扫码";
        if (s === "TWIN_AUTO_SIGNOUT") return "孪生·自动签退";
        if (s.startsWith("TWIN_")) return "孪生系统";
        if (s === "ARO_OFFICIAL_UNMATCHED") return "官方登记";
        return s;
    };
    if (at === 1) return map(src);
    if (at === 2) return map(src);
    return "—";
}

/** 离开触发：整理为短句，去掉常见技术尾巴 */
function buildExitTriggerFull(log: Record<string, unknown>): string {
    if (accessType(log) !== 2) return "—";
    let det = feedDetail(log);
    if (!det) {
        const sum = feedSummary(log);
        return sum ? simplifyTriggerText(sum) : "—";
    }
    det = simplifyTriggerText(det);
    const u = det.toUpperCase();
    if (u.includes("ACTIVATION_EXPIRE") || u.includes("激活超时")) return "门禁激活超时后的自动离开";
    if (u.includes("仅 ARO") || u.includes("门禁联动已关闭") || u.includes("AUTO_RISK")) return "仅完成离开登记；门禁联动已关闭，未撤权限、未冻结";
    if (u.includes("FIRST_FREEZE")) return "与首次冻结策略相关";
    if (u.includes("SECOND_FREEZE")) return "与二次冻结策略相关";
    if (u.includes("MANUAL")) return "管理员手动";
    if (u.includes("SCHEDULE") || u.includes("定时")) return "定时任务触发";
    const first = det.split(/[；\n]/)[0]?.trim() ?? det;
    return first.length > 220 ? first.slice(0, 217) + "…" : first;
}

function simplifyTriggerText(s: string): string {
    return s
        .replace(/roomId=\d+/gi, "")
        .replace(/channel=[^\s|；]+/gi, "")
        .replace(/state=[A-Za-z0-9_]+/gi, "")
        .replace(/autoRiskActionEnabled=[^；\s]+/gi, "门禁联动已关闭")
        .replace(/\s*[|｜]\s*/g, "；")
        .replace(/；+/g, "；")
        .replace(/\s+/g, " ")
        .trim();
}

export function exitTriggerReasonPreview(log: Record<string, unknown>): string {
    const full = buildExitTriggerFull(log);
    if (full === "—" || full.length <= PREVIEW_CHARS) return full;
    return full.slice(0, PREVIEW_CHARS) + "…";
}

export function exitTriggerReasonFull(log: Record<string, unknown>): string {
    return buildExitTriggerFull(log);
}

export function exitTriggerNeedsMore(log: Record<string, unknown>): boolean {
    return accessType(log) === 2 && buildExitTriggerFull(log).length > PREVIEW_CHARS;
}
