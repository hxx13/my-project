import type { ReactNode } from "react";
import type { FmTemplateItem } from "@/api/domains/facilityMaintenance.api";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import {
  AdminFormField,
  AdminFormGrid,
  AdminFormInput,
  AdminFormSelect,
} from "@/components/admin/AdminFormPrimitives";

/* ================================================================== */
/*  TemplateItemFields — 按模板项动态渲染表单控件（单笔巡查记录用）        */
/*  与「按日巡查表」矩阵共用同一批模板项与 values 语义：                  */
/*  SELECT 存 label（见 InspectionMatrix 的 onChange），BOOLEAN 存字符串。 */
/* ================================================================== */

export type TemplateItemFieldsProps = {
  items: FmTemplateItem[];
  values: Record<string, string>;
  onChange: (itemId: string, value: string) => void;
  disabled?: boolean;
};

/** 必填判定：后端两种标记任一为真（与页面模板编辑器一致） */
function isRequired(it: FmTemplateItem): boolean {
  return it.requiredFlag === 1 || it.required === true;
}

export function TemplateItemFields({ items, values, onChange, disabled }: TemplateItemFieldsProps) {
  return (
    <AdminFormGrid>
      {items.map((it, idx) => {
        const itemId = String(it.id ?? `idx-${idx}`);
        const value = values[itemId] ?? "";
        // 后端可能回小写/旧序列化，统一大写再比较
        const type = String(it.fieldType || "").toUpperCase();

        let control: ReactNode;
        switch (type) {
          case "NUMBER":
            control = (
              <AdminFormInput
                type="number"
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(itemId, e.target.value)}
              />
            );
            break;
          case "BOOLEAN":
            control = (
              <AdminSwitchScaled
                checked={value === "true"}
                disabled={disabled}
                onChange={(checked) => onChange(itemId, checked ? "true" : "false")}
              />
            );
            break;
          case "SELECT":
            control = (
              <AdminFormSelect
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(itemId, e.target.value)}
              >
                <option value=""></option>
                {(it.optionItems ?? []).map((o, oi) => (
                  <option key={o.id ?? `opt-${oi}`} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </AdminFormSelect>
            );
            break;
          case "DATETIME":
            control = (
              <AdminFormInput
                type="datetime-local"
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(itemId, e.target.value)}
              />
            );
            break;
          case "TEXT":
          default:
            // 未知类型回落为文本输入，不抛错、不空白
            control = (
              <AdminFormInput
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(itemId, e.target.value)}
              />
            );
            break;
        }

        return (
          <AdminFormField key={itemId} label={isRequired(it) ? `${it.label} *` : it.label}>
            {control}
          </AdminFormField>
        );
      })}
    </AdminFormGrid>
  );
}

export default TemplateItemFields;
