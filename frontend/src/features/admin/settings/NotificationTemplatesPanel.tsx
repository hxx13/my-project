import type { NotifyTemplateRecord, SettingDefinitionRecord, SystemConfigRecord } from "@/api/domains/notification.api";
import { updateNotificationTemplate, updateSystemConfig } from "@/api/domains/notification.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { adminHintClass, adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { ConfigFieldEditor, validateConfigValue } from "@/features/admin/settings/ConfigFieldEditor";
import { ENABLED_OPTIONS, labelTemplateKey } from "@/features/admin/settings/settingsLabels";
import toast from "react-hot-toast";
import { useState } from "react";

type NotificationTemplatesPanelProps = {
  templates: NotifyTemplateRecord[];
  supplyPushConfigs: SystemConfigRecord[];
  supplyPushDefs: SettingDefinitionRecord[];
  onTemplatesChange: React.Dispatch<React.SetStateAction<NotifyTemplateRecord[]>>;
  onSupplyConfigsChange: React.Dispatch<React.SetStateAction<SystemConfigRecord[]>>;
};

export function NotificationTemplatesPanel({
  templates,
  supplyPushConfigs,
  supplyPushDefs,
  onTemplatesChange,
  onSupplyConfigsChange,
}: NotificationTemplatesPanelProps) {
  const [showSupplySensitive, setShowSupplySensitive] = useState<Record<string, boolean>>({});
  const [savingTplId, setSavingTplId] = useState<number | null>(null);
  const [savingCfgId, setSavingCfgId] = useState<number | null>(null);

  const saveTemplate = async (tpl: NotifyTemplateRecord) => {
    setSavingTplId(tpl.id);
    try {
      await updateNotificationTemplate(tpl.id, tpl);
      // 保存后仅合并当前模板，禁止整表 load（post-save-no-full-refresh.mdc）
      toast.success("模板已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingTplId(null);
    }
  };

  const saveSupplyConfig = async (cfg: SystemConfigRecord) => {
    const def = supplyPushDefs.find((d) => d.configKey === cfg.configKey);
    if (!validateConfigValue(cfg.configValue || "", def?.valueType)) {
      toast.error(`配置值类型不正确，应为 ${def?.valueType || "STRING"}`);
      return;
    }
    setSavingCfgId(cfg.id);
    try {
      await updateSystemConfig(cfg.id, cfg);
      onSupplyConfigsChange((prev) => prev.map((x) => (x.id === cfg.id ? { ...cfg } : x)));
      toast.success("已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingCfgId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminFormCard title="通知模板" description="标题与正文支持变量占位；模板键为系统内置，不可修改。">
        {templates.length === 0 ? (
          <p className={adminHintClass}>暂无通知模板。</p>
        ) : (
          <div className="space-y-4">
            {templates.map((tpl) => (
              <div key={tpl.id} className="rounded-lg border border-neutral-200 bg-neutral-50/40 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{labelTemplateKey(tpl.templateKey)}</p>
                    <p className={adminHintClass}>键名 {tpl.templateKey}</p>
                  </div>
                  <label className="inline-flex items-center gap-2">
                    <span className={adminLabelClass}>状态</span>
                    <AdminSelect
                      value={tpl.enabled === 1 ? "1" : "0"}
                      onChange={(e) =>
                        onTemplatesChange((prev) =>
                          prev.map((x) => (x.id === tpl.id ? { ...x, enabled: Number(e.target.value) } : x)),
                        )
                      }
                      className="min-w-[5.5rem]"
                    >
                      {ENABLED_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </AdminSelect>
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className={adminLabelClass}>标题模板</span>
                  <input
                    className={adminInputClass}
                    value={tpl.titleTpl}
                    onChange={(e) =>
                      onTemplatesChange((prev) => prev.map((x) => (x.id === tpl.id ? { ...x, titleTpl: e.target.value } : x)))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={adminLabelClass}>正文模板</span>
                  <textarea
                    className={adminInputClass}
                    rows={4}
                    value={tpl.contentTpl}
                    onChange={(e) =>
                      onTemplatesChange((prev) => prev.map((x) => (x.id === tpl.id ? { ...x, contentTpl: e.target.value } : x)))
                    }
                  />
                </label>
                <p className={adminHintClass}>
                  可用变量示例：{"{orderId}"}、{"{bizId}"}、{"{applicantName}"}、{"{summary}"} 等（依业务而定）。
                </p>
                <div className="flex justify-end">
                  <AdminButton
                    type="button"
                    tone="primary"
                    size="sm"
                    disabled={savingTplId === tpl.id}
                    onClick={() => void saveTemplate(tpl)}
                  >
                    {savingTplId === tpl.id ? "保存中…" : "保存模板"}
                  </AdminButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminFormCard>

      <AdminFormCard
        title="物资领用推送"
        description="除下单人外，额外接收站内通知的系统用户 ID（sys_user.id），多个用英文逗号分隔。"
      >
        {supplyPushConfigs.length === 0 ? (
          <p className={adminHintClass}>暂无 supplies 模块配置，请确认数据库已初始化 sys_system_config_def。</p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {supplyPushConfigs.map((cfg) => {
              const def = supplyPushDefs.find((d) => d.configKey === cfg.configKey);
              return (
                <ConfigFieldEditor
                  key={cfg.id}
                  cfg={cfg}
                  def={def}
                  showSensitive={Boolean(showSupplySensitive[cfg.configKey])}
                  onToggleSensitive={() =>
                    setShowSupplySensitive((prev) => ({ ...prev, [cfg.configKey]: !prev[cfg.configKey] }))
                  }
                  onChange={(value) =>
                    onSupplyConfigsChange((prev) => prev.map((x) => (x.id === cfg.id ? { ...x, configValue: value } : x)))
                  }
                  onSave={() => saveSupplyConfig(cfg)}
                  saving={savingCfgId === cfg.id}
                />
              );
            })}
          </div>
        )}
      </AdminFormCard>
    </div>
  );
}
