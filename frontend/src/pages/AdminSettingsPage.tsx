import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Settings } from "lucide-react";
import {
  fetchCapabilityPolicies,
  fetchConfigDefinitions,
  fetchNotificationRules,
  fetchNotificationTemplates,
  fetchSettingsModules,
  fetchSystemConfigs,
  type CapabilityPolicyRecord,
  type NotifyRuleRecord,
  type NotifyTemplateRecord,
  type SettingDefinitionRecord,
  type SystemConfigRecord,
} from "@/api/domains/notification.api";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { CapabilityPoliciesPanel } from "@/features/admin/settings/CapabilityPoliciesPanel";
import { ClientReloadOpsPanel } from "@/features/admin/settings/ClientReloadOpsPanel";
import { LlmSettingsPanel } from "@/features/admin/settings/LlmSettingsPanel";
import { NotificationRulesPanel } from "@/features/admin/settings/NotificationRulesPanel";
import { NotificationTemplatesPanel } from "@/features/admin/settings/NotificationTemplatesPanel";
import { SettingsModuleNav } from "@/features/admin/settings/SettingsModuleNav";
import { SystemConfigsPanel } from "@/features/admin/settings/SystemConfigsPanel";
import { moduleDescription, moduleLabel } from "@/features/admin/settings/settingsLabels";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

const CONFIG_MODULES = new Set([
  "dashboard_codex",
  "telemetry_facility",
  "supplies",
  "mini_program",
  "frontend_runtime",
  "network",
  "system",
  "scanner",
]);

function isConfigModule(key: string) {
  return CONFIG_MODULES.has(key) || (!["notification", "template", "capability"].includes(key) && key.length > 0);
}

export default function AdminSettingsPage() {
  const canBroadcastClientReload = hasMinRole(authStorage.getRole(), "SUPER_ADMIN");
  const [searchParams] = useSearchParams();
  const [modules, setModules] = useState<Array<{ key: string; label: string }>>([]);
  const [activeModule, setActiveModule] = useState("notification");
  const [loading, setLoading] = useState(false);

  const [rules, setRules] = useState<NotifyRuleRecord[]>([]);
  const [templates, setTemplates] = useState<NotifyTemplateRecord[]>([]);
  const [templateCatalog, setTemplateCatalog] = useState<NotifyTemplateRecord[]>([]);
  const [configs, setConfigs] = useState<SystemConfigRecord[]>([]);
  const [configDefs, setConfigDefs] = useState<SettingDefinitionRecord[]>([]);
  const [supplyPushConfigs, setSupplyPushConfigs] = useState<SystemConfigRecord[]>([]);
  const [supplyPushDefs, setSupplyPushDefs] = useState<SettingDefinitionRecord[]>([]);
  const [capabilityPolicies, setCapabilityPolicies] = useState<CapabilityPolicyRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeModule === "notification") {
        const [r, tpl] = await Promise.all([fetchNotificationRules(), fetchNotificationTemplates()]);
        setRules(r);
        setTemplateCatalog(tpl);
        setTemplates([]);
        setConfigs([]);
        setConfigDefs([]);
        setSupplyPushConfigs([]);
        setSupplyPushDefs([]);
        setCapabilityPolicies([]);
      } else if (activeModule === "capability") {
        const cp = await fetchCapabilityPolicies();
        setCapabilityPolicies(cp);
        setRules([]);
        setTemplates([]);
        setTemplateCatalog([]);
        setConfigs([]);
        setConfigDefs([]);
        setSupplyPushConfigs([]);
        setSupplyPushDefs([]);
      } else if (activeModule === "template") {
        const [t, sc, sd] = await Promise.all([
          fetchNotificationTemplates(),
          fetchSystemConfigs("supplies"),
          fetchConfigDefinitions("supplies"),
        ]);
        setTemplates(t);
        setTemplateCatalog(t);
        setSupplyPushConfigs(sc);
        setSupplyPushDefs(sd);
        setRules([]);
        setConfigs([]);
        setConfigDefs([]);
        setCapabilityPolicies([]);
      } else if (activeModule === "llm" || isConfigModule(activeModule)) {
        const [c, d] = await Promise.all([fetchSystemConfigs(activeModule), fetchConfigDefinitions(activeModule)]);
        setConfigs(c);
        setConfigDefs(d);
        setRules([]);
        setTemplates([]);
        setTemplateCatalog([]);
        setSupplyPushConfigs([]);
        setSupplyPushDefs([]);
        setCapabilityPolicies([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载设置失败");
    } finally {
      setLoading(false);
    }
  }, [activeModule]);

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchSettingsModules();
        setModules(list);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "加载模块列表失败");
      }
    })();
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const m = (searchParams.get("module") || "").trim();
    if (!m || modules.length === 0) return;
    if (modules.some((x) => x.key === m)) setActiveModule(m);
  }, [searchParams, modules]);

  const activeTitle = moduleLabel(modules, activeModule);

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <Settings className="h-6 w-6 shrink-0 text-[#0070f3]" aria-hidden />
          系统设置
        </span>
      }
      description="左侧选择模块分类，右侧编辑具体配置。枚举与模板请用下拉，无需手输英文代码。"
      actions={canBroadcastClientReload ? <ClientReloadOpsPanel /> : undefined}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <SettingsModuleNav modules={modules} activeModule={activeModule} onChange={setActiveModule} />

        <div className="min-w-0 flex-1 space-y-4">
          <div className="hidden border-b border-neutral-100 pb-3 lg:block">
            <h3 className="text-base font-semibold text-neutral-900">{activeTitle}</h3>
            <p className="mt-1 text-sm text-neutral-600">{moduleDescription(activeModule)}</p>
          </div>

          {loading ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-neutral-200 bg-white text-sm text-neutral-500">
              加载中…
            </div>
          ) : null}

          {!loading && activeModule === "notification" ? (
            <NotificationRulesPanel rules={rules} templates={templateCatalog} onRulesChange={setRules} />
          ) : null}

          {!loading && activeModule === "capability" ? (
            <CapabilityPoliciesPanel policies={capabilityPolicies} onPoliciesChange={setCapabilityPolicies} />
          ) : null}

          {!loading && activeModule === "template" ? (
            <NotificationTemplatesPanel
              templates={templates}
              supplyPushConfigs={supplyPushConfigs}
              supplyPushDefs={supplyPushDefs}
              onTemplatesChange={setTemplates}
              onSupplyConfigsChange={setSupplyPushConfigs}
            />
          ) : null}

          {!loading && activeModule === "llm" ? (
            <LlmSettingsPanel configs={configs} configDefs={configDefs} onConfigsChange={setConfigs} />
          ) : null}

          {!loading && isConfigModule(activeModule) && activeModule !== "llm" ? (
            <SystemConfigsPanel
              moduleKey={activeModule}
              configs={configs}
              configDefs={configDefs}
              onConfigsChange={setConfigs}
            />
          ) : null}
        </div>
      </div>
    </AdminPageShell>
  );
}
