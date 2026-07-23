import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AnimatedRoomButton } from "@/components/scanner/AnimatedRoomButton";
import { ScanDelayButton, ScanDelayMenuPortal, type DelayButtonStatus } from "@/components/scanner/ScanDelayButtonMenu";
import { RoomEnterConfirmDialog } from "@/components/scanner/RoomEnterConfirmDialog";
import { DisabledEnterHintButton } from "@/components/scanner/DisabledEnterHintButton";
import type { RoomInfo, ScanDelayOptionSummary } from "@/api/types/scanner";
import { resolveRoomActionDensity } from "@/components/scanner/roomActionDensity";
import { formatCountdown, resolveAutoSignoutCountdownCopy } from "@/utils/formatCountdown";

export type { RoomActionDensity } from "@/components/scanner/roomActionDensity";

type DelayCarrierGroup = {
    key: string;
    buttonLabel: string;
    options: ScanDelayOptionSummary[];
};

function groupDelayOptionsByCarrier(
    options: ScanDelayOptionSummary[],
    fallbackLabel: string
): DelayCarrierGroup[] {
    const groups: DelayCarrierGroup[] = [];
    const index = new Map<string, DelayCarrierGroup>();
    for (const opt of options) {
        const key = opt.carrierId != null ? `c:${opt.carrierId}` : `l:${opt.buttonLabel || fallbackLabel}`;
        let group = index.get(key);
        if (!group) {
            group = {
                key,
                buttonLabel: opt.buttonLabel?.trim() || fallbackLabel || "延迟",
                options: [],
            };
            index.set(key, group);
            groups.push(group);
        }
        group.options.push(opt);
    }
    return groups;
}

interface ActionButtonsProps {
    action: "ENTER" | "EXIT";
    targetRooms: RoomInfo[];
    onRoomClick: (room: RoomInfo, index: number) => void;
    isSuccess: boolean;
    actedRoomId: string | null;
    finishedRooms: string[];
    autoActionRoomId: string;
    getButtonText: (room: RoomInfo, roomId: string) => string;
    isEnterLocked: (room: RoomInfo) => boolean;
    isExitLocked: (room: RoomInfo) => boolean;
    getKeepCardState: (index: number) => boolean;
    setKeepCardState: (index: number, checked: boolean) => void;
    /** 自动签退剩余秒数（来自 analyze）；null 则不显示 */
    autoSignoutSecondsRemaining?: number | null;
    /** PENDING_ACTIVATION / AUTO_EXIT_SCHEDULED */
    autoSignoutState?: string | null;
    /** 延迟免冻结总开关 */
    scanDelayEnabled?: boolean;
    /** 全局兜底延迟按钮文案（规则未单独配置时使用） */
    scanDelayButtonLabel?: string;
    getDelayOptions?: (roomId: string) => ScanDelayOptionSummary[];
    subjectUserId?: string;
    onDelaySuccess?: (roomId: string, status: string, optionLabel?: string) => void;
    getDelayStatusForRoom?: (roomId: string) => DelayButtonStatus | undefined;
    getRejectedOptionIdsForRoom?: (roomId: string) => number[];
    /** 当前刷卡人姓名，用于进入确认弹窗显示 */
    userName?: string;
    /** 打开离开确认弹窗（替代直接执行） */
    onRequestExit?: (room: RoomInfo, index: number) => void;
    /** 确认离开回调 */
    onConfirmExit?: () => void;
    /** 取消离开回调 */
    onCancelExit?: () => void;
    /** 当前待确认离开的房间 */
    confirmingExitRoom?: RoomInfo | null;
    /** 当前扫码人 userId，用于离开确认弹窗中的 QR 码 */
    studentUserId?: string;
    /** 「进入房间」按钮被禁用时，左侧 ? 帮助按钮的提示文案（来自后台配置） */
    enterDisabledHintText?: string;
}

export const ActionButtons = (props: ActionButtonsProps) => {
    const {
        action,
        targetRooms,
        onRoomClick,
        finishedRooms,
        autoSignoutSecondsRemaining,
        autoSignoutState,
        scanDelayEnabled,
        scanDelayButtonLabel = "延迟",
        getDelayOptions,
        subjectUserId,
        onDelaySuccess,
        getRejectedOptionIdsForRoom,
        userName,
        onRequestExit,
        onConfirmExit,
        onCancelExit,
        confirmingExitRoom,
        studentUserId,
        enterDisabledHintText,
    } = props;
    const safeRooms = Array.isArray(targetRooms) ? targetRooms : [];
    const density = resolveRoomActionDensity(safeRooms.length);
    const gapClass = density === "normal" ? "gap-4" : density === "compact" ? "gap-2.5" : "gap-1.5";
    const maxWClass = density === "dense" ? "max-w-[min(360px,100%)]" : "max-w-[360px]";
    const enterRowH = density === "normal" ? "h-[48px]" : density === "compact" ? "h-[42px]" : "h-[36px]";
    const exitRowMinH = density === "normal" ? "min-h-[7.5rem]" : density === "compact" ? "min-h-[6.5rem]" : "min-h-[5.5rem]";

    const [openDelayMenuKey, setOpenDelayMenuKey] = useState<string | null>(null);
    const delayAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [openDelayAnchorEl, setOpenDelayAnchorEl] = useState<HTMLDivElement | null>(null);

    // ──── 活跃延迟申请状态（从 hook 级 ref 读取，不受 onRefresh 影响） ────
    const getDelayStatus = props.getDelayStatusForRoom;

    // ──── 进入二次确认 ────
    const [confirmingRoomIndex, setConfirmingRoomIndex] = useState<number | null>(null);
    const [confirmingRoom, setConfirmingRoom] = useState<RoomInfo | null>(null);
    const [confirmDialogVisible, setConfirmDialogVisible] = useState(false);
    const confirmDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 确认态变更时：延迟弹出对话框，让按钮动画先播
    useEffect(() => {
        if (confirmDelayTimerRef.current) clearTimeout(confirmDelayTimerRef.current);
        if (confirmingRoomIndex !== null) {
            confirmDelayTimerRef.current = setTimeout(() => setConfirmDialogVisible(true), 420);
        } else {
            setConfirmDialogVisible(false);
            setConfirmingRoom(null);
        }
        return () => {
            if (confirmDelayTimerRef.current) clearTimeout(confirmDelayTimerRef.current);
        };
    }, [confirmingRoomIndex]);

    const handleEnterClick = (room: RoomInfo, idx: number) => {
        if (props.isEnterLocked(room)) return;
        setConfirmingRoomIndex(idx);
        setConfirmingRoom(room);
    };

    const handleConfirmEnter = () => {
        if (confirmingRoomIndex === null || !confirmingRoom) return;
        onRoomClick(confirmingRoom, confirmingRoomIndex);
        setConfirmingRoomIndex(null);
    };

    const handleCancelEnter = () => {
        setConfirmingRoomIndex(null);
    };
    // ──── 确认逻辑结束 ────

    const [countdown, setCountdown] = useState<number | null>(
        action === "EXIT" && autoSignoutSecondsRemaining != null && autoSignoutSecondsRemaining > 0
            ? autoSignoutSecondsRemaining
            : null
    );
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (action === "EXIT" && autoSignoutSecondsRemaining != null && autoSignoutSecondsRemaining > 0) {
            setCountdown(autoSignoutSecondsRemaining);
        } else {
            setCountdown(null);
        }
    }, [autoSignoutSecondsRemaining, action]);

    useEffect(() => {
        if (countdown == null || countdown <= 0) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }
        intervalRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev == null || prev <= 1) {
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [countdown]);

    const showCountdown = action === "EXIT" && countdown != null && countdown > 0;
    const countdownCopy = resolveAutoSignoutCountdownCopy(autoSignoutState);

    return (
        <div
            className={`flex flex-col w-full mx-auto min-h-0 max-h-full overflow-y-auto overflow-x-visible ${gapClass} ${maxWClass} pl-1 pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        >
            {showCountdown ? (
                <motion.div
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-[var(--app-radius-element)] bg-[var(--app-color-feedback-warning-soft)] border border-[var(--app-color-feedback-warning)]/25 text-[11px] font-bold text-[var(--app-color-feedback-warning)] shrink-0"
                >
                    <span>⏱</span>
                    <span>
                        {countdownCopy.badge} {formatCountdown(countdown!)}
                    </span>
                </motion.div>
            ) : null}

            {safeRooms.map((room, idx) => {
                const roomId = room.officialRoomId || room.id;
                const isFinished = finishedRooms.includes(roomId);
                if (action === "ENTER") {
                    const delayOptions = getDelayOptions?.(roomId) ?? [];
                    const delayGroups = groupDelayOptionsByCarrier(delayOptions, scanDelayButtonLabel || "延迟");
                    const showDelay =
                        Boolean(scanDelayEnabled) &&
                        delayGroups.length > 0 &&
                        !props.isEnterLocked(room) &&
                        Boolean(subjectUserId);
                    return (
                        <div
                            key={roomId}
                            className={`relative w-full shrink-0 ${enterRowH} group flex items-center justify-center gap-2`}
                        >
                            <div className="absolute top-1/2 -translate-y-1/2 right-full mr-2 w-[88px] opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
                                <label className="flex items-center gap-1.5 text-[10px] text-[var(--app-color-text-tertiary)] whitespace-nowrap">
                                    <AdminSwitchScaled
                                        size="3"
                                        checked={props.getKeepCardState(idx)}
                                        onChange={(checked) => props.setKeepCardState(idx, checked)}
                                    />
                                    长期占有
                                </label>
                            </div>
                            {showDelay ? (
                                <div className={`flex h-full shrink-0 items-center gap-1.5 ${density === "dense" ? "max-w-[140px]" : "max-w-[170px]"} pr-1`}>
                                    {delayGroups.map((group) => {
                                        const menuKey = `${roomId}::${group.key}`;
                                        const ds = getDelayStatus?.(roomId);
                                        return (
                                            <div
                                                key={menuKey}
                                                ref={(el) => {
                                                    delayAnchorRefs.current[menuKey] = el;
                                                    if (openDelayMenuKey === menuKey) {
                                                        setOpenDelayAnchorEl(el);
                                                    }
                                                }}
                                                className="h-full min-w-0 flex-1"
                                            >
                                                <ScanDelayButton
                                                    label={group.buttonLabel}
                                                    active={openDelayMenuKey === menuKey}
                                                    delayStatus={ds as DelayButtonStatus | undefined}
                                                    onClick={() => {
                                                        setOpenDelayMenuKey((prev) => {
                                                            const next = prev === menuKey ? null : menuKey;
                                                            if (next) {
                                                                setOpenDelayAnchorEl(delayAnchorRefs.current[menuKey] ?? null);
                                                            } else {
                                                                setOpenDelayAnchorEl(null);
                                                            }
                                                            return next;
                                                        });
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}
                            {/* 禁入帮助提示按钮 — 仅当进入按钮被禁用且有文案时，显示在按钮左侧 */}
                            {props.isEnterLocked(room) && enterDisabledHintText ? (
                                <div className="shrink-0 flex items-center">
                                    <DisabledEnterHintButton hintText={enterDisabledHintText} />
                                </div>
                            ) : null}
                            <div className="flex-1 min-w-0 h-full">
                                <AnimatedRoomButton
                                    text={props.getButtonText(room, roomId)}
                                    disabled={props.isEnterLocked(room)}
                                    density={density}
                                    confirming={confirmingRoomIndex === idx}
                                    onClick={() => handleEnterClick(room, idx)}
                                />
                            </div>
                            {showDelay && openDelayMenuKey?.startsWith(`${roomId}::`) ? (
                                (() => {
                                    const activeKey = openDelayMenuKey!;
                                    const groupKey = activeKey.slice(roomId.length + 2);
                                    const activeGroup = delayGroups.find((g) => g.key === groupKey);
                                    if (!activeGroup) return null;
                                    return (
                                        <ScanDelayMenuPortal
                                            open
                                            anchorEl={openDelayAnchorEl}
                                            options={activeGroup.options}
                                            subjectUserId={subjectUserId!}
                                            roomId={roomId}
                                            buttonLabel={activeGroup.buttonLabel}
                                            onClose={() => {
                                                setOpenDelayMenuKey(null);
                                                setOpenDelayAnchorEl(null);
                                            }}
                                            onSuccess={(status, optionLabel) => {
                                                onDelaySuccess?.(roomId, status, optionLabel);
                                            }}
                                            rejectedOptionIds={getRejectedOptionIdsForRoom?.(roomId)}
                                        />
                                    );
                                })()
                            ) : null}
                        </div>
                    );
                }
                return (
                    <div
                        key={roomId}
                        className={`relative w-full shrink-0 ${exitRowMinH} group flex items-center justify-center`}
                    >
                        <div className="absolute top-1/2 -translate-y-1/2 right-full mr-2 w-[88px] opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
                            <label className="flex items-center gap-1.5 text-[10px] text-[var(--app-color-text-tertiary)] whitespace-nowrap">
                                <AdminSwitchScaled
                                    size="3"
                                    checked={props.getKeepCardState(idx)}
                                    onChange={(checked) => props.setKeepCardState(idx, checked)}
                                />
                                不还卡出
                            </label>
                        </div>
                        <AnimatedRoomButton
                            text={props.getButtonText(room, roomId)}
                            disabled={props.isExitLocked(room) || isFinished}
                            density={density}
                            onClick={() => {
                                if (onRequestExit) {
                                    onRequestExit(room, idx);
                                } else {
                                    onRoomClick(room, idx);
                                }
                            }}
                        />
                    </div>
                );
            })}

            {/* 进入房间二次确认弹窗 */}
            <RoomEnterConfirmDialog
                open={confirmDialogVisible && confirmingRoom !== null}
                userName={userName || ""}
                roomName={confirmingRoom?.displayName || confirmingRoom?.name || "目标空间"}
                onConfirm={handleConfirmEnter}
                onCancel={handleCancelEnter}
            />

        </div>
    );
};
