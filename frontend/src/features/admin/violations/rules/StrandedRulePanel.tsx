import { useCallback, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import toast from "react-hot-toast";
import { Beaker, Save, Search } from "lucide-react";
import { searchPersonnel } from "@/api/twinApi";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { EditorInspectorLayout } from "../shared/EditorInspectorLayout";
import { DepartmentMultiSelect } from "../shared/DepartmentMultiSelect";
import { InspectorGroup, InspectorRow } from "../shared/InspectorGroup";
import { MultiSelectField } from "../shared/MultiSelectField";
import type { MultiSelectOption } from "../shared/multiSelectModel";
import { violationContentTemplateSlot } from "../shared/violationContentTemplateSlot";
import { ContentBodySlot, contentBodyFromHtml, serializeContentBody } from "../slots/ContentBodySlot";
import { DispositionFieldsSlot } from "../slots/DispositionFieldsSlot";
import { DISPOSITION_RULE_LEVEL, actionsIncludeUnlock, type DispositionActionCode, type DispositionCapability, type DispositionValue } from "../slots/dispositionTypes";
import { useStrandedConfig, type StrandedConfig } from "./useStrandedConfig";

import { appConfirm } from "@/lib/appDialog";
/** 执行动作：一道固定开具违规；签退是唯一可切换的执行动作（auto_signout_enabled）。 */
type ExecuteAction = "signout";
const EXECUTE_OPTIONS: MultiSelectOption<ExecuteAction>[] = [
  { value: "signout", label: "执行签退", desc: "帮助滞留人员离开" },
];
/** 滞留行为配置无「进入次数上限」字段（已迁至 AUTO_STRANDED 规则），故裁掉 maxEnter。 */
const STRANDED_DISPOSITION: DispositionCapability = { ...DISPOSITION_RULE_LEVEL, allowMaxEnter: false };

function configToDisposition(cfg: StrandedConfig): DispositionValue {
  const actions: DispositionActionCode[] = [];
  if (cfg.forbidEnter) actions.push("forbid");
  if (cfg.unlockOnVerify) actions.push("unlock");
  const puzzle = Boolean(cfg.challengeEnabled);
  return {
    actions,
    strategy: {
      type: "fixed",
      challengePhrase: puzzle ? cfg.challengePhrase : "",
      maxEnterSuccess: null,
      puzzle,
    },
    expiry: {
      mode: "RELATIVE",
      days: actionsIncludeUnlock(actions) ? null : cfg.expireDays,
    },
  };
}

function dispositionToConfigPatch(v: DispositionValue): Partial<StrandedConfig> {
  const puzzle = v.strategy.type === "fixed" && v.strategy.puzzle;
  const phrase =
    v.strategy.type === "fixed" && v.strategy.puzzle
      ? v.strategy.challengePhrase.trim()
      : "";
  const unlock = actionsIncludeUnlock(v.actions);
  return {
    forbidEnter: v.actions.includes("forbid"),
    unlockOnVerify: unlock,
    challengeEnabled: puzzle,
    challengePhrase: phrase,
    expireDays: unlock ? null : v.expiry.mode === "RELATIVE" ? v.expiry.days : null,
  };
}

export function StrandedRulePanel(): JSX.Element {
  const { config, setConfig, signout2, setSignout2, loading, saving, savingSignout2, save, saveSignout2, runTest } = useStrandedConfig();

  const [testKeyword, setTestKeyword] = useState("");
  const [testPicked, setTestPicked] = useState<{ userId: string; name: string } | null>(null);
  const [testHits, setTestHits] = useState<Array<Record<string, unknown>>>([]);
  const [testSignout, setTestSignout] = useState(true);
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const testTimer = useRef<number | null>(null);

  const handleTestSearch = useCallback(async (keyword: string) => {
    const q = keyword.trim();
    if (!q) { setTestHits([]); return; }
    try {
      const { data: list } = await searchPersonnel(q);
      setTestHits(Array.isArray(list) ? list : []);
    } catch { setTestHits([]); }
  }, []);

  const pickTestPerson = (raw: Record<string, unknown>) => {
    const safeId = String(raw.user_id ?? raw.userid ?? raw.userId ?? raw.id ?? "").trim();
    const safeName = String(raw.name ?? raw.username ?? "").trim() || safeId;
    if (!safeId) { toast.error("该记录缺少 user_id"); return; }
    setTestPicked({ userId: safeId, name: safeName });
    setTestKeyword(`${safeName} (${safeId})`);
    setTestHits([]);
    setTestResult(null);
  };

  const runTestNow = async () => {
    if (!testPicked) { toast.error("请先选择人员"); return; }
    if (!await appConfirm(`将对「${testPicked.name}」真实执行滞留检测：可能创建真实违规记录，并在勾选签退时触发真实签退。确定继续？`)) return;
    setTestRunning(true);
    setTestResult(null);
    try {
      const data = await runTest(testPicked.userId, testSignout);
      setTestResult(typeof data.summary === "string" ? data.summary : String(data.message ?? "执行完成"));
      toast.success("试运行已完成");
    } catch (e) {
      setTestResult(`执行失败：${e instanceof Error ? e.message : "未知错误"}`);
      toast.error(e instanceof Error ? e.message : "测试失败");
    } finally { setTestRunning(false); }
  };

  const body = useMemo(() => contentBodyFromHtml(config.violationTextTpl, null), [config.violationTextTpl]);
  const disposition = useMemo(() => configToDisposition(config), [config]);
  const executeValue: ExecuteAction[] = config.autoSignout ? ["signout"] : [];

  const canvas = (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--app-color-text-primary)]">每日自动滞留检测 · 违规公告</h2>
        <p className="mt-1 text-xs text-[var(--app-color-text-secondary)]">
          每日定时检测未豁免且仍在楼内的滞留人员，自动创建违规记录并通过扫码公告。执行时刻请在「定时管理 → 冻结联动任务」配置；可用变量：{"${name}"}、{"${dept}"}、{"${date}"}。
        </p>
      </div>
      {loading ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] text-sm text-[var(--app-color-text-tertiary)]">
          加载正文…
        </div>
      ) : (
        <ContentBodySlot
          key="stranded-violation-tpl"
          value={body}
          onChange={(next) => setConfig({ violationTextTpl: serializeContentBody(next).html })}
          onPickFiles={() => {}}
          templateSlot={violationContentTemplateSlot(body, (next) => setConfig({ violationTextTpl: serializeContentBody(next).html }))}
          placeholder="留空则使用系统默认文案"
        />
      )}
    </div>
  );

  const inspector = (
    <>
      <InspectorGroup title="检测">
        <InspectorRow stack label="执行动作" hint="一道固定开具违规公告；签退为可选动作">
          {(id) => <MultiSelectField id={id} options={EXECUTE_OPTIONS} value={executeValue} onChange={(next) => setConfig({ autoSignout: next.includes("signout") })} maxChips={1} disabled={loading} />}
        </InspectorRow>
        <InspectorRow stack label="白名单部门" hint="命中部门不触发自动违规">
          <DepartmentMultiSelect selected={config.whitelistDepts} onChange={(depts) => setConfig({ whitelistDepts: depts })} disabled={loading} />
        </InspectorRow>
      </InspectorGroup>

      <DispositionFieldsSlot
        value={disposition}
        onChange={(next) => setConfig(dispositionToConfigPatch(next))}
        capability={STRANDED_DISPOSITION}
        disabled={loading}
        expiryCopy={{ placeholder: "1 天", hint: "留空 = 默认 1 天" }}
      />

      <InspectorGroup title="二道 · 仅签退">
        <InspectorRow label="启用签退">
          {(id) => <AdminSwitchScaled size="sm" id={id} checked={signout2.enabled} onChange={(checked) => setSignout2({ enabled: checked })} disabled={loading} />}
        </InspectorRow>
        <InspectorRow stack label="上次执行结果">
          <span className="break-all text-xs text-[var(--app-color-text-tertiary)]">{signout2.lastResult ?? "暂无执行记录"}</span>
        </InspectorRow>
      </InspectorGroup>
    </>
  );

  const footer = (
    <div className="space-y-3">
      {testOpen && (
        <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3">
          <p className="mb-2 rounded-md border border-[var(--app-color-feedback-warning)]/30 bg-[var(--app-color-feedback-warning-soft)] px-2 py-1.5 text-[11px] leading-relaxed text-[var(--app-color-feedback-warning)]">
            真实执行：会对指定人员真实创建违规记录，勾选「同时签退」时可能触发真实签退。
          </p>
          {testPicked ? (
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">{testPicked.name}</span>
              <span className="font-mono text-xs text-[var(--app-color-text-tertiary)]">({testPicked.userId})</span>
              <AdminButton type="button" tone="secondary" size="sm" className="ml-auto" onClick={() => { setTestPicked(null); setTestResult(null); }}>更换</AdminButton>
            </div>
          ) : (
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-color-text-tertiary)]" />
              <input
                className="w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] py-2 pl-8 pr-3 text-sm text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)] placeholder:text-[var(--app-color-text-tertiary)]"
                placeholder="输入姓名或工号检索人员…"
                value={testKeyword}
                onChange={(e) => {
                  const val = e.target.value;
                  setTestKeyword(val);
                  if (testTimer.current) window.clearTimeout(testTimer.current);
                  testTimer.current = window.setTimeout(() => void handleTestSearch(val), 250);
                }}
              />
              {testHits.length > 0 && !testPicked ? (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[180px] overflow-y-auto rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-1 [box-shadow:var(--app-elevation-card)]">
                  {testHits.map((raw) => {
                    const safeId = String(raw.user_id ?? raw.userid ?? raw.userId ?? raw.id ?? "").trim();
                    const safeName = String(raw.name ?? raw.username ?? "").trim() || safeId;
                    return (
                      <button key={safeId || safeName} type="button" className="block w-full rounded px-2 py-1.5 text-left text-sm text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]" onClick={() => pickTestPerson(raw)}>
                        {safeName} <span className="ml-1 font-mono text-[10px] text-[var(--app-color-text-tertiary)]">{safeId}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
          <label className="mb-2 flex items-center gap-2 text-sm text-[var(--app-color-text-primary)]">
            <input type="checkbox" checked={testSignout} onChange={(e) => setTestSignout(e.target.checked)} className="rounded accent-[var(--app-color-accent)]" />
            同时执行签退
          </label>
          <div className="flex items-center gap-2">
            <AdminButton type="button" tone="secondary" size="sm" loading={testRunning} disabled={!testPicked} onClick={() => void runTestNow()}>
              <Beaker className="h-3.5 w-3.5" /> 对该人员执行检测
            </AdminButton>
            {testResult != null ? <span className="min-w-0 flex-1 break-all text-xs text-[var(--app-color-text-secondary)]">{testResult}</span> : null}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <AdminButton type="button" tone="secondary" aria-expanded={testOpen} className="gap-1.5" onClick={() => setTestOpen((v) => !v)}>
          <Beaker className="h-4 w-4" /> 试运行
        </AdminButton>
        <AdminButton type="button" tone="primary" loading={saving || savingSignout2} disabled={loading} className="gap-1.5" onClick={() => void Promise.all([save(), saveSignout2()])}>
          <Save className="h-4 w-4" /> 保存
        </AdminButton>
      </div>
    </div>
  );

  return <EditorInspectorLayout canvas={canvas} inspector={inspector} footer={footer} />;
}
