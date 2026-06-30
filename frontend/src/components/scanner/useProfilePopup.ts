import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ENTER_REFRESH_MS } from "@/components/scanner/accessMotionConfig";
import { fetchPredictionDashboard } from "@/api/domains/profile.api";
import type { RoomOverviewItem } from "@/api/types/profile"; // 👈 去它真正的老家拿！
import { useRoomOverviewQuery } from "@/api/hooks/useProfile";
import { useUpdateUserStateMutation, useUserStatusQuery } from "@/api/hooks/useScanner";
import type { RoomPrediction } from "@/components/scanner/AIPredictionCard";
import type { RoomInfo } from "@/api/types/scanner";
import type { ScanDelayOptionSummary } from "@/api/types/scanner";
import {
    pickRandomAccessMotionVariant,
    type AccessMotionVariant,
} from "@/components/scanner/accessMotionVariants";
import type { PopupActions, PopupProps, PopupState } from "@/components/scanner/components/types";
import { sortScanRoomsPudongFirst } from "@/components/scanner/roomCampusSort";
import { hasActiveAutoSignoutCountdown } from "@/utils/formatCountdown";

const POPUP_RUNTIME_STAMP = "popup-runtime-2026-04-16-r3";

const normalizeRoomInfoArray = (raw: unknown): RoomInfo[] => {
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is RoomInfo => Boolean(item && typeof item === "object"));
};

const parseCurveArray = (value: number[] | string | undefined, defaultLen: number): number[] => {
    const out = new Array(defaultLen).fill(0);
    if (!value) return out;
    let arr: unknown[] = [];
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            if (Array.isArray(parsed)) arr = parsed;
        } catch {
            return out;
        }
    } else if (Array.isArray(value)) {
        arr = value;
    }
    if (arr.length < defaultLen) return out;
    for (let i = 0; i < defaultLen; i++) {
        const n = Number(arr[i]);
        out[i] = Number.isFinite(n) ? n : 0;
    }
    return out;
};

const parseTrajectoryMap = (value: unknown): { [key: string]: number } => {
    if (!value) return {};
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as { [key: string]: number };
            }
            return {};
        } catch {
            return {};
        }
    }
    if (typeof value === "object" && !Array.isArray(value)) {
        return value as { [key: string]: number };
    }
    return {};
};

const getRoomDisplayName = (room: RoomInfo): string => {
    const legacyName = (room as RoomInfo & { officialRoomName?: string }).officialRoomName;
    return room.displayName || legacyName || room.name || "";
};

/** 与 room_config.capacity_bind_room_id 一致：多后室共限载时多个流水 room_id */
const splitCapacityBindRoomIds = (raw: unknown): string[] => {
    if (raw == null || raw === "") return [];
    return String(raw)
        .replace(/，/g, ",")
        .split(/[,;；\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
};

const getExpGainFromResult = (
    executeData: { expAdded?: number; message?: string } | undefined
): number => {
    const direct = Number(executeData?.expAdded ?? 0);
    if (Number.isFinite(direct)) return Math.max(0, Math.round(direct));
    return 0;
};

export const useProfilePopup = (props: PopupProps): { state: PopupState; actions: PopupActions } => {
    const { result, onExecute, isWorking, isRefreshing, executeData, executeErrorMessage, onRefresh, onExecuteReset, autoActionRoomId = "" } = props;
    const user = result?.userInfo;
    const currentState = result?.currentState;
    const isStateUnknown = currentState === "UNKNOWN";
    const lastExecutedActionRef = useRef<"ENTER" | "EXIT" | null>(null);
    const queryClient = useQueryClient();
    const targetRooms = useMemo(() => {
        const merged = [
            ...normalizeRoomInfoArray(result?.allowedRooms),
            ...normalizeRoomInfoArray(result?.pendingRooms),
        ];
        const seen = new Set<string>();
        const deduped = merged.filter((r) => {
            const id = r.officialRoomId || r.id || r.name;
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
        return sortScanRoomsPudongFirst(deduped);
    }, [result?.allowedRooms, result?.pendingRooms]);
    const action: "ENTER" | "EXIT" = currentState === "INSIDE" ? "EXIT" : "ENTER";
    const scanPopupExemptRoomIdSet = useMemo(() => {
        const ids = result?.scanPopupExemptRoomIds;
        if (!Array.isArray(ids) || ids.length === 0) return null;
        return new Set(ids.map((id) => String(id).trim()).filter(Boolean));
    }, [result?.scanPopupExemptRoomIds]);
    const isRoomScanEntryTimeExempt = useCallback(
        (room: RoomInfo) => {
            if (room.scanEntryTimeExempt) return true;
            const roomId = String(room.officialRoomId || room.id || "").trim();
            return Boolean(roomId && scanPopupExemptRoomIdSet?.has(roomId));
        },
        [scanPopupExemptRoomIdSet]
    );
    /** 与 analyze 返回对齐：仅限制「进入」；非开放时段按房间锁按钮，免冻结授权房间见 scanEntryTimeExempt / scanPopupExemptRoomIds */
    const isEntryTimeBlockedForRoom = (room: RoomInfo) =>
        Boolean(
            result?.scanPopupEntryWindowEnabled &&
                result?.scanPopupEntryAllowedNow === false &&
                !isRoomScanEntryTimeExempt(room)
        );
    const violationEnterLocked = Boolean(result?.studentViolationNotice?.enterLocked);
    const unboundEnterLocked = Boolean(result?.unboundCardNotice?.enterLocked);
    const enterLocked = violationEnterLocked || unboundEnterLocked;

    const [showRiskModal, setShowRiskModal] = useState(false);
    const [isAvatarLoaded, setAvatarLoaded] = useState(true);
    const [entryMode, setEntryMode] = useState<"OWN" | "BORROWED">(
        () => (localStorage.getItem("TWIN_ENTRY_MODE") as "OWN" | "BORROWED") || "BORROWED"
    );
    const [predictionList, setPredictionList] = useState<RoomPrediction[]>([]);
    const [isPredLoading, setIsPredLoading] = useState(false);
    const [toastData, setToastData] = useState({ play: false, exp: 0, nonce: 0 });
    const [finishedRooms, setFinishedRooms] = useState<string[]>([]);
    const [actedRoomId, setActedRoomId] = useState<string | null>(null);
    const [inlineMessage, setInlineMessage] = useState("");
    const [exitCelebrateRoomId, setExitCelebrateRoomId] = useState<string | null>(null);
    const [enterCelebrateRoomId, setEnterCelebrateRoomId] = useState<string | null>(null);
    const [enterMotionAtCorner, setEnterMotionAtCorner] = useState(false);
    const [enterCornerReady, setEnterCornerReady] = useState(false);
    const [enterNoticeReady, setEnterNoticeReady] = useState(false);
    /** 点击进入 → celebrateId 写入前：抢先卸载中央按钮，避免与动效叠影 */
    const [enterMotionPending, setEnterMotionPending] = useState(false);
    const [awaitingOutsideAfterExit, setAwaitingOutsideAfterExit] = useState(false);
    const [accessMotionVariant, setAccessMotionVariant] = useState<AccessMotionVariant | null>(null);
    const [keepCardStates, setKeepCardStates] = useState<boolean[]>(new Array(targetRooms.length || 10).fill(false));
    const manualLockRef = useRef(false);
    /** 离开确认弹窗状态 */
    const [confirmingExitRoom, setConfirmingExitRoom] = useState<RoomInfo | null>(null);
    const [confirmingExitIndex, setConfirmingExitIndex] = useState(-1);
    const hasLoggedStampRef = useRef(false);
    const toasterResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const entryModeAtExecuteRef = useRef<"OWN" | "BORROWED" | null>(null);
    /** 每次进/出成功只处理一次，避免 onRefresh 改 currentState 后重复 invalidate roomOverview */
    const executeSuccessHandledKeyRef = useRef<string | null>(null);
    /** 已在场内打开弹窗时只初始化一次右下角动效 */
    const insideCornerInitKeyRef = useRef<string | null>(null);
    const prevPopupUserIdRef = useRef<string | undefined>(undefined);
    /** 右下角循环动效 epoch，用于离开结束后对齐 loop 再切回进入按钮 */
    const accessMotionLoopEpochRef = useRef(performance.now());
    const pendingExitRefreshRef = useRef(false);
    /** 离开成功后 analyze 尚未切 OUTSIDE 前，禁止场内直出 effect 再次挂载右下角动效 */
    const suppressInsideCornerInitRef = useRef(false);

    const dismissEnterCelebrate = useCallback(() => {
        setEnterCelebrateRoomId(null);
        setEnterMotionAtCorner(false);
        setEnterCornerReady(false);
        setEnterNoticeReady(false);
        setEnterMotionPending(false);
        setAccessMotionVariant(null);
        insideCornerInitKeyRef.current = null;
    }, []);
    const markEnterCornerReady = useCallback(() => {
        setEnterCornerReady(true);
        accessMotionLoopEpochRef.current = performance.now();
    }, []);
    const markEnterNoticeReady = useCallback(() => {
        // 场内二次扫码（startAtCorner）：仅在有延时签退计时器时弹出居中通告
        if (enterMotionAtCorner && !hasActiveAutoSignoutCountdown(result)) {
            return;
        }
        setEnterNoticeReady(true);
    }, [enterMotionAtCorner, result?.autoSignoutScheduledAt, result?.autoSignoutSecondsRemaining]);
    const dismissExitCelebrate = useCallback(() => {
        setExitCelebrateRoomId(null);
        setEnterCelebrateRoomId(null);
        setEnterMotionAtCorner(false);
        setEnterCornerReady(false);
        setEnterNoticeReady(false);
        setEnterMotionPending(false);
        setAccessMotionVariant(null);
        insideCornerInitKeyRef.current = null;
        setAwaitingOutsideAfterExit(true);
        if (pendingExitRefreshRef.current) {
            pendingExitRefreshRef.current = false;
            onExecuteReset?.();
            onRefresh?.();
            queryClient.invalidateQueries({ queryKey: ["roomOverview"] }).catch(() => undefined);
            entryModeAtExecuteRef.current = null;
        }
    }, [onExecuteReset, onRefresh, queryClient]);

    useEffect(() => {
        if (hasLoggedStampRef.current) return;
        hasLoggedStampRef.current = true;
        console.info("[RuntimeStamp] useProfilePopup", POPUP_RUNTIME_STAMP);
    }, []);

    useEffect(() => () => {
        if (toasterResetTimerRef.current) clearTimeout(toasterResetTimerRef.current);
    }, []);

    const { data: roomOverview = [], isFetching: roomOverviewFetching } = useRoomOverviewQuery();
    const { data: userStatus = { state: 0, userDisciplinaryRecords: [], allowedRooms: [] } } = useUserStatusQuery(user?.userId);
    const updateUserStateMutation = useUpdateUserStateMutation();
    const liveUserState = Number(userStatus?.state ?? 0);
    const globalUserState =
        liveUserState === 2 || liveUserState === 3
            ? liveUserState
            : Number(result?.globalUserState ?? 2);
    const disciplinaryRecords = Array.isArray(userStatus?.userDisciplinaryRecords) && userStatus.userDisciplinaryRecords.length > 0
        ? userStatus.userDisciplinaryRecords
        : (result?.disciplinaryRecords || []);
    const isExecuteSuccess = executeData?.success === true;
    const isSameActionSuccess = Boolean(isExecuteSuccess && lastExecutedActionRef.current === action);
    const isHardwareError = Boolean(executeData && executeData.success === false);
    /** 扫描/权限目标房间在流水里的 room_id，与房卡调度 room_config.capacity_bind_room_id 精确对齐（负载与满员均不再做名称模糊匹配） */
    const targetCapacityBindIds = useMemo(() => {
        const ids = new Set<string>();
        for (const r of targetRooms) {
            const raw = r.officialRoomId || r.id;
            if (raw == null || raw === "") continue;
            const s = String(raw).trim();
            if (s) ids.add(s);
        }
        return ids;
    }, [targetRooms]);

    const myCapacityStats = useMemo(() => {
        if (!Array.isArray(roomOverview)) return [];
        if (targetCapacityBindIds.size === 0) return [];

        return roomOverview
            .filter((room: RoomOverviewItem) => {
                const bindIds = splitCapacityBindRoomIds(room.capacityBindRoomId);
                return bindIds.some((id) => targetCapacityBindIds.has(id));
            })
            .map((room: RoomOverviewItem) => ({
                name: room.roomName || "未知空间",
                count: (room.campusUserCount || 0) + (room.borrowedCardCount || 0) + (room.followingCount || 0),
                total: room.totalCapacity || 0,
                remaining: room.remainingCards || 0,
                capacityBindRoomIds: splitCapacityBindRoomIds(room.capacityBindRoomId),
            }));
    }, [roomOverview, targetCapacityBindIds]);

    useEffect(() => setShowRiskModal(globalUserState === 3), [globalUserState]);

    useEffect(() => {
        setActedRoomId(null);
        setFinishedRooms([]);
        setToastData((prev) => ({ ...prev, play: false, exp: 0 }));
        entryModeAtExecuteRef.current = null;
        manualLockRef.current = false;
    }, [user?.userId, currentState]);

    useEffect(() => {
        if (currentState === "OUTSIDE") {
            suppressInsideCornerInitRef.current = false;
            setAwaitingOutsideAfterExit(false);
        }
    }, [currentState]);

    /** 已在场内再次扫码：无按钮，直接渲染右下角常驻动效 */
    useEffect(() => {
        if (currentState !== "INSIDE") {
            insideCornerInitKeyRef.current = null;
            return;
        }
        if (suppressInsideCornerInitRef.current || pendingExitRefreshRef.current) return;
        if (enterCelebrateRoomId || exitCelebrateRoomId) return;
        const primary = targetRooms[0];
        if (!primary) return;
        const roomId = primary.officialRoomId || primary.id;
        if (!roomId) return;
        const initKey = `${user?.userId ?? ""}|${roomId}`;
        if (insideCornerInitKeyRef.current === initKey) return;
        insideCornerInitKeyRef.current = initKey;
        accessMotionLoopEpochRef.current = performance.now();
        setAccessMotionVariant(pickRandomAccessMotionVariant());
        setEnterMotionAtCorner(true);
        setEnterCelebrateRoomId(roomId);
    }, [currentState, enterCelebrateRoomId, exitCelebrateRoomId, targetRooms, user?.userId]);

    useEffect(() => {
        const uid = user?.userId;
        if (prevPopupUserIdRef.current !== undefined && prevPopupUserIdRef.current !== uid) {
            setEnterCelebrateRoomId(null);
            setEnterMotionAtCorner(false);
            setEnterCornerReady(false);
            setEnterNoticeReady(false);
            setEnterMotionPending(false);
            setAwaitingOutsideAfterExit(false);
            setAccessMotionVariant(null);
            insideCornerInitKeyRef.current = null;
        }
        prevPopupUserIdRef.current = uid;
    }, [user?.userId]);

    useEffect(() => {
        setKeepCardStates(new Array(Math.max(targetRooms.length, 1)).fill(false));
    }, [targetRooms.length]);

    useEffect(() => {
        setExitCelebrateRoomId(null);
    }, [user?.userId]);

    useEffect(() => {
        if (!executeData?.success) {
            lastExecutedActionRef.current = null;
            executeSuccessHandledKeyRef.current = null;
        }
    }, [executeData?.success]);

    useEffect(() => {
        if (result?.hasPhysicalCardMapping === true) {
            setEntryMode("OWN");
            localStorage.setItem("TWIN_ENTRY_MODE", "OWN");
            return;
        }
        if (result?.hasPhysicalCardMapping === false) {
            setEntryMode("BORROWED");
            localStorage.setItem("TWIN_ENTRY_MODE", "BORROWED");
        }
    }, [result?.hasPhysicalCardMapping, user?.userId]);

    useEffect(() => {
        if (isStateUnknown) {
            setInlineMessage(result?.message || "ARO 状态同步异常，请稍后重试");
            return;
        }
        if (!isHardwareError) return;
        setInlineMessage(executeData?.message || "物理执行受阻，请检查门禁网关状态。");
        setEnterMotionPending(false);
        onExecuteReset?.();
        setActedRoomId(null);
    }, [executeData?.message, isHardwareError, isStateUnknown, onExecuteReset, result?.message]);

    useEffect(() => {
        const message = (executeErrorMessage || "").trim();
        if (!message) return;
        setInlineMessage(message);
        setActedRoomId(null);
        setEnterMotionPending(false);
    }, [executeErrorMessage]);

    useEffect(() => {
        if (!isExecuteSuccess) return;
        const hint = (executeData?.dahuaHint || "").trim();
        const debug = (executeData?.accessRuleDebug || "").trim();
        if (!hint && !debug) return;
        const message = debug ? `${hint || "门禁规则调试信息"} | ${debug}` : hint;
        setInlineMessage(message);
        if (executeData?.unboundForDahuaRule) {
            setEntryMode("BORROWED");
            localStorage.setItem("TWIN_ENTRY_MODE", "BORROWED");
        }
    }, [isExecuteSuccess, executeData?.unboundForDahuaRule, executeData?.dahuaHint, executeData?.accessRuleDebug]);

    useEffect(() => {
        if (!isExecuteSuccess || !onExecuteReset) return;

        const successAction: "ENTER" | "EXIT" =
            lastExecutedActionRef.current ?? (currentState === "INSIDE" ? "EXIT" : "ENTER");
        const targetId = actedRoomId || autoActionRoomId;
        const executeKey = [
            successAction,
            executeData?.message ?? "",
            executeData?.expAdded ?? "",
            actedRoomId ?? autoActionRoomId ?? "",
        ].join("|");
        if (executeSuccessHandledKeyRef.current === executeKey) {
            if (successAction === "ENTER") {
                const celebrateId = targetId || null;
                if (celebrateId) {
                    setEnterCelebrateRoomId((prev) => prev ?? celebrateId);
                    setAccessMotionVariant((prev) => prev ?? pickRandomAccessMotionVariant());
                }
            }
            return;
        }
        executeSuccessHandledKeyRef.current = executeKey;

        // 保存后仅合并容量概览，禁止整表轮询；见 post-save-no-full-refresh.mdc
        queryClient.invalidateQueries({ queryKey: ["roomOverview"] }).catch(() => undefined);
        const gainedExp = getExpGainFromResult(executeData);
        const isFirstEntry = executeData?.expSource === "FIRST_ENTRY";
        if (gainedExp > 0) {
            if (toasterResetTimerRef.current) clearTimeout(toasterResetTimerRef.current);
            setToastData((prev) => ({
                play: isFirstEntry,
                exp: gainedExp,
                nonce: prev.nonce + 1,
            }));
            if (isFirstEntry) {
                toasterResetTimerRef.current = setTimeout(() => {
                    setToastData((prev) => ({ ...prev, play: false }));
                }, 2100);
            }
        }
        if (targetId) setFinishedRooms((prev) => Array.from(new Set([...prev, targetId])));

        const runRefresh = () => {
            onExecuteReset();
            onRefresh?.();
            queryClient.invalidateQueries({ queryKey: ["roomOverview"] }).catch(() => undefined);
            entryModeAtExecuteRef.current = null;
        };

        if (successAction === "ENTER") {
            const celebrateId = targetId || null;
            if (celebrateId) {
                setEnterMotionAtCorner(false);
                setEnterCornerReady(false);
                setEnterNoticeReady(false);
                setEnterMotionPending(false);
                accessMotionLoopEpochRef.current = performance.now();
                setAccessMotionVariant(pickRandomAccessMotionVariant());
                setEnterCelebrateRoomId(celebrateId);
            }
            const timer = setTimeout(runRefresh, ENTER_REFRESH_MS);
            return () => clearTimeout(timer);
        }

        pendingExitRefreshRef.current = true;
        return undefined;
    }, [
        actedRoomId,
        autoActionRoomId,
        currentState,
        executeData,
        isExecuteSuccess,
        onExecuteReset,
        onRefresh,
        queryClient,
    ]);

    useEffect(() => {
        if (!isExecuteSuccess) return;
        const successAction: "ENTER" | "EXIT" =
            lastExecutedActionRef.current ?? (currentState === "INSIDE" ? "EXIT" : "ENTER");
        if (successAction !== "EXIT") return;
        suppressInsideCornerInitRef.current = true;
        setEnterCelebrateRoomId(null);
        setEnterMotionAtCorner(false);
        setEnterCornerReady(false);
        setEnterNoticeReady(false);
        setEnterMotionPending(false);
        insideCornerInitKeyRef.current = null;
        const targetId = actedRoomId || autoActionRoomId;
        if (targetId) {
            accessMotionLoopEpochRef.current = performance.now();
            setAccessMotionVariant((prev) => prev ?? pickRandomAccessMotionVariant());
            setExitCelebrateRoomId(targetId);
        }
    }, [actedRoomId, autoActionRoomId, currentState, isExecuteSuccess]);

    useEffect(() => {
        if (!user?.userId || targetRooms.length === 0) {
            setPredictionList([]);
            return;
        }
        const load = async () => {
            setIsPredLoading(true);
            const results: RoomPrediction[] = [];
            for (const room of targetRooms) {
                const roomId = room.officialRoomId || room.id;
                const roomName = room.displayName || room.name || "未知区域";
                try {
                    const res = await fetchPredictionDashboard(user.userId, roomId);
                    const medianDuration = Number(res.medianDurationMins ?? 0);
                    const hasMedian = Number.isFinite(medianDuration) && medianDuration > 0;
                    const startHour = parseInt((res.peakEntryTime || "8").split(":")[0] || "8", 10);
                    const totalMins = startHour * 60 + (hasMedian ? medianDuration : 0);
                    const entryCurve = parseCurveArray(res.entryCurve || res.entry_curve_json, 24);
                    const exitCurve = parseCurveArray(res.exitCurve || res.exit_curve_json, 24);
                    const weeklyEntryCurve = parseCurveArray(res.weeklyEntryCurve || res.weekly_entry_curve_json, 7);
                    const weeklyExitCurve = parseCurveArray(res.weeklyExitCurve || res.weekly_exit_curve_json, 7);
                    const hasCurve = entryCurve.some((v) => v > 0) || exitCurve.some((v) => v > 0) || weeklyEntryCurve.some((v) => v > 0) || weeklyExitCurve.some((v) => v > 0);
                    if (!hasMedian && !hasCurve) throw new Error("No payload");
                    results.push({
                        roomId,
                        roomName,
                        focusTime: hasMedian ? `${(medianDuration / 60).toFixed(1)}h` : "--",
                        entryTime: res.peakEntryTime || "08:00-09:00",
                        exitTime: hasMedian
                            ? `~${String(Math.floor(totalMins / 60) % 24).padStart(2, "0")}:${String(totalMins % 60).padStart(2, "0")}`
                            : "--:--",
                        isHighRisk: (res.overtimeProb ?? 0) > 0.6,
                        nextTrajectory: parseTrajectoryMap(res.nextRoomPrediction),
                        entryCurve,
                        exitCurve,
                        weeklyEntryCurve,
                        weeklyExitCurve,
                    });
                } catch {
                    results.push({
                        roomId,
                        roomName,
                        focusTime: "--",
                        entryTime: "积累中",
                        exitTime: "--:--",
                        isHighRisk: false,
                        isPlaceholder: true,
                        nextTrajectory: {},
                        entryCurve: new Array(24).fill(0),
                        exitCurve: new Array(24).fill(0),
                        weeklyEntryCurve: new Array(7).fill(0),
                        weeklyExitCurve: new Array(7).fill(0),
                    });
                }
            }
            setPredictionList(results);
            setIsPredLoading(false);
        };
        void load();
    }, [targetRooms, user?.userId]);

    const handleModeChange = (mode: "OWN" | "BORROWED") => {
        setEntryMode(mode);
        localStorage.setItem("TWIN_ENTRY_MODE", mode);
    };

    const handleRoomClick = (room: RoomInfo, index: number) => {
        if (!user || isWorking || actedRoomId || isRefreshing) return;
        if (isExecuteSuccess && lastExecutedActionRef.current === action) return;
        if (action === "ENTER" && isEnterLocked(room)) return;
        if (action === "EXIT" && isExitLocked(room)) return;
        if (action === "ENTER" && globalUserState === 3) {
            setShowRiskModal(true);
            return;
        }
        const targetRoomId = room.officialRoomId || room.id;
        lastExecutedActionRef.current = action;
        entryModeAtExecuteRef.current = entryMode;
        manualLockRef.current = true;
        setActedRoomId(targetRoomId);
        if (action === "ENTER") {
            setEnterMotionPending(true);
        }
        onExecute({
            userId: user.userId || "unknown",
            roomId: targetRoomId,
            action,
            isSharedCard: false,
            isKeepCard: Boolean(keepCardStates[index]),
            isBorrowedCard: entryMode === "BORROWED",
        });
    };

    const setKeepCardState = (index: number, checked: boolean) =>
        setKeepCardStates((prev) => prev.map((item, i) => (i === index ? checked : item)));

    const executeToggleState = async (newValid: boolean) => {
        setShowRiskModal(false);
        try {
            await updateUserStateMutation.mutateAsync({ userId: user?.userId || "", valid: newValid });
            setInlineMessage(newValid ? "已解除封禁，状态刷新中..." : "已禁用，状态刷新中...");
        } catch (error) {
            const message = error instanceof Error ? error.message : "状态切换失败";
            setInlineMessage(message);
        } finally {
            onRefresh?.();
        }
    };

    const isRoomFull = (room: RoomInfo) => {
        const scanBindId = String(room.officialRoomId || room.id || "").trim();
        if (!scanBindId) return false;
        const byId = myCapacityStats.find((s) => s.capacityBindRoomIds.includes(scanBindId));
        if (!byId) return false;
        return Number(byId.total || 0) > 0 && Number(byId.count || 0) >= Number(byId.total || 0);
    };

    /** 非开放时段等仅限制进入；离开仅在校验异常时禁用 */
    const isEnterLocked = (room: RoomInfo) =>
        Boolean(
            isStateUnknown ||
                room.enterBlocked ||
                room.isDisabled ||
                globalUserState === 3 ||
                isRoomFull(room) ||
                isEntryTimeBlockedForRoom(room) ||
                enterLocked
        );
    const isExitLocked = (room: RoomInfo) => Boolean(isStateUnknown);
    const isRoomLocked = (room: RoomInfo) => (action === "ENTER" ? isEnterLocked(room) : isExitLocked(room));
    const getButtonText = (room: RoomInfo, roomId: string): string => {
        const isActed = actedRoomId === roomId || autoActionRoomId === roomId;
        const isFinished = finishedRooms.includes(roomId);
        if (isActed || isFinished) {
            if (isWorking && !isFinished) return "处理中...";
            if (isSameActionSuccess || isFinished) return "已完成";
        }
        if (isStateUnknown) return "状态同步异常，请重试";
        if (action === "ENTER" && globalUserState === 3) return `[已封禁] 拒绝进入 ${room.displayName}`;
        if (action === "ENTER" && isRoomFull(room)) return `[满员] 无法进入 ${room.displayName}`;
        if (action === "ENTER" && isEntryTimeBlockedForRoom(room)) return `[非开放时段] 无法进入 ${room.displayName}`;
        if (action === "ENTER" && unboundEnterLocked) return `[未绑卡] 禁止进入 ${room.displayName}`;
        if (action === "ENTER" && violationEnterLocked) return `[违规处理] 禁止进入 ${room.displayName}`;
        if (action === "ENTER" && room.enterBlocked) return `[不在此校区] ${room.displayName}`;
        if (action === "ENTER" && room.isDisabled) return `[禁入] ${room.displayName}`;
        return action === "ENTER" ? `进入 ${room.displayName}` : `离开 ${room.displayName}`;
    };

    const getDelayOptionsForRoom = useCallback(
        (roomId: string): ScanDelayOptionSummary[] => {
            if (!result?.scanDelayEnabled) return [];
            const map = result.scanDelayOptionsByRoom;
            if (!map) return [];
            if (map[roomId]?.length) return map[roomId];
            for (const items of Object.values(map)) {
                if (items.some((it) => it.roomId === roomId)) return items;
            }
            return [];
        },
        [result?.scanDelayEnabled, result?.scanDelayOptionsByRoom]
    );

    const handleDelayGrantSuccess = useCallback(() => {
        onRefresh?.();
    }, [onRefresh]);

    // ─── 离开确认状态机 ───
    /** 打开离开确认弹窗（做守卫检查但不执行） */
    const requestExit = useCallback((room: RoomInfo, index: number) => {
        if (!user || isWorking || actedRoomId || isRefreshing) return;
        if (isExecuteSuccess && lastExecutedActionRef.current === action) return;
        if (action === "EXIT" && isExitLocked(room)) return;
        setConfirmingExitRoom(room);
        setConfirmingExitIndex(index);
    }, [user, isWorking, actedRoomId, isRefreshing, isExecuteSuccess, action, isExitLocked]);

    /** 确认离开：清除确认态并执行实际的 handleRoomClick */
    const confirmExit = useCallback(() => {
        const room = confirmingExitRoom;
        const index = confirmingExitIndex;
        setConfirmingExitRoom(null);
        setConfirmingExitIndex(-1);
        if (room && index >= 0) {
            handleRoomClick(room, index);
        }
    }, [confirmingExitRoom, confirmingExitIndex, handleRoomClick]);

    /** 取消离开确认 */
    const cancelExit = useCallback(() => {
        setConfirmingExitRoom(null);
        setConfirmingExitIndex(-1);
    }, []);

    /**
     * 进入闭环（enterCelebrateRoomId 存续）期间禁止在模块中央挂载 ActionButtons：
     * 落点后再挂「离开」会与用户刚点的「进入」同位置重叠，形成闪回幻觉。
     * 场内离开改点右下角动效（showCornerLeaveHit）。
     */
    const renderActionButtons =
        !awaitingOutsideAfterExit &&
        !exitCelebrateRoomId &&
        !enterMotionAtCorner &&
        !enterCelebrateRoomId &&
        !enterMotionPending;

    return {
        state: {
            user: user || { userId: "", name: "", head: "", group: "" },
            targetRooms,
            action,
            globalUserState,
            disciplinaryRecords,
            showRiskModal,
            isSuccess: isSameActionSuccess,
            isAvatarLoaded,
            isPredLoading,
            entryMode,
            predictionList,
            myCapacityStats,
            roomOverviewFetching,
            roomOverviewSourceCount: roomOverview.length,
            toastData,
            finishedRooms,
            actedRoomId,
            inlineMessage,
            exitCelebrateRoomId,
            enterCelebrateRoomId,
            enterMotionAtCorner,
            enterCornerReady,
            enterNoticeReady,
            renderActionButtons,
            accessMotionVariant,
            autoSignoutState: result?.autoSignoutState ?? null,
            autoSignoutSecondsRemaining: result?.autoSignoutSecondsRemaining ?? null,
            autoSignoutScheduledAt: result?.autoSignoutScheduledAt ?? null,
            scanDelayEnabled: Boolean(result?.scanDelayEnabled),
            scanDelayButtonLabel: result?.scanDelayButtonLabel?.trim() || "延迟",
            scanDelayOptionsByRoom: result?.scanDelayOptionsByRoom ?? {},
            confirmingExitRoom,
            confirmingExitIndex,
        },
        actions: {
            setShowRiskModal,
            setAvatarLoaded,
            handleModeChange,
            executeToggleState,
            handleRoomClick,
            setKeepCardState,
            clearInlineMessage: () => setInlineMessage(""),
            getKeepCardState: (index) => Boolean(keepCardStates[index]),
            isEnterLocked,
            isExitLocked,
            isRoomLocked,
            getButtonText,
            dismissEnterCelebrate,
            dismissExitCelebrate,
            markEnterCornerReady,
            markEnterNoticeReady,
            getDelayOptionsForRoom,
            handleDelayGrantSuccess,
            requestExit,
            confirmExit,
            cancelExit,
        },
    };
};
