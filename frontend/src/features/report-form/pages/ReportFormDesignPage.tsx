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
  console.log('[report-form-designer] parseLayout 输入类型:', typeof raw);
  if (!raw) {
    console.warn('[report-form-designer] parseLayout: raw 为空, 返回空 layout');
    return { cells: [], fields: {}, mergeGroups: [] };
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      console.log('[report-form-designer] parseLayout 解析成功: cells=', parsed.cells?.length, 'fields=', Object.keys(parsed.fields || {}).length);
      return parsed;
    } catch (e) {
      console.error('[report-form-designer] parseLayout JSON.parse 失败:', e, 'raw前100字符:', raw.substring(0, 100));
      return { cells: [], fields: {}, mergeGroups: [] };
    }
  }
  console.log('[report-form-designer] parseLayout: raw 已是对象, cells=', (raw as LayoutJson).cells?.length);
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
      console.log('[report-form-designer] fetchFormById 返回:', f);
      console.log('[report-form-designer] form.id:', (f as Record<string,unknown>)?.id);
      console.log('[report-form-designer] form.layoutJson 类型:', typeof (f as Record<string,unknown>)?.layoutJson);
      console.log('[report-form-designer] form.layoutJson 前200字符:',
        typeof (f as Record<string,unknown>)?.layoutJson === 'string'
          ? ((f as Record<string,unknown>).layoutJson as string).substring(0, 200)
          : 'N/A (非字符串)');
      return f;
    },
    enabled: !!formId,
  });

  const initialLayout = parseLayout((form as Record<string, unknown> | null)?.layoutJson);
  console.log('[report-form-designer] initialLayout cells:', initialLayout.cells?.length);
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
