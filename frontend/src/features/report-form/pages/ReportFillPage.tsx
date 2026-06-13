// ReportFillPage — 填报页面
import { useParams } from 'react-router-dom';
import { AdminPageShell } from '@/components/admin/AdminPageShell';

export default function ReportFillPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <AdminPageShell title="填报" description={`正在填报报表 ${id}`}>
      <div className="p-4">
        <p className="text-sm text-[var(--app-color-text-secondary)]">
          动态表单填报（Phase 2 实现完整功能）
        </p>
      </div>
    </AdminPageShell>
  );
}
