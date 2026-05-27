import { useState } from "react";
import toast from "react-hot-toast";
import type { SettingDefinitionRecord, SystemConfigRecord } from "@/api/domains/notification.api";
import { testAroConnection, testDahuaConnection, testWinccConnection } from "@/api/domains/notification.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { SystemConfigsPanel } from "@/features/admin/settings/SystemConfigsPanel";

type CredentialsTestPanelProps = {
  moduleKey: string;
  configs: SystemConfigRecord[];
  configDefs: SettingDefinitionRecord[];
  onConfigsChange: React.Dispatch<React.SetStateAction<SystemConfigRecord[]>>;
};

export function CredentialsTestPanel({ moduleKey, configs, configDefs, onConfigsChange }: CredentialsTestPanelProps) {
  const [testingDahua, setTestingDahua] = useState(false);
  const [testingAro, setTestingAro] = useState(false);
  const [testingWincc, setTestingWincc] = useState(false);

  const runDahuaTest = async () => {
    setTestingDahua(true);
    try {
      const res = await testDahuaConnection();
      if (res.ok) {
        toast.success(`大华连接成功 · ${res.baseUrl ?? ""}`);
      } else {
        toast.error(`大华连接失败: ${res.error ?? "未知错误"}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "大华连接失败");
    } finally {
      setTestingDahua(false);
    }
  };

  const runAroTest = async () => {
    setTestingAro(true);
    try {
      const res = await testAroConnection();
      if (res.ok) {
        toast.success("ARO 连接成功");
      } else {
        toast.error(`ARO 连接失败: ${res.error ?? "未知错误"}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ARO 连接失败");
    } finally {
      setTestingAro(false);
    }
  };

  const runWinccTest = async () => {
    setTestingWincc(true);
    try {
      const res = await testWinccConnection();
      if (res.ok) {
        toast.success("WinCC 连接成功");
      } else {
        toast.error(`WinCC 连接失败: ${res.error ?? "未知错误"}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "WinCC 连接失败");
    } finally {
      setTestingWincc(false);
    }
  };

  const toolbarExtra = (
    <div className="flex flex-wrap gap-2">
      {moduleKey === "credentials" && (
        <>
          <AdminButton type="button" tone="secondary" disabled={testingDahua} onClick={() => void runDahuaTest()}>
            {testingDahua ? "测试中…" : "测试大华"}
          </AdminButton>
          <AdminButton type="button" tone="secondary" disabled={testingAro} onClick={() => void runAroTest()}>
            {testingAro ? "测试中…" : "测试 ARO"}
          </AdminButton>
        </>
      )}
      {moduleKey === "integration" && (
        <AdminButton type="button" tone="secondary" disabled={testingWincc} onClick={() => void runWinccTest()}>
          {testingWincc ? "测试中…" : "测试 WinCC"}
        </AdminButton>
      )}
    </div>
  );

  return (
    <SystemConfigsPanel
      moduleKey={moduleKey}
      configs={configs}
      configDefs={configDefs}
      onConfigsChange={onConfigsChange}
      toolbarExtra={toolbarExtra}
    />
  );
}
