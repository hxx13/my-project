import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  useAdminMaterialCategories, useAdminMaterialItems, useAdminMaterialRecycle,
  useCreateAdminMaterialCategory, useUpdateAdminMaterialCategory, useDeleteAdminMaterialCategory,
  useCreateAdminMaterialItem, useUpdateAdminMaterialItem, useDeleteAdminMaterialItem,
  useRestoreAdminMaterialRecycle, usePurgeAdminMaterialRecycle, usePurgeAllAdminMaterialRecycle,
  useInboundMaterialItem, useAdjustMaterialStock,
} from "@/api/hooks/useMaterial";
import type { MaterialItem } from "@/api/domains/material.api";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";

type CardPanel = null | { itemId: number; kind: "inbound" | "stock" | "workflow" };

export default function MaterialManagePage() {
  const [filterCat, setFilterCat] = useState<number | "">("");
  const [newCatName, setNewCatName] = useState("");
  const [cardPanel, setCardPanel] = useState<CardPanel>(null);
  const [panelQty, setPanelQty] = useState("1");
  const [panelNewStock, setPanelNewStock] = useState("");
  const [createCatId, setCreateCatId] = useState<number | "">("");
  const [createName, setCreateName] = useState("");
  const [createMode, setCreateMode] = useState<"QUANTIFIED" | "FLAG">("QUANTIFIED");
  const [createWorkflow, setCreateWorkflow] = useState<"SIMPLE" | "DUAL_REVIEW">("SIMPLE");
  const [createReviewerIds, setCreateReviewerIds] = useState("");
  const [createSecondReviewerIds, setCreateSecondReviewerIds] = useState("");
  const [createInitialQty, setCreateInitialQty] = useState("0");
  const [recyclePage, setRecyclePage] = useState(1);
  const [recycleOpen, setRecycleOpen] = useState(false);

  const { data: categories = [] } = useAdminMaterialCategories();
  const { data: items = [] } = useAdminMaterialItems(filterCat === "" ? undefined : filterCat);
  const { data: recycleData } = useAdminMaterialRecycle({ page: recyclePage, size: 20 });
  const recycleRows = recycleData?.data ?? [];
  const recycleTotal = recycleData?.total ?? 0;

  const createCatMut = useCreateAdminMaterialCategory();
  const updateCatMut = useUpdateAdminMaterialCategory();
  const deleteCatMut = useDeleteAdminMaterialCategory();
  const createItemMut = useCreateAdminMaterialItem();
  const updateItemMut = useUpdateAdminMaterialItem();
  const deleteItemMut = useDeleteAdminMaterialItem();
  const restoreMut = useRestoreAdminMaterialRecycle();
  const purgeMut = usePurgeAdminMaterialRecycle();
  const purgeAllMut = usePurgeAllAdminMaterialRecycle();
  const inboundMut = useInboundMaterialItem();
  const adjustMut = useAdjustMaterialStock();

  useEffect(() => {
    if (categories.length > 0 && createCatId === "") setCreateCatId(categories[0].id);
  }, [categories, createCatId]);

  const openInbound = (it: MaterialItem) => { setCardPanel({ itemId: it.id, kind: "inbound" }); setPanelQty("1"); };
  const openStock = (it: MaterialItem) => { setCardPanel({ itemId: it.id, kind: "stock" }); setPanelNewStock(String(it.stockQty ?? 0)); };
  const openWorkflow = (it: MaterialItem) => { setCardPanel({ itemId: it.id, kind: "workflow" }); };
  const closePanel = () => setCardPanel(null);

  return (
    <div className="space-y-8 pb-8">
      <AdminSubPageHeader title="物品管理" backTo="/admin/material/review" description="管理物资分类、物品上架、入库补货与库存调整。审核流程与审核人按物品独立配置。" />

      {/* ====== 分类管理 ====== */}
      <section className="rounded-lg border bg-white p-4 space-y-3 shadow-sm">
        <h3 className="font-medium">分类管理</h3>
        <div className="flex flex-wrap gap-2">
          <input className="rounded border px-2 py-1 text-sm" placeholder="新分类名称" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
          <button type="button" className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white"
            onClick={() => {
              if (!newCatName.trim()) return toast.error("填写名称");
              createCatMut.mutate({ name: newCatName.trim(), sortOrder: 0 }, { onSuccess: () => setNewCatName("") });
            }}>新增分类</button>
        </div>
        <div className="space-y-1 text-sm">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded border bg-gray-50 px-2 py-1">
              <span>{c.name}</span>
              <div className="flex gap-1">
                <button type="button" className="rounded px-2 py-0.5 text-xs text-blue-600"
                  onClick={() => { const name = window.prompt("分类名称", c.name); if (!name) return; updateCatMut.mutate({ id: c.id, body: { name, status: c.status, sortOrder: c.sortOrder } }); }}>改</button>
                <button type="button" className="rounded px-2 py-0.5 text-xs text-red-600"
                  onClick={() => { if (!window.confirm("删除分类？")) return; deleteCatMut.mutate(c.id); }}>删</button>
              </div>
            </div>
          ))}
          {categories.length === 0 && <p className="text-gray-400 text-center py-4">暂无分类，请先新增</p>}
        </div>
      </section>

      {/* ====== 物品管理 ====== */}
      <section className="rounded-lg border bg-white p-4 space-y-4 shadow-sm">
        <h3 className="font-medium">物品列表</h3>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <span className="text-gray-500">筛选分类</span>
          <select className="rounded border px-2 py-1" value={filterCat === "" ? "" : String(filterCat)}
            onChange={(e) => setFilterCat(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">全部</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" className="rounded-full border px-3 py-1 text-xs"
            onClick={() => { const next = !recycleOpen; setRecycleOpen(next); if (next) setRecyclePage(1); }}>{recycleOpen ? "收起回收站" : "回收站"}</button>
        </div>

        {/* 快速新建 */}
        <div className="rounded-md border bg-gray-50 p-3 space-y-2">
          <div className="text-sm font-medium">快速新建物品</div>
          <div className="flex flex-wrap gap-2 items-end text-sm">
            <label className="flex flex-col gap-1"><span className="text-xs text-gray-400">分类</span>
              <select className="rounded border px-2 py-1 min-w-[140px]" value={createCatId === "" ? "" : String(createCatId)}
                onChange={(e) => setCreateCatId(e.target.value === "" ? "" : Number(e.target.value))}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1 min-w-[160px]"><span className="text-xs text-gray-400">名称</span>
              <input className="rounded border px-2 py-1 w-full" placeholder="物品名称" value={createName} onChange={(e) => setCreateName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1"><span className="text-xs text-gray-400">库存模式</span>
              <select className="rounded border px-2 py-1" value={createMode} onChange={(e) => setCreateMode(e.target.value === "FLAG" ? "FLAG" : "QUANTIFIED")}>
                <option value="QUANTIFIED">数量型</option>
                <option value="FLAG">有无型</option>
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className="text-xs text-gray-400">审核流程</span>
              <select className="rounded border px-2 py-1" value={createWorkflow} onChange={(e) => setCreateWorkflow(e.target.value as "SIMPLE" | "DUAL_REVIEW")}>
                <option value="SIMPLE">简单流程</option>
                <option value="DUAL_REVIEW">复核流程</option>
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className="text-xs text-gray-400">初始入库</span>
              <input className="rounded border px-2 py-1 w-24" type="number" min={0} value={createInitialQty} onChange={(e) => setCreateInitialQty(e.target.value)} />
            </label>
            <button type="button" className="rounded bg-gray-800 px-3 py-1.5 text-sm font-medium text-white"
              onClick={() => {
                const catId = Number(createCatId);
                const name = createName.trim();
                if (!catId || !name) return toast.error("请选择分类并填写名称");
                const qtyNum = Number(createInitialQty);
                if (Number.isNaN(qtyNum) || qtyNum < 0) return toast.error("初始入库数量无效");
                createItemMut.mutate({
                  categoryId: catId, name,
                  stockMode: createMode,
                  stockQty: createMode === "FLAG" ? (qtyNum > 0 ? 1 : 0) : Math.floor(qtyNum),
                  shelfStatus: "PUBLISHED",
                  workflowType: createWorkflow,
                  reviewerIds: createReviewerIds || undefined,
                  secondReviewerIds: createSecondReviewerIds || undefined,
                }, { onSuccess: () => { setCreateName(""); setCreateInitialQty("0"); } });
              }}>创建</button>
          </div>
          {createWorkflow !== "SIMPLE" && (
            <div className="flex flex-wrap gap-2 text-xs">
              <label className="flex flex-col gap-1"><span className="text-gray-400">审核人ID（逗号分隔）</span>
                <input className="rounded border px-2 py-1 w-48" placeholder="user1,user2" value={createReviewerIds} onChange={(e) => setCreateReviewerIds(e.target.value)} />
              </label>
              {createWorkflow === "DUAL_REVIEW" && (
                <label className="flex flex-col gap-1"><span className="text-gray-400">复审人ID（逗号分隔）</span>
                  <input className="rounded border px-2 py-1 w-48" placeholder="user3,user4" value={createSecondReviewerIds} onChange={(e) => setCreateSecondReviewerIds(e.target.value)} />
                </label>
              )}
            </div>
          )}
        </div>

        {/* 物品卡片 */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => {
            const panelOpen = cardPanel?.itemId === it.id;
            const inboundOpen = panelOpen && cardPanel?.kind === "inbound";
            const stockOpen = panelOpen && cardPanel?.kind === "stock";
            return (
              <div key={it.id} className="relative rounded-lg border bg-white p-3 shadow-sm flex flex-col gap-2">
                <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1 max-w-[58%]">
                  <button type="button" className={`rounded px-2 py-0.5 text-[11px] font-medium border ${inboundOpen ? "border-sky-300 bg-sky-50 text-sky-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                    onClick={() => (inboundOpen ? closePanel() : openInbound(it))}>入库</button>
                  {it.stockMode === "QUANTIFIED" && (
                    <button type="button" className={`rounded px-2 py-0.5 text-[11px] font-medium border ${stockOpen ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                      onClick={() => (stockOpen ? closePanel() : openStock(it))}>修改库存</button>
                  )}
                </div>
                <div className="pr-[52%]">
                  <div className="font-medium leading-snug">{it.name}</div>
                  <div className="mt-1 text-xs text-gray-400">
                    ID {it.id} · {it.stockMode} · 库存 {it.stockQty} · {it.shelfStatus}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    {it.workflowType === "DUAL_REVIEW" ? "🔒 复核流程" : "✅ 简单流程"}
                    {it.reviewerIds ? ` · 审核人: ${it.reviewerIds}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs pt-1 border-t">
                  <button type="button" className="rounded px-2 py-1 text-xs text-blue-600"
                    onClick={() => { const name = window.prompt("名称", it.name); if (!name) return; updateItemMut.mutate({ id: it.id, body: { name, shelfStatus: it.shelfStatus, stockMode: it.stockMode, workflowType: it.workflowType } }); }}>改名</button>
                  <button type="button" className="rounded px-2 py-1 text-xs text-red-600"
                    onClick={() => { if (!window.confirm("删除该物品？")) return; deleteItemMut.mutate(it.id, { onSuccess: () => { if (cardPanel?.itemId === it.id) closePanel(); } }); }}>删除</button>
                </div>

                {inboundOpen && (
                  <div className="rounded-md border border-sky-100 bg-sky-50/60 p-2 text-sm space-y-2">
                    <div className="text-xs text-sky-900">{it.stockMode === "FLAG" ? "有无型入库将标记为有货。" : "按数量增加库存。"}</div>
                    {it.stockMode === "QUANTIFIED" && <input className="w-full rounded border px-2 py-1 text-sm" type="number" min={1} value={panelQty} onChange={(e) => setPanelQty(e.target.value)} />}
                    <div className="flex gap-2">
                      <button type="button" className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white"
                        onClick={() => { const q = it.stockMode === "FLAG" ? 1 : Number(panelQty); if (!q || q <= 0) return toast.error("数量无效"); inboundMut.mutate({ itemId: it.id, qty: q }, { onSuccess: () => closePanel() }); }}>确认入库</button>
                      <button type="button" className="rounded border px-3 py-1 text-xs" onClick={closePanel}>取消</button>
                    </div>
                  </div>
                )}
                {stockOpen && it.stockMode === "QUANTIFIED" && (
                  <div className="rounded-md border border-amber-100 bg-amber-50/60 p-2 text-sm space-y-2">
                    <div className="text-xs text-amber-900">将库存直接设为新数值（非增量）。</div>
                    <input className="w-full rounded border px-2 py-1 text-sm" type="number" min={0} value={panelNewStock} onChange={(e) => setPanelNewStock(e.target.value)} />
                    <div className="flex gap-2">
                      <button type="button" className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white"
                        onClick={() => { const n = Number(panelNewStock); if (Number.isNaN(n) || n < 0) return toast.error("无效库存"); adjustMut.mutate({ id: it.id, newQty: n }, { onSuccess: () => closePanel() }); }}>保存</button>
                      <button type="button" className="rounded border px-3 py-1 text-xs" onClick={closePanel}>取消</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {items.length === 0 && <p className="text-gray-400 text-center py-8">当前筛选下暂无物品</p>}

        {/* 回收站 */}
        {recycleOpen && (
          <div className="mt-2 space-y-3 rounded-lg border bg-gray-50 p-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">物品回收站（7天后自动清空）</h4>
              <button type="button" className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                disabled={purgeAllMut.isPending}
                onClick={() => { if (!window.confirm("确认一键清空回收站？")) return; purgeAllMut.mutate(undefined, { onSuccess: () => setRecyclePage(1) }); }}>一键清空</button>
            </div>
            <div className="space-y-2">
              {recycleRows.map((it) => (
                <div key={it.id} className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm">
                  <div><div className="font-medium">{it.name}</div><div className="text-xs text-gray-400">ID {it.id}</div></div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                      onClick={() => restoreMut.mutate(it.id)} disabled={restoreMut.isPending}>恢复</button>
                    <button type="button" className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                      onClick={() => { if (!window.confirm(`确认彻底删除 ${it.name}？`)) return; purgeMut.mutate([it.id]); }} disabled={purgeMut.isPending}>彻底删除</button>
                  </div>
                </div>
              ))}
              {recycleRows.length === 0 && <p className="text-gray-400 text-center py-4">回收站为空</p>}
            </div>
            <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
              <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={recyclePage <= 1} onClick={() => setRecyclePage((p) => Math.max(1, p - 1))}>上一页</button>
              <span>第 {recyclePage} 页，共 {recycleTotal} 条</span>
              <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={recyclePage * 20 >= recycleTotal} onClick={() => setRecyclePage((p) => p + 1)}>下一页</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
