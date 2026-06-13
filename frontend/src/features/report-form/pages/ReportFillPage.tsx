// ReportFillPage — 填报页面 (full implementation)
import { useParams } from 'react-router-dom';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import FormGridRenderer from '../components/FormGridRenderer';
import { useReportFill } from '../hooks/useReportFill';
import { exportExcel, exportPdf } from '../api/reportFill.api';
import { Save, Send, Clock, User, Download, FileSpreadsheet } from 'lucide-react';

export default function ReportFillPage() {
  const { id } = useParams<{ id: string }>();
  const formId = Number(id);
  const { form, values, submission, formLoading, updateValue, submitMut, flushSave } = useReportFill(formId);

  if (formLoading || !form) {
    return (
      <AdminPageShell title="加载中...">
        <p className="text-sm text-[var(--app-color-text-tertiary)] p-4">加载报表...</p>
      </AdminPageShell>
    );
  }

  const mode = form.fillPolicyJson?.mode || 'shared';
  const submitLabel = form.fillPolicyJson?.submitLabel || '提交';

  return (
    <AdminPageShell
      title={form.name}
      description={`${mode === 'shared' ? '协同填报' : '个人填报'} · ${submitLabel}`}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          onClick={() => flushSave()}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium
                     border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]
                     hover:bg-[var(--app-color-surface-hover)] flex items-center gap-1"
        >
          <Save className="w-3.5 h-3.5" /> 保存
        </button>
        <button
          onClick={() => submitMut.mutate()}
          disabled={submitMut.isPending}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium
                     bg-[var(--app-color-accent)] text-white hover:opacity-90 disabled:opacity-50
                     flex items-center gap-1"
        >
          <Send className="w-3.5 h-3.5" />
          {submitMut.isPending ? '提交中...' : submitLabel}
        </button>
        <span className="w-px h-5 bg-[var(--app-color-border-default)]" />
        <button onClick={() => exportExcel(formId, submission?.id)}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] flex items-center gap-1">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
        </button>
        <button onClick={() => exportPdf(formId, submission?.id)}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] flex items-center gap-1">
          <Download className="w-3.5 h-3.5" /> PDF
        </button>
        <div className="ml-auto flex items-center gap-4 text-[11px] text-[var(--app-color-text-tertiary)]">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> 自动保存中
          </span>
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" /> {mode === 'shared' ? '协同模式' : '个人模式'}
          </span>
        </div>
      </div>

      {/* Fill grid */}
      <FormGridRenderer
        layout={form.layoutJson}
        values={values}
        editable={true}
        onChange={updateValue}
      />
    </AdminPageShell>
  );
}
