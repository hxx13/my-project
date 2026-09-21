import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  fetchGlobalStatusAlertConfig,
  fetchStatusAlertConfigRegions,
  saveGlobalStatusAlertConfig,
  statusAlertRuleKey,
  type CageStatusAlertRegionNode,
  type CageStatusAlertRule,
} from "@/api/domains/cageShelf.api";
import { hasMinRole } from "@/features/auth/roleAccess";
import { authStorage } from "@/features/auth/authStorage";
import { isNonViolationStatus } from "@/features/cage-shelf/constants";
import { ActionPicker, SettingsSection, SettingsSwitch, StartValuePicker } from "./SettingsPrimitives";
import RegionAlertRuleDialog, {
  AlertRuleReadonlyRow,
  ruleDisplayLabel,
  type RegionAlertInheritFrom,
} from "./RegionAlertRuleDialog";

/**
 * 状态告警（设置中心分类）—— 笼位特殊状态**持续超时**的告警阈值。
 *
 * 上下两区：
 *  - 上「全局默认」：五状态各一行（阈值 / 动作 / 启用）。SUPER_ADMIN 可改，其他人只读。
 *  - 下「区域树」：校区 → 楼层 → 房间 三级可展开树。节点状态一眼可辨：
 *    本层已配 / 下级已配（折叠时也看得到）/ 都没配（弱化）。locationOnly 只当路径，不给配置入口。
 *
 * 后端已按「层级就近（房间 > 楼层 > 校区 > 全局默认）」解析生效值，树节点自带
 * configured / descendantConfigured / locationOnly / name，前端不再拉 full-tree 逐区回查。
 */

const TYPE_LABEL: Record<string, string> = { CAMPUS: "校区", FLOOR: "楼层", ROOM: "房间" };

type Target = {
  regionType: string;
  regionId: string;
  name: string;
  inheritFrom: RegionAlertInheritFrom | null;
  /** 「整层/整校区」：随主区域一起写的可见房间（批量下发，不写楼层键的行） */
  extraRegions?: Array<{ regionType: string; regionId: string; name?: string }>;
};

/** 收集该节点下**可见的**房间（当前剪枝树里的叶子）—— 「整层配置」就是批量改这些房间。 */
function visibleRoomsOf(node: CageStatusAlertRegionNode): Array<{ regionType: string; regionId: string; name?: string }> {
  const out: Array<{ regionType: string; regionId: string; name?: string }> = [];
  const walk = (n: CageStatusAlertRegionNode) => {
    for (const c of n.children) {
      if (c.regionType === "ROOM") out.push({ regionType: "ROOM", regionId: c.regionId, name: c.name });
      else walk(c);
    }
  };
  walk(node);
  return out;
}

const nodeKey = (n: { regionType: string; regionId: string }) => `${n.regionType}:${n.regionId}`;

/** 默认折叠：只展开「本层已配」或「下级已配」的分支，其余收起（一眼看清，不用逐房间打开）。 */
function defaultCollapsed(nodes: CageStatusAlertRegionNode[]): Set<string> {
  const out = new Set<string>();
  const walk = (n: CageStatusAlertRegionNode) => {
    if (n.children.length > 0 && !n.configured && !n.descendantConfigured) out.add(nodeKey(n));
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

/** 可配节点数（非 locationOnly）。 */
function countConfigurable(nodes: CageStatusAlertRegionNode[]): number {
  let n = 0;
  const walk = (x: CageStatusAlertRegionNode) => {
    if (!x.locationOnly) n++;
    x.children.forEach(walk);
  };
  nodes.forEach(walk);
  return n;
}

/**
 * 全局默认的**紧凑行**：状态名 + 阈值 + 动作 + 计时起点 + 开关同排。
 * 原先是五张大卡，把整页占满，下方「区域阈值」只剩一小块 —— 那里才是日常操作的地方。
 */
function GlobalRuleRow({
  rule,
  onChange,
}: {
  rule: CageStatusAlertRule;
  onChange: (patch: Partial<CageStatusAlertRule>) => void;
}) {
  const threshold = (raw: string) => Math.max(0, parseInt(raw, 10) || 0);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1.5">
      <span className="w-[5.5rem] shrink-0 text-[11px] font-semibold text-[var(--twin-ink)]">{ruleDisplayLabel(rule)}</span>
      <label className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--twin-mute)]">
        阈值
        <input
          type="number"
          min={0}
          value={rule.thresholdDays}
          onChange={(e) => onChange({ thresholdDays: threshold(e.target.value) })}
          className="w-14 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)] outline-none"
        />
        天
      </label>
      <div className="w-[12rem] shrink-0">
        <ActionPicker value={rule.action} onChange={(a) => onChange({ action: a })}
          nonViolation={isNonViolationStatus(rule.statusCode)} />
      </div>
      <div className="w-[6rem] shrink-0">
        <StartValuePicker value={rule.startValue ?? 1} onChange={(v) => onChange({ startValue: v })} />
      </div>
      <span className="min-w-0 flex-1" />
      <SettingsSwitch checked={rule.enabled} onChange={(v) => onChange({ enabled: v })} label={ruleDisplayLabel(rule)} />
    </div>
  );
}

export default function CageAlertSettings() {
  const role = authStorage.getRole();
  const canEditGlobal = hasMinRole(role, "SUPER_ADMIN");

  /* ── 上区：全局默认 ── */
  const [globalRules, setGlobalRules] = useState<CageStatusAlertRule[]>([]);
  const [globalInitial, setGlobalInitial] = useState<CageStatusAlertRule[]>([]);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [globalSaving, setGlobalSaving] = useState(false);

  /* ── 下区：区域树 ── */
  const [tree, setTree] = useState<CageStatusAlertRegionNode[]>([]);
  const [regionLoading, setRegionLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGlobalLoading(true);
    fetchGlobalStatusAlertConfig()
      .then((v) => {
        if (cancelled) return;
        setGlobalRules(v);
        setGlobalInitial(v);
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "加载全局告警阈值失败");
      })
      .finally(() => {
        if (!cancelled) setGlobalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadRegions = useCallback(async () => {
    setRegionLoading(true);
    try {
      const v = await fetchStatusAlertConfigRegions();
      setTree(v);
      setCollapsed(defaultCollapsed(v));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载区域列表失败");
    } finally {
      setRegionLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRegions();
  }, [loadRegions]);

  const globalDirty = useMemo(
    () => JSON.stringify(globalRules) !== JSON.stringify(globalInitial),
    [globalRules, globalInitial],
  );

  const saveGlobal = async () => {
    setGlobalSaving(true);
    try {
      await saveGlobalStatusAlertConfig(
        globalRules.map(({ statusCode, notifyTarget, thresholdDays, action, enabled, startValue }) =>
          ({ statusCode, notifyTarget, thresholdDays, action, enabled, startValue })),
      );
      setGlobalInitial(globalRules);
      toast.success("全局告警阈值已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setGlobalSaving(false);
    }
  };

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** 递归渲染一个节点；inheritFrom = 离它最近的**已配置祖先**（没有则 null）。 */
  const renderNode = (node: CageStatusAlertRegionNode, depth: number, inheritFrom: RegionAlertInheritFrom | null) => {
    const key = nodeKey(node);
    const isCollapsed = collapsed.has(key);
    const hasChildren = node.children.length > 0;
    return (
      <div key={key}>
        <div
          className="flex items-center gap-1.5 rounded-twin-sm py-0.5 pr-2 hover:bg-[var(--twin-canvas-soft)]"
          style={{ paddingLeft: depth * 16 + 4 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleCollapse(key)}
              aria-label={isCollapsed ? "展开" : "折叠"}
              className="flex size-4 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
            >
              {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <span
            className={`min-w-0 flex-1 truncate text-[11px] ${
              node.locationOnly
                ? "text-[var(--twin-mute)]"
                : depth === 0
                  ? "font-semibold text-[var(--twin-ink)]"
                  : "text-[var(--twin-body)]"
            }`}
          >
            {node.name}
          </span>
          {!node.locationOnly && node.configured && (
            <span className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--twin-primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--twin-primary)_10%,transparent)] px-1.5 py-px text-[10px] font-semibold text-[var(--twin-primary)]">
              本层已配
            </span>
          )}
          {!node.configured && node.descendantConfigured && (
            <span className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--twin-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--twin-warning)_12%,transparent)] px-1.5 py-px text-[10px] font-semibold text-[var(--twin-warning)]">
              下级已配
            </span>
          )}
          {node.locationOnly ? (
            <span className="shrink-0 text-[10px] text-[var(--twin-mute)]">仅定位</span>
          ) : (
            <button
              type="button"
              onClick={() =>
                setTarget({
                  regionType: node.regionType, regionId: node.regionId, name: node.name, inheritFrom,
                  extraRegions: visibleRoomsOf(node),
                })
              }
              className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] px-1.5 py-0.5 text-[10px] text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft)]"
            >
              配置
            </button>
          )}
        </div>
        {!isCollapsed &&
          node.children.map((c) =>
            renderNode(
              c,
              depth + 1,
              node.configured ? { regionType: node.regionType, regionId: node.regionId, name: node.name } : inheritFrom,
            ),
          )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="全局默认阈值"
        description={
          canEditGlobal
            ? "每个特殊状态持续超过阈值天数即告警（0 = 一出现就触发）。健康异常分「通知兽医」「通知笼位所有者」两行，各自阈值与计时起点；各区域未单独配置时按此生效，保存即全量替换。"
            : "特殊状态的全局默认阈值，各区域未单独配置时按此生效。仅超级管理员可修改。"
        }
      >
        {globalLoading ? (
          <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
            加载中…
          </div>
        ) : globalRules.length === 0 ? (
          <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
            没有全局默认阈值数据。
          </div>
        ) : canEditGlobal ? (
          <>
            <div className="space-y-1.5">
              {globalRules.map((r) => (
                <GlobalRuleRow
                  key={statusAlertRuleKey(r)}
                  rule={r}
                  onChange={(patch) =>
                    setGlobalRules((g) => g.map((x) => (statusAlertRuleKey(x) === statusAlertRuleKey(r) ? { ...x, ...patch } : x)))
                  }
                />
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void saveGlobal()}
                disabled={!globalDirty || globalSaving}
                className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-[11px] font-semibold text-white transition hover:brightness-95 disabled:opacity-40"
              >
                {globalSaving ? "保存中…" : "保存全局默认"}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {globalRules.map((r) => (
              <AlertRuleReadonlyRow key={statusAlertRuleKey(r)} rule={r} />
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="区域阈值"
        description="按区域覆盖上级与全局默认：房间优先于楼层、楼层优先于校区。你只能配置自己负责的区域；「本层已配」含配过但全关。"
        actions={<span className="text-[10px] text-[var(--twin-mute)]">{countConfigurable(tree)} 个可配区域</span>}
      >
        {regionLoading ? (
          <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
            加载中…
          </div>
        ) : tree.length === 0 ? (
          <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
            没有可配置告警阈值的区域（由超级管理员分配可见范围、并授予「告警阈值配置」权限后才会出现）。
          </div>
        ) : (
          <div className="overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)] p-1.5">
            {tree.map((n) => renderNode(n, 0, null))}
          </div>
        )}
        <p className="text-[10px] leading-relaxed text-[var(--twin-mute)]">
          「本层已配」表示本层有人写过行（哪怕全部关闭）；「下级已配」表示下面某一层配过（折叠时也看得到）；
          都没有则按最近一级已配置的上级、再没有才落到全局默认。
        </p>
      </SettingsSection>

      {target && (
        <RegionAlertRuleDialog
          open
          onOpenChange={(v) => {
            if (!v) setTarget(null);
          }}
          regionType={target.regionType}
          regionId={target.regionId}
          regionName={target.name}
          inheritFrom={target.inheritFrom}
          extraRegions={target.extraRegions}
          onSaved={() => void loadRegions()}
        />
      )}
    </div>
  );
}
