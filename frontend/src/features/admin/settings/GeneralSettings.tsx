import { useState, useEffect, useCallback } from "react";
import { SystemConfigsPanel } from "@/features/admin/settings/SystemConfigsPanel";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import {
  fetchSystemConfigs,
  fetchConfigDefinitions,
  type SystemConfigRecord,
  type SettingDefinitionRecord,
} from "@/api/domains/notification.api";

const GENERAL_MODULES = [
  { key: "system",           label: "系统参数",     desc: "通用系统级参数，如应用名称、版本标识等" },
  { key: "frontend_runtime", label: "前端运行时",   desc: "前端运行时开关与展示参数" },
  { key: "network",          label: "网络与接口",   desc: "网络与接口相关参数，如请求超时、重试策略" },
  { key: "logging",          label: "日志控制",     desc: "运行时控制台日志级别管理，修改即时生效，重启恢复默认" },
  { key: "scanner",          label: "扫码器配置",   desc: "扫码器相关系统配置" },
  { key: "material",         label: "素材审核配置", desc: "学生物资申领系统配置，控制需求建议入口开关等参数" },
];

function useModuleConfigs(moduleKey: string) {
  const [configs, setConfigs] = useState<SystemConfigRecord[]>([]);
  const [defs, setDefs] = useState<SettingDefinitionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, d] = await Promise.all([
        fetchSystemConfigs(moduleKey),
        fetchConfigDefinitions(moduleKey),
      ]);
      setConfigs(c);
      setDefs(d);
    } catch (e) {
      console.error(`Failed to load configs for ${moduleKey}:`, e);
    } finally {
      setLoading(false);
    }
  }, [moduleKey]);

  useEffect(() => { load(); }, [load]);

  return { configs, defs, setConfigs, loading, reload: load };
}

function ModuleConfigCard({ moduleKey, label, desc }: { moduleKey: string; label: string; desc: string }) {
  const { configs, defs, setConfigs, loading } = useModuleConfigs(moduleKey);

  if (loading) {
    return (
      <AdminFormCard title={label} description={desc}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-1/3 rounded bg-[var(--app-color-surface-hover)]" />
          <div className="h-3 w-2/3 rounded bg-[var(--app-color-surface-hover)]" />
          <div className="h-20 rounded bg-[var(--app-color-surface-hover)]" />
        </div>
      </AdminFormCard>
    );
  }

  return (
    <SystemConfigsPanel
      moduleKey={moduleKey}
      configs={configs}
      configDefs={defs}
      onConfigsChange={setConfigs}
      title={label}
      description={desc}
    />
  );
}

export default function GeneralSettings() {
  return (
    <div className="space-y-6">
      {GENERAL_MODULES.map((mod) => (
        <ModuleConfigCard key={mod.key} moduleKey={mod.key} label={mod.label} desc={mod.desc} />
      ))}
    </div>
  );
}
