import { useQuery } from '@tanstack/react-query';
import { useState } from 'react'; // 💥 加上这行
import { useEventStore } from '@/store/useEventStore';
import { GlassCard } from '@/components/ui/GlassCard';
import { fetchLineChartData } from '@/api/twinApi'; // 确保路径对应你的 api 文件
import type { LineStats } from '@/api/twinApi';
import { HubPeakLineChart } from '@/features/dashboard/HubPeakLineChart';
import { TimelineWaterfall } from '@/features/realtime-stream/TimelineWaterfall';
import { NestedPieChart } from '@/features/dashboard/NestedPieChart';
import { MonthlyRankCarousel } from '@/features/dashboard/MonthlyRankCarousel';
import {AnimalOrderRankingCard} from "@/features/dashboard/AnimalOrderRankingCard.tsx";
import { RetentionRadarStream } from '@/features/realtime-stream/RetentionRadarStream';
import { RuleCodexCard } from '@/features/dashboard/RuleCodexCard'; // 确认路径和你刚才建的一致
import { SciFiDashboardChrome } from '@/features/dashboard-scifi-theme/SciFiDashboardChrome';
import { DashboardSciFiVisualProvider } from '@/features/dashboard-scifi-theme/DashboardSciFiVisualContext';
import { useTwinChromeTheme } from '@/features/twin-chrome/TwinChromeThemeContext';

export default function DashboardPage() {
    useEventStore((state) => state.setInitialFeed);
    const sciFiTheme = useTwinChromeTheme();
    const [activeTab, setActiveTab] = useState<'浦东' | '浦西'>('浦东');
    const { data: lineChartData, isLoading: isLineChartLoading } = useQuery({
        queryKey: ['hubLineChart'],
        queryFn: fetchLineChartData,
        refetchInterval: 1000 * 60 * 5 // 每 5 分钟自动静默刷新一次
    });

    return (
        <DashboardSciFiVisualProvider value={sciFiTheme.enabled}>
        <div
            className={`w-full h-screen bg-transparent text-slate-800 flex flex-col font-sans overflow-hidden box-border ${
                sciFiTheme.enabled ? 'p-0' : 'p-[15px]'
            }`}
        >
            <SciFiDashboardChrome enabled={sciFiTheme.enabled}>
            {/* 💥 修复 1：去掉了这里的 overflow-hidden，释放外围阴影 */}
            <div className="w-full h-full min-h-0 grid grid-cols-[25fr,50fr,25fr] gap-[20px] relative z-10">

                {/* 左侧 25% */}
                {/* 💥 修复 2：疯狂扒掉所有的 overflow-hidden 紧箍咒！ */}
                <div className="flex min-h-0 flex-col gap-[15px]">
                    <div className="flex min-h-0 flex-[6]">
                        <GlassCard blobColor="rgba(52,199,89,0.3)">
                            <TimelineWaterfall />
                        </GlassCard>
                    </div>
                    <div className="flex min-h-0 flex-[4]">
                        <GlassCard blobColor="rgba(45,92,247,0.3)">
                            <NestedPieChart />
                        </GlassCard>
                    </div>
                </div>

                {/* 中间 50%：重构为上下结构，上左右双块，下曲线图 */}
                <div className="flex min-h-0 flex-col gap-[15px]">

                    {/* 上半部分：分为左右两块 */}
                    <div className="flex min-h-0 flex-[5] gap-[12px]">
                        <div className="flex min-h-0 min-w-0 flex-1 basis-0">
                            <GlassCard blobColor="rgba(255,59,48,0.3)" compact>
                                <RetentionRadarStream activeTab={activeTab} setActiveTab={setActiveTab} />
                            </GlassCard>
                        </div>
                        <div className="flex min-h-0 min-w-0 flex-1 basis-0">
                            {/* 💥 将霓虹法典直接嵌入光晕卡片中！ */}
                            <GlassCard blobColor="rgba(244,63,94,0.3)" compact>
                                <RuleCodexCard />
                            </GlassCard>
                        </div>
                    </div>

                    {/* 下半部分：进出高峰枢纽对比曲线图 */}
                    <div className="flex min-h-0 flex-[5]">
                        <GlassCard blobColor="rgba(66,165,245,0.3)">
                            {/* 💥 优雅的数据挂载：根据真实请求状态渲染 */}
                            {isLineChartLoading ? (
                                <div className="w-full h-full flex items-center justify-center text-blue-500 text-sm font-bold animate-pulse">
                                    🌐 枢纽链路接通中...
                                </div>
                            ) : lineChartData ? (
                                /* 将后端拿到的真实数据传给你写好的组件！ */
                                <HubPeakLineChart data={lineChartData as LineStats} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm font-bold">
                                    暂无高峰数据
                                </div>
                            )}
                        </GlassCard>
                    </div>
                </div>

                {/* 右侧 25% */}
                <div className="flex min-h-0 flex-col gap-[15px]">
                    <div className="flex min-h-0 flex-[5]">
                        <GlassCard blobColor="rgba(191,90,242,0.3)">
                            <MonthlyRankCarousel />
                        </GlassCard>
                    </div>
                    <div className="flex min-h-0 flex-[5]">
                        <GlassCard blobColor="rgba(255,59,48,0.3)">
                            <AnimalOrderRankingCard />
                        </GlassCard>
                    </div>
                </div>

            </div>
            </SciFiDashboardChrome>
        </div>
        </DashboardSciFiVisualProvider>
    );
}