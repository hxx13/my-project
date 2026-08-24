/**
 * 笼位字段字典管理工作台（单个 dictKey 的字段管理，对齐 NhpFieldWorkbench）。
 * 左侧「域 → 子模块 → 字段」三层树（结构来自字典套 structure_json），右侧字段详情 + 状态机。
 * 数据走 cage_info_field + cage_info_field_dictionary。
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import FolderTreeManager, { type FolderAction, type FolderTreeGroup } from "@/features/form-shared/FolderTreeManager";
import { CAGE_FIELD_FOLDER_LABELS } from "../utils/cageFolderLabels";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import {
  addCageDomain,
  addCageSubmodule,
  approveCageField,
  createCageInfoField,
  deleteCageDomain,
  deleteCageInfoField,
  deleteCageSubmodule,
  fetchCageInfoCodelists,
  fetchCageInfoFields,
  fetchCageStructure,
  publishCageInfoFields,
  rejectCageField,
  renameCageDomain,
  renameCageSubmodule,
  submitCageFieldReview,
  unfreezeCageField,
  updateCageInfoField,
  type CageInfoField,
  type CageInfoFieldPayload,
  type CageStructureDomain,
} from "../api/cageForm.api";
import { CAGE_DICT_KEY } from "./CageFieldDictWorkbench";
import { CageFormModalPortal } from "./CageFormModalPortal";
import { FIELD_TYPES, compatibleTypesFor, typeLabelOf } from "@/features/nhp/schema/typeRegistry";
import "@/features/aup/aup.css";

const DATA_TYPES = [
  { value: "STRING", label: "字符" },
  { value: "TEXT", label: "文本" },
  { value: "INTEGER", label: "整数" },
  { value: "DECIMAL", label: "数值" },
  { value: "DATE", label: "日期" },
  { value: "DATETIME", label: "日期时间" },
  { value: "BOOLEAN", label: "布尔" },
  { value: "ENUM", label: "枚举" },
  { value: "ENUM_MULTI", label: "枚举多选" },
  { value: "CALC", label: "计算" },
  { value: "FILE", label: "文件" },
];

const REQUIRED_OPTS = [
  { value: "YES", label: "是" },
  { value: "NO", label: "否" },
];

/**
 * 字段角色（与 NHP FieldRole 同语义，取值引擎一律占位）：
 * VALUE=可填写/选择；DERIVED=自动获取只读；PK=取号只读；FK=实体只读。
 * PK/FK/DERIVED 的取值引擎未接入：占位角色只保证「详情弹窗只读 + 拒绝手动写入」，
 * 不调用 NHP 取号器，值仅可来自外部同步或后续接入的笼位自有引擎。
 */
const ROLE_OPTS = [
  { value: "VALUE", label: "VALUE 可填写 / 选择" },
  { value: "DERIVED", label: "DERIVED 自动获取（只读）" },
  { value: "PK", label: "PK 取号（占位，引擎未接入）" },
  { value: "FK", label: "FK 实体（占位）" },
];

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿",
  PENDING_REVIEW: "待校对",
  FROZEN: "已冻结",
  RETIRED: "已退役",
};

function dataTypeLabel(t?: string | null): string {
  return DATA_TYPES.find((x) => x.value === t)?.label ?? t ?? "—";
}

function fieldTypeLabel(t?: string | null): string {
  return (t && typeLabelOf(t as never)) || t || "—";
}

function defaultTypeFor(dataType: string): string {
  const compat = compatibleTypesFor(dataType);
  return compat.length > 0 ? compat[0] : "text";
}

function requiredLabel(r?: string | null): string {
  return REQUIRED_OPTS.find((x) => x.value === r)?.label ?? r ?? "—";
}

function statusLabel(s?: string | null): string {
  return (s && STATUS_LABEL[s]) || s || "—";
}

function roleLabel(r?: string | null): string {
  return ROLE_OPTS.find((x) => x.value === r)?.label ?? r ?? "—";
}

type FieldForm = {
  canonical: string;
  label: string;
  dataType: string;
  fieldType: string;
  dictKey: string;
  domainCode: string;
  submoduleCode: string;
  role: string;
  required: string;
  sort: string;
};

const emptyForm = (): FieldForm => ({
  canonical: "",
  label: "",
  dataType: "STRING",
  fieldType: "text",
  dictKey: "",
  domainCode: "",
  submoduleCode: "",
  role: "VALUE",
  required: "NO",
  sort: "",
});

export interface CageFieldWorkbenchProps {
  dictKey?: string;
  keyword: string;
  onKeywordChange: (v: string) => void;
  onStatsChange?: (stats: {
    filteredCount: number;
    publishedCount: number;
    folderCount: number;
    publishPending: boolean;
  }) => void;
}

export type CageFieldWorkbenchHandle = {
  openCreate: () => void;
  openCreateDomain: () => void;
  publish: () => void;
  openCodelist: () => void;
};

const CageFieldWorkbench = forwardRef<CageFieldWorkbenchHandle, CageFieldWorkbenchProps>(function CageFieldWorkbench(
  { dictKey, keyword, onStatsChange },
  ref,
) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const dictLabel = (dictKey || CAGE_DICT_KEY).trim() || CAGE_DICT_KEY;

  const role = authStorage.getRole() || "";
  const canMaintain = hasMinRole(role, "ADMIN");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [domainOpen, setDomainOpen] = useState(false);
  const [submoduleOpen, setSubmoduleOpen] = useState(false);
  const [form, setForm] = useState<FieldForm>(emptyForm());
  const [domainForm, setDomainForm] = useState({ code: "", name: "", parentDomain: "" });
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const fieldsQuery = useQuery({ queryKey: ["cage-info", "fields"], queryFn: fetchCageInfoFields });
  const codelistsQuery = useQuery({ queryKey: ["cage-info", "codelists"], queryFn: fetchCageInfoCodelists });
  const structureQuery = useQuery({
    queryKey: ["cage-info", "structure", dictLabel],
    queryFn: () => fetchCageStructure(dictLabel),
  });

  const fields = fieldsQuery.data ?? [];
  const codelists = codelistsQuery.data ?? [];
  const domains = structureQuery.data?.domains ?? [];

  const codelistByCode = useMemo(() => {
    const m = new Map<string, (typeof codelists)[number]>();
    codelists.forEach((c) => m.set(c.code, c));
    return m;
  }, [codelists]);
  const publishedCount = useMemo(() => fields.filter((f) => f.published).length, [fields]);

  const q = keyword.trim().toLowerCase();
  const filtered = useMemo(() => {
    let list = fields;
    if (q) {
      list = fields.filter(
        (f) =>
          (f.canonical || "").toLowerCase().includes(q) ||
          (f.label || "").toLowerCase().includes(q) ||
          (f.dictKey || "").toLowerCase().includes(q) ||
          (f.domainCode || "").toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "ALL") {
      list = list.filter((f) => (f.status || "DRAFT") === statusFilter);
    }
    return list;
  }, [fields, q, statusFilter]);

  const filteredIds = useMemo(() => new Set(filtered.map((f) => f.id)), [filtered]);

  const fieldById = useMemo(() => {
    const m = new Map<number, CageInfoField>();
    fields.forEach((f) => m.set(f.id, f));
    return m;
  }, [fields]);

  const fieldDomain = (f: CageInfoField): string => (f.domainCode || "").trim().toUpperCase();

  /** 结构树：域 → 子模块 → 字段 */
  const folderTreeGroups = useMemo((): FolderTreeGroup<{ id: string; field: CageInfoField }>[] => {
    const groups: FolderTreeGroup<{ id: string; field: CageInfoField }>[] = [];
    for (const domain of domains) {
      const domainKey = `D:${domain.code}`;
      const domainFields = filtered.filter((f) => fieldDomain(f) === domain.code && !(f.submoduleCode || "").trim());
      const children: FolderTreeGroup<{ id: string; field: CageInfoField }>[] = [];
      for (const sub of domain.submodules ?? []) {
        const subKey = `S:${sub.code}`;
        const subFields = filtered.filter((f) => (f.submoduleCode || "").trim().toUpperCase() === sub.code);
        children.push({
          key: subKey,
          label: `${sub.name}（${sub.code}）`,
          mutable: true,
          items: subFields.map((f) => ({ id: String(f.id), field: f })),
          emptyHint: "空子模块",
          emptyActionLabel: "新建字段",
        });
      }
      groups.push({
        key: domainKey,
        label: `${domain.name}（${domain.code}）`,
        mutable: true,
        items: domainFields.map((f) => ({ id: String(f.id), field: f })),
        children,
        emptyHint: "空数据域",
        emptyActionLabel: "新建字段",
      });
    }
    // 无域归属的字段挂「未分类」
    const ungrouped = filtered.filter((f) => !fieldDomain(f));
    if (ungrouped.length > 0) {
      groups.push({
        key: "U",
        label: "未分类",
        mutable: false,
        items: ungrouped.map((f) => ({ id: String(f.id), field: f })),
      });
    }
    return groups;
  }, [domains, filtered]);

  const folderCount = useMemo(() => {
    let n = 0;
    for (const d of domains) {
      n += 1;
      n += (d.submodules?.length ?? 0);
    }
    return n;
  }, [domains]);

  const selected = useMemo(() => fieldById.get(selectedId ?? -1) ?? null, [fieldById, selectedId]);
  const isSynced = !!selected?.syncSource;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cage-info", "fields"] });
    void qc.invalidateQueries({ queryKey: ["cage-info", "structure", dictLabel] });
  };

  const openCreateInDomain = (domainCode: string, submoduleCode?: string) => {
    setForm({
      ...emptyForm(),
      domainCode: domainCode,
      submoduleCode: submoduleCode || "",
    });
    setCreateOpen(true);
  };

  // ── 域/子模块 弹层 ──
  const openCreateDomain = () => {
    setDomainForm({ code: "", name: "", parentDomain: "" });
    setDomainOpen(true);
  };
  const openCreateSubmodule = (domainCode: string) => {
    setDomainForm({ code: `${domainCode}.01`, name: "", parentDomain: domainCode });
    setSubmoduleOpen(true);
  };

  const addDomainMut = useMutation({
    mutationFn: (body: { code: string; name: string }) => addCageDomain(dictLabel, body),
    onSuccess: () => {
      toast.success("已新建数据域");
      setDomainOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "新建数据域失败"),
  });

  const addSubmoduleMut = useMutation({
    mutationFn: (body: { domainCode: string; code: string; name: string }) => addCageSubmodule(dictLabel, body),
    onSuccess: () => {
      toast.success("已新建子模块");
      setSubmoduleOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "新建子模块失败"),
  });

  const handleRenameDomain = async (domainCode: string) => {
    const name = (await appPrompt("重命名数据域", ""))?.trim() ?? "";
    if (!name) return;
    try {
      await renameCageDomain(dictLabel, domainCode, { name });
      toast.success("已重命名");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message || "重命名失败");
    }
  };

  const handleRenameSubmodule = async (submoduleCode: string) => {
    const name = (await appPrompt("重命名子模块", ""))?.trim() ?? "";
    if (!name) return;
    try {
      await renameCageSubmodule(dictLabel, submoduleCode, { name });
      toast.success("已重命名");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message || "重命名失败");
    }
  };

  const handleDeleteDomain = async (domainCode: string) => {
    const inDomain = fields.filter((f) => fieldDomain(f) === domainCode);
    if (inDomain.length > 0) {
      if (!(await appConfirm(`数据域 ${domainCode} 下有 ${inDomain.length} 个字段，删除将一并删除这些字段。继续？`))) return;
      try {
        await deleteCageDomain(dictLabel, domainCode, true);
        toast.success("已删除数据域");
        invalidate();
      } catch (e) {
        toast.error((e as Error).message || "删除失败");
      }
      return;
    }
    if (!(await appConfirm(`删除数据域「${domainCode}」？`))) return;
    try {
      await deleteCageDomain(dictLabel, domainCode, false);
      toast.success("已删除数据域");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message || "删除失败");
    }
  };

  const handleDeleteSubmodule = async (submoduleCode: string) => {
    const inSub = fields.filter((f) => (f.submoduleCode || "").trim().toUpperCase() === submoduleCode);
    if (inSub.length > 0) {
      if (!(await appConfirm(`子模块 ${submoduleCode} 下有 ${inSub.length} 个字段，删除将一并删除。继续？`))) return;
      try {
        await deleteCageSubmodule(dictLabel, submoduleCode, true);
        toast.success("已删除子模块");
        invalidate();
      } catch (e) {
        toast.error((e as Error).message || "删除失败");
      }
      return;
    }
    if (!(await appConfirm(`删除子模块「${submoduleCode}」？`))) return;
    try {
      await deleteCageSubmodule(dictLabel, submoduleCode, false);
      toast.success("已删除子模块");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message || "删除失败");
    }
  };

  const createMut = useMutation({
    mutationFn: (body: CageInfoFieldPayload & { canonical: string; label: string; dataType: string; required: string }) =>
      createCageInfoField(body),
    onSuccess: (f) => {
      toast.success("已新建字段");
      setCreateOpen(false);
      setForm(emptyForm());
      invalidate();
      setSelectedId(f.id);
    },
    onError: (e: Error) => toast.error(e.message || "新建失败"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: CageInfoFieldPayload }) => updateCageInfoField(id, patch),
    onSuccess: () => {
      toast.success("已保存字段");
      setEditOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCageInfoField(id),
    onSuccess: () => {
      toast.success("已删除字段");
      setSelectedId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败", { duration: 6000 }),
  });

  const publishMut = useMutation({
    mutationFn: () => publishCageInfoFields(),
    onSuccess: (r) => {
      toast.success(`已发布 ${r.affected} 个字段`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "发布失败"),
  });

  const fieldActionMut = useMutation({
    mutationFn: async ({ action, id }: { action: "submit" | "approve" | "reject" | "unfreeze"; id: number }) => {
      if (action === "submit") await submitCageFieldReview(id);
      else if (action === "approve") await approveCageField(id);
      else if (action === "reject") await rejectCageField(id);
      else await unfreezeCageField(id);
    },
    onSuccess: () => {
      toast.success("操作成功");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });

  const openCreate = () => openCreateInDomain("");

  const openEdit = () => {
    if (!selected) return;
    setForm({
      canonical: selected.canonical,
      label: selected.label ?? "",
      dataType: selected.dataType ?? "STRING",
      fieldType: selected.fieldType ?? defaultTypeFor(selected.dataType ?? "STRING"),
      dictKey: selected.dictKey ?? "",
      domainCode: selected.domainCode ?? "",
      submoduleCode: selected.submoduleCode ?? "",
      role: selected.role ?? "VALUE",
      required: selected.required ?? "NO",
      sort: selected.sort != null ? String(selected.sort) : "",
    });
    setEditOpen(true);
  };

  const submitCreate = () => {
    if (!form.canonical.trim()) {
      toast.error("规范名（canonical）不能为空");
      return;
    }
    if (!form.label.trim()) {
      toast.error("显示名不能为空");
      return;
    }
    createMut.mutate({
      canonical: form.canonical.trim(),
      label: form.label.trim(),
      dataType: form.dataType,
      fieldType: form.fieldType,
      dictKey: form.dictKey.trim() || undefined,
      domainCode: form.domainCode.trim() || undefined,
      submoduleCode: form.submoduleCode.trim() || undefined,
      role: form.role,
      required: form.required,
    });
  };

  const submitEdit = () => {
    if (!selected) return;
    if (!form.label.trim()) {
      toast.error("显示名不能为空");
      return;
    }
    updateMut.mutate({
      id: selected.id,
      patch: {
        label: form.label.trim(),
        dataType: form.dataType,
        fieldType: form.fieldType || null,
        dictKey: form.dictKey.trim() || null,
        domainCode: form.domainCode.trim() || undefined,
        submoduleCode: form.submoduleCode.trim() || undefined,
        role: form.role,
        required: form.required,
        sort: form.sort.trim() === "" ? null : Number(form.sort),
      },
    });
  };

  const confirmDelete = async () => {
    if (!selected) return;
    if (isSynced) {
      toast.error("系统同步字段不可删除");
      return;
    }
    if (!(await appConfirm(`确定删除字段「${selected.label || selected.canonical}」？`))) return;
    deleteMut.mutate(selected.id);
  };

  const confirmPublish = async () => {
    if (!(await appConfirm("发布全部字段？未发布字段都会标记为已发布（冻结）。"))) return;
    publishMut.mutate();
  };

  const openCodelist = (code?: string | null) => {
    const path = code
      ? `/admin/cage-shelves/forms/codelists?code=${encodeURIComponent(code)}`
      : "/admin/cage-shelves/forms/codelists";
    navigate(toAdminRoutePath(path));
  };

  useImperativeHandle(
    ref,
    () => ({
      openCreate,
      openCreateDomain,
      publish: () => void confirmPublish(),
      openCodelist: () => openCodelist(selected?.dictKey),
    }),
    [selected?.dictKey],
  );

  useEffect(() => {
    onStatsChange?.({
      filteredCount: filtered.length,
      publishedCount,
      folderCount,
      publishPending: publishMut.isPending,
    });
  }, [filtered.length, publishedCount, folderCount, publishMut.isPending, onStatsChange]);

  const row = (label: string, input: ReactNode) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <label style={{ fontSize: 13, color: "var(--muted)", width: 88, flexShrink: 0, paddingTop: 8 }}>{label}</label>
      <div style={{ flex: 1 }}>{input}</div>
    </div>
  );

  const dictKeySelect = (
    <>
      <select
        className="select"
        value={form.dictKey}
        onChange={(e) => setForm({ ...form, dictKey: e.target.value })}
        disabled={codelistsQuery.isLoading}
      >
        <option value="">（无）</option>
        {form.dictKey && !codelists.some((c) => c.code === form.dictKey) && (
          <option value={form.dictKey}>{form.dictKey}（当前绑定，不在列表中）</option>
        )}
        {[...codelists]
          .sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, "zh-CN"))
          .map((c) => (
            <option key={c.code} value={c.code}>
              {c.name?.trim() ? `${c.name}（${c.code}）` : c.code}
            </option>
          ))}
      </select>
      {!codelistsQuery.isLoading && codelists.length === 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
          暂无码表。请先在
          <button type="button" onClick={() => openCodelist()} style={{ color: "var(--primary)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>
            码表管理
          </button>
          新建。
        </div>
      )}
    </>
  );

  const domainSelect = (
    <select
      className="select"
      value={form.domainCode}
      onChange={(e) => setForm({ ...form, domainCode: e.target.value, submoduleCode: "" })}
    >
      <option value="">（未分类）</option>
      {domains.map((d) => (
        <option key={d.code} value={d.code}>
          {d.name}（{d.code}）
        </option>
      ))}
    </select>
  );

  const submoduleSelect = (
    <select
      className="select"
      value={form.submoduleCode}
      onChange={(e) => setForm({ ...form, submoduleCode: e.target.value })}
    >
      <option value="">（无子模块）</option>
      {(domains.find((d) => d.code === form.domainCode)?.submodules ?? []).map((s) => (
        <option key={s.code} value={s.code}>
          {s.name}（{s.code}）
        </option>
      ))}
    </select>
  );

  const metaCell = (label: string, value: ReactNode, opts?: { mono?: boolean; wrap?: boolean }) => (
    <div className="aup-wb-meta-cell">
      <label>{label}</label>
      <div className={`val${opts?.mono ? " mono" : ""}${opts?.wrap ? " wrap" : ""}`} title={typeof value === "string" ? value : undefined}>
        {value || "—"}
      </div>
    </div>
  );

  const aside = (
    <FolderTreeManager<{ id: string; field: CageInfoField }>
      folders={folderTreeGroups}
      selectedItemId={selectedId != null ? String(selectedId) : null}
      onSelectItem={(id) => setSelectedId(Number(id))}
      loading={fieldsQuery.isLoading || structureQuery.isLoading}
      canMaintain={canMaintain}
      ungroupedKey="U"
      collapsedFolders={collapsedFolders}
      onCollapsedFoldersChange={setCollapsedFolders}
      labels={CAGE_FIELD_FOLDER_LABELS}
      folderActions={(folderKey, depth): FolderAction[] => {
        if (folderKey === "U") return ["createItem"];
        if (folderKey.startsWith("D:")) return ["createItem", "createFolder", "rename", "delete"];
        return ["createItem", "rename", "delete"];
      }}
      isFolderDeletable={(group, totalCount) => group.key !== "U" && totalCount === 0}
      itemActions={() => []}
      onCreateFolder={(folderKey) => {
        if (folderKey?.startsWith("D:")) openCreateSubmodule(folderKey.slice(2));
        else openCreateDomain();
      }}
      onCreateItem={(folderKey) => {
        if (folderKey === "U") openCreateInDomain("");
        else if (folderKey.startsWith("D:")) openCreateInDomain(folderKey.slice(2));
        else openCreateInDomain(folderKey.slice(2).split(".")[0], folderKey.slice(2));
      }}
      onRenameFolder={(folderKey) => {
        if (folderKey.startsWith("D:")) void handleRenameDomain(folderKey.slice(2));
        else void handleRenameSubmodule(folderKey.slice(2));
      }}
      onDeleteFolder={(folderKey) => {
        if (folderKey.startsWith("D:")) void handleDeleteDomain(folderKey.slice(2));
        else void handleDeleteSubmodule(folderKey.slice(2));
      }}
      headerHint="域码是表码/id（D1、D2…）；子模块编码 Dn.mm；字段挂域或子模块。域与子模块存于字典套 structure_json。"
      emptyState={
        <div style={{ padding: 28, textAlign: "center" }}>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 8, lineHeight: 1.55 }}>
            尚无字段：先建<strong>数据域</strong>，再在域内建<strong>子模块</strong>与字段。
          </div>
          {canMaintain && !q && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn primary small" onClick={() => openCreateDomain()}>
                ＋ 新建数据域
              </button>
              <button type="button" className="btn ghost small" onClick={() => openCreateInDomain("")}>
                ＋ 新建字段
              </button>
            </div>
          )}
        </div>
      }
      renderItem={(item) => {
        const f = item.field;
        return (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lbl">{f.label || f.canonical}</div>
              <div className="meta" style={{ marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
                {f.canonical}
              </div>
            </div>
            <span className="aup-wb-chip muted">{statusLabel(f.status)}</span>
          </>
        );
      }}
    />
  );

  const main = (
    <>
      {!selected && <div className="aup-wb-empty">从左侧选一个字段看详情</div>}

      {selected && (
        <div className="aup-wb-panel">
          <div className="aup-wb-panel-hd">
            <span className="title">{selected.label || selected.canonical}</span>
            <span className="aup-wb-chip" style={{ fontFamily: "ui-monospace, monospace" }}>
              {selected.canonical}
            </span>
            <span className="aup-wb-chip muted">{statusLabel(selected.status)}</span>
            {isSynced && <span className="aup-wb-chip muted">系统同步</span>}
            <div style={{ flex: 1 }} />
            {canMaintain && (
              <>
                {selected.status === "DRAFT" && (
                  <button className="btn small ghost" onClick={() => fieldActionMut.mutate({ action: "submit", id: selected.id })}>
                    提交校对
                  </button>
                )}
                {selected.status === "PENDING_REVIEW" && (
                  <>
                    <button className="btn small primary" onClick={() => fieldActionMut.mutate({ action: "approve", id: selected.id })}>
                      通过并冻结
                    </button>
                    <button className="btn small ghost" onClick={() => fieldActionMut.mutate({ action: "reject", id: selected.id })}>
                      驳回
                    </button>
                  </>
                )}
                {selected.status === "FROZEN" && (
                  <button className="btn small ghost" onClick={() => fieldActionMut.mutate({ action: "unfreeze", id: selected.id })}>
                    解冻
                  </button>
                )}
                <button className="btn small ghost" onClick={openEdit}>
                  ✎ 编辑
                </button>
                <button
                  className="btn small danger"
                  disabled={deleteMut.isPending || isSynced}
                  title={isSynced ? "系统同步字段不可删除" : "删除该字段"}
                  onClick={() => void confirmDelete()}
                >
                  删除
                </button>
              </>
            )}
          </div>

          <div className="aup-wb-meta-grid">
            {metaCell("规范名", selected.canonical, { mono: true })}
            {metaCell("显示名", selected.label)}
            {metaCell("数据类型", dataTypeLabel(selected.dataType))}
            {metaCell("题型", fieldTypeLabel(selected.fieldType))}
            {metaCell("数据域", selected.domainCode || "—", { mono: true })}
            {metaCell("子模块", selected.submoduleCode || "—", { mono: true })}
            {metaCell(
              "码表键",
              selected.dictKey ? (
                <button type="button" onClick={() => openCodelist(selected.dictKey)} style={{ color: "var(--primary)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  {(() => {
                    const cl = codelistByCode.get(selected.dictKey!);
                    return cl?.name?.trim() ? `${cl.name}（${selected.dictKey}）` : selected.dictKey;
                  })()}
                </button>
              ) : (
                "—"
              ),
            )}
            {metaCell("必填", requiredLabel(selected.required))}
            {metaCell("字段角色", roleLabel(selected.role))}
            {metaCell("排序", selected.sort != null ? String(selected.sort) : "—", { mono: true })}
            {metaCell("状态", statusLabel(selected.status))}
            {metaCell("同步来源", selected.syncSource || "—", { wrap: true, mono: true })}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            字段字典表 <code>cage_info_field</code> · 字段套 <code>{dictLabel}</code>。编辑可改 label / dataType / dictKey /
            domainCode / submoduleCode / required / role / sort；canonical 与同步来源不可改。
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="aup-app aup-app--workbench cage-form-wb min-h-0 flex-1">
      <div className="aup-wb">
        <div className="aup-wb-split aup-wb-split--wide-aside">
          <aside className="aup-wb-aside">{aside}</aside>
          <div className="aup-wb-main">{main}</div>
        </div>
      </div>

      {/* 新建字段 */}
      {createOpen && (
        <CageFormModalPortal>
          <div className="aup-modal-mask" onClick={() => setCreateOpen(false)}>
            <div className="aup-modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
              <h3>新建字段</h3>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                新建为自定义字段（无 ARO 同步来源），默认未发布（草稿）。
              </p>
              {row("规范名", <input className="input" placeholder="如 remark_extra（canonical，唯一）" value={form.canonical} onChange={(e) => setForm({ ...form, canonical: e.target.value })} />)}
              {row("显示名", <input className="input" placeholder="中文显示名" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />)}
              {row("数据类型", <select className="select" value={form.dataType} onChange={(e) => setForm({ ...form, dataType: e.target.value, fieldType: defaultTypeFor(e.target.value) })}>{DATA_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>)}
              {row("题型", <select className="select" value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value })}>{compatibleTypesFor(form.dataType).map((t) => <option key={t} value={t}>{typeLabelOf(t as never)}</option>)}</select>)}
              {row("码表键", dictKeySelect)}
              {row("数据域", domainSelect)}
              {form.domainCode && row("子模块", submoduleSelect)}
              {row("必填", <select className="select" value={form.required} onChange={(e) => setForm({ ...form, required: e.target.value })}>{REQUIRED_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>)}
              {row("字段角色", <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>)}
              <div className="aup-modal-actions">
                <button className="btn ghost" onClick={() => setCreateOpen(false)}>取消</button>
                <button className="btn primary" disabled={!form.canonical.trim() || !form.label.trim() || createMut.isPending} onClick={submitCreate}>确定</button>
              </div>
            </div>
          </div>
        </CageFormModalPortal>
      )}

      {/* 编辑字段 */}
      {editOpen && selected && (
        <CageFormModalPortal>
          <div className="aup-modal-mask" onClick={() => setEditOpen(false)}>
            <div className="aup-modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
              <h3>编辑字段</h3>
              {row("规范名", <input className="input" value={form.canonical} disabled />)}
              {row("显示名", <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />)}
              {row("数据类型", <select className="select" value={form.dataType} onChange={(e) => setForm({ ...form, dataType: e.target.value, fieldType: defaultTypeFor(e.target.value) })}>{DATA_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>)}
              {row("题型", <select className="select" value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value })}>{compatibleTypesFor(form.dataType).map((t) => <option key={t} value={t}>{typeLabelOf(t as never)}</option>)}</select>)}
              {row("码表键", dictKeySelect)}
              {row("数据域", domainSelect)}
              {form.domainCode && row("子模块", submoduleSelect)}
              {row("必填", <select className="select" value={form.required} onChange={(e) => setForm({ ...form, required: e.target.value })}>{REQUIRED_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>)}
              {row("字段角色", <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>)}
              {row("排序", <input className="input" placeholder="数值，留空为 null" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} />)}
              <div className="aup-modal-actions">
                <button className="btn ghost" onClick={() => setEditOpen(false)}>取消</button>
                <button className="btn primary" disabled={!form.label.trim() || updateMut.isPending} onClick={submitEdit}>保存</button>
              </div>
            </div>
          </div>
        </CageFormModalPortal>
      )}

      {/* 新建数据域 */}
      {domainOpen && (
        <CageFormModalPortal>
          <div className="aup-modal-mask" onClick={() => setDomainOpen(false)}>
            <div className="aup-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
              <h3>新建数据域</h3>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                数据域是字段的一级文件夹，编码须为 Dn（如 D6）。域码是表码/id，与展示顺序无关。
              </p>
              {row("域编码", <input className="input" placeholder="如 D6" value={domainForm.code} onChange={(e) => setDomainForm({ ...domainForm, code: e.target.value.toUpperCase() })} />)}
              {row("显示名", <input className="input" placeholder="如 免疫信息" value={domainForm.name} onChange={(e) => setDomainForm({ ...domainForm, name: e.target.value })} />)}
              <div className="aup-modal-actions">
                <button className="btn ghost" onClick={() => setDomainOpen(false)}>取消</button>
                <button className="btn primary" disabled={!domainForm.code.trim() || addDomainMut.isPending} onClick={() => addDomainMut.mutate({ code: domainForm.code.trim(), name: domainForm.name.trim() || `数据域 ${domainForm.code.trim()}` })}>创建</button>
              </div>
            </div>
          </div>
        </CageFormModalPortal>
      )}

      {/* 新建子模块 */}
      {submoduleOpen && (
        <CageFormModalPortal>
          <div className="aup-modal-mask" onClick={() => setSubmoduleOpen(false)}>
            <div className="aup-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
              <h3>新建子模块</h3>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                子模块是域下的二级文件夹，编码须为 Dn.mm（如 D6.01），且须以所属域开头。
              </p>
              {row("所属域", <input className="input" value={domainForm.parentDomain} disabled />)}
              {row("子模块编码", <input className="input" placeholder="如 D6.01" value={domainForm.code} onChange={(e) => setDomainForm({ ...domainForm, code: e.target.value.toUpperCase() })} />)}
              {row("显示名", <input className="input" placeholder="如 移植信息" value={domainForm.name} onChange={(e) => setDomainForm({ ...domainForm, name: e.target.value })} />)}
              <div className="aup-modal-actions">
                <button className="btn ghost" onClick={() => setSubmoduleOpen(false)}>取消</button>
                <button className="btn primary" disabled={!domainForm.code.trim() || addSubmoduleMut.isPending} onClick={() => addSubmoduleMut.mutate({ domainCode: domainForm.parentDomain, code: domainForm.code.trim(), name: domainForm.name.trim() || `子模块 ${domainForm.code.trim()}` })}>创建</button>
              </div>
            </div>
          </div>
        </CageFormModalPortal>
      )}
    </div>
  );
});

export default CageFieldWorkbench;
