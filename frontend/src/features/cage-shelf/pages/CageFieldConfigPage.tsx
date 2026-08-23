import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Loader2, Save, X, ChevronLeft } from "lucide-react";
import { appConfirm } from "@/lib/appDialog";
import {
  createCageInfoField,
  deleteCageInfoField,
  fetchCageInfoCodelists,
  fetchCageInfoFields,
  updateCageInfoField,
  type CageInfoField,
  type CodelistSummary,
} from "../api/cageForm.api";

const DATA_TYPES: { value: string; label: string }[] = [
  { value: "number", label: "数字" },
  { value: "text", label: "文本" },
  { value: "boolean", label: "布尔" },
];

const DATA_TYPE_LABELS: Record<string, string> = {
  number: "数字",
  text: "文本",
  boolean: "布尔",
};

interface FieldFormState {
  canonical: string;
  label: string;
  dataType: string;
  dictKey: string;
  required: boolean;
  sort: number;
}

const EMPTY_FORM: FieldFormState = {
  canonical: "",
  label: "",
  dataType: "text",
  dictKey: "",
  required: false,
  sort: 0,
};

function toFormState(f: CageInfoField): FieldFormState {
  return {
    canonical: f.canonical ?? "",
    label: f.label ?? "",
    dataType: f.dataType ?? "text",
    dictKey: f.dictKey ?? "",
    required: Boolean(f.required),
    sort: f.sort ?? 0,
  };
}

/**
 * CageFieldConfigPage — 字段配置（字段 CRUD）
 *
 * - 字段列表（按 sort 排序），行内展示 canonical/label/dataType/dictKey/required/发布/同步徽章
 * - 新增字段表单（canonical/label/dataType/dictKey/required/sort）
 * - 行内编辑（label/dataType/dictKey/required/sort）
 * - 删除（confirm；sync 字段禁用）
 */
export default function CageFieldConfigPage() {
  const navigate = useNavigate();
  const [fields, setFields] = useState<CageInfoField[]>([]);
  const [codelists, setCodelists] = useState<CodelistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<FieldFormState>(EMPTY_FORM);
  const [newState, setNewState] = useState<FieldFormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadFields = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchCageInfoFields();
      setFields([...list].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)));
    } catch (e) {
      toast.error((e as Error)?.message || "加载字段失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  useEffect(() => {
    fetchCageInfoCodelists()
      .then((list) => setCodelists(list ?? []))
      .catch(() => {});
  }, []);

  const codelistCodes = useMemo(() => codelists.map((c) => c.code).filter(Boolean), [codelists]);

  const startEdit = (f: CageInfoField) => {
    setEditingId(f.id);
    setEditState(toFormState(f));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState(EMPTY_FORM);
  };

  const handleCreate = async () => {
    if (!newState.canonical.trim()) {
      toast.error("请填写字段标识（canonical）");
      return;
    }
    if (!newState.label.trim()) {
      toast.error("请填写字段名称（label）");
      return;
    }
    setCreating(true);
    try {
      await createCageInfoField({
        canonical: newState.canonical.trim(),
        label: newState.label.trim(),
        dataType: newState.dataType,
        dictKey: newState.dictKey.trim() || undefined,
        required: newState.required,
        sort: newState.sort,
      });
      toast.success("新增字段成功");
      setNewState(EMPTY_FORM);
      loadFields();
    } catch (e) {
      toast.error((e as Error)?.message || "新增字段失败");
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (id: number) => {
    if (!editState.label.trim()) {
      toast.error("字段名称（label）不能为空");
      return;
    }
    setSaving(true);
    try {
      await updateCageInfoField(id, {
        label: editState.label.trim() || undefined,
        dataType: editState.dataType,
        dictKey: editState.dictKey.trim() || undefined,
        required: editState.required,
        sort: editState.sort,
      });
      toast.success("保存成功");
      cancelEdit();
      loadFields();
    } catch (e) {
      toast.error((e as Error)?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (f: CageInfoField) => {
    const isSync = Boolean(f.syncSource);
    if (isSync) {
      toast.error("同步字段不可删除");
      return;
    }
    if (!(await appConfirm(`确定删除字段「${f.label || f.canonical}」？`, { danger: true }))) return;
    try {
      await deleteCageInfoField(f.id);
      toast.success("已删除");
      loadFields();
    } catch (e) {
      toast.error((e as Error)?.message || "删除失败");
    }
  };

  const inputCls =
    "rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-xs text-[var(--twin-ink)] outline-none focus:border-[var(--twin-primary)]";

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 顶栏 */}
      <div className="shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate("..")}
          className="inline-flex items-center gap-0.5 text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)] transition"
        >
          <ChevronLeft className="h-3.5 w-3.5" />返回
        </button>
        <span className="text-[var(--twin-hairline)]">|</span>
        <h2 className="text-base font-bold text-[var(--twin-ink)]">字段配置</h2>
      </div>

      {/* 新增字段表单 */}
      <div className="shrink-0 rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4">
        <div className="text-sm font-semibold text-[var(--twin-ink)] mb-3">新增字段</div>
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-3">
            <label className="block text-[10px] text-[var(--twin-mute)] mb-1">字段标识（canonical）</label>
            <input
              type="text"
              value={newState.canonical}
              onChange={(e) => setNewState((s) => ({ ...s, canonical: e.target.value }))}
              placeholder="如 animal_strain"
              className={`w-full ${inputCls}`}
            />
          </div>
          <div className="col-span-3">
            <label className="block text-[10px] text-[var(--twin-mute)] mb-1">字段名称（label）</label>
            <input
              type="text"
              value={newState.label}
              onChange={(e) => setNewState((s) => ({ ...s, label: e.target.value }))}
              placeholder="如 动物品系"
              className={`w-full ${inputCls}`}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] text-[var(--twin-mute)] mb-1">类型</label>
            <select
              value={newState.dataType}
              onChange={(e) => setNewState((s) => ({ ...s, dataType: e.target.value }))}
              className={`w-full ${inputCls}`}
            >
              {DATA_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] text-[var(--twin-mute)] mb-1">码表（可选）</label>
            <input
              type="text"
              list="cage-codelist-codes"
              value={newState.dictKey}
              onChange={(e) => setNewState((s) => ({ ...s, dictKey: e.target.value }))}
              placeholder="选或输入"
              className={`w-full ${inputCls}`}
            />
          </div>
          <div className="col-span-1">
            <label className="block text-[10px] text-[var(--twin-mute)] mb-1">必填</label>
            <select
              value={newState.required ? "yes" : "no"}
              onChange={(e) => setNewState((s) => ({ ...s, required: e.target.value === "yes" }))}
              className={`w-full ${inputCls}`}
            >
              <option value="no">否</option>
              <option value="yes">是</option>
            </select>
          </div>
          <div className="col-span-1">
            <label className="block text-[10px] text-[var(--twin-mute)] mb-1">排序</label>
            <input
              type="number"
              value={newState.sort}
              onChange={(e) => setNewState((s) => ({ ...s, sort: parseInt(e.target.value) || 0 }))}
              className={`w-full ${inputCls}`}
            />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-1 rounded-twin-md px-3 py-1.5 text-[11px] font-semibold bg-[var(--twin-primary)] text-white hover:brightness-95 transition disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}新增
          </button>
        </div>
      </div>

      {/* datalist 供码表下拉 */}
      <datalist id="cage-codelist-codes">
        {codelistCodes.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>

      {/* 字段列表 */}
      <div className="flex-1 min-h-0 flex flex-col rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--twin-hairline)]">
          <span className="text-sm font-semibold text-[var(--twin-ink)]">全部字段</span>
          <span className="text-[11px] text-[var(--twin-mute)]">{fields.length} 个字段</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="flex min-h-[120px] items-center justify-center text-sm text-[var(--twin-mute)]">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />加载中…
            </div>
          ) : fields.length === 0 ? (
            <div className="flex min-h-[120px] items-center justify-center text-sm text-[var(--twin-mute)]">
              暂无字段，请先在上方新增
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-[2] bg-[var(--twin-canvas-soft)] border-b border-[var(--twin-hairline)]">
                <tr className="text-[var(--twin-mute)] font-semibold">
                  <th className="px-3 py-2">字段标识</th>
                  <th className="px-3 py-2">名称</th>
                  <th className="px-3 py-2 w-20">类型</th>
                  <th className="px-3 py-2">码表</th>
                  <th className="px-3 py-2 w-16">必填</th>
                  <th className="px-3 py-2 w-20">排序</th>
                  <th className="px-3 py-2 w-24">状态</th>
                  <th className="px-3 py-2 w-24">操作</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => {
                  const isSync = Boolean(f.syncSource);
                  const isEditing = editingId === f.id;
                  return isEditing ? (
                    <tr key={f.id} className="border-b bg-[var(--twin-canvas-soft)]">
                      <td className="px-3 py-2 font-mono text-[11px] text-[var(--twin-mute)]">{f.canonical}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={editState.label}
                          onChange={(e) => setEditState((s) => ({ ...s, label: e.target.value }))}
                          className={`w-full ${inputCls}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={editState.dataType}
                          onChange={(e) => setEditState((s) => ({ ...s, dataType: e.target.value }))}
                          className={`w-full ${inputCls}`}
                        >
                          {DATA_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          list="cage-codelist-codes"
                          value={editState.dictKey}
                          onChange={(e) => setEditState((s) => ({ ...s, dictKey: e.target.value }))}
                          className={`w-full ${inputCls}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={editState.required ? "yes" : "no"}
                          onChange={(e) => setEditState((s) => ({ ...s, required: e.target.value === "yes" }))}
                          className={`w-full ${inputCls}`}
                        >
                          <option value="no">否</option>
                          <option value="yes">是</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={editState.sort}
                          onChange={(e) => setEditState((s) => ({ ...s, sort: parseInt(e.target.value) || 0 }))}
                          className={`w-full ${inputCls}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${f.published ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                            {f.published ? "已发布" : "未发布"}
                          </span>
                          {isSync && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200">同步</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleSave(f.id)}
                            disabled={saving}
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                            title="保存"
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="p-1 rounded text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)]"
                            title="取消"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={f.id} className="border-b border-[var(--twin-hairline)] hover:bg-[var(--twin-canvas-soft)] transition-colors">
                      <td className="px-3 py-2 font-mono text-[11px] text-[var(--twin-ink)]">{f.canonical}</td>
                      <td className="px-3 py-2 font-medium text-[var(--twin-ink)]">{f.label}</td>
                      <td className="px-3 py-2 text-[var(--twin-mute)]">{DATA_TYPE_LABELS[f.dataType] ?? f.dataType}</td>
                      <td className="px-3 py-2 text-[var(--twin-mute)] font-mono text-[11px]">{f.dictKey || "—"}</td>
                      <td className="px-3 py-2">{f.required ? <span className="text-emerald-600 font-semibold">是</span> : <span className="text-[var(--twin-mute)]">否</span>}</td>
                      <td className="px-3 py-2 text-[var(--twin-mute)]">{f.sort ?? 0}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${f.published ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                            {f.published ? "已发布" : "未发布"}
                          </span>
                          {isSync && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200">同步</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(f)}
                            className="p-1 rounded text-[var(--twin-mute)] hover:text-blue-600 hover:bg-blue-50"
                            title="编辑"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(f)}
                            disabled={isSync}
                            className={`p-1 rounded ${isSync ? "text-[var(--twin-mute)] opacity-40 cursor-not-allowed" : "text-[var(--twin-mute)] hover:text-red-600 hover:bg-red-50"}`}
                            title={isSync ? "同步字段不可删除" : "删除"}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
