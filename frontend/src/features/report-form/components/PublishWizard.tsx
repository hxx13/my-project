// components/PublishWizard.tsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { Send, X, ChevronRight, ChevronLeft } from 'lucide-react';
import { adminHttp } from '@/api/core/adminHttp';
import type { FillMode, PermissionJson, ScheduleJson, FillPolicyJson } from '../types';
import PermissionPanel from './PermissionPanel';
import type { LayoutJson } from '../types';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  formId: number;
  layout: LayoutJson;
  /** initial：首次发布；reset：修改发布条件后重新发布 */
  intent?: 'initial' | 'reset';
  initialFillPolicy?: FillPolicyJson;
  initialPermission?: PermissionJson;
  initialSchedule?: ScheduleJson;
  /** 发布成功后刷新列表/详情 */
  onPublished?: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  STUDENT: '学生',
  STAFF: '普通员工',
  SENIOR: '高级员工',
  ADMIN: '管理员',
  SUPER_ADMIN: '超级管理员',
  PLATFORM_OWNER: '平台所有者',
};
const inputClass = "w-full rounded-[6px] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";
const labelClass = "text-[11px] font-medium text-[var(--app-color-text-secondary)] mb-0.5 block";

export default function PublishWizard({
  open,
  onClose,
  formId,
  layout,
  intent = 'initial',
  initialFillPolicy,
  initialPermission,
  initialSchedule,
  onPublished,
}: Props) {
  const isReset = intent === 'reset';
  const [mode, setMode] = useState<'quick' | 'wizard' | null>(isReset ? 'wizard' : null);
  const [step, setStep] = useState(0);
  const [fillMode, setFillMode] = useState<FillMode>('shared');
  const [allowMultipleInstances, setAllowMultipleInstances] = useState(false);
  const [permission, setPermission] = useState<PermissionJson>({
    visibleRoles: ['STAFF'],
    visibleUserIds: [],
    fieldRoleBindings: {},
    allowUnboundView: true,
  });
  const [schedule, setSchedule] = useState<ScheduleJson>({
    period: 'manual',
  });

  useEffect(() => {
    if (!open) return;
    if (!isReset) {
      setMode(null);
      setStep(0);
      setFillMode('shared');
      setAllowMultipleInstances(false);
      setPermission({
        visibleRoles: ['STAFF'],
        visibleUserIds: [],
        fieldRoleBindings: {},
        allowUnboundView: true,
      });
      setSchedule({ period: 'manual' });
      return;
    }
    setMode('wizard');
    setStep(0);
    const fp = initialFillPolicy;
    setFillMode(fp?.mode === 'individual' ? 'individual' : 'shared');
    setAllowMultipleInstances(!!fp?.allowMultipleInstances);
    if (initialPermission) setPermission(initialPermission);
    if (initialSchedule) setSchedule(initialSchedule);
  }, [open, isReset, initialFillPolicy, initialPermission, initialSchedule]);

  const minEditRole = permission.visibleRoles?.[0] || '';

  const publishMut = useMutation({
    mutationFn: () => adminHttp.post(`/report-form/forms/${formId}/publish`),
    onSuccess: () => {
      toast.success(isReset ? '发布条件已更新并重新发布' : '发布成功');
      onPublished?.();
      onClose();
    },
    onError: (e: Error) => toast.error('发布失败: ' + e.message),
  });

  if (!open) return null;

  const handleWizardPublish = () => {
    const body = {
      fillPolicyJson: JSON.stringify({
        mode: fillMode,
        submitLabel: '提交',
        allowEditAfterSubmit: true,
        allowMultipleInstances: fillMode === 'individual' && allowMultipleInstances,
      }),
      permissionJson: JSON.stringify(permission),
      scheduleJson: JSON.stringify(schedule),
    };
    adminHttp.put(`/report-form/forms/${formId}`, body).then(() => {
      publishMut.mutate();
    }).catch((e: Error) => toast.error('保存失败: ' + e.message));
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 800 }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-elevated)] p-5 shadow-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--app-color-text-primary)]">
            {isReset ? '重置发布条件' : '发布报表'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-[6px] hover:bg-[var(--app-color-surface-hover)]">
            <X className="w-4 h-4 text-[var(--app-color-text-secondary)]" />
          </button>
        </div>

        {!mode ? (
          /* Mode selection — 仅首次发布 */
          <div className="space-y-3">
            <p className="text-xs text-[var(--app-color-text-secondary)]">选择发布方式：</p>
            <button
              onClick={() => setMode('quick')}
              className="w-full p-4 rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] hover:border-[var(--app-color-accent)] text-left transition-colors"
            >
              <div className="text-[13px] font-semibold text-[var(--app-color-text-primary)]">快速发布</div>
              <div className="text-[11px] text-[var(--app-color-text-tertiary)] mt-1">选模式 + 可见角色 → 一键发布</div>
            </button>
            <button
              onClick={() => { setMode('wizard'); setStep(0); }}
              className="w-full p-4 rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] hover:border-[var(--app-color-accent)] text-left transition-colors"
            >
              <div className="text-[13px] font-semibold text-[var(--app-color-text-primary)]">分步向导</div>
              <div className="text-[11px] text-[var(--app-color-text-tertiary)] mt-1">Step 1: 模式 → Step 2: 权限+周期 → Step 3: 确认</div>
            </button>
          </div>
        ) : mode === 'quick' ? (
          /* Quick publish — 一键发布，默认：协同模式 + 全员可见 + 不限时间 */
          <div className="space-y-3">
            <div className="p-3 rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-container)]">
              <p className="text-[11px] text-[var(--app-color-text-secondary)]">一键发布，使用默认设置：</p>
              <ul className="text-[10px] text-[var(--app-color-text-tertiary)] mt-1.5 space-y-0.5 list-disc list-inside">
                <li>协作模式：多人同表</li>
                <li>可见范围：所有角色可见</li>
                <li>时间限制：无（随时可填）</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--app-color-border-default)]">
              <button onClick={() => setMode(null)}
                className="px-4 py-1.5 rounded-[6px] text-[12px] border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]">返回</button>
              <button onClick={async () => {
                // 一键发布：设置默认值后直接发布
                const body = {
                  fillPolicyJson: JSON.stringify({ mode: 'shared', submitLabel: '提交', allowEditAfterSubmit: true }),
                  permissionJson: JSON.stringify({ visibleRoles: ['STAFF'], visibleUserIds: [], fieldRoleBindings: {}, allowUnboundView: true }),
                  scheduleJson: JSON.stringify({ period: 'manual' }),
                };
                try {
                  await adminHttp.put(`/report-form/forms/${formId}`, body);
                  publishMut.mutate();
                } catch (e) { toast.error('保存失败: ' + (e as Error).message); }
              }} disabled={publishMut.isPending}
                className="px-4 py-1.5 rounded-[6px] text-[12px] font-medium bg-[var(--app-color-accent)] text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
                <Send className="w-3.5 h-3.5" /> {publishMut.isPending ? '发布中...' : '一键发布'}
              </button>
            </div>
          </div>
        ) : (
          /* Step-by-step wizard */
          <div className="space-y-3">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-4">
              {['模式', '权限', '确认'].map((label, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium ${
                    i <= step ? 'bg-[var(--app-color-accent)] text-white' : 'bg-[var(--app-color-surface-container)] text-[var(--app-color-text-tertiary)]'
                  }`}>{i + 1}</div>
                  <span className={`text-[11px] ${i <= step ? 'text-[var(--app-color-text-primary)] font-medium' : 'text-[var(--app-color-text-tertiary)]'}`}>{label}</span>
                  {i < 2 && <ChevronRight className="w-3 h-3 text-[var(--app-color-border-default)]" />}
                </div>
              ))}
            </div>

            {step === 0 && (
              <div className="space-y-3">
                <label className={labelClass}>填报模式</label>
                <div className="flex gap-2">
                  <button onClick={() => setFillMode('shared')}
                    className={`flex-1 px-3 py-2 rounded-[6px] text-[12px] font-medium transition-colors ${fillMode === 'shared' ? 'bg-[var(--app-color-accent)] text-white' : 'border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]'}`}>协同表</button>
                  <button onClick={() => setFillMode('individual')}
                    className={`flex-1 px-3 py-2 rounded-[6px] text-[12px] font-medium transition-colors ${fillMode === 'individual' ? 'bg-[var(--app-color-accent)] text-white' : 'border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]'}`}>个人表</button>
                </div>
                {fillMode === 'individual' && (
                  <label className="flex items-center gap-2 text-[12px] text-[var(--app-color-text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowMultipleInstances}
                      onChange={e => setAllowMultipleInstances(e.target.checked)}
                      className="rounded border-[var(--app-color-border-default)]"
                    />
                    允许每人创建多份子文件（如多份实验记录、多份申请）
                  </label>
                )}
                <div>
                  <label className={labelClass}>周期</label>
                  <select value={schedule.period} onChange={e => setSchedule({ ...schedule, period: e.target.value as ScheduleJson['period'] })}
                    className={inputClass}>
                    <option value="manual">手动（不自动重复）</option>
                    <option value="daily">每日</option>
                    <option value="weekly">每周</option>
                    <option value="monthly">每月</option>
                  </select>
                </div>
                {schedule.period !== 'manual' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>开放时间</label>
                      <input type="time" value={schedule.timeWindowStart || ''} onChange={e => setSchedule({ ...schedule, timeWindowStart: e.target.value })}
                        className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>关闭时间</label>
                      <input type="time" value={schedule.timeWindowEnd || ''} onChange={e => setSchedule({ ...schedule, timeWindowEnd: e.target.value })}
                        className={inputClass} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 1 && (
              <PermissionPanel permission={permission} layout={layout} onChange={setPermission} />
            )}

            {step === 2 && (
              <div className="space-y-2">
                <div className="p-3 rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-container)]">
                  <div className="text-[11px] text-[var(--app-color-text-secondary)]">模式：{fillMode === 'shared' ? '协同表（多人同表）' : `个人表（每人${allowMultipleInstances ? '可多份' : '一份'}）`}</div>
                  <div className="text-[11px] text-[var(--app-color-text-secondary)] mt-1">
                    最低可编辑角色：{ROLE_LABELS[minEditRole] || minEditRole || '所有人'} 及以上
                  </div>
                  <div className="text-[11px] text-[var(--app-color-text-secondary)] mt-1">周期：{schedule.period === 'manual' ? '手动' : schedule.period}</div>
                  <div className="text-[11px] text-[var(--app-color-text-secondary)] mt-1">字段绑定：{Object.keys(permission.fieldRoleBindings).length} 个字段有角色限制</div>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-3 border-t border-[var(--app-color-border-default)]">
              <button onClick={() => { if (step === 0) setMode(null); else setStep(step - 1); }}
                className="px-4 py-1.5 rounded-[6px] text-[12px] border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] flex items-center gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> {step === 0 ? '返回' : '上一步'}
              </button>
              {step < 2 ? (
                <button onClick={() => setStep(step + 1)}
                  className="px-4 py-1.5 rounded-[6px] text-[12px] font-medium bg-[var(--app-color-accent)] text-white hover:opacity-90 flex items-center gap-1">
                  下一步 <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button onClick={handleWizardPublish} disabled={publishMut.isPending}
                  className="px-4 py-1.5 rounded-[6px] text-[12px] font-medium bg-[var(--app-color-accent)] text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
                  <Send className="w-3.5 h-3.5" /> {publishMut.isPending ? '发布中...' : (isReset ? '确认并重新发布' : '确认发布')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  , document.body);
}
