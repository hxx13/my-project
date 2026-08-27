/**
 * 负责范围分配 — 逐人挂载「校区/楼层/房间」，控制其可见的笼架范围。
 * 左侧检索人员，右侧三级树多选，保存 = 全量替换该人负责范围。
 */
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import { AdminButton } from "@/components/admin/AdminButton";
import {
  fetchFullTree,
  searchPersonnelByKeyword,
  fetchPersonScopes,
  replacePersonScopes,
  type CageShelfTreeNode,
  type PersonScopeEntry,
} from "@/api/domains/cageShelf.api";

interface Person {
  id: number;
  name: string;
  accountId: string;
  projectGroupName: string;
}

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

const scopeKey = (type: PersonScopeEntry["scopeType"], id: string) => `${type}:${id}`;

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

const muted = "text-[var(--app-color-text-tertiary)]";
const card = "rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3";

export default function CageScopeAssignmentPage() {
  const [kw, setKw] = useState("");
  const [searching, setSearching] = useState(false);
  const [persons, setPersons] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [tree, setTree] = useState<CampusNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [scopeLoading, setScopeLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const search = async () => {
    const keyword = kw.trim();
    if (!keyword) {
      toast.error("请输入人员姓名或工号");
      return;
    }
    setSearching(true);
    try {
      setPersons(await searchPersonnelByKeyword(keyword));
    } catch (e) {
      setPersons([]);
      toast.error(e instanceof Error ? e.message : "搜索人员失败");
    } finally {
      setSearching(false);
    }
  };

  const pickPerson = async (p: Person) => {
    setSelected(p);
    setScopeLoading(true);
    try {
      const scopes = await fetchPersonScopes(p.accountId);
      setSelection(new Set(scopes.map((s) => scopeKey(s.scopeType, s.scopeId))));
    } catch (e) {
      setSelection(new Set());
      toast.error(e instanceof Error ? e.message : "加载负责范围失败");
    } finally {
      setScopeLoading(false);
    }
  };

  const toggle = (key: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const scopes: PersonScopeEntry[] = [...selection].map((k) => {
        const idx = k.indexOf(":");
        return { scopeType: k.slice(0, idx) as PersonScopeEntry["scopeType"], scopeId: k.slice(idx + 1) };
      });
      await replacePersonScopes(selected.accountId, scopes);
      toast.success("已保存负责范围");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFullWidthPage>
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center gap-2">
          <input
            className="flex-1 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-[13px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]"
            placeholder="输入人员姓名或工号"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
          />
          <AdminButton tone="primary" onClick={() => void search()} loading={searching}>
            搜索
          </AdminButton>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
          {/* 左侧：人员结果 */}
          <div className="space-y-1">
            {searching && <div className={`${muted} text-[13px]`}>搜索中…</div>}
            {!searching && persons.length === 0 && !selected && (
              <div className={`${card} text-center ${muted} text-[13px]`}>输入关键词搜索人员</div>
            )}
            {persons.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void pickPerson(p)}
                className={`block w-full rounded-md border border-[var(--app-color-border-default)] px-3 py-2 text-left text-[13px] transition hover:bg-[var(--app-color-surface-hover)] ${
                  selected?.id === p.id ? "bg-[var(--app-color-surface-hover)]" : "bg-[var(--app-color-surface-container)]"
                }`}
              >
                <span className="font-medium text-[var(--app-color-text-primary)]">{p.name}</span>
                {p.projectGroupName ? <span className={`ml-2 ${muted} text-[12px]`}>{p.projectGroupName}</span> : null}
              </button>
            ))}
          </div>

          {/* 右侧：范围树 */}
          <div>
            {!selected && (
              <div className={`${card} text-center ${muted} text-[13px]`}>选择人员后配置其负责范围</div>
            )}
            {selected && (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] text-[var(--app-color-text-secondary)]">
                    {selected.name} 的负责范围
                  </span>
                  <AdminButton tone="primary" size="default" onClick={() => void save()} loading={saving}>
                    保存
                  </AdminButton>
                </div>
                {treeLoading && <div className={`${muted} text-[13px]`}>加载范围树…</div>}
                {scopeLoading && <div className={`${muted} text-[13px]`}>加载现有范围…</div>}
                {!treeLoading && !scopeLoading && tree.length === 0 && (
                  <div className={`${card} text-center ${muted} text-[13px]`}>暂无校区数据</div>
                )}
                {!treeLoading && !scopeLoading && tree.length > 0 && (
                  <div className={`${card} max-h-[60vh] overflow-y-auto`}>
                    {tree.map((c) => {
                      const cKey = scopeKey("CAMPUS", c.id);
                      return (
                        <div key={cKey} className="mb-1">
                          <label className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--app-color-surface-hover)]">
                            <input type="checkbox" checked={selection.has(cKey)} onChange={() => toggle(cKey)} />
                            <span className="text-[13px] font-semibold text-[var(--app-color-text-primary)]">{c.name}校区</span>
                          </label>
                          <div className="ml-6">
                            {c.floors.map((f) => {
                              const fKey = scopeKey("FLOOR", f.id);
                              return (
                                <div key={fKey} className="mb-0.5">
                                  <label className="flex items-center gap-2 rounded px-2 py-1 hover:bg-[var(--app-color-surface-hover)]">
                                    <input type="checkbox" checked={selection.has(fKey)} onChange={() => toggle(fKey)} />
                                    <span className="text-[13px] text-[var(--app-color-text-primary)]">{f.name}</span>
                                  </label>
                                  <div className="ml-6">
                                    {f.rooms.map((rm) => {
                                      const rKey = scopeKey("ROOM", rm.id);
                                      return (
                                        <label key={rKey} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-[var(--app-color-surface-hover)]">
                                          <input type="checkbox" checked={selection.has(rKey)} onChange={() => toggle(rKey)} />
                                          <span className="text-[13px] text-[var(--app-color-text-secondary)]">{rm.name}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AdminFullWidthPage>
  );
}
