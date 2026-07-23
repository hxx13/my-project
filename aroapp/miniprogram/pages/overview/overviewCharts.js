/** 概览页 canvas 绑图工具（轻量，无 echarts 依赖） */

const COLORS = {
  brand: '#ac1736',
  pudong: '#2563eb',
  puxi: '#16a34a',
  grid: 'rgba(148, 163, 184, 0.35)',
  gridLight: 'rgba(148, 163, 184, 0.18)',
  axis: '#64748b',
  text: '#334155',
  textMuted: '#94a3b8',
  bgDark: '#0f172a',
};

function setupCanvas(page, selector, cb) {
  const query = wx.createSelectorQuery().in(page);
  query
    .select(selector)
    .fields({ node: true, size: true })
    .exec((res) => {
      const item = res && res[0];
      if (!item || !item.node) return;
      const canvas = item.node;
      const w = item.width;
      const h = item.height;
      if (w <= 0 || h <= 0) return;
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(wx.getSystemInfoSync().pixelRatio || 2, 3);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cb(ctx, w, h, canvas);
    });
}

function drawGrid(ctx, w, h, pad, xTicks, yTicks) {
  ctx.strokeStyle = COLORS.gridLight;
  ctx.lineWidth = 1;
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  for (let i = 0; i <= yTicks; i += 1) {
    const y = pad.top + (chartH * i) / yTicks;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  }
  for (let i = 0; i <= xTicks; i += 1) {
    const x = pad.left + (chartW * i) / xTicks;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, h - pad.bottom);
    ctx.stroke();
  }
}

function formatAxisNum(n) {
  const v = Number(n) || 0;
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

/** 双折线时段图（共享 X 轴） */
function drawDualLineChart(page, selector, lineRows) {
  setupCanvas(page, selector, (ctx, w, h) => {
    const rows = Array.isArray(lineRows) ? lineRows : [];
    ctx.clearRect(0, 0, w, h);

    if (!rows.length) {
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无时段数据', w / 2, h / 2);
      return;
    }

    const pad = { top: 16, right: 12, bottom: 28, left: 36 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const maxVal = rows.reduce((m, r) => Math.max(m, r.pudong || 0, r.puxi || 0), 1) || 1;
    const yMax = Math.ceil(maxVal * 1.15) || 1;

    drawGrid(ctx, w, h, pad, Math.min(rows.length - 1, 6), 4);

    ctx.fillStyle = COLORS.axis;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i += 1) {
      const val = Math.round((yMax * (4 - i)) / 4);
      const y = pad.top + (chartH * i) / 4;
      ctx.fillText(formatAxisNum(val), pad.left - 6, y);
    }

    const step = rows.length > 1 ? chartW / (rows.length - 1) : 0;
    const xAt = (idx) => pad.left + step * idx;
    const yAt = (v) => pad.top + chartH - (v / yMax) * chartH;

    const labelEvery = Math.max(1, Math.ceil(rows.length / 6));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    rows.forEach((row, idx) => {
      if (idx % labelEvery !== 0 && idx !== rows.length - 1) return;
      const label = String(row.time || '').slice(-5);
      ctx.fillText(label, xAt(idx), h - pad.bottom + 6);
    });

    function strokeSeries(key, color) {
      ctx.beginPath();
      rows.forEach((row, idx) => {
        const x = xAt(idx);
        const y = yAt(row[key] || 0);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();

      rows.forEach((row, idx) => {
        const x = xAt(idx);
        const y = yAt(row[key] || 0);
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
    }

    strokeSeries('pudong', COLORS.pudong);
    strokeSeries('puxi', COLORS.puxi);
  });
}

/** 环形分布图 */
function drawDonutChart(page, selector, pieRows, total, accent) {
  setupCanvas(page, selector, (ctx, w, h) => {
    const rows = Array.isArray(pieRows) ? pieRows : [];
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const outerR = Math.min(w, h) * 0.38;
    const innerR = outerR * 0.58;
    const safeTotal = total > 0 ? total : rows.reduce((s, r) => s + (r.value || 0), 0);

    const palette = [
      accent,
      '#6366f1',
      '#0ea5e9',
      '#14b8a6',
      '#f59e0b',
      '#ec4899',
    ];

    if (!rows.length || safeTotal <= 0) {
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, (outerR + innerR) / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无', cx, cy);
      return;
    }

    let start = -Math.PI / 2;
    rows.forEach((row, idx) => {
      const slice = ((row.value || 0) / safeTotal) * Math.PI * 2;
      const end = start + slice;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, start, end);
      ctx.arc(cx, cy, innerR, end, start, true);
      ctx.closePath();
      ctx.fillStyle = row.color || palette[idx % palette.length];
      ctx.fill();
      start = end;
    });

    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatAxisNum(safeTotal), cx, cy - 4);
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '10px sans-serif';
    ctx.fillText('合计', cx, cy + 12);
  });
}

/** 迷你 sparkline */
function drawSparkline(page, selector, values, color) {
  setupCanvas(page, selector, (ctx, w, h) => {
    const pts = Array.isArray(values) ? values : [];
    ctx.clearRect(0, 0, w, h);
    if (pts.length < 2) {
      ctx.strokeStyle = COLORS.gridLight;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(4, h / 2);
      ctx.lineTo(w - 4, h / 2);
      ctx.stroke();
      return;
    }
    const max = Math.max(...pts, 1);
    const pad = 4;
    const chartW = w - pad * 2;
    const chartH = h - pad * 2;
    const step = chartW / (pts.length - 1);

    ctx.beginPath();
    pts.forEach((v, idx) => {
      const x = pad + step * idx;
      const y = pad + chartH - (v / max) * chartH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.lineTo(pad + step * (pts.length - 1), h - pad);
    ctx.lineTo(pad, h - pad);
    ctx.closePath();
    const hex = color.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    ctx.fillStyle = `rgba(${r},${g},${b},0.12)`;
    ctx.fill();
  });
}

/** 横向排行柱状图（带坐标轴） */
function drawRankBarChart(page, selector, rankRows) {
  setupCanvas(page, selector, (ctx, w, h) => {
    const rows = (Array.isArray(rankRows) ? rankRows : []).slice(0, 12);
    ctx.clearRect(0, 0, w, h);

    if (!rows.length) {
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无排行数据', w / 2, h / 2);
      return;
    }

    const maxVal = rows.reduce((m, r) => Math.max(m, r.value || 0), 1) || 1;
    const pad = { top: 8, right: 12, bottom: 8, left: 88 };
    const barGap = 6;
    const barH = Math.max(14, (h - pad.top - pad.bottom - barGap * (rows.length - 1)) / rows.length);
    const chartW = w - pad.left - pad.right;

    drawGrid(ctx, w, h, { top: pad.top, right: pad.right, bottom: pad.bottom, left: pad.left }, 4, rows.length);

    ctx.fillStyle = COLORS.axis;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i += 1) {
      const val = Math.round((maxVal * i) / 4);
      const x = pad.left + (chartW * i) / 4;
      ctx.fillText(formatAxisNum(val), x, h - pad.bottom + 2);
    }

    rows.forEach((row, idx) => {
      const y = pad.top + idx * (barH + barGap);
      const barW = ((row.value || 0) / maxVal) * chartW;

      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.text;
      ctx.font = '10px sans-serif';
      const name = String(row.name || '-');
      const shortName = name.length > 7 ? `${name.slice(0, 6)}…` : name;
      ctx.fillText(shortName, pad.left - 8, y + barH / 2);

      const rankNo = row.rankNo || idx + 1;
      const barColor = rankNo <= 3 ? COLORS.brand : '#475569';
      ctx.fillStyle = rankNo <= 3 ? 'rgba(172, 23, 54, 0.85)' : 'rgba(71, 85, 105, 0.75)';
      ctx.beginPath();
      const r = 3;
      ctx.moveTo(pad.left + r, y);
      ctx.lineTo(pad.left + barW - r, y);
      ctx.quadraticCurveTo(pad.left + barW, y, pad.left + barW, y + r);
      ctx.lineTo(pad.left + barW, y + barH - r);
      ctx.quadraticCurveTo(pad.left + barW, y + barH, pad.left + barW - r, y + barH);
      ctx.lineTo(pad.left + r, y + barH);
      ctx.quadraticCurveTo(pad.left, y + barH, pad.left, y + barH - r);
      ctx.lineTo(pad.left, y + r);
      ctx.quadraticCurveTo(pad.left, y, pad.left + r, y);
      ctx.closePath();
      ctx.fill();

      if (barW > 28) {
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(String(row.value || 0), pad.left + barW - 6, y + barH / 2);
      }
    });
  });
}

/** 双区对比环（浦东 vs 浦西占比） */
function drawCompareRing(page, selector, pudongTotal, puxiTotal) {
  setupCanvas(page, selector, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const total = (pudongTotal || 0) + (puxiTotal || 0);
    const cx = w / 2;
    const cy = h / 2;
    const outerR = Math.min(w, h) * 0.42;
    const innerR = outerR * 0.72;

    if (total <= 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, (outerR + innerR) / 2, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    const pdAngle = ((pudongTotal || 0) / total) * Math.PI * 2;
    const start = -Math.PI / 2;

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, start, start + pdAngle);
    ctx.arc(cx, cy, innerR, start + pdAngle, start, true);
    ctx.closePath();
    ctx.fillStyle = COLORS.pudong;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, start + pdAngle, start + Math.PI * 2);
    ctx.arc(cx, cy, innerR, start + Math.PI * 2, start + pdAngle, true);
    ctx.closePath();
    ctx.fillStyle = COLORS.puxi;
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatAxisNum(total), cx, cy - 2);
    ctx.font = '9px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('总进出', cx, cy + 12);
  });
}

module.exports = {
  COLORS,
  drawDualLineChart,
  drawDonutChart,
  drawSparkline,
  drawRankBarChart,
  drawCompareRing,
};
