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

/**
 * 平面图里的紧凑笼位。
 * 颜色与状态解析与 CellButton 完全一致（主导状态 + 多状态竖向平分色带 + CageCellOverlays），
 * 只去掉文字与 CellButton 的 min-h-[82px]，改用 aspect-square 自适应。
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

  return (
    <button
      type="button"
      data-x={cell.x}
      data-y={cell.y}
      disabled={empty}
      onClick={() => onClick?.(cell)}
      title={`${displayPosition(cell.position)}${empty ? " · 空位" : ""}`}
      className={
        empty
          ? "relative aspect-square w-full rounded-[3px] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)]"
          : "relative aspect-square w-full rounded-[3px] border-2 text-[8px] leading-none text-slate-900 transition hover:brightness-95"
      }
      style={empty ? undefined : style}
    >
      {!empty && <CageCellOverlays animalCageType={cell.animalCageType} compact />}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-bold">
        {displayPosition(cell.position)}
      </span>
    </button>
  );
});
