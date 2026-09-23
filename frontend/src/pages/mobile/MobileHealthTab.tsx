/**
 * 手机版 — 健康调查表 Tab（登录态学生中心）。
 * 复用 web 端同一份 schema 驱动的 HealthSurveyForm（正文只有一处真相），
 * 只在 .mhs-page 作用域内把 A4 定宽版式改成随屏宽流式（见 mobile-health-survey.css）。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { AdminButton } from "@/components/admin/AdminButton";
import { HealthSurveyForm, type SurveyValue } from "@/features/health-survey/HealthSurveyForm";
import { useStudentQuery } from "@/features/student/hooks/use-student-query";
import { fetchMyHealthSurvey, submitHealthSurvey } from "@/features/student/api/student.api";
import "./mobile-health-survey.css";

export default function MobileHealthTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useStudentQuery(["health-survey"], fetchMyHealthSurvey);
  const [value, setValue] = useState<SurveyValue>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.data) setValue(data.data as SurveyValue);
  }, [data]);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await submitHealthSurvey(value);
      toast.success("已提交");
      refetch();
      // 报名资格里的 healthOk 来自学生端聚合查询，提交后要让报名页拿到新状态
      qc.invalidateQueries({ queryKey: ["student"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--app-color-surface-hover)]">
      <div className="mhs-page min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[13px] text-[var(--app-color-text-tertiary)]">
            <Loader2 className="mr-2 size-4 animate-spin" />加载中…
          </div>
        ) : (
          <HealthSurveyForm value={value} onChange={setValue} />
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--app-color-border-default)] bg-white px-3 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-[var(--app-color-text-tertiary)]">
            {data?.submittedAt ? `上次提交：${String(data.submittedAt).slice(0, 16).replace("T", " ")}` : "尚未提交"}
          </span>
          <AdminButton type="button" tone="primary" size="sm" disabled={saving || isLoading} onClick={submit}>
            {saving ? "提交中…" : "提交"}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
