import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSpecTemplates } from "@/api/hooks/useReferenceData";
import type { RefDataItem } from "@/api/domains/referenceData.api";
import { specPriceKey } from "./typeRegistry";
import { OrderRoomTreeSelect } from "./OrderRoomTreeSelect";
import { PersonnelPicker } from "@/components/admin/PersonnelPicker";

/** 选购时确定的「领用方式/房间」与「领用人」，随加购提交 */
export interface OrderPickupInfo {
  pickupRoomId: string;
  pickupRoomName: string;
  collectorId?: string;
  collectorName?: string;
}

interface SpecSelectPanelProps {
  item: RefDataItem;
  /** Parent strain name for context display */
  parentLabel?: string;
  onConfirm: (entries: { optionLabel: string; qty: number }[], pickup: OrderPickupInfo) => void;
  onClose: () => void;
  orderingBlocked?: boolean;
  /** 领用人只能从本人课题组里选 */
  groupNames?: string[];
  /** 默认领用人=本人 */
  selfUserId?: string;
  selfUserName?: string;
}

/** 金额展示：null / undefined 一律显示「待定」，不显示 0 以免误解为免费。 */
function money(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "待定";
  return `¥${Number(v).toFixed(2)}`;
}

function extractOptions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : (p?.items ?? []); } catch { return []; }
  }
  if (typeof raw === "object" && raw !== null && Array.isArray((raw as any).items)) return (raw as any).items;
  return [];
}

export default function SpecSelectPanel({ item, parentLabel, onConfirm, onClose, orderingBlocked, groupNames, selfUserId, selfUserName }: SpecSelectPanelProps) {
  const { data: templates = [] } = useSpecTemplates();

  // 领用方式/房间（必选）与领用人（默认本人）
  const [pickupRoomId, setPickupRoomId] = useState("");
  const [pickupRoomName, setPickupRoomName] = useState("");
  const [collectorId, setCollectorId] = useState(selfUserId ?? "");
  const [collectorName, setCollectorName] = useState(selfUserName ?? "");
  const [collectorPickerOpen, setCollectorPickerOpen] = useState(false);
  const [roomTouched, setRoomTouched] = useState(false);

  const roomMissing = !pickupRoomId;
  /** 有课题组才能检索候选领用人；缺失时只保留「本人」 */
  const canPickCollector = !!groupNames && groupNames.length > 0;
  const pickup: OrderPickupInfo = {
    pickupRoomId,
    pickupRoomName,
    collectorId: collectorId || undefined,
    collectorName: collectorName || undefined,
  };

  const templateIds: number[] = useMemo(() => {
    const raw = (item.fieldData as Record<string, unknown>)?.specTemplateIds;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(Number);
    if (typeof raw === "string") {
      try { const p = JSON.parse(raw); return Array.isArray(p) ? p.map(Number) : []; } catch { return []; }
    }
    return [];
  }, [item.fieldData]);

  interface OptionRow {
    key: string;
    templateName: string;
    label: string;
  }

  const optionRows: OptionRow[] = useMemo(() => {
    const rows: OptionRow[] = [];
    for (const tpl of templates) {
      if (!templateIds.includes(tpl.id)) continue;
      const opts = extractOptions(tpl.options);
      for (const opt of opts) {
        rows.push({ key: `${tpl.id}:${opt}`, templateName: tpl.name, label: opt });
      }
    }
    return rows;
  }, [templates, templateIds]);

  const [qtys, setQtys] = useState<Record<string, number>>({});
  /** 无规格模板的物品：直接按数量加购，默认 1 件 */
  const [noSpecQty, setNoSpecQty] = useState(1);

  const handleConfirm = () => {
    const entries = optionRows
      .filter(r => (qtys[r.key] || 0) > 0)
      .map(r => ({ optionLabel: `${r.templateName}: ${r.label}`, qty: qtys[r.key] }));
    if (entries.length === 0) return;
    // 领用房间必选：未选不提交，只给出提示
    if (roomMissing) { setRoomTouched(true); return; }
    onConfirm(entries, pickup);
  };

  const itemLabel = ((item.fieldData as Record<string, unknown>)?.title as string) || `ID ${item.id}`;
  const headerLine = parentLabel ? `${parentLabel} · ${itemLabel}` : itemLabel;

  // 价格：物品开启价格后，每个规格一个价；未配价的规格显示「待定」但仍可加购
  const priceEnabled = (item.fieldData as Record<string, unknown>)?.priceEnabled === true;
  /** 无规格物品的单价（有规格时用 specPrices，此值不参与计算） */
  const flatPrice = useMemo((): number | null => {
    const raw = (item.fieldData as Record<string, unknown>)?.price;
    const n = Number(raw);
    return Number.isFinite(n) && raw !== null && raw !== "" && raw !== undefined ? n : null;
  }, [item.fieldData]);
  const specPrices = useMemo((): Record<string, number> => {
    const raw = (item.fieldData as Record<string, unknown>)?.specPrices;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  }, [item.fieldData]);

  const unitPriceOf = (templateName: string, label: string): number | null => {
    if (!priceEnabled) return null;
    const p = specPrices[specPriceKey(templateName, label)];
    return p == null ? null : p;
  };

  const totalAmount = useMemo(() => {
    let sum = 0;
    let any = false;
    for (const row of optionRows) {
      const q = qtys[row.key] || 0;
      if (q <= 0) continue;
      const p = unitPriceOf(row.templateName, row.label);
      if (p == null) continue;
      any = true;
      sum += p * q;
    }
    return any ? sum : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionRows, qtys, priceEnabled, specPrices]);

  /** 领用方式/房间（必选）+ 领用人（默认本人）：两个分支共用 */
  const pickupFields = (
    <div className="shrink-0 space-y-2 border-b border-[var(--twin-hairline)] px-4 pb-3">
      <div>
        <label className="mb-1 block text-[11px] text-[var(--twin-body)]">
          领用方式/房间 <span className="text-[var(--app-color-feedback-danger)]">*</span>
        </label>
        <OrderRoomTreeSelect
          value={pickupRoomName}
          onChange={(path, id) => { setPickupRoomName(path); setPickupRoomId(id); setRoomTouched(true); }}
          invalid={roomTouched && roomMissing}
        />
        {roomTouched && roomMissing && (
          <div className="mt-1 text-[10px] text-[var(--app-color-feedback-danger)]">请选择领用房间</div>
        )}
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-[var(--twin-body)]">领用人</label>
        {canPickCollector ? (
          <button
            type="button"
            onClick={() => setCollectorPickerOpen(true)}
            className="flex h-9 w-full items-center justify-between gap-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 text-sm"
          >
            <span className="min-w-0 truncate text-left text-[var(--twin-ink)]">
              {collectorName || "本人"}
              <span className="ml-1 text-[11px] text-[var(--twin-mute)]">（默认为本人）</span>
            </span>
            <span className="shrink-0 text-[11px] text-[var(--twin-link)]">选择</span>
          </button>
        ) : (
          <div className="flex h-9 items-center rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 text-sm text-[var(--twin-mute)]">
            本人（未获取到课题组，无法改选领用人）
          </div>
        )}
      </div>
    </div>
  );

  /** 人员选择弹窗挂到面板浮层之外，避免点它的遮罩把面板一起关掉 */
  const collectorPicker = collectorPickerOpen ? (
    <PersonnelPicker
      groupNames={groupNames}
      single
      onClose={() => setCollectorPickerOpen(false)}
      onConfirm={(ids, names) => {
        setCollectorId(ids[0] ?? "");
        setCollectorName(names[0] ?? "");
        setCollectorPickerOpen(false);
      }}
    />
  ) : null;

  // 无规格模板：不再拦截，直接按数量加购（单价取物品自身的 price）
  if (optionRows.length === 0) {
    const lineTotal = priceEnabled && flatPrice != null ? flatPrice * noSpecQty : null;
    return (
      <>
      {createPortal(
      <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div
          className="w-full max-w-sm rounded-twin-xl bg-[var(--twin-canvas)] shadow-twin-level-4 flex flex-col"
          style={{ border: "2px solid #16a34a" }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="text-sm font-bold text-[var(--twin-ink)]">{headerLine} — 选购</h3>
            <button onClick={onClose} className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)]">关闭</button>
          </div>

          {pickupFields}

          <div className="px-4 pb-3">
            <div className="rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0 mr-2">
                  <div className="text-xs font-medium text-[var(--twin-ink)] truncate">{itemLabel}</div>
                  <div className="text-[10px] text-[var(--twin-mute)]">
                    {priceEnabled ? `单价 ${money(flatPrice)}` : "该物品未配置规格选项"}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    className="h-6 w-6 rounded border border-[var(--twin-hairline)] bg-white text-xs font-bold text-[var(--twin-body)] disabled:opacity-30"
                    disabled={noSpecQty <= 1}
                    onClick={() => setNoSpecQty(q => Math.max(1, q - 1))}
                  >−</button>
                  <input
                    type="number" min={1} max={999}
                    value={noSpecQty}
                    onChange={e => {
                      const n = parseInt(e.target.value || "1", 10);
                      setNoSpecQty(Number.isFinite(n) ? Math.min(999, Math.max(1, n)) : 1);
                    }}
                    className="h-6 w-12 rounded border border-[var(--twin-hairline)] text-center text-xs"
                  />
                  <button
                    type="button"
                    className="h-6 w-6 rounded bg-sky-600 text-xs font-bold text-white"
                    onClick={() => setNoSpecQty(q => Math.min(999, q + 1))}
                  >+</button>
                </div>
              </div>
              {lineTotal != null && (
                <div className="mt-1 text-right text-[10px] font-semibold text-sky-700">小计 {money(lineTotal)}</div>
              )}
            </div>
          </div>

          {priceEnabled && (
            <div className="shrink-0 border-t border-[var(--twin-hairline)] px-4 py-2 flex items-center justify-between">
              <span className="text-xs text-[var(--twin-mute)]">合计</span>
              <span className="text-sm font-bold text-sky-700">{money(lineTotal)}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--twin-hairline)] shrink-0">
            <button onClick={onClose} className="rounded-lg border border-[var(--twin-hairline)] px-4 py-2 text-sm text-[var(--twin-body)]">取消</button>
            <button
              onClick={() => {
                if (noSpecQty <= 0) return;
                if (roomMissing) { setRoomTouched(true); return; }
                onConfirm([{ optionLabel: "", qty: noSpecQty }], pickup);
              }}
              disabled={orderingBlocked || noSpecQty <= 0}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors"
              style={{ backgroundColor: !orderingBlocked && noSpecQty > 0 ? "#16a34a" : "#9ca3af" }}
            >
              加入购物车
            </button>
          </div>
        </div>
      </div>,
      document.body,
      )}
      {collectorPicker}
      </>
    );
  }

  return (
    <>
    {createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-twin-xl bg-[var(--twin-canvas)] shadow-twin-level-4 flex flex-col max-h-[85vh]"
        style={{ border: "2px solid #16a34a" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 px-4 pt-4 pb-2">
          <h3 className="text-sm font-bold text-[var(--twin-ink)]">{headerLine} — 选购</h3>
          <button onClick={onClose} className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)]">关闭</button>
        </div>

        {pickupFields}

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-2">
          {optionRows.map(row => {
            const q = qtys[row.key] || 0;
            return (
              <div key={row.key} className="rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 mr-2">
                    <div className="text-xs font-medium text-[var(--twin-ink)] truncate">{row.label}</div>
                    {priceEnabled && (
                      <div className="text-[10px] text-[var(--twin-mute)]">
                        单价 {money(unitPriceOf(row.templateName, row.label))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      className="h-6 w-6 rounded border border-[var(--twin-hairline)] bg-white text-xs font-bold text-[var(--twin-body)] disabled:opacity-30"
                      disabled={q <= 0}
                      onClick={() => setQtys(prev => {
                        const cur = prev[row.key] || 0;
                        if (cur <= 1) { const n = { ...prev }; delete n[row.key]; return n; }
                        return { ...prev, [row.key]: cur - 1 };
                      })}
                    >−</button>
                    <input
                      type="number" min={0} max={999}
                      value={q || ""}
                      placeholder="0"
                      onChange={e => {
                        const n = parseInt(e.target.value || "0", 10);
                        if (n <= 0) { setQtys(prev => { const nxt = { ...prev }; delete nxt[row.key]; return nxt; }); }
                        else setQtys(prev => ({ ...prev, [row.key]: Math.min(999, n) }));
                      }}
                      className="h-6 w-12 rounded border border-[var(--twin-hairline)] text-center text-xs"
                    />
                    <button
                      type="button"
                      className="h-6 w-6 rounded bg-sky-600 text-xs font-bold text-white"
                      onClick={() => setQtys(prev => ({ ...prev, [row.key]: Math.min(999, (prev[row.key] || 0) + 1) }))}
                    >+</button>
                  </div>
                </div>
                {priceEnabled && q > 0 && (() => {
                  const p = unitPriceOf(row.templateName, row.label);
                  return (
                    <div className="mt-1 text-right text-[10px] font-semibold text-sky-700">
                      小计 {p == null ? "待定" : money(p * q)}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {priceEnabled && (
          <div className="shrink-0 border-t border-[var(--twin-hairline)] px-4 py-2 flex items-center justify-between">
            <span className="text-xs text-[var(--twin-mute)]">合计</span>
            <span className="text-sm font-bold text-sky-700">{money(totalAmount)}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--twin-hairline)] shrink-0">
          <button onClick={onClose} className="rounded-lg border border-[var(--twin-hairline)] px-4 py-2 text-sm text-[var(--twin-body)]">取消</button>
          <button
            onClick={handleConfirm}
            disabled={orderingBlocked}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors"
            style={{ backgroundColor: !orderingBlocked && optionRows.some(r => (qtys[r.key] || 0) > 0) ? "#16a34a" : "#9ca3af" }}
          >
            加入购物车
          </button>
        </div>
      </div>
    </div>,
    document.body,
    )}
    {collectorPicker}
    </>
  );
}
