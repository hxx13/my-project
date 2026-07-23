import { useNavigate } from "react-router-dom";
import { ChevronLeft, Package, TrendingUp, type LucideIcon } from "lucide-react";
import { useMyMaterialStats } from "@/api/hooks/useMaterial";
import { StudentCard, Skeleton } from "../components/ui";

export default function StudentMaterialStatsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useMyMaterialStats();

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b">
        <button onClick={() => navigate(-1)}><ChevronLeft className="size-4" /></button>
        <h2 className="text-[15px] font-semibold">领用统计</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? <Skeleton className="h-64" /> : data ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard icon={Package} label="总申领次数" value={data.totalRequests} />
              <StatCard icon={TrendingUp} label="总出库数量" value={data.totalFulfilledQty} />
            </div>
            <StudentCard>
              <h3 className="text-[13px] font-semibold mb-2">物品申领排行</h3>
              {data.byItem && data.byItem.length > 0 ? (
                <div className="space-y-1.5">
                  {data.byItem.slice(0, 10).map((row: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[12px]">
                      <span className="truncate flex-1">{row.snapshot_name || "未知"}</span>
                      <span className="text-[var(--student-mute)] ml-2">×{row.total_qty}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[12px] text-[var(--student-mute)]">暂无数据</p>}
            </StudentCard>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <StudentCard className="p-3 flex items-center gap-3">
      <div className="size-10 rounded-[var(--student-radius-sm)] bg-[var(--student-primary-soft)] flex items-center justify-center">
        <Icon className="size-5 text-[var(--student-primary)]" />
      </div>
      <div>
        <div className="text-[20px] font-bold text-[var(--student-ink)]">{value}</div>
        <div className="text-[11px] text-[var(--student-mute)]">{label}</div>
      </div>
    </StudentCard>
  );
}
