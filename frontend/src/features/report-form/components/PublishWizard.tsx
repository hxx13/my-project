// components/PublishWizard.tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, X, ChevronRight, ChevronLeft } from 'lucide-react';
import { adminHttp } from '@/api/core/adminHttp';
import type { FillMode, PermissionJson, ScheduleJson } from '../types';
import PermissionPanel from './PermissionPanel';
import type { LayoutJson } from '../types';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  formId: number;
  layout: LayoutJson;
}

const ALL_ROLES = ['ADMIN', 'SUPER_ADMIN', 'STAFF', 'STUDENT', 'INSPECTOR'];
const inputClass = "w-full rounded-[6px] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";
const labelClass = "text-[11px] font-medium text-[var(--app-color-text-secondary)] mb-0.5 block";

export default function PublishWizard({ open, onClose, formId, layout }: Props) {
  const [mode, setMode] = useState<'quick' | 'wizard' | null>(null);
  const [step, setStep] = useState(0);
  const [fillMode, setFillMode] = useState<FillMode>('shared');
  const [visibleRoles, setVisibleRoles] = useState<string[]>(['STAFF']);
  const [permission, setPermission] = useState<PermissionJson>({
    visibleRoles: ['STAFF'],
    visibleUserIds: [],
    fieldRoleBindings: {},
    allowUnboundView: true,
  });
  const [schedule, setSchedule] = useState<ScheduleJson>({
    period: 'manual',
  });

  const publishMut = useMutation({
    mutationFn: () => adminHttp.post(`/report-form/forms/${formId}/publish`),
    onSuccess: () => { toast.success('发布成功'); onClose(); },
    onError: (e: Error) => toast.error('发布失败: ' + e.message),
  });

  const handleQuickPublish = () => {
    // First save permission, then publish
    const body = {
      fillPolicyJson: JSON.stringify({ mode: fillMode, submitLabel: '提交', allowEditAfterSubmit: true }),
      permissionJson: JSON.stringify({ ...permission, visibleRoles }),
      scheduleJson: JSON.stringify(schedule),
    };
    // Quick: save then publish
    adminHttp.put(`/report-form/forms/${formId}`, body).then(() => {
      publishMut.mutate();
    }).catch((e: Error) => toast.error('保存失败: ' + e.message));
  };

  if (!open) return null;

  // Sync visibleRoles from quick mode to permission object before publishing
  const handleWizardPublish = () => {
    const body = {
      fillPolicyJson: JSON.stringify({ mode: fillMode, submitLabel: '提交', allowEditAfterSubmit: true }),
      permissionJson: JSON.stringify({ ...permission, visibleRoles }),
      scheduleJson: JSON.stringify(schedule),
    };
    adminHttp.put(`/report-form/forms/${formId}`, body).then(() => {
      publishMut.mutate();
    }).catch((e: Error) => toast.error('保存失败: ' + e.message));
  };

  const toggleRole = (role: string) => {
    setVisibleRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-elevated)] p-5 shadow-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--app-color-text-primary)]">发布报表</h2>
          <button onClick={onClose} className="p-1 rounded-[6px] hover:bg-[var(--app-color-surface-hover)]">
            <X className="w-4 h-4 text-[var(--app-color-text-secondary)]" />
          </button>
        </div>

        {!mode ? (
          /* Mode selection */
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
          /* Quick publish */
          <div className="space-y-3">
            <div>
              <label className={labelClass}>填报模式</label>
              <div className="flex gap-2">
                <button onClick={() => setFillMode('shared')}
                  className={`flex-1 px-3 py-2 rounded-[6px] text-[12px] font-medium transition-colors ${
                    fillMode === 'shared' ? 'bg-[var(--app-color-accent)] text-white' : 'border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]'
                  }`}>协同表（多人同表）</button>
                <button onClick={() => setFillMode('individual')}
                  className={`flex-1 px-3 py-2 rounded-[6px] text-[12px] font-medium transition-colors ${
                    fillMode === 'individual' ? 'bg-[var(--app-color-accent)] text-white' : 'border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]'
                  }`}>个人表（每人一份）</button>
              </div>
            </div>
            <div>
              <label className={labelClass}>可见角色</label>
              <div className="flex flex-wrap gap-2">
                {ALL_ROLES.map(role => (
                  <label key={role} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={visibleRoles.includes(role)} onChange={() => toggleRole(role)}
                      className="w-3.5 h-3.5 accent-[var(--app-color-accent)]" />
                    <span className="text-[11px] text-[var(--app-color-text-secondary)]">{role}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--app-color-border-default)]">
              <button onClick={() => setMode(null)}
                className="px-4 py-1.5 rounded-[6px] text-[12px] border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]">返回</button>
              <button onClick={handleQuickPublish} disabled={publishMut.isPending}
                className="px-4 py-1.5 rounded-[6px] text-[12px] font-medium bg-[var(--app-color-accent)] text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
                <Send className="w-3.5 h-3.5" /> {publishMut.isPending ? '发布中...' : '发布'}
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
                  <div className="text-[11px] text-[var(--app-color-text-secondary)]">模式：{fillMode === 'shared' ? '协同表（多人同表）' : '个人表（每人一份）'}</div>
                  <div className="text-[11px] text-[var(--app-color-text-secondary)] mt-1">可见角色：{visibleRoles.join(', ') || '未选择'}</div>
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
                  <Send className="w-3.5 h-3.5" /> {publishMut.isPending ? '发布中...' : '确认发布'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
