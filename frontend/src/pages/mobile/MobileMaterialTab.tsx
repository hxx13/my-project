/** 手机版 — 申领 Tab（布局对齐小程序 studentMaterial，数据走学生中心 token API） */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, WifiOff, ChevronLeft } from "lucide-react";
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
  formatMaterialTime,
  maxQtyForItem,
  reconcileCartWithStock,
  requestStatusText,
  type DecoratedMaterialItem,
  type CartLine,
} from "./utils/mobileMaterialHelpers";

const CART_BAR_H = 54;

/* ---- localStorage 购物车（学生中心 token / JWT） ---- */
const JWT_CART_KEY = "mobile_material_cart_jwt";

function cartStorageKey(token: string, jwtMode?: boolean) {
  if (jwtMode) return JWT_CART_KEY;
  return `mobile_material_cart_${token.slice(0, 8)}`;
}

function loadCart(token: string, jwtMode?: boolean): Record<number, number> {
  try {
    const raw = localStorage.getItem(cartStorageKey(token, jwtMode));
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, number>;
    const cart: Record<number, number> = {};
    for (const [k, v] of Object.entries(o)) {
      const id = Number(k);
      const qty = Number(v);
      if (Number.isFinite(id) && id > 0 && Number.isFinite(qty) && qty > 0) {
        cart[id] = Math.min(Math.floor(qty), 999);
      }
    }
    return cart;
  } catch {
    return {};
  }
}

function persistCart(token: string, cart: Record<number, number>, jwtMode?: boolean) {
  localStorage.setItem(cartStorageKey(token, jwtMode), JSON.stringify(cart));
}

function clearCartStorage(token: string, jwtMode?: boolean) {
  localStorage.removeItem(cartStorageKey(token, jwtMode));
}

/* ---- 步进器（对齐小程序 step-inline） ---- */
function QtyStepper({
  qty,
  max,
  onAdd,
  onDec,
  onQtyBlur,
  compact,
}: {
  qty: number;
  max: number;
  onAdd: () => void;
  onDec: () => void;
  onQtyBlur: (raw: string) => void;
  compact?: boolean;
}) {
  const btnCls = compact ? "w-6 h-6 text-sm" : "w-7 h-7 text-base";
  const inputCls = compact ? "w-[34px] h-6 text-xs" : "w-[38px] h-6 text-xs";
  return (
    <div
      className="flex items-center shrink-0 overflow-hidden rounded-lg"
      style={{ border: "1px solid #dcdee0", background: "#fff" }}
    >
      <button
        type="button"
        onClick={onDec}
        disabled={qty <= 0}
        className={`${btnCls} flex items-center justify-center font-medium`}
        style={{
          color: "#323233",
          opacity: qty <= 0 ? 0.35 : 1,
        }}
      >
        −
      </button>
      <input
        type="number"
        className={`${inputCls} text-center font-semibold border-x`}
        style={{
          color: "#323233",
          background: "#f7f8fa",
          borderColor: "#ebecef",
        }}
        value={qty}
        onChange={(e) => onQtyBlur(e.target.value)}
        onBlur={(e) => onQtyBlur(e.target.value)}
      />
      <button
        type="button"
        onClick={onAdd}
        className={`${btnCls} flex items-center justify-center font-medium`}
        style={{ color: "#fff", background: "#1989fa" }}
      >
        +
      </button>
    </div>
  );
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
  const [cart, setCart] = useState<Record<number, number>>({});

  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLines, setConfirmLines] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [showRequests, setShowRequests] = useState(false);
  const [requestStatusFilter, setRequestStatusFilter] = useState("");

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
        if (reconciled !== local) persistCart(token!, reconciled, jwtMode);
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
    if (!kw) return categoryItems;
    return categoryItems.filter((it) => {
      const name = String(it.name || "").toLowerCase();
      const sub = String(it.subtitle || "").toLowerCase();
      return name.includes(kw) || sub.includes(kw);
    });
  }, [categoryItems, searchKeyword]);

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
    (next: Record<number, number>) => {
      persistCart(token, next, jwtMode);
      setCart(next);
    },
    [token, jwtMode],
  );

  const addCart = (id: number) => {
    const item = allDecorated.find((x) => x.id === id);
    const max = maxQtyForItem(item);
    if (max <= 0) {
      toast.error("暂无库存");
      return;
    }
    const cur = cart[id] || 0;
    syncCart({ ...cart, [id]: Math.min(cur + 1, max) });
  };

  const decCart = (id: number) => {
    const cur = cart[id] || 0;
    if (cur <= 0) return;
    const next = { ...cart };
    const nv = cur - 1;
    if (nv <= 0) delete next[id];
    else next[id] = nv;
    syncCart(next);
  };

  const onQtyBlur = (id: number, raw: string) => {
    const item = allDecorated.find((x) => x.id === id);
    const max = maxQtyForItem(item);
    if (max <= 0) {
      toast.error("暂无库存");
      return;
    }
    const trimmed = String(raw || "").trim();
    const num = Number(trimmed);
    const next = { ...cart };
    if (!trimmed || Number.isNaN(num) || num <= 0) {
      delete next[id];
      syncCart(next);
      return;
    }
    const v = Math.min(Math.floor(num), max);
    if (num > max) toast.error(`最多 ${max}`);
    next[id] = v;
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
      .map(([itemId, qty]) => ({ itemId: Number(itemId), qty }));
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

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" style={{ color: "#94a3b8" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <WifiOff className="size-8" style={{ color: "#c8c9cc" }} />
        <p className="text-xs" style={{ color: "#969799" }}>{error}</p>
        <button
          type="button"
          onClick={load}
          className="rounded-full px-4 py-1.5 text-xs font-medium text-white"
          style={{ background: "#ac1736" }}
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className="flex flex-col relative z-10 h-full"
        style={{ background: "#f4f5f7" }}
      >
        {/* 顶栏：搜索 + 我的记录 */}
        <div
          className="shrink-0 flex items-center justify-between gap-2 px-3.5 py-2"
          style={{ background: "#fff", borderBottom: "1px solid #ebecef" }}
        >
          <input
            type="search"
            placeholder="搜索物品"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="flex-1 min-w-0 h-[30px] px-2.5 text-xs rounded-full border"
            style={{
              borderColor: "#e6e8eb",
              background: "#f7f8fa",
              color: "#323233",
            }}
          />
          <button
            type="button"
            onClick={() => setShowRequests(true)}
            className="relative shrink-0 text-xs px-3 py-1.5 rounded-full"
            style={{
              color: "#576b95",
              background: "#f0f2f5",
              border: "1px solid #e6e8eb",
            }}
          >
            我的记录
            {myRequestsRaw.some((r) => String(r.status).toUpperCase() === "FULFILLED") && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold text-white rounded-full text-center leading-4"
                style={{
                  background: "linear-gradient(135deg, #3d9eff, #1989fa)",
                  border: "1px solid #fff",
                }}
              >
                !
              </span>
            )}
          </button>
        </div>

        {/* 分类 + 物品列表 */}
        <div className="flex flex-1 min-h-0">
          <div
            className="shrink-0 overflow-y-auto"
            style={{
              width: 84,
              background: "#fff",
              borderRight: "1px solid #ebecef",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveCat("all")}
              className="w-full py-2.5 text-xs text-center"
              style={{
                color: activeCat === "all" ? "#1989fa" : "#646566",
                fontWeight: activeCat === "all" ? 600 : 400,
                background: activeCat === "all" ? "#f4f9ff" : "transparent",
                borderLeft:
                  activeCat === "all" ? "2px solid #1989fa" : "2px solid transparent",
              }}
            >
              全部
            </button>
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCat(c.id)}
                className="w-full py-2.5 text-xs text-center leading-snug"
                style={{
                  color: activeCat === c.id ? "#1989fa" : "#646566",
                  fontWeight: activeCat === c.id ? 600 : 400,
                  background: activeCat === c.id ? "#f4f9ff" : "transparent",
                  borderLeft:
                    activeCat === c.id ? "2px solid #1989fa" : "2px solid transparent",
                }}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="flex-1 min-w-0 overflow-y-auto px-2.5 pt-2 pb-1">
            {filteredItems.length === 0 ? (
              <p className="text-center text-[13px] py-10" style={{ color: "#969799" }}>
                暂无上架物品
              </p>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-2.5 mb-2 p-2.5 rounded-[10px]"
                  style={{
                    background: "#fff",
                    border: "1px solid #ebecef",
                  }}
                >
                  {item.coverAbsUrl ? (
                    <button
                      type="button"
                      onClick={() => previewImage(item.coverAbsUrl!)}
                      className="shrink-0 rounded-lg overflow-hidden"
                      style={{ width: 52, height: 52, background: "#f2f3f5" }}
                    >
                      <img
                        src={item.coverAbsUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div
                      className="shrink-0 flex items-center justify-center rounded-lg text-base font-semibold"
                      style={{
                        width: 52,
                        height: 52,
                        background: "#f2f3f5",
                        color: "#c8c9cc",
                      }}
                    >
                      {item.nameInitial}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold leading-snug break-words"
                      style={{ color: "#323233" }}
                    >
                      {item.name}
                    </p>
                    {item.subtitle && (
                      <p
                        className="text-[11px] mt-0.5 break-words"
                        style={{ color: "#969799" }}
                      >
                        {item.subtitle}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-2 mt-1 min-w-0">
                      <p
                        className="text-[11px] flex-1 min-w-0 leading-snug"
                        style={{ color: "#969799" }}
                      >
                        {item.stockLineText}
                      </p>
                      <QtyStepper
                        qty={cart[item.id] || 0}
                        max={maxQtyForItem(item)}
                        onAdd={() => addCart(item.id)}
                        onDec={() => decCart(item.id)}
                        onQtyBlur={(raw) => onQtyBlur(item.id, raw)}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 底部申领栏（对齐小程序 cart-bar，与底栏 Tab 同属 flex 壳层） */}
        <div
          className="shrink-0 flex items-center justify-between gap-3 px-3 py-2"
          style={{
            height: CART_BAR_H,
            background: "rgba(255,255,255,0.96)",
            borderTop: "1px solid #ebecef",
            backdropFilter: "blur(10px)",
          }}
        >
          <button
            type="button"
            onClick={openCartSheet}
            className="relative flex items-center justify-center min-w-[88px] px-3.5 py-2.5 rounded-full"
            style={{
              background: "#f7f8fa",
              border: "1px solid #e6e8eb",
            }}
          >
            <span className="text-sm font-medium" style={{ color: "#323233" }}>
              申领栏
            </span>
            {cartCount > 0 && (
              <span
                className="absolute top-0.5 right-1.5 min-w-[16px] h-4 px-1 text-[10px] text-white text-center leading-4 rounded-full"
                style={{ background: "#ee0a24" }}
              >
                {cartCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={submitOrder}
            disabled={submitting || cartCount === 0}
            className="flex-1 text-center text-sm font-semibold text-white py-2.5 rounded-full disabled:opacity-45"
            style={{
              background: "linear-gradient(180deg, #42a5f5 0%, #1989fa 100%)",
              boxShadow: cartCount > 0 ? "0 4px 12px rgba(25,137,250,0.22)" : "none",
            }}
          >
            {submitting ? "提交中…" : "提交申领"}
          </button>
        </div>
      </div>

      {/* 申领栏 Sheet */}
      {cartSheetOpen && (
        <div className="fixed inset-0 z-[90] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/35"
            onClick={() => setCartSheetOpen(false)}
          />
          <div
            className="relative rounded-t-2xl overflow-hidden"
            style={{
              maxHeight: "70vh",
              background: "#fff",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            <p
              className="text-center text-base font-bold py-4 border-b"
              style={{ color: "#323233", borderColor: "#f2f3f5" }}
            >
              申领栏
            </p>
            <div className="max-h-[52vh] overflow-y-auto px-3">
              {cartLines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center gap-2.5 py-3 border-b"
                  style={{ borderColor: "#f2f3f5" }}
                >
                  {line.coverAbsUrl ? (
                    <img
                      src={line.coverAbsUrl}
                      alt=""
                      className="w-11 h-11 rounded-lg object-cover shrink-0"
                      style={{ background: "#f2f3f5" }}
                    />
                  ) : (
                    <div
                      className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 text-sm font-semibold"
                      style={{ background: "#f2f3f5", color: "#c8c9cc" }}
                    >
                      {line.nameInitial}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 flex items-end justify-between gap-2">
                    <p
                      className="text-sm font-medium break-words flex-1 min-w-0 leading-snug"
                      style={{ color: "#323233" }}
                    >
                      {line.name}
                    </p>
                    <QtyStepper
                      compact
                      qty={cart[line.id] || 0}
                      max={maxQtyForItem(allDecorated.find((x) => x.id === line.id))}
                      onAdd={() => addCart(line.id)}
                      onDec={() => decCart(line.id)}
                      onQtyBlur={(raw) => onQtyBlur(line.id, raw)}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div
              className="flex items-center justify-between px-4 py-3 border-t"
              style={{ borderColor: "#f2f3f5", background: "#fafbfc" }}
            >
              <span className="text-sm" style={{ color: "#646566" }}>
                共 {cartCount} 件
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setCartSheetOpen(false)}
                  className="text-sm px-3 py-1.5"
                  style={{ color: "#1989fa" }}
                >
                  收起
                </button>
                <button
                  type="button"
                  onClick={submitOrder}
                  className="text-sm font-semibold text-white px-4 py-2 rounded-full"
                  style={{ background: "#1989fa" }}
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
          className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: "76vh", background: "#fff" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: "#f2f3f5" }}>
              <p className="text-[15px] font-semibold" style={{ color: "#323233" }}>
                确认提交申领
              </p>
              <p className="text-xs mt-1" style={{ color: "#969799" }}>请核对以下物品</p>
            </div>
            <div className="overflow-y-auto px-4 max-h-[48vh]">
              {confirmLines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center gap-3 py-3 border-b border-dashed"
                  style={{ borderColor: "#eceef0" }}
                >
                  {line.coverAbsUrl ? (
                    <img
                      src={line.coverAbsUrl}
                      alt=""
                      className="w-9 h-9 rounded-lg object-cover shrink-0 border"
                      style={{ borderColor: "#ebedf0" }}
                    />
                  ) : (
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-sm"
                      style={{ background: "#f5f6f7", color: "#969799" }}
                    >
                      {line.nameInitial}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm" style={{ color: "#323233" }}>{line.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#969799" }}>×{line.qty}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: "#f2f3f5" }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="min-w-[72px] text-center text-sm py-2 rounded-lg border"
                style={{ color: "#646566", borderColor: "#dcdee0" }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmSubmit}
                disabled={submitting}
                className="min-w-[72px] text-center text-sm py-2 rounded-lg text-white disabled:opacity-50"
                style={{ background: "#1989fa" }}
              >
                {submitting ? "提交中…" : "确认提交"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 我的记录（全屏浮层，对齐 studentMaterialRequests） */}
      {showRequests && (
        <div
          className="fixed inset-0 z-[100] flex flex-col"
          style={{ background: "#f4f5f7" }}
        >
          <div
            className="shrink-0 flex items-center px-2 border-b"
            style={{
              background: "#fff",
              borderColor: "#ebecef",
              paddingTop: "env(safe-area-inset-top, 0px)",
              height: "calc(44px + env(safe-area-inset-top, 0px))",
            }}
          >
            <button
              type="button"
              onClick={() => setShowRequests(false)}
              className="flex items-center justify-center w-10 h-9"
              aria-label="返回"
            >
              <ChevronLeft className="size-6" style={{ color: "#323233" }} />
            </button>
            <h2 className="flex-1 text-center text-base font-semibold pr-10" style={{ color: "#323233" }}>
              我的申领记录
            </h2>
          </div>

          <div className="shrink-0 overflow-x-auto px-3 py-2 flex gap-2">
            {REQUEST_STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setRequestStatusFilter(f.value)}
                className="shrink-0 text-xs px-3 py-1.5 rounded-full"
                style={{
                  color: requestStatusFilter === f.value ? "#1989fa" : "#646566",
                  background: requestStatusFilter === f.value ? "#e8f3ff" : "#f0f2f5",
                  border: `1px solid ${requestStatusFilter === f.value ? "#d4e5fc" : "#e6e8eb"}`,
                  fontWeight: requestStatusFilter === f.value ? 600 : 400,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-6">
            {requestRows.length === 0 ? (
              <p className="text-center text-sm py-16" style={{ color: "#969799" }}>
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
                    className="mb-2.5 p-3.5 rounded-xl"
                    style={{
                      background: "#fff",
                      border: "1px solid #ebecef",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className="text-sm font-medium flex-1 min-w-0"
                        style={{ color: "#323233" }}
                      >
                        {row.displayTitle}
                      </p>
                      <span
                        className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          color: isReject ? "#ee0a24" : isWarn ? "#ed6a0c" : "#07c160",
                          background: isReject ? "#fde8ea" : isWarn ? "#fff7ef" : "#e8f8ef",
                        }}
                      >
                        {row.statusText}
                      </span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: "#969799" }}>
                      {row.createdAtText}
                    </p>
                    {row.lineSummary && (
                      <p className="text-xs mt-0.5" style={{ color: "#969799" }}>
                        {row.lineSummary}
                      </p>
                    )}
                    {/* 操作按钮 */}
                    <div className="flex gap-2 mt-2 pt-2" style={{ borderTop: "1px solid #f2f3f5" }}>
                      {row.canWithdraw && (
                        <button
                          type="button"
                          onClick={() => handleWithdraw(row.id)}
                          className="text-xs px-3 py-1 rounded-full font-medium"
                          style={{ color: "#ee0a24", background: "#fde8ea", border: "1px solid #f8d0d4" }}
                        >
                          撤回
                        </button>
                      )}
                      {row.canRevoke && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(row.id)}
                          className="text-xs px-3 py-1 rounded-full font-medium"
                          style={{ color: "#d97706", background: "#fef3c7", border: "1px solid #fde68a" }}
                        >
                          撤销
                        </button>
                      )}
                      {row.canReceive && (
                        <button
                          type="button"
                          onClick={() => handleConfirmReceive(row.id)}
                          className="text-xs px-3 py-1 rounded-full font-medium"
                          style={{ color: "#1989fa", background: "#e8f3ff", border: "1px solid #d4e5fc" }}
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
