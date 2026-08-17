/**
 * RoomDetailPanel — 物品台账「右：房间详情」
 *
 * 显示选中空间名称 + 路径 + 件数 + 最近盘点时间。
 * 内部分区：选中空间的直接子空间作为分区标题，下列该分区内物品；
 * 无子空间时直接列出该空间自身物品。
 * 底部：时间轴（弹层） / 盘点本房间。
 */

import { useMemo, useState } from "react";
import { Clock, Plus, ScanLine, Settings } from "lucide-react";
import type { Item, SpaceNode } from "@/api/domains/inventory.api";
import { categoryColor, formatDate, groupBySpace, showQty, statusColor, statusLabel } from "./constants";
import ItemIcon from "./ItemIcon";
import SpaceEditDialog from "./SpaceEditDialog";

function ItemBadge({ it, onOpenItem }: { it: Item; onOpenItem?: (it: Item) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpenItem?.(it)}
      className="inline-flex items-center gap-1.5 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-left transition hover:border-[var(--twin-link-deep)]"
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(it.categoryName) }} title={it.categoryName ?? "未分类"} />
      <ItemIcon value={it.iconValue} className="text-[14px] leading-none" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="flex items-center gap-1">
          <b className="truncate text-[11px] font-medium text-[var(--twin-ink)]">{it.name}</b>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: statusColor(it.status) }} title={statusLabel(it.status)} />
        </span>
        <span className="truncate text-[9px] text-[var(--twin-mute)]">
          {it.categoryName ?? "未分类"}
          {showQty(it) ? ` · ${it.qty ?? 1}件` : ""}
          {it.rfidCode ? ` · ${it.rfidCode}` : ""}
        </span>
      </span>
    </button>
  );
}

export default function RoomDetailPanel(props: {
  node: SpaceNode | null;
  path: Array<{ id: number; name: string }>;
  items: Item[];
  onOpenTimeline: () => void;
  onScan: () => void;
  loadError?: boolean;
  onOpenItem?: (item: Item) => void;
  onCreateItem?: () => void;
}) {
  const { node, path, items, onOpenTimeline, onScan, loadError, onOpenItem, onCreateItem } = props;
  const [editOpen, setEditOpen] = useState(false);
  const children = node?.children ?? [];
  const bySpace = groupBySpace(items);
  const zoneItems = (spaceId: number): Item[] => bySpace.get(spaceId) ?? [];

  const lastScan = useMemo(() => {
    const times = items.map((i) => i.lastScannedAt).filter((v): v is string => Boolean(v)).sort();
    return times.length ? times[times.length - 1] : null;
  }, [items]);

  return (
    <div className="flex min-h-0 flex-col">
      {/* 头部 */}
      <div className="shrink-0 border-b border-[var(--twin-hairline)] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--twin-ink)]">{node?.name ?? "未选择"}</h3>
          {node && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-twin-sm border border-[var(--twin-hairline)] px-1.5 py-0.5 text-[11px] text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
            >
              <Settings className="h-3 w-3" /> 设置
            </button>
          )}
        </div>
        <p className="mt-1 truncate text-[11px] text-[var(--twin-mute)]">
          {path.map((s) => s.name).join(" / ") || "—"} · {children.length > 0 ? `本空间直接 ${node?.itemCount ?? 0} 件` : `共 ${node?.itemCount ?? 0} 件`} · 最后盘点 {formatDate(lastScan)}
        </p>
      </div>

      {/* 分区列表 */}
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2.5">
        {!node ? (
          <div className="py-6 text-center text-[12px] text-[var(--twin-mute)]">未选择空间</div>
        ) : loadError ? (
          <div className="py-6 text-center text-[12px] text-[var(--twin-mute)]">物品加载失败，请重试</div>
        ) : children.length === 0 ? (
          zoneItems(node.id).length === 0 ? (
            <div className="py-6 text-center text-[12px] text-[var(--twin-mute)]">该空间暂无物品</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">{zoneItems(node.id).map((it) => <ItemBadge key={it.id} it={it} onOpenItem={onOpenItem} />)}</div>
          )
        ) : (
          <>
            {/* 本空间自身直接物品（与子分区并列，头部件数即本空间直接计数） */}
            <div className="mb-2.5 overflow-hidden rounded-twin-md border border-[var(--twin-hairline)]">
              <div className="flex items-center gap-1.5 bg-[var(--twin-canvas-soft)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--twin-ink)]">
                <span className="truncate">本空间</span>
                <span className="ml-auto shrink-0 text-[10px] font-normal text-[var(--twin-mute)]">{node.itemCount ?? 0} 件</span>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2">
                {zoneItems(node.id).length ? zoneItems(node.id).map((it) => <ItemBadge key={it.id} it={it} onOpenItem={onOpenItem} />) : <span className="text-[10px] text-[var(--twin-mute)]">暂无物品</span>}
              </div>
            </div>
            {children.map((c) => {
              const its = zoneItems(c.id);
              return (
                <div key={c.id} className="mb-2.5 overflow-hidden rounded-twin-md border border-[var(--twin-hairline)]">
                  <div className="flex items-center gap-1.5 bg-[var(--twin-canvas-soft)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--twin-ink)]">
                    {c.icon && <span className="text-[12px] leading-none">{c.icon}</span>}
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] font-normal text-[var(--twin-mute)]">{c.itemCount ?? 0} 件</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-2">
                    {its.length ? its.map((it) => <ItemBadge key={it.id} it={it} onOpenItem={onOpenItem} />) : <span className="text-[10px] text-[var(--twin-mute)]">暂无物品</span>}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* 底部操作 */}
      <div className="flex shrink-0 gap-1.5 border-t border-[var(--twin-hairline)] p-2">
        <button
          type="button"
          onClick={onCreateItem}
          className="flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-twin-md bg-[var(--twin-link-deep)] px-1.5 py-1.5 text-[11px] font-medium text-white transition hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" /> 新增物品
        </button>
        <button
          type="button"
          onClick={onOpenTimeline}
          className="flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-1.5 text-[11px] text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
        >
          <Clock className="h-3.5 w-3.5 shrink-0" /> 时间轴
        </button>
        <button
          type="button"
          onClick={onScan}
          className="flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-1.5 text-[11px] text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
        >
          <ScanLine className="h-3.5 w-3.5 shrink-0" /> 盘点
        </button>
      </div>

      <SpaceEditDialog space={node} open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}
