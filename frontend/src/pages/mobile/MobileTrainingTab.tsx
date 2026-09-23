/**
 * 手机版 — 培训报名 Tab（登录态学生中心）。
 * 与小程序 studentTraining 同构：按浦东/浦西分区 + 报名/取消/重新报名 + 我的报名。
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { GraduationCap, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { appConfirm } from "@/lib/appDialog";
import { AdminButton } from "@/components/admin/AdminButton";
import {
  cancelMyEnrollment,
  enrollOccurrence,
  fetchMyEnrollments,
  fetchMyTrainings,
  type MyEnrollment,
  type StudentTraining,
  type StudentTrainingOccurrence,
} from "@/features/student/api/student.api";
import { useStudentQuery } from "@/features/student/hooks/use-student-query";
import { enrollStatus, isFullyPassed, isRejected } from "@/features/student/utils/trainingEnrollStatus";

type Act = "enroll" | "cancel" | "reapply" | "none";

/** "yyyy-MM-dd HH:mm:ss" → "MM-dd HH:mm" */
function shortTime(s?: string | null): string {
  const raw = (s ?? "").trim();
  return raw.length >= 16 ? `${raw.slice(5, 10)} ${raw.slice(11, 16)}` : raw || "—";
}

function trainingStatus(t: StudentTraining): string {
  const occs = t.occurrences ?? [];
  const st = (o: StudentTrainingOccurrence) => enrollStatus(!!o.enrolled, o.testYn, o.testFraction);
  if (occs.some((o) => st(o) === "已通过")) return "已通过";
  if (occs.some((o) => st(o) === "已拒绝")) return "已拒绝";
  if (occs.some((o) => o.enrolled)) return "待审核";
  return "未报名";
}

function enrollAction(o?: StudentTrainingOccurrence): Act {
  if (!o) return "none";
  if (!o.enrolled || !o.enrollmentId) return "enroll";
  if (isFullyPassed(o.testYn, o.testFraction)) return "none";
  return isRejected(o.testYn, o.testFraction) ? "reapply" : "cancel";
}

const TONE: Record<string, string> = {
  已通过: "bg-emerald-50 text-emerald-600 border-emerald-200",
  已拒绝: "bg-rose-50 text-rose-600 border-rose-200",
  待审核: "bg-amber-50 text-amber-600 border-amber-200",
  未报名: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

function StatusChip({ text }: { text: string }) {
  return (
    <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] leading-tight", TONE[text] ?? TONE["未报名"])}>
      {text}
    </span>
  );
}

/** 行内动作：跟在「地点」那一行右侧，不占独立一行 */
function ActionButtons({
  act,
  onEnroll,
  onCancel,
  onReapply,
}: {
  act: Act;
  onEnroll: () => void;
  onCancel: () => void;
  onReapply: () => void;
}) {
  if (act === "none") return null;
  return (
    <>
      {(act === "cancel" || act === "reapply") && (
        <AdminButton type="button" tone="secondary" size="xs" className="shrink-0" onClick={onCancel}>
          取消报名
        </AdminButton>
      )}
      {act === "enroll" && (
        <AdminButton type="button" tone="primary" size="xs" className="shrink-0" onClick={onEnroll}>
          报名
        </AdminButton>
      )}
      {act === "reapply" && (
        <AdminButton type="button" tone="primary" size="xs" className="shrink-0" onClick={onReapply}>
          重新报名
        </AdminButton>
      )}
    </>
  );
}

export default function MobileTrainingTab() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"list" | "mine">("list");
  const [campus, setCampus] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<StudentTraining | null>(null);

  const { data: trainings = [], isLoading } = useStudentQuery(["trainings"], () => fetchMyTrainings());
  const { data: enrollments = [], isLoading: mineLoading } = useStudentQuery(
    ["my-enrollments"],
    () => fetchMyEnrollments(),
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ["student"] });
  /** 后端已按「校区 → 配置序号」排好，这里只按顺序切开 */
  const groups = useMemo(() => {
    const map = new Map<string, StudentTraining[]>();
    for (const t of trainings) {
      const k = (t.campus ?? "").trim() || "其他";
      const arr = map.get(k);
      if (arr) arr.push(t);
      else map.set(k, [t]);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  }, [trainings]);

  /** 校区分区走 tab 切换（对齐房间页），不再把各区堆成一列 */
  const campuses = useMemo(() => groups.map((g) => g.name), [groups]);
  const activeCampus = campuses.includes(campus) ? campus : campuses[0] ?? "";

  const doCancel = async (e: MyEnrollment | { id: number }) => {
    if (busy) return;
    if (!(await appConfirm("确定取消该场次的报名吗？"))) return;
    setBusy(true);
    try {
      await cancelMyEnrollment(e.id);
      toast.success("已取消报名");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "取消失败");
    } finally {
      setBusy(false);
    }
  };

  const doReapply = async (t: StudentTraining) => {
    const o = (t.occurrences ?? [])[0];
    if (!o?.enrollmentId || busy) return;
    if (!(await appConfirm("将撤销上次报名并重新提交，确定继续吗？"))) return;
    setBusy(true);
    try {
      await cancelMyEnrollment(o.enrollmentId);
      await enrollOccurrence(o.id);
      toast.success("已重新报名");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重新报名失败");
    } finally {
      setBusy(false);
    }
  };

  const doEnroll = async () => {
    const o = target ? (target.occurrences ?? [])[0] : null;
    if (!o || busy) return;
    setBusy(true);
    try {
      await enrollOccurrence(o.id);
      toast.success("已报名");
      setTarget(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "报名失败");
    } finally {
      setBusy(false);
    }
  };

  const renderCard = (t: StudentTraining) => {
    const o = (t.occurrences ?? [])[0];
    const status = trainingStatus(t);
    const act = enrollAction(o);
    return (
      <div
        key={t.id}
        className={cn(
          "rounded-2xl border bg-white p-3.5 shadow-[0_2px_10px_rgba(31,56,88,0.06)]",
          status === "已通过" ? "border-emerald-300" : "border-[var(--app-color-border-default)]",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 flex-1 text-[15px] font-semibold text-[var(--app-color-text-primary)]">{t.name}</span>
          <StatusChip text={status} />
        </div>
        <div className="mt-2 space-y-1 text-[12px]">
          <div className="flex"><span className="w-12 shrink-0 text-[var(--app-color-text-tertiary)]">类型</span><span className="min-w-0 flex-1 text-[var(--app-color-text-secondary)]">{t.typeName || "—"}</span></div>
          <div className="flex"><span className="w-12 shrink-0 text-[var(--app-color-text-tertiary)]">时间</span><span className="min-w-0 flex-1 text-[var(--app-color-text-secondary)]">{shortTime(o?.startTime)}</span></div>
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[var(--app-color-text-tertiary)]">地点</span>
            <span className="min-w-0 flex-1 truncate text-[var(--app-color-text-secondary)]">{o?.address || "—"}</span>
            <ActionButtons
              act={act}
              onEnroll={() => setTarget(t)}
              onCancel={() => o?.enrollmentId && doCancel({ id: o.enrollmentId })}
              onReapply={() => doReapply(t)}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 顶部：浅灰轨道 + 白色选中块（同 web 端 aup-view-toggle，不铺主色块） */}
      <div className="mx-3 mt-3 flex w-fit shrink-0 gap-0.5 rounded-lg bg-[var(--app-color-surface-hover)] p-0.5">
        {(["list", "mine"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "rounded-[6px] px-3.5 py-1.5 text-[13px] transition-colors",
              tab === k
                ? "bg-white font-semibold text-[var(--student-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.10)]"
                : "text-[var(--app-color-text-secondary)]",
            )}
          >
            {k === "list" ? "培训列表" : "我的报名"}
          </button>
        ))}
      </div>

      {/* 校区切换：纯文字，选中只看主色+加粗 */}
      {tab === "list" && campuses.length > 1 && (
        <div className="flex shrink-0 items-center gap-4 px-4 pt-3">
          {campuses.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCampus(c)}
              className={cn(
                "text-[13px] transition-colors",
                activeCampus === c
                  ? "font-semibold text-[var(--student-primary)]"
                  : "text-[var(--app-color-text-secondary)]",
              )}
            >
              {c}
              <span className="ml-1 text-[11px] opacity-60">{groups.find((g) => g.name === c)?.items.length ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6 pt-3">
        {tab === "list" ? (
          isLoading ? (
            <div className="flex items-center justify-center py-16 text-[13px] text-[var(--app-color-text-tertiary)]">
              <Loader2 className="mr-2 size-4 animate-spin" />加载中…
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-[var(--app-color-text-tertiary)]">
              <GraduationCap className="size-7" />
              <span className="text-[13px]">暂无可报名的培训</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(groups.find((g) => g.name === activeCampus)?.items ?? []).map(renderCard)}
            </div>
          )
        ) : mineLoading ? (
          <div className="flex items-center justify-center py-16 text-[13px] text-[var(--app-color-text-tertiary)]">
            <Loader2 className="mr-2 size-4 animate-spin" />加载中…
          </div>
        ) : enrollments.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[var(--app-color-text-tertiary)]">暂无报名记录</div>
        ) : (
          <div className="flex flex-col gap-3">
            {enrollments.map((e) => {
              const status = enrollStatus(true, e.testYn, e.testFraction);
              return (
                <div
                  key={e.id}
                  className={cn(
                    "rounded-2xl border bg-white p-3.5 shadow-[0_2px_10px_rgba(31,56,88,0.06)]",
                    status === "已通过" ? "border-emerald-300" : "border-[var(--app-color-border-default)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 text-[15px] font-semibold text-[var(--app-color-text-primary)]">{e.trainingName || "—"}</span>
                    <StatusChip text={status} />
                  </div>
                  <div className="mt-2 space-y-1 text-[12px]">
                    <div className="flex"><span className="w-12 shrink-0 text-[var(--app-color-text-tertiary)]">时间</span><span className="min-w-0 flex-1 text-[var(--app-color-text-secondary)]">{shortTime(e.startTime)}</span></div>
                    <div className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-[var(--app-color-text-tertiary)]">地点</span>
                      <span className="min-w-0 flex-1 truncate text-[var(--app-color-text-secondary)]">{e.address || "—"}</span>
                      {!isFullyPassed(e.testYn, e.testFraction) && (
                        <AdminButton type="button" tone="secondary" size="xs" className="shrink-0" onClick={() => doCancel(e)}>
                          取消报名
                        </AdminButton>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {target && (
        <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40" onClick={() => setTarget(null)}>
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[16px] font-bold text-[var(--app-color-text-primary)]">{target.name}</div>
                <div className="mt-0.5 text-[12px] text-[var(--app-color-text-tertiary)]">
                  {shortTime((target.occurrences ?? [])[0]?.startTime)} · {(target.occurrences ?? [])[0]?.address || "—"}
                </div>
              </div>
              <button type="button" onClick={() => setTarget(null)} className="shrink-0 p-1 text-[var(--app-color-text-tertiary)]" aria-label="关闭">
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2 rounded-xl bg-[var(--app-color-surface-hover)] px-4 py-3 text-[13px]">
              {(target.papers?.length ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--app-color-text-secondary)]">门槛试卷</span>
                  <span className={target.examPassed ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                    {target.examPassed ? "已合格" : "未合格"}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[var(--app-color-text-secondary)]">健康调查表</span>
                <span className={target.healthOk ? "font-semibold text-emerald-600" : "font-semibold text-neutral-400"}>
                  {target.healthOk ? "已提交" : "未提交"}
                </span>
              </div>
            </div>

            {!target.eligible && (
              <p className="mt-3 text-[12px] leading-relaxed text-amber-600">
                需先通过门槛试卷并提交健康调查表，可在学生中心完成后再来报名。
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <AdminButton type="button" tone="secondary" size="sm" onClick={() => setTarget(null)}>
                关闭
              </AdminButton>
              {target.eligible && (
                <AdminButton type="button" tone="primary" size="sm" disabled={busy} onClick={doEnroll}>
                  {busy ? "报名中…" : "确定报名"}
                </AdminButton>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
