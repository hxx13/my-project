import { useQuery } from "@tanstack/react-query";
import { getStudentSessionScope } from "../utils/studentQueryScope";

/** 学生端统一查询封装：按当前会话 scope 隔离缓存。 */
export function useStudentQuery<T>(key: unknown[], queryFn: () => Promise<T>) {
  const scope = getStudentSessionScope();
  return useQuery<T>({
    queryKey: ["student", scope, ...key],
    queryFn,
    enabled: scope !== "anonymous",
    staleTime: 30 * 1000,
    retry: 1,
  });
}
