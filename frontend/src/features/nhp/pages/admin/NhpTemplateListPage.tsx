/**
 * NHP 表单发布：已发布组合 / 原子模板列表 + 版本预览。
 * 字段字典为父源（/#/nhp-admin/field）；本页仅管理呈现层发布与版本。
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import {
  batchDeleteNhpTemplates,
  createNhpAtom,
  createNhpCompositeDraft,
  createNhpTemplateDraft,
  copyNhpTemplate,
  deleteNhpTemplateAllVersions,
  deleteNhpTemplateVersion,
  fetchNhpTemplateById,
  fetchNhpTemplateVersions,
  fetchNhpTemplates,
  formatBuiltinSeedImportToast,
  importNhpBuiltinSeedTemplates,
  publishNhpTemplate,
  restoreNhpTemplateArchived,
  setNhpTemplateFolder,
  unfreezeNhpTemplate,
  versionOriginLabel,
  isFillablePublished,
  type NhpAtomReferencedBy,
  type NhpTemplateListItem,
} from "../../api/nhpTemplate.api";
import NhpTemplateStructurePreview from "../../components/NhpTemplateStructurePreview";
import { AtomPickList, buildDomainNameMap } from "../../utils/nhpAtomDisplay";
import { fetchNhpDictStructure } from "../../api/nhpFieldDictionary.api";
import { fetchTeams } from "@/api/domains/team.api";
import { statusLabel } from "../../store/editorUtils";
import { nhpNavState } from "../../utils/nhpAdminNav";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import FolderTreeManager, { type FolderTreeGroup } from "@/features/form-shared/FolderTreeManager";
import { FORM_FOLDER_LABELS } from "../../utils/folderTreeLabels";
import {
  createAupFolder,
  deleteAupFolder,
  listAupFolders,
  updateAupFolder,
  type AupFolderVO,
} from "@/features/aup/api/aup.api";
import "@/features/aup/aup.css";
import "../../nhp.css";

const NHP_FORM_OWNER = "NHP_FORM";
const UNGROUPED = "未分类";

type PublishFilter = "PUBLISHED" | "ALL";

function templateKind(t: NhpTemplateListItem): "COMPOSITE" | "ATOM" {
  const ft = (t.formType || "").toUpperCase();
  const kd = (t.kind || "").toUpperCase();
  return ft === "TEMPLATE" || kd === "COMPOSITE" ? "COMPOSITE" : "ATOM";
}

function isPublished(s: string): boolean {
  const u = (s || "").toUpperCase();
  return u === "PUBLISHED" || u === "FROZEN";
}

function isArchived(s: string): boolean {
  return (s || "").toUpperCase() === "ARCHIVED";
}

function itemKindLabel(t: NhpTemplateListItem): string {
  return templateKind(t) === "COMPOSITE" ? "组合模板" : "原子模板";
}

/** 列表行统一状态文案（收敛为单 chip，避免组合/原子各一套状态拼法） */
function listStatusText(t: NhpTemplateListItem): string {
  if (templateKind(t) === "COMPOSITE") {
    return t.hasPublished && !isPublished(t.status) ? "草稿·有发布" : statusLabel(t.status);
  }
  if (t.locked) return "已锁定";
  if (isPublished(t.status)) return "已发布";
  if (t.hasPublished) return "草稿·有发布";
  return "草稿";
}

function suiteBadgeLabel(dictKey?: string | null): string {
  const k = (dictKey || "").trim() || "pig";
  if (k === "pig") return "猪字典";
  if (k === "monkey") return "猴字典";
  if (k === "mixed") return "跨套";
  return k;
}

function suiteBadgeClass(dictKey?: string | null): string {
  const k = (dictKey || "").trim() || "pig";
  if (k === "monkey") return "nhp-suite-chip nhp-suite-chip--monkey";
  if (k === "mixed") return "nhp-suite-chip nhp-suite-chip--mixed";
  if (k === "pig") return "nhp-suite-chip nhp-suite-chip--pig";
  return "nhp-suite-chip";
}

function atomListMetaKey(t: NhpTemplateListItem): string {
  const dk = (t.dictKey || "").trim() || "pig";
  const dc = (t.domainCode || "").trim();
  const barePig = dk === "pig" && !t.formKey.includes("__");
  if (barePig) return t.formKey;
  if (dc) return `${dk} · ${dc}`;
  return t.formKey;
}

function formatPinRefs(refs: NhpAtomReferencedBy[] | undefined): string {
  if (!refs?.length) return "";
  return refs
    .map((r) => {
      const ol = versionOriginLabel(r.origin);
      return `${r.formKey}@v${r.version ?? "?"}${ol ? `（${ol}）` : ""}`;
    })
    .join("、");
}

function editPath(formKey: string, formId?: number): string {
  const base = `/nhp-admin/template/edit/${encodeURIComponent(formKey)}`;
  return formId != null ? `${base}/${formId}` : base;
}

const PUBLISH_FILTERS: { value: PublishFilter; label: string }[] = [
  { value: "PUBLISHED", label: "已发布" },
  { value: "ALL", label: "含草稿" },
];

type FormTreeItem = { id: string; t: NhpTemplateListItem };

function buildFormFolderTree(folders: AupFolderVO[], templates: NhpTemplateListItem[]): FolderTreeGroup<FormTreeItem>[] {
  const byFolder = new Map<number, NhpTemplateListItem[]>();
  const ungrouped: NhpTemplateListItem[] = [];
  for (const t of templates) {
    if (t.folderId != null) {
      const arr = byFolder.get(t.folderId) ?? [];
      arr.push(t);
      byFolder.set(t.folderId, arr);
    } else {
      ungrouped.push(t);
    }
  }
  const toGroup = (folder: AupFolderVO, depth = 0): FolderTreeGroup<FormTreeItem> => ({
    key: String(folder.id),
    label: folder.name,
    mutable: true,
    items: (byFolder.get(folder.id) ?? []).map((t) => ({ id: t.formKey, t })),
    headerStyle: depth > 0 ? { paddingLeft: 28, fontSize: 12, color: "var(--slate)", fontWeight: 600 } : undefined,
    emptyHint: "空文件夹",
    emptyActionLabel: "移动表单",
    children: (folder.children ?? []).map((c) => toGroup(c, depth + 1)),
  });
  const top = (folders ?? []).map((f) => toGroup(f, 0));
  if (ungrouped.length > 0) {
    top.push({ key: UNGROUPED, label: UNGROUPED, mutable: false, items: ungrouped.map((t) => ({ id: t.formKey, t })) });
  }
  return top;
}

export default function NhpTemplateListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useGoBack("/nhp-admin/template");
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const publishFilter: PublishFilter = searchParams.get("status") === "ALL" ? "ALL" : "PUBLISHED";
  const selectedKey = searchParams.get("formKey") ?? null;
  const [previewFormId, setPreviewFormId] = useState<number | null>(null);

  // tab 与选中项写进 URL，返回时经 returnTo 恢复浏览位置
  const setPublishFilter = (v: PublishFilter) => {
    const next = new URLSearchParams(searchParams);
    if (v === "ALL") next.set("status", "ALL");
    else next.delete("status");
    next.delete("formKey");
    setSearchParams(next, { replace: true });
  };
  const setSelectedKey = (key: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (key) next.set("formKey", key);
    else next.delete("formKey");
    setSearchParams(next, { replace: true });
  };
  const [selectedFormKeys, setSelectedFormKeys] = useState<Set<string>>(new Set());
  const [atomOpen, setAtomOpen] = useState(false);
  const [atomFormKey, setAtomFormKey] = useState("");
  const [atomTitle, setAtomTitle] = useState("");
  const [publishAtomOpen, setPublishAtomOpen] = useState(false);
  const [publishAtomHostType, setPublishAtomHostType] = useState<"DONOR" | "RECIPIENT">("RECIPIENT");

  const listQuery = useQuery({
    queryKey: ["nhp", "templates", "ALL"],
    queryFn: () => fetchNhpTemplates("ALL"),
  });

  const versionsQuery = useQuery({
    queryKey: ["nhp", "templates", "versions", selectedKey],
    queryFn: () => fetchNhpTemplateVersions(selectedKey!),
    enabled: !!selectedKey,
  });

  const previewQuery = useQuery({
    queryKey: ["nhp", "templates", "by-id", previewFormId],
    queryFn: () => fetchNhpTemplateById(previewFormId!),
    enabled: !!previewFormId,
  });

  const foldersQuery = useQuery({
    queryKey: ["aup", "folders", NHP_FORM_OWNER],
    queryFn: () => listAupFolders(NHP_FORM_OWNER),
  });

  const moveFolderMut = useMutation({
    mutationFn: ({ formKey, folderId }: { formKey: string; folderId: number | null }) =>
      setNhpTemplateFolder(formKey, folderId),
    onSuccess: () => {
      toast.success("已移动");
      qc.invalidateQueries({ queryKey: ["nhp", "templates"] });
    },
    onError: (e: Error) => toast.error(e.message || "移动失败", { duration: 6000 }),
  });

  const templates = useMemo(() => {
    const byKey = new Map<string, NhpTemplateListItem>();
    for (const t of listQuery.data ?? []) {
      if (publishFilter === "PUBLISHED" && !isFillablePublished(t)) continue;
      byKey.set(t.formKey, t);
    }
    return [...byKey.values()].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }, [listQuery.data, publishFilter]);

  const versions = useMemo(() => {
    const rows = [...(versionsQuery.data ?? [])];
    rows.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    return rows;
  }, [versionsQuery.data]);

  const selected = useMemo(() => {
    const hit = templates.find((t) => t.formKey === selectedKey) ?? null;
    if (hit) return hit;
    if (selectedKey && versions[0]?.formKey === selectedKey) return versions[0];
    return null;
  }, [templates, selectedKey, versions]);

  const selectedKind = selected ? templateKind(selected) : null;

  const selectedDictKey = (selected?.dictKey || "pig").trim() || "pig";
  const structureQuery = useQuery({
    queryKey: ["nhp", "dict-structure", selectedDictKey],
    queryFn: () => fetchNhpDictStructure(selectedDictKey),
    enabled: selectedKind === "COMPOSITE" && (selected?.atoms?.length ?? 0) > 0,
  });
  const domainNameMap = useMemo(
    () => buildDomainNameMap(structureQuery.data?.domains),
    [structureQuery.data],
  );

  const openCompositeInList = (formKey: string, formId?: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("status", "ALL");
    next.set("formKey", formKey);
    setSearchParams(next, { replace: true });
    if (formId != null) setPreviewFormId(formId);
  };

  useEffect(() => {
    if (!templates.length) {
      setSelectedKey(null);
      setPreviewFormId(null);
      return;
    }
    const still = selectedKey && templates.some((t) => t.formKey === selectedKey);
    const nextKey = still ? selectedKey! : templates[0].formKey;
    if (nextKey !== selectedKey) setSelectedKey(nextKey);
  }, [templates, selectedKey]);

  useEffect(() => {
    if (!selectedKey) {
      setPreviewFormId(null);
      return;
    }
    if (versionsQuery.isLoading) return;
    if (versions.length) {
      const head = versions[0];
      setPreviewFormId((prev) => {
        if (prev && versions.some((v) => v.formId === prev)) return prev;
        return head.formId;
      });
    } else if (selected?.formId) {
      setPreviewFormId(selected.formId);
    }
  }, [selectedKey, versions, versionsQuery.isLoading, selected?.formId]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["nhp", "templates"] });
    void qc.invalidateQueries({ queryKey: ["nhp", "assignable-templates"] });
  };

  const importSeedMutation = useMutation({
    mutationFn: () => importNhpBuiltinSeedTemplates(),
    onSuccess: (r) => {
      toast.success(formatBuiltinSeedImportToast(r), { duration: 9000 });
      setPublishFilter("ALL");
      invalidate();
      void qc.invalidateQueries({ queryKey: ["nhp", "field-dictionaries"] });
      void qc.invalidateQueries({ queryKey: ["nhp", "fields"] });
      void qc.invalidateQueries({ queryKey: ["nhp", "field-structure"] });
    },
    onError: (e: Error) => toast.error(e.message || "导入失败", { duration: 9000 }),
  });

  const createBlankCompositeMutation = useMutation({
    mutationFn: () => createNhpCompositeDraft(),
    onSuccess: (t) => {
      toast.success("已创建空白组合草稿，请在编辑器中钉住原子或搭建章节");
      invalidate();
      navigate(editPath(t.formKey, t.formId), { state: nhpNavState(location) });
    },
    onError: (e: Error) => toast.error(e.message || "创建组合草稿失败"),
  });

  const createAtomMutation = useMutation({
    mutationFn: () =>
      createNhpAtom({
        formKey: atomFormKey.trim().toUpperCase(),
        title: atomTitle.trim() || atomFormKey.trim().toUpperCase(),
      }),
    onSuccess: (t) => {
      toast.success(`已新建原子域 ${t.formKey}`);
      setAtomOpen(false);
      setAtomFormKey("");
      setAtomTitle("");
      invalidate();
      setPublishFilter("ALL");
    },
    onError: (e: Error) => toast.error(e.message || "新建原子域失败"),
  });

  const publishMutation = useMutation({
    mutationFn: (args: { formKey: string; hostType?: "DONOR" | "RECIPIENT" }) =>
      publishNhpTemplate(args.formKey, args.hostType),
    onSuccess: () => {
      toast.success("已发布（冻结）");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "发布失败"),
  });

  const unfreezeMutation = useMutation({
    mutationFn: (formKey: string) => unfreezeNhpTemplate(formKey),
    onSuccess: (t) => {
      toast.success(`已解冻「${t.formKey}」@v${t.version ?? ""} 为草稿`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "解冻失败", { duration: 9000 }),
  });

  const restoreMutation = useMutation({
    mutationFn: (formKey: string) => restoreNhpTemplateArchived(formKey),
    onSuccess: (t) => {
      toast.success(`已恢复「${t.formKey}」@v${t.version ?? ""} 为已发布`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "恢复失败", { duration: 8000 }),
  });

  const draftMutation = useMutation({
    mutationFn: (formKey: string) => createNhpTemplateDraft(formKey),
    onSuccess: (t) => {
      toast.success(`已新建版本 v${t.version ?? ""}，请修改后保存`);
      invalidate();
      navigate(editPath(t.formKey, t.formId), { state: nhpNavState(location) });
    },
    onError: (e: Error) => toast.error(e.message || "新建版本失败"),
  });

  const copyMutation = useMutation({
    mutationFn: (args: { formKey: string; teamId: number | null }) => copyNhpTemplate(args.formKey, args.teamId),
    onSuccess: (t) => {
      toast.success(`已复制为「${t.formKey}」，可在此基础上修改`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "复制失败"),
  });

  const [copyPendingFormKey, setCopyPendingFormKey] = useState<string | null>(null);
  const [copyTeamId, setCopyTeamId] = useState<number | null>(null);
  const myTeamsQuery = useQuery({
    queryKey: ["team", "my"] as const,
    queryFn: async () => (await fetchTeams(1, 100)).list.filter((t) => !!t.myRole),
  });
  const myTeams = myTeamsQuery.data ?? [];

  const deleteVersionMutation = useMutation({
    mutationFn: (formId: number) => deleteNhpTemplateVersion(formId),
    onSuccess: (d) => {
      toast.success(`已删除 v${d.version ?? ""}`);
      setPreviewFormId(null);
      invalidate();
      void qc.invalidateQueries({ queryKey: ["nhp", "templates", "versions"] });
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const deleteAllMutation = useMutation({
    mutationFn: (formKey: string) => deleteNhpTemplateAllVersions(formKey),
    onSuccess: (d, formKey) => {
      const blocked = d.blocked?.length ? `；未删：${d.blocked.join("；")}` : "";
      toast.success(`「${formKey}」已删 ${d.deletedCount} 个版本${blocked}`);
      setSelectedKey(null);
      setPreviewFormId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (formKeys: string[]) => batchDeleteNhpTemplates(formKeys),
    onSuccess: (d) => {
      const blocked = d.blocked?.length ? `；未删：${d.blocked.join("；")}` : "";
      toast.success(
        `已删 ${d.deletedCount} 个版本（${d.deletedKeys?.length ?? 0} 个模板）${blocked}`,
        { duration: 9000 },
      );
      setSelectedFormKeys(new Set());
      setSelectedKey(null);
      setPreviewFormId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "批量删除失败", { duration: 9000 }),
  });

  const toggleSelect = (formKey: string) => {
    setSelectedFormKeys((prev) => {
      const next = new Set(prev);
      if (next.has(formKey)) next.delete(formKey);
      else next.add(formKey);
      return next;
    });
  };

  const allSelected = templates.length > 0 && templates.every((t) => selectedFormKeys.has(t.formKey));
  const toggleSelectAll = () => {
    setSelectedFormKeys(allSelected ? new Set() : new Set(templates.map((t) => t.formKey)));
  };

  const selectRow = (t: NhpTemplateListItem) => {
    setSelectedKey(t.formKey);
    setPreviewFormId(t.formId);
  };

  /* ── 表单文件夹树 ── */
  const folders = foldersQuery.data ?? [];
  const folderTree = useMemo(() => buildFormFolderTree(folders, templates), [folders, templates]);

  const folderIdOf = (key: string): number | undefined => (key === UNGROUPED ? undefined : Number(key));

  const createFolderMut = useMutation({
    mutationFn: (body: { parentId: number; name: string }) =>
      createAupFolder({ ownerType: NHP_FORM_OWNER, ...body }),
    onSuccess: () => {
      toast.success("已新建文件夹");
      qc.invalidateQueries({ queryKey: ["aup", "folders", NHP_FORM_OWNER] });
    },
    onError: (e: Error) => toast.error(e.message || "新建文件夹失败", { duration: 6000 }),
  });

  const renameFolderMut = useMutation({
    mutationFn: (body: { id: number; name: string }) => updateAupFolder(body.id, { name: body.name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aup", "folders", NHP_FORM_OWNER] }),
    onError: (e: Error) => toast.error(e.message || "重命名失败", { duration: 6000 }),
  });

  const deleteFolderMut = useMutation({
    mutationFn: (id: number) => deleteAupFolder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aup", "folders", NHP_FORM_OWNER] }),
    onError: (e: Error) => toast.error(e.message || "删除失败", { duration: 6000 }),
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
  const handleMoveForm = (formKey: string, _from: string, toKey: string) => {
    moveFolderMut.mutate({ formKey, folderId: folderIdOf(toKey) ?? null });
  };
  const handleCopyForm = async (itemId: string) => {
    if (!(await appConfirm("复制整份表单（含全部版本，复制后全部变草稿），在此基础上修改不影响原模板。确认？"))) return;
    if (myTeams.length === 0) {
      copyMutation.mutate({ formKey: itemId, teamId: null });
    } else if (myTeams.length === 1) {
      copyMutation.mutate({ formKey: itemId, teamId: myTeams[0].id });
    } else {
      setCopyPendingFormKey(itemId);
      setCopyTeamId(myTeams[0].id);
    }
  };
  const handleDeleteForm = async (itemId: string) => {
    if (await appConfirm(`删除「${itemId}」的全部版本？被填写实例/组合钉住引用的版本会跳过。确认？`, { danger: true })) {
      deleteAllMutation.mutate(itemId);
    }
  };

  const previewOrigin = previewQuery.data?.origin ?? versions.find((v) => v.formId === previewFormId)?.origin;
  const previewVersion = previewQuery.data?.version ?? versions.find((v) => v.formId === previewFormId)?.version;
  const previewItem = previewFormId != null ? versions.find((v) => v.formId === previewFormId) : undefined;

  return (
    <div className="aup-app aup-app--workbench nhp-template-admin">
      <div className="aup-wb">
        <div className="nhp-template-top-panel">
          <button type="button" className="btn ghost small" onClick={goBack}>
            ← 返回
          </button>

          <div className="nhp-template-tabs" role="tablist" aria-label="发布状态">
            {PUBLISH_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                className={`nhp-template-tab${publishFilter === f.value ? " on" : ""}`}
                onClick={() => {
                  setPublishFilter(f.value);
                  setPreviewFormId(null);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <span className="aup-wb-count">共 {templates.length} 个</span>

          <div className="nhp-template-toolbar-actions">
            {selectedFormKeys.size > 0 && (
              <>
                <button type="button" className="btn ghost small" onClick={toggleSelectAll}>
                  {allSelected ? "取消全选" : "全选"}
                </button>
                <button
                  type="button"
                  className="btn small danger"
                  disabled={batchDeleteMutation.isPending}
                  onClick={async () => {
                    if (
                      await appConfirm(
                        `批量软删选中的 ${selectedFormKeys.size} 个模板（各自全部活跃版本）？\n被填写实例引用或被组合钉住的版本会跳过并说明原因。`,
                      )
                    ) {
                      batchDeleteMutation.mutate([...selectedFormKeys]);
                    }
                  }}
                >
                  {batchDeleteMutation.isPending ? "删除中…" : `批量删除 (${selectedFormKeys.size})`}
                </button>
              </>
            )}
            <button
              type="button"
              className="btn primary small"
              disabled={importSeedMutation.isPending}
              onClick={async () => {
                if (
                  await appConfirm(
                    "【一键导入内置种子】将同步猪字典字段（冻结 + 重建大纲），导入 45 个 DRAFT 域原子模板（含题目）。\n\n" +
                      "已有字段/原子幂等更新，不是失败。导入不会生成组合模板；原子为 DRAFT 需手动发布。导入后请在「含草稿」中查看并发布各原子。继续？",
                  )
                ) {
                  importSeedMutation.mutate();
                }
              }}
              title="POST /nhp/seed/pig-dictionary + /nhp/seed/atoms"
            >
              {importSeedMutation.isPending ? "导入中…" : "导入内置种子"}
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setAtomOpen(true)}
              title="新建原子域（数据域模块），指定宿主（供体/受体）"
            >
              ＋ 新建原子域
            </button>
            <button
              type="button"
              className="btn primary small"
              disabled={createBlankCompositeMutation.isPending}
              onClick={() => createBlankCompositeMutation.mutate()}
            >
              {createBlankCompositeMutation.isPending ? "创建中…" : "＋ 去发布"}
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => navigate("/nhp-admin/field", { state: nhpNavState(location) })}
              title="维护字段字典（域/子模块/字段）"
            >
              🗂️ 管理字段
            </button>
          </div>
        </div>

        <div className="aup-wb-split aup-wb-split--wide-aside nhp-template-split">
          <aside className="aup-wb-aside">
            {listQuery.isLoading && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载中…</div>
            )}
            {!listQuery.isLoading && templates.length === 0 && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                {publishFilter === "PUBLISHED"
                  ? "暂无已发布模板。可点「导入内置种子」后在「含草稿」中编辑并发布原子，或用「＋ 去发布」新建。"
                  : "暂无模板。点「导入内置种子」一键恢复字段包 + 45 个草稿原子模板，或用「＋ 去发布」新建。"}
              </div>
            )}
            <FolderTreeManager<FormTreeItem>
              folders={folderTree}
              selectedItemId={selectedKey}
              canMaintain
              emptyState={
                <div style={{ padding: 20, textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>尚无文件夹</div>
                  <button type="button" className="btn ghost small" onClick={() => handleCreateFolder()}>
                    ＋ 新建文件夹
                  </button>
                </div>
              }
              onSelectItem={(formKey) => {
                const hit = templates.find((x) => x.formKey === formKey);
                if (hit) selectRow(hit);
              }}
              renderItem={(item) => {
                const t = item.t;
                const k = templateKind(t);
                const metaKey = k === "ATOM" ? atomListMetaKey(t) : t.formKey;
                const hostType = t.hostType === "DONOR" ? "供体" : t.hostType === "RECIPIENT" ? "受体" : "";
                const isPub = isPublished(t.status);
                return (
                  <div
                    style={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0, gap: 8 }}
                    title={t.description || t.title}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFormKeys.has(t.formKey)}
                      onChange={() => toggleSelect(t.formKey)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ flexShrink: 0, cursor: "pointer", accentColor: "var(--primary, #002FA7)" }}
                      title="勾选以批量删除"
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="lbl" style={{ fontWeight: 600, fontSize: 13 }}>
                        {t.title || t.formKey}
                      </div>
                      <div className="meta" style={{ marginTop: 1, fontSize: 11, color: "var(--muted)" }}>
                        {itemKindLabel(t)}
                        <span style={{ fontFamily: "ui-monospace, monospace", marginLeft: 4 }}>{metaKey}</span>
                        <span style={{ marginLeft: 4 }}>v{t.version ?? "—"}</span>
                        {hostType ? <span style={{ marginLeft: 4 }}>· {hostType}</span> : null}
                        {k === "COMPOSITE" && (t.atoms?.length ?? t.atomCount)
                          ? <span style={{ marginLeft: 4 }}>· {t.atoms?.length ?? t.atomCount} 原子</span>
                          : null}
                      </div>
                    </div>
                    <span
                      className="aup-wb-chip"
                      style={{
                        flexShrink: 0,
                        background: isPub ? "#e8f7ee" : t.locked ? "#f1f5f9" : "#eef2ff",
                        color: isPub ? "#16a34a" : t.locked ? "#64748b" : "#002FA7",
                      }}
                    >
                      {listStatusText(t)}
                    </span>
                  </div>
                );
              }}
              onMoveItem={handleMoveForm}
              onCreateFolder={() => handleCreateFolder()}
              onCreateSubFolder={(folderKey) => handleCreateFolder(folderKey)}
              onCreateItem={() => setAtomOpen(true)}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onCopyItem={handleCopyForm}
              onDeleteItem={handleDeleteForm}
              folderActions={() => ["createItem", "createFolder", "rename", "delete"]}
              labels={FORM_FOLDER_LABELS}
              itemActions={() => ["copy", "moveItem", "delete"]}
            />
          </aside>

          <div className="aup-wb-main">
            {!selected && <div className="aup-wb-empty">选左侧模板查看版本与结构预览</div>}

            {selected && selectedKind && (
              <div className="aup-wb-panel nhp-template-detail">
                <div className="aup-wb-panel-hd" style={{ alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", lineHeight: 1.3 }}>
                      {selected.title || selected.formKey}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.5 }}>
                      {itemKindLabel(selected)}
                      <span style={{ fontFamily: "ui-monospace, monospace", marginLeft: 6 }}>
                        {selectedKind === "ATOM" ? atomListMetaKey(selected) : selected.formKey}
                      </span>
                      <span style={{ marginLeft: 6 }}>v{previewVersion ?? selected.version ?? "?"}</span>
                      {selected.hostType === "DONOR" || selected.hostType === "RECIPIENT" ? (
                        <span style={{ marginLeft: 6 }}>· {selected.hostType === "DONOR" ? "供体表单" : "受体表单"}</span>
                      ) : null}
                      {versionOriginLabel(previewOrigin) ? (
                        <span style={{ marginLeft: 6, color: "#c2410c" }}>· {versionOriginLabel(previewOrigin)}</span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn small ghost"
                    title={
                      previewFormId != null
                        ? `编辑当前预览版本 (id=${previewFormId})`
                        : undefined
                    }
                    onClick={() =>
                      navigate(editPath(selected.formKey, previewFormId ?? selected.formId), {
                        state: nhpNavState(location),
                      })
                    }
                  >
                    {selectedKind === "ATOM" || (previewItem?.status ?? selected.status) === "DRAFT"
                      ? "编辑 ▸"
                      : "查看 ▸"}
                  </button>
                  {selectedKind === "ATOM" && (
                    <button
                      type="button"
                      className="btn small primary"
                      disabled={draftMutation.isPending}
                      onClick={async () => {
                        if (
                          await appConfirm(
                            "基于当前最新版克隆新版本（版号自动补位空缺；原子请通过版本演进，勿覆盖已钉住/已发布版本）。确认？",
                          )
                        ) {
                          draftMutation.mutate(selected.formKey);
                        }
                      }}
                    >
                      新建版本
                    </button>
                  )}
                  {selectedKind === "ATOM" && selected.status === "DRAFT" && !selected.locked && (
                    <button
                      type="button"
                      className="btn small primary"
                      disabled={publishMutation.isPending}
                      onClick={() => {
                        setPublishAtomHostType((selected.hostType as "DONOR" | "RECIPIENT") || "RECIPIENT");
                        setPublishAtomOpen(true);
                      }}
                    >
                      发布为独立表单
                    </button>
                  )}
                  {selectedKind === "COMPOSITE" && selected.status === "DRAFT" && (
                    <button
                      type="button"
                      className="btn small primary"
                      disabled={publishMutation.isPending}
                      onClick={async () => {
                        if (await appConfirm("发布后冻结该组合版本。确认？")) {
                          publishMutation.mutate({ formKey: selected.formKey });
                        }
                      }}
                    >
                      发布
                    </button>
                  )}
                  {(isPublished(selected.status) || selected.hasPublished) && (
                    <>
                      <button
                        type="button"
                        className="btn small primary"
                        onClick={() =>
                          navigate(`/nhp/fill?formKey=${encodeURIComponent(selected.formKey)}`)
                        }
                      >
                        去门户建实例
                      </button>
                      {isPublished(selected.status) && (
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={unfreezeMutation.isPending}
                          title="无活跃填写实例（软删不计）；原子另须无组合钉住"
                          onClick={async () => {
                            if (
                              await appConfirm(
                                `解冻「${selected.formKey}」当前已发布版为草稿？仅当无活跃填写实例${
                                  selectedKind === "ATOM" ? "且无组合钉住" : ""
                                }时允许。确认？`,
                              )
                            ) {
                              unfreezeMutation.mutate(selected.formKey);
                            }
                          }}
                        >
                          解冻
                        </button>
                      )}
                      {selectedKind === "COMPOSITE" && isPublished(selected.status) && (
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={draftMutation.isPending}
                          onClick={() => draftMutation.mutate(selected.formKey)}
                        >
                          新建草稿版本
                        </button>
                      )}
                    </>
                  )}
                  {isArchived(selected.status) && (
                    <button
                      type="button"
                      className="btn small ghost"
                      disabled={restoreMutation.isPending}
                      title="恢复已归档版本为已发布（不进入草稿编辑态）"
                      onClick={async () => {
                        if (await appConfirm(`恢复「${selected.formKey}」已归档版本为已发布？`)) {
                          restoreMutation.mutate(selected.formKey);
                        }
                      }}
                    >
                      恢复
                    </button>
                  )}
                </div>

                <p className="nhp-template-detail-hint">
                  {selectedKind === "ATOM"
                    ? "预览仅含该域章节。列表头可能是草稿——若有「已发布 vN」徽标仍可开填。字段维护请用右上角「管理字段」。"
                    : "组合版本是多原子快照。列表头若是草稿但下方有已发布版，开填请用已发布版。"}
                </p>

                <div className="nhp-template-ver-row">
                  <span className="nhp-template-ver-label">本{selectedKind === "ATOM" ? "原子" : "组合"}版本</span>
                  {versionsQuery.isLoading ? (
                    <span className="muted">加载版本…</span>
                  ) : versions.length === 0 ? (
                    <span className="nhp-ver-chip-wrap">
                      <button
                        type="button"
                        className={`nhp-ver-chip${previewFormId === selected.formId ? " active" : ""}`}
                        onClick={() => setPreviewFormId(selected.formId)}
                      >
                        v{selected.version ?? 1}
                        {versionOriginLabel(selected.origin) ? ` · ${versionOriginLabel(selected.origin)}` : ""}
                      </button>
                    </span>
                  ) : (
                    versions.map((v) => {
                      const ol = versionOriginLabel(v.origin);
                      return (
                        <span key={v.formId} className="nhp-ver-chip-wrap">
                          <button
                            type="button"
                            className={`nhp-ver-chip${previewFormId === v.formId ? " active" : ""}`}
                            onClick={() => setPreviewFormId(v.formId)}
                            title={v.description || statusLabel(v.status)}
                          >
                            v{v.version ?? "?"}
                            {ol ? ` · ${ol}` : ""}
                            {` · ${statusLabel(v.status)}`}
                            {selectedKind === "ATOM" && v.locked ? " · 钉住" : ""}
                          </button>
                          <button
                            type="button"
                            className="nhp-ver-del"
                            title="删除此版本"
                            disabled={deleteVersionMutation.isPending}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (
                                await appConfirm(
                                  `软删 v${v.version ?? "?"}？若有填写实例引用或原子被组合钉住将拒绝并提示原因。`,
                                )
                              ) {
                                deleteVersionMutation.mutate(v.formId);
                              }
                            }}
                          >
                            删
                          </button>
                        </span>
                      );
                    })
                  )}
                  <button
                    type="button"
                    className="btn small ghost"
                    style={{ marginLeft: 8 }}
                    disabled={deleteAllMutation.isPending || !selected.formKey}
                    onClick={async () => {
                      if (
                        await appConfirm(
                          `软删「${selected.formKey}」下全部活跃版本？被填写实例引用或被组合钉住的版本会跳过并说明原因。`,
                        )
                      ) {
                        deleteAllMutation.mutate(selected.formKey);
                      }
                    }}
                  >
                    {deleteAllMutation.isPending ? "删除中…" : "清理全部版本"}
                  </button>
                </div>

                {selectedKind === "COMPOSITE" && (selected.atoms?.length ?? 0) > 0 && (
                  <div className="nhp-template-atoms-line">
                    钉住原子：
                    <AtomPickList
                      picks={(selected.atoms ?? []).map((a) => ({
                        atomCode: a.atomCode,
                        version: a.atomVersion,
                        title: a.atomTitle,
                      }))}
                      nameMap={domainNameMap}
                    />
                  </div>
                )}

                {selectedKind === "ATOM" &&
                  (() => {
                    const pinSrc =
                      (previewQuery.data?.referencedBy?.length
                        ? previewQuery.data.referencedBy
                        : null) ||
                      versions.find((v) => v.formId === previewFormId)?.referencedBy ||
                      selected.referencedBy;
                    if (!pinSrc?.length) return null;
                    return (
                      <div
                        className="nhp-template-atoms-line"
                        style={{ color: "#9a3412", background: "#fff7ed", padding: "8px 10px", borderRadius: 6 }}
                      >
                        当前版本被组合钉住：{formatPinRefs(pinSrc)}。
                        {pinSrc.map((r) => (
                          <button
                            key={`${r.formKey}-${r.compositeFormId}`}
                            type="button"
                            className="btn small ghost"
                            style={{ marginLeft: 6 }}
                            onClick={() => openCompositeInList(r.formKey, r.compositeFormId)}
                          >
                            打开 {r.formKey}@v{r.version ?? "?"}
                          </button>
                        ))}
                      </div>
                    );
                  })()}

                <div className="nhp-template-preview-box">
                  <div className="nhp-composer-preview-hd">结构预览（当前选中版本）</div>
                  <div className="nhp-composer-preview-body">
                    {!previewFormId ? (
                      <div className="aup-empty small">请选择版本</div>
                    ) : previewQuery.isLoading ? (
                      <div className="aup-empty small">加载预览…</div>
                    ) : previewQuery.isError ? (
                      <div className="aup-empty small">预览加载失败</div>
                    ) : (
                      <NhpTemplateStructurePreview
                        template={previewQuery.data}
                        emptyHint="该版本无结构"
                      />
                    )}
                  </div>
                </div>

                {selected.updatedAt && (
                  <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                    更新 {formatDateTimeAsiaShanghaiShort(selected.updatedAt)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {atomOpen && (
        <div className="aup-modal-mask" onClick={() => setAtomOpen(false)}>
          <div className="aup-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3>新建原子域</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              新建一个数据域模块原子，作为发布/组合的单元。域码可自定义（不限 D1-D10），宿主决定该域表单挂给供体还是受体。
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ fontSize: 13 }}>
                域码（formKey）
                <input
                  className="input"
                  style={{ width: "100%", marginTop: 4 }}
                  value={atomFormKey}
                  onChange={(e) => setAtomFormKey(e.target.value)}
                  placeholder="如 D11 / 自定义域码"
                />
              </label>
              <label style={{ fontSize: 13 }}>
                名称
                <input
                  className="input"
                  style={{ width: "100%", marginTop: 4 }}
                  value={atomTitle}
                  onChange={(e) => setAtomTitle(e.target.value)}
                  placeholder="如 术后并发症域"
                />
              </label>
            </div>
            <div className="aup-modal-actions">
              <button type="button" className="btn ghost" onClick={() => setAtomOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={createAtomMutation.isPending || !atomFormKey.trim()}
                onClick={() => createAtomMutation.mutate()}
              >
                {createAtomMutation.isPending ? "创建中…" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
      {copyPendingFormKey && (
        <div className="aup-modal-mask" onClick={() => setCopyPendingFormKey(null)}>
          <div className="aup-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3>复制到团队</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              您属于多个团队，请选择副本归属的团队：
            </p>
            <select
              className="select"
              style={{ width: "100%", marginBottom: 12 }}
              value={copyTeamId ?? ""}
              onChange={(e) => setCopyTeamId(Number(e.target.value))}
            >
              {myTeams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <div className="aup-modal-actions">
              <button type="button" className="btn ghost" onClick={() => setCopyPendingFormKey(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={copyMutation.isPending || copyTeamId == null}
                onClick={() => {
                  copyMutation.mutate({ formKey: copyPendingFormKey, teamId: copyTeamId });
                  setCopyPendingFormKey(null);
                }}
              >
                {copyMutation.isPending ? "复制中…" : "复制"}
              </button>
            </div>
          </div>
        </div>
      )}
      {publishAtomOpen && (
        <div className="aup-modal-mask" onClick={() => setPublishAtomOpen(false)}>
          <div className="aup-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3>发布为独立表单</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              发布时确定该表单的「宿主」：供体域挂供体对象，受体域挂受体对象。
            </p>
            <label style={{ fontSize: 13 }}>
              宿主（hostType）
              <select
                className="select"
                style={{ width: "100%", marginTop: 4 }}
                value={publishAtomHostType}
                onChange={(e) => setPublishAtomHostType(e.target.value as "DONOR" | "RECIPIENT")}
              >
                <option value="RECIPIENT">受体表单（术后表单挂受体）</option>
                <option value="DONOR">供体表单（供体表单挂供体）</option>
              </select>
            </label>
            <div className="aup-modal-actions">
              <button type="button" className="btn ghost" onClick={() => setPublishAtomOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={publishMutation.isPending}
                onClick={() => {
                  publishMutation.mutate({ formKey: selected!.formKey, hostType: publishAtomHostType });
                  setPublishAtomOpen(false);
                }}
              >
                {publishMutation.isPending ? "发布中…" : "发布"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
