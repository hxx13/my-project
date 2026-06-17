import { useQuery } from "@tanstack/react-query";
import { fetchStudentAccessRecords } from "../api/student.api";
import type { StudentAccessRecord } from "../api/student.api";
import { getStudentSessionScope, studentQueryKey } from "../utils/studentQueryScope";

interface UseStudentAccessRecordsOptions {
  page?: number;
  size?: number;
}

/**
 * 获取学生出入记录
 *
 * 支持分页参数，默认第 1 页 / 每页 20 条。
 * 数据缓存 key 包含分页信息，切换页码时按需重新请求。
 */
export function useStudentAccessRecords(options: UseStudentAccessRecordsOptions = {}) {
  const { page = 1, size = 20 } = options;

  const scope = getStudentSessionScope();
  return useQuery<{ data: StudentAccessRecord[]; total: number }>({
    queryKey: studentQueryKey("access-records", { page, size }),
    queryFn: () => fetchStudentAccessRecords(page, size),
    enabled: scope !== "anonymous",
    staleTime: 60 * 1000, // 1 分钟
    retry: 1,
  });
}
