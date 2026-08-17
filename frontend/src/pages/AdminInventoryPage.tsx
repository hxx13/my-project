import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ScanLine, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  fetchCategoryTree,
  fetchItems,
  fetchSpaceTree,
  retireItem,
  transferItem,
  type CategoryNode,
  type Item,
  type SpaceNode,
} from "@/api/domains/inventory.api";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { Portal } from "@/components/Portal";
import InventoryVisualView from "@/features/inventory/InventoryVisualView";
import ItemDetailDrawer from "@/features/inventory/ItemDetailDrawer";
import ItemIcon from "@/features/inventory/ItemIcon";

const GRANULARITY_LABELS: Record<string, string> = { UNIT: "一物一码", BATCH: "一批一码" };
const STATUS_LABELS: Record<string, string> = { IN_USE: "在库", MISSING: "丢失待确认", RETIRED: "已废弃" };

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

export default function AdminInventoryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [view, setView] = useState<"table" | "graph">("graph");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [granularity, setGranularity] = useState("");
  const [status, setStatus] = useState("");
  const [trashMode, setTrashMode] = useState(false);
  const [hasCode, setHasCode] = useState("");
  const [page, setPage] = useState(1);
  const size = 20;

  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [transferTarget, setTransferTarget] = useState<Item | null>(null);
  const [transferSpaceId, setTransferSpaceId] = useState("");
  const [retireTarget, setRetireTarget] = useState<Item | null>(null);
  const [retireReason, setRetireReason] = useState("用尽");
  const [retireRemark, setRetireRemark] = useState("");


  // 关键字防抖 400ms
  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedKeyword(keyword.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [keyword]);

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

  const itemsQuery = useQuery({
    queryKey: ["inventory", "items", appliedKeyword, categoryId, spaceId, granularity, status, hasCode, page, size, trashMode],
    queryFn: () =>
      fetchItems({
        keyword: appliedKeyword || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        spaceId: spaceId ? Number(spaceId) : undefined,
        granularity: granularity || undefined,
        status: trashMode ? "RETIRED" : status || undefined,
        hasCode: hasCode === "" ? undefined : hasCode === "true",
        page,
        size,
      }),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (itemsQuery.isError) toast.error("加载物品列表失败");
  }, [itemsQuery.isError]);

  const rows = itemsQuery.data?.list ?? [];
  const total = itemsQuery.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));

  const invalidateItems = () => {
    qc.invalidateQueries({ queryKey: ["inventory", "items"] });
    qc.invalidateQueries({ queryKey: ["inventory", "spaces"] });
  };

  const resetFilters = () => {
    setKeyword("");
    setAppliedKeyword("");
    setCategoryId("");
    setSpaceId("");
    setGranularity("");
    setStatus("");
    setHasCode("");
    setPage(1);
  };

  const openTransfer = (item: Item) => {
    setTransferTarget(item);
    setTransferSpaceId("");
  };

  const submitTransfer = async () => {
    if (!transferTarget) return;
    const targetSpaceId = Number(transferSpaceId);
    if (!Number.isFinite(targetSpaceId) || targetSpaceId <= 0) {
      toast.error("请选择目标空间");
      return;
    }
    try {
      await transferItem(transferTarget.id, { spaceId: targetSpaceId });
      toast.success("调拨成功");
      setTransferTarget(null);
      invalidateItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "调拨失败");
    }
  };

  const openRetire = (item: Item) => {
    setRetireTarget(item);
    setRetireReason("用尽");
    setRetireRemark("");
  };

  const submitRetire = async () => {
    if (!retireTarget) return;
    try {
      await retireItem(retireTarget.id, { reason: retireReason, remark: retireRemark });
      toast.success("已废弃");
      setRetireTarget(null);
      invalidateItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "废弃失败");
    }
  };

  return (
    <AdminPageShell fillHeight>
      {/* 顶部紧凑工具栏：笼架页式分组，最大化主体内容 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--twin-hairline)] pb-2">
        <div className="flex items-center gap-0.5 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-0.5">
          <button type="button" onClick={() => setView("table")}
            className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${view === "table" ? "bg-[var(--twin-link-deep)] text-white shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
            表格
          </button>
          <button type="button" onClick={() => setView("graph")}
            className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${view === "graph" ? "bg-[var(--twin-link-deep)] text-white shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
            图形
          </button>
        </div>

        {view === "table" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-8 w-56 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 text-[11px] text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)]"
              placeholder="搜索名称 / RFID 码..."
            />
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
              className="h-8 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 text-[11px] text-[var(--twin-ink)]">
              <option value="">分类：全部</option>
              {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={spaceId} onChange={(e) => { setSpaceId(e.target.value); setPage(1); }}
              className="h-8 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 text-[11px] text-[var(--twin-ink)]">
              <option value="">空间：全部</option>
              {spaceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={granularity} onChange={(e) => { setGranularity(e.target.value); setPage(1); }}
              className="h-8 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 text-[11px] text-[var(--twin-ink)]">
              <option value="">粒度：全部</option>
              <option value="UNIT">一物一码</option>
              <option value="BATCH">一批一码</option>
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="h-8 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 text-[11px] text-[var(--twin-ink)]">
              <option value="">状态：全部</option>
              <option value="IN_USE">在库</option>
              <option value="MISSING">丢失待确认</option>
              <option value="RETIRED">已废弃</option>
            </select>
            <select value={hasCode} onChange={(e) => { setHasCode(e.target.value); setPage(1); }}
              className="h-8 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 text-[11px] text-[var(--twin-ink)]">
              <option value="">有无码：全部</option>
              <option value="true">有码</option>
              <option value="false">无码</option>
            </select>
            <button type="button" onClick={resetFilters}
              className="h-8 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 text-[11px] text-[var(--twin-mute)] hover:text-[var(--twin-ink)] transition">
              重置
            </button>
            <button type="button" onClick={() => setTrashMode((v) => !v)}
              className={`flex h-8 items-center gap-1 rounded-twin-md border px-2.5 text-[11px] transition ${trashMode ? "border-red-300 bg-red-50 text-red-600" : "border-[var(--twin-hairline)] text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
              <Trash2 className="h-3.5 w-3.5" /> 垃圾桶
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-0.5 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-0.5">
          <button type="button" onClick={() => navigate(toAdminRoutePath("/admin/inventory/scan"))}
            className="flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-[var(--twin-link-deep)] text-white shadow-sm">
            <ScanLine className="h-3.5 w-3.5" /> 开始盘点
          </button>
        </div>
      </div>

        {view === "table" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="min-h-0 flex-1 overflow-auto">
            <AdminTableShell
              loading={itemsQuery.isLoading}
              error={itemsQuery.isError ? (itemsQuery.error instanceof Error ? itemsQuery.error.message : "加载物品列表失败") : null}
              onRetry={() => itemsQuery.refetch()}
              empty={!itemsQuery.isLoading && !itemsQuery.isError && rows.length === 0}
              emptyMessage={trashMode ? "垃圾桶为空" : "暂无物品数据，请先新增物品。"}
            >
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-left text-xs text-[var(--app-color-text-secondary)]">
                    <th className="px-3 py-2 font-medium">物品</th>
                    <th className="px-3 py-2 font-medium">RFID 码</th>
                    <th className="px-3 py-2 font-medium">分类</th>
                    <th className="px-3 py-2 font-medium">粒度 / 数量</th>
                    <th className="px-3 py-2 font-medium">所在空间</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="px-3 py-2 font-medium">供应商</th>
                    <th className="px-3 py-2 font-medium">最后扫描时间</th>
                    <th className="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]">
                      <td className="px-3 py-2">
                        <ItemIcon value={r.iconValue} className="mr-2" />
                        <span className="text-[var(--app-color-text-primary)]">{r.name}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-[var(--app-color-text-secondary)]">{r.rfidCode ?? "—"}</td>
                      <td className="px-3 py-2">{r.categoryName ?? "—"}</td>
                      <td className="px-3 py-2">{granularityLabel(r.granularity)} × {r.qty ?? 0}</td>
                      <td className="px-3 py-2">{r.spacePath ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(r.status)}`}>
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2">{r.supplier ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-[var(--app-color-text-secondary)]">{fmtTime(r.lastScannedAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <AdminButton type="button" tone="secondary" size="sm" onClick={() => setDetailItem(r)}>
                            详情
                          </AdminButton>
                          <AdminButton type="button" tone="secondary" size="sm" onClick={() => openTransfer(r)}>
                            转移
                          </AdminButton>
                          <AdminButton type="button" tone="destructive" size="sm" onClick={() => openRetire(r)}>
                            废弃
                          </AdminButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableShell>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 text-sm text-[var(--app-color-text-secondary)]">
              <AdminButton type="button" tone="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                上一页
              </AdminButton>
              <span>第 {page} / {pages} 页，共 {total} 条</span>
              <AdminButton type="button" tone="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                下一页
              </AdminButton>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <InventoryVisualView onOpenItem={(item) => setDetailItem(item)} />
          </div>
        )}

      <ItemDetailDrawer item={detailItem} open={detailItem != null} onClose={() => setDetailItem(null)} onChanged={invalidateItems} />

      {transferTarget && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">调拨物品</h3>
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-sm text-[var(--twin-body)]" onClick={() => setTransferTarget(null)}>
                  关闭
                </button>
              </div>
              <p className="mb-3 text-sm text-[var(--twin-body)]">将「{transferTarget.name}」调拨到：</p>
              <select
                value={transferSpaceId}
                onChange={(e) => setTransferSpaceId(e.target.value)}
                className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
              >
                <option value="">请选择目标空间</option>
                {spaceOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]" onClick={() => setTransferTarget(null)}>
                  取消
                </button>
                <button className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]" onClick={() => void submitTransfer()}>
                  确认调拨
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {retireTarget && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">废弃物品</h3>
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-sm text-[var(--twin-body)]" onClick={() => setRetireTarget(null)}>
                  关闭
                </button>
              </div>
              <p className="mb-3 text-sm text-[var(--twin-body)]">废弃「{retireTarget.name}」</p>
              <div className="grid grid-cols-1 gap-3">
                <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                  原因
                  <select
                    value={retireReason}
                    onChange={(e) => setRetireReason(e.target.value)}
                    className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
                  >
                    <option value="用尽">用尽</option>
                    <option value="损坏">损坏</option>
                    <option value="过期">过期</option>
                    <option value="丢失">丢失</option>
                    <option value="其他">其他</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                  备注
                  <input
                    value={retireRemark}
                    onChange={(e) => setRetireRemark(e.target.value)}
                    className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
                    placeholder="可选"
                  />
                </label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]" onClick={() => setRetireTarget(null)}>
                  取消
                </button>
                <button className="rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-danger)] px-3 py-2 text-sm font-medium text-[var(--app-color-text-on-danger)]" onClick={() => void submitRetire()}>
                  确认废弃
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </AdminPageShell>
  );
}
