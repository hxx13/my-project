import { http } from "@/api/core/http";
import { unwrapData, unwrapList, unwrapObject } from "@/api/types/common";
import type { ApiResponse } from "@/api/types/common";
import type {
    AnalyzeResponse,
    ExecutePayload,
    RoomCardStatus,
    UserStatusResponse,
} from "@/api/types/scanner";

export interface ExecuteResult {
    code?: number;
    success?: boolean;
    msg?: string;
    message?: string;
    expAdded?: number;
    /** 门禁需下发大华权限但未绑卡/缺 dahuaSeq */
    unboundForDahuaRule?: boolean;
    dahuaHint?: string;
    accessRuleDebug?: string;
}

const toExecuteResult = (raw: unknown): ExecuteResult => {
    const safe = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const data = safe.data && typeof safe.data === "object" ? (safe.data as Record<string, unknown>) : {};
    const nestedSuccess = typeof data.success === "boolean" ? data.success : undefined;
    const nestedCode = typeof data.code === "number" ? data.code : undefined;
    return {
        code: typeof safe.code === "number" ? safe.code : nestedCode,
        success: nestedSuccess ?? (typeof safe.success === "boolean" ? safe.success : undefined),
        msg:
            typeof data.msg === "string"
                ? data.msg
                : (typeof safe.msg === "string" ? safe.msg : undefined),
        message:
            typeof data.message === "string"
                ? data.message
                : (typeof safe.message === "string" ? safe.message : undefined),
        expAdded: typeof data.expAdded === "number" ? data.expAdded : undefined,
        unboundForDahuaRule: data.unboundForDahuaRule === true,
        dahuaHint: typeof data.dahuaHint === "string" ? data.dahuaHint : undefined,
        accessRuleDebug: typeof data.accessRuleDebug === "string" ? data.accessRuleDebug : undefined,
    };
};

const assertApiSuccess = (result: ExecuteResult, fallbackMessage: string) => {
    const failedByCode = typeof result.code === "number" && result.code !== 200;
    const failedBySuccess = result.success === false;
    if (failedByCode || failedBySuccess) {
        throw new Error(result.msg || result.message || fallbackMessage);
    }
};

const normalizeAnalyzeResponse = (raw: unknown): AnalyzeResponse => {
    const safe = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const userInfoRaw = safe.userInfo && typeof safe.userInfo === "object"
        ? (safe.userInfo as Record<string, unknown>)
        : {};
    const asString = (value: unknown): string | undefined => {
        if (typeof value === "string") return value;
        if (typeof value === "number") return String(value);
        return undefined;
    };
    const projectGroupName = asString(userInfoRaw.project_group_name) ?? asString(userInfoRaw.projectGroupName);
    const departmentName = asString(userInfoRaw.department_name) ?? asString(userInfoRaw.departmentName);
    const mobilePhone = asString(userInfoRaw.mobile_phone) ?? asString(userInfoRaw.mobilePhone);
    const userTypeNames = asString(userInfoRaw.user_type_names) ?? asString(userInfoRaw.userTypeNames);
    const asBooleanLike = (value: unknown): boolean | undefined => {
        if (typeof value === "boolean") return value;
        if (typeof value === "number") {
            if (value === 1) return true;
            if (value === 0) return false;
            return undefined;
        }
        if (typeof value === "string") {
            const normalized = value.trim().toLowerCase();
            if (["1", "true", "yes", "y"].includes(normalized)) return true;
            if (["0", "false", "no", "n"].includes(normalized)) return false;
            return undefined;
        }
        return undefined;
    };
    const hasPhysicalCardMapping =
        asBooleanLike(safe.hasPhysicalCardMapping) ??
        asBooleanLike(safe.has_physical_card_mapping) ??
        asBooleanLike(safe.physicalCardMapping);
    const normalizedGroup = asString(userInfoRaw.group) ?? projectGroupName ?? "";
    const currentState =
        safe.currentState === "INSIDE"
            ? "INSIDE"
            : (safe.currentState === "UNKNOWN" ? "UNKNOWN" : "OUTSIDE");
    return {
        message: typeof safe.message === "string" ? safe.message : "",
        success: Boolean(safe.success),
        userInfo: {
            userId: typeof userInfoRaw.userId === "string" ? userInfoRaw.userId : "",
            name: asString(userInfoRaw.name) ?? "",
            head: asString(userInfoRaw.head) ?? "",
            group: normalizedGroup,
            gender: userInfoRaw.gender as AnalyzeResponse["userInfo"]["gender"],
            mobile_phone: mobilePhone,
            department_name: departmentName,
            project_group_name: projectGroupName,
            user_type_names: userTypeNames,
            rpg: userInfoRaw.rpg as AnalyzeResponse["userInfo"]["rpg"],
        },
        currentState,
        pendingRooms: Array.isArray(safe.pendingRooms) ? (safe.pendingRooms as AnalyzeResponse["pendingRooms"]) : [],
        allowedRooms: Array.isArray(safe.allowedRooms) ? (safe.allowedRooms as AnalyzeResponse["allowedRooms"]) : [],
        globalUserState: typeof safe.globalUserState === "number" ? safe.globalUserState : undefined,
        disciplinaryRecords: Array.isArray(safe.disciplinaryRecords)
            ? (safe.disciplinaryRecords as AnalyzeResponse["disciplinaryRecords"])
            : [],
        hasPhysicalCardMapping,
    };
};

export const analyzeScan = async (userId: string): Promise<AnalyzeResponse> => {
    const response = await http.get<ApiResponse<AnalyzeResponse> | AnalyzeResponse>("/scan/analyze", { params: { userId } });
    return normalizeAnalyzeResponse(unwrapData(response.data, {} as AnalyzeResponse));
};

export const executeAccess = async (payload: ExecutePayload): Promise<ExecuteResult> => {
    const response = await http.post<ApiResponse<ExecuteResult> | ExecuteResult>("/scan/execute", payload);
    const result = toExecuteResult(response.data);
    assertApiSuccess(result, "官方接口拒绝操作");
    return result;
};

export const fetchUserStatus = async (userId: string): Promise<UserStatusResponse> => {
    const response = await http.get<ApiResponse<UserStatusResponse> | UserStatusResponse>("/scan/user-status", {
        params: { userId },
    });
    const safeObject = unwrapObject(response.data, {} as Record<string, unknown>);
    const safeState = Number((safeObject as { state?: unknown }).state ?? 0);
    const safeRecords = (safeObject as { userDisciplinaryRecords?: unknown }).userDisciplinaryRecords;
    const safeAllowedRooms = (safeObject as { allowedRooms?: unknown }).allowedRooms;
    return {
        ...(safeObject as Record<string, unknown>),
        state: Number.isFinite(safeState) ? safeState : 0,
        userDisciplinaryRecords: Array.isArray(safeRecords) ? safeRecords : [],
        allowedRooms: Array.isArray(safeAllowedRooms) ? safeAllowedRooms : [],
    } as UserStatusResponse;
};

export const updateUserState = async (userId: string, valid: boolean): Promise<ExecuteResult> => {
    const response = await http.post<ApiResponse<ExecuteResult> | ExecuteResult>("/scan/user-status/update", {
        userId,
        valid,
        invalidReason: null,
    });
    const result = toExecuteResult(response.data);
    assertApiSuccess(result, "官方接口拒绝操作");
    return result;
};

export const fetchAllRoomCardStatus = async (): Promise<RoomCardStatus[]> => {
    const res = await http.get<ApiResponse<RoomCardStatus[]> | RoomCardStatus[]>("/scan/room/card-status");
    return unwrapList<RoomCardStatus>(res.data, []);
};
