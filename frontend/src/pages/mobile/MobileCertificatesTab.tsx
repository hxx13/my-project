/**
 * 手机版 — 我的证书 Tab（登录态学生中心）。
 * 培训「审批 + 评分」双通过后自动发证（每场一对：准入 + 安乐死）。
 * 证书是发证即快照，与培训、试卷后续是否还在无关。
 */
import { useState } from "react";
import { Award, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin/AdminButton";
import { PdfPreviewDialog } from "@/components/common/PdfPreviewDialog";
import {
  fetchCertificatePdf,
  fetchMyCertificates,
  type MyCertificate,
} from "@/features/student/api/student.api";
import { useStudentQuery } from "@/features/student/hooks/use-student-query";

function fmtDate(d?: string | null): string {
  return d ? String(d).slice(0, 10) : "—";
}

export default function MobileCertificatesTab() {
  const { data, isLoading, isError, error, refetch } = useStudentQuery(
    ["certificates"],
    fetchMyCertificates,
  );
  const [preview, setPreview] = useState<MyCertificate | null>(null);

  const list = data?.list ?? [];
  const templates = data?.templates ?? [];
  const titleOf = (key: string) => templates.find((t) => t.key === key)?.titleZh ?? "培训证书";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6 pt-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[13px] text-[var(--app-color-text-tertiary)]">
            <Loader2 className="mr-2 size-4 animate-spin" />加载中…
          </div>
        ) : isError ? (
          <div className="py-16 text-center text-[13px] text-[var(--app-color-text-tertiary)]">
            {error instanceof Error ? error.message : "加载失败"}
            <button type="button" className="ml-2 underline" onClick={() => refetch()}>重试</button>
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-[var(--app-color-text-tertiary)]">
            <Award className="size-8" />
            <span className="text-[13px]">还没有证书</span>
            <span className="px-6 text-center text-[12px] leading-relaxed">
              培训「审批 + 评分」双双通过后自动发放（每场一对：准入 + 安乐死）
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "rounded-2xl border border-[var(--app-color-border-default)] bg-white p-3.5",
                  "shadow-[0_2px_10px_rgba(31,56,88,0.06)]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 text-[15px] font-semibold text-[var(--app-color-text-primary)]">
                    {titleOf(c.templateKey)}
                  </span>
                  <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] leading-tight text-emerald-600">
                    已发放
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-[12px]">
                  <div className="flex"><span className="w-16 shrink-0 text-[var(--app-color-text-tertiary)]">姓名</span><span className="min-w-0 flex-1 text-[var(--app-color-text-secondary)]">{c.personName || "—"}</span></div>
                  <div className="flex"><span className="w-16 shrink-0 text-[var(--app-color-text-tertiary)]">培训日期</span><span className="min-w-0 flex-1 text-[var(--app-color-text-secondary)]">{fmtDate(c.trainingDate)}</span></div>
                  <div className="flex"><span className="w-16 shrink-0 text-[var(--app-color-text-tertiary)]">培训者签字</span><span className="min-w-0 flex-1 text-[var(--app-color-text-secondary)]">{c.trainerName || "—"}</span></div>
                  {c.trainingName ? (
                    <div className="flex"><span className="w-16 shrink-0 text-[var(--app-color-text-tertiary)]">来源培训</span><span className="min-w-0 flex-1 truncate text-[var(--app-color-text-secondary)]">{c.trainingName}</span></div>
                  ) : null}
                </div>
                <div className="mt-3 flex justify-end">
                  <AdminButton type="button" tone="primary" size="sm" onClick={() => setPreview(c)}>
                    <FileText className="mr-1 size-4" />预览
                  </AdminButton>
                </div>
              </div>
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
