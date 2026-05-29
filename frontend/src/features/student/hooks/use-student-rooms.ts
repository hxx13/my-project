import { useQuery } from "@tanstack/react-query";
import { fetchRooms } from "../api/student.api";
import type { FetchRoomsParams, RoomData } from "../api/student.api";

/**
 * 获取房间列表
 *
 * 支持按置顶、楼层、状态、搜索等多维筛选，以及分页参数。
 * staleTime 设为 30 秒，兼顾实时性与请求压力。
 */
export function useStudentRooms(params: FetchRoomsParams = {}) {
  return useQuery<{ data: RoomData[]; total: number; page: number; size: number }>({
    queryKey: ["student", "rooms", params],
    queryFn: () => fetchRooms(params),
    staleTime: 30 * 1000,
    retry: 1,
  });
}
