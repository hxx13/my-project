import { useDroppable } from "@dnd-kit/core";
import { ArrowDownToLine, Trash2, X } from "lucide-react";
import type { CageShelfCell, CageBoxAction } from "@/api/domains/cageShelf.api";
import type { PendingItem } from "../pendingBatch";
import { BufferChipTile } from "./PendingBufferList";

/** 一个目标区域：AUP / 人员 / 状态色 */
export interface BufferZone {
  /** aupId、accountId 或状态区键（`add:ACTION` / `del:ACTION`） */
  key: string;
  title: string;
  subtitle?: string;
  color?: string;
  /**
   * add = 落到该区（分配/预定/标记状态）；cancel = 从该区撤销（撤销分配/取消状态色）。
   * 只影响观感：cancel 区画成虚线空心，和 add 区一眼能分开。
   */
  variant?: "add" | "cancel";
  /** true = 用户手动加的目标区（AUP / 人员），整张卡可以删掉；固定区（撤销分配、状态色区）不给删 */
  removable?: boolean;
  /**
   * 折叠在卡内的子区 —— 「需特殊饲养」下的四枚明细色区、「健康异常」下的严重程度色区走这条。
   * 子区用量少，平铺会把右栏撑到二十来张卡，所以默认收起，点卡内那一行才展开。
   */
  children?: BufferZone[];
  /** 展开那一行的名词（默认「明细」）——「健康异常」那张卡要显示「严重程度」，别跟着叫明细。 */
  childrenLabel?: string;
  /**
   * 卡右上角的一枚勾选框（如严重程度各档旁的「瘙痒」）。
   * 勾上 = 「本卡标题」+ 该 label（例：轻微 + 瘙痒）。语义由调用方定，色区只管画与回传。
   */
  extraCheck?: { checked: boolean; label: string; onChange: (next: boolean) => void };
  /**
   * 这张卡本身是不是落点（默认 true）。
   *
   * <p>false = 只作**分组标题**用：健康异常的父状态不该单独落（必须带一档严重程度），
   * 那张卡就不再接落、也不画「放这里 / 垃圾桶」两枚按钮，只有展开后的三个档位能落。
   * 卡本身还接落的话，落点又小又贴着隔壁卡，拖一次很容易落到「需特殊饲养」上去
   * （2026-09-18 用户报「拖细化经常被记成特殊饲养」）。
   */
  droppable?: boolean;
}

/** 状态模式：格子当前的编辑缓存快照（喂给缩略图做实时配色） */
export interface EditCacheEntry {
  initialActions: Set<CageBoxAction>;
  currentActions: Set<CageBoxAction>;
}

/** 已归属条目：与缓冲区同款磁贴，可拖回缓冲区或拖到别的区域 */
function ZoneItem({
  item,
  zoneKey,
  cell,
  shelfName,
  cache,
  onOpen,
}: {
  item: PendingItem;
  zoneKey: string;
  cell?: CageShelfCell;
  shelfName?: string;
  cache?: EditCacheEntry;
  onOpen?: (cageId: string) => void;
}) {
  return <BufferChipTile item={item} cell={cell} shelfName={shelfName} cache={cache} zoneKey={zoneKey} onOpen={onOpen} />;
}

function ZoneCard({
  zone,
  items,
  selectedCount,
  onAssignSelected,
  onUnassignAll,
  onRemoveZone,
  cellOf,
  shelfNameOf,
  cacheOf,
  onOpen,
  childrenSlot,
}: {
  zone: BufferZone;
  items: PendingItem[];
  selectedCount: number;
  onAssignSelected: (zoneKey: string) => void;
  onUnassignAll: (zoneKey: string) => void;
  /** 只给手动加的区（`zone.removable`）：删掉整张卡，区里笼位一并退回缓冲区 */
  onRemoveZone?: (zoneKey: string) => void;
  cellOf?: (item: PendingItem) => CageShelfCell | undefined;
  shelfNameOf?: (item: PendingItem) => string | undefined;
  cacheOf?: (item: PendingItem) => EditCacheEntry | undefined;
  onOpen?: (cageId: string) => void;
  /** 卡内折叠的子区（明细色区）；由容器递归渲染好传进来 */
  childrenSlot?: React.ReactNode;
}) {
  // droppable=false 的卡只作分组标题（见 BufferZone.droppable）：不接落，鼠标划过也不高亮
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${zone.key}`, disabled: zone.droppable === false });
  const color = zone.color || "var(--twin-primary)";
  const isCancel = zone.variant === "cancel";
  const droppable = zone.droppable !== false;
  return (
    <div
      ref={setNodeRef}
      className={`rounded-twin-lg border-2 p-2 transition ${
        isOver
          ? "border-[var(--twin-primary)] bg-[var(--twin-primary)]/5"
          : isCancel
            ? "border-dashed border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas-soft)]"
            : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)]"
      }`}
    >
      <div className="flex items-start gap-1.5">
        {/* 撤销区用空心色条：同为该状态色，一眼对上，又能和「落到该区」分开 */}
        <span
          className="mt-1 h-3 w-1 shrink-0 rounded-full"
          style={isCancel ? { border: `2px solid ${color}` } : { backgroundColor: color }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold text-[var(--twin-ink)]" title={zone.title}>{zone.title}</div>
          {zone.subtitle && <div className="truncate text-[10px] text-[var(--twin-mute)]" title={zone.subtitle}>{zone.subtitle}</div>}
        </div>
        {/* 右上角勾选框（如「瘙痒」）：pointerdown 必须停住 —— 卡片本身是拖放节点，
            不停的话点勾选框会被 dnd-kit 当成开始拖拽，卡里笼位跟着乱跑。 */}
        {zone.extraCheck && (
          <label
            onPointerDown={(e) => e.stopPropagation()}
            className="flex shrink-0 cursor-pointer items-center gap-0.5 text-[10px] font-semibold"
            style={{ color: zone.extraCheck.checked ? color : "var(--twin-mute)" }}
            title={`勾上 = 「${zone.title}」+ ${zone.extraCheck.label}`}
          >
            <input
              type="checkbox"
              className="h-3 w-3"
              style={{ accentColor: color }}
              checked={zone.extraCheck.checked}
              onChange={(e) => zone.extraCheck!.onChange(e.target.checked)}
            />
            {zone.extraCheck.label}
          </label>
        )}
        <span className="shrink-0 rounded-full bg-[var(--twin-canvas-soft)] px-1.5 text-[10px] font-semibold text-[var(--twin-mute)]">
          {items.length}
        </span>
      </div>
      {droppable && (
      <div className="mt-1.5 flex gap-1">
        <button type="button" onClick={() => onAssignSelected(zone.key)} disabled={selectedCount === 0}
          title={selectedCount === 0 ? "先勾选缓冲区里的笼位" : undefined}
          className={`flex flex-1 items-center justify-center gap-1 rounded-twin-md px-1.5 py-1 text-[10px] font-semibold disabled:opacity-40 ${
            isCancel ? "border text-[var(--twin-ink)]" : "text-white"
          }`}
          style={isCancel ? { borderColor: color, backgroundColor: "transparent" } : { backgroundColor: color }}>
          <ArrowDownToLine className="h-3 w-3" />{isCancel ? "撤销" : "放这里"}{selectedCount > 0 ? `（${selectedCount}）` : ""}
        </button>
        {/* 垃圾桶只管清空：区里笼位退回缓冲区，卡留着继续拖。
            删卡是另一枚按钮（只给手动加的区），两者别合成一个动作。 */}
        <button type="button" onClick={() => onUnassignAll(zone.key)} disabled={items.length === 0}
          className="rounded-twin-md border border-[var(--twin-hairline)] px-1.5 py-1 text-[10px] text-[var(--twin-mute)] hover:text-[var(--twin-ink)] disabled:opacity-40"
          title="清空该区笼位（退回缓冲区，区保留）">
          <Trash2 className="h-3 w-3" />
        </button>
        {zone.removable && onRemoveZone && (
          <button type="button" onClick={() => onRemoveZone(zone.key)}
            className="rounded-twin-md border border-[var(--twin-hairline)] px-1.5 py-1 text-[10px] text-[var(--twin-mute)] hover:border-red-300 hover:bg-red-50 hover:text-red-600"
            title="删除这个待选区（区里笼位退回缓冲区）">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      )}
      {/* 折行排布：与缓冲区同一套磁贴，区域窄就一行两个 */}
      <div className="mt-1.5 flex flex-wrap gap-2">
        {items.map((it) => (
          <ZoneItem key={`${zone.key}:${it.cageId}`} item={it} zoneKey={zone.key}
            cell={cellOf?.(it)} shelfName={shelfNameOf?.(it)} cache={cacheOf?.(it)} onOpen={onOpen} />
        ))}
        {items.length === 0 && <div className="px-1 text-[10px] text-[var(--twin-mute)]">拖笼位到这里</div>}
      </div>
      {childrenSlot}
    </div>
  );
}

/**
 * 抽屉右栏 —— 目标区域列表（分配=AUP，预定=人员）。
 * 每个区域是一个落点：拖进来的条目写入该区域对应的归属字段。
 */
export default function BufferTargetZones({
  zones,
  itemsByZone,
  selectedCount,
  onAssignSelected,
  onUnassignAll,
  onRemoveZone,
  header,
  cellOf,
  shelfNameOf,
  cacheOf,
  onOpen,
  grid = false,
}: {
  zones: BufferZone[];
  /** zone.key → 已归属条目（状态模式下同一笼位可出现在多个区） */
  itemsByZone: Map<string, PendingItem[]>;
  /** 当前勾选的缓冲条目数（「放这里」按钮的可用性） */
  selectedCount: number;
  onAssignSelected: (zoneKey: string) => void;
  /** 垃圾桶：清空该区（笼位退回缓冲区），区本身保留 */
  onUnassignAll: (zoneKey: string) => void;
  /** 删掉整张区卡（只对 `zone.removable` 的区显示）；与上面的「清空」是两回事，别合并 */
  onRemoveZone?: (zoneKey: string) => void;
  /** 区域列表上方的标题/操作区（如预定模式的「＋ 选择人员」） */
  header?: React.ReactNode;
  /** 区域条目对应的真实格子（用于渲染缩略图）；无则回退纯文本 */
  cellOf?: (item: PendingItem) => CageShelfCell | undefined;
  /** 区域条目所在笼架名（缩略图下方）；无则回退 label */
  shelfNameOf?: (item: PendingItem) => string | undefined;
  /** 状态模式：该条目的编辑缓存快照，喂给缩略图做实时配色 */
  cacheOf?: (item: PendingItem) => EditCacheEntry | undefined;
  /** 状态模式：点区域里的磁贴打开该笼位的编辑弹窗 */
  onOpen?: (cageId: string) => void;
  /** true=一行两个（状态模式 10 个区排成 2×5，比一列长条好扫） */
  grid?: boolean;
}) {
  /** 递归渲染：带 children 的区（需特殊饲养）把子区折叠在自己卡内，默认收起 */
  const renderZone = (z: BufferZone): React.ReactNode => (
    <ZoneCard
      key={z.key}
      zone={z}
      items={itemsByZone.get(z.key) ?? []}
      selectedCount={selectedCount}
      onAssignSelected={onAssignSelected}
      onUnassignAll={onUnassignAll}
      onRemoveZone={onRemoveZone}
      cellOf={cellOf}
      shelfNameOf={shelfNameOf}
      cacheOf={cacheOf}
      onOpen={onOpen}
      childrenSlot={
        z.children && z.children.length > 0 ? (
          <details className="mt-1.5 border-t border-dashed border-[var(--twin-hairline)] pt-1">
            <summary className="cursor-pointer list-none text-[10px] font-semibold text-[var(--twin-mute)] hover:text-[var(--twin-ink)]">
              {z.variant === "cancel" ? "撤销" : ""}{z.childrenLabel ?? "明细"} ▾
            </summary>
            <div className="mt-1.5 space-y-1.5">{z.children.map(renderZone)}</div>
          </details>
        ) : undefined
      }
    />
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div
        className={`min-h-0 flex-1 overflow-y-auto p-2 ${
          grid ? "grid grid-cols-2 content-start items-start gap-2" : "space-y-2"
        }`}
      >
        {zones.map(renderZone)}
        {zones.length === 0 && <div className="px-1 py-2 text-[10px] text-[var(--twin-mute)]">暂无可选目标</div>}
      </div>
    </div>
  );
}
