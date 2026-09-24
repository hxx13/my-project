import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award, ChevronLeft, FileText } from "lucide-react";
import { PdfPreviewDialog } from "@/components/common/PdfPreviewDialog";
import { fetchCertificatePdf, fetchMyCertificates, type MyCertificate } from "../api/student.api";
import { useStudentQuery } from "../hooks/use-student-query";
import { groupByTraining } from "../certificates/group-certificates";
import "../certificates/certificate-page.css";

function fmtDate(d?: string | null): string {
  return d ? String(d).slice(0, 10) : "—";
}

/**
 * 我的证书：列出人拿到过的全部培训证书。
 * 点「预览」从后端拉 PDF 打开查看（PDF 阅读器自带打印/下载）。
 * 证书是发证即快照，与培训、试卷后续是否还在无关。
 */
export default function StudentCertificatesPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useStudentQuery(
    ["certificates"],
    fetchMyCertificates,
  );
  const [preview, setPreview] = useState<MyCertificate | null>(null);

  const list = data?.list ?? [];
  const templates = data?.templates ?? [];
  const titleOf = (key: string) => templates.find((t) => t.key === key)?.titleZh ?? "培训证书";

  // 按培训分区。后端已按 training_date DESC 排好，顺着切段就天然有序，
  // 同场次发的那两张证书也不会被拆开。
  const groups = useMemo(() => groupByTraining(list), [list]);

  return (
    <div className="cert-page">
      <div className="cert-page-bar">
        <button type="button" className="cert-btn cert-btn-ghost" onClick={() => navigate("/student/exam")}>
          <ChevronLeft className="size-4" />返回
        </button>
        <div className="cert-page-bar-title">我的证书</div>
        <div className="cert-page-bar-actions">
          <span style={{ fontSize: 12, color: "var(--app-color-text-tertiary)" }}>
            {groups.length} 项培训 · 共 {list.length} 张
          </span>
        </div>
      </div>

      <div className="cert-page-scroll">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-[var(--app-color-text-tertiary)]">加载中…</div>
        ) : isError ? (
          <div className="py-16 text-center text-sm text-[var(--app-color-text-tertiary)]">
            {error instanceof Error ? error.message : "加载失败"}
            <button type="button" className="ml-3 underline" onClick={() => refetch()}>重试</button>
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-[var(--app-color-text-tertiary)]">
            <Award className="size-8" />
            <span className="text-sm">还没有证书</span>
            <span className="text-xs">培训「审批 + 评分」双双通过后自动发放（每场一对：准入 + 安乐死）</span>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-4">
            {groups.map((g) => (
              <section key={g.key}>
                <div className="flex items-baseline gap-2 border-b border-[var(--app-color-border-default)] pb-2">
                  <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--app-color-text-primary)]">
                    {g.name}
                  </h3>
                  {g.date ? (
                    <span className="shrink-0 text-xs text-[var(--app-color-text-tertiary)]">{fmtDate(g.date)}</span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-xs text-[var(--app-color-text-tertiary)]">
                    {g.items.length} 张
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {g.items.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-col gap-2 rounded-xl border border-[var(--app-color-border-default)] bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 text-[15px] font-semibold text-[var(--app-color-text-primary)]">
                          {titleOf(c.templateKey)}
                        </span>
                        <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-600">
                          已发放
                        </span>
                      </div>
                      <div className="font-mono text-[11px] tracking-wide text-[var(--app-color-text-tertiary)]">
                        编号 {c.certNo || "—"}
                      </div>
                      <div className="space-y-0.5 text-xs text-[var(--app-color-text-secondary)]">
                        <div>姓名：{c.personName || "—"}</div>
                        <div>培训日期：{fmtDate(c.trainingDate)}</div>
                        <div>培训者签字：{c.trainerName || "—"}</div>
                      </div>
                      <div className="mt-1 flex justify-end">
                        <button type="button" className="cert-btn cert-btn-primary" onClick={() => setPreview(c)}>
                          <FileText className="size-4" />预览
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {preview && (
        <PdfPreviewDialog
          title={titleOf(preview.templateKey)}
          fileName={`${titleOf(preview.templateKey)}-${preview.personName ?? ""}.pdf`}
          fetchPdf={() => fetchCertificatePdf(preview.id)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
