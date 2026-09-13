import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { PersonnelPicker } from "@/components/admin/PersonnelPicker";
import { appConfirm } from "@/lib/appDialog";
import { fetchPersonIdentity, type IdentityTag } from "@/api/domains/personIdentity.api";
import {
  clearPersonScopes,
  fetchFullTree,
  fetchPersonScopes,
  fetchScopeAssignees,
  replacePersonScopes,
  type CageShelfTreeNode,
  type PersonScopeEntry,
  type ScopeAssignee,
} from "@/api/domains/cageShelf.api";

/**
 * 可见范围分配（设置中心分类）—— 把**校区 / 楼层 / 房间**分配给**饲养组长**
 * （写 `cage_region_grant` 的 `grant_role='LEADER'` 行）。
 *
 * 原来是个独立页（`/admin/cage-shelves/scope`），2026-09-13 收进设置弹窗：
 * 它服务的对象就是笼架信息页，多一个页面反而多一次跳转，和「我的区域」同一处理。
 *
 * 形态对齐同目录的 {@link CageAuditAssignmentSettings}（竖排 + 人员 chip 行 + 自带滚动的树），
 * 因为弹窗里没有横排两栏的宽度。判定逻辑与后端一致，只换了排布。
 *
 * **门槛 SUPER_ADMIN**：写 LEADER 行本来就要求超管，且本面板要拉`/person-identity`（也是超管接口）。
 * 挂在 ADMIN 门槛下会出现「页面打开了但列表空、还弹无权限」的假死。
 */

type ScopeType = PersonScopeEntry["scopeType"];

interface RoomNode { id: string; name: string }
interface FloorNode { id: string; name: string; rooms: RoomNode[] }
interface CampusNode { id: string; name: string; floors: FloorNode[] }

const scopeKey = (type: ScopeType, id: string) => `${type}:${id}`;

/** 校区→楼层→房间 三级树（跳过 area 层，与后端区域键同构） */
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

/** 某节点的**叶子**键（房间）。三态判定与「展开祖先」都以叶子为准。 */
const leavesOfCampus = (c: CampusNode): string[] =>
  c.floors.flatMap((f) => f.rooms.map((r) => scopeKey("ROOM", r.id)));
const leavesOfFloor = (f: FloorNode): string[] => f.rooms.map((r) => scopeKey("ROOM", r.id));

/**
 * 默认折叠态：**只有勾选到的分支展开**，其余收起来。
 *
 * <p>全区近 100 行，一进来全展开既看不到重点也要滚很久。判据用「该分支子树里有没有勾选项」，
 * 所以粗粒度行（只存了 `CAMPUS:浦东`）会让校区展开、其下楼层仍收起 —— 符合「勾了的才打开」。
 */
function defaultCollapsed(tree: CampusNode[], selection: Set<string>): Set<string> {
  const out = new Set<string>();
  const touched = (keys: string[]) => keys.some((k) => selection.has(k));
  for (const c of tree) {
    if (!touched(keysOfCampus(c))) out.add(scopeKey("CAMPUS", c.id));
    for (const f of c.floors) {
      if (!touched(keysOfFloor(f))) out.add(scopeKey("FLOOR", f.id));
    }
  }
  return out;
}

/** nodeKey → 其全部祖先键（自根向下）。父节点选中即覆盖后代，显示与展开都靠它。 */
function buildAncestorMap(tree: CampusNode[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const c of tree) {
    const ck = scopeKey("CAMPUS", c.id);
    out.set(ck, []);
    for (const f of c.floors) {
      const fk = scopeKey("FLOOR", f.id);
      out.set(fk, [ck]);
      for (const r of f.rooms) out.set(scopeKey("ROOM", r.id), [ck, fk]);
    }
  }
  return out;
}

/** nodeKey → 其全部后代键（不含自身）。取消某一个后代时要先把祖先展开成显式行。 */
function buildDescendantMap(tree: CampusNode[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const c of tree) {
    const ck = scopeKey("CAMPUS", c.id);
    out.set(ck, c.floors.flatMap((f) => [scopeKey("FLOOR", f.id), ...f.rooms.map((r) => scopeKey("ROOM", r.id))]));
    for (const f of c.floors) {
      out.set(scopeKey("FLOOR", f.id), f.rooms.map((r) => scopeKey("ROOM", r.id)));
    }
  }
  return out;
}

/** 身份标签 pills；无标签回退「实验员（默认）」。 */
function IdentityPills({ tags, max }: { tags: IdentityTag[]; max?: number }) {
  if (tags.length === 0) {
    return (
      <span className="rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-1.5 py-px text-[10px] font-medium text-[var(--twin-mute)]">
        实验员（默认）
      </span>
    );
  }
  const shown = max ? tags.slice(0, max) : tags;
  return (
    <>
      {shown.map((t) => (
        <span
          key={t.id}
          className="rounded-full border border-[color-mix(in_srgb,var(--twin-primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--twin-primary)_10%,transparent)] px-1.5 py-px text-[10px] font-medium text-[var(--twin-primary)]"
        >
          {t.label}
        </span>
      ))}
      {max && tags.length > max && <span className="text-[10px] text-[var(--twin-mute)]">+{tags.length - max}</span>}
    </>
  );
}

/** 一行复选：三态（全选 / 半选 / 未选），可折叠，勾父节点联动全部后代。 */
function ScopeRow({
  level, label, keys, leafKeys, isSelected, onToggle, hint, collapsible, collapsed, onToggleCollapse,
}: {
  level: 0 | 1 | 2;
  label: string;
  keys: string[];
  /**
   * 本组**叶子**键（房间）。三态必须按叶子算：粗粒度行（如只存了 CAMPUS）被展开成叶子后
   * 父键并不在集合里，用 keys 算会永远显示半选/未选。
   */
  leafKeys: string[];
  /** 显示用选中态（自己显式选中 **或** 被祖先覆盖），不是原始 selection 集合 */
  isSelected: (key: string) => boolean;
  onToggle: (keys: string[]) => void;
  hint?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const gauge = leafKeys.length > 0 ? leafKeys : keys;
  const checkedCount = gauge.filter(isSelected).length;
  const state = checkedCount === 0 ? "unchecked" : checkedCount === gauge.length ? "checked" : "indeterminate";
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "indeterminate";
  }, [state]);

  const pad = level === 0 ? 2 : level === 1 ? 16 : 32;

  return (
    <div
      className="flex items-center gap-1.5 rounded-twin-sm py-0.5 pr-2 hover:bg-[var(--twin-canvas-soft)]"
      style={{ paddingLeft: pad }}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "展开" : "折叠"}
          className="flex size-4 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
        >
          {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
        <input
          ref={ref}
          type="checkbox"
          checked={state === "checked"}
          onChange={() => onToggle(keys)}
          className="size-3 shrink-0 accent-[var(--twin-primary)]"
        />
        <span
          className={`truncate text-[11px] ${
            level === 0 ? "font-semibold text-[var(--twin-ink)]" : level === 1 ? "text-[var(--twin-ink)]" : "text-[var(--twin-body)]"
          }`}
        >
          {label}
        </span>
        {hint && <span className="ml-auto shrink-0 text-[10px] text-[var(--twin-mute)]">{hint}</span>}
      </label>
    </div>
  );
}

export default function CageScopeAssignmentSettings() {
  const [tree, setTree] = useState<CampusNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [assignees, setAssignees] = useState<ScopeAssignee[]>([]);
  const [tagsById, setTagsById] = useState<Record<string, IdentityTag[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [scopeLoading, setScopeLoading] = useState(false);
  /** 当前 selection 属于谁（拉取完成时才落定）—— 默认折叠要等它落定后再算，否则会拿上一个人的勾选算 */
  const [scopeOwner, setScopeOwner] = useState<string | null>(null);
  /** 已按谁算过默认折叠。用 ref 而不是 state：用户手动折叠/展开后不能再被覆盖 */
  const collapseApplied = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setTreeLoading(true);
    fetchFullTree()
      .then((rows) => { if (!cancelled) setTree(buildScopeTree(rows)); })
      .catch(() => toast.error("加载校区/楼层/房间失败"))
      .finally(() => { if (!cancelled) setTreeLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const loadAssignees = useCallback(async () => {
    try {
      const list = await fetchScopeAssignees();
      setAssignees(list);
      if (list.length > 0) {
        // 身份接口收/回都是 personnel.id，而 assignee.userId 是账号 id —— 两个口径必须用
        // personnelId 对上；直接拿 it.userId 当键会全部落空，chip 清一色「实验员（默认）」。
        const identities = await fetchPersonIdentity(list.map((a) => a.personnelId || a.userId));
        const byPersonnelId = new Map(identities.map((it) => [it.userId, it.tags ?? []]));
        const m: Record<string, IdentityTag[]> = {};
        for (const a of list) m[a.userId] = byPersonnelId.get(a.personnelId ?? "") ?? [];
        setTagsById(m);
      } else {
        setTagsById({});
      }
    } catch (e) {
      setAssignees([]);
      toast.error(e instanceof Error ? e.message : "加载已分配人员失败");
    }
  }, []);

  useEffect(() => { void loadAssignees(); }, [loadAssignees]);

  useEffect(() => {
    if (!selectedId) { setSelection(new Set()); return; }
    let cancelled = false;
    setScopeLoading(true);
    fetchPersonScopes(selectedId)
      .then((scopes) => {
        if (cancelled) return;
        setSelection(new Set(scopes.map((s) => scopeKey(s.scopeType, s.scopeId))));
        // 与 selection 同批落定，下面的默认折叠才拿得到「这个人」的勾选
        setScopeOwner(selectedId);
      })
      .catch((e) => {
        if (!cancelled) {
          setSelection(new Set());
          toast.error(e instanceof Error ? e.message : "加载可见范围失败");
        }
      })
      .finally(() => { if (!cancelled) setScopeLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  /** 选中的人若还没有身份标签（如刚通过「增加人员」选的新人），单独补拉一次 */
  useEffect(() => {
    if (!selectedId || tagsById[selectedId]) return;
    let cancelled = false;
    fetchPersonIdentity([selectedId])
      .then((list) => { if (!cancelled) setTagsById((prev) => ({ ...prev, [selectedId]: list[0]?.tags ?? [] })); })
      .catch(() => { /* 身份拿不到不影响配置 */ });
    return () => { cancelled = true; };
  }, [selectedId, tagsById]);

  /**
   * 默认折叠：**只展开勾选到的分支**，其余收起（全区近 100 行，全展开看不到重点）。
   *
   * <p>等「这份勾选属于谁」落定（scopeOwner）且目录已加载后再算一次；用 ref 记账，
   * 所以之后用户手动折叠/展开不会被这个 effect 覆盖回去。
   */
  useEffect(() => {
    if (!scopeOwner || tree.length === 0) return;
    if (collapseApplied.current === scopeOwner) return;
    collapseApplied.current = scopeOwner;
    setCollapsed(defaultCollapsed(tree, selection));
  }, [scopeOwner, tree, selection]);

  const toggle = (keys: string[]) => {
    setSelection((prev) => {
      // 先展开祖先：之后集合里只剩叶子（房间），父键不再参与覆盖
      const next = materialize(prev);
      // 「要不要整组取消」必须按**叶子**判。展开后父键已不在集合里，用 next.has(父键) 会判成
      // 「没勾上」→ 反而把整组再加一遍，表现就是父节点（校区/楼层）怎么点都取消不掉。
      const leaves = keys.filter((k) => !descendantsOf.get(k)?.length);
      const gauge = leaves.length > 0 ? leaves : keys;
      const all = gauge.every((k) => next.has(k));
      if (all) {
        // 取消：本组所有键一起删 —— 父键可能是粗粒度行（如只存了 CAMPUS:2）
        for (const k of keys) next.delete(k);
      } else {
        // 勾选：只落叶子，与 materialize 同口径，免得父键又反向「覆盖」子键
        for (const k of gauge) next.add(k);
      }
      return next;
    });
  };

  /** 把被选中的祖先展开成**叶子（房间）行**；叶子本身保持不变。 */
  const materialize = (sel: Set<string>): Set<string> => {
    const out = new Set(sel);
    for (const key of [...sel]) {
      const desc = descendantsOf.get(key);
      if (!desc || desc.length === 0) continue;
      out.delete(key);
      // 只落叶子：中间层（楼层）留在集合里会再次「覆盖」其下房间，
      // 导致单个房间点了取消却仍显示勾上（isSelected 的祖先判定会把它算回来）。
      for (const d of desc) {
        if (!descendantsOf.get(d)?.length) out.add(d);
      }
    }
    return out;
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
      if (selectedId === a.userId) { setSelectedId(null); setSelectedName(""); }
      await loadAssignees();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "撤销失败");
    } finally {
      setDeletingId(null);
    }
  };

  const selectedTags = selectedId ? (tagsById[selectedId] ?? []) : [];
  const allKeys = useMemo(() => tree.flatMap(keysOfCampus), [tree]);
  const ancestorsOf = useMemo(() => buildAncestorMap(tree), [tree]);
  const descendantsOf = useMemo(() => buildDescendantMap(tree), [tree]);

  /**
   * 显示用选中态：自己显式选中，**或**被任一祖先覆盖。
   *
   * <p>超管分「整个浦东校区」时库里只有一行 CAMPUS，房间并没有各自的行走；但功能上它们全被覆盖了
   * （CageRegionGrantService 按 campus 命中即放开整段）。显示必须跟着一致，否则房间全空、
   * 提示数还是 `0/22 房间`，看起来像「一个房间都没选」，还会让人以为配置丢了。
   */
  const isSelected = useCallback(
    (key: string) => selection.has(key) || (ancestorsOf.get(key) ?? []).some((a) => selection.has(a)),
    [selection, ancestorsOf],
  );

  return (
    // flex-1（而不是 h-full）：设置中心在 scope 分类下会把内容区变成 flex 列，
    // 子元素用 flex-1 + min-h-0 才拿得到确定高度；靠 h-full 穿一层 overflow-y-auto
    // 解析百分比高度不可靠，内容一多就把外层撑出滚动条、按钮被顶出弹窗。
    // 固定部分 shrink-0、树 flex-1 —— 高度优先给树（全区 97 个复选框，行数越多越好），
    // 窗口再矮也是树内部滚动，不外溢。
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 这页最容易被误读成「把笼位分给谁」，先把边界写清楚 */}
      <div className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--twin-mute)]">
        把<b className="text-[var(--twin-ink)]">校区 / 楼层 / 房间</b>分配给
        <b className="text-[var(--twin-ink)]">饲养组长</b>：命中区域的笼架整架放开、不再按课题组脱敏，
        组长还能在「我的区域」里管理组员与本区域学生功能。与
        <b className="text-[var(--twin-ink)]">笼位归属无关</b>（那由认领和占用者决定）。
      </div>

      {/* ── 已分配人员：chip 行（点一下载入编辑，hover 出撤销） ── */}
      <div className="shrink-0 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--twin-mute)]">已分配人员（{assignees.length}）</span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-0.5 text-[10px] font-semibold text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft)]"
          >
            ＋ 增加人员
          </button>
        </div>
        {assignees.length === 0 ? (
          <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
            还没有分配过任何人 —— 点「增加人员」选一位饲养组长，再勾他要负责的区域
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {assignees.map((a) => {
              const on = selectedId === a.userId;
              return (
                <span
                  key={a.userId}
                  className={`group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition ${
                    on
                      ? "border-[var(--twin-primary)] bg-[color-mix(in_srgb,var(--twin-primary)_10%,transparent)] font-semibold text-[var(--twin-primary)]"
                      : "border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => { setSelectedId(a.userId); setSelectedName(a.name); }}
                    className="inline-flex items-center gap-1"
                  >
                    {a.name}
                    <span className="text-[var(--twin-mute)]">{a.scopeCount}</span>
                  </button>
                  <button
                    type="button"
                    title="撤销此人的分配"
                    disabled={deletingId === a.userId}
                    onClick={() => void remove(a)}
                    className="text-[var(--twin-mute)] opacity-0 transition-opacity hover:text-[var(--app-color-feedback-danger)] group-hover:opacity-100 disabled:opacity-40"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 编辑某人的可见范围 ── */}
      {selectedId ? (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-[var(--twin-ink)]">{selectedName} 的可见范围</span>
            <span className="flex flex-wrap items-center gap-1">
              <IdentityPills tags={selectedTags} />
            </span>
            {allKeys.length > 0 && (
              <button
                type="button"
                onClick={() => setSelection((prev) => (prev.size === 0 ? new Set(allKeys) : new Set()))}
                className="rounded-twin-sm px-1.5 py-0.5 text-[10px] text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
              >
                {selection.size === 0 ? "全选" : "清空"}
              </button>
            )}
            <span className="ml-auto text-[10px] text-[var(--twin-mute)]">{selection.size} 项 · 保存为全量替换</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-twin-sm border border-[var(--twin-hairline)] p-1.5">
            {treeLoading || scopeLoading ? (
              <div className="py-6 text-center text-[10px] text-[var(--twin-mute)]">加载中…</div>
            ) : tree.length === 0 ? (
              <div className="py-6 text-center text-[10px] text-[var(--twin-mute)]">暂无校区数据</div>
            ) : (
              tree.map((c) => {
                const cKey = scopeKey("CAMPUS", c.id);
                const cCollapsed = collapsed.has(cKey);
                return (
                  <div key={cKey} className="mb-0.5">
                    <ScopeRow
                      level={0}
                      label={`${c.name}校区`}
                      keys={keysOfCampus(c)}
                      leafKeys={leavesOfCampus(c)}
                      isSelected={isSelected}
                      onToggle={toggle}
                      collapsible
                      collapsed={cCollapsed}
                      onToggleCollapse={() => toggleCollapse(cKey)}
                      hint={`${c.floors.filter((f) => keysOfFloor(f).every(isSelected)).length}/${c.floors.length} 楼层`}
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
                              leafKeys={leavesOfFloor(f)}
                              isSelected={isSelected}
                              onToggle={toggle}
                              collapsible
                              collapsed={fCollapsed}
                              onToggleCollapse={() => toggleCollapse(fKey)}
                              hint={
                                f.rooms.length > 0
                                  ? `${f.rooms.filter((r) => isSelected(scopeKey("ROOM", r.id))).length}/${f.rooms.length} 房间`
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
                                  leafKeys={[scopeKey("ROOM", r.id)]}
                                  isSelected={isSelected}
                                  onToggle={toggle}
                                />
                              ))}
                          </div>
                        );
                      })}
                  </div>
                );
              })
            )}
          </div>

          <div className="flex shrink-0 justify-end gap-2">
            <button
              type="button"
              onClick={() => { setSelectedId(null); setSelectedName(""); }}
              className="rounded-twin-sm px-2.5 py-1 text-[11px] font-semibold text-[var(--twin-mute)] transition hover:text-[var(--twin-ink)]"
            >
              取消选择
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-[11px] font-semibold text-white transition hover:brightness-95 disabled:opacity-40"
            >
              {saving ? "保存中…" : `保存（${selection.size} 项）`}
            </button>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 text-center text-[10px] text-[var(--twin-mute)]">
          {assignees.length > 0 ? "点上方某人编辑其可见范围，或点「增加人员」" : "先点「增加人员」"}
        </div>
      )}

      {pickerOpen && (
        <PersonnelPicker
          single
          identityCode="BREEDING_GROUP_LEADER"
          identityLabel="饲养组长"
          onClose={() => setPickerOpen(false)}
          onConfirm={(ids, names) => {
            setPickerOpen(false);
            const id = ids[0];
            if (!id) return;
            // 新人尚未保存，先不出现在 chip 行；右侧直接进入编辑态
            setSelectedId(id);
            setSelectedName(names[0] ?? id);
          }}
        />
      )}
    </div>
  );
}
