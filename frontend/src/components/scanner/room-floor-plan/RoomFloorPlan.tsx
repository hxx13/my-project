import { useEffect, useMemo, useRef, useState } from "react";
import type { CageColorConfig, CageShelfCell } from "@/api/domains/cageShelf.api";
import type { FloorPlanRack } from "./useRoomFloorPlan";
import type { CageOpMark } from "@/features/cage-shelf/useCageOpSelect";
import { CompactCell, EMPTY_CELL_CLASS } from "./CompactCell";

const STATUS_LEGEND: { code: string; label: string }[] = [
  { code: "NORMAL", label: "普通" },
  { code: "COHABITATION", label: "合笼" },
  { code: "SPECIAL_FEEDING", label: "特殊饲养" },
  { code: "NEED_DIVIDE", label: "需分笼" },
  { code: "HEALTH_ABNORMAL", label: "健康异常" },
  { code: "ANIMAL_TRANSFER", label: "动物转移" },
];

/** 一个架子的固定开销：表头 + 上下内边距 + 10 行的行间距 + 边框（单列按高度反推格子边长时扣除） */
const RACK_CHROME_PX = 60;
/** 格子之外的横向开销：左右内边距 + 7 条列间距 */
const RACK_CHROME_X_PX = 30;

/** 笼位表单「实验员」是否就是被扫人本人 */
const isSelfExperimenter = (cell: CageShelfCell, selfName: string | undefined): boolean => {
  const mine = (selfName ?? "").trim();
  if (!mine) return false;
  return (cell.experimenterName ?? "").trim() === mine;
};

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
  selfName,
  selfUserId,
  opMarkByCageId,
}: {
  racks: FloorPlanRack[];
  mineCount: number;
  columns?: number;
  loading?: boolean;
  empty?: boolean;
  error?: boolean;
  onCellClick?: (cell: CageShelfCell, rack: FloorPlanRack) => void;
  legendColors: CageColorConfig;
  /** 被扫人姓名：笼位表单「实验员」等于此人时加呼吸环 */
  selfName?: string;
  /** 被扫人账号 id：命中划分名单时标签升级为「已划分给你」 */
  selfUserId?: string;
  /** 待审分笼/转移：笼位 id → 标识（分笼审核中 / 转移审核中） */
  opMarkByCageId?: Map<string, CageOpMark>;
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

  /*
   * 单列排布（本课题组架子 <3 架）时，架子别横向拉满整栏：那样格子边长 = 栏宽/8，
   * 10 行叠起来就超出可视高度，整架被裁、要滚才看得全。
   * 改为按可用高度反推格子边长，再把架子宽度收住 —— 保证一个笼架完整显示。
   */
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [maxRackWidth, setMaxRackWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (columns !== 1) {
      setMaxRackWidth(undefined);
      return;
    }
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const cell = Math.floor((el.clientHeight - RACK_CHROME_PX) / 10);
      setMaxRackWidth(Math.max(120, cell * 8 + RACK_CHROME_X_PX));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [columns, racks.length, loading]);

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
        该房间暂无你的课题组笼架
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {racks.map((rack) => (
            <div
              key={rack.shelveId}
              style={maxRackWidth ? { maxWidth: maxRackWidth, justifySelf: "center", width: "100%" } : undefined}
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
                      isSelf={isSelfExperimenter(cell, selfName)}
                      opMark={opMarkByCageId?.get(String(cell.id ?? "")) ?? null}
                      selfUserId={selfUserId}
                      selfName={selfName}
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
        {selfName ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-[2px] border-[1.5px] border-[var(--app-color-accent)]" />
            本人实验员
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-[2px] border bg-rose-500/15 ring-1 ring-inset ring-rose-400/60" />
          已划分
        </span>
      </div>
    </div>
  );
}
