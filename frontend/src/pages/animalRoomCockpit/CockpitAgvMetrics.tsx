import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAgvCurrent, type AgvRobotStatus } from "@/api/domains/agv.api";
import { ACTIVITY_COLORS } from "@/api/domains/agv-analysis.api";
import { AGV_ROBOTS } from "@/features/agv-tracker/agvRobotConfig";
import { classifyActivity } from "@/features/agv-tracker/agvActivityClassifier";
import { cn } from "@/lib/utils";
import { COCKPIT_COMPACT_METRIC_PILL_BASE, COCKPIT_METRIC_PILL_SIZE } from "./CockpitRobotArmMetricSlots";
import "./cockpitAgvMetrics.css";

/** 点任意一格都去实时小车台（控制台是 hash 路由，必须带 /console 前缀，否则命中顶层 legacy 重定向整壳重建） */
export const COCKPIT_AGV_TRACKER_HREF = "/#/console/admin/agv-tracker";

/** 与小车台一致：最近一次上报在 10s 内算在线 */
const ONLINE_WINDOW_MS = 10_000;

/** battery_level 上游有时是 0–1 的小数、有时是 0–100，两种都吃下 */
function batteryPercent(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.round(raw <= 1 ? raw * 100 : raw);
}

/** `/agv/current` 里每台车一档：上位机状态 + 采集任务的最近一次轮询时间 */
type AgvCurrentEntry = { status: AgvRobotStatus; last_polled_at: string };

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
  station: string;
  /** 在线但拿不到工况时的原始 task_status，只进悬停提示 */
  rawTaskStatus: number | null;
  /** 最近一次上报的时间戳；离线格用它显示「离线多久了」 */
  lastSeenMs: number | null;
};

/** 离线格提示里那个「多久没上报了」 */
function humanAgo(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} 小时前`;
  return `${Math.round(hr / 24)} 天前`;
}

/**
 * 一格的状态。
 *
 * 数据取自**实时状态接口**（`/agv/current`，采集任务直接缓存的上位机状态）。
 * 不要改用位置流 `/agv/recent`：它按 `recorded_at` 划时间窗查询，而库里 `recorded_at` 是 UTC 墙钟、
 * JVM 时区却是北京，窗口恒为空 —— 拿它判在线会把六台车全判成「离线」，而实时状态接口一直是有值的。
 */
function readAgvState(
  robot: (typeof AGV_ROBOTS)[number],
  entry: AgvCurrentEntry | undefined
): AgvCellState {
  const s = entry?.status;
  const ts = entry?.last_polled_at ? Date.parse(entry.last_polled_at) : NaN;
  const lastSeenMs = Number.isFinite(ts) ? ts : null;
  const online = Boolean(s) && lastSeenMs != null && Date.now() - lastSeenMs < ONLINE_WINDOW_MS;
  if (!online || !s) {
    return {
      label: robot.label,
      color: robot.color,
      online: false,
      visual: AGV_VISUALS.offline,
      // 离线时**不显示**上次报回来的电量：那可能是几天前的数，摆在离线旁边会被当成当前值
      battery: null,
      station: "",
      rawTaskStatus: null,
      lastSeenMs,
    };
  }
  const charging = truthyFlag(s.charging);
  // 异常压过工况：车被挡/急停时，报「正载着货走」是误导
  const emergency = truthyFlag(s.emergency);
  const blocked = truthyFlag(s.blocked);
  const activity = classifyActivity({
    task_status: s.task_status ?? null,
    charging,
    fork_height: s.fork_height ?? null,
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
    battery: batteryPercent(s.battery_level),
    station: (s.current_station || "").trim(),
    rawTaskStatus: s.task_status ?? null,
    lastSeenMs,
  };
}

/** 一格：车色圆点（哪台车）+ 车号、按工况变色变形的车身图形 + 状态与电量 */
function AgvMetricCell({ state }: { state: AgvCellState }) {
  const { online, visual, battery, station } = state;
  const statusText = visual.label;

  const title = [
    `${state.label}${online ? "" : "（离线）"}`,
    statusText,
    battery != null ? `电量 ${battery}%` : null,
    state.rawTaskStatus != null ? `task_status=${state.rawTaskStatus}` : null,
    station ? `站位 ${station}` : null,
    !online && state.lastSeenMs != null ? `最近上报 ${humanAgo(Date.now() - state.lastSeenMs)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col items-center justify-center gap-0 rounded border bg-slate-900/40 px-1 py-0.5 transition-colors",
        visual.alarm ? "border-red-500/45" : "border-cyan-500/10"
      )}
      style={visual.alarm ? { boxShadow: "inset 0 0 8px rgba(239,68,68,0.22)" } : undefined}
      title={title}
    >
      <div className="flex w-full min-w-0 shrink-0 items-center justify-center gap-1">
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", online && "shadow-[0_0_6px_currentColor]")}
          style={{ backgroundColor: online ? state.color : "#64748b", color: state.color }}
          aria-hidden
        />
        <span className="truncate font-mono text-[12px] font-semibold text-cyan-100/95">{state.label}</span>
      </div>
      {/* 小车撑满格子的剩余高度：定死 7rem×3.875rem 的话，卡片拉宽拉高时车还是那么大、
          占格子的比例越来越小，看着就「不跟着缩放」 */}
      <CockpitAgvGlyphSvg
        visual={online ? visual : AGV_VISUALS.offline}
        className="min-h-0 w-full flex-1"
        style={{ color: online ? visual.color : "#475569" }}
      />
      {/* 状态与电量挤一行：顶栏这三行加起来才和左边机械臂卡等高 */}
      <div className="flex w-full min-w-0 shrink-0 items-baseline justify-center gap-1">
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
  style?: CSSProperties;
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
        {/* 车身：一个光板圆角方块太素，拆成「后配重 + 驾驶位 + 外壳描边」三块，共 20px 高的小图也读得出是台叉车 */}
        <rect x="7" y="6" width="19" height="8.5" rx="1.4" fill="currentColor" opacity="0.72" />
        <rect x="7" y="6" width="19" height="8.5" rx="1.4" stroke="currentColor" strokeWidth="0.7" opacity="0.5" fill="none" />
        <rect x="8.5" y="7.5" width="3.4" height="5.5" rx="0.7" fill="#0f172a" opacity="0.26" />
        <rect x="13.2" y="7.5" width="5.6" height="5.5" rx="0.9" fill="currentColor" opacity="0.3" />
        {/* 门架：货叉挂在这一根上，不然叉子和车头看着是两截 */}
        <rect x="24.7" y="5.4" width="1.4" height="10" rx="0.5" fill="currentColor" opacity="0.45" />
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
 * 车号/车色来自 {@link AGV_ROBOTS}（全局唯一来源），工况复用小车台同一套
 * {@link classifyActivity} 规则引擎，色相复用 {@link ACTIVITY_COLORS} —— 两处不各判一套。
 * 轮询取 2s：小车台地图要 500ms 的连贯性，顶栏只是看板，没必要跟着打那么密。
 */
export function CockpitAgvMetrics() {
  const { data } = useQuery({
    queryKey: ["cockpitAgvCurrent"],
    queryFn: fetchAgvCurrent,
    refetchInterval: 2000,
    /* 驾驶舱是挂在墙上的看板：窗口没被聚焦（切到别的窗口/别的标签）时也必须继续拉。
       react-query 默认在后台标签里**暂停** interval 轮询 ——
       这台卡片是纯 HTTP 轮询（没有 socket 推送），一暂停就整块冻在旧状态上，
       表现就是「顶部的状态指示一直不动」。 */
    refetchIntervalInBackground: true,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });


  const cells = AGV_ROBOTS.map((r) => readAgvState(r, data?.robots?.[r.ip]));
  const onlineCount = cells.filter((c) => c.online).length;

  return (
    <a
      href={COCKPIT_AGV_TRACKER_HREF}
      className={cn(
        COCKPIT_COMPACT_METRIC_PILL_BASE,
        "group flex h-full min-h-0 max-h-full flex-row flex-nowrap items-stretch gap-1 no-underline transition-colors hover:border-cyan-400/45 hover:bg-slate-900/90"
      )}
      /* 权重=本卡基准宽度：顶栏余量按各卡宽度比例分配（宽了长、窄了缩），任何宽度都铺满 */
      style={{ ...COCKPIT_METRIC_PILL_SIZE, flex: "388 1 388px" }}
      title={`AGV 小车 ${onlineCount}/${cells.length} 在线 —— 点击进入实时小车台`}
    >
      <div
        className="grid h-full min-h-0 shrink gap-1"
        style={{
          // 宽度跟随卡片（卡片按比例撑满）；minWidth 是压缩下限，再窄就退回顶栏横滚
          width: "100%",
          minWidth: "18rem",
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
