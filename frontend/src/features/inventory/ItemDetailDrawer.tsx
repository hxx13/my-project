import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { X, Pencil, ArrowRightLeft, Trash2, RotateCcw, ImageIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchCategoryTree,
  fetchItemLogs,
  fetchSpaceTree,
  recoverItem,
  retireItem,
  transferItem,
  updateItem,
  type CategoryNode,
  type Item,
  type ItemLog,
  type SpaceNode,
} from "@/api/domains/inventory.api";
import { Portal } from "@/components/Portal";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { uploadSingleImage } from "@/api/domains/upload.api";
import IconPicker from "./IconPicker";
import { isUrl } from "./ItemIcon";
import { parseDetailImages } from "./constants";

const GRANULARITY_LABELS: Record<string, string> = { UNIT: "一物一码", BATCH: "一批一码" };
const STATUS_LABELS: Record<string, string> = { IN_USE: "在库", MISSING: "丢失待确认", RETIRED: "已废弃" };

const LOG_TYPE_LABELS: Record<string, string> = {
  CREATE: "入库/创建",
  UPDATE: "编辑",
  TRANSFER: "转移",
  SCAN_FOUND: "盘点在册",
  SCAN_NEW: "盘点新增",
  SCAN_MISSING: "盘点丢失",
  RETIRE: "废弃",
};

const LOG_TYPE_STYLES: Record<string, string> = {
  CREATE: "border-slate-200 bg-slate-100 text-slate-600",
  UPDATE: "border-blue-200 bg-blue-50 text-blue-700",
  TRANSFER: "border-violet-200 bg-violet-50 text-violet-700",
  SCAN_FOUND: "border-emerald-200 bg-emerald-50 text-emerald-700",
  SCAN_NEW: "border-sky-200 bg-sky-50 text-sky-700",
  SCAN_MISSING: "border-amber-200 bg-amber-50 text-amber-700",
  RETIRE: "border-red-200 bg-red-50 text-red-700",
};

function granularityLabel(g: string | null): string {
  if (!g) return "—";
  return GRANULARITY_LABELS[g] ?? g;
}

function statusLabel(s: string | null): string {
  if (!s) return "—";
  return STATUS_LABELS[s] ?? s;
}

function statusBadgeClass(s: string | null): string {
  if (s === "IN_USE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s === "MISSING") return "border-amber-200 bg-amber-50 text-amber-700";
  if (s === "RETIRED") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function fmtTime(v: string | null): string {
  return v ? String(v).replace("T", " ").slice(0, 19) : "—";
}

function logTypeLabel(t: string): string {
  return LOG_TYPE_LABELS[t] ?? t;
}

function logTypeStyle(t: string): string {
  return LOG_TYPE_STYLES[t] ?? "border-slate-200 bg-slate-100 text-slate-600";
}

type TreeOption = { value: number; label: string };

function flattenSpaceTree(nodes: SpaceNode[], depth = 0): TreeOption[] {
  const out: TreeOption[] = [];
  for (const n of nodes) {
    out.push({ value: n.id, label: `${"　".repeat(depth)}${n.name}` });
    if (n.children?.length) out.push(...flattenSpaceTree(n.children, depth + 1));
  }
  return out;
}

function flattenCategoryTree(nodes: CategoryNode[], depth = 0): TreeOption[] {
  const out: TreeOption[] = [];
  for (const n of nodes) {
    out.push({ value: n.id, label: `${"　".repeat(depth)}${n.name}` });
    if (n.children?.length) out.push(...flattenCategoryTree(n.children, depth + 1));
  }
  return out;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="shrink-0 text-xs text-[var(--app-color-text-tertiary)]">{label}</span>
      <span className="min-w-0 break-all text-right text-sm text-[var(--app-color-text-primary)]">{children}</span>
    </div>
  );
}

export default function ItemDetailDrawer(props: {
  item: Item | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { item, open, onClose, onChanged } = props;

  const [editOpen, setEditOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  const [transferSpaceId, setTransferSpaceId] = useState("");
  const [retireReason, setRetireReason] = useState("");
  const [retireRemark, setRetireRemark] = useState("");
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editIconType, setEditIconType] = useState<string>("EMOJI");
  const [editIconValue, setEditIconValue] = useState<string>("");
  const [editCoverUrl, setEditCoverUrl] = useState<string>("");
  const [editDetailImages, setEditDetailImages] = useState<string[]>([]);

  const { data: spaceTree } = useQuery({
    queryKey: ["inventory", "spaces"],
    queryFn: fetchSpaceTree,
  });
  const { data: categoryTree } = useQuery({
    queryKey: ["inventory", "categories"],
    queryFn: fetchCategoryTree,
  });
  const spaceOptions = useMemo(() => flattenSpaceTree(spaceTree ?? []), [spaceTree]);
  const categoryOptions = useMemo(() => flattenCategoryTree(categoryTree ?? []), [categoryTree]);
  const spaceNameMap = useMemo(() => {
    const m = new Map<number, string>();
    const walk = (nodes: SpaceNode[]) => {
      for (const n of nodes) {
        m.set(n.id, n.name);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(spaceTree ?? []);
    return m;
  }, [spaceTree]);

  const { data: logs } = useQuery({
    queryKey: ["inventory", "item-logs", item?.id],
    queryFn: () => fetchItemLogs(item!.id),
    enabled: open && item != null,
  });

  if (!open || !item) return null;

  const openEdit = () => {
    setEditForm({
      name: item.name ?? "",
      categoryId: item.categoryId != null ? String(item.categoryId) : "",
      spaceId: item.spaceId != null ? String(item.spaceId) : "",
      granularity: item.granularity ?? "UNIT",
      qty: item.qty != null ? String(item.qty) : "",
      brand: item.brand ?? "",
      model: item.model ?? "",
      spec: item.spec ?? "",
      expireAt: item.expireAt ?? "",
      supplier: item.supplier ?? "",
      purchaseNo: item.purchaseNo ?? "",
      price: item.price != null ? String(item.price) : "",
    });
    setEditIconType(item.iconType ?? (isUrl(item.iconValue) ? "IMAGE" : "EMOJI"));
    setEditIconValue(item.iconValue ?? "");
    setEditCoverUrl(item.coverUrl ?? "");
    setEditDetailImages(parseDetailImages(item.detailImages));
    setEditOpen(true);
  };

  const submitEdit = async () => {
    const name = (editForm.name ?? "").trim();
    if (!name) {
      toast.error("名称不能为空");
      return;
    }
    const num = (k: string) => {
      const v = (editForm[k] ?? "").trim();
      if (!v) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const rawExpire = (editForm.expireAt ?? "").trim();
    const expireAt = rawExpire
      ? rawExpire.includes("T")
        ? rawExpire
        : `${rawExpire}T00:00:00`
      : undefined;
    setSaving(true);
    try {
      await updateItem(item.id, {
        name,
        categoryId: editForm.categoryId ? Number(editForm.categoryId) : null,
        spaceId: editForm.spaceId ? Number(editForm.spaceId) : null,
        granularity: editForm.granularity || undefined,
        qty: num("qty"),
        iconType: editIconValue ? editIconType : undefined,
        iconValue: editIconValue || undefined,
        brand: (editForm.brand ?? "").trim() || undefined,
        model: (editForm.model ?? "").trim() || undefined,
        spec: (editForm.spec ?? "").trim() || undefined,
        expireAt,
        supplier: (editForm.supplier ?? "").trim() || undefined,
        purchaseNo: (editForm.purchaseNo ?? "").trim() || undefined,
        price: num("price"),
        coverUrl: editCoverUrl || undefined,
        detailImages: editDetailImages.length > 0 ? JSON.stringify(editDetailImages) : undefined,
      });
      toast.success("已保存");
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const submitTransfer = async () => {
    if (!transferSpaceId) {
      toast.error("请选择目标空间");
      return;
    }
    setSaving(true);
    try {
      await transferItem(item.id, { spaceId: Number(transferSpaceId) });
      toast.success("调拨成功");
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "调拨失败");
    } finally {
      setSaving(false);
    }
  };

  const submitRetire = async () => {
    if (!retireReason.trim()) {
      toast.error("请填写废弃原因");
      return;
    }
    setSaving(true);
    try {
      await retireItem(item.id, { reason: retireReason.trim(), remark: retireRemark.trim() || undefined });
      toast.success("已废弃");
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "废弃失败");
    } finally {
      setSaving(false);
    }
  };

  const submitRecover = async () => {
    setSaving(true);
    try {
      await recoverItem(item.id);
      toast.success("已恢复");
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "恢复失败");
    } finally {
      setSaving(false);
    }
  };

  const uploadCover = async (file: File) => {
    try {
      const res = await uploadSingleImage(file);
      setEditCoverUrl(res.publicUrl || res.url || "");
      toast.success("封面已上传");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    }
  };

  const uploadDetail = async (file: File) => {
    try {
      const res = await uploadSingleImage(file);
      const url = res.publicUrl || res.url || "";
      if (url) setEditDetailImages((prev) => [...prev, url]);
      toast.success("详情图已上传");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    }
  };

  const renderIcon = () => {
    if (isUrl(item.iconValue)) {
      return (
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
          <img src={item.iconValue!} alt={item.name} className="h-full w-full object-cover" />
        </div>
      );
    }
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-4xl">
        {item.iconValue || "📦"}
      </div>
    );
  };

  const showRecover = item.status === "RETIRED";

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-twin-level-3">
          {/* 头部 */}
          <div className="flex items-start justify-between gap-3 border-b border-[var(--app-color-border-default)] px-5 py-4">
            <div className="flex items-center gap-3">
              {renderIcon()}
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-[var(--app-color-text-primary)]">{item.name}</h3>
                <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item.status)}`}>
                  {statusLabel(item.status)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--app-color-border-default)] px-5 py-3">
            <AdminButton type="button" tone="secondary" size="sm" onClick={openEdit} className="inline-flex items-center gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </AdminButton>
            <AdminButton type="button" tone="secondary" size="sm" onClick={() => setTransferOpen(true)} className="inline-flex items-center gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              转移
            </AdminButton>
            {showRecover ? (
              <AdminButton type="button" tone="secondary" size="sm" onClick={() => void submitRecover()} className="inline-flex items-center gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                恢复
              </AdminButton>
            ) : (
              <AdminButton type="button" tone="destructive" size="sm" onClick={() => setRetireOpen(true)} className="inline-flex items-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                废弃
              </AdminButton>
            )}
          </div>

          {/* 字段详情 */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="divide-y divide-[var(--app-color-border-default)]">
              <div>
                <Field label="RFID 码">{item.rfidCode ?? "—"}</Field>
                <Field label="分类">{item.categoryName ?? "—"}</Field>
                <Field label="粒度 / 数量">
                  {granularityLabel(item.granularity)} × {item.qty ?? 0}
                </Field>
                <Field label="所在空间">{item.spacePath ?? "—"}</Field>
                <Field label="品牌">{item.brand ?? "—"}</Field>
                <Field label="型号">{item.model ?? "—"}</Field>
                <Field label="规格">{item.spec ?? "—"}</Field>
                <Field label="有效期">{item.expireAt ? String(item.expireAt).slice(0, 10) : "—"}</Field>
                <Field label="供应商">{item.supplier ?? "—"}</Field>
                <Field label="采购单号">{item.purchaseNo ?? "—"}</Field>
                <Field label="单价">{item.price != null ? `¥${item.price}` : "—"}</Field>
                <Field label="最后扫描时间">{fmtTime(item.lastScannedAt)}</Field>
              </div>
            </div>

            {/* 留痕时间轴 */}
            <div className="mt-5">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--app-color-text-tertiary)]">留痕时间轴</h4>
              {!logs?.length ? (
                <div className="rounded-lg border border-dashed border-[var(--app-color-border-default)] py-6 text-center text-sm text-[var(--app-color-text-tertiary)]">
                  暂无留痕记录
                </div>
              ) : (
                <ol className="relative space-y-4 border-l border-[var(--app-color-border-default)] pl-4">
                  {logs.map((log: ItemLog) => {
                    const fromName = log.fromSpaceId != null ? spaceNameMap.get(log.fromSpaceId) : null;
                    const toName = log.toSpaceId != null ? spaceNameMap.get(log.toSpaceId) : null;
                    const hasSpace = log.fromSpaceId != null || log.toSpaceId != null;
                    return (
                      <li key={log.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--app-color-accent)]" />
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${logTypeStyle(log.logType)}`}>
                            {logTypeLabel(log.logType)}
                          </span>
                          <span className="text-xs text-[var(--app-color-text-tertiary)]">{fmtTime(log.createdAt)}</span>
                        </div>
                        {hasSpace && (
                          <div className="mt-1 text-xs text-[var(--app-color-text-secondary)]">
                            {fromName ?? "—"} <span className="text-[var(--app-color-text-tertiary)]">→</span> {toName ?? "—"}
                          </div>
                        )}
                        {log.remark && (
                          <div className="mt-1 text-xs text-[var(--app-color-text-secondary)]">{log.remark}</div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 编辑弹层 */}
      {editOpen && (
        <Portal>
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-twin-xl bg-white p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">编辑物品</h3>
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="col-span-2 flex flex-col gap-1 text-xs text-slate-600">
                    图标
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-2xl">
                        {isUrl(editIconValue) ? (
                          <img src={editIconValue} alt="图标" className="h-full w-full object-cover" />
                        ) : (
                          editIconValue || "📦"
                        )}
                      </div>
                      <AdminButton type="button" tone="secondary" size="sm" onClick={() => setIconPickerOpen(true)} className="inline-flex items-center gap-1.5">
                        <ImageIcon className="h-3.5 w-3.5" />
                        更换图标
                      </AdminButton>
                    </div>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    名称
                    <input
                      value={editForm.name ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:border-slate-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    分类
                    <select
                      value={editForm.categoryId ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, categoryId: e.target.value }))}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="">未分类</option>
                      {categoryOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    空间
                    <AdminSelect
                      value={editForm.spaceId ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, spaceId: e.target.value }))}
                      className="w-full"
                    >
                      <option value="">未分配</option>
                      {spaceOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </AdminSelect>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    粒度
                    <select
                      value={editForm.granularity ?? "UNIT"}
                      onChange={(e) => setEditForm((p) => ({ ...p, granularity: e.target.value }))}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="UNIT">一物一码</option>
                      <option value="BATCH">一批一码</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    数量
                    <input
                      type="number"
                      value={editForm.qty ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, qty: e.target.value }))}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    品牌
                    <input
                      value={editForm.brand ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, brand: e.target.value }))}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    型号
                    <input
                      value={editForm.model ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, model: e.target.value }))}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    规格
                    <input
                      value={editForm.spec ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, spec: e.target.value }))}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    有效期
                    <input
                      type="datetime-local"
                      value={editForm.expireAt ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, expireAt: e.target.value }))}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    供应商
                    <input
                      value={editForm.supplier ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, supplier: e.target.value }))}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    采购单号
                    <input
                      value={editForm.purchaseNo ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, purchaseNo: e.target.value }))}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    单价
                    <input
                      type="number"
                      value={editForm.price ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    封面图
                    <span className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400 hover:border-blue-400">
                      {editCoverUrl ? <img src={editCoverUrl} alt="" className="h-12 w-12 rounded object-cover" /> : "上传封面图"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCover(f); e.currentTarget.value = ""; }} />
                    </span>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    详情图（可多张）
                    <span className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400 hover:border-blue-400">
                      上传详情图
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { for (const f of Array.from(e.target.files ?? [])) void uploadDetail(f); e.currentTarget.value = ""; }} />
                    </span>
                    {editDetailImages.length > 0 && (
                      <span className="flex flex-wrap gap-1.5">
                        {editDetailImages.map((u, i) => <img key={i} src={u} alt="" className="h-10 w-10 rounded object-cover" />)}
                      </span>
                    )}
                  </label>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                <AdminButton type="button" tone="secondary" onClick={() => setEditOpen(false)}>取消</AdminButton>
                <AdminButton type="button" loading={saving} onClick={() => void submitEdit()}>保存</AdminButton>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* 图标选择弹层 */}
      {iconPickerOpen && (
        <IconPicker
          value={editIconValue}
          onChange={(v) => {
            setEditIconType(isUrl(v) ? "IMAGE" : "EMOJI");
            setEditIconValue(v);
          }}
          onClose={() => setIconPickerOpen(false)}
        />
      )}

      {/* 转移弹层 */}
      {transferOpen && (
        <Portal>
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-twin-xl bg-white p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">转移物品</h3>
                <button type="button" onClick={() => setTransferOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="关闭">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-3 text-sm text-slate-600">
                将 <span className="font-medium text-slate-900">{item.name}</span> 转移至目标空间
              </p>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                目标空间
                <AdminSelect value={transferSpaceId} onChange={(e) => setTransferSpaceId(e.target.value)} className="w-full">
                  <option value="">请选择</option>
                  {spaceOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </AdminSelect>
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <AdminButton type="button" tone="secondary" onClick={() => setTransferOpen(false)}>取消</AdminButton>
                <AdminButton type="button" loading={saving} disabled={!transferSpaceId} onClick={() => void submitTransfer()}>确认转移</AdminButton>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* 废弃弹层 */}
      {retireOpen && (
        <Portal>
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-twin-xl bg-white p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">废弃物品</h3>
                <button type="button" onClick={() => setRetireOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="关闭">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-3 text-sm text-slate-600">
                废弃 <span className="font-medium text-slate-900">{item.name}</span>
              </p>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                废弃原因
                <input
                  value={retireReason}
                  onChange={(e) => setRetireReason(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:border-slate-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25"
                  placeholder="必填"
                />
              </label>
              <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
                备注（可选）
                <textarea
                  value={retireRemark}
                  onChange={(e) => setRetireRemark(e.target.value)}
                  rows={2}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:border-slate-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25"
                />
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <AdminButton type="button" tone="secondary" onClick={() => setRetireOpen(false)}>取消</AdminButton>
                <AdminButton type="button" tone="destructive" loading={saving} disabled={!retireReason.trim()} onClick={() => void submitRetire()}>确认废弃</AdminButton>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </Portal>
  );
}
