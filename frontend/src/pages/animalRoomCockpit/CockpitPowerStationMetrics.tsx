import { useEffect, useMemo, forwardRef } from "react";
import type { TelemetryTagItem } from "@/telemetry-view/types";
import { cn } from "@/lib/utils";
import { COCKPIT_COMPACT_METRIC_PILL_BASE, parseRobotArmRun01 } from "./CockpitRobotArmMetricSlots";
import {
  pickChillerMachineTags,
  pickCoolingTowerTags,
  pickCoolingWaterPumpTags,
  pickFrozenChilledWaterPumpTags,
} from "./cockpitPowerStationTags";

const KF_ID = "cockpit-power-station-metric-kf";

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

function injectPowerStationKeyframesOnce() {
  if (typeof document === "undefined") return;
  if (document.getElementById(KF_ID)) return;
  const el = document.createElement("style");
  el.id = KF_ID;
  el.textContent = `
@keyframes cockpitSpin { to { transform: rotate(360deg); } }
@keyframes cockpitFlow { to { stroke-dashoffset: -18; } }
@keyframes cockpitVapor {
  0% { transform: translateY(4px) translateX(0); opacity: 0; }
  25% { opacity: 0.95; }
  60% { transform: translateY(-3px) translateX(0.6px); opacity: 0.6; }
  100% { transform: translateY(-9px) translateX(-0.6px); opacity: 0; }
}
@keyframes cockpitLiveGlow {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.3); }
}
@keyframes cockpitFrost {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
.cockpitPumpSpin { animation: cockpitSpin 0.9s linear infinite; }
.cockpitChillerSpin { animation: cockpitSpin 2.2s linear infinite; }
.cockpitFlow { stroke-dasharray: 4.5 3.5; animation: cockpitFlow 0.75s linear infinite; }
.cockpitVapor { animation: cockpitVapor 2s ease-in-out infinite; }
.cockpitFrost { animation: cockpitFrost 3.2s ease-in-out infinite; }
.cockpitLiveGlow { animation: cockpitLiveGlow 2.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .cockpitPumpSpin, .cockpitChillerSpin, .cockpitFlow, .cockpitVapor, .cockpitFrost, .cockpitLiveGlow { animation: none; }
  .cockpitFlow { stroke-dashoffset: -5; }
  .cockpitVapor { opacity: 0.7; }
  .cockpitFrost { opacity: 0.7; }
}
`;
  document.head.appendChild(el);
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
 * 小型离心泵符号：停机无动效；运行态叶轮旋转 + 进出口两段水流。
 *
 * **同一台机器，两路靠接管走向区分**：冷冻水左侧进水、向上出水；冷却水整体镜像（右侧进水、向上出水），
 * 水流方向随之相反。接管怎么接是一路水的真实差别，比给两台泵各加一套装饰更能说明问题。
 *
 * 叶轮刻意做成**不对称**的（叶片压暗、其中一片 + 轮缘一点是高亮的）：三重对称的图形旋转 120°
 * 后与原来一模一样，等于看不出在转 —— 必须有一个高亮标记绕着圆心走，小尺寸下才读得出「在转」。
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
      viewBox="0 0 28 22"
      className={cn(className)}
      style={{ color: tone, transform: mirrored ? "scaleX(-1)" : undefined }}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* 进口管 */}
      <path d="M1 13 H9" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" opacity="0.7" />
      {running ? (
        <path d="M0.6 13 H9.6" className="cockpitFlow" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
      {/* 泵体 */}
      <path
        d="M9 8.5 L9 16.5 Q9 18 11 18 H17 Q20.5 18 21.5 14.5 L22.5 10 Q23 7.5 19.5 6.5 L13 5.5 Q10 5.5 9 8.5 Z"
        stroke="currentColor"
        strokeWidth="0.95"
        fill="currentColor"
        fillOpacity="0.1"
      />
      {/* 出口管 */}
      <path d="M15 5.5 V3.5 H25" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" opacity="0.7" />
      {running ? (
        <path d="M15.6 3.5 H25.4" className="cockpitFlow" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
      <g style={{ transformOrigin: "14px 12px" }} className={running ? "cockpitPumpSpin" : undefined}>
        <circle cx="14" cy="12" r="4.8" stroke="currentColor" strokeWidth="0.85" fill="currentColor" fillOpacity="0.12" />
        {/* 叶片压暗，当底色 */}
        <path
          d="M14 12 L14 7.5 M14 12 L17.8 14 M14 12 L10.2 14"
          stroke="currentColor"
          strokeWidth="1.05"
          strokeLinecap="round"
          opacity="0.45"
        />
        {/* 高亮叶 + 轮缘点：转起来才看得出的那个标记 */}
        <path d="M14 12 L14 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="14" cy="6.4" r="1.2" fill="currentColor" />
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
          <div className={cn("relative h-full w-full", on ? "cockpitChillerSpin" : "")}>
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
        ) : (
          <svg viewBox="0 0 40 36" className="h-full w-full" style={{ color: iconTone }} fill="none" aria-hidden>
            <path d="M8 30 L12 12 L28 12 L32 30 Z" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15" />
            <line x1="20" y1="12" x2="20" y2="6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            <path d="M14 8 Q20 4 26 8" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.7" />
            {/* 水汽从塔顶往外冒：画在塔身上方，不画在塔身里（画在里面读起来像格栅不是汽） */}
            <g>
              {[
                { x: 16, y1: 8.5, y2: 1.5, d: "0s" },
                { x: 19.4, y1: 6.6, y2: 1, d: "0.5s" },
                { x: 22.8, y1: 8.5, y2: 1.5, d: "1s" },
              ].map((v) => (
                <line
                  key={`v${v.x}`}
                  x1={v.x}
                  y1={v.y1}
                  x2={v.x}
                  y2={v.y2}
                  className={cn(on && "cockpitVapor")}
                  style={{ animationDelay: v.d, opacity: on ? undefined : 0.18 }}
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              ))}
            </g>
            <ellipse cx="20" cy="30" rx="10" ry="2" fill="currentColor" opacity="0.2" />
            {/* 塔底霜花：冷的一侧用雪花语汇点题，和塔顶排汽（琥珀）各管一头 */}
            {[
              { x: 11, y: 33, d: "0s" },
              { x: 20, y: 34.4, d: "1.1s" },
              { x: 29, y: 33, d: "2.2s" },
            ].map((f) => (
              <g
                key={`fr${f.x}`}
                className={cn(on && "cockpitFrost")}
                style={{ animationDelay: f.d, opacity: on ? undefined : 0.35 }}
                stroke="#7dd3fc"
                strokeWidth="0.95"
                strokeLinecap="round"
              >
                <line x1={f.x} y1={f.y - 2.1} x2={f.x} y2={f.y + 2.1} />
                <line x1={f.x - 1.8} y1={f.y - 1.05} x2={f.x + 1.8} y2={f.y + 1.05} />
                <line x1={f.x - 1.8} y1={f.y + 1.05} x2={f.x + 1.8} y2={f.y - 1.05} />
              </g>
            ))}
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

  useEffect(() => {
    injectPowerStationKeyframesOnce();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        COCKPIT_COMPACT_METRIC_PILL_BASE,
        "flex h-full min-h-0 max-h-full w-fit shrink-0 flex-row flex-nowrap items-stretch self-stretch overflow-hidden px-1 py-1 sm:px-1.5 sm:py-1.5"
      )}
      title="动力站：第1行冷冻泵01–04+冷机01–03，第2行冷却泵01–04+冷凝塔01–03（7×2）；与机械臂指标同高；运行指示灯；悬停看变量全名"
    >
      <div
        className="grid h-full min-h-0 shrink-0 gap-px overflow-hidden"
        style={{
          width: "38rem",
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
