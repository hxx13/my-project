import { useEffect, useMemo, useRef } from "react";
import type { CageColorConfig, CageShelfCell } from "@/api/domains/cageShelf.api";
import type { FloorPlanRack } from "./useRoomFloorPlan";
import { CompactCell, EMPTY_CELL_CLASS } from "./CompactCell";

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
 * 须置于有确定高度的父容器（min-h-0 flex-1）内，否则内层滚动区会塌缩。
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
  legendColors: CageColorConfig;
}) {
  // onCellClick 存进 ref：调用方传内联箭头时不会让下面的 memo 每轮重建，
  // 否则每个 CompactCell 的 onClick 都会换新引用、memo 失效。
  const onCellClickRef = useRef(onCellClick);
  useEffect(() => {
    onCellClickRef.current = onCellClick;
  }, [onCellClick]);

  const cellHandlers = useMemo(
    () => new Map(racks.map((r) => [r, (c: CageShelfCell) => onCellClickRef.current?.(c, r)])),
    [racks],
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
                  ? "rounded-[var(--app-radius-element)] border-2 border-[var(--app-color-feedback-success)] bg-[color-mix(in_srgb,var(--app-color-feedback-success)_10%,transparent)] p-2 shadow-[0_0_0_3px_color-mix(in_srgb,var(--app-color-feedback-success)_16%,transparent)]"
                  : "scan-inner-row p-2"
              }
            >
              <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
                <span
                  className={
                    rack.isMine
                      ? "truncate text-[11px] font-bold text-[var(--app-color-feedback-success)]"
                      : "truncate text-[11px] text-[var(--app-color-text-secondary)]"
                  }
                >
                  {rack.shelveName}
                </span>
                {rack.isMine ? (
                  <span className="shrink-0 rounded-full bg-[var(--app-color-feedback-success)] px-1.5 py-px text-[9px] font-bold text-white">
                    我的课题组
                  </span>
                ) : null}
              </div>
              {/* 无数据也铺满 8×10 空格子，拿到数据只需填充，避免布局跳动 */}
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
                <div className="grid grid-cols-8 gap-[2px]" aria-label="笼位数据加载中">
                  {Array.from({ length: 80 }, (_, i) => (
                    <span key={i} className={EMPTY_CELL_CLASS} />
                  ))}
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
              className="inline-block size-2.5 rounded-[2px] border"
              style={{
                background: legendColors[s.code]?.bg ?? "transparent",
                borderColor: legendColors[s.code]?.border ?? "var(--app-color-border-default)",
              }}
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
