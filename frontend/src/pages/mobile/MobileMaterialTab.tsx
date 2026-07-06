/** 手机版 — 申领 Tab（布局对齐小程序 studentMaterial，数据走学生中心 token API） */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, WifiOff, ChevronLeft, X, Copy, ExternalLink, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  fetchMobileMaterials,
  submitMobileMaterialRequest,
  type MobileMaterialsData,
} from "@/api/domains/mobileStudent.api";
import {
  fetchStudentMobileMaterials,
  submitStudentMobileMaterialRequest,
} from "@/api/domains/studentMobile.api";
import type { MaterialRequest } from "@/api/domains/material.api";
import { withdrawMaterialRequest, confirmMaterialReceive } from "@/api/domains/material.api";
import {
  buildCartLines,
  cartTotalQty,
  decorateMaterialItems,
  enrichWithCartQty,
  formatMaterialTime,
  loadPersistedCart,
  maxQtyForItem,
  persistCart,
  reconcileCartWithStock,
  requestStatusText,
  type CartLine,
} from "./utils/mobileMaterialHelpers";
import { parseSpecCartKey } from "./utils/mobileSpecHelpers";
import { MaterialSpecPickControl } from "@/components/material/MaterialSpecPickerSheet";
import { MobileMaterialQtyStepper } from "@/components/material/MobileMaterialQtyStepper";
import { SplitSidebarScrollLayout } from "@/components/layout/ScrollFillLayout";
import { MobileMaterialCategoryRail } from "./components/MobileMaterialCategoryRail";
import { MobileMaterialCartBar } from "./components/MobileMaterialCartBar";

/* ---- localStorage 购物车（学生中心 token / JWT） ---- */
const JWT_CART_KEY = "mobile_material_cart_jwt";

function buildGeneralModeUrl() {
  return `${window.location.origin}/#/m/login`;
}

function cartStorageKey(token: string, jwtMode?: boolean) {
  if (jwtMode) return JWT_CART_KEY;
  return `mobile_material_cart_${token.slice(0, 8)}`;
}

function loadCart(token: string, jwtMode?: boolean): Record<string, number> {
  return loadPersistedCart(cartStorageKey(token, jwtMode));
}

function persistCartForTab(token: string, cart: Record<string, number>, jwtMode?: boolean) {
  persistCart(cartStorageKey(token, jwtMode), cart);
}

function clearCartStorage(token: string, jwtMode?: boolean) {
  localStorage.removeItem(cartStorageKey(token, jwtMode));
}

function mapRequestRow(r: MaterialRequest) {
  const status = String(r.status || "").toUpperCase();
  const lines = r.lines || [];
  const names = lines.map((l) => `${l.snapshotName || "物品"}×${l.qty || 0}`);
  const displayTitle = names.length ? names.join("、") : `申领单 ${r.id || ""}`;
  const lineSummary = lines.length > 2 ? `等 ${lines.length} 项` : "";
  return {
    ...r,
    status,
    statusText: requestStatusText(status),
    createdAtText: formatMaterialTime(r.createdAt),
    displayTitle,
    lineSummary,
    canWithdraw: status === "PENDING" || status === "FIRST_OK",
    canRevoke: status === "APPROVED" || status === "FULFILLED",
    canReceive: status === "FULFILLED",
  };
}

const REQUEST_STATUS_FILTERS = [
  { label: "全部", value: "" },
  { label: "待领取", value: "FULFILLED" },
  { label: "已完成", value: "RECEIVED" },
];

export default function MobileMaterialTab({ token, jwtMode }: { token: string; jwtMode?: boolean }) {
  const [matData, setMatData] = useState<MobileMaterialsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCat, setActiveCat] = useState<"all" | number>("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});

  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLines, setConfirmLines] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [showRequests, setShowRequests] = useState(false);
  const [requestStatusFilter, setRequestStatusFilter] = useState("");
  const [showModeDialog, setShowModeDialog] = useState(true);
  const [modeLinkCopied, setModeLinkCopied] = useState(false);

  const generalModeUrl = buildGeneralModeUrl();
  const load = useCallback(() => {
    if (!jwtMode && !token) return;
    setLoading(true);
    setError(null);
    (jwtMode
      ? fetchStudentMobileMaterials()
      : fetchMobileMaterials(token!)
    )
      .then((d) => {
        setMatData(d);
        const decorated = decorateMaterialItems(d.items ?? []);
        const local = loadCart(token!, jwtMode);
        const reconciled = reconcileCartWithStock(local, decorated);
        if (reconciled !== local) persistCartForTab(token!, reconciled, jwtMode);
        setCart(reconciled);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [token, jwtMode]);

  useEffect(() => {
    load();
  }, [load]);

  const allDecorated = useMemo(
    () => decorateMaterialItems(matData?.items ?? []),
    [matData?.items],
  );

  const cats = matData?.categories ?? [];

  const categoryItems = useMemo(() => {
    if (activeCat === "all") return allDecorated;
    return allDecorated.filter((it) => it.categoryId === activeCat);
  }, [allDecorated, activeCat]);

  const filteredItems = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    let list = categoryItems;
    if (kw) {
      list = categoryItems.filter((it) => {
        const name = String(it.name || "").toLowerCase();
        const sub = String(it.subtitle || "").toLowerCase();
        return name.includes(kw) || sub.includes(kw);
      });
    }
    return enrichWithCartQty(list, cart);
  }, [categoryItems, searchKeyword, cart]);

  const cartCount = cartTotalQty(cart);
  const cartLines = useMemo(
    () => buildCartLines(cart, allDecorated),
    [cart, allDecorated],
  );

  const myRequestsRaw = (matData?.myRequests ?? []) as MaterialRequest[];
  const requestRows = useMemo(() => {
    let rows = myRequestsRaw.map(mapRequestRow);
    if (requestStatusFilter) {
      rows = rows.filter((r) => r.status === requestStatusFilter);
    }
    return rows;
  }, [myRequestsRaw, requestStatusFilter]);

  const syncCart = useCallback(
    (next: Record<string, number>) => {
      persistCartForTab(token, next, jwtMode);
      setCart(next);
    },
    [token, jwtMode],
  );

  const addCartKey = (key: string) => {
    const parsed = parseSpecCartKey(key);
    const item = allDecorated.find((x) => x.id === parsed.itemId);
    const max = maxQtyForItem(item);
    if (max <= 0) {
      toast.error("暂无库存");
      return;
    }
    const cur = cart[key] || 0;
    syncCart({ ...cart, [key]: Math.min(cur + 1, max) });
  };

  const decCartKey = (key: string) => {
    const cur = cart[key] || 0;
    if (cur <= 0) return;
    const next = { ...cart };
    const nv = cur - 1;
    if (nv <= 0) delete next[key];
    else next[key] = nv;
    syncCart(next);
  };

  const addCart = (id: number) => addCartKey(String(id));

  const decCart = (id: number) => decCartKey(String(id));

  const onQtyBlur = (key: string, raw: string) => {
    const parsed = parseSpecCartKey(key);
    const item = allDecorated.find((x) => x.id === parsed.itemId);
    const max = maxQtyForItem(item);
    if (max <= 0) {
      toast.error("暂无库存");
      return;
    }
    const trimmed = String(raw || "").trim();
    const num = Number(trimmed);
    const next = { ...cart };
    if (!trimmed || Number.isNaN(num) || num <= 0) {
      delete next[key];
      syncCart(next);
      return;
    }
    const v = Math.min(Math.floor(num), max);
    if (num > max) toast.error(`最多 ${max}`);
    next[key] = v;
    syncCart(next);
  };

  const openCartSheet = () => {
    const lines = buildCartLines(cart, allDecorated);
    if (!lines.length) {
      toast.error("申领栏是空的");
      return;
    }
    setCartSheetOpen(true);
  };

  const submitOrder = () => {
    if (submitting || cartCount === 0) return;
    const lines = buildCartLines(cart, allDecorated);
    if (!lines.length) {
      toast.error("请选择物品");
      return;
    }
    setConfirmLines(lines);
    setConfirmOpen(true);
  };

  const confirmSubmit = async () => {
    if (submitting) return;
    const lines = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => {
        const parsed = parseSpecCartKey(key);
        return {
          itemId: parsed.itemId,
          qty,
          specSnapshot: parsed.specSnapshot
            ? JSON.stringify(parsed.specSnapshot)
            : undefined,
        };
      });
    if (!lines.length) {
      toast.error("请选择物品");
      return;
    }
    setSubmitting(true);
    setConfirmOpen(false);
    try {
      if (jwtMode) {
        await submitStudentMobileMaterialRequest(lines);
      } else {
        await submitMobileMaterialRequest(token, lines);
      }
      toast.success("已提交");
      clearCartStorage(token, jwtMode);
      setCart({});
      setCartSheetOpen(false);
      load();
      setShowRequests(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (id: string) => {
    try {
      await withdrawMaterialRequest(id);
      toast.success("已撤回");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "撤回失败");
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm("确定撤销此申领？已通过/出库的物品将被召回，审核记录将被清除。")) return;
    try {
      await withdrawMaterialRequest(id);
      toast.success("已撤销，申领回到待审状态");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "撤销失败");
    }
  };

  const handleConfirmReceive = async (id: string) => {
    try {
      await confirmMaterialReceive(id);
      toast.success("已确认领取");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "确认失败");
    }
  };

  const previewImage = (url: string) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopyGeneralModeUrl = async () => {
    try {
      await navigator.clipboard.writeText(generalModeUrl);
      setModeLinkCopied(true);
      setTimeout(() => setModeLinkCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = generalModeUrl;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setModeLinkCopied(true);
      setTimeout(() => setModeLinkCopied(false), 2000);
    }
  };

  const handleJumpToGeneralMode = () => {
    window.location.href = generalModeUrl;
  };

  // 直链模式阻断弹窗（第一时间展示，不受 loading/error 影响）
  const modeDialogEl = !jwtMode && showModeDialog && (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/45 p-4">
      <div
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-[var(--student-radius-lg)] bg-[var(--student-surface-raised)]"
        style={{ maxHeight: "82vh" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-dialog-title"
      >
        {/* Header */}
        <div className="border-b border-[var(--student-hairline)] px-4 py-3">
          <p id="mode-dialog-title" className="text-[15px] font-semibold text-[var(--student-ink)]">
            提示
          </p>
        </div>

        {/* Body */}
        <div className="flex flex-col items-center gap-3 px-4 py-4 overflow-y-auto">
          <p className="text-[13px] text-[var(--student-body)] text-center leading-relaxed">
            申领物品请识别一下二维码进行注册，当前模式不可用
          </p>

          {/* QR Code */}
          <div className="shrink-0 rounded-xl p-2 bg-white shadow-md" style={{ width: 140, height: 140 }}>
            <QRCodeSVG
              value={generalModeUrl}
              size={124}
              level="M"
              fgColor="#1e293b"
              bgColor="#ffffff"
            />
          </div>

          {/* Link + actions */}
          <div className="flex items-center gap-1.5 w-full max-w-[240px] rounded-full bg-[var(--student-canvas-soft)] border border-[var(--student-hairline)] px-3 py-1.5">
            <span className="text-[11px] font-mono text-[var(--student-body)] truncate flex-1 select-all">
              通用模式入口
            </span>
            <button
              type="button"
              onClick={handleCopyGeneralModeUrl}
              className="shrink-0 p-1 rounded hover:bg-[var(--student-surface)] transition-colors"
              title="复制链接"
            >
              {modeLinkCopied ? (
                <Check className="size-3.5 text-green-500" strokeWidth={2.5} />
              ) : (
                <Copy className="size-3.5 text-[var(--student-mute)]" strokeWidth={1.8} />
              )}
            </button>
            <button
              type="button"
              onClick={handleJumpToGeneralMode}
              className="shrink-0 p-1 rounded hover:bg-[var(--student-surface)] transition-colors"
              title="跳转到通用模式"
            >
              <ExternalLink className="size-3.5 text-[var(--student-mute)]" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[var(--student-hairline)] px-4 py-3">
          <button
            type="button"
            onClick={() => setShowModeDialog(false)}
            className="h-8 min-w-[72px] rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-4 text-center text-xs font-medium text-[var(--student-primary-foreground)] hover:bg-[var(--student-primary-hover)]"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <>
        {modeDialogEl}
        <div className="flex h-full items-center justify-center bg-[var(--student-canvas)]">
          <Loader2 className="size-6 animate-spin text-[var(--student-mute)] motion-reduce:animate-none" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {modeDialogEl}
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--student-canvas)]">
          <WifiOff className="size-8 text-[var(--student-mute)]" />
          <p className="text-xs text-[var(--student-mute)]">{error}</p>
          <button
            type="button"
            onClick={load}
            className="rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-4 py-2 text-xs font-medium text-[var(--student-primary-foreground)] hover:bg-[var(--student-primary-hover)] active:bg-[var(--student-primary-pressed)]"
          >
            重试
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {modeDialogEl}

      <div className="flex h-full min-h-0 flex-col bg-[var(--student-canvas)]">
        {/* 顶栏：搜索 + 我的记录 */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--student-hairline)] bg-[var(--student-surface)] px-3 py-1.5">
          <input
            type="search"
            placeholder="搜索物品"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-2.5 text-xs text-[var(--student-ink)] placeholder:text-[var(--student-mute)] focus:border-[var(--student-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--student-primary-muted)]"
          />
          <button
            type="button"
            onClick={() => setShowRequests(true)}
            className="relative shrink-0 rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-2.5 py-1 text-[11px] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft-2)]"
          >
            我的记录
            {myRequestsRaw.some((r) => String(r.status).toUpperCase() === "FULFILLED") && (
              <span
                className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-[var(--student-radius-sm)] bg-[var(--student-danger)] px-1 text-[10px] font-bold leading-none text-white"
                aria-hidden
              >
                !
              </span>
            )}
          </button>
        </div>

        {/* 分类 + 物品列表 */}
        <SplitSidebarScrollLayout
          sidebarClassName="w-[76px] shrink-0 border-r border-[var(--student-hairline)] bg-[var(--student-canvas-soft)]"
          contentClassName="px-2 pt-1.5 pb-3"
          sidebar={
            <MobileMaterialCategoryRail
              activeCat={activeCat}
              categories={cats}
              onSelect={setActiveCat}
            />
          }
        >
            {filteredItems.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-[var(--student-mute)]">
                {searchKeyword.trim() ? "未找到匹配物品" : "暂无上架物品"}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--student-hairline)] overflow-hidden rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] bg-[var(--student-surface)]">
              {filteredItems.map((item) => (
                <li
                  key={item.id}
                  className="flex gap-2 p-2"
                >
                  {item.coverAbsUrl ? (
                    <button
                      type="button"
                      onClick={() => previewImage(item.coverAbsUrl!)}
                      className="size-12 shrink-0 overflow-hidden rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)]"
                    >
                      <img
                        src={item.coverAbsUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] text-sm font-semibold text-[var(--student-mute)]">
                      {item.nameInitial}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 items-stretch gap-2">
                    <div className="min-w-0 flex-1 py-0.5">
                      <p className="break-words text-[13px] font-semibold leading-snug text-[var(--student-ink)]">
                        {item.name}
                      </p>
                      {item.subtitle && (
                        <p className="mt-0.5 break-words text-[10px] leading-snug text-[var(--student-mute)]">
                          {item.subtitle}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] leading-snug text-[var(--student-mute)]">
                        {item.stockLineText}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-end pb-0.5">
                      {item.hasSpec ? (
                        <MaterialSpecPickControl
                          item={item}
                          cart={cart}
                          variant="mobile"
                          disabled={item._outOfStock}
                          onAddKey={addCartKey}
                          onDecKey={decCartKey}
                          onAddPlain={() => addCart(item.id)}
                          onDecPlain={() => decCart(item.id)}
                        />
                      ) : (
                        <MobileMaterialQtyStepper
                          qty={cart[String(item.id)] || 0}
                          max={maxQtyForItem(item)}
                          disabled={item._outOfStock}
                          onAdd={() => addCart(item.id)}
                          onDec={() => decCart(item.id)}
                          onQtyBlur={(raw) => onQtyBlur(String(item.id), raw)}
                        />
                      )}
                    </div>
                  </div>
                </li>
              ))}
              </ul>
            )}
        </SplitSidebarScrollLayout>

        <MobileMaterialCartBar
          cartCount={cartCount}
          submitting={submitting}
          onOpenCart={openCartSheet}
          onSubmit={submitOrder}
        />
      </div>

      {/* 申领栏 Sheet */}
      {cartSheetOpen && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/35 motion-reduce:transition-none"
            onClick={() => setCartSheetOpen(false)}
            aria-hidden
          />
          <div
            className="relative max-h-[70vh] overflow-hidden rounded-t-[var(--student-radius-lg)] bg-[var(--student-surface-raised)]"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-cart-sheet-title"
          >
            <div className="flex items-center justify-between border-b border-[var(--student-hairline)] px-4 py-3">
              <p id="mobile-cart-sheet-title" className="text-base font-bold text-[var(--student-ink)]">
                申领栏
              </p>
              <button
                type="button"
                onClick={() => setCartSheetOpen(false)}
                className="flex size-8 items-center justify-center rounded-[var(--student-radius-sm)] text-[var(--student-mute)] hover:bg-[var(--student-canvas-soft)] hover:text-[var(--student-ink)]"
                aria-label="关闭申领栏"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="max-h-[52vh] overflow-y-auto overscroll-y-contain px-3">
              {cartLines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center gap-2.5 border-b border-[var(--student-hairline)] py-3 last:border-b-0"
                >
                  {line.coverAbsUrl ? (
                    <img
                      src={line.coverAbsUrl}
                      alt=""
                      className="size-11 shrink-0 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] object-cover"
                    />
                  ) : (
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] text-sm font-semibold text-[var(--student-mute)]">
                      {line.nameInitial}
                    </div>
                  )}
                    <div className="flex min-w-0 flex-1 items-end justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium leading-snug text-[var(--student-ink)]">
                          {line.name}
                        </p>
                        {line.specLabel && (
                          <p className="mt-0.5 text-[11px] text-[var(--student-mute)]">
                            {line.specLabel}
                          </p>
                        )}
                      </div>
                      <MobileMaterialQtyStepper
                        compact
                        qty={cart[line.id] || 0}
                        max={maxQtyForItem(allDecorated.find((x) => x.id === line.itemId))}
                        onAdd={() => addCartKey(line.id)}
                        onDec={() => decCartKey(line.id)}
                        onQtyBlur={(raw) => onQtyBlur(line.id, raw)}
                      />
                    </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-4 py-2.5">
              <span className="text-xs text-[var(--student-body)]">
                共 {cartCount} 件
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCartSheetOpen(false)}
                  className="rounded-[var(--student-radius-sm)] px-2 py-1.5 text-xs text-[var(--student-body)] hover:bg-[var(--student-surface)]"
                >
                  收起
                </button>
                <button
                  type="button"
                  onClick={submitOrder}
                  className="h-8 rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-3 text-xs font-semibold text-[var(--student-primary-foreground)] hover:bg-[var(--student-primary-hover)]"
                >
                  去提交
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 确认提交弹窗 */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/45 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col overflow-hidden rounded-[var(--student-radius-lg)] bg-[var(--student-surface-raised)]"
            style={{ maxHeight: "76vh" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-confirm-title"
          >
            <div className="border-b border-[var(--student-hairline)] px-4 py-3">
              <p id="mobile-confirm-title" className="text-[15px] font-semibold text-[var(--student-ink)]">
                确认提交申领
              </p>
              <p className="mt-1 text-xs text-[var(--student-mute)]">请核对以下物品</p>
            </div>
            <div className="max-h-[48vh] overflow-y-auto overscroll-y-contain px-4">
              {confirmLines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center gap-3 border-b border-dashed border-[var(--student-hairline)] py-3 last:border-b-0"
                >
                  {line.coverAbsUrl ? (
                    <img
                      src={line.coverAbsUrl}
                      alt=""
                      className="size-9 shrink-0 rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] object-cover"
                    />
                  ) : (
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] text-sm text-[var(--student-mute)]">
                      {line.nameInitial}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--student-ink)]">{line.name}</p>
                    {line.specLabel && (
                      <p className="mt-0.5 text-xs text-[var(--student-mute)]">{line.specLabel}</p>
                    )}
                    <p className="mt-0.5 text-xs text-[var(--student-mute)]">×{line.qty}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--student-hairline)] px-4 py-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-8 min-w-[64px] rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] px-3 text-center text-xs text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmSubmit}
                disabled={submitting}
                className="h-8 min-w-[64px] rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-3 text-center text-xs text-[var(--student-primary-foreground)] disabled:opacity-50 hover:bg-[var(--student-primary-hover)]"
              >
                {submitting ? "提交中…" : "确认提交"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 我的记录（全屏浮层） */}
      {showRequests && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex min-h-0 flex-col bg-[var(--student-canvas)]"
        >
          <div
            className="flex shrink-0 items-center border-b border-[var(--student-hairline)] bg-[var(--student-surface)] px-2"
            style={{
              paddingTop: "env(safe-area-inset-top, 0px)",
              height: "calc(44px + env(safe-area-inset-top, 0px))",
            }}
          >
            <button
              type="button"
              onClick={() => setShowRequests(false)}
              className="flex h-11 w-10 items-center justify-center"
              aria-label="返回"
            >
              <ChevronLeft className="size-6 text-[var(--student-ink)]" />
            </button>
            <h2 className="flex-1 pr-10 text-center text-base font-semibold text-[var(--student-ink)]">
              我的申领记录
            </h2>
          </div>

          <div className="flex shrink-0 gap-2 overflow-x-auto px-3 py-2">
            {REQUEST_STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setRequestStatusFilter(f.value)}
                className={cn(
                  "shrink-0 rounded-[var(--student-radius-sm)] border px-2.5 py-1 text-[11px] transition-colors motion-reduce:transition-none",
                  requestStatusFilter === f.value
                    ? "border-[var(--student-primary-muted)] bg-[var(--student-primary-soft)] font-semibold text-[var(--student-primary)]"
                    : "border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] font-normal text-[var(--student-body)] hover:bg-[var(--student-canvas-soft-2)]",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-6">
            {requestRows.length === 0 ? (
              <p className="py-16 text-center text-sm text-[var(--student-mute)]">
                暂无申领记录
              </p>
            ) : (
              requestRows.map((row) => {
                const isReject = row.status === "REJECTED";
                const isWarn =
                  row.status === "PENDING" || row.status === "FIRST_OK";
                return (
                  <div
                    key={row.id}
                    className="mb-2.5 rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] bg-[var(--student-surface)] p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm font-medium text-[var(--student-ink)]">
                        {row.displayTitle}
                      </p>
                      <span
                        className={cn(
                          "shrink-0 rounded-[var(--student-radius-sm)] px-2 py-0.5 text-[10px] font-semibold",
                          isReject
                            ? "bg-[var(--student-danger-soft)] text-[var(--student-danger)]"
                            : isWarn
                              ? "bg-[var(--student-warning-soft)] text-[var(--student-warning)]"
                              : "bg-[var(--student-success-soft)] text-[var(--student-success)]",
                        )}
                      >
                        {row.statusText}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--student-mute)]">
                      {row.createdAtText}
                    </p>
                    {row.lineSummary && (
                      <p className="mt-0.5 text-xs text-[var(--student-mute)]">
                        {row.lineSummary}
                      </p>
                    )}
                    <div className="mt-2 flex gap-2 border-t border-[var(--student-hairline)] pt-2">
                      {row.canWithdraw && (
                        <button
                          type="button"
                          onClick={() => handleWithdraw(row.id)}
                          className="rounded-[var(--student-radius-sm)] border border-[var(--student-danger-soft)] bg-[var(--student-danger-soft)] px-3 py-1.5 text-xs font-medium text-[var(--student-danger)]"
                        >
                          撤回
                        </button>
                      )}
                      {row.canRevoke && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(row.id)}
                          className="rounded-[var(--student-radius-sm)] border border-[var(--student-warning-soft)] bg-[var(--student-warning-soft)] px-3 py-1.5 text-xs font-medium text-[var(--student-warning)]"
                        >
                          撤销
                        </button>
                      )}
                      {row.canReceive && (
                        <button
                          type="button"
                          onClick={() => handleConfirmReceive(row.id)}
                          className="rounded-[var(--student-radius-sm)] border border-[var(--student-primary-muted)] bg-[var(--student-primary-soft)] px-3 py-1.5 text-xs font-medium text-[var(--student-primary)]"
                        >
                          确认领取
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
