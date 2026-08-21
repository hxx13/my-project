import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2, Loader2, Search, ChevronDown, Check } from "lucide-react";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import {
  deleteScanDelayCarrier,
  deleteScanDelayOption,
  fetchScanDelayCarriers,
  fetchScanDelayOptions,
  fetchScanDelayRoomBindings,
  fetchScanDelayStatus,
  saveScanDelayCarrier,
  saveScanDelayOption,
  saveScanDelayRoomBinding,
  setScanDelayMasterSettings,
  type ScanDelayCarrier,
  type ScanDelayOption,
  type ScanDelayRoomBinding,
} from "@/api/domains/scanDelay.api";
import { fetchSystemOnlyUsers, type SystemUserRecord } from "@/api/domains/admin.api";
import { fetchRoomMappingRooms, type RoomMappingRoomRow } from "@/api/twinApi";
import { DEFAULT_EXEMPT_UNTIL_TIME, EXEMPT_MODE_OPTIONS, formatExemptTimeRule, formatExemptUntilLabel } from "@/constants/exemptDurationPresets";
import { ExemptUntilTimePicker } from "@/components/admin/ExemptUntilTimePicker";

import { appConfirm } from "@/lib/appDialog";
type TabKey = "menu" | "carriers" | "rooms";

type BindingGroup = {
  signature: string;
  carrierIds: number[];
  roomIds: string[];
};

function bindingSignature(carrierIds: number[]): string {
  return [...carrierIds].sort((a, b) => a - b).join(",");
}

function normalizeRoomId(roomId: string | null | undefined): string {
  return roomId == null ? "" : String(roomId).trim();
}

function groupBindings(bindings: ScanDelayRoomBinding[]): BindingGroup[] {
  const map = new Map<string, BindingGroup>();
  for (const b of bindings) {
    const roomId = normalizeRoomId(b.roomId);
    if (!roomId) continue;
    const sig = bindingSignature(b.carrierIds);
    const existing = map.get(sig);
    if (existing) {
      if (!existing.roomIds.includes(roomId)) existing.roomIds.push(roomId);
    } else {
      map.set(sig, {
        signature: sig,
        carrierIds: [...b.carrierIds].sort((a, c) => a - c),
        roomIds: [roomId],
      });
    }
  }
  return Array.from(map.values())
    .map((g) => ({
      ...g,
      roomIds: g.roomIds.sort((a, b) =>
        String(a).localeCompare(String(b), "zh-CN")
      ),
    }))
    .sort((a, b) => b.roomIds.length - a.roomIds.length);
}

const emptyForm = (): Partial<ScanDelayOption> => ({
  optionLabel: formatExemptUntilLabel(DEFAULT_EXEMPT_UNTIL_TIME),
  exemptMode: "TIME",
  extendUntilTime: DEFAULT_EXEMPT_UNTIL_TIME,
  durationMinutes: null,
  requireApproval: false,
  reviewerUserIds: [],
  enabled: true,
  sortOrder: 0,
});

async function loadAllRooms(): Promise<RoomMappingRoomRow[]> {
  const pageSize = 200;
  const all: RoomMappingRoomRow[] = [];
  let page = 1;
  for (;;) {
    const { list, total } = await fetchRoomMappingRooms({ page, pageSize });
    all.push(...list);
    if (list.length === 0 || all.length >= total) break;
    page += 1;
  }
  const byId = new Map<string, RoomMappingRoomRow>();
  for (const row of all) {
    const roomId = normalizeRoomId(row.roomId);
    if (!roomId || byId.has(roomId)) continue;
    byId.set(roomId, { ...row, roomId });
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(a.roomName || a.roomId).localeCompare(String(b.roomName || b.roomId), "zh-CN")
  );
}

async function loadAllStaff(): Promise<SystemUserRecord[]> {
  const pageSize = 300;
  const all: SystemUserRecord[] = [];
  let page = 1;
  for (;;) {
    const batch = await fetchSystemOnlyUsers(page, pageSize, "");
    const rows = batch?.data ?? [];
    all.push(...rows);
    if (rows.length === 0 || all.length >= (batch?.total ?? 0)) break;
    page += 1;
  }
  return all.filter((u) => u.status !== 0);
}

function staffLabel(u: SystemUserRecord): string {
  const nick = (u.displayNickname || "").trim();
  const user = (u.username || "").trim();
  if (nick && user) return `${nick}（${user}）`;
  return nick || user || u.id;
}

/** 下拉多选：折叠展示，展开后可搜索并勾选多项 */
function DropdownMultiSelect({
  title,
  hint,
  searchPlaceholder,
  emptyPlaceholder = "请选择",
  items,
  selected,
  onChange,
  loading,
}: {
  title: string;
  hint?: string;
  searchPlaceholder: string;
  emptyPlaceholder?: string;
  items: Array<{ key: string; label: string }>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((it) => it.label.toLowerCase().includes(kw));
  }, [items, keyword]);

  const normalizedSelected = useMemo(
    () => new Set(Array.from(selected).map(normalizeRoomId).filter(Boolean)),
    [selected]
  );

  const selectedLabels = useMemo(
    () =>
      Array.from(normalizedSelected).map(
        (roomId) => items.find((it) => it.key === roomId)?.label ?? roomId
      ),
    [items, normalizedSelected]
  );

  const triggerText = useMemo(() => {
    if (normalizedSelected.size === 0) return emptyPlaceholder;
    if (normalizedSelected.size <= 3) return selectedLabels.join("、");
    return `已选 ${normalizedSelected.size} 个：${selectedLabels.slice(0, 2).join("、")}…`;
  }, [emptyPlaceholder, normalizedSelected.size, selectedLabels]);

  const toggle = (key: string) => {
    const normalizedKey = normalizeRoomId(key);
    if (!normalizedKey) return;
    const next = new Set(normalizedSelected);
    if (next.has(normalizedKey)) next.delete(normalizedKey);
    else next.add(normalizedKey);
    onChange(next);
  };

  return (
    <div ref={rootRef} className="relative flex flex-col gap-2 text-sm">
      <div>
        <span className="font-medium text-[var(--app-color-text-secondary)]">{title}</span>
        {hint ? <p className="mt-0.5 text-xs text-[var(--app-color-text-tertiary)]">{hint}</p> : null}
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--app-color-surface-hover)] disabled:opacity-60"
      >
        <span
          className={`min-w-0 flex-1 truncate ${normalizedSelected.size === 0 ? "text-[var(--app-color-text-tertiary)]" : "text-[var(--app-color-text-primary)]"}`}
        >
          {loading ? "加载中…" : triggerText}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !loading ? (
        <div className="absolute left-0 right-0 top-full z-[var(--z-dropdown)] mt-1 overflow-hidden rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-[var(--app-shadow-elevated)]">
          <div className="border-b border-[var(--app-color-border-default)] p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-color-text-tertiary)]" />
              <input
                className="w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] py-2 pl-9 pr-3 text-sm"
                placeholder={searchPlaceholder}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[min(320px,45vh)] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--app-color-text-tertiary)]">无匹配项</p>
            ) : (
              filtered.map((it) => {
                const checked = normalizedSelected.has(it.key);
                return (
                  <button
                    key={it.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggle(it.key)}
                    className={`flex w-full items-center gap-2 rounded-[var(--app-radius-element)] px-2 py-2 text-left transition-colors ${
                      checked
                        ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-text-primary)]"
                        : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border-2 ${
                        checked
                          ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)] text-[var(--app-color-text-inverse)]"
                          : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)]"
                      }`}
                    >
                      {checked ? <Check className="h-2.5 w-2.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{it.label}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-[var(--app-color-border-default)] px-3 py-2 text-xs text-[var(--app-color-text-tertiary)]">
            <span>{normalizedSelected.size > 0 ? `已选 ${normalizedSelected.size} 项` : "可多选"}</span>
            {normalizedSelected.size > 0 ? (
              <button
                type="button"
                className="text-[var(--app-color-accent)] underline"
                onClick={() => onChange(new Set())}
              >
                清空选择
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CheckboxPicker({
  title,
  hint,
  searchPlaceholder,
  items,
  selected,
  onChange,
  loading,
}: {
  title: string;
  hint?: string;
  searchPlaceholder: string;
  items: Array<{ key: string; label: string; sub?: string }>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  loading?: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter(
      (it) => it.label.toLowerCase().includes(kw) || it.key.toLowerCase().includes(kw) || (it.sub || "").toLowerCase().includes(kw)
    );
  }, [items, keyword]);

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2 text-sm md:col-span-2">
      <div>
        <span className="font-medium text-[var(--app-color-text-secondary)]">{title}</span>
        {hint ? <p className="mt-0.5 text-xs text-[var(--app-color-text-tertiary)]">{hint}</p> : null}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-color-text-tertiary)]" />
        <input
          className="w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] py-2 pl-9 pr-3"
          placeholder={searchPlaceholder}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      <div className="max-h-44 overflow-y-auto rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-2 space-y-1">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--app-color-text-tertiary)]">无匹配项</p>
        ) : (
          filtered.map((it) => (
            <label
              key={it.key}
              className="flex cursor-pointer items-start gap-2 rounded-[var(--app-radius-element)] px-2 py-1.5 hover:bg-[var(--app-color-surface-hover)]"
            >
              <AdminSwitchScaled size="sm" checked={selected.has(it.key)} onChange={() => toggle(it.key)} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[var(--app-color-text-primary)]">{it.label}</span>
                {it.sub ? <span className="block text-[11px] font-mono text-[var(--app-color-text-tertiary)]">{it.sub}</span> : null}
              </span>
            </label>
          ))
        )}
      </div>
      {selected.size > 0 ? (
        <p className="text-xs text-[var(--app-color-text-tertiary)]">已选 {selected.size} 项</p>
      ) : null}
    </div>
  );
}

/** 大华发卡页内嵌：延迟总开关 + 选项库 + 房间搭配 */
export function ScanDelayConfigPanel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const optionFormRef = useRef<HTMLDivElement>(null);
  const roomFormRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabKey>("menu");
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("延迟");
  const [masterLoading, setMasterLoading] = useState(true);
  const [masterSaving, setMasterSaving] = useState(false);
  const [carriers, setCarriers] = useState<ScanDelayCarrier[]>([]);
  const [carriersLoading, setCarriersLoading] = useState(true);
  const [savingCarrier, setSavingCarrier] = useState(false);
  const [carrierLabelDrafts, setCarrierLabelDrafts] = useState<Record<number, string>>({});
  const [carrierOptionDrafts, setCarrierOptionDrafts] = useState<Record<number, Set<string>>>({});
  const [optionFormOpen, setOptionFormOpen] = useState(false);
  const [options, setOptions] = useState<ScanDelayOption[]>([]);
  const [bindings, setBindings] = useState<ScanDelayRoomBinding[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [bindingsLoading, setBindingsLoading] = useState(true);
  const [savingOption, setSavingOption] = useState(false);
  const [savingBinding, setSavingBinding] = useState(false);
  const [form, setForm] = useState<Partial<ScanDelayOption>>(emptyForm());
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<Set<string>>(new Set());
  const [bindingRoomIds, setBindingRoomIds] = useState<Set<string>>(new Set());
  const [bindingCarrierIds, setBindingCarrierIds] = useState<Set<string>>(new Set());
  /** 编辑历史搭配时记录原房间集；保存时需对取消勾选的房间解除绑定 */
  const [bindingEditOriginalRoomIds, setBindingEditOriginalRoomIds] = useState<Set<string> | null>(null);
  const [rooms, setRooms] = useState<RoomMappingRoomRow[]>([]);
  const [staff, setStaff] = useState<SystemUserRecord[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);

  const roomById = useMemo(() => {
    const map = new Map<string, RoomMappingRoomRow>();
    for (const r of rooms) {
      const roomId = normalizeRoomId(r.roomId);
      if (roomId && !map.has(roomId)) map.set(roomId, { ...r, roomId });
    }
    return map;
  }, [rooms]);
  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const carrierById = useMemo(() => new Map(carriers.map((c) => [c.id, c])), [carriers]);

  const menuPickerItems = useMemo(
    () =>
      options.map((o) => ({
        key: String(o.id),
        label: o.optionLabel,
        sub: `${o.exemptMode} · ${formatExemptTimeRule(o.extendUntilTime, o.durationMinutes)}${o.enabled === false ? " · 已停用" : ""}`,
      })),
    [options]
  );

  const bindingByRoom = useMemo(() => {
    const map = new Map<string, ScanDelayRoomBinding>();
    for (const b of bindings) {
      const roomId = normalizeRoomId(b.roomId);
      if (roomId) map.set(roomId, { ...b, roomId });
    }
    return map;
  }, [bindings]);

  const bindingGroups = useMemo(() => groupBindings(bindings), [bindings]);

  const scrollToRef = useCallback((target: React.RefObject<HTMLDivElement | null>) => {
    requestAnimationFrame(() => {
      target.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const staffPickerItems = useMemo(
    () =>
      staff.map((u) => ({
        key: u.id,
        label: staffLabel(u),
        sub: u.id,
      })),
    [staff]
  );

  const carrierPickerItems = useMemo(
    () =>
      carriers
        .filter((c) => c.enabled !== false)
        .map((c) => ({
          key: String(c.id),
          label: c.buttonLabel,
          sub: `${c.optionIds?.length ?? c.optionCount ?? 0} 个已分配菜单项`,
        })),
    [carriers]
  );

  const roomPickerItems = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    for (const r of rooms) {
      const roomId = normalizeRoomId(r.roomId);
      if (!roomId || map.has(roomId)) continue;
      map.set(roomId, {
        key: roomId,
        label: (r.roomName || "未命名房间").trim(),
      });
    }
    // 已选但不在映射列表中的房间也要出现在下拉里，否则无法取消勾选
    for (const rawId of bindingRoomIds) {
      const roomId = normalizeRoomId(rawId);
      if (!roomId || map.has(roomId)) continue;
      map.set(roomId, {
        key: roomId,
        label: (roomById.get(roomId)?.roomName || "未命名房间").trim(),
      });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  }, [rooms, bindingRoomIds, roomById]);

  const loadMaster = useCallback(async () => {
    setMasterLoading(true);
    try {
      const st = await fetchScanDelayStatus();
      setMasterEnabled(Boolean(st.enabled));
      setButtonLabel(st.buttonLabel || "延迟");
    } catch {
      setMasterEnabled(false);
      setButtonLabel("延迟");
    } finally {
      setMasterLoading(false);
    }
  }, []);

  const loadCarriers = useCallback(async () => {
    setCarriersLoading(true);
    try {
      setCarriers(await fetchScanDelayCarriers());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载载体按钮失败");
    } finally {
      setCarriersLoading(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      setOptions(await fetchScanDelayOptions());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载选项库失败");
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  const loadBindings = useCallback(async () => {
    setBindingsLoading(true);
    try {
      setBindings(await fetchScanDelayRoomBindings());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载房间搭配失败");
    } finally {
      setBindingsLoading(false);
    }
  }, []);

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const [roomRows, staffRows] = await Promise.all([loadAllRooms(), loadAllStaff()]);
      setRooms(roomRows);
      setStaff(staffRows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载房间/员工列表失败");
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMaster();
    void loadCarriers();
    void loadOptions();
    void loadBindings();
    void loadMeta();
  }, [loadMaster, loadCarriers, loadOptions, loadBindings, loadMeta]);

  useEffect(() => {
    setCarrierLabelDrafts((prev) => {
      const next = { ...prev };
      for (const c of carriers) {
        if (next[c.id] === undefined) next[c.id] = c.buttonLabel || "延迟";
      }
      return next;
    });
    setCarrierOptionDrafts((prev) => {
      const next = { ...prev };
      for (const c of carriers) {
        if (prev[c.id] === undefined) {
          next[c.id] = new Set((c.optionIds ?? []).map(String));
        }
      }
      return next;
    });
  }, [carriers]);

  const saveMaster = async (next: { enabled?: boolean; buttonLabel?: string }) => {
    setMasterSaving(true);
    try {
      const enabled = next.enabled ?? masterEnabled;
      const label = (next.buttonLabel ?? buttonLabel).trim() || "延迟";
      await setScanDelayMasterSettings({ enabled, buttonLabel: label });
      setMasterEnabled(enabled);
      setButtonLabel(label);
      toast.success("已保存全局设置");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setMasterSaving(false);
    }
  };

  const resetForm = () => {
    setForm(emptyForm());
    setSelectedReviewerIds(new Set());
    setOptionFormOpen(false);
  };

  const startNewOption = () => {
    setForm(emptyForm());
    setSelectedReviewerIds(new Set());
    setOptionFormOpen(true);
    scrollToRef(optionFormRef);
  };

  const handleSaveCarrierAssignment = async (carrierId: number) => {
    const carrier = carrierById.get(carrierId);
    if (!carrier) return;
    const label = (carrierLabelDrafts[carrierId] ?? carrier.buttonLabel).trim() || "延迟";
    const optionIds = Array.from(carrierOptionDrafts[carrierId] ?? [])
      .map(Number)
      .filter((n) => Number.isFinite(n));
    setSavingCarrier(true);
    try {
      const saved = await saveScanDelayCarrier({
        id: carrierId,
        buttonLabel: label,
        enabled: carrier.enabled,
        sortOrder: carrier.sortOrder,
        optionIds,
      });
      setCarriers((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      setCarrierLabelDrafts((prev) => ({ ...prev, [saved.id]: saved.buttonLabel }));
      setCarrierOptionDrafts((prev) => ({
        ...prev,
        [saved.id]: new Set((saved.optionIds ?? []).map(String)),
      }));
      toast.success("已保存载体与菜单项分配");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存载体分配失败");
    } finally {
      setSavingCarrier(false);
    }
  };

  const handleAddCarrier = async () => {
    setSavingCarrier(true);
    try {
      const saved = await saveScanDelayCarrier({
        buttonLabel: "新载体",
        enabled: true,
        sortOrder: 0,
      });
      setCarriers((prev) => [...prev, saved].sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id));
      setCarrierLabelDrafts((prev) => ({ ...prev, [saved.id]: saved.buttonLabel }));
      setCarrierOptionDrafts((prev) => ({ ...prev, [saved.id]: new Set() }));
      toast.success("已添加载体按钮");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加载体失败");
    } finally {
      setSavingCarrier(false);
    }
  };

  const handleDeleteCarrier = async (id: number) => {
    if (!await appConfirm("确定删除该载体？房间绑定与菜单项分配将移除，菜单项库条目保留。")) return;
    try {
      await deleteScanDelayCarrier(id);
      setCarriers((prev) => prev.filter((c) => c.id !== id));
      setBindings((prev) =>
        prev
          .map((b) => ({
            ...b,
            carrierIds: b.carrierIds.filter((cid) => cid !== id),
          }))
          .filter((b) => b.carrierIds.length > 0)
      );
      setCarrierOptionDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.success("已删除载体");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const handleEditOption = (row: ScanDelayOption) => {
    setForm({ ...row });
    setSelectedReviewerIds(new Set(row.reviewerUserIds ?? []));
    setOptionFormOpen(true);
    scrollToRef(optionFormRef);
  };

  const handleSaveOption = async () => {
    if (!form.optionLabel?.trim()) {
      toast.error("请填写二级菜单文案");
      return;
    }
    if (form.requireApproval && selectedReviewerIds.size === 0) {
      toast.error("需要审核时，请至少选择一名推荐审核人");
      return;
    }

    const exemptMode = form.exemptMode ?? "TIME";
    if ((exemptMode === "TIME" || exemptMode === "BOTH") && !form.extendUntilTime?.trim() && form.durationMinutes == null) {
      toast.error("请选择延长至时点");
      return;
    }
    if ((exemptMode === "COUNT" || exemptMode === "BOTH") && (form.maxCount == null || form.maxCount < 1)) {
      toast.error("COUNT/BOTH 模式请填写次数上限（至少 1）");
      return;
    }

    setSavingOption(true);
    try {
      const saved = await saveScanDelayOption({
        ...form,
        extendUntilTime:
          exemptMode === "TIME" || exemptMode === "BOTH"
            ? form.extendUntilTime?.trim() || DEFAULT_EXEMPT_UNTIL_TIME
            : form.extendUntilTime?.trim() || null,
        reviewerUserIds: Array.from(selectedReviewerIds),
        enabled: form.enabled !== false,
        requireApproval: Boolean(form.requireApproval),
        displayStart: form.displayStart || null,
        displayEnd: form.displayEnd || null,
      });
      // 保存后仅合并当前行，禁止整表 load；post-save-no-full-refresh.mdc
      setOptions((prev) => {
        const map = new Map(prev.map((r) => [r.id, r]));
        map.set(saved.id, saved);
        return Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      });
      toast.success(form.id ? "已更新菜单项" : "已添加菜单项");
      resetForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingOption(false);
    }
  };

  const handleDeleteOption = async (id: number) => {
    if (!await appConfirm("确定删除该菜单项？载体上的分配将一并移除。")) return;
    try {
      await deleteScanDelayOption(id);
      setOptions((prev) => prev.filter((r) => r.id !== id));
      setCarriers((prev) =>
        prev.map((c) => ({
          ...c,
          optionIds: (c.optionIds ?? []).filter((oid) => oid !== id),
          optionCount: Math.max(0, (c.optionCount ?? 0) - ((c.optionIds ?? []).includes(id) ? 1 : 0)),
        }))
      );
      setCarrierOptionDrafts((prev) => {
        const next: Record<number, Set<string>> = {};
        for (const [cid, set] of Object.entries(prev)) {
          const copy = new Set(set);
          copy.delete(String(id));
          next[Number(cid)] = copy;
        }
        return next;
      });
      if (form.id === id) resetForm();
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const startNewRoomBinding = () => {
    setBindingRoomIds(new Set());
    setBindingCarrierIds(new Set());
    setBindingEditOriginalRoomIds(null);
    setTab("rooms");
    scrollToRef(roomFormRef);
  };

  const startEditBindingGroup = (group: BindingGroup) => {
    const roomIds = group.roomIds.map(normalizeRoomId).filter(Boolean);
    setBindingRoomIds(new Set(roomIds));
    setBindingCarrierIds(new Set(group.carrierIds.map(String)));
    setBindingEditOriginalRoomIds(new Set(roomIds));
    setTab("rooms");
    scrollToRef(roomFormRef);
  };

  const handleBindingRoomsChange = (next: Set<string>) => {
    const normalized = new Set(Array.from(next).map(normalizeRoomId).filter(Boolean));
    const prevSize = bindingRoomIds.size;
    setBindingRoomIds(normalized);

    // 编辑已有搭配：保留当前载体勾选，不因改房间而清空
    if (bindingEditOriginalRoomIds != null) {
      return;
    }

    if (normalized.size === 0) {
      setBindingCarrierIds(new Set());
      return;
    }

    // 新增：仅首次单选时带入该房间已有绑定，便于微调
    if (prevSize === 0 && normalized.size === 1) {
      const roomId = Array.from(normalized)[0];
      const existing = bindingByRoom.get(roomId);
      setBindingCarrierIds(new Set((existing?.carrierIds ?? []).map(String)));
      return;
    }

    if (prevSize > 1 && normalized.size === 1) {
      const roomId = Array.from(normalized)[0];
      const existing = bindingByRoom.get(roomId);
      setBindingCarrierIds(new Set((existing?.carrierIds ?? []).map(String)));
    }
    // 其余情况（多选批量新增/继续勾选）保持用户已选的载体不变
  };

  const handleSaveBinding = async () => {
    const roomIds = Array.from(bindingRoomIds).map(normalizeRoomId).filter(Boolean);
    const carrierIds = Array.from(bindingCarrierIds)
      .map(Number)
      .filter((n) => Number.isFinite(n));

    const roomsToSave = new Set(roomIds);
    const roomsToClear: string[] = [];
    if (bindingEditOriginalRoomIds != null) {
      for (const originalId of bindingEditOriginalRoomIds) {
        if (!roomsToSave.has(originalId)) {
          roomsToClear.push(originalId);
        }
      }
    }

    if (roomIds.length === 0 && roomsToClear.length === 0) {
      toast.error("请至少选择一个房间");
      return;
    }

    setSavingBinding(true);
    try {
      const savedRows: ScanDelayRoomBinding[] = [];
      for (const roomId of roomIds) {
        savedRows.push(await saveScanDelayRoomBinding(roomId, carrierIds));
      }
      for (const roomId of roomsToClear) {
        savedRows.push(await saveScanDelayRoomBinding(roomId, []));
      }
      // 保存后仅合并涉及房间，禁止整表 load；post-save-no-full-refresh.mdc
      setBindings((prev) => {
        const map = new Map(prev.map((b) => [normalizeRoomId(b.roomId), { ...b, roomId: normalizeRoomId(b.roomId) }]));
        for (const saved of savedRows) {
          const rid = normalizeRoomId(saved.roomId);
          if (!rid) continue;
          if (saved.carrierIds.length === 0) map.delete(rid);
          else map.set(rid, { ...saved, roomId: rid });
        }
        return Array.from(map.values()).sort((a, b) => a.roomId.localeCompare(b.roomId));
      });

      const clearedCount = roomsToClear.length;
      if (clearedCount > 0 && roomIds.length > 0) {
        toast.success(`已更新 ${roomIds.length} 个房间，并解除 ${clearedCount} 个房间的绑定`);
      } else if (clearedCount > 0) {
        toast.success(`已解除 ${clearedCount} 个房间的绑定`);
      } else {
        toast.success(roomIds.length > 1 ? `已为 ${roomIds.length} 个房间保存载体搭配` : "已保存房间载体搭配");
      }
      startNewRoomBinding();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingBinding(false);
    }
  };

  return (
    <div ref={scrollRef} className="space-y-4 max-h-[min(78vh,720px)] overflow-y-auto pr-1">
      <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--app-color-text-primary)]">扫码延迟总开关</p>
            <p className="text-xs text-[var(--app-color-text-tertiary)] mt-0.5">
              开启后，扫码弹窗「进入」旁显示延迟载体按钮；先在菜单项库配置规则，再在载体分配中勾选菜单项。
            </p>
          </div>
          <label className="flex items-center gap-2 shrink-0 text-sm font-medium">
            <AdminSwitchScaled
              size="sm"
              disabled={masterLoading || masterSaving}
              checked={masterEnabled}
              onChange={(checked) => void saveMaster({ enabled: checked })}
            />
            {masterSaving ? "保存中…" : masterEnabled ? "已开启" : "已关闭"}
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-[var(--app-color-border-default)]/60 pt-3">
          <label className="flex flex-col gap-1 text-sm min-w-[160px] flex-1">
            <span className="font-medium text-[var(--app-color-text-secondary)]">全局兜底按钮文案</span>
            <span className="text-[11px] text-[var(--app-color-text-tertiary)]">仅当载体按钮未配置文案时使用。</span>
            <input
              className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2"
              value={buttonLabel}
              disabled={masterSaving}
              onChange={(e) => setButtonLabel(e.target.value)}
              onBlur={() => void saveMaster({ buttonLabel })}
            />
          </label>
        </div>
      </div>

      <div className="flex gap-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] p-1 bg-[var(--app-color-surface-page)]">
        <button
          type="button"
          className={`flex-1 rounded-[var(--app-radius-element)] px-3 py-2 text-sm font-bold transition-colors ${
            tab === "menu"
              ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent-ink)]"
              : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
          }`}
          onClick={() => setTab("menu")}
        >
          菜单项库
        </button>
        <button
          type="button"
          className={`flex-1 rounded-[var(--app-radius-element)] px-3 py-2 text-sm font-bold transition-colors ${
            tab === "carriers"
              ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent-ink)]"
              : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
          }`}
          onClick={() => setTab("carriers")}
        >
          载体分配
        </button>
        <button
          type="button"
          className={`flex-1 rounded-[var(--app-radius-element)] px-3 py-2 text-sm font-bold transition-colors ${
            tab === "rooms"
              ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent-ink)]"
              : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
          }`}
          onClick={() => setTab("rooms")}
        >
          房间搭配
        </button>
      </div>

      {tab === "menu" ? (
        <div className="space-y-4">
          <AdminFormCard title="延迟菜单项库">
            <p className="mb-3 text-xs text-[var(--app-color-text-tertiary)]">
              在此独立配置各菜单项规则；配置完成后到「载体分配」Tab 勾选要挂载的菜单项。
            </p>
            {optionsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : options.length === 0 ? (
              <p className="text-sm text-[var(--app-color-text-tertiary)]">暂无菜单项，请点击下方添加。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--app-color-border-default)] text-left text-[var(--app-color-text-tertiary)]">
                      <th className="py-2 pr-3">菜单项</th>
                      <th className="py-2 pr-3">时段</th>
                      <th className="py-2 pr-3">规则</th>
                      <th className="py-2 pr-3">状态</th>
                      <th className="py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {options.map((r) => (
                      <tr
                        key={r.id}
                        className={`border-b border-[var(--app-color-border-default)]/60 ${
                          form.id === r.id && optionFormOpen ? "bg-[var(--app-color-accent-soft)]/40" : ""
                        }`}
                      >
                        <td className="py-2 pr-3 font-medium">{r.optionLabel}</td>
                        <td className="py-2 pr-3 text-xs">
                          {r.displayStart || r.displayEnd
                            ? `${r.displayStart || "00:00"} ~ ${r.displayEnd || "24:00"}`
                            : "全天"}
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          {r.exemptMode} / {formatExemptTimeRule(r.extendUntilTime, r.durationMinutes)} · {r.requireApproval ? "需审核" : "直批"}
                        </td>
                        <td className="py-2 pr-3">
                          {r.enabled ? (
                            <span className="text-[var(--app-color-feedback-success)]">启用</span>
                          ) : (
                            <span className="text-[var(--app-color-text-tertiary)]">停用</span>
                          )}
                        </td>
                        <td className="py-2">
                          <div className="flex gap-2">
                            <button type="button" className="text-[var(--app-color-accent)]" onClick={() => handleEditOption(r)}>配置</button>
                            <button type="button" className="text-[var(--app-color-feedback-danger)]" onClick={() => void handleDeleteOption(r.id)}>
                              <Trash2 className="h-4 w-4 inline" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3">
              <button
                type="button"
                onClick={startNewOption}
                className="inline-flex items-center gap-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-3 py-2 text-sm font-bold text-[var(--app-color-accent)]"
              >
                <Plus className="h-4 w-4" />
                添加菜单项
              </button>
            </div>
          </AdminFormCard>

          {optionFormOpen ? (
            <div ref={optionFormRef}>
              <AdminFormCard title={form.id ? `配置菜单项 #${form.id}` : "新增菜单项"}>
                <p className="mb-3 text-xs text-[var(--app-color-text-tertiary)]">
                  此处仅配置菜单项规则；挂载到哪个载体按钮，请在「载体分配」Tab 勾选。
                </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="font-medium text-[var(--app-color-text-secondary)]">菜单项文案</span>
                <input
                  className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2"
                  value={form.optionLabel ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, optionLabel: e.target.value }))}
                  placeholder="如：延长 2 小时"
                />
              </label>

              <div className="flex flex-col gap-2 text-sm md:col-span-2 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-3">
                <div>
                  <span className="font-medium text-[var(--app-color-text-secondary)]">显示时段</span>
                  <p className="mt-0.5 text-xs text-[var(--app-color-text-tertiary)]">仅在该时段内，该选项才会出现在二级菜单；留空表示全天有效。</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <span className="text-xs text-[var(--app-color-text-tertiary)]">从</span>
                    <input
                      type="time"
                      className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1.5"
                      value={form.displayStart ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, displayStart: e.target.value || null }))}
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-xs text-[var(--app-color-text-tertiary)]">至</span>
                    <input
                      type="time"
                      className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1.5"
                      value={form.displayEnd ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, displayEnd: e.target.value || null }))}
                    />
                  </label>
                  <button
                    type="button"
                    className="text-xs text-[var(--app-color-accent)] underline"
                    onClick={() => setForm((f) => ({ ...f, displayStart: null, displayEnd: null }))}
                  >
                    清除时段（全天）
                  </button>
                </div>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-[var(--app-color-text-secondary)]">免冻结模式</span>
                <select
                  className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2"
                  value={form.exemptMode ?? "TIME"}
                  onChange={(e) => setForm((f) => ({ ...f, exemptMode: e.target.value }))}
                >
                  {EXEMPT_MODE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-2 text-sm md:col-span-2">
                <span className="font-medium text-[var(--app-color-text-secondary)]">延长至（当日）</span>
                <ExemptUntilTimePicker
                  value={form.extendUntilTime ?? DEFAULT_EXEMPT_UNTIL_TIME}
                  onChange={(untilTime) =>
                    setForm((f) => ({
                      ...f,
                      extendUntilTime: untilTime,
                      optionLabel: f.optionLabel?.trim() ? f.optionLabel : formatExemptUntilLabel(untilTime),
                    }))
                  }
                  disabled={savingOption}
                />
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-[var(--app-color-text-secondary)]">次数上限 (COUNT/BOTH 模式)</span>
                <input
                  type="number"
                  min={1}
                  className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2"
                  value={form.maxCount ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, maxCount: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="可选"
                />
              </label>

              <label className="flex items-start gap-2 text-sm md:col-span-2">
                <AdminSwitchScaled
                  size="sm"
                  checked={Boolean(form.requireApproval)}
                  onChange={(checked) => setForm((f) => ({ ...f, requireApproval: checked }))}
                />
                <span>
                  <span className="font-medium text-[var(--app-color-text-secondary)]">需要教职工审核后生效</span>
                  <span className="block text-xs text-[var(--app-color-text-tertiary)]">关闭则学生点击后立即授予免冻结；开启则进入「学生审核」页待审。</span>
                </span>
              </label>
              {form.requireApproval ? (
                <CheckboxPicker
                  title="推荐审核人"
                  hint="学生提交申请后，仅列表中勾选的教职工可审核。"
                  searchPlaceholder="搜索教职工姓名或工号…"
                  items={staffPickerItems}
                  selected={selectedReviewerIds}
                  onChange={setSelectedReviewerIds}
                />
              ) : null}
              <label className="flex items-start gap-2 text-sm md:col-span-2">
                <AdminSwitchScaled
                  size="sm"
                  checked={form.enabled !== false}
                  onChange={(checked) => setForm((f) => ({ ...f, enabled: checked }))}
                />
                <span>
                  <span className="font-medium text-[var(--app-color-text-secondary)]">启用本选项</span>
                  <span className="block text-xs text-[var(--app-color-text-tertiary)]">关闭后即使房间已绑定，也不会出现在二级菜单。</span>
                </span>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={savingOption}
                onClick={() => void handleSaveOption()}
                className="inline-flex items-center gap-1 rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-4 py-2 text-sm font-bold text-[var(--app-color-text-inverse)] disabled:opacity-50"
              >
                {savingOption ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {form.id ? "更新菜单项" : "添加菜单项"}
              </button>
              <button
                type="button"
                className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-4 py-2 text-sm"
                onClick={resetForm}
              >
                取消
              </button>
            </div>
          </AdminFormCard>
            </div>
          ) : null}
        </div>
      ) : tab === "carriers" ? (
        <div className="space-y-4">
          <AdminFormCard title="载体按钮与菜单项分配">
            <p className="mb-3 text-xs text-[var(--app-color-text-tertiary)]">
              每个载体对应扫码页一个按钮；从「菜单项库」勾选要挂载的菜单项。房间搭配时只需选择载体。
            </p>
            {carriersLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : carriers.length === 0 ? (
              <p className="text-sm text-[var(--app-color-text-tertiary)]">暂无载体，请先点击下方按钮新增。</p>
            ) : (
              <div className="space-y-4">
                {carriers.map((carrier) => (
                  <div
                    key={carrier.id}
                    className="space-y-3 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-3"
                  >
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-sm">
                        <span className="font-medium text-[var(--app-color-text-secondary)]">载体按钮文案</span>
                        <input
                          className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2"
                          value={carrierLabelDrafts[carrier.id] ?? carrier.buttonLabel}
                          disabled={savingCarrier}
                          onChange={(e) =>
                            setCarrierLabelDrafts((prev) => ({ ...prev, [carrier.id]: e.target.value }))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="rounded-[var(--app-radius-element)] border border-[var(--app-color-feedback-danger)] px-3 py-2 text-sm text-[var(--app-color-feedback-danger)]"
                        onClick={() => void handleDeleteCarrier(carrier.id)}
                      >
                        删除载体
                      </button>
                    </div>
                    <CheckboxPicker
                      title="分配菜单项（可多选）"
                      hint="勾选菜单项库中已配置好的条目；保存后该载体二级菜单将展示这些项。"
                      searchPlaceholder="搜索菜单项文案…"
                      items={menuPickerItems}
                      selected={carrierOptionDrafts[carrier.id] ?? new Set()}
                      onChange={(next) =>
                        setCarrierOptionDrafts((prev) => ({ ...prev, [carrier.id]: next }))
                      }
                      loading={optionsLoading}
                    />
                    <button
                      type="button"
                      disabled={savingCarrier}
                      onClick={() => void handleSaveCarrierAssignment(carrier.id)}
                      className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-4 py-2 text-sm font-bold text-[var(--app-color-text-inverse)] disabled:opacity-50"
                    >
                      {savingCarrier ? "保存中…" : "保存载体分配"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-[var(--app-radius-element)] border border-dashed border-[var(--app-color-border-default)] px-3 py-2 text-sm font-bold text-[var(--app-color-accent)]"
                disabled={savingCarrier}
                onClick={() => void handleAddCarrier()}
              >
                <Plus className="h-4 w-4" />
                新增载体
              </button>
            </div>
          </AdminFormCard>
        </div>
      ) : (
        <div className="space-y-4">
          <div ref={roomFormRef}>
          <AdminFormCard title={bindingEditOriginalRoomIds ? "编辑房间搭配" : "新增房间搭配"}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              {bindingEditOriginalRoomIds ? (
                <p className="rounded-[var(--app-radius-element)] border border-[var(--app-color-accent-soft)] bg-[var(--app-color-accent-soft)]/40 px-3 py-2 text-xs text-[var(--app-color-text-secondary)]">
                  正在编辑历史搭配：保留勾选的房间并应用下方载体；<strong className="text-[var(--app-color-text-primary)]">取消勾选的房间将解除绑定</strong>。
                </p>
              ) : (
                <p className="text-xs text-[var(--app-color-text-tertiary)]">
                  勾选房间与载体后保存；未出现在下方历史列表的房间，在此新增即可。相同载体组合会自动收纳到历史区。
                </p>
              )}
              {bindingRoomIds.size > 0 || bindingEditOriginalRoomIds ? (
                <button
                  type="button"
                  className="shrink-0 text-xs text-[var(--app-color-accent)] underline"
                  onClick={startNewRoomBinding}
                >
                  {bindingEditOriginalRoomIds ? "取消编辑" : "清空表单"}
                </button>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <DropdownMultiSelect
                title="目标房间（可多选）"
                hint="从 ARO 房间映射选择；可多选批量应用到相同载体组合。"
                searchPlaceholder="搜索房间名称…"
                emptyPlaceholder="点击选择房间（可多选）"
                items={roomPickerItems}
                selected={bindingRoomIds}
                onChange={handleBindingRoomsChange}
                loading={metaLoading}
              />

              <CheckboxPicker
                title="载体按钮（可多选）"
                hint={bindingRoomIds.size > 0
                  ? "勾选后保存；所选房间将展示这些载体及其下全部已启用的菜单项。"
                  : "请先勾选左侧至少一个房间，再选择载体。"}
                searchPlaceholder="搜索载体文案…"
                items={carrierPickerItems}
                selected={bindingCarrierIds}
                onChange={setBindingCarrierIds}
                loading={carriersLoading}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={savingBinding || bindingRoomIds.size === 0 || carriers.length === 0}
                onClick={() => void handleSaveBinding()}
                className="inline-flex items-center gap-1 rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-4 py-2 text-sm font-bold text-[var(--app-color-text-inverse)] disabled:opacity-50"
              >
                {savingBinding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {bindingRoomIds.size === 0
                  ? "请先选择房间"
                  : bindingEditOriginalRoomIds
                    ? `保存编辑（${bindingRoomIds.size} 个房间）`
                    : bindingRoomIds.size > 1
                      ? `保存到 ${bindingRoomIds.size} 个房间`
                      : "保存房间搭配"}
              </button>
              {bindingRoomIds.size > 0 ? (
                <span className="text-xs text-[var(--app-color-text-tertiary)]">
                  已选 {bindingRoomIds.size} 个房间、{bindingCarrierIds.size} 个载体
                </span>
              ) : null}
            </div>
          </AdminFormCard>
          </div>

          <AdminFormCard title="已保存的历史搭配">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--app-color-text-tertiary)]">
                按相同载体组合收纳；仅需改已有搭配时点「编辑」，新增房间请用上方面板。
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs font-bold text-[var(--app-color-accent)]"
                onClick={startNewRoomBinding}
              >
                <Plus className="h-3.5 w-3.5" />
                新增搭配
              </button>
            </div>
            {bindingsLoading || metaLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : bindingGroups.length === 0 ? (
              <p className="text-sm text-[var(--app-color-text-tertiary)]">尚无历史搭配；请在上方面板选择房间与载体后保存。</p>
            ) : (
              <div className="space-y-3">
                {bindingGroups.map((group) => (
                  <div
                    key={group.signature}
                    className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[var(--app-color-text-primary)]">
                          {group.roomIds.length} 个房间 · {group.carrierIds.length} 个载体
                        </p>
                        <ul className="mt-1 space-y-0.5 text-[12px] text-[var(--app-color-text-secondary)]">
                          {group.carrierIds.map((cid) => {
                            const carrier = carrierById.get(cid);
                            const assigned = (carrier?.optionIds ?? [])
                              .map((oid) => optionById.get(oid)?.optionLabel)
                              .filter(Boolean);
                            return (
                              <li key={cid}>
                                「{carrier?.buttonLabel ?? `#${cid}`}」
                                {assigned.length > 0
                                  ? `：${assigned.join("、")}`
                                  : "（未分配菜单项）"}
                              </li>
                            );
                          })}
                        </ul>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {group.roomIds.map((roomId) => (
                            <span
                              key={roomId}
                              className="inline-flex max-w-full items-center rounded-[var(--app-radius-pill)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-0.5 text-[11px] text-[var(--app-color-text-secondary)]"
                            >
                              {roomById.get(normalizeRoomId(roomId))?.roomName || "未命名房间"}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-sm font-medium text-[var(--app-color-accent)]"
                        onClick={() => startEditBindingGroup(group)}
                      >
                        编辑此搭配
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminFormCard>
        </div>
      )}
    </div>
  );
}
