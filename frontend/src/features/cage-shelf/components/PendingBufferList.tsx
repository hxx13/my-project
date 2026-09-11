import { useRef } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ListChecks, RotateCcw, X } from "lucide-react";
import type { CageShelfCell, CageBoxAction } from "@/api/domains/cageShelf.api";
import { SelectCheck } from "./SelectCheck";
import { CellButton } from "./CellButton";
import type { PendingItem } from "../pendingBatch";

/** 一个缓冲段：标题 + 说明 + 该段的条目 */
export interface BufferSection {
  key: string;
  title: string;
  hint?: string;
  items: PendingItem[];
}

/**
 * 只画那一枚笼位方格（60×60），不含下方的位置文字与改动角标。
 * 拖拽浮层用它 —— 要的是「方格跟着鼠标」，不是外面那层卡片的底色。
 */
export function BufferChipCell({
  item,
  cell,
  cache,
}: {
  item: PendingItem;
  cell?: CageShelfCell;
  cache?: { initialActions: Set<CageBoxAction>; currentActions: Set<CageBoxAction> };
}) {
  return (
    <div className="h-[60px] w-[60px] shrink-0 overflow-hidden">
      {cell ? (
        <div className="origin-top-left [transform:scale(0.73)] [&>button]:min-h-[82px] [&>button]:w-[70px]">
          <CellButton cell={cell} editCacheEntry={cache} />
        </div>
      ) : (
        <div className="grid h-[60px] w-[60px] place-items-center rounded-twin-md border border-dashed border-[var(--twin-hairline)] p-1 text-center text-[8px] leading-tight text-[var(--twin-mute)]">
          {item.label}
        </div>
      )}
    </div>
  );
}

/**
 * 缓冲/区域条目共用的「芯片主体」：真实笼位缩略图 + 下方一行位置文字 + 改动计数。
 * 左右两栏共用这一份，保证拖进区域后外观与缓冲区完全一致、不会再漂移。
 * 拖拽把手、复选框、移除按钮由调用方挂在外面。
 */
export function BufferChipBody({
  item,
  cell,
  shelfName,
  cache,
}: {
  item: PendingItem;
  cell?: CageShelfCell;
  shelfName?: string;
  /** 状态模式：该笼位的编辑缓存快照 —— 缩略图据此实时显示刚丢进去的状态色 */
  cache?: { initialActions: Set<CageBoxAction>; currentActions: Set<CageBoxAction> };
}) {
  const changed = (item.actions?.length ?? 0) + (item.removedActions?.length ?? 0);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <BufferChipCell item={item} cell={cell} cache={cache} />
      <div className="max-w-[60px] truncate text-[9px] text-[var(--twin-mute)]" title={shelfName || item.label}>
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
 * 宽度贴合内容，容器用 flex-wrap 排 —— 缓冲区宽就能一行放三四个，区域窄就两个，不写死列数。
 *
 * 左右两栏共用这一份（区域传 zoneKey，缓冲区不传），拖拽 id 与 payload 由它统一生成。
 */
export function BufferChipTile({
  item,
  cell,
  shelfName,
  cache,
  zoneKey,
  selected,
  onToggle,
  onRemove,
  onOpen,
  dragDisabled,
}: {
  item: PendingItem;
  cell?: CageShelfCell;
  shelfName?: string;
  cache?: { initialActions: Set<CageBoxAction>; currentActions: Set<CageBoxAction> };
  /** 传了表示这一枚在某个目标区域里（拖拽 id 要带区键，回拖时才知道从哪个区出来） */
  zoneKey?: string;
  /** 缓冲区才有的勾选/移除；区域里由区卡片自己的垃圾桶负责 */
  selected?: boolean;
  onToggle?: (cageId: string) => void;
  onRemove?: (cageId: string) => void;
  /** 点一下打开该笼位的编辑弹窗（状态模式用；拖拽有 4px 起步阈值，轻点不会误触） */
  onOpen?: (cageId: string) => void;
  /** 只禁拖不禁点：状态模式的「直接改」里，磁贴还能点开状态弹窗，但不许拖去色区 */
  dragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: zoneKey ? `zone-item:${zoneKey}:${item.cageId}` : `buffer-item:${item.cageId}`,
    data: {
      cageId: item.cageId,
      item,
      // preview 只给那一枚方格：跟着鼠标的是格子本身，不是外面这张卡的底
      preview: <BufferChipCell item={item} cell={cell} cache={cache} />,
      ...(zoneKey ? { fromZone: zoneKey } : {}),
    },
    disabled: !!dragDisabled,
  });
  /** 勾选框/移除按钮不吃拖拽：按下就地停住，不冒泡到整张磁贴的拖拽把手 */
  const stopDrag = (e: React.PointerEvent) => e.stopPropagation();
  /** 按下时记位置：拖拽收尾那一下浏览器还会补一个 click，靠位移把它和「真点击」分开 */
  const downRef = useRef<{ x: number; y: number } | null>(null);
  /*
    整张磁贴**点击 = 选中/取消**（两端、所有模式的缓冲磁贴统一这个口径）。
    这里是拖拽把手，所以必须挡住「拖拽收尾补发的 click」：按下→抬起位移 >3px 就不当点击，
    阈值与 dnd-kit 的 4px 起拖约束对齐，真拖过的一律不会误切选中。
    状态模式原来兼着「点一下开状态弹窗」，那条挪到**双击**，避免和选中抢同一个手势。
  */
  const moved = (e: React.MouseEvent) => {
    const d = downRef.current;
    return !!d && (Math.abs(e.clientX - d.x) > 3 || Math.abs(e.clientY - d.y) > 3);
  };
  const handleTileClick = (e: React.MouseEvent) => {
    if (moved(e)) return;
    if (onToggle) { onToggle(item.cageId); return; }
    // 没有选中语义的磁贴（区域/色区里的条目）才保留点击入口
    if (dragDisabled) onOpen?.(item.cageId);
  };
  const handleTileDblClick = () => { if (onToggle && onOpen) onOpen(item.cageId); };
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onPointerDownCapture={(e) => { downRef.current = { x: e.clientX, y: e.clientY }; }}
      onClick={onToggle || dragDisabled ? handleTileClick : undefined}
      onDoubleClick={onToggle && onOpen ? handleTileDblClick : undefined}
      title={onToggle && onOpen ? `${item.label} · 点击选中，双击继续编辑` : onToggle ? `${item.label} · 点击选中/取消` : item.label}
      className={`relative w-fit rounded-twin-md border bg-white p-0.5 ${
        dragDisabled ? "cursor-default" : "cursor-grab"
      } ${
        selected ? "border-[var(--twin-primary)] ring-1 ring-[var(--twin-primary)]" : "border-[var(--twin-hairline)]"
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
          className="absolute right-0.5 top-0.5 z-10 grid h-4 w-4 place-items-center rounded bg-white/85 text-[var(--twin-mute)] hover:text-red-500"
          title="移出缓冲"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {/*
        缩略图不参与命中：里面是真实的 CellButton（一个 <button>），
        放行指针事件会让它走自己的点击模式（弹详情/选中），拖拽也就断在这里。
      */}
      <div className="pointer-events-none">
        <BufferChipBody item={item} cell={cell} shelfName={shelfName} cache={cache} />
      </div>
    </div>
  );
}

/**
 * 抽屉左栏 —— 缓冲区。**只放未归属条目**：拖到右侧区域后就不在这里了（见 BufferTargetZones）。
 * 自己是落点：区内条目拖回来 = 清空归属。
 */
export default function PendingBufferList({
  sections,
  total,
  selected,
  onToggle,
  onToggleAll,
  onRemove,
  cellOf,
  shelfNameOf,
  cacheOf,
  onOpen,
  dragDisabled,
}: {
  sections: BufferSection[];
  /** 未归属条目总数（用于「全选」判断） */
  total: number;
  selected: Set<string>;
  onToggle: (cageId: string) => void;
  onToggleAll: () => void;
  onRemove: (cageId: string) => void;
  /** 该缓冲笼位对应的真实格子（用于渲染缩略图）；无则回退纯文本 */
  cellOf?: (item: PendingItem) => CageShelfCell | undefined;
  /** 该缓冲笼位所在笼架名（缩略图下方）；无则回退 label */
  shelfNameOf?: (item: PendingItem) => string | undefined;
  /** 状态模式：该条目的编辑缓存快照，喂给缩略图做实时配色 */
  cacheOf?: (item: PendingItem) => { initialActions: Set<CageBoxAction>; currentActions: Set<CageBoxAction> } | undefined;
  /** 点磁贴打开该笼位的编辑弹窗（状态模式用） */
  onOpen?: (cageId: string) => void;
  /** 只禁拖不禁点（状态模式「直接改」：磁贴还能点开弹窗，但不许拖去色区） */
  dragDisabled?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "buffer-zone" });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-0 flex-1 flex-col rounded-twin-lg border-2 border-dashed p-2 ${
        isOver ? "border-[var(--twin-primary)] bg-[var(--twin-primary)]/5" : "border-[var(--twin-hairline)]"
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--twin-ink)]">缓冲区 · {total} 个笼位</span>
        <button type="button" onClick={onToggleAll} disabled={total === 0}
          className="flex items-center gap-1 rounded-twin-md border border-[var(--twin-hairline)] px-2 py-0.5 text-[10px] font-semibold text-[var(--twin-primary)] hover:border-[var(--twin-primary)] hover:bg-[var(--twin-primary)]/5 disabled:opacity-40">
          <ListChecks className="h-3 w-3" />{selected.size > 0 && selected.size === total ? "取消全选" : "全选"}
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {sections.map((sec) => (
          <div key={sec.key}>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] text-[var(--twin-mute)]">
              {sec.key === "cancel" && <RotateCcw className="h-3 w-3" />}
              <span>{sec.title} · {sec.items.length}</span>
              {sec.hint && <span className="truncate">（{sec.hint}）</span>}
            </div>
            {/* 折行排布：磁贴宽 60px 出头，缓冲栏宽就一行放三四个 */}
            <div className="flex flex-wrap content-start items-start gap-1">
              {sec.items.map((it) => (
                <BufferChipTile key={it.cageId} item={it} selected={selected.has(it.cageId)}
                  onToggle={onToggle} onRemove={onRemove} onOpen={onOpen} dragDisabled={dragDisabled}
                  cell={cellOf?.(it)} shelfName={shelfNameOf?.(it)} cache={cacheOf?.(it)} />
              ))}
              {sec.items.length === 0 && <div className="px-1 py-1 text-[10px] text-[var(--twin-mute)]">—</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
