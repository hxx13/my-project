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
import { useEventStore } from "@/store/useEventStore";
import { useQuery } from "@tanstack/react-query";
import { fetchLineChartData } from "@/api/twinApi";
import type { LineStats } from "@/api/twinApi";
import { ArrowLeft, Columns, ScrollText } from "lucide-react";
import { DashboardSciFiVisualProvider } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";
import { SciFiDashboardChrome } from "@/features/dashboard-scifi-theme/SciFiDashboardChrome";
import { useTwinChromeTheme } from "@/features/twin-chrome/TwinChromeThemeContext";

/* ================================================================== */

function ScrollReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          gsap.fromTo(el, { opacity: 0, y: 32 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", clearProps: "transform,opacity" });
          obs.unobserve(el);
        }
      },
      { threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}

const sectionBadge = (n: string) => (
  <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--twin-mute)] mb-2">{n}</span>
);

/* ================================================================== */

export default function DashboardPreviewPage() {
  useEventStore((s) => s.setInitialFeed);
  const sciFi = useTwinChromeTheme();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"scroll" | "carousel">("scroll");
  const [slide, setSlide] = useState(0);
  const [tab, setTab] = useState<"浦东" | "浦西">("浦东");
  const heroRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const { data: lineChartData, isLoading: lineLoading } = useQuery({
    queryKey: ["hubLineChart"],
    queryFn: fetchLineChartData,
    refetchInterval: 1000 * 60 * 5,
  });

  useGSAP(() => {
    if (!heroRef.current) return;
    gsap.fromTo(heroRef.current.querySelectorAll(".hero-item"),
      { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: "power3.out" });
  }, { scope: heroRef });

  useGSAP(() => {
    if (!carouselRef.current || mode !== "carousel") return;
    gsap.fromTo(carouselRef.current, { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.4, ease: "power2.out" });
  }, { dependencies: [slide, mode], scope: carouselRef });

  /* ---- cards ---- */

  const Card = ({ blob, h, children }: { blob: string; h: number; children: React.ReactNode }) => (
    <div style={{ height: h }}>
      <GlassCard blobColor={blob}>{children}</GlassCard>
    </div>
  );

  const timelineCard  = <Card blob="rgba(52,199,89,0.2)"  h={500}><TimelineWaterfall /></Card>;
  const radarCard     = <Card blob="rgba(255,59,48,0.15)" h={500}><RetentionRadarStream activeTab={tab} setActiveTab={setTab} /></Card>;
  const chartCard     = <Card blob="rgba(66,165,245,0.15)" h={380}>
    {lineLoading ? <Centered>加载中…</Centered> : lineChartData ? <HubPeakLineChart data={lineChartData as LineStats} /> : <Centered>暂无高峰数据</Centered>}
  </Card>;
  const pieCard       = <Card blob="rgba(45,92,247,0.15)" h={340}><NestedPieChart /></Card>;
  const codexCard     = <Card blob="rgba(244,63,94,0.15)" h={340}><RuleCodexCard /></Card>;
  const rankCard      = <Card blob="rgba(191,90,242,0.15)" h={340}><MonthlyRankCarousel /></Card>;
  const orderCard     = <Card blob="rgba(255,59,48,0.1)"  h={400}><AnimalOrderRankingCard /></Card>;
  const placeholder   = (
    <Card blob="rgba(100,116,139,0.06)" h={400}>
      <div className="flex items-center justify-center h-full"><span className="text-sm text-[var(--twin-mute)]">预留扩展区域</span></div>
    </Card>
  );

  /* ---- render ---- */

  return (
    <DashboardSciFiVisualProvider value={sciFi.enabled}>
    <SciFiDashboardChrome enabled={sciFi.enabled}>
    <div className="min-h-full font-sans text-[var(--twin-ink)]" style={{ background: "linear-gradient(180deg, #fff 0%, #eef2ff 50%, var(--twin-canvas-soft, #f5f5f5) 100%)" }}>

      {/* ---- Toolbar ---- */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => navigate("/")} className="flex items-center gap-1.5 rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-xs text-[var(--twin-body)] shadow-sm hover:bg-[var(--twin-canvas-soft)] transition-colors">
          <ArrowLeft size={14} /> 返回
        </button>
        <button onClick={() => setMode(m => m === "scroll" ? "carousel" : "scroll")} className="flex items-center gap-1.5 rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-xs text-[var(--twin-body)] shadow-sm hover:bg-[var(--twin-canvas-soft)] transition-colors">
          {mode === "scroll" ? <Columns size={14} /> : <ScrollText size={14} />}
          {mode === "scroll" ? "轮播" : "滚动"}
        </button>
      </div>

      {/* ---- 头部 ---- */}
      <section ref={heroRef} className="pt-16 pb-10 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-blue-100/30 blur-[100px] -translate-y-1/3 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-violet-100/25 blur-[90px] translate-y-1/3 -translate-x-1/4 pointer-events-none" />
        <div className="relative z-10 max-w-[1400px] mx-auto px-6">
          <div className="hero-item"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--twin-mute)]">数字孪生 · 仪表盘预览</span></div>
          <h1 className="hero-item text-3xl sm:text-4xl font-bold mt-3">实验动物科学部</h1>
          <p className="hero-item text-sm text-[var(--twin-mute)] mt-2">全新多段布局预览 —— 滚动模式 / 轮播模式</p>
          <div className="hero-item mt-8 flex flex-wrap justify-center gap-3">
            {[
              { v: "128", l: "当前在室", c: "#2563eb" },
              { v: "1,247", l: "今日进出", c: "#16a34a" },
              { v: "42", l: "活跃房间", c: "#7c3aed" },
              { v: "98.5%", l: "系统在线率", c: "#ea580c" },
            ].map(m => (
              <div key={m.l} className="px-6 py-4 rounded-2xl bg-[var(--twin-canvas)]/70 backdrop-blur border border-[var(--twin-hairline)] shadow-sm text-center">
                <div className="text-3xl font-bold tracking-tight" style={{ color: m.c }}>{m.v}</div>
                <div className="mt-1 text-xs text-[var(--twin-mute)]">{m.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- 滚动模式 ---- */}
      {mode === "scroll" && (
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 pb-20">
          <div className="flex flex-col gap-20">

            <ScrollReveal>
              {sectionBadge("01 · 实时动态")}
              <h2 className="text-xl font-bold mb-1">实时动态</h2>
              <p className="text-sm text-[var(--twin-mute)] mb-5">门禁活动瀑布流与人员留存态势即时监控</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {timelineCard}
                {radarCard}
              </div>
            </ScrollReveal>

            <ScrollReveal>
              {sectionBadge("02 · 数据洞察")}
              <h2 className="text-xl font-bold mb-1">数据洞察</h2>
              <p className="text-sm text-[var(--twin-mute)] mb-5">进出高峰趋势、组织架构分析与智能规则法典</p>
              {chartCard}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                {pieCard}
                {codexCard}
                {rankCard}
              </div>
            </ScrollReveal>

            <ScrollReveal>
              {sectionBadge("03 · 排行榜")}
              <h2 className="text-xl font-bold mb-1">排行榜与订单</h2>
              <p className="text-sm text-[var(--twin-mute)] mb-5">月度排名轮播与动物订购综合看板</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {orderCard}
                {placeholder}
              </div>
            </ScrollReveal>

          </div>
        </div>
      )}

      {/* ---- 轮播模式 ---- */}
      {mode === "carousel" && (
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 pb-12">
          <div className="flex justify-center gap-2 py-2 mb-4">
            {[0, 1, 2].map(i => (
              <button key={i} onClick={() => setSlide(i)}
                className={`rounded-full transition-all duration-300 ${i === slide ? "w-6 h-2 bg-[var(--twin-ink)]" : "w-2 h-2 bg-[var(--twin-hairline)]"}`}
              />
            ))}
          </div>
          <div ref={carouselRef}>
            {slide === 0 && (
              <div>
                {sectionBadge("01 / 03 · 实时动态")}
                <h2 className="text-xl font-bold mb-5">实时动态</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{timelineCard}{radarCard}</div>
              </div>
            )}
            {slide === 1 && (
              <div>
                {sectionBadge("02 / 03 · 数据洞察")}
                <h2 className="text-xl font-bold mb-5">数据洞察</h2>
                {chartCard}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">{pieCard}{codexCard}{rankCard}</div>
              </div>
            )}
            {slide === 2 && (
              <div>
                {sectionBadge("03 / 03 · 排行榜")}
                <h2 className="text-xl font-bold mb-5">排行榜与订单</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{orderCard}{placeholder}</div>
              </div>
            )}
          </div>
          <div className="flex justify-between mt-6">
            <button onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0}
              className="px-4 py-2 text-sm rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] disabled:opacity-30 hover:bg-[var(--twin-canvas-soft)] transition-colors">
              ← 上一页
            </button>
            <span className="text-xs text-[var(--twin-mute)] leading-9">{slide + 1} / 3</span>
            <button onClick={() => setSlide(s => Math.min(2, s + 1))} disabled={slide === 2}
              className="px-4 py-2 text-sm rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] disabled:opacity-30 hover:bg-[var(--twin-canvas-soft)] transition-colors">
              下一页 →
            </button>
          </div>
        </div>
      )}

      {/* ---- 底部 ---- */}
      <div className="text-center py-8 border-t border-[var(--twin-hairline)] text-xs text-[var(--twin-mute)]">
        仪表盘预览 · 滚动 / 轮播双模式 · 右上角切换
      </div>
    </div>
    </SciFiDashboardChrome>
    </DashboardSciFiVisualProvider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center h-full text-sm text-[var(--twin-mute)]">{children}</div>;
}
