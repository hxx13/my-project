import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getDahuaSwingRuleConfig, saveDahuaSwingRuleConfig } from "@/api/domains/dahuaSwing.api";
import { fetchDahuaDeviceChannels, type DahuaDeviceChannelRow } from "@/api/twinApi";
import { normalizeChannelCode, resolveChannelLabelsByCodes } from "@/utils/dahuaChannelUtils";

type RuleForm = {
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
      <div className="rounded-xl border bg-white p-3 space-y-2">
        <h2 className="text-base font-semibold text-slate-800">门禁联动规则</h2>
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={form.autoRiskActionEnabled}
              onChange={(e) => setForm((p) => ({ ...p, autoRiskActionEnabled: e.target.checked }))}
            />
            <span>
              <span className="font-semibold">自动签退后续联动（大华 revoke + 卡片冻结）</span>
              <span className="block mt-1 text-[11px] leading-relaxed text-amber-950/90">
                <strong className="font-semibold text-amber-950">仅此一处开关</strong>
                控制「定时/刷卡触发的自动签退」在 ARO 登记离开<strong>之后</strong>是否继续：撤销本房间大华门禁联动权限、并按映射冻结卡片。
                关闭后：自动签退<strong>仅完成 ARO 离开登记</strong>（仍会做流水小穿甲同步），
                <strong>不会</strong>调用大华 revoke、<strong>不会</strong>冻结卡片。
                Web 扫码弹窗的人工离开等其它入口不受此开关约束。
              </span>
            </span>
          </label>
        </div>
        <div className="grid gap-2 xl:grid-cols-3">
          <div className="rounded border p-2 space-y-2 flex flex-col h-full">
            <div className="text-[11px] font-semibold text-slate-600">刷门即签退规则</div>
            <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
              命中后按「签退延时」调度自动离开流程：始终会先完成 ARO 离开；是否再 revoke 大华权限并冻结卡片由页面顶部「自动签退后续联动」开关决定。与其它门上的联动任务互斥，只保留当前门上的延时任务。
            </div>
            <div className="space-y-1.5 text-[11px] flex-1 flex flex-col">
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-slate-600">签退延时(秒)</span>
                <input className="h-8 flex-1 rounded border px-2 text-[11px]" type="number" value={form.autoExitDelaySeconds} onChange={(e) => setForm((p) => ({ ...p, autoExitDelaySeconds: Math.max(1, Number(e.target.value || 10)) }))} />
              </div>
              <div className="space-y-1 flex-1 flex flex-col">
                <div className="text-[11px] text-slate-600">触发门组</div>
                <input className="h-8 w-full rounded border px-2 text-[11px]" placeholder="搜索门名称/编码" value={exitChannelKeyword} onChange={(e) => setExitChannelKeyword(e.target.value)} />
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
            <div className="text-[11px] font-semibold text-slate-600">激活卡片规则</div>
            <div className="space-y-1.5 text-[11px] flex-1 flex flex-col">
              <div className="rounded border border-slate-200 px-2 py-2 text-[11px] text-slate-700">
                仅用于激活卡片；离开用「刷门即签退」或「激活后再刷门签退」。
              </div>
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-slate-600">进入防抖(秒)</span>
                <input className="h-8 flex-1 rounded border px-2 text-[11px]" type="number" value={form.enterDebounceSeconds} onChange={(e) => setForm((p) => ({ ...p, enterDebounceSeconds: Math.max(0, Number(e.target.value || 0)) }))} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-slate-600">激活超时(秒)</span>
                  <input className="h-8 flex-1 rounded border px-2 text-[11px]" type="number" value={form.activationExpireSeconds} onChange={(e) => setForm((p) => ({ ...p, activationExpireSeconds: Math.max(1, Number(e.target.value || 120)) }))} />
                </div>
              </div>
              <label className="flex items-center gap-2 rounded border border-slate-200 px-2 py-2 text-[11px] text-slate-700">
                <input type="checkbox" checked={form.requireOtherRoomSuccess} onChange={(e) => setForm((p) => ({ ...p, requireOtherRoomSuccess: e.target.checked }))} />
                需要其他房间成功记录
              </label>
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-slate-600">其他房间时限(秒)</span>
                <input className="h-8 flex-1 rounded border px-2 text-[11px]" type="number" value={form.otherRoomWithinSeconds} onChange={(e) => setForm((p) => ({ ...p, otherRoomWithinSeconds: Math.max(1, Number(e.target.value || 120)) }))} />
              </div>
              <div className="space-y-1">
                <div className="text-[11px] text-slate-600">触发门组</div>
                <input className="h-8 w-full rounded border px-2 text-[11px]" placeholder="搜索门名称/编码" value={toggleChannelKeyword} onChange={(e) => setToggleChannelKeyword(e.target.value)} />
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
            <div className="text-[11px] font-semibold text-slate-600">激活后再次刷门即签退规则</div>
            <div className="space-y-1.5 text-[11px] flex-1 flex flex-col">
              <div className="rounded border border-slate-200 px-2 py-2 text-[11px] text-slate-700">
                当人员已在任一激活门完成激活后，再次刷下列门组中的任意一扇，按「签退延时」调度自动离开（不必与激活门同一通道）；后续 revoke/冻结同样服从顶部「自动签退后续联动」开关。
              </div>
              <div className="space-y-1">
                <div className="text-[11px] text-slate-600">触发门组</div>
                <input className="h-8 w-full rounded border px-2 text-[11px]" placeholder="搜索门名称/编码" value={activatedReswipeExitKeyword} onChange={(e) => setActivatedReswipeExitKeyword(e.target.value)} />
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

