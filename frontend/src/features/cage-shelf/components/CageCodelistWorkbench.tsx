/**
 * 笼位域码表管理工作台（UI 对齐 NHP 码表页，数据走 cage_info_codelist）。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import FolderTreeManager, { type FolderAction, type FolderTreeGroup } from "@/features/nhp/components/FolderTreeManager";
import { CODELIST_FOLDER_LABELS } from "@/features/nhp/utils/folderTreeLabels";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { scheduleScrollAsideItem } from "@/features/nhp/utils/scrollAsideItem";
import {
  addCageInfoCodelistItem,
  createCageInfoCodelist,
  deleteCageInfoCodelist,
  deleteCageInfoCodelistItem,
  fetchCageInfoCodelist,
  fetchCageInfoCodelists,
  updateCageInfoCodelistItem,
  updateCageInfoCodelistMeta,
  type CageCodelistItem,
  type CageCodelistSummary,
} from "../api/cageForm.api";
import "@/features/aup/aup.css";

const UNGROUPED = "未分类";
const PENDING_FOLDERS_STORAGE_KEY = "cage-codelist-pending-folders";
const FOLDER_PATH_SEP = "/";
const MAX_FOLDER_PATH_LEN = 64;

interface ItemModal {
  mode: "add" | "edit";
  itemCode: string;
  itemLabel: string;
  itemId?: number;
}

interface CreateCodelistModal {
  folder: string;
  code: string;
  name: string;
}

interface EditCodelistMetaModal {
  name: string;
  folder: string;
}

function folderPathSegments(path: string): string[] {
  return path.split(FOLDER_PATH_SEP).filter((s) => s.length > 0);
}

function joinFolderPath(parent: string, childName: string): string {
  const child = childName.trim();
  if (!child) return parent;
  return parent ? `${parent}${FOLDER_PATH_SEP}${child}` : child;
}

function isUnderFolderPath(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}${FOLDER_PATH_SEP}`);
}

function replaceFolderPathPrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) return newPrefix;
  if (path.startsWith(`${oldPrefix}${FOLDER_PATH_SEP}`)) {
    return newPrefix + path.slice(oldPrefix.length);
  }
  return path;
}

function validateFolderSegmentName(name: string): string | null {
  if (!name.trim()) return "名称不能为空";
  if (name === UNGROUPED) return `「${UNGROUPED}」为系统保留名`;
  if (name.includes(FOLDER_PATH_SEP)) return `文件夹名不能包含「${FOLDER_PATH_SEP}」`;
  return null;
}

function validateFolderPath(path: string): string | null {
  if (path.length > MAX_FOLDER_PATH_LEN) {
    return `文件夹路径不能超过 ${MAX_FOLDER_PATH_LEN} 个字符`;
  }
  return null;
}

function codelistFolderKey(folder?: string | null): string {
  return (folder ?? "").trim() || UNGROUPED;
}

function folderFieldValue(folderKey: string): string {
  return folderKey === UNGROUPED ? "" : folderKey;
}

function allKnownFolderKeys(codelists: CageCodelistSummary[], pendingFolders: Set<string>): Set<string> {
  const keys = new Set<string>();
  for (const c of codelists) {
    const fk = codelistFolderKey(c.folder);
    if (fk !== UNGROUPED) keys.add(fk);
  }
  for (const f of pendingFolders) keys.add(f);
  return keys;
}

function folderHasSubfolders(folderKey: string, knownKeys: Set<string>): boolean {
  for (const k of knownKeys) {
    if (k !== folderKey && k.startsWith(`${folderKey}${FOLDER_PATH_SEP}`)) return true;
  }
  return false;
}

function countTreeFolderNodes(groups: FolderTreeGroup[]): number {
  let n = 0;
  for (const g of groups) {
    if (g.key !== UNGROUPED) n += 1;
    n += countTreeFolderNodes(g.children ?? []);
  }
  return n;
}

function buildNestedCodelistFolderTree(
  grouped: Array<[string, CageCodelistSummary[]]>,
): FolderTreeGroup<{ id: string; codelist: CageCodelistSummary }>[] {
  type Node = {
    key: string;
    label: string;
    items: { id: string; codelist: CageCodelistSummary }[];
    children: Map<string, Node>;
  };

  const roots = new Map<string, Node>();

  const getOrCreateNode = (fullKey: string): Node => {
    const segments = folderPathSegments(fullKey);
    let pathSoFar = "";
    let parentMap = roots;
    let node!: Node;

    for (const seg of segments) {
      pathSoFar = pathSoFar ? `${pathSoFar}${FOLDER_PATH_SEP}${seg}` : seg;
      let existing = parentMap.get(pathSoFar);
      if (!existing) {
        existing = { key: pathSoFar, label: seg, items: [], children: new Map() };
        parentMap.set(pathSoFar, existing);
      }
      node = existing;
      parentMap = existing.children;
    }
    return node;
  };

  const toGroup = (node: Node, depth = 0): FolderTreeGroup<{ id: string; codelist: CageCodelistSummary }> => ({
    key: node.key,
    label: node.label,
    mutable: true,
    items: node.items,
    headerStyle:
      depth > 0
        ? { paddingLeft: 28, fontSize: 12, color: "var(--slate)", fontWeight: 600 }
        : undefined,
    emptyHint: "空文件夹",
    emptyActionLabel: "新建码表",
    children: [...node.children.values()]
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"))
      .map((child) => toGroup(child, depth + 1)),
  });

  let ungrouped: FolderTreeGroup<{ id: string; codelist: CageCodelistSummary }> | null = null;

  for (const [folderKey, list] of grouped) {
    if (folderKey === UNGROUPED) {
      ungrouped = {
        key: UNGROUPED,
        label: UNGROUPED,
        mutable: false,
        items: list.map((c) => ({ id: c.code, codelist: c })),
      };
      continue;
    }
    const node = getOrCreateNode(folderKey);
    node.items = list.map((c) => ({ id: c.code, codelist: c }));
  }

  const topFolders = [...roots.values()]
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"))
    .map((node) => toGroup(node, 0));

  if (ungrouped) topFolders.push(ungrouped);
  return topFolders;
}

function expandFolderPathKeys(prev: Set<string>, folderKey: string): Set<string> {
  const next = new Set(prev);
  let path = "";
  for (const seg of folderPathSegments(folderKey)) {
    path = path ? `${path}${FOLDER_PATH_SEP}${seg}` : seg;
    next.delete(path);
  }
  return next;
}

function loadPendingFolders(): Set<string> {
  try {
    const raw = sessionStorage.getItem(PENDING_FOLDERS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((f): f is string => typeof f === "string" && f.trim() !== "" && f !== UNGROUPED),
    );
  } catch {
    return new Set();
  }
}

export default function CageCodelistWorkbench() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<string | null>(() => searchParams.get("code"));
  const [itemModal, setItemModal] = useState<ItemModal | null>(null);
  const [createModal, setCreateModal] = useState<CreateCodelistModal | null>(null);
  const [editMetaModal, setEditMetaModal] = useState<EditCodelistMetaModal | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [pendingFolders, setPendingFolders] = useState<Set<string>>(loadPendingFolders);
  const asideRef = useRef<HTMLElement>(null);
  const pendingScrollCode = useRef<string | null>(searchParams.get("code"));

  const role = authStorage.getRole() || "";
  const canMaintain = hasMinRole(role, "ADMIN");

  useEffect(() => {
    sessionStorage.setItem(PENDING_FOLDERS_STORAGE_KEY, JSON.stringify([...pendingFolders]));
  }, [pendingFolders]);

  const syncUrl = (code: string | null) => {
    if (code) setSearchParams({ code }, { replace: true });
    else setSearchParams({}, { replace: true });
  };

  const selectCodelist = (code: string) => {
    setSelected(code);
    syncUrl(code);
    pendingScrollCode.current = code;
  };

  const listQuery = useQuery({
    queryKey: ["cage-info", "codelists"],
    queryFn: fetchCageInfoCodelists,
  });

  const detailQuery = useQuery({
    queryKey: ["cage-info", "codelist", "detail", selected],
    queryFn: () => fetchCageInfoCodelist(selected!),
    enabled: !!selected,
  });

  const codelists = listQuery.data ?? [];
  const q = keyword.trim().toLowerCase();

  useEffect(() => {
    const code = searchParams.get("code")?.trim();
    if (!code) return;
    setSelected(code);
    setKeyword("");
    pendingScrollCode.current = code;
    if (listQuery.isSuccess) {
      const hit = codelists.find((c) => c.code === code);
      if (!hit) {
        toast.error(`未找到码表 ${code}`);
        setSelected(null);
        setSearchParams({}, { replace: true });
        pendingScrollCode.current = null;
        return;
      }
      const folder = codelistFolderKey(hit.folder);
      if (folder !== UNGROUPED) {
        setCollapsedFolders((prev) => expandFolderPathKeys(prev, folder));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 深链随 URL / 列表就绪触发
  }, [searchParams, listQuery.isSuccess, codelists]);

  const filtered = useMemo(() => {
    if (!q) return codelists;
    return codelists.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        (c.name || "").toLowerCase().includes(q) ||
        (c.folder || "").toLowerCase().includes(q),
    );
  }, [codelists, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, CageCodelistSummary[]>();
    for (const c of filtered) {
      const folder = codelistFolderKey(c.folder);
      if (!map.has(folder)) map.set(folder, []);
      map.get(folder)!.push(c);
    }
    for (const folder of pendingFolders) {
      if (folder === UNGROUPED) continue;
      if (q && !folder.toLowerCase().includes(q)) continue;
      if (!map.has(folder)) map.set(folder, []);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, "zh-CN"));
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === UNGROUPED) return 1;
      if (b[0] === UNGROUPED) return -1;
      return a[0].localeCompare(b[0], "zh-CN");
    });
  }, [filtered, pendingFolders, q]);

  const folderTreeGroups = useMemo(
    (): FolderTreeGroup<{ id: string; codelist: CageCodelistSummary }>[] =>
      buildNestedCodelistFolderTree(grouped),
    [grouped],
  );

  const folderCount = useMemo(() => countTreeFolderNodes(folderTreeGroups), [folderTreeGroups]);

  const detail = detailQuery.data;
  const items = useMemo(
    () => [...(detail?.items ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [detail?.items],
  );

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ["cage-info", "codelists"] });
    if (selected) {
      void qc.invalidateQueries({ queryKey: ["cage-info", "codelist", "detail", selected] });
    }
  };

  const openCreateInFolder = (folderKey: string) => {
    setCollapsedFolders((prev) => expandFolderPathKeys(prev, folderKey));
    setCreateModal({ folder: folderFieldValue(folderKey), code: "", name: "" });
  };

  const addPendingFolder = (fullPath: string) => {
    setPendingFolders((prev) => new Set(prev).add(fullPath));
    setCollapsedFolders((prev) => expandFolderPathKeys(prev, fullPath));
  };

  const promptCreateFolder = async (parentFolderKey?: string) => {
    const title = parentFolderKey ? "新建子文件夹" : "新建文件夹";
    const name = (await appPrompt(title, ""))?.trim() ?? "";
    if (!name) return;
    const segErr = validateFolderSegmentName(name);
    if (segErr) {
      toast.error(segErr);
      return;
    }
    const fullPath = joinFolderPath(parentFolderKey ?? "", name);
    const pathErr = validateFolderPath(fullPath);
    if (pathErr) {
      toast.error(pathErr);
      return;
    }
    const known = allKnownFolderKeys(codelists, pendingFolders);
    if (known.has(fullPath)) {
      toast.error(`文件夹「${fullPath}」已存在`);
      return;
    }
    addPendingFolder(fullPath);
    if (await appConfirm(`文件夹「${fullPath}」已创建。是否立即在此文件夹新建码表？`)) {
      openCreateInFolder(fullPath);
    }
  };

  const handleRenameFolder = async (folderKey: string) => {
    if (folderKey === UNGROUPED) return;
    const segments = folderPathSegments(folderKey);
    const currentName = segments[segments.length - 1] ?? folderKey;
    const newName = (await appPrompt("重命名文件夹", currentName))?.trim() ?? "";
    if (!newName || newName === currentName) return;
    const segErr = validateFolderSegmentName(newName);
    if (segErr) {
      toast.error(segErr);
      return;
    }
    const parentPath = segments.slice(0, -1).join(FOLDER_PATH_SEP);
    const newPath = parentPath ? joinFolderPath(parentPath, newName) : newName;
    const pathErr = validateFolderPath(newPath);
    if (pathErr) {
      toast.error(pathErr);
      return;
    }
    const known = allKnownFolderKeys(codelists, pendingFolders);
    if (known.has(newPath) && newPath !== folderKey) {
      toast.error(`文件夹「${newPath}」已存在`);
      return;
    }
    const affectedCodes = codelists
      .filter((c) => isUnderFolderPath(codelistFolderKey(c.folder), folderKey))
      .map((c) => c.code);
    if (affectedCodes.length === 0) {
      setPendingFolders((prev) => {
        const next = new Set<string>();
        for (const f of prev) {
          if (f === folderKey || isUnderFolderPath(f, folderKey)) {
            next.add(replaceFolderPathPrefix(f, folderKey, newPath));
          } else {
            next.add(f);
          }
        }
        return next;
      });
      toast.success(`已重命名为「${newPath}」`);
      return;
    }
    renameFolderMut.mutate({ folderKey, newPath, codes: affectedCodes });
  };

  const handleDeleteFolder = async (folderKey: string) => {
    if (folderKey === UNGROUPED) return;
    const known = allKnownFolderKeys(codelists, pendingFolders);
    const directCodes = codelists.filter((c) => codelistFolderKey(c.folder) === folderKey);
    if (directCodes.length > 0 || folderHasSubfolders(folderKey, known)) return;
    if (!(await appConfirm(`确定删除空文件夹「${folderKey}」？`))) return;
    setPendingFolders((prev) => {
      const next = new Set(prev);
      next.delete(folderKey);
      return next;
    });
    toast.success(`已删除文件夹「${folderKey}」`);
  };

  useEffect(() => {
    if (!q) return;
    setCollapsedFolders((prev) => {
      let next = prev;
      for (const [folder, list] of grouped) {
        if (list.length > 0 || folder.toLowerCase().includes(q)) {
          next = expandFolderPathKeys(next, folder);
        }
      }
      return next;
    });
  }, [q, grouped]);

  useEffect(() => {
    const code = pendingScrollCode.current;
    if (!code) return;
    const t = window.setTimeout(() => {
      scheduleScrollAsideItem(asideRef.current, `[data-codelist-code="${CSS.escape(code)}"]`);
      pendingScrollCode.current = null;
    }, 60);
    return () => window.clearTimeout(t);
  }, [selected, filtered, listQuery.isSuccess]);

  const createCodelistMut = useMutation({
    mutationFn: (body: { code: string; name: string; folder?: string }) => createCageInfoCodelist(body),
    onSuccess: (d) => {
      toast.success(`已新建码表「${d.name}」`);
      const fk = codelistFolderKey(d.folder);
      if (fk !== UNGROUPED) {
        setPendingFolders((prev) => {
          if (!prev.has(fk)) return prev;
          const next = new Set(prev);
          next.delete(fk);
          return next;
        });
      }
      setCreateModal(null);
      setSelected(d.code);
      syncUrl(d.code);
      pendingScrollCode.current = d.code;
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "新建码表失败"),
  });

  const renameFolderMut = useMutation({
    mutationFn: async ({
      folderKey,
      newPath,
      codes,
    }: {
      folderKey: string;
      newPath: string;
      codes: string[];
    }) => {
      for (const code of codes) {
        const c = codelists.find((row) => row.code === code);
        if (!c) continue;
        const oldFk = codelistFolderKey(c.folder);
        const newFk = replaceFolderPathPrefix(oldFk, folderKey, newPath);
        await updateCageInfoCodelistMeta(code, { folder: folderFieldValue(newFk) || null });
      }
      return { folderKey, newPath };
    },
    onSuccess: ({ folderKey, newPath }) => {
      toast.success(`文件夹已重命名为「${newPath}」`);
      setPendingFolders((prev) => {
        let changed = false;
        const next = new Set<string>();
        for (const f of prev) {
          if (f === folderKey || isUnderFolderPath(f, folderKey)) {
            next.add(replaceFolderPathPrefix(f, folderKey, newPath));
            changed = true;
          } else {
            next.add(f);
          }
        }
        return changed ? next : prev;
      });
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "重命名文件夹失败"),
  });

  const updateMetaMut = useMutation({
    mutationFn: (body: { name: string; folder?: string | null }) =>
      updateCageInfoCodelistMeta(selected!, body),
    onSuccess: (d) => {
      toast.success(`已更新码表「${d.name}」`);
      setEditMetaModal(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });

  const moveCodelistMut = useMutation({
    mutationFn: ({ code, folderKey }: { code: string; folderKey: string }) =>
      updateCageInfoCodelistMeta(code, { folder: folderFieldValue(folderKey) || null }),
    onSuccess: (d) => {
      toast.success(`已移动到「${codelistFolderKey(d.folder)}」`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "移动失败"),
  });

  const deleteCodelistMut = useMutation({
    mutationFn: (code: string) => deleteCageInfoCodelist(code),
    onSuccess: () => {
      toast.success("已删除码表");
      setSelected(null);
      syncUrl(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败", { duration: 6000 }),
  });

  const addMut = useMutation({
    mutationFn: (body: { itemCode: string; itemLabel: string }) => addCageInfoCodelistItem(selected!, body),
    onSuccess: () => {
      toast.success("已新增项");
      setItemModal(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "新增失败"),
  });

  const updateMut = useMutation({
    mutationFn: ({ itemId, itemLabel }: { itemId: number; itemLabel: string }) =>
      updateCageInfoCodelistItem(selected!, itemId, { itemLabel }),
    onSuccess: () => {
      toast.success("已修改");
      setItemModal(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "修改失败"),
  });

  const deleteMut = useMutation({
    mutationFn: (itemId: number) => deleteCageInfoCodelistItem(selected!, itemId),
    onSuccess: () => {
      toast.success("已删除");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const reorderLocal = async (index: number, dir: -1 | 1) => {
    if (!selected) return;
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const a = items[index];
    const b = items[j];
    try {
      await updateCageInfoCodelistItem(selected, a.id, { sortOrder: b.sortOrder });
      await updateCageInfoCodelistItem(selected, b.id, { sortOrder: a.sortOrder });
      invalidateAll();
    } catch (e) {
      toast.error((e as Error).message || "排序失败");
    }
  };

  const confirmDeleteItem = async (item: CageCodelistItem) => {
    if (!(await appConfirm(`确定删除码表项「${item.itemLabel || item.itemCode}」？`))) return;
    deleteMut.mutate(item.id);
  };

  const confirmDeleteCodelist = async () => {
    if (!detail) return;
    if (!(await appConfirm(`确定删除码表「${detail.name}」（${detail.code}）？被字段引用时将拒绝删除。`))) return;
    deleteCodelistMut.mutate(detail.code);
  };

  const row = (label: string, input: ReactNode) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <label style={{ fontSize: 13, color: "var(--muted)", width: 76, flexShrink: 0, paddingTop: 8 }}>{label}</label>
      <div style={{ flex: 1 }}>{input}</div>
    </div>
  );

  const countText = (
    <>
      共 {filtered.length} 个码表 · {folderCount} 个文件夹
    </>
  );

  const aside = (
    <FolderTreeManager
      folders={folderTreeGroups}
      selectedItemId={selected}
      onSelectItem={selectCodelist}
      loading={listQuery.isLoading}
      canMaintain={canMaintain}
      ungroupedKey={UNGROUPED}
      collapsedFolders={collapsedFolders}
      onCollapsedFoldersChange={setCollapsedFolders}
      deleteFolderPending={renameFolderMut.isPending}
      headerHint="文件夹为分类路径（无独立实体），嵌套用 / 分隔；重命名会批量更新其下全部码表与子路径。"
      labels={CODELIST_FOLDER_LABELS}
      folderActions={(folderKey): FolderAction[] =>
        folderKey === UNGROUPED ? ["createItem"] : ["createItem", "createFolder", "rename", "delete"]
      }
      isFolderDeletable={(group, totalCount) =>
        group.key !== UNGROUPED && totalCount === 0 && (group.children?.length ?? 0) === 0
      }
      itemActions={() => ["moveItem"]}
      onCreateFolder={canMaintain ? () => void promptCreateFolder() : undefined}
      onCreateSubFolder={canMaintain ? (parent) => void promptCreateFolder(parent) : undefined}
      onCreateItem={canMaintain ? (fk) => openCreateInFolder(fk) : undefined}
      onRenameFolder={canMaintain ? (fk) => void handleRenameFolder(fk) : undefined}
      onDeleteFolder={canMaintain ? (fk) => void handleDeleteFolder(fk) : undefined}
      onMoveItem={
        canMaintain
          ? (itemId, _from, toKey) => moveCodelistMut.mutate({ code: itemId, folderKey: toKey })
          : undefined
      }
      itemDataAttr={(item) => ({ "data-codelist-code": item.id })}
      emptyState={
        <div style={{ padding: 28, textAlign: "center" }}>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 8, lineHeight: 1.55 }}>
            {keyword.trim() ? (
              "无匹配码表或文件夹"
            ) : (
              <>
                尚无码表：先建<strong>文件夹</strong>分类，再在文件夹内新建码表。
              </>
            )}
          </div>
          {canMaintain && !keyword.trim() && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn primary small" onClick={() => void promptCreateFolder()}>
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
        const c = item.codelist;
        const refN = c.refCount ?? 0;
        return (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lbl">{c.name}</div>
              <div className="meta" style={{ marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
                {c.code}
              </div>
            </div>
            <span className="aup-wb-chip muted" title={`被 ${refN} 个字段引用`}>
              {refN}
            </span>
            <span className="aup-wb-chip muted">{c.itemCount ?? 0} 项</span>
          </>
        );
      }}
    />
  );

  const main = (
    <>
      {!selected && <div className="aup-wb-empty">选左侧码表维护选项</div>}

      {selected && detailQuery.isLoading && (
        <div className="aup-wb-empty">加载详情…</div>
      )}

      {selected && detail && (
        <div className="aup-wb-panel">
          <div className="aup-wb-panel-hd">
            <span className="title">{detail.name}</span>
            <span className="aup-wb-chip" style={{ fontFamily: "ui-monospace, monospace" }}>
              {detail.code}
            </span>
            {(detail.folder ?? "").trim() && (
              <span className="aup-wb-chip muted" title="文件夹分类">
                {(detail.folder ?? "").trim()}
              </span>
            )}
            {(detail.refCount ?? 0) > 0 && (
              <span className="aup-wb-chip muted">{detail.refCount} 字段引用</span>
            )}
            {canMaintain && (
              <button
                type="button"
                className="btn small ghost"
                onClick={() =>
                  setEditMetaModal({
                    name: detail.name ?? "",
                    folder: (detail.folder ?? "").trim(),
                  })
                }
              >
                编辑名称/分类
              </button>
            )}
            <div style={{ flex: 1 }} />
            {canMaintain && (
              <button
                className="btn small primary"
                onClick={() => setItemModal({ mode: "add", itemCode: "", itemLabel: "" })}
              >
                ＋ 新增项
              </button>
            )}
            {canMaintain && (
              <button
                className="btn small danger"
                disabled={deleteCodelistMut.isPending}
                onClick={() => void confirmDeleteCodelist()}
              >
                删除码表
              </button>
            )}
          </div>

          <div className="aup-wb-table-wrap">
            <table className="aup-wb-table" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ width: 48 }}>序</th>
                  <th style={{ width: 180 }}>内部值（唯一）</th>
                  <th>展示文本</th>
                  <th style={{ width: 160 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id}>
                    <td style={{ color: "var(--muted)" }}>{i + 1}</td>
                    <td>
                      <div className="mono" title={item.itemCode}>
                        {item.itemCode}
                      </div>
                    </td>
                    <td>
                      <div className="clip" title={item.itemLabel}>
                        {item.itemLabel}
                      </div>
                    </td>
                    <td>
                      {canMaintain ? (
                        <div className="acts">
                          <button className="btn small ghost" title="上移" onClick={() => reorderLocal(i, -1)}>
                            ↑
                          </button>
                          <button className="btn small ghost" title="下移" onClick={() => reorderLocal(i, 1)}>
                            ↓
                          </button>
                          <button
                            className="btn small ghost"
                            title="编辑"
                            onClick={() =>
                              setItemModal({
                                mode: "edit",
                                itemCode: item.itemCode,
                                itemLabel: item.itemLabel,
                                itemId: item.id,
                              })
                            }
                          >
                            ✎
                          </button>
                          <button className="btn small danger" title="删除" onClick={() => void confirmDeleteItem(item)}>
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
                    <td colSpan={4} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                      暂无字典项{canMaintain ? "，点击「＋ 新增项」" : ""}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="aup-app aup-app--workbench cage-form-wb min-h-0 flex-1">
      <div className="aup-wb">
        <div className="aup-wb-toolbar">
          <input
            className="input"
            placeholder="搜索码表中文名 / 编码 / 文件夹…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {keyword.trim() && (
            <button type="button" className="btn ghost small" onClick={() => setKeyword("")}>
              清除
            </button>
          )}
          <span className="aup-wb-count">{countText}</span>
        </div>

        <div className="aup-wb-split aup-wb-split--wide-aside">
          <aside className="aup-wb-aside" ref={asideRef}>
            {aside}
          </aside>
          <div className="aup-wb-main">{main}</div>
        </div>
      </div>

      {editMetaModal && selected && (
        <div className="aup-modal-mask" onClick={() => setEditMetaModal(null)}>
          <div className="aup-modal" onClick={(e) => e.stopPropagation()}>
            <h3>编辑码表元数据</h3>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 12px" }}>
              编码 <code>{selected}</code> 不可改；文件夹可在左树管理，或在此单独移动本码表。
            </p>
            {row(
              "文件夹",
              <input
                className="input"
                placeholder="分类/文件夹（可空，归入「未分类」）"
                value={editMetaModal.folder}
                onChange={(e) => setEditMetaModal({ ...editMetaModal, folder: e.target.value })}
              />,
            )}
            {row(
              "名称",
              <input
                className="input"
                placeholder="码表中文名"
                value={editMetaModal.name}
                onChange={(e) => setEditMetaModal({ ...editMetaModal, name: e.target.value })}
              />,
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setEditMetaModal(null)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!editMetaModal.name.trim() || updateMetaMut.isPending}
                onClick={() => {
                  updateMetaMut.mutate({
                    name: editMetaModal.name.trim(),
                    folder: editMetaModal.folder.trim() || null,
                  });
                }}
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
            <h3>新建码表{createModal.folder ? ` · ${createModal.folder}` : ""}</h3>
            {createModal.folder ? (
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                将创建于文件夹「{createModal.folder}」。
              </p>
            ) : (
              row(
                "文件夹",
                <input
                  className="input"
                  placeholder="分类/文件夹（可空，归入「未分类」）"
                  value={createModal.folder}
                  onChange={(e) => setCreateModal({ ...createModal, folder: e.target.value })}
                />,
              )
            )}
            {row(
              "编码",
              <input
                className="input"
                placeholder="大写字母开头，如 RENT_TYPE"
                value={createModal.code}
                onChange={(e) => setCreateModal({ ...createModal, code: e.target.value.toUpperCase() })}
              />,
            )}
            {row(
              "名称",
              <input
                className="input"
                placeholder="码表中文名"
                value={createModal.name}
                onChange={(e) => setCreateModal({ ...createModal, name: e.target.value })}
              />,
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setCreateModal(null)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!createModal.code.trim() || !createModal.name.trim() || createCodelistMut.isPending}
                onClick={() => {
                  createCodelistMut.mutate({
                    code: createModal.code.trim(),
                    name: createModal.name.trim(),
                    folder: createModal.folder.trim() || undefined,
                  });
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {itemModal && selected && (
        <div className="aup-modal-mask" onClick={() => setItemModal(null)}>
          <div className="aup-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{itemModal.mode === "add" ? "新增码表项" : "编辑码表项"}</h3>
            {row(
              "内部值",
              <input
                className="input"
                placeholder="存储 / 条件比较用（唯一）"
                value={itemModal.itemCode}
                disabled={itemModal.mode === "edit"}
                onChange={(e) => setItemModal({ ...itemModal, itemCode: e.target.value })}
              />,
            )}
            {row(
              "展示文本",
              <input
                className="input"
                placeholder="填表人看到的内容（留空同内部值）"
                value={itemModal.itemLabel}
                onChange={(e) => setItemModal({ ...itemModal, itemLabel: e.target.value })}
              />,
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setItemModal(null)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!itemModal.itemCode.trim() || addMut.isPending || updateMut.isPending}
                onClick={() => {
                  const label = itemModal.itemLabel.trim() || itemModal.itemCode.trim();
                  if (itemModal.mode === "add") {
                    addMut.mutate({ itemCode: itemModal.itemCode.trim(), itemLabel: label });
                  } else if (itemModal.itemId != null) {
                    updateMut.mutate({ itemId: itemModal.itemId, itemLabel: label });
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
