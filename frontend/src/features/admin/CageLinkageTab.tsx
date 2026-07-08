import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, ChevronRight, Pencil, Trash2, Check, User, Users, Search } from "lucide-react";
import {
  listViolationRules,
  createViolationRule,
  updateViolationRule,
  deleteViolationRule,
  searchViolationProjectGroups,
  listViolationPersonnelByProjectGroup,
  type ViolationRule,
} from "@/api/domains/studentViolation.api";
import {
  listCageStatusViolations,
  manualTriggerRule,
  type CageStatusViolationRow,
} from "@/api/domains/cageStatusViolation.api";
import { fetchSpecialStatusOverview, type SpecialStatusOverview } from "@/api/domains/cageShelf.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { searchPersonnel } from "@/api/twinApi";
import { AdminButton, adminPickableRowClass } from "@/components/admin/AdminButton";
import { AdminFilePickButton } from "@/components/admin/AdminFilePickButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminSegmentedControl } from "@/components/admin/AdminSegmentedControl";
import { AdminFormCard, AdminTableShell } from "@/components/admin/AdminPageShell";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { isRichTextEmpty } from "@/utils/announcementHtml";
import { CageLinkageRecordPanel } from "./CageLinkageRecordPanel";
import { cn } from "@/lib/utils";
import { normalizePersonnelRecord, type PersonnelRecordView } from "@/utils/personnelRecord";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";

/* ================================================================== */
/*  Constants                                                           */
/* ================================================================== */

type LockMode = "single" | "batch";

const LOCK_MODE_OPTIONS: { value: LockMode; label: string }[] = [
  { value: "single", label: "单人锁定" },
  { value: "batch", label: "课题组批量" },
];

const STATUS_OPTIONS = [
  { value: "COHABITATION", label: "合笼/繁殖" },
  { value: "SPECIAL_FEEDING", label: "特殊饲养" },
  { value: "NEED_DIVIDE", label: "请分笼/密度超标" },
  { value: "HEALTH_ABNORMAL", label: "动物健康异常" },
  { value: "ANIMAL_TRANSFER", label: "动物转移" },
] as const;

const JUDGE_MODES = [
  { value: "AUTO_SYNC_LINKED", label: "自动同步联动" },
  { value: "PURE_DAYS", label: "纯天数" },
  { value: "PURE_MANUAL", label: "纯手动" },
] as const;

const TRIGGER_ACTIONS = [
  { value: "VIOLATION_ONLY", label: "仅违规" },
  { value: "NOTICE_ONLY", label: "仅公告" },
  { value: "BOTH", label: "两者" },
] as const;

const JUDGE_MODE_LABEL: Record<string, string> = {
  AUTO_SYNC_LINKED: "同步联动",
  PURE_DAYS: "纯天数",
  PURE_MANUAL: "纯手动",
};
const TRIGGER_ACTION_LABEL: Record<string, string> = {
  VIOLATION_ONLY: "仅违规",
  NOTICE_ONLY: "仅公告",
  BOTH: "两者",
};

const inputBase =
  "w-full rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] shadow-twin-level-1 outline-none transition placeholder:text-[var(--twin-mute)] focus-visible:border-[var(--twin-hairline-strong)] focus-visible:ring-2 focus-visible:ring-[color:var(--admin-focus-ring)]/40";

const emptyRule = (): ViolationRule => ({
  ruleCode: "",
  ruleName: "",
  enabled: 1,
  sourceTag: "CAGE_STATUS",
  forbidEnter: 0,
  showNoticeEveryScan: 1,
  interactiveUnlockOnVerify: 1,
  unblockMethod: "自助解禁",
  unblockMaxCount: null,
  unblockWindowType: "滑动窗口",
  unblockWindowValue: 30,
  autoSignoutEnabled: 0,
  cageStatusCodes: [],
  cageDelayDays: 7,
  cageJudgeMode: "AUTO_SYNC_LINKED",
  cageManualTrigger: 0,
  cageTriggerAction: "BOTH",
});

type PickUser = { userId: string; name: string };

/* ================================================================== */
/*  Component                                                           */
/* ================================================================== */

export function CageLinkageTab() {
  const qc = useQueryClient();

  // ── rule form state ──
  const [form, setForm] = useState<ViolationRule>(emptyRule());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── lock mode state ──
  const [lockMode, setLockMode] = useState<LockMode>("batch");

  // single lock state
  const [personKeyword, setPersonKeyword] = useState("");
  const [picked, setPicked] = useState<PickUser | null>(null);
  const [searchUserResult, setSearchUserResult] = useState<Array<Record<string, unknown>>>([]);
  const personSearchTimer = useRef<number | null>(null);

  // batch lock state
  const [groupKeyword, setGroupKeyword] = useState("");
  const [groupSuggestions, setGroupSuggestions] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<PersonnelRecordView[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const groupSearchTimer = useRef<number | null>(null);

  // ── queries ──
  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ["violation-rules"],
    queryFn: () => listViolationRules(),
  });
  const cageRules = rules.filter((r) => r.sourceTag === "CAGE_STATUS");

  const { data: specialStatus, isLoading: specialStatusLoading } = useQuery({
    queryKey: ["specialStatusOverview"],
    queryFn: fetchSpecialStatusOverview,
    staleTime: 60_000,
  });

  // Extract unique groups with special statuses
  const specialStatusGroups = useMemo(() => {
    if (!specialStatus) return [] as string[];
    const groups = new Set<string>();
    for (const grp of specialStatus.groups ?? []) {
      for (const cage of grp.cages ?? []) {
        if (cage.projectPiName) groups.add(cage.projectPiName);
      }
    }
    return Array.from(groups).sort();
  }, [specialStatus]);

  const { data: records = [], isLoading: recsLoading } = useQuery({
    queryKey: ["cage-status-violations"],
    queryFn: () => listCageStatusViolations(),
    refetchInterval: 30_000,
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // ═══ Lock mode handlers ═══

  const switchLockMode = (mode: LockMode) => {
    setLockMode(mode);
    setPicked(null);
    setPersonKeyword("");
    setSearchUserResult([]);
    setSelectedGroup(null);
    setGroupKeyword("");
    setGroupMembers([]);
    setBatchSelectedIds(new Set());
  };

  const handleSearchPersonnel = useCallback(async (keyword: string) => {
    if (!keyword.trim()) { setSearchUserResult([]); return; }
    try {
      const list = await searchPersonnel(keyword);
      setSearchUserResult(Array.isArray(list) ? list : []);
    } catch { setSearchUserResult([]); }
  }, []);

  const pickPerson = (rp: Record<string, unknown>) => {
    const safeId = String(rp.user_id ?? rp.userid ?? rp.userId ?? rp.id ?? "").trim();
    const safeName = String(rp.name ?? rp.username ?? "未知").trim() || safeId;
    setPicked({ userId: safeId, name: safeName });
    setSearchUserResult([]);
    setPersonKeyword("");
  };

  const handleSearchGroups = useCallback(async (keyword: string) => {
    if (!keyword.trim()) { setGroupSuggestions([]); return; }
    const res = await searchViolationProjectGroups(keyword, 15);
    setGroupSuggestions(res);
  }, []);

  const pickGroup = async (g: string) => {
    setSelectedGroup(g);
    setGroupSuggestions([]);
    setGroupKeyword("");
    setGroupMembersLoading(true);
    try {
      const rows = await listViolationPersonnelByProjectGroup(g, 500);
      const members = (Array.isArray(rows) ? rows : [])
        .map((r) => normalizePersonnelRecord(r as unknown as Record<string, unknown>))
        .filter((p): p is PersonnelRecordView => p != null && Boolean(p.userId));
      setGroupMembers(members);
      setBatchSelectedIds(new Set(members.map((m) => m.userId)));
    } catch {
      toast.error("加载课题组成员失败");
    } finally {
      setGroupMembersLoading(false);
    }
  };

  const toggleBatchMember = (userId: string, add: boolean) => {
    setBatchSelectedIds((prev) => {
      const next = new Set(prev);
      if (add) next.add(userId); else next.delete(userId);
      return next;
    });
  };

  // ═══ Save handler ═══

  const handleSave = async () => {
    if (!form.ruleName.trim()) { toast.error("请输入规则名称"); return; }
    if ((form.cageStatusCodes ?? []).length === 0) { toast.error("请至少选择一种监控状态类型"); return; }

    if (lockMode === "single" && !picked) { toast.error("请先选择人员"); return; }
    if (lockMode === "batch" && !selectedGroup) { toast.error("请先选择课题组"); return; }

    setSaving(true);
    try {
      // Upload images
      let urls: string[] = form.cageImageUrls ?? [];
      if (imageFiles.length > 0) {
        const uploaded: string[] = [];
        for (const f of imageFiles) {
          try {
            const result = await uploadSingleImage(f);
            if (result?.publicUrl) uploaded.push(result.publicUrl);
          } catch { /* skip */ }
        }
        urls = [...urls, ...uploaded];
      }

      // Set group whitelist based on lock mode
      const cageGroupWhitelist = lockMode === "batch" && selectedGroup
        ? [selectedGroup]
        : [];

      const payload: ViolationRule = {
        ...form,
        cageImageUrls: urls,
        cageGroupWhitelist,
      };

      if (editingId) {
        await updateViolationRule(editingId, payload);
        toast.success("规则已更新");
      } else {
        await createViolationRule(payload);
        toast.success("规则已创建");
      }

      resetForm();
      qc.invalidateQueries({ queryKey: ["violation-rules"] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm(emptyRule());
    setEditingId(null);
    setImageFiles([]);
    setPicked(null);
    setPersonKeyword("");
    setSearchUserResult([]);
    setSelectedGroup(null);
    setGroupKeyword("");
    setGroupMembers([]);
    setBatchSelectedIds(new Set());
  };

  const loadRuleForEdit = (r: ViolationRule) => {
    setForm({ ...r });
    setEditingId(r.id ?? null);
    setImageFiles([]);

    // Restore lock mode state
    const groups = r.cageGroupWhitelist ?? [];
    if (groups.length === 1) {
      setLockMode("batch");
      setSelectedGroup(groups[0]);
      pickGroup(groups[0]);
    } else {
      setLockMode("batch");
      setSelectedGroup(null);
    }
  };

  const handleDeleteRule = (r: ViolationRule) => {
    if (!r.id) return;
    if (!confirm(`确定删除规则「${r.ruleName}」？`)) return;
    deleteViolationRule(r.id)
      .then(() => {
        toast.success("规则已删除");
        qc.invalidateQueries({ queryKey: ["violation-rules"] });
      })
      .catch((e: any) => toast.error(e?.response?.data?.message || e.message || "删除失败"));
  };

  const handleManualTrigger = (ruleId: number) => {
    if (!confirm("确定手动触发此规则的判定？")) return;
    manualTriggerRule(ruleId)
      .then(() => {
        toast.success("手动触发已提交");
        qc.invalidateQueries({ queryKey: ["cage-status-violations"] });
      })
      .catch((e: any) => toast.error(e?.response?.data?.message || e.message || "触发失败"));
  };

  const labelClass = "text-xs font-semibold text-[var(--app-color-text-secondary)]";
  const inputClass = "w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";
  const isAutoSync = (form.cageJudgeMode ?? "AUTO_SYNC_LINKED") === "AUTO_SYNC_LINKED";
  const isEditing = editingId != null;

  return (
    <div className="space-y-6">
      {/* ═══ 规则配置表单（内联） ═══ */}
      <AdminFormCard
        title={isEditing ? `✋ 编辑规则 · ${form.ruleName || "未命名"}` : "✋ 新建笼架联动规则"}
        description="单人锁定或按课题组批量配置触发规则；提交后扫码侧按每人最新 ACTIVE 展示。"
      >
        <div className="admin-violation-form-body">

          {/* ═══ 锁定方式 ═══ */}
          <div className="admin-form-field">
            <label className="admin-form-field-label">锁定方式</label>
            <div className="mt-1.5">
              <AdminSegmentedControl
                options={LOCK_MODE_OPTIONS}
                value={lockMode}
                onChange={switchLockMode}
                aria-label="违规对象锁定方式"
              />
            </div>
          </div>

          {/* ═══ 单人锁定 ═══ */}
          {lockMode === "single" && (
            <div className="relative space-y-3">
              <div>
                <label className="text-xs font-medium text-[var(--twin-body)]">检索人员</label>
                <p className="mt-0.5 text-[11px] text-[var(--twin-mute)]">键入自动预检，可回车；选中后锁定对象。</p>
                <input
                  type="text"
                  disabled={Boolean(picked)}
                  className={cn(inputBase, "mt-1.5 disabled:bg-[var(--twin-canvas-soft)] disabled:text-[var(--twin-mute)]")}
                  placeholder="输入姓名或工号…"
                  value={personKeyword}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSearchPersonnel(personKeyword); }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPersonKeyword(val);
                    if (personSearchTimer.current) window.clearTimeout(personSearchTimer.current);
                    personSearchTimer.current = window.setTimeout(() => { handleSearchPersonnel(val); }, 250);
                  }}
                />
              </div>
              {searchUserResult.length > 0 && !picked && (
                <div className="absolute left-0 right-0 top-[5.5rem] z-20 max-h-[220px] overflow-y-auto overscroll-y-contain rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5 shadow-twin-level-3 ring-1 ring-black/[0.04]"
                     role="listbox" aria-label="人员预检结果">
                  {searchUserResult.map((rawPerson) => {
                    const rp = rawPerson as Record<string, unknown>;
                    const safeId = String(rp.user_id ?? rp.userid ?? rp.userId ?? rp.id ?? "").trim();
                    const safeName = String(rp.name ?? rp.username ?? "未知").trim() || safeId;
                    const safeGroup = String(rp.project_group_name ?? rp.projectgroupname ?? "无课题组");
                    const safeHead = rp.head ?? rp.avatar;
                    const headSrc = resolvePersonnelAvatarUrl(typeof safeHead === "string" ? safeHead : undefined);
                    return (
                      <button key={safeId || safeName} type="button" className={adminPickableRowClass} onClick={() => pickPerson(rp)}>
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]">
                          {headSrc ? <img src={headSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <User className="h-4 w-4 text-[var(--twin-mute)]" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-[var(--twin-ink)]">{safeName}</span>
                            <span className="shrink-0 font-mono text-[10px] text-[var(--twin-mute)]">{safeId}</span>
                          </div>
                          <div className="mt-0.5 truncate text-xs text-[var(--twin-mute)]">{safeGroup}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {picked && (
                <div className="flex items-center gap-3 rounded-twin-xl border border-indigo-200/80 bg-indigo-50/80 p-3 ring-1 ring-indigo-100/80">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-twin-level-1">
                    <Check className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-indigo-700">已锁定违规对象</div>
                    <div className="text-sm font-semibold text-indigo-950">
                      {picked.name} <span className="ml-1 font-mono text-xs font-normal text-indigo-600">({picked.userId})</span>
                    </div>
                  </div>
                  <AdminButton type="button" tone="secondary" size="sm" className="shrink-0" onClick={() => { setPicked(null); setPersonKeyword(""); }}>
                    更换人员
                  </AdminButton>
                </div>
              )}
            </div>
          )}

          {/* ═══ 课题组批量 ═══ */}
          {lockMode === "batch" && (
            <div className="relative space-y-3">
              <div>
                <label className="text-xs font-medium text-[var(--twin-body)]">检索课题组</label>
                <p className="mt-0.5 text-[11px] text-[var(--twin-mute)]">数据来自人员档案库；选中课题组后可勾选该组下成员批量锁定。</p>
                <input
                  type="text"
                  disabled={Boolean(selectedGroup)}
                  className={cn(inputBase, "mt-1.5 disabled:bg-[var(--twin-canvas-soft)] disabled:text-[var(--twin-mute)]")}
                  placeholder="输入课题组名称…"
                  value={groupKeyword}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSearchGroups(groupKeyword); }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGroupKeyword(val);
                    if (selectedGroup && val !== selectedGroup) {
                      setSelectedGroup(null);
                      setGroupMembers([]);
                      setBatchSelectedIds(new Set());
                    }
                    if (groupSearchTimer.current) window.clearTimeout(groupSearchTimer.current);
                    groupSearchTimer.current = window.setTimeout(() => { handleSearchGroups(val); }, 250);
                  }}
                />
              </div>

              {/* ═══ 特殊状态快捷选择 ═══ */}
              {!selectedGroup && specialStatusGroups.length > 0 && (
                <div className="rounded-twin-lg border border-amber-200/80 bg-amber-50/60 p-3">
                  <p className="text-[11px] font-semibold text-amber-800 mb-2">
                    当前存在特殊状态的课题组（点击快速选择）
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
                    {specialStatusGroups.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className="text-xs px-2.5 py-1 rounded-full border border-amber-300 bg-white text-amber-900 hover:bg-amber-100 hover:border-amber-400 transition-colors"
                        onClick={() => pickGroup(g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {groupSuggestions.length > 0 && !selectedGroup && (
                <div className="absolute left-0 right-0 top-[5.5rem] z-20 max-h-[200px] overflow-y-auto overscroll-y-contain rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5 shadow-twin-level-3 ring-1 ring-black/[0.04]"
                     role="listbox" aria-label="课题组检索结果">
                  {groupSuggestions.map((g) => (
                    <button key={g} type="button" className={cn(adminPickableRowClass, "px-3 py-2 text-sm font-medium text-[var(--twin-ink)]")}
                            onClick={() => pickGroup(g)}>{g}</button>
                  ))}
                </div>
              )}

              {selectedGroup && (
                <div className="flex items-center gap-3 rounded-twin-xl border border-indigo-200/80 bg-indigo-50/80 p-3 ring-1 ring-indigo-100/80">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-indigo-700">已选课题组</div>
                    <div className="text-sm font-semibold text-indigo-950">{selectedGroup}</div>
                    <div className="mt-0.5 text-xs text-indigo-600">
                      {groupMembersLoading ? "正在加载成员…" : `共 ${groupMembers.length} 人，已勾选 ${batchSelectedIds.size} 人`}
                    </div>
                  </div>
                  <AdminButton type="button" tone="secondary" size="sm" className="shrink-0"
                               onClick={() => { setSelectedGroup(null); setGroupMembers([]); setBatchSelectedIds(new Set()); }}>
                    更换课题组
                  </AdminButton>
                </div>
              )}

              {selectedGroup && !groupMembersLoading && groupMembers.length > 0 && (
                <div className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                    <span className="text-xs font-medium text-[var(--twin-body)]">课题组成员</span>
                    <div className="flex gap-2">
                      <AdminButton type="button" tone="secondary" size="sm"
                                   onClick={() => setBatchSelectedIds(new Set(groupMembers.map((m) => m.userId)))}>
                        <Users className="h-3.5 w-3.5" aria-hidden /> 全选
                      </AdminButton>
                      <AdminButton type="button" tone="secondary" size="sm"
                                   onClick={() => setBatchSelectedIds(new Set())}>
                        取消全选
                      </AdminButton>
                    </div>
                  </div>
                  <div className="max-h-[220px] space-y-1 overflow-y-auto overscroll-y-contain pr-1">
                    {groupMembers.map((m) => {
                      const checked = batchSelectedIds.has(m.userId);
                      const headSrc = resolvePersonnelAvatarUrl(m.head);
                      return (
                        <label key={m.userId}
                               className={cn("flex cursor-pointer items-center gap-2.5 rounded-twin-lg border px-2.5 py-2 transition-colors",
                                 checked ? "border-indigo-200 bg-[var(--twin-canvas)]" : "border-transparent bg-[var(--twin-canvas-soft)] hover:bg-[var(--twin-canvas)]")}>
                          <AdminSwitchScaled size="sm" checked={checked}
                                             onChange={(nextChecked) => toggleBatchMember(m.userId, nextChecked)} />
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]">
                            {headSrc ? <img src={headSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <User className="h-3.5 w-3.5 text-[var(--twin-mute)]" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-[var(--twin-ink)]">{m.name}</div>
                            <div className="font-mono text-[10px] text-[var(--twin-mute)]">{m.userId}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {selectedGroup && !groupMembersLoading && groupMembers.length === 0 && (
                <p className="text-xs text-amber-800">该课题组下未找到有效成员（请确认档案库中 user_id 与课题组标注）。</p>
              )}
            </div>
          )}

          <div className="border-t border-[var(--app-color-border-default)] pt-4 mt-2" />

          {/* ═══ 基本信息 ═══ */}
          <div className="admin-form-field">
            <label className={labelClass}>规则名称</label>
            <input className={inputClass} value={form.ruleName}
                   onChange={(e) => setForm({ ...form, ruleName: e.target.value })}
                   placeholder="例如：健康异常笼架违规" />
          </div>

          <div className="admin-form-field">
            <span className={labelClass}>监控状态类型</span>
            <div className="mt-1.5 flex flex-wrap gap-3">
              {STATUS_OPTIONS.map((s) => {
                const checked = (form.cageStatusCodes ?? []).includes(s.value);
                return (
                  <label key={s.value}
                         className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${checked
                           ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]"
                           : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] text-[var(--app-color-text-secondary)]"}`}>
                    <input type="checkbox" checked={checked} onChange={() => {
                      const cur = form.cageStatusCodes ?? [];
                      setForm({ ...form, cageStatusCodes: cur.includes(s.value) ? cur.filter(c => c !== s.value) : [...cur, s.value] });
                    }} className="sr-only" />
                    {s.label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* ═══ 判定模式 + 延迟天数 ═══ */}
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-form-field">
              <span className={labelClass}>判定模式</span>
              <select className={inputClass} value={form.cageJudgeMode ?? "AUTO_SYNC_LINKED"}
                      onChange={(e) => setForm({ ...form, cageJudgeMode: e.target.value as ViolationRule["cageJudgeMode"] })}>
                {JUDGE_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="admin-form-field">
              <span className={labelClass}>延迟天数</span>
              <input className={inputClass} type="number" min={1} value={form.cageDelayDays ?? 7}
                     onChange={(e) => setForm({ ...form, cageDelayDays: parseInt(e.target.value) || 7 })} />
            </div>
          </div>

          {isAutoSync && (
            <div className="flex items-center gap-2 text-sm">
              <AdminSwitchScaled size="sm" checked={form.cageManualTrigger === 1}
                                 onChange={(checked) => setForm({ ...form, cageManualTrigger: checked ? 1 : 0 })} />
              <span className="text-[var(--app-color-text-primary)]">手动执行定时任务也触发判定</span>
            </div>
          )}

          {/* ═══ 触发动作 ═══ */}
          <div className="admin-form-field">
            <span className={labelClass}>触发动作</span>
            <div className="mt-1.5 flex gap-4">
              {TRIGGER_ACTIONS.map((a) => (
                <label key={a.value} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--app-color-text-primary)]">
                  <input type="radio" name="triggerAction" checked={form.cageTriggerAction === a.value}
                         onChange={() => setForm({ ...form, cageTriggerAction: a.value as ViolationRule["cageTriggerAction"] })} />
                  {a.label}
                </label>
              ))}
            </div>
          </div>

          {/* ═══ 违规内容 ═══ */}
          <div className="admin-form-field">
            <span className={labelClass}>违规文案模板（变量：{"${name} ${dept} ${status} ${cage} ${date}"}）</span>
            <div className="mt-1.5">
              <RichTextEditor value={form.violationTextTpl ?? ""}
                              onChange={(v) => setForm({ ...form, violationTextTpl: v })} />
            </div>
          </div>

          <div className="admin-form-field">
            <span className={labelClass}>违规图片</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <AdminFilePickButton multiple disabled={uploading}
                                   onFiles={(files) => { if (files?.length) setImageFiles(Array.from(files)); }} />
              {uploading && <span className="text-xs text-[var(--app-color-text-tertiary)]">上传中…</span>}
            </div>
            {(form.cageImageUrls ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.cageImageUrls ?? []).map((url, i) => (
                  <div key={i} className="relative h-16 w-16 overflow-hidden rounded-md border border-[var(--app-color-border-default)]">
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button type="button" className="absolute right-0 top-0 rounded-bl bg-red-500 px-1.5 py-0.5 text-xs text-white hover:bg-red-600"
                            onClick={() => setForm({ ...form, cageImageUrls: (form.cageImageUrls ?? []).filter((_, j) => j !== i) })}
                            aria-label="移除图片">x</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ═══ 交互式确认 ═══ */}
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-form-field">
              <span className={labelClass}>确认短语（留空=关闭交互确认）</span>
              <input className={inputClass} value={form.interactiveChallenge ?? ""}
                     onChange={(e) => setForm({ ...form, interactiveChallenge: e.target.value || undefined })}
                     placeholder="如：一人一卡,严禁尾随" />
            </div>
            <div className="flex items-end pb-2">
              <div className="flex items-center gap-2 text-sm">
                <AdminSwitchScaled size="sm" checked={form.interactiveUnlockOnVerify === 1}
                                   onChange={(checked) => setForm({ ...form, interactiveUnlockOnVerify: checked ? 1 : 0 })} />
                <span className="text-[var(--app-color-text-primary)]">验证后自动解除禁入</span>
              </div>
            </div>
          </div>

          {/* ═══ 解禁管控 ═══ */}
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-form-field">
              <span className={labelClass}>解禁方式</span>
              <select className={inputClass} value={form.unblockMethod}
                      onChange={(e) => setForm({ ...form, unblockMethod: e.target.value as ViolationRule["unblockMethod"] })}>
                <option value="自助解禁">自助解禁（用户拼图验证）</option>
                <option value="仅工作人员">仅工作人员</option>
              </select>
            </div>
            <div className="admin-form-field">
              <span className={labelClass}>上限次数（空=不限）</span>
              <input className={inputClass} type="number" min={0} value={form.unblockMaxCount ?? ""}
                     onChange={(e) => setForm({ ...form, unblockMaxCount: e.target.value ? Math.max(0, Number(e.target.value)) : null })}
                     placeholder="不限制" />
            </div>
          </div>

          {/* ═══ 启用 ═══ */}
          <div className="flex items-center gap-2 text-sm">
            <AdminSwitchScaled size="sm" checked={form.enabled === 1}
                               onChange={(checked) => setForm({ ...form, enabled: checked ? 1 : 0 })} />
            <span className="text-[var(--app-color-text-primary)]">启用此规则</span>
          </div>

          {/* ═══ 操作按钮 ═══ */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--app-color-border-default)]">
            {isEditing && (
              <AdminButton tone="secondary" onClick={resetForm}>取消编辑</AdminButton>
            )}
            <AdminButton tone="primary" onClick={handleSave} disabled={saving || uploading} loading={saving}>
              {saving ? "保存中..." : isEditing ? "更新规则" : "保存规则"}
            </AdminButton>
          </div>

        </div>
      </AdminFormCard>

      {/* ═══ 已有规则列表 ═══ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--app-color-text-primary)]">已有规则</h3>
          <span className="text-xs text-[var(--app-color-text-tertiary)]">点击「编辑」可加载到上方表单修改</span>
        </div>

        <AdminTableShell loading={rulesLoading} empty={!rulesLoading && cageRules.length === 0}
                         emptyMessage="暂无笼架联动规则">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-tertiary)]">
                <th className="py-2 px-3">规则名称</th>
                <th className="py-2 px-3">监控状态</th>
                <th className="py-2 px-3">判定模式</th>
                <th className="py-2 px-3">延迟</th>
                <th className="py-2 px-3">触发</th>
                <th className="py-2 px-3">锁定</th>
                <th className="py-2 px-3">状态</th>
                <th className="py-2 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {cageRules.map((r) => (
                <tr key={r.id} className={`border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)] ${editingId === r.id ? "bg-indigo-50/60" : ""}`}>
                  <td className="py-2 px-3 font-semibold text-[var(--app-color-text-primary)]">{r.ruleName}</td>
                  <td className="py-2 px-3 text-xs text-[var(--app-color-text-secondary)]">{(r.cageStatusCodes ?? []).join(", ") || "-"}</td>
                  <td className="py-2 px-3 text-xs">{JUDGE_MODE_LABEL[r.cageJudgeMode ?? ""] ?? "-"}</td>
                  <td className="py-2 px-3 text-xs">{r.cageDelayDays ?? "-"} 天</td>
                  <td className="py-2 px-3 text-xs">{TRIGGER_ACTION_LABEL[r.cageTriggerAction ?? ""] ?? "-"}</td>
                  <td className="py-2 px-3 text-xs">{(r.cageGroupWhitelist ?? []).length > 0 ? (r.cageGroupWhitelist ?? []).join(", ") : "单人/不限"}</td>
                  <td className="py-2 px-3"><span className={r.enabled === 1 ? "text-emerald-600" : "text-[var(--app-color-text-tertiary)]"}>{r.enabled === 1 ? "启用" : "停用"}</span></td>
                  <td className="py-2 px-3 text-right space-x-1">
                    <AdminButton size="sm" onClick={() => loadRuleForEdit(r)}>
                      <Pencil className="w-3.5 h-3.5 mr-0.5" />编辑
                    </AdminButton>
                    {r.cageJudgeMode === "PURE_MANUAL" && (
                      <AdminButton size="sm" tone="secondary" onClick={() => r.id && handleManualTrigger(r.id)}>手动触发</AdminButton>
                    )}
                    <AdminButton size="sm" tone="destructive" onClick={() => handleDeleteRule(r)}>
                      <Trash2 className="w-3.5 h-3.5 mr-0.5" />删除
                    </AdminButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableShell>
      </div>

      {/* ═══ 笼架违规记录 ═══ */}
      <div>
        <h3 className="text-sm font-bold text-[var(--app-color-text-primary)] mb-3">笼架违规记录</h3>
        <AdminTableShell loading={recsLoading} empty={!recsLoading && records.length === 0} emptyMessage="暂无笼架违规记录">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-tertiary)]">
                <th className="py-2 px-3">触发时间</th>
                <th className="py-2 px-3">笼位</th>
                <th className="py-2 px-3">状态类型</th>
                <th className="py-2 px-3">课题组</th>
                <th className="py-2 px-3">园区/房间</th>
                <th className="py-2 px-3">状态</th>
                <th className="py-2 px-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => {
                const isExpanded = expandedId === rec.id;
                return (
                  <tr key={rec.id}
                      className={`border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)] cursor-pointer ${isExpanded ? "bg-[var(--app-color-surface-hover)]" : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : rec.id)}>
                    <td className="py-2 px-3 text-xs text-[var(--app-color-text-secondary)]">{rec.triggeredAt?.slice(0, 16) ?? "-"}</td>
                    <td className="py-2 px-3 font-medium text-[var(--app-color-text-primary)]">{rec.positionLabel}</td>
                    <td className="py-2 px-3 text-xs">{rec.statusCode}</td>
                    <td className="py-2 px-3 text-xs text-[var(--app-color-text-secondary)]">{rec.projectGroupName ?? "-"}</td>
                    <td className="py-2 px-3 text-xs text-[var(--app-color-text-secondary)]">{[rec.campusName, rec.roomName].filter(Boolean).join(" / ") || "-"}</td>
                    <td className="py-2 px-3">
                      <span className={rec.status === "ACTIVE" ? "text-rose-600 font-medium" : "text-emerald-600"}>
                        {rec.status === "ACTIVE" ? "生效中" : rec.status === "CLEARED" ? "已解除" : "已过期"}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <ChevronRight className={`w-4 h-4 text-[var(--app-color-text-tertiary)] transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AdminTableShell>

        {records.filter((rec) => expandedId === rec.id).map((rec) => (
          <CageLinkageRecordPanel key={`detail-${rec.id}`} parentId={rec.id} onClose={() => setExpandedId(null)} />
        ))}
      </div>
    </div>
  );
}
