/**
 * AssetDetailDrawer — 资产详情抽屉（右侧滑出，对齐物品台账 ItemDetailDrawer）
 *
 * 内容三块（原 AssetVisualView 右栏逻辑原样迁入）：
 *   1. 资产详情：编码 / 名称 / 存放地点 / 使用人 / 状态 / 最近转移时间
 *   2. 地点小结：当前选中地点的直接资产数 + 按「资产类别」分布
 *   3. 转移记录：转移申请 + MOVE 留痕合并倒序，含「补建申请」弹窗、最高权限「删除留痕」、
 *      已补建条目合并显示 + 「由地点移动补建」标记
 *
 * 头部操作：编辑 / 移动 / 删除（对齐库存页 ItemDetailDrawer 的三按钮 + 弹层）
 */

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ArrowRightLeft, Pencil, Trash2, X } from "lucide-react";
import type { AssetColumnDef, AssetRow } from "@/api/domains/asset.api";
import type { AssetLocationNode } from "@/api/domains/assetLocation.api";
import {
  useAssetTransferHistory,
  useDeleteAssetTransferLog,
  useUpdateAsset,
  useDeleteAsset,
} from "@/api/hooks/useAsset";
import { useAssetLocationTree, useMoveAssetLocation } from "@/api/hooks/useAssetLocation";
import { appConfirm } from "@/lib/appDialog";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { Portal } from "@/components/Portal";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSearchSelect } from "@/components/admin/AdminSearchSelect";
import { cn } from "@/lib/utils";
import PromoteMoveLogDialog, { type PromoteMoveLogTarget } from "./PromoteMoveLogDialog";
import { findPath } from "./locationTreeUtils";

const USER_KEY = "col_使用人";
const LOCATION_KEY = "col_存放地点";

/** 可编辑动态列：与 AdminAssetRecordPage 的 editableColumns 同规则（排除固定列 / 转移列 / 型号列） */
function pickEditableColumns(columns: AssetColumnDef[]): AssetColumnDef[] {
  return columns.filter((c) => {
    const label = (c.columnLabel || "").trim();
    if (label === "资产编号" || label === "资产编码") return false;
    if (c.columnKey === "col_资产编号" || c.columnKey === "col_资产编码") return false;
    if (label === "申请转移时间" || label === "申请转移地点" || label === "申请人" || label === "申请备注") return false;
    if (label === "数量" || label === "单价" || label === "价值" || label === "记账日期" || label === "资产类别") return false;
    if (label === "是否锁定") return false;
    if (label.includes("规格型号") || label.includes("型号")) return false;
    return true;
  });
}

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
  /** 该申请由地点移动留痕补建而来 */
  promoted?: boolean;
};

export default function AssetDetailDrawer(props: {
  asset: AssetRow | null;
  /** 动态列定义（来自 useAssetList 的 columns），编辑弹层据此渲染字段 */
  columns?: AssetColumnDef[];
  /** 当前选中地点名，用于「地点小结」标题 */
  nodeName?: string | null;
  /** 当前地点直接资产数 */
  nodeTotal: number;
  /** 当前地点按资产类别的分布 */
  byCategory: Array<[string, number]>;
  onClose: () => void;
}) {
  const { asset, columns = [], nodeName, nodeTotal, byCategory, onClose } = props;

  const [promoteTarget, setPromoteTarget] = useState<PromoteMoveLogTarget | null>(null);
  const deleteLogMut = useDeleteAssetTransferLog();
  // 仅最高权限可删除地点移动留痕
  const canDeleteLog = hasMinRole(authStorage.getRole(), "SUPER_ADMIN");
  // 补建申请：STAFF 起（与资产写权限一致）
  const canPromote = hasMinRole(authStorage.getRole(), "STAFF");

  // ── 编辑 / 移动 / 删除 ──
  const updateMut = useUpdateAsset();
  const deleteMut = useDeleteAsset();
  const moveMut = useMoveAssetLocation();
  const { data: tree = [] } = useAssetLocationTree();
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [baseForm, setBaseForm] = useState({ assetName: "", status: "", note: "" });
  const [dynForm, setDynForm] = useState<Record<string, string>>({});
  const [moveLabel, setMoveLabel] = useState("");

  const editableCols = useMemo(() => pickEditableColumns(columns), [columns]);

  // 地点树全路径候选（label 即 "A / B / C"），移动弹层用
  const locationOptions = useMemo(() => {
    const out: { id: number; label: string }[] = [];
    const walk = (nodes: AssetLocationNode[], prefix: string) => {
      for (const n of nodes) {
        const label = prefix ? `${prefix} / ${n.name}` : n.name;
        out.push({ id: n.id, label });
        walk(n.children ?? [], label);
      }
    };
    walk(tree, "");
    return out;
  }, [tree]);
  const locationLabels = useMemo(() => locationOptions.map((o) => o.label), [locationOptions]);

  // 存放地点以节点路径为准（节点是结构真源，文本只是镜像，移动后不会滞后）
  const currentPath = useMemo(() => {
    if (!asset?.locationNodeId) return "";
    return findPath(tree, asset.locationNodeId).map((n) => n.name).join(" / ");
  }, [asset?.locationNodeId, tree]);

  // 转移记录：转移申请 + MOVE 留痕合并后按时间倒序
  // 已补建申请的 MOVE 留痕不再单独展示，改在对应申请上打标记
  const { data: history, isLoading: historyLoading } = useAssetTransferHistory(asset?.id);
  const historyItems = useMemo<HistoryItem[]>(() => {
    const out: HistoryItem[] = [];
    const moves = history?.moves ?? [];
    const linkedRequestIds = new Set(
      moves.map((m) => m.requestId).filter((id): id is string => !!id),
    );
    for (const r of history?.requests ?? []) {
      out.push({
        key: `r-${r.id}`,
        kind: "request",
        time: r.transferTime || r.createTime || "",
        from: r.fromLocation?.trim() || "—",
        to: r.transferLocation?.trim() || "—",
        status: r.status,
        who: r.applicantName,
        promoted: linkedRequestIds.has(r.id),
      });
    }
    for (const m of moves) {
      if (m.requestId) continue; // 已补建申请：不单独展示
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

  const handleDeleteMoveLog = async (logId: string) => {
    const ok = await appConfirm("确认删除这条地点移动留痕？删除后不可恢复。", {
      title: "删除留痕",
      danger: true,
    });
    if (!ok) return;
    deleteLogMut.mutate(logId);
  };

  const openEdit = () => {
    if (!asset) return;
    setBaseForm({
      assetName: asset.assetName ?? "",
      status: asset.status ?? "",
      note: asset.note ?? "",
    });
    const d: Record<string, string> = {};
    for (const c of editableCols) d[c.columnKey] = asset.dynamicValues?.[c.columnKey] ?? "";
    setDynForm(d);
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!asset) return;
    const assetName = baseForm.assetName.trim();
    if (!assetName) {
      toast.error("资产名称不能为空");
      return;
    }
    // 只提交真正改动的动态列：后端对「校区」列会把空值也落库，未改动的空列不提交可避免写入空行
    const dynamicValues: Record<string, string> = {};
    for (const c of editableCols) {
      const next = (dynForm[c.columnKey] ?? "").trim();
      const prev = (asset.dynamicValues?.[c.columnKey] ?? "").trim();
      if (next !== prev) dynamicValues[c.columnKey] = next;
    }
    try {
      await updateMut.mutateAsync({
        id: asset.id,
        payload: {
          assetName,
          status: baseForm.status.trim(),
          note: baseForm.note.trim(),
          dynamicValues,
        },
      });
      setEditOpen(false);
    } catch {
      // 已由 hook toast 透出
    }
  };

  const openMove = () => {
    if (!asset) return;
    const path = asset.locationNodeId == null ? [] : findPath(tree, asset.locationNodeId);
    setMoveLabel(path.map((n) => n.name).join(" / "));
    setMoveOpen(true);
  };

  const submitMove = async () => {
    if (!asset) return;
    const target = locationOptions.find((o) => o.label === moveLabel.trim());
    if (!target) {
      toast.error("请选择有效的地点");
      return;
    }
    try {
      await moveMut.mutateAsync({ assetId: asset.id, nodeId: target.id });
      setMoveOpen(false);
    } catch {
      // 已由 hook toast 透出
    }
  };

  const handleDelete = async () => {
    if (!asset) return;
    const ok = await appConfirm(
      `确认删除资产【${asset.assetCode} ${asset.assetName}】？删除后进入回收站。`,
      { danger: true }
    );
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(asset.id);
      onClose();
    } catch {
      // 已由 hook toast 透出
    }
  };

  if (!asset) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-[var(--twin-canvas)] shadow-twin-level-3">
          {/* 头部 */}
          <div className="flex items-start justify-between gap-3 border-b border-[var(--twin-hairline)] px-4 py-3">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold text-[var(--twin-ink)]">{asset.assetName}</h3>
              <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--twin-mute)]">{asset.assetCode}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <AdminButton
                type="button"
                tone="secondary"
                size="sm"
                onClick={openEdit}
                className="inline-flex items-center gap-1"
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </AdminButton>
              <AdminButton
                type="button"
                tone="secondary"
                size="sm"
                onClick={openMove}
                className="inline-flex items-center gap-1"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                移动
              </AdminButton>
              <AdminButton
                type="button"
                tone="destructive"
                size="sm"
                onClick={() => void handleDelete()}
                className="inline-flex items-center gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </AdminButton>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-twin-sm text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
            {/* 1. 资产详情 */}
            <dl className="space-y-1.5 text-[12px]">
              {[
                ["资产编码", asset.assetCode],
                ["资产名称", asset.assetName],
                ["存放地点", currentPath || asset.dynamicValues?.[LOCATION_KEY] || asset.location],
                ["使用人", asset.dynamicValues?.[USER_KEY]],
                ["状态", asset.status],
                ["最近转移时间", formatTime(asset.latestTransferTime)],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-[68px] shrink-0 text-[var(--twin-mute)]">{label}</dt>
                  <dd className="min-w-0 flex-1 break-words text-[var(--twin-ink)]">{value || "—"}</dd>
                </div>
              ))}
            </dl>

            {/* 2. 地点小结 */}
            <div className="mt-3 border-t border-[var(--twin-hairline)] pt-2.5">
              <div className="mb-1.5 flex items-baseline gap-1.5">
                <span className="text-[11.5px] font-semibold text-[var(--twin-ink)]">地点小结</span>
                <span className="text-[10.5px] text-[var(--twin-mute)]">
                  {nodeName ?? "未选择地点"} · 共 {nodeTotal} 条
                </span>
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

            {/* 3. 转移记录 */}
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
                        {it.kind === "move" && canPromote && it.logId && (
                          <button
                            type="button"
                            onClick={() =>
                              setPromoteTarget({
                                id: it.logId as string,
                                from: it.from,
                                to: it.to,
                                time: it.time,
                                who: it.who,
                              })
                            }
                            className="shrink-0 text-[10px] text-[var(--twin-link-deep)] hover:underline"
                          >
                            补建申请
                          </button>
                        )}
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
                        {it.promoted && <span>由地点移动补建</span>}
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
          </div>
        </div>
      </div>

      {/* 编辑弹层 */}
      {editOpen && (
        <Portal>
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">编辑资产</h3>
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-twin-sm text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="col-span-2 flex flex-col gap-1 text-xs text-[var(--twin-mute)]">
                    资产名称
                    <input
                      value={baseForm.assetName}
                      onChange={(e) => setBaseForm((p) => ({ ...p, assetName: e.target.value }))}
                      className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] outline-none focus-visible:border-[var(--twin-link-deep)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[var(--twin-mute)]">
                    状态
                    <input
                      value={baseForm.status}
                      onChange={(e) => setBaseForm((p) => ({ ...p, status: e.target.value }))}
                      className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] outline-none focus-visible:border-[var(--twin-link-deep)]"
                    />
                  </label>
                  <label className="col-span-2 flex flex-col gap-1 text-xs text-[var(--twin-mute)]">
                    标注
                    <textarea
                      rows={2}
                      value={baseForm.note}
                      onChange={(e) => setBaseForm((p) => ({ ...p, note: e.target.value }))}
                      className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] outline-none focus-visible:border-[var(--twin-link-deep)]"
                    />
                  </label>
                  {editableCols.map((c) => (
                    <label key={c.columnKey} className="flex flex-col gap-1 text-xs text-[var(--twin-mute)]">
                      {c.columnLabel}
                      <input
                        value={dynForm[c.columnKey] ?? ""}
                        onChange={(e) => setDynForm((p) => ({ ...p, [c.columnKey]: e.target.value }))}
                        className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] outline-none focus-visible:border-[var(--twin-link-deep)]"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-[var(--twin-hairline)] pt-3">
                <AdminButton type="button" tone="secondary" onClick={() => setEditOpen(false)}>
                  取消
                </AdminButton>
                <AdminButton type="button" loading={updateMut.isPending} onClick={() => void submitEdit()}>
                  保存
                </AdminButton>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* 移动弹层 */}
      {moveOpen && (
        <Portal>
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">移动资产</h3>
                <button
                  type="button"
                  onClick={() => setMoveOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-twin-sm text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-3 text-sm text-[var(--twin-body)]">
                将 <span className="font-medium text-[var(--twin-ink)]">{asset.assetName}</span> 移动到：
              </p>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-mute)]">
                目标地点
                <AdminSearchSelect
                  value={moveLabel}
                  onChange={setMoveLabel}
                  options={locationLabels}
                  placeholder="请选择地点"
                  className="w-full"
                />
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <AdminButton type="button" tone="secondary" onClick={() => setMoveOpen(false)}>
                  取消
                </AdminButton>
                <AdminButton
                  type="button"
                  loading={moveMut.isPending}
                  disabled={!moveLabel.trim()}
                  onClick={() => void submitMove()}
                >
                  确认移动
                </AdminButton>
              </div>
            </div>
          </div>
        </Portal>
      )}

      <PromoteMoveLogDialog
        open={promoteTarget !== null}
        target={promoteTarget}
        onClose={() => setPromoteTarget(null)}
      />
    </Portal>
  );
}
