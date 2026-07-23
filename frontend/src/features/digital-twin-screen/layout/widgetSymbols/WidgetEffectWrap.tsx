import type { ReactNode } from "react";
import type { DtSceneWidget } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import type { TelemetryTagItem } from "@/telemetry-view/types";
import { telemetryItemNeedsAlarmPulse } from "@/features/digital-twin-screen/layout/widgetSymbols/telemetryAlarmVisual";

export function WidgetEffectWrap({
  widget,
  alarmItem,
  children,
}: {
  widget: DtSceneWidget;
  alarmItem: TelemetryTagItem | undefined;
  children: ReactNode;
}) {
  if (widget.effectPresetId !== "pulseOnAlarm" || !telemetryItemNeedsAlarmPulse(alarmItem)) {
    return <>{children}</>;
  }
  return (
    <div className="rounded-[inherit] ring-2 ring-rose-500/55 motion-safe:animate-pulse motion-reduce:animate-none">{children}</div>
  );
}
