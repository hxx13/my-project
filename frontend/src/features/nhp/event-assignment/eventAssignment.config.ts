import type { NhpTemplateListItem } from "../api/nhpTemplate.api";
import type { NhpVisit } from "../api/nhpVisit.api";
import { assignableFormId, isCompositeTemplate } from "../api/nhpTemplate.api";
import type { AssignmentToolbarAction } from "./eventAssignment.types";

/** Page-level copy & navigation — extend here without touching render logic */
export const EVENT_ASSIGNMENT_PAGE = {
  title: "采集方案",
  subtitle: "行 = 表单 · 列 = 事件；勾选格子 = 该事件采集该表单。点行头/列头批量。",
  backLabel: "← 返回",
  backPath: "/content-manager/nhp-visits",
  panelTitle: "表单-事件指派矩阵",
  cornerLabel: "表单 \\ 事件",
  emptyForms: "暂无已发布表单。请先在「表单发布」页发布原子或组合模板。",
  emptyVisits: "暂无访视时点。请先在「访视 / 时点」页配置 TP 列表。",
  loading: "加载指派数据…",
  error: "加载失败，请刷新重试",
} as const;

/** Toolbar actions — data-driven button strip */
export function buildToolbarActions(opts: {
  isSaving: boolean;
  isDirty: boolean;
}): AssignmentToolbarAction[] {
  return [
    {
      id: "reset",
      label: "重置",
      variant: "ghost",
      disabled: opts.isSaving || !opts.isDirty,
    },
    {
      id: "save",
      label: "保存全部指派",
      pendingLabel: "保存中…",
      variant: "primary",
      disabled: opts.isSaving,
    },
  ];
}

/** Row label renderer config */
export function formRowMeta(form: NhpTemplateListItem) {
  const fid = assignableFormId(form);
  return {
    formId: fid,
    title: form.title || form.formKey,
    subtitle: `${isCompositeTemplate(form) ? "组合" : "原子"} · ${form.formKey}`,
    kind: isCompositeTemplate(form) ? ("composite" as const) : ("atom" as const),
    hostType: form.hostType ?? null,
  };
}

/** Column label renderer config */
export function visitColumnMeta(visit: NhpVisit) {
  return {
    visitId: visit.id,
    code: visit.code,
    name: visit.name || "—",
    title: `批量勾选 ${visit.code} 所有表单`,
  };
}
