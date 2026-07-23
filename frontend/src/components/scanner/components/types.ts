import type { RefObject } from "react";
import type { AnalyzeResponse, AnalyzeUserInfo, DisciplinaryRecord, ExecutePayload, RoomInfo, ScanDelayOptionSummary } from "@/api/types/scanner";
import type { ExecuteResult } from "@/api/domains/scanner.api";
import type { RoomPrediction } from "@/components/scanner/AIPredictionCard";
import type { AccessMotionVariant } from "@/components/scanner/accessMotionVariants";
import type { DelayButtonStatus } from "@/components/scanner/ScanDelayButtonMenu";

import type { BlinkPhase } from '@/components/face-verify/useFaceVerification';
import type { FaceChallengeAction } from '@/components/face-verify/faceChallenge';

export interface PersonalCenterFaceVerifyProps {
    active: boolean;
    open: boolean;
    blinkPhase?: BlinkPhase;
    serverVerifying?: boolean;
    challengeAction?: FaceChallengeAction;
    videoRef: RefObject<HTMLVideoElement | null>;
    onClose: () => void;
    onStreamReady?: () => void;
    onStreamError?: (message: string) => void;
}

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
    /** 交互拼图永久确认后合并 analyze 结果（禁止整表刷新，post-save-no-full-refresh.mdc） */
    onViolationInteractiveVerified?: (patch: {
        violationId: number;
        enterLocked: boolean;
        interactiveChallengeVerified: boolean;
        violationExpired?: boolean;
    }) => void;
    /** PIN 码替代人脸：弹窗内显示"人脸验证"按钮 */
    pinAlternativeEnabled?: boolean;
    /** 弹窗内点击"人脸验证" → 触发外部验证流程 */
    onFaceVerifyRequest?: () => void;
    /** 关闭 PIN 键盘时取消个人中心人脸验证（清除外部 override） */
    onFaceVerifyCancel?: () => void;
    /** 个人中心 PIN/人脸二选一：紧凑人脸窗（仅键盘展开时由弹窗内渲染） */
    personalCenterFace?: PersonalCenterFaceVerifyProps;
    /** 绑定 PIN/人脸成功后统一回调（与 handleKeypadSuccess 相同） */
    onBindStudentCenterSuccess?: (handler: (authData: import("@/api/domains/auth.api").AuthData) => void) => void;
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
    /** 进入成功后的卡片堆叠飞入动画（替代「您已进入」遮罩弹窗） */
    enterCelebrateRoomId: string | null;
    /** 本次进入/离开闭环随机选中的动效变体 */
    accessMotionVariant: AccessMotionVariant | null;
    /** 已在场内打开弹窗：进入 overlay 直接落点右下角，不播中心进入 */
    enterMotionAtCorner: boolean;
    /** 右下角动效已就绪，可点击触发离开 */
    enterCornerReady: boolean;
    /** 进入确认胶囊：中心停留结束、开始飞向右下角时即为 true */
    enterNoticeReady: boolean;
    /** 为 false 时 ActionButtons 完全不挂载（动效期间销毁，防止按钮闪现） */
    renderActionButtons: boolean;
    /** 自动签退计时器状态 */
    autoSignoutState: string | null;
    /** 距离自动签退剩余秒数 */
    autoSignoutSecondsRemaining: number | null;
    /** 计划签退时刻（yyyy-MM-dd HH:mm:ss），用于客户端实时推算剩余秒数 */
    autoSignoutScheduledAt: string | null;
    scanDelayEnabled: boolean;
    scanDelayButtonLabel: string;
    scanDelayOptionsByRoom: Record<string, ScanDelayOptionSummary[]>;
    /** 离开确认弹窗：待确认的房间 */
    confirmingExitRoom: RoomInfo | null;
    /** 离开确认弹窗：待确认的房间索引 */
    confirmingExitIndex: number;
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
    isEnterLocked: (room: RoomInfo) => boolean;
    isExitLocked: (room: RoomInfo) => boolean;
    isRoomLocked: (room: RoomInfo) => boolean;
    getButtonText: (room: RoomInfo, roomId: string) => string;
    dismissEnterCelebrate: () => void;
    dismissExitCelebrate: () => void;
    markEnterCornerReady: () => void;
    markEnterNoticeReady: () => void;
    getDelayOptionsForRoom: (roomId: string) => ScanDelayOptionSummary[];
    getDelayStatusForRoom: (roomId: string) => DelayButtonStatus | undefined;
    getRejectedOptionIdsForRoom: (roomId: string) => number[];
    handleDelayGrantSuccess: (roomId: string, status: string, optionLabel?: string) => void;
    /** 打开离开确认弹窗（不执行离开） */
    requestExit: (room: RoomInfo, index: number) => void;
    /** 确认离开：执行待确认的房间操作 */
    confirmExit: () => void;
    /** 取消离开确认 */
    cancelExit: () => void;
}
