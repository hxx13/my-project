/**
 * 动物房设施布局规则（与后端 FacilityLayoutRulesV1 / sys_system_config telemetry_facility 同形）。
 * @see TelemetryFacilityLayoutRulesService.java
 */

export type FacilityLayoutRulesV1 = {
  version: number;
  facilitySmallRoomKeywords: string[];
  gongShui: {
    segmentEquals: string[];
    segmentContains: string[];
  };
  titleMetric: {
    kindCodePrefixes: string[];
    labelContainsAny: string[];
  };
  suiteRecognition: {
    powerStation: { tokens: string[] };
    boilerRoom: { tokens: string[] };
  };
  basementWebChrome: {
    exclusiveRowIfSuiteNormContains: string[];
    boilerSwitchRowMergeIfSuiteNormContains: string[];
  };
};

export const DEFAULT_FACILITY_LAYOUT_RULES_V1: FacilityLayoutRulesV1 = {
  version: 1,
  facilitySmallRoomKeywords: [
    "蒸汽供水",
    "蒸汽报警",
    "蒸汽",
    "冷却塔",
    "冷冻水泵",
    "冷却水泵",
    "冷冻水",
    "冷却水",
    "冷机",
  ],
  gongShui: {
    segmentEquals: ["供水"],
    segmentContains: ["(供水)"],
  },
  titleMetric: {
    kindCodePrefixes: ["TEMP", "PRESSURE"],
    labelContainsAny: ["温度", "气温", "压差", "压力", "压强"],
  },
  suiteRecognition: {
    powerStation: { tokens: ["动力站"] },
    boilerRoom: { tokens: ["锅炉房"] },
  },
  basementWebChrome: {
    exclusiveRowIfSuiteNormContains: ["动力站"],
    boilerSwitchRowMergeIfSuiteNormContains: ["锅炉房"],
  },
};

/** 折叠关键字：长词优先，减少前缀误匹配 */
export function sortedFacilityKeywords(rules: FacilityLayoutRulesV1): string[] {
  const raw = rules.facilitySmallRoomKeywords ?? [];
  return [...raw].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

export function mergeFacilityLayoutRules(partial: Partial<FacilityLayoutRulesV1> | null): FacilityLayoutRulesV1 {
  const d = DEFAULT_FACILITY_LAYOUT_RULES_V1;
  if (!partial || partial.version !== 1) return d;
  return {
    version: 1,
    facilitySmallRoomKeywords:
      partial.facilitySmallRoomKeywords?.length ? [...partial.facilitySmallRoomKeywords] : [...d.facilitySmallRoomKeywords],
    gongShui: {
      segmentEquals: partial.gongShui?.segmentEquals?.length
        ? [...partial.gongShui.segmentEquals]
        : [...d.gongShui.segmentEquals],
      segmentContains: partial.gongShui?.segmentContains?.length
        ? [...partial.gongShui.segmentContains]
        : [...d.gongShui.segmentContains],
    },
    titleMetric: {
      kindCodePrefixes: partial.titleMetric?.kindCodePrefixes?.length
        ? [...partial.titleMetric.kindCodePrefixes]
        : [...d.titleMetric.kindCodePrefixes],
      labelContainsAny: partial.titleMetric?.labelContainsAny?.length
        ? [...partial.titleMetric.labelContainsAny]
        : [...d.titleMetric.labelContainsAny],
    },
    suiteRecognition: {
      powerStation: {
        tokens: partial.suiteRecognition?.powerStation?.tokens?.length
          ? [...partial.suiteRecognition.powerStation.tokens]
          : [...d.suiteRecognition.powerStation.tokens],
      },
      boilerRoom: {
        tokens: partial.suiteRecognition?.boilerRoom?.tokens?.length
          ? [...partial.suiteRecognition.boilerRoom.tokens]
          : [...d.suiteRecognition.boilerRoom.tokens],
      },
    },
    basementWebChrome: {
      exclusiveRowIfSuiteNormContains: partial.basementWebChrome?.exclusiveRowIfSuiteNormContains?.length
        ? [...partial.basementWebChrome.exclusiveRowIfSuiteNormContains]
        : [...d.basementWebChrome.exclusiveRowIfSuiteNormContains],
      boilerSwitchRowMergeIfSuiteNormContains: partial.basementWebChrome?.boilerSwitchRowMergeIfSuiteNormContains?.length
        ? [...partial.basementWebChrome.boilerSwitchRowMergeIfSuiteNormContains]
        : [...d.basementWebChrome.boilerSwitchRowMergeIfSuiteNormContains],
    },
  };
}
