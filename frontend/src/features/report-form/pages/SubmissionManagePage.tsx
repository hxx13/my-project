import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { fetchFormById } from '../api/reportForm.api';
import { fetchFormSubmissions } from '../api/reportFill.api';
import FormGridRenderer, { parseLayoutJson } from '../components/FormGridRenderer';
import type { ReportFormSubmission } from '../types';
import { exportExcel, exportPdf, exportWord } from '../api/reportFill.api';
import { fetchWordTemplates } from '../api/reportForm.api';
import { buildReportExportFilename, parseFillMode } from '../utils/reportFormExportFilename';
import { Table2, Eye, User, Clock, CheckCircle, FileText, Download, FileSpreadsheet } from 'lucide-react';
import { formatDateTimeAsiaShanghaiShort } from '@/lib/formatDateTimeAsiaShanghai';
import toast from 'react-hot-toast';

type ViewMode = 'table' | 'detail';

function submissionUserLabel(sub: ReportFormSubmission): string {
  return sub.displayNickname?.trim() || `用户 #${sub.userId}`;
}

export default function SubmissionManagePage() {
  const { id } = useParams<{ id: string }>();
  const formId = Number(id);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedSub, setSelectedSub] = useState<ReportFormSubmission | null>(null);

  const { data: form, isLoading: formLoading } = useQuery({
    queryKey: ['report-form', formId],
    queryFn: () => fetchFormById(formId),
    enabled: !!formId,
  });

  const { data: submissions = [], isLoading: subsLoading } = useQuery({
    queryKey: ['report-fill-submissions', formId],
    queryFn: () => fetchFormSubmissions(formId),
    enabled: !!formId,
  });

  if (formLoading || !form) {
    return (
      <AdminPageShell>
        <p className="text-sm text-[var(--app-color-text-tertiary)] p-4">加载中...</p>
      </AdminPageShell>
    );
  }

  const layout = parseLayoutJson(form.layoutJson);
  const fieldCells = layout.cells.filter(c => c.kind === 'field' && c.fieldKey);
  const fields = layout.fields;
  const fillMode = parseFillMode(form.fillPolicyJson);
  const batchExportName = (ext: string) => buildReportExportFilename({
    formName: form.name,
    extension: ext,
    fillMode,
    batch: true,
  });

  const statusBadge = (status: string) => (
    <span className={`px-1.5 py-0 rounded text-[10px] font-medium ${
      status === 'submitted'
        ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]'
        : 'text-[var(--app-color-text-tertiary)]'
    }`}>
      {status === 'submitted' ? '已提交' : '草稿'}
    </span>
  );

  return (
    <AdminPageShell>
      {/* Mode toggle + Export */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setViewMode('table')}
          className={`px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium flex items-center gap-1 transition-colors ${
            viewMode === 'table' ? 'bg-[var(--app-color-accent)] text-white' : 'border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]'
          }`}>
          <Table2 className="w-3.5 h-3.5" /> 表格模式
        </button>
        <button onClick={() => setViewMode('detail')}
          className={`px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium flex items-center gap-1 transition-colors ${
            viewMode === 'detail' ? 'bg-[var(--app-color-accent)] text-white' : 'border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]'
          }`}>
          <Eye className="w-3.5 h-3.5" /> 逐份查看
        </button>
        <span className="w-px h-5 bg-[var(--app-color-border-default)]" />
        <button onClick={() => exportExcel(formId, undefined, batchExportName('xlsx'))}
          disabled={submissions.length === 0}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-30 flex items-center gap-1">
          <FileSpreadsheet className="w-3.5 h-3.5" /> 批量 Excel
        </button>
        <button onClick={() => exportPdf(formId, undefined, batchExportName('pdf'))}
          disabled={submissions.length === 0}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-30 flex items-center gap-1">
          <Download className="w-3.5 h-3.5" /> 批量 PDF
        </button>
        <button onClick={async () => {
          try {
            const wtList = await fetchWordTemplates(formId);
            if (wtList.length === 0) { toast.error('未绑定 Word 模板，请先在设计器中上传'); return; }
            // 使用第一个模板导出
            const firstSub = submissions[0];
            await exportWord(
              formId,
              wtList[0].id,
              firstSub?.id,
              undefined,
              buildReportExportFilename({
                formName: form.name,
                extension: 'docx',
                fillMode,
                instanceLabel: firstSub?.instanceLabel,
              }),
            );
          } catch (e) { toast.error('Word 导出失败: ' + (e as Error).message); }
        }}
          disabled={submissions.length === 0}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-30 flex items-center gap-1">
          <FileText className="w-3.5 h-3.5" /> Word
        </button>
      </div>

      {subsLoading ? (
        <p className="text-sm text-[var(--app-color-text-tertiary)]">加载提交记录...</p>
      ) : submissions.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="w-12 h-12 text-[var(--app-color-text-tertiary)] mx-auto mb-3" />
          <p className="text-sm text-[var(--app-color-text-tertiary)]">暂无提交记录</p>
        </div>
      ) : viewMode === 'table' ? (
        /* Table mode */
        <div className="overflow-auto rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)]">
          <table className="min-w-full text-sm border-collapse">
            <thead className="bg-[var(--app-color-surface-container)]">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-[var(--app-color-text-secondary)]">
                  <User className="w-3.5 h-3.5 inline mr-1" />填写人
                </th>
                {fieldCells.map(cell => (
                  <th key={cell.id} className="px-3 py-2 text-left text-[11px] font-medium text-[var(--app-color-text-secondary)]">
                    {fields[cell.fieldKey!]?.label || cell.fieldKey}
                  </th>
                ))}
                <th className="px-3 py-2 text-left text-[11px] font-medium text-[var(--app-color-text-secondary)]">状态</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-[var(--app-color-text-secondary)]">
                  <Clock className="w-3.5 h-3.5 inline mr-1" />时间
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--app-color-border-default)]">
              {submissions.map(sub => (
                <tr key={sub.id} className="hover:bg-[var(--app-color-surface-hover)] cursor-pointer"
                  onClick={() => { setSelectedSub(sub); setViewMode('detail'); }}>
                  <td className="px-3 py-2 text-[var(--app-color-text-primary)]">{submissionUserLabel(sub)}</td>
                  {fieldCells.map(cell => (
                    <td key={cell.id} className="px-3 py-2 text-xs text-[var(--app-color-text-secondary)] max-w-[150px] truncate">
                      {String(sub.fieldValuesJson?.[cell.fieldKey!] ?? '—')}
                    </td>
                  ))}
                  <td className="px-3 py-2">{statusBadge(sub.status)}</td>
                  <td className="px-3 py-2 text-xs text-[var(--app-color-text-tertiary)]">
                    {sub.updatedAt ? formatDateTimeAsiaShanghaiShort(sub.updatedAt) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Detail mode */
        <div className="flex gap-4">
          {/* Left: user list */}
          <div className="w-[220px] shrink-0 space-y-1">
            <h3 className="text-[11px] font-semibold text-[var(--app-color-text-secondary)] uppercase tracking-wider mb-2">
              提交人
            </h3>
            {submissions.map(sub => (
              <button
                key={sub.id}
                onClick={() => setSelectedSub(sub)}
                className={`w-full text-left px-3 py-2 rounded-[var(--app-radius-element)] text-xs transition-colors ${
                  selectedSub?.id === sub.id
                    ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)] font-medium'
                    : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <User className="w-3 h-3" />
                  {submissionUserLabel(sub)}
                </div>
                <div className="flex items-center gap-2 mt-0.5 ml-5">
                  {statusBadge(sub.status)}
                  <span className="text-[10px] text-[var(--app-color-text-tertiary)]">
                    {sub.updatedAt ? formatDateTimeAsiaShanghaiShort(sub.updatedAt).slice(0, 10) : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {/* Right: selected submission detail */}
          <div className="flex-1 min-w-0">
            {selectedSub ? (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <CheckCircle className={`w-4 h-4 ${selectedSub.status === 'submitted' ? 'text-[var(--app-color-accent)]' : 'text-[var(--app-color-text-tertiary)]'}`} />
                  <span className="text-xs text-[var(--app-color-text-secondary)]">
                    {submissionUserLabel(selectedSub)} · {statusBadge(selectedSub.status)}
                  </span>
                  <span className="text-[10px] text-[var(--app-color-text-tertiary)]">
                    v{selectedSub.version}
                  </span>
                </div>
                <FormGridRenderer
                  layout={layout}
                  themeJson={form.themeJson}
                  formSource={form.source}
                  values={selectedSub.fieldValuesJson || {}}
                  editable={false}
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--app-color-text-tertiary)] py-8 text-center">
                从左侧选择一份提交查看详情
              </p>
            )}
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
