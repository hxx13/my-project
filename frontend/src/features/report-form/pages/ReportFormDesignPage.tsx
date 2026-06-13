import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import FormGridEditor from '../components/FormGridEditor';
import FieldInspector from '../components/FieldInspector';
import ExcelImportButton from '../components/ExcelImportButton';
import { fetchFormById, updateForm } from '../api/reportForm.api';
import type { LayoutJson } from '../types';
import { useFormGridEditor } from '../hooks/useFormGridEditor';
import toast from 'react-hot-toast';
import { Undo2, Redo2, Save } from 'lucide-react';

/** layoutJson 从后端返回的是 JSON 字符串，需要解析 */
function parseLayout(raw: unknown): LayoutJson {
  console.warn('%c🟡 [DESIGNER] parseLayout 输入 typeof=%c' + typeof raw,
    'font-size:14px;color:orange;font-weight:bold', '');
  if (!raw) {
    console.warn('%c🟡 [DESIGNER] ⚠️ parseLayout: raw 为空(null/undefined), 返回空 layout',
      'font-size:16px;color:orange;font-weight:bold');
    return { cells: [], fields: {}, mergeGroups: [] };
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      console.warn('%c🟢 [DESIGNER] parseLayout 解析成功: cells=%c' + parsed.cells?.length + '%c fields=%c' + Object.keys(parsed.fields || {}).length,
        'font-size:14px;color:green;font-weight:bold', '', '', '');
      return parsed;
    } catch (e) {
      console.warn('%c🔴 [DESIGNER] parseLayout JSON.parse 失败!%c',
        'font-size:18px;color:red;font-weight:bold', '', e);
      console.warn('%c🔴 [DESIGNER] 原始字符串前200字符:%c ' + (raw as string).substring(0, 200),
        'font-size:14px;color:red', '');
      return { cells: [], fields: {}, mergeGroups: [] };
    }
  }
  console.warn('%c🟢 [DESIGNER] parseLayout: raw 已是对象, cells=%c' + (raw as LayoutJson).cells?.length,
    'font-size:14px;color:green', '');
  return raw as LayoutJson;
}

export default function ReportFormDesignPage() {
  const { id } = useParams<{ id: string }>();
  const formId = Number(id);
  const navigate = useNavigate();

  const { data: form, isLoading } = useQuery({
    queryKey: ['report-form', formId],
    queryFn: async () => {
      const f = await fetchFormById(formId);
      const raw = f as Record<string, unknown>;
      console.warn('%c🔵 [DESIGNER] fetchFormById 返回:%c',
        'font-size:14px;color:blue;font-weight:bold', '', f);
      console.warn('%c🔵 [DESIGNER] form.id=%c' + raw?.id,
        'font-size:14px;color:blue', '');
      console.warn('%c🔵 [DESIGNER] form.layoutJson typeof=%c' + typeof raw?.layoutJson,
        'font-size:14px;color:blue', '');
      if (typeof raw?.layoutJson === 'string') {
        console.warn('%c🔵 [DESIGNER] form.layoutJson 长度=%c' + (raw.layoutJson as string).length,
          'font-size:14px;color:blue', '');
        console.warn('%c🔵 [DESIGNER] form.layoutJson 前300字符:%c\n' + (raw.layoutJson as string).substring(0, 300),
          'font-size:12px;color:blue', '');
      } else if (raw?.layoutJson && typeof raw.layoutJson === 'object') {
        console.warn('%c🔵 [DESIGNER] form.layoutJson 是对象, keys=%c' + Object.keys(raw.layoutJson as object).join(','),
          'font-size:14px;color:blue', '');
      } else {
        console.warn('%c🔵 [DESIGNER] ⚠️ form.layoutJson 异常: typeof=%c' + typeof raw?.layoutJson,
          'font-size:16px;color:blue;font-weight:bold', '');
      }
      return f;
    },
    enabled: !!formId,
  });

  const initialLayout = parseLayout((form as Record<string, unknown> | null)?.layoutJson);
  console.warn('%c🟣 [DESIGNER] initialLayout cells=%c' + initialLayout.cells?.length + '%c fields=%c' + Object.keys(initialLayout.fields || {}).length,
    'font-size:14px;color:purple;font-weight:bold', '', '', '');
  const editor = useFormGridEditor(initialLayout);

  const saveMut = useMutation({
    mutationFn: () => updateForm(formId, {
      name: form?.name,
      layoutJson: JSON.stringify(editor.layout),
    }),
    onSuccess: () => toast.success('已保存'),
    onError: (e: Error) => toast.error('保存失败: ' + e.message),
  });

  const selectedCell = editor.selectedCellIds.size === 1
    ? editor.layout.cells.find(c => c.id === [...editor.selectedCellIds][0]) || null
    : null;

  if (isLoading) {
    return (
      <AdminPageShell title="加载中...">
        <div className="p-4 text-sm text-[var(--app-color-text-tertiary)]">加载报表...</div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell title={form?.name || '报表设计器'} description="设计报表布局与字段">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <ExcelImportButton
          onImported={(f) => {
            // 导入成功后跳转到新表单的设计页
            navigate(`/admin/report-form/${f.id}/design`);
          }}
        />
        <button
          onClick={() => editor.undo()}
          disabled={editor.undoStack.current.length === 0}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium
                     border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)]
                     hover:bg-[var(--app-color-surface-hover)] disabled:opacity-30 flex items-center gap-1"
        >
          <Undo2 className="w-3.5 h-3.5" /> 撤销
        </button>
        <button
          onClick={() => editor.redo()}
          disabled={editor.redoStack.current.length === 0}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium
                     border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)]
                     hover:bg-[var(--app-color-surface-hover)] disabled:opacity-30 flex items-center gap-1"
        >
          <Redo2 className="w-3.5 h-3.5" /> 重做
        </button>
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium
                     bg-[var(--app-color-accent)] text-white hover:opacity-90 disabled:opacity-50
                     flex items-center gap-1"
        >
          <Save className="w-3.5 h-3.5" />
          {saveMut.isPending ? '保存中...' : '保存'}
        </button>
      </div>

      {/* Main layout: left editor + right panel */}
      <div className="flex gap-4">
        <div className="flex-[7] min-w-0">
          <FormGridEditor
            layout={editor.layout}
            onChange={(l: LayoutJson) => editor.setLayout(l)}
          />
        </div>
        <div className="flex-[3] min-w-[260px] max-w-[360px] border-l border-[var(--app-color-border)] pl-3">
          <FieldInspector
            selectedCell={selectedCell}
            layout={editor.layout}
            onUpdateCell={editor.updateCell}
            onUpdateStyle={editor.updateCellStyle}
            onToggleKind={editor.toggleCellKind}
            onUpdateField={editor.updateFieldDefinition}
          />
        </div>
      </div>
    </AdminPageShell>
  );
}
