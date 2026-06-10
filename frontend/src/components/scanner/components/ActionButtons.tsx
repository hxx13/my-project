import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedRoomButton } from "@/components/scanner/AnimatedRoomButton";
import { HamsterExitButton } from "@/components/scanner/HamsterExitButton";
import type { RoomInfo } from "@/api/types/scanner";
import { resolveRoomActionDensity } from "@/components/scanner/roomActionDensity";
import { formatCountdown } from "@/utils/formatCountdown";

export type { RoomActionDensity } from "@/components/scanner/roomActionDensity";

interface ActionButtonsProps {
    action: "ENTER" | "EXIT";
    targetRooms: RoomInfo[];
    onRoomClick: (room: RoomInfo, index: number) => void;
    isSuccess: boolean;
    exitCelebrateRoomId: string | null;
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
}


export const ActionButtons = (props: ActionButtonsProps) => {
    const { action, targetRooms, onRoomClick, exitCelebrateRoomId, finishedRooms,
        autoSignoutSecondsRemaining } = props;
    const safeRooms = Array.isArray(targetRooms) ? targetRooms : [];
    const density = resolveRoomActionDensity(safeRooms.length);
    const gapClass = density === "normal" ? "gap-4" : density === "compact" ? "gap-2.5" : "gap-1.5";
    const maxWClass = density === "dense" ? "max-w-[min(360px,100%)]" : "max-w-[360px]";
    const enterRowH = density === "normal" ? "h-[55px]" : density === "compact" ? "h-[48px]" : "h-[40px]";
    const exitRowMinH = density === "normal" ? "min-h-[7.5rem]" : density === "compact" ? "min-h-[6.5rem]" : "min-h-[5.5rem]";

    // 本地倒计时（仅在 EXIT 且有初始秒数时启用）
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

    return (
        <div
            className={`flex flex-col w-full mx-auto min-h-0 max-h-full overflow-y-auto overflow-x-visible ${gapClass} ${maxWClass} pl-1 pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        >
            {/* 自动签退倒计时标签 */}
            {showCountdown && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] font-bold text-amber-400 shrink-0"
                >
                    <span>⏱</span>
                    <span>自动签退 {formatCountdown(countdown!)}</span>
                </motion.div>
            )}

            <AnimatePresence>
                {safeRooms.map((room, idx) => {
                    const roomId = room.officialRoomId || room.id;
                    const isFinished = finishedRooms.includes(roomId);
                    if (action === "ENTER") {
                        return (
                            <motion.div
                                key={roomId}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`relative w-full shrink-0 ${enterRowH} group flex items-center justify-center`}
                            >
                                <div className="absolute top-1/2 -translate-y-1/2 right-full mr-2 w-[88px] opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
                                    <label className="flex items-center gap-1.5 text-[10px] text-slate-400 whitespace-nowrap">
                                        <input type="checkbox" checked={props.getKeepCardState(idx)} onChange={(e) => props.setKeepCardState(idx, e.target.checked)} className="accent-rose-500 w-3.5 h-3.5" />
                                        长期占有
                                    </label>
                                </div>
                                <AnimatedRoomButton
                                    text={props.getButtonText(room, roomId)}
                                    disabled={props.isEnterLocked(room)}
                                    density={density}
                                    onClick={() => onRoomClick(room, idx)}
                                />
                            </motion.div>
                        );
                    }
                    return (
                        <motion.div
                            key={roomId}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`relative w-full shrink-0 ${exitRowMinH} group flex items-center justify-center`}
                        >
                            <div className="absolute top-1/2 -translate-y-1/2 right-full mr-2 w-[88px] opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
                                <label className="flex items-center gap-1.5 text-[10px] text-slate-400 whitespace-nowrap">
                                    <input type="checkbox" checked={props.getKeepCardState(idx)} onChange={(e) => props.setKeepCardState(idx, e.target.checked)} className="accent-rose-500 w-3.5 h-3.5" />
                                    不还卡出
                                </label>
                            </div>
                            <HamsterExitButton
                                roomName={room.displayName || room.name}
                                variantSeed={roomId}
                                isWorking={!isFinished}
                                isSuccess={Boolean(exitCelebrateRoomId && exitCelebrateRoomId === roomId)}
                                isFinished={isFinished}
                                density={density}
                                onClick={() => {
                                    if (props.isExitLocked(room)) return;
                                    onRoomClick(room, idx);
                                }}
                            />
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
};
