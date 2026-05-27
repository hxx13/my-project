import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Ban,
  Bell,
  Check,
  CheckCircle2,
  CreditCard,
  Pencil,
  RefreshCw,
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
  markStudentViolationProcessed,
  saveUnboundCardNoticeSettings,
  searchViolationProjectGroups,
  UNBOUND_APPLY_ROLE_OPTIONS,
  updateStudentViolation,
  type StudentViolationRow,
  type UnboundApplyRoleCode,
} from "@/api/domains/studentViolation.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { searchPersonnel } from "@/api/twinApi";
import { AdminButton, adminPickableRowClass } from "@/components/admin/AdminButton";
import { AdminFilePickButton } from "@/components/admin/AdminFilePickButton";
import { AdminPageTabs, AdminTabPanel } from "@/components/admin/AdminPageTabs";
import { AdminSegmentedControl } from "@/components/admin/AdminSegmentedControl";
import { AdminFormCard, AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";
import { ScanPopupAnnouncementSection } from "@/features/admin/ScanPopupAnnouncementSection";
import {
  SCAN_OPERATOR_ROLE_HINT_UNBOUND,
  SCAN_OPERATOR_ROLE_LABEL,
} from "@/features/admin/scanOperatorRoleHint";
import { normalizePersonnelRecord, type PersonnelRecordView } from "@/utils/personnelRecord";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";

type PickUser = { userId: string; name: string };
type LockMode = "single" | "batch";
type PageTabId = "unbound" | "announcement" | "create" | "records";

const PAGE_TABS: { id: PageTabId; label: string; icon: ReactNode }[] = [
  { id: "unbound", label: "未绑卡提示", icon: <CreditCard className="h-4 w-4 text-slate-500" aria-hidden /> },
  { id: "announcement", label: "扫码弹窗公告", icon: <Bell className="h-4 w-4 text-slate-500" aria-hidden /> },
  { id: "create", label: "新建违规", icon: <UserPlus className="h-4 w-4 text-slate-500" aria-hidden /> },
  { id: "records", label: "违规记录", icon: <ShieldAlert className="h-4 w-4 text-slate-500" aria-hidden /> },
];

const LOCK_MODE_OPTIONS: { value: LockMode; label: string }[] = [
  { value: "single", label: "单人锁定" },
  { value: "batch", label: "课题组批量" },
];

const inputBase =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus-visible:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[color:var(--admin-focus-ring)]/40";

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

/** 违规记录状态中文（库内仍存英文枚举） */
function violationStatusLabel(status: string | undefined): { text: string; hint?: string; className: string } {
  switch (status) {
    case "ACTIVE":
      return {
        text: "生效中",
        hint: "扫码弹窗与大屏公示均可能展示",
        className: "font-medium text-rose-700",
      };
    case "SUPERSEDED":
      return {
        text: "已被覆盖",
        hint: "同一人新建违规时，旧记录由系统自动归档；仅留档，不再生效",
        className: "text-amber-800",
      };
    case "CLEARED":
      return {
        text: "已解除",
        hint: "管理员手动「解除」",
        className: "text-emerald-800",
      };
    case "PROCESSED":
      return {
        text: "已处理",
        hint: "管理员标记「已处理」，扫码不再弹窗",
        className: "text-slate-700",
      };
    case "EXPIRED":
      return {
        text: "已过期",
        hint: "超过到期时间，系统自动失效",
        className: "text-neutral-500",
      };
    default:
      return { text: status || "—", className: "text-neutral-600" };
  }
}

function parsePageTab(raw: string | null): PageTabId {
  if (raw === "unbound" || raw === "announcement" || raw === "create" || raw === "records") return raw;
  return "unbound";
}

export default function AdminStudentViolationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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

  const [rows, setRows] = useState<StudentViolationRow[]>([]);
  const [loading, setLoading] = useState(false);
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
  const [maxEnter, setMaxEnter] = useState("");
  const [showEvery, setShowEvery] = useState(true);
  const [expireDays, setExpireDays] = useState("");
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
  const [editUploading, setEditUploading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [unboundEnabled, setUnboundEnabled] = useState(true);
  const [unboundShowEvery, setUnboundShowEvery] = useState(true);
  const [unboundForbidEnter, setUnboundForbidEnter] = useState(false);
  const [unboundApplyRoles, setUnboundApplyRoles] = useState<UnboundApplyRoleCode[]>(["STUDENT"]);
  const [unboundText, setUnboundText] = useState("");
  const [unboundUrls, setUnboundUrls] = useState<string[]>([]);
  const [unboundUploading, setUnboundUploading] = useState(false);
  const [unboundLoading, setUnboundLoading] = useState(false);
  const [unboundSaving, setUnboundSaving] = useState(false);

  const loadUnboundSettings = useCallback(async () => {
    setUnboundLoading(true);
    try {
      const s = await getUnboundCardNoticeSettings();
      setUnboundEnabled(s.enabled);
      setUnboundShowEvery(s.showNoticeEveryScan);
      setUnboundForbidEnter(Boolean(s.forbidEnter));
      setUnboundApplyRoles(s.applyRoleCodes ?? ["STUDENT"]);
      setUnboundText(s.violationText ?? "");
      setUnboundUrls(s.imageUrls ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "未绑卡提示配置加载失败");
    } finally {
      setUnboundLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listStudentViolations({
        targetUserId: picked?.userId || undefined,
        limit: 400,
      });
      setRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [picked?.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadUnboundSettings();
  }, [loadUnboundSettings]);

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
        urls.push(await uploadSingleImage(f));
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
      setUnboundApplyRoles(saved.applyRoleCodes ?? ["STUDENT"]);
      setUnboundText(saved.violationText ?? "");
      setUnboundUrls(saved.imageUrls ?? []);
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
      const list = await searchPersonnel(q);
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
        urls.push(await uploadSingleImage(f));
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

  const resetViolationForm = () => {
    setViolationText("");
    setImageUrls([]);
    setMaxEnter("");
    setExpireDays("");
    setForbidEnter(false);
    setShowEvery(true);
  };

  const submit = async () => {
    if (lockMode === "single") {
      if (!picked) {
        toast.error("请先选择人员");
        return;
      }
      setSaving(true);
      try {
        await createStudentViolation({
          targetUserId: picked.userId,
          violationText: violationText.trim(),
          imageUrls,
          forbidEnter,
          maxEnterSuccess: maxEnterParsed,
          showNoticeEveryScan: showEvery,
          expireAfterDays: expireDaysParsed,
        });
        toast.success("已保存违规记录");
        clearPickedPerson();
        resetViolationForm();
        // 新建会影响多条 ACTIVE/SUPERSEDED 关系，需全量对齐列表
        await load();
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
      const summary = await batchCreateStudentViolations({
        targetUserIds: ids,
        violationText: violationText.trim(),
        imageUrls,
        forbidEnter,
        maxEnterSuccess: maxEnterParsed,
        showNoticeEveryScan: showEvery,
        expireAfterDays: expireDaysParsed,
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
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量保存失败");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    lockMode === "single" ? Boolean(picked) : Boolean(selectedGroup) && batchSelectedIds.size > 0;

  const onClear = async (id: number) => {
    if (!window.confirm("确认解除该条违规？")) return;
    try {
      await clearStudentViolation(id);
      toast.success("已解除");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "解除失败");
    }
  };

  const openEdit = (r: StudentViolationRow) => {
    setEditId(r.id);
    setEditTargetLabel(personDisplayName(r));
    setEditText(r.violationText || "");
    setEditUrls(parseRowImageUrls(r));
    setEditForbid(Boolean(r.forbidEnter));
    setEditMax(r.maxEnterSuccess != null && r.maxEnterSuccess !== undefined ? String(r.maxEnterSuccess) : "");
    setEditShowEvery(r.showNoticeEveryScan !== 0);
    setEditExpireMode("KEEP");
    setEditExpireDays("");
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
        urls.push(await uploadSingleImage(f));
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
      const updated = await updateStudentViolation(editId, {
        violationText: editText.trim(),
        imageUrls: editUrls,
        forbidEnter: editForbid,
        maxEnterSuccess: editMaxParsed,
        showNoticeEveryScan: editShowEvery,
        expireMode: editExpireMode,
        expireAfterDays: editExpireMode === "RELATIVE" ? editExpireDaysParsed : null,
      });
      toast.success("已保存修改");
      setEditOpen(false);
      setEditId(null);
      // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
      if (updated) {
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      } else {
        await load();
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
      // 删除后仅从列表移除该行，禁止整表 load（post-save-no-full-refresh.mdc）
      setRows((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const onMarkProcessed = async (id: number) => {
    if (!window.confirm("标记为「已处理」后，该条将不再在扫码弹窗展示，记录仍保留。确定？")) return;
    try {
      await markStudentViolationProcessed(id);
      toast.success("已标记处理");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  };

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
            loading={loading}
            onClick={() => void load()}
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
          className="space-y-4"
        >
      <AdminFormCard
        title="未绑卡扫码提示"
        description="扫描到尚未绑定物理卡的人员时展示警示；按当前网页登录人员的 sys_user 角色决定是否生效（与被扫人员身份无关）。"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300"
                checked={unboundEnabled}
                disabled={unboundLoading}
                onChange={(e) => setUnboundEnabled(e.target.checked)}
              />
              启用未绑卡提示
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300"
                checked={unboundShowEvery}
                disabled={unboundLoading}
                onChange={(e) => setUnboundShowEvery(e.target.checked)}
              />
              每次扫码都自动展开提示
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300"
                checked={unboundForbidEnter}
                disabled={unboundLoading || !unboundEnabled}
                onChange={(e) => setUnboundForbidEnter(e.target.checked)}
              />
              禁止扫码进入（未绑卡时，离开不受影响）
            </label>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600">{SCAN_OPERATOR_ROLE_LABEL}</label>
            <p className="mt-0.5 text-[11px] text-neutral-500">{SCAN_OPERATOR_ROLE_HINT_UNBOUND}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {UNBOUND_APPLY_ROLE_OPTIONS.map((opt) => {
                const checked = unboundApplyRoles.includes(opt.code);
                return (
                  <label
                    key={opt.code}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                      checked ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "border-neutral-200 bg-white text-neutral-700",
                      (unboundLoading || !unboundEnabled) && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-300"
                      checked={checked}
                      disabled={unboundLoading || !unboundEnabled}
                      onChange={(e) => {
                        setUnboundApplyRoles((prev) => {
                          if (e.target.checked) {
                            return prev.includes(opt.code) ? prev : [...prev, opt.code];
                          }
                          const next = prev.filter((c) => c !== opt.code);
                          return next.length ? next : ["STUDENT"];
                        });
                      }}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600">提示文案</label>
            <textarea
              className={cn(inputBase, "mt-1.5 min-h-[88px] resize-y")}
              value={unboundText}
              disabled={unboundLoading}
              onChange={(e) => setUnboundText(e.target.value)}
              placeholder="例如：您尚未绑定校园卡，请先完成绑卡…"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600">提示附图（可选）</label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <AdminFilePickButton
                multiple
                disabled={unboundUploading || unboundLoading}
                onFiles={(files) => {
                  if (files?.length) void uploadUnboundImages(Array.from(files));
                }}
              />
              {unboundUploading ? <span className="text-xs text-neutral-500">上传中…</span> : null}
            </div>
            {unboundUrls.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {unboundUrls.map((u) => (
                  <div key={u} className="relative h-16 w-16 overflow-hidden rounded-lg border border-neutral-200">
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
      </AdminFormCard>
        </AdminTabPanel>

        <AdminTabPanel
          id="violation-page-panel-announcement"
          tabId="announcement"
          activeTab={activeTab}
          className="space-y-4"
        >
      <ScanPopupAnnouncementSection />
        </AdminTabPanel>

        <AdminTabPanel
          id="violation-page-panel-create"
          tabId="create"
          activeTab={activeTab}
        >
        <AdminFormCard
          title="新建违规"
          description="单人锁定或按课题组批量勾选成员；提交后扫码侧按每人最新 ACTIVE 展示。"
        >
          <div className="mb-4">
            <label className="text-xs font-medium text-neutral-600">锁定方式</label>
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
                <label className="text-xs font-medium text-neutral-600">检索人员</label>
                <p className="mt-0.5 text-[11px] text-neutral-500">键入自动预检，可回车；选中后锁定对象。</p>
                <input
                  type="text"
                  disabled={Boolean(picked)}
                  className={cn(inputBase, "mt-1.5 disabled:bg-neutral-50 disabled:text-neutral-500")}
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
                  className="absolute left-0 right-0 top-[5.5rem] z-20 max-h-[220px] overflow-y-auto overscroll-y-contain rounded-xl border border-neutral-200/90 bg-white p-1.5 shadow-lg ring-1 ring-black/[0.04]"
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
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-50">
                          {headSrc ? (
                            <img src={headSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <User className="h-4 w-4 text-neutral-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-neutral-900">{safeName}</span>
                            <span className="shrink-0 font-mono text-[10px] text-neutral-500">{safeId}</span>
                          </div>
                          <div className="mt-0.5 truncate text-xs text-neutral-500">{safeGroup}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {picked ? (
                <div className="flex items-center gap-3 rounded-xl border border-indigo-200/80 bg-indigo-50/80 p-3 ring-1 ring-indigo-100/80">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm">
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
                <label className="text-xs font-medium text-neutral-600">检索课题组</label>
                <p className="mt-0.5 text-[11px] text-neutral-500">数据来自人员档案库；选中课题组后可勾选该组下成员批量锁定。</p>
                <input
                  type="text"
                  disabled={Boolean(selectedGroup)}
                  className={cn(inputBase, "mt-1.5 disabled:bg-neutral-50 disabled:text-neutral-500")}
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
                  className="absolute left-0 right-0 top-[5.5rem] z-20 max-h-[200px] overflow-y-auto overscroll-y-contain rounded-xl border border-neutral-200/90 bg-white p-1.5 shadow-lg ring-1 ring-black/[0.04]"
                  role="listbox"
                  aria-label="课题组检索结果"
                >
                  {groupSuggestions.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={cn(adminPickableRowClass, "px-3 py-2 text-sm font-medium text-neutral-900")}
                      onClick={() => pickProjectGroup(g)}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedGroup ? (
                <div className="flex items-center gap-3 rounded-xl border border-indigo-200/80 bg-indigo-50/80 p-3 ring-1 ring-indigo-100/80">
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
                <div className="rounded-xl border border-neutral-200/90 bg-neutral-50/50 p-2">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                    <span className="text-xs font-medium text-neutral-600">课题组成员</span>
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
                            "flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
                            checked ? "border-indigo-200 bg-white" : "border-transparent bg-white/60 hover:bg-white"
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 rounded border-neutral-300"
                            checked={checked}
                            onChange={(e) => toggleBatchMember(m.userId, e.target.checked)}
                          />
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-50">
                            {headSrc ? (
                              <img src={headSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <User className="h-3.5 w-3.5 text-neutral-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-neutral-900">{m.name}</div>
                            <div className="font-mono text-[10px] text-neutral-500">{m.userId}</div>
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

          <div>
            <label className="text-xs font-medium text-neutral-600">违规说明</label>
            <textarea
              className={cn(inputBase, "mt-1.5 min-h-[100px] resize-y")}
              value={violationText}
              onChange={(e) => setViolationText(e.target.value)}
              placeholder="违规内容，将展示在扫码弹窗"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-600">违规图片（可多选上传）</label>
            <div
              className="mt-1.5 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/80 p-3 outline-none transition focus-within:border-neutral-300 focus-within:ring-2 focus-within:ring-[#0070f3]/20"
              tabIndex={0}
              onPaste={onPasteNewViolationImages}
              aria-label="违规图片：选择文件或点击此处后 Ctrl+V 粘贴截图"
            >
              <p className="mb-2 text-[11px] leading-snug text-neutral-500">
                点击本区域使其获得焦点后，可用 <kbd className="rounded border border-neutral-200 bg-white px-1 font-mono text-[10px]">Ctrl</kbd>+
                <kbd className="rounded border border-neutral-200 bg-white px-1 font-mono text-[10px]">V</kbd> 粘贴剪贴板中的截图（与「选择图片」相同上传流程）。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <AdminFilePickButton multiple disabled={uploading} onFiles={(files) => void onFiles(files)} />
                {uploading ? <span className="text-xs text-neutral-500">上传中…</span> : null}
              </div>
            </div>
            {imageUrls.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {imageUrls.map((u) => (
                  <div key={u} className="relative h-16 w-16 overflow-hidden rounded-lg border border-neutral-200">
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
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25"
                checked={forbidEnter}
                onChange={(e) => setForbidEnter(e.target.checked)}
              />
              立即禁止扫码进入
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25"
                checked={showEvery}
                onChange={(e) => setShowEvery(e.target.checked)}
              />
              每次扫码都提示违规内容
            </label>
            <div>
              <label className="text-xs font-medium text-neutral-600">可以「进入」次数上限（留空=不限制）</label>
              <input
                className={cn(inputBase, "mt-1")}
                inputMode="numeric"
                value={maxEnter}
                onChange={(e) => setMaxEnter(e.target.value)}
                placeholder="例如 3"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600">封禁天数计时（留空=不计时）</label>
              <input
                className={cn(inputBase, "mt-1")}
                inputMode="numeric"
                value={expireDays}
                onChange={(e) => setExpireDays(e.target.value)}
                placeholder="例如 7"
              />
            </div>
          </div>

          <div className="border-t border-neutral-100 pt-4">
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
        </AdminFormCard>
        </AdminTabPanel>

        <AdminTabPanel
          id="violation-page-panel-records"
          tabId="records"
          activeTab={activeTab}
          className="space-y-3"
        >
          <p className="text-xs text-neutral-500">
            {picked
              ? `当前筛选：「${picked.name}」的最近 400 条（在「新建违规」页锁定人员后生效）`
              : "显示全员最近 400 条；扫码与大屏仅取每人最新「生效中」记录。「已被覆盖」为同一人再次新建时系统自动归档的旧记录。"}
          </p>
          <AdminTableShell
            loading={loading}
            empty={!loading && rows.length === 0}
            emptyMessage="暂无违规记录"
            onRetry={() => void load()}
            scrollable
          >
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">ID</th>
                  <th className="px-3 py-2">人员</th>
                  <th className="whitespace-nowrap px-3 py-2">状态</th>
                  <th className="whitespace-nowrap px-3 py-2">禁入</th>
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
                      <td className="px-3 py-2 font-mono text-xs text-neutral-700">{r.id}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-neutral-900">{personDisplayName(r)}</div>
                        <div className="mt-1 line-clamp-2 max-w-[240px] text-xs text-neutral-600">{r.violationText || "—"}</div>
                        {imgs.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {imgs.slice(0, 3).map((u) => (
                              <img key={u} src={u} alt="" className="h-10 w-10 rounded-md border border-neutral-100 object-cover" />
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className={st.className} title={st.hint}>
                          {st.text}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">{r.forbidEnter ? "是" : "否"}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.maxEnterSuccess != null ? `${r.enterSuccessCount ?? 0}/${r.maxEnterSuccess}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-600">{r.expireAt ? String(r.expireAt).slice(0, 16) : "—"}</td>
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
                              onClick={() => void onMarkProcessed(r.id)}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                              已处理
                            </AdminButton>
                          ) : null}
                          {r.status === "ACTIVE" ? (
                            <AdminButton
                              type="button"
                              tone="secondary"
                              size="sm"
                              className="gap-1 text-amber-900"
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
      </div>

      {editOpen && editId != null ? (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => !savingEdit && setEditOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-neutral-200/90 bg-white shadow-xl ring-1 ring-black/[0.04]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-violation-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
              <div className="min-w-0">
                <h4 id="edit-violation-title" className="text-base font-semibold tracking-tight text-neutral-950">
                  编辑违规 #{editId}
                </h4>
                <p className="mt-1 text-xs text-neutral-500">人员 {editTargetLabel}</p>
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
            <div className="space-y-3 px-5 py-4">
              <div>
                <label className="text-xs font-medium text-neutral-600">违规说明</label>
                <textarea
                  className={cn(inputBase, "mt-1.5 min-h-[88px] resize-y")}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600">图片</label>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <AdminFilePickButton
                    multiple
                    disabled={editUploading}
                    onFiles={(files) => void onEditFiles(files)}
                  >
                    添加图片
                  </AdminFilePickButton>
                  {editUploading ? <span className="text-xs text-neutral-500">上传中…</span> : null}
                </div>
                {editUrls.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {editUrls.map((u) => (
                      <div key={u} className="relative h-14 w-14 overflow-hidden rounded-lg border border-neutral-200">
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
              <label className="flex items-center gap-2 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-neutral-300"
                  checked={editForbid}
                  onChange={(e) => setEditForbid(e.target.checked)}
                />
                立即禁止扫码进入
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-neutral-300"
                  checked={editShowEvery}
                  onChange={(e) => setEditShowEvery(e.target.checked)}
                />
                每次扫码都提示违规内容
              </label>
              <div>
                <label className="text-xs font-medium text-neutral-600">进入次数上限（留空=不限制）</label>
                <input className={cn(inputBase, "mt-1")} inputMode="numeric" value={editMax} onChange={(e) => setEditMax(e.target.value)} />
              </div>
              <fieldset className="space-y-2 rounded-lg border border-neutral-200/90 bg-neutral-50/50 p-3">
                <legend className="px-1 text-xs font-medium text-neutral-600">到期时间</legend>
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
            <div className="flex justify-end gap-2 border-t border-neutral-100 px-5 py-4">
              <AdminButton type="button" tone="secondary" disabled={savingEdit} onClick={() => setEditOpen(false)}>
                取消
              </AdminButton>
              <AdminButton type="button" tone="primary" loading={savingEdit} onClick={() => void saveEdit()}>
                保存修改
              </AdminButton>
            </div>
          </div>
        </div>
      ) : null}
    </AdminPageShell>
  );
}
