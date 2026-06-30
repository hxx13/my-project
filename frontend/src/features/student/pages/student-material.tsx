/** 学生物资商城 — 快捷入口路由：/student/material */
import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShoppingCart, ChevronLeft, Plus, Minus, Send, Package, Lightbulb } from "lucide-react";
import { useMaterialCategories, useMaterialItems, useMaterialCart, useSaveMaterialCart, useCreateMaterialRequest } from "@/api/hooks/useMaterial";
import { createMaterialDemand } from "@/api/domains/material.api";
import { fetchPublicRuntimeConfig } from "@/api/domains/notification.api";
import { resolveMaterialApplicantGroupForStudentSession } from "@/features/student/materialApplicant";
import type { MaterialItem } from "@/api/domains/material.api";
import { StudentCard, Skeleton, EmptyState, Badge } from "../components/ui";
import { cn } from "@/lib/utils";
import { webImageSrc } from "@/utils/mediaUrl";
import toast from "react-hot-toast";

export const STUDENT_MATERIAL_ROUTE = "/student/material";

export default function StudentMaterialPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCat = searchParams.get("category");
  const { data: categories } = useMaterialCategories();
  const [activeCategoryId, setActiveCategoryId] = useState<number | undefined>(
    initialCat ? Number(initialCat) : undefined
  );
  const { data: items, isLoading: itemsLoading } = useMaterialItems(activeCategoryId);
  const { data: cart } = useMaterialCart();
  const saveCart = useSaveMaterialCart();
  const createRequest = useCreateMaterialRequest();
  const [showCart, setShowCart] = useState(false);
  const [demandText, setDemandText] = useState("");
  const [demandSubmitting, setDemandSubmitting] = useState(false);
  const [showDemandForm, setShowDemandForm] = useState(false);
  const [demandEntryVisible, setDemandEntryVisible] = useState(true); // 默认显示

  useEffect(() => {
    fetchPublicRuntimeConfig().then(cfg => {
      setDemandEntryVisible(cfg["material.demand_entry_visible"] !== "false");
    }).catch(() => { /* 加载失败保持默认 */ });
  }, []);

  const cartCount = useMemo(() => {
    if (!cart) return 0;
    return Object.values(cart).reduce((a, b) => a + b, 0);
  }, [cart]);

  const cartItems = useMemo(() => {
    if (!cart || !items) return [];
    return items.filter((item) => cart[item.id] && cart[item.id] > 0).map((item) => ({ ...item, cartQty: cart[item.id] }));
  }, [cart, items]);

  function updateCartQty(itemId: number, delta: number, maxStock?: number) {
    if (!cart) return;
    const next = { ...cart };
    const cur = next[itemId] || 0;
    const cap = maxStock != null ? Math.min(999, maxStock) : 999;
    const nv = Math.max(0, Math.min(cap, cur + delta));
    if (nv === 0) delete next[itemId];
    else next[itemId] = nv;
    saveCart.mutate(next);
  }

  async function handleSubmit() {
    if (!cart || cartCount === 0) return;
    const lines = Object.entries(cart).filter(([, qty]) => qty > 0).map(([itemId, qty]) => ({ itemId: Number(itemId), qty }));
    const group = resolveMaterialApplicantGroupForStudentSession();
    await createRequest.mutateAsync({ lines, applicantGroup: group });
    saveCart.mutate({}); // 清空申领物品栏
    navigate("/student/material/requests");
  }

  return (
    <div className="flex h-full bg-[var(--student-canvas-soft)]">
      <aside className="w-[180px] shrink-0 border-r border-[var(--student-hairline)] bg-white p-3 space-y-1 overflow-y-auto">
        <button onClick={() => setActiveCategoryId(undefined)}
          className={cn("w-full text-left px-3 py-2 rounded-[var(--student-radius-sm)] text-[13px] transition-colors",
            !activeCategoryId ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)] font-semibold" : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)]")}>
          全部分类
        </button>
        {categories?.map((cat) => (
          <button key={cat.id} onClick={() => setActiveCategoryId(cat.id)}
            className={cn("w-full text-left px-3 py-2 rounded-[var(--student-radius-sm)] text-[13px] transition-colors",
              activeCategoryId === cat.id ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)] font-semibold" : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)]")}>
            {cat.name}
          </button>
        ))}
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--student-hairline)] bg-white">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[13px] text-[var(--student-mute)] hover:text-[var(--student-ink)]">
            <ChevronLeft className="size-4" /> 返回
          </button>
          <h2 className="text-[15px] font-semibold text-[var(--student-ink)]">申领物品</h2>
          <button onClick={() => setShowCart(!showCart)}
            className="relative flex items-center gap-1 px-3 py-1.5 rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] text-white text-[13px]">
            <ShoppingCart className="size-4" /> 申领物品栏
            {cartCount > 0 && <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">{cartCount}</span>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {itemsLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[120px]" />)}
            </div>
          ) : !items || items.length === 0 ? (
            <EmptyState icon={Package} title="暂无上架物品" />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {items.map((item) => (
                <MaterialItemCard key={item.id} item={item} cartQty={cart?.[item.id] || 0} maxStock={item.stockMode === "UNLIMITED" ? undefined : (item.stockQty || 0)} onQtyChange={(d) => updateCartQty(item.id, d, item.stockMode === "UNLIMITED" ? undefined : (item.stockQty || 0))} />
              ))}
            </div>
          )}
        </div>

        {/* 需求建议（受开关控制） */}
        {demandEntryVisible && (<div className="p-4 border-t border-[var(--student-hairline)]">
          {!showDemandForm ? (
            <button onClick={() => setShowDemandForm(true)}
              className="flex items-center gap-2 text-[12px] text-[var(--student-mute)] hover:text-[var(--student-primary)] transition-colors">
              <Lightbulb className="size-3.5" /> 找不到想要的？提个建议
            </button>
          ) : (
            <div className="space-y-2">
              <textarea className="w-full rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-2 text-[13px] text-[var(--student-ink)] resize-none"
                rows={2} placeholder="描述你需要的物品..." value={demandText} onChange={e => setDemandText(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={async () => {
                  if (!demandText.trim()) return;
                  setDemandSubmitting(true);
                  try { await createMaterialDemand(demandText.trim()); toast.success("建议已提交"); setDemandText(""); setShowDemandForm(false); }
                  catch { toast.error("提交失败"); }
                  finally { setDemandSubmitting(false); }
                }} disabled={demandSubmitting || !demandText.trim()}
                  className="rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50">
                  {demandSubmitting ? "提交中..." : "提交建议"}
                </button>
                <button onClick={() => { setShowDemandForm(false); setDemandText(""); }}
                  className="rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] px-3 py-1.5 text-[12px] text-[var(--student-mute)]">取消</button>
              </div>
            </div>
          )}
        </div>
        )}
      </main>

      {showCart && (
        <aside className="w-[320px] shrink-0 border-l border-[var(--student-hairline)] bg-white flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--student-hairline)]">
            <h3 className="text-[14px] font-semibold">申领物品栏 ({cartCount} 件)</h3>
            <button onClick={() => setShowCart(false)} className="text-[var(--student-mute)] hover:text-[var(--student-ink)] text-[20px] leading-none">&times;</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cartItems.length === 0 ? (
              <p className="text-center text-[13px] text-[var(--student-mute)] py-8">申领物品栏为空</p>
            ) : (
              cartItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)]">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{item.name}</p>
                    <p className="text-[11px] text-[var(--student-mute)]">库存: {item.stockMode === "UNLIMITED" ? "无限" : item.showStockQty === 0 ? "有货" : (item.stockQty||0)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => updateCartQty(item.id, -1)} className="size-6 rounded border border-[var(--student-hairline)] flex items-center justify-center"><Minus className="size-3" /></button>
                    <span className="text-[13px] w-6 text-center font-medium">{item.cartQty}</span>
                    <button onClick={() => updateCartQty(item.id, 1)} className="size-6 rounded border border-[var(--student-hairline)] flex items-center justify-center"><Plus className="size-3" /></button>
                  </div>
                </div>
              ))
            )}
          </div>
          {cartItems.length > 0 && (
            <div className="p-3 border-t border-[var(--student-hairline)]">
              <button onClick={handleSubmit} disabled={createRequest.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[var(--student-radius-md)] bg-[var(--student-primary)] text-white text-[14px] font-semibold disabled:opacity-50">
                <Send className="size-4" /> 提交申领
              </button>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function MaterialItemCard({ item, cartQty, maxStock, onQtyChange }: { item: MaterialItem; cartQty: number; maxStock?: number; onQtyChange: (d: number) => void }) {
  const atCap = maxStock != null && cartQty >= maxStock;
  return (
    <StudentCard className="flex items-start gap-3 p-3">
      <div className="size-16 shrink-0 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] flex items-center justify-center text-[var(--student-mute)] text-[11px] overflow-hidden">
        {item.coverUrl ? <img src={webImageSrc(item.coverUrl) || item.coverUrl} alt={item.name} className="size-full object-cover" /> : "暂无图片"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h4 className="text-[13px] font-semibold truncate">{item.name}</h4>
        </div>
        {item.subtitle && <p className="text-[11px] text-[var(--student-mute)] mt-0.5 line-clamp-2">{item.subtitle}</p>}
        <div className="flex items-center justify-between gap-2 mt-1.5 flex-nowrap">
          <span className="text-[11px] text-[var(--student-mute)] flex-1 min-w-0">库存: {item.stockMode === "UNLIMITED" ? "无限" : item.showStockQty === 0 ? "有货" : (item.stockQty||0)}</span>
          <div className="flex items-center gap-1 shrink-0">
            {cartQty > 0 && <button onClick={() => onQtyChange(-1)} className="size-6 rounded border border-[var(--student-hairline)] flex items-center justify-center"><Minus className="size-3" /></button>}
            {cartQty > 0 && <span className="text-[13px] w-5 text-center font-medium">{cartQty}</span>}
            <button onClick={() => onQtyChange(1)} disabled={atCap} className="size-6 rounded border border-[var(--student-hairline)] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"><Plus className="size-3" /></button>
          </div>
        </div>
      </div>
    </StudentCard>
  );
}
