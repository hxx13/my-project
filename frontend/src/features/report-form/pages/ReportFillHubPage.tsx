import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import {
  fetchAvailableForms,
  fetchMySubmissions,
  fetchPublisherOverview,
  createSubmissionInstance,
  deleteSubmissionInstance,
} from '../api/reportFill.api';
import FormExportActions from '../components/FormExportActions';
import type { FillPolicyJson, PublisherFillGroup, ReportFormDefinition, ReportFormSubmission } from '../types';
import { ClipboardCheck, ChevronDown, ChevronRight, User, Clock, Plus, FileText, Users, Trash2 } from 'lucide-react';
import { formatDateTimeAsiaShanghaiShort } from '@/lib/formatDateTimeAsiaShanghai';
import toast from 'react-hot-toast';
import {
  readReportFillHubSession,
  snapshotReportFillHubSession,
  writeReportFillHubSession,
} from '../utils/reportFillHubSession';

function fmtTime(raw: string | undefined | null): string {
  return formatDateTimeAsiaShanghaiShort(raw);
}

function parseFillPolicy(form: ReportFormDefinition): FillPolicyJson {
  if (typeof form.fillPolicyJson === 'string') {
    try { return JSON.parse(form.fillPolicyJson); } catch { return { mode: 'shared', submitLabel: '提交', allowEditAfterSubmit: true }; }
  }
  return (form.fillPolicyJson as FillPolicyJson) || { mode: 'shared', submitLabel: '提交', allowEditAfterSubmit: true };
}

function instanceDisplayLabel(sub: ReportFormSubmission): string {
  const label = sub.instanceLabel?.trim();
  if (label) return label;
  return '默认';
}

export default function ReportFillHubPage() {
  const navigate = useNavigate();
  const restoredScrollRef = useRef(false);
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    const session = readReportFillHubSession();
    return new Set(session?.expandedFormIds ?? []);
  });

  const persistExpanded = useCallback((next: Set<number>) => {
    writeReportFillHubSession({ expandedFormIds: [...next] });
  }, []);

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ['report-fill-available'],
    queryFn: fetchAvailableForms,
    staleTime: 0,
    refetchOnMount: true,
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        writeReportFillHubSession({
          scrollY: window.scrollY || document.documentElement.scrollTop || 0,
        });
      }, 120);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useLayoutEffect(() => {
    if (isLoading || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    const session = readReportFillHubSession();
    if (!session) return;
    if (session.scrollY > 0) {
      window.scrollTo({ top: session.scrollY, behavior: 'auto' });
    }
    if (session.lastFormId != null) {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-report-fill-form-id="${session.lastFormId}"]`);
        el?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      });
    }
  }, [isLoading, forms.length]);

  const toggleExpand = (formId: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(formId)) next.delete(formId);
      else next.add(formId);
      persistExpanded(next);
      return next;
    });
  };

  const openFill = (formId: number, submissionId?: number) => {
    const next = new Set(expanded);
    next.add(formId);
    setExpanded(next);
    snapshotReportFillHubSession(next, { lastFormId: formId, lastSubmissionId: submissionId });
    const qs = submissionId != null ? `?submissionId=${submissionId}` : '';
    navigate(`/admin/report-fill/${formId}${qs}`, {
      state: { returnTo: '/admin/report-fill' },
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
              onOpen={(submissionId) => openFill(form.id, submissionId)}
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
  onOpen: (submissionId?: number) => void;
}) {
  const queryClient = useQueryClient();
  const fillPolicy = parseFillPolicy(form);
  const mode = fillPolicy.mode || 'shared';
  const multi = mode === 'individual' && !!fillPolicy.allowMultipleInstances;
  const isPublisher = !!form.publisher;

  const { data: myInstances = [] } = useQuery({
    queryKey: ['report-fill-my-submissions', form.id],
    queryFn: () => fetchMySubmissions(form.id),
    enabled: expanded && multi,
  });

  const { data: publisherGroups = [] } = useQuery({
    queryKey: ['report-fill-publisher-overview', form.id],
    queryFn: () => fetchPublisherOverview(form.id),
    enabled: expanded && isPublisher,
  });

  const [newLabel, setNewLabel] = useState('');

  const createMut = useMutation({
    mutationFn: (label: string) => createSubmissionInstance(form.id, label),
    onSuccess: (sub) => {
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      queryClient.setQueryData<ReportFormSubmission[]>(['report-fill-my-submissions', form.id], (prev = []) => [sub, ...prev]);
      queryClient.invalidateQueries({ queryKey: ['report-fill-available'] });
      setNewLabel('');
      toast.success('已创建子文件');
      onOpen(sub.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (submissionId: number) => deleteSubmissionInstance(form.id, submissionId),
    onSuccess: (_data, submissionId) => {
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      queryClient.setQueryData<ReportFormSubmission[]>(
        ['report-fill-my-submissions', form.id],
        (prev = []) => prev.filter(s => s.id !== submissionId),
      );
      queryClient.setQueryData<PublisherFillGroup[]>(
        ['report-fill-publisher-overview', form.id],
        (prev = []) => prev
          .map(g => {
            const instances = g.instances.filter(s => s.id !== submissionId);
            return { ...g, instances, instanceCount: instances.length };
          })
          .filter(g => g.instances.length > 0),
      );
      queryClient.invalidateQueries({ queryKey: ['report-fill-available'] });
      toast.success('已删除子文件');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = (sub: ReportFormSubmission) => {
    if (!confirm(`确定删除子文件「${instanceDisplayLabel(sub)}」？此操作不可恢复。`)) return;
    deleteMut.mutate(sub.id);
  };

  const openDefault = () => {
    if (multi) {
      if (myInstances.length > 0) onOpen(myInstances[0].id);
      else onToggle();
      return;
    }
    onOpen();
  };

  return (
    <div
      data-report-fill-form-id={form.id}
      className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={onToggle} className="p-1 rounded-[var(--app-radius-element)] hover:bg-[var(--app-color-surface-hover)]">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-[var(--app-color-text-secondary)]" />
            : <ChevronRight className="w-4 h-4 text-[var(--app-color-text-secondary)]" />
          }
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={openDefault}>
          <div className="text-[13px] font-semibold text-[var(--app-color-text-primary)]">{form.name}</div>
          <div className="text-[11px] text-[var(--app-color-text-tertiary)] mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
            <span>{mode === 'shared' ? '协同表' : multi ? '个人表·多份' : '个人表'}</span>
            {isPublisher && (
              <span className="px-1.5 py-0 rounded text-[10px] bg-[var(--app-color-feedback-warning-soft)] text-[var(--app-color-feedback-warning)]">
                我发布的
              </span>
            )}
            {multi && (form.myInstanceCount ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" /> 我的 {form.myInstanceCount} 份
              </span>
            )}
            {isPublisher && (form.totalFillerCount ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" /> {form.totalFillerCount} 人 · {form.totalSubmissionCount} 份
              </span>
            )}
            {form.myFillStatus && !multi && (
              <span className={`px-1.5 py-0 rounded text-[10px] ${
                form.myFillStatus === 'submitted'
                  ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]'
                  : 'bg-[var(--app-color-surface-page)] text-[var(--app-color-text-tertiary)]'
              }`}>
                {form.myFillStatus === 'submitted' ? (fillPolicy.submitLabel || '已提交') : '草稿'}
              </span>
            )}
            {form.source && (
              <span className="text-[10px] px-1 rounded bg-[var(--app-color-surface-container)]">
                {form.source === 'excel' ? '📊Excel' : form.source === 'word' ? '📝Word' : form.source === 'template' ? '📋模板' : '📄空白'}
              </span>
            )}
            {form.publishedBy && (
              <span className="flex items-center gap-1 text-[var(--app-color-text-secondary)]">
                <User className="w-3 h-3" />发布者 {form.publishedBy}
                {form.publishedAt && <span>· {fmtTime(form.publishedAt)}</span>}
              </span>
            )}
            {form.lastFillUpdatedAt && (
              <span className="flex items-center gap-1 text-[var(--app-color-text-secondary)]">
                <Clock className="w-3 h-3" />最近保存 {fmtTime(form.lastFillUpdatedAt)}
              </span>
            )}
          </div>
        </div>
        <div onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
          <FormExportActions
            form={form}
            context="fill"
            submissionId={form.mySubmissionId}
          />
        </div>
        <button
          type="button"
          onClick={openDefault}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium
                     bg-[var(--app-color-accent)] text-white hover:opacity-90 transition-opacity"
        >
          {mode === 'shared' ? '打开' : multi ? '填报' : '填报'}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-4 py-3 text-xs text-[var(--app-color-text-secondary)] space-y-3">
          {mode === 'shared' ? (
            <div>协同编辑模式 — 所有人共同填写同一份数据</div>
          ) : multi ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-[var(--app-color-text-secondary)]">
                <User className="w-3.5 h-3.5" /> 个人多份模式 — 可为同一模板创建多份子文件分别填写
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="新子文件名称（可留空自动命名）"
                  className="min-w-[180px] flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-1.5 text-[12px] text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]"
                />
                <button
                  type="button"
                  disabled={createMut.isPending}
                  onClick={() => createMut.mutate(newLabel.trim())}
                  className="px-3 py-1.5 rounded-[var(--app-radius-element)] text-[12px] font-medium bg-[var(--app-color-accent)] text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> 新建子文件
                </button>
              </div>
              {myInstances.length === 0 ? (
                <p className="text-[var(--app-color-text-tertiary)]">尚未创建子文件，请先新建</p>
              ) : (
                <ul className="space-y-1">
                  {myInstances.map(sub => (
                    <InstanceRow
                      key={sub.id}
                      sub={sub}
                      fillPolicy={fillPolicy}
                      onOpen={() => onOpen(sub.id)}
                      onDelete={() => handleDelete(sub)}
                      deleting={deleteMut.isPending && deleteMut.variables === sub.id}
                    />
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> 个人填报 — 每人独立一份记录
            </div>
          )}

          {isPublisher && (
            <div className="pt-2 border-t border-[var(--app-color-border-default)] space-y-2">
              <div className="text-[11px] font-semibold text-[var(--app-color-text-primary)] flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> 发布者管理 — 全部填报记录
              </div>
              {publisherGroups.length === 0 ? (
                <p className="text-[var(--app-color-text-tertiary)]">暂无人填报</p>
              ) : (
                publisherGroups.map((group: PublisherFillGroup) => (
                  <div key={group.userId} className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2">
                    <div className="text-[12px] font-medium text-[var(--app-color-text-primary)] mb-1.5">
                      {group.displayNickname} <span className="text-[var(--app-color-text-tertiary)] font-normal">（{group.instanceCount} 份）</span>
                    </div>
                    <ul className="space-y-1">
                      {group.instances.map(sub => (
                        <InstanceRow
                          key={sub.id}
                          sub={sub}
                          fillPolicy={fillPolicy}
                          onOpen={() => onOpen(sub.id)}
                          showExport
                          form={form}
                          onDelete={() => handleDelete(sub)}
                          deleting={deleteMut.isPending && deleteMut.variables === sub.id}
                        />
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InstanceRow({
  sub,
  fillPolicy,
  onOpen,
  showExport,
  form,
  onDelete,
  deleting,
}: {
  sub: ReportFormSubmission;
  fillPolicy: FillPolicyJson;
  onOpen: () => void;
  showExport?: boolean;
  form?: ReportFormDefinition;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 rounded-[var(--app-radius-element)] px-2 py-1.5 hover:bg-[var(--app-color-surface-hover)]">
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className="text-[12px] text-[var(--app-color-text-primary)] truncate">{instanceDisplayLabel(sub)}</div>
        <div className="text-[10px] text-[var(--app-color-text-tertiary)] flex gap-2">
          <span className={sub.status === 'submitted' ? 'text-[var(--app-color-accent)]' : ''}>
            {sub.status === 'submitted' ? (fillPolicy.submitLabel || '已提交') : '草稿'}
          </span>
          {sub.updatedAt && <span>更新 {fmtTime(sub.updatedAt)}</span>}
        </div>
      </button>
      {showExport && form && (
        <div onClick={e => e.stopPropagation()}>
          <FormExportActions
            form={form}
            context="fill"
            submissionId={sub.id}
            buttonClassName="px-2 py-1 rounded-[var(--app-radius-element)] text-[10px] font-medium border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] flex items-center gap-1"
          />
        </div>
      )}
      {onDelete && (
        <button
          type="button"
          disabled={deleting}
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="删除子文件"
          className="p-1.5 rounded-[var(--app-radius-element)] text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)] disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  );
}
