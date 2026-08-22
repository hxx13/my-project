import type { JSX } from "react";
import { ViolationTemplateQuickSelect } from "../records/ViolationTemplateQuickSelect";
import { contentBodyFromHtml, serializeContentBody, type ContentBodyValue } from "../slots/ContentBodySlot";

/**
 * 违规弹窗警告域专用：为 ContentBodySlot 生成「选择模板 / 保存当前」工具条。
 * 仅用于 student-violations 管理面（开单编辑器、⚙ 配置弹窗内富文本），
 * 消费 violationTextTemplate.api；勿挂到 AUP/NHP/portal 等其它 RichTextEditor。
 */
export function violationContentTemplateSlot(
  value: ContentBodyValue,
  onChange: (next: ContentBodyValue) => void,
): JSX.Element {
  const currentHtml = serializeContentBody(value).html;
  return (
    <ViolationTemplateQuickSelect
      currentText={currentHtml}
      onSelect={(text) => onChange(contentBodyFromHtml(text, serializeContentBody(value).imageUrls))}
    />
  );
}
