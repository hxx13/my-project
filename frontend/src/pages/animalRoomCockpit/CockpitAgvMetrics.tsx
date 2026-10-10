import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAgvRecent } from "@/api/domains/agv.api";
import { ACTIVITY_COLORS } from "@/api/domains/agv-analysis.api";
import { AGV_ROBOTS } from "@/features/agv-tracker/agvRobotConfig";
import { classifyActivity } from "@/features/agv-tracker/agvActivityClassifier";
import { currentSpeed, type TrailPoint } from "@/features/agv-tracker/agvAnalytics";
import { cn } from "@/lib/utils";
import { COCKPIT_COMPACT_METRIC_PILL_BASE } from "./CockpitRobotArmMetricSlots";

/** 点任意一格都去实时小车台（控制台是 hash 路由，必须带 /console 前缀，否则命中顶层 legacy 重定向整壳重建） */
export const COCKPIT_AGV_TRACKER_HREF = "/#/console/admin/agv-tracker";

const KF_ID = "cockpit-agv-metrics-kf";

/** 取多长的历史窗：够算速度、够判定「还活着」，又不至于拖大顶栏的请求 */
const RECENT_WINDOW_SEC = 30;
/** 与小车台一致：最近一次上报在 10s 内算在线 */
const ONLINE_WINDOW_MS = 10_000;

function injectAgvKeyframesOnce() {
  if (typeof document === "undefined") return;
  if (document.getElementById(KF_ID)) return;
  const el = document.createElement("style");
  el.id = KF_ID;
  el.textContent = `
@keyframes cockpitAgvWheel { to { transform: rotate(360deg); } }
@keyframes cockpitAgvStreak {
  0% { transform: translateX(4px); opacity: 0; }
  30% { opacity: 1; }
  100% { transform: translateX(-10px); opacity: 0; }
}
@keyframes cockpitAgvScan {
  0%, 100% { opacity: 0.2; transform: translateX(-3px) scaleX(0.55); }
  55% { opacity: 1; transform: translateX(1px) scaleX(1.05); }
}
@keyframes cockpitAgvLift {
  0%, 100% { transform: translateY(3px); }
  45%, 60% { transform: translateY(-2.6px); }
}
@keyframes cockpitAgvBolt {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  45% { opacity: 1; transform: scale(1.15); }
}
@keyframes cockpitAgvChargeBody {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}
@keyframes cockpitAgvStandby {
  0%, 100% { opacity: 0.15; }
  50% { opacity: 0.85; }
}
@keyframes cockpitAgvAlarm {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 1; }
}
.cockpitAgvWheel { animation: cockpitAgvWheel 0.58s linear infinite; }
.cockpitAgvStreak { animation: cockpitAgvStreak 0.8s linear infinite; }
.cockpitAgvScan { animation: cockpitAgvScan 1.05s ease-in-out infinite; transform-origin: 33.4px 10px; }
.cockpitAgvLift { animation: cockpitAgvLift 1.8s cubic-bezier(0.45, 0, 0.4, 1) infinite; }
.cockpitAgvBolt { animation: cockpitAgvBolt 1s ease-in-out infinite; transform-origin: center; }
.cockpitAgvChargeBody { animation: cockpitAgvChargeBody 1.3s ease-in-out infinite; }
.cockpitAgvStandby { animation: cockpitAgvStandby 2.4s ease-in-out infinite; }
.cockpitAgvAlarm { animation: cockpitAgvAlarm 0.72s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .cockpitAgvWheel, .cockpitAgvStreak, .cockpitAgvScan, .cockpitAgvLift,
  .cockpitAgvBolt, .cockpitAgvChargeBody, .cockpitAgvStandby, .cockpitAgvAlarm { animation: none; }
  .cockpitAgvStreak { opacity: 0.55; }
  .cockpitAgvScan, .cockpitAgvBolt { opacity: 0.8; }
  .cockpitAgvStandby { opacity: 0.5; }
  .cockpitAgvChargeBody { opacity: 1; }
  .cockpitAgvAlarm { opacity: 1; }
}
`;
  document.head.appendChild(el);
}

/** battery_level 上游有时是 0–1 的小数、有时是 0–100，两种都吃下 */
function batteryPercent(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.round(raw <= 1 ? raw * 100 : raw);
}

type AgvRecentPoint = {
  x: number;
  y: number;
  angle: number;
  battery: number;
  charging: number;
  task_status: number;
  station: string;
  recorded_at: string;
  /** 以下三列 `SELECT *` 本就返回，此前的类型少声明了，导致「运输中/载货中」永远判不出来 */
  fork_height?: number | null;
  blocked?: number | boolean | null;
  emergency?: number | boolean | null;
};

/** 表格里是 tinyint，可能是 0/1 数字，也可能是布尔或字符串 */
function truthyFlag(raw: number | boolean | string | null | undefined): boolean {
  if (raw == null) return false;
  if (typeof raw === "boolean") return raw;
  const n = Number(raw);
  return Number.isFinite(n) ? n !== 0 : /^(true|on|y)$/i.test(String(raw).trim());
}

/** 一个状态的完整视觉描述：色相 + 该让哪个部件动起来 */
type AgvVisual = {
  key: string;
  label: string;
  color: string;
  /** 行走：车轮转 + 拖尾 */
  moving: boolean;
  /** 叉上有货箱 */
  cargo: boolean;
  /** 举升循环（作业中） */
  lifting: boolean;
  charging: boolean;
  alarm: boolean;
};

/**
 * 状态 → 视觉。色相全部取自 {@link ACTIVITY_COLORS}（与小车台同一套口径），不另立一套配色。
 * 异常（阻塞=橙、急停=红）沿用小车台 ActionState 的配色。
 */
const AGV_VISUALS: Record<string, AgvVisual> = {
  offline: { key: "offline", label: "离线", color: "#64748b", moving: false, cargo: false, lifting: false, charging: false, alarm: false },
  emergency: { key: "emergency", label: "急停", color: "#ef4444", moving: false, cargo: false, lifting: false, charging: false, alarm: true },
  blocked: { key: "blocked", label: "阻塞", color: "#fb923c", moving: false, cargo: false, lifting: false, charging: false, alarm: true },
  charging: { key: "charging", label: "充电中", color: ACTIVITY_COLORS.CHARGING, moving: false, cargo: false, lifting: false, charging: true, alarm: false },
  transport: { key: "transport", label: "运输中", color: ACTIVITY_COLORS.TRANSPORT, moving: true, cargo: true, lifting: false, charging: false, alarm: false },
  navigating: { key: "navigating", label: "寻路中", color: ACTIVITY_COLORS.NAVIGATING, moving: true, cargo: false, lifting: false, charging: false, alarm: false },
  stationWork: { key: "stationWork", label: "载货中", color: ACTIVITY_COLORS.STATION_WORK, moving: false, cargo: true, lifting: true, charging: false, alarm: false },
  rest: { key: "rest", label: "休息中", color: ACTIVITY_COLORS.REST_STATION, moving: false, cargo: false, lifting: false, charging: false, alarm: false },
  standby: { key: "standby", label: "待命", color: "#94a3b8", moving: false, cargo: false, lifting: false, charging: false, alarm: false },
};

const ACTIVITY_VISUAL_KEY: Record<string, keyof typeof AGV_VISUALS> = {
  CHARGING: "charging",
  TRANSPORT: "transport",
  NAVIGATING: "navigating",
  STATION_WORK: "stationWork",
  REST_STATION: "rest",
};

type AgvCellState = {
  label: string;
  color: string;
  online: boolean;
  visual: AgvVisual;
  battery: number | null;
  speed: number | null;
  station: string;
  /** 在线但拿不到工况时的原始 task_status，只进悬停提示 */
  rawTaskStatus: number | null;
};

/**
 * 一格的状态。
 *
 * 数据取自**位置流**（`/agv/recent`）而不是整体状态接口：后者在采集任务没跑时
 * 每台车都是空对象，顶栏会整排显示离线，而位置流一直在走。
 */
function readAgvState(
  robot: (typeof AGV_ROBOTS)[number],
  points: AgvRecentPoint[] | undefined
): AgvCellState {
  const list = points ?? [];
  const last = list.length ? list[list.length - 1] : undefined;
  const lastTs = last ? Date.parse(last.recorded_at) : NaN;
  const online = Number.isFinite(lastTs) && Date.now() - lastTs < ONLINE_WINDOW_MS;
  const trail: TrailPoint[] = list.map((p) => ({
    x: p.x,
    y: p.y,
    angle: p.angle,
    ts: Date.parse(p.recorded_at),
  }));
  if (!online || !last) {
    return {
      label: robot.label,
      color: robot.color,
      online: false,
      visual: AGV_VISUALS.offline,
      battery: batteryPercent(last?.battery),
      speed: null,
      station: (last?.station || "").trim(),
      rawTaskStatus: last?.task_status ?? null,
    };
  }
  const charging = truthyFlag(last.charging);
  // 异常压过工况：车被挡/急停时，报「正载着货走」是误导
  const emergency = truthyFlag(last.emergency);
  const blocked = truthyFlag(last.blocked);
  const activity = classifyActivity({
    task_status: last.task_status ?? null,
    charging,
    fork_height: last.fork_height ?? null,
  });
  const visual = emergency
    ? AGV_VISUALS.emergency
    : blocked
      ? AGV_VISUALS.blocked
      : activity
        ? AGV_VISUALS[ACTIVITY_VISUAL_KEY[activity] ?? "standby"]
        : charging
          ? AGV_VISUALS.charging
          : AGV_VISUALS.standby;
  return {
    label: robot.label,
    color: robot.color,
    online: true,
    visual,
    battery: batteryPercent(last.battery),
    speed: currentSpeed(trail),
    station: (last.station || "").trim(),
    rawTaskStatus: last.task_status ?? null,
  };
}

/** 一格：车色圆点（哪台车）+ 车号、按工况变色变形的车身图形 + 状态与电量 */
function AgvMetricCell({ state }: { state: AgvCellState }) {
  const { online, visual, battery, speed, station } = state;
  const statusText = visual.label;

  const title = [
    `${state.label}${online ? "" : "（离线）"}`,
    statusText,
    battery != null ? `电量 ${battery}%` : null,
    speed != null && speed > 0.05 ? `速度 ${speed.toFixed(2)} m/s` : null,
    state.rawTaskStatus != null ? `task_status=${state.rawTaskStatus}` : null,
    station ? `站位 ${station}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-0 rounded border bg-slate-900/40 px-1 py-0.5 transition-colors",
        visual.alarm ? "border-red-500/45" : "border-cyan-500/10"
      )}
      style={visual.alarm ? { boxShadow: "inset 0 0 8px rgba(239,68,68,0.22)" } : undefined}
      title={title}
    >
      <div className="flex w-full min-w-0 items-center justify-center gap-1">
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", online && "shadow-[0_0_6px_currentColor]")}
          style={{ backgroundColor: online ? state.color : "#64748b", color: state.color }}
          aria-hidden
        />
        <span className="truncate font-mono text-[12px] font-semibold text-cyan-100/95">{state.label}</span>
      </div>
      <CockpitAgvGlyphSvg
        visual={online ? visual : AGV_VISUALS.offline}
        className="h-[3.875rem] w-[7rem] shrink-0"
        style={{ color: online ? visual.color : "#475569" }}
      />
      {/* 状态与电量挤一行：顶栏这三行加起来才和左边机械臂卡等高 */}
      <div className="flex w-full min-w-0 items-baseline justify-center gap-1">
        <span
          className={cn("truncate text-[11px] leading-none", !online && "text-slate-500")}
          style={online ? { color: visual.color } : undefined}
        >
          {statusText}
        </span>
        <span className="shrink-0 font-mono text-[11px] leading-none text-slate-500">
          {battery != null ? `${battery}%` : "—"}
        </span>
      </div>
    </div>
  );
}

/**
 * 叉车俯视小图形：**同一个车身，按工况换部位动作**。
 *
 * 运输=双轮快转+拖尾+叉上带货；寻路=双轮转+前方扫描；载货=货叉举升循环；
 * 充电=电能脉冲；休息=待机灯呼吸；异常=整格红框频闪。静默时只剩车体轮廓。
 */
function CockpitAgvGlyphSvg({
  visual,
  className,
  style,
}: {
  visual: AgvVisual;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { moving, cargo, lifting, charging, alarm } = visual;
  return (
    <svg
      className={cn(className)}
      style={style}
      viewBox="0 0 36 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* 地面导轨 */}
      <rect x="1" y="16.5" width="34" height="1.6" rx="0.8" fill="currentColor" opacity="0.16" />
      {/* 行走拖尾：速度感，只给「真的在走」的工况 */}
      {moving ? (
        <g>
          {[
            { y: 8.6, d: "0s" },
            { y: 11, d: "0.19s" },
            { y: 13.4, d: "0.38s" },
          ].map((s) => (
            <line
              key={`st${s.y}`}
              x1="1.5"
              y1={s.y}
              x2="5.5"
              y2={s.y}
              className="cockpitAgvStreak"
              style={{ animationDelay: s.d }}
              stroke="currentColor"
              strokeWidth="1.05"
              strokeLinecap="round"
            />
          ))}
        </g>
      ) : null}
      {/* 寻路：车头前方扫描波，和「在走但不知去哪儿」区分开 */}
      {visual.key === "navigating" ? (
        <path className="cockpitAgvScan" d="M33.4 5.6 L36 10 L33.4 14.4 Z" fill="currentColor" />
      ) : null}
      {/* 急停：整机外面套一圈报警弧 */}
      {alarm ? (
        <g className="cockpitAgvAlarm">
          <path
            d="M4 4.2 Q18 0.6 32 4.2"
            stroke="#ef4444"
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M4 15.8 Q18 19.4 32 15.8"
            stroke="#ef4444"
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      ) : null}
      <g className={cn(charging && "cockpitAgvChargeBody")}>
        {/* 车身 */}
        <rect x="7" y="6" width="19" height="8.5" rx="1.4" fill="currentColor" opacity="0.78" />
        {/* 休息：待机灯呼吸 */}
        {visual.key === "rest" ? (
          <circle className="cockpitAgvStandby" cx="16.5" cy="10.2" r="1.5" fill="currentColor" />
        ) : null}
        {/* 充电：机身中央的闪电脉冲 */}
        {charging ? (
          <path
            className="cockpitAgvBolt"
            d="M17.2 5.6 L14.6 10.8 H17 L15.2 14.9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : null}
      </g>
      {/* 货叉 + 叉上的货：举升工况时整组升降，读出来就是「把托盘抬起来」 */}
      <g className={cn(lifting && "cockpitAgvLift")}>
        {cargo ? <rect x="24.6" y="4.4" width="6.6" height="2.9" rx="0.5" fill="currentColor" opacity="0.42" /> : null}
        <rect x="25" y="7.2" width="7" height="1.5" rx="0.7" fill="currentColor" opacity="0.55" />
        <rect x="25" y="11.4" width="7" height="1.5" rx="0.7" fill="currentColor" opacity="0.55" />
      </g>
      {[
        { cx: 11, cy: 15.4 },
        { cx: 21, cy: 15.4 },
      ].map((w) => (
        <g
          key={`w${w.cx}`}
          style={{ transformOrigin: `${w.cx}px ${w.cy}px` }}
          className={cn(moving && "cockpitAgvWheel")}
        >
          <circle cx={w.cx} cy={w.cy} r="2.5" fill="currentColor" opacity="0.9" />
          <path
            d={`M${w.cx - 1.8} ${w.cy} H${w.cx + 1.8} M${w.cx} ${w.cy - 1.8} V${w.cy + 1.8}`}
            stroke="#0f172a"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          {/* 偏心标记：十字是四重对称，转 90° 跟没转一样 —— 没有这个点就看不出车轮在转 */}
          <circle cx={w.cx + 1.25} cy={w.cy - 1.25} r="0.85" fill="#0f172a" />
        </g>
      ))}
    </svg>
  );
}

/**
 * 性能指标栏 · AGV：6 台车一格一台，点任意一格去实时小车台。
 *
 * 车号/车色来自 {@link AGV_ROBOTS}（全局唯一来源），活动类型复用小车台同一套
 * {@link classifyActivity} 规则引擎，色相复用 {@link ACTIVITY_COLORS}，速度复用同一套
 * {@link currentSpeed} 平滑算法 —— 两处不各判一套。
 * 轮询取 2s：小车台地图要 500ms 的连贯性，顶栏只是看板，没必要跟着打那么密。
 */
export function CockpitAgvMetrics() {
  const { data } = useQuery({
    queryKey: ["cockpitAgvRecent"],
    queryFn: () => fetchAgvRecent(RECENT_WINDOW_SEC),
    refetchInterval: 2000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    injectAgvKeyframesOnce();
  }, []);

  const cells = AGV_ROBOTS.map((r) => readAgvState(r, data?.[r.ip]));
  const onlineCount = cells.filter((c) => c.online).length;

  return (
    <a
      href={COCKPIT_AGV_TRACKER_HREF}
      className={cn(
        COCKPIT_COMPACT_METRIC_PILL_BASE,
        "group flex h-full min-h-0 max-h-full shrink-0 flex-row flex-nowrap items-stretch gap-1 no-underline transition-colors hover:border-cyan-400/45 hover:bg-slate-900/90"
      )}
      title={`AGV 小车 ${onlineCount}/${cells.length} 在线 —— 点击进入实时小车台`}
    >
      <div
        className="grid h-full min-h-0 shrink-0 gap-1"
        style={{
          width: "23rem",
          minWidth: "23rem",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gridTemplateRows: "repeat(2, minmax(0, 1fr))",
        }}
        role="group"
        aria-label="六台 AGV 小车在线与运行状态"
      >
        {cells.map((c) => (
          <AgvMetricCell key={c.label} state={c} />
        ))}
      </div>
    </a>
  );
}
