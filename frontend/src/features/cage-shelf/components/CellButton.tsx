import { memo } from "react";
import { getDominantStatusCode, useStatusStyle, CAGE_TYPE_LABEL, default as CageCellOverlays } from "@/features/cage-shelf/components/CageCellOverlays";
import { useCageColors } from "@/features/cage-shelf/components/CageColorContext";
import { displayPosition, nonEmptyText } from "../constants";
import type { PersistedAlert, CageShelfCell, CageBoxAction } from "@/api/domains/cageShelf.api";

/**
 * CellButton — 8×10 笼架网格中的单个笼位按钮
 *
 * 自包含的颜色解析逻辑:
 *   1. animalCageType 从多个来源回退解析 (cageTypeCode → cageBoxInfo → specialStatuses → stateLabel → PI/cageBoxCode)
 *   2. 特殊状态颜色从 CageColorContext 读取，2+ 状态时平分渐变
 *   3. 支持 COHABITATION/SPECIAL_FEEDING → type 3 (饲养中) 的兜底映射
 *
 * 视觉状态（按优先级叠加）:
 *   - allocMode 选中态 — checkbox + 蓝色边框
 *   - alert 告警态 — 左上角脉冲圆点 (NEED_DIVIDE/HEALTH_ABNORMAL/ANIMAL_TRANSFER/SPECIAL_FEEDING/COHABITATION)
 *   - bindHighlight — 蓝色 ring（绑定选中）
 *   - bindPending   — 绿色 ring（绑定缓存待提交）
 *   - editCache     — 右上角操作标记 (分/饲/健)
 *   - isLastScanned — 红色 ring（扫码最后命中）
 *   - isCrossCol/Row— 红色 ring（十字交叉辅助线）
 *   - selected      — 蓝色边框 + 背景高亮
 *
 * 坐标显示: 使用 displayPosition() 将 A-1(顶行) 反转为显示 A-10(底行)
 *
 * Props 共 21 个 — 如需新增请评估是否该拆出子组件
 */
export const CellButton = memo(function CellButton({ cell, onClick, alert, selectable, selected, onToggle, allocMode, clickMode, editCacheEntry, isLastScanned, bindHighlight, bindPending, editMode, bindMode, isCrossCol, isCrossRow, flashOverlay, claimMode, isPoolCell }: {
  cell: CageShelfCell; onClick?: (c: CageShelfCell) => void; alert?: PersistedAlert;
  selectable?: boolean; selected?: boolean; onToggle?: (e: React.MouseEvent) => void; allocMode?: boolean;
  clickMode?: "toggle" | "checkbox";
  editCacheEntry?: { initialActions: Set<CageBoxAction>; currentActions: Set<CageBoxAction> };
  isLastScanned?: boolean; bindHighlight?: boolean; bindPending?: boolean; editMode?: boolean; bindMode?: boolean;
  isCrossCol?: boolean; isCrossRow?: boolean; flashOverlay?: boolean;
  claimMode?: boolean; isPoolCell?: boolean;
}) {
  const dominant = getDominantStatusCode(cell.specialStatuses, cell.cageBoxInfo);
  const singleStyle = useStatusStyle(dominant);
  const { colors: ctxColors } = useCageColors();
  // animalCageType fallback: API returns 0 for unset
  const resolvedCageType: number | undefined = (() => {
    let ct = (cell as any).cageTypeCode ?? cell.animalCageType;
    if ((ct == null || ct === 0) && cell.cageBoxInfo) {
      const cbi = cell.cageBoxInfo as Record<string, unknown>;
      const raw = cbi.AnimalCageType ?? cbi.animalCageType;
      if (raw != null && raw !== '' && Number(raw) !== 0) ct = Number(raw);
    }
    // COHABITATION/SPECIAL_FEEDING -> breeding (type 3)
    if ((ct == null || ct === 0 || isNaN(ct)) && Array.isArray(cell.specialStatuses)) {
      const codes = cell.specialStatuses.map((s: any) => s.code);
      if (codes.includes('COHABITATION') || codes.includes('SPECIAL_FEEDING')) ct = 3;
    }
    if ((ct == null || ct === 0 || isNaN(ct)) && cell.stateLabel) {
      const sl = String(cell.stateLabel);
      if (sl.includes('等待分配')) ct = 1;
      else if (sl.includes('空笼盒')) ct = 2;
      else if (sl.includes('饲养')) ct = 3;
      else if (sl.includes('异常')) ct = 4;
    }
    // Has PI or cageBoxCode -> at least reserved, not awaiting allocation
    if ((ct == null || ct === 0 || isNaN(ct)) && !cell.empty) {
      const cbi = cell.cageBoxInfo as Record<string, unknown> | undefined;
      if (cell.projectPiName || cbi?.cageBoxCode || cbi?.CageBoxQrCode) ct = 3;
      else ct = 1;
    }
    return (ct != null && ct !== 0 && !isNaN(ct)) ? ct : undefined;
  })();

  // Multi-status split color: collect all non-NORMAL status colors, gradient when 2+
  const allBgColors: string[] = [];
  (cell.specialStatuses ?? [])
    .filter((s: any) => s.code !== "NORMAL")
    .forEach((s: any) => {
      const c = ctxColors[s.code];
      if (c) allBgColors.push(c.bg);
    });
  const combinedBg = allBgColors.length >= 2
    ? `linear-gradient(to bottom, ${allBgColors.map((bg, i) => {
        const pct = Math.round((i / allBgColors.length) * 100);
        const pctNext = Math.round(((i + 1) / allBgColors.length) * 100);
        return `${bg} ${pct}%, ${bg} ${pctNext}%`;
      }).join(", ")})`
    : allBgColors.length === 1 ? allBgColors[0] : null;
  const style = combinedBg
    ? { ...singleStyle, background: combinedBg }
    : singleStyle;
  const pi = nonEmptyText(cell.projectPiName) ? cell.projectPiName!.trim() : nonEmptyText(cell.piName) ? cell.piName!.trim() : "";
  const isSelectable = selectable && !cell.empty;
  const isToggleMode = clickMode === "toggle"; // full-room = card toggle; single-shelf = checkbox only
  const isInCross = (isCrossCol || isCrossRow) && !isLastScanned;
  const baseCls = cell.empty ? "relative min-h-[82px] rounded-twin-md text-[10px] leading-tight border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]" : "relative min-h-[82px] rounded-twin-md text-[10px] leading-tight border-2 text-slate-900 hover:brightness-95";
  const cls = `${baseCls}${selected ? " border-blue-500 bg-blue-100/20" : ""}${isInCross ? " ring-2 ring-red-500" : ""}`;

  const handleCardClick = (e: React.MouseEvent) => {
    if (isSelectable && isToggleMode && onToggle) { onToggle(e); return; }
    if (isSelectable && !isToggleMode) { onClick?.(cell); return; }
    if (!cell.empty) onClick?.(cell);
  };
  const handleCheckboxClick = (e: React.MouseEvent) => { e.stopPropagation(); if (onToggle) onToggle(e); };
  return <button type="button" className={cls} style={selected ? { ...style, borderColor: "#3b82f6", borderWidth: "2px" } : style}
    onClick={handleCardClick} disabled={cell.empty && !isSelectable}
    data-x={cell.x} data-y={cell.y}>
    {allocMode && isSelectable && <div className="absolute top-0.5 left-0.5 z-20" onClick={handleCheckboxClick}><input type="checkbox" checked={selected ?? false} readOnly className="w-3 h-3 accent-blue-600 pointer-events-none" /></div>}
    {!allocMode && alert && (() => { const ALERT_COLORS: Record<string, string> = { NEED_DIVIDE: "bg-amber-500 ring-amber-300", HEALTH_ABNORMAL: "bg-purple-500 ring-purple-300", ANIMAL_TRANSFER: "bg-cyan-500 ring-cyan-300", SPECIAL_FEEDING: "bg-red-500 ring-red-300", COHABITATION: "bg-emerald-500 ring-emerald-300" }; const ac = ALERT_COLORS[alert.statusCode] || "bg-red-500 ring-red-300"; return <div className="absolute top-0.5 left-0.5 z-20" title={`${alert.statusLabel} · persisted ${alert.spanDays ?? alert.persistedDays}d (threshold ${alert.thresholdDays}d)`}><div className={`w-4 h-4 rounded-full ring-1 flex items-center justify-center shadow-sm animate-pulse ${ac}`}><span className="text-white text-[9px] font-bold leading-none">!</span></div></div>; })()}
    {/* Bind highlight (selected = blue, cache-pending = green) */}
    {bindHighlight && !bindPending && <div className="absolute inset-0 z-10 rounded-twin-md ring-2 ring-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)] pointer-events-none" />}
    {bindPending && <div className="absolute inset-0 z-10 rounded-twin-md ring-2 ring-green-500 shadow-[0_0_10px_rgba(34,197,94,0.35)] pointer-events-none" />}
    {/* Claim mode pool cell highlight */}
    {claimMode && isPoolCell && <div className="absolute inset-0 z-10 rounded-twin-md ring-2 ring-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.35)] pointer-events-none" />}
    {/* Edit cache markers */}
    {editCacheEntry && editCacheEntry.currentActions.size > 0 && <div className="absolute top-0.5 right-0.5 z-20 flex gap-0.5">{Array.from(editCacheEntry.currentActions).map(a => <span key={a} className="text-[8px] px-1 rounded-full text-white font-bold" style={{ background: a === "DIVIDE" ? "#d97706" : a === "SPECIAL_BREEDING" ? "#dc2626" : "#7c3aed" }}>{a === "DIVIDE" ? "分" : a === "SPECIAL_BREEDING" ? "饲" : "健"}</span>)}</div>}
    {isLastScanned && <div className="absolute inset-0 z-10 rounded-twin-md ring-[3px] ring-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)] pointer-events-none" />}
    {flashOverlay && <div className="absolute inset-0 z-10 rounded-twin-md ring-[4px] ring-red-500/80 shadow-[0_0_16px_rgba(239,68,68,0.5)] scan-flash-overlay" />}
    {!cell.empty && <CageCellOverlays animalCageType={resolvedCageType} compact />}
    <div className="flex min-h-[76px] flex-col items-center justify-center gap-0 px-1 py-0.5 text-center">
      <div className="w-full font-bold text-[15px] leading-tight">{displayPosition(cell.position)}</div>
      {cell.empty
        ? <div className="text-[9px] text-[var(--twin-mute)]">空位</div>
        : <>
            {nonEmptyText(cell.projectGroup) && <div className="w-full truncate text-[10px] leading-tight">{cell.projectGroup}</div>}
            {pi && <div className="w-full truncate text-[13px] leading-tight font-semibold text-[var(--twin-ink)]">{pi}</div>}
            <div className="w-full text-[9px] text-[var(--twin-mute)]">{CAGE_TYPE_LABEL[resolvedCageType ?? 0] || cell.stateLabel}</div>
          </>}
    </div>
  </button>;
});
