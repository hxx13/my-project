import { useEffect, useMemo } from "react";
import type { TelemetryTagItem } from "@/telemetry-view/types";
import { Cpu, Loader2 } from "lucide-react";
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
@keyframes cockpitRobotCargoShuttle {
  0%, 12% { transform: translateX(0); }
  44%, 56% { transform: translateX(34px); }
  88%, 100% { transform: translateX(0); }
}
.cockpitRobotCargoShuttle {
  animation: cockpitRobotCargoShuttle 1.35s ease-in-out infinite;
}
`;
  document.head.appendChild(el);
}

/** 与机械臂性能槽同高的卡片基础样式（边框/底色/内边距/min-h），供机械臂槽、动力站等复用 */
export const COCKPIT_COMPACT_METRIC_PILL_BASE =
  "pointer-events-auto min-h-[7.25rem] rounded-lg border border-cyan-500/20 bg-slate-950/85 px-2.5 py-3 shadow-sm backdrop-blur-sm sm:min-h-[7.75rem] sm:px-3 sm:py-3.5";

const METRICS_PILL_SHELL = cn(
  COCKPIT_COMPACT_METRIC_PILL_BASE,
  "flex h-full min-h-0 max-h-full min-w-0 shrink-0 flex-col justify-center sm:min-w-[9rem] sm:max-w-[11.5rem]"
);

/** 性能指标栏 · 单个机械臂槽位（较其它 metricsPill 占位更矮，节省纵向空间） */
export function CockpitRobotArmMetricSlot({
  item,
  slotIndex,
  totalSlots,
  telemetryFetching,
}: {
  item: TelemetryTagItem;
  slotIndex: number;
  totalSlots: number;
  telemetryFetching: boolean;
}) {
  const run = parseRobotArmRun01(item.value ?? null);
  const running = run === true;
  const label = running ? "运行中" : "停机";
  const labelCls = running ? "text-cyan-200" : "text-slate-400";
  const raw = (item.value ?? "").trim();
  const titleBits = [raw ? `WinCC 值：${raw}` : null, item.variableName || null].filter(Boolean).join("\n");

  return (
    <div className={METRICS_PILL_SHELL} title={titleBits || undefined}>
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
          {telemetryFetching && slotIndex === 1 ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-cyan-400/70" aria-hidden />
          ) : null}
        </div>
        <CockpitRobotArmShuttleSvg running={running} className="h-8 w-[4.5rem] shrink-0 text-cyan-300/90 sm:h-9 sm:w-[5rem]" />
        <div className="w-full min-w-0 px-0.5 text-center">
          <div className="line-clamp-2 text-[9px] leading-snug text-slate-500 sm:text-[10px]" title={item.variableName || undefined}>
            {displayName(item)}
          </div>
          <div className={cn("mt-0.5 text-[10px] font-semibold sm:text-[11px]", labelCls)}>{label}</div>
        </div>
      </div>
    </div>
  );
}

type SlotsProps = {
  tagItems: TelemetryTagItem[] | undefined;
  telemetryFetching: boolean;
};

/** 性能指标栏：有几个含「机械臂」的变量就渲染几个槽位 */
export function CockpitRobotArmMetricSlots({ tagItems, telemetryFetching }: SlotsProps) {
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
          telemetryFetching={telemetryFetching}
        />
      ))}
    </>
  );
}

function CockpitRobotArmShuttleSvg({ running, className }: { running: boolean; className?: string }) {
  return (
    <svg className={cn(className)} viewBox="0 0 88 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="1" y="26" width="86" height="3" rx="1" fill="currentColor" opacity="0.22" />
      <rect x="4" y="17" width="10" height="9" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="5" y="14" width="8" height="3" rx="0.5" fill="currentColor" opacity="0.25" />
      <rect x="74" y="17" width="10" height="9" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="75" y="14" width="8" height="3" rx="0.5" fill="currentColor" opacity="0.25" />
      <rect x="20" y="8" width="3" height="18" rx="0.5" fill="currentColor" opacity="0.55" />
      <path d="M23 10 Q38 6 52 12 L56 14 L54 17 L50 15 Q38 10 23 13 Z" fill="currentColor" opacity={0.72} />
      <path d="M54 15 L58 18 L56 20 L52 17 Z" fill="currentColor" opacity={0.65} />
      <g style={{ transformOrigin: "14px 22px" }} className={cn(running ? "cockpitRobotCargoShuttle" : "")}>
        <rect x="8" y="19" width="9" height="7" rx="1" fill="currentColor" opacity="0.9" />
        <rect x="9.5" y="20" width="6" height="2" rx="0.3" fill="currentColor" opacity="0.35" />
      </g>
    </svg>
  );
}
