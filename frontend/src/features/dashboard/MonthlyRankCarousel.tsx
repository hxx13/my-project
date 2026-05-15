import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchGroupRanking } from '@/api/twinApi';
import { Trophy, Activity } from 'lucide-react';
import { useDashboardSciFiVisual } from '@/features/dashboard-scifi-theme/DashboardSciFiVisualContext';

const REGIONS = ['TOTAL', 'PUDONG', 'PUXI'] as const;
const REGION_NAMES = ['总榜', '浦东', '浦西'];

type RankListItem = { name?: string; value?: number; count?: number };

export function MonthlyRankCarousel() {
    const sf = useDashboardSciFiVisual();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAutoPlaying, setIsAutoPlaying] = useState(true);
    const scrollBoxRef = useRef<HTMLDivElement>(null);

    const region = REGIONS[currentIndex];

    const { data, isLoading } = useQuery({
        queryKey: ['dashboardStats', 'ranking', 'MONTH', region],
        queryFn: () => fetchGroupRanking('MONTH', region),
        refetchInterval: 300000,
    });

    useEffect(() => {
        if (scrollBoxRef.current) scrollBoxRef.current.scrollTop = 0;
    }, [currentIndex]);

    // 自动轮播与平滑滚动引擎 (保持不变)
    useEffect(() => {
        if (!isAutoPlaying || isLoading || !data || data.length === 0) return;
        let isPlaying = true;
        let timeoutId: NodeJS.Timeout;
        let frameId: number;

        const playCycle = async () => {
            await new Promise(r => { timeoutId = setTimeout(r, 2000); });
            if (!isPlaying) return;

            const scrollBox = scrollBoxRef.current;
            if (scrollBox) {
                const scrollDistance = scrollBox.scrollHeight - scrollBox.clientHeight;
                if (scrollDistance > 0) {
                    const duration = scrollDistance * 35;
                    const startTime = performance.now();
                    await new Promise(resolve => {
                        const step = (now: number) => {
                            if (!isPlaying) return resolve(true);
                            const progress = (now - startTime) / duration;
                            if (progress < 1) {
                                scrollBox.scrollTop = scrollDistance * progress;
                                frameId = requestAnimationFrame(step);
                            } else {
                                scrollBox.scrollTop = scrollDistance;
                                resolve(true);
                            }
                        };
                        frameId = requestAnimationFrame(step);
                    });
                }
            }
            await new Promise(r => { timeoutId = setTimeout(r, 1500); });
            if (!isPlaying) return;
            setCurrentIndex(prev => (prev + 1) % REGIONS.length);
        };
        playCycle();

        return () => {
            isPlaying = false;
            clearTimeout(timeoutId);
            cancelAnimationFrame(frameId);
        };
    }, [currentIndex, isAutoPlaying, isLoading, data]);

    const handleTabClick = (index: number) => {
        setIsAutoPlaying(false);
        setCurrentIndex(index);
        setTimeout(() => setIsAutoPlaying(true), 5000);
    };

    const maxCount = data && data.length > 0 ? Math.max(data[0].value || data[0].count || 1, 1) : 1;
    const top3Data = data ? data.slice(0, 3) : [];
    const restData = data ? data.slice(3) : [];

    const renderItem = (item: RankListItem, index: number) => {
        const rank = index + 1;
        const count = item.value ?? item.count ?? 0;
        const pct = (count / maxCount) * 100;
        const displayName = item.name ?? "";

        // 🏆 动态分配前三名专属材质
        let numColor = "text-slate-400 font-serif italic";
        let barColor = "bg-blue-500 shadow-blue-500/30";
        let glow = "";

        if (rank === 1) {
            numColor = "text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.6)] text-[14px] font-black";
            barColor = "bg-gradient-to-r from-yellow-400 to-amber-500 shadow-yellow-500/50";
            glow = "shadow-[0_0_15px_rgba(234,179,8,0.2)]";
        } else if (rank === 2) {
            numColor = "text-slate-400 drop-shadow-[0_0_8px_rgba(148,163,184,0.6)] text-[13px] font-black";
            barColor = "bg-gradient-to-r from-slate-300 to-slate-400 shadow-slate-400/50";
        } else if (rank === 3) {
            numColor = "text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.6)] text-[13px] font-black";
            barColor = "bg-gradient-to-r from-orange-400 to-rose-400 shadow-orange-500/50";
        }

        return (
            <div
                key={item.name}
                className={`flex items-center gap-2 p-1.5 rounded-lg transition-all duration-300 shrink-0 ${glow} ${
                    sf ? "hover:bg-cyan-500/10 hover:translate-x-1" : "hover:bg-white/60 hover:translate-x-1"
                }`}
            >
                <div className={`w-5 text-center text-[12px] font-black shrink-0 ${numColor}`}>{rank}</div>
                <div
                    className={`w-[85px] text-[11px] font-extrabold truncate shrink-0 ${sf ? "text-slate-100" : "text-slate-800"}`}
                >
                    {displayName}
                </div>
                <div
                    className={`flex-1 h-1.5 rounded-full overflow-hidden flex items-center shadow-inner ${
                        sf ? "bg-slate-800/80" : "bg-slate-200/50"
                    }`}
                >
                    {/* 进度条实体 (加入丝滑过渡动画) */}
                    <div
                        className={`h-full rounded-full transition-all duration-1000 ease-out shadow-sm ${barColor}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                {/* 次数统计 */}
                <div className="w-[35px] flex items-baseline justify-end shrink-0">
                    <span className={`text-[12px] font-black font-mono tracking-tight ${sf ? "text-cyan-200" : "text-slate-800"}`}>
                        {count}
                    </span>
                    <span className={`text-[9px] font-bold ml-0.5 ${sf ? "text-slate-500" : "text-slate-400"}`}>次</span>
                </div>
            </div>
        );
    };

    return (
        <div className="w-full h-full flex flex-col relative bg-transparent">
            {/* 💥 标题与 Tab 栏重构：采用瀑布流同款渐变图标与胶囊按钮 */}
            <div className={`flex justify-between items-center border-b pb-3 mb-2 shrink-0 ${sf ? "border-cyan-500/25" : "border-slate-200/60"}`}>
                <div className="flex items-center gap-2">
                    <div
                        className={`w-6 h-6 rounded-md flex items-center justify-center shadow-md ${
                            sf
                                ? "bg-gradient-to-br from-amber-400 via-fuchsia-500 to-cyan-500 shadow-fuchsia-500/30"
                                : "bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-500/20"
                        }`}
                    >
                        <Trophy className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span
                        className={`text-[15px] font-extrabold tracking-wider ${
                            sf
                                ? "bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-fuchsia-200 to-cyan-200 drop-shadow-[0_0_12px_rgba(34,211,238,0.25)]"
                                : "bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500"
                        }`}
                    >
                        进入活跃榜单
                    </span>
                </div>

                <div
                    className={`flex p-0.5 rounded-lg border shadow-sm ${
                        sf ? "bg-slate-900/80 border-cyan-500/30" : "bg-slate-100/80 border-slate-200/50"
                    }`}
                >
                    {REGIONS.map((reg, idx) => (
                        <div
                            key={reg}
                            className={`px-2.5 py-1 text-[10px] font-black rounded-md cursor-pointer transition-all duration-300
                                ${currentIndex === idx
                                ? sf
                                    ? "bg-cyan-500/20 text-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.35)] border border-cyan-400/40"
                                    : "bg-white text-blue-600 shadow-sm border border-slate-200/60"
                                : sf
                                  ? "text-slate-500 hover:text-cyan-200"
                                  : "text-slate-400 hover:text-slate-600"
                            }`}
                            onClick={() => handleTabClick(idx)}
                        >
                            {REGION_NAMES[idx]}
                        </div>
                    ))}
                </div>
            </div>

            {/* 列表容器 */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {isLoading ? (
                    <div
                        className={`absolute inset-0 flex flex-col items-center justify-center gap-2 animate-pulse ${
                            sf ? "text-cyan-400" : "text-blue-500"
                        }`}
                    >
                        <Activity className="w-6 h-6" />
                        <span className="text-[11px] font-bold tracking-widest">神经链路上行中...</span>
                    </div>
                ) : (
                    <>
                        {/* 绝对置顶前三名 */}
                        {top3Data.length > 0 && (
                            <div
                                className={`shrink-0 flex flex-col gap-0.5 pb-2 border-b border-dashed mb-1 relative z-10 ${
                                    sf ? "border-cyan-500/25" : "border-slate-200/80"
                                }`}
                            >
                                {top3Data.map((item: RankListItem, i: number) => renderItem(item, i))}
                            </div>
                        )}
                        {/* 无极滚动区 */}
                        <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 pr-1 [&::-webkit-scrollbar]:hidden" ref={scrollBoxRef}>
                            {restData.map((item: RankListItem, i: number) => renderItem(item, i + 3))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}