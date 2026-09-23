import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMyExamPapers, fetchMyQualificationReport, fetchMyQualifications, fetchLearningMaterialsForStudent, fetchLearningMaterialFile, type StudentPaperSummary } from "../api/student.api";
import { useStudentQuery } from "../hooks/use-student-query";
import { ShrinkText } from "../components/shrink-text";
import { PdfPreviewDialog } from "@/components/common/PdfPreviewDialog";
import "./student-list.css";

function paperStatus(p: StudentPaperSummary): "未作答" | "合格" | "不合格" {
  if (!p.submitted) return "未作答";
  return p.qualifyYn === 1 ? "合格" : "不合格";
}

const STATUS_SEAL: Record<string, { lines: string[]; cls: string }> = {
  未作答: { lines: ["未", "作答"], cls: "draft" },
  合格: { lines: ["合", "格"], cls: "approved" },
  不合格: { lines: ["不", "合格"], cls: "terminated" },
};

const EXAM_FILTERS: { id: "all" | "unpassed" | "passed"; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "unpassed", label: "未通过" },
  { id: "passed", label: "通过" },
];

/** 后端墙钟时间（"yyyy-MM-dd HH:mm:ss"）→ "yyyy-MM-dd HH:mm" */
function fmt(s?: string | null): string {
  return s ? s.replace("T", " ").slice(0, 16) : "";
}

function toMs(s?: string | null): number | null {
  if (!s) return null;
  const t = new Date(s.replace(" ", "T")).getTime();
  return Number.isNaN(t) ? null : t;
}

function validityText(p: StudentPaperSummary): string {
  const f = fmt(p.validFrom);
  const t = fmt(p.validTo);
  if (!f && !t) return "不限";
  return `${f || "不限"} ~ ${t || "不限"}`;
}

/** 有效期状态：未到开始 / 已过截止 / 开放中。 */
function validityState(p: StudentPaperSummary): "before" | "after" | "open" {
  const now = Date.now();
  const from = toMs(p.validFrom);
  const to = toMs(p.validTo);
  if (from != null && now < from) return "before";
  if (to != null && now > to) return "after";
  return "open";
}

function PaperCard({ p, onOpen }: { p: StudentPaperSummary; onOpen: () => void }) {
  const status = paperStatus(p);
  const seal = STATUS_SEAL[status];
  const vs = validityState(p);
  const passed = status === "合格";
  const canAnswer = vs === "open" && !passed;
  return (
    <div className="aup-card-cell">
      <div className="aup-doc-stack">
        <div className={`aup-doc${passed ? " is-passed" : ""}`} onClick={canAnswer ? onOpen : undefined}>
          <div className="aup-doc-hd">
            <div style={{ flex: 1, minWidth: 0 }}>
              <ShrinkText text={p.title} lines={1} baseFontPx={14} className="aup-doc-title" />
            </div>
            <span className="aup-doc-no">及格 {p.qualifyScore ?? 80}</span>
          </div>
          <div className="aup-doc-body">
            <div className="aup-f">
              <div className="aup-f-k">时限</div>
              <ShrinkText text={p.totalTime ? `${p.totalTime} 分钟` : "不限"} lines={2} className="aup-f-v" />
            </div>
            <div className="aup-f">
              <div className="aup-f-k">有效期</div>
              <ShrinkText text={validityText(p)} lines={2} className="aup-f-v" />
            </div>
          </div>
          <div className="aup-doc-foot">
            <div className="aup-doc-acts">
              {passed ? (
                <span className="text-xs font-medium text-[var(--success)]">已合格，不可查看答卷</span>
              ) : vs !== "open" ? (
                <span className="text-xs font-medium text-[var(--warn)]">{vs === "before" ? "未到开放时间" : "已过有效期"}</span>
              ) : (
                <button className="btn primary small" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
                  {p.submitted ? "重新作答" : "去答题"}
                </button>
              )}
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

export default function StudentExamPage() {
  const navigate = useNavigate();
  const { data = [], isLoading, isError, error, refetch } = useStudentQuery(
    ["exam-papers"],
    () => fetchMyExamPapers(),
  );
  const [view, setView] = useState<"card" | "list">("card");
  const [filter, setFilter] = useState<"all" | "unpassed" | "passed">("all");
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [previewMaterialId, setPreviewMaterialId] = useState<number | null>(null);
  const { data: quals = [] } = useStudentQuery(["my-qualifications"], fetchMyQualifications);
  const { data: materials = [] } = useStudentQuery(["learning-materials"], fetchLearningMaterialsForStudent);
  const healthFile = quals.find((q) => q.itemKey === "health_report")?.fileRef ?? null;

  const filtered = useMemo(() => {
    return data.filter((p) => {
      const s = paperStatus(p);
      if (filter === "passed") return s === "合格";
      if (filter === "unpassed") return s !== "合格";
      return true;
    });
  }, [data, filter]);

  return (
    <div className="stu-list" style={{ height: "100%" }}>
      <div className="list-card list-card-top">
        <div className="aup-filter-toolbar">
          <div className="aup-view-toggle" role="tablist" aria-label="视图切换">
            <button className={view === "card" ? "on" : ""} onClick={() => setView("card")}>▦ 卡片</button>
            <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>☰ 列表</button>
          </div>
          <div className="aup-view-toggle" role="tablist" aria-label="答题状态">
            {EXAM_FILTERS.map((f) => (
              <button key={f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          <button
            type="button"
            className="btn ghost small"
            style={{ marginLeft: "auto" }}
            title="在线填写 / 查看健康调查表"
            onClick={() => navigate("/student/health-survey")}
          >
            {healthFile ? "查看健康报告" : "上传健康报告"}
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setMaterialsOpen(true)}
          >
            学习PDF
          </button>
          <button
            type="button"
            className="btn ghost small"
            title="查看我已获得的培训证书"
            onClick={() => navigate("/student/certificates")}
          >
            我的证书
          </button>
        </div>
      </div>

      <div className="list-card list-card-body">
        <div className="list-card-scroll">
          <div className="list-count">共 {filtered.length} 套试卷</div>
          {isLoading ? (
            <div className="aup-empty">加载中…</div>
          ) : isError ? (
            <div className="aup-empty">加载失败，<button className="btn ghost small" onClick={() => refetch()}>重试</button></div>
          ) : filtered.length === 0 ? (
            <div className="aup-empty">暂无试卷</div>
          ) : view === "card" ? (
            <div className="aup-card-grid">
              {filtered.map((p) => (
                <PaperCard key={p.id} p={p} onOpen={() => navigate(`/student/exam/${p.id}`)} />
              ))}
            </div>
          ) : (
            <table className="list-table">
              <thead>
                <tr>
                  <th>试卷标题</th>
                  <th>及格分</th>
                  <th>时限</th>
                  <th>有效期</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const status = paperStatus(p);
                  const vs = validityState(p);
                  const passed = status === "合格";
                  return (
                    <tr key={p.id} className={`row${passed ? " is-passed" : ""}`}>
                      <td><span className="proj-name">{p.title}</span></td>
                      <td>{p.qualifyScore ?? 80}</td>
                      <td>{p.totalTime ? `${p.totalTime} 分钟` : "不限"}</td>
                      <td>{validityText(p)}</td>
                      <td><span className={`status-badge ${STATUS_SEAL[status].cls}`}>{status}</span></td>
                      <td>
                        {passed ? (
                          <span className="text-xs font-medium text-[var(--success)]">已合格</span>
                        ) : vs !== "open" ? (
                          <span className="text-xs font-medium text-[var(--warn)]">{vs === "before" ? "未到开放时间" : "已过有效期"}</span>
                        ) : (
                          <button className="btn primary small" onClick={() => navigate(`/student/exam/${p.id}`)}>
                            {p.submitted ? "重新作答" : "去答题"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {materialsOpen && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => setMaterialsOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">学习资料</h3>
              <button type="button" onClick={() => setMaterialsOpen(false)} aria-label="关闭">✕</button>
            </div>
            {materials.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--muted)]">暂无学习资料</p>
            ) : (
              <div className="max-h-[60vh] space-y-1 overflow-auto">
                {materials.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--app-color-surface-hover)]"
                    onClick={() => {
                      setMaterialsOpen(false);
                      setPreviewMaterialId(m.id);
                    }}
                  >
                    <span className="font-medium">{m.title}</span>
                    {m.category ? <span className="ml-2 text-xs text-[var(--muted)]">{m.category}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {previewMaterialId != null && (
        <PdfPreviewDialog
          title={materials.find((m) => m.id === previewMaterialId)?.title ?? "学习资料"}
          fileName={`${materials.find((m) => m.id === previewMaterialId)?.title ?? "学习资料"}.pdf`}
          fetchPdf={() => fetchLearningMaterialFile(previewMaterialId)}
          onClose={() => setPreviewMaterialId(null)}
        />
      )}
    </div>
  );
}
