/**
 * 可见范围分配 — 选人 + 勾「校区/楼层/房间」，在基本权限之上**补充**该人能看到哪些笼架。
 *
 * 只做补充、不覆盖：命中的笼架整架放开（不再按课题组脱敏），未命中的照旧走基本权限。
 * 分配永远不会让人看得更少。读取方：CageCellIndexController.applyGroupMask。
 *
 * 与笼位归属无关 —— 某笼位归谁由认领和占用者决定。
 * 管理员不受此限制、始终可见全部，所以用管理员账号验证这里的效果是看不出来的。
 *
 * 左栏列出所有分配过的人（点一下看右侧）；增加/撤销走通用 {@link PersonnelPicker}。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import { AdminButton } from "@/components/admin/AdminButton";
import { PersonnelPicker } from "@/components/admin/PersonnelPicker";
import { appConfirm } from "@/lib/appDialog";
import { fetchPersonIdentity, type IdentityTag } from "@/api/domains/personIdentity.api";
import {
  fetchFullTree,
  fetchPersonScopes,
  replacePersonScopes,
  fetchScopeAssignees,
  clearPersonScopes,
  type CageShelfTreeNode,
  type PersonScopeEntry,
  type ScopeAssignee,
} from "@/api/domains/cageShelf.api";

type ScopeType = PersonScopeEntry["scopeType"];

interface RoomNode {
  id: string;
  name: string;
}
interface FloorNode {
  id: string;
  name: string;
  rooms: RoomNode[];
}
interface CampusNode {
  id: string;
  name: string;
  floors: FloorNode[];
}

const scopeKey = (type: ScopeType, id: string) => `${type}:${id}`;

function buildScopeTree(rows: CageShelfTreeNode[]): CampusNode[] {
  const campusMap = new Map<string, { id: string; name: string; floors: Map<string, { id: string; name: string; rooms: Map<string, RoomNode> }> }>();
  for (const r of rows) {
    const cid = String(r.campusId ?? "");
    if (!cid) continue;
    if (!campusMap.has(cid)) campusMap.set(cid, { id: cid, name: r.campusName, floors: new Map() });
    const campus = campusMap.get(cid)!;
    const fid = String(r.floorId ?? "");
    if (!fid) continue;
    if (!campus.floors.has(fid)) campus.floors.set(fid, { id: fid, name: r.floorName, rooms: new Map() });
    const floor = campus.floors.get(fid)!;
    const rid = String(r.roomId ?? "");
    if (!rid) continue;
    if (!floor.rooms.has(rid)) floor.rooms.set(rid, { id: rid, name: r.roomName });
  }
  return [...campusMap.values()].map((c) => ({
    id: c.id,
    name: c.name,
    floors: [...c.floors.values()].map((f) => ({
      id: f.id,
      name: f.name,
      rooms: [...f.rooms.values()].map((rm) => ({ id: rm.id, name: rm.name })),
    })),
  }));
}

/** 某节点的自身 + 全部后代键；勾选时整组增删。 */
const keysOfCampus = (c: CampusNode): string[] => {
  const out = [scopeKey("CAMPUS", c.id)];
  for (const f of c.floors) {
    out.push(scopeKey("FLOOR", f.id));
    for (const r of f.rooms) out.push(scopeKey("ROOM", r.id));
  }
  return out;
};
const keysOfFloor = (f: FloorNode): string[] => [scopeKey("FLOOR", f.id), ...f.rooms.map((r) => scopeKey("ROOM", r.id))];

const muted = "text-[var(--app-color-text-tertiary)]";
const card = "rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3";
const pill = "rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-800";
const pillEmpty = "rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600";

/** 身份标签 pills；无标签回退「实验员（默认）」。 */
function IdentityPills({ tags, max }: { tags: IdentityTag[]; max?: number }) {
  if (tags.length === 0) return <span className={pillEmpty}>实验员（默认）</span>;
  const shown = max ? tags.slice(0, max) : tags;
  return (
    <>
      {shown.map((t) => (
        <span key={t.id} className={pill}>
          {t.label}
        </span>
      ))}
      {max && tags.length > max && <span className={muted}>+{tags.length - max}</span>}
    </>
  );
}

/** 一行复选：三态（全选 / 半选 / 未选），可折叠，勾父节点联动全部后代。 */
function ScopeRow({
  level,
  label,
  keys,
  selection,
  onToggle,
  hint,
  collapsible,
  collapsed,
  onToggleCollapse,
}: {
  level: 0 | 1 | 2;
  label: string;
  keys: string[];
  selection: Set<string>;
  onToggle: (keys: string[]) => void;
  hint?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const checkedCount = keys.filter((k) => selection.has(k)).length;
  const state = checkedCount === 0 ? "unchecked" : checkedCount === keys.length ? "checked" : "indeterminate";
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "indeterminate";
  }, [state]);

  const pad = level === 0 ? 4 : level === 1 ? 26 : 48;

  return (
    <div
      className="flex items-center gap-1.5 rounded py-1 pr-2 hover:bg-[var(--app-color-surface-hover)]"
      style={{ paddingLeft: pad }}
    >
      {/* 折叠箭头：只有带子节点的层级有；叶子节点占位保持对齐 */}
      {collapsible ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "展开" : "折叠"}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-container)]"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
      ) : (
        <span className="h-4 w-4 shrink-0" />
      )}
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
        <input ref={ref} type="checkbox" checked={state === "checked"} onChange={() => onToggle(keys)} className="shrink-0" />
        <span
          className={`truncate ${
            level === 0
              ? "text-[13px] font-semibold text-[var(--app-color-text-primary)]"
              : level === 1
                ? "text-[13px] text-[var(--app-color-text-primary)]"
                : "text-[13px] text-[var(--app-color-text-secondary)]"
          }`}
        >
          {label}
        </span>
        {hint && <span className={`ml-auto shrink-0 text-[11px] ${muted}`}>{hint}</span>}
      </label>
    </div>
  );
}

export default function CageScopeAssignmentPage() {
  const [tree, setTree] = useState<CampusNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [assignees, setAssignees] = useState<ScopeAssignee[]>([]);
  const [tagsById, setTagsById] = useState<Record<string, IdentityTag[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [scopeLoading, setScopeLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // 树只拉一次，全量缓存
  useEffect(() => {
    let cancelled = false;
    setTreeLoading(true);
    fetchFullTree()
      .then((rows) => {
        if (!cancelled) setTree(buildScopeTree(rows));
      })
      .catch(() => toast.error("加载校区/楼层/房间失败"))
      .finally(() => {
        if (!cancelled) setTreeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 已分配的人 + 各自身份标签（一次拉回，供左栏直接显示） */
  const loadAssignees = useCallback(async () => {
    try {
      const list = await fetchScopeAssignees();
      setAssignees(list);
      if (list.length > 0) {
        const ids = list.map((a) => a.userId);
        const identities = await fetchPersonIdentity(ids);
        const m: Record<string, IdentityTag[]> = {};
        for (const it of identities) m[it.userId] = it.tags ?? [];
        setTagsById(m);
      } else {
        setTagsById({});
      }
    } catch (e) {
      setAssignees([]);
      toast.error(e instanceof Error ? e.message : "加载已分配人员失败");
    }
  }, []);

  useEffect(() => {
    void loadAssignees();
  }, [loadAssignees]);

  // 换人 → 拉其现有可见范围
  useEffect(() => {
    if (!selectedId) {
      setSelection(new Set());
      return;
    }
    let cancelled = false;
    setScopeLoading(true);
    fetchPersonScopes(selectedId)
      .then((scopes) => {
        if (!cancelled) setSelection(new Set(scopes.map((s) => scopeKey(s.scopeType, s.scopeId))));
      })
      .catch((e) => {
        if (!cancelled) {
          setSelection(new Set());
          toast.error(e instanceof Error ? e.message : "加载可见范围失败");
        }
      })
      .finally(() => {
        if (!cancelled) setScopeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // 选中的人若还没有身份标签（如刚通过「增加人员」选的新人），单独补拉一次
  useEffect(() => {
    if (!selectedId || tagsById[selectedId]) return;
    let cancelled = false;
    fetchPersonIdentity([selectedId])
      .then((list) => {
        if (!cancelled) setTagsById((prev) => ({ ...prev, [selectedId]: list[0]?.tags ?? [] }));
      })
      .catch(() => {
        /* 身份拿不到不影响配置 */
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, tagsById]);

  const toggle = (keys: string[]) => {
    setSelection((prev) => {
      const next = new Set(prev);
      const all = keys.every((k) => next.has(k));
      for (const k of keys) {
        if (all) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const scopes: PersonScopeEntry[] = [...selection].map((k) => {
        const idx = k.indexOf(":");
        return { scopeType: k.slice(0, idx) as ScopeType, scopeId: k.slice(idx + 1) };
      });
      await replacePersonScopes(selectedId, scopes);
      toast.success("已保存可见范围");
      await loadAssignees();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: ScopeAssignee) => {
    if (!(await appConfirm(`撤销「${a.name}」的全部可见范围分配？撤销后其人不再享有这些笼架的额外可见。`))) return;
    setDeletingId(a.userId);
    try {
      await clearPersonScopes(a.userId);
      toast.success("已撤销");
      if (selectedId === a.userId) {
        setSelectedId(null);
        setSelectedName("");
      }
      await loadAssignees();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "撤销失败");
    } finally {
      setDeletingId(null);
    }
  };

  const selectedTags = selectedId
    ? (tagsById[selectedId] ?? [])
    : [];
  const allKeys = useMemo(() => tree.flatMap(keysOfCampus), [tree]);

  return (
    <AdminFullWidthPage>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* 这页最容易被误读成「把笼位分给谁」，先把边界写清楚 */}
        <div className={`${card} mb-4 text-[12px] leading-relaxed ${muted}`}>
          在<b className="text-[var(--app-color-text-primary)]">基本权限之上做补充</b>
          ：命中的笼架整架放开、不再按课题组脱敏；未命中的照旧按基本权限走。分配不会让人看得更少，也不覆盖课题组口径。
          <br />
          与<b className="text-[var(--app-color-text-primary)]">笼位归属无关</b>
          ——某笼位归谁由认领和占用者决定。管理员不受此表限制、始终可见全部，用管理员账号试不出效果。
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
          {/* 左：已分配人员列表 */}
          <div className="space-y-3">
            <div className={`${card} p-0`}>
              <div className="flex items-center justify-between border-b border-[var(--app-color-border-default)] px-3 py-2">
                <span className={`text-[11px] font-semibold ${muted}`}>已分配人员（{assignees.length}）</span>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="rounded-md px-2 py-0.5 text-[12px] font-medium text-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)]"
                >
                  + 增加人员
                </button>
              </div>
              {assignees.length === 0 ? (
                <div className={`px-3 py-6 text-center text-[12px] ${muted}`}>还没有分配过任何人</div>
              ) : (
                <div className="max-h-[58vh] overflow-y-auto py-1">
                  {assignees.map((a) => {
                    const active = selectedId === a.userId;
                    return (
                      <div
                        key={a.userId}
                        className={`group flex items-center gap-2 px-3 py-2 ${
                          active ? "bg-[var(--app-color-surface-hover)]" : "hover:bg-[var(--app-color-surface-hover)]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(a.userId);
                            setSelectedName(a.name);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-[var(--app-color-text-primary)]">
                              {a.name}
                            </span>
                            <span className={`shrink-0 text-[10px] ${muted}`}>{a.scopeCount} 项</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <IdentityPills tags={tagsById[a.userId] ?? []} max={2} />
                          </div>
                        </button>
                        <button
                          type="button"
                          title="撤销此人的分配"
                          disabled={deletingId === a.userId}
                          onClick={() => void remove(a)}
                          className={`shrink-0 rounded p-1 disabled:opacity-40 ${muted} opacity-0 transition-opacity hover:text-[var(--app-color-feedback-danger)] group-hover:opacity-100`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={`${card} text-[11px] leading-relaxed ${muted}`}>
              勾选父节点会连带勾上其下全部楼层 / 房间；保存为全量替换。
            </div>
          </div>

          {/* 右：三级复选树 */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[13px] text-[var(--app-color-text-secondary)]">
                {selectedId ? (
                  <>
                    <b className="text-[var(--app-color-text-primary)]">{selectedName}</b> 的可见范围
                  </>
                ) : (
                  "可见范围"
                )}
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {selectedId && <IdentityPills tags={selectedTags} />}
              </span>
              {selectedId && allKeys.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelection((prev) => (prev.size === 0 ? new Set(allKeys) : new Set()))}
                  className={`rounded-md px-2 py-0.5 text-[12px] hover:bg-[var(--app-color-surface-hover)] ${muted}`}
                >
                  {selection.size === 0 ? "全选" : "清空"}
                </button>
              )}
              <div className="flex-1" />
              <AdminButton tone="primary" onClick={() => void save()} disabled={!selectedId} loading={saving}>
                保存
              </AdminButton>
            </div>

            {!selectedId ? (
              <div className={`${card} text-center ${muted} text-[13px]`}>
                从左侧选一个人查看/编辑，或点「增加人员」
              </div>
            ) : treeLoading || scopeLoading ? (
              <div className={`${card} text-center ${muted} text-[13px]`}>加载中…</div>
            ) : tree.length === 0 ? (
              <div className={`${card} text-center ${muted} text-[13px]`}>暂无校区数据</div>
            ) : (
              <div className={`${card} max-h-[62vh] overflow-y-auto py-1`}>
                {tree.map((c) => {
                  const cKey = scopeKey("CAMPUS", c.id);
                  const cCollapsed = collapsed.has(cKey);
                  return (
                    <div key={cKey} className="mb-1">
                      <ScopeRow
                        level={0}
                        label={`${c.name}校区`}
                        keys={keysOfCampus(c)}
                        selection={selection}
                        onToggle={toggle}
                        collapsible
                        collapsed={cCollapsed}
                        onToggleCollapse={() => toggleCollapse(cKey)}
                        hint={`${c.floors.filter((f) => keysOfFloor(f).every((k) => selection.has(k))).length}/${c.floors.length} 楼层`}
                      />
                      {!cCollapsed &&
                        c.floors.map((f) => {
                          const fKey = scopeKey("FLOOR", f.id);
                          const fCollapsed = collapsed.has(fKey);
                          return (
                            <div key={fKey}>
                              <ScopeRow
                                level={1}
                                label={f.name}
                                keys={keysOfFloor(f)}
                                selection={selection}
                                onToggle={toggle}
                                collapsible
                                collapsed={fCollapsed}
                                onToggleCollapse={() => toggleCollapse(fKey)}
                                hint={
                                  f.rooms.length > 0
                                    ? `${f.rooms.filter((r) => selection.has(scopeKey("ROOM", r.id))).length}/${f.rooms.length} 房间`
                                    : undefined
                                }
                              />
                              {!fCollapsed &&
                                f.rooms.map((r) => (
                                  <ScopeRow
                                    key={scopeKey("ROOM", r.id)}
                                    level={2}
                                    label={r.name}
                                    keys={[scopeKey("ROOM", r.id)]}
                                    selection={selection}
                                    onToggle={toggle}
                                  />
                                ))}
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {pickerOpen && (
        <PersonnelPicker
          single
          onClose={() => setPickerOpen(false)}
          onConfirm={(ids, names) => {
            setPickerOpen(false);
            const id = ids[0];
            if (!id) return;
            // 新人尚未保存，先不出现在左侧列表；右侧直接进入编辑态
            setSelectedId(id);
            setSelectedName(names[0] ?? id);
          }}
        />
      )}
    </AdminFullWidthPage>
  );
}
