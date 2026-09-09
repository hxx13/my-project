import { useMemo } from "react";
import type { CageShelfCell } from "@/api/domains/cageShelf.api";
import type { FloorPlanRack } from "./useRoomFloorPlan";
import { CompactCell } from "./CompactCell";

const STATUS_LEGEND: { code: string; label: string }[] = [
  { code: "NORMAL", label: "普通" },
  { code: "COHABITATION", label: "合笼" },
  { code: "SPECIAL_FEEDING", label: "特殊饲养" },
  { code: "NEED_DIVIDE", label: "需分笼" },
  { code: "HEALTH_ABNORMAL", label: "健康异常" },
  { code: "ANIMAL_TRANSFER", label: "动物转移" },
];

/**
 * 房间平面图：每排 `columns` 个架子，只有本区域纵向滚动。
 * 数据加载失败由父组件降级，这里只负责渲染。
 */
export function RoomFloorPlan({
  racks,
  mineCount,
  columns = 3,
  loading,
  empty,
  error,
  onCellClick,
  legendColors,
}: {
  racks: FloorPlanRack[];
  mineCount: number;
  columns?: number;
  loading?: boolean;
  empty?: boolean;
  error?: boolean;
  onCellClick?: (cell: CageShelfCell, rack: FloorPlanRack) => void;
  legendColors: Record<string, { bg: string; border: string }>;
}) {
  // 每个架子一个稳定的点击回调：否则每格传内联箭头函数会让 CompactCell 的 memo 失效
  const cellHandlers = useMemo(
    () => new Map(racks.map((r) => [r, (c: CageShelfCell) => onCellClick?.(c, r)])),
    [racks, onCellClick],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--app-color-text-tertiary)]">
        平面图加载中…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--app-color-text-tertiary)]">
        平面图暂不可用
      </div>
    );
  }
  if (empty || racks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--app-color-text-tertiary)]">
        该房间暂无笼架数据
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {racks.map((rack) => (
            <div
              key={rack.shelveId}
              className={
                rack.isMine
                  ? "rounded-lg border-[1.5px] border-[var(--app-color-feedback-success)] bg-[var(--app-color-feedback-success-soft)] p-2"
                  : "rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2"
              }
            >
              <div
                className={
                  rack.isMine
                    ? "mb-1.5 truncate text-[10px] font-bold text-[var(--app-color-feedback-success)]"
                    : "mb-1.5 truncate text-[10px] text-[var(--app-color-text-secondary)]"
                }
              >
                {rack.shelveName}
                {rack.isMine ? " ★ 我的课题组" : ""}
              </div>
              {rack.hasData ? (
                <div className="grid grid-cols-8 gap-[2px]">
                  {rack.cells.map((cell) => (
                    <CompactCell
                      key={`${cell.x}-${cell.y}`}
                      cell={cell}
                      onClick={cellHandlers.get(rack)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex h-16 items-center justify-center text-[10px] text-[var(--app-color-text-tertiary)]">
                  暂无笼位数据
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1 text-[10px] text-[var(--app-color-text-tertiary)]">
        {STATUS_LEGEND.map((s) => (
          <span key={s.code} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-[2px]"
              style={{ background: legendColors[s.code]?.bg ?? "transparent" }}
            />
            {s.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-[2px] border-[1.5px] border-[var(--app-color-feedback-success)] bg-[var(--app-color-feedback-success-soft)]" />
          我的课题组（{mineCount} 架）
        </span>
      </div>
    </div>
  );
}
