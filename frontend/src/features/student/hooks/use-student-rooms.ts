import { useQuery } from "@tanstack/react-query";
import { fetchRooms } from "../api/student.api";
import type { FetchRoomsParams, RoomData } from "../api/student.api";
import { getStudentSessionScope, studentQueryKey } from "../utils/studentQueryScope";

/**
 * 获取房间列表
 *
 * 支持按置顶、楼层、状态、搜索等多维筛选，以及分页参数。
 * staleTime=0：每次打开页面重新拉取，保证数据实时。
 */
export function useStudentRooms(params: FetchRoomsParams = {}) {
  const scope = getStudentSessionScope();
  return useQuery<{ data: RoomData[]; total: number; page: number; size: number }>({
    queryKey: studentQueryKey("rooms", params),
    queryFn: () => fetchRooms(params),
    enabled: scope !== "anonymous",
    staleTime: 0,
    retry: 1,
  });
}
