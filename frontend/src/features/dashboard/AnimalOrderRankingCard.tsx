import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAnimalOrderRanking } from '@/api/twinApi';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Mouse } from 'lucide-react';
import { useDashboardSciFiVisual } from '@/features/dashboard-scifi-theme/DashboardSciFiVisualContext';

type RegionType = 'TOTAL' | 'PUDONG' | 'PUXI';

type AnimalRankingRow = { projectName?: string; totalQuantity?: number };

export function AnimalOrderRankingCard() {
    const sf = useDashboardSciFiVisual();
    const [activeRegion, setActiveRegion] = useState<RegionType>('TOTAL');

    // 自动缓存并请求当前选中校区的数据
    const { data: rankingList = [], isLoading } = useQuery({
        queryKey: ['animalOrderRanking', activeRegion],
        queryFn: () => fetchAnimalOrderRanking(activeRegion),
        refetchInterval: 1000 * 60 * 30, // 半小时静默刷新一次即可
    });
    const safeRankingList = Array.isArray(rankingList) ? rankingList : [];

    const getMedalStyle = (index: number) => {
        if (index === 0) return 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-yellow-950 shadow-[0_0_10px_rgba(234,179,8,0.5)]';
        if (index === 1) return 'bg-gradient-to-br from-slate-300 to-slate-500 text-slate-900 shadow-[0_0_10px_rgba(148,163,184,0.5)]';
        if (index === 2) return 'bg-gradient-to-br from-orange-300 to-orange-600 text-orange-950 shadow-[0_0_10px_rgba(249,115,22,0.5)]';
        return 'bg-slate-800 text-slate-400 border border-slate-700';
    };

    return (
        <div className="w-full h-full flex flex-col pt-1 pb-3 px-4">
            <div
                className={`flex justify-between items-end mb-4 shrink-0 border-b pb-3 ${
                    sf ? "border-cyan-500/20" : "border-white/10"
                }`}
            >
                <div className="flex items-center gap-2">
                    <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-lg ${
                            sf
                                ? "bg-gradient-to-br from-fuchsia-600 to-cyan-500 shadow-cyan-500/35"
                                : "bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-500/20"
                        }`}
                    >
                        <Mouse className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <span
                            className={`text-base font-black tracking-wider ${
                                sf
                                    ? "bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-200 via-rose-200 to-cyan-200 drop-shadow-[0_0_12px_rgba(244,114,182,0.3)]"
                                    : "bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500"
                            }`}
                        >
                            当月模式动物耗量榜
                        </span>
                        <p className={`text-[9px] font-bold -mt-0.5 ${sf ? "text-slate-500" : "text-slate-400"}`}>
                            每周四凌晨 0:00 自动结算
                        </p>
                    </div>
                </div>

                <div
                    className={`flex p-1 rounded-lg backdrop-blur-sm border ${
                        sf ? "bg-slate-900/80 border-cyan-500/30" : "bg-slate-200/50 border-slate-300/50"
                    }`}
                >
                    {(['TOTAL', 'PUDONG', 'PUXI'] as RegionType[]).map((region) => {
                        const labels = { TOTAL: '全域', PUDONG: '浦东', PUXI: '浦西' };
                        const isActive = activeRegion === region;
                        return (
                            <button
                                key={region}
                                onClick={() => setActiveRegion(region)}
                                className={`relative px-3 py-1 text-[11px] font-black rounded-md transition-all duration-300 z-10 ${
                                    isActive
                                        ? "text-white"
                                        : sf
                                          ? "text-slate-400 hover:text-cyan-200"
                                          : "text-slate-500 hover:text-slate-700"
                                }`}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="rankingTabBg"
                                        className={`absolute inset-0 rounded-md shadow-md z-[-1] ${
                                            sf
                                                ? "bg-gradient-to-r from-cyan-600 to-fuchsia-600 shadow-cyan-500/40"
                                                : "bg-blue-500"
                                        }`}
                                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                    />
                                )}
                                {labels[region]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 排行榜列表 */}
            <div className="flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden relative">
                {isLoading ? (
                    <div
                        className={`absolute inset-0 flex items-center justify-center font-bold text-sm animate-pulse ${
                            sf ? "text-cyan-400" : "text-blue-500"
                        }`}
                    >
                        正在读取中枢榜单...
                    </div>
                ) : safeRankingList.length === 0 ? (
                    <div className={`absolute inset-0 flex items-center justify-center font-bold text-sm ${sf ? "text-slate-500" : "text-slate-400"}`}>
                        当月暂无订购数据
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        <AnimatePresence mode="popLayout">
                            {safeRankingList.map((item: AnimalRankingRow, index: number) => (
                                <motion.div
                                    key={item.projectName + activeRegion}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ delay: index * 0.05 }}
                                    className="flex items-center gap-3 group"
                                >
                                    {/* 名次徽章 */}
                                    <div className={`w-6 h-6 shrink-0 flex items-center justify-center rounded-md font-black text-[12px] font-mono ${getMedalStyle(index)}`}>
                                        {index === 0 ? <Crown className="w-3.5 h-3.5" /> : index + 1}
                                    </div>

                                    {/* 课题组名称槽位 */}
                                    <div
                                        className={`flex-1 min-w-0 rounded-lg px-3 py-1.5 flex justify-between items-center transition-colors border ${
                                            sf
                                                ? "bg-slate-950/55 border-cyan-500/25 group-hover:bg-cyan-950/40 group-hover:border-cyan-400/35"
                                                : "bg-white/50 border-slate-200/60 group-hover:bg-blue-50/50"
                                        }`}
                                    >
                                        <span
                                            className={`text-[13px] font-bold truncate mr-2 ${sf ? "text-slate-200" : "text-slate-700"}`}
                                            title={item.projectName}
                                        >
                                            {item.projectName}
                                        </span>
                                        <div className="flex items-end gap-1 shrink-0">
                                            <span
                                                className={`text-[16px] font-black font-mono leading-none ${
                                                    sf ? "text-cyan-300" : "text-blue-600"
                                                }`}
                                            >
                                                {item.totalQuantity}
                                            </span>
                                            <span className="text-[9px] text-slate-400 font-bold mb-[2px]">只</span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
}