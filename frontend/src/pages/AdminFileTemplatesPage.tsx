import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Download, Trash2, Upload } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminPageShell, AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { AdminSensitiveAction } from "@/features/admin/AdminSensitiveAction";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import {
  deleteAdminFileTemplate,
  downloadAdminFileTemplateBlob,
  fetchAdminFileTemplates,
  uploadAdminFileTemplate,
  type AdminFileTemplateRow,
} from "@/api/domains/fileTemplates.api";
import DataSkeleton from "@/components/ui/DataSkeleton";
import EmptyState from "@/components/ui/EmptyState";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtTime(v: string) {
  return v.length > 19 ? v.slice(0, 19).replace("T", " ") : v;
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminFileTemplatesPage() {
  const role = authStorage.getRole();
  const canUpload = hasMinRole(role, "STAFF");
  const canDelete = hasMinRole(role, "ADMIN");
  const [rows, setRows] = useState<AdminFileTemplateRow[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["adminFileTemplates"] as const,
    queryFn: async () => {
      const { rows, schemaHint } = await fetchAdminFileTemplates();
      if (schemaHint) toast(schemaHint, { duration: 12000 });
      return rows;
    },
  });

  useEffect(() => {
    if (data) setRows(data);
  }, [data]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const row = await uploadAdminFileTemplate(f);
      setRows((prev) => [row, ...prev]);
      toast.success("已上传");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    }
  };

  const onDownload = async (r: AdminFileTemplateRow) => {
    try {
      const { blob, fileName } = await downloadAdminFileTemplateBlob(r.id, r.originalName);
      triggerBlobDownload(blob, fileName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "下载失败");
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("确认删除该模板？")) return;
    try {
      await deleteAdminFileTemplate(id);
      setRows((prev) => prev.filter((x) => x.id !== id));
      toast.success("已删除");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <div className="p-6">
      <AdminPageShell
        title="文件模板库"
        description={
          <>
            教职工可上传、下载常用模板；<strong>删除</strong>仅管理员及以上。目标库须已执行{" "}
            <code className="rounded-twin-sm bg-[var(--twin-canvas-soft)] px-1 text-xs">scripts/admin_file_templates.ddl.sql</code>（见{" "}
            <code className="rounded-twin-sm bg-[var(--twin-canvas-soft)] px-1 text-xs">scripts/DEPLOY_DDL.md</code>）。
          </>
        }
        actions={
          canUpload ? (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]">
              <Upload className="h-4 w-4" />
              上传模板
              <input type="file" className="hidden" accept=".pdf,.xlsx,.xls,.docx,.doc,.zip,.csv,.txt,.png,.jpg,.jpeg" onChange={(ev) => void onUpload(ev)} />
            </label>
          ) : null
        }
      >
        <AdminDataTableWrap scrollable>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--twin-canvas-soft)] text-xs text-[var(--twin-body)]">
              <tr>
                <th className="px-3 py-2">文件名</th>
                <th className="px-3 py-2">大小</th>
                <th className="px-3 py-2">上传时间</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--twin-hairline)]">
                  <td className="max-w-[20rem] truncate px-3 py-2 font-medium text-[var(--twin-ink)]" title={r.originalName}>
                    {r.originalName}
                  </td>
                  <td className="px-3 py-2 text-[var(--twin-body)]">{fmtBytes(r.sizeBytes)}</td>
                  <td className="px-3 py-2 text-xs text-[var(--twin-body)]">{fmtTime(r.createTime)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--twin-link-deep)]"
                        onClick={() => void onDownload(r)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        下载
                      </button>
                      {canDelete ? (
                        <AdminSensitiveAction label="删除文件模板" visibilityMinRole="ADMIN" configureMinRole="SUPER_ADMIN">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600"
                            onClick={() => void onDelete(r.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </button>
                        </AdminSensitiveAction>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {isLoading ? <DataSkeleton variant="table" rows={4} /> : null}
          {!isLoading && !rows.length ? <EmptyState title="暂无模板" /> : null}
        </AdminDataTableWrap>
      </AdminPageShell>
    </div>
  );
}
