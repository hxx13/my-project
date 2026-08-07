import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import type { RefDataItem, RefSpecTemplate } from "@/api/domains/referenceData.api";
import type { ReferenceTypeConfig, ReferenceFieldDef } from "./typeRegistry";
import { isTemplateAvailableForCard } from "./typeRegistry";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { webImageSrc } from "@/utils/mediaUrl";

interface EditModalProps {
  mode: "create" | "edit";
  typeConfig: ReferenceTypeConfig;
  item?: RefDataItem;
  parentOptions?: Array<{ id: number; label: string }>;
  templates?: RefSpecTemplate[];
  defaultParentId?: number;
  defaultParentLabel?: string;
  /** IDs of ancestor items from the drill chain — used to filter templates by scope */
  drillItemIds?: number[];
  onSave: (body: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function EditModal({
  mode: modalMode,
  typeConfig,
  item,
  parentOptions,
  templates,
  defaultParentId,
  defaultParentLabel,
  drillItemIds,
  onSave,
  onClose,
}: EditModalProps) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [parentId, setParentId] = useState<number | undefined>(
    item?.parentId ?? defaultParentId ?? undefined,
  );
  const [purchasable, setPurchasable] = useState(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  // Initialize form values from item or defaults
  useEffect(() => {
    if (modalMode === "edit" && item) {
      const values: Record<string, string> = {};
      for (const field of typeConfig.fields) {
        values[field.key] = item.fieldData?.[field.key] != null ? String(item.fieldData[field.key]) : "";
      }
      setFieldValues(values);
      setParentId(item.parentId ?? undefined);
      setPurchasable(item.fieldData?.purchasable === true);

      // Parse existing template IDs
      if (item.fieldData?.specTemplateIds) {
        try {
          const ids =
            typeof item.fieldData.specTemplateIds === "string"
              ? JSON.parse(item.fieldData.specTemplateIds)
              : item.fieldData.specTemplateIds;
          if (Array.isArray(ids)) setSelectedTemplateIds(ids.map(Number));
        } catch {
          /* ignore */
        }
      }
    } else {
      const values: Record<string, string> = {};
      for (const field of typeConfig.fields) {
        values[field.key] = "";
      }
      setFieldValues(values);
      setParentId(undefined);
      setPurchasable(false);
      setSelectedTemplateIds([]);
    }
  }, [modalMode, item, typeConfig]);

  const handleFieldChange = (key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleImageUpload = useCallback(async (fieldKey: string, file: File) => {
    setUploadingField(fieldKey);
    try {
      const result = await uploadSingleImage(file);
      setFieldValues((prev) => ({ ...prev, [fieldKey]: result.publicUrl }));
      toast.success("上传成功");
    } catch (err: any) {
      toast.error(err?.message || "上传失败");
    } finally {
      setUploadingField(null);
    }
  }, []);

  const handleSave = () => {
    // Validate required fields
    for (const field of typeConfig.fields) {
      if (field.required && !fieldValues[field.key]?.trim()) {
        toast.error(`请填写 ${field.label}`);
        return;
      }
    }

    // Build fieldData from pure field values
    const fieldData: Record<string, unknown> = {};
    for (const field of typeConfig.fields) {
      const val = fieldValues[field.key];
      if (val !== undefined && val !== null && val !== "") {
        fieldData[field.key] = val;
      }
    }

    // Build proper request body matching RefDataUpsertRequest
    const body: Record<string, unknown> = { fieldData };

    if (typeConfig.parentType && modalMode === "create" && parentId != null) {
      body.parentId = parentId;
    } else if (modalMode === "edit" && item?.parentId != null) {
      body.parentId = item.parentId;
    }

    if (typeConfig.hasPurchasable) {
      fieldData.purchasable = purchasable;
    }

    // Only store template IDs — specs come from templates
    if (selectedTemplateIds.length > 0) {
      fieldData.specTemplateIds = selectedTemplateIds;
    }

    body.status = 1; // default to active

    setSaving(true);
    onSave(body);
  };

  const renderField = (field: ReferenceFieldDef) => {
    const value = fieldValues[field.key] ?? "";

    if (field.type === "textarea") {
      return (
        <label key={field.key} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--twin-body)]">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </span>
          <textarea
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5 text-sm text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)] resize-none outline-none focus:ring-2 focus:ring-sky-500"
          />
        </label>
      );
    }

    if (field.type === "image") {
      return (
        <label key={field.key} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--twin-body)]">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            id={`edit-upload-${field.key}`}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              await handleImageUpload(field.key, f);
            }}
          />
          {value ? (
            <div className="relative group w-fit">
              <img
                src={webImageSrc(value) || value}
                alt=""
                className="h-24 w-24 rounded-md border border-[var(--twin-hairline)] object-cover"
              />
              <button
                type="button"
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs leading-none shadow opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleFieldChange(field.key, "")}
                title="删除图片"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={uploadingField === field.key}
              onClick={() => document.getElementById(`edit-upload-${field.key}`)?.click()}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)] hover:border-[var(--twin-link)] hover:text-[var(--twin-link)] transition-colors disabled:opacity-50"
              title="上传图片"
            >
              {uploadingField === field.key ? (
                <span className="text-[10px]">…</span>
              ) : (
                <span className="text-lg leading-none">+</span>
              )}
            </button>
          )}
        </label>
      );
    }

    // Default: text, email, tel
    const inputType = field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text";
    return (
      <label key={field.key} className="flex flex-col gap-1">
        <span className="text-xs font-medium text-[var(--twin-body)]">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
        <input
          type={inputType}
          value={value}
          onChange={(e) => handleFieldChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)] outline-none focus:ring-2 focus:ring-sky-500"
        />
      </label>
    );
  };

  const title = modalMode === "create" ? `新建${typeConfig.label}` : `编辑${typeConfig.label}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-4 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 mb-3">
          <h3 className="text-base font-semibold text-[var(--twin-ink)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
          >
            关闭
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
          {/* Parent info (create mode, when parentType exists) */}
          {modalMode === "create" && typeConfig.parentType && (
            defaultParentId ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[var(--twin-body)]">所属上级</span>
                <div className="text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas-soft)] rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1">
                  {defaultParentLabel || `ID ${defaultParentId}`}（自动关联）
                </div>
              </div>
            ) : parentOptions && parentOptions.length > 0 ? (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[var(--twin-body)]">所属上级</span>
                <select
                  value={parentId ?? ""}
                  onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm text-[var(--twin-ink)] outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">请选择</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>
            ) : null
          )}

          {/* Dynamic fields */}
          {typeConfig.fields.map(renderField)}

          {/* Purchasable toggle — green card style */}
          {typeConfig.hasPurchasable && (
            <div
              className="rounded-lg p-3 flex items-center justify-between"
              style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }}
            >
              <div>
                <div className="text-[13px] font-semibold text-[var(--twin-ink)]">可选购</div>
                <div className="text-[10px] text-[var(--twin-mute)]">开启后可被选购，需配置规格</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold" style={{ color: purchasable ? "#16a34a" : "#9ca3af" }}>
                  {purchasable ? "已开启" : "已关闭"}
                </span>
                <button
                  type="button"
                  onClick={() => setPurchasable(!purchasable)}
                  className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                  style={{ backgroundColor: purchasable ? "#16a34a" : "#d1d5db" }}
                  role="switch"
                  aria-checked={purchasable}
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                    style={{ transform: purchasable ? "translateX(16px)" : "translateX(0)" }}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Spec configuration section (shown when purchasable) */}
          {(purchasable || (typeConfig.hasPurchasable && modalMode === "edit" && item?.fieldData?.purchasable)) && (
            <div
              className="rounded-lg p-3 space-y-3"
              style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a" }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-bold text-[var(--twin-ink)]">规格配置</span>
                <span className="text-[10px] text-[var(--twin-mute)] font-normal">（选购时展示的选项）</span>
              </div>

              {/* Template selection — filtered by scope item */}
              {templates && templates.length > 0 && (() => {
                const available = templates.filter(tpl =>
                  isTemplateAvailableForCard(tpl.scope, drillItemIds ?? []),
                );
                if (available.length === 0) return null;
                return (
                  <div key="tpl-section">
                    <div className="text-[11px] text-[var(--twin-mute)] mb-1.5">选择规格模板</div>
                    <div className="flex flex-wrap gap-1.5">
                      {available.map((tpl) => {
                        const selected = selectedTemplateIds.includes(tpl.id);
                        return (
                          <button
                            key={tpl.id}
                            type="button"
                            onClick={() =>
                              setSelectedTemplateIds((prev) =>
                                selected ? prev.filter((id) => id !== tpl.id) : [...prev, tpl.id],
                              )
                            }
                            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                              selected
                                ? "text-white"
                                : "border border-dashed border-[var(--twin-hairline)] text-[var(--twin-mute)] hover:border-[var(--twin-link)]"
                            }`}
                            style={selected ? { backgroundColor: "#16a34a" } : {}}
                          >
                            {selected && <span className="text-xs leading-none">&#10003;</span>}
                            {tpl.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Specs come from selected templates — no custom dimensions needed */}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-[var(--twin-hairline)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-4 py-2 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
