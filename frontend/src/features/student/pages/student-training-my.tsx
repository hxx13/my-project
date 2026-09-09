import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, MapPin, Clock, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { cancelMyEnrollment, fetchMyEnrollments, type MyEnrollment } from "../api/student.api";
import { useStudentQuery } from "../hooks/use-student-query";
import { useQueryClient } from "@tanstack/react-query";

export default function StudentTrainingMyPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data = [], isLoading, isError, error, refetch } = useStudentQuery(
    ["my-enrollments"],
    () => fetchMyEnrollments(),
  );
  const [canceling, setCanceling] = useState<number | null>(null);

  const doCancel = async (e: MyEnrollment) => {
    setCanceling(e.id);
    try {
      await cancelMyEnrollment(e.id);
      qc.invalidateQueries({ queryKey: ["student"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "取消失败");
    } finally {
      setCanceling(null);
    }
  };

  const statusBadge = (e: MyEnrollment) => {
    if (e.testYn === 1) return <span className="text-xs text-emerald-600 font-medium">已通过</span>;
    if (e.testYn === 2) return <span className="text-xs text-rose-600 font-medium">已拒绝</span>;
    return <span className="text-xs text-amber-600 font-medium">待审核</span>;
  };

  return (
    <AdminPageShell>
      <div className="min-h-full p-6">
        <div className="mb-4 flex items-center gap-3">
          <button className="inline-flex items-center gap-1 text-sm text-[var(--student-mute)] hover:text-[var(--student-body)]" onClick={() => navigate("/student/training")}>
            <ChevronLeft className="size-4" />返回
          </button>
          <h2 className="text-lg font-semibold text-[var(--student-ink)]">我的报名</h2>
        </div>

        {isLoading ? (
          <div className="text-sm text-[var(--student-mute)]">加载中…</div>
        ) : isError ? (
          <div className="text-sm text-[var(--student-error)]">
            {error instanceof Error ? error.message : "加载失败"}
            <button className="ml-3 underline" onClick={() => refetch()}>重试</button>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--student-mute)]">
            <GraduationCap className="size-8 mb-2" />
            <span>暂无报名记录</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {data.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-[var(--student-radius-md)] bg-[var(--student-surface)] px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--student-body)] truncate">{e.trainingName || "—"}</div>
                  <div className="text-xs text-[var(--student-mute)] mt-0.5">
                    <span className="inline-flex items-center gap-1"><Clock className="size-3" />{e.startTime ?? "—"}</span>
                    <span className="inline-flex items-center gap-1 ml-3"><MapPin className="size-3" />{e.address ?? "—"}</span>
                  </div>
                </div>
                {statusBadge(e)}
                {e.testYn !== 1 && (
                  <button
                    className="text-xs text-[var(--student-mute)] hover:text-[var(--student-error)] disabled:opacity-50"
                    disabled={canceling === e.id}
                    onClick={() => doCancel(e)}
                  >
                    {canceling === e.id ? "取消中…" : "取消报名"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminPageShell>
  );
}
