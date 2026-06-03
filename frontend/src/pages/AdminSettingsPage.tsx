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
import { LlmSettingsPanel } from "@/features/admin/settings/LlmSettingsPanel";
import { NotificationRulesPanel } from "@/features/admin/settings/NotificationRulesPanel";
import { NotificationTemplatesPanel } from "@/features/admin/settings/NotificationTemplatesPanel";
import { SettingsModuleNav } from "@/features/admin/settings/SettingsModuleNav";
import { SystemConfigsPanel } from "@/features/admin/settings/SystemConfigsPanel";
import { moduleDescription, moduleLabel } from "@/features/admin/settings/settingsLabels";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

// ── 模块类型分类（单一数据源，loadData 和 JSX 渲染共用） ──

type ModuleKind = "notification" | "capability" | "template" | "llm" | "credentials" | "config";

/** 特殊模块：不走通用 SystemConfigsPanel */
const SPECIAL_MODULES: Record<string, ModuleKind> = {
  notification: "notification",
  capability: "capability",
  template: "template",
  llm: "llm",
  credentials: "credentials",
  integration: "credentials",
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
    console.log(
      `%c[系统设置] %c切换到模块 %c"${activeModule}"%c · 类型: %c${kind}`,
      "color:#0070f3;font-weight:bold",
      "color:inherit",
      "color:#0070f3;font-weight:600",
      "color:inherit",
      "color:#10b981;font-weight:600",
    );

    setLoading(true);
    try {
      resetAll();

      switch (kind) {
        case "notification": {
          console.log("[系统设置] → 加载通知规则 + 模板目录");
          const [r, tpl] = await Promise.all([fetchNotificationRules(), fetchNotificationTemplates()]);
          setRules(r);
          setTemplateCatalog(tpl);
          console.log(`[系统设置] ✓ 通知规则 ${r.length} 条, 模板目录 ${tpl.length} 个`);
          break;
        }

        case "capability": {
          console.log("[系统设置] → 加载能力策略");
          const cp = await fetchCapabilityPolicies();
          setCapabilityPolicies(cp);
          console.log(`[系统设置] ✓ 能力策略 ${cp.length} 条`);
          break;
        }

        case "template": {
          console.log("[系统设置] → 加载通知模板 + 物资推送配置");
          const [t, sc, sd] = await Promise.all([
            fetchNotificationTemplates(),
            fetchSystemConfigs("supplies"),
            fetchConfigDefinitions("supplies"),
          ]);
          setTemplates(t);
          setTemplateCatalog(t);
          setSupplyPushConfigs(sc);
          setSupplyPushDefs(sd);
          console.log(`[系统设置] ✓ 模板 ${t.length} 个, 物资配置 ${sc.length} 条, 物资定义 ${sd.length} 条`);
          break;
        }

        case "llm": {
          console.log("[系统设置] → 加载 LLM 配置");
          const [c, d] = await Promise.all([fetchSystemConfigs("llm"), fetchConfigDefinitions("llm")]);
          setConfigs(c);
          setConfigDefs(d);
          console.log(`[系统设置] ✓ LLM 配置 ${c.length} 条, 定义 ${d.length} 条`);
          break;
        }

        case "credentials": {
          console.log(`[系统设置] → 加载 ${activeModule} 配置`);
          const [c, d] = await Promise.all([
            fetchSystemConfigs(activeModule),
            fetchConfigDefinitions(activeModule),
          ]);
          setConfigs(c);
          setConfigDefs(d);
          console.log(`[系统设置] ✓ ${activeModule} 配置 ${c.length} 条, 定义 ${d.length} 条`);
          break;
        }

        case "config": {
          console.log(`[系统设置] → 加载通用配置模块 "${activeModule}"`);
          const [c, d] = await Promise.all([
            fetchSystemConfigs(activeModule),
            fetchConfigDefinitions(activeModule),
          ]);
          setConfigs(c);
          setConfigDefs(d);
          console.log(`[系统设置] ✓ 配置 ${c.length} 条, 定义 ${d.length} 条`);
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
        console.log(`[系统设置] 模块列表已加载: ${list.length} 个模块`, list.map((m) => m.key));
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
      console.log(`[系统设置] URL 参数切换模块 → "${m}"`);
      setActiveModule(m);
    }
  }, [searchParams, modules]);

  // ── 渲染 ──

  const kind = classifyModule(activeModule);
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
