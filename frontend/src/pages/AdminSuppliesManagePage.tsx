import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  adjustSupplyStock,
  createAdminSupplyCategory,
  createAdminSupplyItem,
  deleteAdminSupplyCategory,
  deleteAdminSupplyItem,
  fetchAdminSupplyCategories,
  fetchAdminSupplyItems,
  fetchAdminSupplyRecycle,
  inboundSupplyItem,
  purgeAdminSupplyRecycle,
  purgeAllAdminSupplyRecycle,
  restoreAdminSupplyRecycle,
  updateAdminSupplyCategory,
  updateAdminSupplyItem,
  type SupplyCategory,
  type SupplyItem,
} from "@/api/domains/supplies.api";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";

type CardPanel = null | { itemId: number; kind: "inbound" | "stock" };

export default function AdminSuppliesManagePage() {
  const [categories, setCategories] = useState<SupplyCategory[]>([]);
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [filterCat, setFilterCat] = useState<number | "">("");
  const [newCatName, setNewCatName] = useState("");
  const [cardPanel, setCardPanel] = useState<CardPanel>(null);
  const [panelQty, setPanelQty] = useState("1");
  const [panelNewStock, setPanelNewStock] = useState("");
  const [createCatId, setCreateCatId] = useState<number | "">("");
  const [createName, setCreateName] = useState("");
  const [createMode, setCreateMode] = useState<"QUANTIFIED" | "FLAG">("QUANTIFIED");
  const [createInitialQty, setCreateInitialQty] = useState("0");
  const [recycleRows, setRecycleRows] = useState<SupplyItem[]>([]);
  const [recycleTotal, setRecycleTotal] = useState(0);
  const [recyclePage, setRecyclePage] = useState(1);
  const [recycleOpen, setRecycleOpen] = useState(false);

  const loadRecycle = useCallback(async (page = recyclePage) => {
    try {
      const res = await fetchAdminSupplyRecycle({ page, size: 20 });
      setRecycleRows(res.data || []);
      setRecycleTotal(res.total || 0);
      setRecyclePage(page);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载回收站失败");
    }
  }, [recyclePage]);
  const reload = useCallback(async () => {
    try {
      const [c, it] = await Promise.all([
        fetchAdminSupplyCategories(),
        fetchAdminSupplyItems(filterCat === "" ? undefined : filterCat),
      ]);
      setCategories(c);
      setItems(it);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    }
  }, [filterCat]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
      <section className="rounded border bg-white p-4 space-y-3">
        <h3 className="font-medium">分类</h3>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded border px-2 py-1 text-sm"
            placeholder="新分类名称"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
          />
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
            onClick={async () => {
              if (!newCatName.trim()) return toast.error("填写名称");
              await createAdminSupplyCategory({ name: newCatName.trim(), sortOrder: 0, status: 1 });
              setNewCatName("");
              toast.success("已创建");
              await reload();
            }}
          >
            新增分类
          </button>
        </div>
        <div className="space-y-1 text-sm">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded border px-2 py-1">
              <span>{c.name}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="text-xs text-blue-600"
                  onClick={async () => {
                    const name = window.prompt("分类名称", c.name);
                    if (!name) return;
                    await updateAdminSupplyCategory(c.id, { name, status: c.status, sortOrder: c.sortOrder });
                    toast.success("已更新");
                    await reload();
                  }}
                >
                  改
                </button>
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={async () => {
                    if (!window.confirm("删除分类？")) return;
                    await deleteAdminSupplyCategory(c.id);
                    toast.success("已删除");
                    await reload();
                  }}
                >
                  删
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border bg-white p-4 space-y-4">
        <h3 className="font-medium">物资列表</h3>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <span>筛选分类</span>
          <select
            className="rounded border px-2 py-1"
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
            className="rounded border border-slate-300 px-2 py-1 text-xs"
            onClick={async () => {
              const next = !recycleOpen;
              setRecycleOpen(next);
              if (next) {
                await loadRecycle(1);
              }
            }}
          >
            {recycleOpen ? "收起回收站" : "回收站"}
          </button>
        </div>

        <div className="rounded border border-slate-200 bg-slate-50/80 p-3 space-y-2">
          <div className="text-sm font-medium text-slate-700">快速新建物资</div>
          <div className="flex flex-wrap gap-2 items-end text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">分类</span>
              <select
                className="rounded border px-2 py-1 min-w-[140px]"
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
              <span className="text-xs text-slate-500">名称</span>
              <input
                className="rounded border px-2 py-1 w-full"
                placeholder="物资名称"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">库存模式</span>
              <select
                className="rounded border px-2 py-1"
                value={createMode}
                onChange={(e) => setCreateMode(e.target.value === "FLAG" ? "FLAG" : "QUANTIFIED")}
              >
                <option value="QUANTIFIED">数量型 QUANTIFIED</option>
                <option value="FLAG">有无型 FLAG</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">初始入库数量</span>
              <input
                className="rounded border px-2 py-1 w-24"
                type="number"
                min={0}
                value={createInitialQty}
                onChange={(e) => setCreateInitialQty(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white"
              onClick={async () => {
                const catId = Number(createCatId);
                const name = createName.trim();
                if (!catId || !name) return toast.error("请选择分类并填写名称");
                const qtyNum = Number(createInitialQty);
                if (Number.isNaN(qtyNum) || qtyNum < 0) return toast.error("初始入库数量无效");
                await createAdminSupplyItem({
                  categoryId: catId,
                  name,
                  stockMode: createMode,
                  stockQty: createMode === "FLAG" ? (qtyNum > 0 ? 1 : 0) : Math.floor(qtyNum),
                  shelfStatus: "ON_SHELF",
                });
                setCreateName("");
                setCreateInitialQty("0");
                toast.success("已创建");
                await reload();
              }}
            >
              创建
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => {
            const panelOpen = cardPanel?.itemId === it.id;
            const inboundOpen = panelOpen && cardPanel?.kind === "inbound";
            const stockOpen = panelOpen && cardPanel?.kind === "stock";
            return (
              <div
                key={it.id}
                className="relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm flex flex-col gap-2"
              >
                <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1 max-w-[58%]">
                  <button
                    type="button"
                    className={`rounded px-2 py-0.5 text-[11px] font-medium border ${
                      inboundOpen ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                    onClick={() => (inboundOpen ? closePanel() : openInbound(it))}
                  >
                    入库
                  </button>
                  {it.stockMode === "QUANTIFIED" ? (
                    <button
                      type="button"
                      className={`rounded px-2 py-0.5 text-[11px] font-medium border ${
                        stockOpen ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                      onClick={() => (stockOpen ? closePanel() : openStock(it))}
                    >
                      修改库存
                    </button>
                  ) : null}
                </div>
                <div className="pr-[52%]">
                  <div className="font-medium text-slate-900 leading-snug">{it.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    ID {it.id} · {it.stockMode} · 库存 {it.stockQty} · {it.shelfStatus}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    className="text-blue-600"
                    onClick={async () => {
                      const name = window.prompt("名称", it.name);
                      if (!name) return;
                      await updateAdminSupplyItem(it.id, { name, shelfStatus: it.shelfStatus, stockMode: it.stockMode });
                      toast.success("已更新");
                      await reload();
                    }}
                  >
                    改名
                  </button>
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={async () => {
                      if (!window.confirm("删除该物资？")) return;
                      await deleteAdminSupplyItem(it.id);
                      if (cardPanel?.itemId === it.id) closePanel();
                      toast.success("已删除");
                      await reload();
                    }}
                  >
                    删除
                  </button>
                </div>

                {inboundOpen ? (
                  <div className="rounded border border-blue-100 bg-blue-50/60 p-2 text-sm space-y-2">
                    <div className="text-xs text-blue-900">
                      {it.stockMode === "FLAG" ? "有无型入库将标记为有货（与数量无关）。" : "按数量增加库存。"}
                    </div>
                    {it.stockMode === "QUANTIFIED" ? (
                      <input
                        className="w-full rounded border px-2 py-1 text-sm"
                        type="number"
                        min={1}
                        value={panelQty}
                        onChange={(e) => setPanelQty(e.target.value)}
                      />
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                        onClick={async () => {
                          const q = it.stockMode === "FLAG" ? 1 : Number(panelQty);
                          if (!q || q <= 0) return toast.error("数量无效");
                          await inboundSupplyItem({ itemId: it.id, qty: q });
                          toast.success("入库成功");
                          closePanel();
                          await reload();
                        }}
                      >
                        确认入库
                      </button>
                      <button type="button" className="rounded border px-2 py-1 text-xs" onClick={closePanel}>
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}

                {stockOpen && it.stockMode === "QUANTIFIED" ? (
                  <div className="rounded border border-amber-100 bg-amber-50/60 p-2 text-sm space-y-2">
                    <div className="text-xs text-amber-900">将库存直接设为新数值（非增量）。</div>
                    <input
                      className="w-full rounded border px-2 py-1 text-sm"
                      type="number"
                      min={0}
                      value={panelNewStock}
                      onChange={(e) => setPanelNewStock(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded bg-amber-600 px-2 py-1 text-xs text-white"
                        onClick={async () => {
                          const n = Number(panelNewStock);
                          if (Number.isNaN(n) || n < 0) return toast.error("无效库存");
                          await adjustSupplyStock(it.id, n);
                          toast.success("已保存");
                          closePanel();
                          await reload();
                        }}
                      >
                        保存
                      </button>
                      <button type="button" className="rounded border px-2 py-1 text-xs" onClick={closePanel}>
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {items.length === 0 ? <p className="text-sm text-slate-500">当前筛选下暂无物资。</p> : null}

        {recycleOpen ? (
          <div className="mt-2 space-y-3 rounded border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-slate-800">物资回收站（7天后自动清空）</h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                  onClick={() => void loadRecycle(recyclePage)}
                >
                  刷新
                </button>
                <button
                  type="button"
                  className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                  onClick={async () => {
                    if (!window.confirm("确认一键清空回收站？")) return;
                    await purgeAllAdminSupplyRecycle();
                    toast.success("回收站已清空");
                    await loadRecycle(1);
                  }}
                >
                  一键清空
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {recycleRows.map((it) => (
                <div key={it.id} className="flex items-center justify-between rounded border bg-white px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{it.name}</div>
                    <div className="text-xs text-slate-500">ID {it.id}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs text-blue-700"
                      onClick={async () => {
                        await restoreAdminSupplyRecycle(it.id);
                        toast.success("已恢复");
                        await reload();
                        await loadRecycle(recyclePage);
                      }}
                    >
                      恢复
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                      onClick={async () => {
                        if (!window.confirm(`确认彻底删除 ${it.name}？`)) return;
                        await purgeAdminSupplyRecycle(it.id);
                        toast.success("已彻底删除");
                        await loadRecycle(recyclePage);
                      }}
                    >
                      彻底删除
                    </button>
                  </div>
                </div>
              ))}
              {recycleRows.length === 0 ? <p className="text-sm text-slate-500">回收站为空。</p> : null}
            </div>
            <div className="flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                className="rounded border px-2 py-1"
                disabled={recyclePage <= 1}
                onClick={() => void loadRecycle(Math.max(1, recyclePage - 1))}
              >
                上一页
              </button>
              <span>第 {recyclePage} 页，共 {recycleTotal} 条</span>
              <button
                type="button"
                className="rounded border px-2 py-1"
                disabled={recyclePage * 20 >= recycleTotal}
                onClick={() => void loadRecycle(recyclePage + 1)}
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
