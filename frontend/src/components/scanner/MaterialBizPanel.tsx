import { useMemo, useState, useCallback } from "react";
import { Minus, Plus, Clock, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import {
  useMaterialCategories,
  useMaterialItems,
} from "@/api/hooks/useMaterial";
import { createMaterialRequestWithToken } from "@/api/domains/material.api";
import type { AuthData } from "@/api/domains/auth.api";
import { checkPinStatus } from "./specialChannel.api";
import type { MaterialItem } from "@/api/domains/material.api";
import type { BizItemSlotProps } from "@/components/scanner/BizOverlayShell.types";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import {
  formatMaterialApplicantGroupLabel,
  resolveMaterialApplicantGroup,
} from "@/features/student/materialApplicant";
import { MaterialSpecPickControl } from "@/components/material/MaterialSpecPickerSheet";
import { hasSpecSchema } from "@/utils/materialSpecHelpers";
import { webImageSrc } from "@/utils/mediaUrl";
import { FillHeightScroll } from "@/components/layout/ScrollFillLayout";
import { cn } from "@/lib/utils";

// 明暗主题适配令牌
const CARD_BG = "bg-[var(--app-color-surface-elevated)]";
const CARD_BORDER = "border-[var(--app-color-border-default)]";
const TEXT = "text-[var(--app-color-text-primary)]";
const TEXT_SEC = "text-[var(--app-color-text-secondary)]";
const TEXT_MUTED = "text-[var(--app-color-text-tertiary)]";
const BTN_GHOST = "bg-[var(--app-color-surface-hover)]";
const ACCENT_BG = "bg-[var(--app-color-accent)]";

type MaterialCart = Record<string, number>;

// -- helpers --

function formatSpecLabel(specJson: string | undefined | null): string {
  if (!specJson) return "";
  try { return Object.values(JSON.parse(specJson)).join("·"); }
  catch { return ""; }
}

function parseSpecKey(specKey: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!specKey) return result;
  for (const part of specKey.split("|")) {
    const eq = part.indexOf("=");
    if (eq > 0) result[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return result;
}

function parseCartKey(key: string): { itemId: number; specKey: string } {
  const idx = key.indexOf("::");
  if (idx === -1) return { itemId: Number(key), specKey: "" };
  return { itemId: Number(key.slice(0, idx)), specKey: key.slice(idx + 2) };
}

/**
 * 快捷业务-申领物品面板（明暗主题适配）
 * 登记信息与学生中心 /student/material 一致：PIN 后以被扫人员身份提交，applicantGroup 同规则。
 */
export default function MaterialBizPanel({ userId, scanUser, onDone }: BizItemSlotProps) {
  const { data: categories = [] } = useMaterialCategories();
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const { data: rawItems = [] } = useMaterialItems(activeCat === "all" ? undefined : activeCat);
  /** 扫码场景使用本地购物车，避免误用操作员服务端 cart */
  const [cart, setCart] = useState<MaterialCart>({});
  const [submitting, setSubmitting] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [keypadMode, setKeypadMode] = useState<"set" | "verify">("verify");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [scheduledPickupTime, setScheduledPickupTime] = useState<string | null>(null);
  const [showPickupPicker, setShowPickupPicker] = useState(false);

  /** 预约领取预设日期（北京时间） */
  const pickupPresets = useMemo(() => {
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const beijingNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    const y = beijingNow.getFullYear();
    const m = beijingNow.getMonth() + 1;
    const d = beijingNow.getDate();
    const todayStr = `${y}-${pad2(m)}-${pad2(d)}`;
    const tomorrow = new Date(beijingNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tmrStr = `${tomorrow.getFullYear()}-${pad2(tomorrow.getMonth() + 1)}-${pad2(tomorrow.getDate())}`;
    const afterTomorrow = new Date(beijingNow);
    afterTomorrow.setDate(afterTomorrow.getDate() + 2);
    const datStr = `${afterTomorrow.getFullYear()}-${pad2(afterTomorrow.getMonth() + 1)}-${pad2(afterTomorrow.getDate())}`;
    return [
      { label: "后天", iso: datStr },
    ];
  }, []);

  function pickupTimeLabel(iso: string): string {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    return `预约 ${parseInt(m[2])}月${parseInt(m[3])}日 领取`;
  }

  const applicantName = scanUser?.userName?.trim() || userId;
  const applicantGroupLabel = formatMaterialApplicantGroupLabel(scanUser);

  const items = useMemo(() => rawItems.filter((it) => it.shelfStatus !== "DRAFT"), [rawItems]);

  const cartCount = useMemo(() => Object.values(cart).reduce((s, q) => s + q, 0), [cart]);

  const cartLines = useMemo(() => {
    return Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([key, q]) => {
        const { itemId, specKey } = parseCartKey(key);
        const it = items.find((x) => x.id === itemId);
        const specLabel = specKey ? formatSpecLabel(JSON.stringify(parseSpecKey(specKey))) : "";
        return { key, itemId, name: it?.name || "物资", cover: it?.coverUrl, qty: q, specLabel };
      });
  }, [cart, items]);

  const updateQty = (key: string, delta: number, maxStock?: number) => {
    setCart((prev) => {
      const next = { ...prev };
      const cur = next[key] || 0;
      const cap = maxStock != null ? Math.min(999, maxStock) : 999;
      const nv = Math.max(0, Math.min(cap, cur + delta));
      if (nv === 0) delete next[key];
      else next[key] = nv;
      return next;
    });
  };

  const handleSubmit = useCallback(async () => {
    if (cartCount === 0) {
      toast.error("请先选择物资");
      return;
    }
    try {
      const hasPin = await checkPinStatus(userId);
      setKeypadMode(hasPin ? "verify" : "set");
    } catch {
      setKeypadMode("set");
    }
    setShowKeypad(true);
  }, [cartCount, userId]);

  const handlePinSuccess = useCallback(
    async (authData: AuthData) => {
      setShowKeypad(false);
      const pinUserId = authData.userInfo?.id?.trim();
      if (!pinUserId || pinUserId !== userId.trim()) {
        toast.error("身份校验失败：PIN 与当前刷卡人员不一致，请重新操作");
        return;
      }
      const lines = Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([key, qty]) => {
          const { itemId, specKey } = parseCartKey(key);
          return {
            itemId,
            qty,
            specSnapshot: specKey ? JSON.stringify(parseSpecKey(specKey)) : undefined,
          };
        });
      const applicantGroup = resolveMaterialApplicantGroup(scanUser);
      setSubmitting(true);
      try {
        const results = await createMaterialRequestWithToken(authData.token, lines, applicantGroup, scheduledPickupTime);
        const count = Array.isArray(results) ? results.length : 1;
        const message = `已为 ${applicantName} 提交 ${count} 张申领单`;
        setSuccessMessage(message);
        setCart({});
        setScheduledPickupTime(null);
        setShowPickupPicker(false);
        toast.success(message, { duration: 4000 });
        window.setTimeout(() => {
          setSuccessMessage(null);
          onDone();
        }, 1800);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "提交失败");
      } finally {
        setSubmitting(false);
      }
    },
    [cart, scanUser, applicantName, onDone, userId, scheduledPickupTime],
  );

  return (
    <>
      {showKeypad && (
        <NumericKeypad
          mode={keypadMode}
          userId={userId}
          userName={applicantName}
          onSuccess={handlePinSuccess}
          onCancel={() => setShowKeypad(false)}
        />
      )}
      <div className={`flex h-full flex-col ${TEXT}`}>
        <div className={`shrink-0 border-b ${CARD_BORDER} px-3 py-2 text-xs`}>
          <div className={TEXT_MUTED}>申领人</div>
          <div className={`mt-0.5 font-medium ${TEXT}`}>{applicantName}</div>
          <div className={`mt-1 ${TEXT_SEC}`}>
            课题组/部门：<span className={TEXT}>{applicantGroupLabel}</span>
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          {/* 分类 — 左侧纵向 */}
          <div
            className={`flex min-h-0 shrink-0 flex-col gap-0.5 overflow-y-auto overscroll-y-contain border-r ${CARD_BORDER} px-1.5 py-2`}
            style={{ width: 108 }}
          >
            <button
              onClick={() => setActiveCat("all")}
              className={cn(
                "rounded-lg px-2 py-1.5 text-xs text-left transition-colors",
                activeCat === "all" ? "bg-cyan-500/20 text-cyan-400" : `${TEXT_MUTED} hover:${TEXT}`,
              )}
            >
              全部
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCat(cat.id)}
                className={cn(
                  "rounded-lg px-2 py-1.5 text-xs text-left transition-colors",
                  activeCat === cat.id ? "bg-cyan-500/20 text-cyan-400" : `${TEXT_MUTED} hover:${TEXT}`,
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* 物品卡片 + 购物车 — 右侧 */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <FillHeightScroll className="px-2 pt-2">
              <div className="grid grid-cols-2 gap-2 pb-2">
                {items.map((item) => {
                  const max =
                    item.stockMode === "QUANTIFIED"
                      ? Math.max(0, item.stockQty || 0)
                      : item.stockQty >= 1
                        ? 9999
                        : 0;
                  return (
                    <MaterialItemCard
                      key={item.id}
                      item={item}
                      cart={cart}
                      maxStock={max}
                      onCartChange={(key, delta) => updateQty(key, delta, max)}
                    />
                  );
                })}
              </div>
            </FillHeightScroll>

            {/* 底部购物车 + 提交 */}
            <div className={`shrink-0 border-t ${CARD_BORDER} p-2`}>
              {successMessage ? (
                <div
                  className="rounded-xl border border-[var(--app-color-feedback-success)]/30 bg-[var(--app-color-feedback-success-soft)] px-3 py-3 text-center"
                  role="status"
                  aria-live="polite"
                >
                  <p className="text-sm font-semibold text-[var(--app-color-feedback-success)]">
                    提交成功
                  </p>
                  <p className={`mt-1 text-xs text-[var(--app-color-text-secondary)]`}>{successMessage}</p>
                </div>
              ) : (
                <>
                  {cartCount > 0 && (
                    <div className="mb-2 max-h-[25vh] overflow-y-auto space-y-1">
                      {cartLines.map((line) => (
                        <div key={line.key} className={`flex items-center gap-2 text-xs ${TEXT_MUTED}`}>
                          {line.cover ? (
                            <img
                              src={webImageSrc(line.cover)}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div
                              className={`h-10 w-10 shrink-0 rounded ${BTN_GHOST} flex items-center justify-center text-xs ${TEXT_MUTED}`}
                            >
                              {line.name.charAt(0)}
                            </div>
                          )}
                          <span className="flex-1 truncate">
                            {line.name}
                            {line.specLabel && (
                              <span className="ml-1 text-[10px] text-cyan-400">
                                {line.specLabel}
                              </span>
                            )}
                          </span>
                          <span className={`shrink-0 text-sm ${TEXT_MUTED}`}>&times;{line.qty}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 预约日期选择面板 */}
                  {showPickupPicker && (
                    <div className="mb-2 space-y-2 rounded-lg border border-cyan-500/40 bg-cyan-500/8 p-2.5">
                      <p className="text-[12px] font-medium text-cyan-400">选择预约领取日期</p>
                      <div className="flex flex-wrap gap-1.5">
                        {pickupPresets.map((p) => (
                          <button
                            key={p.iso}
                            type="button"
                            onClick={() => { setScheduledPickupTime(p.iso); setShowPickupPicker(false); }}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                              scheduledPickupTime === p.iso
                                ? "border-cyan-500 bg-cyan-500/20 text-cyan-400"
                                : `${CARD_BORDER} ${TEXT_SEC} hover:border-cyan-500/40`
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] ${TEXT_MUTED} shrink-0`}>自定义</span>
                        <input
                          type="date"
                          min={pickupPresets[0]?.iso}
                          onChange={(e) => {
                            if (e.target.value) { setScheduledPickupTime(e.target.value); setShowPickupPicker(false); }
                          }}
                          className={`flex-1 rounded border ${CARD_BORDER} px-2 py-1 text-[11px] ${TEXT} bg-[var(--app-color-surface-canvas)]`}
                        />
                      </div>
                    </div>
                  )}

                  {/* 操作按钮 */}
                  {showPickupPicker ? (
                    <button
                      onClick={() => { setShowPickupPicker(false); setScheduledPickupTime(null); }}
                      className={`h-10 w-full rounded-xl border ${CARD_BORDER} text-sm font-medium ${TEXT_SEC} hover:${TEXT} transition-colors`}
                    >
                      ← 返回
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setCart({}); setScheduledPickupTime(null); }}
                        disabled={cartCount === 0}
                        className={`h-12 flex-1 rounded-xl border ${CARD_BORDER} text-base font-medium ${TEXT_SEC} hover:border-[var(--app-color-feedback-danger)]/40 hover:text-[var(--app-color-feedback-danger)] disabled:opacity-30 transition-colors`}
                      >
                        取消
                      </button>
                      <button
                        onClick={() => {
                          if (scheduledPickupTime) {
                            handleSubmit();
                          } else {
                            setShowPickupPicker(true);
                          }
                        }}
                        disabled={cartCount === 0}
                        className={cn(
                          "h-12 flex-[2] rounded-xl text-base font-bold transition-colors disabled:opacity-30",
                          scheduledPickupTime
                            ? `${ACCENT_BG} text-white hover:opacity-90`
                            : `border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20`
                        )}
                      >
                        {scheduledPickupTime ? (
                          <span className="flex items-center justify-center gap-1.5">
                            {pickupTimeLabel(scheduledPickupTime)}
                            <span
                              onClick={(e) => { e.stopPropagation(); setShowPickupPicker(true); }}
                              className="inline-flex items-center justify-center rounded-full bg-white/20 p-0.5 hover:bg-white/30"
                              role="button"
                              aria-label="修改预约日期"
                            >
                              <Pencil className="size-3" />
                            </span>
                          </span>
                        ) : (
                          "预约领用"
                        )}
                      </button>
                      <button
                        onClick={() => { setScheduledPickupTime(null); handleSubmit(); }}
                        disabled={submitting || cartCount === 0}
                        className={`h-12 flex-[2] rounded-xl ${ACCENT_BG} text-base font-bold text-white hover:opacity-90 disabled:opacity-30 transition-colors`}
                      >
                        {submitting ? "提交中…" : `提交领用 (${cartCount})`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** 物品卡片 — 固定尺寸，有规格时仅显示「选择规格」局部弹窗 */
function MaterialItemCard({
  item,
  cart,
  maxStock,
  onCartChange,
}: {
  item: MaterialItem;
  cart: Record<string, number>;
  maxStock: number;
  onCartChange: (key: string, delta: number) => void;
}) {
  const hasSpecs = hasSpecSchema(item.specSchema);
  const imgSrc = webImageSrc(item.coverUrl);
  const soldOut = maxStock <= 0;
  const cartKey = String(item.id);
  const cartQty = cart[cartKey] || 0;

  return (
    <div className={cn(`rounded-xl border ${CARD_BORDER} ${CARD_BG} p-2 overflow-visible`, soldOut && "opacity-40")}>
      <div className="flex gap-2">
        {imgSrc ? (
          <img src={imgSrc} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <div
            className={`h-16 w-16 shrink-0 rounded-lg ${BTN_GHOST} flex items-center justify-center text-xl ${TEXT_MUTED}`}
          >
            {item.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-medium truncate ${TEXT}`}>{item.name}</div>
          {item.subtitle && <div className={`text-xs truncate ${TEXT_MUTED}`}>{item.subtitle}</div>}
          <div className={`mt-1 text-xs ${TEXT_SEC}`}>
            {item.stockMode === "QUANTIFIED" ? `库存 ${item.stockQty}` : item.stockQty >= 1 ? "有货" : "缺货"}
          </div>
        </div>
      </div>
      {!soldOut && (
        <div className="mt-2 flex items-center justify-end">
          {hasSpecs ? (
            <MaterialSpecPickControl
              item={item}
              cart={cart}
              variant="scanner"
              disabled={soldOut}
              onAddKey={(key) => onCartChange(key, 1)}
              onDecKey={(key) => onCartChange(key, -1)}
              onAddPlain={() => onCartChange(cartKey, 1)}
              onDecPlain={() => onCartChange(cartKey, -1)}
            />
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onCartChange(cartKey, -1)}
                disabled={cartQty <= 0}
                className={`h-8 w-8 rounded ${BTN_GHOST} text-sm ${TEXT} hover:opacity-80 disabled:opacity-20`}
              >
                <Minus className="h-4 w-4 mx-auto" />
              </button>
              <span className={`w-10 text-center text-sm tabular-nums ${TEXT}`}>{cartQty}</span>
              <button
                onClick={() => onCartChange(cartKey, 1)}
                disabled={cartQty >= maxStock}
                className="h-8 w-8 rounded bg-cyan-500/30 text-sm text-cyan-400 hover:bg-cyan-500/50 disabled:opacity-20"
              >
                <Plus className="h-4 w-4 mx-auto" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
