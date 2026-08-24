import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  approveAupField,
  createAupField,
  createAupFolder,
  deleteAupField,
  deleteAupFolder,
  extractAupFieldsFromTemplate,
  fetchAupDicts,
  fetchAupFieldUsage,
  fetchAupFields,
  listAupFolders,
  moveAupField,
  rejectAupField,
  submitAupFieldReview,
  unfreezeAupField,
  updateAupField,
  updateAupFolder,
  type AupFieldVO,
  type AupFolderVO,
} from "@/features/aup/api/aup.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import FolderTreeManager, { type FolderAction, type FolderTreeGroup } from "@/features/form-shared/FolderTreeManager";
import { AUP_FIELD_FOLDER_LABELS } from "@/features/aup/utils/aupFolderLabels";
import { FIELD_TYPES } from "@/features/aup/schema/typeRegistry";
import "@/features/aup/aup.css";

/* =====================================================================
 * AUP 字段域工作台。
 *  - 左栏：aup_folder(ownerType=FIELD) 多级文件夹树 + 字段列表
 *  - 右栏：字段详情（编码/题面/题型/码表/必填/引用）+ 状态机按钮
 *  - 顶部：「从模板抽取字段」把已发布计划书模板字段反向入库
 * ================================================================== */

const UNGROUPED = "未分类";
const OWNER_TYPE = "FIELD";

/** 值域类题型：必须选码表（checkbox 为布尔开关、cascade 用 config.levels，均豁免） */
const VALUE_DOMAIN_TYPES = new Set(["choice", "select"]);

const TYPE_LABELS: Record<string, string> = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label]));

function statusMeta(status?: string): { text: string; bg: string; color: string } {
  switch ((status ?? "").toUpperCase()) {
    case "PUBLISHED":
      return { text: "已发布", bg: "#e8f7ee", color: "#16a34a" };
    case "PENDING_REVIEW":
      return { text: "待审核", bg: "#fff7ed", color: "#c2410c" };
    case "RETIRED":
      return { text: "已退役", bg: "#eef2f7", color: "#64748b" };
    case "DRAFT":
      return { text: "草稿", bg: "#eef2ff", color: "#002FA7" };
    default:
      return { text: status || "—", bg: "#eef2f7", color: "#64748b" };
  }
}

function typeLabel(t?: string): string {
  return (t && TYPE_LABELS[t]) || t || "—";
}

const folderKeyOf = (folderId?: number | null): string => (folderId == null ? UNGROUPED : String(folderId));
const folderIdOf = (key: string): number | undefined => (key === UNGROUPED ? undefined : Number(key));

type FieldTreeItem = { id: string; field: AupFieldVO };

function buildFieldTree(folders: AupFolderVO[], fields: AupFieldVO[]): FolderTreeGroup<FieldTreeItem>[] {
  const byFolder = new Map<number, AupFieldVO[]>();
  const ungrouped: AupFieldVO[] = [];
  for (const f of fields) {
    if (f.folderId != null) {
      const arr = byFolder.get(f.folderId) ?? [];
      arr.push(f);
      byFolder.set(f.folderId, arr);
    } else {
      ungrouped.push(f);
    }
  }
  const toGroup = (folder: AupFolderVO, depth = 0): FolderTreeGroup<FieldTreeItem> => ({
    key: String(folder.id),
    label: folder.name,
    mutable: true,
    items: (byFolder.get(folder.id) ?? []).map((f) => ({ id: String(f.id), field: f })),
    headerStyle: depth > 0 ? { paddingLeft: 28, fontSize: 12, color: "var(--slate)", fontWeight: 600 } : undefined,
    emptyHint: "空文件夹",
    emptyActionLabel: "新建字段",
    children: (folder.children ?? []).map((c) => toGroup(c, depth + 1)),
  });
  const top = (folders ?? []).map((f) => toGroup(f, 0));
  if (ungrouped.length > 0) {
    top.push({ key: UNGROUPED, label: UNGROUPED, mutable: false, items: ungrouped.map((f) => ({ id: String(f.id), field: f })) });
  }
  return top;
}

function countTreeFolders(groups: FolderTreeGroup[]): number {
  let n = 0;
  for (const g of groups) {
    if (g.key !== UNGROUPED) n += 1;
    n += countTreeFolders(g.children ?? []);
  }
  return n;
}

type FieldForm = {
  fieldCode: string;
  label: string;
  type: string;
  required: boolean;
  dictKey: string;
  description: string;
  folderKey: string;
};

const emptyForm = (folderKey: string): FieldForm => ({
  fieldCode: "",
  label: "",
  type: "text",
  required: false,
  dictKey: "",
  description: "",
  folderKey,
});

export default function AupFieldPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FieldForm>(emptyForm(UNGROUPED));

  const role = authStorage.getRole() || "";
  const canMaintain = hasMinRole(role, "ADMIN");

  const foldersQuery = useQuery({
    queryKey: ["aup", "folders", OWNER_TYPE],
    queryFn: () => listAupFolders(OWNER_TYPE),
  });
  const fieldsQuery = useQuery({
    queryKey: ["aup", "fields", "all"],
    queryFn: () => fetchAupFields({ size: 500 }),
  });
  const dictsQuery = useQuery({
    queryKey: ["aup", "dicts", "all"],
    queryFn: () => fetchAupDicts({ size: 500 }),
  });
  const usageQuery = useQuery({
    queryKey: ["aup", "field", "usage", selectedId],
    queryFn: () => fetchAupFieldUsage(selectedId!),
    enabled: selectedId != null,
  });

  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const fields = useMemo(() => fieldsQuery.data?.items ?? [], [fieldsQuery.data]);
  const dicts = useMemo(() => dictsQuery.data?.items ?? [], [dictsQuery.data]);

  const q = keyword.trim().toLowerCase();
  const filtered = useMemo(() => {
    return fields.filter((f) => {
      const st = (f.status ?? "DRAFT").toUpperCase();
      if (statusFilter !== "ALL" && st !== statusFilter) return false;
      if (!q) return true;
      return (
        (f.label || "").toLowerCase().includes(q) ||
        (f.fieldCode || "").toLowerCase().includes(q) ||
        (f.dictKey || "").toLowerCase().includes(q)
      );
    });
  }, [fields, q, statusFilter]);

  const folderTreeGroups = useMemo(
    (): FolderTreeGroup<FieldTreeItem>[] => buildFieldTree(folders, filtered),
    [folders, filtered],
  );
  const folderCount = useMemo(() => countTreeFolders(folderTreeGroups), [folderTreeGroups]);

  const selected = useMemo(
    () => fields.find((f) => f.id === selectedId) ?? null,
    [fields, selectedId],
  );

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ["aup", "fields"] });
    void qc.invalidateQueries({ queryKey: ["aup", "folders"] });
    if (selectedId != null) {
      void qc.invalidateQueries({ queryKey: ["aup", "field", "usage", selectedId] });
    }
  };

  /* ── 文件夹 CRUD ── */
  const createFolderMut = useMutation({
    mutationFn: (body: { parentId: number; name: string }) => createAupFolder({ ownerType: OWNER_TYPE, parentId: body.parentId, name: body.name }),
    onSuccess: () => {
      toast.success("已新建文件夹");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "新建文件夹失败"),
  });
  const renameFolderMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => updateAupFolder(id, { name }),
    onSuccess: () => {
      toast.success("已重命名");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "重命名失败"),
  });
  const deleteFolderMut = useMutation({
    mutationFn: (id: number) => deleteAupFolder(id),
    onSuccess: () => {
      toast.success("已删除文件夹");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "删除文件夹失败", { duration: 6000 }),
  });

  const handleCreateFolder = async (parentKey?: string) => {
    const name = (await appPrompt(parentKey ? "新建子文件夹" : "新建文件夹", ""))?.trim() ?? "";
    if (!name) return;
    createFolderMut.mutate({ parentId: parentKey ? folderIdOf(parentKey) ?? 0 : 0, name });
  };
  const handleRenameFolder = async (folderKey: string) => {
    if (folderKey === UNGROUPED) return;
    const f = folders.find((x) => String(x.id) === folderKey);
    const name = (await appPrompt("重命名文件夹", f?.name ?? ""))?.trim() ?? "";
    if (!name || name === f?.name) return;
    renameFolderMut.mutate({ id: Number(folderKey), name });
  };
  const handleDeleteFolder = async (folderKey: string) => {
    if (folderKey === UNGROUPED) return;
    const f = folders.find((x) => String(x.id) === folderKey);
    if (!f) return;
    if (!(await appConfirm(`确定删除空文件夹「${f.name}」？`))) return;
    deleteFolderMut.mutate(f.id);
  };

  /* ── 字段 CRUD / 状态机 ── */
  const createMut = useMutation({
    mutationFn: (body: { fieldCode: string; label: string; type: string; required: boolean; dictKey?: string; description?: string; folderId?: number }) =>
      createAupField(body),
    onSuccess: (f) => {
      toast.success("已新建字段");
      setFormOpen(null);
      invalidateAll();
      setSelectedId(f.id);
    },
    onError: (e: Error) => toast.error(e.message || "新建失败"),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { label: string; type: string; required: boolean; dictKey?: string; description?: string } }) =>
      updateAupField(id, body),
    onSuccess: () => {
      toast.success("已保存字段");
      setFormOpen(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });
  const moveMut = useMutation({
    mutationFn: ({ id, folderId }: { id: number; folderId?: number }) => moveAupField(id, { folderId }),
    onSuccess: () => {
      toast.success("已移动");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "移动失败"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAupField(id),
    onSuccess: () => {
      toast.success("已删除字段");
      setSelectedId(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "删除字段失败", { duration: 6000 }),
  });

  const submitMut = useMutation({
    mutationFn: (id: number) => submitAupFieldReview(id),
    onSuccess: () => {
      toast.success("已提交审核");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "提交失败"),
  });
  const approveMut = useMutation({
    mutationFn: (id: number) => approveAupField(id),
    onSuccess: () => {
      toast.success("已通过并发布");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "通过失败"),
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, comment }: { id: number; comment: string }) => rejectAupField(id, { comment }),
    onSuccess: () => {
      toast.success("已驳回为草稿");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "驳回失败"),
  });
  const unfreezeMut = useMutation({
    mutationFn: (id: number) => unfreezeAupField(id),
    onSuccess: () => {
      toast.success("已解冻为草稿");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "解冻失败", { duration: 8000 }),
  });

  const extractMut = useMutation({
    mutationFn: () => extractAupFieldsFromTemplate({ formKey: "aup" }),
    onSuccess: (r) => {
      toast.success(`已从模板抽取字段：新增 ${r.created ?? 0} 个，跳过 ${r.skipped ?? 0} 个（已存在）`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "抽取失败"),
  });

  const openCreate = (folderKey: string) => {
    setForm(emptyForm(folderKey));
    setFormOpen("create");
  };
  const openEdit = () => {
    if (!selected) return;
    setForm({
      fieldCode: selected.fieldCode,
      label: selected.label ?? "",
      type: selected.type ?? "text",
      required: !!selected.required,
      dictKey: selected.dictKey ?? "",
      description: selected.description ?? "",
      folderKey: folderKeyOf(selected.folderId),
    });
    setFormOpen("edit");
  };

  const submitForm = () => {
    if (!form.fieldCode.trim()) {
      toast.error("字段编码不能为空");
      return;
    }
    if (!form.label.trim()) {
      toast.error("题面（label）不能为空");
      return;
    }
    if (VALUE_DOMAIN_TYPES.has(form.type) && !form.dictKey.trim()) {
      toast.error("选择题 / 下拉选择题型必须选择码表");
      return;
    }
    const body = {
      fieldCode: form.fieldCode.trim(),
      label: form.label.trim(),
      type: form.type,
      required: form.required,
      dictKey: form.dictKey.trim() || undefined,
      description: form.description.trim() || undefined,
    };
    if (formOpen === "create") {
      createMut.mutate({ ...body, folderId: folderIdOf(form.folderKey) });
    } else if (formOpen === "edit" && selected) {
      updateMut.mutate({ id: selected.id, body });
    }
  };

  const confirmDeleteField = async () => {
    if (!selected) return;
    if (!(await appConfirm(`确定删除字段「${selected.label || selected.fieldCode}」？被原子域引用时后端将拒绝。`))) return;
    deleteMut.mutate(selected.id);
  };

  const row = (label: string, input: ReactNode) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <label style={{ fontSize: 13, color: "var(--muted)", width: 88, flexShrink: 0, paddingTop: 8 }}>{label}</label>
      <div style={{ flex: 1 }}>{input}</div>
    </div>
  );

  const metaCell = (label: string, value: ReactNode, opts?: { mono?: boolean; wrap?: boolean }) => (
    <div className="aup-wb-meta-cell">
      <label>{label}</label>
      <div className={`val${opts?.mono ? " mono" : ""}${opts?.wrap ? " wrap" : ""}`} title={typeof value === "string" ? value : undefined}>
        {value || "—"}
      </div>
    </div>
  );

  const st = statusMeta(selected?.status);
  const usageRefs = usageQuery.data?.refs ?? [];

  const STATUS_FILTERS = [
    { value: "ALL", label: "全部" },
    { value: "DRAFT", label: "草稿" },
    { value: "PENDING_REVIEW", label: "待审核" },
    { value: "PUBLISHED", label: "已发布" },
  ];

  const aside = (
    <FolderTreeManager
      folders={folderTreeGroups}
      selectedItemId={selectedId != null ? String(selectedId) : null}
      onSelectItem={(id) => {
        const hit = fields.find((f) => String(f.id) === id);
        if (hit) setSelectedId(hit.id);
      }}
      loading={fieldsQuery.isLoading || foldersQuery.isLoading}
      canMaintain={canMaintain}
      ungroupedKey={UNGROUPED}
      collapsedFolders={collapsedFolders}
      onCollapsedFoldersChange={setCollapsedFolders}
      deleteFolderPending={deleteFolderMut.isPending}
      headerHint="字段文件夹为多级结构（aup_folder，ownerType=FIELD）；只有已发布字段才允许被原子域引用。"
      labels={AUP_FIELD_FOLDER_LABELS}
      getItemLabel={(item) => item.field.label || item.id}
      folderActions={(folderKey): FolderAction[] =>
        folderKey === UNGROUPED ? ["createItem"] : ["createItem", "createFolder", "rename", "delete"]
      }
      isFolderDeletable={(group, totalCount) =>
        group.key !== UNGROUPED && totalCount === 0 && (group.children?.length ?? 0) === 0
      }
      itemActions={() => ["moveItem"]}
      onCreateFolder={canMaintain ? (parentKey) => void handleCreateFolder(parentKey) : undefined}
      onCreateSubFolder={canMaintain ? (parentKey) => void handleCreateFolder(parentKey) : undefined}
      onCreateItem={canMaintain ? (fk) => openCreate(fk) : undefined}
      onRenameFolder={canMaintain ? (fk) => void handleRenameFolder(fk) : undefined}
      onDeleteFolder={canMaintain ? (fk) => void handleDeleteFolder(fk) : undefined}
      onMoveItem={
        canMaintain
          ? (itemId, _from, toKey) => moveMut.mutate({ id: Number(itemId), folderId: folderIdOf(toKey) })
          : undefined
      }
      itemDataAttr={(item) => ({ "data-aup-field-code": item.field.fieldCode })}
      emptyState={
        <div style={{ padding: 28, textAlign: "center" }}>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 8, lineHeight: 1.55 }}>
            {q ? "无匹配字段或文件夹" : "尚无字段：先建文件夹，再在文件夹内新建字段，或从计划书模板抽取字段。"}
          </div>
          {canMaintain && !q && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn primary small" onClick={() => void handleCreateFolder()}>
                ＋ 新建文件夹
              </button>
              <button type="button" className="btn ghost small" onClick={() => openCreate(UNGROUPED)}>
                ＋ 新建字段
              </button>
            </div>
          )}
        </div>
      }
      renderItem={(item) => {
        const f = item.field;
        const sm = statusMeta(f.status);
        return (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lbl">{f.label}</div>
              <div className="meta" style={{ marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
                {f.fieldCode}
              </div>
            </div>
            <span className="aup-wb-chip muted" title={`被 ${f.refCount ?? 0} 个原子域引用`}>
              {f.refCount ?? 0}
            </span>
            <span className="aup-wb-chip" style={{ background: sm.bg, color: sm.color, fontSize: 10 }}>
              {sm.text}
            </span>
          </>
        );
      }}
    />
  );

  const main = (
    <>
      {selectedId == null && <div className="aup-wb-empty">从左侧选一个字段看详情</div>}
      {selectedId != null && selected == null && <div className="aup-wb-empty">加载字段…</div>}
      {selectedId != null && selected && (
        <div className="aup-wb-panel">
          <div className="aup-wb-panel-hd">
            <span className="title">{selected.label}</span>
            <span className="aup-wb-chip" style={{ fontFamily: "ui-monospace, monospace" }}>
              {selected.fieldCode}
            </span>
            <span className="aup-wb-chip" style={{ background: st.bg, color: st.color }}>
              {st.text}
            </span>
            {selected.dictKey && (
              <span className="aup-wb-chip muted" title="码表引用">
                {selected.dictKey}
              </span>
            )}
            <div style={{ flex: 1 }} />
            {canMaintain && (selected.status ?? "").toUpperCase() === "DRAFT" && (
              <button className="btn small ghost" onClick={openEdit}>
                ✎ 编辑
              </button>
            )}
            {canMaintain && (selected.status ?? "").toUpperCase() === "PUBLISHED" && (
              <button
                className="btn small ghost"
                disabled={unfreezeMut.isPending}
                title="无原子域引用时可解冻为草稿"
                onClick={async () => {
                  if (await appConfirm("解冻该字段为草稿？仅当无原子域引用时允许。确认？")) unfreezeMut.mutate(selected.id);
                }}
              >
                解冻
              </button>
            )}
            {canMaintain && (selected.status ?? "").toUpperCase() === "DRAFT" && (
              <button
                className="btn small primary"
                disabled={submitMut.isPending}
                onClick={async () => {
                  if (await appConfirm("提交审核后进入待审核。审核人可在本页通过或驳回。确认？")) submitMut.mutate(selected.id);
                }}
              >
                提交审核
              </button>
            )}
            {canMaintain && (selected.status ?? "").toUpperCase() === "PENDING_REVIEW" && (
              <>
                <button
                  className="btn small primary"
                  disabled={approveMut.isPending || rejectMut.isPending}
                  onClick={async () => {
                    if (await appConfirm("通过并发布该字段？发布后才允许被原子域引用。确认？")) approveMut.mutate(selected.id);
                  }}
                >
                  通过并发布
                </button>
                <button
                  className="btn small danger"
                  disabled={approveMut.isPending || rejectMut.isPending}
                  onClick={async () => {
                    const note = (await appPrompt("驳回意见（必填）", ""))?.trim() ?? "";
                    if (!note) {
                      toast.error("驳回须填写意见");
                      return;
                    }
                    rejectMut.mutate({ id: selected.id, comment: note });
                  }}
                >
                  驳回
                </button>
              </>
            )}
            {canMaintain && (
              <button
                className="btn small danger"
                disabled={deleteMut.isPending || (selected.status ?? "").toUpperCase() === "PUBLISHED"}
                onClick={() => void confirmDeleteField()}
              >
                删除
              </button>
            )}
          </div>

          <div className="aup-wb-meta-grid">
            {metaCell("字段编码", selected.fieldCode, { mono: true })}
            {metaCell("题面", selected.label)}
            {metaCell("题型", typeLabel(selected.type))}
            {metaCell("必填", selected.required ? "是" : "否")}
            {metaCell("码表引用", selected.dictKey || "—", { mono: true })}
            {metaCell("被引用", `${selected.refCount ?? 0} 个原子域`)}
            {metaCell("说明", selected.description || "—", { wrap: true })}
            {metaCell("冻结", selected.frozenAt ? "已冻结" : "—")}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            状态机：草稿 →「提交审核」→ 待审核 →「通过并发布」。无原子域引用时可「解冻」回草稿；仅已发布字段可从字段库生成原子域。
            审核暂由 ADMIN 代行（正式 PI 身份标签未接入）。
          </div>

          {usageQuery.data && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                被引用的原子域（{usageRefs.length}）
              </div>
              {usageRefs.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>暂无原子域引用本字段。</div>}
              {usageRefs.map((r, idx) => (
                <div key={idx} style={{ fontSize: 13, padding: "4px 0" }}>
                  <span style={{ fontWeight: 600 }}>{r.templateName || r.formKey}</span>
                  <span className="mono" style={{ marginLeft: 8, fontSize: 11, color: "var(--muted)" }}>
                    {r.formKey}@v{r.templateVersion}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="aup-app aup-app--workbench">
      <div className="aup-wb">
        <div className="aup-wb-hd">
          <div>
            <h1>AUP 字段域</h1>
            <div className="sub">
              字段字典层：稳定编码 + 题型 + 码表引用 + 状态机；只有已发布字段才允许被原子域引用。
            </div>
          </div>
          <div className="aup-wb-actions">
            {canMaintain && (
              <button
                className="btn ghost small"
                disabled={extractMut.isPending}
                onClick={async () => {
                  if (await appConfirm("从已发布计划书模板反向抽取字段入库？已存在的编码会跳过。")) extractMut.mutate();
                }}
              >
                从模板抽取字段
              </button>
            )}
            <button className="btn primary small" onClick={() => openCreate(UNGROUPED)}>
              ＋ 新建字段
            </button>
          </div>
        </div>

        <div className="aup-wb-toolbar">
          <input
            className="input"
            placeholder="搜索题面 / 编码 / 码表…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {keyword.trim() && (
            <button type="button" className="btn ghost small" onClick={() => setKeyword("")}>
              清除
            </button>
          )}
          <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatusFilter(s.value)}
                style={{
                  border: "none",
                  borderRight: "1px solid var(--border)",
                  padding: "6px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  background: statusFilter === s.value ? "var(--primary)" : "#fff",
                  color: statusFilter === s.value ? "#fff" : "var(--slate)",
                  fontWeight: statusFilter === s.value ? 600 : 400,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className="aup-wb-count">
            共 {filtered.length} 个字段 · {folderCount} 个文件夹
          </span>
        </div>

        <div className="aup-wb-split aup-wb-split--wide-aside">
          <aside className="aup-wb-aside">{aside}</aside>
          <div className="aup-wb-main">{main}</div>
        </div>
      </div>

      {formOpen && (
        <div className="aup-modal-mask" onClick={() => setFormOpen(null)}>
          <div className="aup-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3>{formOpen === "create" ? "新建字段" : "编辑字段"}</h3>
            {formOpen === "create" && (
              <div style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)" }}>
                将创建于文件夹「{form.folderKey === UNGROUPED ? UNGROUPED : folders.find((f) => String(f.id) === form.folderKey)?.name ?? form.folderKey}」。
              </div>
            )}
            {row(
              "字段编码",
              <input
                className="input"
                placeholder="全局唯一，如 euthanasia_method"
                value={form.fieldCode}
                disabled={formOpen === "edit"}
                onChange={(e) => setForm({ ...form, fieldCode: e.target.value })}
              />,
            )}
            {row(
              "题面",
              <input className="input" placeholder="填表人看到的题面" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />,
            )}
            {row(
              "题型",
              <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>,
            )}
            {VALUE_DOMAIN_TYPES.has(form.type) &&
              row(
                "选码表",
                <select
                  className="select"
                  value={form.dictKey}
                  onChange={(e) => setForm({ ...form, dictKey: e.target.value })}
                >
                  <option value="">选择码表…</option>
                  {form.dictKey && !dicts.some((d) => d.dictKey === form.dictKey) && (
                    <option value={form.dictKey}>{form.dictKey}（当前）</option>
                  )}
                  {dicts.map((d) => (
                    <option key={d.dictKey} value={d.dictKey}>
                      {d.source === "EXTERNAL" ? `[外部] ${d.name}` : d.name}
                      {d.sourceRef ? `（${d.sourceRef}）` : ""}
                    </option>
                  ))}
                </select>,
              )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, marginLeft: 98 }}>
              <input
                type="checkbox"
                checked={form.required}
                onChange={(e) => setForm({ ...form, required: e.target.checked })}
              />
              <label style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer" }}>必填</label>
            </div>
            {row(
              "说明",
              <textarea className="textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />,
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setFormOpen(null)}>
                取消
              </button>
              <button className="btn primary" disabled={createMut.isPending || updateMut.isPending} onClick={submitForm}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
