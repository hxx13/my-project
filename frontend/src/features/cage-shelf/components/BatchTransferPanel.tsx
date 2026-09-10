import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ChevronRight, ChevronLeft, MapPin, X } from "lucide-react";
import type { BatchPair, BatchPhase } from "../useCageOpSelect";

/**
 * 批量转移面板 — 右侧可收纳双列。
 *
 * 左列：按顺序排好的源笼位（可拖拽重排，重排即改配对）
 * 右列：与左列逐行对齐的目标笼位；两列同色的色块即一对。
 *
 * 拖动顺序是唯一的配对来源（第 i 个源 ↔ 第 i 个目标），所以左列重排会实时改右列归属。
 *
 * 拖拽动画交给 dnd-kit：行本身是**普通 div**，transform/transition 全由 useSortable 控制，
 * 外面套 motion 会写自己的 transform 把补位动画盖掉（这就是之前"拖了没反应"的原因）。
 * 被拖起的那一项渲染进 DragOverlay（浮起来），原位置留空、兄弟节点自动补位。
 */
export default function BatchTransferPanel({
  pairs,
  phase,
  loading,
  error,
  submitting,
  onReorder,
  onNext,
  onBack,
  onRemoveSource,
  onClearTarget,
  onLocate,
  onSubmit,
  onCancel,
}: {
  pairs: BatchPair[];
  phase: BatchPhase;
  loading: boolean;
  error: string | null;
  submitting: boolean;
  onReorder: (from: number, to: number) => void;
  onNext: () => void;
  onBack: () => void;
  onRemoveSource: (cageId: string) => void;
  onClearTarget: (cageId: string) => void;
  onLocate?: (cageId: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const unpaired = pairs.filter((p) => !p.targetId).length;
  const canSubmit = pairs.length > 0 && unpaired === 0;
  const activePair = activeId ? pairs.find((p) => p.sourceId === activeId) ?? null : null;

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = pairs.findIndex((p) => p.sourceId === active.id);
    const to = pairs.findIndex((p) => p.sourceId === over.id);
    if (from < 0 || to < 0) return;
    onReorder(from, to);
  };

  return createPortal(
    <>
      <motion.aside
        initial={{ x: 420, opacity: 0 }}
        animate={{ x: collapsed ? 372 : 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        style={{ position: "fixed", top: 72, right: 0, bottom: 12, width: 400, zIndex: 40 }}
        className="flex flex-col rounded-l-twin-xl border border-r-0 border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-2xl"
      >
        {/* 收纳把手：收起后只留这一条竖标签 */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "展开批量转移" : "收起"}
          className="absolute -left-6 top-6 flex h-16 w-6 flex-col items-center justify-center gap-0.5 rounded-l-twin-md border border-r-0 border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
        >
          {collapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span className="text-[9px] leading-none [writing-mode:vertical-rl]">批量转移</span>
        </button>

        {!collapsed && (
          <>
            <header className="shrink-0 border-b border-[var(--twin-hairline)] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="rounded-twin-md bg-[var(--twin-primary)] px-2 py-0.5 text-[11px] font-semibold text-white">
                  批量转移
                </span>
                <span className="text-[12px] font-semibold text-[var(--twin-ink)]">
                  已配对 {pairs.length - unpaired} / {pairs.length}
                </span>
                <button
                  type="button"
                  onClick={onCancel}
                  className="ml-auto text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
                  title="退出批量转移"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-[var(--twin-mute)]">
                {phase === "sources"
                  ? "在网格上勾选需转移的笼位：仅限同一课题组且饲养中的笼位（可跨房间）。顺序即配对顺序，可拖拽调整。"
                  : "按同一顺序点击绿色高亮的空笼位作为目标。第 i 个目标配第 i 个源，同色即一对；拖拽目标可与另一行交换（只影响这两对）。"}
              </p>
            </header>

            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--twin-hairline)] px-4 py-1.5 text-[10px] font-semibold text-[var(--twin-mute)]">
              <span className="flex-1">源笼位{phase === "sources" ? "（拖拽排序）" : ""}</span>
              <span className="w-6" />
              <span className="flex-1">目标笼位{phase === "targets" ? "（拖拽交换）" : ""}</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {loading && <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">加载中…</div>}
              {!loading && error && <div className="py-6 text-center text-[11px] text-red-500">{error}</div>}
              {!loading && !error && pairs.length === 0 && (
                <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">还没有选择笼位</div>
              )}
              {!loading && pairs.length > 0 && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragCancel={() => setActiveId(null)}
                >
                  <SortableContext items={pairs.map((p) => p.sourceId)} strategy={verticalListSortingStrategy}>
                    {pairs.map((p) => (
                      <SortablePairRow
                        key={p.sourceId}
                        pair={p}
                        phase={phase}
                        dragging={activeId === p.sourceId}
                        onRemoveSource={onRemoveSource}
                        onClearTarget={onClearTarget}
                        onLocate={onLocate}
                      />
                    ))}
                  </SortableContext>

                  {/* 拖起来的那一项浮在上层；列表里留一个占位，兄弟节点自动补位 */}
                  <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
                    {activePair ? (
                      <div className="flex items-stretch gap-1" style={{ transform: "scale(1.03)" }}>
                        <PairRowContent
                          pair={activePair}
                          lifted
                          onRemoveSource={onRemoveSource}
                          onClearTarget={onClearTarget}
                          onLocate={onLocate}
                        />
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              )}
            </div>

            <footer className="shrink-0 border-t border-[var(--twin-hairline)] px-4 py-3">
              {phase === "sources" ? (
                <button
                  type="button"
                  disabled={pairs.length === 0}
                  onClick={onNext}
                  className="w-full rounded-twin-md bg-[var(--twin-primary)] px-3 py-2 text-[12px] font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
                >
                  下一步：选择目标笼位
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onBack}
                    className="rounded-twin-md border border-[var(--twin-hairline-strong)] px-3 py-2 text-[12px] font-semibold text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft-2)]"
                  >
                    上一步
                  </button>
                  <button
                    type="button"
                    disabled={!canSubmit || submitting}
                    onClick={onSubmit}
                    className="flex-1 rounded-twin-md bg-[var(--twin-primary)] px-3 py-2 text-[12px] font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
                    title={canSubmit ? undefined : `还有 ${unpaired} 个源笼位未选目标`}
                  >
                    {submitting ? "提交中…" : `确认转移（${pairs.length}）`}
                  </button>
                </div>
              )}
            </footer>
          </>
        )}
      </motion.aside>
    </>,
    document.body,
  );
}

function SortablePairRow({
  pair,
  phase,
  dragging,
  onRemoveSource,
  onClearTarget,
  onLocate,
}: {
  pair: BatchPair;
  phase: BatchPhase;
  dragging: boolean;
  onRemoveSource: (cageId: string) => void;
  onClearTarget: (cageId: string) => void;
  onLocate?: (cageId: string) => void;
}) {
  // 注意：transform/transition 必须由 useSortable 独占，这一层不能用 motion 组件
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pair.sourceId,
  });
  const sortableStyle = { transform: CSS.Transform.toString(transform), transition };
  // 重排的是「当前步骤选的笼位」：源阶段拖左格，目标阶段拖右格。
  // 悬停节点也跟着换，这样拖动时浮起来的只有那一格，另一格原地不动，
  // 一眼能看出「我在排的是哪一列」。
  const targetPhase = phase === "targets";

  return (
    <div
      ref={targetPhase ? undefined : setNodeRef}
      style={
        targetPhase
          ? undefined
          : { ...sortableStyle, position: "relative", zIndex: isDragging ? 1 : undefined, opacity: isDragging ? 0.35 : 1 }
      }
      className="mb-1.5 flex items-stretch gap-1"
    >
      <PairRowContent
        pair={pair}
        dragging={dragging}
        dragHandle={targetPhase ? undefined : { attributes, listeners }}
        targetRef={targetPhase ? setNodeRef : undefined}
        targetStyle={targetPhase ? sortableStyle : undefined}
        targetHandle={targetPhase ? { attributes, listeners } : undefined}
        targetDragging={targetPhase && isDragging}
        onRemoveSource={onRemoveSource}
        onClearTarget={onClearTarget}
        onLocate={onLocate}
      />
    </div>
  );
}

function PairRowContent({
  pair,
  lifted,
  dragging,
  dragHandle,
  targetRef,
  targetStyle,
  targetHandle,
  targetDragging,
  onRemoveSource,
  onClearTarget,
  onLocate,
}: {
  pair: BatchPair;
  /** 在 DragOverlay 里渲染：加浮起投影 */
  lifted?: boolean;
  dragging?: boolean;
  dragHandle?: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
  };
  /** 目标阶段：右格自己当拖拽节点，浮起来的只有它，左格原地不动 */
  targetRef?: (node: HTMLElement | null) => void;
  targetStyle?: { transform: string | undefined; transition: string | undefined };
  targetHandle?: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
  };
  targetDragging?: boolean;
  onRemoveSource: (cageId: string) => void;
  onClearTarget: (cageId: string) => void;
  onLocate?: (cageId: string) => void;
}) {
  return (
    <div
      className={`flex flex-1 items-stretch gap-1 rounded-twin-md ${
        lifted ? "shadow-xl ring-2 ring-[var(--twin-primary)]/40" : ""
      } ${dragging ? "cursor-grabbing" : ""}`}
      style={{ background: "var(--twin-canvas)" }}
    >
      {/* 左列：源 */}
      <div
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-twin-md border bg-[var(--twin-canvas-soft)] px-2 py-1.5"
        style={{ borderColor: pair.color }}
      >
        <span
          className="h-3.5 w-3.5 shrink-0 rounded-sm"
          style={{ backgroundColor: pair.color }}
          title={`配对 ${pair.index + 1}`}
        />
        {dragHandle && (
          <button
            type="button"
            {...dragHandle.attributes}
            {...dragHandle.listeners}
            className="shrink-0 cursor-grab touch-none text-[var(--twin-mute)] active:cursor-grabbing"
            title="拖拽调整顺序"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onLocate?.(pair.sourceId)}
          className="min-w-0 flex-1 text-left"
          title="定位到该笼位"
        >
          <div className="truncate text-[11px] font-semibold text-[var(--twin-ink)]">
            {pair.sourceLabel?.position ?? pair.sourceId}
          </div>
          <div className="truncate text-[9px] text-[var(--twin-mute)]">{pair.sourceLabel?.where ?? ""}</div>
        </button>
        <button
          type="button"
          onClick={() => onRemoveSource(pair.sourceId)}
          className="shrink-0 text-[var(--twin-mute)] hover:text-red-500"
          title="移除"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* 右列：目标 */}
      <div
        ref={targetRef}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-twin-md border px-2 py-1.5"
        style={{
          borderColor: pair.targetId ? pair.color : "var(--twin-hairline)",
          borderStyle: pair.targetId ? "solid" : "dashed",
          ...(targetStyle ?? {}),
          opacity: targetDragging ? 0.35 : undefined,
          position: targetRef ? "relative" : undefined,
          zIndex: targetDragging ? 1 : undefined,
        }}
      >
        {pair.targetId ? (
          <>
            <span className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ backgroundColor: pair.color }} />
            <button
              type="button"
              onClick={() => onLocate?.(pair.targetId!)}
              className="min-w-0 flex-1 text-left"
              title="定位到该笼位"
            >
              <div className="truncate text-[11px] font-semibold text-[var(--twin-ink)]">
                {pair.targetLabel?.position ?? pair.targetId}
              </div>
              <div className="truncate text-[9px] text-[var(--twin-mute)]">{pair.targetLabel?.where ?? ""}</div>
            </button>
            <button
              type="button"
              onClick={() => onClearTarget(pair.targetId!)}
              className="shrink-0 text-[var(--twin-mute)] hover:text-red-500"
              title="解除配对"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-[var(--twin-mute)]">
            <MapPin className="h-3 w-3" />
            待选目标
          </span>
        )}
        {/* 目标阶段的拖拽句柄：拖动即交换两个目标，从而重新匹配 */}
        {targetHandle && pair.targetId && (
          <button
            type="button"
            {...targetHandle.attributes}
            {...targetHandle.listeners}
            className="shrink-0 cursor-grab touch-none text-[var(--twin-mute)] active:cursor-grabbing"
            title="拖拽交换目标（重排即重新配对）"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
