export type FlowChartPadding = { top: number; bottom: number; left: number; right: number };

export type ParsedFlowData = {
  n: number;
  pd: number[];
  px: number[];
  times: string[];
  maxVal: number;
  pdTotal: number;
  pxTotal: number;
  pdPeak: number;
  pxPeak: number;
  pdPeakIdx: number;
  pxPeakIdx: number;
};

export function parseFlowLineStats(raw: {
  times?: string[];
  pudong?: number[];
  puxi?: number[];
} | null): ParsedFlowData | null {
  if (!raw?.times?.length) return null;
  const n = raw.times.length;
  const pd = (raw.pudong || []).map(Number);
  const px = (raw.puxi || []).map(Number);
  const times = raw.times.map(String);
  const maxVal = Math.max(...pd, ...px, 1);
  const pdTotal = pd.reduce((a, b) => a + b, 0);
  const pxTotal = px.reduce((a, b) => a + b, 0);
  const pdPeak = Math.max(...pd, 0);
  const pxPeak = Math.max(...px, 0);
  const pdPeakIdx = pd.indexOf(pdPeak);
  const pxPeakIdx = px.indexOf(pxPeak);
  return { n, pd, px, times, maxVal, pdTotal, pxTotal, pdPeak, pxPeak, pdPeakIdx, pxPeakIdx };
}

function computeControlPoints(pts: [number, number][]): [number, number][][] {
  const n = pts.length;
  const cp: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? pts[i - 1] : pts[0];
    const curr = pts[i];
    const next = i < n - 1 ? pts[i + 1] : pts[n - 1];
    let dx: number;
    let dy: number;
    if (i === 0) {
      dx = (next[0] - curr[0]) * 0.5;
      dy = (next[1] - curr[1]) * 0.5;
    } else if (i === n - 1) {
      dx = (curr[0] - prev[0]) * 0.5;
      dy = (curr[1] - prev[1]) * 0.5;
    } else {
      dx = (next[0] - prev[0]) * 0.5;
      dy = (next[1] - prev[1]) * 0.5;
    }
    cp.push([
      [curr[0] - dx / 3, curr[1] - dy / 3],
      [curr[0] + dx / 3, curr[1] + dy / 3],
    ]);
  }
  return cp;
}

function parseHexColor(color: string): [number, number, number] | null {
  const hex = color.trim();
  if (hex.startsWith("#") && hex.length >= 7) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }
  return null;
}

function drawSmoothCurve(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  color: string,
  width: number,
  glow: number
) {
  if (pts.length < 2) return;
  const cp = computeControlPoints(pts);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    ctx.bezierCurveTo(cp[i][1][0], cp[i][1][1], cp[i + 1][0][0], cp[i + 1][0][1], pts[i + 1][0], pts[i + 1][1]);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.stroke();
  ctx.shadowBlur = 0;
  const rgb = parseHexColor(color);
  if (rgb) {
    const [r, g, b] = rgb;
    ctx.strokeStyle = `rgba(${r},${g},${b},0.12)`;
    ctx.lineWidth = width * 4;
    ctx.stroke();
  }
}

function drawSmoothBand(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  pad: FlowChartPadding,
  ch: number,
  color: string,
  alpha: number
) {
  if (pts.length < 2) return;
  const cp = computeControlPoints(pts);
  const baseline = pad.top + ch;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], baseline);
  ctx.lineTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    ctx.bezierCurveTo(cp[i][1][0], cp[i][1][1], cp[i + 1][0][0], cp[i + 1][0][1], pts[i + 1][0], pts[i + 1][1]);
  }
  ctx.lineTo(pts[pts.length - 1][0], baseline);
  ctx.closePath();
  const rgb = parseHexColor(color);
  if (!rgb) return;
  const [r, g, b] = rgb;
  const grad = ctx.createLinearGradient(0, pad.top, 0, baseline);
  grad.addColorStop(0, `rgba(${r},${g},${b},${alpha.toFixed(2)})`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},${(alpha * 0.35).toFixed(2)})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0.01)`);
  ctx.fillStyle = grad;
  ctx.fill();
}

export type DrawFlowCurveOptions = {
  width: number;
  height: number;
  parsed: ParsedFlowData;
  pudongColor: string;
  puxiColor: string;
  gridColor?: string;
  labelColor?: string;
  markerColor?: string;
  reducedMotion?: boolean;
};

export function drawFlowCurve(
  ctx: CanvasRenderingContext2D,
  { width, height, parsed, pudongColor, puxiColor, gridColor, labelColor, markerColor }: DrawFlowCurveOptions
) {
  const W = width;
  const H = height;
  ctx.clearRect(0, 0, W, H);

  const { n, pd, px, times, maxVal, pdPeak, pxPeak, pdPeakIdx, pxPeakIdx } = parsed;
  const pad: FlowChartPadding = { top: H * 0.14, bottom: H * 0.12, left: W * 0.07, right: W * 0.04 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const getX = (i: number) => pad.left + (i / Math.max(n - 1, 1)) * cw;
  const getY = (v: number) => pad.top + ch - (v / maxVal) * ch * 0.88;

  const pdPts: [number, number][] = pd.map((v, i) => [getX(i), getY(v)]);
  const pxPts: [number, number][] = px.map((v, i) => [getX(i), getY(v)]);

  drawSmoothBand(ctx, pxPts, pad, ch, puxiColor, 0.22);
  drawSmoothBand(ctx, pdPts, pad, ch, pudongColor, 0.26);
  drawSmoothCurve(ctx, pdPts, pudongColor, 2.5, 12);
  drawSmoothCurve(ctx, pxPts, puxiColor, 2.5, 12);

  const grid = gridColor ?? "rgba(255,255,255,0.06)";
  const labels = labelColor ?? "rgba(255,255,255,0.45)";
  const marker = markerColor ?? "rgba(255,255,255,0.55)";

  const now = new Date();
  const nowFrac = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
  const mx = pad.left + nowFrac * cw;
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(mx - 10, pad.top, 20, ch);
  ctx.strokeStyle = marker;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mx, pad.top);
  ctx.lineTo(mx, pad.top + ch);
  ctx.stroke();

  const labelStep = Math.max(1, Math.floor(n / 8));
  ctx.fillStyle = labels;
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i < n; i += labelStep) {
    ctx.fillText(times[i], getX(i), pad.top + ch + 18);
  }

  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const frac = i / ySteps;
    const val = Math.round(maxVal * (1 - frac));
    const gy = pad.top + frac * ch;
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, gy);
    ctx.lineTo(pad.left + cw, gy);
    ctx.stroke();
    ctx.fillStyle = labels;
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(String(val), pad.left - 6, gy + 3);
  }

  if (pdPeakIdx >= 0) {
    const lx = getX(pdPeakIdx);
    const ly = getY(pdPeak);
    ctx.fillStyle = pudongColor;
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`浦东 ${pdPeak}`, lx, ly - 8);
  }
  if (pxPeakIdx >= 0) {
    const lx = getX(pxPeakIdx);
    const ly = getY(pxPeak);
    ctx.fillStyle = puxiColor;
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`浦西 ${pxPeak}`, lx, ly - 8);
  }

  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = pudongColor;
  ctx.beginPath();
  ctx.arc(pad.left + 6, pad.top - 14, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText("浦东", pad.left + 16, pad.top - 10);
  ctx.fillStyle = puxiColor;
  ctx.beginPath();
  ctx.arc(pad.left + 72, pad.top - 14, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText("浦西", pad.left + 82, pad.top - 10);

  const timeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  ctx.fillStyle = labels;
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(timeLabel, mx, pad.top - 10);
}
