import type { DigitalTwinScreenConfig, RoomCellModel, RoomVisualBand, RoomVisualState } from "@/features/digital-twin-screen/types";

function tempBand(t: number, th: DigitalTwinScreenConfig["thresholds"]): RoomVisualBand {
  const { criticalHigh, warnHigh, warnLow, criticalLow } = th.tempC;
  if (t >= criticalHigh || t <= criticalLow) return "critical";
  if (t >= warnHigh || t <= warnLow) return "warn";
  return "normal";
}

function humidityBand(h: number, th: DigitalTwinScreenConfig["thresholds"]): RoomVisualBand {
  const { criticalHigh, warnHigh, warnLow, criticalLow } = th.humidityPct;
  if (h >= criticalHigh || h <= criticalLow) return "critical";
  if (h >= warnHigh || h <= warnLow) return "warn";
  return "normal";
}

function mergeBand(a: RoomVisualBand, b: RoomVisualBand): RoomVisualBand {
  const rank: Record<RoomVisualBand, number> = { normal: 0, warn: 1, critical: 2 };
  return rank[a] >= rank[b] ? a : b;
}

/** 由温湿度与阈值推导展示态；纯函数便于后端仅传数值时复用 */
export function roomVisualState(room: RoomCellModel, config: DigitalTwinScreenConfig): RoomVisualState {
  const { thresholds, theme } = config;
  const band = mergeBand(tempBand(room.temperatureC, thresholds), humidityBand(room.humidityPct, thresholds));

  let accentColor = theme.accentGreen;
  let borderColor = theme.accentCyan;
  let ductPulseFactor = 1;

  if (band === "warn") {
    accentColor = theme.accentAmber;
    borderColor = theme.accentAmber;
    ductPulseFactor = 1.25;
  } else if (band === "critical") {
    accentColor = theme.accentRed;
    borderColor = theme.accentRed;
    ductPulseFactor = 1.55;
  }

  return { band, accentColor, borderColor, ductPulseFactor };
}
