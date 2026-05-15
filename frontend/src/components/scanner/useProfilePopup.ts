import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchPredictionDashboard } from "@/api/domains/profile.api";
import type { RoomOverviewItem } from "@/api/types/profile"; // 👈 去它真正的老家拿！
import { useRoomOverviewQuery } from "@/api/hooks/useProfile";
import { useUpdateUserStateMutation, useUserStatusQuery } from "@/api/hooks/useScanner";
import type { RoomPrediction } from "@/components/scanner/AIPredictionCard";
import type { RoomInfo } from "@/api/types/scanner";
import type { PopupActions, PopupProps, PopupState } from "@/components/scanner/components/types";

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
        return merged.filter((r) => {
            const id = r.officialRoomId || r.id || r.name;
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }, [result?.allowedRooms, result?.pendingRooms]);
    const action: "ENTER" | "EXIT" = currentState === "INSIDE" ? "EXIT" : "ENTER";

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
    const [keepCardStates, setKeepCardStates] = useState<boolean[]>(new Array(targetRooms.length || 10).fill(false));
    const manualLockRef = useRef(false);
    const hasLoggedStampRef = useRef(false);
    const toasterResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        manualLockRef.current = false;
    }, [user?.userId, currentState]);

    useEffect(() => {
        setKeepCardStates(new Array(Math.max(targetRooms.length, 1)).fill(false));
    }, [targetRooms.length]);

    useEffect(() => {
        setExitCelebrateRoomId(null);
    }, [user?.userId]);

    useEffect(() => {
        if (!executeData?.success) {
            lastExecutedActionRef.current = null;
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
        onExecuteReset?.();
        setActedRoomId(null);
    }, [executeData?.message, isHardwareError, isStateUnknown, onExecuteReset, result?.message]);

    useEffect(() => {
        const message = (executeErrorMessage || "").trim();
        if (!message) return;
        setInlineMessage(message);
        setActedRoomId(null);
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
        if (!isExecuteSuccess || !onRefresh || !onExecuteReset) return;
        // 进入/离开成功后立刻刷新房间容量，减少“满员禁用”滞后感
        queryClient.invalidateQueries({ queryKey: ["roomOverview"] }).catch(() => undefined);
        const gainedExp = getExpGainFromResult(executeData);
        if (gainedExp > 0) {
            if (toasterResetTimerRef.current) clearTimeout(toasterResetTimerRef.current);
            setToastData((prev) => ({ play: true, exp: gainedExp, nonce: prev.nonce + 1 }));
            toasterResetTimerRef.current = setTimeout(() => {
                setToastData((prev) => ({ ...prev, play: false }));
            }, 2100);
        }
        const targetId = actedRoomId || autoActionRoomId;
        if (targetId) setFinishedRooms((prev) => Array.from(new Set([...prev, targetId])));
        const timer = setTimeout(() => {
            onExecuteReset();
            onRefresh();
            queryClient.invalidateQueries({ queryKey: ["roomOverview"] }).catch(() => undefined);
        }, 1500);
        return () => clearTimeout(timer);
    }, [actedRoomId, autoActionRoomId, executeData, isExecuteSuccess, onExecuteReset, onRefresh, queryClient]);

    useEffect(() => {
        if (!isSameActionSuccess || action !== "EXIT") return;
        const targetId = actedRoomId || autoActionRoomId;
        if (targetId) setExitCelebrateRoomId(targetId);
    }, [action, actedRoomId, autoActionRoomId, isSameActionSuccess]);

    useEffect(() => {
        if (!exitCelebrateRoomId) return;
        const t = setTimeout(() => setExitCelebrateRoomId(null), 4200);
        return () => clearTimeout(t);
    }, [exitCelebrateRoomId]);

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
        if (isRoomLocked(room)) return;
        if (globalUserState === 3) {
            setShowRiskModal(true);
            return;
        }
        const targetRoomId = room.officialRoomId || room.id;
        lastExecutedActionRef.current = action;
        manualLockRef.current = true;
        setActedRoomId(targetRoomId);
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

    const isRoomLocked = (room: RoomInfo) =>
        Boolean(isStateUnknown || room.isDisabled || globalUserState === 3 || (action === "ENTER" && isRoomFull(room)));
    const getButtonText = (room: RoomInfo, roomId: string): string => {
        const isActed = actedRoomId === roomId || autoActionRoomId === roomId;
        const isFinished = finishedRooms.includes(roomId);
        if (isActed || isFinished) {
            if (isWorking && !isFinished) return "处理中...";
            if (isSameActionSuccess || isFinished) return "已完成";
        }
        if (isStateUnknown) return "状态同步异常，请重试";
        if (globalUserState === 3) return action === "EXIT" ? `[滞留封禁] 无法操作 ${room.displayName}` : `[已封禁] 拒绝进入 ${room.displayName}`;
        if (action === "ENTER" && isRoomFull(room)) return `[满员] 无法进入 ${room.displayName}`;
        if (room.isDisabled) return `[禁入] ${room.displayName}`;
        return action === "ENTER" ? `进入 ${room.displayName}` : `离开 ${room.displayName}`;
    };

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
            isRoomLocked,
            getButtonText,
        },
    };
};
