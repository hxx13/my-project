import { memo } from "react";
import {
  getDominantStatusCode,
  useStatusStyle,
  default as CageCellOverlays,
} from "@/features/cage-shelf/components/CageCellOverlays";
import { useCageColors } from "@/features/cage-shelf/components/CageColorContext";
import { displayPosition } from "@/features/cage-shelf/constants";
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
  "block aspect-square w-full rounded-[3px] border border-[var(--app-color-border-default)] bg-[color-mix(in_srgb,var(--app-color-surface-container)_55%,transparent)]";

/** 认领中间态徽标 —— 与 CellButton 同文案同配色（改一处要同步另一处） */
const CLAIM_BADGE: Record<string, { txt: string; cls: string }> = {
  locked: { txt: "未到位", cls: "bg-amber-500 text-white" },
  pending_approval: { txt: "待审批", cls: "bg-blue-500 text-white" },
  pending_release_approval: { txt: "待释放", cls: "bg-orange-500 text-white" },
};

/**
 * 平面图里的紧凑笼位。
 * 颜色与状态解析与 CellButton 完全一致（主导状态 + 多状态竖向平分色带 + CageCellOverlays）。
 * 格内字段对齐 CellButton（位号 / 课题组组长 / 实验员），只是缩到 aspect-square 尺寸：
 * 类型文字换成右上角类型点（CageCellOverlays compact），省下三行字的宽度。
 * 中间态也一并对齐：认领状态徽标（未到位/待审批/待释放）+ 待审分笼/转移（色环 + 底部色条）。
 * 位号只在非空格子上显示（空格子纯底色，避免 8×10 网格里满屏加粗文字）。
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
  const label = displayPosition(cell.position);
  const pi = cellGroupName(cell);
  const experimenter = (cell.experimenterName ?? "").trim();
  const claimBadge = cell.claimStatus ? CLAIM_BADGE[cell.claimStatus] : undefined;
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
  const opHint = opMark ? ` · ${opMark.label}${opMark.applicantName ? `（${opMark.applicantName}）` : ""}` : "";

  return (
    <button
      type="button"
      data-x={cell.x}
      data-y={cell.y}
      disabled={empty}
      onClick={() => onClick?.(cell)}
      title={`${label}${empty ? " · 空位" : ""}${pi ? ` · ${pi}` : ""}${experimenter ? ` · ${experimenter}` : ""}${claimBadge ? ` · ${claimBadge.txt}` : ""}${opHint}${divisionLabel ? ` · ${divisionLabel}` : ""}${selfHint}`}
      aria-label={`${label}${empty ? " 空位" : ""}${claimBadge ? ` ${claimBadge.txt}` : ""}${divisionLabel ? ` ${divisionLabel}` : ""}${selfHint}`}
      className={
        empty
          ? `relative ${EMPTY_CELL_CLASS}`
          : `relative aspect-square w-full overflow-hidden rounded-[3px] border text-[8px] leading-none text-slate-900 transition hover:brightness-95${
              isSelf ? " scan-plan-self-breath" : ""
            }`
      }
      style={empty ? undefined : style}
    >
      {!empty && <CageCellOverlays animalCageType={resolveCageType(cell)} compact />}
      {!empty && claimBadge ? (
        <span
          className={`pointer-events-none absolute left-0.5 top-0.5 z-10 rounded px-1 py-px text-[7px] font-bold leading-tight ${claimBadge.cls}`}
        >
          {claimBadge.txt}
        </span>
      ) : null}
      {!empty && (
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[1px] px-[3px] pt-[6px]">
          <span className="font-bold">{label}</span>
          {pi ? <span className="w-full truncate font-semibold">{pi}</span> : null}
          {experimenter ? (
            <span className="w-full truncate opacity-75">{experimenter}</span>
          ) : null}
        </span>
      )}
      {/* 待审分笼/转移：源与目标同色环 + 底部色条（与 CellButton 同款） */}
      {opMark ? (
        <>
          <span
            className="pointer-events-none absolute inset-0 z-10 rounded-[3px]"
            style={{ boxShadow: `inset 0 0 0 2px ${opMark.color}` }}
            aria-hidden
          />
          <span
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 truncate text-center text-[7px] font-bold leading-[10px] text-white"
            style={{ background: opMark.color }}
          >
            {opMark.label}
          </span>
        </>
      ) : null}
      {/* 划分：淡玫瑰底 + 描边；本人看到的更实更粗（与 CellButton 同款） */}
      {!empty && divisionLabel ? (
        <>
          <span className="pointer-events-none absolute inset-0 z-10 rounded-[3px] bg-rose-500/10" aria-hidden />
          <span
            className={`pointer-events-none absolute inset-0 z-10 rounded-[3px] ${
              divMine ? "ring-2 ring-inset ring-rose-500" : "ring-1 ring-inset ring-rose-400/60"
            }`}
            aria-hidden
          />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 z-20 truncate bg-rose-600 text-center text-[7px] font-bold leading-[10px] text-white">
            {divisionLabel}
          </span>
        </>
      ) : null}
    </button>
  );
});
