// ═══ Full 5-state Forklift draw (from AgvQuadrantCanvas) ═══

export function drawForklift(
  ctx: CanvasRenderingContext2D,
  color: string,
  online: boolean,
  act?: string,
  ch?: boolean | null,
  spd?: number | null,
  pbActive?: boolean,
  pbData?: any,
  pbProgress?: number,
  trail?: any[],
  forkH?: number | null,
) {
  let effectiveAct = act;
  if (pbActive && pbData?.segments && pbProgress != null) {
    const totalMs =
      new Date(pbData.to).getTime() - new Date(pbData.from).getTime();
    const nowTs = new Date(pbData.from).getTime() + totalMs * pbProgress;
    for (const seg of pbData.segments) {
      if (
        nowTs >= new Date(seg.startTime).getTime() &&
        nowTs <= new Date(seg.endTime).getTime()
      ) {
        effectiveAct = seg.activityType;
        break;
      }
    }
  }
  const clr = online ? color : "#9ca3af";

  let isMoving: boolean;
  let forkUp: boolean;
  if (pbActive && pbData?.trail) {
    const pbTrail = pbData.trail
      .filter((r: any) => r.x != null && r.y != null)
      .sort(
        (a: any, b: any) =>
          new Date(a.recorded_at).getTime() -
          new Date(b.recorded_at).getTime(),
      );
    const totalMs =
      new Date(pbData.to).getTime() - new Date(pbData.from).getTime();
    const nowTs =
      new Date(pbData.from).getTime() + totalMs * (pbProgress ?? 1);
    let idx = 0;
    for (let i = 0; i < pbTrail.length; i++) {
      if (new Date(pbTrail[i].recorded_at).getTime() >= nowTs) {
        idx = Math.max(0, i - 1);
        break;
      }
    }
    const cutoff = nowTs - 3000;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = Math.max(0, idx - 60); i <= idx; i++) {
      if (new Date(pbTrail[i].recorded_at).getTime() >= cutoff) {
        minX = Math.min(minX, pbTrail[i].x);
        maxX = Math.max(maxX, pbTrail[i].x);
        minY = Math.min(minY, pbTrail[i].y);
        maxY = Math.max(maxY, pbTrail[i].y);
      }
    }
    isMoving = isFinite(minX) && (maxX - minX > 0.02 || maxY - minY > 0.02);
    const curPt = pbTrail[idx];
    forkUp = curPt?.fork_height != null && curPt.fork_height > 0.01;
  } else {
    const now2 = Date.now();
    const recentTrail = (trail || []).filter(
      (p: any) => now2 - p.ts < 3000,
    );
    let moved = false;
    if (recentTrail.length >= 2) {
      const f = recentTrail[0], l = recentTrail[recentTrail.length - 1];
      moved =
        Math.sqrt(
          (l.x - f.x) * (l.x - f.x) + (l.y - f.y) * (l.y - f.y),
        ) > 0.02;
    }
    isMoving = moved || (spd != null && spd > 0.02);
    forkUp = forkH != null && forkH > 0.01;
  }

  let s: string;
  if (ch) s = "charging";
  else if (forkUp && isMoving) s = "moving";
  else if (forkUp && !isMoving) s = "loaded";
  else if (isMoving) s = "default";
  else s = "resting";

  ctx.save();
  ctx.scale(1.28, 1.28);

  const bodyClr =
    s === "charging"
      ? "#22c55e"
      : s === "moving" || s === "loaded"
        ? "#f59e0b"
        : clr;

  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = bodyClr;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.roundRect(-9, 5.5, 18, 3, 1);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-9, -8.5, 18, 3, 1);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = bodyClr;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(-13, -7, 26, 14, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = bodyClr + "cc";
  ctx.beginPath();
  ctx.moveTo(-11, 4);
  ctx.lineTo(-11, -4);
  ctx.lineTo(-14, -3);
  ctx.lineTo(-14, 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.stroke();

  let b = -12, l = 18, g = 6, f = s === "moving" ? l : l * 0.7;
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(b, g);
  ctx.lineTo(b - f, g);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b, -g);
  ctx.lineTo(b - f, -g);
  ctx.stroke();

  if (s === "loaded" || s === "moving") {
    let bx = b - 4 - f, bw = 16, bh = 14;
    ctx.fillStyle = "#d4a574";
    ctx.strokeStyle = "#a0724a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, -bh / 2, bw, bh, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f59e0b";
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx + 3, -bh / 2 + 3, bw - 6, bh - 6, 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.53)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx + 5, -bh / 2 + 4);
    ctx.lineTo(bx + bw - 5, bh / 2 - 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx + bw - 5, -bh / 2 + 4);
    ctx.lineTo(bx + 5, bh / 2 - 4);
    ctx.stroke();
  }

  if (s === "moving") {
    ctx.strokeStyle = "rgba(255,255,255,0.33)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(22 + i * 10, 8 - i * 8);
      ctx.lineTo(30 + i * 10, 8 - i * 8);
      ctx.stroke();
    }
  }

  if (s === "charging") {
    ctx.strokeStyle = "rgba(34,197,238,0.25)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#22c55e";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(21, -8, 8, 16, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#166534";
    ctx.beginPath();
    ctx.roundRect(23, -5, 4, 10, 1);
    ctx.fill();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(21, 0);
    ctx.lineTo(13, 0);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (s === "resting") {
    ctx.fillStyle = "rgba(0,0,0,0.27)";
    ctx.beginPath();
    ctx.roundRect(-13, -7, 26, 14, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.47)";
    ctx.font = "12px system-ui";
    ctx.fillText("Z", 22, 14);
    ctx.fillText("z", 26, 6);
    ctx.fillText("z", 28, -2);
  }

  if (s === "default" && isMoving) {
    ctx.strokeStyle = "rgba(255,255,255,0.33)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(22 + i * 10, 8 - i * 8);
      ctx.lineTo(30 + i * 10, 8 - i * 8);
      ctx.stroke();
    }
  }

  ctx.restore();
}
