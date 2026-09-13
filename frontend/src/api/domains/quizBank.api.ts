import { adminHttp } from "@/api/core/adminHttp";
import type { ApiResponse } from "@/api/types/common";

/** 题库（违规「答题」处置策略的抽题来源） */
export interface QuizBank {
  bankId: string;
  name: string;
  /** 1=启用 */
  enabled: number;
  questionCount: number;
}

/** 题目。后端 optionsJson 已由接口还原为 options 数组。 */
export interface QuizQuestion {
  id: number;
  prompt: string;
  options: string[];
  /** 正确选项下标，从 0 起 */
  correctIndex: number;
  /** 1=启用 */
  enabled: number;
  sortOrder: number;
}

export interface QuizBankPayload {
  bankId: string;
  name: string;
}

export interface QuizBankUpdatePayload {
  name?: string;
  enabled?: number;
}

export interface QuizQuestionPayload {
  prompt: string;
  options: string[];
  correctIndex: number;
  enabled?: number;
}

/**
 * 后端 `Result.error` 以 HTTP 200 + success:false 返回。adminHttp 拦截器已会抛错，
 * 这里再显式判一次，避免在拦截器被绕过时把失败当成功。
 */
function unwrap<T>(body: ApiResponse<T> | undefined, fallback: T): T {
  if (body && body.success === false) throw new Error(body.message || "请求失败");
  return body?.data ?? fallback;
}

export async function listQuizBanks(): Promise<QuizBank[]> {
  const res = await adminHttp.get<ApiResponse<QuizBank[]>>("/twin/quiz-banks");
  return unwrap<QuizBank[]>(res.data, []);
}

export async function createQuizBank(body: QuizBankPayload): Promise<QuizBank | null> {
  const res = await adminHttp.post<ApiResponse<QuizBank>>("/twin/quiz-banks", body);
  return unwrap<QuizBank | null>(res.data, null);
}

export async function updateQuizBank(bankId: string, body: QuizBankUpdatePayload): Promise<QuizBank | null> {
  const res = await adminHttp.put<ApiResponse<QuizBank>>(`/twin/quiz-banks/${encodeURIComponent(bankId)}`, body);
  return unwrap<QuizBank | null>(res.data, null);
}

export async function deleteQuizBank(bankId: string): Promise<void> {
  const res = await adminHttp.delete<ApiResponse<unknown>>(`/twin/quiz-banks/${encodeURIComponent(bankId)}`);
  unwrap<unknown>(res.data, null);
}

export async function listQuizQuestions(bankId: string): Promise<QuizQuestion[]> {
  const res = await adminHttp.get<ApiResponse<QuizQuestion[]>>(
    `/twin/quiz-banks/${encodeURIComponent(bankId)}/questions`
  );
  return unwrap<QuizQuestion[]>(res.data, []);
}

export async function createQuizQuestion(bankId: string, body: QuizQuestionPayload): Promise<QuizQuestion | null> {
  const res = await adminHttp.post<ApiResponse<QuizQuestion>>(
    `/twin/quiz-banks/${encodeURIComponent(bankId)}/questions`,
    body
  );
  return unwrap<QuizQuestion | null>(res.data, null);
}

export async function updateQuizQuestion(id: number, body: QuizQuestionPayload): Promise<QuizQuestion | null> {
  const res = await adminHttp.put<ApiResponse<QuizQuestion>>(`/twin/quiz-banks/questions/${id}`, body);
  return unwrap<QuizQuestion | null>(res.data, null);
}

export async function deleteQuizQuestion(id: number): Promise<void> {
  const res = await adminHttp.delete<ApiResponse<unknown>>(`/twin/quiz-banks/questions/${id}`);
  unwrap<unknown>(res.data, null);
}
