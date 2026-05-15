import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getDahuaSwingRuleConfig, saveDahuaSwingRuleConfig } from "@/api/domains/dahuaSwing.api";
import { fetchDahuaDeviceChannels, type DahuaDeviceChannelRow } from "@/api/twinApi";
import { normalizeChannelCode, resolveChannelLabelsByCodes } from "@/utils/dahuaChannelUtils";

type TimeBand = { startHm: string; endHm: string };

type RuleForm = {
  scanPopupEntryWindowEnabled: boolean;
  scanPopupEntryWindows: TimeBand[];
  scanLeaveDahuaDeferSeconds: number;
  exitChannelCodes: string[];
  toggleChannelCodes: string[];
  activatedReswipeExitChannelCodes: string[];
  autoRiskActionEnabled: boolean;
  autoExitDelaySeconds: number;
  enterDebounceSeconds: number;
  activationExpireSeconds: number;
  requireOtherRoomSuccess: boolean;
  otherRoomWithinSeconds: number;
};

const defaultForm = (): RuleForm => ({
  scanPopupEntryWindowEnabled: false,
  scanPopupEntryWindows: [{ startHm: "09:00", endHm: "18:00" }],
  scanLeaveDahuaDeferSeconds: 0,
  exitChannelCodes: [],
  toggleChannelCodes: [],
  activatedReswipeExitChannelCodes: [],
  autoRiskActionEnabled: true,
  autoExitDelaySeconds: 10,
  enterDebounceSeconds: 30,
  activationExpireSeconds: 120,
  requireOtherRoomSuccess: true,
  otherRoomWithinSeconds: 120,
});

export default function AdminDahuaSwingRulesPage() {
  const [form, setForm] = useState<RuleForm>(defaultForm());
  const [channelOptions, setChannelOptions] = useState<DahuaDeviceChannelRow[]>([]);
  const [exitChannelKeyword, setExitChannelKeyword] = useState("");
  const [toggleChannelKeyword, setToggleChannelKeyword] = useState("");
  const [activatedReswipeExitKeyword, setActivatedReswipeExitKeyword] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await getDahuaSwingRuleConfig();
        if (!cfg) return;
        setForm({
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
          scanLeaveDahuaDeferSeconds: Math.max(
            0,
            Math.min(3600, Number(cfg.scanLeaveDahuaDeferSeconds ?? 0))
          ),
          exitChannelCodes: Array.isArray(cfg.exitChannelCodes)
            ? cfg.exitChannelCodes.map((x: string) => normalizeChannelCode(x)).filter(Boolean)
            : [],
          toggleChannelCodes: Array.isArray(cfg.toggleChannelCodes)
            ? cfg.toggleChannelCodes.map((x: string) => normalizeChannelCode(x)).filter(Boolean)
            : [],
          activatedReswipeExitChannelCodes: Array.isArray(cfg.activatedReswipeExitChannelCodes)
            ? cfg.activatedReswipeExitChannelCodes.map((x: string) => normalizeChannelCode(x)).filter(Boolean)
            : [],
          autoRiskActionEnabled: Boolean(cfg.autoRiskActionEnabled ?? true),
          autoExitDelaySeconds: Number(cfg.autoExitDelaySeconds || 10),
          enterDebounceSeconds: Number(cfg.enterDebounceSeconds || 30),
          activationExpireSeconds: Number(cfg.activationExpireSeconds || 120),
          requireOtherRoomSuccess: Boolean(cfg.requireOtherRoomSuccess ?? true),
          otherRoomWithinSeconds: Number(cfg.otherRoomWithinSeconds || 120),
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加载联动规则失败");
      }
    })();
  }, []);

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

  const [channelLabelExtra, setChannelLabelExtra] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const all = [
        ...form.exitChannelCodes,
        ...form.toggleChannelCodes,
        ...form.activatedReswipeExitChannelCodes,
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
  }, [form.exitChannelCodes, form.toggleChannelCodes, form.activatedReswipeExitChannelCodes, channelOptions]);

  const save = async () => {
    try {
      await saveDahuaSwingRuleConfig(form);
      toast.success("联动规则保存成功");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "联动规则保存失败");
    }
  };

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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-3 space-y-3">
        <h2 className="text-base font-semibold text-slate-800">Web 扫码弹窗与离开联动</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded border border-slate-200 p-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-800">
              <input
                type="checkbox"
                className="shrink-0"
                checked={form.scanPopupEntryWindowEnabled}
                onChange={(e) => setForm((p) => ({ ...p, scanPopupEntryWindowEnabled: e.target.checked }))}
              />
              <span>启用扫码弹窗入口时段限制</span>
            </label>
            <p className="text-xs text-slate-500">
              启用后，所有房间的进入/离开按钮仅在下列时段内可用；时区与服务器配置 app.business-timezone（默认 Asia/Shanghai）一致。
            </p>
            <div className="space-y-1">
              {form.scanPopupEntryWindows.map((band, idx) => (
                <div key={`band-${idx}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-600">时段 {idx + 1}</span>
                  <input
                    className="h-8 w-24 rounded border px-2 font-mono text-sm"
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
                  <span className="text-slate-500">至</span>
                  <input
                    className="h-8 w-24 rounded border px-2 font-mono text-sm"
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
                    className="h-8 rounded border px-2 text-xs text-slate-600"
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
                className="h-8 rounded border px-2 text-xs text-slate-700"
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
          <div className="rounded border border-slate-200 p-2 space-y-2">
            <div className="text-sm font-semibold text-slate-800">扫码离开后大华回收 / 冻结延迟</div>
            <p className="text-xs text-slate-500">
              ARO 离开登记成功后立即生效；大华门禁权限回收与物理卡冻结可延后执行（秒），0 表示与原先一致立即执行。
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-32 shrink-0 text-slate-600">延迟(秒)</span>
              <input
                className="h-8 flex-1 rounded border px-2 text-sm"
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
      </div>

      <div className="rounded-xl border bg-white p-3 space-y-2">
        <h2 className="text-base font-semibold text-slate-800">门禁联动规则</h2>
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-800">
            <input
              type="checkbox"
              className="shrink-0"
              checked={form.autoRiskActionEnabled}
              onChange={(e) => setForm((p) => ({ ...p, autoRiskActionEnabled: e.target.checked }))}
            />
            <span>自动签退后续联动（大华 revoke + 卡片冻结）</span>
          </label>
        </div>
        <div className="grid gap-2 xl:grid-cols-3">
          <div className="rounded border p-2 space-y-2 flex flex-col h-full">
            <div className="text-sm font-semibold text-slate-800">刷门即签退规则</div>
            <div className="space-y-1.5 text-sm flex-1 flex flex-col">
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-slate-600">签退延时(秒)</span>
                <input className="h-8 flex-1 rounded border px-2 text-sm" type="number" value={form.autoExitDelaySeconds} onChange={(e) => setForm((p) => ({ ...p, autoExitDelaySeconds: Math.max(1, Number(e.target.value || 10)) }))} />
              </div>
              <div className="space-y-1 flex-1 flex flex-col">
                <div className="text-sm text-slate-700">触发门组</div>
                <input className="h-8 w-full rounded border px-2 text-sm" placeholder="搜索门名称/编码" value={exitChannelKeyword} onChange={(e) => setExitChannelKeyword(e.target.value)} />
                <div className="h-full min-h-[180px] max-h-[300px] overflow-auto rounded border border-slate-100 p-1">
                  {channelOptions.filter((ch) => {
                    const code = normalizeChannelCode(ch.channelCode);
                    const name = (ch.channelName || "").trim();
                    const kw = exitChannelKeyword.trim().toLowerCase();
                    if (!kw) return !!code;
                    return code.toLowerCase().includes(kw) || name.toLowerCase().includes(kw);
                  }).map((ch) => {
                    const code = normalizeChannelCode(ch.channelCode);
                    if (!code) return null;
                    const checked = form.exitChannelCodes.includes(code);
                    return (
                      <label key={`exit-${ch.id}`} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              exitChannelCodes: e.target.checked
                                ? Array.from(new Set([...p.exitChannelCodes.map(normalizeChannelCode).filter(Boolean), code]))
                                : p.exitChannelCodes.filter((c) => normalizeChannelCode(c) !== code),
                            }))
                          }
                        />
                        <span>{(ch.channelName || "未命名通道") + " / " + code}</span>
                      </label>
                    );
                  })}
                </div>
                {form.exitChannelCodes.length > 0 && (
                  <div className="flex flex-wrap gap-1 rounded border border-slate-100 p-1">
                    {form.exitChannelCodes.map((code) => {
                      const k = normalizeChannelCode(code);
                      const name = channelNameByCode.get(k) || `未命名 / ${k}`;
                      return (
                        <span key={`exit-picked-${k}`} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
                          {name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded border p-2 space-y-2 flex flex-col">
            <div className="text-sm font-semibold text-slate-800">激活卡片规则</div>
            <div className="space-y-1.5 text-sm flex-1 flex flex-col">
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-slate-600">进入防抖(秒)</span>
                <input className="h-8 flex-1 rounded border px-2 text-sm" type="number" value={form.enterDebounceSeconds} onChange={(e) => setForm((p) => ({ ...p, enterDebounceSeconds: Math.max(0, Number(e.target.value || 0)) }))} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-slate-600">激活超时(秒)</span>
                  <input className="h-8 flex-1 rounded border px-2 text-sm" type="number" value={form.activationExpireSeconds} onChange={(e) => setForm((p) => ({ ...p, activationExpireSeconds: Math.max(1, Number(e.target.value || 120)) }))} />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-slate-700">触发门组</div>
                <input className="h-8 w-full rounded border px-2 text-sm" placeholder="搜索门名称/编码" value={toggleChannelKeyword} onChange={(e) => setToggleChannelKeyword(e.target.value)} />
                <div className="h-[180px] max-h-[180px] overflow-auto rounded border border-slate-100 p-1">
                  {channelOptions.filter((ch) => {
                    const code = normalizeChannelCode(ch.channelCode);
                    const name = (ch.channelName || "").trim();
                    const kw = toggleChannelKeyword.trim().toLowerCase();
                    if (!kw) return !!code;
                    return code.toLowerCase().includes(kw) || name.toLowerCase().includes(kw);
                  }).map((ch) => {
                    const code = normalizeChannelCode(ch.channelCode);
                    if (!code) return null;
                    const checked = form.toggleChannelCodes.includes(code);
                    return (
                      <label key={`toggle-${ch.id}`} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              toggleChannelCodes: e.target.checked
                                ? Array.from(new Set([...p.toggleChannelCodes.map(normalizeChannelCode).filter(Boolean), code]))
                                : p.toggleChannelCodes.filter((c) => normalizeChannelCode(c) !== code),
                            }))
                          }
                        />
                        <span>{(ch.channelName || "未命名通道") + " / " + code}</span>
                      </label>
                    );
                  })}
                </div>
                {form.toggleChannelCodes.length > 0 && (
                  <div className="flex flex-wrap gap-1 rounded border border-slate-100 p-1">
                    {form.toggleChannelCodes.map((code) => {
                      const k = normalizeChannelCode(code);
                      const name = channelNameByCode.get(k) || `未命名 / ${k}`;
                      return (
                        <span key={`toggle-picked-${k}`} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
                          {name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded border p-2 space-y-2 flex flex-col">
            <div className="text-sm font-semibold text-slate-800">激活后再次刷门即签退规则</div>
            <div className="space-y-1.5 text-sm flex-1 flex flex-col">
              <div className="space-y-1">
                <div className="text-sm text-slate-700">触发门组</div>
                <input className="h-8 w-full rounded border px-2 text-sm" placeholder="搜索门名称/编码" value={activatedReswipeExitKeyword} onChange={(e) => setActivatedReswipeExitKeyword(e.target.value)} />
                <div className="h-[180px] max-h-[180px] overflow-auto rounded border border-slate-100 p-1">
                  {channelOptions.filter((ch) => {
                    const code = normalizeChannelCode(ch.channelCode);
                    const name = (ch.channelName || "").trim();
                    const kw = activatedReswipeExitKeyword.trim().toLowerCase();
                    if (!kw) return !!code;
                    return code.toLowerCase().includes(kw) || name.toLowerCase().includes(kw);
                  }).map((ch) => {
                    const code = normalizeChannelCode(ch.channelCode);
                    if (!code) return null;
                    const checked = form.activatedReswipeExitChannelCodes.includes(code);
                    return (
                      <label key={`activated-reswipe-exit-${ch.id}`} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              activatedReswipeExitChannelCodes: e.target.checked
                                ? Array.from(new Set([...p.activatedReswipeExitChannelCodes.map(normalizeChannelCode).filter(Boolean), code]))
                                : p.activatedReswipeExitChannelCodes.filter((c) => normalizeChannelCode(c) !== code),
                            }))
                          }
                        />
                        <span>{(ch.channelName || "未命名通道") + " / " + code}</span>
                      </label>
                    );
                  })}
                </div>
                {form.activatedReswipeExitChannelCodes.length > 0 && (
                  <div className="flex flex-wrap gap-1 rounded border border-slate-100 p-1">
                    {form.activatedReswipeExitChannelCodes.map((code) => {
                      const k = normalizeChannelCode(code);
                      const name = channelNameByCode.get(k) || `未命名 / ${k}`;
                      return (
                        <span key={`activated-reswipe-picked-${k}`} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
                          {name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button type="button" className="h-8 rounded border px-3 text-xs text-slate-700" onClick={() => void save()}>
            保存联动规则
          </button>
        </div>
      </div>
    </div>
  );
}

