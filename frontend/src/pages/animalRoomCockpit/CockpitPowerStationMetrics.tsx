import { useMemo, forwardRef } from "react";
import type { TelemetryTagItem } from "@/telemetry-view/types";
import { cn } from "@/lib/utils";
import { COCKPIT_COMPACT_METRIC_PILL_BASE, COCKPIT_METRIC_PILL_SIZE, parseRobotArmRun01 } from "./CockpitRobotArmMetricSlots";
import {
  pickChillerMachineTags,
  pickCoolingTowerTags,
  pickCoolingWaterPumpTags,
  pickFrozenChilledWaterPumpTags,
} from "./cockpitPowerStationTags";
import "./cockpitPowerStation.css";

/** 与水泵「冷冻01」同级的极小号标签（inline px，减轻浏览器最小字号把 Tailwind 极小类顶大的问题） */
const PS_NAME_LABEL_CLASS =
  "max-w-full shrink-0 truncate text-center font-normal leading-none tracking-tight text-slate-300/90";

/**
 * 设备族语义色：一个色相只代表一类设备，颜色本身携带信息（不是装饰）。
 * 冷冻水=天蓝、冷却水=青绿、冷机=靛蓝、冷凝塔=琥珀（排热）。
 */
type StationKind = "frozenPump" | "coolingPump" | "chiller" | "tower";

const STATION_ACCENT: Record<StationKind, { hue: string; glow: string }> = {
  frozenPump: { hue: "#38bdf8", glow: "rgb(56 189 248 / 0.4)" },
  coolingPump: { hue: "#2dd4bf", glow: "rgb(45 212 191 / 0.4)" },
  chiller: { hue: "#818cf8", glow: "rgb(129 140 248 / 0.4)" },
  tower: { hue: "#fbbf24", glow: "rgb(251 191 36 / 0.4)" },
};

/** 运行态：边框换成设备族色、面板泛一层同色光，停机/无绑定一律暗边框不发光 */
function runShellStyle(on: boolean, kind: StationKind): React.CSSProperties | undefined {
  if (!on) return undefined;
  const { hue, glow } = STATION_ACCENT[kind];
  return {
    borderColor: `${hue}b3`,
    boxShadow: `0 0 8px -1px ${glow}`,
    backgroundImage: `linear-gradient(180deg, ${hue}1f, transparent 70%)`,
  };
}

function padTags(tags: TelemetryTagItem[], n: number): (TelemetryTagItem | null)[] {
  const out: (TelemetryTagItem | null)[] = tags.slice(0, n);
  while (out.length < n) out.push(null);
  return out;
}

function twoDigit(n: number): string {
  return String(Math.max(0, Math.min(99, n))).padStart(2, "0");
}

/**
 * 一片雪花：三条交叉线，位置/延迟由调用处给。
 *
 * `transform-origin` 写成自己的坐标（px 按用户坐标解析），这样 `cockpitSnow` 里的自转是绕雪花自己转，
 * 而位移照旧往下走 —— 少了这行，几片雪花会一起绕着画布左上角甩。
 */
function SnowFlake({
  x,
  y,
  r,
  delay,
  on,
}: {
  x: number;
  y: number;
  r: number;
  delay: string;
  on: boolean;
}) {
  const k = r * 0.87;
  return (
    <g
      className={cn(on && "cockpitSnow")}
      style={{ transformOrigin: `${x}px ${y}px`, animationDelay: delay, opacity: on ? undefined : 0.3 }}
      stroke="#7dd3fc"
      strokeWidth="0.95"
      strokeLinecap="round"
    >
      <line x1={x} y1={y - r} x2={x} y2={y + r} />
      <line x1={x - k} y1={y - r / 2} x2={x + k} y2={y + r / 2} />
      <line x1={x - k} y1={y + r / 2} x2={x + k} y2={y - r / 2} />
    </g>
  );
}

function binaryRunning(it: TelemetryTagItem | null): boolean {
  if (!it) return false;
  return parseRobotArmRun01(it.value ?? null) === true;
}

/** 运行指示灯：亮=运行（设备族色）、暗=停机、灰=无绑定 */
function RunLed({ on, bound, kind }: { on: boolean; bound: boolean; kind: StationKind }) {
  const hue = STATION_ACCENT[kind].hue;
  return (
    <span
      className="flex shrink-0 items-center justify-center py-0.5"
      title={!bound ? "无测点" : on ? "运行" : "停机"}
      role="img"
      aria-label={!bound ? "无测点" : on ? "运行" : "停机"}
    >
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full ring-1 ring-inset",
          !bound && "bg-slate-700/60 ring-slate-600/50",
          bound && !on && "bg-slate-600/90 ring-slate-500/35"
        )}
        style={bound && on ? { backgroundColor: hue, boxShadow: `0 0 7px ${STATION_ACCENT[kind].glow}` } : undefined}
      />
    </span>
  );
}

/**
 * 小型离心泵符号：**电机 + 联轴器 + 蜗壳（含叶轮）+ 底座**，停机无动效，运行时叶轮转、进出口两段水在爬。
 *
 * 早先只画了一个圆疙瘩加三根叶片，看不出是台泵；现在按真机的几个特征件画：
 * 右侧胶囊形电机（带散热筋、接线盒、地脚）、中间联轴器护罩、左侧蜗壳，蜗壳里是叶轮。
 * 叶轮占满蜗壳内腔，小尺寸下才看得出在转。
 *
 * **同一台机器，两路靠接管走向区分**：冷冻水左侧进水、向上出水；冷却水整体镜像（右侧进水、向上出水），
 * 水流方向随之相反。接管怎么接是一路水的真实差别，比给两台泵各加一套装饰更能说明问题。
 *
 * 叶轮刻意做成**不对称**的（一片亮、其余压暗，另加轮缘一点）：五片叶旋转 72° 后与原来一模一样，
 * 等于看不出在转 —— 必须有一个高亮标记绕着圆心走。
 */
function PumpGlyphSvg({
  running,
  tone,
  mirrored,
  className,
}: {
  running: boolean;
  tone: string;
  mirrored?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 34 22"
      className={cn(className)}
      style={{ color: tone, transform: mirrored ? "scaleX(-1)" : undefined }}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* 底座 */}
      <rect x="1" y="18.5" width="32" height="2.5" rx="0.9" fill="currentColor" opacity="0.18" />

      {/* 吸入管 + 水 */}
      <path d="M0.8 13.8 H6.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
      {running ? (
        <path d="M0.4 13.8 H7.2" className="cockpitFlow" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      ) : null}

      {/* 蜗壳（含出口喉部） */}
      <path
        d="M12.4 9.6 L13.6 6 L13.6 3.4 H33"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {running ? (
        <path
          d="M13.6 6.6 L13.6 3.4 H32.6"
          className="cockpitFlow"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      <circle cx="11.6" cy="13.8" r="5.4" stroke="currentColor" strokeWidth="0.95" fill="currentColor" fillOpacity="0.1" />

      {/* 联轴器护罩：把蜗壳和电机连起来，读起来才是「一台机组」而不是两个零件 */}
      <rect x="16.2" y="11.6" width="1.8" height="4.6" rx="0.5" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />

      {/* 电机：胶囊壳 + 散热筋 + 接线盒 + 地脚 */}
      <rect x="17.6" y="8.9" width="14.6" height="7.3" rx="3.4" stroke="currentColor" strokeWidth="0.95" fill="currentColor" fillOpacity="0.12" />
      {[21.4, 24.8, 28.2].map((x) => (
        <line key={x} x1={x} y1="9.9" x2={x} y2="15.2" stroke="currentColor" strokeWidth="0.8" opacity="0.45" />
      ))}
      <rect x="22.2" y="6.8" width="5.4" height="2.2" rx="0.5" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
      <rect x="19.2" y="16.2" width="2" height="2.4" rx="0.4" fill="currentColor" opacity="0.32" />
      <rect x="28.6" y="16.2" width="2" height="2.4" rx="0.4" fill="currentColor" opacity="0.32" />

      {/* 叶轮：五片弯叶，第一片高亮 + 轮缘一点（唯一的不对称标记） */}
      <g style={{ transformOrigin: "11.6px 13.8px" }} className={running ? "cockpitPumpSpin" : undefined}>
        <circle cx="11.6" cy="13.8" r="3.7" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
        {[0, 72, 144, 216, 288].map((a) => (
          <path
            key={a}
            d="M11.6 13.8 Q13 12.2 11.6 10.4"
            transform={`rotate(${a} 11.6 13.8)`}
            stroke="currentColor"
            strokeWidth="1.05"
            strokeLinecap="round"
            opacity={a === 0 ? 1 : 0.5}
          />
        ))}
        <circle cx="11.6" cy="9.6" r="1.1" fill="currentColor" />
        <circle cx="11.6" cy="13.8" r="1.25" fill="currentColor" opacity="0.85" />
      </g>
    </svg>
  );
}

/** 水泵格：撑满网格单元；名称（冷冻01/冷却01）/ 图标 / 运行指示灯 */
function PumpMetricCell({
  item,
  kind,
  code,
}: {
  item: TelemetryTagItem | null;
  kind: "frozenPump" | "coolingPump";
  code: string;
}) {
  const on = binaryRunning(item);
  const bound = Boolean(item);
  const nameLabel = (kind === "frozenPump" ? "冷冻" : "冷却") + code;
  const tone = item ? (on ? STATION_ACCENT[kind].hue : "#64748b") : "#475569";
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded border border-slate-700/55 bg-slate-950/80 px-px py-0.5 shadow-inner",
        bound && on && "cockpitLiveGlow"
      )}
      style={runShellStyle(bound && on, kind)}
      title={
        item
          ? `${nameLabel}\n${item.variableName ?? ""}\n值：${(item.value ?? "").trim() || "—"}`
          : `未绑定 ${nameLabel}`
      }
    >
      {/* 名称与运行灯并成一行：省下的一整行高度全给字形，否则上下两行会把图形夹得撑不满 */}
      <div className="flex w-full shrink-0 items-center justify-between gap-0.5 px-px">
        <span
          className={PS_NAME_LABEL_CLASS}
          style={{ fontSize: "7px", fontWeight: 400, color: bound && on ? STATION_ACCENT[kind].hue : undefined }}
          lang="zh-Hans"
        >
          {nameLabel}
        </span>
        <RunLed on={on} bound={bound} kind={kind} />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center py-px">
        <PumpGlyphSvg
          running={Boolean(on && item)}
          tone={tone}
          mirrored={kind === "coolingPump"}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}

/** 冷机 / 冷凝塔格：与水泵格同一套纵向分区；置于动力站 7×2 栅格中（与四台泵同一行时居右三列） */
function HvacChillerTowerCell({
  role,
  item,
  code,
}: {
  role: "chiller" | "tower";
  item: TelemetryTagItem | null;
  code: string;
}) {
  const on = binaryRunning(item);
  const bound = Boolean(item);
  const isCh = role === "chiller";
  const kind: StationKind = isCh ? "chiller" : "tower";
  const nameLabel = isCh ? `冷机${code}` : `冷凝塔${code}`;
  const iconTone = item ? (on ? STATION_ACCENT[kind].hue : "#64748b") : "#475569";

  if (!item) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded border border-dashed border-slate-600/45 bg-slate-950/40 px-px py-0.5"
        )}
        title={`未绑定 ${nameLabel}`}
      >
        <div className="flex w-full shrink-0 items-center justify-between gap-0.5 px-px">
          <span className={PS_NAME_LABEL_CLASS} style={{ fontSize: "7px", fontWeight: 400 }} lang="zh-Hans">
            {nameLabel}
          </span>
          <RunLed on={false} bound={false} kind={kind} />
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center py-px opacity-40">
          {isCh ? (
            <div className="relative h-full w-full">
              <svg viewBox="0 0 36 36" className="h-full w-full text-slate-600" fill="none" aria-hidden>
                <circle cx="18" cy="18" r="16" stroke="currentColor" strokeWidth="1" opacity="0.35" />
                <path
                  d="M18 4 L22 16 L18 18 L14 16 Z M32 18 L20 22 L18 18 L20 14 Z M18 32 L14 20 L18 18 L22 20 Z M4 18 L16 14 L18 18 L16 22 Z"
                  fill="currentColor"
                  opacity="0.5"
                />
              </svg>
            </div>
          ) : (
            <svg viewBox="0 0 40 36" className="h-full w-full text-slate-600" fill="none" aria-hidden>
              <path d="M8 30 L12 12 L28 12 L32 30 Z" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.08" />
            </svg>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded border border-slate-700/55 bg-slate-950/85 px-px py-0.5 shadow-inner",
        bound && on && "cockpitLiveGlow"
      )}
      style={runShellStyle(bound && on, kind)}
      title={`${nameLabel}\n${item.variableName ?? ""}\n值：${(item.value ?? "").trim() || "—"}`}
    >
      {/* 名称与运行灯并成一行：省下的一整行高度全给字形 */}
      <div className="flex w-full shrink-0 items-center justify-between gap-0.5 px-px">
        <span
          className={PS_NAME_LABEL_CLASS}
          style={{ fontSize: "7px", fontWeight: 400, color: bound && on ? STATION_ACCENT[kind].hue : undefined }}
          lang="zh-Hans"
        >
          {nameLabel}
        </span>
        <RunLed on={on} bound={bound} kind={kind} />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center py-px">
        {isCh ? (
          <div className="relative h-full w-full">
            {/* 转动层：雪花轮 */}
            <div className={cn("absolute inset-0", on ? "cockpitChillerSpin" : "")}>
              {/* 冷机画成雪花轮：六臂雪花本身就是「制冷」的通用语汇 */}
              <svg viewBox="0 0 36 36" className="h-full w-full" style={{ color: iconTone }} fill="none" stroke="currentColor" aria-hidden>
                <circle cx="18" cy="18" r="16" strokeWidth="1" opacity="0.28" />
                {[0, 60, 120, 180, 240, 300].map((a) => (
                  <g key={a} transform={`rotate(${a} 18 18)`} strokeWidth="1.15" strokeLinecap="round" opacity={a === 0 ? 0.95 : 0.5}>
                    <line x1="18" y1="18" x2="18" y2="5.6" />
                    <line x1="18" y1="10.4" x2="14.2" y2="6.8" />
                    <line x1="18" y1="10.4" x2="21.8" y2="6.8" />
                  </g>
                ))}
                {/* 顶点那一点是**唯一**的不对称标记：六重对称的雪花转 60° 就回到原样，没这个点看不出在转 */}
                <circle cx="18" cy="5.6" r="1.7" fill="currentColor" stroke="none" />
                <circle cx="18" cy="18" r="2.2" fill="currentColor" stroke="none" opacity="0.85" />
              </svg>
            </div>
            {/* 飘雪另起一层：放进上面那层就会跟着轮子一起转，不成「雪在下」 */}
            <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
              <SnowFlake x={6.5} y={3.5} r={1.5} delay="0s" on={on} />
              <SnowFlake x={13} y={10} r={1.3} delay="0.9s" on={on} />
              <SnowFlake x={22} y={5} r={1.5} delay="1.7s" on={on} />
              <SnowFlake x={29.5} y={11} r={1.3} delay="0.5s" on={on} />
              <SnowFlake x={17.5} y={16} r={1.4} delay="2.4s" on={on} />
            </svg>
          </div>
        ) : (
          <svg viewBox="0 0 40 36" className="h-full w-full" style={{ color: iconTone }} fill="none" aria-hidden>
            {/* 塔身 */}
            <path d="M8.5 30 L12 15.5 L28 15.5 L31.5 30 Z" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15" />
            <ellipse cx="20" cy="30" rx="10.4" ry="2" fill="currentColor" opacity="0.2" />
            {/* 塔顶风筒（俯视的椭圆口） */}
            <ellipse cx="20" cy="15.3" rx="9.2" ry="2.1" stroke="currentColor" strokeWidth="1" opacity="0.5" />
            {/* 顶上的大风扇：塔顶本来就是一整台会转的轴流风扇，之前只用几根风线带过。
                五片叶（奇数片）旋转后才不会看着像没动，另外第一片提亮当不对称标记。 */}
            <g style={{ transformOrigin: "20px 13.4px" }} className={on ? "cockpitFanSpin" : undefined}>
              {[0, 72, 144, 216, 288].map((a) => (
                <path
                  key={a}
                  d="M20 13.4 Q23.6 10.2 20.9 6.4 Q17.4 10.2 20 13.4 Z"
                  transform={`rotate(${a} 20 13.4)`}
                  fill="currentColor"
                  opacity={a === 0 ? 0.62 : 0.34}
                />
              ))}
              <circle cx="20" cy="13.4" r="1.6" fill="currentColor" opacity="0.9" />
            </g>
            {/* 水汽从塔顶往外冒：一条微微打弯的短笔往上飘。
                画成直愣愣的粗线段会被读成三根烟囱，弯一下、细一点才像汽。 */}
            <g>
              {[
                { x: 16.2, y: 7.4, d: "0s" },
                { x: 20, y: 6.4, d: "0.5s" },
                { x: 23.8, y: 7.4, d: "1s" },
              ].map((v) => (
                <path
                  key={`v${v.x}`}
                  d={`M${v.x} ${v.y} q 1.5 -2.5 -0.3 -5.2`}
                  className={cn(on && "cockpitVapor")}
                  style={{ animationDelay: v.d, opacity: on ? undefined : 0.18 }}
                  stroke="currentColor"
                  strokeWidth="1.15"
                  strokeLinecap="round"
                  fill="none"
                />
              ))}
            </g>
            {/* 塔底霜花：冷的一侧用雪花语汇点题，和塔顶排汽（琥珀）各管一头。
                现在是**往下飘**的飘雪，不是原来的原地明暗闪。 */}
            <SnowFlake x={10.5} y={20} r={1.5} delay="0s" on={on} />
            <SnowFlake x={17} y={24} r={1.3} delay="1.1s" on={on} />
            <SnowFlake x={26} y={20.5} r={1.5} delay="0.6s" on={on} />
            <SnowFlake x={31} y={25} r={1.3} delay="1.9s" on={on} />
            <SnowFlake x={21.5} y={27.5} r={1.4} delay="2.6s" on={on} />
          </svg>
        )}
      </div>
    </div>
  );
}

type Props = {
  tagItems: TelemetryTagItem[] | undefined;
};

/**
 * 动力站：与机械臂槽共用 {@link COCKPIT_COMPACT_METRIC_PILL_BASE}；性能栏 `items-stretch` 下与机械臂指标同高。
 * **7×2 单栅格**：第 1 行 = 冷冻水（冷冻）泵 01–04 + 冷机 01–03；第 2 行 = 冷却水（冷却）泵 01–04 + 冷凝塔 01–03。
 * 列模板用内联 `gridTemplateColumns` 固定为 7 列，避免仅写了 `grid-rows-2` 而列类未进 CSS 时退化成单列纵向 14 格。
 * 栅格总宽用内联 `width`/`minWidth`（38rem），避免 `w-[…rem]` 未进产物时 `1fr` 列塌成窄条、调宽「无变化」。
 * 根节点 `ref` 供驾驶舱性能栏测量高度，使其它模块与动力站对齐。
 */
export const CockpitPowerStationMetrics = forwardRef<HTMLDivElement, Props>(function CockpitPowerStationMetrics(
  { tagItems },
  ref
) {
  const frozen = useMemo(() => padTags(pickFrozenChilledWaterPumpTags(tagItems, 4), 4), [tagItems]);
  const cooling = useMemo(() => padTags(pickCoolingWaterPumpTags(tagItems, 4), 4), [tagItems]);
  const chillers3 = useMemo(() => padTags(pickChillerMachineTags(tagItems, 3), 3), [tagItems]);
  const towers3 = useMemo(() => padTags(pickCoolingTowerTags(tagItems, 3), 3), [tagItems]);

  return (
    <div
      ref={ref}
      className={cn(
        COCKPIT_COMPACT_METRIC_PILL_BASE,
        "flex h-full min-h-0 max-h-full w-fit shrink-0 flex-row flex-nowrap items-stretch self-stretch overflow-hidden px-1 py-1 sm:px-1.5 sm:py-1.5"
      )}
      /* 权重=本卡基准宽度：顶栏余量按各卡宽度比例分配，宽屏铺满、比例不变 */
      style={{ ...COCKPIT_METRIC_PILL_SIZE, flex: "620 1 620px" }}
      title="动力站：第1行冷冻泵01–04+冷机01–03，第2行冷却泵01–04+冷凝塔01–03（7×2）；与机械臂指标同高；运行指示灯；悬停看变量全名"
    >
      <div
        className="grid h-full min-h-0 shrink-0 gap-px overflow-hidden"
        style={{
          // 宽度跟随卡片（卡片按比例撑满顶栏）；minWidth 只是窄屏下的不压缩下限
          width: "100%",
          minWidth: "38rem",
          maxWidth: "none",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gridTemplateRows: "repeat(2, minmax(0, 1fr))",
        }}
        role="group"
        aria-label="第一行冷冻水四台泵与冷机三台，第二行冷却水四台泵与冷凝塔三台"
      >
        {frozen.map((it, i) => (
          <PumpMetricCell key={`f-${i}`} item={it} kind="frozenPump" code={twoDigit(i + 1)} />
        ))}
        {chillers3.map((it, i) => (
          <HvacChillerTowerCell key={`ch-${i}`} role="chiller" item={it} code={twoDigit(i + 1)} />
        ))}
        {cooling.map((it, i) => (
          <PumpMetricCell key={`c-${i}`} item={it} kind="coolingPump" code={twoDigit(i + 1)} />
        ))}
        {towers3.map((it, i) => (
          <HvacChillerTowerCell key={`tw-${i}`} role="tower" item={it} code={twoDigit(i + 1)} />
        ))}
      </div>
    </div>
  );
});
CockpitPowerStationMetrics.displayName = "CockpitPowerStationMetrics";
