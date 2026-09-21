import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SettingsSwitch } from "./SettingsPrimitives";
import { ACTION_LABEL, ActionPicker, NON_VIOLATION_HINT, START_VALUE_HINT, START_VALUE_LABEL, StartValuePicker } from "./SettingsPrimitives";
import { isNonViolationStatus } from "@/features/cage-shelf/constants";
import { regionWriteTargets } from "@/features/cage-shelf/constants";
import {
  fetchRegionStatusAlertConfig,
  fetchRegionVets,
  saveRegionStatusAlertConfig,
  saveRegionVets,
  statusAlertRuleKey,
  type CageStatusAlertAction,
  type CageStatusAlertRule,
  type RegionVetConfig,
} from "@/api/domains/cageShelf.api";

/**
 * 区域告警阈值弹窗 —— 照 RegionCapabilityDialog 的姊妹结构：饲养组长决定**本区域**五个特殊状态
 * 持续多久才告警、触发后怎么处置（仅高亮 / 仅违规 / 高亮+违规）。
 *
 * 语义与能力弹窗同源：
 *  - 同区域多个饲养组长**各自配各自的**，生效取**并集**（阈值取最小、动作取并集），
 *    所以别人开的行要单独只读展示 —— 我取消却毫无作用会让人以为界面坏了。
 *  - 「配过但全关」≠「从未配置」：全关时库里仍有一行 enabled=0，不会回落全局默认。
 *  - 超管保存 = **重置本区域**（清掉所有人的行再写他这份）。
 *
 * 可编辑行用全局默认当骨架：defaults 恒为五行（statusCode+statusLabel），mine 空时（谁都没配
 * 或只有别人配过）就退回默认当初始值，保证永远有五行可勾、可改。
 */

const TYPE_LABEL: Record<string, string> = { CAMPUS: "校区", FLOOR: "楼层", ROOM: "房间" };

/** 给弹窗传的「继承自哪一级」：最近一级已配置祖先（regionType/regionId 用于拉它实际值）。 */
export interface RegionAlertInheritFrom {
  regionType: string;
  regionId: string;
  name: string;
}

/**
 * 同一区域多份规则（mine+others）合并成并集生效行：enabled 任一开、阈值取最小、动作取并集（照后端 resolveOne）。
 * 分组键是 **(状态码, 通知对象)** —— 健康异常同一状态有兽医 / 所有者两行，各配各的，合并会串味。
 */
function unionRules(rows: CageStatusAlertRule[]): CageStatusAlertRule[] {
  const byKey = new Map<string, CageStatusAlertRule[]>();
  for (const r of rows) {
    const key = statusAlertRuleKey(r);
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }
  return [...byKey.entries()].map(([, list]) => {
    const enabledRows = list.filter((r) => r.enabled);
    if (enabledRows.length === 0) {
      // 全关：enabled=false，只读行显示「已关闭」，阈值/动作不再参与展示
      return { ...list[0], enabled: false };
    }
    const highlight = enabledRows.some((r) => r.action === "HIGHLIGHT" || r.action === "BOTH");
    const violation = enabledRows.some((r) => r.action === "VIOLATION" || r.action === "BOTH");
    const action: CageStatusAlertAction = highlight && violation ? "BOTH" : violation ? "VIOLATION" : "HIGHLIGHT";
    return {
      statusCode: list[0].statusCode,
      statusLabel: enabledRows[0].statusLabel,
      notifyTarget: enabledRows[0].notifyTarget ?? "DEFAULT",
      notifyTargetLabel: enabledRows[0].notifyTargetLabel ?? "默认",
      thresholdDays: Math.min(...enabledRows.map((r) => r.thresholdDays)),
      action,
      enabled: true,
      // 方向没有可合并的语义：同区域必须一致（不一致后端会拒绝保存），这里取先出现的那个展示。
      // `?? 1`：部署窗口内可能出现「新前端 + 旧后端」（响应里还没这个字段），兜住别渲染成空态。
      startValue: enabledRows[0].startValue ?? 1,
    };
  });
}

/**
 * 规则行的显示名：默认对象只显示状态名（与改造前逐字相同）；
 * 有具体通知对象（健康异常）时补上「· 通知兽医 / · 通知笼位所有者」，否则两行长得一模一样。
 */
export function ruleDisplayLabel(rule: CageStatusAlertRule): string {
  const label = rule.statusLabel;
  const target = rule.notifyTarget ?? "DEFAULT";
  if (target === "DEFAULT") return label;
  return `${label} · ${rule.notifyTargetLabel || target}`;
}

/** 可编辑规则卡：状态名 + 启用开关，下面阈值天数 + 动作分段。关掉时阈值/动作降透明但仍可改。 */
export function AlertRuleEditCard({
  rule,
  onChange,
}: {
  rule: CageStatusAlertRule;
  onChange: (patch: Partial<CageStatusAlertRule>) => void;
}) {
  const threshold = (raw: string) =>
    Math.max(0, parseInt(raw, 10) || 0);
  return (
    <div className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-[var(--twin-ink)]">{ruleDisplayLabel(rule)}</span>
        <SettingsSwitch
          checked={rule.enabled}
          onChange={(v) => onChange({ enabled: v })}
          label={ruleDisplayLabel(rule)}
        />
      </div>
      <div className={`mt-2 flex flex-col gap-2 ${rule.enabled ? "" : "opacity-50"}`}>
        <div className="flex items-center gap-2 text-[10px] text-[var(--twin-mute)]">
          <span className="shrink-0">阈值</span>
          <input
            type="number"
            min={0}
            value={rule.thresholdDays}
            onChange={(e) => onChange({ thresholdDays: threshold(e.target.value) })}
            className="w-16 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)] outline-none"
          />
          <span className="shrink-0">天</span>
          <span className="text-[10px]">（0 = 即时）</span>
        </div>
        <ActionPicker value={rule.action} onChange={(a) => onChange({ action: a })}
          nonViolation={isNonViolationStatus(rule.statusCode)} />
        {isNonViolationStatus(rule.statusCode) && (
          <span className="text-[10px] leading-relaxed text-[var(--twin-mute)]">{NON_VIOLATION_HINT}</span>
        )}
        <div className="flex items-center gap-2 text-[10px] text-[var(--twin-mute)]">
          <span className="shrink-0">计时起点</span>
          <div className="flex-1">
            <StartValuePicker value={rule.startValue ?? 1} onChange={(v) => onChange({ startValue: v })} />
          </div>
        </div>
        <span className="text-[10px] text-[var(--twin-mute)]">{START_VALUE_HINT[rule.startValue ?? 1]}</span>
      </div>
    </div>
  );
}

/** 只读规则行：**单行**摘要（状态名 + 阈值 · 动作 · 方向 + 启停徽标）。用于「别人的配置」与全局默认的只读展示。 */
export function AlertRuleReadonlyRow({ rule }: { rule: CageStatusAlertRule }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-twin-sm border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-1.5">
      <span className="w-[5.5rem] shrink-0 text-[11px] font-semibold text-[var(--twin-body)]">{ruleDisplayLabel(rule)}</span>
      <span className="min-w-0 flex-1 text-[10px] text-[var(--twin-mute)]">
        {rule.enabled
          ? `阈值 ${rule.thresholdDays} 天 · ${ACTION_LABEL[rule.action]} · ${START_VALUE_LABEL[rule.startValue ?? 1]}`
          : "已关闭（不告警）"}
      </span>
      <span
        className={`shrink-0 text-[10px] font-semibold ${
          rule.enabled ? "text-[var(--twin-primary)]" : "text-[var(--twin-mute)]"
        }`}
      >
        {rule.enabled ? "开启" : "关闭"}
      </span>
    </div>
  );
}

export default function RegionAlertRuleDialog({
  open,
  onOpenChange,
  regionType,
  regionId,
  regionName,
  inheritFrom,
  extraRegions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  regionType: string;
  regionId: string;
  regionName: string;
  /** 未配置时「继承自哪一级」。对象=最近已配置祖先；null=无祖先、回落全局默认；undefined=未知（我的区域入口不传，措辞用通用阈值）。 */
  inheritFrom?: RegionAlertInheritFrom | null;
  /**
   * 「整层/整校区」批量：随主区域**一起写**的其它区域（同层当前可见的房间）。
   * 只按房间键逐条下发、不写楼层键的行 —— 楼层行会波及同层别人负责、且自己没配规则的房间。
   * 传了就按批量语义渲染（标题标注范围、保存逐条写）。
   */
  extraRegions?: Array<{ regionType: string; regionId: string; name?: string }>;
  onSaved?: () => void;
}) {
  const [mine, setMine] = useState<CageStatusAlertRule[]>([]);
  const [initial, setInitial] = useState<CageStatusAlertRule[]>([]);
  const [others, setOthers] = useState<CageStatusAlertRule[]>([]);
  const [asAdmin, setAsAdmin] = useState(false);
  const [regionConfigured, setRegionConfigured] = useState(false);
  /** 我**自己**有没有写过行（与 regionConfigured 区分：可能只有别人配过） */
  const [ownConfigured, setOwnConfigured] = useState(false);
  /** 未配置时，继承自的祖先**实际生效值**（并集后 5 行）；祖先读不到（locationOnly 无权限）就 null。 */
  const [inheritedRules, setInheritedRules] = useState<CageStatusAlertRule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const levelName = TYPE_LABEL[regionType] ?? "区域";

  /* ── 区域指定兽医：健康异常「通知兽医」那条通道的收件人来源，与阈值同页配置 ── */
  const [vetConfig, setVetConfig] = useState<RegionVetConfig | null>(null);
  /** 当前选中的兽医账号 id（"" = 不指定） */
  const [vetPick, setVetPick] = useState("");
  const [vetSaving, setVetSaving] = useState(false);

  useEffect(() => {
    if (!open || !regionId) return;
    let cancelled = false;
    // 兽医读失败（如祖先是 locationOnly，后端 403）不该影响阈值那一半，退化成「不显示」即可
    fetchRegionVets(regionType, regionId)
      .then((v) => {
        if (cancelled) return;
        setVetConfig(v);
        setVetPick((v.mine ?? [])[0] ?? "");
      })
      .catch(() => {
        if (!cancelled) { setVetConfig(null); setVetPick(""); }
      });
    return () => { cancelled = true; };
  }, [open, regionId, regionType]);

  const saveVet = async () => {
    setVetSaving(true);
    try {
      await saveRegionVets(regionType, regionId, vetPick ? [vetPick] : []);
      const v = await fetchRegionVets(regionType, regionId);
      setVetConfig(v);
      setVetPick((v.mine ?? [])[0] ?? "");
      toast.success("区域兽医已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存兽医失败");
    } finally {
      setVetSaving(false);
    }
  };

  useEffect(() => {
    if (!open || !regionId) return;
    let cancelled = false;
    setLoading(true);
    setInheritedRules(null);
    fetchRegionStatusAlertConfig(regionType, regionId)
      .then((v) => {
        if (cancelled) return;
        setAsAdmin(!!v.asAdmin);
        setRegionConfigured(!!v.regionConfigured);
        setOthers(v.others ?? []);
        setOwnConfigured((v.mine ?? []).length > 0);
        // 可编辑行用全局默认当骨架，再用我自己的行覆盖：mine 空时（谁都没配或只有别人配过）
        // 退回默认当初始值，保证永远有五行可改。
        const base = (v.defaults && v.defaults.length ? v.defaults : v.mine) ?? [];
        const overlay = new Map((v.mine ?? []).map((r) => [statusAlertRuleKey(r), r]));
        const eff = base.map((b) => overlay.get(statusAlertRuleKey(b)) ?? b);
        setMine(eff);
        setInitial(eff);
        // 未配置且有可读的已配置祖先 → 拉它的实际值展示「我现在实际是多少天」。
        if (!v.regionConfigured && inheritFrom) {
          fetchRegionStatusAlertConfig(inheritFrom.regionType, inheritFrom.regionId)
            .then((a) => {
              if (!cancelled) setInheritedRules(unionRules([...(a.mine ?? []), ...(a.others ?? [])]));
            })
            .catch(() => {
              // 祖先不是本人负责（locationOnly）时后端 403 —— 退化成只给名字提示
              if (!cancelled) setInheritedRules(null);
            });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMine([]);
          setInitial([]);
          setOthers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // inheritFrom 只取两个原始字段做依赖，避免父级每次渲染 new 一个对象就重跑拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, regionType, regionId, inheritFrom?.regionType, inheritFrom?.regionId]);

  const dirty = useMemo(() => JSON.stringify(mine) !== JSON.stringify(initial), [mine, initial]);

  const update = (key: string, patch: Partial<CageStatusAlertRule>) =>
    setMine((m) => m.map((r) => (statusAlertRuleKey(r) === key ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    const payload = mine.map(({ statusCode, notifyTarget, thresholdDays, action, enabled, startValue }) =>
      ({ statusCode, notifyTarget, thresholdDays, action, enabled, startValue }));
    // 批量：楼层/校区只是入口，实际**逐房间**写（不写楼层键的行，见 regionWriteTargets）
    const targets = regionWriteTargets(regionType, regionId, extraRegions);
    try {
      for (const t of targets) await saveRegionStatusAlertConfig(t.regionType, t.regionId, payload);
      setInitial(mine);
      setRegionConfigured(true);
      setOwnConfigured(true);
      toast.success(targets.length > 1 ? `已保存（共 ${targets.length} 个区域）` : "区域告警阈值已保存");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[var(--z-modal)] flex max-h-[82vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-[var(--twin-hairline)] px-5 py-3.5 text-left">
          <DialogTitle className="text-[14px] text-[var(--twin-ink)]">
            {regionName} · 状态告警阈值
            {extraRegions && extraRegions.length > 0 && (
              <span className="ml-1 text-[11px] font-normal text-[var(--twin-mute)]">
                （连可见的 {extraRegions.length} 个房间一起改）
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-[11px] text-[var(--twin-mute)]">
            特殊状态<b className="text-[var(--twin-ink)]">持续</b>超过阈值天数即告警（0 = 一出现就触发）。同区域多个饲养组长各自配各自的，生效取
            <b className="text-[var(--twin-ink)]">并集</b>，你只能改自己的行。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-5 py-4">
          {loading ? (
            <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-6 text-center text-[10px] text-[var(--twin-mute)]">
              加载中…
            </div>
          ) : mine.length === 0 ? (
            <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-6 text-center text-[10px] text-[var(--twin-mute)]">
              没有可配置的状态（后端未返回默认阈值）。
            </div>
          ) : (
            <div className="space-y-2">
              {asAdmin && (
                <div className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-[10px] leading-relaxed text-[var(--twin-mute)]">
                  你是<b className="text-[var(--twin-ink)]">超级管理员</b>：下面显示的是本区域
                  <b className="text-[var(--twin-ink)]">所有人的</b>配置，保存即
                  <b className="text-[var(--twin-ink)]">重置本区域</b>（会清掉其他组长配的行）。
                </div>
              )}
              {!regionConfigured ? (
                <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-2 text-[10px] leading-relaxed text-[var(--twin-mute)]">
                  {inheritFrom ? (
                    <>
                      本{levelName}未单独配置，当前按最近一级已配置的上级
                      <b className="text-[var(--twin-ink)]">「{inheritFrom.name}」</b>生效。
                    </>
                  ) : inheritFrom === null ? (
                    <>
                      本{levelName}未单独配置，当前按<b className="text-[var(--twin-ink)]">全局默认</b>生效。
                    </>
                  ) : (
                    <>
                      本{levelName}未单独配置，当前按<b className="text-[var(--twin-ink)]">该区域实际生效的通用阈值</b>
                      （最近一级已配置的上级，没有则全局默认）执行。
                    </>
                  )}
                  <br />
                  下面已按全局默认填好，保存后本{levelName}即「已配置」（包括你关闭的行）。
                </div>
              ) : (
                <div className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-[10px] leading-relaxed text-[var(--twin-mute)]">
                  本{levelName}
                  <b className="text-[var(--twin-ink)]">已单独配置</b>，
                  <b className="text-[var(--twin-ink)]">优先于上级</b>生效（房间优先于楼层、楼层优先于校区）。
                </div>
              )}

              {!regionConfigured && inheritFrom && inheritedRules && inheritedRules.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] leading-relaxed text-[var(--twin-mute)]">
                    「{inheritFrom.name}」当前生效的阈值（本{levelName}未配，实际按它执行）：
                  </div>
                  {inheritedRules.map((r) => (
                    <AlertRuleReadonlyRow key={statusAlertRuleKey(r)} rule={r} />
                  ))}
                </div>
              )}

              {regionConfigured && !ownConfigured && (
                <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-2 text-[10px] leading-relaxed text-[var(--twin-mute)]">
                  本区域已被其他组长配过（见下方只读区），你还没写过自己的行。下面按全局默认给初始值，
                  保存即写入<b className="text-[var(--twin-ink)]">你的</b>配置。
                </div>
              )}

              {others.length > 0 && <div className="pt-1 text-[10px] text-[var(--twin-mute)]">我的配置</div>}
              {mine.map((r) => (
                <AlertRuleEditCard key={statusAlertRuleKey(r)} rule={r}
                  onChange={(patch) => update(statusAlertRuleKey(r), patch)} />
              ))}

              {others.length > 0 && (
                <>
                  <div className="pt-1 text-[10px] leading-relaxed text-[var(--twin-mute)]">
                    以下为<b className="text-[var(--twin-ink)]">其他饲养组长</b>配的（只读）。本区域生效是
                    <b className="text-[var(--twin-ink)]">并集</b>：阈值取最小、动作取并集，你在这里
                    <b className="text-[var(--twin-ink)]">改不了别人的行</b>。
                  </div>
                  {others.map((r, i) => (
                    <AlertRuleReadonlyRow key={`${r.statusCode}:${i}`} rule={r} />
                  ))}
                </>
              )}

              {/* 区域指定兽医 —— 健康异常「通知兽医」的收件人来源。
                  与阈值分开保存（各自接口、各自事务）：改兽医不该顺带把阈值行全量重写一遍。 */}
              <div className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2">
                <div className="text-[11px] font-semibold text-[var(--twin-ink)]">指定兽医</div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--twin-mute)]">
                  健康异常到达阈值时通知这位兽医（房间优先于楼层、楼层优先于校区）。
                  {vetConfig && vetConfig.others.length > 0
                    ? ` 其他饲养组长也指定了 ${vetConfig.others.length} 位，本区域生效时取并集。`
                    : ""}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <select
                    value={vetPick}
                    onChange={(e) => setVetPick(e.target.value)}
                    className="min-w-0 flex-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)] outline-none"
                  >
                    <option value="">（不指定，只发通知配置页里为该源配的接收人）</option>
                    {(vetConfig?.candidates ?? []).map((c) => (
                      <option key={c.accountId} value={c.accountId}>
                        {c.name || c.accountId}{c.jobNumber ? `（${c.jobNumber}）` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void saveVet()}
                    disabled={vetSaving}
                    className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-[11px] text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft)] disabled:opacity-40"
                  >
                    {vetSaving ? "保存中…" : "保存兽医"}
                  </button>
                </div>
              </div>

              <p className="pt-1 text-[10px] leading-relaxed text-[var(--twin-mute)]">
                「仅高亮」只在网格标色，「仅违规」只自动发违规记录，「高亮+违规」两者都做。0 天 = 一出现即触发。
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--twin-hairline)] px-5 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 text-[11px] font-semibold text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft)]"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-[11px] font-semibold text-white transition hover:brightness-95 disabled:opacity-40"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
