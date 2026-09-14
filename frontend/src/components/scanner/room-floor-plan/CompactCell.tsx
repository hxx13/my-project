import { memo } from "react";
import { SplitSquareHorizontal, MoveRight, Clock, Unlock, CalendarCheck, AlertTriangle } from "lucide-react";
import {
  CAGE_TYPE_LABEL,
  getDominantStatusCode,
  useStatusStyle,
  default as CageCellOverlays,
} from "@/features/cage-shelf/components/CageCellOverlays";
import { useCageColors } from "@/features/cage-shelf/components/CageColorContext";
import SpecialDetailBadges from "@/features/cage-shelf/components/SpecialDetailBadges";
import { displayPosition, specialDetailItemsFor } from "@/features/cage-shelf/constants";
import type { CageShelfCell } from "@/api/domains/cageShelf.api";
import type { CageOpMark } from "@/features/cage-shelf/useCageOpSelect";
import { resolveMultiStatusBackground } from "./cellPaint";
import { resolveCageType } from "./resolveCageType";
import { cellGroupName } from "./groupMatch";
import "./CompactCell.css";

/**
 * 空格子样式：半透明中性底，让弹窗的暖桃色卡片透出来，避免整片死白。
 * 平面图在「无数据」时也用它铺满 8×10 占位格子。
 */
export const EMPTY_CELL_CLASS =
  "block aspect-square w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[color-mix(in_srgb,var(--app-color-surface-container)_55%,transparent)]";

/** 认领中间态徽标 —— 与 CellButton 同文案同配色（改一处要同步另一处） */
const CLAIM_BADGE: Record<string, { txt: string; cls: string }> = {
  locked: { txt: "未到位", cls: "bg-amber-500 text-white" },
  pending_approval: { txt: "待审批", cls: "bg-blue-500 text-white" },
  pending_release_approval: { txt: "待释放", cls: "bg-orange-500 text-white" },
};

/**
 * 平面图里的紧凑笼位 —— **格内标签与中间态与 `CellButton` 逐项对齐**（改一处要同步另一处）。
 * 颜色与状态解析同源（主导状态 + 多状态竖向平分色带 + CageCellOverlays），
 * 格内字段同款：位号 / 课题组组长 / 实验员 / 笼位类型文字，非本组格子显示 `***`。
 * 中间态同款：类型点（未到位/待审批时隐藏）+ 认领徽标 + 待审分笼/转移/预定（色环 + 底部色条）
 * + 居中色底图标 + 划分（玫瑰底 + 「已划分/已划分给你」）。
 * 差别只在尺寸：格子宽度随布局变（两排 ~50px，单列按高度反推 ~64px），
 * 所以格内一切尺寸都由 CompactCell.css 用 cqw 相对格子宽度算，没有任何写死的 px。
 * 有底部状态条时不渲染类型文字（格子高度只够一行，见下方 hasBar）。
 */
export const CompactCell = memo(function CompactCell({
  cell,
  onClick,
  isSelf = false,
  opMark = null,
  selfUserId = "",
  selfName = "",
}: {
  cell: CageShelfCell;
  onClick?: (c: CageShelfCell) => void;
  /** 笼位表单「实验员」= 被扫人 → 呼吸环 */
  isSelf?: boolean;
  /** 该笼位在待审的分笼/转移请求里（源或目标） */
  opMark?: CageOpMark | null;
  /** 被扫人账号 id */
  selfUserId?: string;
  /** 被扫人姓名：划分名单命中时把标签升级为「已划分给你」 */
  selfName?: string;
}) {
  const dominant = getDominantStatusCode(cell.specialStatuses, cell.cageBoxInfo);
  const singleStyle = useStatusStyle(dominant);
  const { colors } = useCageColors();
  const combinedBg = resolveMultiStatusBackground(cell.specialStatuses, colors);
  const style = combinedBg ? { ...singleStyle, background: combinedBg } : singleStyle;
  const empty = cell.empty === true;
  const ct = resolveCageType(cell);
  const label = displayPosition(cell.position);
  /**
   * 脱敏：非本人课题组的格子。后端按被扫人课题组脱敏，把 PI/部门/实验员置 `***`
   * 并打 `visible=false` —— 与笼架信息页 `CellButton` 同一口径、同一个字段。
   */
  const hidden = !empty && cell.visible === false;
  const pi = hidden ? "" : cellGroupName(cell);
  const experimenter = hidden ? "" : (cell.experimenterName ?? "").trim();
  const typeLabel = CAGE_TYPE_LABEL[ct ?? 0] || cell.stateLabel || "";
  const claimBadge = cell.claimStatus ? CLAIM_BADGE[cell.claimStatus] : undefined;
  /**
   * 中间态居中图标 —— 与 `CellButton` 同款：待审分笼/转移 + 认领待审批 + 释放待审批，
   * 正中一枚色底图标。底部色条只说明「转到哪」，这枚图标才说明「还没定下来」。
   */
  const pendingOverlay = opMark
    ? {
        color: opMark.color,
        label: opMark.label,
        title: opMark.title,
        Icon: opMark.kind === "divide"
          ? SplitSquareHorizontal
          : opMark.kind === "transfer"
            ? MoveRight
            : opMark.kind === "alert"
              ? AlertTriangle
              : CalendarCheck,
      }
    : cell.claimStatus === "pending_approval"
      ? { color: "#3b82f6", label: "认领待审批", Icon: Clock }
      : cell.claimStatus === "pending_release_approval"
        ? { color: "#f97316", label: "释放待审批", Icon: Unlock }
        : null;
  /** 未到位/待审批时右上角类型点会误导（"空笼盒"），与 `CellButton` 同规则隐藏 */
  const hideTypeDot = cell.claimStatus === "locked" || cell.claimStatus === "pending_approval";
  /* 划分名单（预分给指定人员）。
     两边 id 域不同——名单里存的是 STAFF_* 账号 id，被扫人 userId 常是 ARO 人员号，
     所以先比 id、再比姓名（比的是「被扫人」姓名，不是格子实验员）。 */
  const divList = cell.divisionAssignees;
  const myName = selfName.trim();
  const divMine = Array.isArray(divList) && divList.some((a) =>
    (selfUserId !== "" && String(a.id) === selfUserId) ||
    (myName !== "" && (a.name ?? "").trim() === myName)
  );
  const divisionLabel = Array.isArray(divList) && divList.length > 0
    ? (divMine ? "已划分给你" : "已划分")
    : undefined;
  const selfHint = isSelf && !empty ? " · 本人实验员" : "";
  const opHint = opMark ? ` · ${opMark.title ?? opMark.label}${opMark.applicantName ? `（${opMark.applicantName}）` : ""}` : "";
  const typeHint = hidden ? " · ***" : (typeLabel ? ` · ${typeLabel}` : "");
  /**
   * 有底部状态条时不再渲染类型文字 —— 那条是实心的，格子高度只够一行，
   * 硬塞会让末行被压在色条下面（尺寸按 cqw 算，大格子小格子同样吃紧）。
   * 类型信息这时靠右上角类型点 + 状态条本身表达。
   */
  const hasBar = Boolean(opMark || divisionLabel);
  /** 特殊饲养明细角标（右上角）。平面图只读，没有暂存态，读服务端状态即可。 */
  const sfDetailItems = specialDetailItemsFor(cell.specialStatuses);

  return (
    <button
      type="button"
      data-x={cell.x}
      data-y={cell.y}
      disabled={empty}
      onClick={() => onClick?.(cell)}
      title={`${label}${empty ? " · 空位" : ""}${pi ? ` · ${pi}` : ""}${experimenter ? ` · ${experimenter}` : ""}${typeHint}${claimBadge ? ` · ${claimBadge.txt}` : ""}${opHint}${divisionLabel ? ` · ${divisionLabel}` : ""}${selfHint}`}
      aria-label={`${label}${empty ? " 空位" : ""}${claimBadge ? ` ${claimBadge.txt}` : ""}${divisionLabel ? ` ${divisionLabel}` : ""}${selfHint}`}
      className={
        empty
          ? `relative ${EMPTY_CELL_CLASS}`
          : `scan-plan-cell relative aspect-square w-full overflow-hidden rounded-[var(--app-radius-element)] border leading-none text-slate-900 transition hover:brightness-95${
              isSelf ? " scan-plan-self-breath" : ""
            }`
      }
      style={empty ? undefined : style}
    >
      {!empty && !hideTypeDot && <CageCellOverlays animalCageType={ct} compact />}
      {/* 特殊饲养明细：右上角（尺寸由 CompactCell.css 按 cqw 覆盖，同类型指示灯那套手法） */}
      {!empty && <SpecialDetailBadges items={sfDetailItems} />}
      {!empty && claimBadge ? (
        <span
          className={`scan-plan-badge pointer-events-none absolute z-10 font-bold leading-tight ${claimBadge.cls}`}
        >
          {claimBadge.txt}
        </span>
      ) : null}
      {!empty && (
        <span
          className={`scan-plan-body pointer-events-none absolute inset-0 flex flex-col items-center justify-center${
            hasBar ? " scan-plan-body--bar" : ""
          }`}
        >
          <span className="scan-plan-pos w-full truncate text-center font-bold">{label}</span>
          {hidden ? (
            <span className="scan-plan-sub w-full truncate text-center font-semibold opacity-60">***</span>
          ) : (
            <>
              {pi ? <span className="scan-plan-sub w-full truncate text-center font-semibold">{pi}</span> : null}
              {experimenter ? (
                <span className="scan-plan-sub w-full truncate text-center opacity-75">{experimenter}</span>
              ) : null}
              {typeLabel && !hasBar ? (
                <span className="scan-plan-type w-full truncate text-center opacity-70">{typeLabel}</span>
              ) : null}
            </>
          )}
        </span>
      )}
      {/* 待审分笼/转移/订单预定：源与目标同色环 + 底部色条（与 CellButton 同款） */}
      {opMark ? (
        <>
          <span
            className="pointer-events-none absolute inset-0 z-10 rounded-[var(--app-radius-element)]"
            style={{ boxShadow: `inset 0 0 0 3px ${opMark.color}, 0 0 10px ${opMark.color}66` }}
            aria-hidden
          />
          <span
            className="scan-plan-bar pointer-events-none absolute inset-x-0 bottom-0 z-20 truncate text-center font-bold text-white"
            style={{ background: opMark.color }}
          >
            {opMark.label}
          </span>
        </>
      ) : null}
      {/* 中间态覆盖层：浅色蒙层 + 正中图标（与 CellButton 同款） */}
      {pendingOverlay ? (
        <>
          <span className="pointer-events-none absolute inset-0 z-[19] rounded-[var(--app-radius-element)] bg-white/25" aria-hidden />
          <span className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
            <span
              className="scan-plan-pending grid place-items-center rounded-full text-white shadow ring-1 ring-white/80"
              style={{ background: pendingOverlay.color }}
              title={pendingOverlay.title ?? pendingOverlay.label}
            >
              <pendingOverlay.Icon strokeWidth={2.6} />
            </span>
          </span>
        </>
      ) : null}
      {/* 划分：淡玫瑰底 + 描边；本人看到的更实更粗（与 CellButton 同款） */}
      {!empty && divisionLabel ? (
        <>
          <span className="pointer-events-none absolute inset-0 z-10 rounded-[var(--app-radius-element)] bg-rose-500/10" aria-hidden />
          <span
            className={`pointer-events-none absolute inset-0 z-10 rounded-[var(--app-radius-element)] ${
              divMine ? "ring-2 ring-inset ring-rose-500" : "ring-1 ring-inset ring-rose-400/60"
            }`}
            aria-hidden
          />
          <span className="scan-plan-bar pointer-events-none absolute inset-x-0 bottom-0 z-20 truncate bg-rose-600 text-center font-bold text-white">
            {divisionLabel}
          </span>
        </>
      ) : null}
    </button>
  );
});
