import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Check, Eye, EyeOff, Key, Loader2, Zap, ChevronDown, ChevronRight } from "lucide-react";
import type { SettingDefinitionRecord, SystemConfigRecord } from "@/api/domains/notification.api";
import { testLlmConnection, updateSystemConfig } from "@/api/domains/notification.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { SystemConfigsPanel } from "@/features/admin/settings/SystemConfigsPanel";
import {
  DEEPSEEK_BASE_URL,
  LLM_ENV_HINT,
  LLM_MODEL_PRESETS,
  type LlmModelPreset,
} from "@/features/admin/settings/llmProfiles";
import { adminHintClass } from "@/features/admin/adminFormUi";

type LlmSettingsPanelProps = {
  configs: SystemConfigRecord[];
  configDefs: SettingDefinitionRecord[];
  onConfigsChange: React.Dispatch<React.SetStateAction<SystemConfigRecord[]>>;
};

function configValue(configs: SystemConfigRecord[], key: string): string {
  return configs.find((c) => c.configKey === key)?.configValue?.trim() ?? "";
}

function patchLocalConfig(
  onConfigsChange: LlmSettingsPanelProps["onConfigsChange"],
  key: string,
  value: string,
) {
  onConfigsChange((prev) =>
    prev.map((c) => (c.configKey === key ? { ...c, configValue: value } : c)),
  );
}

export function LlmSettingsPanel({ configs, configDefs, onConfigsChange }: LlmSettingsPanelProps) {
  const [testing, setTesting] = useState(false);
  const [applyingPresetId, setApplyingPresetId] = useState<string | null>(null);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState<string | null>(null);

  const currentModel = useMemo(() => configValue(configs, "llm.model"), [configs]);
  const savedApiKey = useMemo(() => configValue(configs, "llm.api_key"), [configs]);

  const activePresetId = useMemo(() => {
    const match = LLM_MODEL_PRESETS.find((p) => p.model === currentModel);
    return match?.id ?? null;
  }, [currentModel]);

  const displayApiKey = apiKeyDraft !== null ? apiKeyDraft : savedApiKey;

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await testLlmConnection();
      toast.success(`连接成功 · ${res.model} · ${(res.reply ?? "").slice(0, 48)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "连接失败");
    } finally {
      setTesting(false);
    }
  };

  const saveApiKey = async () => {
    const keyToSave = apiKeyDraft !== null ? apiKeyDraft : savedApiKey;
    const row = configs.find((c) => c.configKey === "llm.api_key");
    if (!row?.id) return;
    setSavingApiKey(true);
    try {
      await updateSystemConfig(row.id, { configValue: keyToSave });
      patchLocalConfig(onConfigsChange, "llm.api_key", keyToSave);
      setApiKeyDraft(null);
      toast.success("API Key 已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingApiKey(false);
    }
  };

  const applyPreset = async (preset: LlmModelPreset) => {
    setApplyingPresetId(preset.id);
    try {
      const keysToSave: Array<{ key: string; value: string }> = [
        { key: "llm.provider", value: "deepseek" },
        { key: "llm.base_url", value: DEEPSEEK_BASE_URL },
        { key: "llm.model", value: preset.model },
        { key: "llm.model_fallback", value: preset.modelFallback },
        { key: "llm.max_tokens", value: String(preset.maxTokens) },
        { key: "llm.temperature", value: String(preset.temperature) },
        { key: "llm.assistant.max_tokens", value: String(preset.assistantMaxTokens) },
        { key: "llm.assistant.temperature", value: String(preset.assistantTemperature) },
      ];

      const failedKeys: string[] = [];
      for (const { key, value } of keysToSave) {
        const row = configs.find((c) => c.configKey === key);
        if (!row?.id) {
          failedKeys.push(key);
          continue;
        }
        try {
          await updateSystemConfig(row.id, { configValue: value });
          patchLocalConfig(onConfigsChange, key, value);
        } catch (e) {
          failedKeys.push(key);
        }
      }

      if (failedKeys.length > 0) {
        toast.error(`${preset.label} 部分保存失败: ${failedKeys.join(", ")}`);
      } else {
        toast.success(`已切换为 ${preset.label} 预设`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "切换失败");
    } finally {
      setApplyingPresetId(null);
    }
  };

  const sectionCardClass =
    "rounded-[var(--app-radius-container)] border border-[var(--app-color-border-subtle)] bg-[var(--app-color-surface-raised)] p-[var(--app-space-container-padding)]";

  return (
    <div className="flex flex-col gap-[var(--app-space-stack-md)]">
      {/* ── API Key ── */}
      <div className={sectionCardClass}>
        <div className="flex items-center gap-2 mb-3">
          <Key className="size-4 text-[var(--app-color-text-tertiary)]" aria-hidden />
          <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">
            API Key
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[16rem]">
            <input
              type={showApiKey ? "text" : "password"}
              autoComplete="new-password"
              className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-color-border-subtle)] bg-[var(--app-color-surface-page)] px-3 py-2 pr-10 text-sm text-[var(--app-color-text-primary)] outline-none transition placeholder:text-[var(--app-color-text-tertiary)] focus-visible:border-[var(--app-color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--app-color-accent)]/25"
              placeholder="sk-…"
              value={displayApiKey}
              onChange={(e) => setApiKeyDraft(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-secondary)] transition-colors"
              onClick={() => setShowApiKey((v) => !v)}
              aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
            >
              {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <AdminButton
            type="button"
            tone="primary"
            loading={savingApiKey}
            disabled={apiKeyDraft === null || apiKeyDraft === savedApiKey}
            onClick={() => void saveApiKey()}
          >
            保存
          </AdminButton>
        </div>
        <p className={`${adminHintClass} mt-2`}>{LLM_ENV_HINT}</p>
      </div>

      {/* ── 模型预设 ── */}
      <div className={sectionCardClass}>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="size-4 text-[var(--app-color-text-tertiary)]" aria-hidden />
          <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">
            模型预设
          </span>
          <span className="text-xs text-[var(--app-color-text-tertiary)]">
            点击卡片一键切换全部关联参数
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--app-space-inline-md)]">
          {LLM_MODEL_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            const isLoading = applyingPresetId === preset.id;

            return (
              <button
                key={preset.id}
                type="button"
                disabled={isLoading}
                onClick={() => void applyPreset(preset)}
                className={`group relative flex flex-col gap-2 rounded-[var(--app-radius-container)] border-2 px-4 py-3.5 text-left transition-all
                  ${isActive
                    ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)]/5 ring-2 ring-[var(--app-color-accent)]/20"
                    : "border-[var(--app-color-border-subtle)] bg-[var(--app-color-surface-container)] hover:border-[var(--app-color-border-strong)] hover:bg-[var(--app-color-surface-hover)]"
                  }
                  disabled:opacity-60 disabled:cursor-not-allowed
                  active:translate-y-px
                `}
                aria-pressed={isActive}
              >
                {/* Selection indicator */}
                <div className="flex items-start justify-between">
                  <span className="text-sm font-medium text-[var(--app-color-text-primary)]">
                    {preset.label}
                  </span>
                  <span
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors
                      ${isActive
                        ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)]"
                        : "border-[var(--app-color-border-default)]"
                      }
                    `}
                  >
                    {isActive && <Check className="size-3 text-[var(--app-color-text-on-accent)]" />}
                    {isLoading && <Loader2 className="size-3 animate-spin text-[var(--app-color-text-on-accent)]" />}
                  </span>
                </div>

                <p className="text-xs leading-relaxed text-[var(--app-color-text-secondary)]">
                  {preset.description}
                </p>

                <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-[var(--app-color-text-tertiary)]">
                  <span>
                    max_tokens: {preset.maxTokens}
                  </span>
                  <span>
                    temperature: {preset.temperature}
                  </span>
                  <span>
                    assistant: {preset.assistantMaxTokens}/{preset.assistantTemperature}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Actions bar ── */}
      <div className="flex flex-wrap items-center gap-[var(--app-space-inline-md)]">
        <AdminButton
          type="button"
          tone="secondary"
          disabled={testing}
          onClick={() => void runTest()}
        >
          {testing ? "测试中…" : "测试 API 连接"}
        </AdminButton>
      </div>

      {/* ── Advanced: SystemConfigsPanel (collapsed by default) ── */}
      <div className={sectionCardClass}>
        <button
          type="button"
          className="flex w-full items-center gap-2 text-sm font-semibold text-[var(--app-color-text-primary)] hover:text-[var(--app-color-text-secondary)] transition-colors"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? (
            <ChevronDown className="size-4 text-[var(--app-color-text-tertiary)]" />
          ) : (
            <ChevronRight className="size-4 text-[var(--app-color-text-tertiary)]" />
          )}
          高级配置
          <span className="text-xs font-normal text-[var(--app-color-text-tertiary)]">
            {showAdvanced ? "点击收起" : "点击展开以修改单个参数"}
          </span>
        </button>

        {showAdvanced && (
          <div className="mt-3">
            <SystemConfigsPanel
              moduleKey="llm"
              configs={configs}
              configDefs={configDefs}
              onConfigsChange={onConfigsChange}
              hideSearch
              description={undefined}
              title={undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}
