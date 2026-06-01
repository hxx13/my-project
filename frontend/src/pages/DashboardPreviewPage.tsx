import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { GlassCard } from "@/components/ui/GlassCard";
import { TimelineWaterfall } from "@/features/realtime-stream/TimelineWaterfall";
import { NestedPieChart } from "@/features/dashboard/NestedPieChart";
import { MonthlyRankCarousel } from "@/features/dashboard/MonthlyRankCarousel";
import { AnimalOrderRankingCard } from "@/features/dashboard/AnimalOrderRankingCard";
import { RetentionRadarStream } from "@/features/realtime-stream/RetentionRadarStream";
import { HubPeakLineChart } from "@/features/dashboard/HubPeakLineChart";
import { RuleCodexCard } from "@/features/dashboard/RuleCodexCard";
import { useQuery } from "@tanstack/react-query";
import { fetchLineChartData } from "@/api/twinApi";
import type { LineStats } from "@/api/twinApi";
import { useTwinChromeTheme } from "@/features/twin-chrome/TwinChromeThemeContext";
import { SciFiDashboardChrome } from "@/features/dashboard-scifi-theme/SciFiDashboardChrome";
import { DashboardSciFiVisualProvider } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";
import { ArrowLeft, Columns, ScrollText } from "lucide-react";

/* ================================================================== */
/*  ScrollReveal                                                      */
/* ================================================================== */

function ScrollReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          gsap.fromTo(entry.target, { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", clearProps: "transform,opacity" });
          obs.unobserve(entry.target);
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}

/* ================================================================== */
/*  Section Header                                                    */
/* ================================================================== */

function SectionHeader({ badge, title, subtitle }: { badge: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500/70 mb-1.5">{badge}</span>
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-500 max-w-xl">{subtitle}</p>}
    </div>
  );
}

/* ================================================================== */
/*  Hero Metric                                                       */
/* ================================================================== */

function HeroMetric({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div className="text-center px-6 py-4 rounded-2xl bg-white/60 backdrop-blur border border-white/50 shadow-sm">
      <div className="text-3xl font-bold tracking-tight" style={{ color: accent ?? "#0f172a" }}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}

/* ================================================================== */
/*  Carousel Dots                                                     */
/* ================================================================== */

function CarouselDots({ total, active, onDot }: { total: number; active: number; onDot: (i: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => onDot(i)}
          className={`rounded-full transition-all duration-300 ${i === active ? "w-6 h-2 bg-indigo-500" : "w-2 h-2 bg-slate-300 hover:bg-slate-400"}`}
          aria-label={`Slide ${i + 1}`}
        />
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Page                                                              */
/* ================================================================== */

export default function DashboardPreviewPage() {
  const navigate = useNavigate();
  const sciFiTheme = useTwinChromeTheme();
  const [mode, setMode] = useState<"scroll" | "carousel">("scroll");
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<"浦东" | "浦西">("浦东");
  const heroRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const { data: lineChartData, isLoading: isLineChartLoading } = useQuery({
    queryKey: ["hubLineChart"],
    queryFn: fetchLineChartData,
    refetchInterval: 1000 * 60 * 5,
  });

  useGSAP(() => {
    if (!heroRef.current) return;
    gsap.fromTo(heroRef.current.querySelectorAll(".hero-item"),
      { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: "power3.out" });
  }, { scope: heroRef });

  // Carousel slide animation
  useGSAP(() => {
    if (!carouselRef.current || mode !== "carousel") return;
    gsap.fromTo(carouselRef.current, { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.5, ease: "power2.out" });
  }, { dependencies: [carouselIdx, mode], scope: carouselRef });

  const totalSlides = 3;
  const sciFiOn = sciFiTheme.enabled;

  const renderSlide = (idx: number) => {
    switch (idx) {
      case 0: return <SlideRealtime activeTab={activeTab} setActiveTab={setActiveTab} />;
      case 1: return <SlideAnalytics lineChartData={lineChartData} isLineChartLoading={isLineChartLoading} />;
      case 2: return <SlideRankings />;
      default: return null;
    }
  };

  return (
    <DashboardSciFiVisualProvider value={sciFiOn}>
    <div className="min-h-screen bg-[#f8f9fa] text-slate-800 font-sans">
      <SciFiDashboardChrome enabled={sciFiOn}>

        {/* ---- Floating toolbar ---- */}
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <button onClick={() => navigate("/")}
            className="flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur border border-slate-200 px-3 py-1.5 text-xs text-slate-600 shadow-sm hover:bg-white transition-colors">
            <ArrowLeft className="size-3" /> 返回
          </button>
          <button onClick={() => setMode(mode === "scroll" ? "carousel" : "scroll")}
            className="flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur border border-slate-200 px-3 py-1.5 text-xs text-slate-600 shadow-sm hover:bg-white transition-colors"
            title={mode === "scroll" ? "切换到轮播" : "切换到滚动"}>
            {mode === "scroll" ? <Columns className="size-3" /> : <ScrollText className="size-3" />}
            {mode === "scroll" ? "轮播" : "滚动"}
          </button>
        </div>

        {/* ---- HERO ---- */}
        <section ref={heroRef} className="pt-16 pb-10 text-center relative overflow-hidden" style={{ background: "linear-gradient(180deg, #fff 0%, #eef2ff 60%, #f8f9fa 100%)" }}>
          <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-blue-100/40 blur-[120px] -translate-y-1/3 translate-x-1/4 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-violet-100/30 blur-[100px] translate-y-1/3 -translate-x-1/4 pointer-events-none" />
          <div className="relative z-10 max-w-[1200px] mx-auto px-6">
            <div className="hero-item">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500/70">Digital Twin · Preview</span>
            </div>
            <h1 className="hero-item text-3xl sm:text-4xl font-bold text-slate-900 mt-3">实验动物科学部</h1>
            <p className="hero-item text-base text-slate-500 mt-2">数字孪生监控中心 · 全新布局预览</p>
            <div className="hero-item mt-8 flex flex-wrap items-center justify-center gap-3">
              <HeroMetric value="128" label="当前在室" accent="#2563eb" />
              <HeroMetric value="1,247" label="今日进出" accent="#16a34a" />
              <HeroMetric value="42" label="活跃房间" accent="#7c3aed" />
              <HeroMetric value="98.5%" label="在线率" accent="#ea580c" />
            </div>
          </div>
        </section>

        {/* ---- CONTENT ---- */}
        {mode === "scroll" ? (
          /* ===== SCROLL MODE ===== */
          <div className="max-w-[1400px] mx-auto px-6 sm:px-10 pb-16 space-y-16">
            <ScrollReveal>
              <SectionHeader badge="Real-time" title="实时动态" subtitle="即时的门禁活动与人员留存态势" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard blobColor="rgba(52,199,89,0.2)" className="min-h-[420px]"><TimelineWaterfall /></GlassCard>
                <GlassCard blobColor="rgba(255,59,48,0.15)" className="min-h-[420px]"><RetentionRadarStream activeTab={activeTab} setActiveTab={setActiveTab} /></GlassCard>
              </div>
            </ScrollReveal>

            <ScrollReveal>
              <SectionHeader badge="Analytics" title="数据洞察" subtitle="进出高峰趋势与多维分析" />
              <GlassCard blobColor="rgba(66,165,245,0.15)" className="min-h-[360px] mb-6">
                {isLineChartLoading ? <div className="h-full flex items-center justify-center text-blue-500 animate-pulse">🌐 加载中...</div>
                 : lineChartData ? <HubPeakLineChart data={lineChartData as LineStats} />
                 : <div className="h-full flex items-center justify-center text-slate-400">暂无数据</div>}
              </GlassCard>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <GlassCard blobColor="rgba(45,92,247,0.15)" className="min-h-[320px]"><NestedPieChart /></GlassCard>
                <GlassCard blobColor="rgba(244,63,94,0.15)" className="min-h-[320px]"><RuleCodexCard /></GlassCard>
                <GlassCard blobColor="rgba(191,90,242,0.15)" className="min-h-[320px]"><MonthlyRankCarousel /></GlassCard>
              </div>
            </ScrollReveal>

            <ScrollReveal>
              <SectionHeader badge="Rankings" title="排行榜 & 订单" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard blobColor="rgba(255,59,48,0.1)" className="min-h-[380px]"><AnimalOrderRankingCard /></GlassCard>
                <GlassCard blobColor="rgba(100,116,139,0.1)" className="min-h-[380px] flex items-center justify-center">
                  <div className="text-center text-slate-400"><div className="text-3xl mb-2">📊</div><p className="text-sm">扩展数据看板</p></div>
                </GlassCard>
              </div>
            </ScrollReveal>
          </div>
        ) : (
          /* ===== CAROUSEL MODE ===== */
          <div className="max-w-[1400px] mx-auto px-6 sm:px-10 pb-4">
            <CarouselDots total={totalSlides} active={carouselIdx} onDot={setCarouselIdx} />
            <div ref={carouselRef} className="min-h-[60vh]">
              {renderSlide(carouselIdx)}
            </div>
            <div className="flex items-center justify-between mt-4">
              <button onClick={() => setCarouselIdx(i => Math.max(0, i - 1))} disabled={carouselIdx === 0}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 bg-white disabled:opacity-30 hover:bg-slate-50 transition-colors">← 上一页</button>
              <span className="text-xs text-slate-400">{carouselIdx + 1} / {totalSlides}</span>
              <button onClick={() => setCarouselIdx(i => Math.min(totalSlides - 1, i + 1))} disabled={carouselIdx === totalSlides - 1}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 bg-white disabled:opacity-30 hover:bg-slate-50 transition-colors">下一页 →</button>
            </div>
          </div>
        )}

        <div className="text-center pb-10 text-xs text-slate-400 border-t border-slate-200 pt-8 mt-8">
          Dashboard Preview · 按右下角「滚动/轮播」切换视图
        </div>
      </SciFiDashboardChrome>
    </div>
    </DashboardSciFiVisualProvider>
  );
}

/* ================================================================== */
/*  Carousel Slides                                                    */
/* ================================================================== */

function SlideRealtime({ activeTab, setActiveTab }: { activeTab: "浦东" | "浦西"; setActiveTab: (t: "浦东" | "浦西") => void }) {
  return (
    <div>
      <SectionHeader badge="1/3 · Real-time" title="实时动态" subtitle="即时的门禁活动与人员留存态势" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard blobColor="rgba(52,199,89,0.2)" className="min-h-[480px]"><TimelineWaterfall /></GlassCard>
        <GlassCard blobColor="rgba(255,59,48,0.15)" className="min-h-[480px]"><RetentionRadarStream activeTab={activeTab} setActiveTab={setActiveTab} /></GlassCard>
      </div>
    </div>
  );
}

function SlideAnalytics({ lineChartData, isLineChartLoading }: { lineChartData: unknown; isLineChartLoading: boolean }) {
  return (
    <div>
      <SectionHeader badge="2/3 · Analytics" title="数据洞察" subtitle="进出高峰趋势与多维行为分析" />
      <GlassCard blobColor="rgba(66,165,245,0.15)" className="min-h-[380px] mb-6">
        {isLineChartLoading ? <div className="h-full flex items-center justify-center text-blue-500 animate-pulse">🌐 加载中...</div>
         : lineChartData ? <HubPeakLineChart data={lineChartData as LineStats} />
         : <div className="h-full flex items-center justify-center text-slate-400">暂无数据</div>}
      </GlassCard>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard blobColor="rgba(45,92,247,0.15)" className="min-h-[300px]"><NestedPieChart /></GlassCard>
        <GlassCard blobColor="rgba(244,63,94,0.15)" className="min-h-[300px]"><RuleCodexCard /></GlassCard>
        <GlassCard blobColor="rgba(191,90,242,0.15)" className="min-h-[300px]"><MonthlyRankCarousel /></GlassCard>
      </div>
    </div>
  );
}

function SlideRankings() {
  return (
    <div>
      <SectionHeader badge="3/3 · Rankings" title="排行榜 & 动物订单" subtitle="月度排名与动物订购综合看板" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard blobColor="rgba(255,59,48,0.1)" className="min-h-[460px]"><AnimalOrderRankingCard /></GlassCard>
        <GlassCard blobColor="rgba(100,116,139,0.1)" className="min-h-[460px] flex items-center justify-center">
          <div className="text-center text-slate-400"><div className="text-3xl mb-2">📊</div><p>预留扩展</p></div>
        </GlassCard>
      </div>
    </div>
  );
}
