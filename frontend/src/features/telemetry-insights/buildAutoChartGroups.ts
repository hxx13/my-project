import type { TelemetryStructuredSuiteGroup } from "@/telemetry-view/types";
import { isHvacMechanicalSuiteGroup } from "@/telemetry-view/facilityLayoutRules";
import type { TelemetryChartGroup } from "@/api/domains/telemetryInsights.api";

/** 从 structuredTabs suiteGroup 自动生成对比组（风机/套间 + 关联房间） */
export function buildAutoChartGroupsFromSuites(
  suiteGroups: TelemetryStructuredSuiteGroup[]
): TelemetryChartGroup[] {
  const out: TelemetryChartGroup[] = [];
  let order = 0;
  for (const suite of suiteGroups) {
    const vars: string[] = [];
    for (const room of suite.rooms ?? []) {
      for (const slot of room.metrics ?? []) {
        const vn = (slot.item?.variableName || "").trim();
        if (vn && slot.item?.kindRole !== "SWITCH") {
          vars.push(vn);
        }
      }
    }
    if (vars.length < 2) continue;
    const isHvac = isHvacMechanicalSuiteGroup(suite);
    out.push({
      name: suite.suiteTitle || suite.suiteNorm || `套间 ${order + 1}`,
      description: isHvac ? "HVAC 机械组自动对比" : "同套间多房间自动对比",
      variableNames: [...new Set(vars)],
      layoutMode: "small_multiples",
      source: "auto_suite",
      sortOrder: order++,
    });
  }
  return out;
}
