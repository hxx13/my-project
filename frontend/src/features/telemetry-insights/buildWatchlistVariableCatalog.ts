import type {
  TelemetryMetricKind,
  TelemetryWatchlistTag,
  TelemetryWatchlistZone,
} from "@/api/domains/telemetryWatchlistAdmin.api";
import { isWinccLimitSuffixVariable } from "@/utils/telemetryWatchlistLimitNaming";

/** 来自 watchlist 的可选变量条目（以 WinCC 变量名为键） */
export type WatchlistVariableCatalogEntry = {
  variableName: string;
  displayLabel: string;
  floorCode: string;
  roomCanonical: string;
  metricKindCode: string;
  metricKindLabel: string;
  bundleCode: string;
  bundleDisplayName: string;
  enabled: boolean;
};

export type WatchlistVariableCatalog = {
  entries: WatchlistVariableCatalogEntry[];
  floors: string[];
  bundleCodes: string[];
  metricKindCodes: string[];
};

function trim(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function metricKindLabelFor(code: string, kinds: TelemetryMetricKind[]): string {
  const hit = kinds.find((k) => k.code.toUpperCase() === code.toUpperCase());
  return hit?.labelZh ?? code;
}

function isPlottableMetricTag(tag: TelemetryWatchlistTag, kinds: TelemetryMetricKind[]): boolean {
  if (!tag.enabled) return false;
  if (isWinccLimitSuffixVariable(tag.winccVariableName)) return false;
  const mk = trim(tag.metricKindCode);
  if (!mk) return false;
  const kind = kinds.find((k) => k.code.toUpperCase() === mk.toUpperCase());
  if (kind?.kindRole && kind.kindRole !== "METRIC") return false;
  return true;
}

/** 将 zones-with-tags 扁平化为可绘图变量目录 */
export function buildWatchlistVariableCatalog(
  zones: TelemetryWatchlistZone[],
  metricKinds: TelemetryMetricKind[]
): WatchlistVariableCatalog {
  const seen = new Set<string>();
  const entries: WatchlistVariableCatalogEntry[] = [];
  const floorSet = new Set<string>();
  const bundleSet = new Set<string>();
  const metricSet = new Set<string>();

  for (const zone of zones) {
    const bundle = zone.bundle;
    const bundleCode = trim(bundle.code);
    const bundleDisplayName = trim(bundle.displayName) || bundleCode;
    for (const tag of zone.tags ?? []) {
      if (!isPlottableMetricTag(tag, metricKinds)) continue;
      const vn = trim(tag.winccVariableName);
      if (!vn || seen.has(vn.toLowerCase())) continue;
      seen.add(vn.toLowerCase());
      const floorCode = trim(tag.floorCode);
      const metricKindCode = trim(tag.metricKindCode);
      const displayLabel = trim(tag.displayLabel) || vn;
      if (floorCode) floorSet.add(floorCode);
      if (bundleCode) bundleSet.add(bundleCode);
      if (metricKindCode) metricSet.add(metricKindCode);
      entries.push({
        variableName: vn,
        displayLabel,
        floorCode,
        roomCanonical: trim(tag.roomCanonical),
        metricKindCode,
        metricKindLabel: metricKindLabelFor(metricKindCode, metricKinds),
        bundleCode,
        bundleDisplayName,
        enabled: tag.enabled,
      });
    }
  }

  entries.sort((a, b) => {
    const fa = a.floorCode.localeCompare(b.floorCode, "zh-Hans-CN", { numeric: true });
    if (fa !== 0) return fa;
    const ba = a.bundleCode.localeCompare(b.bundleCode, "zh-Hans-CN", { numeric: true });
    if (ba !== 0) return ba;
    return a.displayLabel.localeCompare(b.displayLabel, "zh-Hans-CN", { numeric: true });
  });

  return {
    entries,
    floors: [...floorSet].sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true })),
    bundleCodes: [...bundleSet].sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true })),
    metricKindCodes: [...metricSet].sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true })),
  };
}

export function buildVariableMetadataFromCatalog(
  variableNames: string[],
  catalog: WatchlistVariableCatalog
): import("@/api/domains/telemetryInsights.api").TelemetryChartGroupVariableMeta[] {
  const byVar = new Map(catalog.entries.map((e) => [e.variableName.toLowerCase(), e]));
  return variableNames.map((vn) => {
    const hit = byVar.get(vn.toLowerCase());
    return {
      variableName: vn,
      displayLabel: hit?.displayLabel ?? vn,
      floorCode: hit?.floorCode ?? null,
      metricKindCode: hit?.metricKindCode ?? null,
      bundleCode: hit?.bundleCode ?? null,
      roomCanonical: hit?.roomCanonical ?? null,
    };
  });
}

export function displayLabelForVariable(
  variableName: string,
  metadata?: import("@/api/domains/telemetryInsights.api").TelemetryChartGroupVariableMeta[] | null,
  catalog?: WatchlistVariableCatalog | null
): string {
  const vn = trim(variableName);
  const metaHit = metadata?.find((m) => m.variableName.toLowerCase() === vn.toLowerCase());
  if (metaHit?.displayLabel) return metaHit.displayLabel;
  const catHit = catalog?.entries.find((e) => e.variableName.toLowerCase() === vn.toLowerCase());
  if (catHit?.displayLabel) return catHit.displayLabel;
  return vn;
}

export function metricKindForVariable(
  variableName: string,
  metadata?: import("@/api/domains/telemetryInsights.api").TelemetryChartGroupVariableMeta[] | null,
  catalog?: WatchlistVariableCatalog | null
): string {
  const vn = trim(variableName);
  const metaHit = metadata?.find((m) => m.variableName.toLowerCase() === vn.toLowerCase());
  if (metaHit?.metricKindCode) return metaHit.metricKindCode;
  const catHit = catalog?.entries.find((e) => e.variableName.toLowerCase() === vn.toLowerCase());
  if (catHit?.metricKindCode) return catHit.metricKindCode;
  return "";
}
