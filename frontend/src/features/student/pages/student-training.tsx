import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  cancelMyEnrollment,
  enrollOccurrence,
  fetchMyEnrollments,
  fetchMyTrainings,
  type StudentTraining,
  type StudentTrainingOccurrence,
} from "../api/student.api";
import { useStudentQuery } from "../hooks/use-student-query";
import { enrollStatus, isFullyPassed, isRejected } from "../utils/trainingEnrollStatus";
import { useQueryClient } from "@tanstack/react-query";
import { ShrinkText } from "../components/shrink-text";
import { StudentTrainingMyContent } from "./student-training-my";
import "./student-list.css";

type Status = "未报名" | "待审核" | "已通过" | "已拒绝";

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
  /** 已报名 / 培训报名 */
  const [tab, setTab] = useState<"enrolled" | "list">("enrolled");
  const [campusTab, setCampusTab] = useState("");
  const [target, setTarget] = useState<{ training: StudentTraining; occ: StudentTrainingOccurrence } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState(false);

  /** 后端已按「校区 → 配置序号」排好序，这里只按顺序切开分组。 */
  const groups = useMemo(() => {
    const map = new Map<string, StudentTraining[]>();
    for (const t of data) {
      const k = (t.campus ?? "").trim();
      const arr = map.get(k);
      if (arr) arr.push(t);
      else map.set(k, [t]);
    }
    return [...map.entries()].map(([key, items]) => ({ key, label: key || "其他", items }));
  }, [data]);

  const trainingCampusTabs = useMemo(
    () => groups.map((g) => ({ key: g.key, label: g.label, count: g.items.length })),
    [groups],
  );

  // 已报名同样按校区划分：与培训列表共用一套校区标签与切换状态
  const { data: myEnrollments = [] } = useStudentQuery(["my-enrollments"], () => fetchMyEnrollments());
  const enrolledCampusTabs = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of myEnrollments) {
      const k = (e.campus ?? "").trim();
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([key, count]) => ({ key, label: key || "其他", count }));
  }, [myEnrollments]);

  const campusTabs = tab === "enrolled" ? enrolledCampusTabs : trainingCampusTabs;
  const activeCampus = campusTabs.some((g) => g.key === campusTab) ? campusTab : campusTabs[0]?.key ?? "";
  const activeItems = groups.find((g) => g.key === activeCampus)?.items ?? [];

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
            <div className="aup-view-toggle" role="tablist" aria-label="培训分类">
              <button className={tab === "enrolled" ? "on" : ""} onClick={() => setTab("enrolled")}>已报名</button>
              <button className={tab === "list" ? "on" : ""} onClick={() => setTab("list")}>培训报名</button>
            </div>
            <div className="aup-view-toggle" role="tablist" aria-label="视图切换">
              <button className={view === "card" ? "on" : ""} onClick={() => setView("card")}>▦ 卡片</button>
              <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>☰ 列表</button>
            </div>
            {campusTabs.length > 1 && (
              <div className="aup-view-toggle" role="tablist" aria-label="校区">
                {campusTabs.map((g) => (
                  <button
                    key={g.key || "__none__"}
                    className={activeCampus === g.key ? "on" : ""}
                    onClick={() => setCampusTab(g.key)}
                  >
                    {g.label} ({g.count})
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="list-card list-card-body">
          <div className="list-card-scroll">
            {tab === "enrolled" ? (
              <StudentTrainingMyContent view={view} campus={activeCampus} onGoEnroll={() => setTab("list")} />
            ) : (
              <>
                <div className="list-count">共 {activeItems.length} 条培训</div>
                {isLoading ? (
                  <div className="aup-empty">加载中…</div>
                ) : isError ? (
                  <div className="aup-empty">加载失败，<button className="btn ghost small" onClick={() => refetch()}>重试</button></div>
                ) : activeItems.length === 0 ? (
                  <div className="aup-empty">暂无培训</div>
                ) : view === "card" ? (
                  <div className="aup-card-grid">
                    {activeItems.map((t) => (
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
                ) : (
                  <div className="campus-list">{trainingTable(activeItems)}</div>
                )}
              </>
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
              {(target.training.videos?.length ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <span>学习视频</span>
                  {target.training.videoPassed ? (
                    <span className="text-emerald-600">已看完</span>
                  ) : (
                    <button
                      type="button"
                      className="text-amber-600 hover:underline"
                      onClick={() => {
                        setTarget(null);
                        navigate("/student/exam", { state: { openVideos: true } });
                      }}
                    >
                      未看完 {(target.training.videos ?? []).filter((v) => v.completed).length}/
                      {(target.training.videos ?? []).length} · 去学习
                    </button>
                  )}
                </div>
              )}
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
                {(target.training.videos?.length ?? 0) > 0 && !target.training.videoPassed && (
                  <button
                    className="rounded-md bg-amber-500 px-3 py-1.5 text-sm text-white"
                    onClick={() => { setTarget(null); navigate("/student/exam", { state: { openVideos: true } }); }}
                  >
                    去观看学习视频
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
