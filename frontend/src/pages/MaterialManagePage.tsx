/**
 * 物资管理页 — 分类+创建融合、审核人人员选择器、图片拖拽粘贴上传、学生预览、回收站。
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Eye, EyeOff, X, ZoomIn } from "lucide-react";
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
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import StaffReviewerPicker from "@/components/admin/StaffReviewerPicker";
import DataSkeleton from "@/components/ui/DataSkeleton";

/* ────── 小工具 ────── */
const MODE_ZH: Record<string, string> = { QUANTIFIED: "数量型", FLAG: "有无型", LIMITED: "限量", UNLIMITED: "无限" };
const SHELF_ZH: Record<string, string> = { DRAFT: "草稿", PUBLISHED: "已上架", ARCHIVED: "已归档" };

type CardPanel = null | { itemId: number; kind: "inbound" | "stock" };

export default function MaterialManagePage() {
  /* ── 筛选 ── */
  const [filterCat, setFilterCat] = useState<number | "">("");
  const [filterWorkflow, setFilterWorkflow] = useState<"" | "SIMPLE" | "DUAL_REVIEW" | "SKIP_REVIEW">("");
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [recyclePage, setRecyclePage] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);

  /* ── 分类 ── */
  const [newCatName, setNewCatName] = useState("");

  /* ── 创建物品 ── */
  const [createCatId, setCreateCatId] = useState<number | "">("");
  const [createName, setCreateName] = useState("");
  const [createSubtitle, setCreateSubtitle] = useState("");
  const [createMode, setCreateMode] = useState<"QUANTIFIED" | "FLAG">("QUANTIFIED");
  const [createWorkflow, setCreateWorkflow] = useState<"SIMPLE" | "DUAL_REVIEW" | "SKIP_REVIEW">("SIMPLE");
  const [createReviewerIds, setCreateReviewerIds] = useState("[]");
  const [createSecondReviewerIds, setCreateSecondReviewerIds] = useState("[]");
  const [createCoverUrl, setCreateCoverUrl] = useState("");
  const [createInitialQty, setCreateInitialQty] = useState("0");
  const [createUploading, setCreateUploading] = useState(false);
  const [showStockQty, setShowStockQty] = useState(true);
  const [editShowStockQty, setEditShowStockQty] = useState(true);
  const [editCoverUrl, setEditCoverUrl] = useState("");
  const [editReviewerIds, setEditReviewerIds] = useState("[]");
  const [editSecondReviewerIds, setEditSecondReviewerIds] = useState("[]");
  const [editUploading, setEditUploading] = useState(false);

  /* ── 规格配置 ── */
  const [createSpecEnabled, setCreateSpecEnabled] = useState(false);
  const [createSpecDimensions, setCreateSpecDimensions] = useState<{ name: string; options: string[] }[]>([]);
  const [createSpecRequired, setCreateSpecRequired] = useState(false);
  const [editSpecEnabled, setEditSpecEnabled] = useState(false);
  const [editSpecDimensions, setEditSpecDimensions] = useState<{ name: string; options: string[] }[]>([]);
  const [editSpecRequired, setEditSpecRequired] = useState(false);

  /* ── 独立下单 ── */
  const [createIndependentOrder, setCreateIndependentOrder] = useState(false);
  const [editIndependentOrder, setEditIndependentOrder] = useState(false);

  /* ── 通知提前量 ── */
  const [createNotifyAdvanceHours, setCreateNotifyAdvanceHours] = useState("0");
  const [editNotifyAdvanceHours, setEditNotifyAdvanceHours] = useState("0");

  /* ── 面板 ── */
  const [cardPanel, setCardPanel] = useState<CardPanel>(null);
  const [panelQty, setPanelQty] = useState("1");
  const [panelNewStock, setPanelNewStock] = useState("");
  const [editingItem, setEditingItem] = useState<MaterialItem | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  /* ── 数据 ── */
  const { data: categories = [] } = useAdminMaterialCategories();
  const { data: items = [], isLoading: itemsLoading } = useAdminMaterialItems(filterCat === "" ? undefined : filterCat);
  const { data: recycleData } = useAdminMaterialRecycle({ page: recyclePage, size: 20 });
  const recycleRows = recycleData?.data ?? [];
  const recycleTotal = recycleData?.total ?? 0;

  const [previewCatId, setPreviewCatId] = useState<number | undefined>();

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

  useEffect(() => { if (categories.length > 0 && createCatId === "") setCreateCatId(categories[0].id); }, [categories, createCatId]);

  const filteredItems = filterWorkflow ? items.filter(it => it.workflowType === filterWorkflow) : items;

  /* ── 面板开关 ── */
  const openInbound = (it: MaterialItem) => { setCardPanel({ itemId: it.id, kind: "inbound" }); setPanelQty("1"); };
  const openStock = (it: MaterialItem) => { setCardPanel({ itemId: it.id, kind: "stock" }); setPanelNewStock(String(it.stockQty ?? 0)); };
  const closePanel = () => setCardPanel(null);

  /* ── 图片上传（拖拽/粘贴/点击） ── */
  const uploadAndSet = async (file: File, setUrl: (u: string) => void, setLoading: (v: boolean) => void) => {
    setLoading(true);
    try { const url = (await uploadSingleImage(file)).publicUrl; setUrl(url); toast.success("图片上传成功"); }
    catch { toast.error("图片上传失败"); }
    finally { setLoading(false); }
  };

  const [dragOverCreate, setDragOverCreate] = useState(false);
  const [dragOverEdit, setDragOverEdit] = useState(false);

  const handleDropCreate = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOverCreate(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) uploadAndSet(f, setCreateCoverUrl, setCreateUploading); }, []);
  const handleDropEdit = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOverEdit(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) uploadAndSet(f, setEditCoverUrl, setEditUploading); }, []);
  const handlePasteCreate = useCallback((e: React.ClipboardEvent) => { const f = e.clipboardData.files[0]; if (f?.type.startsWith("image/")) { e.preventDefault(); uploadAndSet(f, setCreateCoverUrl, setCreateUploading); } }, []);

  /* ── 快速创建 ── */
  const doCreate = () => {
    const catId = Number(createCatId); const name = createName.trim();
    if (!catId || !name) return toast.error("请选择分类并填写名称");
    const qtyNum = Number(createInitialQty);
    if (Number.isNaN(qtyNum) || qtyNum < 0) return toast.error("初始入库数量无效");
    createItemMut.mutate({
      categoryId: catId, name, subtitle: createSubtitle || undefined, coverUrl: createCoverUrl || undefined,
      stockMode: createMode, stockQty: createMode === "FLAG" ? (qtyNum > 0 ? 1 : 0) : Math.floor(qtyNum),
      shelfStatus: "PUBLISHED", workflowType: createWorkflow,
      reviewerIds: createReviewerIds !== "[]" ? createReviewerIds : undefined,
      secondReviewerIds: createSecondReviewerIds !== "[]" ? createSecondReviewerIds : undefined,
      showStockQty: showStockQty ? 1 : 0,
      specSchema: createSpecEnabled && createSpecDimensions.length > 0
        ? JSON.stringify({ dimensions: createSpecDimensions.filter(d => d.name.trim() && d.options.filter(o => o.trim()).length >= 2) })
        : undefined,
      specRequired: createSpecEnabled && createSpecRequired ? 1 : 0,
      independentOrder: createIndependentOrder ? 1 : 0,
      notifyAdvanceHours: Number(createNotifyAdvanceHours) || 0,
    }, { onSuccess: () => { setCreateName(""); setCreateSubtitle(""); setCreateCoverUrl(""); setCreateInitialQty("0"); setCreateSpecEnabled(false); setCreateSpecDimensions([]); setCreateSpecRequired(false); setCreateIndependentOrder(false); setCreateNotifyAdvanceHours("0"); } });
  };

  /* ── 内联编辑保存 ── */
  const saveEdit = () => {
    if (!editingItem) return;
    updateItemMut.mutate({
      id: editingItem.id,
      body: {
        name: editingItem.name,
        subtitle: editingItem.subtitle,
        shelfStatus: editingItem.shelfStatus,
        stockMode: editingItem.stockMode,
        workflowType: editingItem.workflowType,
        coverUrl: editCoverUrl !== null ? editCoverUrl : undefined,
        showStockQty: editShowStockQty ? 1 : 0,
        specSchema: editSpecEnabled && editSpecDimensions.length > 0
          ? JSON.stringify({ dimensions: editSpecDimensions.filter(d => d.name.trim() && d.options.filter(o => o.trim()).length >= 2) })
          : undefined,
        specRequired: editSpecEnabled && editSpecRequired ? 1 : 0,
        independentOrder: editIndependentOrder ? 1 : 0,
        notifyAdvanceHours: Number(editNotifyAdvanceHours) || 0,
        reviewerIds: editReviewerIds !== "[]" ? editReviewerIds : "[]",
        secondReviewerIds: editingItem.workflowType === "DUAL_REVIEW" && editSecondReviewerIds !== "[]" ? editSecondReviewerIds : "[]",
      },
    }, { onSuccess: () => setEditingItem(null) });
  };

  /* ── 渲染 ── */
  return (
    <div className="space-y-8">
      <AdminSubPageHeader fallbackTo="/admin/material/review" backLabel="返回学生审核" title="物品管理"
        description="管理分类与物品上架。支持审核流程逐物品配置、审核人从人员库选择、图片拖拽粘贴上传。" />

      {/* ═══════════ 分类 + 创建（融合区） ═══════════ */}
      <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 space-y-4 shadow-twin-level-1">
        <h3 className="font-medium text-[var(--twin-ink)]">分类管理与新建物品</h3>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* 左：分类列表 */}
          <div className="lg:col-span-2 space-y-2">
            <div className="flex gap-2">
              <input className="flex-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm text-[var(--twin-ink)]"
                placeholder="新分类名称" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
              <button type="button" className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-sm font-medium text-[var(--twin-on-primary)] shrink-0"
                onClick={() => { if (!newCatName.trim()) return toast.error("填写名称"); createCatMut.mutate({ name: newCatName.trim(), sortOrder: 0 }, { onSuccess: () => setNewCatName("") }); }}>新增</button>
            </div>
            <div className="space-y-1 max-h-[360px] overflow-y-auto">
              {categories.map(c => (
                <div key={c.id} className={`flex items-center justify-between rounded-twin-sm border px-2 py-1.5 text-sm cursor-pointer transition-colors ${createCatId === c.id ? "border-[var(--twin-primary)] bg-[var(--twin-primary)]/5" : "border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]"}`}
                  onClick={() => setCreateCatId(c.id)}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[var(--twin-ink)] font-medium truncate">{c.name}</span>
                    <span className={`text-[10px] px-1 rounded-full ${c.status === 1 ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>{c.status === 1 ? "启用" : "禁用"}</span>
                  </div>
                  <div className="flex gap-0.5 shrink-0 ml-2">
                    <button type="button" className="rounded-twin-sm px-1.5 py-0.5 text-[11px] text-[var(--twin-link-deep)]" onClick={(e) => { e.stopPropagation(); const name = window.prompt("分类名称", c.name); if (!name) return; updateCatMut.mutate({ id: c.id, body: { name, status: c.status, sortOrder: c.sortOrder } }); }}>改</button>
                    <button type="button" className="rounded-twin-sm px-1.5 py-0.5 text-[11px] text-red-500" onClick={(e) => { e.stopPropagation(); if (!window.confirm("删除分类？")) return; deleteCatMut.mutate(c.id); }}>删</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右：新建物品 */}
          <div className="lg:col-span-3 space-y-3 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
            <div className="text-sm font-medium text-[var(--twin-ink)]">新建物品 {createCatId ? `→ ${categories.find(c => c.id === createCatId)?.name || ""}` : ""}</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">名称 *</span>
                <input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={createName} onChange={e => setCreateName(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">副标题</span>
                <input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={createSubtitle} onChange={e => setCreateSubtitle(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">库存模式</span>
                <select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={createMode} onChange={e => setCreateMode(e.target.value as "QUANTIFIED" | "FLAG")}><option value="QUANTIFIED">数量型</option><option value="FLAG">有无型</option></select>
              </label>
              <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">初始库存</span>
                <input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" type="number" min={0} value={createInitialQty} onChange={e => setCreateInitialQty(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">审核流程</span>
                <select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={createWorkflow} onChange={e => setCreateWorkflow(e.target.value as "SIMPLE" | "DUAL_REVIEW" | "SKIP_REVIEW")}><option value="SIMPLE">简单流程</option><option value="DUAL_REVIEW">复核流程</option><option value="SKIP_REVIEW">免审流程</option></select>
              </label>
              <label className="flex items-center gap-2 pt-4"><AdminSwitchScaled size="3.5" checked={showStockQty} onChange={(checked) => setShowStockQty(checked)} /><span className="text-xs text-[var(--twin-body)]">学生端显示具体库存数字</span></label>
              {/* ── 规格配置 ── */}
              <label className="flex items-center gap-2 col-span-2 pt-2">
                <AdminSwitchScaled size="3.5" checked={createSpecEnabled} onChange={(checked) => setCreateSpecEnabled(checked)} />
                <span className="text-xs text-[var(--twin-body)]">启用规格（学生需选择规格才能申领）</span>
              </label>
              {createSpecEnabled && (
                <div className="col-span-2 space-y-2 border border-[var(--twin-hairline)] rounded-twin-md p-3 bg-[var(--twin-canvas)]">
                  <label className="flex items-center gap-2">
                    <AdminSwitchScaled size="3.5" checked={createSpecRequired} onChange={(checked) => setCreateSpecRequired(checked)} />
                    <span className="text-xs text-[var(--twin-body)]">强制选择规格（不允许跳过）</span>
                  </label>
                  {createSpecDimensions.map((dim, di) => (
                    <div key={di} className="flex items-center gap-2 flex-wrap">
                      <input className="w-20 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-xs text-[var(--twin-ink)]" placeholder="维度名"
                        value={dim.name} onChange={e => {
                          const next = [...createSpecDimensions]; next[di] = { ...next[di], name: e.target.value }; setCreateSpecDimensions(next);
                        }} />
                      {dim.options.map((opt, oi) => (
                        <span key={oi} className="inline-flex items-center gap-1 bg-[var(--twin-canvas-soft)] border border-[var(--twin-hairline)] rounded-full px-2 py-0.5 text-xs">
                          <input className="w-12 border-none bg-transparent text-xs text-[var(--twin-ink)] outline-none" placeholder="选项"
                            value={opt} onChange={e => {
                              const next = [...createSpecDimensions];
                              next[di] = { ...next[di], options: [...next[di].options] };
                              next[di].options[oi] = e.target.value;
                              setCreateSpecDimensions(next);
                            }} />
                          <button type="button" className="text-[var(--twin-mute)] hover:text-red-500 leading-none" onClick={() => {
                            const next = [...createSpecDimensions];
                            next[di] = { ...next[di], options: next[di].options.filter((_, i) => i !== oi) };
                            setCreateSpecDimensions(next);
                          }}>&times;</button>
                        </span>
                      ))}
                      <button type="button" className="text-xs text-[var(--twin-link-deep)]" onClick={() => {
                        const next = [...createSpecDimensions];
                        next[di] = { ...next[di], options: [...next[di].options, ''] };
                        setCreateSpecDimensions(next);
                      }}>+ 选项</button>
                      <button type="button" className="text-xs text-red-400 hover:text-red-600" onClick={() => {
                        setCreateSpecDimensions(createSpecDimensions.filter((_, i) => i !== di));
                      }}>删除维度</button>
                    </div>
                  ))}
                  <button type="button" className="text-xs text-[var(--twin-link-deep)]" onClick={() => {
                    setCreateSpecDimensions([...createSpecDimensions, { name: '', options: ['', ''] }]);
                  }}>+ 添加规格维度</button>
                </div>
              )}
              <label className="flex items-center gap-2 col-span-2 pt-2">
                <AdminSwitchScaled size="3.5" checked={createIndependentOrder} onChange={(checked) => setCreateIndependentOrder(checked)} />
                <span className="text-xs text-[var(--twin-body)]">独立下单（该物品不能与其他物品合并下单）</span>
              </label>
              <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">通知提前量（小时）</span>
                <input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" type="number" min={0} value={createNotifyAdvanceHours} onChange={e => setCreateNotifyAdvanceHours(e.target.value)} placeholder="0=提交即通知" />
                <span className="text-[10px] text-[var(--twin-mute)]">0=提交即通知，设为24=提前1天通知审核人</span>
              </label>
              <label className="flex flex-col gap-1 col-span-2"><span className="text-xs text-[var(--twin-mute)]">审核人</span>
                <StaffReviewerPicker value={createReviewerIds} onChange={setCreateReviewerIds} placeholder="选择审核人..." />
              </label>
              {createWorkflow === "DUAL_REVIEW" && (
                <label className="flex flex-col gap-1 col-span-2"><span className="text-xs text-[var(--twin-mute)]">复审人</span>
                  <StaffReviewerPicker value={createSecondReviewerIds} onChange={setCreateSecondReviewerIds} placeholder="选择复审人..." />
                </label>
              )}
            </div>
            {/* 封面图拖拽区 */}
            <div
              className={`relative rounded-twin-md border-2 border-dashed p-3 text-center cursor-pointer transition-colors ${dragOverCreate ? "border-[var(--twin-primary)] bg-[var(--twin-primary)]/5" : "border-[var(--twin-hairline)] hover:border-gray-300"}`}
              onDragOver={e => { e.preventDefault(); setDragOverCreate(true); }}
              onDragLeave={() => setDragOverCreate(false)}
              onDrop={handleDropCreate}
              onPaste={handlePasteCreate}
              tabIndex={0}
            >
              {createCoverUrl ? (
                <div className="flex items-center gap-3">
                  <img src={webImageSrc(createCoverUrl)} alt="" className="size-16 object-cover rounded-twin-sm border" />
                  <div className="text-xs text-left">
                    <p className="text-[var(--twin-ink)]">封面已设置</p>
                    <button type="button" className="text-[var(--twin-link-deep)]" onClick={() => setCreateCoverUrl("")}>移除</button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[var(--twin-mute)]">
                  <p>{createUploading ? "上传中..." : "拖拽图片到此处、Ctrl+V 粘贴、或点击上传"}</p>
                  <label className="inline-block mt-1 rounded-twin-sm bg-[var(--twin-canvas)] border border-[var(--twin-hairline)] px-3 py-1 cursor-pointer hover:bg-[var(--twin-canvas-soft)]">
                    浏览文件
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadAndSet(f, setCreateCoverUrl, setCreateUploading); }} />
                  </label>
                </div>
              )}
            </div>
            <button type="button" className="w-full rounded-twin-sm bg-[var(--twin-ink)] py-2 text-sm font-medium text-white" onClick={doCreate} disabled={createItemMut.isPending}>创建物品</button>
          </div>
        </div>
      </section>

      {/* ═══════════ 物品列表（左侧分类 + 右侧网格） ═══════════ */}
      <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-1 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--twin-hairline)]">
          <h3 className="font-medium text-[var(--twin-ink)]">物品列表</h3>
          <div className="flex items-center gap-2 text-sm">
            <select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={filterWorkflow} onChange={e => setFilterWorkflow(e.target.value as "" | "SIMPLE" | "DUAL_REVIEW")}>
              <option value="">全部流程</option><option value="SIMPLE">简单流程</option><option value="DUAL_REVIEW">复核流程</option><option value="SKIP_REVIEW">免审流程</option>
            </select>
            <button type="button" className="rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs text-[var(--twin-body)]" onClick={() => setRecycleOpen(!recycleOpen)}>回收站</button>
            <button type="button" className="rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs text-[var(--twin-body)] flex items-center gap-1" onClick={() => setPreviewOpen(!previewOpen)}>
              {previewOpen ? <EyeOff className="size-3" /> : <Eye className="size-3" />}学生预览
            </button>
          </div>
        </div>
        <div className="flex">
          {/* 左侧分类栏 */}
          <aside className="w-[160px] shrink-0 border-r border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2 space-y-0.5 max-h-[600px] overflow-y-auto">
            <button onClick={() => setFilterCat("")}
              className={`w-full text-left px-3 py-1.5 rounded-twin-sm text-[12px] transition-colors ${filterCat === "" ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)] font-medium" : "text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]"}`}>
              全部分类 ({items.length})
            </button>
            {categories.map(c => {
              const count = (filterCat && filterCat !== c.id) ? undefined : undefined; // count only when filtered
              return (
                <button key={c.id} onClick={() => setFilterCat(filterCat === c.id ? "" : c.id)}
                  className={`w-full text-left px-3 py-1.5 rounded-twin-sm text-[12px] transition-colors ${filterCat === c.id ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)] font-medium" : "text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]"}`}>
                  {c.name}
                </button>
              );
            })}
          </aside>
          {/* 右侧物品网格 */}
          <div className="flex-1 min-w-0 p-4">
            {itemsLoading ? <DataSkeleton variant="card" rows={6} /> : null}
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map(it => {
                const panelOpen = cardPanel?.itemId === it.id;
                const inboundOpen = panelOpen && cardPanel?.kind === "inbound";
                const stockOpen = panelOpen && cardPanel?.kind === "stock";
                const imgSrc = webImageSrc(it.coverUrl);
                const locked = it.lockedQty || 0;
                const available = Math.max(0, (it.stockQty || 0));
                return (
                  <div key={it.id} className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-1">
                    <div className="flex items-start gap-2.5 p-2.5">
                      {/* 缩略图 */}
                      <div
                        className="size-14 shrink-0 rounded-twin-sm bg-[var(--twin-canvas-soft)] flex items-center justify-center overflow-hidden border border-[var(--twin-hairline)] relative group cursor-pointer"
                        onClick={() => imgSrc && setLightboxSrc(imgSrc)}
                      >
                        {imgSrc ? (
                          <>
                            <img src={imgSrc} alt={it.name} className="size-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <ZoomIn className="size-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </>
                        ) : <span className="text-[9px] text-[var(--twin-mute)]">无图</span>}
                      </div>
                      {/* 信息 */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between gap-1">
                          <div className="font-medium text-[var(--twin-ink)] text-[13px] truncate">{it.name}</div>
                          <div className="flex gap-0.5 shrink-0">
                            <button type="button" className={`rounded-twin-sm px-1.5 py-0.5 text-[10px] font-medium border ${inboundOpen ? "border-sky-300 bg-sky-50 text-sky-700" : "border-[var(--twin-hairline)] text-[var(--twin-body)]"}`} onClick={() => inboundOpen ? closePanel() : openInbound(it)}>入库</button>
                            {it.stockMode !== "FLAG" && <button type="button" className={`rounded-twin-sm px-1.5 py-0.5 text-[10px] font-medium border ${stockOpen ? "border-amber-300 bg-amber-50 text-amber-800" : "border-[var(--twin-hairline)] text-[var(--twin-body)]"}`} onClick={() => stockOpen ? closePanel() : openStock(it)}>库存</button>}
                          </div>
                        </div>
                        {it.subtitle && <div className="text-[11px] text-[var(--twin-mute)] truncate">{it.subtitle}</div>}
                        <div className="flex flex-wrap gap-1 text-[9px]">
                          <span className={`px-1 rounded-full ${it.shelfStatus === "PUBLISHED" ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"}`}>{SHELF_ZH[it.shelfStatus] || it.shelfStatus}</span>
                          <span className="px-1 rounded-full bg-slate-100 text-slate-600">库存 {available}</span>
                          {locked > 0 && <span className="px-1 rounded-full bg-amber-50 text-amber-600">锁定 {locked}</span>}
                        </div>
                        <div className="text-[9px] text-[var(--twin-mute)]">{it.workflowType === "DUAL_REVIEW" ? "复核" : it.workflowType === "SKIP_REVIEW" ? "免审" : "简单"}{it.reviewerIds && it.reviewerIds !== "[]" ? " · 已指定审核人" : ""}</div>
                        <div className="flex items-center gap-0.5 text-[10px]">
                          <button className="rounded-twin-sm px-1.5 py-0.5 text-[var(--twin-link-deep)] hover:bg-[var(--twin-canvas-soft)]" onClick={() => { setEditingItem(it); setEditCoverUrl(it.coverUrl || ""); setEditShowStockQty(it.showStockQty !== 0); setEditIndependentOrder(it.independentOrder === 1); setEditNotifyAdvanceHours(String(it.notifyAdvanceHours ?? 0)); setEditReviewerIds(it.reviewerIds || "[]"); setEditSecondReviewerIds(it.secondReviewerIds || "[]"); if (it.specSchema) { try { const parsed = JSON.parse(it.specSchema); setEditSpecEnabled(true); setEditSpecDimensions(parsed.dimensions || []); setEditSpecRequired(it.specRequired === 1); } catch { setEditSpecEnabled(false); setEditSpecDimensions([]); setEditSpecRequired(false); } } else { setEditSpecEnabled(false); setEditSpecDimensions([]); setEditSpecRequired(false); } }}>编辑</button>
                          <label className="rounded-twin-sm px-1.5 py-0.5 text-[var(--twin-link-deep)] hover:bg-[var(--twin-canvas-soft)] cursor-pointer">图片<input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadAndSet(f, (url) => { updateItemMut.mutate({ id: it.id, body: { coverUrl: url } }); }, setEditUploading); }} /></label>
                          <button className="rounded-twin-sm px-1.5 py-0.5 text-red-500 hover:bg-red-50" onClick={() => { if (!window.confirm("删除？")) return; deleteItemMut.mutate(it.id); }}>删</button>
                        </div>
                      </div>
                    </div>
                    {inboundOpen && (
                      <InboundPanel
                        item={it}
                        qty={panelQty}
                        setQty={setPanelQty}
                        pending={inboundMut.isPending}
                        onConfirm={() => {
                          if (inboundMut.isPending) return;
                          const q = it.stockMode === "FLAG" ? 1 : Number(panelQty);
                          if (!q || q <= 0) return toast.error("数量无效");
                          inboundMut.mutate({ itemId: it.id, qty: q }, { onSuccess: closePanel });
                        }}
                        onCancel={closePanel}
                      />
                    )}
                    {stockOpen && <StockPanel qty={panelNewStock} setQty={setPanelNewStock} onConfirm={() => { const n = Number(panelNewStock); if (Number.isNaN(n) || n < 0) return toast.error("无效库存"); adjustMut.mutate({ id: it.id, newQty: n }, { onSuccess: closePanel }); }} onCancel={closePanel} />}
                  </div>
                );
              })}
            </div>
            {!itemsLoading && filteredItems.length === 0 && <p className="text-center text-sm text-[var(--twin-mute)] py-12">暂无物品</p>}
          </div>
        </div>
      </section>

      {/* 图片灯箱 */}
      {lightboxSrc && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/70 p-8" onClick={() => setLightboxSrc(null)}>
          <button type="button" className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightboxSrc(null)}><X className="size-6" /></button>
          <img src={lightboxSrc} alt="" className="max-w-full max-h-full object-contain rounded-twin-lg shadow-twin-level-4" onClick={e => e.stopPropagation()} />
        </div>,
        document.body,
      )}

      {/* ═══════════ 学生视角预览（使用同一数据源） ═══════════ */}
      {previewOpen && (
        <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 space-y-3 shadow-twin-level-1">
          <h3 className="font-medium text-[var(--twin-ink)] flex items-center gap-2"><Eye className="size-4" />学生视角预览（与上方物品列表同源）</h3>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setPreviewCatId(undefined)} className={`rounded-twin-sm px-3 py-1 text-xs ${!previewCatId ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)]" : "border border-[var(--twin-hairline)] text-[var(--twin-body)]"}`}>全部</button>
            {categories.map(c => <button key={c.id} onClick={() => setPreviewCatId(c.id)} className={`rounded-twin-sm px-3 py-1 text-xs ${previewCatId === c.id ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)]" : "border border-[var(--twin-hairline)] text-[var(--twin-body)]"}`}>{c.name}</button>)}
          </div>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {(previewCatId ? items.filter(i => i.categoryId === previewCatId) : items).map(it => (
              <div key={it.id} className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2 flex items-center gap-2">
                <div className="size-10 rounded bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                  {webImageSrc(it.coverUrl) ? <img src={webImageSrc(it.coverUrl)} alt="" className="size-full object-cover" /> : <span className="text-[9px] text-[var(--twin-mute)]">无图</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium truncate text-[var(--twin-ink)]">{it.name}</div>
                  <div className="text-[10px] text-[var(--twin-mute)]">{it.showStockQty === 0 ? "有货" : `库存 ${it.stockQty}`}</div>
                  <div className="text-[9px] text-[var(--twin-mute)]">{it.shelfStatus !== "PUBLISHED" ? <span className="text-amber-500">{it.shelfStatus}</span> : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══════════ 内联编辑弹窗（portal 挂载到 body，避免 admin 布局 transform 导致 fixed 锚定整页） ═══════════ */}
      {editingItem && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingItem(null)}>
          <div className="bg-[var(--twin-canvas)] rounded-twin-xl border border-[var(--twin-hairline)] shadow-twin-level-4 w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="font-medium text-[var(--twin-ink)]">编辑 {editingItem.name}</h3><button type="button" onClick={() => setEditingItem(null)} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)] text-lg">&times;</button></div>
            <div
              className={`rounded-twin-md border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${dragOverEdit ? "border-[var(--twin-primary)] bg-[var(--twin-primary)]/5" : "border-[var(--twin-hairline)]"}`}
              onDragOver={e => { e.preventDefault(); setDragOverEdit(true); }}
              onDragLeave={() => setDragOverEdit(false)}
              onDrop={handleDropEdit}
            >
              {editCoverUrl ? (
                <div className="flex items-center justify-center gap-3">
                  <img src={webImageSrc(editCoverUrl)} alt="" className="max-h-[120px] rounded" />
                  <button type="button" className="text-xs text-red-500 hover:underline shrink-0" onClick={() => setEditCoverUrl("")}>移除</button>
                </div>
              ) : (
                <>
                  <span className="text-xs text-[var(--twin-mute)]">拖拽图片上传封面</span>
                  {editUploading && <span className="text-xs text-[var(--twin-mute)]">上传中...</span>}
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">名称</span><input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={editingItem.name} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} /></label>
              <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">副标题</span><input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={editingItem.subtitle || ""} onChange={e => setEditingItem({ ...editingItem, subtitle: e.target.value })} /></label>
              <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">状态</span><select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={editingItem.shelfStatus} onChange={e => setEditingItem({ ...editingItem, shelfStatus: e.target.value })}><option value="DRAFT">草稿</option><option value="PUBLISHED">已上架</option><option value="ARCHIVED">已归档</option></select></label>
              <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">库存模式</span><select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={editingItem.stockMode} onChange={e => setEditingItem({ ...editingItem, stockMode: e.target.value })}><option value="QUANTIFIED">数量型</option><option value="FLAG">有无型</option></select></label>
              <label className="flex flex-col gap-1 col-span-2"><span className="text-xs text-[var(--twin-mute)]">审核流程</span><select className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" value={editingItem.workflowType || "SIMPLE"} onChange={e => setEditingItem({ ...editingItem, workflowType: e.target.value })}><option value="SIMPLE">简单流程</option><option value="DUAL_REVIEW">复核流程</option><option value="SKIP_REVIEW">免审流程</option></select></label>
              <label className="flex flex-col gap-1 col-span-2"><span className="text-xs text-[var(--twin-mute)]">审核人</span>
                <StaffReviewerPicker value={editReviewerIds} onChange={setEditReviewerIds} placeholder="选择审核人..." />
              </label>
              {editingItem.workflowType === "DUAL_REVIEW" && (
                <label className="flex flex-col gap-1 col-span-2"><span className="text-xs text-[var(--twin-mute)]">复审人</span>
                  <StaffReviewerPicker value={editSecondReviewerIds} onChange={setEditSecondReviewerIds} placeholder="选择复审人..." />
                </label>
              )}
              <label className="flex items-center gap-2 col-span-2"><AdminSwitchScaled size="3.5" checked={editShowStockQty} onChange={(checked) => setEditShowStockQty(checked)} /><span className="text-xs text-[var(--twin-body)]">学生端显示具体库存数字</span></label>
              <label className="flex items-center gap-2 col-span-2"><AdminSwitchScaled size="3.5" checked={editIndependentOrder} onChange={(checked) => setEditIndependentOrder(checked)} /><span className="text-xs text-[var(--twin-body)]">独立下单（该物品不能与其他物品合并下单）</span></label>
              <label className="flex flex-col gap-1"><span className="text-xs text-[var(--twin-mute)]">通知提前量（小时）</span>
                <input className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)] text-sm" type="number" min={0} value={editNotifyAdvanceHours} onChange={e => setEditNotifyAdvanceHours(e.target.value)} placeholder="0=提交即通知" />
                <span className="text-[10px] text-[var(--twin-mute)]">0=提交即通知，设为24=提前1天通知审核人</span>
              </label>
              {/* ── 规格配置 ── */}
              <label className="flex items-center gap-2 col-span-2 pt-2">
                <AdminSwitchScaled size="3.5" checked={editSpecEnabled} onChange={(checked) => setEditSpecEnabled(checked)} />
                <span className="text-xs text-[var(--twin-body)]">启用规格（学生需选择规格才能申领）</span>
              </label>
              {editSpecEnabled && (
                <div className="col-span-2 space-y-2 border border-[var(--twin-hairline)] rounded-twin-md p-3 bg-[var(--twin-canvas)]">
                  <label className="flex items-center gap-2">
                    <AdminSwitchScaled size="3.5" checked={editSpecRequired} onChange={(checked) => setEditSpecRequired(checked)} />
                    <span className="text-xs text-[var(--twin-body)]">强制选择规格（不允许跳过）</span>
                  </label>
                  {editSpecDimensions.map((dim, di) => (
                    <div key={di} className="flex items-center gap-2 flex-wrap">
                      <input className="w-20 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-xs text-[var(--twin-ink)]" placeholder="维度名"
                        value={dim.name} onChange={e => {
                          const next = [...editSpecDimensions]; next[di] = { ...next[di], name: e.target.value }; setEditSpecDimensions(next);
                        }} />
                      {dim.options.map((opt, oi) => (
                        <span key={oi} className="inline-flex items-center gap-1 bg-[var(--twin-canvas-soft)] border border-[var(--twin-hairline)] rounded-full px-2 py-0.5 text-xs">
                          <input className="w-12 border-none bg-transparent text-xs text-[var(--twin-ink)] outline-none" placeholder="选项"
                            value={opt} onChange={e => {
                              const next = [...editSpecDimensions];
                              next[di] = { ...next[di], options: [...next[di].options] };
                              next[di].options[oi] = e.target.value;
                              setEditSpecDimensions(next);
                            }} />
                          <button type="button" className="text-[var(--twin-mute)] hover:text-red-500 leading-none" onClick={() => {
                            const next = [...editSpecDimensions];
                            next[di] = { ...next[di], options: next[di].options.filter((_, i) => i !== oi) };
                            setEditSpecDimensions(next);
                          }}>&times;</button>
                        </span>
                      ))}
                      <button type="button" className="text-xs text-[var(--twin-link-deep)]" onClick={() => {
                        const next = [...editSpecDimensions];
                        next[di] = { ...next[di], options: [...next[di].options, ''] };
                        setEditSpecDimensions(next);
                      }}>+ 选项</button>
                      <button type="button" className="text-xs text-red-400 hover:text-red-600" onClick={() => {
                        setEditSpecDimensions(editSpecDimensions.filter((_, i) => i !== di));
                      }}>删除维度</button>
                    </div>
                  ))}
                  <button type="button" className="text-xs text-[var(--twin-link-deep)]" onClick={() => {
                    setEditSpecDimensions([...editSpecDimensions, { name: '', options: ['', ''] }]);
                  }}>+ 添加规格维度</button>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--twin-hairline)]">
              <button type="button" className="rounded-twin-sm border border-[var(--twin-hairline)] px-4 py-1.5 text-sm text-[var(--twin-body)]" onClick={() => setEditingItem(null)}>取消</button>
              <button type="button" className="rounded-twin-sm bg-[var(--twin-primary)] px-4 py-1.5 text-sm font-medium text-[var(--twin-on-primary)]" onClick={saveEdit}>保存</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ═══════════ 回收站 ═══════════ */}
      {recycleOpen && (
        <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-4 space-y-3 shadow-twin-level-1">
          <div className="flex items-center justify-between"><h3 className="font-medium text-[var(--twin-ink)]">回收站</h3><button type="button" className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white" onClick={() => { if (!window.confirm("一键清空？")) return; purgeAllMut.mutate(undefined, { onSuccess: () => setRecyclePage(1) }); }}>一键清空</button></div>
          {recycleRows.map(it => (
            <div key={it.id} className="flex items-center justify-between rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm">
              <div><div className="font-medium">{it.name}</div><div className="text-xs text-[var(--twin-mute)]">ID {it.id}</div></div>
              <div className="flex gap-2"><button className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-700" onClick={() => restoreMut.mutate(it.id)}>恢复</button><button className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700" onClick={() => { if (!window.confirm(`彻底删除 ${it.name}？`)) return; purgeMut.mutate([it.id]); }}>彻底删除</button></div>
            </div>
          ))}
          {recycleRows.length === 0 && <p className="text-center text-sm text-[var(--twin-mute)] py-4">回收站为空</p>}
          {recycleTotal > 20 && <div className="flex justify-end gap-2 text-xs"><button className="rounded-twin-sm border px-2 py-1 disabled:opacity-40" disabled={recyclePage <= 1} onClick={() => setRecyclePage(p => p - 1)}>上一页</button><span>第{recyclePage}页/共{Math.ceil(recycleTotal/20)}页</span><button className="rounded-twin-sm border px-2 py-1 disabled:opacity-40" disabled={recyclePage*20>=recycleTotal} onClick={() => setRecyclePage(p => p + 1)}>下一页</button></div>}
        </section>
      )}
    </div>
  );
}

/* ────── 行内面板 ────── */
function InboundPanel({ item, qty, setQty, pending, onConfirm, onCancel }: { item: MaterialItem; qty: string; setQty: (v: string) => void; pending?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="border-t border-[var(--twin-hairline)] bg-sky-50/60 p-3 space-y-2">
      <div className="text-xs text-sky-900">{item.stockMode === "FLAG" ? "有无型入库标记为有货。" : "按数量增加库存。"}</div>
      {item.stockMode !== "FLAG" && <input className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm text-[var(--twin-ink)]" type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} />}
      <div className="flex gap-2"><button type="button" disabled={pending} className="rounded-twin-sm bg-sky-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed" onClick={onConfirm}>{pending ? "入库中…" : "确认入库"}</button><button type="button" className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs text-[var(--twin-body)]" onClick={onCancel}>取消</button></div>
    </div>
  );
}
function StockPanel({ qty, setQty, onConfirm, onCancel }: { qty: string; setQty: (v: string) => void; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="border-t border-[var(--twin-hairline)] bg-amber-50/60 p-3 space-y-2">
      <div className="text-xs text-amber-900">直接设为新数值。</div>
      <input className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm text-[var(--twin-ink)]" type="number" min={0} value={qty} onChange={e => setQty(e.target.value)} />
      <div className="flex gap-2"><button className="rounded-twin-sm bg-amber-600 px-4 py-1.5 text-xs font-medium text-white" onClick={onConfirm}>保存</button><button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs text-[var(--twin-body)]" onClick={onCancel}>取消</button></div>
    </div>
  );
}
