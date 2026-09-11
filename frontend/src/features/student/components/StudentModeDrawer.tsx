import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { ArrowDownToLine, ListChecks, Trash2, X } from "lucide-react";
import type { PendingItem } from "@/features/cage-shelf/pendingBatch";
import type { CageShelfCell } from "@/api/domains/cageShelf.api";
import { SelectCheck } from "@/features/cage-shelf/components/SelectCheck";
import { CellButton } from "@/features/cage-shelf/components/CellButton";

/** 右栏目标区域（划分模式的人员）。不传 zones 时右栏不出现。 */
export interface StudentZone {
  key: string;
  title: string;
  subtitle?: string;
}

/**
 * 只画那一枚笼位方格（60×60），不含下方的笼架名与改动角标。
 *
 * **用网格里同一个 `CellButton`**（等比缩进 60×60 的方框里，同订购页「按顺序分配」那套手法）：
 * 这样缓冲/区域里的格子和网格里的长得一模一样，状态色/异常标记/PI 全部照搬，不会自己画一套褪色的。
 * 拖拽浮层也用它。
 */
export function StudentChipCell({ item, cell }: { item: PendingItem; cell?: CageShelfCell }) {
  return (
    <div className="h-[60px] w-[60px] shrink-0 overflow-hidden">
      {cell ? (
        <div className="origin-top-left [transform:scale(0.73)] [&>button]:min-h-[82px] [&>button]:w-[70px]">
          <CellButton cell={cell} />
        </div>
      ) : (
        <div className="grid h-[60px] w-[60px] place-items-center rounded-student-md border border-dashed border-[var(--app-color-border-default)] p-1 text-center text-[8px] leading-tight text-[var(--app-color-text-tertiary)]">
          {item.label}
        </div>
      )}
    </div>
  );
}

/**
 * 缓冲/区域条目共用的「芯片主体」：真实笼位缩略图 + 下方一行笼架名。
 * 左右两栏共用这一份，保证拖进区域后外观与缓冲区一致、不会再漂移。
 * 拖拽把手、复选框、移除按钮由调用方挂在外面。
 */
export function StudentChipBody({ item, cell, shelfName }: {
  item: PendingItem;
  cell?: CageShelfCell;
  shelfName?: string;
}) {
  const changed = (item.actions?.length ?? 0) + (item.removedActions?.length ?? 0);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <StudentChipCell item={item} cell={cell} />
      <div className="max-w-[60px] truncate text-[9px] text-[var(--app-color-text-tertiary)]" title={shelfName || item.label}>
        {shelfName || item.label}
      </div>
      {changed > 0 && (
        <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
          改 {changed}
        </span>
      )}
    </div>
  );
}

/**
 * 一枚缓冲/区域格子磁贴：方格 + 角上的勾选/移除 + 下方笼架名。
 * 宽度贴合内容，容器用 flex-wrap —— 缓冲栏宽就一行三四个，区域窄就两个，不写死列数。
 * 左右两栏共用这一份（区域传 zoneKey），拖拽 id 与 payload 由它统一生成。
 */
function ChipTile({
  item, cell, shelfName, zoneKey, selected, onToggle, onRemove,
}: {
  item: PendingItem; cell?: CageShelfCell; shelfName?: string;
  /** 传了表示这一枚在某个人员区域里（拖回缓冲时靠 fromZone 知道从哪出来） */
  zoneKey?: string;
  /** 缓冲区才有的勾选/移除；区域里由区卡片自己的垃圾桶负责 */
  selected?: boolean;
  onToggle?: (cageId: string) => void; onRemove?: (cageId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: zoneKey ? `s-zone-item:${zoneKey}:${item.cageId}` : `s-item:${item.cageId}`,
    // preview 只给那一枚方格：跟着鼠标的是格子本身，不是外面这张卡的底
    data: {
      cageId: item.cageId, item,
      preview: <StudentChipCell item={item} cell={cell} />,
      ...(zoneKey ? { fromZone: zoneKey } : {}),
    },
  });
  /** 复选框/移除按钮不吃拖拽：按下就地停住，不冒泡到整张磁贴的拖拽把手 */
  const stopDrag = (e: React.PointerEvent) => e.stopPropagation();
  /** 按下时记位置：拖拽收尾那一下浏览器还会补一个 click，靠位移把它和「真点击」分开 */
  const downRef = useRef<{ x: number; y: number } | null>(null);
  /*
    整张磁贴**点击 = 选中/取消**，与后台同一口径（双视角统一）。
    这里是拖拽把手，所以挡住「拖拽收尾补发的 click」：按下→抬起位移 >3px 就不当点击，
    阈值与 dnd-kit 的 4px 起拖约束对齐，真拖过的一律不会误切选中。
  */
  const handleTileClick = (e: React.MouseEvent) => {
    const d = downRef.current;
    if (d && (Math.abs(e.clientX - d.x) > 3 || Math.abs(e.clientY - d.y) > 3)) return;
    if (onToggle) onToggle(item.cageId);
  };
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onPointerDownCapture={(e) => { downRef.current = { x: e.clientX, y: e.clientY }; }}
      onClick={onToggle ? handleTileClick : undefined}
      title={onToggle ? `${item.label} · 点击选中/取消` : item.label}
      className={`relative w-fit cursor-grab rounded-student-md border bg-[var(--app-color-surface-container)] p-0.5 ${
        selected ? "border-[var(--app-color-accent-hover)] ring-1 ring-[var(--app-color-accent-hover)]" : "border-[var(--app-color-border-default)]"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      {onToggle && (
        /* 勾选标记走共用的 SelectCheck（绿圆 + 白勾），不再用原生复选框 */
        <div className="absolute left-0.5 top-0.5 z-10">
          <SelectCheck size="sm" checked={!!selected} onToggle={() => onToggle(item.cageId)} title={`选择 ${item.label}`} />
        </div>
      )}
      {onRemove && (
        <button
          type="button"
          onPointerDown={stopDrag}
          onClick={() => onRemove(item.cageId)}
          className="absolute right-0.5 top-0.5 z-10 grid h-4 w-4 place-items-center rounded bg-white/85 text-[var(--app-color-text-tertiary)] hover:text-red-500"
          title="移出缓冲"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {/* 缩略图不参与命中：放行指针事件会吃掉拖拽起手 */}
      <div className="pointer-events-none">
        <StudentChipBody item={item} cell={cell} shelfName={shelfName} />
      </div>
    </div>
  );
}

function Zone({
  zone, items, selectedCount, onAssignSelected, onUnassignAll, cellOf, shelfNameOf,
}: {
  zone: StudentZone; items: PendingItem[]; selectedCount: number;
  onAssignSelected: (zoneKey: string) => void; onUnassignAll: (zoneKey: string) => void;
  cellOf?: (item: PendingItem) => CageShelfCell | undefined;
  shelfNameOf?: (item: PendingItem) => string | undefined;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `s-zone:${zone.key}` });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-student-md border-2 p-2 ${
        isOver ? "border-[var(--app-color-accent-hover)] bg-[var(--app-color-surface-hover)]" : "border-[var(--app-color-border-default)]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold text-[var(--app-color-text-primary)]">{zone.title}</div>
          {zone.subtitle && <div className="truncate text-[10px] text-[var(--app-color-text-tertiary)]">{zone.subtitle}</div>}
        </div>
        <span className="rounded-full bg-[var(--app-color-surface-hover)] px-1.5 text-[10px] font-semibold text-[var(--app-color-text-tertiary)]">
          {items.length}
        </span>
      </div>
      <div className="mt-1.5 flex gap-1">
        <button
          type="button"
          onClick={() => onAssignSelected(zone.key)}
          disabled={selectedCount === 0}
          title={selectedCount === 0 ? "先勾选缓冲区里的笼位" : undefined}
          className="flex flex-1 items-center justify-center gap-1 rounded-student-sm bg-[var(--app-color-accent-hover)] px-1.5 py-1 text-[10px] font-semibold text-white disabled:opacity-40"
        >
          <ArrowDownToLine className="h-3 w-3" />放这里{selectedCount > 0 ? `（${selectedCount}）` : ""}
        </button>
        <button
          type="button"
          onClick={() => onUnassignAll(zone.key)}
          disabled={items.length === 0}
          className="rounded-student-sm border border-[var(--app-color-border-default)] px-1.5 py-1 text-[10px] text-[var(--app-color-text-tertiary)] disabled:opacity-40"
          title="区内笼位全部退回缓冲区"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {/* 折行排布：与缓冲区同一套磁贴，区域窄就一行两个 */}
      <div className="mt-1.5 flex flex-wrap content-start items-start gap-1">
        {items.map((it) => (
          <ChipTile key={`${zone.key}:${it.cageId}`} zoneKey={zone.key} item={it} cell={cellOf?.(it)} shelfName={shelfNameOf?.(it)} />
        ))}
        {items.length === 0 && <div className="px-1 text-[10px] text-[var(--app-color-text-tertiary)]">拖笼位到这里</div>}
      </div>
    </div>
  );
}

/**
 * 学生端模式抽屉 —— 申请预约（无区域）/ 划分（右栏人员区域）。
 * 与后台 CageModeDrawer 同构但另写一套皮：学生端令牌是 --app-color-*，不共用后台组件。
 */
export default function StudentModeDrawer({
  title, items, selected, zones, itemsByZone, onToggle, onToggleAll, onRemove, onAssignSelected, onUnassignAll, onDrop, onSubmit, submitting, onClose, targetNoun, needsTarget, targetKeyOf, zonesHeader, cellOf, shelfNameOf,
}: {
  title: string;
  /** 左栏缓冲条目（划分模式下 = 未归属的；申请预约 = 全部） */
  items: PendingItem[];
  selected: Set<string>;
  zones?: StudentZone[];
  itemsByZone?: Map<string, PendingItem[]>;
  onToggle: (cageId: string) => void;
  onToggleAll: () => void;
  onRemove: (cageId: string) => void;
  onAssignSelected: (zoneKey: string) => void;
  onUnassignAll: (zoneKey: string) => void;
  onDrop: (cageIds: string[], zoneKey: string | null) => void;
  onSubmit: () => void;
  submitting: boolean;
  onClose: () => void;
  /** 拦截提示用（划分模式传「人员」；申请预约不传 = 不校验） */
  needsTarget?: boolean;
  targetKeyOf?: (it: PendingItem) => string | undefined;
  targetNoun?: string;
  zonesHeader?: ReactNode;
  /** 该缓冲笼位对应的真实格子（用于渲染缩略图）；无则回退纯文本 */
  cellOf?: (item: PendingItem) => CageShelfCell | undefined;
  /** 该缓冲笼位所在笼架名（缩略图下方）；无则回退 label */
  shelfNameOf?: (item: PendingItem) => string | undefined;
}) {
  const [localErr, setLocalErr] = useState("");
  const [dragItem, setDragItem] = useState<PendingItem | null>(null);
  /** 预览节点：条目自己在 data 里塞好，浮层直接渲染，跟着鼠标走 */
  const [dragPreview, setDragPreview] = useState<ReactNode>(null);
  /** 4px 位移才起拖：整张卡都是拖拽把手，没有这道约束点复选框/移除会误触拖拽 */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const handleDragStart = (e: DragStartEvent) => {
    const d = e.active?.data?.current as { item?: PendingItem; preview?: ReactNode } | undefined;
    setDragItem(d?.item ?? null);
    setDragPreview(d?.preview ?? null);
  };
  const handleDragEnd = (e: DragEndEvent) => {
    setDragItem(null);
    setDragPreview(null);
    const cageId = e.active?.data?.current?.cageId as string | undefined;
    if (!cageId) return;
    const ids = selected.has(cageId) ? [...selected] : [cageId];
    const overId = e.over?.id ? String(e.over.id) : null;
    // 拖到没有任何落点的地方 = 退回缓冲区（清空归属）
    if (overId == null) { onDrop(ids, null); return; }
    if (overId !== "s-buffer" && !overId.startsWith("s-zone:")) return;
    onDrop(ids, overId === "s-buffer" ? null : overId.replace(/^s-zone:/, ""));
  };
  const handleDragCancel = () => { setDragItem(null); setDragPreview(null); };
  const guardedSubmit = () => {
    const rest = needsTarget ? items.filter((it) => !targetKeyOf?.(it)) : [];
    if (rest.length > 0) {
      setLocalErr(`还有 ${rest.length} 个笼位没落到${targetNoun ?? "目标"}`);
      return;
    }
    setLocalErr("");
    onSubmit();
  };
  /** 已归属条数（划分模式的右栏条目），用于「提交」总数与可用性 */
  const assignedCount = zones && itemsByZone ? Array.from(itemsByZone.values()).reduce((n, arr) => n + arr.length, 0) : 0;
  const totalCount = items.length + assignedCount;
  const { setNodeRef: bufRef, isOver: bufOver } = useDroppable({ id: "s-buffer" });
  return createPortal(
    /* bottom 让开底部的模式悬浮岛（岛是 bottom:16 锚定、z-index 只有 3，抽屉一盖上去那颗按钮就点不到了，
       而抽屉一开又必须能切模式）。84 = 岛高 ~56 + 下边距 16 + 余量 */
    <div style={{ position: "fixed", top: 72, right: 0, bottom: 84, zIndex: 60 }} className="flex w-[420px] flex-col rounded-l-student-lg border border-r-0 border-[var(--app-color-border-default)] bg-[var(--student-canvas)] shadow-2xl">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--app-color-border-default)] px-4 py-3">
        <span className="text-[12px] font-semibold text-[var(--app-color-text-primary)]">{title}</span>
        <span className="text-[11px] text-[var(--app-color-text-tertiary)]">{totalCount} 个笼位</span>
        <button type="button" onClick={onClose} className="ml-auto text-[var(--app-color-text-tertiary)]" title="关闭">
          <X className="h-4 w-4" />
        </button>
      </header>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
        {/* 左右两栏：左=缓冲区，右=人员区域（划分模式才有） */}
        <div className="flex min-h-0 flex-1">
          <div
            ref={bufRef}
            className={`flex min-h-0 flex-1 flex-col border-2 border-dashed p-2 ${bufOver ? "border-[var(--app-color-accent-hover)]" : "border-transparent"}`}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--app-color-text-primary)]">缓冲区</span>
              <button type="button" onClick={onToggleAll} disabled={items.length === 0} className="flex items-center gap-1 text-[10px] text-[var(--app-color-text-tertiary)] disabled:opacity-40">
                <ListChecks className="h-3 w-3" />{selected.size > 0 && selected.size === items.length ? "取消全选" : "全选"}
              </button>
            </div>
            {/* 折行排布：磁贴宽 60px 出头，缓冲栏宽就一行三四个 */}
            <div className="flex min-h-0 flex-1 flex-wrap content-start items-start gap-1 overflow-y-auto">
              {items.map((it) => (
                <ChipTile key={it.cageId} item={it} selected={selected.has(it.cageId)} onToggle={onToggle} onRemove={onRemove} cell={cellOf?.(it)} shelfName={shelfNameOf?.(it)} />
              ))}
              {items.length === 0 && <div className="px-1 py-1 text-[10px] text-[var(--app-color-text-tertiary)]">点网格里的笼位加入</div>}
            </div>
          </div>
          {zones && (
            <div className="flex w-[190px] shrink-0 flex-col border-l border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)]">
              {zonesHeader}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {zones.map((z) => (
                  <Zone key={z.key} zone={z} items={itemsByZone?.get(z.key) ?? []} selectedCount={selected.size} onAssignSelected={onAssignSelected} onUnassignAll={onUnassignAll} cellOf={cellOf} shelfNameOf={shelfNameOf} />
                ))}
                {/* 空栏要给个说法，否则只有一条搜索框，看不出下一步做什么 */}
                {zones.length === 0 && (
                  <div className="rounded-student-md border border-dashed border-[var(--app-color-border-default)] px-2 py-3 text-center text-[10px] leading-snug text-[var(--app-color-text-tertiary)]">
                    还没有人员区域<br />用上面的搜索框选一个人，然后把笼位拖到他身上
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {/*
          拖拽浮层自己 portal 到 body、层级给到 1000：
          抽屉本身就是 createPortal(…, body) 的固定浮层，浮层若留在抽屉节点里，
          会被抽屉自己的层叠上下文框住（拖起来看着像钻到抽屉/网格后面）。
        */}
        {createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: "none" }}>
            <DragOverlay>
              {dragItem ? (
                /* 浮层只跟一枚方格走，外面不垫白底卡片；给点阴影是为了看着「被拎起来了」 */
                <div className="w-fit cursor-grabbing drop-shadow-2xl">
                  {dragPreview ?? <div className="rounded-student-md border-2 border-[var(--app-color-accent-hover)] bg-[var(--student-canvas)] px-2 py-1 text-[11px] font-semibold text-[var(--app-color-text-primary)]">{dragItem.label}</div>}
                </div>
              ) : null}
            </DragOverlay>
          </div>,
          document.body,
        )}
      </DndContext>
      <footer className="shrink-0 border-t border-[var(--app-color-border-default)] px-4 py-3">
        {localErr && <div className="mb-1.5 text-[10px] text-red-500">{localErr}</div>}
        <button type="button" onClick={guardedSubmit} disabled={submitting || totalCount === 0} className="w-full rounded-student-md bg-[var(--app-color-accent-hover)] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">
          {submitting ? "提交中…" : `提交（${totalCount}）`}
        </button>
      </footer>
    </div>,
    document.body,
  );
}
