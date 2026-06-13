import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { fetchAvailableForms, fetchFormSubmissions } from '../api/reportFill.api';
import type { ReportFormDefinition, ReportFormSubmission } from '../types';
import { ClipboardCheck, ChevronDown, ChevronRight, User, Clock } from 'lucide-react';

export default function ReportFillHubPage() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ['report-fill-available'],
    queryFn: fetchAvailableForms,
  });

  const toggleExpand = (formId: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(formId)) next.delete(formId);
      else next.add(formId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <AdminPageShell title="填报中心" description="浏览并填写已发布的报表">
        <p className="text-sm text-[var(--app-color-text-tertiary)] p-4">加载中...</p>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell title="填报中心" description="浏览并填写已发布的报表">
      <div className="space-y-4">
        {forms.length === 0 ? (
          <div className="p-8 text-center">
            <ClipboardCheck className="w-12 h-12 text-[var(--app-color-text-tertiary)] mx-auto mb-3" />
            <p className="text-sm text-[var(--app-color-text-tertiary)]">暂无已发布的报表</p>
          </div>
        ) : (
          forms.map(form => (
            <FormCard
              key={form.id}
              form={form}
              expanded={expanded.has(form.id)}
              onToggle={() => toggleExpand(form.id)}
              onOpen={() => navigate(`/admin/report-fill/${form.id}`)}
            />
          ))
        )}
      </div>
    </AdminPageShell>
  );
}

function FormCard({ form, expanded, onToggle, onOpen }: {
  form: ReportFormDefinition;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const mode = form.fillPolicyJson?.mode || 'shared';
  const fillPolicy = form.fillPolicyJson;

  const { data: submissions = [] } = useQuery({
    queryKey: ['report-fill-submissions', form.id],
    queryFn: () => fetchFormSubmissions(form.id),
    enabled: expanded,
  });

  return (
    <div className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={onToggle} className="p-1 rounded-[var(--app-radius-element)] hover:bg-[var(--app-color-surface-hover)]">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-[var(--app-color-text-secondary)]" />
            : <ChevronRight className="w-4 h-4 text-[var(--app-color-text-secondary)]" />
          }
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
          <div className="text-[13px] font-semibold text-[var(--app-color-text-primary)]">{form.name}</div>
          <div className="text-[11px] text-[var(--app-color-text-tertiary)] mt-0.5">
            {mode === 'shared' ? '协同表' : '个人表'}
            {form.description && ` · ${form.description}`}
          </div>
        </div>
        <button
          onClick={onOpen}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium
                     bg-[var(--app-color-accent)] text-white hover:opacity-90 transition-opacity"
        >
          {mode === 'shared' ? '打开' : '填报'}
        </button>
      </div>

      {/* Expanded submissions */}
      {expanded && (
        <div className="border-t border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)]">
          {mode === 'shared' ? (
            <div className="px-4 py-3 text-xs text-[var(--app-color-text-secondary)]">
              协同编辑模式 — 所有人共同填写同一份数据
            </div>
          ) : submissions.length === 0 ? (
            <div className="px-4 py-3 text-xs text-[var(--app-color-text-tertiary)]">
              暂无提交记录
            </div>
          ) : (
            <div className="divide-y divide-[var(--app-color-border-default)]">
              {submissions.map(sub => (
                <div key={sub.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                  <User className="w-3.5 h-3.5 text-[var(--app-color-text-tertiary)]" />
                  <span className="text-[var(--app-color-text-primary)]">用户 #{sub.userId}</span>
                  <span className={`px-1.5 py-0 rounded text-[10px] ${
                    sub.status === 'submitted'
                      ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]'
                      : 'bg-[var(--app-color-surface-container)] text-[var(--app-color-text-tertiary)]'
                  }`}>
                    {sub.status === 'submitted' ? fillPolicy?.submitLabel || '已提交' : '草稿'}
                  </span>
                  <Clock className="w-3 h-3 text-[var(--app-color-text-tertiary)] ml-auto" />
                  <span className="text-[var(--app-color-text-tertiary)]">
                    {sub.updatedAt ? new Date(sub.updatedAt).toLocaleDateString() : '-'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
