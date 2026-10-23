import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { cancelMyEnrollment, fetchMyEnrollments, type MyEnrollment } from "../api/student.api";
import { useStudentQuery } from "../hooks/use-student-query";
import { enrollStatus, isFullyPassed } from "../utils/trainingEnrollStatus";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  /** 与「培训报名」共用卡片/列表切换 */
  view: "card" | "list";
  /** 当前校区标签（与培训列表共用切换） */
  campus: string;
  /** 空态引导：切到「培训报名」去报名 */
  onGoEnroll?: () => void;
};

/**
 * 「已报名」内容：按校区标签过滤，卡片/列表两种视图与外层一致。
 */
export function StudentTrainingMyContent({ view, campus, onGoEnroll }: Props) {
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

  const statusText = (e: MyEnrollment) => {
    const s = enrollStatus(true, e.testYn, e.testFraction);
    return s;
  };
  const statusBadge = (e: MyEnrollment) => {
    const s = statusText(e);
    if (s === "已通过") return <span className="text-xs font-medium text-emerald-600">已通过</span>;
    if (s === "已拒绝") return <span className="text-xs font-medium text-rose-600">已拒绝</span>;
    return <span className="text-xs font-medium text-amber-600">待审核</span>;
  };

  if (isLoading) return <div className="p-4 text-sm text-[var(--student-mute)]">加载中…</div>;
  if (isError) {
    return (
      <div className="p-4 text-sm text-[var(--student-error)]">
        {error instanceof Error ? error.message : "加载失败"}
        <button className="ml-3 underline" onClick={() => refetch()}>重试</button>
      </div>
    );
  }

  const items = data.filter((e) => (e.campus ?? "").trim() === campus);
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-[var(--student-mute)]">
        <GraduationCap className="size-9 opacity-40" />
        <span className="text-[13px]">还没有报名任何培训</span>
        <span className="text-[11px] opacity-80">去培训列表挑一场报名吧</span>
        {onGoEnroll && (
          <button type="button" onClick={onGoEnroll}
            className="mt-2 rounded-lg bg-[var(--student-primary)] px-5 py-2 text-[13px] font-semibold text-white hover:opacity-90">
            去报名
          </button>
        )}
      </div>
    );
  }

  const cancelBtn = (e: MyEnrollment) =>
    isFullyPassed(e.testYn, e.testFraction) ? null : (
      <button
        className="text-xs text-[var(--student-mute)] hover:text-[var(--student-error)] disabled:opacity-50"
        disabled={canceling === e.id}
        onClick={() => doCancel(e)}
      >
        {canceling === e.id ? "取消中…" : "取消报名"}
      </button>
    );

  if (view === "card") {
    return (
      <div className="p-4">
        <div className="aup-card-grid">
          {items.map((e) => (
            <div key={e.id} className="aup-card-cell">
              <div className="aup-doc">
                <div className="aup-doc-hd">
                  <div className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--student-ink)]">
                    {e.trainingName || "—"}
                  </div>
                  {statusBadge(e)}
                </div>
                <div className="aup-doc-body">
                  <div className="aup-f">
                    <div className="aup-f-k">时间</div>
                    <div className="aup-f-v">{e.startTime ?? "—"}</div>
                  </div>
                  <div className="aup-f">
                    <div className="aup-f-k">地点</div>
                    <div className="aup-f-v">{e.address ?? "—"}</div>
                  </div>
                </div>
                <div className="aup-doc-foot">
                  <div className="aup-doc-acts">{cancelBtn(e)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <table className="list-table w-full text-left text-sm">
        <thead>
          <tr>
            <th>培训</th>
            <th>时间</th>
            <th>地点</th>
            <th>状态</th>
            <th className="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id} className="row">
              <td><span className="proj-name">{e.trainingName || "—"}</span></td>
              <td>{e.startTime ?? "—"}</td>
              <td>{e.address ?? "—"}</td>
              <td>{statusBadge(e)}</td>
              <td className="text-right">{cancelBtn(e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
