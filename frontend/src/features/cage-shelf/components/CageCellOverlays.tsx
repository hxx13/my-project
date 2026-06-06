import type { SpecialStatusEntry } from "@/api/domains/cageShelf.api";
import { DEFAULT_COLORS, useCageColors } from "./CageColorContext";

/* ================================================================== */
/*  Default color values — single source of truth in CageColorContext   */
/* ================================================================== */

export { DEFAULT_COLORS };

const STATUS_BG_PRIORITY = [
  "HEALTH_ABNORMAL", "NEED_DIVIDE", "ANIMAL_TRANSFER",
  "SPECIAL_FEEDING", "COHABITATION", "NORMAL",
] as const;

/* ================================================================== */
/*  Helpers (accept colors param — callers pass from context)          */
/* ================================================================== */

function normalizeStatuses(raw: SpecialStatusEntry[] | string | undefined | null): SpecialStatusEntry[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as SpecialStatusEntry[]; } catch { return []; }
  }
  return raw;
}

/**
 * Fallback: when cached grid data predates the specialStatuses field,
 * derive status entries from cageBoxInfo flags (always populated by backend).
 */
function computeStatusesFromCageBoxInfo(
  cageBoxInfo: Record<string, unknown> | undefined | null,
): SpecialStatusEntry[] {
  if (!cageBoxInfo) return [];
  const results: SpecialStatusEntry[] = [];
  const yn = (k: string) => cageBoxInfo[k] === 1 || cageBoxInfo[k] === "1";
  const hasText = (k: string) => typeof cageBoxInfo[k] === "string" && (cageBoxInfo[k] as string).trim() !== "";

  if (hasText("ClosingDate")) {
    results.push({ code: "COHABITATION", label: "合笼/繁殖", iconKey: "cohabitation" });
  }
  if (yn("NeedFeedingYn")) {
    const sn = typeof cageBoxInfo["SpecialBreedingName"] === "string" ? cageBoxInfo["SpecialBreedingName"] as string : undefined;
    const sd = typeof cageBoxInfo["specialBreedingDescription"] === "string" ? cageBoxInfo["specialBreedingDescription"] as string : undefined;
    results.push({ code: "SPECIAL_FEEDING", label: "特殊饲养", iconKey: "feeding", detailName: sn, detailDescription: sd });
  }
  if (yn("NeedDivideYn")) {
    results.push({ code: "NEED_DIVIDE", label: "请分笼/密度超标", iconKey: "divide" });
  }
  if (yn("AbnormalHealthYn")) {
    results.push({ code: "HEALTH_ABNORMAL", label: "动物健康异常", iconKey: "health" });
  }
  if (yn("NeedTransferYn")) {
    results.push({ code: "ANIMAL_TRANSFER", label: "动物转移", iconKey: "transfer" });
  }
  return results.length > 0 ? results : [{ code: "NORMAL", label: "正常", iconKey: "normal" }];
}

export function getDominantStatusCode(
  statuses: SpecialStatusEntry[] | string | undefined | null,
  cageBoxInfo?: Record<string, unknown> | null,
): string | null {
  let list = normalizeStatuses(statuses);
  // Fallback: compute from cageBoxInfo if specialStatuses is empty or only NORMAL
  if (list.length === 0 || (list.length === 1 && list[0].code === "NORMAL")) {
    const fallback = computeStatusesFromCageBoxInfo(cageBoxInfo);
    if (fallback.length > 0 && !(fallback.length === 1 && fallback[0].code === "NORMAL")) {
      list = fallback;
    }
  }
  const codes = new Set(list.map((s) => s.code));
  // No status data at all → treat as NORMAL
  if (codes.size === 0) return "NORMAL";
  // Only NORMAL flag → use NORMAL color
  if (codes.has("NORMAL") && codes.size === 1) return "NORMAL";
  for (const c of STATUS_BG_PRIORITY) if (codes.has(c)) return c;
  return "NORMAL"; // fallback: unrecognized codes → use normal color
}

export function getStatusStyle(
  code: string | null,
  colors: Record<string, { bg: string; border: string }> = DEFAULT_COLORS,
): React.CSSProperties | undefined {
  if (!code) return undefined;
  const c = colors[code] ?? DEFAULT_COLORS[code];
  if (!c) return undefined;
  return { backgroundColor: c.bg, borderColor: c.border, borderWidth: 2 };
}

/**
 * Hook: consume context colors and produce inline style for a status code.
 * Single point of composition — callers cannot bypass the context.
 */
export function useStatusStyle(code: string | null): React.CSSProperties | undefined {
  const { colors } = useCageColors();
  return getStatusStyle(code, colors);
}

/* ================================================================== */
/*  Cage type indicator dots                                            */
/* ================================================================== */

const DOT_VISIBLE_TYPES = new Set([1, 2, 4]);

const CAGE_TYPE_DOT: Record<number, string> = {
  1: "bg-amber-500 ring-amber-300",
  2: "bg-rose-500 ring-rose-300",
  4: "bg-blue-500 ring-blue-300",
};

export const CAGE_TYPE_LABEL: Record<number, string> = {
  1: "等待分配", 2: "已预约(空笼盒)", 3: "已预约(饲养中)", 4: "异常",
};

const CAGE_TYPE_ABBR: Record<number, string> = { 1: "待", 2: "空", 4: "异" };

export const STATUS_COLOR_DOT: Record<string, string> = {
  COHABITATION:   "bg-emerald-500 ring-emerald-300",
  SPECIAL_FEEDING: "bg-red-500 ring-red-300",
  NEED_DIVIDE:    "bg-yellow-500 ring-yellow-300",
  HEALTH_ABNORMAL: "bg-purple-500 ring-purple-300",
  ANIMAL_TRANSFER: "bg-cyan-500 ring-cyan-300",
};

export const STATUS_ABBR: Record<string, string> = {
  COHABITATION: "合", SPECIAL_FEEDING: "饲", NEED_DIVIDE: "分",
  HEALTH_ABNORMAL: "疾", ANIMAL_TRANSFER: "迁",
};

/* ================================================================== */
/*  Component                                                           */
/* ================================================================== */

export default function CageCellOverlays({ animalCageType, compact }: {
  animalCageType?: number; compact?: boolean;
}) {
  const t = animalCageType ?? 0;
  if (!DOT_VISIBLE_TYPES.has(t)) return null;
  const dot = CAGE_TYPE_DOT[t] ?? "bg-gray-400 ring-gray-200";
  const abbr = CAGE_TYPE_ABBR[t] ?? "?";
  const label = CAGE_TYPE_LABEL[t] ?? "未知";
  const size = compact ? "w-3.5 h-3.5 text-[8px]" : "w-4 h-4 text-[9px]";
  return (
    <div className="absolute top-0.5 right-0.5 z-10">
      <div className={`${size} rounded-full ${dot} ring-1 flex items-center justify-center shadow-sm`} title={label}>
        <span className="text-white font-bold leading-none pointer-events-none select-none">{abbr}</span>
      </div>
    </div>
  );
}

export { CAGE_TYPE_DOT, DOT_VISIBLE_TYPES, STATUS_COLOR_DOT as STATUS_COLOR };
