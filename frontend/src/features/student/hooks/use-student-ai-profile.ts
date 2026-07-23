import { useQuery } from "@tanstack/react-query";
import { fetchStudentAiProfile } from "../api/student.api";
import type { AiPredictionRecord } from "../api/student.api";
import { getStudentSessionScope, studentQueryKey } from "../utils/studentQueryScope";

/**
 * 获取当前学生的 AI 行为预测画像
 */
export function useStudentAiProfile() {
  const scope = getStudentSessionScope();
  return useQuery<AiPredictionRecord[]>({
    queryKey: studentQueryKey("ai-profile"),
    queryFn: fetchStudentAiProfile,
    enabled: scope !== "anonymous",
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
