import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import StarfieldCanvas from "@/features/dashboard-cosmos/StarfieldCanvas";
import PulseSection from "@/features/dashboard-cosmos/PulseSection";
import TideSection from "@/features/dashboard-cosmos/TideSection";
import ResearchTaskSection from "@/features/dashboard-cosmos/ResearchTaskSection";
import RankingsSection from "@/features/dashboard-cosmos/RankingsSection";
import CodexSection from "@/features/dashboard-cosmos/CodexSection";
import { useEventStore } from "@/store/useEventStore";
import { ArrowLeft } from "lucide-react";

const HEADER_H = 48;

const SECTIONS = [
  { key: "pulse", label: "脉冲", color: "#06b6d4" },
  { key: "tide", label: "潮汐", color: "#3b82f6" },
  { key: "research", label: "科研", color: "#a78bfa" },
  { key: "rankings", label: "圣殿", color: "#fbbf24" },
  { key: "codex", label: "法典", color: "#a855f7" },
] as const;

const AUTO_ADVANCE_MS = 12_000;
const RESUME_DELAY_MS = 8_000;
const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export default function DashboardPreviewPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualRef = useRef(false);
  const isConnected = useEventStore((s) => s.isConnected);
  const navigate = useNavigate();

  const [dateStr, setDateStr] = useState("");
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setDateStr(`${n.getFullYear()}年${n.getMonth() + 1}月${n.getDate()}日 ${WEEKDAYS[n.getDay()]} ${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:${String(n.getSeconds()).padStart(2, "0")}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  const scrollTo = useCallback((index: number) => {
    const el = containerRef.current;
    if (!el) return;
    const children = el.children;
    if (index < 0 || index >= children.length) return;
    const target = children[index] as HTMLElement;
    el.scrollTo({ top: target.offsetTop, behavior: "smooth" });
  }, []);

  const startAuto = useCallback(() => {
    if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    autoTimerRef.current = setInterval(() => {
      if (isManualRef.current) return;
      setActiveIndex((prev) => {
        const next = (prev + 1) % SECTIONS.length;
        scrollTo(next);
        return next;
      });
    }, AUTO_ADVANCE_MS);
  }, [scrollTo]);

  const pauseAuto = useCallback(() => {
    isManualRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => { isManualRef.current = false; }, RESUME_DELAY_MS);
  }, []);

  useEffect(() => { startAuto(); return () => { if (autoTimerRef.current) clearInterval(autoTimerRef.current); if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current); }; }, [startAuto]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const idx = Math.round(el.scrollTop / el.clientHeight);
      if (idx !== activeIndex && idx >= 0 && idx < SECTIONS.length) setActiveIndex(idx);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [activeIndex]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = () => pauseAuto();
    const onTouch = () => pauseAuto();
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouch, { passive: true });
    return () => { el.removeEventListener("wheel", onWheel); el.removeEventListener("touchstart", onTouch); };
  }, [pauseAuto]);

  return (
    <>
      {/* Global reset — prevent any body-level overflow */}
      <style>{`
        html, body, #root {
          margin:0 !important; padding:0 !important;
          width:100% !important; height:100% !important;
          overflow:hidden !important;
          background:#030712;
        }
        /* Force no horizontal scroll anywhere */
        html { overflow-x:hidden !important; }
        body { overflow-x:hidden !important; }
        /* Dark scrollbar — Webkit */
        .cosmos-scroll::-webkit-scrollbar { width:6px; height:6px; }
        .cosmos-scroll::-webkit-scrollbar-track { background:rgba(255,255,255,0.02); border-radius:3px; }
        .cosmos-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.10); border-radius:3px; }
        .cosmos-scroll::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,0.18); }
        .cosmos-scroll::-webkit-scrollbar-corner { background:transparent; }
        /* Dark scrollbar — Firefox */
        .cosmos-scroll { scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.10) rgba(255,255,255,0.02); }
      `}</style>

      {/* Layer 0: Starfield background — fixed to viewport, deepest layer */}
      <StarfieldCanvas />

      {/* Layer 1: Main viewport container */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1,
        display: "flex", flexDirection: "column",
        pointerEvents: "none", // let clicks pass through to header buttons etc.
      }}>
        {/* Header — takes pointer events */}
        <header style={{
          flexShrink: 0, height: HEADER_H, zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px", pointerEvents: "auto",
          background: "rgba(3,7,18,0.85)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.55)", letterSpacing: 1, fontVariantNumeric: "tabular-nums" }}>
            {dateStr}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: isConnected ? "#22c55e" : "#ef4444", boxShadow: isConnected ? "0 0 6px #22c55e" : "0 0 6px #ef4444" }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>{isConnected ? "在线" : "离线"}</span>
            </div>
            <button onClick={() => navigate(-1)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: 1, transition: "all 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
            ><ArrowLeft size={14} />返回</button>
          </div>
        </header>

        {/* Scroll area — locked to vertical only */}
        <div
          ref={containerRef}
          className="cosmos-scroll"
          style={{
            flex: 1, minHeight: 0,
            overflow: "hidden scroll",
            overflowX: "hidden",
            overflowY: "scroll",
            overscrollBehavior: "contain",
            scrollSnapType: "y mandatory",
            scrollSnapStop: "always",
            background: "transparent",
            pointerEvents: "auto",
            contain: "paint layout style",
          }}
        >
          <PulseSection />
          <TideSection />
          <ResearchTaskSection />
          <RankingsSection />
          <CodexSection />
        </div>
      </div>

      {/* Layer 2: Nav dots — on top of everything */}
      <nav style={{
        position: "fixed", right: 16, top: "50%", transform: "translateY(-50%)",
        zIndex: 300, display: "flex", flexDirection: "column", gap: 12, alignItems: "center",
      }}>
        {SECTIONS.map((s, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={s.key} type="button" aria-label={s.label}
              onClick={() => { pauseAuto(); setActiveIndex(i); scrollTo(i); }}
              style={{
                width: isActive ? 10 : 6, height: isActive ? 10 : 6,
                borderRadius: "50%", border: "none",
                background: isActive ? s.color : "rgba(255,255,255,0.2)",
                boxShadow: isActive ? `0 0 10px ${s.color}` : "none",
                cursor: "pointer", transition: "all 0.4s ease", padding: 0,
              }}
            />
          );
        })}
      </nav>
    </>
  );
}
