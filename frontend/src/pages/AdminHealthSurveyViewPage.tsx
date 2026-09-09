import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Printer } from "lucide-react";
import { adminHttp } from "@/api/core/adminHttp";
import { HealthSurveyForm, type SurveyValue } from "@/features/health-survey/HealthSurveyForm";
import "@/features/student/pages/health-survey-page.css";

interface SurveyPayload {
  data: SurveyValue;
  submittedAt?: string;
}

/** 管理端查看某人的健康调查表答卷（只读）。 */
export default function AdminHealthSurveyViewPage() {
  const { personId } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["health-survey", personId],
    queryFn: async () => {
      const r = await adminHttp.get(`/training/qualifications/health-survey/${personId}`);
      return (r.data?.data ?? null) as SurveyPayload | null;
    },
    enabled: !!personId,
  });

  return (
    <div className="hs-page">
      <div className="hs-page-bar">
        <button type="button" className="hs-btn hs-btn-ghost" onClick={() => navigate(-1)}>
          <ChevronLeft className="mr-1 h-4 w-4" />返回
        </button>
        <div className="hs-page-bar-title">健康调查表（查看）</div>
        <div className="hs-page-bar-actions">
          {data?.submittedAt && <span className="hs-page-hint">提交时间：{data.submittedAt}</span>}
          <button type="button" className="hs-btn hs-btn-ghost" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" />打印 / 导出 PDF
          </button>
        </div>
      </div>

      <div className="hs-page-scroll">
        {isLoading ? (
          <div className="hs-page-loading">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中…
          </div>
        ) : !data ? (
          <div className="hs-page-loading">该人员尚未提交健康调查表</div>
        ) : (
          <HealthSurveyForm value={data.data} readOnly />
        )}
      </div>
    </div>
  );
}
