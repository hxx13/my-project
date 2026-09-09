/**
 * AssetVisualView — 资产记录 · 图形视图（三栏可视化）
 *
 * 三栏：左「地点树」 + 中「资产卡片网格」 + 右「资产详情 / 地点小结 / 转移记录」。
 * 固定高度 flex 布局，三栏各自独立滚动（min-h-0 overflow-auto）。
 *
 * 数据流：
 *   useAssetLocationTree() → AssetLocationNode[]（左树 / 中栏面包屑 / 右栏路径共用）
 *   选中节点 → useAssetList({ locationNodeId }) 按节点精确筛资产（与树徽标 totalCount 同口径）。
 *   选中卡片 → useAssetTransferHistory(assetId) 拉转移申请 + MOVE 留痕。
 */

import { useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import type { AssetLocationNode } from "@/api/domains/assetLocation.api";
import type { AssetRow } from "@/api/domains/asset.api";
import {
  useAssetLocationTree,
  useCreateAssetLocation,
  useUpdateAssetLocation,
  useDeleteAssetLocation,
  useMoveAssetLocation,
} from "@/api/hooks/useAssetLocation";
import { useAssetList, useAssetTransferHistory, useDeleteAssetTransferLog } from "@/api/hooks/useAsset";
import { appConfirm } from "@/lib/appDialog";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { cn } from "@/lib/utils";
import LocationTree from "./LocationTree";
import { findPath } from "./locationTreeUtils";

const CATEGORY_KEY = "col_资产类别";
const USER_KEY = "col_使用人";

const TRANSFER_STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "进行中",
  COMPLETED: "转移完毕",
  WITHDRAWN: "已撤回",
};

/** 归一化为可字典序比较的 "YYYY-MM-DD HH:mm:ss" */
function normTime(v?: string | null) {
  return v ? String(v).replace("T", " ").slice(0, 19) : "";
}

function formatTime(v?: string | null) {
  return v ? String(v).replace("T", " ").slice(0, 19) : "—";
}

type HistoryItem = {
  key: string;
  kind: "request" | "move";
  time: string;
  from: string;
  to: string;
  status?: string;
  who?: string;
  /** MOVE 留痕主键，用于删除 */
  logId?: string;
};

export default function AssetVisualView() {
  const { data: tree = [], isLoading: treeLoading, isError: treeError } = useAssetLocationTree();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [keyword, setKeyword] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<AssetRow | null>(null);

  const createMut = useCreateAssetLocation();
  const updateMut = useUpdateAssetLocation();
  const deleteMut = useDeleteAssetLocation();
  const moveMut = useMoveAssetLocation();
  const deleteLogMut = useDeleteAssetTransferLog();

  // 仅最高权限可删除地点移动留痕
  const canDeleteLog = hasMinRole(authStorage.getRole(), "SUPER_ADMIN");

  const handleDeleteMoveLog = async (logId: string) => {
    const ok = await appConfirm("确认删除这条地点移动留痕？删除后不可恢复。", {
      title: "删除留痕",
      danger: true,
    });
    if (!ok) return;
    deleteLogMut.mutate(logId);
  };

  // 首次加载：选中第一个节点并展开其祖先链
  useEffect(() => {
    if (selectedId != null || tree.length === 0) return;
    const first = tree[0];
    setSelectedId(first.id);
    setExpanded(new Set(findPath(tree, first.id).map((n) => n.id)));
  }, [tree, selectedId]);

  const path = useMemo(() => (selectedId == null ? [] : findPath(tree, selectedId)), [tree, selectedId]);
  const node: AssetLocationNode | null = path.length > 0 ? path[path.length - 1] : null;
  const pathText = useMemo(() => path.map((n) => n.name).join(" / "), [path]);

  const { data: assetData, isLoading: assetsLoading, isError: assetsError } = useAssetList(
    { page: 1, size: 200, locationNodeId: selectedId ?? undefined },
    selectedId != null
  );
  const rows = assetData?.rows ?? [];
  const assetTotal = assetData?.total ?? rows.length;

  // 换地点后清掉右栏选中的卡片
  useEffect(() => {
    setSelectedAsset(null);
  }, [selectedId]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = (r.dynamicValues?.[CATEGORY_KEY] ?? "").trim() || "未分类";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // 转移记录：转移申请 + MOVE 留痕合并后按时间倒序
  const { data: history, isLoading: historyLoading } = useAssetTransferHistory(selectedAsset?.id);
  const historyItems = useMemo<HistoryItem[]>(() => {
    const out: HistoryItem[] = [];
    for (const r of history?.requests ?? []) {
      out.push({
        key: `r-${r.id}`,
        kind: "request",
        time: r.transferTime || r.createTime || "",
        from: r.fromLocation?.trim() || "—",
        to: r.transferLocation?.trim() || "—",
        status: r.status,
        who: r.applicantName,
      });
    }
    for (const m of history?.moves ?? []) {
      const [from, to] = String(m.remark ?? "").split(" → ");
      out.push({
        key: `m-${m.id}`,
        kind: "move",
        time: m.createTime || "",
        from: from?.trim() || "—",
        to: to?.trim() || "—",
        who: m.operatorName || m.operatorId,
        logId: m.id,
      });
    }
    return out.sort((a, b) => normTime(b.time).localeCompare(normTime(a.time)));
  }, [history]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreateRoot = (name: string) => {
    createMut.mutate({ parentId: null, name });
  };

  const handleCreateChild = (parentId: number, name: string) => {
    createMut.mutate({ parentId, name });
  };

  const handleRename = (id: number, name: string) => {
    updateMut.mutate({ id, payload: { name } });
  };

  const handleMove = (id: number, parentId: number) => {
    updateMut.mutate({ id, payload: { parentId } });
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMut.mutateAsync(id);
    } catch {
      return; // 后端拒绝（非空节点）已由 hook toast 透出
    }
    if (selectedId === id) setSelectedId(null);
  };

  const handleDropAsset = async (assetId: string, nodeId: number) => {
    const target = findPath(tree, nodeId).at(-1);
    if (!target) return;
    const asset = rows.find((r) => r.id === assetId);
    const label = asset ? `${asset.assetCode} ${asset.assetName}` : assetId;
    const ok = await appConfirm(`把「${label}」移到「${target.name}」？`, { title: "移动资产" });
    if (!ok) return;
    try {
      await moveMut.mutateAsync({ assetId, nodeId });
    } catch {
      // 已由 hook toast 透出
    }
  };

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {/* ════════ 左：地点树 ════════ */}
      <div className="flex w-[236px] shrink-0 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-sm">
        <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--twin-hairline)] px-3 py-2 text-[11px] font-medium text-[var(--twin-mute)]">
          <Search className="h-3 w-3 shrink-0" /> 地点
        </div>
        <div className="mx-3 mb-1 mt-2 flex shrink-0 items-center gap-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5">
          <Search className="h-3 w-3 shrink-0 text-[var(--twin-mute)]" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索地点…"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)]"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {treeLoading ? (
            <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">加载中…</div>
          ) : treeError ? (
            <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">地点树加载失败，请重试</div>
          ) : (
            <LocationTree
              tree={tree}
              selectedId={selectedId}
              expanded={expanded}
              keyword={keyword}
              onSelect={setSelectedId}
              onToggle={toggle}
              onCreateRoot={handleCreateRoot}
              onCreateChild={handleCreateChild}
              onRename={handleRename}
              onMove={handleMove}
              onDelete={handleDelete}
              onDropAsset={handleDropAsset}
            />
          )}
        </div>
      </div>

      {/* ════════ 中：资产卡片 ════════ */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-sm">
        <div className="shrink-0 border-b border-[var(--twin-hairline)] px-3 py-2.5">
          <h3 className="truncate text-[14px] font-semibold text-[var(--twin-ink)]">
            {node?.name ?? "未选择地点"}
          </h3>
          <p className="mt-1 truncate text-[11px] text-[var(--twin-mute)]" title={pathText}>
            {pathText || "—"} · 共 {assetTotal} 条
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {!node ? (
            <div className="py-8 text-center text-[12px] text-[var(--twin-mute)]">请在左侧选择一个地点</div>
          ) : assetsLoading ? (
            <div className="py-8 text-center text-[12px] text-[var(--twin-mute)]">加载中…</div>
          ) : assetsError ? (
            <div className="py-8 text-center text-[12px] text-[var(--twin-mute)]">资产加载失败，请重试</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-[var(--twin-mute)]">该地点暂无资产</div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2">
              {rows.map((r) => {
                const active = selectedAsset?.id === r.id;
                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/asset-id", r.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => setSelectedAsset(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedAsset(r);
                      }
                    }}
                    title="拖到左侧地点可移动资产"
                    className={cn(
                      "flex cursor-grab flex-col gap-1 rounded-twin-md border bg-[var(--twin-canvas)] p-2.5 text-left transition active:cursor-grabbing",
                      active
                        ? "border-[var(--twin-link-deep)] ring-1 ring-[var(--twin-link-deep)]"
                        : "border-[var(--twin-hairline)] hover:border-[var(--twin-link-deep)]"
                    )}
                  >
                    <span className="truncate font-mono text-[11px] text-[var(--twin-mute)]">{r.assetCode}</span>
                    <span className="truncate text-[12.5px] font-medium text-[var(--twin-ink)]" title={r.assetName}>
                      {r.assetName}
                    </span>
                    <span className="truncate text-[10.5px] text-[var(--twin-mute)]">
                      使用人 {r.dynamicValues?.[USER_KEY] || "—"}
                    </span>
                    <span className="truncate text-[10.5px] text-[var(--twin-mute)]" title={r.location}>
                      存放地点 {r.location || "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ════════ 右：详情 / 小结 ════════ */}
      <div className="flex w-[272px] shrink-0 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-sm">
        <div className="shrink-0 border-b border-[var(--twin-hairline)] px-3 py-2.5">
          <h3 className="truncate text-[14px] font-semibold text-[var(--twin-ink)]">资产详情</h3>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-2.5">
          {selectedAsset ? (
            <dl className="space-y-1.5 text-[12px]">
              {[
                ["资产编码", selectedAsset.assetCode],
                ["资产名称", selectedAsset.assetName],
                ["存放地点", selectedAsset.location],
                ["使用人", selectedAsset.dynamicValues?.[USER_KEY]],
                ["状态", selectedAsset.status],
                ["最近转移时间", formatTime(selectedAsset.latestTransferTime)],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-[68px] shrink-0 text-[var(--twin-mute)]">{label}</dt>
                  <dd className="min-w-0 flex-1 break-words text-[var(--twin-ink)]">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="py-6 text-center text-[12px] text-[var(--twin-mute)]">点击中间卡片查看详情</div>
          )}

          {node && (
            <div className="mt-3 border-t border-[var(--twin-hairline)] pt-2.5">
              <div className="mb-1.5 flex items-baseline gap-1.5">
                <span className="text-[11.5px] font-semibold text-[var(--twin-ink)]">地点小结</span>
                <span className="text-[10.5px] text-[var(--twin-mute)]">共 {assetTotal} 条</span>
              </div>
              {byCategory.length === 0 ? (
                <div className="text-[11px] text-[var(--twin-mute)]">暂无数据</div>
              ) : (
                <ul className="space-y-1">
                  {byCategory.map(([name, count]) => (
                    <li key={name} className="flex items-center gap-2 text-[11.5px]">
                      <span className="min-w-0 flex-1 truncate text-[var(--twin-body)]" title={name}>
                        {name}
                      </span>
                      <span className="shrink-0 text-[var(--twin-mute)]">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {selectedAsset && (
            <div className="mt-3 border-t border-[var(--twin-hairline)] pt-2.5">
              <div className="mb-1.5 text-[11.5px] font-semibold text-[var(--twin-ink)]">转移记录</div>
              {historyLoading ? (
                <div className="text-[11px] text-[var(--twin-mute)]">加载中…</div>
              ) : historyItems.length === 0 ? (
                <div className="text-[11px] text-[var(--twin-mute)]">暂无转移记录</div>
              ) : (
                <ul className="space-y-1.5">
                  {historyItems.map((it) => (
                    <li key={it.key} className="rounded-twin-sm bg-[var(--twin-canvas-soft)] px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 text-[10px] leading-4",
                            it.kind === "request"
                              ? "bg-[var(--twin-link-deep)]/10 text-[var(--twin-link-deep)]"
                              : "bg-[var(--twin-canvas)] text-[var(--twin-mute)]"
                          )}
                        >
                          {it.kind === "request" ? "申请转移" : "地点移动"}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--twin-mute)]">
                          {normTime(it.time).slice(0, 16) || "—"}
                        </span>
                        {it.kind === "move" && canDeleteLog && it.logId && (
                          <button
                            type="button"
                            title="删除留痕"
                            aria-label="删除留痕"
                            onClick={() => handleDeleteMoveLog(it.logId as string)}
                            className="shrink-0 text-[var(--twin-mute)] hover:text-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="mt-1 break-words text-[11.5px] text-[var(--twin-body)]">
                        {it.from} → {it.to}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-[var(--twin-mute)]">
                        {it.kind === "request" && it.status && (
                          <span>{TRANSFER_STATUS_LABEL[it.status] ?? it.status}</span>
                        )}
                        {it.who && (
                          <span className="truncate">
                            {it.kind === "request" ? "申请人" : "操作人"} {it.who}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
