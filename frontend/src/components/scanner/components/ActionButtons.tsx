import { AnimatePresence, motion } from "framer-motion";
import { AnimatedRoomButton } from "@/components/scanner/AnimatedRoomButton";
import { HamsterExitButton } from "@/components/scanner/HamsterExitButton";
import type { RoomInfo } from "@/api/types/scanner";
import { resolveRoomActionDensity } from "@/components/scanner/roomActionDensity";

export type { RoomActionDensity } from "@/components/scanner/roomActionDensity";

interface ActionButtonsProps {
    action: "ENTER" | "EXIT";
    targetRooms: RoomInfo[];
    onRoomClick: (room: RoomInfo, index: number) => void;
    isSuccess: boolean;
    /** 仅离开动作成功时用于仓鼠减速，勿复用全局 ENTER 成功 */
    exitCelebrateRoomId: string | null;
    actedRoomId: string | null;
    finishedRooms: string[];
    autoActionRoomId: string;
    getButtonText: (room: RoomInfo, roomId: string) => string;
    isRoomLocked: (room: RoomInfo) => boolean;
    getKeepCardState: (index: number) => boolean;
    setKeepCardState: (index: number, checked: boolean) => void;
}

export const ActionButtons = (props: ActionButtonsProps) => {
    const { action, targetRooms, onRoomClick, exitCelebrateRoomId, finishedRooms } = props;
    const safeRooms = Array.isArray(targetRooms) ? targetRooms : [];
    const density = resolveRoomActionDensity(safeRooms.length);
    const gapClass = density === "normal" ? "gap-4" : density === "compact" ? "gap-2.5" : "gap-1.5";
    const maxWClass = density === "dense" ? "max-w-[min(360px,100%)]" : "max-w-[360px]";
    const enterRowH = density === "normal" ? "h-[55px]" : density === "compact" ? "h-[48px]" : "h-[40px]";
    const exitRowMinH = density === "normal" ? "min-h-[7.5rem]" : density === "compact" ? "min-h-[6.5rem]" : "min-h-[5.5rem]";

    return (
        <div
            className={`flex flex-col w-full mx-auto min-h-0 max-h-full overflow-y-auto overflow-x-visible ${gapClass} ${maxWClass} pl-1 pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        >
            <AnimatePresence>
                {safeRooms.map((room, idx) => {
                    const roomId = room.officialRoomId || room.id;
                    const isFinished = finishedRooms.includes(roomId);
                    if (action === "ENTER" || props.isRoomLocked(room)) {
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
                                    disabled={props.isRoomLocked(room)}
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
                                onClick={() => onRoomClick(room, idx)}
                            />
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
};
