import { useEffect, useState, useRef } from "react";
import { fetchRetentionWarnings } from "@/api/twinApi";
import { Activity, Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import { resolveLedgerIsOwnCard } from "@/utils/cardLedgerBadges";
import { useDashboardSciFiVisual } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";

type RetentionRow = Record<string, unknown>;

export function RetentionRadarStream({activeTab, setActiveTab}: {
    activeTab: '浦东' | '浦西',
    setActiveTab: (tab: '浦东' | '浦西') => void
}) {
    const toBoolFlag = (value: unknown): boolean => {
        if (value === true || value === 1) return true;
        if (typeof value === "string") {
            const s = value.trim().toLowerCase();
            return s === "1" || s === "true" || s === "yes";
        }
        return false;
    };

    const [warnings, setWarnings] = useState<RetentionRow[]>([]);
    const [now, setNow] = useState(new Date());
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const exactScrollTop = useRef(0);
    const scrollDirection = useRef<1 | -1>(1);
    const isScrollPaused = useRef(false);

    useEffect(() => {
        const loadWarnings = async () => {
            try {
                // 💥 2. 在调用接口时，把当前校区传过去！
                const data = await fetchRetentionWarnings(100, activeTab);
                setWarnings(data || []);
            } catch (error) {
                console.error("❌ 滞留雷达拉取失败:", error);
            }
        };
        loadWarnings();
        const intervalId = setInterval(loadWarnings, 30000);
        return () => clearInterval(intervalId);
    }, [activeTab]);

    useEffect(() => {
        const timerId = setInterval(() => {
            setNow(new Date());
        }, 60000);
        return () => clearInterval(timerId);
    }, []);

    useEffect(() => {
        const container = scrollRef.current;
        if (!container || warnings.length <= 4) {
            if (container) container.scrollTop = 0;
            return;
        }

        let animationId: number;

        const autoScroll = () => {
            if (!container) return;
            const maxScroll = container.scrollHeight - container.clientHeight;

            if (exactScrollTop.current > maxScroll) {
                exactScrollTop.current = maxScroll;
            }

            if (!isHovered && !isScrollPaused.current) {
                exactScrollTop.current += 0.5 * scrollDirection.current;

                if (exactScrollTop.current >= maxScroll) {
                    exactScrollTop.current = maxScroll;
                    scrollDirection.current = -1;
                    isScrollPaused.current = true;
                    setTimeout(() => {
                        isScrollPaused.current = false;
                    }, 2000);
                } else if (exactScrollTop.current <= 0) {
                    exactScrollTop.current = 0;
                    scrollDirection.current = 1;
                    isScrollPaused.current = true;
                    setTimeout(() => {
                        isScrollPaused.current = false;
                    }, 2000);
                }
                container.scrollTop = exactScrollTop.current;
            } else if (isHovered) {
                exactScrollTop.current = container.scrollTop;
            }
            animationId = requestAnimationFrame(autoScroll);
        };

        animationId = requestAnimationFrame(autoScroll);
        return () => cancelAnimationFrame(animationId);
    }, [warnings, isHovered]);

    const displayList = warnings;
    const sf = useDashboardSciFiVisual();

    return (
        <div className="w-full h-full flex flex-col p-2 overflow-hidden">
            <style>{`
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            <div
                className={`shrink-0 flex justify-between items-center pb-3 mb-3 relative z-10 backdrop-blur-sm ${
                    sf
                        ? "border-b border-cyan-500/25 bg-slate-950/40"
                        : "border-b border-rose-200/40 bg-white/50"
                }`}>

                {/* 左侧：标题 */}
                <div className="flex items-center gap-2">
                    <div
                        className={`w-6 h-6 rounded-md flex items-center justify-center shadow-md ${
                            sf
                                ? "bg-gradient-to-br from-fuchsia-600 to-cyan-500 shadow-cyan-500/40"
                                : "bg-gradient-to-br from-rose-500 to-orange-500 shadow-rose-500/20"
                        }`}>
                        <AlertTriangle className="w-3.5 h-3.5 text-white"/>
                    </div>
                    <span
                        className={`text-[15px] font-extrabold tracking-wider font-sans ${
                            sf
                                ? "bg-clip-text text-transparent bg-gradient-to-r from-cyan-200 via-fuchsia-200 to-cyan-300 drop-shadow-[0_0_12px_rgba(34,211,238,0.35)]"
                                : "bg-clip-text text-transparent bg-gradient-to-r from-rose-800 to-rose-500"
                        }`}>
                        AI 预测雷达
                    </span>
                </div>

                {/* 右侧：开关 + 状态标识 (完美同行并列) */}
                <div className="flex items-center gap-3">
                    {/* 🚀 嵌在这里的微型切换器 */}
                    <div
                        className={`flex p-0.5 rounded-md border shadow-inner ${
                            sf ? "bg-slate-900/80 border-cyan-500/30" : "bg-slate-100/80 border-slate-200/60"
                        }`}>
                        {(['浦东', '浦西'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-2 py-[2px] text-[10px] font-bold rounded-[4px] transition-all ${
                                    activeTab === tab
                                        ? sf
                                            ? "bg-cyan-500/25 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.35)] border border-cyan-400/40"
                                            : "bg-white text-rose-500 shadow-sm"
                                        : sf
                                          ? "text-slate-400 hover:text-cyan-200"
                                          : "text-slate-500 hover:text-slate-700"
                                        }`}
                                        >
                                {tab}
                            </button>
                        ))}
                    </div>
                    {/* 探测状态灯 */}
                    <div className={`flex items-center gap-1.5 pl-2 border-l ${sf ? "border-cyan-500/30" : "border-rose-200/50"}`}>
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                        </span>
                        <span className={`text-[10px] font-bold ${sf ? "text-cyan-300" : "text-rose-500"}`}>实时预测中</span>
                    </div>
                </div>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 w-full relative overflow-y-auto hide-scrollbar"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {warnings.length === 0 ? (
                    <div className={`h-full flex flex-col items-center justify-center opacity-70 ${sf ? "text-slate-500" : "text-slate-400"}`}>
                        <Activity className="w-8 h-8 mb-2"/>
                        {/* 💥 4. 动态显示空状态提示 */}
                        <span className="text-sm font-bold">当前 {activeTab} 区域无滞留记录</span>
                    </div>
                ) : (
                    <div className="w-full flex flex-col pt-1">
                        {displayList.map((evt: RetentionRow, index: number) => {
                            const enterTime = String(evt.enterTime ?? "").replace(" ", "T");
                            const enterDate = new Date(enterTime);
                            const passedMins = Math.floor((now.getTime() - enterDate.getTime()) / 60000);
                            const aiPredictedMins = Number(evt.aiDurationMins) || 120;
                            const isExtended = passedMins >= aiPredictedMins;

                            const enterStr = String(evt.enterTime ?? "");
                            const timeStr = enterStr ? enterStr.split(" ")[1]?.substring(0, 5) ?? "--:--" : "--:--";
                            const nowStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

                            const exitDate = new Date(enterDate.getTime() + aiPredictedMins * 60000);
                            const aiExitTimeStr = `${exitDate.getHours().toString().padStart(2, '0')}:${exitDate.getMinutes().toString().padStart(2, '0')}`;

                            // =========================================================
                            // 💥 提取特权标志 (兼容驼峰和下划线，以防后端序列化配置不同)
                            // =========================================================
                            const isShared = toBoolFlag(evt.is_shared_card) || toBoolFlag(evt.isSharedCard);
                            const isOwn = resolveLedgerIsOwnCard(evt);
                            const isKeep =
                                toBoolFlag(evt.is_keep_card) ||
                                toBoolFlag(evt.isKeepCard) ||
                                toBoolFlag(evt.freeze_exempt_flag) ||
                                toBoolFlag(evt.freezeExemptFlag);

                            return (
                                <div key={`${String(evt.logId ?? index)}-${index}`} className="flex flex-col mb-2 relative group px-1">
                                    <div className={`relative border rounded-[8px] p-2 overflow-hidden transition-all duration-300
                                        ${isExtended
                                        ? sf
                                            ? "bg-amber-950/35 border-amber-400/35 shadow-[0_0_20px_rgba(245,158,11,0.12)]"
                                            : "bg-amber-50/40 border-amber-200/60 shadow-[0_2px_10px_rgba(245,158,11,0.05)]"
                                        : sf
                                          ? "bg-slate-950/50 border-cyan-500/20 shadow-[0_0_24px_rgba(56,189,248,0.08)]"
                                          : "bg-white border-slate-200/80 shadow-[0_2px_10px_rgba(0,0,0,0.03)]"}`}
                                    >
                                        <div className="flex items-center gap-2 mb-1.5">
                                            {/* 💥 左侧自适应：人员信息 + 极简特权徽章组 */}
                                            <div className="flex-1 min-w-0 flex items-center gap-1">
                                                <span
                                                    className={`font-black text-[13px] truncate shrink-0 ${
                                                        isExtended
                                                            ? sf
                                                                ? "text-amber-300"
                                                                : "text-amber-800"
                                                            : sf
                                                              ? "text-slate-100"
                                                              : "text-slate-800"
                                                    }`}>
                                                    {String(evt.userName ?? "未知")}
                                                </span>
                                                <span
                                                    className={`text-[10px] font-bold px-1.5 py-[1px] rounded truncate min-w-0 ml-0.5 ${
                                                        sf ? "text-slate-300 bg-slate-800/80" : "text-slate-500 bg-slate-100"
                                                    }`}>
                                                    {String(evt.groupName ?? "未知组")}
                                                </span>
                                                {/* 极简徽章渲染 */}
                                                {isShared && (
                                                    <span
                                                        className="shrink-0 text-[9px] font-black px-1 py-[1px] rounded bg-purple-100 text-purple-600 border border-purple-200/60"
                                                        title="同行">同行</span>
                                                )}
                                                {!isOwn && (
                                                    <span
                                                        className="shrink-0 whitespace-nowrap text-[9px] font-black px-1 py-[1px] rounded bg-emerald-100 text-emerald-600 border border-emerald-200/60"
                                                        title="领用公卡（含未走扫码建档时的默认归类）"
                                                    >
                                                        领用公卡
                                                    </span>
                                                )}
                                                {isOwn && (
                                                    <span
                                                        className="shrink-0 text-[9px] font-black px-1 py-[1px] rounded bg-blue-100 text-blue-700 border border-blue-200/60"
                                                        title="自带校园卡">自带卡</span>
                                                )}
                                                {isKeep && (
                                                    <span
                                                        className="shrink-0 text-[9px] font-black px-1 py-[1px] rounded bg-rose-100 text-rose-600 border border-rose-200/60 shadow-sm"
                                                        title="延迟还卡">
                                                        延迟
                                                    </span>
                                                )}
                                            </div>

                                            <div className="w-[110px] shrink-0">
                                                <div
                                                    className={`flex items-center shadow-sm rounded-[4px] overflow-hidden border w-full ${isExtended ? 'border-amber-200/60' : 'border-slate-200/60'}`}>
                                                    <span
                                                        className={`px-1.5 py-0.5 text-[9px] font-bold leading-none ${isExtended ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        预计进入
                                                    </span>
                                                    <span
                                                        className={`flex-1 px-1 py-0.5 leading-none flex items-baseline justify-center gap-0.5 ${
                                                            sf ? "bg-slate-900/90" : "bg-white"
                                                        }`}>
                                                        <span
                                                            className={`text-[12px] font-black ${isExtended ? 'text-amber-600' : sf ? 'text-cyan-300' : 'text-blue-600'}`}>{passedMins}</span>
                                                        <span
                                                            className="text-[8px] font-bold text-slate-400">/ {aiPredictedMins}m</span>
                                                    </span>
                                                </div>
                                            </div>

                                            <div
                                                className={`w-[50px] shrink-0 flex items-center justify-end gap-1 ${sf ? "text-slate-500" : "text-slate-400"}`}>
                                                <Clock className="w-2.5 h-2.5"/>
                                                <span className="text-[10px] font-black">{timeStr} </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 min-w-0 flex items-center">
                                                <span
                                                    className="text-[10px] font-bold px-1.5 py-[2px] rounded text-indigo-700 bg-indigo-50 border border-indigo-100 truncate">
                                                    📍 {String(evt.areaName ?? "")} {String(evt.roomName ?? "")}
                                                </span>
                                            </div>

                                            <div className="w-[110px] shrink-0">
                                                <div
                                                    className={`flex items-center shadow-sm rounded-[4px] overflow-hidden border w-full ${isExtended ? 'border-amber-200/60' : 'border-slate-200/60'}`}>
                                                    <span
                                                        className={`px-1.5 py-0.5 text-[9px] font-bold leading-none ${isExtended ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        离开
                                                    </span>
                                                    <span
                                                        className={`flex-1 px-1 py-0.5 leading-none flex items-baseline justify-center gap-0.5 ${
                                                            sf ? "bg-slate-900/90" : "bg-white"
                                                        }`}>
                                                        <span
                                                            className={`text-[12px] font-black ${isExtended ? 'text-amber-600' : sf ? 'text-slate-200' : 'text-slate-700'}`}>{nowStr}</span>
                                                        <span
                                                            className="text-[8px] font-bold text-slate-400">/ {aiExitTimeStr}</span>
                                                    </span>
                                                </div>
                                            </div>

                                            {/* 💥 右下角动作按钮智能接管 */}
                                            <div className="w-[50px] shrink-0 flex justify-end">
                                                {isKeep ? (
                                                    <button disabled title="已获取系统的免死金牌，无需核实"
                                                            className="w-full flex items-center justify-center gap-0.5 text-[9px] font-bold px-1 py-[3px] rounded-[4px] bg-rose-50 text-rose-400 border border-rose-100 cursor-not-allowed">
                                                        <ShieldCheck className="w-2.5 h-2.5"/>
                                                        免冻结
                                                    </button>
                                                ) : (
                                                    <button className={`w-full text-[10px] font-bold px-1 py-[3px] rounded-[4px] shadow-sm transition-all active:scale-95
                                                        ${isExtended
                                                        ? 'bg-amber-500 text-white hover:bg-amber-600 border border-amber-600'
                                                        : sf
                                                          ? 'bg-slate-900/80 text-slate-300 border border-cyan-500/30 hover:bg-cyan-950/60 hover:text-cyan-200'
                                                          : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50 hover:text-blue-500'}`}
                                                    >
                                                        正常
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}