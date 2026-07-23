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
import { TurnstileInlineSection } from "@/features/admin/settings/TurnstileInlineSection";

/**
 * 「集成与凭证」设置子页面（AdminSettingsLayout 路由）。
 *
 * 🔧 维护约定：新增外部集成/凭证类模块时，先写一个自包含的 InlineSection 组件
 *（参考 TurnstileInlineSection），然后在此页面插入即可。InlineSection 自行调用
 * fetchSystemConfigs + fetchConfigDefinitions，父组件无需传参。
 *
 * 当前模块：
 *  1. AI / LLM (DeepSeek)
 *  2. 外部系统凭证（大华 / ARO）
 *  3. Turnstile 人机验证
 *  4. 集成与语音播报 (WinCC / CosyVoice)
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

      {/* Turnstile 人机验证 — 内联渲染，不依赖侧栏导航 */}
      <TurnstileInlineSection />

      <AdminFormCard
        title="集成与语音播报"
        description="WinCC 连接参数、扫码语音播报中枢开关等外部集成与运维配置。"
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
