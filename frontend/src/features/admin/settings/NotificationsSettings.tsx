import { useState, useEffect } from "react";
import {
  fetchNotificationRules,
  fetchNotificationTemplates,
  fetchCapabilityPolicies,
  fetchSystemConfigs,
  fetchConfigDefinitions,
  type NotifyRuleRecord,
  type NotifyTemplateRecord,
  type CapabilityPolicyRecord,
  type SystemConfigRecord,
  type SettingDefinitionRecord,
} from "@/api/domains/notification.api";
import { NotificationRulesPanel } from "@/features/admin/settings/NotificationRulesPanel";
import { CapabilityPoliciesPanel } from "@/features/admin/settings/CapabilityPoliciesPanel";
import { NotificationTemplatesPanel } from "@/features/admin/settings/NotificationTemplatesPanel";

export default function NotificationsSettings() {
  const [rules, setRules] = useState<NotifyRuleRecord[]>([]);
  const [templateCatalog, setTemplateCatalog] = useState<NotifyTemplateRecord[]>([]);
  const [policies, setPolicies] = useState<CapabilityPolicyRecord[]>([]);
  const [templates, setTemplates] = useState<NotifyTemplateRecord[]>([]);
  const [supplyConfigs, setSupplyConfigs] = useState<SystemConfigRecord[]>([]);
  const [supplyDefs, setSupplyDefs] = useState<SettingDefinitionRecord[]>([]);

  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [policiesLoaded, setPoliciesLoaded] = useState(false);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [rulesData, tplData] = await Promise.all([
          fetchNotificationRules(),
          fetchNotificationTemplates(),
        ]);
        setRules(rulesData);
        setTemplateCatalog(tplData);
        setTemplates(tplData);
      } catch (e) {
        console.error("Failed to load notification rules/templates", e);
      } finally {
        setRulesLoaded(true);
        setTemplatesLoaded(true);
      }
    })();

    (async () => {
      try {
        const policiesData = await fetchCapabilityPolicies();
        setPolicies(policiesData);
      } catch (e) {
        console.error("Failed to load capability policies", e);
      } finally {
        setPoliciesLoaded(true);
      }
    })();

    (async () => {
      try {
        const [cfgData, defsData] = await Promise.all([
          fetchSystemConfigs("supplies"),
          fetchConfigDefinitions("supplies"),
        ]);
        setSupplyConfigs(cfgData);
        setSupplyDefs(defsData);
      } catch (e) {
        console.error("Failed to load supply push configs", e);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      {rulesLoaded && (
        <NotificationRulesPanel
          rules={rules}
          templates={templateCatalog}
          onRulesChange={setRules}
        />
      )}

      {policiesLoaded && (
        <CapabilityPoliciesPanel
          policies={policies}
          onPoliciesChange={setPolicies}
        />
      )}

      {templatesLoaded && (
        <NotificationTemplatesPanel
          templates={templates}
          supplyPushConfigs={supplyConfigs}
          supplyPushDefs={supplyDefs}
          onTemplatesChange={setTemplates}
          onSupplyConfigsChange={setSupplyConfigs}
        />
      )}
    </div>
  );
}
