// SubmissionManagePage — 提交管理
import { useParams } from 'react-router-dom';
import { AdminPageShell } from '@/components/admin/AdminPageShell';

export default function SubmissionManagePage() {
  const { id } = useParams<{ id: string }>();

  return (
    <AdminPageShell title="提交管理" description={`管理报表 ${id} 的提交记录`}>
      <div className="p-4">
        <p className="text-sm text-[var(--app-color-text-secondary)]">
          提交记录列表与审核（Phase 2 实现完整功能）
        </p>
      </div>
    </AdminPageShell>
  );
}
