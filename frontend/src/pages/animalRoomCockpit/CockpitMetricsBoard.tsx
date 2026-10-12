import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { EChartsOption } from "echarts";
import { CockpitAutoResizeChart } from "./CockpitAutoResizeChart";
import { CockpitAgvMap } from "./CockpitAgvMap";
import { AGV_ROBOTS } from "@/features/agv-tracker/agvRobotConfig";
import { cn } from "@/lib/utils";
import {
  fetchAgvMetricsOverview,
  fetchCageWashCurve,
  fetchDistanceCurve,
  type MetricPoint,
} from "@/api/domains/agvMetrics.api";

const AXIS = {
  axisLine: { lineStyle: { color: "rgba(148,163,184,.35)" } },
  axisLabel: { color: "rgba(203,213,225,.8)", fontSize: 11 },
  splitLine: { lineStyle: { color: "rgba(148,163,184,.12)" } },
};

const TITLE = { textStyle: { color: "rgba(186,230,253,.95)", fontSize: 12 } };

/* 今日曲线两条线的颜色。图例写在外层 HTML 里，颜色只能有这么一处来源，免得改了线色忘了图例 */
const SERIES_AMBER = "#f59e0b";
const SERIES_CYAN = "#38bdf8";

/**
 * 纵轴上限取整到 1/2/2.5/5×10ⁿ。左右两条轴**共用这一个上限**：
 * 各开各的刻度时两条线量级对不上（累计几百、每桶几十），看的人没法把两条放一起比；
 * 共用之后左右刻度完全一致，右轴只是把同一把尺子摆到右边。
 */
function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const e = 10 ** Math.floor(Math.log10(v));
  const m = v / e;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * e;
}

/**
 * 今日清洗 —— 两条线叠一张图：
 * <ul>
 *   <li>**累计**（琥珀实线 + 渐变面积）：今天到此刻一共洗了多少；</li>
 *   <li>**实时数量**（青色阶梯线）：每个 5 分钟桶洗了多少个。桶值 = 累计的逐桶差值，不另向后端要一份数据。</li>
 * </ul>
 * 横轴只画 07:00–20:00：线体这个时段才动，其余时间全是平线，画出来只会把有效的部分压扁。
 *
 * 标题与图例**不画在画布上**（由外层 HTML 表头承担）：小格子里画布顶部要同时塞标题、图例、
 * 和纵轴最高那一格刻度，三者会叠在一起 —— 标题正好压住「120」这类刻度。
 */
function cageTodayOption(points: MetricPoint[]): EChartsOption {
  const inShift = points.filter((p) => {
    const hm = p.at.slice(11, 16);
    return hm >= "07:00" && hm <= "20:00";
  });
  const cum = inShift.map((p) => p.cages ?? 0);
  // 逐桶增量：累计是有重叠桶的累加值，后一个减前一个就是这一桶洗的数量
  const perBucket = cum.map((v, i) => (i === 0 ? v : Math.max(0, Math.round(v - cum[i - 1]))));
  const maxY = niceCeil(Math.max(...cum, 0));
  return {
    /* 必须显式关掉：图表实例是合并更新的（notMerge=false），只把 key 删掉的话，
       上一版的标题/图例还会留在画布上。 */
    title: { show: false },
    legend: { show: false },
    // 顶部只留最高那格刻度的位置（标题搬走后能压到很小），把高度让给曲线
    grid: { left: 40, right: 34, top: 12, bottom: 14 },
    xAxis: {
      type: "category",
      data: inShift.map((p) => p.at.slice(11, 16)),
      ...AXIS,
      boundaryGap: false,
      /* 曲线本身是 5 分钟一个点（156 个点）。标签放不下 156 个「07:05」，所以隔 6 个显示一个（=30 分钟一档）
         并旋转 40°，已经是这个宽度下最密的可读档位；要 5 分钟一档的标签得把图再加宽或加缩放条。 */
      axisLabel: { ...AXIS.axisLabel, fontSize: 10, rotate: 40, interval: 5 },
    },
    yAxis: [
      { type: "value", ...AXIS, min: 0, max: maxY },
      { type: "value", ...AXIS, min: 0, max: maxY, splitLine: { show: false } },
    ],
    series: [
      {
        name: "累计",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: cum,
        lineStyle: { width: 2, color: SERIES_AMBER },
        areaStyle: { color: "rgba(245,158,11,.18)" },
      },
      {
        name: "实时数量",
        type: "line",
        step: "middle",
        showSymbol: false,
        data: perBucket,
        yAxisIndex: 1,
        lineStyle: { width: 1.6, color: SERIES_CYAN },
      },
    ],
  };
}

/**
 * 近 7 天清洗 —— **柱状图**（不是折线）。
 * 按天的量是离散的，柱状才读得出「哪天多、哪天没洗」；**7 天一根不少，没洗的那天立一根 0 高的柱**
 * （横轴由 daysBarsPts 补齐，后端缺数据的天在这里补 0，不跳过）。
 * 今天那根用亮琥珀实心，往期半透明，一眼能分出「今天还在涨」。
 */
function cageDaysBarsOption(points: MetricPoint[]): EChartsOption {
  const today = bjToday();
  return {
    title: { text: "笼盒清洗 · 近 7 天", ...TITLE, left: 4, top: 2 },
    grid: { left: 10, right: 10, top: 20, bottom: 18 },
    xAxis: {
      type: "category",
      data: points.map((p) => p.at.slice(5)),
      axisLine: { lineStyle: { color: "rgba(148,163,184,.35)" } },
      axisTick: { show: false },
      axisLabel: { color: "rgba(203,213,225,.8)", fontSize: 11 },
    },
    // 纵轴不必画：柱高本身表达量级，数量少时直接在柱顶标数（0 的那天也标，柱子空着但说明「这天没洗」）
    yAxis: { type: "value", show: false, scale: true },
    series: [{
      type: "bar",
      barMaxWidth: 26,
      data: points.map((p) => ({
        value: p.cages ?? 0,
        itemStyle: { color: p.at.slice(0, 10) === today ? "#f59e0b" : "rgba(245,158,11,.4)" },
      })),
      // 固定 7 根，柱顶都标数（0 的那天也标 —— 柱子空着，但说明「这天没洗」）
      label: { show: true, position: "top", fontSize: 11, color: "rgba(203,213,225,.9)", formatter: "{c}" },
    }],
  };
}

interface RobotPart {
  label: string;
  color: string;
  /** 米（取整） */
  value: number;
}

/** 把 hex 压暗 —— 2.5D 饼图「侧壁」的颜色。f 越大越暗 */
function darken(hex: string, f: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - f)));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

/** 侧壁层数（每层下移 1.1% 容器高，5 层约 3~4px 视觉厚度） */
const WALL_LAYERS = 5;
const WALL_STEP = 1.1;
/** 顶面半径。侧壁必须用**同一个半径**，只把圆心往下挪 —— 见 robotsPieOption 的注释。
    环不能太大：半径是按容器**短边**算的，格子接近正方形时环会撑到贴住左右两边，
    外面的标签就没地方放（会被挤掉或截成「380. . . .」）。留出两侧各 ~60px 给标签。 */
const PIE_RADIUS: [string, string] = ["38%", "62%"];

/**
 * 六台车里程占比 —— **2.5D 环形饼**（每台车一个色，与小车台配色同源），洞心写区间合计。
 *
 * 厚度是**叠饼**做的：同一份数据画 5 层，自下而上逐层上移并逐层提亮，
 * 只留最上层出标签。这是纯配置实现，不引 echarts-gl（为了一个饼图加 3D 渲染器不值当）。
 *
 * 每片都标「车名 + 里程（米）」，只给数值分不清是哪台车；压不下的大扇区改成压在环上，小扇区才引到外面。
 * 标题不画在画布上，由外层 HTML 表头写 —— 表头上还要挂区间切换按钮，单位（m）也写在表头上。
 */
function robotsPieOption(totalMeters: number, parts: RobotPart[]): EChartsOption {
  const slices = parts.map((p) => ({
    name: p.label,
    value: p.value,
    itemStyle: { color: p.color },
  }));
  return {
    // 洞心的合计：环饼的圆心 = 容器中心，所以直接居中放一行字。
    // **只放数字不放单位**（单位在卡片表头写），字号又要压到洞里放得下 —— 七位数按米写得很长。
    graphic: [{
      type: "text",
      left: "center",
      top: "middle",
      silent: true,
      style: {
        text: int(totalMeters),
        fill: "rgba(207,250,254,.95)",
        font: "600 14px ui-monospace, SFMono-Regular, Menlo, monospace",
      },
    }],
    series: [
      /* 侧壁：同一份数据多画几层，每层圆心往下挪一点、颜色压暗一点，最深的画在最下面。
         半径必须和顶面**完全一致**（早先侧壁写成 ["42%","70%"]、比顶面大一圈，
         结果那一圈从顶面四周全露出来 —— 看着不是「厚度」，是一圈灰边）。同半径时
         侧壁只在下方露出来，才是立体的侧壁。 */
      ...Array.from({ length: WALL_LAYERS - 1 }, (_, k) => {
        const depth = WALL_LAYERS - 1 - k;
        return {
          type: "pie" as const,
          radius: PIE_RADIUS,
          center: ["50%", `${50 + depth * WALL_STEP}%`],
          silent: true,
          label: { show: false },
          labelLine: { show: false },
          data: parts.map((p) => ({
            value: p.value,
            itemStyle: { color: darken(p.color, 0.15 + depth * 0.13) },
          })),
        };
      }),
      {
        type: "pie" as const,
        radius: PIE_RADIUS,
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        // 大扇区把数字**压在饼上**（不再全部甩到外面把窗口顶出去）；小扇区塞不下才引出去
        data: slices.map((s) => ({
          ...s,
          label: {
            position:
              totalMeters > 0 && s.value / totalMeters >= 0.14 ? ("inside" as const) : ("outside" as const),
          },
        })),
        label: {
          show: true,
          /* **每一片都要写出是哪台车** —— 只给个数值，看的人分不清是谁。
             压在饼上时字号小一号（环带就二十来像素，两行大字塞不下），引到外面才用大字号。
             数值按米、**不带千分位**：带上的话「1,840,000」比留给标签的宽度还长，会被截断。 */
          formatter: (p: { dataIndex: number }) => {
            const it = parts[p.dataIndex];
            if (!it) return "";
            const inside = totalMeters > 0 && it.value / totalMeters >= 0.14;
            const num = String(Math.round(it.value));
            return inside ? `{ni|${it.label}}\n{ki|${num}}` : `{no|${it.label}}\n{ko|${num}}`;
          },
          rich: {
            no: { fontSize: 11, color: "rgba(226,232,240,.92)" },
            ko: {
              fontSize: 12,
              fontWeight: "bold",
              color: "#e0f2fe",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              padding: [1, 0, 0, 0],
              textShadowColor: "rgba(2,6,23,.65)",
              textShadowBlur: 4,
            },
            ni: { fontSize: 9, color: "rgba(226,232,240,.9)" },
            ki: {
              fontSize: 11,
              fontWeight: "bold",
              color: "#e0f2fe",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              padding: [1, 0, 0, 0],
              textShadowColor: "rgba(2,6,23,.65)",
              textShadowBlur: 3,
            },
          },
        },
        labelLine: { length: 5, length2: 6, lineStyle: { color: "rgba(148,163,184,.4)" } },
      },
    ],
  };
}

/** 千分位整数。驾驶舱的里程一律按**米**显示（公里带一位小数太粗，看不出当天涨了多少），所以就是它 */
function int(n: number | null | undefined): string {
  return Math.round(Number(n) || 0).toLocaleString("en-US");
}

/** 北京「今天」的日期串。别用 toISOString()——那是 UTC 日，北京 08:00 前会差一天 */
function bjToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

/** 日期串平移 N 天（纯日期串按 UTC 解析，无时区漂移） */
function shiftDay(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 里程饼的时间窗口。`days=0` 表示不限（总计）；「今天」那一档走实时值 */
const PIE_RANGES = [
  { key: "total", label: "总计", days: 0 },
  { key: "d30", label: "近 30 天", days: 30 },
  { key: "d7", label: "近 7 天", days: 7 },
  { key: "today", label: "今天", days: 1 },
] as const;
type PieRange = (typeof PIE_RANGES)[number]["key"];

/**
 * 翻牌的两种节奏：
 * <ul>
 *   <li>`default`：按差值长短滚一段（每单位 40ms，夹在 0.4~3.6 秒），缓出 —— 里程那类小数值用；</li>
 *   <li>`cage`：**每秒 +1 匀速**（笼盒统计口径）。一次抬臂 +80，所以一次要慢慢滚 80 秒。
 *       **必须线性**：缓出的话前几秒就冲掉一大半，「每秒 +1」变成「每秒两三只」。
 *       上限 2 分钟只是兜底：停机几小时再上来、一次补几百只时，不至于要数到一个小时后。</li>
 * </ul>
 */
const PACES = {
  default: { perUnit: 40, minMs: 400, maxMs: 3_600, linear: false },
  cage: { perUnit: 1000, minMs: 0, maxMs: 120_000, linear: true },
} as const;
type Pace = keyof typeof PACES;

/**
 * 连续翻牌：目标值一变，就用 rAF 把显示值从当前慢慢数到新值，**中途每个整数都真的翻过去**。
 *
 * 之前是直接跳到新值、只让位图滚 0.7 秒 —— 一次触发加 80（一台车臂一次抬臂的量）就「啪」地跳过去，
 * 看着不像产线在持续出货。现在按 `pace` 一格一格滚上来。
 *
 * 首次挂载不滚；**数据第一次回来那次也直接落位**（挂载时是「还没加载」的 0，
 * 按每秒 +1 数到几万只得一整天，所以只对之后的变化做补间）。
 */
function useCountUp(target: number, pace: Pace = "default") {
  const { perUnit, minMs, maxMs, linear } = PACES[pace];
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  /* 挂载时还是 0（查询没回来）→ 头一次变化是「数据到了」，直接落位，别从 0 慢慢数上去 */
  const jumpNext = useRef(!(target > 0));

  useEffect(() => {
    const from = shownRef.current;
    if (!Number.isFinite(target) || from === target) return;
    if (jumpNext.current) {
      jumpNext.current = false;
      shownRef.current = target;
      setShown(target);
      return;
    }
    // 系统开了「减少动态效果」就直接落到目标值（与 CSS 里那套 motion-reduce 一个口径）
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const dur = Math.min(maxMs, Math.max(minMs, Math.abs(target - from) * perUnit));
    const t0 = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - t0) / dur);
      const k = linear ? t : 1 - (1 - t) ** 3; // 默认缓出：冲得快、停得稳
      const v = from + (target - from) * k;
      shownRef.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
      else shownRef.current = target;
    });
    return () => cancelAnimationFrame(raf);
  }, [target, perUnit, minMs, maxMs, linear]);

  return shown;
}

/**
 * 逐位滚动位置。`places` 由低位到高位。
 *
 * 低位一直在滚（3.2 = 正从 3 滚向 4）；**高位只在下一位从 9 滚到 0 的那一小段里跟着滚**。
 * 不这么做的话，1234.7 的千位会一直半露着「2」—— 像块坏掉的里程表。
 */
function digitPositions(value: number, places: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < places.length; i++) {
    if (i === 0) {
      out.push((((value / places[0]) % 10) + 10) % 10);
      continue;
    }
    const base = ((Math.floor(value / places[i]) % 10) + 10) % 10;
    out.push(base + Math.max(0, out[i - 1] - 9));
  }
  return out;
}

/** 一位数的滚轮：`pos` 是这一位连续停在哪儿（0~10）。只渲染窗口上下两位，不铺 0~9 十条 */
function DigitRoll({ pos }: { pos: number }) {
  const whole = Math.floor(pos);
  const d1 = whole % 10;
  const frac = pos - whole;
  return (
    <span className="inline-block overflow-hidden" style={{ height: "1em" }}>
      <span className="flex flex-col" style={{ transform: `translateY(-${frac}em)` }}>
        <span style={{ height: "1em", lineHeight: 1 }}>{d1}</span>
        <span style={{ height: "1em", lineHeight: 1 }}>{(d1 + 1) % 10}</span>
      </span>
    </span>
  );
}

/**
 * 数字翻牌：值一变就连续数上去（见 useCountUp），每一位纵向滚动。
 * 千分位逗号、小数点这类非数字字符原样显示、不参与滚动。
 * 宽度靠等宽字体保证（父级已经是 font-mono）。
 */
function Odometer({ value, format, pace }: {
  value: number;
  format: (n: number) => string;
  /** 翻牌节奏，见 PACES；不传走默认 */
  pace?: Pace;
}) {
  const shown = useCountUp(value, pace);
  const text = format(shown);
  const display = Number(text.replace(/,/g, "")) || 0;

  // 每个数字字符占哪一位：整数部分从右往左 1/10/100…，小数部分从左往右 0.1/0.01…
  const chars = [...text];
  const placeOf = new Array<number>(chars.length).fill(0);
  const dot = text.indexOf(".");
  let place = 1;
  for (let i = (dot < 0 ? chars.length : dot) - 1; i >= 0; i--) {
    if (chars[i] >= "0" && chars[i] <= "9") {
      placeOf[i] = place;
      place *= 10;
    }
  }
  if (dot >= 0) {
    let f = 0.1;
    for (let i = dot + 1; i < chars.length; i++) {
      if (chars[i] >= "0" && chars[i] <= "9") {
        placeOf[i] = f;
        f /= 10;
      }
    }
  }
  const order = chars.map((_, i) => i).filter((i) => placeOf[i] > 0).sort((a, b) => placeOf[a] - placeOf[b]);
  const pos = digitPositions(display, order.map((i) => placeOf[i]));
  const posAt = new Map(order.map((i, k) => [i, pos[k]]));

  return (
    <span className="inline-flex">
      {chars.map((ch, i) =>
        placeOf[i] > 0 ? (
          <DigitRoll key={i} pos={posAt.get(i) ?? 0} />
        ) : (
          <span key={i} style={{ lineHeight: 1 }}>{ch}</span>
        ),
      )}
    </span>
  );
}

function StatBlock({ title, children, className }: {
  title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn(
      "flex min-w-0 flex-col rounded-lg border border-cyan-500/20 bg-slate-950/60 px-2.5 py-2",
      className,
    )}>
      <div className="text-xs font-medium tracking-wide text-slate-400">{title}</div>
      {children}
    </div>
  );
}

const TILE = "relative min-h-0 min-w-0 rounded-lg border border-cyan-500/20 bg-slate-950/40 p-1";

/**
 * 驾驶舱「运行指标」看板 —— 与温湿度压强模式互斥，整片替换。
 * 设计依据见 docs/02-设计存档/计划文档/2026-10-10-AGV笼盒清洗指标与驾驶舱指标看板-架构设计.md
 *
 * 版式：
 * <ul>
 *   <li>顶部两块大指标：<b>笼盒统计</b>（总清洗笼盒 / 今日实时清洗）与
 *       <b>总累计路程</b>（总里程 / 今日实时总里程，后面挂六台车的横向明细）；</li>
 *   <li>左 40% 上下平分：上半再平分为「今日清洗爬升（折线）」与「近 7 天清洗（柱状，含今天）」；
 *       下半整块给「六台车里程占比」（2.5D 环饼，带总计/近 30 天/近 7 天/今天的区间切换，
 *       宽格子才放得下车名+公里标签）；</li>
 *   <li>右 60%：AGV 实况地图（画布与配置全部复用小车台）。</li>
 * </ul>
 */
export function CockpitMetricsBoard() {
  const overview = useQuery({
    queryKey: ["agvMetricsOverview"],
    queryFn: fetchAgvMetricsOverview,
    // 驾驶舱要「实时」，5 秒一次（与顶栏 AGV 状态同一节奏）
    refetchInterval: 5_000,
    staleTime: 0,
  });
  const todayCurve = useQuery({
    queryKey: ["agvCageWashToday"],
    queryFn: () => fetchCageWashCurve("today"),
    refetchInterval: 15_000,
    staleTime: 0,
  });
  const daysCurve = useQuery({
    queryKey: ["agvCageWashDays"],
    queryFn: () => fetchCageWashCurve("days", 7),
    staleTime: 5 * 60_000,
  });
  // 饼图的数据源：日行表里每台车每天的里程（跟顶部「总累计路程」同一个来源）。
  // 一次取满一年，四个时间窗口在前端切 —— 总共有几十行，来回切窗口不必再打后端。
  const distance = useQuery({
    queryKey: ["agvDistance365"],
    queryFn: () => fetchDistanceCurve(365),
    staleTime: 5 * 60_000,
  });
  const [pieRange, setPieRange] = useState<PieRange>("today");

  const todayPts = todayCurve.data ?? [];
  const daysPts = daysCurve.data ?? [];
  const o = overview.data;

  const pie = useMemo(() => {
    const today = bjToday();
    const spec = PIE_RANGES.find((r) => r.key === pieRange) ?? PIE_RANGES[1];
    const byRobot: Record<string, number> = {};
    // 「今天」优先走实时值：日行表里今天那行要等次日 00:05 封存，白天查表恒空
    const live = pieRange === "today" ? o?.todayLive?.odoByRobot : undefined;
    if (live) {
      for (const [ip, v] of Object.entries(live)) byRobot[ip] = Number(v) || 0;
    } else {
      const from = spec.days <= 0 ? "" : shiftDay(today, -(spec.days - 1));
      for (const s of distance.data ?? []) {
        let sum = 0;
        for (const p of s.points) {
          const at = p.at.slice(0, 10);
          if (at > today) continue;               // 未来的行不进窗口
          if (from && at < from) continue;
          sum += Number(p.meters) || 0;
        }
        byRobot[s.key] = sum;
      }
    }
    // 没动的车不进饼：0 值的扇区画不出来，只会多出一堆「AGV-3 0%」的标签
    const parts = AGV_ROBOTS
      .map((r) => ({ label: r.label, color: r.color, value: Math.round(byRobot[r.ip] ?? 0) }))
      .filter((p) => p.value > 0);
    return { parts, total: parts.reduce((a, b) => a + b.value, 0), label: spec.label };
  }, [distance.data, o?.todayLive, pieRange]);

  const loading = overview.isLoading || todayCurve.isLoading;
  const todayChart = useMemo(() => cageTodayOption(todayPts), [todayPts]);
  // 柱状要含「今天」：日行表里今天那行要等次日 00:05 才封存，白天查表就是没有今天这一根 ——
  // 拿今日曲线的实时值补上，否则柱状图永远比顶部的今日数字少一根。
  // 而且**后端只回有数据的天**（缺数据的那天连点都不出），横轴必须自己补齐整整 7 天：
  // 那天没洗也要立一根 0 高的柱，否则「哪几天没洗」根本数不出来。
  const daysBarsPts = useMemo(() => {
    const todayStr = bjToday();
    const byDay = new Map<string, number>();
    for (const p of daysPts) byDay.set(p.at.slice(0, 10), p.cages ?? 0);
    if (!byDay.has(todayStr)) {
      const live = todayPts.length ? todayPts[todayPts.length - 1]?.cages : undefined;
      if (live != null) byDay.set(todayStr, live);
    }
    return Array.from({ length: 7 }, (_, i) => {
      const d = shiftDay(todayStr, i - 6);
      return { at: d, cages: byDay.get(d) ?? 0 };
    });
  }, [daysPts, todayPts]);
  const daysChart = useMemo(() => cageDaysBarsOption(daysBarsPts), [daysBarsPts]);
  const pieChart = useMemo(
    () => robotsPieOption(pie.total, pie.parts),
    [pie.parts, pie.total],
  );

  const todayLive = o?.todayLive;
  const cumByRobot = o?.odoTotalByRobot ?? {};
  const todayByRobot = todayLive?.odoByRobot ?? {};
  const odoTodayTotal = todayLive?.odoTotal ?? 0;

  // 今日若已封存（回填过今天，或已跨过 00:05），总数里本来就含今天，别再叠一遍
  const todayFrozen = (o?.todayFrozen?.length ?? 0) > 0;
  const liveCages = todayFrozen ? 0 : o?.cageWashTodayLive ?? 0;
  // 总数 = 已封存的历史 **+ 今日实时**：今天涨的时候总数跟着涨，不必等次日封存才动
  const cageTotal = (o?.cageWashTotal ?? 0) + liveCages;
  const odoTotalAll = (o?.odoTotal ?? 0) + (todayFrozen ? 0 : odoTodayTotal);
  /** 单车累计（同样含今日实时） */
  const cumOf = (ip: string) => (Number(cumByRobot[ip]) || 0) + (todayFrozen ? 0 : Number(todayByRobot[ip]) || 0);

  // 今天一次抬臂都没有时，今日曲线是满屏 0 的平坦线，看着像坏了 —— 盖一行说明。
  // 只在「整条都还是 0」时提示；一旦有了第一条记录就撤掉，别挡住正在爬升的曲线。
  const todayAllZero = todayPts.length > 0 && todayPts.every((p) => !p.cages);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1 p-1 sm:gap-1.5 sm:p-1.5">
      {/* 顶部两块大指标：一格一个「总量 + 今日实时」，路程那格再挂六台车明细 */}
      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
        {/* 笼盒统计只占它内容的宽度（flex-none），余下的横向空间全让给右边 —— 六台车才铺得开 */}
        <StatBlock title="笼盒统计" className="sm:flex-none">
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-3xl font-semibold leading-none text-cyan-100">
              <Odometer value={cageTotal} format={int} pace="cage" />
            </span>
            <span className="font-mono text-xl leading-none text-slate-600">/</span>
            <span className="font-mono text-xl font-semibold leading-none text-amber-300">
              <Odometer value={liveCages} format={int} pace="cage" />
            </span>
            <span className="text-sm text-slate-400">个 · 总清洗 / 今日实时</span>
          </div>
        </StatBlock>

        <StatBlock title="总累计路程" className="sm:flex-1">
          {/* 总指标与六台车**同一行**：六格紧跟在总指标后面，省下第二行的高度留给下面的图。
              整行 items-stretch → 六格撑满这一行的高度（但不高于左边的总指标），格内两行垂直居中 */}
          <div className="mt-1 flex flex-wrap items-stretch gap-x-3 gap-y-1">
            <span className="flex flex-wrap items-baseline gap-x-2 self-center">
              <span className="font-mono text-3xl font-semibold leading-none text-cyan-100">
                <Odometer value={odoTotalAll} format={int} />
              </span>
              <span className="font-mono text-xl leading-none text-slate-600">/</span>
              <span className="font-mono text-xl font-semibold leading-none text-amber-300">
                <Odometer value={todayFrozen ? 0 : odoTodayTotal} format={int} />
              </span>
              <span className="text-sm text-slate-400">m · 六台车累计 / 今日实时</span>
            </span>
            <span className="flex min-w-0 flex-1 items-stretch justify-end gap-1">
              {AGV_ROBOTS.map((r) => (
                <span
                  key={r.ip}
                  className="flex min-w-0 flex-1 flex-col justify-center rounded border border-cyan-500/15 bg-slate-900/40 px-1.5 py-0.5"
                  title={`${r.label} · 累计 ${int(cumOf(r.ip))} m · 今日 ${int(todayFrozen ? 0 : Number(todayByRobot[r.ip]) || 0)} m`}
                >
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                    <span className="truncate font-mono text-xs text-slate-400">{r.label}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1">
                    <span className="font-mono text-base font-semibold leading-none text-slate-100">
                      <Odometer value={cumOf(r.ip)} format={int} />
                    </span>
                    <span className="font-mono text-xs leading-none text-slate-600">/</span>
                    <span className="font-mono text-xs leading-none text-amber-300/90">
                      <Odometer value={todayFrozen ? 0 : Number(todayByRobot[r.ip]) || 0} format={int} />
                    </span>
                    <span className="text-[10px] text-slate-500">m</span>
                  </span>
                </span>
              ))}
            </span>
          </div>
        </StatBlock>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          加载指标…
        </div>
      ) : (
        /* 主区：左 40%（上下平分，上半再平分 → 今日折线 | 近 7 天柱状；下半整块给 2.5D 环饼，够横放标签），
           右 60% 整块地图。
           每层都要 min-w-0：图与地图画布内在宽度都不小，不给 min-w-0 网格会按最小内容宽度撑开
           （实测两列各约 1000px、整块溢出视口，2fr/3fr 形同虚设）。 */
        <div className="grid min-h-0 min-w-0 flex-1 gap-1 sm:gap-1.5 lg:grid-cols-[2fr_3fr]">
          <div className="grid min-h-0 min-w-0 grid-rows-2 gap-1 sm:gap-1.5">
            <div className="grid min-h-0 min-w-0 grid-cols-2 gap-1 sm:gap-1.5">
              <div className={cn(TILE, "flex flex-col")}>
                {/* 表头兼区间切换：标题不画在画布上，让给这排按钮 */}
                <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-0.5 pb-0.5">
                  <span className="text-xs font-medium tracking-wide text-cyan-100/90">
                    六台车里程占比 · {pie.label}（m）
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-900/70 p-0.5">
                    {PIE_RANGES.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setPieRange(r.key)}
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                          pieRange === r.key
                            ? "bg-cyan-500/25 text-cyan-50 shadow-sm"
                            : "text-slate-400 hover:text-slate-200",
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </span>
                </div>
                <div className="relative min-h-0 flex-1">
                  <CockpitAutoResizeChart option={pieChart} className="h-full min-h-0 w-full min-w-0" style={{ height: "100%" }} />
                  {pie.total === 0 ? (
                    <div className="pointer-events-none absolute inset-x-0 top-6 flex flex-col items-center gap-0.5 text-center">
                      <span className="text-sm text-slate-400">
                        {pieRange === "today" ? "今日暂无行驶记录" : "该区间暂无行驶记录"}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className={TILE}>
                <CockpitAutoResizeChart option={daysChart} className="h-full min-h-0 w-full min-w-0" style={{ height: "100%" }} />
              </div>
            </div>
            <div className={cn(TILE, "flex flex-col")}>
              {/* 标题和图例都由这排 HTML 承担，不画进画布：小格子里画布顶部塞不下「标题 + 图例 + 最高那格刻度」，
                  硬塞的结果就是标题压住纵轴刻度。搬出来之后 grid.top 也能压得更小，把高度让给曲线。 */}
              <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-0.5 px-0.5 pb-0.5">
                <span className="text-[11px] font-medium tracking-wide text-cyan-100/90">今日笼盒清洗</span>
                {/* 图例条目要 whitespace-nowrap：格子只有 200 出头，不加会把「累积」拆成上下两行 */}
                <span className="flex shrink-0 items-center gap-2 text-[10px] text-slate-300/85">
                  <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
                    <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: SERIES_AMBER }} aria-hidden />
                    累计
                  </span>
                  <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
                    <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: SERIES_CYAN }} aria-hidden />
                    实时 5 分钟
                  </span>
                </span>
              </div>
              <div className="relative min-h-0 flex-1">
                <CockpitAutoResizeChart option={todayChart} className="h-full min-h-0 w-full min-w-0" style={{ height: "100%" }} />
                {todayAllZero ? (
                  <div className="pointer-events-none absolute inset-x-0 top-6 flex flex-col items-center gap-0.5 text-center">
                    <span className="text-sm text-slate-400">今日暂无抬臂记录</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <CockpitAgvMap />
        </div>
      )}
    </div>
  );
}
