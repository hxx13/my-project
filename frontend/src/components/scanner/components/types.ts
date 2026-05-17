import type { AnalyzeResponse, AnalyzeUserInfo, DisciplinaryRecord, ExecutePayload, RoomInfo } from "@/api/types/scanner";
import type { ExecuteResult } from "@/api/domains/scanner.api";
import type { RoomPrediction } from "@/components/scanner/AIPredictionCard";

export interface PopupProps {
    result: AnalyzeResponse | null;
    onClose: () => void;
    onExecute: (payload: ExecutePayload) => void;
    isWorking: boolean;
    executeData?: ExecuteResult;
    executeErrorMessage?: string;
    isRefreshing?: boolean;
    onRefresh?: () => void;
    onExecuteReset?: () => void;
    autoActionRoomId?: string;
    /** 未绑卡时打开学生快捷绑卡页 */
    onOpenStudentBind?: () => void;
}

export interface CapacityStat {
    name: string;
    count: number;
    total: number;
    remaining: number;
    /** 本条概览对应的流水 room_id 列表（多后室共限载） */
    capacityBindRoomIds?: string[];
}

export interface PopupState {
    user: AnalyzeUserInfo;
    targetRooms: RoomInfo[];
    action: "ENTER" | "EXIT";
    globalUserState: number;
    disciplinaryRecords: DisciplinaryRecord[];
    showRiskModal: boolean;
    isSuccess: boolean;
    isAvatarLoaded: boolean;
    isPredLoading: boolean;
    entryMode: "OWN" | "BORROWED";
    predictionList: RoomPrediction[];
    myCapacityStats: CapacityStat[];
    /** roomOverview 正在请求且当前列表仍为空（尚无概览数据）时，用骨架代替「无匹配」提示，避免闪现 */
    roomOverviewFetching: boolean;
    /** wechat-overview 返回的房间条数（用于区分「未拉到数据」与「已拉取但无 id 匹配」） */
    roomOverviewSourceCount: number;
    toastData: { play: boolean; exp: number; nonce: number };
    finishedRooms: string[];
    actedRoomId: string | null;
    inlineMessage: string;
    /** 仅离开成功后的仓鼠减速动画，与全局 execute 成功解耦 */
    exitCelebrateRoomId: string | null;
    accessNotice: { message: string } | null;
    accessNoticeDurationMs: number;
}

export interface PopupActions {
    setShowRiskModal: (open: boolean) => void;
    setAvatarLoaded: (loaded: boolean) => void;
    /** 保留供异常提示（如未绑卡）强制切换；日常由扫码结果自动判定 */
    handleModeChange: (mode: "OWN" | "BORROWED") => void;
    executeToggleState: (newValid: boolean) => Promise<void>;
    handleRoomClick: (room: RoomInfo, index: number) => void;
    setKeepCardState: (index: number, checked: boolean) => void;
    clearInlineMessage: () => void;
    getKeepCardState: (index: number) => boolean;
    isRoomLocked: (room: RoomInfo) => boolean;
    getButtonText: (room: RoomInfo, roomId: string) => string;
    dismissAccessNotice: () => void;
}
