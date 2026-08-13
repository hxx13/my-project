import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { getDahuaSwingRuleConfig, saveDahuaSwingRuleConfig, type DahuaSwingRuleConfig } from "@/api/domains/dahuaSwing.api";
import { fetchDahuaDeviceChannels, type DahuaDeviceChannelRow } from "@/api/twinApi";
import { normalizeChannelCode, resolveChannelLabelsByCodes } from "@/utils/dahuaChannelUtils";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import DataSkeleton from "@/components/ui/DataSkeleton";

type TimeBand = { startHm: string; endHm: string };

type RuleForm = {
  scanPopupEntryWindowEnabled: boolean;
  scanPopupEntryWindows: TimeBand[];
  scanLeaveDahuaDeferSeconds: number;
  // 签退规则
  signoffChannelCodes: string[];
  autoExitDelaySeconds: number;
  // 激活规则
  enterActivationChannelCodes: string[];
  directionAgnosticActivationChannelCodes: string[];
  activationExpireSeconds: number;
  autoRiskActionEnabled: boolean;
  requireOtherRoomSuccess: boolean;
  otherRoomWithinSeconds: number;
};

const defaultForm = (): RuleForm => ({
  scanPopupEntryWindowEnabled: false,
  scanPopupEntryWindows: [{ startHm: "09:00", endHm: "18:00" }],
  scanLeaveDahuaDeferSeconds: 0,
  signoffChannelCodes: [],
  autoExitDelaySeconds: 10,
  enterActivationChannelCodes: [],
  directionAgnosticActivationChannelCodes: [],
  activationExpireSeconds: 120,
  autoRiskActionEnabled: true,
  requireOtherRoomSuccess: true,
  otherRoomWithinSeconds: 120,
});

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => normalizeChannelCode(String(x))).filter(Boolean);
}

function cfgToForm(cfg: any): RuleForm {
  if (!cfg) return defaultForm();
  const signoff = new Set([...strList(cfg.exitChannelCodes), ...strList(cfg.activatedReswipeExitChannelCodes)]);
  return {
    scanPopupEntryWindowEnabled: Boolean(cfg.scanPopupEntryWindowEnabled),
    scanPopupEntryWindows: (() => {
      if (!Array.isArray(cfg.scanPopupEntryWindows)) return defaultForm().scanPopupEntryWindows;
      const mapped = (cfg.scanPopupEntryWindows as TimeBand[])
        .map((b) => ({
          startHm: String((b as TimeBand)?.startHm ?? "09:00").trim() || "09:00",
          endHm: String((b as TimeBand)?.endHm ?? "18:00").trim() || "18:00",
        }))
        .filter((b) => b.startHm && b.endHm);
      return mapped.length > 0 ? mapped : defaultForm().scanPopupEntryWindows;
    })(),
    scanLeaveDahuaDeferSeconds: Math.max(0, Math.min(3600, Number(cfg.scanLeaveDahuaDeferSeconds ?? 0))),
    signoffChannelCodes: Array.from(signoff),
    autoExitDelaySeconds: Number(cfg.autoExitDelaySeconds || 10),
    enterActivationChannelCodes: strList(cfg.toggleChannelCodes),
    directionAgnosticActivationChannelCodes: strList(cfg.directionAgnosticActivationChannelCodes),
    activationExpireSeconds: Number(cfg.activationExpireSeconds || 120),
    autoRiskActionEnabled: Boolean(cfg.autoRiskActionEnabled ?? true),
    requireOtherRoomSuccess: Boolean(cfg.requireOtherRoomSuccess ?? true),
    otherRoomWithinSeconds: Number(cfg.otherRoomWithinSeconds || 120),
  };
}

const RULE_CONFIG_QUERY_KEY = ["dahuaSwing", "ruleConfig"] as const;

function formToApi(form: RuleForm): DahuaSwingRuleConfig {
  return {
    scanPopupEntryWindowEnabled: form.scanPopupEntryWindowEnabled,
    scanPopupEntryWindows: form.scanPopupEntryWindows,
    scanLeaveDahuaDeferSeconds: form.scanLeaveDahuaDeferSeconds,
    // 签退门合并写入 exitChannelCodes；activatedReswipeExitChannelCodes 已并入，置空
    exitChannelCodes: form.signoffChannelCodes.map(normalizeChannelCode).filter(Boolean),
    activatedReswipeExitChannelCodes: [],
    toggleChannelCodes: form.enterActivationChannelCodes.map(normalizeChannelCode).filter(Boolean),
    directionAgnosticActivationChannelCodes: form.directionAgnosticActivationChannelCodes.map(normalizeChannelCode).filter(Boolean),
    autoRiskActionEnabled: form.autoRiskActionEnabled,
    autoExitDelaySeconds: form.autoExitDelaySeconds,
    activationExpireSeconds: form.activationExpireSeconds,
    requireOtherRoomSuccess: form.requireOtherRoomSuccess,
    otherRoomWithinSeconds: form.otherRoomWithinSeconds,
  };
}

function ChannelListPicker(props: {
  title: string;
  hint?: string;
  options: DahuaDeviceChannelRow[];
  selected: string[];
  onToggle: (code: string, checked: boolean) => void;
  nameByCode: Map<string, string>;
  idPrefix: string;
}) {
  const { title, hint, options, selected, onToggle, nameByCode, idPrefix } = props;
  const [availKeyword, setAvailKeyword] = useState("");
  const [pickedKeyword, setPickedKeyword] = useState("");
  const pickedCodes = selected.map(normalizeChannelCode).filter(Boolean);

  const matches = (code: string, name: string, kw: string) => {
    if (!kw) return true;
    return code.toLowerCase().includes(kw) || name.toLowerCase().includes(kw);
  };

  const available = options.filter((ch) => {
    const code = normalizeChannelCode(ch.channelCode);
    if (!code) return false;
    if (pickedCodes.includes(code)) return false;
    return matches(code, (ch.channelName || "").trim(), availKeyword.trim().toLowerCase());
  });

  const picked = pickedCodes.filter((code) =>
    matches(code, nameByCode.get(code) || "", pickedKeyword.trim().toLowerCase())
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
      <div className="shrink-0 text-sm text-[var(--twin-body)]">{title}</div>
      {hint ? <p className="shrink-0 text-xs text-[var(--twin-mute)]">{hint}</p> : null}
      <div className="flex min-h-0 flex-1 gap-2">
        {/* 左侧：可选通道 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
          <div className="shrink-0 text-xs text-[var(--twin-mute)]">可选通道</div>
          <input className="h-8 w-full shrink-0 rounded border border-[var(--twin-hairline)] px-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]" placeholder="搜索可选门" value={availKeyword} onChange={(e) => setAvailKeyword(e.target.value)} />
          <div className="min-h-0 flex-1 overflow-auto rounded border border-[var(--twin-hairline)] p-1">
            {available.length === 0 ? (
              <div className="p-2 text-center text-xs text-[var(--twin-mute)]">无可选通道</div>
            ) : available.map((ch) => {
              const code = normalizeChannelCode(ch.channelCode);
              if (!code) return null;
              const name = (ch.channelName || "未命名通道") + " / " + code;
              return (
                <button key={`${idPrefix}-avail-${ch.id}`} type="button" onClick={() => onToggle(code, true)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]">
                  <span className="shrink-0 font-bold text-indigo-600">＋</span>
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* 右侧：已选通道 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
          <div className="shrink-0 text-xs text-[var(--twin-mute)]">已选通道（{picked.length}）</div>
          <input className="h-8 w-full shrink-0 rounded border border-[var(--twin-hairline)] px-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]" placeholder="搜索已选门" value={pickedKeyword} onChange={(e) => setPickedKeyword(e.target.value)} />
          <div className="min-h-0 flex-1 overflow-auto rounded border border-[var(--twin-hairline)] p-1">
            {picked.length === 0 ? (
              <div className="p-2 text-center text-xs text-[var(--twin-mute)]">尚未选择通道</div>
            ) : picked.map((code) => {
              const name = nameByCode.get(code) || `未命名 / ${code}`;
              return (
                <button key={`${idPrefix}-picked-${code}`} type="button" onClick={() => onToggle(code, false)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]">
                  <span className="shrink-0 font-bold text-red-500">×</span>
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminDahuaSwingRulesPage() {
  const { data: configData, isLoading } = useQuery({
    queryKey: RULE_CONFIG_QUERY_KEY,
    queryFn: getDahuaSwingRuleConfig,
  });

  const [form, setForm] = useState<RuleForm>(defaultForm());
  const [channelOptions, setChannelOptions] = useState<DahuaDeviceChannelRow[]>([]);
  const [channelLabelExtra, setChannelLabelExtra] = useState<Record<string, string>>({});
  /** 最近一次已持久化的完整配置快照：分区保存时用其补齐另一分区，避免互相覆盖 */
  const savedRef = useRef<RuleForm>(defaultForm());

  useEffect(() => {
    if (configData) {
      const next = cfgToForm(configData);
      setForm(next);
      savedRef.current = next;
    }
  }, [configData]);

  useEffect(() => {
    void (async () => {
      try {
        const all: DahuaDeviceChannelRow[] = [];
        const pageSize = 200;
        for (let page = 1; page <= 20; page++) {
          const res = await fetchDahuaDeviceChannels({ page, pageSize, keyword: "" });
          const list = res.list || [];
          all.push(...list);
          if (list.length < pageSize) break;
        }
        const dedup = new Map<string, DahuaDeviceChannelRow>();
        for (const ch of all) {
          const code = normalizeChannelCode(ch.channelCode);
          if (!code) continue;
          if (!dedup.has(code)) dedup.set(code, ch);
        }
        setChannelOptions(Array.from(dedup.values()));
      } catch {
        setChannelOptions([]);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const all = [
        ...form.signoffChannelCodes,
        ...form.enterActivationChannelCodes,
        ...form.directionAgnosticActivationChannelCodes,
      ]
        .map(normalizeChannelCode)
        .filter(Boolean);
      const known = new Set(
        channelOptions.map((ch) => normalizeChannelCode(ch.channelCode)).filter(Boolean)
      );
      const need = [...new Set(all)].filter((c) => !known.has(c));
      if (need.length === 0) return;
      const resolved = await resolveChannelLabelsByCodes(need, fetchDahuaDeviceChannels);
      setChannelLabelExtra((prev) => ({ ...prev, ...resolved }));
    })();
  }, [form.signoffChannelCodes, form.enterActivationChannelCodes, form.directionAgnosticActivationChannelCodes, channelOptions]);

  /** 分区保存：以持久化快照补齐另一分区，仅落库本次分区的改动 */
  const persist = async (patch: Partial<RuleForm>, successMsg: string) => {
    const merged = { ...savedRef.current, ...patch };
    try {
      const saved = await saveDahuaSwingRuleConfig(formToApi(merged));
      savedRef.current = cfgToForm(saved ?? formToApi(merged));
      toast.success(successMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const saveScanPopupModule = () =>
    persist(
      {
        scanPopupEntryWindowEnabled: form.scanPopupEntryWindowEnabled,
        scanPopupEntryWindows: form.scanPopupEntryWindows,
        scanLeaveDahuaDeferSeconds: form.scanLeaveDahuaDeferSeconds,
      },
      "扫码弹窗配置保存成功"
    );

  const saveSwingRuleModule = () =>
    persist(
      {
        signoffChannelCodes: form.signoffChannelCodes,
        autoExitDelaySeconds: form.autoExitDelaySeconds,
        enterActivationChannelCodes: form.enterActivationChannelCodes,
        directionAgnosticActivationChannelCodes: form.directionAgnosticActivationChannelCodes,
        activationExpireSeconds: form.activationExpireSeconds,
        autoRiskActionEnabled: form.autoRiskActionEnabled,
        requireOtherRoomSuccess: form.requireOtherRoomSuccess,
        otherRoomWithinSeconds: form.otherRoomWithinSeconds,
      },
      "门禁联动规则保存成功"
    );

  const channelNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const ch of channelOptions) {
      const code = normalizeChannelCode(ch.channelCode);
      if (!code) continue;
      const name = (ch.channelName || "").trim();
      if (!m.has(code)) m.set(code, name || `未命名 / ${code}`);
    }
    for (const [code, label] of Object.entries(channelLabelExtra)) {
      if (code && !m.has(code)) m.set(code, label);
    }
    return m;
  }, [channelOptions, channelLabelExtra]);

  const toggleList = (field: "signoffChannelCodes" | "enterActivationChannelCodes" | "directionAgnosticActivationChannelCodes") =>
    (code: string, checked: boolean) =>
      setForm((p) => ({
        ...p,
        [field]: checked
          ? Array.from(new Set([...p[field].map(normalizeChannelCode).filter(Boolean), code]))
          : p[field].filter((c) => normalizeChannelCode(c) !== code),
      }));

  if (isLoading) {
    return <div className="p-6"><DataSkeleton variant="form" rows={4} /></div>;
  }

  return (
    <div className="flex flex-col gap-4 max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
      <div className="shrink-0 rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3 space-y-3 shadow-twin-level-2">
        <h2 className="text-base font-semibold text-[var(--twin-ink)]">Web 扫码弹窗与离开联动</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded border border-[var(--twin-hairline)] p-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--twin-ink)]">
              <AdminSwitchScaled
                size="sm"
                checked={form.scanPopupEntryWindowEnabled}
                onChange={(checked) => setForm((p) => ({ ...p, scanPopupEntryWindowEnabled: checked }))}
              />
              <span>启用扫码弹窗入口时段限制</span>
            </label>
            <p className="text-xs text-[var(--twin-mute)]">
              启用后，仅限制扫码进入；离开按钮不受时段限制。时区与 app.business-timezone（默认 Asia/Shanghai）一致。
            </p>
            <div className="space-y-1">
              {form.scanPopupEntryWindows.map((band, idx) => (
                <div key={`band-${idx}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-[var(--twin-body)]">时段 {idx + 1}</span>
                  <input
                    className="h-8 w-24 rounded border border-[var(--twin-hairline)] px-2 font-mono text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
                    value={band.startHm}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        scanPopupEntryWindows: p.scanPopupEntryWindows.map((b, i) =>
                          i === idx ? { ...b, startHm: e.target.value } : b
                        ),
                      }))
                    }
                    placeholder="09:00"
                  />
                  <span className="text-[var(--twin-mute)]">至</span>
                  <input
                    className="h-8 w-24 rounded border border-[var(--twin-hairline)] px-2 font-mono text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
                    value={band.endHm}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        scanPopupEntryWindows: p.scanPopupEntryWindows.map((b, i) =>
                          i === idx ? { ...b, endHm: e.target.value } : b
                        ),
                      }))
                    }
                    placeholder="18:00"
                  />
                  <button
                    type="button"
                    className="h-8 rounded border border-[var(--twin-hairline)] px-2 text-xs text-[var(--twin-body)]"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        scanPopupEntryWindows: p.scanPopupEntryWindows.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    删除
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="h-8 rounded border border-[var(--twin-hairline)] px-2 text-xs text-[var(--twin-body)]"
                onClick={() =>
                  setForm((p) => ({
                    ...p,
                    scanPopupEntryWindows: [...p.scanPopupEntryWindows, { startHm: "09:00", endHm: "18:00" }],
                  }))
                }
              >
                添加时段
              </button>
            </div>
          </div>
          <div className="rounded border border-[var(--twin-hairline)] p-2 space-y-2">
            <div className="text-sm font-semibold text-[var(--twin-ink)]">扫码离开后大华回收 / 冻结延迟</div>
            <p className="text-xs text-[var(--twin-mute)]">
              ARO 离开登记成功后立即生效；大华门禁权限回收与物理卡冻结可延后执行（秒），0 表示与原先一致立即执行。
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-32 shrink-0 text-[var(--twin-body)]">延迟(秒)</span>
              <input
                className="h-8 flex-1 rounded border border-[var(--twin-hairline)] px-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
                type="number"
                min={0}
                max={3600}
                value={form.scanLeaveDahuaDeferSeconds}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    scanLeaveDahuaDeferSeconds: Math.max(0, Math.min(3600, Number(e.target.value || 0))),
                  }))
                }
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button type="button" className="h-8 rounded border border-[var(--twin-hairline)] px-3 text-xs text-[var(--twin-body)]" onClick={() => void saveScanPopupModule()}>
            保存扫码弹窗配置
          </button>
        </div>
      </div>

      <div className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3 shadow-twin-level-2 flex min-h-0 flex-1 flex-col gap-2">
        <h2 className="shrink-0 text-base font-semibold text-[var(--twin-ink)]">门禁联动规则</h2>
        <div className="shrink-0 rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--twin-ink)]">
            <AdminSwitchScaled
              size="sm"
              checked={form.autoRiskActionEnabled}
              onChange={(checked) => setForm((p) => ({ ...p, autoRiskActionEnabled: checked }))}
            />
            <span>自动签退后续联动（大华 revoke + 卡片冻结）</span>
          </label>
        </div>
        {/* 主体三等分：激活规则占左 2/3，签退规则占右 1/3 */}
        <div className="flex min-h-0 flex-1 gap-2">
          <div className="flex min-h-0 min-w-0 flex-[2] flex-col gap-2 rounded border border-[var(--twin-hairline)] p-2">
            <div className="shrink-0 text-sm font-semibold text-[var(--twin-ink)]">激活规则</div>
            <div className="flex shrink-0 items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-[var(--twin-body)]">激活超时(秒)</span>
              <input className="h-8 flex-1 rounded border border-[var(--twin-hairline)] px-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]" type="number" value={form.activationExpireSeconds} onChange={(e) => setForm((p) => ({ ...p, activationExpireSeconds: Math.max(1, Number(e.target.value || 120)) }))} />
            </div>
            <div className="flex min-h-0 flex-1 gap-2">
              <ChannelListPicker
                title="进入方向激活门"
                hint="进门方向（enterOrExit=1）才触发激活"
                options={channelOptions}
                selected={form.enterActivationChannelCodes}
                onToggle={toggleList("enterActivationChannelCodes")}
                nameByCode={channelNameByCode}
                idPrefix="enter-activation"
              />
              <ChannelListPicker
                title="方向无关激活门"
                hint="不看进出方向（1/2/null 都算），用于方向不可靠或双向均算在场的门；不可与签退门重复"
                options={channelOptions}
                selected={form.directionAgnosticActivationChannelCodes}
                onToggle={toggleList("directionAgnosticActivationChannelCodes")}
                nameByCode={channelNameByCode}
                idPrefix="agnostic-activation"
              />
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded border border-[var(--twin-hairline)] p-2">
            <div className="shrink-0 text-sm font-semibold text-[var(--twin-ink)]">签退规则</div>
            <div className="flex shrink-0 items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-[var(--twin-body)]">签退延时(秒)</span>
              <input className="h-8 flex-1 rounded border border-[var(--twin-hairline)] px-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]" type="number" value={form.autoExitDelaySeconds} onChange={(e) => setForm((p) => ({ ...p, autoExitDelaySeconds: Math.max(1, Number(e.target.value || 10)) }))} />
            </div>
            <ChannelListPicker
              title="离开方向签退门"
              hint="出门方向（enterOrExit=2）才触发签退"
              options={channelOptions}
              selected={form.signoffChannelCodes}
              onToggle={toggleList("signoffChannelCodes")}
              nameByCode={channelNameByCode}
              idPrefix="signoff"
            />
          </div>
        </div>
        <div className="flex shrink-0 justify-end">
          <button type="button" className="h-8 rounded border border-[var(--twin-hairline)] px-3 text-xs text-[var(--twin-body)]" onClick={() => void saveSwingRuleModule()}>
            保存门禁联动规则
          </button>
        </div>
      </div>
    </div>
  );
}
