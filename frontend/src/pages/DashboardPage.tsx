import { useRef, useMemo } from "react";
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useEventStore } from '@/store/useEventStore';
import type { UniversalEvent } from '@/store/useEventStore';
import { GlassCard } from '@/components/ui/GlassCard';
import { fetchLineChartData } from '@/api/twinApi';
import type { LineStats } from '@/api/twinApi';
import { HubPeakLineChart } from '@/features/dashboard/HubPeakLineChart';
import { TimelineWaterfall } from '@/features/realtime-stream/TimelineWaterfall';
import { NestedPieChart } from '@/features/dashboard/NestedPieChart';
import { UnifiedRankingCard } from '@/features/dashboard/UnifiedRankingCard';
import { DashboardHeatmapChart } from '@/features/dashboard/DashboardHeatmapChart';
import { RoomPreferenceChart } from '@/features/dashboard/RoomPreferenceChart';
import { fetchStudentActivityHeatmap, fetchStudentActivityRoomUsage } from '@/api/domains/analytics.api';
import type { HeatmapCell, RoomUsageItem } from '@/api/domains/analytics.api';
import { RetentionRadarStream } from '@/features/realtime-stream/RetentionRadarStream';
import { RuleCodexCard } from '@/features/dashboard/RuleCodexCard';
import { SciFiDashboardChrome } from '@/features/dashboard-scifi-theme/SciFiDashboardChrome';
import { DashboardSciFiVisualProvider } from '@/features/dashboard-scifi-theme/DashboardSciFiVisualContext';
import { useTwinChromeTheme } from '@/features/twin-chrome/TwinChromeThemeContext';

export default function DashboardPage() {
    useEventStore((state) => state.setInitialFeed);
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

    // 本周起止时间
    const thisWeekRange = useMemo(() => {
      const now = new Date();
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      const fmt = (d: Date) => {
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, "0");
        const da = String(d.getDate()).padStart(2, "0");
        const h = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");
        const s = String(d.getSeconds()).padStart(2, "0");
        return `${y}-${mo}-${da} ${h}:${mi}:${s}`;
      };
      return { startTime: fmt(monday), endTime: fmt(sunday) };
    }, []);

    // ---- 实时 WebSocket 事件 ----
    const realtimeEvents = useEventStore((s) => s.realtimeEvents);

    // 最新进入的人的课题组（直接计算，放在查询之前避免 TDZ）
    const activeGroup = useMemo(() => {
      const now = new Date();
      const d = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (d === 0 ? 6 : d - 1));
      monday.setHours(0, 0, 0, 0);

      const latestEnter = realtimeEvents.find((evt) => {
        if (evt.action !== "ENTER") return false;
        return new Date(evt.timestamp) >= monday;
      });
      return latestEnter?.person?.group ?? "";
    }, [realtimeEvents]);

    const { data: heatmapData, isLoading: isHeatmapLoading } = useQuery({
        queryKey: ["dashboard", "heatmap", activeGroup, thisWeekRange.startTime, thisWeekRange.endTime],
        queryFn: () => fetchStudentActivityHeatmap({
            groupName: activeGroup,
            startTime: thisWeekRange.startTime,
            endTime: thisWeekRange.endTime,
        }),
        refetchInterval: 300_000,
    });

    const { data: roomUsageData, isLoading: isRoomLoading } = useQuery({
        queryKey: ["dashboard", "roomUsage", activeGroup, thisWeekRange.startTime, thisWeekRange.endTime],
        queryFn: () => fetchStudentActivityRoomUsage({
            groupName: activeGroup,
            startTime: thisWeekRange.startTime,
            endTime: thisWeekRange.endTime,
        }),
        refetchInterval: 300_000,
    });

    // 本周一的 Date 对象（用于过滤本周事件）
    const thisMonday = useMemo(() => {
      const now = new Date();
      const d = now.getDay();
      const m = new Date(now);
      m.setDate(now.getDate() - (d === 0 ? 6 : d - 1));
      m.setHours(0, 0, 0, 0);
      return m;
    }, []);

    // 从实时事件中提取本周 ENTER 事件
    const liveEntries = useMemo<UniversalEvent[]>(() => {
      return realtimeEvents.filter((evt) => {
        if (evt.action !== "ENTER") return false;
        const ts = new Date(evt.timestamp);
        return ts >= thisMonday;
      });
    }, [realtimeEvents, thisMonday]);

    // activeGroup 已在上方定义，此处不再重复

    // 滤出 activeGroup 的实时 ENTER 事件（只统计同一课题组）
    const groupLiveEntries = useMemo<UniversalEvent[]>(() => {
      if (!activeGroup) return [];
      return liveEntries.filter((evt) => evt.person?.group === activeGroup);
    }, [liveEntries, activeGroup]);

    // 合并：API 热力图数据（已按 activeGroup 查） + activeGroup 实时增量
    const mergedHeatmap = useMemo<HeatmapCell[]>(() => {
      const base = heatmapData ?? [];
      if (groupLiveEntries.length === 0) return base;

      const map = new Map<string, HeatmapCell>();
      for (const cell of base) {
        map.set(`${cell.dayOfWeek}-${cell.hour}`, { ...cell });
      }

      for (const evt of groupLiveEntries) {
        const ts = new Date(evt.timestamp);
        const dayOfWeek = ts.getDay();
        const hour = ts.getHours();
        if (hour < 7 || hour > 20) continue;
        const key = `${dayOfWeek}-${hour}`;
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(key, { dayOfWeek, hour, count: 1 });
        }
      }

      return Array.from(map.values());
    }, [heatmapData, groupLiveEntries]);

    // 合并：API 房间偏好数据（已按 activeGroup 查） + activeGroup 实时增量
    const mergedRoomUsage = useMemo<RoomUsageItem[]>(() => {
      const base = roomUsageData ?? [];
      if (groupLiveEntries.length === 0) return base;

      const map = new Map<string, RoomUsageItem>();
      for (const item of base) {
        map.set(item.roomName, { ...item });
      }

      for (const evt of groupLiveEntries) {
        const room = evt.location?.room;
        if (!room) continue;
        const existing = map.get(room);
        if (existing) {
          existing.entryCount += 1;
        } else {
          map.set(room, { roomName: room, entryCount: 1 });
        }
      }

      return Array.from(map.values());
    }, [roomUsageData, groupLiveEntries]);

    return (
        <>
        <style>{`
          @keyframes shimmer-bg {
            0% { background-position: -200% center; }
            100% { background-position: 200% center; }
          }
          @keyframes arrowBounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-2px); }
          }
          @keyframes glowPulse {
            0%, 100% { box-shadow: 0 0 8px rgba(251,191,36,0.3), 0 0 20px rgba(251,191,36,0.1); }
            50% { box-shadow: 0 0 16px rgba(251,191,36,0.5), 0 0 36px rgba(251,191,36,0.2); }
          }
          @keyframes silverPulse {
            0%, 100% { box-shadow: 0 0 6px rgba(148,163,184,0.25); }
            50% { box-shadow: 0 0 12px rgba(148,163,184,0.4); }
          }
          @keyframes bronzePulse {
            0%, 100% { box-shadow: 0 0 5px rgba(249,115,22,0.2); }
            50% { box-shadow: 0 0 10px rgba(249,115,22,0.35); }
          }
          @keyframes cellBreathe {
            0%, 100% { filter: brightness(1); }
            50% { filter: brightness(1.15); }
          }
        `}</style>
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
                    <div className="flex min-h-0 flex-[6] dash-card">
                        <GlassCard blobColor="rgba(191,90,242,0.3)">
                            <UnifiedRankingCard />
                        </GlassCard>
                    </div>
                    <div className="flex min-h-0 flex-[2] dash-card">
                        <GlassCard blobColor="rgba(124,58,237,0.15)">
                            <DashboardHeatmapChart
                                data={mergedHeatmap}
                                loading={isHeatmapLoading}
                            />
                        </GlassCard>
                    </div>
                    <div className="flex min-h-0 flex-[2] dash-card">
                        <GlassCard blobColor="rgba(236,72,153,0.12)">
                            <RoomPreferenceChart
                                data={mergedRoomUsage}
                                loading={isRoomLoading}
                            />
                        </GlassCard>
                    </div>
                </div>

            </div>
            </SciFiDashboardChrome>
        </div>
        </DashboardSciFiVisualProvider>
        </>
    );
}