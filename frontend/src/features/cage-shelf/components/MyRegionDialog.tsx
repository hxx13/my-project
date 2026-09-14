import { useEffect, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonnelPicker } from "@/components/admin/PersonnelPicker";
import MemberCapabilityDialog from "./MemberCapabilityDialog";
import RegionCapabilityDialog from "./RegionCapabilityDialog";
import RegionAlertRuleDialog from "./RegionAlertRuleDialog";
import {
  fetchFullTree,
  fetchMyRegion,
  saveMyRegionMembers,
  type CageShelfTreeNode,
  type MyRegionEntry,
} from "@/api/domains/cageShelf.api";

/**
 * 我的区域（弹窗）—— 饲养组长看自己负责的区域与组员，并配本区域对学生开放的功能。
 *
 * 入口在笼架信息页的工具栏（仅当 `/api/cage-region/mine` 返回 isLeader=true 时才显示按钮），
 * 不做成独立页面：组长本来就要进笼架信息干活，多一个页面反而多一次跳转。
 *
 * 三件事：区域（超管分配，只读）→ 组员（组长纳管）→ 区域学生功能（点区域那行的按钮进子弹窗）。
 */

/**
 * 「我负责的区域」按 校区 → 楼层 → 房间 组织。
 * 数据来自已有的 fetchFullTree（每行的 campus/floor/room 三级 id 与名字），不为它多开后端接口；
 * 原来按层级平铺成三栏卡片，看不出某间房属于哪个楼层，长名字还被 truncate 截掉。
 */
interface RegionBranch {
  type: "CAMPUS" | "FLOOR" | "ROOM";
  id: string;
  name: string;
  children: RegionBranch[];
}

/** 点某一行进配置子弹窗的目标：`extraRegions` = 该行**可见的房间**（整层/整校区批量改这些）。 */
interface RegionTargetSel {
  regionType: string;
  regionId: string;
  name: string;
  extraRegions?: Array<{ regionType: string; regionId: string; name?: string }>;
}

/** 把笼架树的扁平行拼成三层结构（同 id 去重）。 */
function buildRegionTree(tree: CageShelfTreeNode[]): RegionBranch[] {
  const byKey = new Map<string, RegionBranch>();
  const roots: RegionBranch[] = [];
  const ensure = (key: string, type: RegionBranch["type"], id: string, name: string | undefined,
                  parent: RegionBranch | null): RegionBranch => {
    let n = byKey.get(key);
    if (!n) {
      n = { type, id, name: name && name.trim() ? name : id, children: [] };
      byKey.set(key, n);
      if (parent) parent.children.push(n);
      else roots.push(n);
    }
    return n;
  };
  for (const t of tree) {
    if (!t.campusId) continue;
    const campus = ensure(`CAMPUS:${t.campusId}`, "CAMPUS", t.campusId, t.campusName, null);
    if (!t.floorId) continue;
    const floor = ensure(`FLOOR:${t.floorId}`, "FLOOR", t.floorId, t.floorName, campus);
    if (!t.roomId) continue;
    ensure(`ROOM:${t.roomId}`, "ROOM", t.roomId, t.roomName, floor);
  }
  return roots;
}

/** 只留「我负责的区域」及其祖先链，别人的分支整枝剪掉。 */
function pruneToGranted(nodes: RegionBranch[], granted: Set<string>): RegionBranch[] {
  const keep = (n: RegionBranch): boolean => granted.has(`${n.type}:${n.id}`) || n.children.some(keep);
  const prune = (n: RegionBranch): RegionBranch => ({ ...n, children: n.children.filter(keep).map(prune) });
  return nodes.filter(keep).map(prune);
}

export default function MyRegionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [regions, setRegions] = useState<MyRegionEntry[]>([]);
  /** 区域树里被折叠的分支（键 = type:id）。默认全展开 —— 组长要一眼看全自己负责的范围。 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // 组员是**可编辑的草稿**：加入/移除都改这里，点保存才整包 PUT（全量替换）。
  const [draft, setDraft] = useState<Array<{ accountId: string; name: string }>>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // 正在配置权限的组员（null = 子弹窗关闭）。仅在保存过组员后才可配——没入组的人不在列表里。
  const [capTarget, setCapTarget] = useState<{ accountId: string; name: string } | null>(null);
  // 正在配「本区学生功能」的区域（null = 子弹窗关闭）
  const [regionCapTarget, setRegionCapTarget] = useState<RegionTargetSel | null>(null);
  // 正在配「本区告警阈值」的区域（null = 子弹窗关闭）
  const [alertTarget, setAlertTarget] = useState<RegionTargetSel | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [shelfTree, setShelfTree] = useState<CageShelfTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchMyRegion(), fetchFullTree().catch(() => [] as CageShelfTreeNode[])])
      .then(([mine, tree]) => {
        if (cancelled) return;
        setRegions(mine.regions);
        const list = mine.members.map((m) => ({ accountId: m.memberAccountId, name: m.memberName }));
        setDraft(list);
        setSavedIds(list.map((m) => m.accountId));
        // 区域名后端不下发（不为它多开 join），用已有的树在前端解析
        const map: Record<string, string> = {};
        for (const r of tree) {
          if (r.campusId) map[`CAMPUS:${r.campusId}`] = r.campusName;
          if (r.floorId) map[`FLOOR:${r.floorId}`] = `${r.campusName} / ${r.floorName}`;
          if (r.roomId) map[`ROOM:${r.roomId}`] = `${r.floorName} / ${r.roomName}`;
        }
        setNames(map);
        setShelfTree(tree);
      })
      .catch(() => {
        if (!cancelled) {
          setRegions([]);
          setDraft([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const dirty = useMemo(
    () => draft.map((m) => m.accountId).sort().join("|") !== [...savedIds].sort().join("|"),
    [draft, savedIds],
  );

  const saveMembers = async () => {
    setSaving(true);
    try {
      await saveMyRegionMembers(draft.map((m) => m.accountId));
      setSavedIds(draft.map((m) => m.accountId));
      toast.success("组员已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const grantedKeys = useMemo(
    () => new Set(regions.map((r) => `${r.regionType}:${r.regionId}`)),
    [regions],
  );
  const regionTree = useMemo(
    () => pruneToGranted(buildRegionTree(shelfTree), grantedKeys),
    [shelfTree, grantedKeys],
  );
  /** 授权里有、笼架树里却找不到的区域（脏授权 / 该房间还没建架子）—— 不能让它在界面上凭空消失。 */
  const untouchedRegions = useMemo(() => {
    const inTree = new Set<string>();
    const walk = (ns: RegionBranch[]) => ns.forEach((n) => { inTree.add(`${n.type}:${n.id}`); walk(n.children); });
    walk(regionTree);
    return regions.filter((r) => !inTree.has(`${r.regionType}:${r.regionId}`));
  }, [regionTree, regions]);

  const label = (r: MyRegionEntry) => names[`${r.regionType}:${r.regionId}`] || r.regionId;

  /**
   * 该分支下**可见的**房间（当前剪枝树里的房间叶子）。
   * 「整层/整校区配置」= 批量改这些房间 —— 只写房间键的行，不写楼层键的行，
   * 否则会波及同层别人负责、且自己没配规则的房间（越界）。
   */
  const visibleRooms = (n: RegionBranch): Array<{ regionType: string; regionId: string; name?: string }> => {
    const out: Array<{ regionType: string; regionId: string; name?: string }> = [];
    const walk = (x: RegionBranch) => {
      for (const c of x.children) {
        if (c.type === "ROOM") out.push({ regionType: "ROOM", regionId: c.id, name: c.name });
        else walk(c);
      }
    };
    walk(n);
    return out;
  };

  /** 一行区域：名称可换行不截断（悬停看全）。直接授权的区域、以及**其下有可见房间**的祖先都能配（后者=整层批量）。 */
  const regionRow = (
    type: RegionBranch["type"], id: string, name: string, depth: number, hasChildren: boolean,
    extraRooms: Array<{ regionType: string; regionId: string; name?: string }> = [],
  ) => (
    <div key={`${type}:${id}`} className="flex items-start justify-between gap-2" style={{ paddingLeft: depth * 14 }}>
      {hasChildren ? (
        <button
          type="button"
          onClick={() => setCollapsed((prev) => {
            const n = new Set(prev);
            const k = `${type}:${id}`;
            if (n.has(k)) n.delete(k); else n.add(k);
            return n;
          })}
          aria-label={collapsed.has(`${type}:${id}`) ? "展开" : "折叠"}
          className="mt-px flex size-4 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
        >
          {collapsed.has(`${type}:${id}`) ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
      ) : (
        <span className="mt-px size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1 break-words text-[11px] leading-snug text-[var(--twin-ink)]" title={name}>
        {name}
      </span>
      {grantedKeys.has(`${type}:${id}`) || extraRooms.length > 0 ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title={extraRooms.length > 0
              ? `配置本区域对学生开放的功能（连本区可见的 ${extraRooms.length} 个房间一起改）`
              : "配置本区域对学生开放的功能"}
            onClick={() => setRegionCapTarget({ regionType: type, regionId: id, name, extraRegions: extraRooms })}
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-1.5 py-0.5 text-[10px] text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft)]"
          >
            学生功能
          </button>
          <button
            type="button"
            title={extraRooms.length > 0
              ? `配置本区域的告警阈值（连本区可见的 ${extraRooms.length} 个房间一起改）`
              : "配置本区域的告警阈值（未单独配置时按上级或全局默认生效）"}
            onClick={() => setAlertTarget({ regionType: type, regionId: id, name, extraRegions: extraRooms })}
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-1.5 py-0.5 text-[10px] text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft)]"
          >
            告警阈值
          </button>
        </div>
      ) : (
        <span className="shrink-0 text-[10px] text-[var(--twin-mute)]">仅定位</span>
      )}
    </div>
  );

  const renderBranches = (nodes: RegionBranch[], depth: number): ReactNode =>
    nodes.map((n) => (
      <div key={`${n.type}:${n.id}`} className="space-y-1">
        {regionRow(n.type, n.id, n.name, depth, n.children.length > 0, visibleRooms(n))}
        {n.children.length > 0 && !collapsed.has(`${n.type}:${n.id}`) && renderBranches(n.children, depth + 1)}
      </div>
    ));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[var(--z-modal)] flex max-h-[82vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-[var(--twin-hairline)] px-5 py-3.5 text-left">
          <DialogTitle className="text-[14px] text-[var(--twin-ink)]">我的区域</DialogTitle>
          <DialogDescription className="text-[11px] text-[var(--twin-mute)]">
            你作为饲养组长负责的区域（由超级管理员分配）、由你纳入的组员，以及本区域对学生开放的功能。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {loading ? (
            <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-6 text-center text-[10px] text-[var(--twin-mute)]">
              加载中…
            </div>
          ) : (
            <>
              <section className="space-y-2">
                <h4 className="text-[12px] font-semibold text-[var(--twin-ink)]">我负责的区域（{regions.length}）</h4>
                {regions.length === 0 ? (
                  <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
                    你还没有被分配任何区域
                  </div>
                ) : (
                  <div className="space-y-1.5 rounded-twin-sm border border-[var(--twin-hairline)] p-2.5">
                    {renderBranches(regionTree, 0)}
                    {untouchedRegions.map((r) => regionRow(r.regionType, r.regionId, label(r), 0, false))}
                  </div>
                )}
                <p className="text-[10px] leading-relaxed text-[var(--twin-mute)]">
                  点区域那行的「学生功能」，可决定本区域的学生能用哪些功能——学生侧的模式入口按他课题组
                  笼位所在各区域的并集给，但对某个笼位动手时以该笼位所在区域为准。
                  「告警阈值」可配本区域特殊状态持续超时的告警阈值，未单独配置时按上级或全局默认生效。
                </p>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[12px] font-semibold text-[var(--twin-ink)]">我的组员（{draft.length}）</h4>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-0.5 text-[10px] font-semibold text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft)]"
                    >
                      ＋ 添加组员
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveMembers()}
                      disabled={!dirty || saving}
                      className="rounded-twin-sm bg-[var(--twin-primary)] px-2.5 py-0.5 text-[10px] font-semibold text-white transition hover:brightness-95 disabled:opacity-40"
                    >
                      {saving ? "保存中…" : "保存"}
                    </button>
                  </div>
                </div>
                {draft.length === 0 ? (
                  <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
                    还没有组员。组员会自动继承你负责的全部区域的可见范围。
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)]">
                    <table className="twin-table">
                      <thead>
                        <tr>
                          <th>组员</th>
                          <th className="w-40" />
                        </tr>
                      </thead>
                      <tbody>
                        {draft.map((m) => (
                          <tr key={m.accountId}>
                            <td className="px-2.5 py-1 text-[11px] text-[var(--twin-ink)]">{m.name}</td>
                            <td className="px-2.5 py-1 text-right">
                              <button
                                type="button"
                                title="配置该组员能用哪些模式"
                                onClick={() => setCapTarget({ accountId: m.accountId, name: m.name })}
                                className="mr-1 rounded-twin-sm border border-[var(--twin-hairline)] px-1.5 py-0.5 text-[10px] text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft)]"
                              >
                                模式权限
                              </button>
                              <button
                                type="button"
                                title="移出本组"
                                onClick={() => setDraft((d) => d.filter((x) => x.accountId !== m.accountId))}
                                className="rounded-md p-0.5 text-[var(--twin-mute)] transition hover:text-[var(--app-color-feedback-danger)]"
                              >
                                <X className="size-3" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-[10px] leading-relaxed text-[var(--twin-mute)]">
                  组员自动继承你负责的全部区域的可见范围；点「模式权限」可逐人收窄他能用的模式（矩阵是上限）。
                  组员改动后记得点「保存」。
                </p>
              </section>
            </>
          )}
        </div>
      </DialogContent>

      {capTarget && (
        <MemberCapabilityDialog
          open
          onOpenChange={(v) => {
            if (!v) setCapTarget(null);
          }}
          memberAccountId={capTarget.accountId}
          memberName={capTarget.name}
        />
      )}

      {regionCapTarget && (
        <RegionCapabilityDialog
          open
          onOpenChange={(v) => {
            if (!v) setRegionCapTarget(null);
          }}
          regionType={regionCapTarget.regionType}
          regionId={regionCapTarget.regionId}
          regionName={regionCapTarget.name}
          extraRegions={regionCapTarget.extraRegions}
        />
      )}

      {alertTarget && (
        <RegionAlertRuleDialog
          open
          onOpenChange={(v) => {
            if (!v) setAlertTarget(null);
          }}
          regionType={alertTarget.regionType}
          regionId={alertTarget.regionId}
          regionName={alertTarget.name}
          extraRegions={alertTarget.extraRegions}
        />
      )}

      {pickerOpen && (
        <PersonnelPicker
          identityCode="BREEDER"
          identityLabel="饲养员"
          excludeGroupedByOthers
          onClose={() => setPickerOpen(false)}
          onConfirm={(ids, nameList) => {
            setDraft((d) => {
              const have = new Set(d.map((x) => x.accountId));
              const added = ids
                .map((id, i) => ({ accountId: id, name: nameList[i] || id }))
                .filter((x) => !have.has(x.accountId));
              return [...d, ...added];
            });
            setPickerOpen(false);
          }}
        />
      )}
    </Dialog>
  );
}
