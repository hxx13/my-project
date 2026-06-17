import { useQuery } from "@tanstack/react-query";
import { fetchStudentProfile } from "../api/student.api";
import type { StudentProfile } from "../api/student.api";
import { getStudentSessionScope, studentQueryKey } from "../utils/studentQueryScope";

/**
 * 获取学生个人聚合档案
 *
 * 封装 TanStack Query，自动缓存并提供 loading / error / data 三态。
 * queryKey 含当前会话 userId，特殊通道换人时不复用上一人缓存。
 */
export function useStudentProfile() {
  const scope = getStudentSessionScope();
  return useQuery<StudentProfile>({
    queryKey: studentQueryKey("profile"),
    queryFn: fetchStudentProfile,
    enabled: scope !== "anonymous",
    staleTime: 5 * 60 * 1000, // 5 分钟窗口期内不重新请求
    retry: 2,
  });
}
