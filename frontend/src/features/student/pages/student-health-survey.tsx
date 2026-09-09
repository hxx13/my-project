import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ChevronLeft, Loader2, Printer, Save } from "lucide-react";
import { useStudentQuery } from "../hooks/use-student-query";
import { fetchMyHealthSurvey, submitHealthSurvey } from "../api/student.api";
import { HealthSurveyForm, type SurveyValue } from "@/features/health-survey/HealthSurveyForm";
import "./health-survey-page.css";

export default function StudentHealthSurveyPage() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useStudentQuery(["health-survey"], fetchMyHealthSurvey);
  const [value, setValue] = useState<SurveyValue>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.data) setValue(data.data as SurveyValue);
  }, [data]);

  const submittedAt = data?.submittedAt;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await submitHealthSurvey(value);
      toast.success("已提交");
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "提交失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hs-page">
      <div className="hs-page-bar">
        <button type="button" className="hs-btn hs-btn-ghost" onClick={() => navigate(-1)}>
          <ChevronLeft className="mr-1 h-4 w-4" />返回
        </button>
        <div className="hs-page-bar-title">健康调查表</div>
        <div className="hs-page-bar-actions">
          {submittedAt && <span className="hs-page-hint">上次提交：{submittedAt}</span>}
          <button type="button" className="hs-btn hs-btn-ghost" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" />打印 / 导出 PDF
          </button>
          <button type="button" className="hs-btn hs-btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            提交
          </button>
        </div>
      </div>

      <div className="hs-page-scroll">
        {isLoading ? (
          <div className="hs-page-loading">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中…
          </div>
        ) : (
          <HealthSurveyForm value={value} onChange={setValue} />
        )}
      </div>
    </div>
  );
}
