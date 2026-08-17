import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  createAupDict,
  createAupDictItem,
  deleteAupDict,
  deleteAupDictItem,
  fetchAupDict,
  fetchAupDicts,
  reorderAupDictItems,
  updateAupDict,
  updateAupDictItem,
  type AupDictDetail,
  type AupDictItem,
  type AupDictListItem,
} from "@/features/aup/api/aup.api";

/* =====================================================================
 * AUP 公共字典管理（分类/文件夹视角）。
 *  - 左侧按「分类」（文件夹）分组展示字典；分类不存在时归入「未分类」
 *  - 新建字典只需：分类 + 名称；字典键自动生成（高级可选覆盖）
 *  - 与模板编辑器「从字典选择（分类 → 字典）」同一份数据源（queryKey 前缀一致）
 *  - 被模板字段引用的字典后端拒绝删除
 * ================================================================== */

/* 自动生成不撞车的字典键（内部使用，编辑题目时按 分类+名称 选择） */
function autoDictKey(): string {
  return "d_" + Math.random().toString(36).slice(2, 10);
}

const UNGROUPED = "未分类";

const CSS = `
.aup{--p:#002FA7;--pw:#EEF2FF;--s:#16a34a;--sw:#e8f7ee;--w:#d97706;--ww:#fdf3e3;--d:#dc2626;--dw:#fdeaea;
  --bg:#f4f6f8;--card:#fff;--bd:#e5e9ef;--tx:#1a2233;--mu:#8a94a6;--sl:#64748b;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  color:var(--tx);font-size:14px;line-height:1.55;flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);overflow:hidden}
.aup *{box-sizing:border-box;margin:0;padding:0}
.aup button{font-family:inherit}
.aup .aup-btn{display:inline-flex;align-items:center;gap:4px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid transparent;transition:.15s;white-space:nowrap;background:#fff;color:var(--tx)}
.aup .aup-btn:disabled{opacity:.45;cursor:not-allowed}
.aup .aup-btn.ghost{background:#fff;border-color:#d5dbe3;color:var(--tx)}
.aup .aup-btn.ghost:hover:not(:disabled){border-color:var(--mu)}
.aup .aup-btn.primary{background:var(--p);color:#fff}
.aup .aup-btn.primary:hover:not(:disabled){background:#3150c7}
.aup .aup-btn.danger{background:#fff;border-color:var(--d);color:var(--d)}
.aup .aup-btn.danger:hover:not(:disabled){background:var(--dw)}
.aup .aup-btn.small{padding:3px 9px;font-size:12px;border-radius:6px}
.aup .aup-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border-radius:5px;border:1px solid #d5dbe3;background:#fff;color:var(--mu);cursor:pointer;font-size:12px;line-height:1}
.aup .aup-iconbtn:hover:not(:disabled){border-color:var(--mu);color:var(--tx)}
.aup .aup-iconbtn.danger:hover{border-color:var(--d);color:var(--d);background:var(--dw)}
.aup .aup-input,.aup .aup-select,.aup .aup-textarea{width:100%;padding:8px 12px;border:1px solid #d5dbe3;border-radius:8px;font-size:13px;font-family:inherit;background:#fff;color:var(--tx);outline:none}
.aup .aup-input:focus,.aup .aup-select:focus,.aup .aup-textarea:focus{border-color:var(--p);box-shadow:0 0 0 3px var(--pw)}
.aup .aup-card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:16px 18px}
.aup .aup-muted{color:var(--mu);font-size:12px}
.aup .aup-h{font-size:14px;font-weight:700;margin-bottom:12px}
.aup .aup-empty{padding:40px;text-align:center;color:var(--mu);font-size:13px}
.aup .aup-page{padding:24px;max-width:1080px;margin:0 auto;width:100%;overflow-y:auto;flex:1;min-height:0}
.aup .aup-page-hd{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;gap:12px;flex-wrap:wrap}
.aup .aup-page-hd h1{font-size:20px;font-weight:800}
.aup .aup-page-hd .sub{font-size:13px;color:var(--mu);margin-top:4px}
.aup .aup-search{display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap}
.aup .aup-search .aup-input{max-width:300px}
.aup .aup-list-table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--bd);border-radius:12px;overflow:hidden}
.aup .aup-list-table th{background:#f8fafc;text-align:left;padding:10px 16px;font-size:12px;font-weight:700;color:var(--mu);border-bottom:1px solid var(--bd)}
.aup .aup-list-table td{padding:12px 16px;border-bottom:1px solid #f0f2f6;font-size:13px;vertical-align:middle}
.aup .aup-list-table tr:last-child td{border-bottom:none}
.aup .aup-list-table tr.row{cursor:pointer}
.aup .aup-list-table tr.row:hover{background:#f8fafc}
.aup .aup-list-table tr.row.active{background:var(--pw)}
.aup .aup-mono{font-family:'JetBrains Mono','Fira Code',ui-monospace,monospace;color:var(--p);font-weight:600}
.aup .aup-dict-layout{display:flex;gap:16px;align-items:flex-start}
.aup .aup-dict-list{flex:1.2;min-width:0}
.aup .aup-dict-detail{flex:1;min-width:0;display:flex;flex-direction:column;gap:14px}
.aup .aup-row{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}
.aup .aup-row>label{font-size:13px;color:var(--mu);width:76px;flex-shrink:0;padding-top:8px}
.aup .aup-row .aup-input,.aup .aup-row .aup-select{flex:1}
.aup .aup-modal-mask{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:100;padding:24px}
.aup .aup-modal{background:var(--card);border-radius:14px;width:100%;max-width:460px;padding:22px 24px;box-shadow:0 20px 50px rgba(0,0,0,.2)}
.aup .aup-modal h3{font-size:15px;font-weight:700;margin-bottom:16px}
.aup .aup-modal .aup-foot{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}
/* 分类（文件夹）分组 */
.aup .aup-groups{background:var(--card);border:1px solid var(--bd);border-radius:12px;overflow:hidden}
.aup .aup-group{ }
.aup .aup-group-hd{display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;user-select:none}
.aup .aup-group-hd:hover{background:#f8fafc}
.aup .aup-group-hd .caret{font-size:10px;color:var(--sl);width:12px;flex-shrink:0}
.aup .aup-group-hd .name{font-size:13px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aup .aup-group-hd .cnt{background:#eef1f6;color:var(--mu);font-size:11px;padding:0 8px;border-radius:999px}
.aup .aup-group-item{display:flex;align-items:center;gap:8px;padding:8px 12px 8px 34px;cursor:pointer;border-top:1px solid #f3f5f8}
.aup .aup-group-item:hover{background:#f8fafc}
.aup .aup-group-item.active{background:var(--pw)}
.aup .aup-group-item .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.aup .aup-group-item .key{font-size:11px;color:var(--sl)}
.aup .aup-group-item .n{font-size:11px;color:var(--mu)}
.aup .aup-group-empty{padding:8px 12px 8px 34px;font-size:12px;color:var(--sl)}
`;

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

  // 新建字典弹窗（分类 + 名称；字典键自动生成，可覆盖）
  const [dictModal, setDictModal] = useState(false);
  const [dictForm, setDictForm] = useState<{ category: string; name: string; dictKey: string; advanced: boolean }>({
    category: "",
    name: "",
    dictKey: "",
    advanced: false,
  });
  // 改名（含改分类）
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameCategory, setRenameCategory] = useState("");
  // 字典项弹窗
  const [itemModal, setItemModal] = useState<ItemModal | null>(null);

  /* 一次取全量做分类分组（该页规模可控；与编辑器「从字典选择」共用缓存前缀） */
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

  const doSearch = () => {
    setSearch(keyword.trim());
  };

  const confirmDeleteDict = (key: string, name: string) => {
    if (!window.confirm(`确定删除字典「${name}」？若已被模板字段引用，后端将拒绝删除。`)) return;
    deleteDictMut.mutate(key);
  };

  const confirmDeleteItem = (item: AupDictItem) => {
    if (!window.confirm(`确定删除字典项「${item.label || item.value}」？`)) return;
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

  return (
    <div className="aup">
      <style>{CSS}</style>
      <div className="aup-page">
        <div className="aup-page-hd">
          <div>
            <h1>AUP 字典</h1>
            <div className="sub">按分类（文件夹）组织公共字典；填表时按「分类 → 字典」引用，被引用的字典不可删除</div>
          </div>
          <button className="aup-btn primary" onClick={() => setDictModal(true)}>
            ＋ 新建字典
          </button>
        </div>

        <div className="aup-search">
          <input
            className="aup-input"
            placeholder="搜索字典名称…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") doSearch();
            }}
          />
          <button className="aup-btn ghost" onClick={doSearch}>
            查询
          </button>
          <span className="aup-muted">共 {total} 个字典 · {categories.length} 个分类</span>
        </div>

        <div className="aup-dict-layout">
          {/* 左：分类（文件夹）分组 */}
          <div className="aup-dict-list">
            <div className="aup-groups">
              {grouped.length === 0 && (
                <div className="aup-empty" style={{ padding: 28 }}>
                  {dictsQuery.isLoading ? "加载中…" : "暂无字典，点击右上「＋ 新建字典」"}
                </div>
              )}
              {grouped.map(([cat, list]) => {
                const isCollapsed = collapsed.has(cat);
                return (
                  <div className="aup-group" key={cat}>
                    <div className="aup-group-hd" onClick={() => toggleGroup(cat)}>
                      <span className="caret">{isCollapsed ? "▸" : "▾"}</span>
                      <span className="name">{cat}</span>
                      <span className="cnt">{list.length}</span>
                    </div>
                    {!isCollapsed &&
                      list.map((d) => (
                        <div
                          key={d.dictKey}
                          className={`aup-group-item${selectedKey === d.dictKey ? " active" : ""}`}
                          onClick={() => setSelectedKey(d.dictKey)}
                          title="查看 / 维护字典项"
                        >
                          <span className="name">{d.name}</span>
                          <span className="n">{d.itemCount} 项</span>
                          <span className="key">{d.dictKey}</span>
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右：字典项 */}
          <div className="aup-dict-detail">
            {!selectedKey && (
              <div className="aup-card">
                <div className="aup-empty">在左侧选择字典查看 / 维护字典项</div>
              </div>
            )}
            {selectedKey && detail && (
              <div className="aup-card">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  {renaming ? (
                    <>
                      <input
                        className="aup-input"
                        style={{ maxWidth: 180 }}
                        placeholder="名称"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                      />
                      <input
                        className="aup-input"
                        style={{ maxWidth: 160 }}
                        placeholder="分类（可输入新分类）"
                        value={renameCategory}
                        list="aup-dict-cats"
                        onChange={(e) => setRenameCategory(e.target.value)}
                      />
                      <button
                        className="aup-btn small primary"
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
                      <button className="aup-btn small ghost" onClick={() => setRenaming(false)}>
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{detail.name}</span>
                      <span className="aup-tag" style={{ background: "var(--pw)", color: "var(--p)" }}>
                        {detail.category?.trim() || UNGROUPED}
                      </span>
                      <button className="aup-btn small ghost" onClick={startRename}>
                        改名
                      </button>
                    </>
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    className="aup-btn small primary"
                    onClick={() => setItemModal({ mode: "add", value: "", label: "" })}
                  >
                    ＋ 新增项
                  </button>
                </div>

                <table className="aup-list-table">
                  <thead>
                    <tr>
                      <th style={{ width: 48 }}>序</th>
                      <th style={{ width: 200 }}>内部值（唯一）</th>
                      <th>展示文本</th>
                      <th style={{ width: 150 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={it.itemId}>
                        <td className="aup-muted">{i + 1}</td>
                        <td>
                          <span className="aup-mono" style={{ fontWeight: 500 }}>{it.value}</span>
                        </td>
                        <td>{it.label}</td>
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button className="aup-iconbtn" title="上移" onClick={() => moveItem(i, -1)}>↑</button>
                            <button className="aup-iconbtn" title="下移" onClick={() => moveItem(i, 1)}>↓</button>
                            <button
                              className="aup-iconbtn"
                              title="编辑"
                              onClick={() => setItemModal({ mode: "edit", value: it.value, label: it.label, itemId: it.itemId })}
                            >
                              ✎
                            </button>
                            <button className="aup-iconbtn danger" title="删除" onClick={() => confirmDeleteItem(it)}>
                              ×
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={4} className="aup-empty">暂无字典项，点击「＋ 新增项」</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="aup-muted" style={{ marginTop: 10 }}>
                  展示文本给填表人看；内部值用于存储与条件显示，通常与展示文本一致。上移 / 下移自动保存顺序。
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
            <div className="aup-row">
              <label>分类</label>
              <input
                className="aup-input"
                placeholder="如 动物实验相关（可输入新分类）"
                list="aup-dict-cats"
                value={dictForm.category}
                onChange={(e) => setDictForm({ ...dictForm, category: e.target.value })}
              />
            </div>
            <div className="aup-row">
              <label>名称</label>
              <input
                className="aup-input"
                placeholder="如 动物种类"
                value={dictForm.name}
                onChange={(e) => setDictForm({ ...dictForm, name: e.target.value })}
              />
            </div>
            <div className="aup-row" style={{ alignItems: "center" }}>
              <label />
              <label className="aup-muted" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={dictForm.advanced}
                  onChange={(e) => setDictForm({ ...dictForm, advanced: e.target.checked })}
                />
                指定字段键（不勾选则自动生成）
              </label>
            </div>
            {dictForm.advanced && (
              <div className="aup-row">
                <label>字段键</label>
                <input
                  className="aup-input"
                  placeholder="如 animalSpecies"
                  value={dictForm.dictKey}
                  onChange={(e) => setDictForm({ ...dictForm, dictKey: e.target.value })}
                />
              </div>
            )}
            <div className="aup-foot">
              <button className="aup-btn ghost" onClick={() => setDictModal(false)}>
                取消
              </button>
              <button
                className="aup-btn primary"
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
            <div className="aup-row">
              <label>内部值</label>
              <input
                className="aup-input"
                placeholder="存储 / 条件比较用（唯一）"
                value={itemModal.value}
                onChange={(e) => setItemModal({ ...itemModal, value: e.target.value })}
              />
            </div>
            <div className="aup-row">
              <label>展示文本</label>
              <input
                className="aup-input"
                placeholder="填表人看到的内容（留空同内部值）"
                value={itemModal.label}
                onChange={(e) => setItemModal({ ...itemModal, label: e.target.value })}
              />
            </div>
            <div className="aup-foot">
              <button className="aup-btn ghost" onClick={() => setItemModal(null)}>
                取消
              </button>
              <button
                className="aup-btn primary"
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
