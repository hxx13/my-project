import { useEffect, useState } from "react";
import toast from "react-hot-toast";
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

function scopeKey(s: CageAuditScope): string {
  return `${s.scopeType}:${s.scopeId}`;
}

export default function CageAuditAssignmentSettings() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<Array<{ id: number; name: string; accountId: string; projectGroupName: string }>>([]);
  const [selected, setSelected] = useState<{ name: string; accountId: string } | null>(null);
  const [tree, setTree] = useState<ScopeNode[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
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
      .then((scopes) => { if (!cancelled) setChecked(new Set(scopes.map(scopeKey))); })
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

  const toggle = (node: ScopeNode) => {
    setChecked((prev) => {
      const next = new Set(prev);
      const key = scopeKey({ scopeType: node.type, scopeId: node.id });
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
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

  const checkedCount = checked.size;

  const renderNode = (n: ScopeNode, depth: number) => (
    <div key={`${n.type}:${n.id}`} className="space-y-0.5">
      <label className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-[var(--twin-canvas-soft)]">
        <input
          type="checkbox"
          checked={checked.has(scopeKey({ scopeType: n.type, scopeId: n.id }))}
          onChange={() => toggle(n)}
        />
        <span className="text-[11px] text-[var(--twin-ink)]">{n.name}</span>
        <span className="text-[9px] text-[var(--twin-mute)]">{n.type === "CAMPUS" ? "校区" : n.type === "FLOOR" ? "楼层" : "房间"}</span>
      </label>
      {n.children.length > 0 && (
        <div style={{ marginLeft: depth * 12 + 16 }}>{n.children.map((c) => renderNode(c, depth + 1))}</div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-[var(--twin-ink)]">审核人归属</div>
        <span className="text-[10px] text-[var(--twin-mute)]">{selected ? `当前：${selected.name}（已选 ${checkedCount} 个范围）` : "未选择审核人"}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* 左：审核人检索 */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
              placeholder="姓名 / 工号"
              className="min-w-0 flex-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] outline-none"
            />
            <button type="button" onClick={runSearch} disabled={loading}
              className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-[11px] font-semibold text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft)] disabled:opacity-50">
              {loading ? "…" : "检索"}
            </button>
          </div>
          <div className="max-h-[40vh] overflow-y-auto space-y-0.5">
            {results.map((p) => {
              const on = selected?.accountId === p.accountId;
              return (
                <button
                  key={p.accountId || p.id}
                  type="button"
                  onClick={() => setSelected({ name: p.name, accountId: p.accountId })}
                  className={`w-full rounded-twin-sm border px-2 py-1 text-left text-[11px] transition ${on ? "border-[var(--twin-primary)] bg-[var(--twin-primary)]/10" : "border-[var(--twin-hairline)] hover:bg-[var(--twin-canvas-soft)]"}`}
                >
                  <span className="font-semibold text-[var(--twin-ink)]">{p.name}</span>
                  {p.projectGroupName && <span className="ml-1 text-[10px] text-[var(--twin-mute)]">{p.projectGroupName}</span>}
                </button>
              );
            })}
            {!loading && results.length === 0 && <div className="py-2 text-center text-[10px] text-[var(--twin-mute)]">输入姓名或工号检索审核人</div>}
          </div>
        </div>
        {/* 右：校区/楼层/房间三级多选 */}
        <div className="max-h-[40vh] overflow-y-auto rounded-twin-sm border border-[var(--twin-hairline)] p-1.5">
          {tree.length === 0 && <div className="py-4 text-center text-[10px] text-[var(--twin-mute)]">加载笼架目录中…</div>}
          {tree.map((c) => renderNode(c, 0))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {selected && (
          <button type="button" onClick={() => { setSelected(null); setChecked(new Set()); }}
            className="rounded-twin-sm px-2.5 py-1 text-[11px] font-semibold text-[var(--twin-mute)] hover:text-[var(--twin-ink)]">
            清除选择
          </button>
        )}
        <button type="button" onClick={save} disabled={saving || !selected}
          className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-[11px] font-semibold text-white hover:brightness-95 disabled:opacity-50">
          {saving ? "保存中…" : `保存（${checkedCount} 个范围）`}
        </button>
      </div>
    </div>
  );
}
