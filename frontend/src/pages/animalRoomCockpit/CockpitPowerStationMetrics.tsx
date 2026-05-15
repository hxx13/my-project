import { useEffect, useMemo, forwardRef } from "react";
import type { TelemetryTagItem } from "@/telemetry-view/types";
import { Loader2 } from "lucide-react";
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

/** 运行态统一：与顶栏/机械臂 cyan 系一致（图标、LED） */
const PS_RUN_ICON = "text-cyan-300";
const PS_STOP_ICON = "text-slate-500";
const PS_UNBOUND_ICON = "text-slate-600";

/** 外框高亮：仅「有测点且运行」时显示，停机/无绑定一律暗边框，避免冷凝塔停机仍亮框、冷机运行却看不见框 */
const PS_RUN_OUTLINE = "border-cyan-300/55 ring-1 ring-cyan-200/45";
const PS_IDLE_OUTLINE = "border-slate-700/55 ring-0";

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
@keyframes cockpitTowerMist {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.95; }
}
.cockpitTowerMist {
  animation: cockpitTowerMist 1.1s ease-in-out infinite;
}
`;
  document.head.appendChild(el);
}

function binaryRunning(it: TelemetryTagItem | null): boolean {
  if (!it) return false;
  return parseRobotArmRun01(it.value ?? null) === true;
}

/** 水泵运行指示灯：亮=运行，暗=停机，灰=无绑定 */
function PumpRunLed({ on, bound }: { on: boolean; bound: boolean }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center py-0.5"
      title={!bound ? "无测点" : on ? "运行" : "停机"}
      role="img"
      aria-label={!bound ? "无测点" : on ? "运行" : "停机"}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full ring-1 ring-inset ring-offset-0",
          !bound && "bg-slate-700/60 ring-slate-600/50",
          bound &&
            on &&
            "bg-cyan-400 shadow-[0_0_7px_rgba(34,211,238,0.55)] ring-cyan-300/45",
          bound && !on && "bg-slate-600/90 ring-slate-500/35"
        )}
      />
    </span>
  );
}

/**
 * 小型离心泵符号：停机无动效；运行态仅叶轮旋转（状态机「在转」）。
 */
function PumpGlyphSvg({ running, className }: { running: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 28 22" className={cn(className)} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M1 13 H9" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" opacity="0.9" />
      <path
        d="M9 8.5 L9 16.5 Q9 18 11 18 H17 Q20.5 18 21.5 14.5 L22.5 10 Q23 7.5 19.5 6.5 L13 5.5 Q10 5.5 9 8.5 Z"
        stroke="currentColor"
        strokeWidth="0.95"
        fill="currentColor"
        fillOpacity="0.1"
      />
      <path d="M15 5.5 V3.5 H20" stroke="currentColor" strokeWidth="0.95" strokeLinecap="round" opacity="0.85" />
      <g
        style={{
          transformOrigin: "14px 12px",
          animationDuration: running ? "0.95s" : undefined,
        }}
        className={running ? "animate-spin" : undefined}
      >
        <circle cx="14" cy="12" r="4.8" stroke="currentColor" strokeWidth="0.85" fill="currentColor" fillOpacity="0.12" />
        <path
          d="M14 12 L14 7.5 M14 12 L17.8 14 M14 12 L10.2 14"
          stroke="currentColor"
          strokeWidth="1.05"
          strokeLinecap="round"
          opacity="0.9"
        />
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
  kind: "frozen" | "cooling";
  code: string;
}) {
  const on = binaryRunning(item);
  const bound = Boolean(item);
  const nameLabel = (kind === "frozen" ? "冷冻" : "冷却") + code;
  const tone = item ? (on ? PS_RUN_ICON : PS_STOP_ICON) : PS_UNBOUND_ICON;
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col items-center justify-between gap-px overflow-hidden rounded border bg-slate-950/80 px-px py-0.5 shadow-inner",
        bound && on ? PS_RUN_OUTLINE : PS_IDLE_OUTLINE
      )}
      title={
        item
          ? `${nameLabel}\n${item.variableName ?? ""}\n值：${(item.value ?? "").trim() || "—"}`
          : `未绑定 ${nameLabel}`
      }
    >
      <span className={PS_NAME_LABEL_CLASS} style={{ fontSize: "6px", fontWeight: 400 }} lang="zh-Hans">
        {nameLabel}
      </span>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-px">
        <PumpGlyphSvg running={Boolean(on && item)} className={cn("h-7 w-8 max-h-full shrink-0 sm:h-8 sm:w-9", tone)} />
      </div>
      <PumpRunLed on={on} bound={bound} />
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
  const nameLabel = isCh ? `冷机${code}` : `冷凝塔${code}`;
  const iconTone = item ? (on ? PS_RUN_ICON : PS_STOP_ICON) : PS_UNBOUND_ICON;

  if (!item) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 w-full min-w-0 flex-col items-center justify-between gap-px overflow-hidden rounded border border-dashed border-slate-600/45 bg-slate-950/40 px-px py-0.5"
        )}
        title={`未绑定 ${nameLabel}`}
      >
        <span className={PS_NAME_LABEL_CLASS} style={{ fontSize: "6px", fontWeight: 400 }} lang="zh-Hans">
          {nameLabel}
        </span>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-px opacity-40">
          {isCh ? (
            <div className="relative h-5 w-5 max-h-full shrink-0 sm:h-6 sm:w-6">
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
            <svg viewBox="0 0 40 36" className="h-5 w-5 max-h-full shrink-0 text-slate-600 sm:h-6 sm:w-6" fill="none" aria-hidden>
              <path d="M8 30 L12 12 L28 12 L32 30 Z" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.08" />
            </svg>
          )}
        </div>
        <PumpRunLed on={false} bound={false} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-col items-center justify-between gap-px overflow-hidden rounded border bg-slate-950/85 px-px py-0.5 shadow-inner",
        bound && on ? PS_RUN_OUTLINE : PS_IDLE_OUTLINE
      )}
      title={`${nameLabel}\n${item.variableName ?? ""}\n值：${(item.value ?? "").trim() || "—"}`}
    >
      <span className={PS_NAME_LABEL_CLASS} style={{ fontSize: "6px", fontWeight: 400 }} lang="zh-Hans">
        {nameLabel}
      </span>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-px">
        {isCh ? (
          <div
            className={cn("relative h-5 w-5 max-h-full shrink-0 sm:h-6 sm:w-6", on ? "animate-spin" : "")}
            style={{ animationDuration: on ? "2.4s" : undefined }}
          >
            <svg viewBox="0 0 36 36" className={cn("h-full w-full", iconTone)} fill="none" aria-hidden>
              <circle cx="18" cy="18" r="16" stroke="currentColor" strokeWidth="1" opacity="0.35" />
              <path
                d="M18 4 L22 16 L18 18 L14 16 Z M32 18 L20 22 L18 18 L20 14 Z M18 32 L14 20 L18 18 L22 20 Z M4 18 L16 14 L18 18 L16 22 Z"
                fill="currentColor"
                opacity="0.85"
              />
              <circle cx="18" cy="18" r="2.5" fill="currentColor" opacity="0.5" />
            </svg>
          </div>
        ) : (
          <svg viewBox="0 0 40 36" className={cn("h-5 w-5 max-h-full shrink-0 sm:h-6 sm:w-6", iconTone)} fill="none" aria-hidden>
            <path d="M8 30 L12 12 L28 12 L32 30 Z" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15" />
            <line x1="20" y1="12" x2="20" y2="6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            <path d="M14 8 Q20 4 26 8" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.7" />
            <g className={cn(on ? "cockpitTowerMist" : "opacity-30")}>
              <line x1="16" y1="18" x2="16" y2="26" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 2" />
              <line x1="20" y1="16" x2="20" y2="27" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 2" />
              <line x1="24" y1="18" x2="24" y2="26" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 2" />
            </g>
            <ellipse cx="20" cy="30" rx="10" ry="2" fill="currentColor" opacity="0.2" />
          </svg>
        )}
      </div>
      <PumpRunLed on={on} bound={bound} />
    </div>
  );
}

type Props = {
  tagItems: TelemetryTagItem[] | undefined;
  telemetryFetching: boolean;
};

/**
 * 动力站：与机械臂槽共用 {@link COCKPIT_COMPACT_METRIC_PILL_BASE}；性能栏 `items-stretch` 下与机械臂指标同高。
 * **7×2 单栅格**：第 1 行 = 冷冻水（冷冻）泵 01–04 + 冷机 01–03；第 2 行 = 冷却水（冷却）泵 01–04 + 冷凝塔 01–03。
 * 列模板用内联 `gridTemplateColumns` 固定为 7 列，避免仅写了 `grid-rows-2` 而列类未进 CSS 时退化成单列纵向 14 格。
 * 栅格总宽用内联 `width`/`minWidth`（约 37.125rem），避免 `w-[…rem]` 未进产物时 `1fr` 列塌成窄条、调宽「无变化」。
 * 根节点 `ref` 供驾驶舱性能栏测量高度，使其它模块与动力站对齐。
 */
export const CockpitPowerStationMetrics = forwardRef<HTMLDivElement, Props>(function CockpitPowerStationMetrics(
  { tagItems, telemetryFetching },
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
          width: "37.125rem",
          minWidth: "37.125rem",
          maxWidth: "none",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gridTemplateRows: "repeat(2, minmax(0, 1fr))",
        }}
        role="group"
        aria-label="第一行冷冻水四台泵与冷机三台，第二行冷却水四台泵与冷凝塔三台"
      >
        {frozen.map((it, i) => (
          <PumpMetricCell key={`f-${i}`} item={it} kind="frozen" code={twoDigit(i + 1)} />
        ))}
        {chillers3.map((it, i) => (
          <HvacChillerTowerCell key={`ch-${i}`} role="chiller" item={it} code={twoDigit(i + 1)} />
        ))}
        {cooling.map((it, i) => (
          <PumpMetricCell key={`c-${i}`} item={it} kind="cooling" code={twoDigit(i + 1)} />
        ))}
        {towers3.map((it, i) => (
          <HvacChillerTowerCell key={`tw-${i}`} role="tower" item={it} code={twoDigit(i + 1)} />
        ))}
      </div>

      {telemetryFetching ? (
        <Loader2 className="ml-0.5 h-3 w-3 shrink-0 self-center animate-spin text-cyan-400/70" aria-hidden />
      ) : null}
    </div>
  );
});
CockpitPowerStationMetrics.displayName = "CockpitPowerStationMetrics";
