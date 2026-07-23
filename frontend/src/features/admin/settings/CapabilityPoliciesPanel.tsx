import type { CapabilityPolicyRecord } from "@/api/domains/notification.api";
import { patchCapabilityPolicy } from "@/api/domains/notification.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { adminHintClass, adminLabelClass } from "@/features/admin/adminFormUi";
import {
  APPLICANT_LIST_MODE_OPTIONS,
  ENABLED_OPTIONS,
  labelApplicantListMode,
  labelBizType,
  ROLE_LEVEL_OPTIONS,
} from "@/features/admin/settings/settingsLabels";
import toast from "react-hot-toast";

type CapabilityPoliciesPanelProps = {
  policies: CapabilityPolicyRecord[];
  onPoliciesChange: React.Dispatch<React.SetStateAction<CapabilityPolicyRecord[]>>;
};

export function CapabilityPoliciesPanel({ policies, onPoliciesChange }: CapabilityPoliciesPanelProps) {
  const savePolicy = async (row: CapabilityPolicyRecord) => {
    try {
      await patchCapabilityPolicy(row.bizDomain, {
        minRoleSubmit: row.minRoleSubmit,
        minRoleProcess: row.minRoleProcess,
        minRoleViewAllPending: row.minRoleViewAllPending,
        applicantListMode: row.applicantListMode,
        enabled: row.enabled,
        extensionJson: row.extensionJson ?? undefined,
      });
      // 保存后仅合并当前策略行，禁止整表 load（post-save-no-full-refresh.mdc）
      onPoliciesChange((prev) =>
        prev.map((x) =>
          x.bizDomain === row.bizDomain ? { ...x, policyVersion: (x.policyVersion || 0) + 1 } : x,
        ),
      );
      toast.success("策略已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  if (policies.length === 0) {
    return (
      <AdminFormCard title="业务能力策略">
        <p className={adminHintClass}>暂无策略数据。</p>
      </AdminFormCard>
    );
  }

  return (
    <div className="space-y-4">
      {policies.map((row) => (
        <AdminFormCard
          key={row.bizDomain}
          title={labelBizType(row.bizDomain)}
          description={`业务域 ${row.bizDomain} · 版本 ${row.policyVersion}`}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className={adminLabelClass}>提交最低角色</span>
              <AdminSelect
                value={String(row.minRoleSubmit)}
                onChange={(e) =>
                  onPoliciesChange((prev) =>
                    prev.map((x) => (x.bizDomain === row.bizDomain ? { ...x, minRoleSubmit: Number(e.target.value) } : x)),
                  )
                }
              >
                {ROLE_LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </label>
            <label className="flex flex-col gap-1">
              <span className={adminLabelClass}>处理最低角色</span>
              <AdminSelect
                value={String(row.minRoleProcess)}
                onChange={(e) =>
                  onPoliciesChange((prev) =>
                    prev.map((x) => (x.bizDomain === row.bizDomain ? { ...x, minRoleProcess: Number(e.target.value) } : x)),
                  )
                }
              >
                {ROLE_LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </label>
            <label className="flex flex-col gap-1">
              <span className={adminLabelClass}>查看全部待办</span>
              <AdminSelect
                value={String(row.minRoleViewAllPending)}
                onChange={(e) =>
                  onPoliciesChange((prev) =>
                    prev.map((x) =>
                      x.bizDomain === row.bizDomain ? { ...x, minRoleViewAllPending: Number(e.target.value) } : x,
                    ),
                  )
                }
              >
                {ROLE_LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </label>
            <label className="flex flex-col gap-1">
              <span className={adminLabelClass}>申请人列表</span>
              <AdminSelect
                value={row.applicantListMode}
                onChange={(e) =>
                  onPoliciesChange((prev) =>
                    prev.map((x) => (x.bizDomain === row.bizDomain ? { ...x, applicantListMode: e.target.value } : x)),
                  )
                }
              >
                {APPLICANT_LIST_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
              <span className={adminHintClass}>{labelApplicantListMode(row.applicantListMode)}</span>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
            <label className="inline-flex items-center gap-2 text-sm text-neutral-800">
              <span className={adminLabelClass}>启用</span>
              <AdminSelect
                value={row.enabled === 1 ? "1" : "0"}
                onChange={(e) =>
                  onPoliciesChange((prev) =>
                    prev.map((x) => (x.bizDomain === row.bizDomain ? { ...x, enabled: Number(e.target.value) } : x)),
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
            <AdminButton type="button" tone="primary" size="sm" onClick={() => void savePolicy(row)}>
              保存本业务策略
            </AdminButton>
          </div>
        </AdminFormCard>
      ))}
      <p className={adminHintClass}>角色等级与小程序一致：{ROLE_LEVEL_OPTIONS.map((o) => `${o.value}=${o.label}`).join(" · ")}</p>
    </div>
  );
}
