import { useRef, useState, useEffect, useCallback } from "react";
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
import { DashboardSciFiVisualProvider } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";
import { SciFiDashboardChrome } from "@/features/dashboard-scifi-theme/SciFiDashboardChrome";
import { useTwinChromeTheme } from "@/features/twin-chrome/TwinChromeThemeContext";
import { ArrowLeft, Columns, ScrollText } from "lucide-react";

/* ================================================================== */

function ScrollReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          gsap.fromTo(el, { opacity: 0, y: 48, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out", clearProps: "all" });
          obs.unobserve(el);
        }
      },
      { threshold: 0.06, rootMargin: "0px 0px -40px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

/* ================================================================== */

const SURFACE = "linear-gradient(180deg, #06061a 0%, #0f0c2e 30%, #1a1040 70%, #06061a 100%)";

const DataCapsule = ({ accent, h, children }: { accent: string; h: number; children: React.ReactNode }) => (
  <div style={{ height: h, position: "relative" }}>
    {/* glow ring */}
    <div style={{
      position: "absolute", inset: -2, borderRadius: 20,
      background: `linear-gradient(135deg, ${accent}40, transparent 40%, ${accent}20)`,
      filter: "blur(8px)", zIndex: 0, pointerEvents: "none",
    }} />
    <div style={{ height: "100%", position: "relative", zIndex: 1 }}>
      <GlassCard blobColor={accent.replace(")", ",0.25)")}>{children}</GlassCard>
    </div>
  </div>
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
    const tl = gsap.timeline();
    tl.fromTo(heroRef.current.querySelectorAll(".hero-word"), { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 1, stagger: 0.15, ease: "power4.out" })
      .fromTo(heroRef.current.querySelectorAll(".hero-stat"), { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.6, stagger: 0.1, ease: "back.out(1.7)" }, "-=0.3");
  }, { scope: heroRef });

  useGSAP(() => {
    if (!carouselRef.current || mode !== "carousel") return;
    gsap.fromTo(carouselRef.current, { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out" });
  }, { dependencies: [slide, mode], scope: carouselRef });

  const W = ({ blob, h, c }: { blob: string; h: number; c: React.ReactNode }) => (
    <DataCapsule accent={blob} h={h}>{c}</DataCapsule>
  );

  const timeline = <W blob="rgba(52,199,89,0.4)" h={520} c={<TimelineWaterfall />} />;
  const radar    = <W blob="rgba(0,240,255,0.4)"  h={520} c={<RetentionRadarStream activeTab={tab} setActiveTab={setTab} />} />;
  const chart    = <W blob="rgba(168,85,247,0.4)" h={420} c={
    lineLoading ? <Centered>加载中…</Centered> : lineChartData ? <HubPeakLineChart data={lineChartData as LineStats} /> : <Centered>暂无高峰数据</Centered>
  } />;
  const pie      = <W blob="rgba(59,130,246,0.4)" h={380} c={<NestedPieChart />} />;
  const codex    = <W blob="rgba(255,0,110,0.4)"  h={380} c={<RuleCodexCard />} />;
  const rank     = <W blob="rgba(0,240,255,0.4)"  h={380} c={<MonthlyRankCarousel />} />;
  const order    = <W blob="rgba(255,0,110,0.4)"  h={440} c={<AnimalOrderRankingCard />} />;
  const future   = (
    <div style={{ height: 440, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 18,
      border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}>
      <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 15 }}>扩展数据看板 — 即将接入</p>
    </div>
  );

  const Sec = ({ n, title, children }: { n: string; title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--twin-primary, #fff)", boxShadow: "0 0 10px rgba(0,240,255,0.6)" }} />
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(255,255,255,0.45)" }}>{n}</span>
        <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  );

  return (
    <DashboardSciFiVisualProvider value={sciFi.enabled}>
    <SciFiDashboardChrome enabled={sciFi.enabled}>
    <div style={{ minHeight: "100vh", background: SURFACE, color: "#e0e0e0", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ---- Toolbar ---- */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 100, display: "flex", gap: 8 }}>
        <ToolBtn onClick={() => navigate("/")}><ArrowLeft size={14} /> 返回</ToolBtn>
        <ToolBtn onClick={() => setMode(m => m === "scroll" ? "carousel" : "scroll")}>
          {mode === "scroll" ? <Columns size={14} /> : <ScrollText size={14} />}
          {mode === "scroll" ? "轮播" : "滚动"}
        </ToolBtn>
      </div>

      {/* ---- 头部 ---- */}
      <section ref={heroRef} style={{ padding: "100px 24px 72px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 30%, rgba(168,85,247,0.12) 0%, transparent 60%), radial-gradient(ellipse at 80% 70%, rgba(0,240,255,0.08) 0%, transparent 50%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto" }}>
          <p className="hero-word" style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", margin: "0 0 16px" }}>
            数字孪生实时监控中心
          </p>
          <h1 className="hero-word" style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 800, color: "#fff", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
            实验动物科学部
          </h1>
          <p className="hero-word" style={{ fontSize: 16, color: "rgba(255,255,255,0.45)", margin: "0 0 40px" }}>
            多段滚动布局 · Aurora Maximalism 设计预览
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16 }}>
            {[
              { v: "128", l: "当前在室", c: "#00F0FF" },
              { v: "1,247", l: "今日进出", c: "#4ade80" },
              { v: "42", l: "活跃房间", c: "#A855F7" },
              { v: "98.5%", l: "系统在线率", c: "#FF006E" },
            ].map(m => (
              <div
                key={m.l}
                className="hero-stat"
                style={{
                  padding: "20px 28px", borderRadius: 18, textAlign: "center",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(16px)", minWidth: 140,
                }}
              >
                <div style={{ fontSize: "clamp(24px, 3vw, 34px)", fontWeight: 800, color: m.c, textShadow: `0 0 24px ${m.c}60` }}>{m.v}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{m.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- 滚动模式 ---- */}
      {mode === "scroll" && (
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 28px 120px" }}>
          <ScrollReveal>
            <Sec n="01 · 实时动态" title="实时动态">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: 28 }}>
                {timeline}{radar}
              </div>
            </Sec>
          </ScrollReveal>

          <ScrollReveal>
            <Sec n="02 · 数据洞察" title="数据洞察">
              {chart}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 28, marginTop: 28 }}>
                {pie}{codex}{rank}
              </div>
            </Sec>
          </ScrollReveal>

          <ScrollReveal>
            <Sec n="03 · 排行榜" title="排行榜与订单">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 28 }}>
                {order}{future}
              </div>
            </Sec>
          </ScrollReveal>
        </div>
      )}

      {/* ---- 轮播模式 ---- */}
      {mode === "carousel" && (
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 28px 80px" }}>
          <Dots total={3} active={slide} onDot={setSlide} />
          <div ref={carouselRef}>
            {slide === 0 && <Sec n="01 / 03" title="实时动态"><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: 28 }}>{timeline}{radar}</div></Sec>}
            {slide === 1 && <Sec n="02 / 03" title="数据洞察">{chart}<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 28, marginTop: 28 }}>{pie}{codex}{rank}</div></Sec>}
            {slide === 2 && <Sec n="03 / 03" title="排行榜与订单"><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 28 }}>{order}{future}</div></Sec>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32 }}>
            <ToolBtn onClick={() => setSlide(s => Math.max(0, s - 1))} style={{ opacity: slide === 0 ? 0.25 : 1 }}>← 上一页</ToolBtn>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: "36px" }}>{slide + 1} / 3</span>
            <ToolBtn onClick={() => setSlide(s => Math.min(2, s + 1))} style={{ opacity: slide === 2 ? 0.25 : 1 }}>下一页 →</ToolBtn>
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", padding: "32px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
        Aurora Maximalism · 数字孪生 · 仪表盘预览
      </div>
    </div>
    </SciFiDashboardChrome>
    </DashboardSciFiVisualProvider>
  );
}

/* ---- helpers ---- */

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "rgba(255,255,255,0.35)" }}>{children}</div>;
}

function ToolBtn({ onClick, style, children }: { onClick: () => void; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.7)", fontSize: 12, cursor: "pointer",
      backdropFilter: "blur(12px)", ...style,
    }}>
      {children}
    </button>
  );
}

function Dots({ total, active, onDot }: { total: number; active: number; onDot: (i: number) => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "8px 0 24px" }}>
      {Array.from({ length: total }).map((_, i) => (
        <button key={i} onClick={() => onDot(i)} style={{
          width: i === active ? 24 : 8, height: 8, borderRadius: 999,
          background: i === active ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.15)",
          border: "none", cursor: "pointer", transition: "all 0.3s",
        }} />
      ))}
    </div>
  );
}
