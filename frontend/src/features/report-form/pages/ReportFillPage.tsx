// ReportFillPage — 填报页面 (full implementation)
import { useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import FormGridRenderer from '../components/FormGridRenderer';
import { useReportFill } from '../hooks/useReportFill';
import FormExportActions from '../components/FormExportActions';
import { printForm, fetchCanEdit } from '../api/reportFill.api';
import { buildReportExportFilename } from '../utils/reportFormExportFilename';
import { Save, Send, Clock, User, Printer, Eye, ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export default function ReportFillPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const formId = Number(id);
  const submissionIdParam = searchParams.get('submissionId');
  const submissionId = submissionIdParam ? Number(submissionIdParam) : undefined;
  const { form, values, submission, formLoading, updateValue, submitMut, flushSave, flushSaveForExport } = useReportFill(formId, submissionId);

  const { data: editInfo } = useQuery({
    queryKey: ['report-fill-can-edit', formId, submissionId ?? 'default'],
    queryFn: () => fetchCanEdit(formId, submissionId ?? submission?.id),
    enabled: !!formId,
  });
  const canEdit = editInfo?.canEdit ?? false;
  const userRole = editInfo?.role ?? '';

  const { layout: fillLayout, theme: fillTheme } = useMemo(() => {
    if (!form) return { layout: undefined, theme: undefined };
    // Word 填报页与设计页一致：展示完整版式（含页眉/页脚），仅可编辑字段受权限控制
    return { layout: form.layoutJson, theme: form.themeJson };
  }, [form]);

  if (formLoading || !form) {
    return (
      <AdminPageShell title="加载中...">
        <p className="text-sm text-[var(--app-color-text-tertiary)] p-4">加载报表...</p>
      </AdminPageShell>
    );
  }

  const fillPolicy = typeof form.fillPolicyJson === 'string'
    ? JSON.parse(form.fillPolicyJson as string)
    : (form.fillPolicyJson || {});
  const mode = fillPolicy.mode || 'shared';
  const submitLabel = fillPolicy.submitLabel || '提交';
  const instanceTitle = submission?.instanceLabel?.trim()
    ? submission.instanceLabel
    : (mode === 'individual' && fillPolicy.allowMultipleInstances ? '默认子文件' : '');

  return (
    <AdminPageShell
      title={instanceTitle ? `${form.name} · ${instanceTitle}` : form.name}
      description={`${mode === 'shared' ? '协同填报' : '个人填报'} · ${submitLabel}`}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => navigate('/admin/report-fill', { state: { returnTo: '/admin/report-fill' } })}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium
                     border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]
                     hover:bg-[var(--app-color-surface-hover)] flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> 返回填报中心
        </button>
        <span className="w-px h-5 bg-[var(--app-color-border-default)]" />
        <button
          onClick={async () => {
            try {
              await flushSave();
              toast.success('已保存');
            } catch (e) {
              toast.error('保存失败: ' + (e as Error).message);
            }
          }}
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
        <FormExportActions
          form={form}
          context="fill"
          submissionId={submission?.id}
          instanceLabel={submission?.instanceLabel}
          fillMode={mode}
          onBeforeExport={flushSaveForExport}
          buttonClassName="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] flex items-center gap-1"
        />
        <button onClick={() => printForm(
          formId,
          submission?.id,
          buildReportExportFilename({
            formName: form.name,
            extension: 'pdf',
            fillMode: mode,
            instanceLabel: submission?.instanceLabel,
          }),
        )}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] flex items-center gap-1">
          <Printer className="w-3.5 h-3.5" /> 打印
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
      {!canEdit && (
        <div className="mb-3 px-3 py-1.5 rounded-[var(--app-radius-container)] bg-[var(--app-color-feedback-warning-soft)] text-[11px] text-[var(--app-color-feedback-warning)] flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5" /> 只读模式 — 你无权编辑此报表的内容
        </div>
      )}
      <FormGridRenderer
        layout={fillLayout ?? form.layoutJson}
        themeJson={fillTheme ?? form.themeJson}
        formSource={form.source}
        values={values}
        editable={canEdit}
        onChange={updateValue}
        permissionJson={form.permissionJson}
        userRoles={[userRole]}
      />
    </AdminPageShell>
  );
}
