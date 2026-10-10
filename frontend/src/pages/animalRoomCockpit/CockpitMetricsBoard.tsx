import { useMemo, useState } from "react";
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

/**
 * 今日清洗爬升 —— **面积折线**。
 * 这是时间序列（一天内累加），线/面积是它的本命形式，所以这一处保留折线，也保留坐标。
 */
function cageTodayOption(points: MetricPoint[]): EChartsOption {
  return {
    title: { text: "今日笼盒清洗（实时累计）", ...TITLE, left: 4, top: 2 },
    grid: { left: 40, right: 10, top: 20, bottom: 14 },
    xAxis: {
      type: "category",
      data: points.map((p) => p.at.slice(11, 16)),
      ...AXIS,
      boundaryGap: false,
    },
    yAxis: { type: "value", ...AXIS },
    series: [{
      type: "line",
      smooth: true,
      showSymbol: false,
      data: points.map((p) => p.cages ?? null),
      lineStyle: { width: 2, color: "#f59e0b" },
      areaStyle: { color: "rgba(245,158,11,.18)" },
    }],
  };
}

/**
 * 近 30 天清洗 —— **柱状图**（不是折线）。
 * 按天的量是离散的，柱状才读得出「哪天多、哪天没洗」；缺数据的天不出柱（不补 0）；
 * 今天那根用亮琥珀实心，往期半透明，一眼能分出「今天还在涨」。
 */
function cageDaysBarsOption(points: MetricPoint[]): EChartsOption {
  const today = bjToday();
  const few = points.length <= 12;
  return {
    title: { text: "笼盒清洗 · 近 30 天", ...TITLE, left: 4, top: 2 },
    grid: { left: 10, right: 10, top: 20, bottom: 18 },
    xAxis: {
      type: "category",
      data: points.map((p) => p.at.slice(5)),
      axisLine: { lineStyle: { color: "rgba(148,163,184,.35)" } },
      axisTick: { show: false },
      axisLabel: { color: "rgba(203,213,225,.8)", fontSize: 11 },
    },
    // 纵轴不必画：柱高本身表达量级，数量少时直接在柱顶标数
    yAxis: { type: "value", show: false, scale: true },
    series: [{
      type: "bar",
      barMaxWidth: 26,
      data: points.map((p) => ({
        value: p.cages ?? 0,
        itemStyle: { color: p.at.slice(0, 10) === today ? "#f59e0b" : "rgba(245,158,11,.4)" },
      })),
      label: few
        ? { show: true, position: "top", fontSize: 11, color: "rgba(203,213,225,.9)", formatter: "{c}" }
        : { show: false },
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

/**
 * 六台车里程占比 —— **2.5D 环形饼**（每台车一个色，与小车台配色同源），洞心写区间合计。
 *
 * 厚度是**叠饼**做的：同一份数据画 5 层，自下而上逐层上移并逐层提亮，
 * 只留最上层出标签。这是纯配置实现，不引 echarts-gl（为了一个饼图加 3D 渲染器不值当）。
 *
 * 标签把车名和公里数一起写进扇区名（`name`），这样 formatter 只用模板就够、
 * 不必写回调函数（回调参数在 ECharts 6 里的类型很难看）。
 * 标题不画在画布上，由外层 HTML 表头写 —— 表头上还要挂区间切换按钮。
 */
function robotsPieOption(totalMeters: number, parts: RobotPart[]): EChartsOption {
  const slices = parts.map((p) => ({
    name: p.label,
    value: p.value,
    itemStyle: { color: p.color },
  }));
  return {
    // 洞心的合计：环饼的圆心 = 容器中心，所以直接居中放一行字
    graphic: [{
      type: "text",
      left: "center",
      top: "middle",
      silent: true,
      style: {
        text: `${km(totalMeters)} km`,
        fill: "rgba(207,250,254,.95)",
        font: "600 20px ui-monospace, SFMono-Regular, Menlo, monospace",
      },
    }],
    series: [
      // 侧壁：从最底层往上画，每层比上一层深一点 → 顶面之下露出渐变的一圈「厚度」
      ...Array.from({ length: WALL_LAYERS - 1 }, (_, k) => {
        const depth = WALL_LAYERS - 1 - k;
        return {
          type: "pie" as const,
          radius: ["42%", "70%"],
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
        radius: ["42%", "70%"],
        center: ["50%", "50%"],
        // 整块宽的格子两侧有充足横向余量，标签引到外面比塞图例更省高度。
        // 车名一行、里程一行：数字是本图重点，单独放大加粗；不显示占比（洞心有合计，占比意义不大）
        label: {
          show: true,
          position: "outside",
          formatter: (p: { dataIndex: number }) => {
            const it = parts[p.dataIndex];
            return it ? `{n|${it.label}}\n{k|${dist(it.value)}}` : "";
          },
          rich: {
            n: { fontSize: 13, color: "rgba(226,232,240,.92)" },
            k: {
              fontSize: 17,
              fontWeight: "bold",
              color: "#e0f2fe",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              padding: [2, 0, 0, 0],
            },
          },
        },
        labelLine: { length: 6, length2: 8, lineStyle: { color: "rgba(148,163,184,.4)" } },
        data: slices,
      },
    ],
  };
}

/** 米 → 公里，保留一位小数 */
function km(meters: number | null | undefined): string {
  return ((Number(meters) || 0) / 1000).toFixed(1);
}

/** 不到 1 公里就报米，免得小里程都显示成「0.0 km」 */
function dist(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${km(meters)} km`;
}

/** 千分位整数 */
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

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * 数字翻牌：**按位纵向滚动**，数字一变就滚到新位（进位也一起滚）。
 * 千分位逗号、小数点这类非数字字符原样显示、不参与滚动。
 *
 * 宽度靠等宽字体保证（父级已经是 font-mono），所以位数变化时不会左右跳动。
 */
function Odometer({ text }: { text: string }) {
  return (
    <span className="inline-flex">
      {[...text].map((ch, i) =>
        ch >= "0" && ch <= "9" ? (
          <span key={i} className="inline-block overflow-hidden" style={{ height: "1em" }}>
            <span
              className="flex flex-col transition-transform duration-700 ease-out motion-reduce:transition-none"
              style={{ transform: `translateY(-${Number(ch) * 10}%)` }}
            >
              {DIGITS.map((d) => (
                <span key={d} style={{ height: "1em", lineHeight: 1 }}>{d}</span>
              ))}
            </span>
          </span>
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
 *   <li>左 40% 上下平分：上半再平分为「今日清洗爬升（折线）」与「近 30 天清洗（柱状）」；
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
    queryFn: () => fetchCageWashCurve("days", 30),
    staleTime: 5 * 60_000,
  });
  // 饼图的数据源：日行表里每台车每天的里程（跟顶部「总累计路程」同一个来源）。
  // 一次取满一年，四个时间窗口在前端切 —— 总共有几十行，来回切窗口不必再打后端。
  const distance = useQuery({
    queryKey: ["agvDistance365"],
    queryFn: () => fetchDistanceCurve(365),
    staleTime: 5 * 60_000,
  });
  const [pieRange, setPieRange] = useState<PieRange>("d30");

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
  const daysChart = useMemo(() => cageDaysBarsOption(daysPts), [daysPts]);
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
              <Odometer text={int(cageTotal)} />
            </span>
            <span className="font-mono text-xl leading-none text-slate-600">/</span>
            <span className="font-mono text-xl font-semibold leading-none text-amber-300">
              <Odometer text={int(liveCages)} />
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
                <Odometer text={km(odoTotalAll)} />
              </span>
              <span className="font-mono text-xl leading-none text-slate-600">/</span>
              <span className="font-mono text-xl font-semibold leading-none text-amber-300">
                <Odometer text={km(todayFrozen ? 0 : odoTodayTotal)} />
              </span>
              <span className="text-sm text-slate-400">km · 六台车累计 / 今日实时</span>
            </span>
            <span className="flex min-w-0 flex-1 items-stretch justify-end gap-1">
              {AGV_ROBOTS.map((r) => (
                <span
                  key={r.ip}
                  className="flex min-w-0 flex-1 flex-col justify-center rounded border border-cyan-500/15 bg-slate-900/40 px-1.5 py-0.5"
                  title={`${r.label} · 累计 ${km(cumOf(r.ip))} km · 今日 ${km(todayFrozen ? 0 : todayByRobot[r.ip])} km`}
                >
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                    <span className="truncate font-mono text-xs text-slate-400">{r.label}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1">
                    <span className="font-mono text-base font-semibold leading-none text-slate-100">
                      <Odometer text={km(cumOf(r.ip))} />
                    </span>
                    <span className="font-mono text-xs leading-none text-slate-600">/</span>
                    <span className="font-mono text-xs leading-none text-amber-300/90">
                      <Odometer text={km(todayFrozen ? 0 : todayByRobot[r.ip])} />
                    </span>
                    <span className="text-[10px] text-slate-500">km</span>
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
        /* 主区：左 40%（上下平分，上半再平分 → 今日折线 | 近 30 天柱状；下半整块给 2.5D 环饼，够横放标签），
           右 60% 整块地图。
           每层都要 min-w-0：图与地图画布内在宽度都不小，不给 min-w-0 网格会按最小内容宽度撑开
           （实测两列各约 1000px、整块溢出视口，2fr/3fr 形同虚设）。 */
        <div className="grid min-h-0 min-w-0 flex-1 gap-1 sm:gap-1.5 lg:grid-cols-[2fr_3fr]">
          <div className="grid min-h-0 min-w-0 grid-rows-2 gap-1 sm:gap-1.5">
            <div className="grid min-h-0 min-w-0 grid-cols-2 gap-1 sm:gap-1.5">
              <div className={TILE}>
                <CockpitAutoResizeChart option={todayChart} className="h-full min-h-0 w-full min-w-0" style={{ height: "100%" }} />
                {todayAllZero ? (
                  <div className="pointer-events-none absolute inset-x-0 top-8 flex flex-col items-center gap-0.5 text-center">
                    <span className="text-sm text-slate-400">今日暂无抬臂记录</span>
                  </div>
                ) : null}
              </div>
              <div className={TILE}>
                <CockpitAutoResizeChart option={daysChart} className="h-full min-h-0 w-full min-w-0" style={{ height: "100%" }} />
              </div>
            </div>
            <div className={cn(TILE, "flex flex-col")}>
              {/* 表头兼区间切换：标题不画在画布上，让给这排按钮 */}
              <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-0.5 pb-0.5">
                <span className="text-xs font-medium tracking-wide text-cyan-100/90">
                  六台车里程占比 · {pie.label}
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
          </div>
          <CockpitAgvMap />
        </div>
      )}
    </div>
  );
}
