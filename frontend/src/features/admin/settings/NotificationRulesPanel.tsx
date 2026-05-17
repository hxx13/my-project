import type { NotifyRuleRecord, NotifyTemplateRecord } from "@/api/domains/notification.api";
import { updateNotificationRule } from "@/api/domains/notification.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { adminHintClass, adminLabelClass } from "@/features/admin/adminFormUi";
import {
  ENABLED_OPTIONS,
  labelBizType,
  labelEventType,
  labelTemplateKey,
  RECIPIENT_MODE_OPTIONS,
  ROLE_LEVEL_OPTIONS,
} from "@/features/admin/settings/settingsLabels";
import toast from "react-hot-toast";

type NotificationRulesPanelProps = {
  rules: NotifyRuleRecord[];
  templates: NotifyTemplateRecord[];
  onRulesChange: React.Dispatch<React.SetStateAction<NotifyRuleRecord[]>>;
};

export function NotificationRulesPanel({ rules, templates, onRulesChange }: NotificationRulesPanelProps) {
  const templateOptions = templates.length
    ? templates
    : Array.from(new Set(rules.map((r) => r.templateKey).filter(Boolean))).map((templateKey) => ({
        id: 0,
        templateKey,
        titleTpl: "",
        contentTpl: "",
        enabled: 1,
      }));

  const saveRule = async (rule: NotifyRuleRecord) => {
    try {
      await updateNotificationRule(rule.id, rule);
      // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
      toast.success("规则已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  return (
    <AdminFormCard title="通知规则" description="按业务与事件配置是否发送通知；模板与最低角色请从下拉选择，无需手输英文。">
      {rules.length === 0 ? (
        <p className={adminHintClass}>当前暂无通知规则。</p>
      ) : (
        <AdminTableShell empty={false}>
          <div className="min-w-[720px]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs text-neutral-500">
                  <th className="px-3 py-2 font-medium">业务 · 事件</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium">接收策略</th>
                  <th className="px-3 py-2 font-medium">最低角色</th>
                  <th className="px-3 py-2 font-medium">通知模板</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b border-neutral-100 align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-neutral-900">
                        {labelBizType(rule.bizType)} · {labelEventType(rule.eventType)}
                      </div>
                      <p className={adminHintClass}>
                        {rule.bizType}.{rule.eventType}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <AdminSelect
                        value={rule.enabled === 1 ? "1" : "0"}
                        onChange={(e) =>
                          onRulesChange((prev) =>
                            prev.map((x) => (x.id === rule.id ? { ...x, enabled: Number(e.target.value) } : x)),
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
                    </td>
                    <td className="px-3 py-3">
                      <AdminSelect
                        value={rule.recipientMode}
                        onChange={(e) =>
                          onRulesChange((prev) =>
                            prev.map((x) => (x.id === rule.id ? { ...x, recipientMode: e.target.value } : x)),
                          )
                        }
                        className="min-w-[10rem]"
                      >
                        {RECIPIENT_MODE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </AdminSelect>
                    </td>
                    <td className="px-3 py-3">
                      <AdminSelect
                        value={String(rule.minRoleLevel)}
                        onChange={(e) =>
                          onRulesChange((prev) =>
                            prev.map((x) => (x.id === rule.id ? { ...x, minRoleLevel: Number(e.target.value) } : x)),
                          )
                        }
                        className="min-w-[8rem]"
                      >
                        {ROLE_LEVEL_OPTIONS.map((o) => (
                          <option key={o.value} value={String(o.value)}>
                            {o.label}
                          </option>
                        ))}
                      </AdminSelect>
                    </td>
                    <td className="px-3 py-3">
                      <label className="flex flex-col gap-1">
                        <span className={adminLabelClass}>模板</span>
                        <AdminSelect
                          value={rule.templateKey}
                          onChange={(e) =>
                            onRulesChange((prev) =>
                              prev.map((x) => (x.id === rule.id ? { ...x, templateKey: e.target.value } : x)),
                            )
                          }
                          className="min-w-[11rem]"
                        >
                          {templateOptions.map((t) => (
                            <option key={t.templateKey} value={t.templateKey}>
                              {labelTemplateKey(t.templateKey)}
                            </option>
                          ))}
                        </AdminSelect>
                      </label>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <AdminButton type="button" tone="primary" size="sm" onClick={() => void saveRule(rule)}>
                        保存
                      </AdminButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminTableShell>
      )}
      <p className={adminHintClass}>
        物资领用与采购/报修共用本表。SUPPLIES 类模板请在「通知模板」模块编辑；额外接收人 ID 在同页「物资领用推送」配置。
      </p>
    </AdminFormCard>
  );
}
