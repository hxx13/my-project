/**
 * 手机版 — 答题 Tab（登录态学生中心）。
 * 只做选择题：提交即退出、不显示得分与正确答案，合格后不可再查看。
 * 顶栏（返回 / 试卷名 / 已答数 / 提交）借用壳层导航条，页面内不再自建第二条栏。
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { appConfirm } from "@/lib/appDialog";
import { AdminButton } from "@/components/admin/AdminButton";
import {
  fetchMyExamPaper,
  fetchMyExamPapers,
  submitExamPaper,
  type StudentPaperSummary,
} from "@/features/student/api/student.api";
import { useStudentQuery } from "@/features/student/hooks/use-student-query";

export interface ExamBarState {
  title: string;
  answered: number;
  total: number;
  submitting: boolean;
}

export interface MobileExamTabHandle {
  /** 答题中→返回列表；不在答题中返回 false，交给壳层处理 */
  pop: () => boolean;
  submit: () => void;
}

function fmt(s?: string | null): string {
  return s ? s.replace("T", " ").slice(0, 16) : "";
}

function toMs(s?: string | null): number | null {
  if (!s) return null;
  const t = new Date(s.replace(" ", "T")).getTime();
  return Number.isNaN(t) ? null : t;
}

function validityText(p: StudentPaperSummary): string {
  const from = fmt(p.validFrom);
  const to = fmt(p.validTo);
  if (!from && !to) return "不限";
  return `${from || "不限"} ~ ${to || "不限"}`;
}

function validityState(p: StudentPaperSummary): "before" | "after" | "open" {
  const now = Date.now();
  const from = toMs(p.validFrom);
  const to = toMs(p.validTo);
  if (from != null && now < from) return "before";
  if (to != null && now > to) return "after";
  return "open";
}

const TONE: Record<string, string> = {
  合格: "bg-emerald-50 text-emerald-600 border-emerald-200",
  不合格: "bg-rose-50 text-rose-600 border-rose-200",
  未作答: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

interface Q {
  key: string;
  index: number;
  label: string;
  multiple: boolean;
  options: { value: string; label: string }[];
}
interface Sec {
  code: string;
  label: string;
  questions: Q[];
}

const MobileExamTab = forwardRef<MobileExamTabHandle, { onBarChange?: (s: ExamBarState | null) => void }>(
  function MobileExamTab({ onBarChange }, ref) {
    const qc = useQueryClient();
    const [paperId, setPaperId] = useState<number | null>(null);
    const [answers, setAnswers] = useState<Record<string, unknown>>({});
    const [submitting, setSubmitting] = useState(false);

    const { data: papers = [], isLoading } = useStudentQuery(["exam-papers"], () => fetchMyExamPapers());
    const { data: paper, isLoading: paperLoading } = useStudentQuery(
      ["exam-paper", paperId ?? 0],
      () => fetchMyExamPaper(paperId as number),
      { enabled: paperId != null },
    );

    // 换卷时清空作答
    useEffect(() => {
      setAnswers({});
    }, [paperId]);

    const built = useMemo(() => {
      const sections: Sec[] = [];
      let index = 0;
      let unsupported = 0;
      for (const sec of paper?.sections ?? []) {
        const questions: Q[] = [];
        for (const f of sec.fields ?? []) {
          if (f.type !== "choice") {
            unsupported += 1;
            continue;
          }
          index += 1;
          questions.push({
            key: f.questionKey,
            index,
            label: f.label || f.questionKey,
            multiple: (f.config as { choiceType?: string } | undefined)?.choiceType === "multiple",
            options: (f.options as { value: string; label: string }[] | undefined) ?? [],
          });
        }
        if (questions.length) sections.push({ code: sec.code, label: sec.label || sec.code, questions });
      }
      return { sections, unsupported, total: index };
    }, [paper]);

    const answeredCount = useMemo(
      () => built.sections.reduce((n, s) => n + s.questions.filter((q) => {
        const v = answers[q.key];
        return Array.isArray(v) ? v.length > 0 : v != null && String(v) !== "";
      }).length, 0),
      [built, answers],
    );

    const isPicked = (q: Q, value: string) => {
      const v = answers[q.key];
      return Array.isArray(v) ? v.includes(value) : v === value;
    };

    const pick = (q: Q, value: string) => {
      setAnswers((prev) => {
        if (!q.multiple) return { ...prev, [q.key]: value };
        const cur = Array.isArray(prev[q.key]) ? [...(prev[q.key] as string[])] : [];
        const at = cur.indexOf(value);
        if (at >= 0) cur.splice(at, 1);
        else cur.push(value);
        return { ...prev, [q.key]: cur };
      });
    };

    const doSubmit = async () => {
      if (paperId == null || submitting) return;
      const unanswered = built.total - answeredCount;
      const ok = await appConfirm(
        unanswered > 0
          ? `还有 ${unanswered} 题未作答，提交后不可查看答案，确定提交吗？`
          : "提交后不可查看得分与正确答案，确定提交吗？",
      );
      if (!ok) return;
      setSubmitting(true);
      try {
        const r = await submitExamPaper(paperId, answers);
        qc.invalidateQueries({ queryKey: ["student"] });
        setPaperId(null);
        if (r.qualifyYn === 1) toast.success("提交成功：本次合格");
        else toast.error("提交成功：本次未合格，可重新作答");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "提交失败");
      } finally {
        setSubmitting(false);
      }
    };

    // 顶栏状态上报（去答题时才占用顶栏，列表态还给壳层默认标题）
    useEffect(() => {
      if (paperId == null) {
        onBarChange?.(null);
        return;
      }
      onBarChange?.({
        title: paper?.title ?? "",
        answered: answeredCount,
        total: built.total,
        submitting,
      });
    }, [paperId, paper?.title, answeredCount, built.total, submitting, onBarChange]);

    useImperativeHandle(
      ref,
      () => ({
        pop: () => {
          if (paperId == null) return false;
          setPaperId(null);
          return true;
        },
        submit: () => void doSubmit(),
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [paperId, submitting, built.total, answeredCount, answers],
    );

    /* ---------------- 答题视图 ---------------- */
    if (paperId != null) {
      if (paperLoading) {
        return (
          <div className="flex h-full items-center justify-center text-[13px] text-[var(--app-color-text-tertiary)]">
            <Loader2 className="mr-2 size-4 animate-spin" />加载中…
          </div>
        );
      }
      if (paper?.myQualifyYn === 1) {
        return (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="text-[15px] font-semibold text-[var(--app-color-text-primary)]">该试卷已合格</span>
            <span className="text-[13px] text-[var(--app-color-text-tertiary)]">答卷与正确答案不予展示</span>
          </div>
        );
      }
      return (
        <div className="h-full min-h-0 overflow-y-auto overscroll-contain px-3 pb-8 pt-3">
          {built.unsupported > 0 && (
            <div className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-600">
              本卷含 {built.unsupported} 道非选择题，手机端暂不支持，请到网页端作答
            </div>
          )}
          {built.sections.map((sec) => (
            <div key={sec.code} className="mb-2">
              <div className="mb-2 border-l-4 border-[var(--student-primary)] pl-2 text-[13px] font-semibold text-[var(--student-primary)]">
                {sec.label}
              </div>
              {sec.questions.map((q) => (
                <div
                  key={q.key}
                  className="mb-2.5 rounded-2xl border border-[var(--app-color-border-default)] bg-white px-3.5 py-3 shadow-[0_2px_10px_rgba(31,56,88,0.06)]"
                >
                  <div className="flex items-start gap-1.5">
                    <span className="shrink-0 text-[13px] font-bold text-[var(--student-primary)]">{q.index}</span>
                    <span className="min-w-0 flex-1 text-[14px] leading-relaxed text-[var(--app-color-text-primary)]">{q.label}</span>
                    {q.multiple && (
                      <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600">多选</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-col">
                    {q.options.map((o) => {
                      const on = isPicked(q, o.value);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => pick(q, o.value)}
                          className={cn(
                            "flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left text-[13px] leading-relaxed transition-colors",
                            on
                              ? "border-[var(--student-primary)] bg-[var(--student-primary-soft)]"
                              : "border-transparent bg-transparent",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] text-white",
                              on ? "border-[var(--student-primary)] bg-[var(--student-primary)]" : "border-[var(--app-color-text-tertiary)] bg-white",
                            )}
                          >
                            {on ? "✓" : ""}
                          </span>
                          <span className="min-w-0 flex-1 text-[var(--app-color-text-primary)]">{o.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    /* ---------------- 试卷列表 ---------------- */
    return (
      <div className="h-full min-h-0 overflow-y-auto overscroll-contain px-3 pb-6 pt-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[13px] text-[var(--app-color-text-tertiary)]">
            <Loader2 className="mr-2 size-4 animate-spin" />加载中…
          </div>
        ) : papers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-[var(--app-color-text-tertiary)]">
            <FileText className="size-7" />
            <span className="text-[13px]">暂无可作答的试卷</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {papers.map((p) => {
              const submitted = !!p.submitted;
              const passed = submitted && p.qualifyYn === 1;
              const status = !submitted ? "未作答" : p.qualifyYn === 1 ? "合格" : "不合格";
              const vs = validityState(p);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "rounded-2xl border bg-white p-3.5 shadow-[0_2px_10px_rgba(31,56,88,0.06)]",
                    passed ? "border-emerald-300" : "border-[var(--app-color-border-default)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 text-[15px] font-semibold text-[var(--app-color-text-primary)]">{p.title}</span>
                    <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] leading-tight", TONE[status])}>{status}</span>
                  </div>
                  <div className="mt-2 flex gap-6 text-[12px]">
                    <div><span className="text-[var(--app-color-text-tertiary)]">及格分 </span><span className="text-[var(--app-color-text-secondary)]">{p.qualifyScore ?? 80}</span></div>
                    <div><span className="text-[var(--app-color-text-tertiary)]">时限 </span><span className="text-[var(--app-color-text-secondary)]">{p.totalTime ? `${p.totalTime} 分钟` : "不限"}</span></div>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[12px]">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-[var(--app-color-text-tertiary)]">有效期 </span>
                      <span className="text-[var(--app-color-text-secondary)]">{validityText(p)}</span>
                    </span>
                    {passed ? (
                      <span className="shrink-0 text-[12px] text-[var(--app-color-text-tertiary)]">不可查看</span>
                    ) : vs !== "open" ? (
                      <span className="shrink-0 text-[12px] text-amber-600">{vs === "before" ? "未到开放时间" : "已过有效期"}</span>
                    ) : (
                      <AdminButton
                        type="button"
                        tone="primary"
                        size="xs"
                        className="shrink-0"
                        onClick={() => setPaperId(p.id)}
                      >
                        {submitted ? "重新作答" : "去答题"}
                      </AdminButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  },
);

export default MobileExamTab;
