import { useEffect, useRef, useState, useMemo } from "react";
import { fetchLineChartData, type LineStats } from "@/api/twinApi";

interface FlowDot {
  progress: number; // 0..1 along the curve
  band: "pudong" | "puxi";
  speed: number;
  size: number;
  alpha: number;
}

const PD_COLOR = "#38bdf8"; // bright cyan-blue for Pudong
const PX_COLOR = "#f472b6"; // bright pink for Puxi

export default function TideSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rawData, setRawData] = useState<LineStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchLineChartData();
        if (!cancelled && d && Array.isArray(d.times)) setRawData(d as LineStats);
      } catch { /* */ }
    })();
    const iv = setInterval(async () => {
      try { const d = await fetchLineChartData(); if (d?.times) setRawData(d as LineStats); } catch { /* */ }
    }, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const parsed = useMemo(() => {
    if (!rawData?.times?.length) return null;
    const n = rawData.times.length;
    const pd = (rawData.pudong || []).map(Number);
    const px = (rawData.puxi || []).map(Number);
    const times = rawData.times.map(String);
    const maxVal = Math.max(...pd, ...px, 1);
    const pdTotal = pd.reduce((a, b) => a + b, 0);
    const pxTotal = px.reduce((a, b) => a + b, 0);
    const pdPeak = Math.max(...pd);
    const pxPeak = Math.max(...px);
    const pdPeakIdx = pd.indexOf(pdPeak);
    const pxPeakIdx = px.indexOf(pxPeak);
    return { n, pd, px, times, maxVal, pdTotal, pxTotal, pdPeak, pxPeak, pdPeakIdx, pxPeakIdx };
  }, [rawData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !parsed) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = canvas.parentElement?.clientWidth ?? innerWidth;
    let H = canvas.parentElement?.clientHeight ?? innerHeight;
    let raf = 0;

    const resize = () => {
      W = canvas.parentElement?.clientWidth ?? innerWidth;
      H = canvas.parentElement?.clientHeight ?? innerHeight;
      canvas.width = W; canvas.height = H;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const dots: FlowDot[] = Array.from({ length: 80 }, () => ({
      progress: Math.random(),
      band: (Math.random() > 0.5 ? "pudong" : "puxi") as "pudong" | "puxi",
      speed: 0.0006 + Math.random() * 0.0018,
      size: 1.4 + Math.random() * 2.6,
      alpha: 0.3 + Math.random() * 0.45,
    }));

    const render = () => {
      ctx.clearRect(0, 0, W, H);
      if (!parsed) { raf = requestAnimationFrame(render); return; }

      const { n, pd, px, times, maxVal, pdPeak, pxPeak, pdPeakIdx, pxPeakIdx } = parsed;
      // Leave room for stats header (top) and axis (bottom)
      const pad = { top: H * 0.18, bottom: H * 0.1, left: W * 0.06, right: W * 0.04 };
      const cw = W - pad.left - pad.right;
      const ch = H - pad.top - pad.bottom;
      const getX = (i: number) => pad.left + (i / Math.max(n - 1, 1)) * cw;
      const getY = (v: number) => pad.top + ch - (v / maxVal) * ch * 0.88;

      const pdPts: [number, number][] = pd.map((v, i) => [getX(i), getY(v)]);
      const pxPts: [number, number][] = px.map((v, i) => [getX(i), getY(v)]);

      // --- Draw filled bands ---
      drawSmoothBand(ctx, pxPts, pad, ch, PX_COLOR, 0.28);
      drawSmoothBand(ctx, pdPts, pad, ch, PD_COLOR, 0.32);

      // --- Draw smooth curves ---
      drawSmoothCurve(ctx, pdPts, PD_COLOR, 3, 20);
      drawSmoothCurve(ctx, pxPts, PX_COLOR, 3, 20);

      // --- Flow dots ---
      for (const dot of dots) {
        dot.progress += dot.speed;
        if (dot.progress >= 1) dot.progress = 0;
        const pts = dot.band === "pudong" ? pdPts : pxPts;
        const idx = dot.progress * (n - 1);
        const i0 = Math.floor(idx), i1 = Math.min(i0 + 1, n - 1);
        const frac = idx - i0;
        const dx = pts[i0][0] + (pts[i1][0] - pts[i0][0]) * frac;
        const dy = pts[i0][1] + (pts[i1][1] - pts[i0][1]) * frac;
        const hex = dot.band === "pudong" ? PD_COLOR : PX_COLOR;
        const rr = parseInt(hex.slice(1, 3), 16), gg = parseInt(hex.slice(3, 5), 16), bb = parseInt(hex.slice(5, 7), 16);
        ctx.beginPath(); ctx.arc(dx, dy, dot.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rr},${gg},${bb},${dot.alpha.toFixed(2)})`; ctx.fill();
        ctx.beginPath(); ctx.arc(dx, dy, dot.size * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rr},${gg},${bb},${(dot.alpha * 0.15).toFixed(2)})`; ctx.fill();
      }

      // --- Current time marker ---
      const now = new Date();
      const nowFrac = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
      const mx = pad.left + nowFrac * cw;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(mx - 14, pad.top, 28, ch);
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(mx, pad.top); ctx.lineTo(mx, pad.top + ch); ctx.stroke();

      // --- X-axis labels — LARGE, bright, with glow ---
      const labelStep = Math.max(1, Math.floor(n / 10));
      for (let i = 0; i < n; i += labelStep) {
        const lx = getX(i);
        const label = times[i];
        // glow shadow behind text
        ctx.shadowColor = "rgba(255,255,255,0.3)"; ctx.shadowBlur = 6;
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "bold 13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, lx, pad.top + ch + 22);
        ctx.shadowBlur = 0;
      }

      // --- Y-axis grid lines with labels ---
      const ySteps = 4;
      for (let i = 0; i <= ySteps; i++) {
        const frac = i / ySteps;
        const val = Math.round(maxVal * (1 - frac));
        const gy = pad.top + frac * ch;
        ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(pad.left + cw, gy); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(String(val), pad.left - 8, gy + 4);
      }

      // --- Peak labels ---
      if (pdPeakIdx >= 0) {
        const lx = getX(pdPeakIdx), ly = getY(pdPeak);
        ctx.fillStyle = PD_COLOR; ctx.font = "bold 13px system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.shadowColor = PD_COLOR; ctx.shadowBlur = 10;
        ctx.fillText(`浦东峰值 ${pdPeak}`, lx, ly - 10);
        ctx.shadowBlur = 0;
      }
      if (pxPeakIdx >= 0) {
        const lx = getX(pxPeakIdx), ly = getY(pxPeak);
        ctx.fillStyle = PX_COLOR; ctx.font = "bold 13px system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.shadowColor = PX_COLOR; ctx.shadowBlur = 10;
        ctx.fillText(`浦西峰值 ${pxPeak}`, lx, ly - 10);
        ctx.shadowBlur = 0;
      }

      // --- Legend (top-left, inside chart) ---
      ctx.font = "bold 14px system-ui, sans-serif"; ctx.textAlign = "left";
      ctx.fillStyle = PD_COLOR;
      ctx.beginPath(); ctx.arc(pad.left + 7, pad.top - 22, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillText("浦东 Pudong", pad.left + 18, pad.top - 16);
      ctx.fillStyle = PX_COLOR;
      ctx.beginPath(); ctx.arc(pad.left + 150, pad.top - 22, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillText("浦西 Puxi", pad.left + 161, pad.top - 16);

      // --- Time label on marker ---
      const timeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = "bold 14px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(timeLabel, mx, pad.top - 14);

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [parsed]);

  if (!parsed) {
    return (
      <section style={{ height: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", scrollSnapAlign: "start", scrollSnapStop: "always" as const, flexShrink: 0, contain: "paint" }}>
        <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 16, fontWeight: 600 }}>潮汐数据加载中…</span>
      </section>
    );
  }

  const { pdTotal, pxTotal, pdPeak, pxPeak, times, pdPeakIdx, pxPeakIdx } = parsed;
  const grandTotal = pdTotal + pxTotal;
  const pdPct = grandTotal > 0 ? Math.round((pdTotal / grandTotal) * 100) : 0;
  const pxPct = 100 - pdPct;

  return (
    <section style={{ height: "100vh", width: "100%", display: "flex", flexDirection: "column", position: "relative", background: "transparent", overflow: "hidden", scrollSnapAlign: "start", scrollSnapStop: "always" as const, flexShrink: 0, contain: "paint" }}>
      {/* Stats overlay header */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, display: "flex", justifyContent: "center", gap: 40, padding: "12px 32px", background: "linear-gradient(180deg, rgba(3,7,18,0.95) 60%, transparent)", pointerEvents: "none" }}>
        <StatItem label="今日总流量" value={grandTotal.toLocaleString()} unit="人次" color="rgba(255,255,255,0.7)" />
        <StatItem label="浦东峰值" value={String(pdPeak)} unit={`@${times[pdPeakIdx] ?? "—"}`} color={PD_COLOR} />
        <StatItem label="浦西峰值" value={String(pxPeak)} unit={`@${times[pxPeakIdx] ?? "—"}`} color={PX_COLOR} />
        <StatItem label="浦东占比" value={`${pdPct}%`} unit={`${pdTotal.toLocaleString()} 次`} color={PD_COLOR} />
        <StatItem label="浦西占比" value={`${pxPct}%`} unit={`${pxTotal.toLocaleString()} 次`} color={PX_COLOR} />
      </div>

      <canvas ref={canvasRef} style={{ flex: 1, width: "100%" }} />

    </section>
  );
}

function StatItem({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1, textShadow: `0 0 16px ${color}33` }}>{value}</span>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{unit}</span>
    </div>
  );
}

// --- Smooth curve utilities (same as before) ---

function drawSmoothCurve(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, width: number, glow: number) {
  if (pts.length < 2) return;
  const cp = computeControlPoints(pts);
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    ctx.bezierCurveTo(cp[i][1][0], cp[i][1][1], cp[i + 1][0][0], cp[i + 1][0][1], pts[i + 1][0], pts[i + 1][1]);
  }
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.shadowColor = color; ctx.shadowBlur = glow; ctx.stroke(); ctx.shadowBlur = 0;
  const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  ctx.strokeStyle = `rgba(${r},${g},${b},0.12)`; ctx.lineWidth = width * 5; ctx.stroke();
}

function drawSmoothBand(ctx: CanvasRenderingContext2D, pts: [number, number][], pad: { top: number; bottom: number; left: number; right: number }, ch: number, color: string, alpha: number) {
  if (pts.length < 2) return;
  const cp = computeControlPoints(pts);
  const baseline = pad.top + ch;
  ctx.beginPath(); ctx.moveTo(pts[0][0], baseline); ctx.lineTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    ctx.bezierCurveTo(cp[i][1][0], cp[i][1][1], cp[i + 1][0][0], cp[i + 1][0][1], pts[i + 1][0], pts[i + 1][1]);
  }
  ctx.lineTo(pts[pts.length - 1][0], baseline); ctx.closePath();
  const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  const grad = ctx.createLinearGradient(0, pad.top, 0, baseline);
  grad.addColorStop(0, `rgba(${r},${g},${b},${alpha.toFixed(2)})`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},${(alpha * 0.35).toFixed(2)})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0.01)`);
  ctx.fillStyle = grad; ctx.fill();
}

function computeControlPoints(pts: [number, number][]): [number, number][][] {
  const n = pts.length;
  const cp: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? pts[i - 1] : pts[0];
    const curr = pts[i];
    const next = i < n - 1 ? pts[i + 1] : pts[n - 1];
    let dx: number, dy: number;
    if (i === 0) { dx = (next[0] - curr[0]) * 0.5; dy = (next[1] - curr[1]) * 0.5; }
    else if (i === n - 1) { dx = (curr[0] - prev[0]) * 0.5; dy = (curr[1] - prev[1]) * 0.5; }
    else { dx = (next[0] - prev[0]) * 0.5; dy = (next[1] - prev[1]) * 0.5; }
    cp.push([[curr[0] - dx / 3, curr[1] - dy / 3], [curr[0] + dx / 3, curr[1] + dy / 3]]);
  }
  return cp;
}
