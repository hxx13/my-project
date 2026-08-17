/**
 * InventoryVisualView — 物品台账 · 图形视图（三栏可视化）
 *
 * 三栏：左「地点树」 + 中「平面图」 + 右「房间详情」。
 * 固定高度 flex 布局，三栏各自独立滚动。
 *
 * 数据流：
 *   fetchSpaceTree() → SpaceNode[]（左树 / 中面包屑 / 右路径共用）
 *   fetchItems({ spaceId, size:500 }) → Item[]，按 item.spaceId 分组，
 *     落到中栏各子空间区块的 chip 与右栏各分区物品列表。
 */

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import {
  fetchItemLogs,
  fetchItems,
  fetchSpaceTree,
  type Item,
  type ItemLog,
} from "@/api/domains/inventory.api";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { Portal } from "@/components/Portal";
import SpaceTree from "./SpaceTree";
import FloorCanvas from "./FloorCanvas";
import RoomDetailPanel from "./RoomDetailPanel";
import ItemIcon from "./ItemIcon";
import ItemCreateDialog from "./ItemCreateDialog";
import { ancestorIds, buildPath, findNode, flattenNodes, formatDateTime, groupBySpace, logTypeLabel } from "./constants";

export default function InventoryVisualView(props: { onOpenItem?: (item: Item) => void }) {
  const { onOpenItem } = props;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSpaceId, setCreateSpaceId] = useState<number | null>(null);

  const { data: tree = [], isLoading: treeLoading, isError: treeError } = useQuery({
    queryKey: ["inventory", "spaces"],
    queryFn: fetchSpaceTree,
  });

  const { data: itemsData, isError: itemsError } = useQuery({
    queryKey: ["inventory", "items", "visual", selectedId],
    queryFn: () => fetchItems({ spaceId: selectedId ?? undefined, size: 1000 }),
    enabled: selectedId != null,
  });
  const items = useMemo(() => (itemsData?.list ?? []).filter((it) => it.status !== "RETIRED"), [itemsData]);
  const itemsBySpace = useMemo(() => groupBySpace(items), [items]);

  useEffect(() => {
    if (treeError) toast.error("加载空间树失败");
  }, [treeError]);
  useEffect(() => {
    if (itemsError) toast.error("加载物品失败");
  }, [itemsError]);

  // 首次加载：自动选中第一个有子节点的空间（否则第一个节点），并展开其祖先
  useEffect(() => {
    if (selectedId != null || tree.length === 0) return;
    const first = flattenNodes(tree).find((n) => n.children.length > 0) ?? tree[0];
    setSelectedId(first.id);
    setExpanded(new Set(ancestorIds(tree, first.id)));
  }, [tree, selectedId]);

  const node = useMemo(() => findNode(tree, selectedId), [tree, selectedId]);
  const path = useMemo(() => buildPath(tree, selectedId), [tree, selectedId]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const select = (id: number) => setSelectedId(id);

  // 检索命中物品 → 定位：把选中态设为该空间的父节点（使该空间作为区块出现在画布中），
  // 无父（根）则选中其自身；并沿树祖先展开，让它在左树可见。
  const locateItem = (spaceId: number) => {
    const target = findNode(tree, spaceId);
    if (!target) return;
    const sel = target.parentId ?? target.id;
    setSelectedId(sel);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of ancestorIds(tree, sel)) next.add(id);
      next.add(sel);
      return next;
    });
  };

  // 时间轴弹层：列出空间内物品，点击某物品拉取其留痕
  const [logItem, setLogItem] = useState<Item | null>(null);
  const [logs, setLogs] = useState<ItemLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const openTimeline = () => {
    setLogItem(null);
    setLogs([]);
    setTimelineOpen(true);
  };

  const loadLogs = async (it: Item) => {
    setLogItem(it);
    setLogsLoading(true);
    try {
      setLogs(await fetchItemLogs(it.id));
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const scan = () => {
    if (selectedId != null) navigate(toAdminRoutePath(`/admin/inventory/scan?spaceId=${selectedId}`));
  };

  return (
    <div
      className="flex h-full min-h-0 gap-3 overflow-auto"
      // 撑满父容器（页面已用 fillHeight + flex-1 提供高度）
    >
      {/* ════════ 左：地点树 ════════ */}
      <div className="flex w-[236px] shrink-0 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-sm">
        <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--twin-hairline)] px-3 py-2 text-[11px] font-medium text-[var(--twin-mute)]">
          <Search className="h-3 w-3 shrink-0" /> 地点
        </div>
        <div className="mx-3 mb-1 mt-2 flex shrink-0 items-center gap-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5">
          <Search className="h-3 w-3 shrink-0 text-[var(--twin-mute)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索空间…"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)]"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {treeLoading ? (
            <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">加载中…</div>
          ) : treeError ? (
            <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">空间树加载失败，请重试</div>
          ) : (
            <SpaceTree
              tree={tree}
              selectedId={selectedId}
              expanded={expanded}
              search={search}
              itemsBySpace={itemsBySpace}
              onToggle={toggle}
              onSelect={select}
              onCreateItem={(spaceId) => {
                setCreateSpaceId(spaceId);
                setCreateOpen(true);
              }}
              onOpenItem={onOpenItem}
            />
          )}
        </div>
      </div>

      {/* ════════ 中：平面图 ════════ */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-sm">
        <FloorCanvas node={node} path={path} items={items} selectedId={selectedId} onSelect={select} onNavigate={select} loadError={itemsError} onLocateItem={locateItem} onOpenItem={onOpenItem} />
      </div>

      {/* ════════ 右：房间详情 ════════ */}
      <div className="flex w-[272px] shrink-0 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-sm">
        <RoomDetailPanel node={node} path={path} items={items} onOpenTimeline={openTimeline} onScan={scan} loadError={itemsError} onOpenItem={onOpenItem} onCreateItem={() => { if (selectedId != null) { setCreateSpaceId(selectedId); setCreateOpen(true); } }} />
      </div>

      {/* ════════ 时间轴弹层 ════════ */}
      {timelineOpen && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setTimelineOpen(false)}>
            <div
              className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="truncate text-sm font-semibold text-[var(--twin-ink)]">时间轴 · {node?.name ?? "空间"}</h3>
                <button
                  type="button"
                  onClick={() => setTimelineOpen(false)}
                  className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-xs text-[var(--twin-body)]"
                >
                  关闭
                </button>
              </div>
              <p className="mb-2 text-[11px] text-[var(--twin-mute)]">点击物品查看留痕记录（MVP：列出该空间内物品）</p>
              <div className="min-h-0 flex-1 overflow-auto">
                {items.length === 0 && <div className="py-6 text-center text-[12px] text-[var(--twin-mute)]">该空间暂无物品</div>}
                {items.map((it) => (
                  <div key={it.id} className="mb-1.5 rounded-twin-md border border-[var(--twin-hairline)] px-2 py-1.5">
                    <button type="button" onClick={() => void loadLogs(it)} className="flex w-full items-center gap-1.5 text-left text-[12px] text-[var(--twin-ink)]">
                      <ItemIcon value={it.iconValue} />
                      <span className="min-w-0 flex-1 truncate">{it.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-[var(--twin-mute)]">{it.rfidCode ?? "—"}</span>
                    </button>
                    {logItem?.id === it.id && (
                      <div className="mt-1.5 space-y-1 border-t border-[var(--twin-hairline)] pt-1.5">
                        {logsLoading && <div className="text-[11px] text-[var(--twin-mute)]">加载中…</div>}
                        {!logsLoading && logs.length === 0 && <div className="text-[11px] text-[var(--twin-mute)]">暂无留痕</div>}
                        {!logsLoading &&
                          logs.map((lg) => (
                            <div key={lg.id} className="flex items-baseline gap-2 text-[11px]">
                              <span className="shrink-0 font-medium text-[var(--twin-link-deep)]">{logTypeLabel(lg.logType)}</span>
                              <span className="shrink-0 font-mono text-[10px] text-[var(--twin-mute)]">{formatDateTime(lg.createdAt)}</span>
                              <span className="truncate text-[var(--twin-body)]">{lg.remark ?? ""}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Portal>
      )}

      {createOpen && (
        <ItemCreateDialog
          defaultSpaceId={createSpaceId}
          onClose={() => setCreateOpen(false)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["inventory", "items"] });
            qc.invalidateQueries({ queryKey: ["inventory", "spaces"] });
          }}
        />
      )}
    </div>
  );
}
