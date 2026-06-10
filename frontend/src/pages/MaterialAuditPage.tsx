import { useState } from "react";
import { useMaterialStatsOverview, useMaterialAuditTrail } from "@/api/hooks/useMaterial";
import { exportMaterialAuditTrail } from "@/api/domains/material.api";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";
import DataSkeleton from "@/components/ui/DataSkeleton";
import toast from "react-hot-toast";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MaterialAuditPage() {
  const [from, setFrom] = useState("2024-01-01");
  const [to, setTo] = useState("2099-12-31");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const { data: overview, isLoading: overviewLoading } = useMaterialStatsOverview(from, to);
  const { data: trail, isLoading: trailLoading } = useMaterialAuditTrail({ from, to, page, size: 20 });

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportMaterialAuditTrail({ from, to });
      downloadBlob(blob, `material-audit-${from}_${to}.xlsx`);
      toast.success("导出成功");
    } catch { toast.error("导出失败"); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-6">
      <AdminSubPageHeader title="物资统计与审计" backTo="/admin/material/review" description="按学生与物品维度查看申领统计，审计流水支持时间区间筛选。" />

      {/* 日期筛选 + 导出 */}
      <div className="flex gap-2 items-center text-sm flex-wrap">
        <label className="text-[var(--twin-mute)] text-xs">时间区间</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" />
        <span className="text-[var(--twin-mute)]">至</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" />
        <button type="button" onClick={handleExport} disabled={exporting}
          className="ml-auto rounded-twin-sm bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
          {exporting ? "导出中..." : "导出 Excel"}
        </button>
      </div>

      {/* 概览卡片 */}
      {overviewLoading ? <DataSkeleton variant="card" rows={1} /> : overview ? (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-center shadow-twin-level-1">
            <div className="text-2xl font-bold text-[var(--twin-ink)]">{overview.totalRequests}</div>
            <div className="text-xs text-[var(--twin-mute)] mt-1">总申领单</div>
          </div>
          <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-center shadow-twin-level-1">
            <div className="text-2xl font-bold text-[var(--twin-ink)]">{overview.totalFulfilledQty}</div>
            <div className="text-xs text-[var(--twin-mute)] mt-1">总出库量</div>
          </div>
          <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-center shadow-twin-level-1">
            <div className="text-2xl font-bold text-[var(--twin-ink)]">{overview.passRate != null ? `${Math.round(overview.passRate * 100)}%` : "-"}</div>
            <div className="text-xs text-[var(--twin-mute)] mt-1">通过率</div>
          </div>
          <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-center shadow-twin-level-1">
            <div className="text-2xl font-bold text-[var(--twin-ink)]">{overview.refuseCount ?? 0}</div>
            <div className="text-xs text-[var(--twin-mute)] mt-1">拒绝数</div>
          </div>
          <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-center shadow-twin-level-1">
            <div className="text-2xl font-bold text-[var(--twin-ink)]">{overview.byStudent?.length ?? 0}</div>
            <div className="text-xs text-[var(--twin-mute)] mt-1">涉及学生</div>
          </div>
          <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-center shadow-twin-level-1">
            <div className="text-2xl font-bold text-[var(--twin-ink)]">{overview.byItem?.length ?? 0}</div>
            <div className="text-xs text-[var(--twin-mute)] mt-1">涉及物品</div>
          </div>
        </div>
      ) : null}

      {/* 按学生统计 */}
      {/* 库存预警 */}
      {overview?.stockWarnings && overview.stockWarnings.length > 0 && (
        <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
          <h3 className="font-medium text-[var(--twin-ink)] mb-2 flex items-center gap-2"><span className="text-amber-500">⚠️</span>库存预警（≤ 5）</h3>
          <div className="flex flex-wrap gap-2">
            {overview.stockWarnings.map((w: any, i: number) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs">
                <span className="font-medium text-amber-800">{w.name || `ID ${w.itemId}`}</span>
                <span className="text-amber-600">库存 {w.stockQty}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {overview?.byStudent && overview.byStudent.length > 0 && (
        <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
          <h3 className="font-medium text-[var(--twin-ink)] mb-3">按学生统计</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--twin-hairline)] text-left text-xs text-[var(--twin-mute)]">
                  <th className="py-2 font-medium">姓名</th>
                  <th className="py-2 font-medium">课题组</th>
                  <th className="py-2 font-medium text-right">申领次数</th>
                  <th className="py-2 font-medium text-right">活跃天数</th>
                </tr>
              </thead>
              <tbody>
                {overview.byStudent.map((s: any, i: number) => (
                  <tr key={i} className="border-b border-[var(--twin-hairline)] last:border-0">
                    <td className="py-2 text-[var(--twin-ink)]">{s.applicant_name || "-"}</td>
                    <td className="py-2 text-[var(--twin-body)]">{s.applicant_group || "-"}</td>
                    <td className="py-2 text-right text-[var(--twin-ink)] font-medium">{s.total}</td>
                    <td className="py-2 text-right text-[var(--twin-body)]">{s.active_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 审计流水 */}
      {trailLoading ? <DataSkeleton variant="table" rows={5} /> : trail?.data && trail.data.length > 0 ? (
        <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
          <h3 className="font-medium text-[var(--twin-ink)] mb-3">审计流水（{trail.total} 条）</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--twin-hairline)] text-left text-xs text-[var(--twin-mute)]">
                  <th className="py-2 font-medium">申领人</th>
                  <th className="py-2 font-medium">课题组</th>
                  <th className="py-2 font-medium">物品</th>
                  <th className="py-2 font-medium text-right">数量</th>
                  <th className="py-2 font-medium text-right">出库</th>
                  <th className="py-2 font-medium">状态</th>
                  <th className="py-2 font-medium">时间</th>
                </tr>
              </thead>
              <tbody>
                {trail.data.map((row: any, i: number) => (
                  <tr key={i} className="border-b border-[var(--twin-hairline)] last:border-0">
                    <td className="py-2 text-[var(--twin-ink)]">{row.applicantName || "-"}</td>
                    <td className="py-2 text-[var(--twin-body)]">{row.applicantGroup || "-"}</td>
                    <td className="py-2 text-[var(--twin-body)]">{row.itemName || "-"}</td>
                    <td className="py-2 text-right text-[var(--twin-ink)]">{row.qty}</td>
                    <td className="py-2 text-right text-[var(--twin-ink)]">{row.fulfilledQty}</td>
                    <td className="py-2"><span className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--twin-hairline)]">{row.status}</span></td>
                    <td className="py-2 text-[var(--twin-mute)] text-xs">{row.createdAt?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {trail.total > 20 && (
            <div className="flex justify-center gap-2 mt-4 pt-3 border-t border-[var(--twin-hairline)]">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 text-xs text-[var(--twin-body)] disabled:opacity-30">上一页</button>
              <span className="text-xs text-[var(--twin-body)] py-1">第 {page} 页 / 共 {Math.ceil(trail.total / 20)} 页</span>
              <button disabled={page >= Math.ceil(trail.total / 20)} onClick={() => setPage(page + 1)}
                className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 text-xs text-[var(--twin-body)] disabled:opacity-30">下一页</button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
