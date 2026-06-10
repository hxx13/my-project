/**
 * 物资管理页 — 分类管理、物品上架/入库/库存调整、回收站。
 * 与 AdminSuppliesManagePage 同类定位但独立设计：
 * - 物品级审核流程配置（SIMPLE / DUAL_REVIEW）
 * - 审核人账号指派（初审人 / 复审人）
 * - 物品封面上传与预览
 * - 内联编辑弹窗替代 window.prompt
 */
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  useAdminMaterialCategories, useAdminMaterialItems, useAdminMaterialRecycle,
  useCreateAdminMaterialCategory, useUpdateAdminMaterialCategory, useDeleteAdminMaterialCategory,
  useCreateAdminMaterialItem, useUpdateAdminMaterialItem, useDeleteAdminMaterialItem,
  useRestoreAdminMaterialRecycle, usePurgeAdminMaterialRecycle, usePurgeAllAdminMaterialRecycle,
  useInboundMaterialItem, useAdjustMaterialStock,
} from "@/api/hooks/useMaterial";
import type { MaterialItem } from "@/api/domains/material.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { webImageSrc } from "@/utils/mediaUrl";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";
import DataSkeleton from "@/components/ui/DataSkeleton";

/* ────── 类型 ────── */
type CardPanel = null | { itemId: number; kind: "inbound" | "stock" };
interface EditDraft {
  name: string;
  subtitle: string;
  shelfStatus: string;
  stockMode: string;
  workflowType: string;
  reviewerIds: string;
  secondReviewerIds: string;
}

/* ────── 小工具 ────── */
const STOCK_MODE_ZH: Record<string, string> = { QUANTIFIED: "数量型", FLAG: "有无型", LIMITED: "限量", UNLIMITED: "无限" };
const SHELF_ZH: Record<string, string> = { DRAFT: "草稿", PUBLISHED: "已上架", ARCHIVED: "已归档" };

export default function MaterialManagePage() {
  /* ── 筛选状态 ── */
  const [filterCat, setFilterCat] = useState<number | "">("");
  const [filterWorkflow, setFilterWorkflow] = useState<"" | "SIMPLE" | "DUAL_REVIEW">("");
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [recyclePage, setRecyclePage] = useState(1);

  /* ── 分类 ── */
  const [newCatName, setNewCatName] = useState("");

  /* ── 创建物品 ── */
  const [createCatId, setCreateCatId] = useState<number | "">("");
  const [createName, setCreateName] = useState("");
  const [createSubtitle, setCreateSubtitle] = useState("");
  const [createMode, setCreateMode] = useState<"QUANTIFIED" | "FLAG">("QUANTIFIED");
  const [createWorkflow, setCreateWorkflow] = useState<"SIMPLE" | "DUAL_REVIEW">("SIMPLE");
  const [createReviewerIds, setCreateReviewerIds] = useState("");
  const [createSecondReviewerIds, setCreateSecondReviewerIds] = useState("");
  const [createCoverUrl, setCreateCoverUrl] = useState("");
  const [createInitialQty, setCreateInitialQty] = useState("0");
  const [createUploading, setCreateUploading] = useState(false);

  /* ── 物品卡片面板 ── */
  const [cardPanel, setCardPanel] = useState<CardPanel>(null);
  const [panelQty, setPanelQty] = useState("1");
  const [panelNewStock, setPanelNewStock] = useState("");

  /* ── 内联编辑弹窗 ── */
  const [editingItem, setEditingItem] = useState<MaterialItem | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: "", subtitle: "", shelfStatus: "PUBLISHED", stockMode: "QUANTIFIED", workflowType: "SIMPLE", reviewerIds: "", secondReviewerIds: "" });
  const [editCoverUrl, setEditCoverUrl] = useState("");
  const [editUploading, setEditUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── 数据 ── */
  const { data: categories = [] } = useAdminMaterialCategories();
  const { data: items = [], isLoading: itemsLoading } = useAdminMaterialItems(filterCat === "" ? undefined : filterCat);
  const { data: recycleData } = useAdminMaterialRecycle({ page: recyclePage, size: 20 });
  const recycleRows = recycleData?.data ?? [];
  const recycleTotal = recycleData?.total ?? 0;

  /* ── mutations ── */
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

  /* ── 筛选后的物品 ── */
  const filteredItems = filterWorkflow ? items.filter(it => it.workflowType === filterWorkflow) : items;

  /* ── 面板开关 ── */
  const openInbound = (it: MaterialItem) => { setCardPanel({ itemId: it.id, kind: "inbound" }); setPanelQty("1"); };
  const openStock = (it: MaterialItem) => { setCardPanel({ itemId: it.id, kind: "stock" }); setPanelNewStock(String(it.stockQty ?? 0)); };
  const closePanel = () => setCardPanel(null);

  /* ── 内联编辑 ── */
  const openEdit = (it: MaterialItem) => {
    setEditingItem(it);
    setEditDraft({ name: it.name, subtitle: it.subtitle || "", shelfStatus: it.shelfStatus, stockMode: it.stockMode, workflowType: it.workflowType || "SIMPLE", reviewerIds: it.reviewerIds || "", secondReviewerIds: it.secondReviewerIds || "" });
    setEditCoverUrl(it.coverUrl || "");
  };
  const closeEdit = () => setEditingItem(null);

  const saveEdit = () => {
    if (!editingItem) return;
    updateItemMut.mutate({ id: editingItem.id, body: { name: editDraft.name, subtitle: editDraft.subtitle, shelfStatus: editDraft.shelfStatus, stockMode: editDraft.stockMode, workflowType: editDraft.workflowType, reviewerIds: editDraft.reviewerIds || undefined, secondReviewerIds: editDraft.secondReviewerIds || undefined, coverUrl: editCoverUrl || undefined } }, { onSuccess: () => closeEdit() });
  };

  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditUploading(true);
    try {
      const url = await uploadSingleImage(file);
      setEditCoverUrl(url);
      toast.success("图片上传成功");
    } catch { toast.error("图片上传失败"); }
    finally { setEditUploading(false); }
  };

  const handleCreateImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCreateUploading(true);
    try {
      const url = await uploadSingleImage(file);
      setCreateCoverUrl(url);
      toast.success("图片上传成功");
    } catch { toast.error("图片上传失败"); }
    finally { setCreateUploading(false); }
  };

  /* ── 渲染 ── */
  return (
    <div className="space-y-8">
      <AdminSubPageHeader fallbackTo="/admin/material/review" backLabel="返回申领审核" title="物品管理"
        description="管理物资分类、物品上架、入库补货与库存调整。可逐物品配置审核流程与审核人。" />

      {/* ═══════════ 分类管理 ═══════════ */}
      <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 space-y-3 shadow-twin-level-1">
        <h3 className="font-medium text-[var(--twin-ink)]">分类管理</h3>
        <div className="flex flex-wrap gap-2">
          <input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm text-[var(--twin-ink)]"
            placeholder="新分类名称" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
          <button type="button" className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-sm font-medium text-[var(--twin-on-primary)]"
            onClick={() => { if (!newCatName.trim()) return toast.error("填写名称"); createCatMut.mutate({ name: newCatName.trim(), sortOrder: 0 }, { onSuccess: () => setNewCatName("") }); }}>新增分类</button>
        </div>
        <div className="space-y-1 text-sm">
          {categories.map(c => (
            <div key={c.id} className="flex items-center justify-between rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="text-[var(--twin-ink)] font-medium">{c.name}</span>
                <span className="text-xs text-[var(--twin-mute)]">排序 {c.sortOrder}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${c.status === 1 ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>{c.status === 1 ? "启用" : "禁用"}</span>
              </div>
              <div className="flex gap-1">
                <button type="button" className="rounded-twin-sm px-2 py-0.5 text-xs font-medium text-[var(--twin-link-deep)]"
                  onClick={() => { const name = window.prompt("分类名称", c.name); if (!name) return; updateCatMut.mutate({ id: c.id, body: { name, status: c.status, sortOrder: c.sortOrder } }); }}>改名</button>
                <button type="button" className="rounded-twin-sm px-2 py-0.5 text-xs font-medium text-red-600"
                  onClick={() => { if (!window.confirm("删除分类？")) return; deleteCatMut.mutate(c.id); }}>删除</button>
              </div>
            </div>
          ))}
          {categories.length === 0 && <p className="text-center text-sm text-[var(--twin-mute)] py-4">暂无分类，请先新增</p>}
        </div>
      </section>

      {/* ═══════════ 物资网格 ═══════════ */}
      <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 space-y-4 shadow-twin-level-1">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-medium text-[var(--twin-ink)]">物资列表</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--twin-mute)] text-xs">分类</span>
            <select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]"
              value={filterCat === "" ? "" : String(filterCat)} onChange={e => setFilterCat(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">全部</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <span className="text-[var(--twin-mute)] text-xs ml-2">流程</span>
            <select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]"
              value={filterWorkflow} onChange={e => setFilterWorkflow(e.target.value as "" | "SIMPLE" | "DUAL_REVIEW")}>
              <option value="">全部</option>
              <option value="SIMPLE">简单流程</option>
              <option value="DUAL_REVIEW">复核流程</option>
            </select>
            <button type="button" className="rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs font-medium text-[var(--twin-body)]"
              onClick={() => { const next = !recycleOpen; setRecycleOpen(next); if (next) setRecyclePage(1); }}>{recycleOpen ? "收起回收站" : "回收站"}</button>
          </div>
        </div>

        {/* 快速新建 */}
        <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-4 space-y-3">
          <div className="text-sm font-medium text-[var(--twin-ink)]">新建物品</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
            <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">分类</span>
              <select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]"
                value={createCatId === "" ? "" : String(createCatId)} onChange={e => setCreateCatId(e.target.value === "" ? "" : Number(e.target.value))}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">名称 *</span>
              <input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" placeholder="物品名称" value={createName} onChange={e => setCreateName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">副标题</span>
              <input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" placeholder="简短描述" value={createSubtitle} onChange={e => setCreateSubtitle(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">封面图片</span>
              <span className="flex items-center gap-1">
                <input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 flex-1 text-xs text-[var(--twin-ink)]" placeholder="URL 或上传" value={createCoverUrl} onChange={e => setCreateCoverUrl(e.target.value)} readOnly />
                <label className="rounded-twin-sm bg-[var(--twin-canvas)] border border-[var(--twin-hairline)] px-2 py-1 text-xs cursor-pointer hover:bg-[var(--twin-canvas-soft)] text-[var(--twin-body)] whitespace-nowrap">
                  {createUploading ? "..." : "上传"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleCreateImageUpload} disabled={createUploading} />
                </label>
              </span>
            </label>
            <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">库存模式</span>
              <select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={createMode}
                onChange={e => setCreateMode(e.target.value === "FLAG" ? "FLAG" : "QUANTIFIED")}>
                <option value="QUANTIFIED">数量型</option>
                <option value="FLAG">有无型</option>
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">初始入库</span>
              <input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" type="number" min={0} value={createInitialQty} onChange={e => setCreateInitialQty(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">审核流程</span>
              <select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={createWorkflow}
                onChange={e => setCreateWorkflow(e.target.value as "SIMPLE" | "DUAL_REVIEW")}>
                <option value="SIMPLE">简单流程</option>
                <option value="DUAL_REVIEW">复核流程</option>
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">审核人ID（逗号分隔）</span>
              <input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" placeholder="留空=不限制" value={createReviewerIds} onChange={e => setCreateReviewerIds(e.target.value)} />
            </label>
            {createWorkflow === "DUAL_REVIEW" && (
              <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">复审人ID（逗号分隔）</span>
                <input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" placeholder="留空=不限制" value={createSecondReviewerIds} onChange={e => setCreateSecondReviewerIds(e.target.value)} />
              </label>
            )}
          </div>
          <button type="button" className="rounded-twin-sm bg-[var(--twin-ink)] px-4 py-1.5 text-sm font-medium text-white"
            onClick={() => {
              const catId = Number(createCatId);
              const name = createName.trim();
              if (!catId || !name) return toast.error("请选择分类并填写名称");
              const qtyNum = Number(createInitialQty);
              if (Number.isNaN(qtyNum) || qtyNum < 0) return toast.error("初始入库数量无效");
              createItemMut.mutate({
                categoryId: catId, name, subtitle: createSubtitle || undefined, coverUrl: createCoverUrl || undefined,
                stockMode: createMode, stockQty: createMode === "FLAG" ? (qtyNum > 0 ? 1 : 0) : Math.floor(qtyNum),
                shelfStatus: "PUBLISHED", workflowType: createWorkflow,
                reviewerIds: createReviewerIds || undefined, secondReviewerIds: createSecondReviewerIds || undefined,
              }, { onSuccess: () => { setCreateName(""); setCreateSubtitle(""); setCreateCoverUrl(""); setCreateInitialQty("0"); } });
            }}>创建物品</button>
        </div>

        {/* 物品卡片网格 */}
        {itemsLoading ? <DataSkeleton variant="card" rows={6} /> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map(it => {
            const panelOpen = cardPanel?.itemId === it.id;
            const inboundOpen = panelOpen && cardPanel?.kind === "inbound";
            const stockOpen = panelOpen && cardPanel?.kind === "stock";
            const imgSrc = webImageSrc(it.coverUrl);
            return (
              <div key={it.id} className="relative rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-1 overflow-hidden">
                {/* 顶部图片区 */}
                <div className="h-[100px] bg-[var(--twin-canvas-soft)] flex items-center justify-center border-b border-[var(--twin-hairline)]">
                  {imgSrc ? <img src={imgSrc} alt={it.name} className="h-full w-full object-cover" />
                    : <span className="text-xs text-[var(--twin-mute)]">暂无图片</span>}
                </div>
                {/* 操作栏 */}
                <div className="absolute top-2 right-2 flex gap-1">
                  <button type="button" className={`rounded-twin-sm px-2 py-0.5 text-[11px] font-medium border transition-colors ${inboundOpen ? "border-sky-300 bg-sky-50 text-sky-700" : "border-[var(--twin-hairline)] bg-white/90 text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"}`}
                    onClick={() => inboundOpen ? closePanel() : openInbound(it)}>入库</button>
                  {it.stockMode !== "FLAG" && (
                    <button type="button" className={`rounded-twin-sm px-2 py-0.5 text-[11px] font-medium border transition-colors ${stockOpen ? "border-amber-300 bg-amber-50 text-amber-800" : "border-[var(--twin-hairline)] bg-white/90 text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"}`}
                      onClick={() => stockOpen ? closePanel() : openStock(it)}>库存</button>
                  )}
                </div>
                {/* 信息区 */}
                <div className="p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-[var(--twin-ink)] truncate">{it.name}</div>
                      {it.subtitle && <div className="text-xs text-[var(--twin-mute)] truncate mt-0.5">{it.subtitle}</div>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    <span className={`px-1.5 py-0.5 rounded-full ${it.shelfStatus === "PUBLISHED" ? "bg-green-50 text-green-700" : it.shelfStatus === "DRAFT" ? "bg-gray-100 text-gray-500" : "bg-amber-50 text-amber-700"}`}>{SHELF_ZH[it.shelfStatus] || it.shelfStatus}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">{STOCK_MODE_ZH[it.stockMode] || it.stockMode}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">库存 {it.stockQty}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[var(--twin-mute)]">
                    <span className={it.workflowType === "DUAL_REVIEW" ? "text-amber-600 font-medium" : "text-green-600"}>
                      {it.workflowType === "DUAL_REVIEW" ? "复核流程" : "简单流程"}
                    </span>
                    {it.reviewerIds && <span className="truncate">审核人: {it.reviewerIds}</span>}
                    {!it.reviewerIds && <span>审核不限</span>}
                  </div>
                  <div className="flex items-center gap-1 pt-1.5 border-t border-[var(--twin-hairline)] text-xs">
                    <button type="button" className="rounded-twin-sm px-2 py-1 text-[var(--twin-link-deep)] hover:bg-[var(--twin-canvas-soft)]"
                      onClick={() => openEdit(it)}>编辑</button>
                    <label className="rounded-twin-sm px-2 py-1 text-[var(--twin-link-deep)] hover:bg-[var(--twin-canvas-soft)] cursor-pointer">
                      上传图片
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        try { const url = await uploadSingleImage(file); updateItemMut.mutate({ id: it.id, body: { coverUrl: url } }, { onSuccess: () => toast.success("图片已更新") }); } catch { toast.error("上传失败"); }
                      }} />
                    </label>
                    <button type="button" className="rounded-twin-sm px-2 py-1 text-red-600 hover:bg-red-50"
                      onClick={() => { if (!window.confirm("删除该物品？")) return; deleteItemMut.mutate(it.id, { onSuccess: () => { if (cardPanel?.itemId === it.id) closePanel(); } }); }}>删除</button>
                  </div>
                </div>
                {/* 入库 / 库存面板 */}
                {inboundOpen && (
                  <div className="border-t border-[var(--twin-hairline)] bg-sky-50/60 p-3 space-y-2">
                    <div className="text-xs text-sky-900">{it.stockMode === "FLAG" ? "有无型入库标记为有货。" : "按数量增加库存。"}</div>
                    {it.stockMode !== "FLAG" && <input className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm text-[var(--twin-ink)]" type="number" min={1} value={panelQty} onChange={e => setPanelQty(e.target.value)} />}
                    <div className="flex gap-2">
                      <button type="button" className="rounded-twin-sm bg-sky-600 px-4 py-1.5 text-xs font-medium text-white"
                        onClick={() => { const q = it.stockMode === "FLAG" ? 1 : Number(panelQty); if (!q || q <= 0) return toast.error("数量无效"); inboundMut.mutate({ itemId: it.id, qty: q }, { onSuccess: () => closePanel() }); }}>确认入库</button>
                      <button type="button" className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs text-[var(--twin-body)]" onClick={closePanel}>取消</button>
                    </div>
                  </div>
                )}
                {stockOpen && it.stockMode !== "FLAG" && (
                  <div className="border-t border-[var(--twin-hairline)] bg-amber-50/60 p-3 space-y-2">
                    <div className="text-xs text-amber-900">直接设为新数值（非增量）。</div>
                    <input className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm text-[var(--twin-ink)]" type="number" min={0} value={panelNewStock} onChange={e => setPanelNewStock(e.target.value)} />
                    <div className="flex gap-2">
                      <button type="button" className="rounded-twin-sm bg-amber-600 px-4 py-1.5 text-xs font-medium text-white"
                        onClick={() => { const n = Number(panelNewStock); if (Number.isNaN(n) || n < 0) return toast.error("无效库存"); adjustMut.mutate({ id: it.id, newQty: n }, { onSuccess: () => closePanel() }); }}>保存</button>
                      <button type="button" className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs text-[var(--twin-body)]" onClick={closePanel}>取消</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!itemsLoading && filteredItems.length === 0 && <p className="text-center text-sm text-[var(--twin-mute)] py-8">当前筛选下暂无物品</p>}

        {/* 内联编辑弹窗 */}
        {editingItem && (
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40" onClick={closeEdit}>
            <div className="bg-[var(--twin-canvas)] rounded-twin-xl border border-[var(--twin-hairline)] shadow-twin-level-4 w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between"><h3 className="font-medium text-[var(--twin-ink)]">编辑 {editingItem.name}</h3><button onClick={closeEdit} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)] text-lg leading-none">&times;</button></div>
              {/* 图片 */}
              <div className="flex items-center gap-3">
                <div className="size-20 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] flex items-center justify-center overflow-hidden shrink-0">
                  {webImageSrc(editCoverUrl) ? <img src={webImageSrc(editCoverUrl)} alt="" className="size-full object-cover" /> : <span className="text-[10px] text-[var(--twin-mute)]">无图片</span>}
                </div>
                <div className="flex-1 space-y-1">
                  <input className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-xs text-[var(--twin-ink)]" placeholder="图片 URL" value={editCoverUrl} onChange={e => setEditCoverUrl(e.target.value)} />
                  <label className={`inline-block rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs cursor-pointer hover:bg-[var(--twin-canvas-soft)] text-[var(--twin-body)] ${editUploading ? "opacity-50" : ""}`}>
                    {editUploading ? "上传中..." : "上传新图片"}
                    <input type="file" accept="image/*" className="hidden" onChange={handleEditImageUpload} disabled={editUploading} />
                  </label>
                </div>
              </div>
              {/* 字段 */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">名称</span><input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={editDraft.name} onChange={e => setEditDraft({ ...editDraft, name: e.target.value })} /></label>
                <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">副标题</span><input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={editDraft.subtitle} onChange={e => setEditDraft({ ...editDraft, subtitle: e.target.value })} /></label>
                <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">上架状态</span>
                  <select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={editDraft.shelfStatus} onChange={e => setEditDraft({ ...editDraft, shelfStatus: e.target.value })}>
                    <option value="DRAFT">草稿</option><option value="PUBLISHED">已上架</option><option value="ARCHIVED">已归档</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">库存模式</span>
                  <select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={editDraft.stockMode} onChange={e => setEditDraft({ ...editDraft, stockMode: e.target.value })}>
                    <option value="QUANTIFIED">数量型</option><option value="FLAG">有无型</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 col-span-2"><span className="text-xs text-[var(--twin-mute)]">审核流程</span>
                  <select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={editDraft.workflowType} onChange={e => setEditDraft({ ...editDraft, workflowType: e.target.value })}>
                    <option value="SIMPLE">简单流程</option><option value="DUAL_REVIEW">复核流程</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 col-span-2"><span className="text-xs text-[var(--twin-mute)]">审核人ID（逗号分隔，留空=不限制）</span><input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={editDraft.reviewerIds} onChange={e => setEditDraft({ ...editDraft, reviewerIds: e.target.value })} /></label>
                {editDraft.workflowType === "DUAL_REVIEW" && (
                  <label className="flex flex-col gap-1 col-span-2"><span className="text-xs text-[var(--twin-mute)]">复审人ID（逗号分隔，留空=不限制）</span><input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={editDraft.secondReviewerIds} onChange={e => setEditDraft({ ...editDraft, secondReviewerIds: e.target.value })} /></label>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--twin-hairline)]">
                <button type="button" className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-4 py-1.5 text-sm text-[var(--twin-body)]" onClick={closeEdit}>取消</button>
                <button type="button" className="rounded-twin-sm bg-[var(--twin-primary)] px-4 py-1.5 text-sm font-medium text-[var(--twin-on-primary)]" onClick={saveEdit} disabled={updateItemMut.isPending}>保存</button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ═══════════ 回收站 ═══════════ */}
      {recycleOpen && (
        <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-4 space-y-3 shadow-twin-level-1">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-[var(--twin-ink)]">回收站</h3>
            <button type="button" className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              disabled={purgeAllMut.isPending} onClick={() => { if (!window.confirm("确认一键清空？")) return; purgeAllMut.mutate(undefined, { onSuccess: () => setRecyclePage(1) }); }}>一键清空</button>
          </div>
          <div className="text-xs text-[var(--twin-mute)]">物品删除后保留 7 天，到期自动清除。</div>
          <div className="space-y-2">
            {recycleRows.map(it => (
              <div key={it.id} className="flex items-center justify-between rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm">
                <div><div className="font-medium text-[var(--twin-ink)]">{it.name}</div><div className="text-xs text-[var(--twin-mute)]">ID {it.id}</div></div>
                <div className="flex gap-2">
                  <button type="button" className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700" onClick={() => restoreMut.mutate(it.id)}>恢复</button>
                  <button type="button" className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700" onClick={() => { if (!window.confirm(`彻底删除 ${it.name}？`)) return; purgeMut.mutate([it.id]); }}>彻底删除</button>
                </div>
              </div>
            ))}
            {recycleRows.length === 0 && <p className="text-center text-sm text-[var(--twin-mute)] py-4">回收站为空</p>}
          </div>
          {recycleTotal > 20 && (
            <div className="flex justify-end items-center gap-2 text-xs text-[var(--twin-body)]">
              <button className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-40" disabled={recyclePage <= 1} onClick={() => setRecyclePage(p => p - 1)}>上一页</button>
              <span>第 {recyclePage} 页 / 共 {Math.ceil(recycleTotal / 20)} 页</span>
              <button className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-40" disabled={recyclePage * 20 >= recycleTotal} onClick={() => setRecyclePage(p => p + 1)}>下一页</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
