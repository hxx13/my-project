import type { ReactNode } from "react";
import type { SettingDefinitionRecord, SystemConfigRecord } from "@/api/domains/notification.api";
import { updateSystemConfig } from "@/api/domains/notification.api";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { adminHintClass } from "@/features/admin/adminFormUi";
import { ConfigFieldEditor, validateConfigValue } from "@/features/admin/settings/ConfigFieldEditor";
import toast from "react-hot-toast";
import { useMemo, useState } from "react";

const LLM_CONFIG_ORDER = [
  "llm.enabled",
  "llm.base_url",
  "llm.model",
  "llm.model_fallback",
  "llm.max_tokens",
  "llm.temperature",
  "llm.auto_insight",
  "llm.auto_insight_on_open",
  "llm.auto_insight_batch_limit",
  "llm.api_key",
];

function llmConfigSortRank(key: string): number {
  const i = LLM_CONFIG_ORDER.indexOf(key);
  if (i >= 0) return i;
  if (key.startsWith("llm.insight_user_prompt.")) return 100;
  if (key.startsWith("llm.insight_system_prompt.")) return 101;
  return 50;
}

type SystemConfigsPanelProps = {
  moduleKey: string;
  configs: SystemConfigRecord[];
  configDefs: SettingDefinitionRecord[];
  onConfigsChange: React.Dispatch<React.SetStateAction<SystemConfigRecord[]>>;
  /** 搜索框右侧操作区（如大模型「测试连接」） */
  toolbarExtra?: ReactNode;
  description?: string;
};

export function SystemConfigsPanel({
  moduleKey,
  configs,
  configDefs,
  onConfigsChange,
  toolbarExtra,
  description,
}: SystemConfigsPanelProps) {
  const [keyword, setKeyword] = useState("");
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const defMap = useMemo(() => new Map(configDefs.map((d) => [d.configKey, d])), [configDefs]);

  const sortedConfigs = useMemo(() => {
    if (moduleKey !== "llm") return configs;
    return [...configs].sort((a, b) => llmConfigSortRank(a.configKey) - llmConfigSortRank(b.configKey));
  }, [configs, moduleKey]);

  const filtered = useMemo(() => {
    const key = keyword.trim().toLowerCase();
    const base = sortedConfigs;
    if (!key) return base;
    return base.filter((cfg) => {
      const def = defMap.get(cfg.configKey);
      return (
        cfg.configKey.toLowerCase().includes(key) ||
        (def?.labelZh || "").toLowerCase().includes(key) ||
        (def?.description || "").toLowerCase().includes(key)
      );
    });
  }, [sortedConfigs, defMap, keyword]);

  const saveConfig = async (cfg: SystemConfigRecord) => {
    const def = defMap.get(cfg.configKey);
    if (!validateConfigValue(cfg.configValue || "", def?.valueType)) {
      toast.error(`配置值类型不正确，应为 ${def?.valueType || "STRING"}`);
      return;
    }
    setSavingId(cfg.id);
    try {
      await updateSystemConfig(cfg.id, cfg);
      // 保存后仅合并当前配置项，禁止整表 load（post-save-no-full-refresh.mdc）
      onConfigsChange((prev) => prev.map((x) => (x.id === cfg.id ? { ...cfg } : x)));
      toast.success(def?.requiresRestart ? "已保存（需重启服务后生效）" : "已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AdminFormCard
      title={moduleKey === "llm" ? "大模型连接（通义 / DashScope）" : "配置项"}
      description={
        description ??
        (moduleKey === "llm"
          ? "按中文名称维护参数；API Key 填 sk- 开头密钥。「解读提问 · …」为各业务模块 AI 解读弹窗的默认提问；用户可在弹窗内修改并保存到本机。保存后可用「测试连接」。"
          : "按中文名称与说明维护参数；布尔/枚举类请用下拉，无需手输 true/false 等英文。")
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <AdminToolbarSearchField
          className="max-w-md flex-1"
          placeholder="搜索中文名、说明或键名…"
          value={keyword}
          onChange={setKeyword}
          onSubmit={() => undefined}
        />
        {toolbarExtra}
      </div>
      {filtered.length === 0 ? (
        <p className={adminHintClass}>当前模块「{moduleKey}」暂无配置项或未匹配搜索条件。</p>
      ) : (
        <div className="relative z-0 divide-y divide-neutral-100 rounded-lg border border-neutral-200/90 bg-white px-3">
          {filtered.map((cfg) => (
            <ConfigFieldEditor
              key={cfg.id}
              cfg={cfg}
              def={defMap.get(cfg.configKey)}
              showSensitive={Boolean(showSensitive[cfg.configKey])}
              onToggleSensitive={() => setShowSensitive((prev) => ({ ...prev, [cfg.configKey]: !prev[cfg.configKey] }))}
              onChange={(value) => onConfigsChange((prev) => prev.map((x) => (x.id === cfg.id ? { ...x, configValue: value } : x)))}
              onSave={() => saveConfig(cfg)}
              saving={savingId === cfg.id}
            />
          ))}
        </div>
      )}
    </AdminFormCard>
  );
}
