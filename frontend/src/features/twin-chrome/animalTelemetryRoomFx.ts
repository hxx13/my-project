/**
 * 动物房温湿度：按房间/套间展示名推断 `data-animal-card-fx`（送风/排风另有 `.animal-telemetry-airflow-wave` 光波层）。
 */

export type AnimalTelemetryRoomFxKind =
    | "supply-air"
    | "exhaust-air"
    | "power-plant"
    | "breed-monkey"
    | "breed-pig"
    | "breed-dog"
    | "breed-rabbit"
    | "breed-mouse"
    | "default";

/** 合并多段文案（套间标题 + 各房间名）后推断；先送/排风与动力，再饲养动物种属，仅「饲养室」无种属前缀视为小鼠房 */
export function inferAnimalTelemetryRoomFx(...parts: string[]): AnimalTelemetryRoomFxKind {
    const t = parts
        .map((p) => (p || "").trim())
        .filter(Boolean)
        .join(" ");
    if (!t) return "default";

    if (t.includes("送风")) return "supply-air";
    if (t.includes("排风")) return "exhaust-air";
    if (t.includes("动力站") || t.includes("冷水机组") || t.includes("冷冻站") || t.includes("冷机")) return "power-plant";

    const breedCtx = t.includes("饲养室") || t.includes("饲养") || /动物房/.test(t);

    if (breedCtx || /兔.*室|鼠.*室|猴.*室|猪.*室|狗.*室/.test(t)) {
        if (/猴|恒河猴|猕猴/.test(t)) return "breed-monkey";
        if (/猪|小型猪|巴马香猪|豚/.test(t)) return "breed-pig";
        if (/狗|比格|犬|beagle/i.test(t)) return "breed-dog";
        if (/兔|兔子/.test(t)) return "breed-rabbit";
        if (/小鼠|大鼠|仓鼠|鼠类/.test(t)) return "breed-mouse";
        if (t.includes("饲养室")) return "breed-mouse";
    }

    return "default";
}
