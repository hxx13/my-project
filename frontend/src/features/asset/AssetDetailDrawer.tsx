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
import { ArrowRightLeft, ImageIcon, Loader2, Pencil, Trash2, Upload, X } from "lucide-react";
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
import { AutoImage } from "@/components/ui/AutoImage";
import EmojiPicker from "@/components/ui/EmojiPicker";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { cn } from "@/lib/utils";
import PromoteMoveLogDialog, { type PromoteMoveLogTarget } from "./PromoteMoveLogDialog";
import CageOpDrawer from "@/components/cage/CageOpDrawer";
import { AssetLocationTreeSelect } from "@/components/admin/AssetLocationTreeSelect";
import {
  ASSET_STATUS_OPTIONS,
  assetStatusLabel,
  assetEditableFields,
  isLocationColumn,
} from "./assetEditableFields";
import { findPath } from "./locationTreeUtils";

const USER_KEY = "col_使用人";
const LOCATION_KEY = "col_存放地点";

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
  /** 当前选中地点名，用于「地点小结」标题；不传则不渲染地点小结（表格视图） */
  nodeName?: string | null;
  /** 当前地点直接资产数 */
  nodeTotal?: number;
  /** 当前地点按资产类别的分布 */
  byCategory?: Array<[string, number]>;
  onClose: () => void;
}) {
  const { asset, columns = [], nodeName, nodeTotal, byCategory, onClose } = props;

  const [promoteTarget, setPromoteTarget] = useState<PromoteMoveLogTarget | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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
  // 编辑弹层的图标 / 照片（随保存一起提交）
  const [editIcon, setEditIcon] = useState("");
  const [editPhotos, setEditPhotos] = useState<string[]>([]);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const editableCols = useMemo(() => assetEditableFields(columns).dynamic, [columns]);

  // 详细字段：dynamicValues 的全部非空项，label 取 columns.columnLabel（取不到退回 columnKey）
  const detailEntries = useMemo(() => {
    const labelOf = new Map(columns.map((c) => [c.columnKey, c.columnLabel || c.columnKey]));
    // 存放地点 / 使用人 已在「基本信息」里展示，这里不再重复
    const shown = new Set([LOCATION_KEY, USER_KEY]);
    return Object.entries(asset?.dynamicValues ?? {})
      .filter(([k, v]) => !shown.has(k) && String(v ?? "").trim())
      .map(([k, v]) => [labelOf.get(k) ?? k, String(v)] as const);
  }, [asset?.dynamicValues, columns]);

  const photos = useMemo(
    () => (asset?.photoUrls ?? []).filter((u): u is string => typeof u === "string" && u.trim().length > 0),
    [asset?.photoUrls]
  );

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
    setEditIcon(asset.icon ?? "");
    setEditPhotos(photos);
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!asset) return;
    const assetName = baseForm.assetName.trim();
    if (!assetName) {
      toast.error("资产名称不能为空");
      return;
    }
    // 只提交真正改动的动态列：未改动的空列不提交，可避免写入空行
    const dynamicValues: Record<string, string> = {};
    // 地点列同时写固定字段 location：后端据它回填 location_node_id（并同步 EAV 列）
    let locationText: string | undefined;
    for (const c of editableCols) {
      const next = (dynForm[c.columnKey] ?? "").trim();
      const prev = (asset.dynamicValues?.[c.columnKey] ?? "").trim();
      if (next !== prev) {
        dynamicValues[c.columnKey] = next;
        if (isLocationColumn(c)) locationText = next;
      }
    }
    try {
      await updateMut.mutateAsync({
        id: asset.id,
        payload: {
          assetName,
          status: baseForm.status.trim(),
          note: baseForm.note.trim(),
          dynamicValues,
          // 图标空值后端视为「不改」，故仅在非空时提交
          ...(editIcon ? { icon: editIcon } : {}),
          photoUrls: JSON.stringify(editPhotos),
          ...(locationText !== undefined ? { location: locationText } : {}),
        },
      });
      setEditOpen(false);
    } catch {
      // 已由 hook toast 透出
    }
  };

  const onUploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        const res = await uploadSingleImage(f);
        const url = res.publicUrl || res.url || "";
        if (url) urls.push(url);
      }
      if (urls.length) {
        setEditPhotos((prev) => [...prev, ...urls]);
        toast.success(`已上传 ${urls.length} 张照片`);
      } else {
        toast.error("上传失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
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
    <>
      <CageOpDrawer
        title={asset.assetName}
        hint={asset.assetCode}
        collapseLabel="资产详情"
        width={420}
        onClose={onClose}
        headerExtra={
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
          </div>
        }
      >

            {/* 1. 资产详情 */}
            <dl className="space-y-1.5 text-[12px]">
              {[
                ["资产编码", asset.assetCode],
                ["资产名称", asset.assetName],
                ["存放地点", currentPath || asset.dynamicValues?.[LOCATION_KEY] || asset.location],
                ["使用人", asset.dynamicValues?.[USER_KEY]],
                ["状态", assetStatusLabel(asset.status)],
                ["是否锁定", asset.locked === 1 ? "已锁定" : "未锁定"],
                ["最近转移时间", formatTime(asset.latestTransferTime)],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-[68px] shrink-0 text-[var(--twin-mute)]">{label}</dt>
                  <dd className="min-w-0 flex-1 break-words text-[var(--twin-ink)]">{value || "—"}</dd>
                </div>
              ))}
            </dl>

            {/* 2. 详细字段（全部非空动态值） */}
            {detailEntries.length > 0 && (
              <div className="mt-3 border-t border-[var(--twin-hairline)] pt-2.5">
                <div className="mb-1.5 text-[11.5px] font-semibold text-[var(--twin-ink)]">详细字段</div>
                <dl className="space-y-1.5 text-[12px]">
                  {detailEntries.map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                      <dt className="w-[68px] shrink-0 text-[var(--twin-mute)]">{label}</dt>
                      <dd className="min-w-0 flex-1 break-words text-[var(--twin-ink)]">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* 3. 资产照片 */}
            {photos.length > 0 && (
              <div className="mt-3 border-t border-[var(--twin-hairline)] pt-2.5">
                <div className="mb-1.5 text-[11.5px] font-semibold text-[var(--twin-ink)]">资产照片</div>
                <div className="flex flex-wrap gap-2">
                  {photos.map((u) => (
                    <button
                      key={u}
                      type="button"
                      className="aspect-[3/4] w-20 overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0"
                      onClick={() => setPreviewUrl(u)}
                    >
                      <AutoImage src={u} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 4. 地点小结（仅图形视图传入地点上下文时渲染） */}
            {byCategory !== undefined && (
              <div className="mt-3 border-t border-[var(--twin-hairline)] pt-2.5">
                <div className="mb-1.5 flex items-baseline gap-1.5">
                  <span className="text-[11.5px] font-semibold text-[var(--twin-ink)]">地点小结</span>
                  <span className="text-[10.5px] text-[var(--twin-mute)]">
                    {nodeName ?? "未选择地点"} · 共 {nodeTotal ?? 0} 条
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
            )}

            {/* 5. 转移记录 */}
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
                              ? "bg-[color-mix(in_srgb,var(--twin-link-deep)_10%,transparent)] text-[var(--twin-link-deep)]"
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
      </CageOpDrawer>

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
                  <div className="col-span-2 flex flex-col gap-1 text-xs text-[var(--twin-mute)]">
                    图标
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-2xl">
                        {editIcon || "📦"}
                      </div>
                      <AdminButton
                        type="button"
                        tone="secondary"
                        size="sm"
                        onClick={() => setIconPickerOpen(true)}
                        className="inline-flex items-center gap-1.5"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        更换图标
                      </AdminButton>
                    </div>
                  </div>
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
                    <select
                      value={baseForm.status}
                      onChange={(e) => setBaseForm((p) => ({ ...p, status: e.target.value }))}
                      className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] outline-none focus-visible:border-[var(--twin-link-deep)]"
                    >
                      {!ASSET_STATUS_OPTIONS.some((o) => o.value === baseForm.status) && baseForm.status ? (
                        <option value={baseForm.status}>{baseForm.status}（未收录）</option>
                      ) : null}
                      {ASSET_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
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
                  <div className="col-span-2 flex flex-col gap-1 text-xs text-[var(--twin-mute)]">
                    照片
                    <div className="flex flex-wrap items-center gap-2">
                      {editPhotos.map((u) => (
                        <div
                          key={u}
                          className="group relative h-16 w-16 overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]"
                        >
                          <AutoImage src={u} alt="" className="h-full w-full object-contain p-0.5" />
                          <button
                            type="button"
                            onClick={() => setEditPhotos((prev) => prev.filter((x) => x !== u))}
                            className="absolute right-0 top-0 inline-flex h-5 w-5 items-center justify-center bg-black/50 text-white opacity-0 transition group-hover:opacity-100"
                            aria-label="删除照片"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <label className="flex h-16 cursor-pointer items-center gap-1.5 rounded-twin-sm border border-dashed border-[var(--twin-hairline-strong)] px-3 text-[11px] text-[var(--twin-mute)] transition hover:border-[var(--twin-link-deep)] hover:text-[var(--twin-ink)]">
                        {uploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        上传照片
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            void onUploadPhotos(e.target.files);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  {editableCols.map((c) => (
                    <label key={c.columnKey} className="flex flex-col gap-1 text-xs text-[var(--twin-mute)]">
                      {c.columnLabel}
                      {isLocationColumn(c) ? (
                        <AssetLocationTreeSelect
                          value={dynForm[c.columnKey] ?? ""}
                          onChange={(path) => setDynForm((p) => ({ ...p, [c.columnKey]: path }))}
                          clearable
                        />
                      ) : (
                        <input
                          value={dynForm[c.columnKey] ?? ""}
                          onChange={(e) => setDynForm((p) => ({ ...p, [c.columnKey]: e.target.value }))}
                          className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] outline-none focus-visible:border-[var(--twin-link-deep)]"
                        />
                      )}
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

      {/* 图标选择弹层 */}
      {iconPickerOpen && (
        <EmojiPicker
          value={editIcon}
          onChange={setEditIcon}
          onClose={() => setIconPickerOpen(false)}
        />
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
                <AssetLocationTreeSelect
                  value={moveLabel}
                  onChange={(path) => setMoveLabel(path)}
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

      {/* 照片放大预览 */}
      {previewUrl && (
        <Portal>
          <button
            type="button"
            className="fixed inset-0 z-[80] flex cursor-default items-center justify-center border-0 bg-black/80 p-4"
            onClick={() => setPreviewUrl(null)}
            aria-label="关闭预览"
          >
            <AutoImage
              src={previewUrl}
              alt=""
              className="max-h-[90vh] max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </button>
        </Portal>
      )}
    </>
  );
}
