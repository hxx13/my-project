import { useState } from "react";
import { useMaterialStatsOverview, useMaterialAuditTrail } from "@/api/hooks/useMaterial";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";

export default function MaterialAuditPage() {
  const [from, setFrom] = useState("2024-01-01");
  const [to, setTo] = useState("2099-12-31");
  const [page, setPage] = useState(1);
  const { data: overview } = useMaterialStatsOverview(from, to);
  const { data: trail } = useMaterialAuditTrail({ from, to, page, size: 20 });

  return (
    <div className="h-full flex flex-col">
      <AdminSubPageHeader title="物资统计与审计" backTo="/admin/material/review" />
      <div className="flex gap-2 px-4 py-2 bg-white border-b items-center text-[13px]">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded px-2 py-1" />
        <span>至</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded px-2 py-1" />
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {overview && (
          <div className="grid grid-cols-4 gap-3">
            <StatBox label="总申领单" value={overview.totalRequests} />
            <StatBox label="总出库量" value={overview.totalFulfilledQty} />
            <StatBox label="涉及学生" value={overview.byStudent?.length ?? 0} />
            <StatBox label="涉及物品" value={overview.byItem?.length ?? 0} />
          </div>
        )}
        {overview?.byStudent && overview.byStudent.length > 0 && (
          <div className="bg-white rounded-lg border p-3">
            <h3 className="text-[13px] font-semibold mb-2">按学生统计</h3>
            <table className="w-full text-[12px]">
              <thead><tr className="border-b"><th className="text-left py-1">姓名</th><th className="text-left py-1">课题组</th><th className="text-right py-1">申领次数</th><th className="text-right py-1">活跃天数</th></tr></thead>
              <tbody>
                {overview.byStudent.map((s: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1">{s.applicant_name}</td><td className="py-1">{s.applicant_group}</td>
                    <td className="text-right py-1">{s.total}</td><td className="text-right py-1">{s.active_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {trail?.data && trail.data.length > 0 && (
          <div className="bg-white rounded-lg border p-3">
            <h3 className="text-[13px] font-semibold mb-2">审计流水 ({trail.total} 条)</h3>
            <table className="w-full text-[12px]">
              <thead><tr className="border-b">
                <th className="text-left py-1">申领人</th><th className="text-left py-1">课题组</th><th className="text-left py-1">物品</th>
                <th className="text-right py-1">数量</th><th className="text-right py-1">出库</th><th className="text-left py-1">状态</th><th className="text-left py-1">时间</th>
              </tr></thead>
              <tbody>
                {trail.data.map((row: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1">{row.applicantName}</td><td className="py-1">{row.applicantGroup}</td><td className="py-1">{row.itemName}</td>
                    <td className="text-right py-1">{row.qty}</td><td className="text-right py-1">{row.fulfilledQty}</td>
                    <td className="py-1">{row.status}</td><td className="py-1">{row.createdAt?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {trail.total > 20 && (
              <div className="flex justify-center gap-2 mt-3">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 text-[12px] rounded border disabled:opacity-30">上一页</button>
                <span className="text-[12px] px-2">第 {page} 页</span>
                <button onClick={() => setPage(page + 1)} className="px-3 py-1 text-[12px] rounded border">下一页</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border p-3 text-center">
      <div className="text-[22px] font-bold">{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  );
}
