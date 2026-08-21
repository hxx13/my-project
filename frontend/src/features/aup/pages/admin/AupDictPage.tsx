import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  createAupDict,
  createAupDictItem,
  deleteAupDict,
  deleteAupDictItem,
  fetchAupDict,
  fetchAupDicts,
  importBuiltinAupDict,
  reorderAupDictItems,
  updateAupDict,
  updateAupDictItem,
  type AupDictDetail,
  type AupDictItem,
  type AupDictListItem,
} from "@/features/aup/api/aup.api";
import { appConfirm } from "@/lib/appDialog";
import "../../aup.css";

/* =====================================================================
 * AUP 公共字典管理（分类/文件夹视角）。
 *  - 左侧按「分类」（文件夹）分组展示字典；分类不存在时归入「未分类」
 *  - 新建字典只需：分类 + 名称；字典键自动生成（高级可选覆盖）
 *  - 被模板字段引用的字典后端拒绝删除
 * ================================================================== */

function autoDictKey(): string {
  return "d_" + Math.random().toString(36).slice(2, 10);
}

const UNGROUPED = "未分类";

interface ItemModal {
  mode: "add" | "edit";
  value: string;
  label: string;
  itemId?: number;
}

export default function AupDictPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [dictModal, setDictModal] = useState(false);
  const [dictForm, setDictForm] = useState<{ category: string; name: string; dictKey: string; advanced: boolean }>({
    category: "",
    name: "",
    dictKey: "",
    advanced: false,
  });
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameCategory, setRenameCategory] = useState("");
  const [itemModal, setItemModal] = useState<ItemModal | null>(null);

  const dictsQuery = useQuery({
    queryKey: ["aup", "dicts", "all"],
    queryFn: () => fetchAupDicts({ size: 500 }),
  });
  const detailQuery = useQuery({
    queryKey: ["aup", "dict", "detail", selectedKey],
    queryFn: () => fetchAupDict(selectedKey!),
    enabled: !!selectedKey,
  });

  const dicts = useMemo(() => dictsQuery.data?.items ?? [], [dictsQuery.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dicts;
    return dicts.filter(
      (d) => d.name.toLowerCase().includes(q) || (d.dictKey ?? "").toLowerCase().includes(q)
    );
  }, [dicts, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, AupDictListItem[]>();
    for (const d of filtered) {
      const c = d.category?.trim() || UNGROUPED;
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(d);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === UNGROUPED) return 1;
      if (b[0] === UNGROUPED) return -1;
      return a[0].localeCompare(b[0], "zh");
    });
  }, [filtered]);

  const categories = useMemo(
    () => Array.from(new Set(dicts.map((d) => d.category?.trim() || UNGROUPED))).sort((a, b) => a.localeCompare(b, "zh")),
    [dicts]
  );

  const items = useMemo(() => {
    const list = detailQuery.data?.items ?? [];
    return [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [detailQuery.data]);

  const invalidateDicts = () => qc.invalidateQueries({ queryKey: ["aup", "dicts"] });

  const createDictMut = useMutation({
    mutationFn: (body: { dictKey: string; name: string; category?: string }) => createAupDict(body),
    onSuccess: (d) => {
      toast.success("已新建字典");
      invalidateDicts();
      setDictModal(false);
      setDictForm({ category: "", name: "", dictKey: "", advanced: false });
      setSelectedKey(d.dictKey);
    },
    onError: (e: Error) => toast.error(e.message || "新建字典失败"),
  });
  const renameMut = useMutation({
    mutationFn: ({ key, name, category }: { key: string; name: string; category?: string }) =>
      updateAupDict(key, { name, category }),
    onSuccess: (_, { key }) => {
      toast.success("已保存");
      invalidateDicts();
      qc.invalidateQueries({ queryKey: ["aup", "dict", "detail", key] });
      setRenaming(false);
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });
  const deleteDictMut = useMutation({
    mutationFn: (key: string) => deleteAupDict(key),
    onSuccess: () => {
      toast.success("已删除字典");
      invalidateDicts();
      if (selectedKey) {
        qc.invalidateQueries({ queryKey: ["aup", "dict", "detail", selectedKey] });
        setSelectedKey(null);
      }
    },
    onError: (e: Error) => toast.error(e.message || "删除字典失败"),
  });
  const addItemMut = useMutation({
    mutationFn: ({ key, body }: { key: string; body: { value: string; label: string } }) =>
      createAupDictItem(key, body),
    onSuccess: (_, { key }) => {
      toast.success("已新增字典项");
      qc.invalidateQueries({ queryKey: ["aup", "dict", "detail", key] });
      invalidateDicts();
      setItemModal(null);
    },
    onError: (e: Error) => toast.error(e.message || "新增项失败"),
  });
  const updateItemMut = useMutation({
    mutationFn: ({ key, itemId, body }: { key: string; itemId: number; body: { value: string; label: string } }) =>
      updateAupDictItem(key, itemId, body),
    onSuccess: (_, { key }) => {
      toast.success("已修改");
      qc.invalidateQueries({ queryKey: ["aup", "dict", "detail", key] });
      setItemModal(null);
    },
    onError: (e: Error) => toast.error(e.message || "修改失败"),
  });
  const deleteItemMut = useMutation({
    mutationFn: ({ key, itemId }: { key: string; itemId: number }) => deleteAupDictItem(key, itemId),
    onSuccess: (_, { key }) => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["aup", "dict", "detail", key] });
      invalidateDicts();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
  const reorderMut = useMutation({
    mutationFn: ({ key, itemIds }: { key: string; itemIds: number[] }) => reorderAupDictItems(key, itemIds),
    onSuccess: (_, { key }) => {
      qc.invalidateQueries({ queryKey: ["aup", "dict", "detail", key] });
    },
    onError: (e: Error) => toast.error(e.message || "排序保存失败"),
  });
  const importBuiltinMut = useMutation({
    mutationFn: importBuiltinAupDict,
    onSuccess: (r) => {
      toast.success(`已导入内置字典：新建 ${r.createdDicts} 个字典、${r.createdItems} 个字典项`);
      invalidateDicts();
    },
    onError: (e: Error) => toast.error(e.message || "导入内置字典失败"),
  });

  const handleImportBuiltin = async () => {
    if (!await appConfirm("导入内置种子字典？将补充缺失的安乐死方法/人员类别/项目来源字典（已存在的不会覆盖）。")) return;
    importBuiltinMut.mutate();
  };

  const doSearch = () => {
    setSearch(keyword.trim());
  };

  const confirmDeleteDict = async (key: string, name: string) => {
    if (!await appConfirm(`确定删除字典「${name}」？若已被模板字段引用，后端将拒绝删除。`)) return;
    deleteDictMut.mutate(key);
  };

  const confirmDeleteItem = async (item: AupDictItem) => {
    if (!await appConfirm(`确定删除字典项「${item.label || item.value}」？`)) return;
    if (!selectedKey) return;
    deleteItemMut.mutate({ key: selectedKey, itemId: item.itemId });
  };

  const moveItem = (index: number, dir: -1 | 1) => {
    if (!selectedKey) return;
    const next = [...items];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    reorderMut.mutate({ key: selectedKey, itemIds: next.map((it) => it.itemId) });
  };

  const startRename = () => {
    if (!detailQuery.data) return;
    setRenameValue(detailQuery.data.name);
    setRenameCategory(detailQuery.data.category ?? "");
    setRenaming(true);
  };

  const toggleGroup = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const total = dicts.length;
  const detail = detailQuery.data;

  const row = (label: string, input: ReactNode) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <label style={{ fontSize: 13, color: "var(--muted)", width: 76, flexShrink: 0, paddingTop: 8 }}>{label}</label>
      <div style={{ flex: 1 }}>{input}</div>
    </div>
  );

  return (
    <div className="aup-app aup-app--workbench">
      <div className="aup-wb">
        <div className="aup-wb-hd">
          <div>
            <h1>AUP 字典</h1>
            <div className="sub">
              公共选项词表：在模板字段里引用 dictKey；被引用的字典不可删除 · 与 NHP「码表」同角色、不同产品线
            </div>
          </div>
          <div className="aup-wb-actions">
            <button className="btn ghost small" disabled={importBuiltinMut.isPending} onClick={handleImportBuiltin}>
              导入内置字典
            </button>
            <button className="btn primary small" onClick={() => setDictModal(true)}>
              ＋ 新建字典
            </button>
          </div>
        </div>

        <div className="aup-wb-toolbar">
          <input
            className="input"
            placeholder="搜索字典名称…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") doSearch();
            }}
          />
          <button className="btn ghost small" onClick={doSearch}>
            查询
          </button>
          <span className="aup-wb-count">
            共 {total} 个字典 · {categories.length} 个分类
          </span>
        </div>

        <div className="aup-wb-split">
          <aside className="aup-wb-aside">
            {grouped.length === 0 && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                {dictsQuery.isLoading ? "加载中…" : "暂无字典，点击右上「＋ 新建字典」"}
              </div>
            )}
            {grouped.map(([cat, list]) => {
              const isCollapsed = collapsed.has(cat);
              return (
                <div key={cat}>
                  <div className="aup-wb-group-hd" onClick={() => toggleGroup(cat)}>
                    <span className="chev">{isCollapsed ? "▸" : "▾"}</span>
                    <span className="name">{cat}</span>
                    <span className="aup-wb-chip muted">{list.length}</span>
                  </div>
                  {!isCollapsed &&
                    list.map((d) => (
                      <div
                        key={d.dictKey}
                        className={`aup-wb-row${selectedKey === d.dictKey ? " on" : ""}`}
                        onClick={() => setSelectedKey(d.dictKey)}
                        title={`${d.name}（${d.dictKey}）`}
                      >
                        <span className="lbl">{d.name}</span>
                        <span className="meta">{d.itemCount} 项</span>
                        <span className="key" title={d.dictKey}>
                          {d.dictKey}
                        </span>
                      </div>
                    ))}
                </div>
              );
            })}
          </aside>

          <div className="aup-wb-main">
            {!selectedKey && <div className="aup-wb-empty">在左侧选择字典查看 / 维护字典项</div>}
            {selectedKey && detail && (
              <div className="aup-wb-panel">
                <div className="aup-wb-panel-hd">
                  {renaming ? (
                    <>
                      <input
                        className="input"
                        style={{ maxWidth: 200 }}
                        placeholder="名称"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                      />
                      <input
                        className="input"
                        style={{ maxWidth: 180 }}
                        placeholder="分类（可输入新分类）"
                        value={renameCategory}
                        list="aup-dict-cats"
                        onChange={(e) => setRenameCategory(e.target.value)}
                      />
                      <button
                        className="btn small primary"
                        disabled={renameMut.isPending}
                        onClick={() =>
                          renameMut.mutate({
                            key: selectedKey,
                            name: renameValue.trim(),
                            category: renameCategory.trim() || undefined,
                          })
                        }
                      >
                        保存
                      </button>
                      <button className="btn small ghost" onClick={() => setRenaming(false)}>
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="title">{detail.name}</span>
                      <span className="aup-wb-chip">{detail.category?.trim() || UNGROUPED}</span>
                      <button className="btn small ghost" onClick={startRename}>
                        改名
                      </button>
                      <button className="btn small ghost" onClick={() => confirmDeleteDict(selectedKey, detail.name)}>
                        删除
                      </button>
                    </>
                  )}
                  <div style={{ flex: 1 }} />
                  <button className="btn small primary" onClick={() => setItemModal({ mode: "add", value: "", label: "" })}>
                    ＋ 新增项
                  </button>
                </div>

                <div className="aup-wb-table-wrap">
                  <table className="aup-wb-table">
                    <thead>
                      <tr>
                        <th style={{ width: 48 }}>序</th>
                        <th style={{ width: 220 }}>内部值（唯一）</th>
                        <th>展示文本</th>
                        <th style={{ width: 160 }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={it.itemId}>
                          <td style={{ color: "var(--muted)", width: 48 }}>{i + 1}</td>
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
                            <div className="acts">
                              <button className="btn small ghost" title="上移" onClick={() => moveItem(i, -1)}>
                                ↑
                              </button>
                              <button className="btn small ghost" title="下移" onClick={() => moveItem(i, 1)}>
                                ↓
                              </button>
                              <button
                                className="btn small ghost"
                                title="编辑"
                                onClick={() => setItemModal({ mode: "edit", value: it.value, label: it.label, itemId: it.itemId })}
                              >
                                ✎
                              </button>
                              <button className="btn small danger" title="删除" onClick={() => confirmDeleteItem(it)}>
                                ×
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                            暂无字典项，点击「＋ 新增项」
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                  展示文本给填表人看；内部值用于存储与条件显示。上移 / 下移自动保存顺序。
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <datalist id="aup-dict-cats">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* 新建字典弹窗 */}
      {dictModal && (
        <div className="aup-modal-mask" onClick={() => setDictModal(false)}>
          <div className="aup-modal" onClick={(e) => e.stopPropagation()}>
            <h3>新建字典</h3>
            {row("分类", (
              <input
                className="input"
                placeholder="如 动物实验相关（可输入新分类）"
                list="aup-dict-cats"
                value={dictForm.category}
                onChange={(e) => setDictForm({ ...dictForm, category: e.target.value })}
              />
            ))}
            {row("名称", (
              <input
                className="input"
                placeholder="如 动物种类"
                value={dictForm.name}
                onChange={(e) => setDictForm({ ...dictForm, name: e.target.value })}
              />
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={dictForm.advanced}
                onChange={(e) => setDictForm({ ...dictForm, advanced: e.target.checked })}
              />
              <label style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer" }}>指定字段键（不勾选则自动生成）</label>
            </div>
            {dictForm.advanced &&
              row("字段键", (
                <input
                  className="input"
                  placeholder="如 animalSpecies"
                  value={dictForm.dictKey}
                  onChange={(e) => setDictForm({ ...dictForm, dictKey: e.target.value })}
                />
              ))}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setDictModal(false)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!dictForm.name.trim() || createDictMut.isPending}
                onClick={() => {
                  const name = dictForm.name.trim();
                  createDictMut.mutate({
                    dictKey: dictForm.advanced && dictForm.dictKey.trim() ? dictForm.dictKey.trim() : autoDictKey(),
                    name,
                    category: dictForm.category.trim() || undefined,
                  });
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 字典项弹窗 */}
      {itemModal && selectedKey && (
        <div className="aup-modal-mask" onClick={() => setItemModal(null)}>
          <div className="aup-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{itemModal.mode === "add" ? "新增字典项" : "编辑字典项"}</h3>
            {row("内部值", (
              <input
                className="input"
                placeholder="存储 / 条件比较用（唯一）"
                value={itemModal.value}
                onChange={(e) => setItemModal({ ...itemModal, value: e.target.value })}
              />
            ))}
            {row("展示文本", (
              <input
                className="input"
                placeholder="填表人看到的内容（留空同内部值）"
                value={itemModal.label}
                onChange={(e) => setItemModal({ ...itemModal, label: e.target.value })}
              />
            ))}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setItemModal(null)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!itemModal.value.trim() || addItemMut.isPending || updateItemMut.isPending}
                onClick={() => {
                  const body = { value: itemModal.value.trim(), label: itemModal.label.trim() || itemModal.value.trim() };
                  if (itemModal.mode === "add") {
                    addItemMut.mutate({ key: selectedKey, body });
                  } else if (itemModal.itemId != null) {
                    updateItemMut.mutate({ key: selectedKey, itemId: itemModal.itemId, body });
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
