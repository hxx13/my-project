import { useEffect, useState } from "react";
import type { JSX } from "react";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import {
  getScanPopupAnnouncementSettings,
  saveScanPopupAnnouncementSettings,
  UNBOUND_APPLY_ROLE_OPTIONS,
  type UnboundApplyRoleCode,
} from "@/api/domains/scanPopupAnnouncement.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { SCAN_OPERATOR_ROLE_HINT_ANNOUNCEMENT, SCAN_OPERATOR_ROLE_LABEL } from "@/features/admin/scanOperatorRoleHint";
import { EditorInspectorLayout } from "../shared/EditorInspectorLayout";
import { InspectorGroup, InspectorRow } from "../shared/InspectorGroup";
import { MultiSelectField } from "../shared/MultiSelectField";
import type { MultiSelectOption } from "../shared/multiSelectModel";

const ROLE_OPTIONS: MultiSelectOption<UnboundApplyRoleCode>[] = UNBOUND_APPLY_ROLE_OPTIONS.map((o) => ({
  value: o.code,
  label: o.label,
}));

export function AnnouncementSettingsView({ onBack }: { onBack: () => void }): JSX.Element {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["scanPopupAnnouncementSettings"],
    queryFn: getScanPopupAnnouncementSettings,
  });
  const [enabled, setEnabled] = useState(true);
  const [showEvery, setShowEvery] = useState(true);
  const [roles, setRoles] = useState<UnboundApplyRoleCode[]>(["MEMBER"]);
  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setShowEvery(settings.showNoticeEveryScan);
      setRoles(settings.applyRoleCodes);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: saveScanPopupAnnouncementSettings,
    onSuccess: (saved) => {
      qc.setQueryData(["scanPopupAnnouncementSettings"], saved);
      toast.success("显示设置已保存");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const canvas = (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-[var(--app-color-text-primary)]">扫码公告显示设置</h2>
      <p className="text-xs text-[var(--app-color-text-secondary)]">
        控制扫码弹窗公告的整体开关、每次扫码自动展开行为与生效账号角色。
      </p>
    </div>
  );
  const inspector = (
    <>
      <InspectorGroup title="启用控制">
        <InspectorRow label="启用扫码公告">
          {(id) => <AdminSwitchScaled size="sm" id={id} checked={enabled} onChange={setEnabled} />}
        </InspectorRow>
        <InspectorRow label="每次扫码自动展开">
          {(id) => <AdminSwitchScaled size="sm" id={id} checked={showEvery} onChange={setShowEvery} />}
        </InspectorRow>
      </InspectorGroup>
      <InspectorGroup title={SCAN_OPERATOR_ROLE_LABEL}>
        <InspectorRow stack label="生效角色" hint={SCAN_OPERATOR_ROLE_HINT_ANNOUNCEMENT}>
          {(id) => (
            <MultiSelectField
              id={id}
              options={ROLE_OPTIONS}
              value={roles}
              onChange={(next) => setRoles(next.length ? next : ["MEMBER"])}
              maxChips={ROLE_OPTIONS.length}
              disabled={isLoading}
            />
          )}
        </InspectorRow>
      </InspectorGroup>
    </>
  );
  const footer = (
    <div className="flex justify-end gap-2">
      <AdminButton type="button" tone="secondary" onClick={onBack}>
        返回列表
      </AdminButton>
      <AdminButton
        type="button"
        tone="primary"
        loading={saveMutation.isPending}
        disabled={isLoading}
        onClick={() => saveMutation.mutate({ enabled, showNoticeEveryScan: showEvery, applyRoleCodes: roles })}
      >
        <Save className="mr-1 h-4 w-4" /> 保存配置
      </AdminButton>
    </div>
  );
  return <EditorInspectorLayout canvas={canvas} inspector={inspector} footer={footer} />;
}
