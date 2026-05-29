import { useQuery } from "@tanstack/react-query";
import { fetchStudentProfile } from "../api/student.api";
import type { StudentProfile } from "../api/student.api";

/**
 * 获取学生个人聚合档案
 *
 * 封装 TanStack Query，自动缓存并提供 loading / error / data 三态。
 * queryKey 以 "student" 域名为前缀，与其余查询互不干扰。
 */
export function useStudentProfile() {
  return useQuery<StudentProfile>({
    queryKey: ["student", "profile"],
    queryFn: fetchStudentProfile,
    staleTime: 5 * 60 * 1000, // 5 分钟窗口期内不重新请求
    retry: 2,
  });
}
