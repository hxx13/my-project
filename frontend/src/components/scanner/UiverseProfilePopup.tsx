import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { ExpToaster } from "./ExpToaster";
import AIPredictionCard from "./AIPredictionCard";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { useProfilePopup } from "./useProfilePopup";
import { ProfileHeader } from "./components/ProfileHeader";
import { CapacityStatusList } from "./components/CapacityStatusList";
import { ActionButtons } from "./components/ActionButtons";
import { DisciplinaryModal } from "./components/DisciplinaryModal";
import { ScanAccessNoticeOverlay } from "./ScanAccessNoticeOverlay";
import type { PopupProps } from "./components/types";
import { ViolationNoticeBanner } from "./ViolationNoticeBanner";

const WeeklyRoutineMatrixChart = ({ predictions, themeColor }: { predictions: any[]; themeColor: string }) => {
    const isPink = themeColor === "#fbb9b6";
    const strokeEntry = isPink ? "#fb7185" : "#60a5fa";
    const strokeExit = isPink ? "#f87171" : "#a78bfa";
    const days = 7;
    const width = 300;
    const height = 60;
    const entryCurve = new Array(days).fill(0);
    const exitCurve = new Array(days).fill(0);
    if (predictions?.length) {
        const toArray = (raw: unknown, expected: number): number[] => {
            if (Array.isArray(raw)) return raw.map((v) => Number(v) || 0);
            return new Array(expected).fill(0);
        };
        let valid = 0;
        predictions.forEach((p) => {
            const wec = toArray(p?.weeklyEntryCurve, 7);
            const wxc = toArray(p?.weeklyExitCurve, 7);
            if (wec.length === 7 && wxc.length === 7 && (wec.some((v) => v > 0) || wxc.some((v) => v > 0))) {
                valid += 1;
                for (let i = 0; i < days; i += 1) {
                    entryCurve[i] += wec[i] || 0;
                    exitCurve[i] += wxc[i] || 0;
                }
            }
        });
        if (valid > 0) {
            for (let i = 0; i < days; i += 1) {
                entryCurve[i] /= valid;
                exitCurve[i] /= valid;
            }
        } else {
            entryCurve.fill(0.45);
            exitCurve.fill(0.55);
        }
    }
    const maxVal = Math.max(...entryCurve, ...exitCurve, 0.01);
    const mapY = (val: number) => height - (Math.max(0, val) / maxVal) * height;
    const getX = (idx: number) => (idx / (days - 1)) * width;
    const entryPath = entryCurve.map((v, i) => `${getX(i)},${mapY(v)}`).join(" L ");
    const exitPath = exitCurve.map((v, i) => `${getX(i)},${mapY(v)}`).join(" L ");
    return (
        <div className="w-full p-4 rounded-2xl shadow-2xl border backdrop-blur-md bg-[#0a0f1d]/90 border-white/10">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-200 tracking-wider">预期核心在馆时间带</span>
                <span className="text-[9px] text-[#ffb86c] bg-[#ffb86c]/10 px-2 py-0.5 rounded-full border border-[#ffb86c]/30">Time Band</span>
            </div>
            <div className="relative border-l border-b border-white/10 pb-1 pl-8 pr-1 w-full">
                <div className="absolute left-1 top-0 text-[8px] text-white/40">{maxVal.toFixed(2)}</div>
                <div className="absolute left-1 bottom-1 text-[8px] text-white/30">0</div>
                <svg className="w-full h-[60px]" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                        <line key={i} x1={getX(i)} y1={0} x2={getX(i)} y2={height} stroke="rgba(255,255,255,0.05)" strokeDasharray="2" />
                    ))}
                    <path d={`M ${entryPath} L ${exitPath.split(" L ").reverse().join(" L ")} Z`} fill="rgba(96,165,250,0.16)" stroke="none" />
                    <path d={`M ${exitPath}`} fill="none" stroke={strokeExit} strokeWidth="1.5" strokeDasharray="3 3" />
                    <path d={`M ${entryPath}`} fill="none" stroke={strokeEntry} strokeWidth="1.5" />
                </svg>
                <div className="flex justify-between w-full mt-1.5">
                    {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                        <span key={day} className="text-[9px] font-bold text-slate-500">{day}</span>
                    ))}
                </div>
            </div>
        </div>
    );
};

export function UiverseProfilePopup(props: PopupProps) {
    const { result, onClose, autoActionRoomId = "", executeErrorMessage, onOpenStudentBind } = props;
    const { state, actions } = useProfilePopup(props);
    const canOperateRiskState = hasMinRole(authStorage.getRole(), "STAFF");
    const themeColor = String(state.user?.gender) === "2" ? "#fbb9b6" : "#2d5cf7";
    const popupMessage = (state.inlineMessage || executeErrorMessage || "").trim();

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (state.accessNotice) actions.dismissAccessNotice();
                else if (state.showRiskModal) actions.setShowRiskModal(false);
                else onClose();
            }
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [actions, onClose, state.accessNotice, state.showRiskModal]);

    if (!result) return null;

    const showUnboundBindHint =
        Boolean(onOpenStudentBind) && result.success !== false && result.hasPhysicalCardMapping !== true;

    return createPortal(
        <>
            <ScanAccessNoticeOverlay
                open={Boolean(state.accessNotice?.message)}
                message={state.accessNotice?.message ?? ""}
                durationMs={state.accessNoticeDurationMs}
                themeColor={themeColor}
                onDismiss={actions.dismissAccessNotice}
            />
            <AnimatePresence>
                <DisciplinaryModal
                    isOpen={state.showRiskModal}
                    currentState={state.globalUserState}
                    records={state.disciplinaryRecords}
                    onClose={() => actions.setShowRiskModal(false)}
                    onToggle={actions.executeToggleState}
                    showStateToggle={canOperateRiskState}
                />
            </AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-[99999] flex flex-col overflow-hidden bg-[#050A15]/85 backdrop-blur-sm"
            >
                <button className="absolute top-6 right-6 z-[10000] flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white hover:border-red-500 hover:bg-red-500/80" onClick={onClose} title="关闭 Esc">
                    <X className="w-5 h-5" />
                </button>
                {showUnboundBindHint ? (
                    <button
                        type="button"
                        className="absolute bottom-8 left-1/2 z-[10001] -translate-x-1/2 max-w-[min(320px,90vw)] rounded-xl border border-cyan-400/60 bg-cyan-500/20 px-4 py-2.5 text-center text-[12px] font-bold text-cyan-50 shadow-lg shadow-cyan-900/40 hover:bg-cyan-500/35 transition-colors"
                        onClick={onOpenStudentBind}
                    >
                        当前未绑卡，点我绑定卡
                    </button>
                ) : null}
                <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 overflow-hidden p-10 pb-20">
                    {result.studentViolationNotice ? <ViolationNoticeBanner notice={result.studentViolationNotice} /> : null}
                    <div className="grid min-h-0 w-full max-w-[1920px] flex-1 grid-cols-[25fr_50fr_25fr] gap-8 overflow-hidden">
                    <div className="flex flex-col h-full min-h-0 pt-6 pb-6 gap-4">
                        <div className="w-full h-[60px] mb-1">
                            <div className="relative w-[280px] h-[52px] z-[200] flex items-center">
                                <div className="relative w-12 h-12 rounded-full bg-[#1e293b] border-[2px] border-cyan-400/70 shadow-lg flex items-center justify-center z-20 shrink-0">
                                    <div className="flex flex-col items-center justify-center -space-y-1">
                                        <span className="text-[8px] font-bold text-white/70">LV</span>
                                        <span className="text-white font-black text-base">{state.user?.rpg?.level ?? 0}</span>
                                    </div>
                                </div>
                                <div className="relative flex-1 h-[40px] flex flex-col justify-between -ml-3 z-10 pt-0.5">
                                    <div className="pl-5 z-30 flex items-center">
                                        <span className="font-bold text-white text-[12px] truncate">{state.user?.name || "未知人员"}</span>
                                    </div>
                                    <div className="relative h-[20px] bg-[#050A15]/90 rounded-r-full border border-white/10 overflow-hidden pl-5 pr-2 flex items-center">
                                        <div
                                            className="absolute left-0 top-0 bottom-0 transition-all duration-500 z-0 opacity-40 bg-gradient-to-r from-cyan-400/20 to-cyan-400"
                                            style={{ width: `${Math.max(0, Math.min(100, (((state.user?.rpg?.exp ?? 0) / Math.max(1, state.user?.rpg?.nextLevelExp ?? 100)) * 100)))}%` }}
                                        />
                                        <div className="relative z-20 w-full flex justify-between items-center text-white">
                                            <span className="text-[8px] font-black text-white/60 tracking-widest">EXP</span>
                                            <span className="text-[9px] font-black font-mono">{state.user?.rpg?.exp ?? 0} <span className="text-white/40">/ {state.user?.rpg?.nextLevelExp ?? 100}</span></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="basis-1/2 min-h-0">
                            <ProfileHeader user={state.user} isAvatarLoaded={state.isAvatarLoaded} globalUserState={state.globalUserState} onAvatarError={() => actions.setAvatarLoaded(false)} onOpenRiskModal={() => actions.setShowRiskModal(true)} />
                        </div>
                        <div className="basis-1/2 min-h-0 rounded-2xl border border-white/5 px-4 flex flex-col min-h-0 overflow-hidden">
                            <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
                                <CapacityStatusList
                                    items={state.myCapacityStats}
                                    roomOverviewFetching={state.roomOverviewFetching}
                                    roomOverviewSourceCount={state.roomOverviewSourceCount}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-14">
                        <div style={{ transform: "scale(1.1)", transformOrigin: "center center" }} className="w-[500px] mb-6">
                            <WeeklyRoutineMatrixChart predictions={state.predictionList} themeColor={themeColor} />
                        </div>
                        <div style={{ transform: "scale(1.1)", transformOrigin: "center center" }} className="w-[500px]">
                            <AIPredictionCard predictions={state.predictionList} isLoading={state.isPredLoading} themeColor={themeColor} />
                        </div>
                    </div>
                    <div className="flex flex-col h-full min-h-0 pt-4 pb-6 gap-3 relative">
                        {popupMessage && (
                            <div className="w-full max-w-[340px] mx-auto shrink-0 flex justify-end pr-0">
                                <div className="max-w-[min(260px,100%)] rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] leading-snug text-red-200/95 shadow-md flex items-start gap-1.5">
                                    <span className="flex-1 min-w-0 break-words text-right">{popupMessage}</span>
                                    <button
                                        type="button"
                                        onClick={actions.clearInlineMessage}
                                        className="text-red-300/90 hover:text-red-200 shrink-0 text-[10px] font-semibold"
                                    >
                                        关闭
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="basis-1/2 min-h-0 flex items-center justify-center rounded-2xl border border-white/5">
                            <div className="h-[220px] w-full flex items-center justify-center">
                                <ExpToaster key={state.toastData.nonce} expAdded={state.toastData.exp} play={state.toastData.play} />
                            </div>
                        </div>
                        <div className="basis-1/2 min-h-0 flex flex-col overflow-hidden">
                            <div className="w-full max-w-[340px] mx-auto mb-3 space-y-1.5 shrink-0">
                                <div className="bg-black/40 p-1.5 rounded-xl border border-white/10 flex gap-1" title="由 twin_card_mapping 自动判定，打卡将写入流水">
                                    <div
                                        className={`flex-1 py-2 text-[11px] font-black rounded-lg text-center pointer-events-none select-none ${
                                            state.entryMode === "OWN" ? "bg-indigo-600 text-white" : "text-slate-500"
                                        }`}
                                    >
                                        💳 自带校园卡
                                    </div>
                                    <div
                                        className={`flex-1 py-2 text-[11px] font-black rounded-lg text-center pointer-events-none select-none ${
                                            state.entryMode === "BORROWED" ? "bg-rose-600 text-white" : "text-slate-500"
                                        }`}
                                    >
                                        💳 领用公卡
                                    </div>
                                </div>
                                {result.hasPhysicalCardMapping !== undefined && (
                                    <p className="text-[10px] text-slate-500 text-center leading-snug">
                                        状态已根据物理卡映射自动判定；进入时将同步至流水「卡片领用状态」
                                    </p>
                                )}
                            </div>
                            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                                <ActionButtons
                                    action={state.action}
                                    targetRooms={state.targetRooms}
                                    onRoomClick={actions.handleRoomClick}
                                    isSuccess={state.isSuccess}
                                    exitCelebrateRoomId={state.exitCelebrateRoomId}
                                    actedRoomId={state.actedRoomId}
                                    finishedRooms={state.finishedRooms}
                                    autoActionRoomId={autoActionRoomId}
                                    getButtonText={actions.getButtonText}
                                    isRoomLocked={actions.isRoomLocked}
                                    getKeepCardState={actions.getKeepCardState}
                                    setKeepCardState={actions.setKeepCardState}
                                />
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
            </motion.div>
        </>,
        document.body
    );
}
