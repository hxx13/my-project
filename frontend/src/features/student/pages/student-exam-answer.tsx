import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import NhpFormField from "@/features/nhp/components/NhpFormField";
import type { FormField } from "@/features/nhp/schema/formTemplate";
import { fetchMyExamPaper, submitExamPaper, type StudentPaperDetail } from "../api/student.api";
import { useStudentQuery } from "../hooks/use-student-query";
import "@/features/aup/aup.css";
import "@/features/nhp/nhp.css";

interface QSection {
  code: string;
  label: string;
  questions: { key: string; label: string; required?: boolean; field: FormField }[];
}

/** 学生卷 → 复用 NHP FormField 所需的 sections（questionKey → fieldKey） */
function toSections(paper: StudentPaperDetail): QSection[] {
  return paper.sections.map((sec) => ({
    code: sec.code,
    label: sec.label,
    questions: (sec.fields ?? []).map((q) => ({
      key: q.questionKey,
      label: q.label,
      required: q.required,
      field: {
        fieldKey: q.questionKey,
        label: q.label,
        type: q.type as FormField["type"],
        required: q.required,
        options: q.options as FormField["options"],
        config: q.config as FormField["config"],
      },
    })),
  }));
}

export default function StudentExamAnswerPage() {
  const { paperId } = useParams();
  const id = Number(paperId);
  const navigate = useNavigate();

  const { data: paper, isLoading, isError, error, refetch } = useStudentQuery(
    ["exam-paper", id],
    () => fetchMyExamPaper(id),
  );

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [initialized, setInitialized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const sections = useMemo(() => (paper ? toSections(paper) : []), [paper]);
  const draftKey = `exam-draft-${id}`;

  // 已合格卷不允许再查看/重看答案，只有本地的未提交草稿会回填
  const passed = paper?.myQualifyYn === 1;

  useEffect(() => {
    if (!paper || initialized || passed) return;
    try {
      const draft = localStorage.getItem(draftKey);
      if (draft) setAnswers(JSON.parse(draft));
    } catch { /* ignore */ }
    setInitialized(true);
  }, [paper, initialized, draftKey, passed]);

  const isAnswered = (key: string) => {
    const v = answers[key];
    return v != null && (Array.isArray(v) ? v.length > 0 : String(v) !== "");
  };

  const answeredCount = useMemo(
    () => sections.reduce((n, s) => n + s.questions.filter((q) => isAnswered(q.key)).length, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, answers],
  );

  const handleSave = () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(answers));
      toast.success("已保存草稿");
    } catch { /* ignore */ }
  };

  /** 提交即退出：不回显得分、不给看正确答案，只提示本次是否合格。 */
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const r = await submitExamPaper(id, answers);
      localStorage.removeItem(draftKey);
      qc.invalidateQueries({ queryKey: ["student"] });
      if (r.qualifyYn === 1) toast.success("提交成功：本次合格");
      else toast.error("提交成功：本次未合格，可重新作答");
      navigate("/student/exam");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const scrollTo = (key: string) => {
    document.getElementById(`q-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-[var(--student-mute)]">加载中…</div>;
  }
  if (isError || !paper) {
    return (
      <div className="p-6 text-sm text-[var(--student-error)]">
        {error instanceof Error ? error.message : "试卷不存在"}
        <button className="ml-3 underline" onClick={() => refetch()}>重试</button>
      </div>
    );
  }
  if (passed) {
    return (
      <div className="p-6 text-sm text-[var(--student-mute)]">
        该试卷已合格，答卷与答案不予展示。
        <button className="ml-3 underline" onClick={() => navigate("/student/exam")}>返回</button>
      </div>
    );
  }

  return (
    <div className="aup-app nhp-fill-portal" style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* 顶栏：返回 + 标题 + 右侧 保存/提交（固定，不随内容滚） */}
        <div className="toolbar" style={{ position: "static", top: "auto", flexShrink: 0 }}>
          <button type="button" className="btn ghost" onClick={() => navigate("/student/exam")}>← 返回</button>
          <h1 className="nhp-fill-toolbar-title" style={{ margin: 0 }}>{paper.title}</h1>
          <span className="spacer" />
          <span className="autosave">已答 {answeredCount} 题</span>
          <button type="button" className="btn ghost" onClick={handleSave}>保存</button>
          <button type="button" className="btn primary" disabled={submitting} onClick={handleSubmit}>
            {submitting ? "提交中…" : "提交"}
          </button>
        </div>

        <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 16, padding: "12px 16px" }}>
          {/* 左侧章节树（固定，独立滚动） */}
          <aside className="sidebar" style={{ position: "static", top: "auto", width: 240, height: "100%", maxHeight: "none", flexShrink: 0 }}>
            <div className="hd">大题章节</div>
            <div className="sidebar-body">
              {sections.map((sec) => (
                <div key={sec.code}>
                  <div className="nav-item" onClick={() => scrollTo(sec.questions[0]?.key ?? "")}>
                    <span className="mark todo" />
                    <span className="nav-label">
                      <span className="nav-zh">{sec.label}</span>{" "}
                      <code className="nav-code">{sec.code}</code>
                    </span>
                  </div>
                  {sec.questions.map((q) => (
                    <div key={q.key} className="nav-item nav-sub" onClick={() => scrollTo(q.key)}>
                      <span
                        className={cn("mark", "todo")}
                        style={isAnswered(q.key) ? { background: "var(--primary)" } : undefined}
                      />
                      <span className="nav-label">{q.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </aside>

          {/* 中间题目（滚动区） */}
          <main className="main" style={{ flex: 1, minWidth: 0, overflowY: "auto", height: "100%" }}>
            {sections.map((sec) => (
              <section key={sec.code} className="card aup-section">
                <h2>{sec.label}</h2>
                {sec.questions.map((q) => (
                  <div key={q.key} id={`q-${q.key}`} className="field" style={{ scrollMarginTop: 136 }}>
                    <label>
                      {q.label}
                      {q.required && <span className="req">*</span>}
                    </label>
                    <NhpFormField
                      field={q.field}
                      value={answers[q.key]}
                      onChange={(v) => setAnswers((p) => ({ ...p, [q.key]: v }))}
                    />
                  </div>
                ))}
              </section>
            ))}
          </main>

          {/* 右侧提示 / 注意事项 / 图片（占位，固定） */}
          <aside className="sidebar" style={{ position: "static", top: "auto", width: 260, height: "100%", maxHeight: "none", flexShrink: 0 }}>
            <div className="hd">提示与注意事项</div>
            <div className="sidebar-body" style={{ padding: 12 }}>
              <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
                提交后不展示得分与正确答案。本次未合格可重新作答，合格后答卷不再开放。
              </p>
            </div>
          </aside>
        </div>
      </div>
  );
}
