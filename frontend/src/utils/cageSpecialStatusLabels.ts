/**
 * 笼位特殊状态标准名称 — 与后端 SpecialStatusComputer.java / 扫描快照 statusLabel 对齐。
 * 前端禁止自行缩写或改写（如「合笼」「请分笼」「健康异常」）。
 */
export const SPECIAL_STATUS_LABELS: Record<string, string> = {
  COHABITATION: "合笼/繁殖",
  SPECIAL_FEEDING: "特殊饲养",
  NEED_DIVIDE: "请分笼/密度超标",
  HEALTH_ABNORMAL: "动物健康异常",
  ANIMAL_TRANSFER: "动物转移",
  NORMAL: "正常",
};

export const SPECIAL_STATUS_BG_PRIORITY = [
  "HEALTH_ABNORMAL",
  "NEED_DIVIDE",
  "ANIMAL_TRANSFER",
  "SPECIAL_FEEDING",
  "COHABITATION",
  "NORMAL",
] as const;

export interface SpecialStatusLike {
  code: string;
  label?: string | null;
}

/** 优先 API 返回的 label，否则按 code 映射标准名 */
export function resolveSpecialStatusLabel(code: string, apiLabel?: string | null): string {
  const trimmed = apiLabel?.trim();
  if (trimmed) return trimmed;
  return SPECIAL_STATUS_LABELS[code] ?? code;
}

/** 从 specialStatuses 条目生成格子内展示文案（仅非 NORMAL） */
export function formatSpecialStatusDisplayLabel(entries: SpecialStatusLike[]): string {
  const nonNormal = entries.filter((s) => s.code !== "NORMAL");
  if (nonNormal.length > 0) {
    return nonNormal.map((s) => resolveSpecialStatusLabel(s.code, s.label)).join("·");
  }
  return "";
}

/** cageBoxInfo 兜底：按后端 SpecialStatusComputer 规则推导标准标签 */
export function specialStatusLabelsFromCageBoxInfo(
  cageBoxInfo: Record<string, unknown> | null | undefined,
): string[] {
  if (!cageBoxInfo) return [];
  const labels: string[] = [];
  const yn = (k: string) => cageBoxInfo[k] === 1 || cageBoxInfo[k] === "1";
  const hasText = (k: string) =>
    typeof cageBoxInfo[k] === "string" && (cageBoxInfo[k] as string).trim() !== "";

  if (hasText("ClosingDate") || hasText("closingdate")) {
    labels.push(SPECIAL_STATUS_LABELS.COHABITATION);
  }
  if (yn("NeedFeedingYn") || yn("needFeedingYn")) {
    labels.push(SPECIAL_STATUS_LABELS.SPECIAL_FEEDING);
  }
  if (yn("NeedDivideYn") || yn("needDivideYn")) {
    labels.push(SPECIAL_STATUS_LABELS.NEED_DIVIDE);
  }
  if (yn("AbnormalHealthYn") || yn("abnormalHealthYn")) {
    labels.push(SPECIAL_STATUS_LABELS.HEALTH_ABNORMAL);
  }
  if (yn("NeedTransferYn") || yn("needTransferYn")) {
    labels.push(SPECIAL_STATUS_LABELS.ANIMAL_TRANSFER);
  }
  return labels;
}

/** 从 cageBoxInfo 构建 specialStatuses 条目（含 iconKey，供颜色/兜底逻辑） */
export function buildSpecialStatusEntriesFromCageBoxInfo(
  cageBoxInfo: Record<string, unknown> | null | undefined,
): Array<{ code: string; label: string; iconKey: string; detailName?: string; detailDescription?: string }> {
  if (!cageBoxInfo) return [];
  const results: Array<{ code: string; label: string; iconKey: string; detailName?: string; detailDescription?: string }> = [];
  const yn = (k: string) => cageBoxInfo[k] === 1 || cageBoxInfo[k] === "1";
  const hasText = (k: string) =>
    typeof cageBoxInfo[k] === "string" && (cageBoxInfo[k] as string).trim() !== "";

  if (hasText("ClosingDate") || hasText("closingdate")) {
    results.push({ code: "COHABITATION", label: SPECIAL_STATUS_LABELS.COHABITATION, iconKey: "cohabitation" });
  }
  if (yn("NeedFeedingYn") || yn("needFeedingYn")) {
    const sn =
      typeof cageBoxInfo["SpecialBreedingName"] === "string"
        ? (cageBoxInfo["SpecialBreedingName"] as string)
        : typeof cageBoxInfo["specialBreedingName"] === "string"
          ? (cageBoxInfo["specialBreedingName"] as string)
          : undefined;
    const sd =
      typeof cageBoxInfo["specialBreedingDescription"] === "string"
        ? (cageBoxInfo["specialBreedingDescription"] as string)
        : undefined;
    results.push({
      code: "SPECIAL_FEEDING",
      label: SPECIAL_STATUS_LABELS.SPECIAL_FEEDING,
      iconKey: "feeding",
      detailName: sn,
      detailDescription: sd,
    });
  }
  if (yn("NeedDivideYn") || yn("needDivideYn")) {
    results.push({ code: "NEED_DIVIDE", label: SPECIAL_STATUS_LABELS.NEED_DIVIDE, iconKey: "divide" });
  }
  if (yn("AbnormalHealthYn") || yn("abnormalHealthYn")) {
    results.push({ code: "HEALTH_ABNORMAL", label: SPECIAL_STATUS_LABELS.HEALTH_ABNORMAL, iconKey: "health" });
  }
  if (yn("NeedTransferYn") || yn("needTransferYn")) {
    results.push({ code: "ANIMAL_TRANSFER", label: SPECIAL_STATUS_LABELS.ANIMAL_TRANSFER, iconKey: "transfer" });
  }
  if (results.length === 0) {
    return [{ code: "NORMAL", label: SPECIAL_STATUS_LABELS.NORMAL, iconKey: "normal" }];
  }
  return results;
}

/** tooltip / 辅助展示：标准标签用 + 连接 */
export function formatSpecialStatusCodesForDisplay(
  specialStatuses: SpecialStatusLike[] | undefined | null,
  cageBoxInfo?: Record<string, unknown> | null,
): string {
  const list = specialStatuses?.filter((s) => s.code !== "NORMAL") ?? [];
  if (list.length > 0) {
    return list.map((s) => resolveSpecialStatusLabel(s.code, s.label)).join("+");
  }
  const fallback = specialStatusLabelsFromCageBoxInfo(cageBoxInfo);
  return fallback.length > 0 ? fallback.join("+") : "";
}
