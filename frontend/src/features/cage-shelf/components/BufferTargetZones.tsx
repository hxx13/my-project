import { useDroppable } from "@dnd-kit/core";
import { ArrowDownToLine, Trash2 } from "lucide-react";
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
  cellOf,
  shelfNameOf,
  cacheOf,
  onOpen,
}: {
  zone: BufferZone;
  items: PendingItem[];
  selectedCount: number;
  onAssignSelected: (zoneKey: string) => void;
  onUnassignAll: (zoneKey: string) => void;
  cellOf?: (item: PendingItem) => CageShelfCell | undefined;
  shelfNameOf?: (item: PendingItem) => string | undefined;
  cacheOf?: (item: PendingItem) => EditCacheEntry | undefined;
  onOpen?: (cageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${zone.key}` });
  const color = zone.color || "var(--twin-primary)";
  const isCancel = zone.variant === "cancel";
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
        <span className="shrink-0 rounded-full bg-[var(--twin-canvas-soft)] px-1.5 text-[10px] font-semibold text-[var(--twin-mute)]">
          {items.length}
        </span>
      </div>
      <div className="mt-1.5 flex gap-1">
        <button type="button" onClick={() => onAssignSelected(zone.key)} disabled={selectedCount === 0}
          title={selectedCount === 0 ? "先勾选缓冲区里的笼位" : undefined}
          className={`flex flex-1 items-center justify-center gap-1 rounded-twin-md px-1.5 py-1 text-[10px] font-semibold disabled:opacity-40 ${
            isCancel ? "border text-[var(--twin-ink)]" : "text-white"
          }`}
          style={isCancel ? { borderColor: color, backgroundColor: "transparent" } : { backgroundColor: color }}>
          <ArrowDownToLine className="h-3 w-3" />{isCancel ? "撤销" : "放这里"}{selectedCount > 0 ? `（${selectedCount}）` : ""}
        </button>
        <button type="button" onClick={() => onUnassignAll(zone.key)} disabled={items.length === 0}
          className="rounded-twin-md border border-[var(--twin-hairline)] px-1.5 py-1 text-[10px] text-[var(--twin-mute)] hover:text-[var(--twin-ink)] disabled:opacity-40"
          title="区内笼位全部退回缓冲区">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {/* 折行排布：与缓冲区同一套磁贴，区域窄就一行两个 */}
      <div className="mt-1.5 flex flex-wrap gap-2">
        {items.map((it) => (
          <ZoneItem key={`${zone.key}:${it.cageId}`} item={it} zoneKey={zone.key}
            cell={cellOf?.(it)} shelfName={shelfNameOf?.(it)} cache={cacheOf?.(it)} onOpen={onOpen} />
        ))}
        {items.length === 0 && <div className="px-1 text-[10px] text-[var(--twin-mute)]">拖笼位到这里</div>}
      </div>
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
  onUnassignAll: (zoneKey: string) => void;
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
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div
        className={`min-h-0 flex-1 overflow-y-auto p-2 ${
          grid ? "grid grid-cols-2 content-start items-start gap-2" : "space-y-2"
        }`}
      >
        {zones.map((z) => (
          <ZoneCard key={z.key} zone={z} items={itemsByZone.get(z.key) ?? []}
            selectedCount={selectedCount} onAssignSelected={onAssignSelected} onUnassignAll={onUnassignAll}
            cellOf={cellOf} shelfNameOf={shelfNameOf} cacheOf={cacheOf} onOpen={onOpen} />
        ))}
        {zones.length === 0 && <div className="px-1 py-2 text-[10px] text-[var(--twin-mute)]">暂无可选目标</div>}
      </div>
    </div>
  );
}
