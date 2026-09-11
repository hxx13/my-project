import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import toast from "react-hot-toast";
import CageOpDrawer from "@/components/cage/CageOpDrawer";
import type { PendingBatch, PendingItem } from "../pendingBatch";

/** 稳定的空集：不给 selectedIds 的模式（确认/归档/状态/划分）共用，避免每次渲染新建 Set */
const EMPTY_IDS: Set<string> = new Set();

/**
 * 笼架页多模式共用的「待提交」抽屉内容。
 *
 * 纯展示 + 回调：缓冲状态与提交逻辑都在页面里（`pendingByMode` / `submitPending`），
 * 这里只负责把条目列出来、调序、移除、显示失败原因。
 * 每个模式的操作参数（AUP / 人员 / 原因）由调用方通过 `paramsSlot` 塞进来，
 * 因为各模式的参数控件完全不同，放这里会变成一个大 switch。
 */
export default function CageModeDrawer({
  modeLabel,
  modeColor,
  batch,
  submitting,
  paramsSlot,
  bufferSlot,
  zonesSlot,
  onDrop,
  selectedIds = EMPTY_IDS,
  onSelectedChange,
  needsTarget,
  targetKeyOf,
  targetNoun,
  onRemove,
  onMove,
  onClear,
  onSubmit,
  onEditItem,
  onClose,
  headerToggle,
  width = 400,
  embedded = false,
}: {
  /** 模式中文名，如「分配」 */
  modeLabel: string;
  /** 模式强调色（`modeBorderColor(currentMode)`） */
  modeColor: string;
  batch: PendingBatch;
  submitting: boolean;
  /** 该模式的参数区（分配=AUP、预定/划分=人员、归档=原因） */
  paramsSlot?: ReactNode;
  /** 左栏缓冲槽：传了就替代默认的条目清单（分配/预定用） */
  bufferSlot?: ReactNode;
  /** 右栏目标区域槽：传了就透传给 CageOpDrawer.rightColumn 撑开右侧一列 */
  zonesSlot?: ReactNode;
  /** 拖放落点：zoneKey=null 表示拖回缓冲区（清空归属）；fromZone=拖起时所在的区（来自缓冲区则为 null） */
  onDrop?: (cageIds: string[], zoneKey: string | null, fromZone: string | null) => void;
  /**
   * 缓冲区的勾选集（由调用方持有 —— 它同时要喂给左栏的 PendingBufferList 和「放这里」按钮）。
   * 抽屉只读它做两件事：拖起已勾选的条目时整批一起走；提交被拦时把未归属的标出来。
   */
  selectedIds?: Set<string>;
  onSelectedChange?: (ids: Set<string>) => void;
  /** true=条目必须落定归属才能提交 */
  needsTarget?: boolean;
  /** 取归属键（aupId / assigneeAccountId）；空 = 未归属 */
  targetKeyOf?: (it: PendingItem) => string | undefined;
  /** 拦截提示里的目标名词（「AUP」/「人员」） */
  targetNoun?: string;
  onRemove: (cageId: string) => void;
  onMove: (from: number, to: number) => void;
  onClear: () => void;
  onSubmit: () => void;
  /** 状态模式：打开某笼位的表单继续编辑 */
  onEditItem?: (cageId: string) => void;
  /** 标题右侧的切换控件（状态模式的「拖色区 / 直接改」）；渲染在模式名之后、关闭按钮之前 */
  headerToggle?: ReactNode;
  onClose: () => void;
  width?: number;
  /** true=作为 flex 子元素并排；默认 false=portal 固定右侧（与批量转移面板一致，不改页面布局） */
  embedded?: boolean;
}) {
  const { items, failed } = batch;
  const [blockedCount, setBlockedCount] = useState<number | null>(null);
  /** 拖拽中的条目：喂给 DragOverlay 画移动预览；源元素自身不再带 transform */
  const [activeItem, setActiveItem] = useState<PendingItem | null>(null);
  /** 预览节点：条目自己在 data 里塞好（缩放后的真实格子），浮层直接渲染，跟着鼠标走 */
  const [activePreview, setActivePreview] = useState<ReactNode>(null);
  /**
   * 4px 位移才起拖：整张卡都是拖拽把手，没有这道约束的话，
   * 点复选框 / 移除按钮也会被当成拖拽起手，点击语义就丢了。
   */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  /** 拖起缓冲区里一条已勾选的条目 → 整批一起走；否则只走这一条 */
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveItem(null);
    setActivePreview(null);
    const data = e.active?.data?.current as { cageId?: string; fromZone?: string } | undefined;
    const cageId = data?.cageId;
    if (!cageId) return;
    // 从区域里拖出来的是「某一区的单条」，不跟着缓冲勾选集整批走
    const fromZone = data?.fromZone ?? null;
    const ids = !fromZone && selectedIds.has(cageId) ? [...selectedIds] : [cageId];
    const overId = e.over?.id ? String(e.over.id) : null;
    // 拖到没有任何落点的地方 = 退回缓冲区（清空归属）
    if (overId == null) {
      onDrop?.(ids, null, fromZone);
      return;
    }
    if (overId !== "buffer-zone" && !overId.startsWith("zone:")) return;
    onDrop?.(ids, overId === "buffer-zone" ? null : overId.replace(/^zone:/, ""), fromZone);
  };
  const submitGuarded = () => {
    const unassigned = needsTarget ? items.filter((it) => !targetKeyOf?.(it)) : [];
    if (unassigned.length > 0) {
      toast.error(`还有 ${unassigned.length} 个笼位没拖到${targetNoun ?? "目标"}`);
      onSelectedChange?.(new Set(unassigned.map((it) => it.cageId)));
      setBlockedCount(unassigned.length);
      return;
    }
    setBlockedCount(null);
    onSubmit();
  };
  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => {
        const d = e.active?.data?.current as { item?: PendingItem; preview?: ReactNode } | undefined;
        setActiveItem(d?.item ?? null);
        setActivePreview(d?.preview ?? null);
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => { setActiveItem(null); setActivePreview(null); }}
    >
      <CageOpDrawer
        embedded={embedded}
        width={width}
        /* 让开底部的模式悬浮岛：岛 z-index 只有 3，抽屉压上去那颗按钮就点不到，
           而抽屉开着时必须能切模式（84 = 岛高 ~56 + 下边距 16 + 余量） */
        bottom={84}
        collapseLabel={`${modeLabel}待提交`}
        onClose={onClose}
        rightColumn={zonesSlot}
        headerExtra={
          <div className="flex items-center gap-2">
            <span
              className="rounded-twin-md px-2 py-0.5 text-[11px] font-semibold text-white"
              style={{ backgroundColor: modeColor || "var(--twin-primary)" }}
            >
              {modeLabel}
            </span>
            <span className="text-[11px] text-[var(--twin-mute)]">待提交 {items.length} 个</span>
            {headerToggle}
          </div>
        }
      >
        {failed.length > 0 && (
          <div className="mb-2 rounded-twin-md border border-red-200 bg-red-50/70 px-2.5 py-2">
            <div className="text-[11px] font-semibold text-red-700">{failed.length} 个提交失败</div>
            <ul className="mt-1 space-y-0.5">
              {failed.map((f) => (
                <li key={f.cageId} className="truncate text-[10px] text-red-700/90" title={`${f.label}：${f.reason}`}>
                  {f.label} — {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {bufferSlot ?? (
          items.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-[var(--twin-mute)]">
              在网格上点击笼位加入待提交
            </div>
          ) : (
            items.map((it, i) => {
              const fieldCount = it.form ? Object.keys(it.form).length : 0;
              const actionCount = it.actions?.length ?? 0;
              const removedCount = it.removedActions?.length ?? 0;
              const hasActions = actionCount > 0 || removedCount > 0;
              const isFailed = failed.some((f) => f.cageId === it.cageId);
              return (
                <div
                  key={it.cageId}
                  className={`mb-1.5 rounded-twin-md border px-2 py-1.5 ${
                    isFailed ? "border-red-200 bg-red-50/40" : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)]"
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <span
                      className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-sm text-[9px] font-bold text-white"
                      style={{ backgroundColor: modeColor || "var(--twin-primary)" }}
                    >
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      title={it.label}
                      onClick={() => onEditItem?.(it.cageId)}
                    >
                      <div className="truncate text-[11px] font-semibold text-[var(--twin-ink)]">{it.label}</div>
                      {(fieldCount > 0 || hasActions) && (
                        <div className="truncate text-[9px] text-[var(--twin-mute)]">
                          {fieldCount > 0 && `已改 ${fieldCount} 个字段`}
                          {fieldCount > 0 && hasActions && " · "}
                          {hasActions && `新增 ${actionCount} · 取消 ${removedCount}`}
                          {onEditItem && " · 点击继续编辑"}
                        </div>
                      )}
                    </button>
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => onMove(i, -1)}
                        className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)] disabled:opacity-25"
                        title="上移（提交顺序）"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={i === items.length - 1}
                        onClick={() => onMove(i, 1)}
                        className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)] disabled:opacity-25"
                        title="下移（提交顺序）"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(it.cageId)}
                      className="shrink-0 text-[var(--twin-mute)] hover:text-red-500"
                      title="移出待提交"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )
        )}

        {paramsSlot && <div className="mt-3 border-t border-[var(--twin-hairline)] pt-2">{paramsSlot}</div>}

        {items.length > 0 && (
          <div className="mt-3">
            {blockedCount !== null && (
              <div className="mb-1.5 text-[10px] font-medium text-red-600">
                还有 {blockedCount} 个未落到{targetNoun ?? "目标"}，已在缓冲区标出
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClear}
                className="shrink-0 rounded-twin-md border border-[var(--twin-hairline)] px-3 py-1.5 text-[11px] text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
              >
                清空
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={submitGuarded}
                className="flex-1 rounded-twin-md px-3 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
                style={{ backgroundColor: modeColor || "var(--twin-primary)" }}
              >
                {submitting ? "提交中…" : `提交（${items.length}）`}
              </button>
            </div>
          </div>
        )}
      </CageOpDrawer>
      {/*
        拖拽浮层必须自己 portal 到 body、并给一个高于抽屉的层级：
        抽屉本身就是 createPortal(…, body) 的固定浮层（z 40/60），而浮层若留在页面树里，
        只要页面上有个祖先成了层叠上下文，整个浮层就会被压到抽屉底下（拖起来看着像钻到抽屉后面）。
      */}
      {createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: "none" }}>
          <DragOverlay>
            {activeItem ? (
              /* 浮层只跟那一枚方格走（条目自己在 data 里给好），外面不垫白底卡片、不加内边距；
                 给点阴影只是让它看着「被拎起来了」。没有方格时退回一张标签卡。 */
              <div className="w-fit cursor-grabbing drop-shadow-2xl">
                {activePreview ?? <div className="rounded-twin-md border-2 bg-white px-1 text-[11px] font-semibold text-[var(--twin-ink)]" style={{ borderColor: modeColor || "var(--twin-primary)" }}>{activeItem.label}</div>}
              </div>
            ) : null}
          </DragOverlay>
        </div>,
        document.body,
      )}
    </DndContext>
  );
}
