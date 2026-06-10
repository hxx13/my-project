// frontend/src/features/smartsheet/SmartSheetListPage.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Table2, Plus } from 'lucide-react';
import { AdminPageShell, AdminDataTableWrap } from '@/components/admin/AdminPageShell';
import { fetchSheetPage, createSheet, deleteSheet } from '@/api/domains/smartsheet.api';
import { PRESET_TEMPLATES } from './types';
import toast from 'react-hot-toast';

export default function SmartSheetListPage() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['smartsheet-list'],
    queryFn: () => fetchSheetPage(1, 50),
  });

  return (
    <AdminPageShell title="智能表格" icon={Table2}>
      <div className="mb-4 flex gap-2">
        {PRESET_TEMPLATES.map((tpl) => (
          <button key={tpl.id}
            className="px-3 py-2 rounded-app-element border border-app-border bg-app-surface-container hover:border-app-accent text-sm transition-colors text-app-text-primary"
            onClick={async () => {
              try {
                const sheet = await createSheet({
                  name: tpl.name + ' ' + new Date().toLocaleDateString(),
                  description: tpl.description,
                  layoutMode: tpl.layoutMode,
                  columnsConfig: tpl.defaultColumns,
                });
                toast.success('表格已创建');
                navigate(`/admin/smartsheet/${sheet.id}`);
              } catch (e) { toast.error((e as Error).message || '创建失败'); }
            }}>
            {tpl.name}
          </button>
        ))}
        <button onClick={() => navigate('/admin/smartsheet/new')}
          className="px-3 py-2 rounded-app-element bg-app-accent text-app-text-inverse hover:bg-app-accent-hover text-sm transition-colors flex items-center gap-1">
          <Plus className="w-4 h-4" /> 自定义
        </button>
      </div>

      <AdminDataTableWrap
        columns={[
          { header: '名称', accessor: 'name' },
          { header: '模式', accessor: 'layoutMode', render: (v: string) => (
            <span className="text-xs px-2 py-0.5 rounded bg-app-surface-hover text-app-text-secondary">{v}</span>
          )},
          { header: '更新于', accessor: 'updatedAt', render: (v: string) => new Date(v).toLocaleString() },
        ]}
        data={data?.list || []}
        isLoading={isLoading}
        onRowClick={(row: any) => navigate(`/admin/smartsheet/${row.id}`)}
        rowActions={(row: any) => [
          { label: '打开', onClick: () => navigate(`/admin/smartsheet/${row.id}`) },
          { label: '删除', onClick: async () => {
            if (confirm('确定删除？')) {
              await deleteSheet(row.id);
              refetch();
            }
          }},
        ]}
      />
    </AdminPageShell>
  );
}
