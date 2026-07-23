import type { PaginatedResponse } from "@/api/types/common";

export interface PersonnelRecord {
    user_id: string;
    name: string;
    head: string;
    gender: number;
    mobile_phone: string;
    department_name: string;
    project_group_name: string;
    user_type_names: string;
}

export type PersonnelPageResponse = PaginatedResponse<PersonnelRecord>;

export interface DebugRecord {
    id: string;
    user_id?: string;
    accessType: number;
    create_time: string;
    name: string;
    user_type_names: string;
    project_group_names: string;
    area_name: string;
    room_name: string;
    is_borrowed_card?: number;
    is_own_card?: number;
    has_physical_card_mapping?: number;
    freeze_exempt_flag?: number;
    is_shared_card?: number;
    is_keep_card?: number;
}

export type DebugLogPageResponse = PaginatedResponse<DebugRecord>;

export interface RoomOverviewItem {
    roomName: string;
    totalCapacity: number;
    remainingCards: number;
    campusUserCount: number;
    borrowedCardCount: number;
    followingCount: number;
    mappingAliases?: string;
    aliases?: string;
    /** 与 aro_access_log.room_id 一致；支持英文逗号、中文逗号、分号分隔多个 id（多后室共一条限载） */
    capacityBindRoomId?: string | null;
    /** room_config 主键（历史 JSON 字段 roomId） */
    roomId?: number | null;
}

export interface PredictionDashboard {
    medianDurationMins?: number;
    peakEntryTime?: string;
    overtimeProb?: number;
    nextRoomPrediction?: string;
    /** 与 entryCurve 一致：24 点向量，07–19 为 PMF，其余为 0 */
    curveHourWindow?: string;
    /** 如 same_day_fifo：仅同日进离场成对计入曲线 */
    sessionPairing?: string;
    weeklyCurveKind?: string;
    entryCurve?: number[] | string;
    exitCurve?: number[] | string;
    weeklyEntryCurve?: number[] | string;
    weeklyExitCurve?: number[] | string;
    entry_curve_json?: number[] | string;
    exit_curve_json?: number[] | string;
    weekly_entry_curve_json?: number[] | string;
    weekly_exit_curve_json?: number[] | string;
}

export interface DebugLogFilterParams {
    page?: number;
    size?: number;
    keyword?: string;
    userId?: string;
    roomName?: string;
    startTime?: string;
    endTime?: string;
    [key: string]: string | number | boolean | undefined;
}

export interface FilteredStats {
    totalCount?: number;
    insideCount?: number;
    outsideCount?: number;
    [key: string]: string | number | boolean | undefined;
}
