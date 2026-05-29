import { useQuery } from "@tanstack/react-query";
import { fetchStudentAiProfile } from "../api/student.api";
import type { AiPredictionRecord } from "../api/student.api";

/**
 * 获取当前学生的 AI 行为预测画像
 */
export function useStudentAiProfile() {
  return useQuery<AiPredictionRecord[]>({
    queryKey: ["student", "ai-profile"],
    queryFn: fetchStudentAiProfile,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
