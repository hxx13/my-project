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
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { CapabilityPoliciesPanel } from "@/features/admin/settings/CapabilityPoliciesPanel";
import { NotificationRulesPanel } from "@/features/admin/settings/NotificationRulesPanel";
import { NotificationTemplatesPanel } from "@/features/admin/settings/NotificationTemplatesPanel";
import { SettingsModuleTabs } from "@/features/admin/settings/SettingsModuleTabs";
import { SystemConfigsPanel } from "@/features/admin/settings/SystemConfigsPanel";
import { ClientReloadOpsPanel } from "@/features/admin/settings/ClientReloadOpsPanel";
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
      } else if (isConfigModule(activeModule)) {
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

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <Settings className="h-6 w-6 shrink-0 text-[#0070f3]" aria-hidden />
          系统设置
        </span>
      }
      description="统一管理通知、业务能力与各模块运行参数。枚举与模板请通过下拉选择，无需手输英文代码。"
    >
      <AdminFormCard title="配置模块" description="选择要维护的设置分类。">
        <SettingsModuleTabs modules={modules} activeModule={activeModule} onChange={setActiveModule} />
      </AdminFormCard>

      {canBroadcastClientReload ? <ClientReloadOpsPanel /> : null}

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

      {!loading && isConfigModule(activeModule) ? (
        <SystemConfigsPanel
          moduleKey={activeModule}
          configs={configs}
          configDefs={configDefs}
          onConfigsChange={setConfigs}
        />
      ) : null}
    </AdminPageShell>
  );
}
