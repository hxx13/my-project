import { useState, useEffect, useCallback } from 'react';
import { AdminFormCard } from '@/components/admin/AdminPageShell';
import { AdminButton } from '@/components/admin/AdminButton';
import {
  fetchDashboardPreviewConfig,
  putDashboardPreviewConfig,
  type DashboardPreviewConfig,
} from '@/api/domains/siteAdmin.api';
import { adminInputClass, adminLabelClass, adminHintClass } from '@/features/admin/adminFormUi';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════
   DashboardPreviewSettings
   Configure section text for /dashboard-preview
   ═══════════════════════════════════════════ */

const SECTION_LABELS = ['纵深', '暖光', '深空', '归来'];
const DEFAULT_TEXTS = [
  '每一次探索，都是对未知的致敬',
  '科学的光芒，照亮每一个生命的角落',
  '在微观世界里，发现宏观的奇迹',
  '严谨、仁爱、求实、创新——我们一直在路上',
];

export default function DashboardPreviewSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [textValues, setTextValues] = useState<string[]>(DEFAULT_TEXTS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchDashboardPreviewConfig();
        if (cancelled) return;
        if (cfg.sectionTexts?.length) {
          const merged = [...DEFAULT_TEXTS];
          cfg.sectionTexts.forEach((t, i) => { if (i < 4 && t) merged[i] = t; });
          setTextValues(merged);
        }
      } catch {
        toast.error('读取配置失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveAll = useCallback(async () => {
    setSaving(true);
    try {
      await putDashboardPreviewConfig({ sectionTexts: textValues });
      toast.success('已保存');
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  }, [textValues]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-4 py-3">
        <p className="text-sm text-[var(--app-color-text-secondary)]">编辑各区段文案后点击右侧按钮保存。</p>
        <AdminButton size="sm" tone="primary" loading={saving} disabled={loading} onClick={saveAll}>
          保存全部
        </AdminButton>
      </div>

      <AdminFormCard title="滚动文案" description="配置仪表盘预览页各区段的展示文案。">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-[var(--app-color-surface-hover)]" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {SECTION_LABELS.map((label, i) => (
              <div key={label} className="space-y-1.5">
                <label className={adminLabelClass}>场景 {i + 2} · {label}</label>
                <textarea
                  className={`${adminInputClass} w-full resize-none`}
                  rows={2}
                  value={textValues[i]}
                  onChange={(e) => {
                    const next = [...textValues];
                    next[i] = e.target.value;
                    setTextValues(next);
                  }}
                  placeholder={DEFAULT_TEXTS[i]}
                />
                <p className={adminHintClass}>默认：{DEFAULT_TEXTS[i]}</p>
              </div>
            ))}
          </div>
        )}
      </AdminFormCard>
    </div>
  );
}
