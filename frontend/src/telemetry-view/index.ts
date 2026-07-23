export type {
  TelemetrySnapshot,
  TelemetryStructuredFloorTab,
  TelemetryStructuredMetricSlot,
  TelemetryStructuredRoomCard,
  TelemetryStructuredSuiteGroup,
  TelemetryTagItem,
  TelemetryWinccDockPollConfig,
} from "./types";

export { computeDockPollGate } from "./dockPoll";
export {
  buildFloorChunks,
  partitionSoloCards,
  SOLO_PARTITION_LABEL_SINGLE_METRIC,
  zoneKeyForSuiteGroup,
  prepareSuiteDisplay,
  rowSplitsForBalancedSoloGrid,
  splitSoloCardsFixedMaxColsWithLoneRemainder,
  ANIMAL_ROOM_SOLO_GRID_MAX_COLS_PER_ROW,
  soloMinCardPxForPartition,
  splitEvenRowSizes,
  suiteHasChrome,
  suiteLatestMsPrepared,
  SOLO_BALANCED_GRID_MAX_COLS,
  SOLO_GRID_GAP_PX,
} from "./floorChunks";
export type {
  BuildFloorChunksOptions,
  FloorChunk,
  PreparedSuite,
  SoloPartition,
} from "./floorChunks";
export {
  basementSuiteRoomSegment,
  isBaseRoomCanonical,
  isBasementFloorScopeTabKey,
  isSuiteConceptFloor,
  localPartRoomCanonical,
  normalizeRoomForGrouping,
  standardSuiteRoomSegment,
} from "./roomGrouping";
export {
  compareMetricsInFacilityRoom,
  facilityRoomCardIdentity,
  facilitySlotOrdinalFromRoomCanonical,
} from "./facilityRoomGrouping";
export {
  metricSlotIsGongShuiTitleRowMetric,
  metricSlotIsSuiteTitleTempPressureMetric,
  roomCanonicalHasGongShuiSupplySegment,
  segmentIndicatesGongShuiSupply,
  structuredSuiteHasSwitchMetric,
  suiteIsBoilerRoomSuite,
  suiteIsPowerStationSuite,
  isHvacMechanicalSuiteGroup,
  suiteNormIsBoilerRoomForSwitchRowMerge,
  suiteNormIsPowerStationExclusive,
} from "./facilityLayoutRules";
export {
  ANIMAL_ROOM_HVAC_TAB_KEY,
  buildSyntheticHvacHubTab,
  buildSyntheticHvacStructTab,
  collectVariableNamesFromHubChunks,
  collectVariableNamesFromStructuredSuites,
  filterHubChunksExcludeHvacUnits,
  isHvacPreparedSuite,
} from "./animalTelemetryHvacUnits";
export type { BuildSyntheticHvacHubTabOptions } from "./animalTelemetryHvacUnits";
export {
  buildAnimalRoomFloorRelayRows,
  buildAnimalRoomHubRelayRows,
  countSetpointParamsInPreparedSuite,
  flattenFloorSegmentToRelayOrder,
  flattenHubSegmentToRelayOrder,
  floorTripleRelayRightColumnAnchorByTabKey,
  packFloorChunksIntoRows,
  packHubChunksIntoRows,
  floorChunkIsZoneCard,
  hubChunkIsZoneCard,
  preparedSuiteWantsFullWidthRow,
  visibleRoomCountInPreparedSuite,
} from "./animalTelemetryRelayLayout";
export type {
  AnimalRoomFloorRelayRow,
  AnimalRoomHubRelayRow,
  BuildAnimalRoomFloorRelayRowsOptions,
  BuildAnimalRoomHubRelayRowsOptions,
  PackRelayColumnChunksOptions,
} from "./animalTelemetryRelayLayout";
export {
  buildStructuredFloorTabs,
  countStructuredRoomsInTab,
  DEFAULT_PLANE_ZONE_KEY,
  extractBasementEPlaneCodeFromRoomTitle,
  extractBasementHardZoneFromRoomCanonical,
  extractZoneFromSoloTitle,
  floorTabKeyForTelemetryItem,
  hasStructuredTelemetryItem,
  isSwitchKindRole,
  isSwitchTelemetryMetric,
  isStatusTelemetryMetric,
  formatTelemetryStatusOnOff,
  statusMetricSlotDisplayLabel,
  isBasementFloorTabKey,
  normalizeFloorTabKey,
  stripLeadingSuitePrefixFromRoomDisplay,
  stripSuiteTitlePrefixForDisplay,
  zoneKeyForFloorTab,
} from "./structuredTabs";
export { maxTelemetryItemTimestampsMs } from "./timestamps";
export { interventionValueTrendForDisplay, shouldShowInterventionValueTrend } from "./interventionValueTrend";
export { DEFAULT_FACILITY_LAYOUT_RULES_V1, mergeFacilityLayoutRules } from "./facilityLayoutConfig";
export type { FacilityLayoutRulesV1 } from "./facilityLayoutConfig";
