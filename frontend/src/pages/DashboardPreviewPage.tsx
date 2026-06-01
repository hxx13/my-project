import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

/* ================================================================== */
/*  ScrollReveal wrapper                                              */
/* ================================================================== */

function ScrollReveal({ children, className, style }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          gsap.fromTo(entry.target, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", clearProps: "transform,opacity" });
          obs.unobserve(entry.target);
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={className} style={style}>{children}</div>;
}

/* ================================================================== */
/*  Glass card                                                        */
/* ================================================================== */

function GlassPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/40 bg-white/60 backdrop-blur-md shadow-lg ${className ?? ""}`}>
      {children}
    </div>
  );
}

/* ================================================================== */
/*  Page                                                              */
/* ================================================================== */

export default function DashboardPreviewPage() {
  const heroRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!heroRef.current) return;
    gsap.fromTo(heroRef.current.querySelectorAll(".hero-item"),
      { opacity: 0, y: 48 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.12, ease: "power3.out" });
  }, { scope: heroRef });

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 40%, #faf5ff 70%, #f8fafc 100%)" }}>
      {/* Decorative blobs */}
      <div className="fixed top-0 right-0 w-[700px] h-[700px] rounded-full bg-blue-100/40 blur-[140px] -translate-y-1/3 translate-x-1/4 pointer-events-none z-0" />
      <div className="fixed bottom-0 left-0 w-[600px] h-[600px] rounded-full bg-violet-100/30 blur-[120px] translate-y-1/3 -translate-x-1/4 pointer-events-none z-0" />
      <div className="fixed top-1/2 left-1/2 w-[500px] h-[500px] rounded-full bg-amber-50/20 blur-[100px] -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0" />

      <div className="relative z-10 max-w-[1440px] mx-auto px-6 sm:px-10">

        {/* ============================================================ */}
        {/* HERO                                                         */}
        {/* ============================================================ */}
        <section ref={heroRef} className="pt-20 pb-16 text-center">
          <div className="hero-item">
            <span className="inline-block text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500/70 mb-4">
              Digital Twin · Dashboard Preview
            </span>
          </div>
          <h1 className="hero-item text-4xl sm:text-5xl font-bold tracking-tight text-slate-900">
            实验动物科学部
          </h1>
          <p className="hero-item mt-3 text-lg text-slate-500 max-w-xl mx-auto">
            数字孪生实时监控中心 — 全新的多段滚动布局预览
          </p>

          {/* Hero metrics */}
          <div className="hero-item mt-10 flex flex-wrap items-center justify-center gap-4">
            {[
              { v: "128", l: "当前在室", c: "#2563eb" },
              { v: "1,247", l: "今日进出", c: "#16a34a" },
              { v: "42", l: "活跃房间", c: "#7c3aed" },
              { v: "98.5%", l: "系统在线率", c: "#ea580c" },
            ].map((m) => (
              <GlassPanel key={m.l} className="px-8 py-5 text-center min-w-[140px]">
                <div className="text-3xl font-bold" style={{ color: m.c }}>{m.v}</div>
                <div className="mt-1 text-xs text-slate-500">{m.l}</div>
              </GlassPanel>
            ))}
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 1 — 实时动态 (2-col)                                 */}
        {/* ============================================================ */}
        <ScrollReveal className="pb-16">
          <div className="mb-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600/70">Real-time</span>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">实时动态</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">即时的门禁活动瀑布流与人员留存态势监控</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GlassPanel className="p-6 min-h-[400px]">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">🚪 进出瀑布流</h3>
              <div className="flex items-center justify-center h-[320px] text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                TimelineWaterfall 组件
              </div>
            </GlassPanel>
            <GlassPanel className="p-6 min-h-[400px]">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">📡 留存雷达</h3>
              <div className="flex items-center justify-center h-[320px] text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                RetentionRadarStream 组件
              </div>
            </GlassPanel>
          </div>
        </ScrollReveal>

        {/* ============================================================ */}
        {/* SECTION 2 — 数据洞察 (full-width chart + 3 cards)           */}
        {/* ============================================================ */}
        <ScrollReveal className="pb-16">
          <div className="mb-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600/70">Analytics</span>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">数据洞察</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">进出高峰趋势、房间热力分布与智能规则分析</p>
          </div>

          {/* Full-width chart */}
          <GlassPanel className="p-6 min-h-[340px] mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">📈 进出高峰枢纽对比曲线</h3>
            <div className="flex items-center justify-center h-[260px] text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
              HubPeakLineChart 组件
            </div>
          </GlassPanel>

          {/* 3 cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GlassPanel className="p-6 min-h-[300px]">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">🍩 组织结构饼图</h3>
              <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                NestedPieChart
              </div>
            </GlassPanel>
            <GlassPanel className="p-6 min-h-[300px]">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">⚖️ 智能规则法典</h3>
              <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                RuleCodexCard
              </div>
            </GlassPanel>
            <GlassPanel className="p-6 min-h-[300px]">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">🏆 月度排名轮播</h3>
              <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                MonthlyRankCarousel
              </div>
            </GlassPanel>
          </div>
        </ScrollReveal>

        {/* ============================================================ */}
        {/* SECTION 3 — 排行榜 & 其他                                    */}
        {/* ============================================================ */}
        <ScrollReveal className="pb-20">
          <div className="mb-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-600/70">Rankings</span>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">排行榜 & 动物订单</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">月度排名与动物订购综合看板</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GlassPanel className="p-6 min-h-[360px]">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">🐾 动物订购排名</h3>
              <div className="flex items-center justify-center h-[280px] text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                AnimalOrderRankingCard
              </div>
            </GlassPanel>
            <GlassPanel className="p-6 min-h-[360px]">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">📊 扩展区域</h3>
              <div className="flex items-center justify-center h-[280px] text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                预留 — 接入更多数据看板
              </div>
            </GlassPanel>
          </div>
        </ScrollReveal>

        {/* Footer */}
        <div className="text-center pb-12 text-xs text-slate-400 border-t border-slate-200 pt-8">
          Dashboard Preview · 独立预览页面 · 不影响现有仪表盘
        </div>
      </div>
    </div>
  );
}
