import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
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
    const navigate = useNavigate();
    const sciFiTheme = useTwinChromeTheme();
    const [activeTab, setActiveTab] = useState<'浦东' | '浦西'>('浦东');
    const dashRef = useRef<HTMLDivElement>(null);

    useGSAP(() => {
      if (!dashRef.current) return;
      gsap.fromTo(
        dashRef.current.querySelectorAll(".dash-card"),
        { opacity: 0, scale: 0.94, y: 24 },
        { opacity: 1, scale: 1, y: 0, duration: 0.55, stagger: 0.08, ease: "power3.out", clearProps: "transform,opacity" },
      );
    }, { scope: dashRef });

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
            <div ref={dashRef} className="w-full h-full min-h-0 grid grid-cols-[25fr,50fr,25fr] gap-[20px] relative z-10">

                {/* 左侧 25% */}
                {/* 💥 修复 2：疯狂扒掉所有的 overflow-hidden 紧箍咒！ */}
                <div className="flex min-h-0 flex-col gap-[15px]">
                    <div className="flex min-h-0 flex-[6] dash-card">
                        <GlassCard blobColor="rgba(52,199,89,0.3)">
                            <TimelineWaterfall />
                        </GlassCard>
                    </div>
                    <div className="flex min-h-0 flex-[4] dash-card">
                        <GlassCard blobColor="rgba(45,92,247,0.3)">
                            <NestedPieChart />
                        </GlassCard>
                    </div>
                </div>

                {/* 中间 50%：重构为上下结构，上左右双块，下曲线图 */}
                <div className="flex min-h-0 flex-col gap-[15px]">

                    {/* 上半部分：分为左右两块 */}
                    <div className="flex min-h-0 flex-[5] gap-[12px]">
                        <div className="flex min-h-0 min-w-0 flex-1 basis-0 dash-card">
                            <GlassCard blobColor="rgba(255,59,48,0.3)" compact>
                                <RetentionRadarStream activeTab={activeTab} setActiveTab={setActiveTab} />
                            </GlassCard>
                        </div>
                        <div className="flex min-h-0 min-w-0 flex-1 basis-0 dash-card">
                            {/* 💥 将霓虹法典直接嵌入光晕卡片中！ */}
                            <GlassCard blobColor="rgba(244,63,94,0.3)" compact>
                                <RuleCodexCard />
                            </GlassCard>
                        </div>
                    </div>

                    {/* 下半部分：进出高峰枢纽对比曲线图 */}
                    <div className="flex min-h-0 flex-[5] dash-card">
                        <GlassCard blobColor="rgba(66,165,245,0.3)">
                            {/* 💥 优雅的数据挂载 */}
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
                    <div className="flex min-h-0 flex-[5] dash-card">
                        <GlassCard blobColor="rgba(191,90,242,0.3)">
                            <MonthlyRankCarousel />
                        </GlassCard>
                    </div>
                    <div className="flex min-h-0 flex-[5] dash-card">
                        <GlassCard blobColor="rgba(255,59,48,0.3)">
                            <AnimalOrderRankingCard />
                        </GlassCard>
                    </div>
                </div>

            </div>
            {/* Floating preview entry */}
            <button
              onClick={() => navigate("/dashboard-preview")}
              title="仪表盘预览"
              className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full bg-white/70 backdrop-blur border border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm hover:bg-white hover:text-indigo-600 hover:border-indigo-300 transition-all opacity-40 hover:opacity-100"
            >
              <span className="text-base leading-none">🎨</span>
              预览
            </button>
            </SciFiDashboardChrome>
        </div>
        </DashboardSciFiVisualProvider>
    );
}