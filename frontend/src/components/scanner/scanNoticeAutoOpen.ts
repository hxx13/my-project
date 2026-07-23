import type { AnalyzeResponse } from "@/api/types/scanner";

/** 是否「已在馆」——此类状态下禁止自动弹出通告条带 */
export function isInsideScanState(state: AnalyzeResponse["currentState"] | undefined): boolean {
  return state === "INSIDE";
}

/**
 * 是否允许在本轮扫码弹窗打开时自动弹出通告。
 * 仅当弹窗**首次挂载**时人员尚未进入（非 INSIDE）为 true；
 * 弹窗内后续 currentState 变化（进入/离开）不得再次触发。
 */
export function canAutoOpenNoticesOnPopupOpen(
  initialState: AnalyzeResponse["currentState"] | undefined
): boolean {
  return !isInsideScanState(initialState);
}
