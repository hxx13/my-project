import { useEffect, useState } from "react";
import toast from "react-hot-toast";
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
import type { SupplyItem } from "@/api/domains/supplies.api";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";
import DataSkeleton from "@/components/ui/DataSkeleton";
import EmptyState from "@/components/ui/EmptyState";

type CardPanel = null | { itemId: number; kind: "inbound" | "stock" };

export default function AdminSuppliesManagePage() {
  const [filterCat, setFilterCat] = useState<number | "">("");
  const [newCatName, setNewCatName] = useState("");
  const [cardPanel, setCardPanel] = useState<CardPanel>(null);
  const [panelQty, setPanelQty] = useState("1");
  const [panelNewStock, setPanelNewStock] = useState("");
  const [createCatId, setCreateCatId] = useState<number | "">("");
  const [createName, setCreateName] = useState("");
  const [createMode, setCreateMode] = useState<"QUANTIFIED" | "FLAG">("QUANTIFIED");
  const [createInitialQty, setCreateInitialQty] = useState("0");
  const [recyclePage, setRecyclePage] = useState(1);
  const [recycleOpen, setRecycleOpen] = useState(false);

  const { data: categories = [], isLoading: catLoading } = useAdminSupplyCategories();
  const { data: items = [], isLoading: itemsLoading } = useAdminSupplyItems(filterCat === "" ? undefined : filterCat);
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

  useEffect(() => {
    if (categories.length > 0 && createCatId === "") {
      setCreateCatId(categories[0].id);
    }
  }, [categories, createCatId]);

  const openInbound = (it: SupplyItem) => {
    setCardPanel({ itemId: it.id, kind: "inbound" });
    setPanelQty("1");
  };

  const openStock = (it: SupplyItem) => {
    setCardPanel({ itemId: it.id, kind: "stock" });
    setPanelNewStock(String(it.stockQty ?? 0));
  };

  const closePanel = () => {
    setCardPanel(null);
  };

  return (
    <div className="space-y-8">
      <AdminSubPageHeader
        fallbackTo="/admin/supplies"
        backLabel="返回领用物资"
        title="物资管理"
        description="维护分类与物资卡片、入库与库存；回收站与小程序管理端行为对齐。领用通知接收人请在「系统设置」→ supplies 中配置 supply.claim.notifyReceiverUserId。"
      />
      <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 space-y-3 shadow-twin-level-1">
        <h3 className="font-medium text-[var(--twin-ink)]">分类</h3>
        {catLoading ? <DataSkeleton variant="card" rows={3} /> : null}
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm text-[var(--twin-ink)]"
            placeholder="新分类名称"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
          />
          <button
            type="button"
            className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-sm font-medium text-[var(--twin-on-primary)]"
            onClick={() => {
              if (!newCatName.trim()) return toast.error("填写名称");
              createCatMut.mutate(
                { name: newCatName.trim(), sortOrder: 0, status: 1 },
                { onSuccess: () => setNewCatName("") },
              );
            }}
          >
            新增分类
          </button>
        </div>
        <div className="space-y-1 text-sm">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1">
              <span className="text-[var(--twin-ink)]">{c.name}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded-twin-sm px-2 py-0.5 text-xs font-medium text-[var(--twin-link-deep)]"
                  onClick={() => {
                    const name = window.prompt("分类名称", c.name);
                    if (!name) return;
                    updateCatMut.mutate({ id: c.id, body: { name, status: c.status, sortOrder: c.sortOrder } });
                  }}
                >
                  改
                </button>
                <button
                  type="button"
                  className="rounded-twin-sm px-2 py-0.5 text-xs font-medium text-red-600"
                  onClick={() => {
                    if (!window.confirm("删除分类？")) return;
                    deleteCatMut.mutate(c.id);
                  }}
                >
                  删
                </button>
              </div>
            </div>
          ))}
          {!catLoading && categories.length === 0 ? <EmptyState title="暂无分类" description="请先新增分类" /> : null}
        </div>
      </section>

      <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 space-y-4 shadow-twin-level-1">
        <h3 className="font-medium text-[var(--twin-ink)]">物资列表</h3>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <span className="text-[var(--twin-body)]">筛选分类</span>
          <select
            className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]"
            value={filterCat === "" ? "" : String(filterCat)}
            onChange={(e) => setFilterCat(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">全部</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs font-medium text-[var(--twin-body)]"
            onClick={() => {
              const next = !recycleOpen;
              setRecycleOpen(next);
              if (next) setRecyclePage(1);
            }}
          >
            {recycleOpen ? "收起回收站" : "回收站"}
          </button>
        </div>

        <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3 space-y-2">
          <div className="text-sm font-medium text-[var(--twin-ink)]">快速新建物资</div>
          <div className="flex flex-wrap gap-2 items-end text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--twin-mute)]">分类</span>
              <select
                className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 min-w-[140px] text-[var(--twin-ink)]"
                value={createCatId === "" ? "" : String(createCatId)}
                onChange={(e) => setCreateCatId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                {categories.length === 0 ? <option value="">请先新增分类</option> : null}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <span className="text-xs text-[var(--twin-mute)]">名称</span>
              <input
                className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 w-full text-[var(--twin-ink)]"
                placeholder="物资名称"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--twin-mute)]">库存模式</span>
              <select
                className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]"
                value={createMode}
                onChange={(e) => setCreateMode(e.target.value === "FLAG" ? "FLAG" : "QUANTIFIED")}
              >
                <option value="QUANTIFIED">数量型 QUANTIFIED</option>
                <option value="FLAG">有无型 FLAG</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--twin-mute)]">初始入库数量</span>
              <input
                className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 w-24 text-[var(--twin-ink)]"
                type="number"
                min={0}
                value={createInitialQty}
                onChange={(e) => setCreateInitialQty(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded-twin-sm bg-[var(--twin-ink)] px-3 py-1.5 text-sm font-medium text-white"
              onClick={() => {
                const catId = Number(createCatId);
                const name = createName.trim();
                if (!catId || !name) return toast.error("请选择分类并填写名称");
                const qtyNum = Number(createInitialQty);
                if (Number.isNaN(qtyNum) || qtyNum < 0) return toast.error("初始入库数量无效");
                createItemMut.mutate(
                  {
                    categoryId: catId,
                    name,
                    stockMode: createMode,
                    stockQty: createMode === "FLAG" ? (qtyNum > 0 ? 1 : 0) : Math.floor(qtyNum),
                    shelfStatus: "ON_SHELF",
                  },
                  {
                    onSuccess: () => {
                      setCreateName("");
                      setCreateInitialQty("0");
                    },
                  },
                );
              }}
            >
              创建
            </button>
          </div>
        </div>

        {itemsLoading ? <DataSkeleton variant="card" rows={6} /> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => {
            const panelOpen = cardPanel?.itemId === it.id;
            const inboundOpen = panelOpen && cardPanel?.kind === "inbound";
            const stockOpen = panelOpen && cardPanel?.kind === "stock";
            return (
              <div
                key={it.id}
                className="relative rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3 shadow-twin-level-1 flex flex-col gap-2"
              >
                <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1 max-w-[58%]">
                  <button
                    type="button"
                    className={`rounded-twin-sm px-2 py-0.5 text-[11px] font-medium border ${
                      inboundOpen ? "border-sky-300 bg-sky-50 text-sky-700" : "border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                    }`}
                    onClick={() => (inboundOpen ? closePanel() : openInbound(it))}
                  >
                    入库
                  </button>
                  {it.stockMode === "QUANTIFIED" ? (
                    <button
                      type="button"
                      className={`rounded-twin-sm px-2 py-0.5 text-[11px] font-medium border ${
                        stockOpen ? "border-amber-300 bg-amber-50 text-amber-800" : "border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                      }`}
                      onClick={() => (stockOpen ? closePanel() : openStock(it))}
                    >
                      修改库存
                    </button>
                  ) : null}
                </div>
                <div className="pr-[52%]">
                  <div className="font-medium text-[var(--twin-ink)] leading-snug">{it.name}</div>
                  <div className="mt-1 text-xs text-[var(--twin-mute)]">
                    ID {it.id} · {it.stockMode} · 库存 {it.stockQty} · {it.shelfStatus}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs pt-1 border-t border-[var(--twin-hairline)]">
                  <button
                    type="button"
                    className="rounded-twin-sm px-2 py-1 text-xs font-medium text-[var(--twin-link-deep)]"
                    onClick={() => {
                      const name = window.prompt("名称", it.name);
                      if (!name) return;
                      updateItemMut.mutate({ id: it.id, body: { name, shelfStatus: it.shelfStatus, stockMode: it.stockMode } });
                    }}
                  >
                    改名
                  </button>
                  <button
                    type="button"
                    className="rounded-twin-sm px-2 py-1 text-xs font-medium text-red-600"
                    onClick={() => {
                      if (!window.confirm("删除该物资？")) return;
                      deleteItemMut.mutate(it.id, {
                        onSuccess: () => {
                          if (cardPanel?.itemId === it.id) closePanel();
                        },
                      });
                    }}
                  >
                    删除
                  </button>
                </div>

                {inboundOpen ? (
                  <div className="rounded-twin-md border border-sky-100 bg-sky-50/60 p-2 text-sm space-y-2">
                    <div className="text-xs text-sky-900">
                      {it.stockMode === "FLAG" ? "有无型入库将标记为有货（与数量无关）。" : "按数量增加库存。"}
                    </div>
                    {it.stockMode === "QUANTIFIED" ? (
                      <input
                        className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm text-[var(--twin-ink)]"
                        type="number"
                        min={1}
                        value={panelQty}
                        onChange={(e) => setPanelQty(e.target.value)}
                      />
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-twin-sm bg-sky-600 px-3 py-1 text-xs font-medium text-white"
                        onClick={() => {
                          const q = it.stockMode === "FLAG" ? 1 : Number(panelQty);
                          if (!q || q <= 0) return toast.error("数量无效");
                          inboundMut.mutate(
                            { itemId: it.id, qty: q },
                            { onSuccess: () => closePanel() },
                          );
                        }}
                      >
                        确认入库
                      </button>
                      <button type="button" className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs font-medium text-[var(--twin-body)]" onClick={closePanel}>
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}

                {stockOpen && it.stockMode === "QUANTIFIED" ? (
                  <div className="rounded-twin-md border border-amber-100 bg-amber-50/60 p-2 text-sm space-y-2">
                    <div className="text-xs text-amber-900">将库存直接设为新数值（非增量）。</div>
                    <input
                      className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm text-[var(--twin-ink)]"
                      type="number"
                      min={0}
                      value={panelNewStock}
                      onChange={(e) => setPanelNewStock(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-twin-sm bg-amber-600 px-3 py-1 text-xs font-medium text-white"
                        onClick={() => {
                          const n = Number(panelNewStock);
                          if (Number.isNaN(n) || n < 0) return toast.error("无效库存");
                          adjustMut.mutate(
                            { id: it.id, newQty: n },
                            { onSuccess: () => closePanel() },
                          );
                        }}
                      >
                        保存
                      </button>
                      <button type="button" className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs font-medium text-[var(--twin-body)]" onClick={closePanel}>
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {!itemsLoading && items.length === 0 ? <EmptyState title="当前筛选下暂无物资" /> : null}

        {recycleOpen ? (
          <div className="mt-2 space-y-3 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-[var(--twin-ink)]">物资回收站（7天后自动清空）</h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  disabled={purgeAllMut.isPending}
                  onClick={() => {
                    if (!window.confirm("确认一键清空回收站？")) return;
                    purgeAllMut.mutate(undefined, {
                      onSuccess: () => setRecyclePage(1),
                    });
                  }}
                >
                  一键清空
                </button>
              </div>
            </div>
            {recycleLoading ? <DataSkeleton variant="table" rows={3} /> : null}
            <div className="space-y-2">
              {recycleRows.map((it) => (
                <div key={it.id} className="flex items-center justify-between rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-[var(--twin-ink)]">{it.name}</div>
                    <div className="text-xs text-[var(--twin-mute)]">ID {it.id}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                      onClick={() => restoreMut.mutate(it.id)}
                      disabled={restoreMut.isPending}
                    >
                      恢复
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                      onClick={() => {
                        if (!window.confirm(`确认彻底删除 ${it.name}？`)) return;
                        purgeMut.mutate([it.id]);
                      }}
                      disabled={purgeMut.isPending}
                    >
                      彻底删除
                    </button>
                  </div>
                </div>
              ))}
              {!recycleLoading && recycleRows.length === 0 ? <EmptyState title="回收站为空" /> : null}
            </div>
            <div className="flex items-center justify-end gap-2 text-xs text-[var(--twin-body)]">
              <button
                type="button"
                className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-40"
                disabled={recyclePage <= 1}
                onClick={() => setRecyclePage((p) => Math.max(1, p - 1))}
              >
                上一页
              </button>
              <span>第 {recyclePage} 页，共 {recycleTotal} 条</span>
              <button
                type="button"
                className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-40"
                disabled={recyclePage * 20 >= recycleTotal}
                onClick={() => setRecyclePage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
