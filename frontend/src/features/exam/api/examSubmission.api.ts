import { adminHttp } from "@/api/core/adminHttp";

export interface ExamSubmissionRow {
  id: number;
  paperId: number;
  personId: string;
  personName?: string;
  jobNumber?: string;
  paperTitle?: string;
  totalScore?: number | null;
  qualifyScoreSnapshot?: number | null;
  qualifyYn?: number;
  submittedAt?: string;
}

export interface ExamSubmissionDetail extends ExamSubmissionRow {
  answersJson?: string;
  scoreJson?: string;
  filesJson?: string;
}

export async function fetchExamSubmissions(paperId?: number): Promise<ExamSubmissionRow[]> {
  const r = await adminHttp.get("/exam-submissions", {
    params: paperId != null ? { paperId } : {},
  });
  return (r.data?.data ?? []) as ExamSubmissionRow[];
}

export async function fetchExamSubmission(id: number): Promise<ExamSubmissionDetail> {
  const r = await adminHttp.get(`/exam-submissions/${id}`);
  return r.data?.data as ExamSubmissionDetail;
}

/** 重置某人全部试卷的答题（清空分数与合格标记），学生端回到未作答。 */
export async function resetPersonSubmissions(personId: string): Promise<number> {
  const r = await adminHttp.delete("/exam-submissions", { params: { personId } });
  if (!r.data?.success) throw new Error(r.data?.message || "重置失败");
  return (r.data?.data?.rows ?? 0) as number;
}
