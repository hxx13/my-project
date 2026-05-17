import { useState } from "react";
import toast from "react-hot-toast";
import type { SettingDefinitionRecord, SystemConfigRecord } from "@/api/domains/notification.api";
import { testLlmConnection } from "@/api/domains/notification.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { SystemConfigsPanel } from "@/features/admin/settings/SystemConfigsPanel";

type LlmSettingsPanelProps = {
  configs: SystemConfigRecord[];
  configDefs: SettingDefinitionRecord[];
  onConfigsChange: React.Dispatch<React.SetStateAction<SystemConfigRecord[]>>;
};

export function LlmSettingsPanel({ configs, configDefs, onConfigsChange }: LlmSettingsPanelProps) {
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await testLlmConnection();
      toast.success(`连接成功 · ${res.model} · ${(res.reply ?? "").slice(0, 48)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "连接失败");
    } finally {
      setTesting(false);
    }
  };

  return (
    <SystemConfigsPanel
      moduleKey="llm"
      configs={configs}
      configDefs={configDefs}
      onConfigsChange={onConfigsChange}
      toolbarExtra={
        <AdminButton type="button" tone="secondary" disabled={testing} onClick={() => void runTest()}>
          {testing ? "测试中…" : "测试 API 连接"}
        </AdminButton>
      }
    />
  );
}
