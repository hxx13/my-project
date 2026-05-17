import { http } from "@/api/core/http";
import { unwrapData, unwrapList, unwrapObject } from "@/api/types/common";
import type { ApiResponse } from "@/api/types/common";
import type {
    AnalyzeResponse,
    ExecutePayload,
    RoomCardStatus,
    RoomInfo,
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
    deferredDahuaSeconds?: number;
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
        deferredDahuaSeconds: typeof data.deferredDahuaSeconds === "number" ? data.deferredDahuaSeconds : undefined,
    };
};

const assertApiSuccess = (result: ExecuteResult, fallbackMessage: string) => {
    const failedByCode = typeof result.code === "number" && result.code !== 200;
    const failedBySuccess = result.success === false;
    if (failedByCode || failedBySuccess) {
        throw new Error(result.msg || result.message || fallbackMessage);
    }
};

const normalizeRoomInfo = (raw: unknown): RoomInfo => {
    const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const asBool = (v: unknown): boolean | undefined => {
        if (typeof v === "boolean") return v;
        if (v === 1 || v === "1" || v === "true") return true;
        if (v === 0 || v === "0" || v === "false") return false;
        return undefined;
    };
    const officialRoomId =
        typeof r.officialRoomId === "string"
            ? r.officialRoomId
            : typeof r.id === "string"
              ? r.id
              : r.id != null
                ? String(r.id)
                : "";
    const displayName =
        typeof r.displayName === "string"
            ? r.displayName
            : typeof r.name === "string"
              ? r.name
              : "";
    return {
        id: officialRoomId || displayName,
        name: displayName,
        officialRoomId: officialRoomId || undefined,
        displayName: displayName || undefined,
        areaName: typeof r.areaName === "string" ? r.areaName : undefined,
        floorName: typeof r.floorName === "string" ? r.floorName : undefined,
        regionName: typeof r.regionName === "string" ? r.regionName : undefined,
        campusTag:
            typeof r.campusTag === "string"
                ? r.campusTag
                : typeof r.campus_tag === "string"
                  ? r.campus_tag
                  : undefined,
        isDisabled: asBool(r.isDisabled),
        disableReason: typeof r.disableReason === "string" ? r.disableReason : undefined,
        enterBlocked: asBool(r.enterBlocked),
        enterBlockReason: typeof r.enterBlockReason === "string" ? r.enterBlockReason : undefined,
    };
};

const normalizeRoomList = (raw: unknown): RoomInfo[] => {
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeRoomInfo);
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
    const parseViolationNotice = (raw: unknown): AnalyzeResponse["studentViolationNotice"] | undefined => {
        if (!raw || typeof raw !== "object") return undefined;
        const n = raw as Record<string, unknown>;
        const idNum = typeof n.id === "number" ? n.id : Number(n.id);
        if (!Number.isFinite(idNum)) return undefined;
        const urlsRaw = n.imageUrls ?? n.image_urls;
        const imageUrls = Array.isArray(urlsRaw)
            ? urlsRaw.filter((x): x is string => typeof x === "string")
            : [];
        const remRaw = n.remainingEnterAllowance ?? n.remaining_enter_allowance;
        let remainingEnterAllowance: number | null | undefined;
        if (remRaw === null) remainingEnterAllowance = null;
        else if (typeof remRaw === "number" && Number.isFinite(remRaw)) remainingEnterAllowance = remRaw;
        else remainingEnterAllowance = undefined;
        return {
            id: idNum as number,
            violationText: asString(n.violationText ?? n.violation_text),
            imageUrls,
            showNoticeEveryScan: asBooleanLike(n.showNoticeEveryScan ?? n.show_notice_every_scan) ?? true,
            enterLocked: asBooleanLike(n.enterLocked ?? n.enter_locked) ?? false,
            remainingEnterAllowance,
        };
    };
    const studentViolationNotice = parseViolationNotice(
        safe.studentViolationNotice ?? safe.student_violation_notice
    );
    const unboundCardNotice = parseViolationNotice(safe.unboundCardNotice ?? safe.unbound_card_notice);
    const annRaw = safe.scanPopupAnnouncements ?? safe.scan_popup_announcements;
    let scanPopupAnnouncements: AnalyzeResponse["scanPopupAnnouncements"];
    if (annRaw && typeof annRaw === "object") {
        const a = annRaw as Record<string, unknown>;
        const itemsRaw = a.items;
        const items = Array.isArray(itemsRaw)
            ? itemsRaw
                  .map((it) => {
                      if (!it || typeof it !== "object") return null;
                      const row = it as Record<string, unknown>;
                      const idNum = typeof row.id === "number" ? row.id : Number(row.id);
                      if (!Number.isFinite(idNum)) return null;
                      return {
                          id: idNum as number,
                          title: asString(row.title),
                          contentHtml: asString(row.contentHtml ?? row.content_html),
                      };
                  })
                  .filter((x): x is NonNullable<typeof x> => x !== null)
            : [];
        if (items.length > 0 || asBooleanLike(a.enabled)) {
            scanPopupAnnouncements = {
                enabled: asBooleanLike(a.enabled) ?? true,
                showNoticeEveryScan: asBooleanLike(a.showNoticeEveryScan ?? a.show_notice_every_scan) ?? true,
                total: typeof a.total === "number" ? a.total : items.length,
                items,
            };
        }
    }
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
        pendingRooms: normalizeRoomList(safe.pendingRooms),
        allowedRooms: normalizeRoomList(safe.allowedRooms),
        globalUserState: typeof safe.globalUserState === "number" ? safe.globalUserState : undefined,
        disciplinaryRecords: Array.isArray(safe.disciplinaryRecords)
            ? (safe.disciplinaryRecords as AnalyzeResponse["disciplinaryRecords"])
            : [],
        hasPhysicalCardMapping,
        scanPopupEntryWindowEnabled:
            asBooleanLike(safe.scanPopupEntryWindowEnabled) ??
            asBooleanLike(safe.scan_popup_entry_window_enabled) ??
            false,
        scanPopupEntryAllowedNow:
            asBooleanLike(safe.scanPopupEntryAllowedNow) ??
            asBooleanLike(safe.scan_popup_entry_allowed_now) ??
            true,
        studentViolationNotice,
        unboundCardNotice,
        scanPopupAnnouncements,
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

export interface ScanCardMappingStatus {
    bound: boolean;
    cardNo?: string;
    dahuaSeq?: string;
    dahuaPersonCode?: string;
    cardStatus?: string;
    freezeExemptFlag?: number;
    userName?: string;
    aroUserId?: string;
}

export const fetchScanCardMapping = async (userId: string): Promise<ScanCardMappingStatus> => {
    const res = await http.get<ApiResponse<ScanCardMappingStatus> | ScanCardMappingStatus>("/scan/card-mapping", {
        params: { userId },
    });
    const raw = unwrapData(res.data, { bound: false } as ScanCardMappingStatus);
    return {
        bound: raw.bound === true,
        cardNo: typeof raw.cardNo === "string" ? raw.cardNo : undefined,
        dahuaSeq: typeof raw.dahuaSeq === "string" ? raw.dahuaSeq : undefined,
        dahuaPersonCode: typeof raw.dahuaPersonCode === "string" ? raw.dahuaPersonCode : undefined,
        cardStatus: typeof raw.cardStatus === "string" ? raw.cardStatus : undefined,
        freezeExemptFlag: typeof raw.freezeExemptFlag === "number" ? raw.freezeExemptFlag : undefined,
        userName: typeof raw.userName === "string" ? raw.userName : undefined,
        aroUserId: typeof raw.aroUserId === "string" ? raw.aroUserId : undefined,
    };
};

export interface StudentDahuaBindResult {
    success?: boolean;
    failStep?: string;
    steps?: Array<{
        stepName?: string;
        success?: boolean;
        upstreamCode?: string;
        upstreamErrMsg?: string;
        message?: string;
    }>;
}

export const studentDahuaBind = async (payload: {
    userId: string;
    userName: string;
    cardNo: string;
}): Promise<StudentDahuaBindResult> => {
    const res = await http.post<ApiResponse<StudentDahuaBindResult> | StudentDahuaBindResult>(
        "/scan/student-dahua-bind",
        payload
    );
    return unwrapData(res.data, { success: false });
};
