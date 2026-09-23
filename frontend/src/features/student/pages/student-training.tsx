import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  cancelMyEnrollment,
  enrollOccurrence,
  fetchMyTrainings,
  type StudentTraining,
  type StudentTrainingOccurrence,
} from "../api/student.api";
import { useStudentQuery } from "../hooks/use-student-query";
import { enrollStatus, isFullyPassed, isRejected } from "../utils/trainingEnrollStatus";
import { useQueryClient } from "@tanstack/react-query";
import { ShrinkText } from "../components/shrink-text";
import "./student-list.css";

type Status = "未报名" | "待审核" | "已通过" | "已拒绝";
type Filter = "all" | "passed" | "unpassed";

function trainingStatus(t: StudentTraining): Status {
  const occs = t.occurrences ?? [];
  const st = (o: StudentTrainingOccurrence) => enrollStatus(!!o.enrolled, o.testYn, o.testFraction);
  if (occs.some((o) => st(o) === "已通过")) return "已通过";
  if (occs.some((o) => st(o) === "已拒绝")) return "已拒绝";
  if (occs.some((o) => o.enrolled)) return "待审核";
  return "未报名";
}

const STATUS_SEAL: Record<Status, { lines: string[]; cls: string }> = {
  未报名: { lines: ["未", "报名"], cls: "draft" },
  待审核: { lines: ["审核", "中"], cls: "review" },
  已通过: { lines: ["已", "通过"], cls: "approved" },
  已拒绝: { lines: ["已", "拒绝"], cls: "terminated" },
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "unpassed", label: "未通过" },
  { id: "passed", label: "已通过" },
];

function firstOcc(t: StudentTraining): StudentTrainingOccurrence | undefined {
  return (t.occurrences ?? [])[0];
}

type Act = "enroll" | "reapply" | "cancel" | "none";

/** 单个场次上「我」能做什么：未报名→报名；已驳回→重新报名（先退再报）；双通过→锁定无操作。 */
function enrollAction(o?: StudentTrainingOccurrence): Act {
  if (!o) return "none";
  if (!o.enrolled || !o.enrollmentId) return "enroll";
  if (isFullyPassed(o.testYn, o.testFraction)) return "none";
  return isRejected(o.testYn, o.testFraction) ? "reapply" : "cancel";
}

function TrainingCard({
  t,
  busy,
  onEnroll,
  onCancel,
  onReapply,
}: {
  t: StudentTraining;
  busy: boolean;
  onEnroll: (t: StudentTraining, o: StudentTrainingOccurrence) => void;
  onCancel: (o: StudentTrainingOccurrence) => void;
  onReapply: (o: StudentTrainingOccurrence) => void;
}) {
  const o = firstOcc(t);
  const status = trainingStatus(t);
  const seal = STATUS_SEAL[status];
  const act = enrollAction(o);
  return (
    <div className="aup-card-cell">
      <div className="aup-doc-stack">
        <div className={`aup-doc${status === "已通过" ? " is-passed" : ""}`}>
          <div className="aup-doc-hd">
            <div style={{ flex: 1, minWidth: 0 }}>
              <ShrinkText text={t.name} lines={1} baseFontPx={14} className="aup-doc-title" />
            </div>
            <span className="aup-doc-no">类型：{t.typeName || "—"}</span>
          </div>
          <div className="aup-doc-body">
            <div className="aup-f">
              <div className="aup-f-k">地点</div>
              <ShrinkText text={o?.address || "—"} lines={2} className="aup-f-v" />
            </div>
            <div className="aup-f">
              <div className="aup-f-k">时间</div>
              <ShrinkText text={o?.startTime || "—"} lines={2} className="aup-f-v" />
            </div>
            <div className="aup-f">
              <div className="aup-f-k">所属人</div>
              <ShrinkText text={(t.ownerNames ?? t.ownerIds ?? []).join("、") || "—"} lines={2} className="aup-f-v" />
            </div>
          </div>
          <div className="aup-doc-foot">
            <div className="aup-doc-acts">
              {act === "enroll" && o ? (
                <button className="btn primary small" onClick={() => onEnroll(t, o)}>报名</button>
              ) : null}
              {act === "reapply" && o ? (
                <button className="btn primary small" disabled={busy} onClick={() => onReapply(o)}>重新报名</button>
              ) : null}
              {(act === "cancel" || act === "reapply") && o ? (
                <button className="btn ghost small" disabled={busy} onClick={() => onCancel(o)}>取消报名</button>
              ) : null}
            </div>
            <div className="aup-doc-foot-right">
              <div className={`aup-seal ${seal.cls}`}>
                {seal.lines.map((l) => <span key={l}>{l}</span>)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudentTrainingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data = [], isLoading, isError, error, refetch } = useStudentQuery(
    ["trainings"],
    () => fetchMyTrainings(),
  );
  const [view, setView] = useState<"card" | "list">("card");
  const [filter, setFilter] = useState<Filter>("all");
  const [target, setTarget] = useState<{ training: StudentTraining; occ: StudentTrainingOccurrence } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState(false);

  const filtered = useMemo(() => {
    return data.filter((t) => {
      const s = trainingStatus(t);
      if (filter === "passed") return s === "已通过";
      if (filter === "unpassed") return s !== "已通过";
      return true;
    });
  }, [data, filter]);

  /** 后端已按「校区 → 配置序号」排好序，这里只按顺序切开分组。 */
  const groups = useMemo(() => {
    const map = new Map<string, StudentTraining[]>();
    for (const t of filtered) {
      const k = (t.campus ?? "").trim();
      const arr = map.get(k);
      if (arr) arr.push(t);
      else map.set(k, [t]);
    }
    return [...map.entries()].map(([key, items]) => ({ key, label: key || "其他", items }));
  }, [filtered]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["student"] });

  const doEnroll = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      await enrollOccurrence(target.occ.id);
      setTarget(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "报名失败");
    } finally {
      setSubmitting(false);
    }
  };

  const doCancel = async (o: StudentTrainingOccurrence) => {
    if (!o.enrollmentId) return;
    setActing(true);
    try {
      await cancelMyEnrollment(o.enrollmentId);
      toast.success("已取消报名");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "取消失败");
    } finally {
      setActing(false);
    }
  };

  /** 重新报名：被驳回的报名还占着场次，先退掉再报一次。 */
  const doReapply = async (o: StudentTrainingOccurrence) => {
    if (!o.enrollmentId) return;
    setActing(true);
    try {
      await cancelMyEnrollment(o.enrollmentId);
      await enrollOccurrence(o.id);
      toast.success("已重新报名");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重新报名失败");
    } finally {
      setActing(false);
    }
  };

  const actions = (t: StudentTraining, o?: StudentTrainingOccurrence) => {
    const act = enrollAction(o);
    if (!o) return null;
    return (
      <>
        {act === "enroll" && (
          <button className="btn primary small" onClick={() => setTarget({ training: t, occ: o })}>报名</button>
        )}
        {act === "reapply" && (
          <button className="btn primary small" disabled={acting} onClick={() => doReapply(o)}>重新报名</button>
        )}
        {(act === "cancel" || act === "reapply") && (
          <button className="btn ghost small" disabled={acting} onClick={() => doCancel(o)}>取消报名</button>
        )}
      </>
    );
  };

  /** 列表视图的一张表；按校区分组时每组各渲染一张。 */
  const trainingTable = (items: StudentTraining[]) => (
    <table className="list-table">
      <thead>
        <tr>
          <th>培训名称</th>
          <th>类型</th>
          <th>校区</th>
          <th>地点</th>
          <th>时间</th>
          <th>所属人</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((t) => {
          const o = firstOcc(t);
          const status = trainingStatus(t);
          return (
            <tr key={t.id} className={`row${status === "已通过" ? " is-passed" : ""}`}>
              <td><span className="proj-name">{t.name}</span></td>
              <td>{t.typeName || "—"}</td>
              <td>{t.campus || "—"}</td>
              <td>{o?.address || "—"}</td>
              <td>{o?.startTime || "—"}</td>
              <td>{(t.ownerNames ?? t.ownerIds ?? []).join("、") || "—"}</td>
              <td><span className={`status-badge ${STATUS_SEAL[status].cls}`}>{status}</span></td>
              <td>{actions(t, o)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <>
      <div className="stu-list" style={{ height: "100%" }}>
        <div className="list-card list-card-top">
          <div className="aup-filter-toolbar">
            <div className="aup-view-toggle" role="tablist" aria-label="视图切换">
              <button className={view === "card" ? "on" : ""} onClick={() => setView("card")}>▦ 卡片</button>
              <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>☰ 列表</button>
            </div>
            <div className="aup-view-toggle" role="tablist" aria-label="报名状态">
              {FILTERS.map((f) => (
                <button key={f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>{f.label}</button>
              ))}
            </div>
            <button className="btn ghost small" onClick={() => navigate("/student/training/my")}>我的报名</button>
          </div>
        </div>

        <div className="list-card list-card-body">
          <div className="list-card-scroll">
            <div className="list-count">共 {filtered.length} 条培训</div>
            {isLoading ? (
              <div className="aup-empty">加载中…</div>
            ) : isError ? (
              <div className="aup-empty">加载失败，<button className="btn ghost small" onClick={() => refetch()}>重试</button></div>
            ) : filtered.length === 0 ? (
              <div className="aup-empty">暂无培训</div>
            ) : view === "card" ? (
              groups.map((g) => (
                <div key={g.key || "__none__"}>
                  <div className="campus-head">
                    <span>{g.label}</span>
                    <span className="campus-count">{g.items.length} 条</span>
                  </div>
                  <div className="aup-card-grid">
                    {g.items.map((t) => (
                      <TrainingCard
                        key={t.id}
                        t={t}
                        busy={acting}
                        onEnroll={(tt, o) => setTarget({ training: tt, occ: o })}
                        onCancel={doCancel}
                        onReapply={doReapply}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              groups.map((g) => (
                <div key={g.key || "__none__"}>
                  <div className="campus-head">
                    <span>{g.label}</span>
                    <span className="campus-count">{g.items.length} 条</span>
                  </div>
                  <div className="campus-list">{trainingTable(g.items)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => setTarget(null)}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 text-slate-900 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold">报名 · {target.training.name}</h3>
            <p className="mt-1 text-xs text-slate-500">{target.occ.startTime ?? ""} {target.occ.address ?? ""}</p>

            <div className="mt-4 flex flex-col gap-2 text-sm">
              {(target.training.papers?.length ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <span>考试</span>
                  <span className={target.training.examPassed ? "text-emerald-600" : "text-rose-600"}>
                    {target.training.examPassed ? "合格" : "未合格"}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span>健康调查表</span>
                <button
                  type="button"
                  className={target.training.healthOk ? "text-emerald-600" : "text-amber-600 hover:underline"}
                  onClick={() => { setTarget(null); navigate("/student/health-survey"); }}
                >
                  {target.training.healthOk ? "已提交" : "未提交 · 去填写"}
                </button>
              </div>
            </div>

            {target.training.eligible ? (
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setTarget(null)}>取消</button>
                <button className="rounded-md bg-[var(--student-primary)] px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={submitting} onClick={doEnroll}>
                  {submitting ? "报名中…" : "确定报名"}
                </button>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                {!target.training.examPassed && (
                  <button className="rounded-md bg-amber-500 px-3 py-1.5 text-sm text-white" onClick={() => { setTarget(null); navigate("/student/exam"); }}>
                    去答题
                  </button>
                )}
                {!target.training.healthOk && (
                  <button className="rounded-md bg-amber-500 px-3 py-1.5 text-sm text-white" onClick={() => { setTarget(null); navigate("/student/health-survey"); }}>
                    去填写健康调查表
                  </button>
                )}
                <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600" onClick={() => setTarget(null)}>关闭</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
