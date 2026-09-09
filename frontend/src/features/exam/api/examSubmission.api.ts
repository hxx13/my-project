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
