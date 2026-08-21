import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  useSpecTemplates,
  useCreateSpecTemplate,
  useUpdateSpecTemplate,
  useDeleteSpecTemplate,
  useRefDataList,
} from "@/api/hooks/useReferenceData";
import type { RefSpecTemplate } from "@/api/domains/referenceData.api";
import { getAllTypeConfigs } from "./typeRegistry";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

import { appConfirm } from "@/lib/appDialog";
interface SpecTemplateManagerProps {
  onClose: () => void;
}

/** Extract options from raw data */
function extractOptions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : (p?.items ?? []); } catch { return []; }
  }
  if (typeof raw === "object" && raw !== null && Array.isArray((raw as any).items)) return (raw as any).items;
  return [];
}

export default function SpecTemplateManager({ onClose }: SpecTemplateManagerProps) {
  const { data: templates = [], isLoading } = useSpecTemplates();
  const createMut = useCreateSpecTemplate();
  const updateMut = useUpdateSpecTemplate();
  const deleteMut = useDeleteSpecTemplate();

  const [editId, setEditId] = useState<number | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [formName, setFormName] = useState("");
  const [formScope, setFormScope] = useState("ALL");
  const [formOptionsText, setFormOptionsText] = useState("");

  const role = authStorage.getRole() || "MEMBER";
  const isAdmin = hasMinRole(role, "SUPER_ADMIN");
  const isEditing = editId != null;

  // Fetch actual reference data items for scope picker (non-leaf types: supplier, breed, strain)
  const allTypes = getAllTypeConfigs();
  const nonLeafTypes = allTypes.filter(t => t.childType); // types that have children

  // Fetch items for each non-leaf type
  const { data: supplierItems = [] } = useRefDataList("SUPPLIER");
  const { data: breedItems = [] } = useRefDataList("ANIMAL_BREED");
  const { data: strainItems = [] } = useRefDataList("ANIMAL_STRAIN");

  // Build scope options from actual data items
  const scopeOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: "ALL", label: "全部（不限分级）" },
    ];
    const addItems = (items: any[], typeLabel: string) => {
      for (const item of items) {
        const fd = item.fieldData as Record<string, unknown> | undefined;
        const name = fd?.title || fd?.subtitle || `ID ${item.id}`;
        opts.push({ value: `ref:${item.id}`, label: `[${typeLabel}] ${name}` });
      }
    };
    addItems(supplierItems, "供应商");
    addItems(breedItems, "品种");
    addItems(strainItems, "品系");
    return opts;
  }, [supplierItems, breedItems, strainItems]);

  // Display scope label
  function scopeLabel(scope: string): string {
    if (!scope || scope === "ALL") return "全局";
    if (scope.startsWith("ref:")) {
      const id = scope.slice(4);
      const opt = scopeOptions.find(o => o.value === scope);
      return opt ? opt.label.replace(/^\[.+\]\s/, "") : `ID ${id}`;
    }
    return scope;
  }

  function openCreate() {
    setEditId(null);
    setFormName("");
    setFormScope("ALL");
    setFormOptionsText("");
    setFormVisible(true);
  }

  function openEdit(tpl: RefSpecTemplate) {
    setEditId(tpl.id);
    setFormName(tpl.name);
    setFormScope(tpl.scope || "ALL");
    setFormOptionsText(extractOptions(tpl.options).join(", "));
    setFormVisible(true);
  }

  function resetForm() {
    setEditId(null);
    setFormName("");
    setFormScope("ALL");
    setFormOptionsText("");
    setFormVisible(false);
  }

  function handleSave() {
    const name = formName.trim();
    if (!name) { toast.error("模板名称不能为空"); return; }
    const opts = formOptionsText.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (opts.length === 0) { toast.error("至少需要一个选项"); return; }
    if (isEditing) {
      updateMut.mutate(
        { id: editId!, body: { name, scope: formScope, breedType: formScope.startsWith("ref:") ? formScope.slice(4) : undefined, options: { items: opts } } },
        { onSuccess: () => resetForm() },
      );
    } else {
      createMut.mutate(
        { name, scope: formScope, breedType: formScope.startsWith("ref:") ? formScope.slice(4) : undefined, options: { items: opts } },
        { onSuccess: () => resetForm() },
      );
    }
  }

  async function handleDelete(id: number) {
    if (!await appConfirm("确认删除此规格模板？")) return;
    deleteMut.mutate(id);
  }

  const showForm = formVisible;

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-4 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between shrink-0 mb-3">
          <h3 className="text-base font-semibold text-[var(--twin-ink)]">规格模板库管理</h3>
          <button onClick={onClose} className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]">关闭</button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
          {isAdmin && (
            <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
              {!showForm ? (
                <button type="button" onClick={openCreate} className="rounded-full border border-dashed border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)] hover:border-[var(--twin-link)] hover:text-[var(--twin-link)]">+ 新建模板</button>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-[var(--twin-ink)]">{isEditing ? "编辑模板" : "新建模板"}</div>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-[var(--twin-mute)]">模板名称 *</span>
                    <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="如: 小鼠年龄规格" className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-[var(--twin-mute)]">适用分级（选择具体的参考数据项）</span>
                    <select value={formScope} onChange={e => setFormScope(e.target.value)} className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500">
                      {scopeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-[var(--twin-mute)]">选项（逗号分隔）</span>
                    <textarea value={formOptionsText} onChange={e => setFormOptionsText(e.target.value)} placeholder="如: 3-5W, 6W, 7W, 8W" rows={2} className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5 text-sm resize-none outline-none focus:ring-2 focus:ring-sky-500" />
                  </label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50">{createMut.isPending || updateMut.isPending ? "保存中…" : "保存"}</button>
                    <button type="button" onClick={resetForm} className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]">取消</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-[var(--twin-body)] mb-2">已有模板 ({templates.length})</div>
            {isLoading ? (
              <div className="text-xs text-[var(--twin-mute)] py-4 text-center">加载中…</div>
            ) : templates.length === 0 ? (
              <div className="text-xs text-[var(--twin-mute)] py-4 text-center">暂无模板</div>
            ) : (
              <div className="space-y-1.5">
                {templates.map(tpl => {
                  const opts = extractOptions(tpl.options);
                  return (
                    <div key={tpl.id} className="flex items-center justify-between rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[var(--twin-ink)] truncate">{tpl.name}</div>
                        <div className="text-[10px] text-[var(--twin-mute)] mt-0.5">
                          {scopeLabel(tpl.scope)} · {opts.slice(0, 5).join(", ")}{opts.length > 5 ? ` +${opts.length - 5}` : ""}
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button type="button" onClick={() => openEdit(tpl)} className="rounded border border-[var(--twin-hairline)] px-2 py-0.5 text-[10px] text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]">编辑</button>
                          <button type="button" onClick={() => handleDelete(tpl.id)} className="rounded border border-[var(--twin-hairline)] px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-50">删除</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
