import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ChevronRight, Search, X } from "lucide-react";
import {
  fetchAuditAssignments,
  fetchFullTree,
  replaceAuditAssignments,
  searchPersonnelByKeyword,
  type CageAuditScope,
  type CageShelfTreeNode,
} from "@/api/domains/cageShelf.api";

type ScopeNode = { type: "CAMPUS" | "FLOOR" | "ROOM"; id: string; name: string; children: ScopeNode[] };

/** 从 fetchFullTree 的扁平行构建 校区→楼层→房间 三级树（跳过 area 层） */
function buildScopeTree(rows: CageShelfTreeNode[]): ScopeNode[] {
  const campusMap = new Map<string, ScopeNode>();
  const floorMap = new Map<string, ScopeNode>();
  for (const r of rows) {
    const cid = String(r.campusId ?? ""); if (!cid) continue;
    let campus = campusMap.get(cid);
    if (!campus) { campus = { type: "CAMPUS", id: cid, name: r.campusName, children: [] }; campusMap.set(cid, campus); }
    const fid = String(r.floorId ?? "");
    if (!fid) continue;
    const fkey = `${cid}|${fid}`;
    let floor = floorMap.get(fkey);
    if (!floor) { floor = { type: "FLOOR", id: fid, name: r.floorName, children: [] }; floorMap.set(fkey, floor); campus.children.push(floor); }
    const rid = String(r.roomId ?? "");
    if (!rid) continue;
    if (!floor.children.some((n) => n.id === rid)) {
      floor.children.push({ type: "ROOM", id: rid, name: r.roomName, children: [] });
    }
  }
  return [...campusMap.values()];
}

function scopeKeyOf(type: string, id: string): string { return `${type}:${id}`; }

/** 节点及其全部后代的 key 集合 */
function collectKeys(n: ScopeNode): string[] {
  return [scopeKeyOf(n.type, n.id), ...n.children.flatMap(collectKeys)];
}

/** 从 tree 反查某 key 的可读标签（含层级路径） */
function labelByKey(tree: ScopeNode[], key: string): string {
  const [type, id] = key.split(":");
  for (const campus of tree) {
    if (scopeKeyOf(campus.type, campus.id) === key) return `${campus.name}（校区）`;
    for (const floor of campus.children) {
      if (scopeKeyOf(floor.type, floor.id) === key) return `${campus.name} / ${floor.name}（楼层）`;
      for (const room of floor.children) {
        if (scopeKeyOf(room.type, room.id) === key) return `${campus.name} / ${floor.name} / ${room.name}（房间）`;
      }
    }
  }
  return key;
}

export default function CageAuditAssignmentSettings() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<Array<{ id: number; name: string; accountId: string; projectGroupName: string }>>([]);
  const [selected, setSelected] = useState<{ name: string; accountId: string } | null>(null);
  const [tree, setTree] = useState<ScopeNode[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFullTree().then((rows) => setTree(buildScopeTree(rows))).catch(() => {});
  }, []);

  // 选中审核人后拉取其现有归属范围
  useEffect(() => {
    if (!selected?.accountId) { setChecked(new Set()); return; }
    let cancelled = false;
    fetchAuditAssignments(selected.accountId)
      .then((scopes) => { if (!cancelled) setChecked(new Set(scopes.map((s) => scopeKeyOf(s.scopeType, s.scopeId)))); })
      .catch(() => { if (!cancelled) setChecked(new Set()); });
    return () => { cancelled = true; };
  }, [selected?.accountId]);

  const runSearch = async () => {
    const kw = keyword.trim();
    if (!kw) { toast.error("请输入姓名或工号"); return; }
    setLoading(true);
    try {
      const list = await searchPersonnelByKeyword(kw);
      setResults(list);
      if (list.length === 0) toast("未找到匹配人员");
    } catch (e: any) {
      toast.error(e?.message || "搜索失败");
    } finally {
      setLoading(false);
    }
  };

  /** 勾选/取消某节点 → 联动其全部子集 */
  const toggle = (node: ScopeNode) => {
    const selfKey = scopeKeyOf(node.type, node.id);
    const allIds = collectKeys(node);
    const willCheck = !checked.has(selfKey);
    setChecked((prev) => {
      const next = new Set(prev);
      if (willCheck) allIds.forEach((id) => next.add(id));
      else allIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  /** 节点选中态：checked / indeterminate / unchecked */
  const nodeState = (n: ScopeNode): "checked" | "indeterminate" | "unchecked" => {
    if (checked.has(scopeKeyOf(n.type, n.id))) return "checked";
    const hasAnyDescendant = collectKeys(n).slice(1).some((k) => checked.has(k));
    return hasAnyDescendant ? "indeterminate" : "unchecked";
  };

  const isCollapsed = (n: ScopeNode) => collapsed.has(scopeKeyOf(n.type, n.id));
  const toggleCollapse = (n: ScopeNode) => {
    const key = scopeKeyOf(n.type, n.id);
    setCollapsed((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  const save = async () => {
    if (!selected?.accountId) { toast.error("请先选择审核人"); return; }
    const scopes: CageAuditScope[] = [];
    for (const key of checked) {
      const [scopeType, scopeId] = key.split(":");
      if (scopeType === "CAMPUS" || scopeType === "FLOOR" || scopeType === "ROOM") scopes.push({ scopeType, scopeId });
    }
    setSaving(true);
    try {
      await replaceAuditAssignments(selected.accountId, scopes);
      toast.success("审核归属已保存");
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 已分配范围（可读，供 chips 展示）
  const assignedScopes = useMemo(() => {
    return [...checked].map((key) => ({ key, label: labelByKey(tree, key) }));
  }, [checked, tree]);

  const renderNode = (n: ScopeNode, depth: number) => {
    const state = nodeState(n);
    const hasChildren = n.children.length > 0;
    return (
      <div key={scopeKeyOf(n.type, n.id)} className="space-y-0.5">
        <div className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--twin-canvas-soft)]" style={{ marginLeft: depth * 14 }}>
          {hasChildren ? (
            <button type="button" onClick={() => toggleCollapse(n)} className="flex size-4 shrink-0 items-center justify-center text-[var(--twin-mute)] hover:text-[var(--twin-ink)]">
              <ChevronRight className={`size-3 transition-transform ${isCollapsed(n) ? "" : "rotate-90"}`} />
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <input
            type="checkbox"
            checked={state === "checked"}
            ref={(el) => { if (el) el.indeterminate = state === "indeterminate"; }}
            onChange={() => toggle(n)}
            className="size-3 shrink-0 accent-[var(--twin-primary)]"
          />
          <span className="cursor-pointer select-none text-[11px] text-[var(--twin-ink)]" onClick={() => toggle(n)}>{n.name}</span>
          <span className="text-[9px] text-[var(--twin-mute)]">{n.type === "CAMPUS" ? "校区" : n.type === "FLOOR" ? "楼层" : "房间"}</span>
          {hasChildren && <span className="ml-auto text-[9px] text-[var(--twin-mute)]">{n.children.length}</span>}
        </div>
        {hasChildren && !isCollapsed(n) && n.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* 审核人检索 */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1">
            <Search className="size-3 shrink-0 text-[var(--twin-mute)]" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
              placeholder="搜索审核人姓名 / 工号"
              className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
            />
          </div>
          <button type="button" onClick={runSearch} disabled={loading}
            className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] px-2.5 py-1 text-[11px] font-semibold text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft)] disabled:opacity-50">
            {loading ? "…" : "检索"}
          </button>
        </div>
        {results.length > 0 && (
          <div className="max-h-32 overflow-y-auto rounded-twin-sm border border-[var(--twin-hairline)] p-1">
            {results.map((p) => {
              const on = selected?.accountId === p.accountId;
              return (
                <button key={p.accountId || p.id} type="button" onClick={() => setSelected({ name: p.name, accountId: p.accountId })}
                  className={`flex w-full items-center gap-2 rounded-twin-sm px-2 py-1.5 text-left text-[11px] transition ${on ? "bg-[var(--twin-primary)]/10" : "hover:bg-[var(--twin-canvas-soft)]"}`}>
                  <span className={`font-semibold ${on ? "text-[var(--twin-primary)]" : "text-[var(--twin-ink)]"}`}>{p.name}</span>
                  {p.projectGroupName && <span className="text-[10px] text-[var(--twin-mute)]">{p.projectGroupName}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <>
          {/* 已分配范围记录 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-[var(--twin-ink)]">{selected.name} 的负责范围</div>
              <span className="text-[10px] text-[var(--twin-mute)]">{assignedScopes.length} 条</span>
            </div>
            {assignedScopes.length === 0 ? (
              <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-2 py-3 text-center text-[10px] text-[var(--twin-mute)]">尚未分配任何楼层/房间</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {assignedScopes.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1 rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-0.5 text-[10px] text-[var(--twin-body)]">
                    {s.label}
                    <button type="button" onClick={() => { const [t, id] = s.key.split(":"); toggle({ type: t as ScopeNode["type"], id, name: "", children: [] }); }}
                      className="text-[var(--twin-mute)] hover:text-red-500"><X className="size-2.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 楼层/房间树 */}
          <div className="max-h-[36vh] overflow-y-auto rounded-twin-sm border border-[var(--twin-hairline)] p-1.5">
            {tree.length === 0 && <div className="py-4 text-center text-[10px] text-[var(--twin-mute)]">加载笼架目录中…</div>}
            {tree.map((c) => renderNode(c, 0))}
          </div>
        </>
      )}

      <div className="flex justify-end gap-2">
        {selected && (
          <button type="button" onClick={() => { setSelected(null); setChecked(new Set()); }}
            className="rounded-twin-sm px-2.5 py-1 text-[11px] font-semibold text-[var(--twin-mute)] hover:text-[var(--twin-ink)]">
            清除选择
          </button>
        )}
        <button type="button" onClick={save} disabled={saving || !selected}
          className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-[11px] font-semibold text-white hover:brightness-95 disabled:opacity-50">
          {saving ? "保存中…" : `保存（${assignedScopes.length} 个范围）`}
        </button>
      </div>
    </div>
  );
}
