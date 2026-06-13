// ReportFillHubPage — 填报中心
import { AdminPageShell } from '@/components/admin/AdminPageShell';

export default function ReportFillHubPage() {
  return (
    <AdminPageShell title="填报中心" description="浏览并填写已发布的报表">
      <div className="p-4">
        <p className="text-sm text-[var(--app-color-text-secondary)]">
          已发布的填报报表列表（Phase 2 实现完整功能）
        </p>
      </div>
    </AdminPageShell>
  );
}
