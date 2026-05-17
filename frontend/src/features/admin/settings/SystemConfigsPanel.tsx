import type { SettingDefinitionRecord, SystemConfigRecord } from "@/api/domains/notification.api";
import { updateSystemConfig } from "@/api/domains/notification.api";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { adminHintClass } from "@/features/admin/adminFormUi";
import { ConfigFieldEditor, validateConfigValue } from "@/features/admin/settings/ConfigFieldEditor";
import toast from "react-hot-toast";
import { useMemo, useState } from "react";

type SystemConfigsPanelProps = {
  moduleKey: string;
  configs: SystemConfigRecord[];
  configDefs: SettingDefinitionRecord[];
  onConfigsChange: React.Dispatch<React.SetStateAction<SystemConfigRecord[]>>;
};

export function SystemConfigsPanel({ moduleKey, configs, configDefs, onConfigsChange }: SystemConfigsPanelProps) {
  const [keyword, setKeyword] = useState("");
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const defMap = useMemo(() => new Map(configDefs.map((d) => [d.configKey, d])), [configDefs]);

  const filtered = useMemo(() => {
    const key = keyword.trim().toLowerCase();
    if (!key) return configs;
    return configs.filter((cfg) => {
      const def = defMap.get(cfg.configKey);
      return (
        cfg.configKey.toLowerCase().includes(key) ||
        (def?.labelZh || "").toLowerCase().includes(key) ||
        (def?.description || "").toLowerCase().includes(key)
      );
    });
  }, [configs, defMap, keyword]);

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
    <AdminFormCard title="配置项" description="按中文名称与说明维护参数；布尔/枚举类请用下拉，无需手输 true/false 等英文。">
      <AdminToolbarSearchField
        className="max-w-md"
        placeholder="搜索中文名、说明或键名…"
        value={keyword}
        onChange={setKeyword}
        onSubmit={() => undefined}
      />
      {filtered.length === 0 ? (
        <p className={adminHintClass}>当前模块「{moduleKey}」暂无配置项或未匹配搜索条件。</p>
      ) : (
        <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200/90 bg-white px-3">
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
