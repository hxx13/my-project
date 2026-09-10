import { memo } from "react";
import { SplitSquareHorizontal, MoveRight, Clock, Unlock } from "lucide-react";
import type { LockState } from "./SyncLockContext";
import { getDominantStatusCode, useStatusStyle, CAGE_TYPE_LABEL, resolveCageType, default as CageCellOverlays } from "@/features/cage-shelf/components/CageCellOverlays";
import { useCageColors } from "@/features/cage-shelf/components/CageColorContext";
import { displayPosition, nonEmptyText, CAGE_BOX_ACTIONS } from "../constants";
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
 *   - editCache     — 编辑缓存动作色并入背景（预览选中状态，对齐 H5 GridCellButton）
 *   - isLastScanned — 红色 ring（扫码最后命中）
 *   - isCrossCol/Row— 红色 ring（十字交叉辅助线）
 *   - selected      — 蓝色边框 + 背景高亮
 *
 * 坐标显示: 使用 displayPosition() 将 A-1(顶行) 反转为显示 A-10(底行)
 *
 * Props 共 21 个 — 如需新增请评估是否该拆出子组件
 */
export const CellButton = memo(function CellButton({ cell, onClick, alert, selectable, selected, onToggle, allocMode, clickMode, editCacheEntry, isLastScanned, bindHighlight, bindPending, editMode, bindMode, isCrossCol, isCrossRow, flashOverlay, claimMode, isPoolCell, confirmMode, isMyClaimCell, restrictSelectToPool, pairColor, opMarker, lockState, divisionLabel }: {
  cell: CageShelfCell; onClick?: (c: CageShelfCell) => void; alert?: PersistedAlert;
  selectable?: boolean; selected?: boolean; onToggle?: (e: React.MouseEvent) => void; allocMode?: boolean;
  clickMode?: "toggle" | "checkbox";
  editCacheEntry?: { initialActions: Set<CageBoxAction>; currentActions: Set<CageBoxAction> };
  isLastScanned?: boolean; bindHighlight?: boolean; bindPending?: boolean; editMode?: boolean; bindMode?: boolean;
  isCrossCol?: boolean; isCrossRow?: boolean; flashOverlay?: boolean;
  claimMode?: boolean; isPoolCell?: boolean; confirmMode?: boolean;
  /** 认领/扫码确认模式：该笼位是「本人待确认到位」的认领，高亮以便一眼找到 */
  isMyClaimCell?: boolean;
  /** 只有池内格子可勾选（分笼/转移选位用；否则同架其他格子也会冒复选框） */
  restrictSelectToPool?: boolean;
  /** 批量转移配对色：同色的一对即「源→目标」，只填源/目标两种，不与其他格撞色 */
  pairColor?: string;
  /** 待审中间态（分笼审核中/转移审核中）：源与目标同配对色，底部色条注明状态 */
  opMarker?: { requestId: string; kind: "divide" | "transfer"; color: string; label: string };
  /** 同步保护锁三态（仅保护模式下传入）：整格描边标示，点击整格切换锁 */
  lockState?: LockState;
  /** 笼位划分标签（仅该笼位有划分时传入）：本人=「已划分给你」，他人=「已划分」 */
  divisionLabel?: string;
}) {
  const dominant = getDominantStatusCode(cell.specialStatuses, cell.cageBoxInfo);
  const singleStyle = useStatusStyle(dominant);
  const { colors: ctxColors } = useCageColors();
  const resolvedCageType = resolveCageType(cell);

  // Multi-status split color: collect all non-NORMAL status colors, gradient when 2+
  const allBgColors: string[] = [];
  (cell.specialStatuses ?? [])
    .filter((s: any) => s.code !== "NORMAL")
    .forEach((s: any) => {
      const c = ctxColors[s.code];
      if (c) allBgColors.push(c.bg);
    });
  // 编辑缓存动作色（预览）：与 H5 GridCellButton 一致，选中即把该状态色并入背景
  if (editCacheEntry) {
    for (const a of CAGE_BOX_ACTIONS) if (editCacheEntry.currentActions.has(a.action)) allBgColors.push(ctxColors[a.statusCode]?.bg ?? "#ccc");
  }
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
  const pi = (() => {
    if (nonEmptyText(cell.projectPiName)) return cell.projectPiName!.trim();
    if (nonEmptyText(cell.piName)) return cell.piName!.trim();
    // ARO cageBoxInfo 用 PascalCase ProjectPiName；本地 detail 嵌套兜底
    const cbi = cell.cageBoxInfo as Record<string, unknown> | undefined;
    if (cbi) {
      const fromBi =
        (typeof cbi.ProjectPiName === "string" && cbi.ProjectPiName.trim()) ||
        (typeof cbi.projectPiName === "string" && cbi.projectPiName.trim()) ||
        (typeof cbi.piName === "string" && cbi.piName.trim()) ||
        "";
      if (fromBi) return fromBi;
    }
    const d = (cell as any).detail as Record<string, unknown> | undefined;
    if (d) {
      const projectPi = typeof d.projectPiName === "string" ? d.projectPiName.trim() : "";
      if (projectPi) return projectPi;
      const topPi = typeof d.piName === "string" ? d.piName.trim() : "";
      if (topPi) return topPi;
    }
    return "";
  })();
  const isSelectable = selectable && !cell.empty && (!restrictSelectToPool || isPoolCell);
  /**
   * 中间审核态的醒目覆盖层（格子正中一枚色底图标）。
   * 与「色环 + 底部色条」互补：色环表达配对关系（谁转给谁），图标保证一眼看到「这个笼位还没定下来」。
   * 覆盖范围 = 分笼/转移待审 + 认领待审批 + 释放待审批；共用同一套视觉（尚未生效 = 有图标压着）。
   */
  const pendingOverlay = opMarker
    ? { color: opMarker.color, label: opMarker.label, Icon: opMarker.kind === "divide" ? SplitSquareHorizontal : MoveRight }
    : cell.claimStatus === "pending_approval"
      ? { color: "#3b82f6", label: "认领待审批", Icon: Clock }
      : cell.claimStatus === "pending_release_approval"
        ? { color: "#f97316", label: "释放待审批", Icon: Unlock }
        : null;  const isToggleMode = clickMode === "toggle"; // full-room = card toggle; single-shelf = checkbox only
  const isInCross = (isCrossCol || isCrossRow) && !isLastScanned;
  const baseCls = cell.empty ? "relative min-h-[82px] rounded-twin-md text-[10px] leading-tight border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]" : "relative min-h-[82px] rounded-twin-md text-[10px] leading-tight border-2 text-slate-900 hover:brightness-95";
  // 同步保护模式下的锁态描边：红=锁定，绿=白名单，灰=继承上级
  const lockCls = lockState === "locked" ? " ring-2 ring-red-500 ring-offset-1"
    : lockState === "unlocked" ? " ring-2 ring-emerald-500 ring-offset-1"
    : lockState === "inherited" ? " ring-2 ring-slate-300"
    : "";
  const cls = `${baseCls}${selected ? " border-blue-500 bg-blue-100/20" : ""}${isInCross ? " ring-2 ring-red-500" : ""}${lockCls}`;

  const handleCardClick = (e: React.MouseEvent) => {
    // 同步保护模式：点击整格即切换该笼位的锁（有 lockState 说明该格可上锁）
    if (lockState !== undefined) { onClick?.(cell); return; }
    if (isSelectable && isToggleMode && onToggle) { onToggle(e); return; }
    if (isSelectable && !isToggleMode) { onClick?.(cell); return; }
    if (!cell.empty) onClick?.(cell);
  };
  const handleCheckboxClick = (e: React.MouseEvent) => { e.stopPropagation(); if (onToggle) onToggle(e); };
  const handleCheckboxChange = () => { if (onToggle) onToggle({ stopPropagation: () => {} } as React.MouseEvent); };
  return <button type="button" className={cls} style={selected ? { ...style, borderColor: "#3b82f6", borderWidth: "2px" } : style}
    onClick={handleCardClick} disabled={cell.empty && !isSelectable && lockState === undefined}
    data-x={cell.x} data-y={cell.y}>
    {allocMode && isSelectable && <input type="checkbox" checked={selected ?? false} onChange={handleCheckboxChange} onClick={(e) => e.stopPropagation()} className="absolute top-0.5 left-0.5 z-20 w-3 h-3 accent-blue-600" />}
    {!allocMode && alert && (() => { const ALERT_COLORS: Record<string, string> = { NEED_DIVIDE: "bg-amber-500 ring-amber-300", HEALTH_ABNORMAL: "bg-purple-500 ring-purple-300", ANIMAL_TRANSFER: "bg-cyan-500 ring-cyan-300", SPECIAL_FEEDING: "bg-red-500 ring-red-300", COHABITATION: "bg-emerald-500 ring-emerald-300" }; const ac = ALERT_COLORS[alert.statusCode] || "bg-red-500 ring-red-300"; return <div className="absolute top-0.5 left-0.5 z-20" title={`${alert.statusLabel} · persisted ${alert.spanDays ?? alert.persistedDays}d (threshold ${alert.thresholdDays}d)`}><div className={`w-4 h-4 rounded-full ring-1 flex items-center justify-center shadow-sm animate-pulse ${ac}`}><span className="text-white text-[9px] font-bold leading-none">!</span></div></div>; })()}
    {/* Bind highlight (selected = blue, cache-pending = green) */}
    {bindHighlight && !bindPending && <div className="absolute inset-0 z-10 rounded-twin-md ring-2 ring-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)] pointer-events-none" />}
    {bindPending && <div className="absolute inset-0 z-10 rounded-twin-md ring-2 ring-green-500 shadow-[0_0_10px_rgba(34,197,94,0.35)] pointer-events-none" />}
    {/* Claim mode pool cell highlight */}
    {claimMode && isPoolCell && <div className="absolute inset-0 z-10 rounded-twin-md ring-2 ring-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.35)] pointer-events-none" />}
    {/* 批量转移配对色：源与目标同色同环，靠颜色在网格上认出「谁转给谁」 */}
    {pairColor && <div className="absolute inset-0 z-10 rounded-twin-md pointer-events-none" style={{ boxShadow: `inset 0 0 0 3px ${pairColor}, 0 0 10px ${pairColor}66` }} />}
    {/* 待审中间态：源与目标同色环 + 底部色条，一眼看出「谁要转到哪」且尚未生效 */}
    {opMarker && (
      <>
        <div className="absolute inset-0 z-10 rounded-twin-md pointer-events-none" style={{ boxShadow: `inset 0 0 0 3px ${opMarker.color}, 0 0 10px ${opMarker.color}66` }} />
        <div className="absolute inset-x-0 bottom-0 z-20 truncate rounded-b-twin-md text-center text-[8px] font-bold leading-[13px] text-white pointer-events-none"
          style={{ background: opMarker.color }} title={`${opMarker.label}（${opMarker.kind === "divide" ? "分笼" : "转移"}请求 #${opMarker.requestId}）`}>
          {opMarker.label}
        </div>
      </>
    )}
    {/* 中间审核态覆盖层：浅色蒙层 + 正中大图标，比角落小徽标醒目得多 */}
    {pendingOverlay && (
      <>
        <div className="absolute inset-0 z-[19] rounded-twin-md bg-white/25 pointer-events-none" />
        <div className="absolute inset-0 z-20 grid place-items-center pointer-events-none">
          <span className="grid size-6 place-items-center rounded-full text-white shadow-md ring-2 ring-white/80"
            style={{ background: pendingOverlay.color }} title={pendingOverlay.label}>
            <pendingOverlay.Icon className="size-3.5" strokeWidth={2.6} />
          </span>
        </div>
      </>
    )}
    {/* 本人待确认到位的认领：琥珀环，与「未到位」徽标同色系，学生一眼定位自己的笼位 */}
    {isMyClaimCell && <div className="absolute inset-0 z-10 rounded-twin-md ring-2 ring-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)] pointer-events-none" />}
    {/* 划分：淡玫瑰底 + 描边，让「哪些笼位被划分了」成片一眼可辨；本人看到的更实更粗 */}
    {divisionLabel && (() => {
      const mine = divisionLabel.includes("你");
      return <>
        <div className="absolute inset-0 z-10 rounded-twin-md bg-rose-500/10 pointer-events-none" />
        <div className={`absolute inset-0 z-10 rounded-twin-md pointer-events-none ring-inset ${mine ? "ring-2 ring-rose-500" : "ring-1 ring-rose-400/60"}`} />
        <div className="absolute inset-x-0 bottom-0 z-20 truncate rounded-b-twin-md bg-rose-600 text-center text-[8px] font-bold leading-[13px] text-white pointer-events-none"
          title={divisionLabel}>{divisionLabel}</div>
      </>;
    })()}
    {cell.claimStatus && (() => {
      const badge: Record<string, { txt: string; cls: string; pos: string }> = {
        locked: { txt: "未到位", cls: "bg-amber-500 text-white", pos: "left-0.5" },
        pending_approval: { txt: "待审批", cls: "bg-blue-500 text-white", pos: "left-0.5" },
        pending_release_approval: { txt: "待释放", cls: "bg-orange-500 text-white", pos: "left-0.5" },
      };
      const s = badge[cell.claimStatus!];
      if (!s) return null;
      return <div className={`absolute top-0.5 ${s.pos} z-20 px-1 py-px rounded text-[8px] font-bold leading-tight ${s.cls}`}>{s.txt}</div>;
    })()}
    {isLastScanned && <div className="absolute inset-0 z-10 rounded-twin-md ring-[3px] ring-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)] pointer-events-none" />}
    {flashOverlay && <div className="absolute inset-0 z-10 rounded-twin-md ring-[4px] ring-red-500/80 shadow-[0_0_16px_rgba(239,68,68,0.5)] scan-flash-overlay" />}
    {/* 同步保护：锁定的笼位盖一层淡红罩，提示同步时会跳过（点击整格切换 锁→白名单→清除） */}
    {lockState === "locked" && <div className="absolute inset-0 z-10 rounded-twin-md bg-red-500/10 pointer-events-none" />}
    {/* 待到位（locked）是「已预约(空笼盒)→已预约(饲养中)」之间的过渡态：
        左上角已有「未到位」徽标表意，右上角的「空」类型图标此时会误导，隐藏。 */}
    {!cell.empty && cell.claimStatus !== "locked" && cell.claimStatus !== "pending_approval" && <CageCellOverlays animalCageType={resolvedCageType} compact />}
    <div className="flex min-h-[76px] flex-col items-center justify-center gap-0 px-1 py-0.5 text-center">
      <div className="w-full font-bold text-[15px] leading-tight">{displayPosition(cell.position)}</div>
      {cell.empty
        ? <div className="text-[9px] text-[var(--twin-mute)]">空位</div>
        : cell.visible === false
          ? <div className="text-[9px] text-[var(--twin-mute)]">***</div>
          : <>
              {/* 项目名称（cell.projectGroup = 后端 projectName）不在这里显示 —— 格子只有 82px 高，
                  塞项目名会把 PI / 实验员 / 状态挤掉，且它在详情面板里本来就有 */}
              {pi && <div className="w-full truncate text-[11px] leading-tight font-semibold text-[var(--twin-ink)]">{pi}</div>}
              {cell.experimenterName && <div className="w-full truncate text-[9px] leading-tight text-[var(--twin-ink)]">{cell.experimenterName}</div>}
              <div className="w-full text-[9px] text-[var(--twin-mute)]">{CAGE_TYPE_LABEL[resolvedCageType ?? 0] || cell.stateLabel}</div>
            </>}
    </div>
  </button>;
});
