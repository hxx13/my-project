import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { useSpecTemplates } from "@/api/hooks/useReferenceData";
import type { RefDataItem } from "@/api/domains/referenceData.api";
import { specPriceKey } from "./typeRegistry";
import { OrderRoomTreeSelect } from "./OrderRoomTreeSelect";
import { PersonnelPicker } from "@/components/admin/PersonnelPicker";
import type { PickedCage } from "./CagePickerPanel";

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
  /** 每个 entry 可自带笼位归属：笼位路径下「一个笼位一条行」，房间与预定各自独立 */
  onConfirm: (
    entries: {
      optionLabel: string;
      qty: number;
      remark?: string;
      /** 该行锁定的笼位预定 id（笼位路径下必有） */
      reservationId?: string;
      /** 该行领用房间——取它自己那个笼位所在的房间 */
      pickupRoomId?: string;
      pickupRoomName?: string;
    }[],
    pickup: OrderPickupInfo,
  ) => void;
  onClose: () => void;
  orderingBlocked?: boolean;
  /** 领用人只能从本人课题组里选 */
  groupNames?: string[];
  /** 默认领用人=本人 */
  selfUserId?: string;
  selfUserName?: string;
  /** 当前锁定的 AUP → aup_record.id；给了就要求必选笼位 */
  aupRecordId?: number | string;
  /** 已锁定的笼位（顺序即分配顺序）；状态在页面级，抽屉关掉/弹窗关掉都不丢 */
  pickedCages?: PickedCage[];
  /** cageId → 该笼位分到的数量（页面按顺序分配算好） */
  allocByCageId?: Record<string, number>;
  /** 单笼上限：用来把总数卡在「已选笼位数 × 上限」，逼用户先选够笼位 */
  maxQuantityPerCage?: number;
  /** 把「当前在填哪个规格、多少只」报给页面级抽屉做上限与一笼一规格预判 */
  onCageContextChange?: (ctx: { specOptionLabel: string; quantity: number }) => void;
  /**
   * 与笼位抽屉同处一个文档流时置 true：不再自己 fixed + 遮罩 + portal，
   * 而是当页面级浮层容器的子元素，与抽屉并排，互不遮盖。
   */
  embedded?: boolean;
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

export default function SpecSelectPanel({ item, parentLabel, onConfirm, onClose, orderingBlocked, groupNames, selfUserId, selfUserName, aupRecordId, pickedCages = [], allocByCageId = {}, maxQuantityPerCage = 0, onCageContextChange, embedded = false }: SpecSelectPanelProps) {
  const { data: templates = [] } = useSpecTemplates();

  /** 有 AUP 才谈得上「预定到笼位」，此时笼位必选 */
  const cageRequired = aupRecordId != null && String(aupRecordId) !== "";

  /**
   * 总数上限 = 已选笼位数 × 单笼上限（`null` 表示不设限，非笼位路径）。
   * 想买更多就必须先去右边加笼位 —— 从源头杜绝「买了 12 只但只有 2 个笼位放」。
   * 一个笼位都没选时上限是 0，加号会提示先去选笼位。
   */
  const cageCap = cageRequired && maxQuantityPerCage > 0
    ? pickedCages.length * maxQuantityPerCage
    : null;
  const capMax = cageCap ?? 999;
  /** 加数量：到顶就提示去选笼位，而不是默默卡住 */
  const bumpOverCap = (nextTotal: number) => {
    if (cageCap != null && nextTotal > cageCap) {
      toast.error(
        pickedCages.length === 0
          ? "请先在右侧选择笼位，再填数量"
          : `已选 ${pickedCages.length} 个笼位，最多 ${cageCap} 只；要更多请先在右侧再选笼位`,
      );
      return true;
    }
    return false;
  };

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
  /** 每个规格选项各一行备注，随加购写到该车行 */
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  /** 无规格物品的单行备注 */
  const [noSpecRemark, setNoSpecRemark] = useState("");
  /** 无规格模板的物品：直接按数量加购，默认 1 件 */
  const [noSpecQty, setNoSpecQty] = useState(1);

  /**
   * 同一规格模板内互斥：某选项已填数量时，同模板的其他选项禁用。
   *
   * 典型是「性别」模板的 雌性 / 雄性 —— 一个笼位只能放一种性别，两行都填会导致
   * 锁笼位时只取第一行（`filledEntries[0]`），第二行永远对不上笼位。
   * 跨模板不互斥（不同模板是不同维度，可以并存）。
   */
  const activeKeyByTemplate = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of optionRows) {
      if ((qtys[r.key] || 0) > 0) m.set(r.key.split(":")[0], r.key);
    }
    return m;
  }, [optionRows, qtys]);

  /**
   * 把当前填的规格与数量报给页面级抽屉。
   * 抽屉常驻、弹窗关了不收，所以它得知道「上次在选哪个规格、多少只」才能算分配。
   */
  const filledEntries = optionRows.filter(r => (qtys[r.key] || 0) > 0);
  // 有规格的物品没填数量就报 0，抽屉据此拦住「还没定数量就锁笼位」
  const cageQty = filledEntries.length > 0
    ? qtys[filledEntries[0].key] || 0
    : (optionRows.length === 0 ? noSpecQty : 0);
  const cageSpecLabel = filledEntries.length > 0
    ? `${filledEntries[0].templateName}: ${filledEntries[0].label}`
    : "";
  useEffect(() => {
    onCageContextChange?.({ specOptionLabel: cageSpecLabel, quantity: cageQty });
  }, [onCageContextChange, cageSpecLabel, cageQty]);

  const handleConfirm = () => {
    const rows = optionRows.filter(r => (qtys[r.key] || 0) > 0);
    if (rows.length === 0) return;
    // 领用房间必选：未选不提交，只给出提示。
    // 笼位路径下**不看这里** —— 房间由每个笼位自带（一个笼位一条行），
    // 这里的 pickupRoomId 永远是空的，先判它会把整条路静默堵死。
    if (!cageRequired && roomMissing) { setRoomTouched(true); return; }

    if (cageRequired) {
      // 一个笼位只放一种规格 → 一次加购只能带一个规格行
      if (rows.length > 1) {
        toast.error("单个笼位只放一种规格，请一次加购一个规格");
        return;
      }
      const total = qtys[rows[0].key] || 0;
      if (pickedCages.length === 0) {
        toast.error("请先在右侧选择笼位");
        return;
      }
      const allocated = pickedCages.reduce((s, c) => s + (allocByCageId[c.animalCageId] || 0), 0);
      if (allocated !== total) {
        toast.error(`已分配到 ${allocated} 只，与规格总数 ${total} 不一致，请在右侧调整`);
        return;
      }
      const optionLabel = `${rows[0].templateName}: ${rows[0].label}`;
      const remark = (remarks[rows[0].key] || "").trim();
      // 一个笼位一条行：数量 = 该笼分到的量，领用房间取该笼所在的房间
      // （多房间时每一行各自带自己的房间，下单时后端按房间分单）
      const cageEntries = pickedCages
        .map(c => ({ cage: c, qty: allocByCageId[c.animalCageId] || 0 }))
        .filter(x => x.qty > 0)
        .map(({ cage, qty }) => ({
          optionLabel,
          qty,
          remark,
          reservationId: cage.reservationId,
          pickupRoomId: cage.roomId ?? undefined,
          pickupRoomName: cage.roomName ?? undefined,
        }));
      onConfirm(cageEntries, pickup);
      return;
    }

    const entries = rows.map(r => ({
      optionLabel: `${r.templateName}: ${r.label}`,
      qty: qtys[r.key],
      remark: (remarks[r.key] || "").trim(),
    }));
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

  /** 所选笼位涉及的房间（去重）。跨房间时这里会列多个，下单按房间分单 */
  const cageRoomNames = useMemo(
    () => [...new Set(pickedCages.map((c) => c.roomName).filter((n): n is string => !!n))],
    [pickedCages],
  );

  /** 领用方式/房间（必选）+ 领用人（默认本人）：两个分支共用 */
  const pickupFields = (
    <div className="shrink-0 space-y-2 border-b border-[var(--twin-hairline)] px-4 pb-3">
      <div>
        <label className="mb-1 block text-[11px] text-[var(--twin-body)]">
          领用方式/房间 <span className="text-[var(--app-color-feedback-danger)]">*</span>
        </label>
        {cageRequired ? (
          <>
            <div className="min-h-9 rounded-twin-sm border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-sm">
              {cageRoomNames.length > 0 ? (
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {cageRoomNames.map((n) => (
                    <span key={n} className="min-w-0 truncate text-[var(--twin-ink)]">{n}</span>
                  ))}
                </div>
              ) : (
                <span className="text-[var(--twin-mute)]">选定笼位后自动带出</span>
              )}
            </div>
            <div className="mt-1 text-[10px] text-[var(--twin-mute)]">
              {cageRoomNames.length > 1
                ? `涉及 ${cageRoomNames.length} 个房间；每行按自己笼位的房间落单，提交时按房间分开成单`
                : "随右侧所选笼位自动带出，不需要手选"}
            </div>
          </>
        ) : (
          <>
            <OrderRoomTreeSelect
              value={pickupRoomName}
              onChange={(path, id) => { setPickupRoomName(path); setPickupRoomId(id); setRoomTouched(true); }}
              invalid={roomTouched && roomMissing}
            />
            {roomTouched && roomMissing && (
              <div className="mt-1 text-[10px] text-[var(--app-color-feedback-danger)]">请选择领用房间</div>
            )}
          </>
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
    const panel = (
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
                    type="number" min={1} max={capMax}
                    value={noSpecQty}
                    onChange={e => {
                      const n = parseInt(e.target.value || "1", 10);
                      const cap = capMax;
                      setNoSpecQty(Number.isFinite(n) ? Math.min(cap, Math.max(1, n)) : 1);
                    }}
                    className="h-6 w-12 rounded border border-[var(--twin-hairline)] text-center text-xs"
                  />
                  <button
                    type="button"
                    className="h-6 w-6 rounded bg-sky-600 text-xs font-bold text-white"
                    onClick={() => {
                      const next = noSpecQty + 1;
                      if (bumpOverCap(next)) return;
                      setNoSpecQty(next);
                    }}
                  >+</button>
                </div>
              </div>
              {lineTotal != null && (
                <div className="mt-1 text-right text-[10px] font-semibold text-sky-700">小计 {money(lineTotal)}</div>
              )}
              <input
                type="text"
                placeholder="备注…"
                value={noSpecRemark}
                onChange={e => setNoSpecRemark(e.target.value)}
                className="mt-1.5 w-full rounded border border-[var(--twin-hairline)] bg-white px-2 py-1 text-[11px] text-[var(--twin-ink)] outline-none ring-sky-500 focus:ring-1"
              />
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
                if (!cageRequired && roomMissing) { setRoomTouched(true); return; }
                if (cageRequired) {
                  if (pickedCages.length === 0) {
                    toast.error("请先在右侧选择笼位");
                    return;
                  }
                  const allocated = pickedCages.reduce((s, c) => s + (allocByCageId[c.animalCageId] || 0), 0);
                  if (allocated !== noSpecQty) {
                    toast.error(`已分配到 ${allocated} 只，与总数 ${noSpecQty} 不一致，请在右侧调整`);
                    return;
                  }
                  const remark = noSpecRemark.trim();
                  const cageEntries = pickedCages
                    .map(c => ({ cage: c, qty: allocByCageId[c.animalCageId] || 0 }))
                    .filter(x => x.qty > 0)
                    .map(({ cage, qty }) => ({
                      optionLabel: "",
                      qty,
                      remark,
                      reservationId: cage.reservationId,
                      pickupRoomId: cage.roomId ?? undefined,
                      pickupRoomName: cage.roomName ?? undefined,
                    }));
                  onConfirm(cageEntries, pickup);
                  return;
                }
                onConfirm([{ optionLabel: "", qty: noSpecQty, remark: noSpecRemark.trim() }], pickup);
              }}
              disabled={orderingBlocked || noSpecQty <= 0}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors"
              style={{ backgroundColor: !orderingBlocked && noSpecQty > 0 ? "#16a34a" : "#9ca3af" }}
            >
              加入购物车
            </button>
          </div>
        </div>
    );

    if (embedded) return <>{panel}{collectorPicker}</>;

    return (
      <>
      {createPortal(
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
          {panel}
        </div>,
        document.body,
      )}
      {collectorPicker}
      </>
    );
  }

  const panel = (
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
            const activeSibling = activeKeyByTemplate.get(row.key.split(":")[0]);
            const blocked = !!activeSibling && activeSibling !== row.key;
            return (
              <div key={row.key} className={`rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2${blocked ? " opacity-45" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0 mr-2">
                    <div className="text-xs font-medium text-[var(--twin-ink)] truncate">{row.label}</div>
                    {blocked && (
                      <div className="text-[10px] text-[var(--twin-mute)]">
                        同规格只能选一项，已选「{optionRows.find(r => r.key === activeSibling)?.label ?? ""}」
                      </div>
                    )}
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
                      disabled={q <= 0 || blocked}
                      onClick={() => setQtys(prev => {
                        const cur = prev[row.key] || 0;
                        if (cur <= 1) { const n = { ...prev }; delete n[row.key]; return n; }
                        return { ...prev, [row.key]: cur - 1 };
                      })}
                    >−</button>
                    <input
                      type="number" min={0} max={capMax}
                      value={q || ""}
                      placeholder="0"
                      disabled={blocked}
                      onChange={e => {
                        const n = parseInt(e.target.value || "0", 10);
                        if (n <= 0) { setQtys(prev => { const nxt = { ...prev }; delete nxt[row.key]; return nxt; }); }
                        else setQtys(prev => ({ ...prev, [row.key]: Math.min(capMax, n) }));
                      }}
                      className="h-6 w-12 rounded border border-[var(--twin-hairline)] text-center text-xs"
                    />
                    <button
                      type="button"
                      className="h-6 w-6 rounded bg-sky-600 text-xs font-bold text-white disabled:opacity-30 disabled:bg-slate-400"
                      disabled={blocked}
                      onClick={() => {
                        const next = (qtys[row.key] || 0) + 1;
                        if (bumpOverCap(next)) return;
                        setQtys(prev => ({ ...prev, [row.key]: next }));
                      }}
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
                <input
                  type="text"
                  placeholder="备注…"
                  disabled={blocked}
                  value={remarks[row.key] || ""}
                  onChange={e => setRemarks(prev => ({ ...prev, [row.key]: e.target.value }))}
                  className="mt-1.5 w-full rounded border border-[var(--twin-hairline)] bg-white px-2 py-1 text-[11px] text-[var(--twin-ink)] outline-none ring-sky-500 focus:ring-1"
                />
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
  );

  if (embedded) return <>{panel}{collectorPicker}</>;

  return (
    <>
    {createPortal(
      <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        {panel}
      </div>,
      document.body,
    )}
    {collectorPicker}
    </>
  );
}
