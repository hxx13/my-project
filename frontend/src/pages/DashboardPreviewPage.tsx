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
import { ArrowLeft, Columns, ScrollText } from "lucide-react";
import { TwinChromeThemeProvider } from "@/features/twin-chrome/TwinChromeThemeContext";

/* ================================================================== */
/*  ScrollReveal — IO + GSAP spring                                    */
/* ================================================================== */

function ScrollReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          gsap.fromTo(el, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.65, ease: "power3.out", clearProps: "transform,opacity" });
          obs.unobserve(el);
        }
      },
      { threshold: 0.06, rootMargin: "0px 0px -30px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}

/* ================================================================== */
/*  SectionLabel                                                       */
/* ================================================================== */

function SectionLabel({ badge, title, detail }: { badge: string; title: string; detail?: string }) {
  return (
    <div className="mb-5">
      <span className="inline-block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--twin-mute)] mb-1.5">{badge}</span>
      <h2 className="text-xl font-semibold text-[var(--twin-ink)]">{title}</h2>
      {detail && <p className="mt-1 text-sm text-[var(--twin-mute)] max-w-xl">{detail}</p>}
    </div>
  );
}

/* ================================================================== */
/*  HeroMetric                                                         */
/* ================================================================== */

function HeroMetric({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="text-center px-6 py-4 rounded-2xl bg-[var(--twin-canvas)]/70 backdrop-blur border border-[var(--twin-hairline)] shadow-sm">
      <div className="font-mono text-3xl font-bold tracking-tight" style={{ color }}>{value}</div>
      <div className="mt-1 text-xs text-[var(--twin-mute)]">{label}</div>
    </div>
  );
}

/* ================================================================== */
/*  DashboardPreviewPage                                               */
/* ================================================================== */

export default function DashboardPreviewPage() {
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

  /* Hero entrance */
  useGSAP(() => {
    if (!heroRef.current) return;
    gsap.fromTo(heroRef.current.querySelectorAll(".hero-item"),
      { opacity: 0, y: 44 }, { opacity: 1, y: 0, duration: 0.75, stagger: 0.1, ease: "power3.out" });
  }, { scope: heroRef });

  /* Carousel slide transition */
  useGSAP(() => {
    if (!carouselRef.current || mode !== "carousel") return;
    gsap.fromTo(carouselRef.current, { opacity: 0, x: 28 }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out" });
  }, { dependencies: [slide, mode], scope: carouselRef });

  /* ================================================================ */
  /* CARDS                                                             */
  /* ================================================================ */

  const cardChart = (
    <GlassCard blobColor="rgba(66,165,245,0.15)">
      <div style={{ height: 400 }}>
        {lineLoading ? <Centered>Loading…</Centered>
          : lineChartData ? <HubPeakLineChart data={lineChartData as LineStats} />
          : <Centered>No peak data available</Centered>}
      </div>
    </GlassCard>
  );

  const cardTimeline = (
    <GlassCard blobColor="rgba(52,199,89,0.2)">
      <div style={{ height: 520 }}><TimelineWaterfall /></div>
    </GlassCard>
  );

  const cardRadar = (
    <GlassCard blobColor="rgba(255,59,48,0.15)">
      <div style={{ height: 520 }}><RetentionRadarStream activeTab={tab} setActiveTab={setTab} /></div>
    </GlassCard>
  );

  const cardPie = (
    <GlassCard blobColor="rgba(45,92,247,0.15)">
      <div style={{ height: 360 }}><NestedPieChart /></div>
    </GlassCard>
  );

  const cardCodex = (
    <GlassCard blobColor="rgba(244,63,94,0.15)">
      <div style={{ height: 360 }}><RuleCodexCard /></div>
    </GlassCard>
  );

  const cardRank = (
    <GlassCard blobColor="rgba(191,90,242,0.15)">
      <div style={{ height: 360 }}><MonthlyRankCarousel /></div>
    </GlassCard>
  );

  const cardOrder = (
    <GlassCard blobColor="rgba(255,59,48,0.1)">
      <div style={{ height: 420 }}><AnimalOrderRankingCard /></div>
    </GlassCard>
  );

  /* ================================================================ */
  /* RENDER                                                            */
  /* ================================================================ */

  return (
    <TwinChromeThemeProvider>
    <div
      style={{
        background: "var(--twin-canvas-soft, #f5f5f5)",
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "var(--twin-ink, #171717)",
      }}
    >
      {/* ---- Floating toolbar ---- */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 100, display: "flex", gap: 8 }}>
        <button onClick={() => navigate("/")} className="tool-btn">
          <ArrowLeft size={14} /> Back
        </button>
        <button onClick={() => setMode(m => m === "scroll" ? "carousel" : "scroll")} className="tool-btn">
          {mode === "scroll" ? <Columns size={14} /> : <ScrollText size={14} />}
          {mode === "scroll" ? "Carousel" : "Scroll"}
        </button>
      </div>

      {/* ---- Hero ---- */}
      <section ref={heroRef} style={{
        padding: "64px 24px 48px", textAlign: "center", position: "relative", overflow: "hidden",
        background: "linear-gradient(180deg, var(--twin-canvas, #fff) 0%, #eef2ff 55%, var(--twin-canvas-soft, #f5f5f5) 100%)",
      }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 500, height: 500, borderRadius: "50%", background: "rgba(59,130,246,0.15)", filter: "blur(120px)", transform: "translate(25%, -33%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: 400, height: 400, borderRadius: "50%", background: "rgba(139,92,246,0.1)", filter: "blur(100px)", transform: "translate(-25%, 33%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1400, margin: "0 auto", padding: "0 24px" }}>
          <div className="hero-item">
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--twin-mute)" }}>
              Digital Twin · Monitoring Center
            </span>
          </div>
          <h1 className="hero-item" style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, color: "var(--twin-ink)", marginTop: 12 }}>
            Laboratory Animal Science
          </h1>
          <p className="hero-item" style={{ fontSize: 15, color: "var(--twin-mute)", marginTop: 6 }}>
            Real-time facility monitoring — scroll or carousel layout preview
          </p>
          <div className="hero-item" style={{ marginTop: 32, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
            <HeroMetric value="128" label="Present" color="#2563eb" />
            <HeroMetric value="1,247" label="Today" color="#16a34a" />
            <HeroMetric value="42" label="Active Rooms" color="#7c3aed" />
            <HeroMetric value="98.5%" label="Uptime" color="#ea580c" />
          </div>
        </div>
      </section>

      {/* ---- Scroll mode ---- */}
      {mode === "scroll" && (
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 28px 80px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 80 }}>
            <ScrollReveal>
              <SectionLabel badge="01 · Real-time" title="Live Feed" detail="Door access waterfall and retention radar stream" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: 24 }}>
                {cardTimeline}
                {cardRadar}
              </div>
            </ScrollReveal>

            <ScrollReveal>
              <SectionLabel badge="02 · Analytics" title="Data Insights" detail="Peak entry/exit curves, organizational breakdown, rule codex" />
              {cardChart}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, marginTop: 24 }}>
                {cardPie}
                {cardCodex}
                {cardRank}
              </div>
            </ScrollReveal>

            <ScrollReveal>
              <SectionLabel badge="03 · Rankings" title="Rankings &amp; Orders" detail="Monthly leaderboard and animal ordering dashboard" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 24 }}>
                {cardOrder}
                <GlassCard blobColor="rgba(100,116,139,0.08)">
                  <div style={{ height: 420, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "var(--twin-mute)", fontSize: 14 }}>Extension slot — future data panel</span>
                  </div>
                </GlassCard>
              </div>
            </ScrollReveal>
          </div>
        </div>
      )}

      {/* ---- Carousel mode ---- */}
      {mode === "carousel" && (
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 28px 40px" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "8px 0 16px" }}>
            {[0, 1, 2].map(i => (
              <button key={i} onClick={() => setSlide(i)} style={{
                width: i === slide ? 24 : 8, height: 8, borderRadius: 999,
                background: i === slide ? "var(--twin-ink)" : "var(--twin-hairline)",
                border: "none", cursor: "pointer", transition: "all 0.25s",
              }} />
            ))}
          </div>
          <div ref={carouselRef}>
            {slide === 0 && (
              <div>
                <SectionLabel badge="01 / 03 · Real-time" title="Live Feed" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: 24 }}>
                  {cardTimeline}
                  {cardRadar}
                </div>
              </div>
            )}
            {slide === 1 && (
              <div>
                <SectionLabel badge="02 / 03 · Analytics" title="Data Insights" />
                {cardChart}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, marginTop: 24 }}>
                  {cardPie}
                  {cardCodex}
                  {cardRank}
                </div>
              </div>
            )}
            {slide === 2 && (
              <div>
                <SectionLabel badge="03 / 03 · Rankings" title="Rankings &amp; Orders" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 24 }}>
                  {cardOrder}
                  <GlassCard blobColor="rgba(100,116,139,0.08)">
                    <div style={{ height: 420, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "var(--twin-mute)", fontSize: 14 }}>Extension slot</span>
                    </div>
                  </GlassCard>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
            <button onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0}
              className="tool-btn" style={{ opacity: slide === 0 ? 0.3 : 1 }}>&larr; Previous</button>
            <span style={{ fontSize: 12, color: "var(--twin-mute)", lineHeight: "32px" }}>{slide + 1} of 3</span>
            <button onClick={() => setSlide(s => Math.min(2, s + 1))} disabled={slide === 2}
              className="tool-btn" style={{ opacity: slide === 2 ? 0.3 : 1 }}>Next &rarr;</button>
          </div>
        </div>
      )}

      {/* ---- Footer ---- */}
      <div style={{ textAlign: "center", padding: "32px 0", borderTop: "1px solid var(--twin-hairline)", fontSize: 11, color: "var(--twin-mute)" }}>
        Dashboard Preview · Standalone page · Scroll or carousel with GSAP reveals
      </div>
    </div>
    </TwinChromeThemeProvider>
      <style>{`
        .tool-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 14px; border-radius: 999px;
          border: 1px solid var(--twin-hairline, #e5e7eb);
          background: var(--twin-canvas, #fff); color: var(--twin-body, #4d4d4d);
          font-size: 12px; cursor: pointer; transition: background 0.15s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .tool-btn:hover { background: var(--twin-canvas-soft, #fafafa); }
      `}</style>
    </div>
    </TwinChromeThemeProvider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--twin-mute)" }}>
      {children}
    </div>
  );
}
