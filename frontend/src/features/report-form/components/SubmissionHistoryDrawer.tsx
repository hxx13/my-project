import { useQuery } from '@tanstack/react-query';
import { X, History } from 'lucide-react';
import { fetchSubmissionLogs } from '../api/reportFill.api';
import { normalizeBlocks } from '../utils/reportFormBlocks';
import { formatDateTimeAsiaShanghaiShort } from '@/lib/formatDateTimeAsiaShanghai';

interface Props {
  formId: number;
  submissionId: number;
  onClose: () => void;
}

const ACTION_LABEL: Record<string, string> = {
  save: '保存',
  submit: '提交',
  'save-block': '保存（单张表）',
  'add-block': '新增一张表',
  'delete-block': '删除一张表',
};

export default function SubmissionHistoryDrawer({ formId, submissionId, onClose }: Props) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['report-fill-submission-logs', formId, submissionId],
    queryFn: () => fetchSubmissionLogs(formId, submissionId),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25" onClick={onClose}>
      <div
        className="h-full w-[420px] max-w-full overflow-y-auto bg-[var(--app-color-surface-elevated)] p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] font-semibold text-[var(--app-color-text-primary)] flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> 操作历史
          </span>
          <button type="button" onClick={onClose}
            className="p-1 rounded-[var(--app-radius-element)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <p className="text-[12px] text-[var(--app-color-text-tertiary)]">加载中...</p>
        ) : logs.length === 0 ? (
          <p className="text-[12px] text-[var(--app-color-text-tertiary)]">暂无历史</p>
        ) : (
          <ul className="space-y-2">
            {logs.map(log => {
              const blocks = normalizeBlocks(log.fieldValuesSnapshotJson);
              return (
                <li key={log.id}
                  className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] p-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[var(--app-color-text-primary)]">
                      {ACTION_LABEL[log.action] || log.action}
                    </span>
                    <span className="text-[var(--app-color-text-tertiary)]">
                      {formatDateTimeAsiaShanghaiShort(log.createdAt)}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--app-color-text-tertiary)] mt-0.5">
                    用户 #{log.userId} · {blocks.length} 张表 ·{' '}
                    {blocks.reduce((n, b) => n + Object.values(b.values).filter(
                      v => v !== '' && v != null).length, 0)} 个已填字段
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
