import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchPieChartData, type DashboardStatsResponse, type RoomStats } from "@/api/twinApi";
import { useEventStore, type UniversalEvent } from "@/store/useEventStore";

const PD_COLOR = "#3b82f6";
const PX_COLOR = "#ec4899";

// ---- Bubble physics engine ----
interface Bubble {
  el: HTMLDivElement | null;
  x: number; y: number; // % of container
  vx: number; vy: number; // % per second
  r: number; // % radius for collision
}

function useBubblePhysics(count: number) {
  const bubblesRef = useRef<Bubble[]>([]);
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  const initRef = useCallback((containerW: number, containerH: number) => {
    const bubbles: Bubble[] = [];
    for (let i = 0; i < count; i++) {
      // uniform random distribution across full area
      const x = 8 + Math.random() * 78;
      const y = 12 + Math.random() * 68;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3; // % per second
      bubbles.push({
        el: null,
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 4.5 + Math.random() * 2,
      });
    }
    bubblesRef.current = bubbles;
    lastRef.current = performance.now();
  }, [count]);

  const start = useCallback(() => {
    let running = true;
    const loop = (now: number) => {
      if (!running) return;
      const dt = Math.min((now - lastRef.current) / 1000, 0.1); // cap at 100ms
      lastRef.current = now;
      const bubbles = bubblesRef.current;
      if (!bubbles.length) { rafRef.current = requestAnimationFrame(loop); return; }

      // update positions
      for (const b of bubbles) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        // wall bounce — tight bounds to prevent overflow
        if (b.x < 5) { b.x = 5; b.vx = Math.abs(b.vx); }
        if (b.x > 78) { b.x = 78; b.vx = -Math.abs(b.vx); }
        if (b.y < 8) { b.y = 8; b.vy = Math.abs(b.vy); }
        if (b.y > 76) { b.y = 76; b.vy = -Math.abs(b.vy); }
      }

      // collision — simple elastic
      for (let i = 0; i < bubbles.length; i++) {
        for (let j = i + 1; j < bubbles.length; j++) {
          const a = bubbles[i], b = bubbles[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = a.r + b.r;
          if (dist < minDist && dist > 0.001) {
            // push apart
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist, ny = dy / dist;
            a.x -= nx * overlap; a.y -= ny * overlap;
            b.x += nx * overlap; b.y += ny * overlap;
            // swap velocities along collision normal
            const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
            const dvn = dvx * nx + dvy * ny;
            if (dvn > 0) {
              a.vx -= dvn * nx; a.vy -= dvn * ny;
              b.vx += dvn * nx; b.vy += dvn * ny;
            }
          }
        }
      }

      // update DOM
      for (const b of bubbles) {
        if (b.el) {
          b.el.style.left = `${b.x}%`;
          b.el.style.top = `${b.y}%`;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  return { bubblesRef, initRef, start };
}

// ---- Section ----
export default function PulseSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const pieStats = useEventStore((s) => s.pieStats);
  const setPieStats = useEventStore((s) => s.setPieStats);
  const events = useEventStore((s) => s.realtimeEvents);
  const [coldData, setColdData] = useState<DashboardStatsResponse | null>(null);

  useEffect(() => {
    if (pieStats) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchPieChartData() as DashboardStatsResponse;
        if (!cancelled && d) { setPieStats(d); setColdData(d); }
      } catch { /* */ }
    })();
    return () => { cancelled = true; };
  }, [pieStats, setPieStats]);

  const stats = pieStats || coldData;
  const pudongTotal = stats?.pudongTotal ?? 0;
  const puxiTotal = stats?.puxiTotal ?? 0;
  const grandTotal = pudongTotal + puxiTotal;
  const pudongRooms = stats?.pudongPie ?? [];
  const puxiRooms = stats?.puxiPie ?? [];

  const allRoomCards = useMemo(() => [
    ...pudongRooms.map(r => ({ room: r, campus: "pudong" as const, color: PD_COLOR })),
    ...puxiRooms.map(r => ({ room: r, campus: "puxi" as const, color: PX_COLOR })),
  ], [pudongRooms, puxiRooms]);

  // Bubble physics
  const { bubblesRef, initRef, start } = useBubblePhysics(allRoomCards.length);

  useEffect(() => {
    if (allRoomCards.length === 0) return;
    const el = sectionRef.current;
    if (!el) return;
    initRef(el.clientWidth, el.clientHeight);
    const stop = start();
    return stop;
  }, [allRoomCards.length, initRef, start]);

  // Canvas: subtle ambient particles only (no full-screen fills)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let W = 0, H = 0, raf = 0;
    const resize = () => {
      const p = canvas.parentElement;
      if (!p) return;
      W = p.clientWidth; H = p.clientHeight;
      canvas.width = W; canvas.height = H;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const dots: { x: number; y: number; r: number; vy: number; a: number; h: number }[] = [];
    for (let i = 0; i < 30; i++) dots.push({
      x: Math.random() * (W || 800), y: Math.random() * (H || 600),
      r: Math.random() * 1.4 + 0.3, vy: -(Math.random() * 0.2 + 0.04),
      a: Math.random() * 0.2 + 0.05, h: Math.random() > 0.5 ? 210 : 330,
    });

    const render = () => {
      ctx.clearRect(0, 0, W, H);
      for (const d of dots) {
        d.y += d.vy;
        if (d.y < -10) { d.y = H + 10; d.x = Math.random() * W; }
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${d.h},70%,55%,${d.a.toFixed(2)})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  const fmt = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n.toLocaleString();

  return (
    <section ref={sectionRef} style={{
      height: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative", overflow: "hidden", background: "transparent",
      scrollSnapAlign: "start", scrollSnapStop: "always" as const, flexShrink: 0, contain: "paint",
    }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }} />

      {/* Bubble room cards driven by physics engine */}
      {allRoomCards.map((item, i) => (
        <BubbleCard key={`${item.campus}-${item.room.name}`} item={item} index={i} bubblesRef={bubblesRef} />
      ))}

      {/* Student entry cards — bottom strip */}
      <StudentEntryStrip events={events} />

      {/* Center stats */}
      <div style={{ position: "relative", zIndex: 10, display: "flex", gap: 60, alignItems: "center", pointerEvents: "none" }}>
        <CampusStat label="浦东" eng="PUDONG" value={pudongTotal} color={PD_COLOR} />
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.06)", margin: "0 auto 6px" }} />
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 3, color: "rgba(255,255,255,0.18)", textTransform: "uppercase" }}>总计</span>
          <AnimatedNumber value={grandTotal} size={36} color="rgba(255,255,255,0.45)" />
        </div>
        <CampusStat label="浦西" eng="PUXI" value={puxiTotal} color={PX_COLOR} />
      </div>
    </section>
  );
}

// ---- Sub-components ----

function BubbleCard({ item, index, bubblesRef }: {
  item: { room: RoomStats; campus: string; color: string };
  index: number;
  bubblesRef: React.MutableRefObject<Bubble[]>;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bubbles = bubblesRef.current;
    if (bubbles[index]) bubbles[index].el = elRef.current;
  }, [index, bubblesRef]);

  return (
    <div
      ref={elRef}
      style={{
        position: "absolute",
        padding: "12px 18px", borderRadius: 16,
        border: `1.5px solid ${item.color}50`,
        background: `radial-gradient(ellipse at 30% 20%, ${item.color}18, transparent 65%)`,
        boxShadow: `0 0 24px ${item.color}12, 0 0 50px ${item.color}06`,
        backdropFilter: "blur(6px)",
        display: "flex", flexDirection: "column", gap: 2,
        zIndex: 2, pointerEvents: "none",
        transition: "box-shadow 0.5s",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: item.color }}>{item.room.name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 24, fontWeight: 900, color: "#f1f5f9", lineHeight: 1 }}>{item.room.value}</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>人次</span>
      </div>
    </div>
  );
}

function StudentEntryStrip({ events }: { events: UniversalEvent[] }) {
  const recentEnters = useMemo(() =>
    events.filter(e => e.action === "ENTER").slice(0, 5),
  [events]);

  if (recentEnters.length === 0) return null;

  return (
    <div style={{
      position: "absolute", bottom: 20, left: 0, right: 0, zIndex: 15,
      display: "flex", justifyContent: "center", gap: 10, padding: "0 30px",
    }}>
      <AnimatePresence mode="popLayout">
        {recentEnters.map((evt) => {
          const timeStr = evt.timestamp ? evt.timestamp.split(" ")[1]?.substring(0, 5) ?? "--:--" : "--:--";
          const c = (evt.location?.campus || "").includes("浦西") ? PX_COLOR : PD_COLOR;
          return (
            <motion.div
              key={evt.eventId}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.85 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              style={{
                padding: "8px 14px", borderRadius: 12,
                border: `1px solid ${c}40`,
                background: "rgba(3,7,18,0.6)", backdropFilter: "blur(10px)",
                display: "flex", alignItems: "center", gap: 10,
                whiteSpace: "nowrap",
                boxShadow: `0 0 16px rgba(0,0,0,0.3)`,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9" }}>{evt.person?.name || "—"}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis" }}>
                {evt.person?.group || ""}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c }}>
                {evt.location?.room || ""}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", fontVariantNumeric: "tabular-nums" }}>
                {timeStr}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function CampusStat({ label, eng, value, color }: { label: string; eng: string; value: number; color: string }) {
  const fmt = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n.toLocaleString();
  return (
    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 5, color, textTransform: "uppercase" }}>{eng}</span>
      <AnimatedNumber value={value} size={68} color="#f1f5f9" glow={color} />
      <span style={{ fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.22)" }}>{label} · 今日累积进出</span>
    </div>
  );
}

function AnimatedNumber({ value, size, color, glow }: { value: number; size: number; color: string; glow?: string }) {
  const fmt = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n.toLocaleString();
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={value}
        initial={{ scale: 0.92, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 1.06, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 20 }}
        style={{
          fontSize: size, fontWeight: 900, lineHeight: 1, color,
          textShadow: glow ? `0 0 50px ${glow}55, 0 0 100px ${glow}22` : undefined,
          fontVariantNumeric: "tabular-nums", display: "inline-block",
        }}
      >
        {fmt(value)}
      </motion.span>
    </AnimatePresence>
  );
}
