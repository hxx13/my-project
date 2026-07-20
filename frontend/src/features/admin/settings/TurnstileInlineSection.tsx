import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import type { SettingDefinitionRecord, SystemConfigRecord } from "@/api/domains/notification.api";
import { fetchSystemConfigs, fetchConfigDefinitions } from "@/api/domains/notification.api";
import { SystemConfigsPanel } from "@/features/admin/settings/SystemConfigsPanel";

/**
 * 内联渲染 Turnstile 人机验证配置，不依赖侧栏导航。
 */
export function TurnstileInlineSection() {
  const [configs, setConfigs] = useState<SystemConfigRecord[]>([]);
  const [defs, setDefs] = useState<SettingDefinitionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [c, d] = await Promise.all([
          fetchSystemConfigs("turnstile"),
          fetchConfigDefinitions("turnstile"),
        ]);
        setConfigs(c);
        setDefs(d);
      } catch (e) {
        console.error("加载 Turnstile 配置失败:", e);
        toast.error("加载 Turnstile 配置失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return null;
  if (defs.length === 0) return null; // 种子未执行，静默隐藏

  return (
    <SystemConfigsPanel
      moduleKey="turnstile"
      configs={configs}
      configDefs={defs}
      onConfigsChange={setConfigs}
      title="Turnstile 人机验证"
      description="Cloudflare Turnstile 人机验证配置。启用后在登录页加载无感验证组件。"
    />
  );
}
