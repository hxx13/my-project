import { useEffect, useMemo } from "react";
import type { TelemetryTagItem } from "@/telemetry-view/types";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

const KF_STYLE_ID = "cockpit-robot-arm-cargo-shuttle-kf";

/** 与 WinCC 导入变量库一致：变量名/展示名/指标名等任一含「机械臂」即占性能栏一个槽位 */
export function tagItemLooksLikeRobotArm(it: TelemetryTagItem): boolean {
  const blob = `${it.variableName ?? ""}${it.displayLabel ?? ""}${it.metricKindLabel ?? ""}${it.metricKindCode ?? ""}`;
  return blob.includes("机械臂");
}

export function findRobotArmTagItems(tagItems: TelemetryTagItem[] | undefined): TelemetryTagItem[] {
  if (!tagItems?.length) return [];
  const out = tagItems.filter(tagItemLooksLikeRobotArm);
  out.sort((a, b) => String(a.variableName || "").localeCompare(String(b.variableName || ""), "zh-Hans-CN"));
  return out;
}

/** 1=运行中，0=停机；其它可读数字非 0 视为运行 */
export function parseRobotArmRun01(raw: string | null | undefined): boolean | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const n = Number(t);
  if (Number.isFinite(n)) {
    if (n === 1) return true;
    if (n === 0) return false;
    return n !== 0;
  }
  const lo = t.toLowerCase();
  if (lo === "true" || lo === "on") return true;
  if (lo === "false" || lo === "off") return false;
  return null;
}

function displayName(it: TelemetryTagItem): string {
  const a = (it.displayLabel || "").trim();
  const b = (it.metricKindLabel || "").trim();
  const c = (it.variableName || "").trim();
  if (a) return a;
  if (b) return b;
  return c || "机械臂";
}

function injectShuttleKeyframesOnce() {
  if (typeof document === "undefined") return;
  if (document.getElementById(KF_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = KF_STYLE_ID;
  el.textContent = `
@keyframes cockpitRobotArmTraverse {
  0%, 8% { transform: translateX(0); }
  45%, 55% { transform: translateX(34px); }
  91%, 100% { transform: translateX(0); }
}
@keyframes cockpitRobotArmHoist {
  0%, 8% { transform: translateY(0); }
  18%, 45% { transform: translateY(-4.6px); }
  55%, 63% { transform: translateY(0); }
  73%, 91% { transform: translateY(-4.6px); }
  100% { transform: translateY(0); }
}
@keyframes cockpitRobotBelt { to { stroke-dashoffset: -18; } }
@keyframes cockpitRobotLiveGlow {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.3); }
}
.cockpitRobotArmTraverse {
  animation: cockpitRobotArmTraverse 3.6s cubic-bezier(.5, 0, .5, 1) infinite;
}
.cockpitRobotArmHoist {
  animation: cockpitRobotArmHoist 3.6s ease-in-out infinite;
}
.cockpitRobotBelt {
  stroke-dasharray: 4.5 4;
  animation: cockpitRobotBelt 0.95s linear infinite;
}
.cockpitRobotLiveGlow { animation: cockpitRobotLiveGlow 2.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .cockpitRobotArmTraverse, .cockpitRobotArmHoist, .cockpitRobotBelt, .cockpitRobotLiveGlow { animation: none; }
  .cockpitRobotBelt { stroke-dashoffset: -6; }
}
`;
  document.head.appendChild(el);
}

/** 与机械臂性能槽同高的卡片基础样式（边框/底色/内边距/min-h），供机械臂槽、动力站等复用 */
export const COCKPIT_COMPACT_METRIC_PILL_BASE =
  "pointer-events-auto min-h-[13rem] rounded-lg border border-cyan-500/20 bg-slate-950/85 px-2.5 py-3 shadow-sm backdrop-blur-sm sm:min-h-[13.75rem] sm:px-3 sm:py-3.5";

const METRICS_PILL_SHELL = cn(
  COCKPIT_COMPACT_METRIC_PILL_BASE,
  "flex h-full min-h-0 max-h-full min-w-0 shrink-0 flex-col justify-center sm:min-w-[13rem] sm:max-w-[16.5rem]"
);

/** 性能指标栏 · 单个机械臂槽位（较其它 metricsPill 占位更矮，节省纵向空间） */
export function CockpitRobotArmMetricSlot({
  item,
  slotIndex,
  totalSlots,
}: {
  item: TelemetryTagItem;
  slotIndex: number;
  totalSlots: number;
}) {
  const run = parseRobotArmRun01(item.value ?? null);
  const running = run === true;
  const label = running ? "运行中" : "停机";
  const labelCls = running ? "text-cyan-200" : "text-slate-400";
  const raw = (item.value ?? "").trim();
  const titleBits = [raw ? `WinCC 值：${raw}` : null, item.variableName || null].filter(Boolean).join("\n");

  return (
    <div
      className={cn(METRICS_PILL_SHELL, running && "cockpitRobotLiveGlow")}
      title={titleBits || undefined}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 py-0.5">
        <div className="flex w-full shrink-0 items-center justify-center gap-1">
          <Cpu className="h-3 w-3 shrink-0 text-cyan-400/80 sm:h-3.5 sm:w-3.5" aria-hidden />
          <span className="truncate text-[11px] font-semibold text-cyan-100/95 sm:text-xs">
            机械臂
            {totalSlots > 1 ? (
              <span className="ml-0.5 font-mono text-[10px] font-normal text-cyan-500/90">
                {slotIndex}/{totalSlots}
              </span>
            ) : null}
          </span>
        </div>
        <CockpitRobotArmShuttleSvg running={running} className="h-[5.25rem] w-[14.5rem] shrink-0 text-cyan-300/90" />
        <div className="w-full min-w-0 px-0.5 text-center">
          <div className="line-clamp-2 text-[10px] leading-snug text-slate-500 sm:text-[11px]" title={item.variableName || undefined}>
            {displayName(item)}
          </div>
          <div className={cn("mt-0.5 text-[12px] font-semibold sm:text-[13px]", labelCls)}>{label}</div>
        </div>
      </div>
    </div>
  );
}

type SlotsProps = {
  tagItems: TelemetryTagItem[] | undefined;
};

/** 性能指标栏：有几个含「机械臂」的变量就渲染几个槽位 */
export function CockpitRobotArmMetricSlots({ tagItems }: SlotsProps) {
  const matches = useMemo(() => findRobotArmTagItems(tagItems), [tagItems]);

  useEffect(() => {
    if (matches.length === 0) return;
    injectShuttleKeyframesOnce();
  }, [matches.length]);

  if (matches.length === 0) return null;

  return (
    <>
      {matches.map((it, idx) => (
        <CockpitRobotArmMetricSlot
          key={`${it.variableName ?? ""}\0${it.watchlistTagId ?? idx}`}
          item={it}
          slotIndex={idx + 1}
          totalSlots={matches.length}
        />
      ))}
    </>
  );
}

/**
 * 机械臂：一台会走动的搬运臂，走「抓取 → 提起 → 搬过去 → 放下 → 提起 → 搬回来」的完整循环。
 *
 * 立柱+臂+吊具+货箱是**同一节车厢**，一起沿地面轨道横移（分开动会被看成两张不相干的图）；
 * 货箱相对臂再做升降，才有「提起来 / 放下去」这个动作。机身用本体色，货箱用琥珀。
 */
function CockpitRobotArmShuttleSvg({ running, className }: { running: boolean; className?: string }) {
  return (
    <svg className={cn(className)} viewBox="0 0 88 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {/* 地面轨道：运行时带纹在走 */}
      <rect x="1" y="26" width="86" height="3.2" rx="1" fill="currentColor" opacity="0.2" />
      <line
        x1="3"
        y1="27.6"
        x2="85"
        y2="27.6"
        className={cn(running && "cockpitRobotBelt")}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* 轨道两端机架（不动） */}
      <rect x="4" y="17" width="10" height="9" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="5" y="14" width="8" height="3" rx="0.5" fill="currentColor" opacity="0.25" />
      <rect x="74" y="17" width="10" height="9" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="75" y="14" width="8" height="3" rx="0.5" fill="currentColor" opacity="0.25" />
      {/* 搬运臂整节横移 */}
      <g className={cn(running && "cockpitRobotArmTraverse")}>
        <rect x="8" y="24.6" width="9" height="2.6" rx="0.9" fill="currentColor" opacity="0.4" />
        <rect x="11" y="10" width="3" height="15" rx="0.5" fill="currentColor" opacity="0.55" />
        <path d="M12.5 11.5 Q23 9.5 33 14 L34.5 15.5 L33 17 L30.5 15.6 Q23 12.4 12.5 13.8 Z" fill="currentColor" opacity="0.72" />
        <path d="M31.5 14.4 L35 16.6 L33.5 18.4 L30 16.2 Z" fill="currentColor" opacity="0.65" />
        {/* 吊具升降：货箱相对臂提起 / 放下 */}
        <g style={{ color: running ? "#fbbf24" : "#64748b" }} className={cn(running && "cockpitRobotArmHoist")}>
          <line x1="33.4" y1="18" x2="33.4" y2="20.6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
          <rect x="29" y="20.6" width="9" height="6" rx="1" fill="currentColor" opacity="0.92" />
          <rect x="30.5" y="21.8" width="6" height="1.8" rx="0.3" fill="#0f172a" opacity="0.35" />
        </g>
      </g>
    </svg>
  );
}
