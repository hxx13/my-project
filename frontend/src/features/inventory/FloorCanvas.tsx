/**
 * FloorCanvas — 物品台账「中：嵌套卡片」渲染
 *
 * 统一卡片结构：每个空间 = 一张卡片（标题栏 + 物品区 + 子空间区），叶子卡片无子空间区。
 * 下钻：点卡片「放大」为当前焦点，画布渲染该焦点 + 其子卡片；面包屑/返回回退。
 * 编辑模式（独立开关）：开启后物品 tile 可拖拽到别的卡片（转移），导航点击下钻锁定。
 * 检索：全局关键字检索物品，命中卡片高亮；点结果定位到所在空间。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Move, Search, X } from "lucide-react";
import { fetchItems, transferItem, type Item, type SpaceNode } from "@/api/domains/inventory.api";
import { categoryColor, groupBySpace, showQty, sumSubtreeItemCount } from "./constants";
import { cn } from "@/lib/utils";
import ItemIcon from "./ItemIcon";

const HIGHLIGHT_SHADOW = "0 0 0 2px rgba(245,158,11,0.5), 0 0 14px rgba(245,158,11,0.35)";

function HitBadge({ count }: { count: number }) {
  return (
    <span className="absolute right-1 top-1 z-10 rounded-full bg-[#f59e0b] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm">
      命中 {count}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────
   物品 tile（可拖拽，点击打开详情）
   ──────────────────────────────────────────────────────────── */
function ItemTile({ it, editMode, onOpenItem, onDragStart }: {
  it: Item;
  editMode: boolean;
  onOpenItem?: (it: Item) => void;
  onDragStart?: (e: DragEvent, it: Item) => void;
}) {
  return (
    <div
      draggable={editMode}
      onDragStart={(e) => onDragStart?.(e, it)}
      onClick={(e) => {
        e.stopPropagation();
        onOpenItem?.(it);
      }}
      title={editMode ? "拖到别的卡片以转移" : `${it.name} · ${it.categoryName ?? "未分类"}`}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-1.5 py-1 transition",
        editMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer hover:border-[var(--twin-link-deep)]"
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: categoryColor(it.categoryName) }} />
      <ItemIcon value={it.iconValue} className="text-[15px] leading-none" />
      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--twin-ink)]">{it.name}</span>
      {showQty(it) ? <span className="shrink-0 text-[9px] font-medium text-[var(--twin-mute)]">×{it.qty}</span> : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   物品大卡片（叶子房间内部展示，含封面缩略图）
   ──────────────────────────────────────────────────────────── */
function ItemCard({ it, editMode, onOpenItem, onDragStart }: {
  it: Item;
  editMode: boolean;
  onOpenItem?: (it: Item) => void;
  onDragStart?: (e: DragEvent, it: Item) => void;
}) {
  return (
    <div
      draggable={editMode}
      onDragStart={(e) => onDragStart?.(e, it)}
      onClick={(e) => {
        e.stopPropagation();
        onOpenItem?.(it);
      }}
      className={cn(
        "flex flex-col overflow-hidden rounded-twin-lg border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] shadow-sm transition",
        editMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer hover:border-[var(--twin-link-deep)]"
      )}
    >
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]">
        {it.coverUrl ? (
          <img src={it.coverUrl} alt={it.name} className="h-full w-full object-cover" />
        ) : (
          <ItemIcon value={it.iconValue} className="text-[40px] leading-none" />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 p-2.5">
        <span className="truncate text-[13px] font-semibold text-[var(--twin-ink)]">{it.name}</span>
        <span className="truncate text-[11px] text-[var(--twin-mute)]">
          {it.categoryName ?? "未分类"}{showQty(it) ? ` · ${it.qty}件` : ""}
        </span>
        <span className="truncate font-mono text-[10px] text-[var(--twin-mute)]">{it.rfidCode ?? "—"}</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   空间卡片（统一结构）
   ──────────────────────────────────────────────────────────── */
function SpaceCard({ node, chipsFor, highlightSpaceIds, highlightCounts, editMode, onSelect, onOpenItem, onDragStartItem, onDropItem, depth = 0 }: {
  node: SpaceNode;
  chipsFor: (spaceId: number) => Item[];
  highlightSpaceIds: Set<number>;
  highlightCounts: Map<number, number>;
  editMode: boolean;
  onSelect: (id: number) => void;
  onOpenItem?: (it: Item) => void;
  onDragStartItem?: (e: DragEvent, it: Item) => void;
  onDropItem?: (e: DragEvent, spaceId: number) => void;
  depth?: number;
}) {
  const items = chipsFor(node.id);
  const hasChildren = node.children.length > 0;
  const highlighted = highlightSpaceIds.has(node.id);
  const hitCount = highlightCounts.get(node.id) ?? 0;
  // 空中间层（无物品、只有子空间）→ 直接嵌套显示下一级子卡片，跳过一层下钻
  const isEmptyIntermediate = items.length === 0 && hasChildren && depth < 3;

  if (isEmptyIntermediate) {
    return (
      <div
        onDragOver={(e) => { if (editMode) e.preventDefault(); }}
        onDrop={(e) => { if (editMode) { e.preventDefault(); e.stopPropagation(); onDropItem?.(e, node.id); } }}
        className={cn("relative flex flex-col rounded-twin-lg border bg-[var(--twin-canvas)] p-3", highlighted ? "border-[#f59e0b]" : "border-[var(--twin-hairline-strong)]")}
        style={highlighted ? { boxShadow: HIGHLIGHT_SHADOW } : undefined}
      >
        {highlighted && <HitBadge count={hitCount} />}
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-1 shrink-0 rounded-full bg-[#a1a1a1]" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--twin-ink)]">{node.name}</span>
          <span className="shrink-0 text-[10px] text-[var(--twin-mute)]">{node.children.length} 个子空间</span>
        </div>
        <div className="mt-2 grid auto-rows-[minmax(140px,1fr)] grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {node.children.map((c) => (
            <SpaceCard
              key={c.id}
              node={c}
              chipsFor={chipsFor}
              highlightSpaceIds={highlightSpaceIds}
              highlightCounts={highlightCounts}
              editMode={editMode}
              onSelect={onSelect}
              onOpenItem={onOpenItem}
              onDragStartItem={onDragStartItem}
              onDropItem={onDropItem}
              depth={depth + 1}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (!editMode) onSelect(node.id);
      }}
      onDragOver={(e) => {
        if (editMode) e.preventDefault();
      }}
      onDrop={(e) => {
        if (editMode) {
          e.preventDefault();
          e.stopPropagation();
          onDropItem?.(e, node.id);
        }
      }}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-twin-lg border bg-[var(--twin-canvas)] p-3 text-left shadow-sm transition",
        editMode ? "cursor-default" : "cursor-pointer hover:border-[var(--twin-link-deep)]",
        highlighted ? "border-[#f59e0b]" : "border-[var(--twin-hairline-strong)]"
      )}
      style={highlighted ? { boxShadow: HIGHLIGHT_SHADOW } : undefined}
    >
      {highlighted && <HitBadge count={hitCount} />}
      {/* 标题栏 */}
      <div className="flex items-center gap-2">
        <span className="h-3.5 w-1 shrink-0 rounded-full" style={{ background: items.length > 0 ? categoryColor(items[0].categoryName) : "#a1a1a1" }} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--twin-ink)]">{node.name}</span>
        <span className="shrink-0 rounded-full bg-[var(--twin-canvas-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--twin-mute)]">{node.itemCount ?? 0} 件</span>
        {hasChildren && <span className="shrink-0 text-[10px] text-[var(--twin-link-deep)]">▸ 进入</span>}
      </div>
      {/* 物品区 */}
      {items.length > 0 && (
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5">
          {items.map((it) => (
            <ItemTile key={it.id} it={it} editMode={editMode} onOpenItem={onOpenItem} onDragStart={onDragStartItem} />
          ))}
        </div>
      )}
      {items.length === 0 && <div className="mt-2 text-[11px] text-[var(--twin-mute)]">暂无物品</div>}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────
   FloorCanvas 主组件
   ──────────────────────────────────────────────────────────── */
export default function FloorCanvas(props: {
  node: SpaceNode | null;
  path: Array<{ id: number; name: string }>;
  items: Item[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNavigate: (id: number) => void;
  loadError?: boolean;
  onLocateItem?: (spaceId: number) => void;
  onOpenItem?: (item: Item) => void;
}) {
  const { node, path, items, selectedId, onSelect, onNavigate, loadError, onLocateItem, onOpenItem } = props;
  const qc = useQueryClient();

  // 编辑模式（独立开关）
  const [editMode, setEditMode] = useState(false);
  // 拖拽落点后抑制紧随的 click，避免误触发卡片下钻
  const dropHandledRef = useRef(false);

  // 检索物品
  const [searchQuery, setSearchQuery] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [locateSpaceId, setLocateSpaceId] = useState<number | null>(null);

  useEffect(() => {
    setLocateSpaceId(null);
    const t = setTimeout(() => setSearchApplied(searchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const searchActive = searchApplied.length > 0;
  const { data: searchData, isFetching: searchLoading } = useQuery({
    queryKey: ["inventory", "items", "visual-search", searchApplied],
    queryFn: () => fetchItems({ keyword: searchApplied, size: 200 }),
    enabled: searchActive,
  });
  const searchItems = useMemo(() => searchData?.list ?? [], [searchData]);
  const matchBySpace = useMemo(() => groupBySpace(searchItems), [searchItems]);
  const highlightSpaceIds = useMemo(
    () => (locateSpaceId != null ? new Set([locateSpaceId]) : new Set(matchBySpace.keys())),
    [locateSpaceId, matchBySpace]
  );
  const highlightCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const [k, v] of matchBySpace) m.set(k, v.length);
    return m;
  }, [matchBySpace]);

  const children = node?.children ?? [];
  const bySpace = groupBySpace(items);
  const chipsFor = (spaceId: number): Item[] => bySpace.get(spaceId) ?? [];

  // 图例（当前视图实际出现的分类）
  const legendItems = useMemo(() => {
    const seen = new Map<string, string>();
    for (const it of items) {
      const name = it.categoryName;
      if (!name || seen.has(name)) continue;
      seen.set(name, categoryColor(name));
    }
    return [...seen.entries()].map(([name, color]) => ({ name, color }));
  }, [items]);

  // size 上限提示
  const subtreeTotal = useMemo(() => sumSubtreeItemCount(node ? [node] : []), [node]);
  const truncationHint = !loadError && node != null && subtreeTotal > items.length ? `共 ${subtreeTotal} 件，仅展示前 ${items.length} 件` : null;

  const locateItem = (it: Item) => {
    if (it.spaceId == null) return;
    setLocateSpaceId(it.spaceId);
    onLocateItem?.(it.spaceId);
  };

  const handleDragStartItem = (e: DragEvent, it: Item) => {
    e.dataTransfer.setData("text/plain", String(it.id));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDropItem = async (e: DragEvent, spaceId: number) => {
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    const itemId = Number(raw);
    if (!Number.isFinite(itemId) || itemId <= 0) return;
    dropHandledRef.current = true;
    setTimeout(() => { dropHandledRef.current = false; }, 150);
    try {
      await transferItem(itemId, { spaceId });
      toast.success("已转移");
      qc.invalidateQueries({ queryKey: ["inventory", "items"] });
      qc.invalidateQueries({ queryKey: ["inventory", "spaces"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "转移失败");
    }
  };

  const handleCardSelect = (id: number) => {
    if (dropHandledRef.current) return;
    onSelect(id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 头部：返回 + 面包屑 + 检索 + 编辑开关 + 图例 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--twin-hairline)] px-3 py-2">
        {path.length > 1 && (
          <button
            type="button"
            onClick={() => onNavigate(path[path.length - 2].id)}
            className="flex shrink-0 items-center gap-1 rounded-twin-sm border border-[var(--twin-hairline)] px-1.5 py-0.5 text-[11px] text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
          >
            <ArrowLeft className="h-3 w-3" /> 返回
          </button>
        )}
        <nav className="flex min-w-0 items-center gap-1 overflow-hidden">
          {path.length === 0 && <span className="text-[13px] font-semibold text-[var(--twin-ink)]">平面图</span>}
          {path.map((seg, i) => (
            <span key={seg.id} className="flex shrink-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-[var(--twin-mute)]" />}
              {i === path.length - 1 ? (
                <span className="truncate text-[13px] font-semibold text-[var(--twin-ink)]">{seg.name}</span>
              ) : (
                <button type="button" onClick={() => onNavigate(seg.id)} className="truncate text-[12px] text-[var(--twin-link-deep)] hover:underline">
                  {seg.name}
                </button>
              )}
            </span>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* 检索物品 */}
          <div className="relative flex shrink-0 items-center gap-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1">
            <Search className="h-3 w-3 shrink-0 text-[var(--twin-mute)]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="检索物品…"
              className="w-32 min-w-0 bg-transparent text-[11px] text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)]"
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(""); setSearchApplied(""); }} className="shrink-0 text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" aria-label="清除检索">
                <X className="h-3 w-3" />
              </button>
            )}
            {searchActive && (
              <div className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-3">
                <div className="flex items-center justify-between border-b border-[var(--twin-hairline)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--twin-mute)]">
                  检索结果 <span>{searchItems.length} 条</span>
                </div>
                <div className="max-h-64 overflow-auto">
                  {searchLoading && searchItems.length === 0 ? (
                    <div className="px-3 py-3 text-[11px] text-[var(--twin-mute)]">检索中…</div>
                  ) : searchItems.length === 0 ? (
                    <div className="px-3 py-3 text-[11px] text-[var(--twin-mute)]">无匹配物品</div>
                  ) : (
                    searchItems.map((it) => (
                      <button key={it.id} type="button" onClick={() => locateItem(it)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition hover:bg-[var(--twin-canvas-soft)]">
                        <ItemIcon value={it.iconValue} className="text-[14px] leading-none" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] text-[var(--twin-ink)]">{it.name}</span>
                          <span className="block truncate text-[10px] text-[var(--twin-mute)]">{it.rfidCode ?? "无码"} · {it.spacePath ?? "未分配空间"}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 编辑布局开关 */}
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-twin-sm border px-2 py-1 text-[11px] transition",
              editMode ? "border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]" : "border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
            )}
          >
            <Move className="h-3 w-3" /> {editMode ? "转移中" : "转移物品"}
          </button>

          <div className="hidden shrink-0 items-center gap-3 lg:flex">
            {legendItems.length > 0 ? (
              legendItems.map((l) => (
                <span key={l.name} className="flex items-center gap-1 text-[10px] text-[var(--twin-body)]">
                  <span className="h-2 w-2 rounded-sm" style={{ background: l.color }} />
                  {l.name}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-[var(--twin-mute)]">暂无分类</span>
            )}
          </div>
        </div>
      </div>

      {/* size 上限提示 */}
      {truncationHint && (
        <div className="shrink-0 border-b border-[var(--twin-hairline)] bg-[#f59e0b]/10 px-3 py-1 text-[11px] text-[#b45309]">{truncationHint}</div>
      )}

      {/* 画布主体 */}
      <div className="relative min-h-0 flex-1 overflow-auto" style={{ background: "radial-gradient(circle at 1px 1px, var(--twin-hairline) 1px, transparent 0)", backgroundSize: "22px 22px" }}>
        {!node ? (
          <div className="flex h-full items-center justify-center text-[12px] text-[var(--twin-mute)]">请在左侧选择一个空间</div>
        ) : loadError ? (
          <div className="flex h-full items-center justify-center text-[12px] text-[var(--twin-mute)]">物品加载失败，请重试</div>
        ) : (
          <div className="flex h-full min-h-[420px] flex-col">
            {/* 当前焦点：标题栏 */}
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--twin-hairline)] px-4 py-2.5">
              <span className="text-[13px] font-semibold text-[var(--twin-ink)]">{node.name}</span>
              <span className="rounded-full bg-[var(--twin-canvas-soft)] px-2 py-0.5 text-[11px] text-[var(--twin-mute)]">{node.itemCount ?? 0} 件</span>
              {editMode && <span className="ml-2 text-[10px] text-[#f59e0b]">拖拽物品到目标卡片以转移</span>}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {/* 本空间自身物品 */}
              {chipsFor(node.id).length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[11px] font-medium text-[var(--twin-mute)]">本空间物品</span>
                    <span className="text-[10px] text-[var(--twin-mute)]">{chipsFor(node.id).length} 件</span>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                    {chipsFor(node.id).map((it) => (
                      <ItemCard key={it.id} it={it} editMode={editMode} onOpenItem={onOpenItem} onDragStart={handleDragStartItem} />
                    ))}
                  </div>
                </div>
              )}

              {/* 子空间卡片 */}
              {children.length > 0 ? (
                <div className="grid auto-rows-[minmax(160px,1fr)] grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                  {children.map((c) => (
                    <SpaceCard
                      key={c.id}
                      node={c}
                      chipsFor={chipsFor}
                      highlightSpaceIds={highlightSpaceIds}
                      highlightCounts={highlightCounts}
                      editMode={editMode}
                      onSelect={handleCardSelect}
                      onOpenItem={onOpenItem}
                      onDragStartItem={handleDragStartItem}
                      onDropItem={handleDropItem}
                    />
                  ))}
                </div>
              ) : (
                chipsFor(node.id).length === 0 && <div className="py-10 text-center text-[12px] text-[var(--twin-mute)]">该空间暂无物品</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
