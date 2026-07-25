import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell, AdminFillScrollRegion } from "@/components/admin/AdminPageShell";
import { adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { authHttp } from "@/api/core/authHttp";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import { Clock, Settings, Save, X, RotateCw, Plus, Undo2, ChevronDown, ChevronUp } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DefaultConfig {
  id: number; sourceCode: string; digestMode: string; scheduleTimes: string;
  overflowStrategy: string; scheduleDays?: string; hourlyInterval?: number;
  nightModeEnabled?: number; nightStart?: string; nightEnd?: string;
  minutelyInterval?: number; enabled: number;
}

interface Preference {
  id: number; userId: string; sourceCode: string; digestMode?: string;
  scheduleTimes?: string; overflowStrategy?: string; scheduleDays?: string; hourlyInterval?: number;
  nightModeEnabled?: number; nightStart?: string; nightEnd?: string; minutelyInterval?: number; enabled?: number;
}

interface SourceDigestRow {
  sourceCode: string; sourceName: string; description: string; sourceEnabled: boolean;
  hasDefault: boolean; defaultConfig: DefaultConfig | null;
  hasPreference: boolean; preference: Preference | null;
  effectiveMode: string; effectiveSchedule: string | null; effectiveOverflow: string;
  effectiveDays?: string; effectiveInterval?: number;
  nightModeEnabled?: number; nightStart?: string; nightEnd?: string;
  minutelyInterval?: number;
}

interface DigestConfigGroup {
  key: string; mode: string; schedule: string; overflow: string;
  days: string; interval: number; nightEnabled: boolean; nightStart: string; nightEnd: string;
  sources: SourceDigestRow[];
}

const DAY_LABELS: Record<number, string> = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "日" };
const MODE_LABELS: Record<string, string> = { INSTANT: "即时", MINUTELY: "按分钟聚合", HOURLY: "每小时聚合", SCHEDULED: "定时聚合" };
const OVERFLOW_LABELS: Record<string, string> = { ROLL_OVER: "滚入下一轮", FALLBACK_INSTANT: "聚合转即时" };

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminNotificationDigestPage() {
  const location = useLocation();
  const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"default" | "personal">("default");
  const [editingGroup, setEditingGroup] = useState<DigestConfigGroup | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: sources, isLoading, refetch } = useQuery<SourceDigestRow[]>({
    queryKey: ["digest-sources"],
    queryFn: () => authHttp.get("/user/digest-preference/sources").then((r) => r.data.data),
  });

  const savePrefBatchMutation = useMutation({
    mutationFn: (prefs: Preference[]) =>
      Promise.all(prefs.map((p) => authHttp.put("/user/digest-preference", p))),
    onSuccess: () => {
      toast.success("个性化配置已保存");
      queryClient.invalidateQueries({ queryKey: ["digest-sources"] });
      setEditingGroup(null); setCreating(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const saveDefaultBatchMutation = useMutation({
    mutationFn: (cfgs: Array<DefaultConfig & { id?: number }>) =>
      Promise.all(cfgs.map((c) => c.id
        ? authHttp.put(`/admin/digest-config/${c.id}`, c)
        : authHttp.post("/admin/digest-config", c))),
    onSuccess: () => {
      toast.success("默认模板已保存");
      queryClient.invalidateQueries({ queryKey: ["digest-sources"] });
      setEditingGroup(null); setCreating(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const restoreAllMutation = useMutation({
    mutationFn: async () => {
      const prefs = ((sources ?? []).filter((s) => s.hasPreference && s.preference?.id));
      await Promise.all(prefs.map((p) => authHttp.delete(`/user/digest-preference/${p.preference!.id}`)));
    },
    onSuccess: () => {
      toast.success("已恢复为平台默认");
      queryClient.invalidateQueries({ queryKey: ["digest-sources"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "操作失败"),
  });

  // Resolve night mode from first source in group
  const resolveNightFromSources = (srcs: SourceDigestRow[]) => {
    const s = srcs[0];
    if (mode === "personal" && s?.hasPreference) return { ne: (s.preference?.nightModeEnabled ?? 0) === 1, ns: s.preference?.nightStart || "", nn: s.preference?.nightEnd || "" };
    if (mode === "default" && s?.hasDefault) return { ne: (s.defaultConfig?.nightModeEnabled ?? 0) === 1, ns: s.defaultConfig?.nightStart || "", nn: s.defaultConfig?.nightEnd || "" };
    return { ne: false, ns: "", nn: "" };
  };

  const enabledSources = (sources ?? []).filter((s) => s.sourceEnabled);
  const { groups, instantSources } = useMemo(() => {
    const groupMap = new Map<string, SourceDigestRow[]>();
    const instants: SourceDigestRow[] = [];
    for (const src of enabledSources) {
      const n = mode === "personal" && src.hasPreference && src.preference?.nightModeEnabled === 1 ? 1 : 0;
      const cfg = mode === "personal" && src.hasPreference && src.preference?.digestMode && src.preference.digestMode !== "INSTANT"
        ? { m: src.preference.digestMode!, s: src.preference.scheduleTimes || "", o: src.preference.overflowStrategy || "ROLL_OVER", d: src.preference.scheduleDays || "", i: src.preference.hourlyInterval || 1, n }
        : mode === "default" && src.hasDefault && src.defaultConfig!.enabled === 1 && src.defaultConfig!.digestMode && src.defaultConfig!.digestMode !== "INSTANT"
          ? { m: src.defaultConfig!.digestMode, s: src.defaultConfig!.scheduleTimes || "", o: src.defaultConfig!.overflowStrategy || "ROLL_OVER", d: src.defaultConfig!.scheduleDays || "", i: src.defaultConfig!.hourlyInterval || 1, n: (src.defaultConfig?.nightModeEnabled ?? 0) }
          : null;
      if (cfg) {
        const key = `${cfg.m}|${cfg.s}|${cfg.o}|${cfg.d}|${cfg.i}|${cfg.n}`;
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key)!.push(src);
      } else {
        instants.push(src);
      }
    }
    const gs: DigestConfigGroup[] = [];
    for (const [key, srcs] of groupMap) {
      const [m, s, o, d, iStr, nStr] = key.split("|");
      const n = resolveNightFromSources(srcs);
      gs.push({ key, mode: m, schedule: s, overflow: o, days: d, interval: parseInt(iStr) || 1, nightEnabled: n.ne, nightStart: n.ns, nightEnd: n.nn, sources: srcs });
    }
    return { groups: gs, instantSources: instants };
  }, [enabledSources, mode]);

  const saveGroup = (group: DigestConfigGroup, newMode: string, newSchedule: string, newOverflow: string, newDays: string, newInterval: number, nightEnabled: boolean, nightStart: string, nightEnd: string, overflowCutoff: string, selectedCodes: string[]) => {
    const oldCodes = new Set(group.sources.map(s => s.sourceCode));
    const newCodes = new Set(selectedCodes);
    const removed = group.sources.filter(s => !newCodes.has(s.sourceCode));
    const added = enabledSources.filter(s => newCodes.has(s.sourceCode) && !oldCodes.has(s.sourceCode));
    const kept = group.sources.filter(s => newCodes.has(s.sourceCode));

    if (mode === "personal") {
      const prefs: Preference[] = kept.map((s) => ({
        id: s.preference?.id ?? 0, userId: "", sourceCode: s.sourceCode,
        digestMode: newMode, scheduleTimes: newSchedule, overflowStrategy: newOverflow,
        scheduleDays: newDays, hourlyInterval: newInterval,
        nightModeEnabled: nightEnabled ? 1 : 0, nightStart, nightEnd,
        overflowCutoffTime: overflowCutoff || undefined,
        enabled: newMode === "INSTANT" ? 0 : 1,
      }));
      // 新增
      for (const s of added) prefs.push({
        id: 0, userId: "", sourceCode: s.sourceCode,
        digestMode: newMode, scheduleTimes: newSchedule, overflowStrategy: newOverflow,
        scheduleDays: newDays, hourlyInterval: newInterval,
        nightModeEnabled: nightEnabled ? 1 : 0, nightStart, nightEnd,
        overflowCutoffTime: overflowCutoff || undefined, enabled: 1,
      });
      // 移除 → 恢复即时
      for (const s of removed) prefs.push({
        id: s.preference?.id ?? 0, userId: "", sourceCode: s.sourceCode,
        digestMode: "INSTANT", enabled: 0,
      });
      savePrefBatchMutation.mutate(prefs);
    } else {
      const cfgs: Array<DefaultConfig & { id?: number }> = kept.map((s) => ({
        id: s.defaultConfig?.id, sourceCode: s.sourceCode,
        digestMode: newMode, scheduleTimes: newSchedule, overflowStrategy: newOverflow,
        scheduleDays: newDays, hourlyInterval: newInterval,
        nightModeEnabled: nightEnabled ? 1 : 0, nightStart, nightEnd,
        overflowCutoffTime: overflowCutoff || undefined,
        enabled: newMode === "INSTANT" ? 0 : 1,
      }));
      for (const s of added) cfgs.push({
        id: undefined, sourceCode: s.sourceCode,
        digestMode: newMode, scheduleTimes: newSchedule, overflowStrategy: newOverflow,
        scheduleDays: newDays, hourlyInterval: newInterval,
        nightModeEnabled: nightEnabled ? 1 : 0, nightStart, nightEnd,
        overflowCutoffTime: overflowCutoff || undefined, enabled: 1,
      });
      for (const s of removed) cfgs.push({
        id: s.defaultConfig?.id, sourceCode: s.sourceCode,
        digestMode: "INSTANT", enabled: 0,
      });
      saveDefaultBatchMutation.mutate(cfgs);
    }
  };

  const createGroup = (newMode: string, newSchedule: string, newOverflow: string, newDays: string, newInterval: number, nightEnabled: boolean, nightStart: string, nightEnd: string, overflowCutoff: string, srcCodes: string[]) => {
    const targetSources = enabledSources.filter((s) => srcCodes.includes(s.sourceCode));
    if (mode === "personal") {
      const prefs: Preference[] = targetSources.map((s) => ({
        id: s.preference?.id ?? 0, userId: "", sourceCode: s.sourceCode,
        digestMode: newMode, scheduleTimes: newSchedule, overflowStrategy: newOverflow,
        scheduleDays: newDays, hourlyInterval: newInterval,
        nightModeEnabled: nightEnabled ? 1 : 0, nightStart, nightEnd,
        overflowCutoffTime: overflowCutoff || undefined, enabled: 1,
      }));
      savePrefBatchMutation.mutate(prefs);
    } else {
      const cfgs: Array<DefaultConfig & { id?: number }> = targetSources.map((s) => ({
        id: s.defaultConfig?.id, sourceCode: s.sourceCode,
        digestMode: newMode, scheduleTimes: newSchedule, overflowStrategy: newOverflow,
        scheduleDays: newDays, hourlyInterval: newInterval,
        nightModeEnabled: nightEnabled ? 1 : 0, nightStart, nightEnd,
        overflowCutoffTime: overflowCutoff || undefined, enabled: 1,
      }));
      saveDefaultBatchMutation.mutate(cfgs);
    }
  };

  const hasPersonalConfigs = enabledSources.some((s) => s.hasPreference);

  return (
    <AdminPageShell>
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
        {/* Top bar */}
        <AdminFormCard className="shrink-0 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
            <h2 className="text-base font-bold text-[var(--app-color-text-primary)] flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--app-color-accent)]" />{pageLabel}
            </h2>
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-lg bg-[var(--app-color-surface-hover)] p-0.5 mr-2">
                <button
                  type="button"
                  onClick={() => setMode("default")}
                  className={cn("px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    mode === "default" ? "bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]")}
                >
                  <Settings className="h-3 w-3 inline mr-1" />默认模板
                </button>
                <button
                  type="button"
                  onClick={() => setMode("personal")}
                  className={cn("px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    mode === "personal" ? "bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]")}
                >我的配置</button>
              </div>
              {mode === "personal" && hasPersonalConfigs && (
                <AdminButton type="button" tone="ghost" size="sm"
                  onClick={() => { if (confirm("恢复为平台默认配置？所有个性化设置将被清除。")) restoreAllMutation.mutate(); }}>
                  <Undo2 className="h-3.5 w-3.5" /> 恢复默认
                </AdminButton>
              )}
              <AdminButton type="button" tone="ghost" onClick={() => { queryClient.invalidateQueries({ queryKey: ["digest-sources"] }); refetch(); }}>
                <RotateCw className="h-4 w-4" /> 刷新
              </AdminButton>
            </div>
          </div>

          {mode === "default" && (
            <p className="text-xs text-[var(--app-color-text-tertiary)]">平台默认模板 — 自动应用于未设置个性化配置的用户。仅平台管理员可编辑。</p>
          )}
          {mode === "personal" && (
            <p className="text-xs text-[var(--app-color-text-tertiary)]">我的个性化配置 — 覆盖平台默认。右上角可随时恢复默认。</p>
          )}
        </AdminFormCard>

        <AdminFillScrollRegion>
          {isLoading ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">加载中…</div>
          ) : (
            <div className="space-y-3">
              {/* Config groups */}
              {groups.map((g) => (
                <ConfigGroupCard
                  key={g.key}
                  group={g}
                  isPersonal={mode === "personal"}
                  onEdit={(group) => setEditingGroup(group)}
                />
              ))}

              {/* Instant sources */}
              <AdminFormCard>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-[var(--app-color-text-tertiary)]">
                    即时通知（未纳入聚合）
                  </h4>
                </div>
                {instantSources.length === 0 ? (
                  <p className="text-xs text-[var(--app-color-text-tertiary)]">所有信息源均已纳入聚合配置。</p>
                ) : (
                  <div className="space-y-1">
                    {instantSources.map((s) => (
                      <div key={s.sourceCode} className="flex items-center gap-2 text-xs text-[var(--app-color-text-secondary)] py-1">
                        <span className="font-medium">{s.sourceName}</span>
                        <span className="text-[var(--app-color-text-tertiary)]">— {s.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </AdminFormCard>

              {enabledSources.length === 0 && (
                <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-[var(--app-color-border-default)] text-sm text-[var(--app-color-text-tertiary)]">暂无通知源</div>
              )}

              <AdminButton type="button" tone="secondary" onClick={() => setCreating(true)}>
                <Plus className="h-3.5 w-3.5" /> 新建聚合配置
              </AdminButton>
            </div>
          )}
        </AdminFillScrollRegion>

        {/* Edit group modal */}
        {editingGroup && (
          <GroupEditModal
            group={editingGroup}
            allSources={enabledSources}
            isPersonal={mode === "personal"}
            onClose={() => setEditingGroup(null)}
            onSave={(g, m, s, o, d, i, ne, ns, nn, oc, sc) => saveGroup(g, m, s, o, d, i, ne, ns, nn, oc, sc)}
            saving={savePrefBatchMutation.isPending || saveDefaultBatchMutation.isPending}
          />
        )}

        {/* Create group modal */}
        {creating && (
          <CreateGroupModal
            allSources={enabledSources}
            onClose={() => setCreating(false)}
            onSave={(m, s, o, d, i, ne, ns, nn, oc, srcs) => createGroup(m, s, o, d, i, ne, ns, nn, oc, srcs)}
            saving={savePrefBatchMutation.isPending || saveDefaultBatchMutation.isPending}
          />
        )}
      </div>
    </AdminPageShell>
  );
}

/* ------------------------------------------------------------------ */
/*  ConfigGroupCard                                                     */
/* ------------------------------------------------------------------ */

function formatGroupLabel(g: DigestConfigGroup): string {
  const dayStr = g.days ? g.days.split(",").map(d => "周" + (DAY_LABELS[parseInt(d)] || d)).join("") : "每天";
  const nightTag = g.nightEnabled ? ` 🌙${g.nightStart}-${g.nightEnd}夜间暂存` : "";
  if (g.mode === "MINUTELY") return `每${g.interval}分钟聚合 · ${dayStr}${nightTag}`;
  if (g.mode === "HOURLY") return `每${g.interval}小时聚合 · ${dayStr}${nightTag}`;
  return `${MODE_LABELS[g.mode] || g.mode} · ${dayStr} · ${g.schedule || "—"}${nightTag}`;
}

function ConfigGroupCard({ group, isPersonal, onEdit }: {
  group: DigestConfigGroup; isPersonal: boolean; onEdit: (g: DigestConfigGroup) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <AdminFormCard>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 text-left hover:opacity-80">
          <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">
            {formatGroupLabel(group)}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-[var(--app-color-text-tertiary)]" /> : <ChevronDown className="h-4 w-4 text-[var(--app-color-text-tertiary)]" />}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
            {group.sources.length} 个信息源 · {OVERFLOW_LABELS[group.overflow] || group.overflow}
          </span>
          <AdminButton type="button" tone="secondary" size="sm" onClick={() => onEdit(group)}>编辑</AdminButton>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 space-y-0.5 border-t border-[var(--app-color-border-default)] pt-2">
          {group.sources.map((s) => (
            <div key={s.sourceCode} className="flex items-center gap-2 text-xs text-[var(--app-color-text-secondary)] py-0.5">
              <span className="font-medium min-w-[120px]">{s.sourceName}</span>
              <span className="text-[var(--app-color-text-tertiary)] truncate">{s.description}</span>
            </div>
          ))}
        </div>
      )}
    </AdminFormCard>
  );
}

/* ------------------------------------------------------------------ */
/*  GroupEditModal                                                      */
/* ------------------------------------------------------------------ */

function renderDigestPreview(titleTpl: string, contentTpl: string, selectedSources: SourceDigestRow[]): string {
  // 根据所选信息源实时拼接 items
  const itemsText = selectedSources.length === 0
    ? "（未选择信息源）"
    : selectedSources.map(s =>
        `【${s.sourceName}】\n  · ${s.sourceName} — {申请人}\n    {地点} · {内容摘要}\n`
      ).join("");
  const count = String(selectedSources.length);
  const now = new Date();
  const dateTimeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const vars: Record<string, string> = { userName: "{接收人}", count, time: dateTimeStr, items: itemsText };
  let title = titleTpl || "ARO 通知摘要 · {time}";
  let content = contentTpl || "{userName}，您有 {count} 条新通知：\n\n{items}\n> ARO 系统自动推送";
  for (const [k, v] of Object.entries(vars)) {
    title = title.replace(`{${k}}`, v);
    content = content.replace(`{${k}}`, v);
  }
  return title + "\n" + "─".repeat(30) + "\n" + content;
}

/* ---- shared day picker ---- */
function DayPicker({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const selected = new Set(value ? value.split(",").map(Number) : []);
  const toggle = (d: number) => {
    const n = new Set(selected); if (n.has(d)) n.delete(d); else n.add(d);
    onChange(Array.from(n).sort().join(","));
  };
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5,6,7].map((d) => (
        <button key={d} type="button" onClick={() => toggle(d)}
          className={cn("w-8 h-7 rounded-md text-xs font-medium transition-colors border",
            selected.has(d)
              ? "bg-[var(--app-color-accent)] text-white border-[var(--app-color-accent)]"
              : "bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)] border-[var(--app-color-border-default)] hover:border-[var(--app-color-accent)]/40")}>
          周{DAY_LABELS[d]}
        </button>
      ))}
    </div>
  );
}

function GroupEditModal({ group, allSources, isPersonal, onClose, onSave, saving }: {
  group: DigestConfigGroup; allSources: SourceDigestRow[]; isPersonal: boolean;
  onClose: () => void; onSave: (g: DigestConfigGroup, mode: string, schedule: string, overflow: string, days: string, interval: number, nightEnabled: boolean, nightStart: string, nightEnd: string, cutoff: string, srcs: string[]) => void; saving: boolean;
}) {
  const [editMode, setEditMode] = useState(group.mode);
  const [schedule, setSchedule] = useState(group.schedule);
  const [overflow, setOverflow] = useState(group.overflow);
  const [days, setDays] = useState(group.days);
  const [interval, setInterval] = useState(group.interval);
  const [nightEnabled, setNightEnabled] = useState(group.nightEnabled);
  const [nightStart, setNightStart] = useState(group.nightStart || "22:00");
  const [nightEnd, setNightEnd] = useState(group.nightEnd || "08:00");
  const [overflowCutoff, setOverflowCutoff] = useState("");
  const [digestTitle, setDigestTitle] = useState(group.sources[0]?.defaultConfig?.digestTitleTpl || "ARO 通知摘要 · {time}");
  const [digestContent, setDigestContent] = useState(group.sources[0]?.defaultConfig?.digestContentTpl || "{userName}，您有 {count} 条新通知：\n\n{items}\n\n> ARO 系统自动推送");
  const groupSourceCodes = new Set(group.sources.map(s => s.sourceCode));
  const [selected, setSelected] = useState<Set<string>>(new Set(groupSourceCodes));

  const toggleSource = (code: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--app-color-text-primary)]">编辑聚合配置</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--app-color-surface-hover)]"><X className="h-4 w-4 text-[var(--app-color-text-tertiary)]" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={adminLabelClass}>通知模式</label>
            <select className={cn(adminInputClass, "mt-1")} value={editMode} onChange={(e) => setEditMode(e.target.value)}>
              <option value="INSTANT">即时通知（移出聚合）</option>
              <option value="MINUTELY">按分钟聚合</option>
              <option value="HOURLY">每小时聚合</option>
              <option value="SCHEDULED">定时聚合</option>
            </select>
          </div>
          {editMode !== "INSTANT" && (
            <>
              <div>
                <label className={adminLabelClass}>星期</label>
                <div className="mt-1"><DayPicker value={days} onChange={setDays} /></div>
              </div>
              {editMode === "MINUTELY" ? (
                <div>
                  <label className={adminLabelClass}>间隔（分钟）</label>
                  <select className={cn(adminInputClass, "mt-1")} value={interval} onChange={(e) => setInterval(parseInt(e.target.value))}>
                    {[1,2,5,10,15,30].map((v) => <option key={v} value={v}>每 {v} 分钟</option>)}
                  </select>
                </div>
              ) : editMode === "HOURLY" ? (
                <div>
                  <label className={adminLabelClass}>间隔（小时）</label>
                  <select className={cn(adminInputClass, "mt-1")} value={interval} onChange={(e) => setInterval(parseInt(e.target.value))}>
                    {[1,2,3,4,6,8,12].map((v) => <option key={v} value={v}>每 {v} 小时</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className={adminLabelClass}>推送时间（逗号分隔，如 09:00,15:00,18:00）</label>
                  <input className={cn(adminInputClass, "mt-1")} value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="09:00,18:00" />
                </div>
              )}
              {/* 溢出策略：仅 SCHEDULED 模式生效。多个时间节点时，非最后一个固定滚入下一轮，仅最后一个可选策略 */}
              {editMode === "SCHEDULED" && (() => {
                const timeList = schedule ? schedule.split(",").map(t => t.trim()).filter(Boolean) : [];
                const nonLastNodes = timeList.length > 1 ? timeList.slice(0, -1) : [];
                const lastNode = timeList.length > 0 ? timeList[timeList.length - 1] : null;
                return (
              <div>
                <label className={adminLabelClass}>溢出策略</label>
                {nonLastNodes.length > 0 && (
                  <p className="text-[10px] text-[var(--app-color-text-tertiary)] mb-1">
                    {nonLastNodes.join("、")} — 固定"滚入下一轮"（非最后一个节点不可选溢出策略）
                  </p>
                )}
                {lastNode && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--app-color-text-secondary)]">{lastNode}（最后一个节点）：</span>
                      <select className={cn(adminInputClass, "flex-1")} value={overflow} onChange={(e) => setOverflow(e.target.value)}>
                        <option value="ROLL_OVER">滚入下一轮</option>
                        <option value="FALLBACK_INSTANT">聚合转即时</option>
                      </select>
                    </div>
                    {timeList.length === 1 && (
                      <p className="text-[10px] text-[var(--app-color-text-tertiary)] mt-1">仅一个时间节点，两种策略都可选</p>
                    )}
                    {overflow === "FALLBACK_INSTANT" && timeList.length > 1 && (
                      <div className="mt-2">
                        <label className={cn(adminLabelClass, "text-[10px]")}>截止时间（超过后即时发送，默认=最后一个节点）</label>
                        <select className={cn(adminInputClass, "mt-0.5")} value={overflowCutoff} onChange={(e) => setOverflowCutoff(e.target.value)}>
                          <option value="">— {lastNode}（自动）—</option>
                        </select>
                      </div>
                    )}
                  </>
                )}
              </div>
                );
              })()}
              <div className="border-t border-[var(--app-color-border-default)] pt-3">
                <label className="inline-flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={nightEnabled} onChange={(e) => setNightEnabled(e.target.checked)} className="h-3.5 w-3.5 rounded accent-[var(--app-color-accent)]" />
                  <span className="text-xs font-medium text-[var(--app-color-text-primary)]">🌙 夜间暂存模式</span>
                </label>
                {nightEnabled && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={cn(adminLabelClass, "text-[10px]")}>开始</label>
                      <input type="time" className={cn(adminInputClass, "mt-0.5")} value={nightStart} onChange={(e) => setNightStart(e.target.value)} />
                    </div>
                    <div>
                      <label className={cn(adminLabelClass, "text-[10px]")}>结束</label>
                      <input type="time" className={cn(adminInputClass, "mt-0.5")} value={nightEnd} onChange={(e) => setNightEnd(e.target.value)} />
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-[var(--app-color-text-tertiary)] mt-1">夜间所有通知暂存，结束时统一发出。支持跨天（如 22:00 → 08:00）。</p>
              </div>
            </>
          )}
        </div>
        {/* 摘要模板 — 仅默认模板模式可编辑 */}
        {!isPersonal && (
        <div className="border-t border-[var(--app-color-border-default)] pt-3 mt-3">
          <label className={cn(adminLabelClass, "mb-1")}>摘要模板</label>
          <p className="text-[10px] text-[var(--app-color-text-tertiary)] mb-2">
            可用变量：<code className="text-[10px] bg-[var(--app-color-surface-hover)] px-1 rounded">{`{userName}`}</code> 接收人
            <code className="text-[10px] bg-[var(--app-color-surface-hover)] px-1 rounded ml-1">{`{count}`}</code> 条数
            <code className="text-[10px] bg-[var(--app-color-surface-hover)] px-1 rounded ml-1">{`{time}`}</code> 时间
            <code className="text-[10px] bg-[var(--app-color-surface-hover)] px-1 rounded ml-1">{`{items}`}</code> 通知列表
          </p>
          <input className={cn(adminInputClass)} placeholder="标题模板，如：ARO 通知摘要 · {time}" value={digestTitle} onChange={(e) => setDigestTitle(e.target.value)} />
          <textarea className={cn(adminInputClass, "mt-2 min-h-[80px] resize-y")}
            placeholder="正文模板，如：{userName}，您有 {count} 条新通知：&#10;{items}&#10;> ARO 系统自动推送"
            value={digestContent} onChange={(e) => setDigestContent(e.target.value)} />
          <div className="mt-2 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-3 text-xs">
            <p className="text-[10px] font-semibold text-[var(--app-color-text-tertiary)] mb-1">预览（示例数据）</p>
            <div className="text-[var(--app-color-text-primary)] whitespace-pre-wrap font-mono text-[11px]">
              {renderDigestPreview(digestTitle, digestContent, allSources.filter(s => selected.has(s.sourceCode)))}
            </div>
          </div>
        </div>
        )}

        {/* 信息源选择 */}
        <div className="border-t border-[var(--app-color-border-default)] pt-3 mt-3">
          <label className={cn(adminLabelClass, "mb-1")}>纳入信息源（可增删）</label>
          <div className="max-h-[180px] overflow-auto space-y-1">
            {allSources.map((s) => (
              <label key={s.sourceCode} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-xs transition-colors",
                selected.has(s.sourceCode) ? "bg-[var(--app-color-accent)]/10" : "hover:bg-[var(--app-color-surface-hover)]")}>
                <input type="checkbox" checked={selected.has(s.sourceCode)} onChange={() => toggleSource(s.sourceCode)} className="h-3.5 w-3.5 rounded accent-[var(--app-color-accent)]" />
                <span className="font-medium">{s.sourceName}</span>
                <span className="text-[var(--app-color-text-tertiary)] truncate">{s.description}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center border-t border-[var(--app-color-border-default)] pt-3 mt-4">
          <span className="text-xs text-[var(--app-color-text-tertiary)]">已选 {selected.size} 个</span>
          <div className="flex gap-2">
          <AdminButton type="button" tone="ghost" size="sm" onClick={onClose}>取消</AdminButton>
          <AdminButton type="button" tone="primary" size="sm" loading={saving}
            onClick={() => onSave(group, editMode, schedule, overflow, days, interval, nightEnabled, nightStart, nightEnd, overflowCutoff, Array.from(selected), digestTitle, digestContent)}>
            <Save className="h-3.5 w-3.5" /> 保存
          </AdminButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CreateGroupModal                                                    */
/* ------------------------------------------------------------------ */

function CreateGroupModal({ allSources, onClose, onSave, saving }: {
  allSources: SourceDigestRow[]; onClose: () => void;
  onSave: (mode: string, schedule: string, overflow: string, days: string, interval: number, nightEnabled: boolean, nightStart: string, nightEnd: string, srcs: string[]) => void; saving: boolean;
}) {
  const [editMode, setEditMode] = useState("SCHEDULED");
  const [schedule, setSchedule] = useState("09:00,18:00");
  const [overflow, setOverflow] = useState("ROLL_OVER");
  const [days, setDays] = useState("");
  const [interval, setInterval] = useState(1);
  const [nightEnabled, setNightEnabled] = useState(false);
  const [nightStart, setNightStart] = useState("22:00");
  const [nightEnd, setNightEnd] = useState("08:00");
  const [overflowCutoff, setOverflowCutoff] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (code: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--app-color-text-primary)]">新建聚合配置</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--app-color-surface-hover)]"><X className="h-4 w-4 text-[var(--app-color-text-tertiary)]" /></button>
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <label className={adminLabelClass}>通知模式</label>
            <select className={cn(adminInputClass, "mt-1")} value={editMode} onChange={(e) => setEditMode(e.target.value)}>
              <option value="MINUTELY">按分钟聚合</option>
              <option value="HOURLY">每小时聚合</option>
              <option value="SCHEDULED">定时聚合</option>
            </select>
          </div>
          <div>
            <label className={adminLabelClass}>星期</label>
            <div className="mt-1"><DayPicker value={days} onChange={setDays} /></div>
          </div>
          {editMode === "MINUTELY" ? (
            <div>
              <label className={adminLabelClass}>间隔（分钟）</label>
              <select className={cn(adminInputClass, "mt-1")} value={interval} onChange={(e) => setInterval(parseInt(e.target.value))}>
                {[1,2,5,10,15,30].map((v) => <option key={v} value={v}>每 {v} 分钟</option>)}
              </select>
            </div>
          ) : editMode === "HOURLY" ? (
            <div>
              <label className={adminLabelClass}>间隔（小时）</label>
              <select className={cn(adminInputClass, "mt-1")} value={interval} onChange={(e) => setInterval(parseInt(e.target.value))}>
                {[1,2,3,4,6,8,12].map((v) => <option key={v} value={v}>每 {v} 小时</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className={adminLabelClass}>推送时间（逗号分隔，如 09:00,15:00,18:00）</label>
              <input className={cn(adminInputClass, "mt-1")} value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="09:00,18:00" />
            </div>
          )}
          {/* 溢出策略：仅 SCHEDULED 模式。多节点时非最后一个固定 ROLL_OVER，仅最后一个可选 */}
          {editMode === "SCHEDULED" && (() => {
            const timeList = schedule ? schedule.split(",").map(t => t.trim()).filter(Boolean) : [];
            const nonLastNodes = timeList.length > 1 ? timeList.slice(0, -1) : [];
            const lastNode = timeList.length > 0 ? timeList[timeList.length - 1] : null;
            return (
          <div>
            <label className={adminLabelClass}>溢出策略</label>
            {nonLastNodes.length > 0 && (
              <p className="text-[10px] text-[var(--app-color-text-tertiary)] mb-1">
                {nonLastNodes.join("、")} — 固定"滚入下一轮"
              </p>
            )}
            {lastNode && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--app-color-text-secondary)]">{lastNode}：</span>
                <select className={cn(adminInputClass, "flex-1")} value={overflow} onChange={(e) => setOverflow(e.target.value)}>
                  <option value="ROLL_OVER">滚入下一轮</option>
                  <option value="FALLBACK_INSTANT">聚合转即时</option>
                </select>
              </div>
            )}
          </div>
            );
          })()}
          <div className="border-t border-[var(--app-color-border-default)] pt-3">
            <label className="inline-flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox" checked={nightEnabled} onChange={(e) => setNightEnabled(e.target.checked)} className="h-3.5 w-3.5 rounded accent-[var(--app-color-accent)]" />
              <span className="text-xs font-medium text-[var(--app-color-text-primary)]">🌙 夜间暂存模式</span>
            </label>
            {nightEnabled && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={cn(adminLabelClass, "text-[10px]")}>开始</label>
                  <input type="time" className={cn(adminInputClass, "mt-0.5")} value={nightStart} onChange={(e) => setNightStart(e.target.value)} />
                </div>
                <div>
                  <label className={cn(adminLabelClass, "text-[10px]")}>结束</label>
                  <input type="time" className={cn(adminInputClass, "mt-0.5")} value={nightEnd} onChange={(e) => setNightEnd(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mb-3">
          <label className={cn(adminLabelClass, "mb-1")}>纳入信息源（可多选）</label>
          {allSources.length === 0 ? (
            <p className="text-xs text-[var(--app-color-text-tertiary)]">暂无可选信息源</p>
          ) : (
            <div className="max-h-[200px] overflow-auto space-y-1">
              {allSources.map((s) => (
                <label key={s.sourceCode} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-xs transition-colors",
                  selected.has(s.sourceCode) ? "bg-[var(--app-color-accent)]/10" : "hover:bg-[var(--app-color-surface-hover)]")}>
                  <input type="checkbox" checked={selected.has(s.sourceCode)} onChange={() => toggle(s.sourceCode)} className="h-3.5 w-3.5 rounded accent-[var(--app-color-accent)]" />
                  <span className="font-medium">{s.sourceName}</span>
                  <span className="text-[var(--app-color-text-tertiary)] truncate">{s.description}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center border-t border-[var(--app-color-border-default)] pt-3">
          <span className="text-xs text-[var(--app-color-text-tertiary)]">已选 {selected.size} 个</span>
          <div className="flex gap-2">
            <AdminButton type="button" tone="ghost" size="sm" onClick={onClose}>取消</AdminButton>
            <AdminButton type="button" tone="primary" size="sm" loading={saving} disabled={selected.size === 0}
              onClick={() => onSave(editMode, schedule, overflow, days, interval, nightEnabled, nightStart, nightEnd, overflowCutoff, Array.from(selected))}>
              <Save className="h-3.5 w-3.5" /> 创建
            </AdminButton>
          </div>
        </div>
      </div>
    </div>
  );
}
