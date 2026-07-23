/** 富文本文字色 / 高亮色块 — 使用语义 CSS 变量，亮暗主题自动适配 */

export type RichTextColorPreset = {
  id: string;
  label: string;
  /** null = 清除样式 */
  value: string | null;
};

export const RICH_TEXT_TEXT_COLOR_PRESETS: RichTextColorPreset[] = [
  { id: "default", label: "默认", value: null },
  { id: "primary", label: "正文", value: "var(--app-color-text-primary)" },
  { id: "secondary", label: "次要", value: "var(--app-color-text-secondary)" },
  { id: "accent", label: "强调", value: "var(--app-color-accent)" },
  { id: "success", label: "成功", value: "var(--app-color-feedback-success)" },
  { id: "warning", label: "警告", value: "var(--app-color-feedback-warning)" },
  { id: "danger", label: "危险", value: "var(--app-color-feedback-danger)" },
];

export const RICH_TEXT_HIGHLIGHT_PRESETS: RichTextColorPreset[] = [
  { id: "none", label: "无", value: null },
  { id: "peach", label: "桃", value: "var(--app-color-accent-soft)" },
  { id: "amber", label: "黄", value: "var(--app-color-feedback-warning-soft)" },
  { id: "green", label: "绿", value: "var(--app-color-feedback-success-soft)" },
  { id: "blue", label: "蓝", value: "var(--app-color-feedback-info-soft, var(--app-color-accent-soft))" },
  { id: "red", label: "红", value: "var(--app-color-feedback-danger-soft)" },
];
