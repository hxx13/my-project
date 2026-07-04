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
import { CredentialsTestPanel } from "@/features/admin/settings/CredentialsTestPanel";
import { FaceSettingsPanel } from "@/features/admin/settings/FaceSettingsPanel";
import { LlmSettingsPanel } from "@/features/admin/settings/LlmSettingsPanel";
import { NotificationRulesPanel } from "@/features/admin/settings/NotificationRulesPanel";
import { NotificationTemplatesPanel } from "@/features/admin/settings/NotificationTemplatesPanel";
import { SettingsModuleNav } from "@/features/admin/settings/SettingsModuleNav";
import { SystemConfigsPanel } from "@/features/admin/settings/SystemConfigsPanel";
import { moduleDescription, moduleLabel } from "@/features/admin/settings/settingsLabels";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

// ── 模块类型分类（单一数据源，loadData 和 JSX 渲染共用） ──

type ModuleKind = "notification" | "capability" | "template" | "llm" | "credentials" | "face" | "config";

/** 特殊模块：不走通用 SystemConfigsPanel */
const SPECIAL_MODULES: Record<string, ModuleKind> = {
  notification: "notification",
  capability: "capability",
  template: "template",
  llm: "llm",
  credentials: "credentials",
  integration: "credentials",
  face: "face",
};

function classifyModule(key: string): ModuleKind {
  const s = SPECIAL_MODULES[key];
  if (s) return s;
  // 其余全部按通用 config 模块处理（包括 dashboard_codex, telemetry_facility, supplies 等）
  return "config";
}

export default function AdminSettingsPage() {
  const canBroadcastClientReload = hasMinRole(authStorage.getRole(), "SUPER_ADMIN");
  const [searchParams] = useSearchParams();
  const [modules, setModules] = useState<Array<{ key: string; label: string }>>([]);
  const [activeModule, setActiveModule] = useState("notification");
  const [loading, setLoading] = useState(false);

  // 所有数据状态
  const [rules, setRules] = useState<NotifyRuleRecord[]>([]);
  const [templates, setTemplates] = useState<NotifyTemplateRecord[]>([]);
  const [templateCatalog, setTemplateCatalog] = useState<NotifyTemplateRecord[]>([]);
  const [configs, setConfigs] = useState<SystemConfigRecord[]>([]);
  const [configDefs, setConfigDefs] = useState<SettingDefinitionRecord[]>([]);
  const [supplyPushConfigs, setSupplyPushConfigs] = useState<SystemConfigRecord[]>([]);
  const [supplyPushDefs, setSupplyPushDefs] = useState<SettingDefinitionRecord[]>([]);
  const [capabilityPolicies, setCapabilityPolicies] = useState<CapabilityPolicyRecord[]>([]);

  /** 清空所有数据到初始状态 */
  const resetAll = useCallback(() => {
    setRules([]);
    setTemplates([]);
    setTemplateCatalog([]);
    setConfigs([]);
    setConfigDefs([]);
    setSupplyPushConfigs([]);
    setSupplyPushDefs([]);
    setCapabilityPolicies([]);
  }, []);

  // ── 按模块类型加载对应数据 ──

  const loadData = useCallback(async () => {
    const kind = classifyModule(activeModule);

    setLoading(true);
    try {
      resetAll();

      switch (kind) {
        case "notification": {
          const [r, tpl] = await Promise.all([fetchNotificationRules(), fetchNotificationTemplates()]);
          setRules(r);
          setTemplateCatalog(tpl);
          break;
        }

        case "capability": {
          const cp = await fetchCapabilityPolicies();
          setCapabilityPolicies(cp);
          break;
        }

        case "template": {
          const [t, sc, sd] = await Promise.all([
            fetchNotificationTemplates(),
            fetchSystemConfigs("supplies"),
            fetchConfigDefinitions("supplies"),
          ]);
          setTemplates(t);
          setTemplateCatalog(t);
          setSupplyPushConfigs(sc);
          setSupplyPushDefs(sd);
          break;
        }

        case "llm": {
          const [c, d] = await Promise.all([fetchSystemConfigs("llm"), fetchConfigDefinitions("llm")]);
          setConfigs(c);
          setConfigDefs(d);
          break;
        }

        case "credentials": {
          const [c, d] = await Promise.all([
            fetchSystemConfigs(activeModule),
            fetchConfigDefinitions(activeModule),
          ]);
          setConfigs(c);
          setConfigDefs(d);
          break;
        }

        case "face": {
          const [c, d] = await Promise.all([fetchSystemConfigs("face"), fetchConfigDefinitions("face")]);
          setConfigs(c);
          setConfigDefs(d);
          break;
        }

        case "config": {
          const [c, d] = await Promise.all([
            fetchSystemConfigs(activeModule),
            fetchConfigDefinitions(activeModule),
          ]);
          setConfigs(c);
          setConfigDefs(d);
          break;
        }
      }
    } catch (error) {
      console.error(`[系统设置] ✗ 加载模块 "${activeModule}" 失败:`, error);
      toast.error(error instanceof Error ? error.message : "加载设置失败");
    } finally {
      setLoading(false);
    }
  }, [activeModule, resetAll]);

  // ── 初始化模块列表 ──

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchSettingsModules();
        setModules(list);
      } catch (error) {
        console.error("[系统设置] 加载模块列表失败:", error);
        toast.error(error instanceof Error ? error.message : "加载模块列表失败");
      }
    })();
  }, []);

  // ── 模块切换时重新加载 ──

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── URL 参数同步模块 ──

  useEffect(() => {
    const m = (searchParams.get("module") || "").trim();
    if (!m || modules.length === 0) return;
    if (modules.some((x) => x.key === m)) {
      setActiveModule(m);
    }
  }, [searchParams, modules]);

  // ── 渲染 ──

  const kind = classifyModule(activeModule);
  const activeTitle = moduleLabel(modules, activeModule);

  return (
    <AdminPageShell>
      <div className="flex items-center justify-between mb-1">
        <span className="inline-flex items-center gap-2">
          <Settings className="h-6 w-6 shrink-0 text-[#0070f3]" aria-hidden />
          <h2 className="text-lg font-semibold text-neutral-900">系统设置</h2>
        </span>
        {canBroadcastClientReload && <ClientReloadOpsPanel />}
      </div>
      <p className="text-sm text-neutral-600 mb-4">左侧选择模块分类，右侧编辑具体配置。枚举与模板请用下拉，无需手输英文代码。</p>

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
          ) : (
            <>
              {kind === "notification" && (
                <NotificationRulesPanel rules={rules} templates={templateCatalog} onRulesChange={setRules} />
              )}
              {kind === "capability" && (
                <CapabilityPoliciesPanel policies={capabilityPolicies} onPoliciesChange={setCapabilityPolicies} />
              )}
              {kind === "template" && (
                <NotificationTemplatesPanel
                  templates={templates}
                  supplyPushConfigs={supplyPushConfigs}
                  supplyPushDefs={supplyPushDefs}
                  onTemplatesChange={setTemplates}
                  onSupplyConfigsChange={setSupplyPushConfigs}
                />
              )}
              {kind === "llm" && (
                <LlmSettingsPanel configs={configs} configDefs={configDefs} onConfigsChange={setConfigs} />
              )}
              {kind === "credentials" && (
                <CredentialsTestPanel moduleKey={activeModule} configs={configs} configDefs={configDefs} onConfigsChange={setConfigs} />
              )}
              {kind === "face" && (
                <FaceSettingsPanel configs={configs} configDefs={configDefs} onConfigsChange={setConfigs} />
              )}
              {kind === "config" && (
                <SystemConfigsPanel
                  moduleKey={activeModule}
                  configs={configs}
                  configDefs={configDefs}
                  onConfigsChange={setConfigs}
                />
              )}
            </>
          )}
        </div>
      </div>
    </AdminPageShell>
  );
}
