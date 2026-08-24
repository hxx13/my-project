import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  approveAupDict,
  createAupDict,
  createAupDictDraft,
  createAupDictItem,
  createAupFolder,
  deleteAupDict,
  deleteAupDictItem,
  deleteAupFolder,
  fetchAupDict,
  fetchAupDicts,
  fetchAupDictUsage,
  fetchAupDictVersions,
  importAupSeed,
  listAupFolders,
  rejectAupDict,
  reorderAupDictItems,
  resetAupSeed,
  submitAupDictItemVerdict,
  submitAupDictReview,
  unfreezeAupDict,
  updateAupDict,
  updateAupDictItem,
  updateAupFolder,
  type AupDictDetail,
  type AupDictItem,
  type AupDictListItem,
  type AupDictVersionVO,
  type AupFolderVO,
} from "@/features/aup/api/aup.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import FolderTreeManager, { type FolderAction, type FolderTreeGroup } from "@/features/form-shared/FolderTreeManager";
import { AUP_DICT_FOLDER_LABELS } from "@/features/aup/utils/aupFolderLabels";
import "@/features/aup/aup.css";

/* =====================================================================
 * AUP 码表工作台（版本 + 状态机 + 文件夹树 + 项维护 + 引用链）。
 *  - 左栏：aup_folder(ownerType=CODELIST) 多级文件夹树 + 码表列表
 *  - 右栏：版本轨（按版本取详情）、项表格（value 稳定码只读）、引用链
 *  - 状态机：提交审核 / 通过并发布 / 驳回 / 解冻 / 新建版本
 * ================================================================== */

const UNGROUPED = "未分类";
const OWNER_TYPE = "CODELIST";

/** EXTERNAL 码表头 → 源模块编辑页路由（真实 hash 路由全路径）。 */
const EXTERNAL_SOURCE_ROUTES: Record<string, string> = {
  projectGroup: "/console/admin/personnel",
  ANIMAL_BREED: "/console/admin/animal-order",
  ANIMAL_STRAIN: "/console/admin/animal-order",
};

/** AUP 码表状态机文案（审核，非 NHP「校对」） */
function statusMeta(status?: string): { text: string; bg: string; color: string } {
  switch ((status ?? "").toUpperCase()) {
    case "PUBLISHED":
      return { text: "已发布", bg: "#e8f7ee", color: "#16a34a" };
    case "PENDING_REVIEW":
      return { text: "待审核", bg: "#fff7ed", color: "#c2410c" };
    case "DRAFT":
      return { text: "草稿", bg: "#eef2ff", color: "#002FA7" };
    case "ARCHIVED":
      return { text: "已归档", bg: "#f1f5f9", color: "#64748b" };
    default:
      return { text: status || "—", bg: "#eef2f7", color: "#64748b" };
  }
}

function isEditableStatus(status?: string): boolean {
  return (status ?? "").toUpperCase() === "DRAFT";
}

function isPublishedStatus(status?: string): boolean {
  return (status ?? "").toUpperCase() === "PUBLISHED";
}

/** EXTERNAL 码表头：值域由源模块维护，本地只读 */
function isExternalSource(source?: string): boolean {
  return (source ?? "").toUpperCase() === "EXTERNAL";
}

/** 逐项审核四态（AUP 文案） */
const VERDICT_OPTS = [
  { value: "CONFIRM", label: "确认" },
  { value: "MODIFY", label: "需修改" },
  { value: "DELETE", label: "建议删除" },
  { value: "QUESTION", label: "有疑问" },
];

function verdictLabel(v?: string): string {
  return VERDICT_OPTS.find((o) => o.value === v)?.label ?? v ?? "";
}

function autoDictKey(): string {
  return "d_" + Math.random().toString(36).slice(2, 10);
}

const folderKeyOf = (folderId?: number | null): string => (folderId == null ? UNGROUPED : String(folderId));
const folderIdOf = (key: string): number | undefined => (key === UNGROUPED ? undefined : Number(key));

interface ItemModal {
  mode: "add" | "edit";
  value: string;
  label: string;
  itemId?: number;
}

interface CreateDictModal {
  folderKey: string;
  name: string;
  dictKey: string;
  advanced: boolean;
}

interface EditMetaModal {
  name: string;
  folderKey: string;
}

type DictTreeItem = { id: string; dict: AupDictListItem };

function buildFolderTree(
  folders: AupFolderVO[],
  dicts: AupDictListItem[],
): FolderTreeGroup<DictTreeItem>[] {
  const byFolder = new Map<number, AupDictListItem[]>();
  const ungrouped: AupDictListItem[] = [];
  for (const d of dicts) {
    if (d.folderId != null) {
      const arr = byFolder.get(d.folderId) ?? [];
      arr.push(d);
      byFolder.set(d.folderId, arr);
    } else {
      ungrouped.push(d);
    }
  }
  const toGroup = (f: AupFolderVO, depth = 0): FolderTreeGroup<DictTreeItem> => ({
    key: String(f.id),
    label: f.name,
    mutable: true,
    items: (byFolder.get(f.id) ?? []).map((d) => ({ id: d.dictKey, dict: d })),
    headerStyle: depth > 0 ? { paddingLeft: 28, fontSize: 12, color: "var(--slate)", fontWeight: 600 } : undefined,
    emptyHint: "空文件夹",
    emptyActionLabel: "新建码表",
    children: (f.children ?? []).map((c) => toGroup(c, depth + 1)),
  });
  const top = (folders ?? []).map((f) => toGroup(f, 0));
  if (ungrouped.length > 0) {
    top.push({ key: UNGROUPED, label: UNGROUPED, mutable: false, items: ungrouped.map((d) => ({ id: d.dictKey, dict: d })) });
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

export default function AupDictPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [itemModal, setItemModal] = useState<ItemModal | null>(null);
  const [createModal, setCreateModal] = useState<CreateDictModal | null>(null);
  const [editMetaModal, setEditMetaModal] = useState<EditMetaModal | null>(null);

  const role = authStorage.getRole() || "";
  const canMaintain = hasMinRole(role, "ADMIN");

  const foldersQuery = useQuery({
    queryKey: ["aup", "folders", OWNER_TYPE],
    queryFn: () => listAupFolders(OWNER_TYPE),
  });
  const dictsQuery = useQuery({
    queryKey: ["aup", "dicts", "all"],
    queryFn: () => fetchAupDicts({ size: 500 }),
  });
  const versionsQuery = useQuery({
    queryKey: ["aup", "dict", "versions", selectedKey],
    queryFn: () => fetchAupDictVersions(selectedKey!),
    enabled: !!selectedKey,
  });
  const detailQuery = useQuery({
    queryKey: ["aup", "dict", "detail", selectedKey, selectedVersion],
    queryFn: () => fetchAupDict(selectedKey!, selectedVersion ?? undefined),
    enabled: !!selectedKey,
  });
  const usageQuery = useQuery({
    queryKey: ["aup", "dict", "usage", selectedKey],
    queryFn: () => fetchAupDictUsage(selectedKey!),
    enabled: !!selectedKey,
  });

  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const dicts = useMemo(() => dictsQuery.data?.items ?? [], [dictsQuery.data]);
  const versions = useMemo(() => {
    const rows = [...(versionsQuery.data ?? [])];
    rows.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    return rows;
  }, [versionsQuery.data]);

  /** 缺省看开版（草稿/待审核）或最新 */
  useEffect(() => {
    if (!selectedKey || versionsQuery.isLoading) return;
    if (versions.length === 0) return;
    if (selectedVersion != null && versions.some((v) => v.version === selectedVersion)) return;
    const open = versions.find((v) => (v.status ?? "").toUpperCase() === "DRAFT" || (v.status ?? "").toUpperCase() === "PENDING_REVIEW");
    setSelectedVersion((open ?? versions[0]).version ?? null);
  }, [selectedKey, versions, versionsQuery.isLoading, selectedVersion]);

  const q = keyword.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return dicts;
    return dicts.filter((d) => d.name.toLowerCase().includes(q) || (d.dictKey ?? "").toLowerCase().includes(q));
  }, [dicts, q]);

  const folderTreeGroups = useMemo(
    (): FolderTreeGroup<DictTreeItem>[] => buildFolderTree(folders, filtered),
    [folders, filtered],
  );
  const folderCount = useMemo(() => countTreeFolders(folderTreeGroups), [folderTreeGroups]);

  const detail = detailQuery.data;
  const items = useMemo(
    () => [...(detail?.items ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [detail?.items],
  );
  const editable = detail ? isEditableStatus(detail.status) : false;
  const usage = usageQuery.data;
  const isExternal = isExternalSource(detail?.source);
  const externalRoute = isExternal && detail?.sourceRef ? (EXTERNAL_SOURCE_ROUTES[detail.sourceRef] ?? "") : "";
  const canWrite = canMaintain && !isExternal;

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ["aup", "dicts"] });
    void qc.invalidateQueries({ queryKey: ["aup", "folders"] });
    if (selectedKey) {
      void qc.invalidateQueries({ queryKey: ["aup", "dict", "detail", selectedKey] });
      void qc.invalidateQueries({ queryKey: ["aup", "dict", "versions", selectedKey] });
      void qc.invalidateQueries({ queryKey: ["aup", "dict", "usage", selectedKey] });
    }
  };

  /* ── 文件夹 CRUD（走 aup-folder 后端，多级持久化） ── */
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

  /* ── 码表 CRUD / 状态机 ── */
  const createDictMut = useMutation({
    mutationFn: (body: { dictKey: string; name: string; folderId?: number }) => createAupDict(body),
    onSuccess: (d) => {
      toast.success("已新建码表");
      invalidateAll();
      setCreateModal(null);
      setSelectedKey(d.dictKey);
      setSelectedVersion(d.version ?? null);
    },
    onError: (e: Error) => toast.error(e.message || "新建码表失败"),
  });
  const renameDictMut = useMutation({
    mutationFn: ({ key, name, folderId }: { key: string; name: string; folderId?: number }) => updateAupDict(key, { name, folderId }),
    onSuccess: () => {
      toast.success("已保存");
      invalidateAll();
      setEditMetaModal(null);
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });
  const deleteDictMut = useMutation({
    mutationFn: (key: string) => deleteAupDict(key),
    onSuccess: () => {
      toast.success("已删除码表");
      setSelectedKey(null);
      setSelectedVersion(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "删除码表失败", { duration: 6000 }),
  });
  const moveDictMut = useMutation({
    mutationFn: ({ key, name, folderId }: { key: string; name: string; folderId?: number }) => updateAupDict(key, { name, folderId }),
    onSuccess: () => {
      toast.success("已移动");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "移动失败"),
  });

  const submitMut = useMutation({
    mutationFn: () => submitAupDictReview(selectedKey!),
    onSuccess: () => {
      toast.success("已提交审核");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "提交失败"),
  });
  const approveMut = useMutation({
    mutationFn: () => approveAupDict(selectedKey!),
    onSuccess: () => {
      toast.success("已通过并发布");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "发布失败"),
  });
  const rejectMut = useMutation({
    mutationFn: (comment: string) => rejectAupDict(selectedKey!, { comment }),
    onSuccess: () => {
      toast.success("已驳回为草稿");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "驳回失败"),
  });
  const unfreezeMut = useMutation({
    mutationFn: () => unfreezeAupDict(selectedKey!),
    onSuccess: () => {
      toast.success("已解冻为草稿");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "解冻失败", { duration: 8000 }),
  });
  const draftMut = useMutation({
    mutationFn: () => createAupDictDraft(selectedKey!),
    onSuccess: (d) => {
      toast.success(`已新建草稿 v${d.version}`);
      setSelectedVersion(d.version ?? null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "新建版本失败"),
  });

  /* ── 字典项 CRUD / 排序 / 逐项审核 ── */
  const addItemMut = useMutation({
    mutationFn: (body: { value: string; label: string }) => createAupDictItem(selectedKey!, body),
    onSuccess: () => {
      toast.success("已新增项");
      setItemModal(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "新增失败"),
  });
  const updateItemMut = useMutation({
    mutationFn: ({ itemId, value, label }: { itemId: number; value: string; label: string }) =>
      updateAupDictItem(selectedKey!, itemId, { value, label }),
    onSuccess: () => {
      toast.success("已修改");
      setItemModal(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "修改失败"),
  });
  const deleteItemMut = useMutation({
    mutationFn: (itemId: number) => deleteAupDictItem(selectedKey!, itemId),
    onSuccess: () => {
      toast.success("已删除");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
  const reorderMut = useMutation({
    mutationFn: (itemIds: number[]) => reorderAupDictItems(selectedKey!, itemIds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["aup", "dict", "detail", selectedKey] });
    },
    onError: (e: Error) => toast.error(e.message || "排序保存失败"),
  });
  const verdictMut = useMutation({
    mutationFn: ({ itemId, verdict }: { itemId: number; verdict: string }) =>
      submitAupDictItemVerdict(selectedKey!, itemId, { verdict }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["aup", "dict", "detail", selectedKey] });
    },
    onError: (e: Error) => toast.error(e.message || "审核标记失败"),
  });
  const seedMut = useMutation({
    mutationFn: () => importAupSeed(),
    onSuccess: (r) => {
      const c = r?.codelists ?? 0, f = r?.fields ?? 0, a = r?.atoms ?? 0, p = r?.composite ?? 0;
      toast.success(`已导入内置种子：码表 ${c}、字段 ${f}、原子域 ${a}、组合域 ${p}`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "导入失败"),
  });
  const resetMut = useMutation({
    mutationFn: () => resetAupSeed(),
    onSuccess: (n) => {
      toast.success(`已重置内置种子（删除 ${n} 行），请点「导入内置种子」重新导入`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "重置失败"),
  });
  const openCreateInFolder = (folderKey: string) => {
    setCreateModal({ folderKey, name: "", dictKey: "", advanced: false });
  };

  const moveItemUpDown = (index: number, dir: -1 | 1) => {
    if (!selectedKey) return;
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[index], next[j]] = [next[j], next[index]];
    reorderMut.mutate(next.map((it) => it.itemId));
  };

  const confirmDeleteDict = async () => {
    if (!detail) return;
    if (!(await appConfirm(`确定删除码表「${detail.name}」（${detail.dictKey}）？若被字段/模板引用，后端将拒绝删除。`))) return;
    deleteDictMut.mutate(detail.dictKey);
  };

  const confirmDeleteItem = async (item: AupDictItem) => {
    if (!(await appConfirm(`确定删除码表项「${item.label || item.value}」？`))) return;
    deleteItemMut.mutate(item.itemId);
  };

  const row = (label: string, input: ReactNode) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <label style={{ fontSize: 13, color: "var(--muted)", width: 76, flexShrink: 0, paddingTop: 8 }}>{label}</label>
      <div style={{ flex: 1 }}>{input}</div>
    </div>
  );

  const st = statusMeta(detail?.status);
  const refs = usage?.refs ?? [];

  const aside = (
    <FolderTreeManager
      folders={folderTreeGroups}
      selectedItemId={selectedKey}
      onSelectItem={(key) => {
        setSelectedKey(key);
        setSelectedVersion(null);
      }}
      loading={dictsQuery.isLoading || foldersQuery.isLoading}
      canMaintain={canMaintain}
      ungroupedKey={UNGROUPED}
      collapsedFolders={collapsedFolders}
      onCollapsedFoldersChange={setCollapsedFolders}
      deleteFolderPending={deleteFolderMut.isPending}
      headerHint="文件夹为多级结构（aup_folder，ownerType=CODELIST），可直接持久化空文件夹；重命名/删除即时生效。"
      labels={AUP_DICT_FOLDER_LABELS}
      getItemLabel={(item) => item.dict.name || item.id}
      folderActions={(folderKey): FolderAction[] =>
        folderKey === UNGROUPED ? ["createItem"] : ["createItem", "createFolder", "rename", "delete"]
      }
      isFolderDeletable={(group, totalCount) =>
        group.key !== UNGROUPED && totalCount === 0 && (group.children?.length ?? 0) === 0
      }
      itemActions={() => ["moveItem"]}
      onCreateFolder={canMaintain ? (parentKey) => void handleCreateFolder(parentKey) : undefined}
      onCreateSubFolder={canMaintain ? (parentKey) => void handleCreateFolder(parentKey) : undefined}
      onCreateItem={canMaintain ? (fk) => openCreateInFolder(fk) : undefined}
      onRenameFolder={canMaintain ? (fk) => void handleRenameFolder(fk) : undefined}
      onDeleteFolder={canMaintain ? (fk) => void handleDeleteFolder(fk) : undefined}
      onMoveItem={
        canMaintain
          ? (itemId, _from, toKey) => {
              const d = dicts.find((x) => x.dictKey === itemId);
              if (d) moveDictMut.mutate({ key: itemId, name: d.name, folderId: folderIdOf(toKey) });
            }
          : undefined
      }
      itemDataAttr={(item) => ({ "data-aup-dict-key": item.id })}
      emptyState={
        <div style={{ padding: 28, textAlign: "center" }}>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 8, lineHeight: 1.55 }}>
            {q ? "无匹配码表或文件夹" : "尚无码表：先建文件夹分类，再在文件夹内新建码表。"}
          </div>
          {canMaintain && !q && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn primary small" onClick={() => void handleCreateFolder()}>
                ＋ 新建文件夹
              </button>
              <button type="button" className="btn ghost small" onClick={() => openCreateInFolder(UNGROUPED)}>
                ＋ 新建码表
              </button>
            </div>
          )}
        </div>
      }
      renderItem={(item) => {
        const d = item.dict;
        const sm = statusMeta(d.status);
        return (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lbl">{d.name}</div>
              <div className="meta" style={{ marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
                {d.dictKey} · v{d.version}
                {(d.versionCount ?? 1) > 1 ? ` · ${d.versionCount} 版` : ""}
              </div>
            </div>
            <span className="aup-wb-chip muted" title={`被 ${d.refCount ?? 0} 个字段引用`}>
              {d.refCount ?? 0}
            </span>
            <span className="aup-wb-chip" style={{ background: sm.bg, color: sm.color }}>
              {sm.text}
            </span>
            {isExternalSource(d.source) && (
              <span
                className="aup-wb-chip"
                style={{ background: "#fef3c7", color: "#92400e" }}
                title={`外部引用：值域由源模块${d.sourceRef ? `（${d.sourceRef}）` : ""}维护，此处只读`}
              >
                外部引用
              </span>
            )}
          </>
        );
      }}
    />
  );

  const main = (
    <>
      {!selectedKey && <div className="aup-wb-empty">在左侧选择码表维护选项与版本</div>}
      {selectedKey && detailQuery.isLoading && <div className="aup-wb-empty">加载详情…</div>}
      {selectedKey && detail && (
        <div className="aup-wb-panel">
          <div className="aup-wb-panel-hd">
            <span className="title">{detail.name}</span>
            <span className="aup-wb-chip" style={{ fontFamily: "ui-monospace, monospace" }}>
              {detail.dictKey}
            </span>
            <span className="aup-wb-chip" style={{ background: st.bg, color: st.color }}>
              {st.text}
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>v{detail.version}</span>
            {detail.reviewComment && (
              <span className="aup-wb-chip muted" title="最近审核意见">
                {detail.reviewComment}
              </span>
            )}
            <div style={{ flex: 1 }} />
            {canWrite && isPublishedStatus(detail.status) && (
              <>
                <button
                  className="btn small ghost"
                  disabled={unfreezeMut.isPending}
                  title="无字段引用本版时可解冻；否则请新建版本"
                  onClick={async () => {
                    if (await appConfirm(`解冻码表「${detail.name || selectedKey}」当前版为草稿？仅当无字段引用本版时允许。确认？`)) {
                      unfreezeMut.mutate();
                    }
                  }}
                >
                  解冻本版
                </button>
                <button
                  className="btn small primary"
                  disabled={draftMut.isPending}
                  onClick={async () => {
                    if (await appConfirm("基于最新已发布版克隆新草稿（版号自动补位空缺）。确认？")) draftMut.mutate();
                  }}
                >
                  ＋ 新建版本
                </button>
              </>
            )}
            {canWrite && editable && (
              <button
                className="btn small primary"
                disabled={submitMut.isPending}
                onClick={async () => {
                  if (await appConfirm("提交审核后进入待审核。审核人可在本页通过或驳回。确认？")) submitMut.mutate();
                }}
              >
                提交审核
              </button>
            )}
            {canWrite && (detail.status ?? "").toUpperCase() === "PENDING_REVIEW" && (
              <>
                <button
                  className="btn small primary"
                  disabled={approveMut.isPending}
                  onClick={async () => {
                    if (await appConfirm("通过并发布？同 key 上一已发布版本将自动归档。确认？")) approveMut.mutate();
                  }}
                >
                  通过并发布
                </button>
                <button
                  className="btn small danger"
                  disabled={rejectMut.isPending}
                  onClick={async () => {
                    const note = (await appPrompt("驳回意见（必填）", ""))?.trim() ?? "";
                    if (!note) {
                      toast.error("驳回须填写意见");
                      return;
                    }
                    rejectMut.mutate(note);
                  }}
                >
                  驳回
                </button>
              </>
            )}
            {canWrite && (
              <button
                className="btn small ghost"
                onClick={() => setEditMetaModal({ name: detail.name, folderKey: folderKeyOf(detail.folderId) })}
              >
                编辑名称/文件夹
              </button>
            )}
            {canWrite && (
              <button className="btn small danger" disabled={deleteDictMut.isPending} onClick={() => void confirmDeleteDict()}>
                删除
              </button>
            )}
          </div>

          {isExternal && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 8,
                background: "#fffbeb",
                border: "1px solid #fde68a",
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              <span style={{ color: "#92400e" }}>外部引用码表：值域由源模块维护，此处只读。</span>
              {externalRoute ? (
                <button type="button" className="btn small ghost" onClick={() => navigate(externalRoute)}>
                  到源模块编辑
                </button>
              ) : (
                <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
                  {detail.sourceRef || "（源模块未标注）"}
                </span>
              )}
            </div>
          )}

          {/* 版本轨 */}
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              padding: "10px 0",
              borderBottom: "1px solid var(--border)",
              marginBottom: 12,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>版本</span>
            {versionsQuery.isLoading && <span style={{ fontSize: 12, color: "var(--muted)" }}>加载…</span>}
            {versions.map((v) => {
              const sm = statusMeta(v.status);
              const on = selectedVersion === v.version;
              return (
                <button
                  key={v.id}
                  type="button"
                  className="btn small"
                  onClick={() => setSelectedVersion(v.version ?? null)}
                  style={{
                    borderColor: on ? "var(--primary)" : undefined,
                    background: on ? "var(--primary-weak)" : "#fff",
                    fontWeight: on ? 700 : 500,
                  }}
                  title={`${v.itemCount ?? 0} 项`}
                >
                  v{v.version}
                  <span style={{ marginLeft: 6, color: sm.color, fontSize: 11 }}>{sm.text}</span>
                  <span style={{ marginLeft: 4, fontSize: 11, color: "var(--muted)" }}>{v.itemCount ?? 0}</span>
                </button>
              );
            })}
          </div>

          {!editable && !isExternal && (
            <div style={{ padding: "0 0 10px", fontSize: 12, color: "var(--muted)" }}>
              {(detail.status ?? "").toUpperCase() === "PENDING_REVIEW"
                ? "待审核中不可改项；请通过并发布，或驳回为草稿。"
                : "已发布版本不可直接改项。无字段占用时可「解冻本版」；否则请「新建版本」后在草稿上修改，再提交审核。"}
            </div>
          )}

          <div className="aup-wb-table-wrap">
            <table className="aup-wb-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ width: 48 }}>序</th>
                  <th style={{ width: 180 }}>内部值（稳定码）</th>
                  <th>展示文本</th>
                  <th style={{ width: 140 }}>审核</th>
                  <th style={{ width: 160 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.itemId}>
                    <td style={{ color: "var(--muted)" }}>{i + 1}</td>
                    <td>
                      <div className="mono" title={it.value}>
                        {it.value}
                      </div>
                    </td>
                    <td>
                      <div className="clip" title={it.label}>
                        {it.label}
                      </div>
                    </td>
                    <td>
                      {canWrite ? (
                        <select
                          className="select"
                          style={{ width: "100%", padding: "4px 8px", fontSize: 12 }}
                          value={it.verdict ?? ""}
                          onChange={(e) => {
                            if (e.target.value) verdictMut.mutate({ itemId: it.itemId, verdict: e.target.value });
                          }}
                        >
                          <option value="">（未标记）</option>
                          {VERDICT_OPTS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>{verdictLabel(it.verdict) || "—"}</span>
                      )}
                    </td>
                    <td>
                      {editable && canWrite ? (
                        <div className="acts">
                          <button className="btn small ghost" title="上移" onClick={() => moveItemUpDown(i, -1)}>
                            ↑
                          </button>
                          <button className="btn small ghost" title="下移" onClick={() => moveItemUpDown(i, 1)}>
                            ↓
                          </button>
                          <button
                            className="btn small ghost"
                            title="编辑"
                            onClick={() => setItemModal({ mode: "edit", value: it.value, label: it.label, itemId: it.itemId })}
                          >
                            ✎
                          </button>
                          <button className="btn small danger" title="删除" onClick={() => void confirmDeleteItem(it)}>
                            ×
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                      暂无码表项{editable && canWrite ? "，点击「＋ 新增项」" : ""}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {editable && canWrite && (
            <div style={{ marginTop: 10 }}>
              <button className="btn small primary" onClick={() => setItemModal({ mode: "add", value: "", label: "" })}>
                ＋ 新增项
              </button>
              <span style={{ marginLeft: 10, fontSize: 12, color: "var(--muted)" }}>
                内部值为稳定码，一经创建不可改；仅可改展示文本。上移/下移自动保存顺序。
              </span>
            </div>
          )}

          {/* 引用链 */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>引用链（字段 → 原子域/计划书模板）</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {usageQuery.isLoading ? "…" : `${refs.length} 处引用`}
              </span>
            </div>
            {usageQuery.isLoading && <div style={{ fontSize: 13, color: "var(--muted)" }}>加载引用链…</div>}
            {!usageQuery.isLoading && refs.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>暂无字段/模板引用本码表。</div>
            )}
            {!usageQuery.isLoading &&
              refs.map((r, idx) => (
                <div key={idx} style={{ padding: 8, marginBottom: 8, borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span className="mono" style={{ fontSize: 12 }}>{r.fieldKey}</span>
                    <span style={{ fontSize: 13 }}>{r.fieldLabel || "—"}</span>
                    <span className="aup-wb-chip muted">{r.refType === "FIELD_DEF" ? "字段域" : "模板字段"}</span>
                    {r.templateName && (
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        → {r.templateName}
                        {r.templateVersion != null ? ` @v${r.templateVersion}` : ""}
                      </span>
                    )}
                    {r.dictVersion != null && (
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>钉版本 v{r.dictVersion}</span>
                    )}
                    <span style={{ flex: 1 }} />
                    <button
                      className="btn ghost small"
                      disabled={!r.fieldDefId && !r.templateId}
                      onClick={() => {
                        if (r.refType === "FIELD_DEF") navigate(`/content-manager/aup-field?fieldId=${r.fieldDefId}`);
                        else navigate(`/content-manager/aup-template/edit/${r.templateId}`);
                      }}
                    >
                      跳转
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="aup-app aup-app--workbench">
      <div className="aup-wb">
        <div className="aup-wb-hd">
          <div>
            <h1>AUP 码表</h1>
            <div className="sub">
              公共选项词表：版本化 + 状态机（草稿 → 待审核 → 已发布）；内部值一经创建即为稳定码，不可篡改。
            </div>
          </div>
          <div className="aup-wb-actions">
            {canMaintain && (
              <>
                <button
                  className="btn ghost small"
                  disabled={seedMut.isPending}
                  onClick={async () => {
                    if (await appConfirm("导入内置种子？将幂等灌入码表 + 字段 + 原子域 + 组合域（已存在的不覆盖）。")) seedMut.mutate();
                  }}
                >
                  导入内置种子
                </button>
                <button
                  className="btn ghost small"
                  disabled={resetMut.isPending}
                  onClick={async () => {
                    if (await appConfirm("重置内置种子？将删除全部内置种子数据（码表/字段/原子域/组合域），删除后需重新导入。确认？")) resetMut.mutate();
                  }}
                >
                  重置种子
                </button>
              </>
            )}
            <button className="btn primary small" onClick={() => openCreateInFolder(UNGROUPED)}>
              ＋ 新建码表
            </button>
          </div>
        </div>

        <div className="aup-wb-toolbar">
          <input
            className="input"
            placeholder="搜索码表名称 / 键…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {keyword.trim() && (
            <button type="button" className="btn ghost small" onClick={() => setKeyword("")}>
              清除
            </button>
          )}
          <span className="aup-wb-count">
            共 {filtered.length} 个码表 · {folderCount} 个文件夹
          </span>
        </div>

        <div className="aup-wb-split aup-wb-split--wide-aside">
          <aside className="aup-wb-aside">{aside}</aside>
          <div className="aup-wb-main">{main}</div>
        </div>
      </div>

      {editMetaModal && detail && (
        <div className="aup-modal-mask" onClick={() => setEditMetaModal(null)}>
          <div className="aup-modal" onClick={(e) => e.stopPropagation()}>
            <h3>编辑码表元数据</h3>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 12px" }}>
              键 <code>{detail.dictKey}</code> 不可改；文件夹可在左树管理，或在此移动本码表。
            </p>
            {row(
              "文件夹",
              <select
                className="select"
                value={editMetaModal.folderKey}
                onChange={(e) => setEditMetaModal({ ...editMetaModal, folderKey: e.target.value })}
              >
                <option value={UNGROUPED}>{UNGROUPED}</option>
                {folders.map((f) => (
                  <option key={f.id} value={String(f.id)}>
                    {f.name}
                  </option>
                ))}
              </select>,
            )}
            {row("名称", (
              <input
                className="input"
                value={editMetaModal.name}
                onChange={(e) => setEditMetaModal({ ...editMetaModal, name: e.target.value })}
              />
            ))}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setEditMetaModal(null)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!editMetaModal.name.trim() || renameDictMut.isPending}
                onClick={() =>
                  renameDictMut.mutate({
                    key: detail.dictKey,
                    name: editMetaModal.name.trim(),
                    folderId: folderIdOf(editMetaModal.folderKey),
                  })
                }
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {createModal && (
        <div className="aup-modal-mask" onClick={() => setCreateModal(null)}>
          <div className="aup-modal" onClick={(e) => e.stopPropagation()}>
            <h3>新建码表</h3>
            {row(
              "文件夹",
              <select
                className="select"
                value={createModal.folderKey}
                onChange={(e) => setCreateModal({ ...createModal, folderKey: e.target.value })}
              >
                <option value={UNGROUPED}>{UNGROUPED}</option>
                {folders.map((f) => (
                  <option key={f.id} value={String(f.id)}>
                    {f.name}
                  </option>
                ))}
              </select>,
            )}
            {row(
              "名称",
              <input
                className="input"
                placeholder="如 动物种类"
                value={createModal.name}
                onChange={(e) => setCreateModal({ ...createModal, name: e.target.value })}
              />,
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={createModal.advanced}
                onChange={(e) => setCreateModal({ ...createModal, advanced: e.target.checked })}
              />
              <label style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer" }}>指定字段键（不勾选则自动生成）</label>
            </div>
            {createModal.advanced &&
              row(
                "字段键",
                <input
                  className="input"
                  placeholder="如 animalSpecies"
                  value={createModal.dictKey}
                  onChange={(e) => setCreateModal({ ...createModal, dictKey: e.target.value })}
                />,
              )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setCreateModal(null)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!createModal.name.trim() || createDictMut.isPending}
                onClick={() =>
                  createDictMut.mutate({
                    dictKey: createModal.advanced && createModal.dictKey.trim() ? createModal.dictKey.trim() : autoDictKey(),
                    name: createModal.name.trim(),
                    folderId: folderIdOf(createModal.folderKey),
                  })
                }
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {itemModal && selectedKey && (
        <div className="aup-modal-mask" onClick={() => setItemModal(null)}>
          <div className="aup-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{itemModal.mode === "add" ? "新增码表项" : "编辑码表项"}</h3>
            {row(
              "内部值",
              <input
                className="input"
                placeholder="存储 / 条件比较用（唯一，一经创建不可改）"
                value={itemModal.value}
                disabled={itemModal.mode === "edit"}
                onChange={(e) => setItemModal({ ...itemModal, value: e.target.value })}
              />,
            )}
            {row(
              "展示文本",
              <input
                className="input"
                placeholder="填表人看到的内容（留空同内部值）"
                value={itemModal.label}
                onChange={(e) => setItemModal({ ...itemModal, label: e.target.value })}
              />,
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setItemModal(null)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!itemModal.value.trim() || addItemMut.isPending || updateItemMut.isPending}
                onClick={() => {
                  const label = itemModal.label.trim() || itemModal.value.trim();
                  if (itemModal.mode === "add") {
                    addItemMut.mutate({ value: itemModal.value.trim(), label });
                  } else if (itemModal.itemId != null) {
                    updateItemMut.mutate({ itemId: itemModal.itemId, value: itemModal.value.trim(), label });
                  }
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
