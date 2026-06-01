import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useEventStore } from "@/store/useEventStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { fetchLineChartData } from "@/api/twinApi";
import type { LineStats } from "@/api/twinApi";
import { HubPeakLineChart } from "@/features/dashboard/HubPeakLineChart";
import { TimelineWaterfall } from "@/features/realtime-stream/TimelineWaterfall";
import { NestedPieChart } from "@/features/dashboard/NestedPieChart";
import { MonthlyRankCarousel } from "@/features/dashboard/MonthlyRankCarousel";
import { AnimalOrderRankingCard } from "@/features/dashboard/AnimalOrderRankingCard.tsx";
import { RetentionRadarStream } from "@/features/realtime-stream/RetentionRadarStream";
import { RuleCodexCard } from "@/features/dashboard/RuleCodexCard";
import { SciFiDashboardChrome } from "@/features/dashboard-scifi-theme/SciFiDashboardChrome";
import { DashboardSciFiVisualProvider } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";
import { useTwinChromeTheme } from "@/features/twin-chrome/TwinChromeThemeContext";

/* ================================================================== */
/*  ScrollReveal — Intersection Observer + GSAP                       */
/* ================================================================== */

function ScrollReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          gsap.fromTo(el, { opacity: 0, y: 32 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", clearProps: "transform,opacity" });
          obs.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

/* ================================================================== */
/*  Hero Metric                                                       */
/* ================================================================== */

function HeroMetric({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div className="text-center px-6">
      <div className="text-4xl font-bold tracking-tight" style={{ color: accent ?? "var(--twin-ink)" }}>
        {value}
      </div>
      <div className="mt-1 text-sm text-[var(--twin-mute)]">{label}</div>
    </div>
  );
}

/* ================================================================== */
/*  Section Header                                                    */
/* ================================================================== */

function SectionHeader({ badge, title, subtitle }: { badge: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--twin-primary)]/60 mb-2">
        {badge}
      </span>
      <h2 className="text-xl font-bold text-[var(--twin-ink)]">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-[var(--twin-mute)] max-w-2xl">{subtitle}</p>}
    </div>
  );
}

/* ================================================================== */
/*  Dashboard Page                                                    */
/* ================================================================== */

export default function DashboardPage() {
  useEventStore((state) => state.setInitialFeed);
  const sciFiTheme = useTwinChromeTheme();
  const [activeTab, setActiveTab] = useState<"浦东" | "浦西">("浦东");
  const heroRef = useRef<HTMLDivElement>(null);

  const { data: lineChartData, isLoading: isLineChartLoading } = useQuery({
    queryKey: ["hubLineChart"],
    queryFn: fetchLineChartData,
    refetchInterval: 1000 * 60 * 5,
  });

  /* Hero entrance */
  useGSAP(() => {
    if (!heroRef.current) return;
    gsap.fromTo(
      heroRef.current.querySelectorAll(".hero-item"),
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 0.8, stagger: 0.12, ease: "power3.out" },
    );
  }, { scope: heroRef });

  const containerCls = sciFiTheme.enabled
    ? "w-full min-h-screen bg-transparent text-slate-800 font-sans box-border"
    : "w-full min-h-screen bg-[#f8f9fa] text-slate-800 font-sans box-border";

  const sectionSpacing = sciFiTheme.enabled ? "py-16" : "py-20";

  return (
    <DashboardSciFiVisualProvider value={sciFiTheme.enabled}>
      <div className={containerCls}>
        <SciFiDashboardChrome enabled={sciFiTheme.enabled}>

          {/* ================================================================ */}
          {/* HERO SECTION                                                     */}
          {/* ================================================================ */}
          <section
            ref={heroRef}
            className={`relative overflow-hidden ${sectionSpacing}`}
            style={sciFiTheme.enabled ? {} : {
              background: "linear-gradient(180deg, #ffffff 0%, #f0f4ff 40%, #f8f9fa 100%)",
            }}
          >
            {/* Decorative background */}
            {!sciFiTheme.enabled && (
              <>
                <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-blue-50/60 blur-[120px] -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-violet-50/40 blur-[100px] translate-y-1/3 -translate-x-1/4 pointer-events-none" />
              </>
            )}

            <div className="relative z-10 max-w-[1400px] mx-auto px-6 sm:px-10">
              {/* Title */}
              <div className="text-center mb-10 hero-item">
                <h1 className="text-3xl font-bold tracking-tight text-[var(--twin-ink)] sm:text-4xl">
                  实验动物科学部
                </h1>
                <p className="mt-2 text-base text-[var(--twin-mute)]">
                  数字孪生实时监控中心
                </p>
              </div>

              {/* Hero metrics */}
              <div className="flex flex-wrap items-center justify-center gap-4 hero-item">
                <div className="rounded-2xl bg-white/70 backdrop-blur border border-white/80 shadow-sm px-8 py-5">
                  <HeroMetric value="--" label="当前在室人数" accent="#2563eb" />
                </div>
                <div className="text-[var(--twin-hairline)] text-2xl font-thin hidden sm:block">|</div>
                <div className="rounded-2xl bg-white/70 backdrop-blur border border-white/80 shadow-sm px-8 py-5">
                  <HeroMetric value="--" label="今日进出记录" accent="#16a34a" />
                </div>
                <div className="text-[var(--twin-hairline)] text-2xl font-thin hidden sm:block">|</div>
                <div className="rounded-2xl bg-white/70 backdrop-blur border border-white/80 shadow-sm px-8 py-5">
                  <HeroMetric value="--" label="活跃房间数" accent="#7c3aed" />
                </div>
              </div>
            </div>
          </section>

          {/* ================================================================ */}
          {/* SECTION 1 — 实时动态  (full-bleed)                              */}
          {/* ================================================================ */}
          <ScrollReveal className="max-w-[1400px] mx-auto px-6 sm:px-10 pb-16">
            <SectionHeader
              badge="Real-time"
              title="实时动态"
              subtitle="进出瀑布流与留存雷达 —— 即时的门禁活动与人员留存态势"
            />
            <div className="grid grid-cols-1 lg:grid-cols-[1fr,1fr] gap-6">
              <GlassCard blobColor="rgba(52,199,89,0.25)" className="min-h-[420px]">
                <TimelineWaterfall />
              </GlassCard>
              <GlassCard blobColor="rgba(255,59,48,0.2)" className="min-h-[420px]">
                <RetentionRadarStream activeTab={activeTab} setActiveTab={setActiveTab} />
              </GlassCard>
            </div>
          </ScrollReveal>

          {/* ================================================================ */}
          {/* SECTION 2 — 数据洞察  (full-width chart + side panels)         */}
          {/* ================================================================ */}
          <ScrollReveal
            className="py-16"
            style={{ background: "linear-gradient(180deg, #f8f9fa 0%, #ffffff 50%, #f8f9fa 100%)" }}
          >
            <div className="max-w-[1400px] mx-auto px-6 sm:px-10">
              <SectionHeader
                badge="Analytics"
                title="数据洞察"
                subtitle="多维度行为分析：高峰趋势、排名、组织结构与智能规则"
              />

              {/* Full-width chart */}
              <GlassCard blobColor="rgba(66,165,245,0.2)" className="min-h-[360px] mb-6">
                {isLineChartLoading ? (
                  <div className="w-full h-full flex items-center justify-center text-blue-500 text-sm font-bold animate-pulse">
                    🌐 枢纽链路接通中...
                  </div>
                ) : lineChartData ? (
                  <HubPeakLineChart data={lineChartData as LineStats} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm font-bold">
                    暂无高峰数据
                  </div>
                )}
              </GlassCard>

              {/* Bottom row: 3 cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <GlassCard blobColor="rgba(45,92,247,0.2)" className="min-h-[340px]">
                  <NestedPieChart />
                </GlassCard>
                <GlassCard blobColor="rgba(244,63,94,0.2)" className="min-h-[340px]">
                  <RuleCodexCard />
                </GlassCard>
                <GlassCard blobColor="rgba(191,90,242,0.2)" className="min-h-[340px]">
                  <MonthlyRankCarousel />
                </GlassCard>
              </div>
            </div>
          </ScrollReveal>

          {/* ================================================================ */}
          {/* SECTION 3 — 排行榜与动物订单                                    */}
          {/* ================================================================ */}
          <ScrollReveal className="max-w-[1400px] mx-auto px-6 sm:px-10 pb-20">
            <SectionHeader
              badge="Rankings"
              title="排行榜 & 订单"
              subtitle="月度排名轮播与动物订购看板"
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <GlassCard blobColor="rgba(255,59,48,0.15)" className="min-h-[380px]">
                <AnimalOrderRankingCard />
              </GlassCard>
              {/* Placeholder for future content */}
              <div className="rounded-2xl border-2 border-dashed border-[var(--twin-hairline)] flex items-center justify-center min-h-[380px] bg-white/50">
                <div className="text-center text-[var(--twin-mute)]">
                  <div className="text-3xl mb-2">📊</div>
                  <p className="text-sm font-medium">更多数据看板</p>
                  <p className="text-xs mt-1">即将接入</p>
                </div>
              </div>
            </div>
          </ScrollReveal>

        </SciFiDashboardChrome>
      </div>
    </DashboardSciFiVisualProvider>
  );
}
