import { useEffect, useMemo, useState, type MouseEvent } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { Archive, ArrowLeft, ChevronDown, ChevronRight, CreditCard, Fingerprint, KeyRound, LayoutGrid, PanelLeft, PanelLeftClose, Plus, RefreshCw, ScanFace, Star, Trash2, Undo2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDahuaPersonCard,
  authorizeDahuaPerson,
  createDahuaPerson,
  deleteDahuaPersonCard,
  deleteDahuaPersons,
  fetchDahuaDepartmentTree,
  fetchDahuaDoorChannels,
  fetchDahuaDoorGroupsWithDetails,
  fetchDahuaPersonAuthorities,
  fetchDahuaPersons,
  fetchDeletedDahuaPersons,
  purgeDahuaPersons,
  restoreDahuaPersons,
  revokeDahuaPerson,
  setDahuaMainCard,
  updateDahuaPersonDepartment,
  type DahuaPersonCard,
  type DahuaPersonRow,
} from "@/api/twinApi";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { DahuaChannelListPicker } from "@/components/admin/DahuaChannelListPicker";
import { DahuaDoorGroupConfigPanel } from "@/components/admin/DahuaDoorGroupConfigPanel";
import { DeptTreeSelect } from "@/components/admin/DeptTreeSelect";
import { TransferListPicker } from "@/components/admin/TransferListPicker";
import { Portal } from "@/components/Portal";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { adminInputClass } from "@/features/admin/adminFormUi";
import { appConfirm } from "@/lib/appDialog";
import DataSkeleton from "@/components/ui/DataSkeleton";

interface DeptRow {
  id: number;
  parentId?: number | null;
  name: string;
  sort?: number;
}

const AUTHORIZE_SOURCE_LABEL: Record<string, string> = {
  "1": "按人",
  "2": "按部门",
  "3": "按门组",
};

type PersonRow = DahuaPersonRow & { code: string; name: string };

/** 卡片占位样式：模拟实体卡的圆角牌，主卡深色、附卡浅色 */
function CardVisual({
  card,
  size = "sm",
  onClick,
}: {
  card: DahuaPersonCard;
  size?: "sm" | "md";
  onClick?: () => void;
}) {
  const number = card.cardNumber || "-";
  const main = card.isMainCard === 1;
  const unbound = card.cardStatus === "255";
  const md = size === "md";
  const cls = md
    ? "h-14 w-full px-2.5 py-2 text-[12px]"
    : "h-7 px-1.5 text-[10px]";
  const skin = unbound
    ? "border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]"
    : main
      ? "border-slate-700 bg-gradient-to-br from-slate-700 to-slate-900 text-white"
      : "border-[var(--twin-hairline)] bg-gradient-to-br from-slate-50 to-slate-100 text-[var(--twin-ink)]";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${number}${main ? " · 主卡" : " · 附属卡"}${unbound ? " · 未绑定" : ""}`}
      className={`group inline-flex items-center gap-1.5 rounded-md border ${cls} ${skin} ${
        onClick ? "transition hover:brightness-105" : "cursor-default"
      } ${md ? "justify-start" : "shrink-0"}`}
    >
      <span
        className={`shrink-0 rounded-[3px] ${
          md ? "h-5 w-4" : "h-3.5 w-3"
        } ${main ? "bg-amber-300/90" : "bg-slate-400/70"}`}
      />
      <span
        className={`truncate font-mono tracking-wider ${md ? "text-[12px]" : "text-[10px]"} ${
          main ? "text-white/90" : ""
        }`}
      >
        {number}
      </span>
      {main && (
        <span className={`ml-auto shrink-0 rounded bg-amber-300/90 px-1 text-[9px] font-bold text-slate-900 ${md ? "" : "hidden"}`}>
          主卡
        </span>
      )}
    </button>
  );
}

function buildDeptOrder(rows: DeptRow[]) {
  const ids = new Set(rows.map((r) => r.id));
  const children = new Map<number, DeptRow[]>();
  for (const r of rows) {
    const pid = r.parentId && ids.has(Number(r.parentId)) ? Number(r.parentId) : 0;
    if (!children.has(pid)) children.set(pid, []);
    children.get(pid)!.push(r);
  }
  for (const list of children.values()) {
    list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id);
  }
  const out: Array<{ row: DeptRow; depth: number; path: string; hasChildren: boolean; ancestorIds: number[] }> = [];
  const walk = (pid: number, depth: number, prefix: string, ancestors: number[]) => {
    for (const row of children.get(pid) || []) {
      const path = prefix ? `${prefix} / ${row.name}` : row.name;
      const hasChildren = (children.get(row.id) || []).length > 0;
      out.push({ row, depth, path, hasChildren, ancestorIds: ancestors });
      walk(row.id, depth + 1, path, [...ancestors, row.id]);
    }
  };
  walk(0, 0, "", []);
  return out;
}

export default function AdminDoorAuthorizePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [deptKeyword, setDeptKeyword] = useState("");
  const [deptCollapsed, setDeptCollapsed] = useState(false);
  const [collapsedDepts, setCollapsedDepts] = useState<Set<number>>(new Set());
  const [deptId, setDeptId] = useState<number>(1);
  const [personKeyword, setPersonKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [person, setPerson] = useState<PersonRow | null>(null);
  const [pickerOpen, setPickerOpen] = useState<"channel" | "group" | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [cardPanel, setCardPanel] = useState<PersonRow | null>(null);
  const [cardDeptId, setCardDeptId] = useState("");
  const [groupConfigOpen, setGroupConfigOpen] = useState(false);
  const [deptEditPerson, setDeptEditPerson] = useState<PersonRow | null>(null);
  const [deptEditValue, setDeptEditValue] = useState("");
  const [deptSaving, setDeptSaving] = useState(false);
  const [newCardNumber, setNewCardNumber] = useState("");
  const [cardBusy, setCardBusy] = useState("");
  const [addForm, setAddForm] = useState({
    name: "", departmentId: "", cardNumber: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<{
    person: PersonRow;
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [deleteCardFlag, setDeleteCardFlag] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  /** 已删除但仍被门禁侧返回的残留行，本会话内直接隐藏 */
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());

  const [recycleOpen, setRecycleOpen] = useState(false);  const [recycleKeyword, setRecycleKeyword] = useState("");
  const [recycleApplied, setRecycleApplied] = useState("");
  const [recyclePage, setRecyclePage] = useState(1);
  const [recycleBusy, setRecycleBusy] = useState("");
  const recyclePageSize = 20;

  const deptQuery = useQuery({
    queryKey: ["dahuaDeptTreeForAuth"] as const,
    queryFn: fetchDahuaDepartmentTree,
  });
  const groupsQuery = useQuery({
    queryKey: ["dahuaDoorGroupsForAuth"] as const,
    queryFn: fetchDahuaDoorGroupsWithDetails,
  });
  const personsQuery = useQuery({
    queryKey: ["dahuaPersons", deptId, appliedKeyword, page] as const,
    queryFn: () =>
      fetchDahuaPersons({ deptId, keyword: appliedKeyword, page, pageSize }),
    placeholderData: (prev) => prev,
  });
  const authQuery = useQuery({
    queryKey: ["dahuaPersonAuth", person?.code || ""] as const,
    queryFn: () => fetchDahuaPersonAuthorities(person!.code),
    enabled: !!person?.code,
  });
  const deletedQuery = useQuery({
    queryKey: ["dahuaDeletedPersons", deptId, recycleApplied, recyclePage] as const,
    queryFn: () =>
      fetchDeletedDahuaPersons({
        deptId,
        keyword: recycleApplied,
        page: recyclePage,
        pageSize: recyclePageSize,
      }),
    enabled: recycleOpen,
    placeholderData: (prev) => prev,
  });

  const deptOrdered = useMemo(() => buildDeptOrder((deptQuery.data as DeptRow[]) || []), [deptQuery.data]);
  const deptFiltered = useMemo(() => {
    const k = deptKeyword.trim().toLowerCase();
    if (!k) return deptOrdered;
    return deptOrdered.filter((x) => x.path.toLowerCase().includes(k));
  }, [deptOrdered, deptKeyword]);

  /** 搜索时忽略折叠，直接展示命中链；平时隐藏被收起的父部门下面的节点 */
  const deptVisible = useMemo(() => {
    if (deptKeyword.trim()) return deptFiltered;
    return deptFiltered.filter((x) => x.ancestorIds.every((id) => !collapsedDepts.has(id)));
  }, [deptFiltered, deptKeyword, collapsedDepts]);

  const toggleDept = (id: number) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rawPersons = (personsQuery.data?.pageData ?? []).filter(
    (p) => !hiddenIds.has(Number(p.id))
  );
  const persons: PersonRow[] = rawPersons.map((p) => ({
    ...p,
    code: p.personCode ?? p.code ?? "",
    name: p.personName ?? p.name ?? "",
  }));
  const total = personsQuery.data?.totalRows ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const deletedRows = deletedQuery.data?.pageData ?? [];
  const deletedTotal = deletedQuery.data?.totalRows ?? 0;
  const deletedTotalPages = Math.max(1, Math.ceil(deletedTotal / recyclePageSize));

  const details = authQuery.data?.personPrivilegeDetails ?? [];
  const channelAuths = details.filter((d) => d.privilegeType === 1);
  const groupAuths = details.filter((d) => d.privilegeType === 2);

  const refreshDetail = () => qc.invalidateQueries({ queryKey: ["dahuaPersonAuth", person?.code || ""] });

  const authorizeMut = useMutation({
    mutationFn: authorizeDahuaPerson,
    onSuccess: async () => {
      toast.success("权限已下发");
      setPickerOpen(null);
      setPicked([]);
      await refreshDetail();
    },
    onError: (e: Error) => toast.error(e.message || "授权失败"),
  });

  const revokeMut = useMutation({
    mutationFn: revokeDahuaPerson,
    onSuccess: async () => {
      toast.success("权限已回收");
      await refreshDetail();
    },
    onError: (e: Error) => toast.error(e.message || "回收失败"),
  });

  const openPicker = (kind: "channel" | "group") => {
    const existing = kind === "channel"
      ? channelAuths.map((d) => d.resourceCode)
      : groupAuths.map((d) => String(d.resourceCode));
    setPicked(existing);
    setPickerOpen(kind);
  };

  const confirmAdd = async () => {
    if (!person || !pickerOpen) return;
    const existing = pickerOpen === "channel"
      ? new Set(channelAuths.map((d) => d.resourceCode))
      : new Set(groupAuths.map((d) => String(d.resourceCode)));
    const added = picked.filter((v) => !existing.has(v));
    if (added.length === 0) {
      toast("没有新增的权限");
      return;
    }
    authorizeMut.mutate({
      personCode: person.code,
      channelCodes: pickerOpen === "channel" ? added : [],
      doorGroupIds: pickerOpen === "group" ? added.map(Number) : [],
    });
  };

  const onRevoke = async (privilegeType: number, resourceCode: string, resourceName?: string) => {
    if (!person) return;
    if (!(await appConfirm(`确定回收「${resourceName || resourceCode}」的权限？`))) return;
    revokeMut.mutate({
      personCode: person.code,
      channelCodes: privilegeType === 1 ? [resourceCode] : [],
      doorGroupIds: privilegeType === 2 ? [Number(resourceCode)] : [],
    });
  };

  const openDeletePopover = (e: MouseEvent<HTMLButtonElement>, p: PersonRow) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = 240;
    const left = Math.max(8, Math.min(rect.left - width + rect.width, window.innerWidth - width - 8));
    const top = Math.min(rect.bottom + 6, window.innerHeight - 150);
    setDeleteCardFlag(false);
    setDeleteTarget({ person: p, left, top, width });
  };

  const closeDeletePopover = () => {
    if (deleteSaving) return;
    setDeleteTarget(null);
  };

  const confirmDeletePerson = async () => {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    try {
      const res = await deleteDahuaPersons({
        ids: [Number(deleteTarget.person.id)],
        deleteCard: deleteCardFlag,
        departmentId: deptId > 1 ? String(deptId) : "",
      });
      toast.success(
        (res as { alreadyDeleted?: boolean } | undefined)?.alreadyDeleted
          ? "该人员已不在人员库中，已从列表隐藏"
          : "人员已删除"
      );
      setHiddenIds((prev) => new Set(prev).add(Number(deleteTarget.person.id)));
      setDeleteTarget(null);
      refetchPersonsSoon();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除人员失败");
      // 平台可能只是同步滞后，刷新一次让已删除的行消失
      refetchPersonsSoon();
    } finally {
      setDeleteSaving(false);
    }
  };

  const openAddPerson = () => {
    setAddForm({ name: "", departmentId: deptId > 1 ? String(deptId) : "1", cardNumber: "" });
    setAddOpen(true);
  };

  const submitAddPerson = async () => {
    const name = addForm.name.trim();
    if (!name) { toast.error("请填写姓名"); return; }
    if (!addForm.departmentId) { toast.error("请选择所属部门"); return; }
    setAddSaving(true);
    try {
      const cardNumber = addForm.cardNumber.trim();
      await createDahuaPerson({
        name,
        departmentId: Number(addForm.departmentId),
        cardNumber: cardNumber || undefined,
      });
      toast.success(cardNumber ? "人员已新增并录卡" : "人员已新增");
      setAddOpen(false);
      await personsQuery.refetch();
      // 平台人员列表有短暂同步延迟，稍后再补拉一次
      window.setTimeout(() => void personsQuery.refetch(), 1200);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "新增人员失败");
    } finally {
      setAddSaving(false);
    }
  };

  const openCardPanel = (p: PersonRow) => {
    setNewCardNumber("");
    setCardDeptId(String(p.deptId || deptId || 1));
    setCardPanel(p);
  };

  const openDeptEditor = (p: PersonRow) => {
    setDeptEditValue(p.deptId ? String(p.deptId) : "");
    setDeptEditPerson(p);
  };

  const submitDeptEdit = async () => {
    if (!deptEditPerson) return;
    const target = Number(deptEditValue);
    if (!target) {
      toast.error("请选择部门");
      return;
    }
    setDeptSaving(true);
    try {
      await updateDahuaPersonDepartment(Number(deptEditPerson.id), {
        name: deptEditPerson.name,
        code: deptEditPerson.code,
        departmentId: target,
      });
      toast.success("所属部门已修改");
      setDeptEditPerson(null);
      refetchPersonsSoon();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "修改部门失败");
    } finally {
      setDeptSaving(false);
    }
  };

  /** 卡操作后同步刷新列表，并把弹窗里的那一行换成最新数据 */
  /** 平台的增删改有 1~2 秒同步延迟，立即刷新后再补拉一次，避免列表停在旧数据 */
  const refetchPersonsSoon = () => {
    void personsQuery.refetch();
    window.setTimeout(() => void personsQuery.refetch(), 1500);
  };

  // 切回页面时自动刷新，避免看到别处改动前的旧列表
  useEffect(() => {
    const onFocus = () => void personsQuery.refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [personsQuery]);

  const refreshCardPanel = async (personCode: string) => {
    const res = await personsQuery.refetch();
    const fresh = (res.data?.pageData ?? []).find(
      (x) => (x.personCode ?? x.code ?? "") === personCode
    );
    if (fresh) {
      setCardPanel({ ...fresh, code: fresh.personCode ?? fresh.code ?? "", name: fresh.personName ?? fresh.name ?? "" });
    } else {
      window.setTimeout(() => void personsQuery.refetch(), 1500);
    }
  };

  const personDeptId = (p: PersonRow) => Number(cardDeptId || p.deptId || deptId || 1);

  const onAddCard = async () => {
    if (!cardPanel) return;
    const cardNumber = newCardNumber.trim();
    if (!cardNumber) {
      toast.error("请填写卡号");
      return;
    }
    setCardBusy("add");
    try {
      await addDahuaPersonCard(Number(cardPanel.id), {
        departmentId: personDeptId(cardPanel),
        cardNumber,
      });
      toast.success("卡片已录入");
      setNewCardNumber("");
      await refreshCardPanel(cardPanel.code);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "录卡失败");
    } finally {
      setCardBusy("");
    }
  };

  const onSetMainCard = async (card: DahuaPersonCard) => {
    if (!cardPanel || !card.cardNumber) return;
    const oldMain = (cardPanel.cardList || []).find((c) => c.isMainCard === 1)?.cardNumber;
    setCardBusy(card.cardNumber);
    try {
      await setDahuaMainCard(Number(cardPanel.id), {
        departmentId: personDeptId(cardPanel),
        cardNumber: card.cardNumber,
        oldMainCardNumber: oldMain,
      });
      toast.success("已设为主卡");
      await refreshCardPanel(cardPanel.code);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "设为主卡失败");
    } finally {
      setCardBusy("");
    }
  };

  const onDeleteCard = async (card: DahuaPersonCard) => {
    if (!cardPanel || !card.cardNumber) return;
    if (!(await appConfirm(`确定删除卡片 ${card.cardNumber}？`, { title: "删除卡片", danger: true }))) return;
    setCardBusy(card.cardNumber);
    try {
      await deleteDahuaPersonCard(Number(cardPanel.id), card.cardNumber);
      toast.success("卡片已删除");
      await refreshCardPanel(cardPanel.code);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删卡失败");
    } finally {
      setCardBusy("");
    }
  };

  const openRecycle = () => {
    setRecycleKeyword("");
    setRecycleApplied("");
    setRecyclePage(1);
    setRecycleOpen(true);
  };

  const applyRecycleSearch = () => {
    setRecycleApplied(recycleKeyword.trim());
    setRecyclePage(1);
  };

  const onRestorePerson = async (p: DahuaPersonRow) => {
    setRecycleBusy(String(p.id));
    try {
      await restoreDahuaPersons([Number(p.id)]);
      toast.success("人员已恢复");
      await deletedQuery.refetch();
      await personsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "恢复人员失败");
    } finally {
      setRecycleBusy("");
    }
  };

  const onPurgePerson = async (p: DahuaPersonRow) => {
    if (!(await appConfirm(`彻底删除「${p.name || p.code || p.id}」后不可恢复，确定？`, {
      title: "彻底删除",
      danger: true,
    }))) return;
    setRecycleBusy(String(p.id));
    try {
      await purgeDahuaPersons([Number(p.id)]);
      toast.success("已彻底删除");
      await deletedQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "彻底删除失败");
    } finally {
      setRecycleBusy("");
    }
  };

  const isRevoking = (privilegeType: number, resourceCode: string) => {
    if (!revokeMut.isPending || !revokeMut.variables) return false;
    if (privilegeType === 1) return revokeMut.variables.channelCodes?.[0] === resourceCode;
    return String(revokeMut.variables.doorGroupIds?.[0] ?? "") === String(resourceCode);
  };

  const groupOptions = (groupsQuery.data || []).map((g) => ({
    value: String(g.id),
    label: g.name || `门组${g.id}`,
    meta: g.orgName || "",
  }));

  const selectedDeptPath = deptOrdered.find((x) => x.row.id === deptId)?.path || "";
  const selectedDeptLabel = deptId === 1 ? "全部人员" : selectedDeptPath || "当前部门";
  const applyPersonSearch = () => {
    setAppliedKeyword(personKeyword.trim());
    setPage(1);
  };

  return (
    <AdminPageShell>
      <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[480px] gap-2 p-2">
        {!deptCollapsed && (
        <div className="flex w-64 shrink-0 flex-col rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">
          <div className="border-b border-[var(--twin-hairline)] p-1.5">
            <div className="flex items-center gap-1">
              <AdminToolbarSearchField
                className="min-w-0 flex-1"
                placeholder="搜索部门"
                value={deptKeyword}
                onChange={setDeptKeyword}
                onSubmit={() => {}}
              />
              <button
                type="button"
                title="收起部门"
                className="shrink-0 rounded p-1 text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                onClick={() => setDeptCollapsed(true)}
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            <button
              type="button"
              className={`mb-0.5 flex w-full items-center rounded px-2 py-1.5 text-left text-xs ${
                deptId === 1 ? "bg-[var(--twin-primary-soft,#eef2ff)] font-semibold text-[var(--twin-primary)]" : "hover:bg-[var(--twin-canvas-soft)]"
              }`}
              onClick={() => { setDeptId(1); setPage(1); }}
            >
              全部人员
            </button>
            {deptVisible.map(({ row, depth, path, hasChildren }) => {
              const isCollapsed = collapsedDepts.has(row.id) && !deptKeyword.trim();
              return (
                <button
                  key={row.id}
                  type="button"
                  title={path}
                  style={{ paddingLeft: 8 + Math.min(depth, 6) * 12 }}
                  className={`mb-0.5 flex w-full items-center gap-1 rounded py-1.5 pr-2 text-left text-xs ${
                    deptId === row.id ? "bg-[var(--twin-primary-soft,#eef2ff)] font-semibold text-[var(--twin-primary)]" : "text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                  }`}
                  onClick={() => { setDeptId(row.id); setPage(1); }}
                >
                  {hasChildren ? (
                    <span
                      className="shrink-0 text-[var(--twin-mute)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDept(row.id);
                      }}
                    >
                      {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </span>
                  ) : (
                    <span className="inline-block h-3 w-3 shrink-0" />
                  )}
                  <span className="truncate">{row.name}</span>
                </button>
              );
            })}
            {deptQuery.isLoading && <DataSkeleton variant="table" rows={5} />}
          </div>
        </div>
        )}

        {/* 右：人员 */}
        <div className="flex min-w-0 flex-1 flex-col rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--twin-hairline)] px-2 py-1.5">
            <button
              type="button"
              onClick={() => setDeptCollapsed((v) => !v)}
              title={deptCollapsed ? "展开部门" : "收起部门"}
              className="rounded p-1 text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
            >
              {deptCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <AdminButton tone="ghost" onClick={() => navigate("/console/admin/door-control")}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              返回门禁控制
            </AdminButton>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-[var(--twin-ink)]">人员授权</div>
              <div className="truncate text-[11px] text-[var(--twin-mute)]">
                {selectedDeptLabel} · 共 {total >= 0 ? total : "--"} 人
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <AdminButton onClick={openAddPerson}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                新增人员
              </AdminButton>
              <AdminButton tone="ghost" onClick={openRecycle}>
                <Archive className="mr-1 h-3.5 w-3.5" />
                已删除人员
              </AdminButton>
              <AdminButton tone="ghost" onClick={() => setGroupConfigOpen(true)}>
                <LayoutGrid className="mr-1 h-3.5 w-3.5" />
                门组配置
              </AdminButton>
              <AdminToolbarSearchField
                className="w-56"
                placeholder="搜索姓名 / 工号"
                value={personKeyword}
                onChange={setPersonKeyword}
                onSubmit={applyPersonSearch}
              />
              <AdminButton tone="ghost" onClick={() => void personsQuery.refetch()} loading={personsQuery.isFetching}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                刷新
              </AdminButton>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {personsQuery.isLoading ? (
              <div className="p-6"><DataSkeleton variant="table" rows={8} /></div>
            ) : (
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--twin-canvas-soft)] text-left text-[11px] text-[var(--twin-body)]">
                  <tr>
                    <th className="px-2 py-1.5">人员</th>
                    <th className="px-2 py-1.5">卡号</th>
                    <th className="px-2 py-1.5">部门</th>
                    <th className="px-2 py-1.5">授权</th>
                    <th className="px-2 py-1.5">特征</th>
                    <th className="px-2 py-1.5">状态</th>
                    <th className="px-2 py-1.5 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {persons.map((p) => {
                    const authOk = p.authorizeStatus === "2";
                    const authUnknown = p.authorizeStatus !== "1" && p.authorizeStatus !== "2";
                    const sources = (p.authorizeSourceList || [])
                      .map((v) => AUTHORIZE_SOURCE_LABEL[v] || "")
                      .filter(Boolean);
                    const bioCount = (p.biosignatureList || []).length;
                    const deptPath = (p.deptFullPathList || p.deptNameList || []).join(" / ");
                    const working = p.status !== "FREEZE";
                    return (
                      <tr key={p.code || p.id} className="border-t border-[var(--twin-hairline)] hover:bg-[var(--twin-canvas-soft)]">
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--twin-canvas-soft)] text-[11px] font-bold text-[var(--twin-body)]">
                              {(p.name || "?").slice(0, 1)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-[12px] font-semibold text-[var(--twin-ink)]">{p.name || "-"}</div>
                              <div className="truncate font-mono text-[10px] text-[var(--twin-mute)]">{p.code || "-"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          {p.cardList === undefined ? (
                            <span className="text-[11px] text-[var(--twin-mute)]">—</span>
                          ) : (p.cardList || []).length === 0 ? (
                            <button
                              type="button"
                              onClick={() => openCardPanel(p)}
                              className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--twin-hairline)] px-1.5 py-1 text-[10px] text-[var(--twin-mute)] hover:border-[var(--app-color-accent)] hover:text-[var(--twin-ink)]"
                            >
                              <Plus className="h-3 w-3" />
                              未绑卡
                            </button>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {(p.cardList || []).slice(0, 2).map((c) => (
                                <CardVisual
                                  key={c.cardNumber || String(c.personId)}
                                  card={c}
                                  onClick={() => openCardPanel(p)}
                                />
                              ))}
                              {(p.cardList || []).length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => openCardPanel(p)}
                                  className="inline-flex h-7 items-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 text-[10px] font-semibold text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                                >
                                  +{(p.cardList || []).length - 2}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="max-w-[15rem] px-2 py-1.5 text-[11px] text-[var(--twin-mute)]">
                          <button
                            type="button"
                            title="点击修改所属部门"
                            onClick={() => openDeptEditor(p)}
                            className="block max-w-full truncate text-left hover:text-[var(--twin-ink)] hover:underline"
                          >
                            {deptPath || "-"}
                          </button>
                        </td>
                        <td className="px-2 py-1.5">
                          {p.authorizeStatus == null ? (
                            <span className="text-[11px] text-[var(--twin-mute)]">—</span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <span className={`w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                authOk ? "bg-emerald-50 text-emerald-700" : authUnknown ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"
                              }`}>
                                {authOk ? "已授权" : authUnknown ? "未知" : "未授权"}
                              </span>
                              {sources.length > 0 && (
                                <span className="text-[10px] text-[var(--twin-mute)]">来源：{sources.join("、")}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5 text-[10px] text-[var(--twin-mute)]">
                            {p.facePath ? <ScanFace className="h-3.5 w-3.5" aria-label="人脸" /> : null}
                            {bioCount > 0 ? (
                              <span className="inline-flex items-center gap-0.5">
                                <Fingerprint className="h-3.5 w-3.5" aria-label="生物特征" />
                                {bioCount}
                              </span>
                            ) : null}
                            {!p.facePath && bioCount === 0 && <span>-</span>}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          {p.status ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--twin-body)]">
                              <span className={`h-1.5 w-1.5 rounded-full ${working ? "bg-emerald-500" : "bg-amber-500"}`} />
                              {working ? "在职" : "冻结"}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[var(--twin-mute)]">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              title="编辑权限"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--twin-hairline)] text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                              onClick={() => setPerson(p)}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="删除人员"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--twin-hairline)] text-[var(--app-color-feedback-danger-ink)] transition hover:bg-[var(--app-color-feedback-danger-soft)]"
                              onClick={(e) => openDeletePopover(e, p)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {persons.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-2 py-8 text-center text-xs text-[var(--twin-mute)]">
                        没有匹配的人员
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[var(--twin-hairline)] px-2 py-1.5 text-xs text-[var(--twin-body)]">
            <span className="text-[var(--twin-mute)]">共 {total >= 0 ? total : "--"} 人</span>
            <div className="flex items-center gap-2">
              <AdminButton tone="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                上一页
              </AdminButton>
              <span>{page} / {totalPages}</span>
              <AdminButton tone="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                下一页
              </AdminButton>
            </div>
          </div>
        </div>
      </div>

      {/* 新增人员 */}
      {addOpen && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-xl rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--twin-hairline)] pb-2">
                <div className="text-base font-bold text-[var(--twin-ink)]">新增人员</div>
                <AdminButton tone="ghost" onClick={() => setAddOpen(false)}>关闭</AdminButton>
              </div>
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                  姓名 *
                  <input
                    className={adminInputClass}
                    value={addForm.name}
                    maxLength={64}
                    placeholder="人员姓名"
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                  所属部门 *
                  <DeptTreeSelect
                    nodes={(deptQuery.data as DeptRow[]) || []}
                    value={addForm.departmentId}
                    onChange={(v) => setAddForm({ ...addForm, departmentId: v })}
                    placeholder="选择所属部门"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                  卡号（选填，填写即录入并绑定卡片）
                  <input
                    className={adminInputClass}
                    value={addForm.cardNumber}
                    maxLength={32}
                    placeholder="物理卡号，留空则不录卡"
                    onChange={(e) => setAddForm({ ...addForm, cardNumber: e.target.value })}
                  />
                </label>
                <div className="text-[11px] text-[var(--twin-mute)]">
                  工号由系统自动生成（日期 + 人员编号），其余信息按校园卡默认配置。
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <AdminButton tone="ghost" onClick={() => setAddOpen(false)}>取消</AdminButton>
                <AdminButton onClick={() => void submitAddPerson()} loading={addSaving}>新增</AdminButton>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* 修改所属部门 */}
      {deptEditPerson && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-xl">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--twin-hairline)] px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[var(--twin-ink)]">修改所属部门</div>
                  <div className="truncate text-[11px] text-[var(--twin-mute)]">
                    {deptEditPerson.name} · {deptEditPerson.code}
                  </div>
                </div>
                <button
                  type="button"
                  title="关闭"
                  aria-label="关闭"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                  onClick={() => setDeptEditPerson(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-3">
                <div className="mb-1 text-[11px] text-[var(--twin-mute)]">选择新的所属部门</div>
                <DeptTreeSelect
                  nodes={(deptQuery.data as DeptRow[]) || []}
                  value={deptEditValue}
                  onChange={setDeptEditValue}
                  placeholder="选择部门"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-[var(--twin-hairline)] px-3 py-2">
                <AdminButton tone="ghost" onClick={() => setDeptEditPerson(null)}>取消</AdminButton>
                <AdminButton onClick={() => void submitDeptEdit()} loading={deptSaving}>保存</AdminButton>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* 门组配置 */}
      {groupConfigOpen && (
        <Portal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
            <div className="flex h-[82vh] w-full max-w-6xl flex-col rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-xl">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--twin-hairline)] px-3 py-2">
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--twin-ink)]">
                    <LayoutGrid className="h-4 w-4" />
                    门组配置
                  </div>
                  <div className="text-[11px] text-[var(--twin-mute)]">
                    左侧选门组，中间挑未加入的门禁通道，右侧是已配置通道
                  </div>
                </div>
                <button
                  type="button"
                  title="关闭"
                  aria-label="关闭"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                  onClick={() => setGroupConfigOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-2">
                <DahuaDoorGroupConfigPanel />
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* 卡片管理 */}
      {cardPanel && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="flex max-h-[82vh] w-full max-w-md flex-col rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-xl">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--twin-hairline)] px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--twin-ink)]">
                    <CreditCard className="h-4 w-4" />
                    卡片管理
                  </div>
                  <div className="truncate text-[11px] text-[var(--twin-mute)]">
                    {cardPanel.name} · {cardPanel.code} · 共 {(cardPanel.cardList || []).length} 张
                  </div>
                </div>
                <button
                  type="button"
                  title="关闭"
                  aria-label="关闭"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                  onClick={() => setCardPanel(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
                {(cardPanel.cardList || []).length === 0 && (
                  <div className="rounded-lg border border-dashed border-[var(--twin-hairline)] px-3 py-6 text-center text-[11px] text-[var(--twin-mute)]">
                    此人还没有绑定卡片，录入一张即可开始刷卡
                  </div>
                )}
                {(cardPanel.cardList || []).map((c) => {
                  const busy = cardBusy === c.cardNumber;
                  return (
                    <div key={c.cardNumber || String(c.personId)} className="flex items-center gap-1.5">
                      <div className="min-w-0 flex-1">
                        <CardVisual card={c} size="md" />
                      </div>
                      <button
                        type="button"
                        title={c.isMainCard === 1 ? "已是主卡" : "设为主卡"}
                        aria-label="设为主卡"
                        disabled={c.isMainCard === 1 || !c.cardNumber || cardBusy !== ""}
                        onClick={() => void onSetMainCard(c)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--twin-hairline)] text-amber-600 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        title="删除卡片"
                        aria-label="删除卡片"
                        disabled={!c.cardNumber || cardBusy !== ""}
                        onClick={() => void onDeleteCard(c)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--twin-hairline)] text-[var(--app-color-feedback-danger-ink)] transition hover:bg-[var(--app-color-feedback-danger-soft)] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-[var(--twin-hairline)] p-3">
                <div className="mb-1 text-[10px] text-[var(--twin-mute)]">录卡归属部门</div>
                <DeptTreeSelect
                  nodes={(deptQuery.data as DeptRow[]) || []}
                  value={cardDeptId}
                  onChange={setCardDeptId}
                  placeholder="选择部门"
                />
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    className={adminInputClass}
                    placeholder="输入新卡号"
                    value={newCardNumber}
                    maxLength={32}
                    onChange={(e) => setNewCardNumber(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onAddCard();
                    }}
                  />
                  <AdminButton onClick={() => void onAddCard()} loading={cardBusy === "add"} disabled={cardBusy !== ""}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    录入
                  </AdminButton>
                </div>
                <div className="mt-1 text-[10px] text-[var(--twin-mute)]">
                  第一张卡自动成为主卡；多人多卡时主卡不能直接删除，先把其他卡设为主卡。
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* 删除人员：点击位置气泡 */}
      {deleteTarget && (
        <Portal>
          <div className="fixed inset-0 z-[70]" onClick={closeDeletePopover}>
            <div
              className="absolute rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3 shadow-xl"
              style={{ left: deleteTarget.left, top: deleteTarget.top, width: deleteTarget.width }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-[var(--twin-ink)]">删除人员</div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    title="取消"
                    aria-label="取消"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                    onClick={closeDeletePopover}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="删除"
                    aria-label="删除"
                    disabled={deleteSaving}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--app-color-feedback-danger-ink)] hover:bg-[var(--app-color-feedback-danger-soft)] disabled:opacity-40"
                    onClick={() => void confirmDeletePerson()}
                  >
                    {deleteSaving ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <div className="mt-1 truncate text-xs text-[var(--twin-body)]">
                {deleteTarget.person.name}（{deleteTarget.person.code}）
              </div>
              {(deleteTarget.person.cardList || []).length > 0 && (
                <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--twin-body)]">
                  <input
                    type="checkbox"
                    checked={deleteCardFlag}
                    onChange={(e) => setDeleteCardFlag(e.target.checked)}
                  />
                  同时删除卡片（{(deleteTarget.person.cardList || []).length} 张）
                </label>
              )}
              <div className="mt-1 text-[10px] text-[var(--twin-mute)]">删除后可在已删除人员中恢复</div>
            </div>
          </div>
        </Portal>
      )}

      {/* 已删除人员（回收站） */}
      {recycleOpen && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-xl">
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--twin-hairline)] p-3">
                <div className="text-base font-bold text-[var(--twin-ink)]">已删除人员</div>
                <div className="text-xs text-[var(--twin-mute)]">共 {deletedTotal} 人</div>
                <div className="ml-auto flex items-center gap-1.5">
                  <AdminToolbarSearchField
                    className="w-52"
                    placeholder="搜索姓名 / 工号"
                    value={recycleKeyword}
                    onChange={setRecycleKeyword}
                    onSubmit={applyRecycleSearch}
                  />
                  <AdminButton
                    tone="ghost"
                    onClick={() => void deletedQuery.refetch()}
                    loading={deletedQuery.isFetching}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    刷新
                  </AdminButton>
                  <AdminButton tone="ghost" onClick={() => setRecycleOpen(false)}>关闭</AdminButton>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {deletedQuery.isLoading ? (
                  <div className="p-6"><DataSkeleton variant="table" rows={6} /></div>
                ) : (
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-[var(--twin-canvas-soft)] text-left text-[11px] text-[var(--twin-body)]">
                      <tr>
                        <th className="px-2 py-1.5">人员</th>
                        <th className="px-2 py-1.5">工号</th>
                        <th className="px-2 py-1.5">部门</th>
                        <th className="px-2 py-1.5 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletedRows.map((p) => {
                        const busy = recycleBusy === String(p.id);
                        const deptPath =
                          p.departmentName ||
                          (p.deptFullPathList || p.deptNameList || []).join(" / ");
                        return (
                          <tr key={`${p.id}-${p.code}`} className="border-t border-[var(--twin-hairline)] hover:bg-[var(--twin-canvas-soft)]">
                            <td className="px-2 py-1.5 text-[12px] font-semibold text-[var(--twin-ink)]">{p.name || "-"}</td>
                            <td className="px-2 py-1.5 font-mono text-[11px] text-[var(--twin-mute)]">{p.code || "-"}</td>
                            <td className="max-w-[15rem] px-2 py-1.5 text-[11px] text-[var(--twin-mute)]">
                              <span className="block truncate" title={deptPath}>{deptPath || "-"}</span>
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {busy ? (
                                <RefreshCw className="ml-auto h-3.5 w-3.5 animate-spin text-[var(--twin-mute)]" />
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    title="恢复"
                                    aria-label="恢复"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--twin-hairline)] text-emerald-600 transition hover:bg-emerald-50"
                                    onClick={() => void onRestorePerson(p)}
                                  >
                                    <Undo2 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="彻底删除"
                                    aria-label="彻底删除"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--twin-hairline)] text-[var(--app-color-feedback-danger-ink)] transition hover:bg-[var(--app-color-feedback-danger-soft)]"
                                    onClick={() => void onPurgePerson(p)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {deletedRows.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-2 py-8 text-center text-xs text-[var(--twin-mute)]">
                            暂无已删除人员
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)]">
                <span className="text-[var(--twin-mute)]">共 {deletedTotal} 人</span>
                <div className="flex items-center gap-2">
                  <AdminButton
                    tone="ghost"
                    disabled={recyclePage <= 1}
                    onClick={() => setRecyclePage((p) => Math.max(1, p - 1))}
                  >
                    上一页
                  </AdminButton>
                  <span>{recyclePage} / {deletedTotalPages}</span>
                  <AdminButton
                    tone="ghost"
                    disabled={recyclePage >= deletedTotalPages}
                    onClick={() => setRecyclePage((p) => Math.min(deletedTotalPages, p + 1))}
                  >
                    下一页
                  </AdminButton>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* 授权弹窗：左右双列 */}
      {person && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="flex h-[78vh] w-full max-w-4xl flex-col rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-xl">
              <div className="flex items-start justify-between gap-2 border-b border-[var(--twin-hairline)] px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-[var(--twin-ink)]">{person.name} 的门禁权限</div>
                  <div className="truncate text-[11px] text-[var(--twin-mute)]">
                    工号 {person.code} · {(person.deptFullPathList || person.deptNameList || []).join(" / ") || "-"}
                  </div>
                </div>
                <button
                  type="button"
                  title="关闭"
                  aria-label="关闭"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                  onClick={() => setPerson(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 p-3">
                {authQuery.isLoading ? (
                  <DataSkeleton variant="table" rows={8} />
                ) : (
                  <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-2">
                    {/* 左：通道 */}
                    <div className="flex min-h-0 flex-col overflow-hidden rounded-twin-lg border border-[var(--twin-hairline)]">
                      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5">
                        <span className="text-xs font-semibold text-[var(--twin-ink)]">通道权限</span>
                        <span className="text-[10px] text-[var(--twin-mute)]">{channelAuths.length}</span>
                        <button
                          type="button"
                          className="ml-auto inline-flex h-6 items-center gap-0.5 rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 text-[11px] font-semibold text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                          onClick={() => openPicker("channel")}
                        >
                          <Plus className="h-3 w-3" />
                          添加
                        </button>
                      </div>
                      <div className="min-h-0 flex-1 overflow-auto">
                        {channelAuths.length === 0 ? (
                          <div className="px-2 py-8 text-center text-[11px] text-[var(--twin-mute)]">暂无通道权限</div>
                        ) : (
                          channelAuths.map((d) => (
                            <div
                              key={`${d.privilegeType}-${d.resourceCode}`}
                              className="flex items-center gap-2 border-t border-[var(--twin-hairline)] px-2 py-1.5 first:border-t-0"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[12px] font-medium text-[var(--twin-ink)]">
                                  {d.resourceName || d.resourceCode}
                                </div>
                                <div className="truncate text-[10px] text-[var(--twin-mute)]">
                                  {d.orgName || "-"}{d.timeQuantumName ? ` · ${d.timeQuantumName}` : ""}
                                </div>
                              </div>
                              <button
                                type="button"
                                title="回收通道权限"
                                aria-label="回收通道权限"
                                disabled={revokeMut.isPending}
                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--app-color-feedback-danger-ink)] hover:bg-[var(--app-color-feedback-danger-soft)] disabled:opacity-40"
                                onClick={() => void onRevoke(d.privilegeType, d.resourceCode, d.resourceName)}
                              >
                                {isRevoking(d.privilegeType, d.resourceCode) ? (
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 右：门组 */}
                    <div className="flex min-h-0 flex-col overflow-hidden rounded-twin-lg border border-[var(--twin-hairline)]">
                      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5">
                        <span className="text-xs font-semibold text-[var(--twin-ink)]">门组权限</span>
                        <span className="text-[10px] text-[var(--twin-mute)]">{groupAuths.length}</span>
                        <button
                          type="button"
                          className="ml-auto inline-flex h-6 items-center gap-0.5 rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 text-[11px] font-semibold text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                          onClick={() => openPicker("group")}
                        >
                          <Plus className="h-3 w-3" />
                          添加
                        </button>
                      </div>
                      <div className="min-h-0 flex-1 overflow-auto">
                        {groupAuths.length === 0 ? (
                          <div className="px-2 py-8 text-center text-[11px] text-[var(--twin-mute)]">暂无门组权限</div>
                        ) : (
                          groupAuths.map((d) => (
                            <div
                              key={`${d.privilegeType}-${d.resourceCode}`}
                              className="flex items-center gap-2 border-t border-[var(--twin-hairline)] px-2 py-1.5 first:border-t-0"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[12px] font-medium text-[var(--twin-ink)]">
                                  {d.resourceName || d.resourceCode}
                                </div>
                                <div className="truncate text-[10px] text-[var(--twin-mute)]">
                                  {d.orgName || "-"}{d.timeQuantumName ? ` · ${d.timeQuantumName}` : ""}
                                </div>
                              </div>
                              <button
                                type="button"
                                title="回收门组权限"
                                aria-label="回收门组权限"
                                disabled={revokeMut.isPending}
                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--app-color-feedback-danger-ink)] hover:bg-[var(--app-color-feedback-danger-soft)] disabled:opacity-40"
                                onClick={() => void onRevoke(d.privilegeType, d.resourceCode, d.resourceName)}
                              >
                                {isRevoking(d.privilegeType, d.resourceCode) ? (
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* 选择门禁/门组 */}
      {pickerOpen && person && (
        <Portal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="flex max-h-[86vh] w-full max-w-4xl flex-col rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--twin-hairline)] p-3">
                <div className="text-sm font-semibold text-[var(--twin-ink)]">
                  {pickerOpen === "channel" ? "添加通道门禁" : "添加门组门禁"}
                  <span className="ml-2 text-xs font-normal text-[var(--twin-mute)]">已选 {picked.length}</span>
                </div>
                <AdminButton tone="ghost" onClick={() => setPickerOpen(null)}>取消</AdminButton>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3">
                {pickerOpen === "channel" ? (
                  <DahuaChannelListPicker
                    selected={picked}
                    onChange={setPicked}
                    fetchChannels={fetchDahuaDoorChannels}
                    idPrefix="person-auth-channel"
                    listMaxHeightClass="max-h-[54vh]"
                    showSelectAll
                  />
                ) : (
                  <TransferListPicker
                    options={groupOptions}
                    selected={picked}
                    onChange={setPicked}
                    idPrefix="person-auth-group"
                    availableLabel="可选门组"
                    pickedLabel="已选门组"
                    availableSearchPlaceholder="搜索可选门组"
                    pickedSearchPlaceholder="搜索已选门组"
                    listMaxHeightClass="max-h-[54vh]"
                    showSelectAll
                  />
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-[var(--twin-hairline)] p-3">
                <span className="mr-auto text-xs text-[var(--twin-mute)]">
                  已在权限内的项不会重复下发
                </span>
                <AdminButton onClick={confirmAdd} loading={authorizeMut.isPending}>确认添加</AdminButton>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </AdminPageShell>
  );
}
