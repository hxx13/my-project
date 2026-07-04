import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Beaker,
  Bell,
  Check,
  CreditCard,
  FileText,
  Pencil,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  batchCreateStudentViolations,
  clearStudentViolation,
  createStudentViolation,
  deleteStudentViolation,
  getUnboundCardNoticeSettings,
  listStudentViolations,
  listViolationPersonnelByProjectGroup,
  listViolationRules,
  saveUnboundCardNoticeSettings,
  searchViolationProjectGroups,
  UNBOUND_APPLY_ROLE_OPTIONS,
  updateStudentViolation,
  VIOLATION_STATUS_LABEL,
  type StudentViolationRow,
  type UnboundApplyRoleCode,
  type ViolationRule,
} from "@/api/domains/studentViolation.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import {
  resolveManualViolationForbidEnter,
  violationEnterLocked,
  violationImmediateForbidEnter,
} from "@/components/scanner/twinViolationInteractive";
import { adminHttp } from "@/api/core/adminHttp";
import { searchPersonnel } from "@/api/twinApi";
import { AdminButton, adminPickableRowClass } from "@/components/admin/AdminButton";
import { AdminFilePickButton } from "@/components/admin/AdminFilePickButton";
import { AdminPageTabs, AdminTabPanel } from "@/components/admin/AdminPageTabs";
import { AdminSegmentedControl } from "@/components/admin/AdminSegmentedControl";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminFormCard, AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { isRichTextEmpty, richTextPlainPreview } from "@/utils/announcementHtml";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";
import { ScanPopupAnnouncementSection } from "@/features/admin/ScanPopupAnnouncementSection";
import type { SwipeAlertRuleRow } from "@/api/domains/swipeAlert.api";
import { SwipeAlertRuleList } from "@/features/swipe-alert/SwipeAlertRuleList";
import { SwipeAlertRuleForm } from "@/features/swipe-alert/SwipeAlertRuleForm";
import { DepartmentMultiSelect } from "@/features/swipe-alert/DepartmentMultiSelect";
import { ViolationRuleManager } from "@/features/admin/ViolationRuleManager";
import {
  SCAN_OPERATOR_ROLE_HINT_UNBOUND,
  SCAN_OPERATOR_ROLE_LABEL,
} from "@/features/admin/scanOperatorRoleHint";
import { normalizePersonnelRecord, type PersonnelRecordView } from "@/utils/personnelRecord";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";
import { SystemConfigsPanel } from "@/features/admin/settings/SystemConfigsPanel";
import { fetchSystemConfigs, fetchConfigDefinitions, type SystemConfigRecord, type SettingDefinitionRecord } from "@/api/domains/notification.api";

type PickUser = { userId: string; name: string };
type LockMode = "single" | "batch";
type PageTabId = "unbound" | "announcement" | "create" | "records" | "swipe-alert" | "rules" | "homepage-content";

const PAGE_TABS: { id: PageTabId; label: string; icon: ReactNode }[] = [
  { id: "unbound", label: "未绑卡提示", icon: <CreditCard className="h-4 w-4 text-[var(--twin-mute)]" aria-hidden /> },
  { id: "announcement", label: "扫码弹窗公告", icon: <Bell className="h-4 w-4 text-[var(--twin-mute)]" aria-hidden /> },
  { id: "create", label: "新建违规", icon: <UserPlus className="h-4 w-4 text-[var(--twin-mute)]" aria-hidden /> },
  { id: "records", label: "违规记录", icon: <ShieldAlert className="h-4 w-4 text-[var(--twin-mute)]" aria-hidden /> },
  { id: "swipe-alert", label: "刷卡失败告警", icon: <AlertTriangle className="h-4 w-4 text-[var(--twin-mute)]" aria-hidden /> },
  { id: "rules", label: "触发规则", icon: <Settings className="h-4 w-4 text-[var(--twin-mute)]" aria-hidden /> },
  { id: "homepage-content", label: "主页文案", icon: <FileText className="h-4 w-4 text-[var(--twin-mute)]" aria-hidden /> },
];

const LOCK_MODE_OPTIONS: { value: LockMode; label: string }[] = [
  { value: "single", label: "单人锁定" },
  { value: "batch", label: "课题组批量" },
];

const inputBase =
  "w-full rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] shadow-twin-level-1 outline-none transition placeholder:text-[var(--twin-mute)] focus-visible:border-[var(--twin-hairline-strong)] focus-visible:ring-2 focus-visible:ring-[color:var(--admin-focus-ring)]/40";

function parseRowImageUrls(row: StudentViolationRow): string[] {
  const raw = row.imageUrls;
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const j = JSON.parse(raw) as unknown;
      return Array.isArray(j) ? j.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function personDisplayName(r: StudentViolationRow): string {
  const n = (r.targetUserDisplayName ?? "").trim();
  return n || r.targetUserId;
}

function violationStatusLabel(status: string | undefined): { text: string; hint?: string; className: string } {
  switch (status) {
    case "ACTIVE":
      return { text: "生效中", hint: "扫码弹窗与大屏公示均可能展示", className: "font-medium text-rose-700" };
    case "SUPERSEDED":
      return { text: "已被覆盖", hint: "同一人新建违规时，旧记录由系统自动归档；仅留档，不再生效", className: "text-amber-800" };
    case "CLEARED":
    case "PROCESSED":
      return { text: "已解除", hint: "管理员已结束，扫码不再展示，记录仍保留", className: "text-emerald-800" };
    case "EXPIRED":
      return { text: "已过期", hint: "超过到期时间，系统自动失效", className: "text-[var(--twin-mute)]" };
    default:
      return { text: status || "—", className: "text-[var(--twin-body)]" };
  }
}

/** 违规文案模板快捷选择 + 保存预设 */
function ViolationTemplateQuickSelect({
  onSelect,
  currentText,
}: {
  onSelect: (text: string) => void;
  currentText: string;
}) {
  const [open, setOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: templates = [], refetch } = useQuery({
    queryKey: ["violationTextTemplates"],
    queryFn: () => import("@/api/domains/violationTextTemplate.api").then((m) => m.listViolationTextTemplates()),
    staleTime: 30_000,
  });

  const handleSave = async () => {
    if (isRichTextEmpty(currentText)) return;
    setSaving(true);
    try {
      const { createViolationTextTemplate } = await import("@/api/domains/violationTextTemplate.api");
      await createViolationTextTemplate(saveName || `模板 ${templates.length + 1}`, currentText, 0);
      await refetch();
      setSaveName("");
      toast.success("模板已保存");
    } catch { toast.error("保存失败"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      const { deleteViolationTextTemplate } = await import("@/api/domains/violationTextTemplate.api");
      await deleteViolationTextTemplate(id);
      await refetch();
      toast.success("模板已删除");
    } catch { toast.error("删除失败"); }
  };

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative flex items-center gap-1" ref={ref}>
      <button
        type="button"
        className="text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
        onClick={() => setOpen(!open)}
      >
        📋 选择模板 {templates.length > 0 ? `(${templates.length})` : ""}
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-50 w-72 rounded-xl border border-neutral-200 bg-white shadow-xl p-2 max-h-[300px] overflow-y-auto">
          {templates.length === 0 ? (
            <p className="text-[11px] text-neutral-400 p-2">暂无保存的模板</p>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="flex items-center gap-1 rounded-lg p-1.5 hover:bg-blue-50 transition-colors group">
                <button
                  type="button"
                  className="flex-1 text-left text-xs truncate font-medium text-neutral-700"
                  title={richTextPlainPreview(t.violationText, 120)}
                  onClick={() => { onSelect(t.violationText); setOpen(false); }}
                >
                  {t.name}
                  <span className="block text-[10px] text-neutral-400 truncate">
                    {richTextPlainPreview(t.violationText) || "（空）"}
                  </span>
                </button>
                <button
                  type="button"
                  className="shrink-0 text-[10px] text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDelete(t.id)}
                >
                  ✕
                </button>
              </div>
            ))
          )}
          <div className="mt-2 border-t border-neutral-100 pt-2 flex gap-1">
            <input
              className="flex-1 text-[11px] px-2 py-1 rounded border border-neutral-200"
              placeholder="模板名称（可选）"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
            <button
              type="button"
              disabled={saving || isRichTextEmpty(currentText)}
              className="shrink-0 text-[11px] font-bold px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
              onClick={handleSave}
            >
              保存当前
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function parsePageTab(raw: string | null): PageTabId {
  if (raw === "unbound" || raw === "announcement" || raw === "create" || raw === "records" || raw === "swipe-alert" || raw === "rules" || raw === "homepage-content") return raw;
  return "unbound";
}

function parseJsonArrayStr(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/** MySQL TINYINT / JSON boolean 统一解析（勿用 `v !== 0`，false 与 "0" 会被误判为开） */
function dbTinyIntOn(value: unknown, defaultOn = false): boolean {
  if (value === null || value === undefined) return defaultOn;
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return defaultOn;
}

function HomepageContentTab() {
  const [configs, setConfigs] = useState<SystemConfigRecord[]>([]);
  const [defs, setDefs] = useState<SettingDefinitionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchSystemConfigs("dashboard_codex"),
      fetchConfigDefinitions("dashboard_codex"),
    ])
      .then(([c, d]) => { setConfigs(c); setDefs(d); })
      .catch(err => console.error("Failed to load dashboard_codex configs:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--twin-mute)]">加载中…</div>;

  return (
    <SystemConfigsPanel
      moduleKey="dashboard_codex"
      configs={configs}
      configDefs={defs}
      onConfigsChange={setConfigs}
      title="主页文案与公告"
      description="管理主页还卡说明、惩戒公告等面向学生的文案与展示样式。修改后即时生效。"
    />
  );
}

export default function AdminStudentViolationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const activeTab = parsePageTab(searchParams.get("tab"));
  const setActiveTab = (id: PageTabId) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", id);
        return next;
      },
      { replace: true }
    );
  };

  const [personKeyword, setPersonKeyword] = useState("");
  const [searchUserResult, setSearchUserResult] = useState<Array<Record<string, unknown>>>([]);
  const personSearchTimer = useRef<number | null>(null);
  const [lockMode, setLockMode] = useState<LockMode>("single");
  const [picked, setPicked] = useState<PickUser | null>(null);
  const [groupKeyword, setGroupKeyword] = useState("");
  const [groupSuggestions, setGroupSuggestions] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<PersonnelRecordView[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const groupSearchTimer = useRef<number | null>(null);
  const [violationText, setViolationText] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [forbidEnter, setForbidEnter] = useState(false);
  const [newInteractiveChallenge, setNewInteractiveChallenge] = useState("");
  const [newInteractiveUnlockOnVerify, setNewInteractiveUnlockOnVerify] = useState(true);
  const [maxEnter, setMaxEnter] = useState("");
  const [showEvery, setShowEvery] = useState(true);
  const [expireDays, setExpireDays] = useState("");
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editTargetLabel, setEditTargetLabel] = useState("");
  const [editText, setEditText] = useState("");
  const [editUrls, setEditUrls] = useState<string[]>([]);
  const [editForbid, setEditForbid] = useState(false);
  const [editMax, setEditMax] = useState("");
  const [editShowEvery, setEditShowEvery] = useState(true);
  const [editExpireMode, setEditExpireMode] = useState<"KEEP" | "CLEAR" | "RELATIVE">("KEEP");
  const [editExpireDays, setEditExpireDays] = useState("");
  const [editInteractiveChallenge, setEditInteractiveChallenge] = useState("");
  const [editInteractiveUnlockOnVerify, setEditInteractiveUnlockOnVerify] = useState(true);
  const [editUploading, setEditUploading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [unboundEnabled, setUnboundEnabled] = useState(true);
  const [unboundShowEvery, setUnboundShowEvery] = useState(true);
  const [unboundForbidEnter, setUnboundForbidEnter] = useState(false);
  const [unboundApplyRoles, setUnboundApplyRoles] = useState<UnboundApplyRoleCode[]>(["MEMBER"]);
  const [unboundText, setUnboundText] = useState("");
  const [unboundUrls, setUnboundUrls] = useState<string[]>([]);
  const [unboundUploading, setUnboundUploading] = useState(false);
  const [unboundSaving, setUnboundSaving] = useState(false);
  const [swipeAlertRefreshKey, setSwipeAlertRefreshKey] = useState(0);
  const [editingSwipeRule, setEditingSwipeRule] = useState<SwipeAlertRuleRow | null>(null);

  // Stranded violation config state
  const [strandedAutoSignout, setStrandedAutoSignout] = useState(true);
  const [strandedViolationTpl, setStrandedViolationTpl] = useState("");
  const [strandedForbidEnter, setStrandedForbidEnter] = useState(false);
  const [strandedExpireDays, setStrandedExpireDays] = useState("1");
  const [strandedWhitelistDepts, setStrandedWhitelistDepts] = useState<string[]>([]);
  const [interactiveChallengeEnabled, setInteractiveChallengeEnabled] = useState(false);
  const [interactiveChallengePhrase, setInteractiveChallengePhrase] = useState("一人一卡,严禁尾随");
  const [strandedInteractiveUnlockOnVerify, setStrandedInteractiveUnlockOnVerify] = useState(true);
  const [strandedConfigLoading, setStrandedConfigLoading] = useState(false);
  const [strandedConfigSaving, setStrandedConfigSaving] = useState(false);
  const [strandedSignout2Enabled, setStrandedSignout2Enabled] = useState(true);
  const [strandedSignout2LastResult, setStrandedSignout2LastResult] = useState("");
  const [strandedSignout2Loading, setStrandedSignout2Loading] = useState(false);
  const [strandedSignout2Saving, setStrandedSignout2Saving] = useState(false);
  // Test state
  const [testPersonKeyword, setTestPersonKeyword] = useState("");
  const [testPickedUser, setTestPickedUser] = useState<{userId: string; name: string} | null>(null);
  const [testSearchResult, setTestSearchResult] = useState<Array<Record<string, unknown>>>([]);
  const [testSignout, setTestSignout] = useState(true);
  const [testRunning, setTestRunning] = useState(false);

  const violationsQueryKey = useMemo(
    () => ["studentViolations", picked?.userId || "all"] as const,
    [picked?.userId]
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: violationsQueryKey,
    queryFn: () => listStudentViolations({ targetUserId: picked?.userId || undefined, limit: 400 }),
    placeholderData: (prev) => prev,
  });

  const { data: violationRules = [] } = useQuery({
    queryKey: ["violation-rules"],
    queryFn: () => listViolationRules(),
    staleTime: 60_000,
  });

  const { data: unboundSettings, isLoading: unboundLoading } = useQuery({
    queryKey: ["unboundCardNoticeSettings"] as const,
    queryFn: getUnboundCardNoticeSettings,
  });

  useEffect(() => {
    if (unboundSettings) {
      setUnboundEnabled(unboundSettings.enabled);
      setUnboundShowEvery(unboundSettings.showNoticeEveryScan);
      setUnboundForbidEnter(Boolean(unboundSettings.forbidEnter));
      setUnboundApplyRoles(unboundSettings.applyRoleCodes ?? ["MEMBER"]);
      setUnboundText(unboundSettings.violationText ?? "");
      setUnboundUrls(unboundSettings.imageUrls ?? []);
    }
  }, [unboundSettings]);

  const uploadUnboundImages = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) {
      toast.error("未识别到图片");
      return;
    }
    setUnboundUploading(true);
    try {
      const urls: string[] = [];
      for (const f of imgs) {
        urls.push((await uploadSingleImage(f)).publicUrl);
      }
      setUnboundUrls((prev) => [...prev, ...urls]);
      toast.success(`已上传 ${urls.length} 张`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUnboundUploading(false);
    }
  }, []);

  const saveUnboundSettings = async () => {
    setUnboundSaving(true);
    try {
      const saved = await saveUnboundCardNoticeSettings({
        enabled: unboundEnabled,
        showNoticeEveryScan: unboundShowEvery,
        forbidEnter: unboundForbidEnter,
        applyRoleCodes: unboundApplyRoles,
        violationText: unboundText.trim(),
        imageUrls: unboundUrls,
      });
      setUnboundEnabled(saved.enabled);
      setUnboundShowEvery(saved.showNoticeEveryScan);
      setUnboundForbidEnter(Boolean(saved.forbidEnter));
      setUnboundApplyRoles(saved.applyRoleCodes ?? ["MEMBER"]);
      setUnboundText(saved.violationText ?? "");
      setUnboundUrls(saved.imageUrls ?? []);
      qc.setQueryData(["unboundCardNoticeSettings"], saved);
      toast.success("未绑卡提示已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setUnboundSaving(false);
    }
  };

  const handleSearchPersonnel = useCallback(async (keyword: string) => {
    const q = keyword.trim();
    if (!q) {
      setSearchUserResult([]);
      return;
    }
    try {
      const { data: list } = await searchPersonnel(q);
      setSearchUserResult(Array.isArray(list) ? list : []);
    } catch {
      setSearchUserResult([]);
    }
  }, []);

  const pickPersonFromHit = (raw: Record<string, unknown>) => {
    const safeId = String(raw.user_id ?? raw.userid ?? raw.userId ?? raw.id ?? "").trim();
    const safeName = String(raw.name ?? raw.username ?? "").trim() || safeId;
    if (!safeId) {
      toast.error("该记录缺少 user_id");
      return;
    }
    setPicked({ userId: safeId, name: safeName });
    setPersonKeyword(`${safeName} (${safeId})`);
    setSearchUserResult([]);
  };

  const clearPickedPerson = () => {
    setPicked(null);
    setPersonKeyword("");
    setSearchUserResult([]);
  };

  const resetBatchGroup = () => {
    setSelectedGroup(null);
    setGroupKeyword("");
    setGroupSuggestions([]);
    setGroupMembers([]);
    setBatchSelectedIds(new Set());
  };

  const handleSearchProjectGroups = useCallback(async (keyword: string) => {
    const q = keyword.trim();
    if (!q) {
      setGroupSuggestions([]);
      return;
    }
    try {
      const list = await searchViolationProjectGroups(q, 30);
      setGroupSuggestions(Array.isArray(list) ? list : []);
    } catch {
      setGroupSuggestions([]);
    }
  }, []);

  const loadGroupMembers = useCallback(async (groupName: string) => {
    const g = groupName.trim();
    if (!g) {
      setGroupMembers([]);
      setBatchSelectedIds(new Set());
      return;
    }
    setGroupMembersLoading(true);
    try {
      const rows = await listViolationPersonnelByProjectGroup(g, 500);
      const members = (Array.isArray(rows) ? rows : [])
        .map((r) => normalizePersonnelRecord(r as unknown as Record<string, unknown>))
        .filter((p): p is PersonnelRecordView => p != null && Boolean(p.userId));
      setGroupMembers(members);
      setBatchSelectedIds(new Set(members.map((m) => m.userId)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载课题组成员失败");
      setGroupMembers([]);
      setBatchSelectedIds(new Set());
    } finally {
      setGroupMembersLoading(false);
    }
  }, []);

  const pickProjectGroup = (groupName: string) => {
    const g = groupName.trim();
    if (!g) return;
    setSelectedGroup(g);
    setGroupKeyword(g);
    setGroupSuggestions([]);
    void loadGroupMembers(g);
  };

  const toggleBatchMember = (userId: string, checked: boolean) => {
    setBatchSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const switchLockMode = (mode: LockMode) => {
    if (mode === lockMode) return;
    setLockMode(mode);
    clearPickedPerson();
    resetBatchGroup();
  };
  const maxEnterParsed = useMemo(() => {
    const s = maxEnter.trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  }, [maxEnter]);

  const expireDaysParsed = useMemo(() => {
    const s = expireDays.trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  }, [expireDays]);

  const uploadViolationImages = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) {
      toast.error("未识别到图片（请选择图片文件或粘贴截图）");
      return;
    }
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of imgs) {
        urls.push((await uploadSingleImage(f)).publicUrl);
      }
      setImageUrls((prev) => [...prev, ...urls]);
      toast.success(`已上传 ${urls.length} 张`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }, []);

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return;
    void uploadViolationImages(Array.from(files));
  };

  const onPasteNewViolationImages = (e: ClipboardEvent<HTMLDivElement>) => {
    const dt = e.clipboardData;
    if (!dt) return;
    const collected: File[] = [];
    if (dt.files?.length) {
      collected.push(...Array.from(dt.files));
    }
    if (!collected.length && dt.items?.length) {
      for (let i = 0; i < dt.items.length; i += 1) {
        const it = dt.items[i];
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) collected.push(f);
        }
      }
    }
    const imgs = collected.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    e.preventDefault();
    e.stopPropagation();
    void uploadViolationImages(imgs);
  };

  const handleNewInteractiveChallengeChange = (value: string) => {
    setNewInteractiveChallenge(value);
    if (value.trim()) {
      setForbidEnter(true);
    }
  };

  const handleForbidEnterChange = (checked: boolean, interactivePhrase: string) => {
    if (!checked && interactivePhrase.trim()) {
      toast.error("已填写交互式确认短语时须保持「立即禁止扫码进入」；清空短语后可仅关禁入");
      return;
    }
    setForbidEnter(checked);
  };

  const handleEditInteractiveChallengeChange = (value: string) => {
    setEditInteractiveChallenge(value);
    if (value.trim()) {
      setEditForbid(true);
    }
  };

  const handleEditForbidChange = (checked: boolean) => {
    if (!checked && editInteractiveChallenge.trim()) {
      toast.error("已填写交互式确认短语时须保持「立即禁止扫码进入」；清空短语后可仅关禁入");
      return;
    }
    setEditForbid(checked);
  };

  const resetViolationForm = () => {
    setViolationText("");
    setImageUrls([]);
    setMaxEnter("");
    setExpireDays("");
    setForbidEnter(false);
    setNewInteractiveChallenge("");
    setNewInteractiveUnlockOnVerify(true);
    setShowEvery(true);
    setSelectedRuleId(null);
  };

  const submit = async () => {
    if (lockMode === "single") {
      if (!picked) {
        toast.error("请先选择人员");
        return;
      }
      setSaving(true);
      try {
        const interactiveChallenge = newInteractiveChallenge.trim() || null;
        const effectiveForbidEnter = resolveManualViolationForbidEnter(forbidEnter, interactiveChallenge);
        await createStudentViolation({
          targetUserId: picked.userId,
          ruleId: selectedRuleId,
          violationText: violationText.trim(),
          imageUrls,
          forbidEnter: effectiveForbidEnter,
          maxEnterSuccess: maxEnterParsed,
          showNoticeEveryScan: showEvery,
          expireAfterDays: expireDaysParsed,
          interactiveChallenge,
          interactiveUnlockOnVerify: interactiveChallenge ? newInteractiveUnlockOnVerify : undefined,
        });
        toast.success("已保存违规记录");
        clearPickedPerson();
        resetViolationForm();
        await qc.invalidateQueries({ queryKey: ["studentViolations"] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存失败");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!selectedGroup) {
      toast.error("请先检索并选择课题组");
      return;
    }
    const ids = Array.from(batchSelectedIds);
    if (!ids.length) {
      toast.error("请至少勾选一名课题组成员");
      return;
    }
    if (!window.confirm(`确认为课题组「${selectedGroup}」下选中的 ${ids.length} 人批量提交违规记录？`)) {
      return;
    }
    setSaving(true);
    try {
      const interactiveChallenge = newInteractiveChallenge.trim() || null;
      const effectiveForbidEnter = resolveManualViolationForbidEnter(forbidEnter, interactiveChallenge);
      const summary = await batchCreateStudentViolations({
        targetUserIds: ids,
        ruleId: selectedRuleId,
        violationText: violationText.trim(),
        imageUrls,
        forbidEnter: effectiveForbidEnter,
        maxEnterSuccess: maxEnterParsed,
        showNoticeEveryScan: showEvery,
        expireAfterDays: expireDaysParsed,
        interactiveChallenge,
        interactiveUnlockOnVerify: interactiveChallenge ? newInteractiveUnlockOnVerify : undefined,
      });
      const created = summary?.createdCount ?? 0;
      const failed = summary?.failed?.length ?? 0;
      if (failed > 0) {
        toast.error(`已创建 ${created} 条，${failed} 人失败`);
      } else {
        toast.success(`已为 ${created} 人保存违规记录`);
      }
      resetBatchGroup();
      resetViolationForm();
      await qc.invalidateQueries({ queryKey: ["studentViolations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量保存失败");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    lockMode === "single" ? Boolean(picked) : Boolean(selectedGroup) && batchSelectedIds.size > 0;

  const onClear = async (id: number) => {
    if (!window.confirm("解除后该条将不再在扫码弹窗展示，记录仍保留。确定？")) return;
    try {
      await clearStudentViolation(id);
      toast.success("已解除");
      await qc.invalidateQueries({ queryKey: violationsQueryKey });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "解除失败");
    }
  };

  const openEdit = (r: StudentViolationRow) => {
    setEditId(r.id);
    setEditTargetLabel(personDisplayName(r));
    setEditText(r.violationText || "");
    setEditUrls(parseRowImageUrls(r));
    setEditForbid(Boolean(r.forbidEnter) || Boolean(r.interactiveChallenge?.trim()));
    setEditMax(r.maxEnterSuccess != null && r.maxEnterSuccess !== undefined ? String(r.maxEnterSuccess) : "");
    setEditShowEvery(r.showNoticeEveryScan !== 0);
    setEditExpireMode("KEEP");
    setEditExpireDays("");
    setEditInteractiveChallenge(r.interactiveChallenge || "");
    setEditInteractiveUnlockOnVerify(r.interactiveUnlockOnVerify !== 0);
    setEditOpen(true);
  };

  const editMaxParsed = useMemo(() => {
    const s = editMax.trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  }, [editMax]);

  const editExpireDaysParsed = useMemo(() => {
    const s = editExpireDays.trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  }, [editExpireDays]);

  const onEditFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setEditUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        urls.push((await uploadSingleImage(f)).publicUrl);
      }
      setEditUrls((prev) => [...prev, ...urls]);
      toast.success(`已上传 ${urls.length} 张`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setEditUploading(false);
    }
  };

  const saveEdit = async () => {
    if (editId == null) return;
    if (editExpireMode === "RELATIVE" && (editExpireDaysParsed == null || editExpireDaysParsed <= 0)) {
      toast.error("选择「重新起算天数」时请填写大于 0 的天数");
      return;
    }
    setSavingEdit(true);
    try {
      const interactiveChallenge = editInteractiveChallenge.trim() || null;
      const effectiveForbidEnter = resolveManualViolationForbidEnter(editForbid, interactiveChallenge);
      const updated = await updateStudentViolation(editId, {
        violationText: editText.trim(),
        imageUrls: editUrls,
        forbidEnter: effectiveForbidEnter,
        maxEnterSuccess: editMaxParsed,
        showNoticeEveryScan: editShowEvery,
        expireMode: editExpireMode,
        expireAfterDays: editExpireMode === "RELATIVE" ? editExpireDaysParsed : null,
        interactiveChallenge,
        interactiveUnlockOnVerify: interactiveChallenge ? editInteractiveUnlockOnVerify : undefined,
      });
      toast.success("已保存修改");
      setEditOpen(false);
      setEditId(null);
      if (updated) {
        qc.setQueryData(violationsQueryKey, (prev: StudentViolationRow[] | undefined) =>
          (prev || []).map((r) => (r.id === updated.id ? updated : r))
        );
      } else {
        await qc.invalidateQueries({ queryKey: violationsQueryKey });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingEdit(false);
    }
  };

  const onDeleteRow = async (r: StudentViolationRow) => {
    if (!window.confirm(`确定物理删除记录 #${r.id}？不可恢复。`)) return;
    try {
      await deleteStudentViolation(r.id);
      toast.success("已删除");
      if (editId === r.id) {
        setEditOpen(false);
        setEditId(null);
      }
      qc.setQueryData(violationsQueryKey, (prev: StudentViolationRow[] | undefined) =>
        (prev || []).filter((x) => x.id !== r.id)
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  // ---- Stranded config ----
  const loadStrandedConfig = async () => {
    setStrandedConfigLoading(true);
    try {
      const res = await adminHttp.get("/twin/student-violations/stranded-config");
      const cfg = (res as any)?.data?.data ?? (res as any)?.data ?? {};
      setStrandedAutoSignout(dbTinyIntOn(cfg.auto_signout_enabled, true));
      setStrandedViolationTpl(cfg.violation_text_tpl || "");
      setStrandedForbidEnter(Boolean(cfg.forbid_enter));
      setStrandedExpireDays(String(cfg.expire_after_days ?? 1));
      setStrandedWhitelistDepts(parseJsonArrayStr(cfg.whitelist_depts));
      setInteractiveChallengeEnabled(Boolean(cfg.interactive_challenge_enabled));
      setInteractiveChallengePhrase(cfg.interactive_challenge_phrase || "一人一卡,严禁尾随");
      setStrandedInteractiveUnlockOnVerify(dbTinyIntOn(cfg.interactive_unlock_on_verify, true));
    } catch { /* ignore */ }
    finally { setStrandedConfigLoading(false); }
  };

  const saveStrandedConfig = async () => {
    setStrandedConfigSaving(true);
    try {
      // Save stranded violation config (keys must be snake_case for backend Map.get())
      await adminHttp.put("/twin/student-violations/stranded-config", {
        auto_signout_enabled: strandedAutoSignout ? 1 : 0,
        violation_text_tpl: isRichTextEmpty(strandedViolationTpl) ? "" : strandedViolationTpl.trim(),
        forbid_enter: strandedForbidEnter ? 1 : 0,
        expire_after_days: Number(strandedExpireDays) || 1,
        whitelist_depts: JSON.stringify(strandedWhitelistDepts),
        interactive_challenge_enabled: interactiveChallengeEnabled ? 1 : 0,
        interactive_challenge_phrase: interactiveChallengePhrase,
        interactive_unlock_on_verify: strandedInteractiveUnlockOnVerify ? 1 : 0,
      });
      toast.success("自动滞留配置已保存");
      loadStrandedConfig();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally { setStrandedConfigSaving(false); }
  };

  const loadStrandedSignoutConfig = async () => {
    setStrandedSignout2Loading(true);
    try {
      const res = await adminHttp.get("/twin/student-violations/stranded-signout-config");
      const cfg = (res as any)?.data?.data ?? (res as any)?.data ?? {};
      setStrandedSignout2Enabled(dbTinyIntOn(cfg.auto_signout_enabled, true));
      setStrandedSignout2LastResult(String(cfg.last_execution_result ?? ""));
    } catch { /* ignore */ }
    finally { setStrandedSignout2Loading(false); }
  };

  const saveStrandedSignoutConfig = async () => {
    setStrandedSignout2Saving(true);
    try {
      await adminHttp.put("/twin/student-violations/stranded-signout-config", {
        auto_signout_enabled: strandedSignout2Enabled ? 1 : 0,
      });
      toast.success("第二道滞留签退配置已保存");
      loadStrandedSignoutConfig();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally { setStrandedSignout2Saving(false); }
  };

  const runTestOnUser = async () => {
    if (!testPickedUser) { toast.error("请先选择人员"); return; }
    setTestRunning(true);
    try {
      const res = await adminHttp.post("/twin/student-violations/stranded-config/test", {
        userId: testPickedUser.userId,
        autoSignout: testSignout,
      });
      const data = (res as any)?.data?.data ?? (res as any)?.data ?? res;
      toast.success(data?.summary || data?.message || "测试执行成功");
      loadStrandedConfig(); // refresh last result
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "测试失败");
    } finally { setTestRunning(false); }
  };

  const handleTestSearchPersonnel = useCallback(async (keyword: string) => {
    const q = keyword.trim();
    if (!q) {
      setTestSearchResult([]);
      return;
    }
    try {
      const { data: list } = await searchPersonnel(q);
      setTestSearchResult(Array.isArray(list) ? list : []);
    } catch {
      setTestSearchResult([]);
    }
  }, []);

  const testSearchTimer = useRef<number | null>(null);

  useEffect(() => {
    loadStrandedConfig();
    loadStrandedSignoutConfig();
  }, []);

  return (
    <AdminPageShell
      title="警告与弹窗公告"
      description="按标签切换各配置板块；违规惩戒支持单人或课题组批量锁定。"
      actions={
        activeTab === "records" ? (
          <AdminButton
            type="button"
            tone="secondary"
            className="inline-flex items-center gap-2"
            loading={isLoading}
            onClick={() => qc.invalidateQueries({ queryKey: violationsQueryKey })}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            刷新列表
          </AdminButton>
        ) : null
      }
    >
      <AdminPageTabs
        tabs={PAGE_TABS}
        value={activeTab}
        onChange={(id) => setActiveTab(id as PageTabId)}
        panelIdPrefix="violation-page-panel"
      />

      <div className="mt-4">
        <AdminTabPanel
          id="violation-page-panel-unbound"
          tabId="unbound"
          activeTab={activeTab}
          className="admin-violations-tab-panel"
        >
      <AdminFormCard
        title="未绑卡扫码提示"
        description="扫描到尚未绑定物理卡的人员时展示警示；按当前网页登录人员的 sys_user 角色决定是否生效（与被扫人员身份无关）。"
      >
        <div className="admin-violation-form-body">
          <div className="admin-form-toggle-row">
            <label className="flex items-center gap-2 text-sm text-[var(--twin-ink)]">
              <AdminSwitchScaled
                size="sm"
                checked={unboundEnabled}
                disabled={unboundLoading}
                onChange={(checked) => setUnboundEnabled(checked)}
              />
              启用未绑卡提示
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--twin-ink)]">
              <AdminSwitchScaled
                size="sm"
                checked={unboundShowEvery}
                disabled={unboundLoading}
                onChange={(checked) => setUnboundShowEvery(checked)}
              />
              每次扫码都自动展开提示
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--twin-ink)]">
              <AdminSwitchScaled
                size="sm"
                checked={unboundForbidEnter}
                disabled={unboundLoading || !unboundEnabled}
                onChange={(checked) => setUnboundForbidEnter(checked)}
              />
              禁止扫码进入（未绑卡时，离开不受影响）
            </label>
          </div>
          <div className="admin-form-field">
            <label className="admin-form-field-label">{SCAN_OPERATOR_ROLE_LABEL}</label>
            <p className="admin-form-field-hint">{SCAN_OPERATOR_ROLE_HINT_UNBOUND}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {UNBOUND_APPLY_ROLE_OPTIONS.map((opt) => {
                const checked = unboundApplyRoles.includes(opt.code);
                return (
                  <label
                    key={opt.code}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-twin-lg border px-3 py-2 text-sm",
                      checked ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)]",
                      (unboundLoading || !unboundEnabled) && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <AdminSwitchScaled
                      size="sm"
                      checked={checked}
                      disabled={unboundLoading || !unboundEnabled}
                      onChange={(nextChecked) => {
                        setUnboundApplyRoles((prev) => {
                          if (nextChecked) {
                            return prev.includes(opt.code) ? prev : [...prev, opt.code];
                          }
                          const next = prev.filter((c) => c !== opt.code);
                          return next.length ? next : ["MEMBER"];
                        });
                      }}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="admin-form-field">
            <label className="admin-form-field-label">提示文案（富文本）</label>
            <div className="admin-rich-text-field">
              <RichTextEditor
                value={unboundText}
                onChange={setUnboundText}
                disabled={unboundLoading || !unboundEnabled}
              />
            </div>
            <p className="admin-form-field-hint">
              展示效果与「扫码弹窗公告」一致，支持插图与排版；历史纯文本配置仍可正常显示。
            </p>
          </div>
          <div className="admin-form-field">
            <label className="admin-form-field-label">提示附图（可选）</label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <AdminFilePickButton
                multiple
                disabled={unboundUploading || unboundLoading}
                onFiles={(files) => {
                  if (files?.length) void uploadUnboundImages(Array.from(files));
                }}
              />
              {unboundUploading ? <span className="text-xs text-[var(--twin-mute)]">上传中…</span> : null}
            </div>
            {unboundUrls.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {unboundUrls.map((u) => (
                  <div key={u} className="relative h-16 w-16 overflow-hidden rounded-twin-lg border border-[var(--twin-hairline)]">
                    <img src={u} alt="" className="h-full w-full object-cover" />
                    <AdminButton
                      type="button"
                      tone="destructive"
                      size="sm"
                      className="absolute right-0 top-0 h-6 min-h-0 rounded-none rounded-bl px-1.5 py-0 text-xs"
                      onClick={() => setUnboundUrls((prev) => prev.filter((x) => x !== u))}
                      aria-label="移除图片"
                    >
                      ×
                    </AdminButton>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="admin-form-actions">
            <AdminButton
              type="button"
              tone="primary"
              loading={unboundSaving}
              disabled={unboundLoading}
              onClick={() => void saveUnboundSettings()}
            >
              保存未绑卡提示
            </AdminButton>
          </div>
        </div>
      </AdminFormCard>
        </AdminTabPanel>

        <AdminTabPanel
          id="violation-page-panel-announcement"
          tabId="announcement"
          activeTab={activeTab}
          className="admin-violations-tab-panel"
        >
      <ScanPopupAnnouncementSection />
        </AdminTabPanel>

        <AdminTabPanel
          id="violation-page-panel-create"
          tabId="create"
          activeTab={activeTab}
          className="admin-violations-tab-panel"
        >
        <AdminFormCard
          title="✋ 手动新建"
          description="单人锁定或按课题组批量勾选成员；提交后扫码侧按每人最新 ACTIVE 展示。"
        >
          <div className="admin-violation-form-body">
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

          {lockMode === "single" ? (
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void handleSearchPersonnel(personKeyword);
                    }
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPersonKeyword(val);
                    if (personSearchTimer.current) {
                      window.clearTimeout(personSearchTimer.current);
                    }
                    personSearchTimer.current = window.setTimeout(() => {
                      void handleSearchPersonnel(val);
                    }, 250);
                  }}
                />
              </div>
              {searchUserResult.length > 0 && !picked ? (
                <div
                  className="absolute left-0 right-0 top-[5.5rem] z-20 max-h-[220px] overflow-y-auto overscroll-y-contain rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5 shadow-twin-level-3 ring-1 ring-black/[0.04]"
                  role="listbox"
                  aria-label="人员预检结果"
                >
                  {searchUserResult.map((rawPerson) => {
                    const rp = rawPerson as Record<string, unknown>;
                    const safeId = String(rp.user_id ?? rp.userid ?? rp.userId ?? rp.id ?? "").trim();
                    const safeName = String(rp.name ?? rp.username ?? "未知").trim() || safeId;
                    const safeGroup = String(rp.project_group_name ?? rp.projectgroupname ?? "无课题组");
                    const safeHead = rp.head ?? rp.avatar;
                    const headSrc = resolvePersonnelAvatarUrl(typeof safeHead === "string" ? safeHead : undefined);
                    return (
                    <button
                      key={safeId || safeName}
                      type="button"
                      className={adminPickableRowClass}
                      onClick={() => pickPersonFromHit(rp)}
                    >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]">
                          {headSrc ? (
                            <img src={headSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <User className="h-4 w-4 text-[var(--twin-mute)]" />
                          )}
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
              ) : null}
              {picked ? (
                <div className="flex items-center gap-3 rounded-twin-xl border border-indigo-200/80 bg-indigo-50/80 p-3 ring-1 ring-indigo-100/80">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-twin-level-1">
                    <Check className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-indigo-700">已锁定违规对象</div>
                    <div className="text-sm font-semibold text-indigo-950">
                      {picked.name}{" "}
                      <span className="ml-1 font-mono text-xs font-normal text-indigo-600">({picked.userId})</span>
                    </div>
                  </div>
                  <AdminButton type="button" tone="secondary" size="sm" className="shrink-0" onClick={clearPickedPerson}>
                    更换人员
                  </AdminButton>
                </div>
              ) : null}
            </div>
          ) : (
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void handleSearchProjectGroups(groupKeyword);
                    }
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGroupKeyword(val);
                    if (selectedGroup && val !== selectedGroup) {
                      setSelectedGroup(null);
                      setGroupMembers([]);
                      setBatchSelectedIds(new Set());
                    }
                    if (groupSearchTimer.current) {
                      window.clearTimeout(groupSearchTimer.current);
                    }
                    groupSearchTimer.current = window.setTimeout(() => {
                      void handleSearchProjectGroups(val);
                    }, 250);
                  }}
                />
              </div>
              {groupSuggestions.length > 0 && !selectedGroup ? (
                <div
                  className="absolute left-0 right-0 top-[5.5rem] z-20 max-h-[200px] overflow-y-auto overscroll-y-contain rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5 shadow-twin-level-3 ring-1 ring-black/[0.04]"
                  role="listbox"
                  aria-label="课题组检索结果"
                >
                  {groupSuggestions.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={cn(adminPickableRowClass, "px-3 py-2 text-sm font-medium text-[var(--twin-ink)]")}
                      onClick={() => pickProjectGroup(g)}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedGroup ? (
                <div className="flex items-center gap-3 rounded-twin-xl border border-indigo-200/80 bg-indigo-50/80 p-3 ring-1 ring-indigo-100/80">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-indigo-700">已选课题组</div>
                    <div className="text-sm font-semibold text-indigo-950">{selectedGroup}</div>
                    <div className="mt-0.5 text-xs text-indigo-600">
                      {groupMembersLoading
                        ? "正在加载成员…"
                        : `共 ${groupMembers.length} 人，已勾选 ${batchSelectedIds.size} 人`}
                    </div>
                  </div>
                  <AdminButton type="button" tone="secondary" size="sm" className="shrink-0" onClick={resetBatchGroup}>
                    更换课题组
                  </AdminButton>
                </div>
              ) : null}
              {selectedGroup && !groupMembersLoading && groupMembers.length > 0 ? (
                <div className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                    <span className="text-xs font-medium text-[var(--twin-body)]">课题组成员</span>
                    <div className="flex gap-2">
                      <AdminButton
                        type="button"
                        tone="secondary"
                        size="sm"
                        onClick={() => setBatchSelectedIds(new Set(groupMembers.map((m) => m.userId)))}
                      >
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        全选
                      </AdminButton>
                      <AdminButton
                        type="button"
                        tone="secondary"
                        size="sm"
                        onClick={() => setBatchSelectedIds(new Set())}
                      >
                        取消全选
                      </AdminButton>
                    </div>
                  </div>
                  <div className="max-h-[220px] space-y-1 overflow-y-auto overscroll-y-contain pr-1">
                    {groupMembers.map((m) => {
                      const checked = batchSelectedIds.has(m.userId);
                      const headSrc = resolvePersonnelAvatarUrl(m.head);
                      return (
                        <label
                          key={m.userId}
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 rounded-twin-lg border px-2.5 py-2 transition-colors",
                            checked ? "border-indigo-200 bg-[var(--twin-canvas)]" : "border-transparent bg-[var(--twin-canvas-soft)] hover:bg-[var(--twin-canvas)]"
                          )}
                        >
                          <AdminSwitchScaled
                            size="sm"
                            checked={checked}
                            onChange={(nextChecked) => toggleBatchMember(m.userId, nextChecked)}
                          />
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]">
                            {headSrc ? (
                              <img src={headSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <User className="h-3.5 w-3.5 text-[var(--twin-mute)]" />
                            )}
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
              ) : null}
              {selectedGroup && !groupMembersLoading && groupMembers.length === 0 ? (
                <p className="text-xs text-amber-800">该课题组下未找到有效成员（请确认档案库中 user_id 与课题组标注）。</p>
              ) : null}
            </div>
          )}

          {/* 选择触发规则 */}
          <div className="admin-form-field">
            <label className="admin-form-field-label">
              触发规则
            </label>
            <select
              className={inputBase}
              value={selectedRuleId ?? ""}
              onChange={(e) => setSelectedRuleId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">-- 不指定（默认手动规则） --</option>
              {violationRules.filter(r => r.enabled === 1).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.ruleName}
                </option>
              ))}
            </select>
            <p className="admin-form-field-hint">
              选择后将按该规则的解禁次数管控；不选则使用默认规则
            </p>
          </div>

          <div className="admin-form-field">
            <div className="flex items-center justify-between gap-2">
              <label className="admin-form-field-label">违规说明</label>
              <ViolationTemplateQuickSelect
                onSelect={(text) => setViolationText(text)}
                currentText={violationText}
              />
            </div>
            <div className="admin-rich-text-field">
              <RichTextEditor value={violationText} onChange={setViolationText} />
            </div>
            <p className="admin-form-field-hint">
              支持富文本与插图，展示效果与「扫码弹窗公告」一致；历史纯文本记录仍可正常显示。
            </p>
          </div>

          <div className="admin-form-field">
            <label className="admin-form-field-label">违规图片（可多选上传）</label>
            <div
              className="mt-1.5 rounded-twin-lg border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3 outline-none transition focus-within:border-[var(--twin-hairline-strong)] focus-within:ring-2 focus-within:ring-[#0070f3]/20"
              tabIndex={0}
              onPaste={onPasteNewViolationImages}
              aria-label="违规图片：选择文件或点击此处后 Ctrl+V 粘贴截图"
            >
              <p className="mb-2 text-[11px] leading-snug text-[var(--twin-mute)]">
                点击本区域使其获得焦点后，可用 <kbd className="rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1 font-mono text-[10px]">Ctrl</kbd>+
                <kbd className="rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1 font-mono text-[10px]">V</kbd> 粘贴剪贴板中的截图（与「选择图片」相同上传流程）。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <AdminFilePickButton multiple disabled={uploading} onFiles={(files) => void onFiles(files)} />
                {uploading ? <span className="text-xs text-[var(--twin-mute)]">上传中…</span> : null}
              </div>
            </div>
            {imageUrls.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {imageUrls.map((u) => (
                  <div key={u} className="relative h-16 w-16 overflow-hidden rounded-twin-lg border border-[var(--twin-hairline)]">
                    <img src={u} alt="" className="h-full w-full object-cover" />
                    <AdminButton
                      type="button"
                      tone="destructive"
                      size="sm"
                      className="absolute right-0 top-0 h-6 min-h-0 rounded-none rounded-bl px-1.5 py-0 text-xs"
                      onClick={() => setImageUrls((prev) => prev.filter((x) => x !== u))}
                      aria-label="移除图片"
                    >
                      ×
                    </AdminButton>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-[var(--twin-ink)]">
              <AdminSwitchScaled
                size="sm"
                checked={forbidEnter}
                onChange={(checked) => handleForbidEnterChange(checked, newInteractiveChallenge)}
              />
              立即禁止扫码进入
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--twin-ink)]">
              <AdminSwitchScaled
                size="sm"
                checked={showEvery}
                onChange={(checked) => setShowEvery(checked)}
              />
              每次扫码都提示违规内容
            </label>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-[var(--twin-body)]">
                🧩 交互式确认短语（留空=关闭；填写后将自动勾选禁入，验证后可解除）
              </label>
              <input
                className={cn(inputBase, "mt-1")}
                value={newInteractiveChallenge}
                onChange={(e) => handleNewInteractiveChallengeChange(e.target.value)}
                placeholder="如：一人一卡,严禁尾随"
              />
              {newInteractiveChallenge.trim() ? (
                <label className="mt-2 flex items-center gap-2 text-sm text-[var(--twin-ink)]">
                  <AdminSwitchScaled
                    size="sm"
                    checked={newInteractiveUnlockOnVerify}
                    onChange={(checked) => setNewInteractiveUnlockOnVerify(checked)}
                  />
                  验证完成后自动解除禁入
                </label>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--twin-body)]">可以「进入」次数上限（留空=不限制）</label>
              <input
                className={cn(inputBase, "mt-1")}
                inputMode="numeric"
                value={maxEnter}
                onChange={(e) => setMaxEnter(e.target.value)}
                placeholder="例如 3"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--twin-body)]">封禁天数计时（留空=不计时）</label>
              <input
                className={cn(inputBase, "mt-1")}
                inputMode="numeric"
                value={expireDays}
                onChange={(e) => setExpireDays(e.target.value)}
                placeholder="例如 7"
              />
            </div>
          </div>

          <hr className="admin-form-divider" />
          <div className="admin-form-actions">
            <AdminButton
              type="button"
              tone="primary"
              size="lg"
              loading={saving}
              disabled={!canSubmit}
              className="min-w-[10rem]"
              onClick={() => void submit()}
            >
              {lockMode === "batch" ? `批量提交（${batchSelectedIds.size} 人）` : "提交违规记录"}
            </AdminButton>
          </div>
          </div>
        </AdminFormCard>

        {/* ---- Auto-stranded config ---- */}
        <AdminFormCard
          title="🤖 每日自动滞留检测（一道·违规公告）"
          description="每日定时检测未豁免且仍在楼内的滞留人员，自动创建违规记录并通过扫码公告通知。执行时刻请在「定时管理 → 冻结联动任务 → 滞留·未豁免人员自动违规（一道）」配置。"
        >
          {strandedConfigLoading ? (
            <p className="text-sm text-[var(--twin-mute)]">加载配置中…</p>
          ) : (
            <div className="admin-violation-form-body">
              {/* Auto signout */}
              <label className="flex items-center gap-2 text-sm">
                <AdminSwitchScaled
                  size="sm"
                  checked={strandedAutoSignout}
                  onChange={(checked) => setStrandedAutoSignout(checked)}
                />
                同时执行签退操作（帮助滞留人员离开）
              </label>

              {/* Violation text template */}
              <div className="admin-form-field">
                <div className="flex items-center justify-between gap-2">
                  <label className="admin-form-field-label">
                    违规文案模板（富文本）
                  </label>
                  <ViolationTemplateQuickSelect
                    onSelect={(text) => setStrandedViolationTpl(text)}
                    currentText={strandedViolationTpl}
                  />
                </div>
                <div className="admin-rich-text-field">
                  <RichTextEditor
                    value={strandedViolationTpl}
                    onChange={setStrandedViolationTpl}
                    disabled={strandedConfigLoading}
                  />
                </div>
                <p className="admin-form-field-hint">
                  支持富文本与插图，展示效果与「扫码弹窗公告」一致；可用变量：{'${name}'}、{'${dept}'}、{'${date}'}（留空则使用系统默认文案）。
                </p>
              </div>

              {/* Forbid enter + expire */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <AdminSwitchScaled
                    size="sm"
                    checked={strandedForbidEnter}
                    onChange={(checked) => setStrandedForbidEnter(checked)}
                  />
                  立即禁止扫码进入
                </label>
                <div>
                  <label className="text-xs font-medium text-[var(--twin-body)]">
                    自动过期天数
                  </label>
                  <input className={cn(inputBase, "mt-1")} type="number" min="1"
                    value={strandedExpireDays} onChange={(e) => setStrandedExpireDays(e.target.value)}
 />
                </div>
              </div>

              {/* Whitelist departments */}
              <div>
                <label className="text-xs font-medium text-[var(--twin-body)]">
                  白名单部门（不触发自动违规）
                </label>
                <div className="mt-1.5">
                  <DepartmentMultiSelect
                    selected={strandedWhitelistDepts}
                    onChange={setStrandedWhitelistDepts}
                  />
                </div>
              </div>

              {/* Interactive challenge config */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <AdminSwitchScaled
                    size="sm"
                    checked={interactiveChallengeEnabled}
                    onChange={(checked) => setInteractiveChallengeEnabled(checked)}
                  />
                  🧩 启用交互式违规确认
                </label>
                {interactiveChallengeEnabled && (
                  <div>
                    <label className="text-xs font-medium text-[var(--twin-body)]">
                      拼图目标短语（按字拆分卡片，随机排列）
                    </label>
                    <input
                      className={cn(inputBase, "mt-1.5")}
                      value={interactiveChallengePhrase}
                      onChange={(e) => setInteractiveChallengePhrase(e.target.value)}
                      placeholder="一人一卡,严禁尾随"
                    />
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <AdminSwitchScaled
                        size="sm"
                        checked={strandedInteractiveUnlockOnVerify}
                        onChange={(checked) => setStrandedInteractiveUnlockOnVerify(checked)}
                      />
                      验证完成后自动解除禁入
                    </label>
                  </div>
                )}
              </div>

              {/* Save button */}
              <div className="admin-form-actions">
                <AdminButton type="button" tone="primary" loading={strandedConfigSaving}
                  className="gap-1.5" onClick={() => { saveStrandedConfig(); }}>
                  <Save className="h-4 w-4" />保存配置
                </AdminButton>
              </div>
            </div>
          )}
        </AdminFormCard>

        <AdminFormCard
          title="🤖 每日自动滞留检测（二道·仅签退）"
          description="与一道检测口径相同（未豁免且仍在楼内），仅执行签退，不创建违规、不涉及禁入或交互式确认。执行时刻请在「定时管理 → 冻结联动任务 → 滞留·未豁免人员自动签退（二道）」配置；部门白名单与一道共用。"
        >
          {strandedSignout2Loading ? (
            <p className="text-sm text-[var(--twin-mute)]">加载配置中…</p>
          ) : (
            <div className="admin-violation-form-body">
              <label className="flex items-center gap-2 text-sm">
                <AdminSwitchScaled
                  size="sm"
                  checked={strandedSignout2Enabled}
                  onChange={(checked) => setStrandedSignout2Enabled(checked)}
                />
                执行签退操作（帮助滞留人员离开）
              </label>
              {strandedSignout2LastResult ? (
                <p className="text-xs text-[var(--twin-mute)]">
                  上次执行：{strandedSignout2LastResult}
                </p>
              ) : null}
              <div className="admin-form-actions">
                <AdminButton
                  type="button"
                  tone="primary"
                  loading={strandedSignout2Saving}
                  className="gap-1.5"
                  onClick={() => { void saveStrandedSignoutConfig(); }}
                >
                  <Save className="h-4 w-4" />
                  保存配置
                </AdminButton>
              </div>
            </div>
          )}
        </AdminFormCard>

        {/* ---- Test section ---- */}
        <AdminFormCard
          title="🧪 手动测试"
          description="对指定人员单独执行滞留检测，验证配置是否正确。"
        >
          <div className="admin-violation-form-body">
            {testPickedUser ? (
              <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <Check className="h-4 w-4 text-indigo-600" />
                <div className="flex-1">
                  <span className="text-sm font-semibold">{testPickedUser.name}</span>
                  <span className="ml-2 font-mono text-xs text-indigo-500">({testPickedUser.userId})</span>
                </div>
                <AdminButton type="button" tone="secondary" size="sm"
                  onClick={() => setTestPickedUser(null)}>更换</AdminButton>
              </div>
            ) : (
              <div className="relative space-y-2">
                <input
                  type="text"
                  className={cn(inputBase)}
                  placeholder="输入姓名或工号检索人员…"
                  value={testPersonKeyword}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void handleTestSearchPersonnel(testPersonKeyword);
                    }
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTestPersonKeyword(val);
                    if (testSearchTimer.current) {
                      window.clearTimeout(testSearchTimer.current);
                    }
                    testSearchTimer.current = window.setTimeout(() => {
                      void handleTestSearchPersonnel(val);
                    }, 250);
                  }}
                />
                {testSearchResult.length > 0 && !testPickedUser ? (
                  <div
                    className="absolute left-0 right-0 top-[2.8rem] z-20 max-h-[220px] overflow-y-auto overscroll-y-contain rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5 shadow-twin-level-3 ring-1 ring-black/[0.04]"
                    role="listbox"
                    aria-label="测试人员预检结果"
                  >
                    {testSearchResult.map((rawPerson) => {
                      const rp = rawPerson as Record<string, unknown>;
                      const safeId = String(rp.user_id ?? rp.userid ?? rp.userId ?? rp.id ?? "").trim();
                      const safeName = String(rp.name ?? rp.username ?? "未知").trim() || safeId;
                      return (
                      <button
                        key={safeId || safeName}
                        type="button"
                        className={adminPickableRowClass}
                        onClick={() => {
                          setTestPickedUser({ userId: safeId, name: safeName });
                          setTestPersonKeyword(`${safeName} (${safeId})`);
                          setTestSearchResult([]);
                        }}
                      >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]">
                            <User className="h-4 w-4 text-[var(--twin-mute)]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-semibold text-[var(--twin-ink)]">{safeName}</span>
                              <span className="shrink-0 font-mono text-[10px] text-[var(--twin-mute)]">{safeId}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <AdminSwitchScaled
                size="sm"
                checked={testSignout}
                onChange={(checked) => setTestSignout(checked)}
              />
              同时执行签退
            </label>

            <div className="admin-form-actions">
              <AdminButton type="button" tone="primary" loading={testRunning}
                disabled={!testPickedUser}
                className="gap-1.5" onClick={() => { runTestOnUser(); }}>
                <Beaker className="h-4 w-4" />对该人员执行检测
              </AdminButton>
            </div>
          </div>
        </AdminFormCard>
        </AdminTabPanel>

        <AdminTabPanel
          id="violation-page-panel-records"
          tabId="records"
          activeTab={activeTab}
          className="admin-violations-tab-panel"
        >
          <p className="admin-form-field-hint">
            {picked
              ? `当前筛选：「${picked.name}」的最近 400 条（在「新建违规」页锁定人员后生效）`
              : "显示全员最近 400 条；扫码与大屏仅取每人最新「生效中」记录。「已被覆盖」为同一人再次新建时系统自动归档的旧记录。"}
          </p>
          <AdminTableShell
            loading={isLoading}
            empty={!isLoading && rows.length === 0}
            emptyMessage="暂无违规记录"
            onRetry={() => qc.invalidateQueries({ queryKey: violationsQueryKey })}
            scrollable
          >
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">ID</th>
                  <th className="px-3 py-2">人员</th>
                  <th className="whitespace-nowrap px-3 py-2">规则</th>
                  <th className="whitespace-nowrap px-3 py-2">状态</th>
                  <th className="whitespace-nowrap px-3 py-2">来源</th>
                  <th className="whitespace-nowrap px-3 py-2" title="创建时勾选的「立即禁止扫码进入」开关">
                    立即禁入
                  </th>
                  <th className="whitespace-nowrap px-3 py-2" title="当前扫码是否被禁止进入（含交互确认、次数上限）">
                    当前禁入
                  </th>
                  <th className="whitespace-nowrap px-3 py-2">进入计数</th>
                  <th className="whitespace-nowrap px-3 py-2">到期</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const imgs = parseRowImageUrls(r);
                  const st = violationStatusLabel(r.status);
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-2 font-mono text-xs text-[var(--twin-body)]">{r.id}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-[var(--twin-ink)]">{personDisplayName(r)}</div>
                        <div className="mt-1 line-clamp-2 max-w-[240px] text-xs text-[var(--twin-body)]">
                          {richTextPlainPreview(r.violationText || "", 120) || "—"}
                        </div>
                        {imgs.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {imgs.slice(0, 3).map((u) => (
                              <img key={u} src={u} alt="" className="h-10 w-10 rounded-twin-md border border-[var(--twin-hairline)] object-cover" />
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--twin-body)]">
                        {r.ruleName || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className={st.className} title={st.hint}>
                          {VIOLATION_STATUS_LABEL[r.status as keyof typeof VIOLATION_STATUS_LABEL] || st.text}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.source === "AUTO_STRANDED" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            🤖 自动·滞留检测
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                            ✋ 手动
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {violationImmediateForbidEnter(r.forbidEnter) ? "是" : "否"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {violationEnterLocked(r) ? "是" : "否"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.maxEnterSuccess != null ? `${r.enterSuccessCount ?? 0}/${r.maxEnterSuccess}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--twin-body)]">{r.expireAt ? String(r.expireAt).slice(0, 16) : "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <AdminButton type="button" tone="secondary" size="sm" className="gap-1" onClick={() => openEdit(r)}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                            编辑
                          </AdminButton>
                          {r.status === "ACTIVE" ? (
                            <AdminButton
                              type="button"
                              tone="secondary"
                              size="sm"
                              className="gap-1 text-emerald-900"
                              onClick={() => void onClear(r.id)}
                            >
                              <Ban className="h-3.5 w-3.5" aria-hidden />
                              解除
                            </AdminButton>
                          ) : null}
                          <AdminButton type="button" tone="destructive" size="sm" className="gap-1" onClick={() => void onDeleteRow(r)}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            删除
                          </AdminButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AdminTableShell>
        </AdminTabPanel>

        <AdminTabPanel
          id="violation-page-panel-swipe-alert"
          tabId="swipe-alert"
          activeTab={activeTab}
          className="admin-violations-tab-panel"
        >
          <SwipeAlertRuleList
            onEdit={setEditingSwipeRule}
            refreshKey={swipeAlertRefreshKey}
          />
          <SwipeAlertRuleForm
            editing={editingSwipeRule}
            onSaved={() => {
              setEditingSwipeRule(null);
              setSwipeAlertRefreshKey((k) => k + 1);
            }}
            onCancel={() => setEditingSwipeRule(null)}
          />
        </AdminTabPanel>

        <AdminTabPanel
          id="violation-page-panel-rules"
          tabId="rules"
          activeTab={activeTab}
          className="admin-violations-tab-panel"
        >
          <ViolationRuleManager />
        </AdminTabPanel>

        <AdminTabPanel
          id="violation-page-panel-homepage-content"
          tabId="homepage-content"
          activeTab={activeTab}
          className="admin-violations-tab-panel"
        >
          <HomepageContentTab />
        </AdminTabPanel>
      </div>

      {editOpen && editId != null ? (
        <Portal>
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => !savingEdit && setEditOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-4 ring-1 ring-black/[0.04]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-violation-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--twin-hairline)] px-5 py-4">
              <div className="min-w-0">
                <h4 id="edit-violation-title" className="text-base font-semibold tracking-tight text-[var(--twin-ink)]">
                  编辑违规 #{editId}
                </h4>
                <p className="mt-1 text-xs text-[var(--twin-mute)]">人员 {editTargetLabel}</p>
              </div>
              <AdminButton
                type="button"
                tone="ghost"
                size="sm"
                className="shrink-0 rounded-full p-2"
                disabled={savingEdit}
                onClick={() => setEditOpen(false)}
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </AdminButton>
            </div>
            <div className="admin-violation-edit-dialog-body px-5 py-4">
              <div className="admin-form-field">
                <div className="flex items-center justify-between gap-2">
                  <label className="admin-form-field-label">违规说明</label>
                  <ViolationTemplateQuickSelect
                    onSelect={(text) => setEditText(text)}
                    currentText={editText}
                  />
                </div>
                <div className="admin-rich-text-field">
                  <RichTextEditor key={editId} value={editText} onChange={setEditText} />
                </div>
                <p className="admin-form-field-hint">
                  支持富文本与插图；可用变量：{'${name}'}、{'${dept}'}、{'${date}'}（扫码展示时按当事人自动替换）。
                </p>
              </div>
              <div className="admin-form-field">
                <label className="admin-form-field-label">图片</label>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <AdminFilePickButton
                    multiple
                    disabled={editUploading}
                    onFiles={(files) => void onEditFiles(files)}
                  >
                    添加图片
                  </AdminFilePickButton>
                  {editUploading ? <span className="text-xs text-[var(--twin-mute)]">上传中…</span> : null}
                </div>
                {editUrls.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {editUrls.map((u) => (
                      <div key={u} className="relative h-14 w-14 overflow-hidden rounded-twin-lg border border-[var(--twin-hairline)]">
                        <img src={u} alt="" className="h-full w-full object-cover" />
                        <AdminButton
                          type="button"
                          tone="destructive"
                          size="sm"
                          className="absolute right-0 top-0 h-6 min-h-0 rounded-none rounded-bl px-1.5 py-0 text-xs"
                          onClick={() => setEditUrls((prev) => prev.filter((x) => x !== u))}
                          aria-label="移除图片"
                        >
                          ×
                        </AdminButton>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--twin-ink)]">
                <AdminSwitchScaled
                  size="sm"
                  checked={editForbid}
                  onChange={(checked) => handleEditForbidChange(checked)}
                />
                立即禁止扫码进入
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--twin-ink)]">
                <AdminSwitchScaled
                  size="sm"
                  checked={editShowEvery}
                  onChange={(checked) => setEditShowEvery(checked)}
                />
                每次扫码都提示违规内容
              </label>
              <div>
                <label className="text-xs font-medium text-[var(--twin-body)]">
                  🧩 交互式确认短语（留空=关闭；填写后将自动勾选禁入，验证后可解除）
                </label>
                <input
                  className={cn(inputBase, "mt-1")}
                  value={editInteractiveChallenge}
                  onChange={(e) => handleEditInteractiveChallengeChange(e.target.value)}
                  placeholder="如：一人一卡,严禁尾随"
                />
                {editInteractiveChallenge.trim() ? (
                  <label className="mt-2 flex items-center gap-2 text-sm text-[var(--twin-ink)]">
                    <AdminSwitchScaled
                      size="sm"
                      checked={editInteractiveUnlockOnVerify}
                      onChange={(checked) => setEditInteractiveUnlockOnVerify(checked)}
                    />
                    验证完成后自动解除禁入
                  </label>
                ) : null}
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--twin-body)]">进入次数上限（留空=不限制）</label>
                <input className={cn(inputBase, "mt-1")} inputMode="numeric" value={editMax} onChange={(e) => setEditMax(e.target.value)} />
              </div>
              <fieldset className="space-y-2 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
                <legend className="px-1 text-xs font-medium text-[var(--twin-body)]">到期时间</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="em" checked={editExpireMode === "KEEP"} onChange={() => setEditExpireMode("KEEP")} />
                  保持不变
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="em" checked={editExpireMode === "CLEAR"} onChange={() => setEditExpireMode("CLEAR")} />
                  清除到期（永不过期）
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="em" checked={editExpireMode === "RELATIVE"} onChange={() => setEditExpireMode("RELATIVE")} />
                  从当前时刻重新起算天数
                </label>
                {editExpireMode === "RELATIVE" ? (
                  <input
                    className={inputBase}
                    inputMode="numeric"
                    placeholder="天数，如 7"
                    value={editExpireDays}
                    onChange={(e) => setEditExpireDays(e.target.value)}
                  />
                ) : null}
              </fieldset>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--twin-hairline)] px-5 py-4">
              <AdminButton type="button" tone="secondary" disabled={savingEdit} onClick={() => setEditOpen(false)}>
                取消
              </AdminButton>
              <AdminButton type="button" tone="primary" loading={savingEdit} onClick={() => void saveEdit()}>
                保存修改
              </AdminButton>
            </div>
          </div>
        </div>
        </Portal>
      ) : null}
    </AdminPageShell>
  );
}
