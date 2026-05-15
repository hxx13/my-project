import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Download, Trash2, Upload } from "lucide-react";
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { rows, schemaHint } = await fetchAdminFileTemplates();
      setRows(rows);
      if (schemaHint) {
        toast(schemaHint, { duration: 12000 });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const row = await uploadAdminFileTemplate(f);
      // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
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
      // 删除后仅从列表移除该行，禁止整表 load（post-save-no-full-refresh.mdc）
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
            <code className="rounded bg-slate-100 px-1 text-xs">scripts/admin_file_templates.ddl.sql</code>（见{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">scripts/DEPLOY_DDL.md</code>）。
          </>
        }
        actions={
          canUpload ? (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm text-white">
              <Upload className="h-4 w-4" />
              上传模板
              <input type="file" className="hidden" accept=".pdf,.xlsx,.xls,.docx,.doc,.zip,.csv,.txt,.png,.jpg,.jpeg" onChange={(ev) => void onUpload(ev)} />
            </label>
          ) : null
        }
      >
        <AdminDataTableWrap scrollable>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2">文件名</th>
                <th className="px-3 py-2">大小</th>
                <th className="px-3 py-2">上传时间</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="max-w-[20rem] truncate px-3 py-2 font-medium" title={r.originalName}>
                    {r.originalName}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{fmtBytes(r.sizeBytes)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{fmtTime(r.createTime)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 underline"
                        onClick={() => void onDownload(r)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        下载
                      </button>
                      {canDelete ? (
                        <AdminSensitiveAction label="删除文件模板" visibilityMinRole="ADMIN" configureMinRole="SUPER_ADMIN">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-rose-600 underline"
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
          {loading ? <div className="p-4 text-center text-sm text-slate-500">加载中…</div> : null}
          {!loading && !rows.length ? <div className="p-4 text-center text-sm text-slate-500">暂无模板</div> : null}
        </AdminDataTableWrap>
      </AdminPageShell>
    </div>
  );
}
