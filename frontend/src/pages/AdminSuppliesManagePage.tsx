/**
 * 物资管理页 — 布局对齐 animal-order-review：固定工具栏 + 左分类栏 + 商店式网格（区域内滚）。
 * 分类管理与物资增删改全部收进工具栏/弹窗，页面本身不滚动。
 */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { ZoomIn } from "lucide-react";
import {
  useAdminSupplyCategories,
  useAdminSupplyItems,
  useAdminSupplyRecycle,
  useCreateAdminSupplyCategory,
  useUpdateAdminSupplyCategory,
  useDeleteAdminSupplyCategory,
  useCreateAdminSupplyItem,
  useUpdateAdminSupplyItem,
  useDeleteAdminSupplyItem,
  useRestoreAdminSupplyRecycle,
  usePurgeAdminSupplyRecycle,
  usePurgeAllAdminSupplyRecycle,
  useInboundSupplyItem,
  useAdjustSupplyStock,
} from "@/api/hooks/useSupplies";
import type { SupplyCategory, SupplyItem } from "@/api/domains/supplies.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { webImageSrc } from "@/utils/mediaUrl";
import { formatSupplyStockAdminLabel } from "@/utils/supplyStockLabel";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import DataSkeleton from "@/components/ui/DataSkeleton";
import { adminInputClass } from "@/features/admin/adminFormUi";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { cn } from "@/lib/utils";

const SHELF_ZH: Record<string, string> = { ON_SHELF: "已上架", OFF_SHELF: "已下架" };

type SpecDimension = { name: string; options: string[] };

function parseSpec(specSchema?: string): { enabled: boolean; dims: SpecDimension[] } {
  if (!specSchema) return { enabled: false, dims: [] };
  try {
    const dims: SpecDimension[] = JSON.parse(specSchema).dimensions || [];
    return { enabled: dims.length > 0, dims };
  } catch {
    return { enabled: false, dims: [] };
  }
}

const buildSpecSchema = (enabled: boolean, dims: SpecDimension[]) => {
  if (!enabled) return undefined;
  const clean = dims.filter((d) => d.name.trim() && d.options.filter((o) => o.trim()).length >= 2);
  return clean.length > 0 ? JSON.stringify({ dimensions: clean }) : undefined;
};

export default function AdminSuppliesManagePage() {
  const [filterCat, setFilterCat] = useState<number | "">("");
  const [keyword, setKeyword] = useState("");
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [recyclePage, setRecyclePage] = useState(1);
  const [catDialog, setCatDialog] = useState<null | { cat?: SupplyCategory }>(null);
  const [itemDialog, setItemDialog] = useState<null | { item?: SupplyItem }>(null);
  const [stockDialog, setStockDialog] = useState<null | { item: SupplyItem; kind: "inbound" | "stock" }>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const { data: categories = [] } = useAdminSupplyCategories();
  // 一次取全量、前端过滤：分类计数与搜索都要跨分类，按分类取数会让计数失真
  const { data: items = [], isLoading: itemsLoading } = useAdminSupplyItems();
  const { data: recycleData, isLoading: recycleLoading } = useAdminSupplyRecycle({ page: recyclePage, size: 20 });
  const recycleRows = recycleData?.data ?? [];
  const recycleTotal = recycleData?.total ?? 0;

  const createCatMut = useCreateAdminSupplyCategory();
  const updateCatMut = useUpdateAdminSupplyCategory();
  const deleteCatMut = useDeleteAdminSupplyCategory();
  const createItemMut = useCreateAdminSupplyItem();
  const updateItemMut = useUpdateAdminSupplyItem();
  const deleteItemMut = useDeleteAdminSupplyItem();
  const restoreMut = useRestoreAdminSupplyRecycle();
  const purgeMut = usePurgeAdminSupplyRecycle();
  const purgeAllMut = usePurgeAllAdminSupplyRecycle();
  const inboundMut = useInboundSupplyItem();
  const adjustMut = useAdjustSupplyStock();

  const countByCat = useMemo(() => {
    const m = new Map<number, number>();
    for (const it of items) m.set(it.categoryId, (m.get(it.categoryId) ?? 0) + 1);
    return m;
  }, [items]);

  const filteredItems = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return items.filter((it) => {
      if (filterCat !== "" && it.categoryId !== filterCat) return false;
      if (!kw) return true;
      return [it.name, it.subtitle, String(it.id)]
        .some((v) => String(v || "").toLowerCase().includes(kw));
    });
  }, [items, filterCat, keyword]);

  const addCategory = async () => {
    const name = await appPrompt("新分类名称", "");
    if (!name?.trim()) return;
    createCatMut.mutate({ name: name.trim(), sortOrder: 0, status: 1 });
  };

  const removeCategory = async (c: SupplyCategory) => {
    if (!await appConfirm(`删除分类「${c.name}」？`)) return;
    deleteCatMut.mutate(c.id, {
      onSuccess: () => { if (filterCat === c.id) setFilterCat(""); },
    });
  };

  return (
    <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-0 flex-col gap-2">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] shadow-twin-level-2">

        {/* 工具栏 */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 bg-[var(--twin-canvas)] px-3 py-2">
          <div className="review-tabs shrink-0">
            {([["", "商品"], ["recycle", "回收站"]] as const).map(([k, v]) => (
              <button
                key={k}
                type="button"
                className="review-tab"
                data-active={k === "recycle" ? recycleOpen : !recycleOpen}
                onClick={() => {
                  const next = k === "recycle";
                  setRecycleOpen(next);
                  if (next) setRecyclePage(1);
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="mx-1 h-4 w-px shrink-0 bg-[var(--app-color-border-default)]" />
          <input
            className={cn(adminInputClass, "h-8 w-56 shrink-0 text-xs")}
            placeholder="搜索名称 / 副标题 / ID"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <div className="flex-1 min-w-0" />
          <span className="shrink-0 text-xs text-[var(--app-color-text-tertiary)]">共 {filteredItems.length} 件</span>
          <button
            type="button"
            onClick={() => setItemDialog({ item: undefined })}
            disabled={categories.length === 0}
            className="shrink-0 rounded-lg bg-[var(--app-color-accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            title={categories.length === 0 ? "请先新建分类" : undefined}
          >
            ＋ 新建商品
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 分类管理栏 */}
          <aside className="flex w-[180px] shrink-0 flex-col border-r border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">
            <div className="flex shrink-0 items-center justify-between px-3 py-2 text-[11px] font-medium text-[var(--app-color-text-tertiary)]">
              <span>分类</span>
              <button type="button" className="text-[11px] text-[var(--app-color-accent)] hover:underline" onClick={() => void addCategory()}>
                ＋ 新建
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
              <CatRow label="全部商品" count={items.length} active={filterCat === ""} onClick={() => setFilterCat("")} />
              {categories.map((c) => (
                <CatRow
                  key={c.id}
                  label={c.name}
                  count={countByCat.get(c.id) ?? 0}
                  active={filterCat === c.id}
                  onClick={() => setFilterCat(filterCat === c.id ? "" : c.id)}
                  onEdit={() => setCatDialog({ cat: c })}
                  onDelete={() => void removeCategory(c)}
                />
              ))}
              {categories.length === 0 && (
                <p className="px-2 py-3 text-[11px] text-[var(--app-color-text-tertiary)]">暂无分类，点右上「＋ 新建」</p>
              )}
            </div>
          </aside>

          {/* 主区：商品商店 / 回收站 */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3 py-3">
            {recycleOpen ? (
              recycleLoading ? <DataSkeleton variant="table" rows={4} /> : (
                <RecycleView
                  rows={recycleRows}
                  total={recycleTotal}
                  page={recyclePage}
                  setPage={setRecyclePage}
                  onRestore={(id) => restoreMut.mutate(id)}
                  onPurge={(ids) => purgeMut.mutate(ids)}
                  onPurgeAll={() => purgeAllMut.mutate(undefined, { onSuccess: () => setRecyclePage(1) })}
                  busy={purgeMut.isPending || purgeAllMut.isPending || restoreMut.isPending}
                />
              )
            ) : itemsLoading ? (
              <DataSkeleton variant="card" rows={6} />
            ) : filteredItems.length === 0 ? (
              <div className="flex h-full min-h-[160px] items-center justify-center rounded-twin-lg border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-sm text-[var(--twin-mute)]">
                {items.length === 0 ? "暂无商品，点右上「＋ 新建商品」" : "当前筛选下无商品"}
              </div>
            ) : (
              <div
                className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto pb-1"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 172px), 1fr))", gridAutoRows: "max-content" }}
              >
                {filteredItems.map((it) => (
                  <SupplyCard
                    key={it.id}
                    item={it}
                    onOpenImage={setLightboxSrc}
                    onInbound={() => setStockDialog({ item: it, kind: "inbound" })}
                    onStock={() => setStockDialog({ item: it, kind: "stock" })}
                    onEdit={() => setItemDialog({ item: it })}
                    onDelete={async () => {
                      if (!await appConfirm(`删除「${it.name}」？`)) return;
                      deleteItemMut.mutate(it.id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {catDialog && (
        <CategoryDialog
          category={catDialog.cat}
          busy={createCatMut.isPending || updateCatMut.isPending}
          onSave={(name) => {
            const cat = catDialog.cat;
            (cat
              ? updateCatMut.mutateAsync({ id: cat.id, body: { name, status: cat.status, sortOrder: cat.sortOrder } })
              : createCatMut.mutateAsync({ name, sortOrder: 0, status: 1 })
            ).then(() => setCatDialog(null)).catch(() => toast.error("保存失败"));
          }}
          onClose={() => setCatDialog(null)}
        />
      )}

      {itemDialog && (
        <ItemDialog
          item={itemDialog.item}
          categories={categories}
          defaultCatId={filterCat === "" ? categories[0]?.id : filterCat}
          busy={createItemMut.isPending || updateItemMut.isPending}
          onSubmit={(body, isEdit) => {
            if (isEdit && itemDialog.item) {
              updateItemMut.mutate({ id: itemDialog.item.id, body }, { onSuccess: () => setItemDialog(null) });
            } else {
              createItemMut.mutate(body, { onSuccess: () => setItemDialog(null) });
            }
          }}
          onClose={() => setItemDialog(null)}
        />
      )}

      {stockDialog && (
        <StockDialog
          item={stockDialog.item}
          kind={stockDialog.kind}
          busy={inboundMut.isPending || adjustMut.isPending}
          onConfirm={(qty) => {
            const { item, kind } = stockDialog;
            const done = { onSuccess: () => setStockDialog(null) };
            if (kind === "inbound") {
              const q = item.stockMode === "FLAG" ? 1 : qty;
              if (!q || q <= 0) return toast.error("数量无效");
              inboundMut.mutate({ itemId: item.id, qty: q }, done);
            } else {
              if (Number.isNaN(qty) || qty < 0) return toast.error("无效库存");
              adjustMut.mutate({ id: item.id, newQty: qty }, done);
            }
          }}
          onClose={() => setStockDialog(null)}
        />
      )}

      {lightboxSrc && createPortal(
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/70 p-8" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="" className="max-h-full max-w-full rounded-twin-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ════════════ 左栏分类行 ════════════ */

function CatRow({ label, count, active, onClick, onEdit, onDelete }: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-twin-sm px-2 py-1.5 text-xs transition-colors",
        active
          ? "bg-[color-mix(in_srgb,var(--app-color-accent)_10%,transparent)] font-medium text-[var(--app-color-accent)]"
          : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]",
      )}
    >
      <button type="button" onClick={onClick} className="min-w-0 flex-1 truncate text-left" title={label}>
        {label}
        <span className="ml-1 text-[10px] text-[var(--app-color-text-tertiary)]">{count}</span>
      </button>
      {onEdit && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button type="button" className="text-[10px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)]" onClick={onEdit}>改</button>
          <button type="button" className="text-[10px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-danger)]" onClick={onDelete}>删</button>
        </div>
      )}
    </div>
  );
}

/* ════════════ 商品卡（商店式） ════════════ */

function SupplyCard({ item, onOpenImage, onInbound, onStock, onEdit, onDelete }: {
  item: SupplyItem;
  onOpenImage: (src: string) => void;
  onInbound: () => void;
  onStock: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const imgSrc = webImageSrc(item.coverUrl);
  const offShelf = item.shelfStatus === "OFF_SHELF";
  const sub = "rounded-md px-1.5 py-0.5 text-[10px] text-[var(--app-color-text-secondary)]";

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-1 transition-shadow hover:shadow-twin-level-2">
      <button
        type="button"
        className="group relative block aspect-square w-full overflow-hidden bg-[var(--twin-canvas-soft)]"
        onClick={() => imgSrc && onOpenImage(imgSrc)}
      >
        {imgSrc ? (
          <>
            <img src={imgSrc} alt={item.name} className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
              <ZoomIn className="size-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
          </>
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--twin-mute)]">无图</span>
        )}
        {offShelf && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-[var(--app-color-surface-container)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-color-feedback-warning)] shadow-twin-level-1">
            {SHELF_ZH[item.shelfStatus] || item.shelfStatus}
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
        <div className="truncate text-[13px] font-medium text-[var(--twin-ink)]" title={item.name}>{item.name}</div>
        {item.subtitle && <div className="truncate text-[11px] text-[var(--twin-mute)]" title={item.subtitle}>{item.subtitle}</div>}
        <div className="flex flex-wrap items-center gap-1">
          <span className={sub}>{formatSupplyStockAdminLabel(item)}</span>
          {item.specSchema && <span className={sub}>规格</span>}
          {item.independentOrder === 1 && <span className={sub}>独立下单</span>}
        </div>
        <div className="mt-auto flex items-center gap-2 pt-1 text-[11px]">
          <button type="button" className="text-[var(--app-color-accent)] hover:underline" onClick={onInbound}>入库</button>
          {item.stockMode === "QUANTIFIED" && (
            <button type="button" className="text-[var(--app-color-text-secondary)] hover:underline" onClick={onStock}>库存</button>
          )}
          <button type="button" className="text-[var(--app-color-text-secondary)] hover:underline" onClick={onEdit}>编辑</button>
          <button type="button" className="ml-auto text-[var(--app-color-feedback-danger)] hover:underline" onClick={onDelete}>删</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════ 回收站 ════════════ */

function RecycleView({ rows, total, page, setPage, onRestore, onPurge, onPurgeAll, busy }: {
  rows: SupplyItem[];
  total: number;
  page: number;
  setPage: (fn: (p: number) => number) => void;
  onRestore: (id: number) => void;
  onPurge: (ids: number[]) => void;
  onPurgeAll: () => void;
  busy: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / 20));
  return (
    <>
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <span className="text-xs text-[var(--app-color-text-tertiary)]">回收站（7 天后自动清空）· 共 {total} 条</span>
        <button
          type="button"
          disabled={busy || rows.length === 0}
          className="rounded-lg border border-[var(--app-color-feedback-danger)] px-3 py-1.5 text-xs text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50"
          onClick={async () => { if (await appConfirm("确认一键清空回收站？")) onPurgeAll(); }}
        >
          一键清空
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {rows.map((it) => (
          <div key={it.id} className="flex items-center justify-between rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm text-[var(--twin-ink)]">{it.name}</div>
              <div className="text-[11px] text-[var(--app-color-text-tertiary)]">ID {it.id}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" disabled={busy} className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-1 text-xs disabled:opacity-50" onClick={() => onRestore(it.id)}>恢复</button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-[var(--app-color-feedback-danger)] px-3 py-1 text-xs text-[var(--app-color-feedback-danger)] disabled:opacity-50"
                onClick={async () => { if (await appConfirm(`彻底删除「${it.name}」？`)) onPurge([it.id]); }}
              >
                彻底删除
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="py-12 text-center text-sm text-[var(--app-color-text-tertiary)]">回收站为空</p>}
      </div>
      {total > 20 && (
        <div className="mt-2 flex shrink-0 items-center justify-center gap-3 text-xs">
          <button type="button" disabled={page <= 1} className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-1 disabled:opacity-40" onClick={() => setPage((p) => p - 1)}>上一页</button>
          <span className="text-[var(--app-color-text-secondary)]">第 {page} / {totalPages} 页</span>
          <button type="button" disabled={page >= totalPages} className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-1 disabled:opacity-40" onClick={() => setPage((p) => p + 1)}>下一页</button>
        </div>
      )}
    </>
  );
}

/* ════════════ 弹窗外壳 ════════════ */

function Dialog({ title, onClose, children, footer, wide }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={cn(
          "flex max-h-[85vh] w-full flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-4",
          wide ? "max-w-2xl" : "max-w-md",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--twin-hairline)] px-5 py-3">
          <h3 className="text-sm font-medium text-[var(--twin-ink)]">{title}</h3>
          <button type="button" onClick={onClose} className="text-lg leading-none text-[var(--app-color-text-tertiary)] hover:text-[var(--twin-ink)]">&times;</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--twin-hairline)] px-5 py-3">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

const btnGhost = "rounded-lg border border-[var(--app-color-border-default)] px-4 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]";
const btnAccent = "rounded-lg bg-[var(--app-color-accent)] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50";
const fieldLabel = "text-[11px] text-[var(--app-color-text-tertiary)]";

function CategoryDialog({ category, busy, onSave, onClose }: {
  category?: SupplyCategory;
  busy: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  return (
    <Dialog
      title={category ? "编辑分类" : "新建分类"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>取消</button>
          <button
            type="button"
            className={btnAccent}
            disabled={busy}
            onClick={() => (name.trim() ? onSave(name.trim()) : toast.error("请填写分类名称"))}
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-1">
        <span className={fieldLabel}>分类名称</span>
        <input className={cn(adminInputClass, "h-8 text-xs")} value={name} onChange={(e) => setName(e.target.value)} placeholder="分类名称" autoFocus />
      </label>
    </Dialog>
  );
}

/* ════════════ 商品弹窗（新建 / 编辑共用） ════════════ */

type ItemBody = Partial<SupplyItem> & { categoryId: number; name: string };

function ItemDialog({ item, categories, defaultCatId, busy, onSubmit, onClose }: {
  item?: SupplyItem;
  categories: SupplyCategory[];
  defaultCatId?: number;
  busy: boolean;
  onSubmit: (body: ItemBody, isEdit: boolean) => void;
  onClose: () => void;
}) {
  const isEdit = !!item;
  const spec = parseSpec(item?.specSchema);

  const [catId, setCatId] = useState<number | "">(item?.categoryId ?? defaultCatId ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [subtitle, setSubtitle] = useState(item?.subtitle ?? "");
  const [mode, setMode] = useState(item?.stockMode ?? "QUANTIFIED");
  const [shelfStatus, setShelfStatus] = useState(item?.shelfStatus ?? "ON_SHELF");
  const [independentOrder, setIndependentOrder] = useState(item?.independentOrder === 1);
  const [initialQty, setInitialQty] = useState("0");
  const [specEnabled, setSpecEnabled] = useState(spec.enabled);
  const [specDims, setSpecDims] = useState<SpecDimension[]>(spec.dims);
  const [specRequired, setSpecRequired] = useState(item?.specRequired === 1);
  const [coverUrl, setCoverUrl] = useState(item?.coverUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      setCoverUrl((await uploadSingleImage(file)).publicUrl);
      toast.success("图片上传成功");
    } catch {
      toast.error("图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    if (!catId || !name.trim()) return toast.error("请选择分类并填写名称");
    const qtyNum = Number(initialQty);
    if (!isEdit && (Number.isNaN(qtyNum) || qtyNum < 0)) return toast.error("初始入库数量无效");
    onSubmit({
      categoryId: Number(catId),
      name: name.trim(),
      subtitle: subtitle || undefined,
      coverUrl: coverUrl || undefined,
      stockMode: mode,
      shelfStatus,
      ...(isEdit ? {} : { stockQty: mode === "FLAG" ? (qtyNum > 0 ? 1 : 0) : Math.floor(qtyNum) }),
      specSchema: buildSpecSchema(specEnabled, specDims),
      specRequired: specEnabled && specRequired ? 1 : 0,
      independentOrder: independentOrder ? 1 : 0,
    }, isEdit);
  };

  return (
    <Dialog
      title={isEdit ? `编辑 · ${item!.name}` : "新建商品"}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>取消</button>
          <button type="button" className={btnAccent} disabled={busy || uploading} onClick={save}>
            {busy ? "保存中…" : isEdit ? "保存" : "创建商品"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="col-span-2 flex flex-col gap-1">
          <span className={fieldLabel}>封面图（可拖拽 / Ctrl+V 粘贴）</span>
          <div
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-twin-md border-2 border-dashed p-3 transition-colors",
              dragOver ? "border-[var(--app-color-accent)] bg-[color-mix(in_srgb,var(--app-color-accent)_5%,transparent)]" : "border-[var(--twin-hairline)]",
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) void upload(f); }}
            onPaste={(e) => { const f = e.clipboardData.files[0]; if (f?.type.startsWith("image/")) { e.preventDefault(); void upload(f); } }}
            tabIndex={0}
          >
            {coverUrl ? (
              <>
                <img src={webImageSrc(coverUrl)} alt="" className="size-14 shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] object-cover" />
                <button type="button" className="text-xs text-[var(--app-color-feedback-danger)]" onClick={() => setCoverUrl("")}>移除</button>
              </>
            ) : (
              <span className="text-xs text-[var(--app-color-text-tertiary)]">{uploading ? "上传中…" : "拖拽图片到此处、Ctrl+V 粘贴，或点击选择"}</span>
            )}
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>名称 *</span>
          <input className={cn(adminInputClass, "h-8 text-xs")} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>副标题</span>
          <input className={cn(adminInputClass, "h-8 text-xs")} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>分类</span>
          <select className={cn(adminInputClass, "h-8 text-xs")} value={catId === "" ? "" : String(catId)} onChange={(e) => setCatId(e.target.value === "" ? "" : Number(e.target.value))}>
            {categories.length === 0 && <option value="">请先新建分类</option>}
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>库存模式</span>
          <select className={cn(adminInputClass, "h-8 text-xs")} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="QUANTIFIED">数量型</option>
            <option value="FLAG">有无型</option>
          </select>
        </label>
        {isEdit ? (
          <label className="flex flex-col gap-1">
            <span className={fieldLabel}>上架状态</span>
            <select className={cn(adminInputClass, "h-8 text-xs")} value={shelfStatus} onChange={(e) => setShelfStatus(e.target.value)}>
              <option value="ON_SHELF">上架</option>
              <option value="OFF_SHELF">下架</option>
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className={fieldLabel}>初始入库数量</span>
            <input className={cn(adminInputClass, "h-8 text-xs")} type="number" min={0} value={initialQty} onChange={(e) => setInitialQty(e.target.value)} />
          </label>
        )}
        <label className="col-span-2 flex items-center gap-2">
          <AdminSwitchScaled size="3.5" checked={independentOrder} onChange={setIndependentOrder} />
          <span className="text-xs text-[var(--twin-body)]">独立下单（该商品不能与其他商品合并下单）</span>
        </label>
        <label className="col-span-2 flex items-center gap-2">
          <AdminSwitchScaled size="3.5" checked={specEnabled} onChange={setSpecEnabled} />
          <span className="text-xs text-[var(--twin-body)]">启用规格（学生需选择规格才能申领）</span>
        </label>
        {specEnabled && (
          <SpecEditor dims={specDims} setDims={setSpecDims} required={specRequired} setRequired={setSpecRequired} />
        )}
      </div>
    </Dialog>
  );
}

function SpecEditor({ dims, setDims, required, setRequired }: {
  dims: SpecDimension[];
  setDims: (d: SpecDimension[]) => void;
  required: boolean;
  setRequired: (v: boolean) => void;
}) {
  const patch = (di: number, next: Partial<SpecDimension>) =>
    setDims(dims.map((d, i) => (i === di ? { ...d, ...next } : d)));

  return (
    <div className="col-span-2 space-y-2 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
      <label className="flex items-center gap-2">
        <AdminSwitchScaled size="3.5" checked={required} onChange={setRequired} />
        <span className="text-xs text-[var(--twin-body)]">强制选择规格（不允许跳过）</span>
      </label>
      {dims.map((dim, di) => (
        <div key={di} className="flex flex-wrap items-center gap-2">
          <input
            className={cn(adminInputClass, "h-7 w-20 text-xs")}
            placeholder="维度名"
            value={dim.name}
            onChange={(e) => patch(di, { name: e.target.value })}
          />
          {dim.options.map((opt, oi) => (
            <span key={oi} className="inline-flex items-center gap-1 rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-0.5 text-xs">
              <input
                className="w-12 border-none bg-transparent text-xs text-[var(--twin-ink)] outline-none"
                placeholder="选项"
                value={opt}
                onChange={(e) => patch(di, { options: dim.options.map((o, i) => (i === oi ? e.target.value : o)) })}
              />
              <button type="button" className="leading-none text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-danger)]" onClick={() => patch(di, { options: dim.options.filter((_, i) => i !== oi) })}>&times;</button>
            </span>
          ))}
          <button type="button" className="text-xs text-[var(--app-color-accent)]" onClick={() => patch(di, { options: [...dim.options, ""] })}>+ 选项</button>
          <button type="button" className="text-xs text-[var(--app-color-feedback-danger)]" onClick={() => setDims(dims.filter((_, i) => i !== di))}>删除维度</button>
        </div>
      ))}
      <button type="button" className="text-xs text-[var(--app-color-accent)]" onClick={() => setDims([...dims, { name: "", options: ["", ""] }])}>+ 添加规格维度</button>
    </div>
  );
}

/* ════════════ 入库 / 改库存弹窗 ════════════ */

function StockDialog({ item, kind, busy, onConfirm, onClose }: {
  item: SupplyItem;
  kind: "inbound" | "stock";
  busy: boolean;
  onConfirm: (qty: number) => void;
  onClose: () => void;
}) {
  const isFlag = item.stockMode === "FLAG";
  const [value, setValue] = useState(kind === "stock" ? String(item.stockQty ?? 0) : "1");

  return (
    <Dialog
      title={`${kind === "inbound" ? "入库" : "修改库存"} · ${item.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>取消</button>
          <button type="button" className={btnAccent} disabled={busy} onClick={() => onConfirm(Number(value))}>
            {busy ? "提交中…" : kind === "inbound" ? "确认入库" : "保存"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-[var(--app-color-text-secondary)]">
          {kind === "inbound"
            ? isFlag ? "有无型入库将标记为有货（与数量无关）。" : "按数量增加库存。"
            : "将库存直接设为新数值（非增量）。"}
        </p>
        {!(kind === "inbound" && isFlag) && (
          <input
            className={cn(adminInputClass, "h-9 text-sm")}
            type="number"
            min={kind === "stock" ? 0 : 1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        )}
      </div>
    </Dialog>
  );
}
