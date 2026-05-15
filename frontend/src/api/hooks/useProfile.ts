import { useQuery } from "@tanstack/react-query";
import { fetchRoomOverview } from "@/api/domains/profile.api";

export const profileQueryKeys = {
    roomOverview: () => ["roomOverview"] as const,
};

export const useRoomOverviewQuery = () =>
    useQuery({
        queryKey: profileQueryKeys.roomOverview(),
        queryFn: fetchRoomOverview,
        select: (data) => (Array.isArray(data) ? data : []),
        initialData: [],
        staleTime: 0,
        refetchInterval: 5000,
        refetchOnMount: "always",
    });
