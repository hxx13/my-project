import { FileSpreadsheet, FileText, Download } from 'lucide-react';
import type { FillMode, ReportFormDefinition } from '../types';
import { getFormExportCapabilities } from '../utils/reportFormExportOptions';
import { buildReportExportFilename, parseFillMode } from '../utils/reportFormExportFilename';
import { exportFormTemplateExcel, exportFormWordTemplate } from '../api/reportForm.api';
import { exportExcel, exportPdf, exportWord } from '../api/reportFill.api';
import toast from 'react-hot-toast';

type ExportContext = 'admin-template' | 'fill';

interface Props {
  form: ReportFormDefinition;
  /** admin-template：设计列表导出模板；fill：填报中心/填报页导出含数据 */
  context: ExportContext;
  submissionId?: number;
  /** 个人表：子文件名称 */
  instanceLabel?: string;
  fillMode?: FillMode;
  /** 导出前刷盘（如填报页自动保存 debounce 未落库）；可返回最新填报值供 Word 导出 */
  onBeforeExport?: () => Promise<Record<string, unknown> | void>;
  className?: string;
  buttonClassName?: string;
  /** compact：仅图标+短标签；menu：供下拉菜单项渲染 */
  variant?: 'toolbar' | 'menu';
  onDone?: () => void;
}

const btnBase =
  'px-2.5 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium ' +
  'border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] ' +
  'hover:bg-[var(--app-color-surface-hover)] flex items-center gap-1 transition-colors';

export default function FormExportActions({
  form,
  context,
  submissionId,
  instanceLabel,
  fillMode: fillModeProp,
  onBeforeExport,
  className = '',
  buttonClassName = btnBase,
  variant = 'toolbar',
  onDone,
}: Props) {
  const caps = getFormExportCapabilities(form);
  const fillMode = fillModeProp ?? parseFillMode(form.fillPolicyJson);

  const exportName = (extension: string, opts?: { batch?: boolean; wordTemplateName?: string }) =>
    buildReportExportFilename({
      formName: form.name || 'report-form',
      extension,
      fillMode,
      instanceLabel,
      batch: opts?.batch,
      wordTemplateName: opts?.wordTemplateName,
    });

  const run = async (label: string, fn: (latestValues?: Record<string, unknown>) => Promise<void>) => {
    try {
      const latestValues = await onBeforeExport?.();
      await fn(latestValues && typeof latestValues === 'object' ? latestValues : undefined);
      toast.success(`${label}已导出`);
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const actions: { key: string; label: string; icon: typeof FileSpreadsheet; show: boolean; run: (v?: Record<string, unknown>) => Promise<void> }[] = [];

  if (caps.excel) {
    actions.push({
      key: 'excel',
      label: 'Excel',
      icon: FileSpreadsheet,
      show: true,
      run: async () => {
        if (context === 'admin-template') {
          await exportFormTemplateExcel(form.id, exportName('xlsx'));
        } else {
          await exportExcel(form.id, submissionId, exportName('xlsx'));
        }
      },
    });
  }

  if (caps.word) {
    if (caps.wordTemplates.length <= 1) {
      actions.push({
        key: 'word',
        label: 'Word',
        icon: FileText,
        show: true,
        run: async (latestValues) => {
          if (context === 'admin-template') {
            const wtId = caps.wordTemplates[0]?.id;
            if (!wtId) throw new Error('未绑定 Word 模板');
            await exportFormWordTemplate(
              form.id, wtId, form.name || 'report-form', caps.wordTemplates[0]?.name,
            );
          } else {
            const wtId = caps.wordTemplates[0]?.id;
            if (!wtId) throw new Error('未绑定 Word 模板');
            if (!submissionId) throw new Error('请先保存或提交后再导出 Word');
            await exportWord(form.id, wtId, submissionId, latestValues, exportName('docx'));
          }
        },
      });
    } else {
      for (const wt of caps.wordTemplates) {
        actions.push({
          key: `word-${wt.id}`,
          label: variant === 'menu' ? `Word · ${wt.name}` : `Word(${wt.name})`,
          icon: FileText,
          show: true,
          run: async (latestValues) => {
            if (context === 'admin-template') {
              await exportFormWordTemplate(form.id, wt.id, form.name || 'report-form', wt.name);
            } else {
              if (!submissionId) throw new Error('请先保存或提交后再导出 Word');
              await exportWord(form.id, wt.id, submissionId, latestValues, exportName('docx'));
            }
          },
        });
      }
    }
  }

  if (context === 'fill' && caps.pdf) {
    actions.push({
      key: 'pdf',
      label: 'PDF',
      icon: Download,
      show: true,
      run: async () => exportPdf(form.id, submissionId, exportName('pdf')),
    });
  }

  const visible = actions.filter(a => a.show);
  if (visible.length === 0) return null;

  if (variant === 'menu') {
    return (
      <>
        {visible.map(a => (
          <button
            key={a.key}
            type="button"
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] text-left ${className}`}
            onClick={(e) => {
              e.stopPropagation();
              void run(a.label.replace(/^Word · /, 'Word '), a.run);
            }}
          >
            <a.icon className="w-3.5 h-3.5 shrink-0" /> {a.label}
          </button>
        ))}
      </>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {visible.map(a => (
        <button
          key={a.key}
          type="button"
          className={buttonClassName}
          title={`导出 ${a.label}`}
          onClick={(e) => {
            e.stopPropagation();
            void run(a.label, a.run);
          }}
        >
          <a.icon className="w-3.5 h-3.5" /> {a.label}
        </button>
      ))}
    </div>
  );
}

export { getFormExportCapabilities };
