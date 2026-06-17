import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2, Loader2, Search } from "lucide-react";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import {
  deleteScanDelayOption,
  fetchScanDelayOptions,
  fetchScanDelayRoomBindings,
  fetchScanDelayStatus,
  saveScanDelayOption,
  saveScanDelayRoomBinding,
  setScanDelayMasterSettings,
  type ScanDelayOption,
  type ScanDelayRoomBinding,
} from "@/api/domains/scanDelay.api";
import { fetchSystemOnlyUsers, type SystemUserRecord } from "@/api/domains/admin.api";
import { fetchRoomMappingRooms, type RoomMappingRoomRow } from "@/api/twinApi";
import { EXEMPT_DURATION_PRESETS, EXEMPT_MODE_OPTIONS } from "@/constants/exemptDurationPresets";

type TabKey = "library" | "rooms";

const emptyForm = (): Partial<ScanDelayOption> => ({
  optionLabel: "延长 2 小时",
  exemptMode: "TIME",
  durationMinutes: 120,
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
  return all.sort((a, b) => String(a.roomName || a.roomId).localeCompare(String(b.roomName || b.roomId), "zh-CN"));
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
              <input
                type="checkbox"
                className="mt-0.5"
                checked={selected.has(it.key)}
                onChange={() => toggle(it.key)}
              />
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

/** 大华发卡页内嵌：公用延迟按钮 + 选项库 + 房间搭配 */
export function ScanDelayConfigPanel() {
  const [tab, setTab] = useState<TabKey>("library");
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("延迟");
  const [masterLoading, setMasterLoading] = useState(true);
  const [masterSaving, setMasterSaving] = useState(false);
  const [options, setOptions] = useState<ScanDelayOption[]>([]);
  const [bindings, setBindings] = useState<ScanDelayRoomBinding[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [bindingsLoading, setBindingsLoading] = useState(true);
  const [savingOption, setSavingOption] = useState(false);
  const [savingBinding, setSavingBinding] = useState(false);
  const [form, setForm] = useState<Partial<ScanDelayOption>>(emptyForm());
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<Set<string>>(new Set());
  const [bindingRoomIds, setBindingRoomIds] = useState<Set<string>>(new Set());
  const [bindingOptionIds, setBindingOptionIds] = useState<Set<string>>(new Set());
  const [rooms, setRooms] = useState<RoomMappingRoomRow[]>([]);
  const [staff, setStaff] = useState<SystemUserRecord[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);

  const roomById = useMemo(() => new Map(rooms.map((r) => [r.roomId, r])), [rooms]);
  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const bindingByRoom = useMemo(() => {
    const map = new Map<string, ScanDelayRoomBinding>();
    for (const b of bindings) map.set(b.roomId, b);
    return map;
  }, [bindings]);

  const staffPickerItems = useMemo(
    () =>
      staff.map((u) => ({
        key: u.id,
        label: staffLabel(u),
        sub: u.id,
      })),
    [staff]
  );

  const optionPickerItems = useMemo(
    () =>
      options
        .filter((o) => o.enabled !== false)
        .map((o) => ({
          key: String(o.id),
          label: o.optionLabel,
          sub: `${o.exemptMode} · ${o.durationMinutes ?? "-"}min${o.requireApproval ? " · 需审核" : ""}`,
        })),
    [options]
  );

  const roomPickerItems = useMemo(
    () =>
      rooms.map((r) => ({
        key: r.roomId,
        label: (r.roomName || r.roomId).trim(),
        sub: r.roomId,
      })),
    [rooms]
  );

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
    void loadOptions();
    void loadBindings();
    void loadMeta();
  }, [loadMaster, loadOptions, loadBindings, loadMeta]);

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
  };

  const handleEditOption = (row: ScanDelayOption) => {
    setForm({ ...row });
    setSelectedReviewerIds(new Set(row.reviewerUserIds ?? []));
    setTab("library");
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

    setSavingOption(true);
    try {
      const saved = await saveScanDelayOption({
        ...form,
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
      toast.success(form.id ? "已更新选项" : "已添加选项");
      resetForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingOption(false);
    }
  };

  const handleDeleteOption = async (id: number) => {
    if (!window.confirm("确定删除该延迟选项？已绑定该选项的房间将自动移除关联。")) return;
    try {
      await deleteScanDelayOption(id);
      setOptions((prev) => prev.filter((r) => r.id !== id));
      setBindings((prev) =>
        prev
          .map((b) => ({
            ...b,
            optionIds: b.optionIds.filter((oid) => oid !== id),
          }))
          .filter((b) => b.optionIds.length > 0)
      );
      if (form.id === id) resetForm();
      setBindingOptionIds((prev) => {
        const next = new Set(prev);
        next.delete(String(id));
        return next;
      });
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const startEditBinding = (roomId: string) => {
    setBindingRoomIds(new Set([roomId]));
    const existing = bindingByRoom.get(roomId);
    setBindingOptionIds(new Set((existing?.optionIds ?? []).map(String)));
    setTab("rooms");
  };

  const handleBindingRoomsChange = (next: Set<string>) => {
    setBindingRoomIds(next);
    if (next.size === 1) {
      const roomId = Array.from(next)[0];
      const existing = bindingByRoom.get(roomId);
      setBindingOptionIds(new Set((existing?.optionIds ?? []).map(String)));
    } else if (next.size === 0) {
      setBindingOptionIds(new Set());
    }
  };

  const handleSaveBinding = async () => {
    const roomIds = Array.from(bindingRoomIds);
    if (roomIds.length === 0) {
      toast.error("请至少选择一个房间");
      return;
    }
    setSavingBinding(true);
    try {
      const optionIds = Array.from(bindingOptionIds)
        .map(Number)
        .filter((n) => Number.isFinite(n));
      const savedRows: ScanDelayRoomBinding[] = [];
      for (const roomId of roomIds) {
        savedRows.push(await saveScanDelayRoomBinding(roomId, optionIds));
      }
      // 保存后仅合并当前房间绑定，禁止整表 load；post-save-no-full-refresh.mdc
      setBindings((prev) => {
        const map = new Map(prev.map((b) => [b.roomId, b]));
        for (const saved of savedRows) {
          if (saved.optionIds.length === 0) map.delete(saved.roomId);
          else map.set(saved.roomId, saved);
        }
        return Array.from(map.values()).sort((a, b) => a.roomId.localeCompare(b.roomId));
      });
      toast.success(roomIds.length > 1 ? `已为 ${roomIds.length} 个房间保存相同搭配` : "已保存房间搭配");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingBinding(false);
    }
  };

  return (
    <div className="space-y-4 max-h-[min(78vh,720px)] overflow-y-auto pr-1">
      <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--app-color-text-primary)]">扫码延迟总开关</p>
            <p className="text-xs text-[var(--app-color-text-tertiary)] mt-0.5">
              开启后，扫码弹窗「进入」旁显示公用延迟按钮；点击后按房间展示二级菜单。
            </p>
          </div>
          <label className="flex items-center gap-2 shrink-0 text-sm font-medium">
            <input
              type="checkbox"
              disabled={masterLoading || masterSaving}
              checked={masterEnabled}
              onChange={(e) => void saveMaster({ enabled: e.target.checked })}
            />
            {masterSaving ? "保存中…" : masterEnabled ? "已开启" : "已关闭"}
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-[var(--app-color-border-default)]/60 pt-3">
          <label className="flex flex-col gap-1 text-sm min-w-[160px] flex-1">
            <span className="font-medium text-[var(--app-color-text-secondary)]">公用按钮文案</span>
            <span className="text-[11px] text-[var(--app-color-text-tertiary)]">所有房间共用同一载体按钮，二级菜单才展示不同延迟项。</span>
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
            tab === "library"
              ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent-ink)]"
              : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
          }`}
          onClick={() => setTab("library")}
        >
          延迟选项库
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

      {tab === "library" ? (
        <>
          <AdminFormCard title="新增 / 编辑延迟选项（与房间无关）">
            <p className="mb-3 text-xs text-[var(--app-color-text-tertiary)]">
              在此维护可复用的延迟方案；具体哪些房间展示哪些选项，请到「房间搭配」页配置。
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="font-medium text-[var(--app-color-text-secondary)]">二级菜单文案</span>
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
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-[var(--app-color-text-secondary)]">时长预设</span>
                <select
                  className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2"
                  value={form.durationMinutes ?? 120}
                  onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}
                >
                  {EXEMPT_DURATION_PRESETS.map((p) => (
                    <option key={p.durationMinutes} value={p.durationMinutes}>{p.label}</option>
                  ))}
                </select>
              </label>
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

              <CheckboxPicker
                title="推荐审核人（员工账号）"
                hint="学生点「需审核」的延迟项时，优先展示此处配置的员工作为审核人。"
                searchPlaceholder="搜索昵称、登录名或 ID…"
                items={staffPickerItems}
                selected={selectedReviewerIds}
                onChange={setSelectedReviewerIds}
                loading={metaLoading}
              />

              <label className="flex items-start gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={Boolean(form.requireApproval)}
                  onChange={(e) => setForm((f) => ({ ...f, requireApproval: e.target.checked }))}
                />
                <span>
                  <span className="font-medium text-[var(--app-color-text-secondary)]">需要教职工审核后生效</span>
                  <span className="block text-xs text-[var(--app-color-text-tertiary)]">关闭则学生点击后立即授予免冻结；开启则进入「学生审核」页待审。</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.enabled !== false}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
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
                {form.id ? "更新选项" : "添加选项"}
              </button>
              {form.id ? (
                <button
                  type="button"
                  className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-4 py-2 text-sm"
                  onClick={resetForm}
                >
                  取消编辑
                </button>
              ) : null}
            </div>
          </AdminFormCard>

          <AdminFormCard title="选项库列表">
            {optionsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : options.length === 0 ? (
              <p className="text-sm text-[var(--app-color-text-tertiary)]">暂无延迟选项，请先添加；再到「房间搭配」为各房间勾选。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--app-color-border-default)] text-left text-[var(--app-color-text-tertiary)]">
                      <th className="py-2 pr-3">菜单项</th>
                      <th className="py-2 pr-3">时段</th>
                      <th className="py-2 pr-3">模式</th>
                      <th className="py-2 pr-3">状态</th>
                      <th className="py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {options.map((r) => (
                      <tr key={r.id} className="border-b border-[var(--app-color-border-default)]/60">
                        <td className="py-2 pr-3">{r.optionLabel}</td>
                        <td className="py-2 pr-3 text-xs">
                          {r.displayStart || r.displayEnd
                            ? `${r.displayStart || "00:00"} ~ ${r.displayEnd || "24:00"}`
                            : "全天"}
                        </td>
                        <td className="py-2 pr-3">{r.exemptMode} / {r.durationMinutes ?? "-"}min · {r.requireApproval ? "需审核" : "直批"}</td>
                        <td className="py-2 pr-3">
                          {r.enabled ? (
                            <span className="text-[var(--app-color-feedback-success)]">启用</span>
                          ) : (
                            <span className="text-[var(--app-color-text-tertiary)]">停用</span>
                          )}
                        </td>
                        <td className="py-2">
                          <div className="flex gap-2">
                            <button type="button" className="text-[var(--app-color-accent)]" onClick={() => handleEditOption(r)}>编辑</button>
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
          </AdminFormCard>
        </>
      ) : (
        <>
          <AdminFormCard title="为房间选择延迟选项组合">
            <p className="mb-3 text-xs text-[var(--app-color-text-tertiary)]">
              可同时勾选多个房间与多个延迟选项，保存后所选房间将统一应用相同二级菜单；学生扫码时，公用「{buttonLabel || "延迟"}」按钮点击后只展示该房间已绑定的项。
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <CheckboxPicker
                title="目标房间（可多选）"
                hint="数据源与 ARO 房间映射页相同；多选时保存将把下方选项组合批量应用到所有已选房间。"
                searchPlaceholder="搜索房间名或 roomId…"
                items={roomPickerItems}
                selected={bindingRoomIds}
                onChange={handleBindingRoomsChange}
                loading={metaLoading}
              />

              {bindingRoomIds.size > 0 ? (
                <CheckboxPicker
                  title="延迟选项（可多选）"
                  hint="勾选后保存；所选房间的二级菜单将展示相同选项列表。"
                  searchPlaceholder="搜索选项文案…"
                  items={optionPickerItems}
                  selected={bindingOptionIds}
                  onChange={setBindingOptionIds}
                  loading={optionsLoading}
                />
              ) : (
                <p className="text-sm text-[var(--app-color-text-tertiary)] md:col-span-1 self-center">
                  请先勾选至少一个目标房间，再选择要展示的延迟选项。
                </p>
              )}
            </div>
            {bindingRoomIds.size > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={savingBinding || options.length === 0}
                  onClick={() => void handleSaveBinding()}
                  className="inline-flex items-center gap-1 rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-4 py-2 text-sm font-bold text-[var(--app-color-text-inverse)] disabled:opacity-50"
                >
                  {savingBinding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {bindingRoomIds.size > 1
                    ? `批量保存到 ${bindingRoomIds.size} 个房间`
                    : "保存房间搭配"}
                </button>
                {bindingRoomIds.size > 1 ? (
                  <span className="text-xs text-[var(--app-color-text-tertiary)]">
                    已选 {bindingRoomIds.size} 个房间、{bindingOptionIds.size} 个延迟项
                  </span>
                ) : null}
              </div>
            ) : null}
          </AdminFormCard>

          <AdminFormCard title="已配置房间">
            {bindingsLoading || metaLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : bindings.length === 0 ? (
              <p className="text-sm text-[var(--app-color-text-tertiary)]">尚无房间搭配；请在上方选择房间并勾选选项。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--app-color-border-default)] text-left text-[var(--app-color-text-tertiary)]">
                      <th className="py-2 pr-3">房间</th>
                      <th className="py-2 pr-3">已选延迟项</th>
                      <th className="py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bindings.map((b) => (
                      <tr key={b.roomId} className="border-b border-[var(--app-color-border-default)]/60">
                        <td className="py-2 pr-3">
                          <div className="font-medium">{roomById.get(b.roomId)?.roomName || b.roomId}</div>
                          <div className="font-mono text-[11px] text-[var(--app-color-text-tertiary)]">{b.roomId}</div>
                        </td>
                        <td className="py-2 pr-3">
                          {b.optionIds.length === 0 ? (
                            <span className="text-[var(--app-color-text-tertiary)]">未勾选</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {b.optionIds.map((oid) => (
                                <li key={oid} className="text-[12px]">
                                  {optionById.get(oid)?.optionLabel ?? `#${oid}`}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="py-2">
                          <button type="button" className="text-[var(--app-color-accent)]" onClick={() => startEditBinding(b.roomId)}>
                            编辑搭配
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminFormCard>
        </>
      )}
    </div>
  );
}
