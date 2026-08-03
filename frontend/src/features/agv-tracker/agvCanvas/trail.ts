import type { TrailPoint } from "../useAgvTrailRef";

// ── Trail rendering helper ──

export function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: TrailPoint[],
  color: string,
  toPx: (x: number, y: number) => number,
  toPy: (x: number, y: number) => number,
) {
  if (trail.length < 2) return;
  const sorted = [...trail].sort((a, b) => a.ts - b.ts);

  const deduped: TrailPoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    if (deduped.length === 0) { deduped.push(p); continue; }
    const last = deduped[deduped.length - 1];
    const dx = Math.abs(p.x - last.x), dy = Math.abs(p.y - last.y);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxGap = dist < 0.01 ? 120_000 : 30_000;
    if (dist < 0.05 && (p.ts - last.ts) < maxGap) continue;
    deduped.push(p);
  }

  // White outline
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.moveTo(toPx(deduped[0].x, deduped[0].y), toPy(deduped[0].x, deduped[0].y));
  for (let i = 1; i < deduped.length; i++) {
    ctx.lineTo(toPx(deduped[i].x, deduped[i].y), toPy(deduped[i].x, deduped[i].y));
  }
  ctx.stroke();

  // Colored core
  ctx.lineWidth = 3;
  for (let i = 1; i < deduped.length; i++) {
    const a = 0.15 + 0.7 * (i / deduped.length);
    ctx.strokeStyle = color + Math.floor(a * 255).toString(16).padStart(2, "0");
    ctx.beginPath();
    ctx.moveTo(toPx(deduped[i - 1].x, deduped[i - 1].y), toPy(deduped[i - 1].x, deduped[i - 1].y));
    ctx.lineTo(toPx(deduped[i].x, deduped[i].y), toPy(deduped[i].x, deduped[i].y));
    ctx.stroke();
  }
}
