import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
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
import { ArrowLeft, Columns, ScrollText } from "lucide-react";

/* ================================================================== */
/*  Retro-Futuristic design tokens                                     */
/* ================================================================== */

const TOKENS = {
  bg:      "#0A0014",
  surface: "rgba(0,255,65,0.03)",
  border:  "rgba(0,255,65,0.15)",
  borderH: "rgba(0,255,65,0.3)",
  text:    "rgba(0,255,65,0.85)",
  mute:    "rgba(0,255,65,0.35)",
  accent:  "#00FF41",
  accent2: "#FFB000",
  glow:    "0 0 12px rgba(0,255,65,0.25)",
} as const;

const s = TOKENS;

/* ---- CRT scanline overlay (global) ---- */
const SCANLINES = `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)`;

/* ================================================================== */
/*  Components                                                         */
/* ================================================================== */

/** Section divider with phosphor dot + label */
function SectionBar({ n, title }: { n: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.accent, boxShadow: s.glow }} />
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", color: s.mute, textTransform: "uppercase" }}>{n}</span>
      <span style={{ flex: 1, height: 1, background: s.border }} />
      <span style={{ fontSize: 16, fontWeight: 700, color: s.text }}>{title}</span>
    </div>
  );
}

/** Phosphor-bordered container for a widget */
function Pod({ h, children }: { h: number; children: React.ReactNode }) {
  return (
    <div style={{
      height: h, borderRadius: 2, border: `1px solid ${s.border}`, background: s.surface,
      overflow: "hidden", position: "relative",
    }}>
      {children}
    </div>
  );
}

/** Hero stat number with glow */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: "center", padding: "16px 24px", borderRadius: 2, border: `1px solid ${s.border}`, background: s.surface }}>
      <div style={{ fontFamily: "monospace", fontSize: "clamp(20px,2.5vw,28px)", fontWeight: 700, color: s.accent, textShadow: s.glow }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: s.mute, marginTop: 4 }}>{label}</div>
    </div>
  );
}

/** Toolbar button */
function Tb({ onClick, children, style }: { onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 2,
      border: `1px solid ${s.border}`, background: s.surface, color: s.text, fontSize: 11,
      cursor: "pointer", fontFamily: "monospace", ...style,
    }}>
      {children}
    </button>
  );
}

/** Scroll-triggered reveal */
function ScrollReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) { gsap.fromTo(el, { opacity: 0, y: 32 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", clearProps: "transform,opacity" }); obs.unobserve(el); }
      },
      { threshold: 0.05, rootMargin: "0px 0px -20px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}

function CarouselDots({ total, active, onDot }: { total: number; active: number; onDot: (i: number) => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "8px 0 24px" }}>
      {Array.from({ length: total }).map((_, i) => (
        <button key={i} onClick={() => onDot(i)} style={{
          width: i === active ? 24 : 8, height: 8, borderRadius: 999,
          background: i === active ? s.accent : s.borderH, border: "none", cursor: "pointer", transition: "all 0.3s",
          boxShadow: i === active ? s.glow : "none",
        }} />
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Page                                                              */
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
    queryKey: ["hubLineChart"], queryFn: fetchLineChartData, refetchInterval: 1000 * 60 * 5,
  });

  /* Hero entrance */
  useGSAP(() => {
    if (!heroRef.current) return;
    const tl = gsap.timeline();
    tl.fromTo(heroRef.current.querySelectorAll(".h-word"), { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.12, ease: "power3.out" })
      .fromTo(heroRef.current.querySelectorAll(".h-stat"), { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, stagger: 0.08, ease: "back.out(1.6)" }, "-=0.2");
  }, { scope: heroRef });

  /* Carousel slide */
  useGSAP(() => {
    if (!carouselRef.current || mode !== "carousel") return;
    gsap.fromTo(carouselRef.current, { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.4, ease: "power2.out" });
  }, { dependencies: [slide, mode], scope: carouselRef });

  /* ---- Widget cards ---- */

  const timeline = <Pod h={460}><TimelineWaterfall /></Pod>;
  const radar    = <Pod h={460}><RetentionRadarStream activeTab={tab} setActiveTab={setTab} /></Pod>;
  const chart    = <Pod h={400}>{lineLoading ? <C>加载中…</C> : lineChartData ? <HubPeakLineChart data={lineChartData as LineStats} /> : <C>暂无高峰数据</C>}</Pod>;
  const pie      = <Pod h={340}><NestedPieChart /></Pod>;
  const codex    = <Pod h={340}><RuleCodexCard /></Pod>;
  const rank     = <Pod h={340}><MonthlyRankCarousel /></Pod>;
  const order    = <Pod h={400}><AnimalOrderRankingCard /></Pod>;
  const future   = <Pod h={400}><C>扩展数据看板 · 即将接入</C></Pod>;

  /* ---- Layout sections ---- */

  const Sec1 = (
    <div>
      <SectionBar n="01 · 实时监控" title="实时动态" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 20 }}>{timeline}{radar}</div>
    </div>
  );

  const Sec2 = (
    <div>
      <SectionBar n="02 · 数据洞察" title="数据洞察" />
      {chart}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginTop: 20 }}>{pie}{codex}{rank}</div>
    </div>
  );

  const Sec3 = (
    <div>
      <SectionBar n="03 · 综合看板" title="综合看板" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 20 }}>{order}{future}</div>
    </div>
  );

  /* ================================================================ */

  return (
    <DashboardSciFiVisualProvider value={sciFi.enabled}>
    <SciFiDashboardChrome enabled={sciFi.enabled}>
    <div style={{
      minHeight: "100vh", background: s.bg, color: s.text, fontFamily: "system-ui, sans-serif",
      position: "relative", overflowX: "hidden",
    }}>
      {/* Scanline texture */}
      <div style={{ position: "fixed", inset: 0, background: SCANLINES, pointerEvents: "none", zIndex: 9999, opacity: 0.6 }} />

      {/* Toolbar */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 100, display: "flex", gap: 8 }}>
        <Tb onClick={() => navigate("/")}><ArrowLeft size={14} /> 返回</Tb>
        <Tb onClick={() => setMode(m => m === "scroll" ? "carousel" : "scroll")}>
          {mode === "scroll" ? <Columns size={14} /> : <ScrollText size={14} />}
          {mode === "scroll" ? "轮播" : "滚动"}
        </Tb>
      </div>

      {/* Hero */}
      <section ref={heroRef} style={{ padding: "80px 24px 56px", textAlign: "center", position: "relative" }}>
        <p className="h-word" style={{ fontSize: 12, letterSpacing: "0.22em", color: s.mute, margin: "0 0 12px", textTransform: "uppercase" }}>
          数字孪生 · 实时监控中心
        </p>
        <h1 className="h-word" style={{
          fontSize: "clamp(32px,4.5vw,48px)", fontWeight: 800, color: s.accent, margin: "0 0 8px",
          textShadow: `2px 0 ${s.accent2}, -2px 0 ${s.accent}`, lineHeight: 1.15,
        }}>
          实验动物科学部
        </h1>
        <p className="h-word" style={{ fontSize: 14, color: s.mute, margin: "0 0 36px" }}>
          Retro-Futuristic 终端 · 仪表盘预览
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
          <div className="h-stat"><Stat value="128" label="当前在室" /></div>
          <div className="h-stat"><Stat value="1,247" label="今日进出" /></div>
          <div className="h-stat"><Stat value="42" label="活跃房间" /></div>
          <div className="h-stat"><Stat value="98.5%" label="系统在线率" /></div>
        </div>
      </section>

      {/* Scroll mode */}
      {mode === "scroll" && (
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px 100px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 72 }}>
            <ScrollReveal>{Sec1}</ScrollReveal>
            <ScrollReveal>{Sec2}</ScrollReveal>
            <ScrollReveal>{Sec3}</ScrollReveal>
          </div>
        </div>
      )}

      {/* Carousel mode */}
      {mode === "carousel" && (
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px 80px" }}>
          <CarouselDots total={3} active={slide} onDot={setSlide} />
          <div ref={carouselRef}>
            {slide === 0 && Sec1}
            {slide === 1 && Sec2}
            {slide === 2 && Sec3}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
            <Tb onClick={() => setSlide(s => Math.max(0, s - 1))} style={{ opacity: slide === 0 ? 0.2 : 1 }}>← 上一页</Tb>
            <span style={{ fontSize: 11, color: s.mute, lineHeight: "32px", fontFamily: "monospace" }}>{slide + 1}/3</span>
            <Tb onClick={() => setSlide(s => Math.min(2, s + 1))} style={{ opacity: slide === 2 ? 0.2 : 1 }}>下一页 →</Tb>
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", padding: "28px 0", borderTop: `1px solid ${s.border}`, fontSize: 11, color: s.mute, fontFamily: "monospace" }}>
        RETRO-FUTURISTIC · DIGITAL TWIN · DASHBOARD PREVIEW
      </div>
    </div>
    </SciFiDashboardChrome>
    </DashboardSciFiVisualProvider>
  );
}

function C({ children }: { children: React.ReactNode }) {
  return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: TOKENS.mute }}>{children}</div>;
}
