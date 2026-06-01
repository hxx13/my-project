import { useState } from "react";
import { TimelineWaterfall } from "@/features/realtime-stream/TimelineWaterfall";
import { NestedPieChart } from "@/features/dashboard/NestedPieChart";
import { MonthlyRankCarousel } from "@/features/dashboard/MonthlyRankCarousel";
import { AnimalOrderRankingCard } from "@/features/dashboard/AnimalOrderRankingCard";
import { RetentionRadarStream } from "@/features/realtime-stream/RetentionRadarStream";
import { HubPeakLineChart } from "@/features/dashboard/HubPeakLineChart";
import { RuleCodexCard } from "@/features/dashboard/RuleCodexCard";
import { useEventStore } from "@/store/useEventStore";
import { useQuery } from "@tanstack/react-query";
import { fetchLineChartData } from "@/api/twinApi";
import type { LineStats } from "@/api/twinApi";
import { DashboardSciFiVisualProvider } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";
import { SciFiDashboardChrome } from "@/features/dashboard-scifi-theme/SciFiDashboardChrome";
import { useTwinChromeTheme } from "@/features/twin-chrome/TwinChromeThemeContext";

/* ================================================================== */
/*  仪表盘预览 — 空白画布（保留所有数据模块）                           */
/*  可重新设计的 7 个数据 widget：                                      */
/*                                                                     */
/*  <TimelineWaterfall />         实时门禁进出记录流                    */
/*  <RetentionRadarStream />      人员留存态势（浦东/浦西）             */
/*  <HubPeakLineChart />          进出高峰曲线                          */
/*  <NestedPieChart />            组织架构饼图                          */
/*  <RuleCodexCard />             AI 智能规则                           */
/*  <MonthlyRankCarousel />       月度排名轮播                          */
/*  <AnimalOrderRankingCard />    动物订购看板                          */
/* ================================================================== */

export default function DashboardPreviewPage() {
  useEventStore((s) => s.setInitialFeed);
  const sciFi = useTwinChromeTheme();
  const [tab, setTab] = useState<"浦东" | "浦西">("浦东");

  const { data: lineChartData, isLoading: lineLoading } = useQuery({
    queryKey: ["hubLineChart"],
    queryFn: fetchLineChartData,
    refetchInterval: 1000 * 60 * 5,
  });

  if (lineLoading) return <div>加载中…</div>;

  return (
    <DashboardSciFiVisualProvider value={sciFi.enabled}>
    <SciFiDashboardChrome enabled={sciFi.enabled}>
    <div style={{ minHeight: "100vh", color: "var(--twin-ink)", fontFamily: "system-ui, sans-serif" }}>
      {/* ============================================================ */}
      {/*  在此区域自由设计布局                                          */}
      {/*  可用数据模块：                                               */}
      {/*                                                            */}
      {/*  <TimelineWaterfall />                                     */}
      {/*  <RetentionRadarStream activeTab={tab} setActiveTab={setTab} /> */}
      {/*  <HubPeakLineChart data={lineChartData as LineStats} />     */}
      {/*  <NestedPieChart />                                         */}
      {/*  <RuleCodexCard />                                          */}
      {/*  <MonthlyRankCarousel />                                    */}
      {/*  <AnimalOrderRankingCard />                                 */}
      {/* ============================================================ */}

      <TimelineWaterfall />
      <RetentionRadarStream activeTab={tab} setActiveTab={setTab} />
      {lineChartData && <HubPeakLineChart data={lineChartData as LineStats} />}
      <NestedPieChart />
      <RuleCodexCard />
      <MonthlyRankCarousel />
      <AnimalOrderRankingCard />

    </div>
    </SciFiDashboardChrome>
    </DashboardSciFiVisualProvider>
  );
}
