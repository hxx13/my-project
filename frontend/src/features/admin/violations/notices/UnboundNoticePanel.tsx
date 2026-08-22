import { useCallback, useEffect, useState } from "react";
import type { JSX } from "react";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import {
  getUnboundCardNoticeSettings,
  saveUnboundCardNoticeSettings,
  UNBOUND_APPLY_ROLE_OPTIONS,
  type UnboundApplyRoleCode,
} from "@/api/domains/studentViolation.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { SCAN_OPERATOR_ROLE_HINT_UNBOUND } from "@/features/admin/scanOperatorRoleHint";
import { EditorInspectorLayout } from "../shared/EditorInspectorLayout";
import { InspectorGroup, InspectorRow } from "../shared/InspectorGroup";
import { MultiSelectField } from "../shared/MultiSelectField";
import type { MultiSelectOption } from "../shared/multiSelectModel";
import { violationContentTemplateSlot } from "../shared/violationContentTemplateSlot";
import {
  ContentBodySlot,
  contentBodyFromHtml,
  serializeContentBody,
  type ContentBodyValue,
} from "../slots/ContentBodySlot";

/** 三个行为开关合并为一个多选，提交时再展开成后端的布尔字段。 */
type BehaviorValue = "on" | "expand" | "forbid";

const BEHAVIOR_OPTIONS: MultiSelectOption<BehaviorValue>[] = [
  { value: "on", label: "启用提示" },
  { value: "expand", label: "每次扫码自动展开" },
  { value: "forbid", label: "禁止扫码进入", desc: "未绑卡时禁止扫码进入，离开不受影响", tone: "danger" },
];

const ROLE_OPTIONS: MultiSelectOption<UnboundApplyRoleCode>[] = UNBOUND_APPLY_ROLE_OPTIONS.map(
  (o) => ({ value: o.code, label: o.label })
);

/**
 * 「未绑卡提示」面板（自包含：自己查、自己存、自己 toast）。
 * 高度链由 EditorInspectorLayout 独占，本组件不注入 h-* / min-h-* / overflow-*。
 */
export function UnboundNoticePanel(): JSX.Element {
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["unboundCardNoticeSettings"],
    queryFn: getUnboundCardNoticeSettings,
  });

  const [body, setBody] = useState<ContentBodyValue>(() => contentBodyFromHtml(null, null));
  const [behaviors, setBehaviors] = useState<BehaviorValue[]>(["on", "expand"]);
  const [roles, setRoles] = useState<UnboundApplyRoleCode[]>(["MEMBER"]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const next: BehaviorValue[] = [];
    if (settings.enabled) next.push("on");
    if (settings.showNoticeEveryScan) next.push("expand");
    if (settings.forbidEnter) next.push("forbid");
    setBehaviors(next);
    setRoles(settings.applyRoleCodes ?? ["MEMBER"]);
    setBody(contentBodyFromHtml(settings.violationText, settings.imageUrls));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: saveUnboundCardNoticeSettings,
    onSuccess: (saved) => {
      qc.setQueryData(["unboundCardNoticeSettings"], saved);
      toast.success("未绑卡提示已保存");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const uploadImages = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) {
      toast.error("未识别到图片");
      return;
    }
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of imgs) {
        urls.push((await uploadSingleImage(f)).publicUrl);
      }
      setBody((prev) => ({ ...prev, imageUrls: [...prev.imageUrls, ...urls] }));
      toast.success(`已上传 ${urls.length} 张`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }, []);

  const handlePickFiles = useCallback(
    (files: FileList | null) => {
      if (files?.length) void uploadImages(Array.from(files));
    },
    [uploadImages]
  );

  const handleRolesChange = (next: UnboundApplyRoleCode[]) => {
    // 至少保留一个角色，与旧版「全不勾选回退 MEMBER」语义一致。
    setRoles(next.length ? next : ["MEMBER"]);
  };

  const handleSave = () => {
    const { html, imageUrls } = serializeContentBody(body);
    saveMutation.mutate({
      enabled: behaviors.includes("on"),
      showNoticeEveryScan: behaviors.includes("expand"),
      forbidEnter: behaviors.includes("forbid"),
      applyRoleCodes: roles,
      violationText: html,
      imageUrls,
    });
  };

  const canvas = (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--app-color-text-primary)]">
          未绑卡扫码提示
        </h2>
        <p className="mt-1 text-xs text-[var(--app-color-text-secondary)]">
          扫描到尚未绑定物理卡的人员时展示警示；按当前登录扫码操作员角色决定是否生效（与被扫人员身份无关）。
        </p>
      </div>
      {isLoading ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] text-sm text-[var(--app-color-text-tertiary)]">
          加载正文…
        </div>
      ) : (
        <ContentBodySlot
          key="unbound-notice-body"
          value={body}
          onChange={setBody}
          uploading={uploading}
          onPickFiles={handlePickFiles}
          disabled={!behaviors.includes("on")}
          templateSlot={violationContentTemplateSlot(body, setBody)}
        />
      )}
    </div>
  );

  const inspector = (
    <InspectorGroup title="生效">
      <InspectorRow stack label="生效角色" hint={SCAN_OPERATOR_ROLE_HINT_UNBOUND}>
        {(controlId) => (
          <MultiSelectField
            id={controlId}
            options={ROLE_OPTIONS}
            value={roles}
            onChange={handleRolesChange}
            maxChips={ROLE_OPTIONS.length}
            disabled={isLoading || !behaviors.includes("on")}
          />
        )}
      </InspectorRow>
      <InspectorRow stack label="提示行为">
        {(controlId) => (
          <MultiSelectField
            id={controlId}
            options={BEHAVIOR_OPTIONS}
            value={behaviors}
            onChange={setBehaviors}
            maxChips={BEHAVIOR_OPTIONS.length}
            disabled={isLoading}
          />
        )}
      </InspectorRow>
    </InspectorGroup>
  );

  const footer = (
    <div className="flex justify-end">
      <AdminButton
        type="button"
        tone="primary"
        loading={saveMutation.isPending}
        disabled={isLoading}
        onClick={handleSave}
      >
        <Save className="h-3.5 w-3.5 mr-1" />
        保存未绑卡提示
      </AdminButton>
    </div>
  );

  return <EditorInspectorLayout canvas={canvas} inspector={inspector} footer={footer} />;
}
