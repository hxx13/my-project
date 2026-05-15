import type { TelemetryStructuredFloorTab } from "@/telemetry-view/types";
import type { TelemetryStructuredMetricSlot } from "@/telemetry-view/types";
import {
  formatTelemetryStatusOnOff,
  isStatusTelemetryMetric,
  isSwitchTelemetryMetric,
} from "@/telemetry-view/structuredTabs";
import { cn } from "@/lib/utils";

function isSetpointLikeSlot(m: TelemetryStructuredMetricSlot): boolean {
  const kr = (m.item.kindRole || "").trim().toUpperCase();
  if (kr === "LIMIT_MIN" || kr === "LIMIT_MAX") return true;
  const lab = `${m.metricKindLabel ?? ""}${m.item.displayLabel ?? ""}`;
  return lab.includes("设定") || lab.includes("给定") || lab.includes("设定值");
}

function formatMetricValue(m: TelemetryStructuredMetricSlot): string {
  const raw = (m.item.value ?? "").trim();
  if (!raw) return "—";
  if (isStatusTelemetryMetric(m.metricKindCode, m.metricKindLabel)) {
    const onOff = formatTelemetryStatusOnOff(raw);
    if (onOff) return onOff;
  }
  return raw;
}

function slotLabel(m: TelemetryStructuredMetricSlot): string {
  const a = (m.item.displayLabel || "").trim();
  const b = (m.metricKindLabel || "").trim();
  if (a) return a;
  if (b) return b;
  return (m.item.variableName || "").trim() || "—";
}

type Props = {
  tab: TelemetryStructuredFloorTab | null;
  winccEnabled: boolean;
};

/**
 * 驾驶舱左侧栏：与动物房「机房」分区同源的结构化套间/房间/指标（含可设定上下限、开关等），只读展示。
 */
export function CockpitMachineRoomSidebar({ tab, winccEnabled }: Props) {
  if (!winccEnabled) {
    return (
      <p className="text-[10px] leading-relaxed text-slate-500">
        WinCC 未启用时无机房实时参数。
      </p>
    );
  }

  if (!tab?.suiteGroups?.length) {
    return (
      <p className="text-[10px] leading-relaxed text-slate-500">
        当前页暂无「机房」类套间（动力站/锅炉房等）结构化数据。请在遥测映射与导入库中配置后刷新。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] leading-relaxed text-cyan-500/90">
        与顶栏「机房」Tab 同源：套间来自 WinCC 导入与设施布局规则；以下为只读快照。
      </p>
      {tab.suiteGroups.map((sg) => (
        <section
          key={`${sg.tabKey}:${sg.suiteNorm}:${sg.sortKey}`}
          className="rounded-md border border-cyan-500/15 bg-slate-950/50 p-2 shadow-inner shadow-black/20"
        >
          <h3 className="mb-1.5 border-b border-cyan-500/10 pb-1 text-[10px] font-semibold text-cyan-100/95">
            {sg.suiteTitle || sg.bundleTitle || "套间"}
          </h3>
          <div className="flex flex-col gap-2">
            {sg.rooms.map((room) => (
              <div key={room.sortKey || room.roomCanonical} className="rounded border border-slate-700/40 bg-slate-950/40 p-1.5">
                <div className="mb-1 truncate text-[9px] font-medium text-slate-400" title={room.roomCanonical}>
                  {room.displayTitle || room.roomCanonical}
                </div>
                <ul className="space-y-1">
                  {room.metrics.map((m, idx) => {
                    const sw = isSwitchTelemetryMetric(
                      m.item.kindRole,
                      m.metricKindCode,
                      m.metricKindLabel,
                      m.item.displayLabel,
                      m.item.variableName
                    );
                    const st = isStatusTelemetryMetric(m.metricKindCode, m.metricKindLabel);
                    const setp = isSetpointLikeSlot(m);
                    const val = formatMetricValue(m);
                    return (
                      <li
                        key={`${m.item.variableName ?? idx}`}
                        className="flex min-w-0 items-start justify-between gap-1 border-b border-slate-800/60 pb-1 last:border-0 last:pb-0"
                      >
                        <span className="min-w-0 flex-1 break-words text-[9px] leading-snug text-slate-300" title={m.item.variableName || undefined}>
                          {slotLabel(m)}
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <span
                            className={cn(
                              "max-w-[5.5rem] truncate font-mono text-[9px] font-semibold",
                              sw || st ? "text-cyan-200" : "text-slate-100"
                            )}
                            title={(m.item.value ?? "").trim() || undefined}
                          >
                            {val}
                          </span>
                          <span className="flex flex-wrap justify-end gap-0.5">
                            {sw ? (
                              <span className="rounded bg-amber-950/50 px-0.5 text-[8px] text-amber-200/90 ring-1 ring-amber-500/25">
                                开关
                              </span>
                            ) : null}
                            {setp ? (
                              <span className="rounded bg-violet-950/40 px-0.5 text-[8px] text-violet-200/90 ring-1 ring-violet-500/25">
                                可调
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
