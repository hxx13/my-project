import { http } from "@/api/core/http";
import { unwrapData, unwrapList, unwrapObject } from "@/api/types/common";
import type { ApiResponse } from "@/api/types/common";
import type {
    DebugLogFilterParams,
    DebugLogPageResponse,
    DebugRecord,
    FilteredStats,
    PersonnelPageResponse,
    PersonnelRecord,
    PredictionDashboard,
    RoomOverviewItem,
} from "@/api/types/profile";

export const searchPersonnel = async (keyword: string): Promise<PersonnelRecord[]> => {
    const response = await http.get<ApiResponse<PersonnelRecord[]>>("/dashboard/personnel/search", {
        params: { keyword },
    });
    return unwrapList<PersonnelRecord>(response.data, []);
};

export const fetchDebugPersonnelList = async (
    page: number,
    size = 100
): Promise<PersonnelPageResponse> => {
    const response = await http.get<ApiResponse<PersonnelPageResponse> | PersonnelPageResponse>("/dashboard/debug/personnel/list", {
        params: { page, size },
    });
    return unwrapObject(response.data, { data: [], total: 0 });
};

export const fetchDebugLogList = async (
    page: number,
    size = 100
): Promise<DebugLogPageResponse> => {
    const response = await http.get<ApiResponse<DebugLogPageResponse> | DebugLogPageResponse>("/dashboard/debug/logs/list", {
        params: { page, size },
    });
    return unwrapObject(response.data, { data: [], total: 0 });
};

export const fetchDebugLogs = async (): Promise<DebugRecord[]> => {
    const response = await http.get<ApiResponse<DebugRecord[]> | DebugRecord[]>("/dashboard/debug/logs");
    return unwrapList<DebugRecord>(response.data, []);
};

export const fetchPredictionDashboard = async (
    userId: string,
    roomId: string
): Promise<PredictionDashboard> => {
    const response = await http.get<ApiResponse<PredictionDashboard>>("/prediction/dashboard", {
        params: { userId, roomId },
    });
    return unwrapData(response.data, {} as PredictionDashboard);
};

export const fetchRoomOverview = async (): Promise<RoomOverviewItem[]> => {
    const response = await http.get<ApiResponse<RoomOverviewItem[]>>("/dashboard/wechat-overview");
    return unwrapList<RoomOverviewItem>(response.data, []);
};

export const fetchFilteredDebugLogs = async (
    params: DebugLogFilterParams
): Promise<DebugLogPageResponse> => {
    const response = await http.get<ApiResponse<DebugLogPageResponse> | DebugLogPageResponse>("/dashboard/debug/logs/filter", { params });
    return unwrapObject(response.data, { data: [], total: 0 });
};

export const fetchFilteredDebugStats = async (params: DebugLogFilterParams): Promise<FilteredStats> => {
    const response = await http.get<ApiResponse<FilteredStats>>("/dashboard/debug/stats", { params });
    return unwrapData(response.data, {} as FilteredStats);
};
