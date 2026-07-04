import { useState, useEffect } from "react";
import {
  fetchSystemConfigs,
  fetchConfigDefinitions,
  type SystemConfigRecord,
  type SettingDefinitionRecord,
} from "@/api/domains/notification.api";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { LlmSettingsPanel } from "@/features/admin/settings/LlmSettingsPanel";
import { CredentialsTestPanel } from "@/features/admin/settings/CredentialsTestPanel";

/**
 * IntegrationsSettings sub-page for AdminSettingsLayout.
 * Merges three config modules into one view:
 * 1. AI / LLM (DeepSeek 模型预设与连接)
 * 2. External system credentials (Dahua + ARO)
 * 3. WinCC integration
 */
export default function IntegrationsSettings() {
  const [llmConfigs, setLlmConfigs] = useState<SystemConfigRecord[]>([]);
  const [llmDefs, setLlmDefs] = useState<SettingDefinitionRecord[]>([]);

  const [credConfigs, setCredConfigs] = useState<SystemConfigRecord[]>([]);
  const [credDefs, setCredDefs] = useState<SettingDefinitionRecord[]>([]);

  const [intConfigs, setIntConfigs] = useState<SystemConfigRecord[]>([]);
  const [intDefs, setIntDefs] = useState<SettingDefinitionRecord[]>([]);

  useEffect(() => {
    void (async () => {
      const [llmCfg, llmDf, credCfg, credDf, intCfg, intDf] = await Promise.all([
        fetchSystemConfigs("llm"),
        fetchConfigDefinitions("llm"),
        fetchSystemConfigs("credentials"),
        fetchConfigDefinitions("credentials"),
        fetchSystemConfigs("integration"),
        fetchConfigDefinitions("integration"),
      ]);
      setLlmConfigs(llmCfg);
      setLlmDefs(llmDf);
      setCredConfigs(credCfg);
      setCredDefs(credDf);
      setIntConfigs(intCfg);
      setIntDefs(intDf);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <AdminFormCard
        title="AI 大模型"
        description="DeepSeek 大模型：预设卡片一键切换模型与参数；支持 API Key 配置与连接测试；可开启日批与清算时自动生成 AI 解读。"
      >
        <LlmSettingsPanel
          configs={llmConfigs}
          configDefs={llmDefs}
          onConfigsChange={setLlmConfigs}
        />
      </AdminFormCard>

      <AdminFormCard
        title="外部系统凭证（大华 / ARO）"
        description="大华摄像头和 ARO 系统的登录凭证与 API 密钥；敏感字段保存后不再明文展示。"
      >
        <CredentialsTestPanel
          moduleKey="credentials"
          configs={credConfigs}
          configDefs={credDefs}
          onConfigsChange={setCredConfigs}
        />
      </AdminFormCard>

      <AdminFormCard
        title="WinCC 集成"
        description="WinCC 连接参数、调试开关等外部集成与运维配置。"
      >
        <CredentialsTestPanel
          moduleKey="integration"
          configs={intConfigs}
          configDefs={intDefs}
          onConfigsChange={setIntConfigs}
        />
      </AdminFormCard>
    </div>
  );
}
