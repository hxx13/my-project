// ReportFormDesignPage — 报表设计器
import { useParams } from 'react-router-dom';
import { AdminPageShell } from '@/components/admin/AdminPageShell';

export default function ReportFormDesignPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <AdminPageShell title="报表设计器" description={`正在设计报表 ${id}`}>
      <div className="p-4">
        <p className="text-sm text-[var(--app-color-text-secondary)]">
          拖拽式表单设计器（Phase 2 实现完整功能）
        </p>
      </div>
    </AdminPageShell>
  );
}
