import { memo } from "react";
import {
  getDominantStatusCode,
  useStatusStyle,
  default as CageCellOverlays,
} from "@/features/cage-shelf/components/CageCellOverlays";
import { useCageColors } from "@/features/cage-shelf/components/CageColorContext";
import { displayPosition } from "@/features/cage-shelf/constants";
import type { CageShelfCell } from "@/api/domains/cageShelf.api";
import { resolveMultiStatusBackground } from "./cellPaint";
import { resolveCageType } from "./resolveCageType";

/**
 * 空格子样式：半透明中性底，让弹窗的暖桃色卡片透出来，避免整片死白。
 * 平面图在「无数据」时也用它铺满 8×10 占位格子。
 */
export const EMPTY_CELL_CLASS =
  "block aspect-square w-full rounded-[3px] border border-[var(--app-color-border-default)] bg-[color-mix(in_srgb,var(--app-color-surface-container)_55%,transparent)]";

/**
 * 平面图里的紧凑笼位。
 * 颜色与状态解析与 CellButton 完全一致（主导状态 + 多状态竖向平分色带 + CageCellOverlays），
 * 去掉 CellButton 的 PI 名/实验员/类型文字与 min-h-[82px]，改用 aspect-square 自适应。
 * 位号只在非空格子上显示（空格子纯底色，避免 8×10 网格里满屏加粗文字）。
 */
export const CompactCell = memo(function CompactCell({
  cell,
  onClick,
}: {
  cell: CageShelfCell;
  onClick?: (c: CageShelfCell) => void;
}) {
  const dominant = getDominantStatusCode(cell.specialStatuses, cell.cageBoxInfo);
  const singleStyle = useStatusStyle(dominant);
  const { colors } = useCageColors();
  const combinedBg = resolveMultiStatusBackground(cell.specialStatuses, colors);
  const style = combinedBg ? { ...singleStyle, background: combinedBg } : singleStyle;
  const empty = cell.empty === true;
  const label = displayPosition(cell.position);

  return (
    <button
      type="button"
      data-x={cell.x}
      data-y={cell.y}
      disabled={empty}
      onClick={() => onClick?.(cell)}
      title={`${label}${empty ? " · 空位" : ""}`}
      aria-label={`${label}${empty ? " 空位" : ""}`}
      className={
        empty
          ? `relative ${EMPTY_CELL_CLASS}`
          : "relative aspect-square w-full overflow-hidden rounded-[3px] border text-[8px] leading-none text-slate-900 transition hover:brightness-95"
      }
      style={empty ? undefined : style}
    >
      {!empty && <CageCellOverlays animalCageType={resolveCageType(cell)} compact />}
      {!empty && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-bold">
          {label}
        </span>
      )}
    </button>
  );
});
