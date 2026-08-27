import { useQuery } from "@tanstack/react-query";
import {
  fetchTeams,
  fetchTeamDetail,
  fetchTeamJoinRequests,
} from "@/api/domains/team.api";

export function useTeams(page = 1, pageSize = 20, keyword = "") {
  return useQuery({
    queryKey: ["team", "list", page, pageSize, keyword],
    queryFn: () => fetchTeams(page, pageSize, keyword),
    placeholderData: (prev) => prev,
  });
}

export function useTeamDetail(id: number | string | undefined) {
  return useQuery({
    queryKey: ["team", "detail", id],
    queryFn: () => fetchTeamDetail(id!),
    enabled: id != null,
  });
}

export function useTeamJoinRequests(id: number | string | undefined, status?: string) {
  return useQuery({
    queryKey: ["team", "join-requests", id, status],
    queryFn: () => fetchTeamJoinRequests(id!, { status }),
    enabled: id != null,
  });
}
