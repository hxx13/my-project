import { useMemo } from "react";

export type DtViewportInteraction = "idle" | "panning" | "zooming";

export type DtSelectionKind = "none" | "room" | "duct" | "widget" | "ac";

export type DtTelemetrySessionState = "idle" | "polling" | "error" | "disabled";

/**
 * 聚合编辑会话：视口交互、选择与遥测状态（显式 FSM 输出，便于 UI badge / 调试）。
 */
export function useDigitalTwinEditorSession(opts: {
  layoutEditMode: boolean;
  viewportInteraction: DtViewportInteraction;
  /** 整块画布 planTilt（与 roomVisualPreset 正交） */
  boardPlanTilt?: boolean;
  selection: { kind: DtSelectionKind };
  twinWinccEnabled: boolean;
  twinWinccPollEnabled: boolean;
  twinWinccError: string | null;
}) {
  const telemetryState: DtTelemetrySessionState = useMemo(() => {
    if (!opts.twinWinccPollEnabled) return "disabled";
    if (!opts.twinWinccEnabled) return "disabled";
    if (opts.twinWinccError) return "error";
    return "polling";
  }, [opts.twinWinccEnabled, opts.twinWinccError, opts.twinWinccPollEnabled]);

  const viewportState: DtViewportInteraction = opts.layoutEditMode || opts.viewportInteraction !== "idle"
    ? opts.viewportInteraction
    : "idle";

  return {
    viewportState,
    selectionKind: opts.selection.kind,
    telemetryState,
    boardPlanTilt: !!opts.boardPlanTilt,
  };
}
