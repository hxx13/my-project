import type { DtSceneWidget } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { createWidgetFromPalettePreset, type DtWidgetPalettePresetId } from "@/features/digital-twin-screen/layout/dtWidgetPresets";

/** 编辑态内置图库条目（仅 layoutEditMode 展示；写入 sceneDoc.widgets） */
export type EditorShapeCatalogItem = {
  id: string;
  label: string;
  preset: DtWidgetPalettePresetId;
  graphicHint?: DtSceneWidget["graphicHint"];
};

export type EditorShapeCatalogFolder = { id: string; label: string; items: EditorShapeCatalogItem[] };

/**
 * 工业组态式分组：动设备 / 阀与风道示意 / 环境读数 / 操作与开关 / 状态指示 / 面板卡片 / 房间与机组。
 * 视觉实现见 widgetSymbols/* 与 DtSceneWidgetLayer。
 */
export const EDITOR_SHAPE_CATALOG: EditorShapeCatalogFolder[] = [
  {
    id: "rotating-equip",
    label: "动设备（泵 / 风机 / 压缩机）",
    items: [
      { id: "shape-dev-fan", label: "离心风机", preset: "deviceFanPreset", graphicHint: "deviceFan" },
      { id: "shape-dev-pump", label: "水泵叶轮", preset: "devicePumpPreset", graphicHint: "devicePump" },
      { id: "shape-dev-comp", label: "压缩机（外转子）", preset: "deviceCompressorPreset", graphicHint: "deviceCompressor" },
    ],
  },
  {
    id: "hvac-duct",
    label: "风道与机组示意",
    items: [
      { id: "shape-ahu-plenum", label: "机房组合式风箱（示意）", preset: "ahuPlenumWide", graphicHint: "ahuPlenum" },
      { id: "shape-hvac-cassette", label: "卧式机组块", preset: "hvacUnitCassette", graphicHint: "acUnit" },
      { id: "shape-hvac-tower", label: "立式机组块", preset: "hvacUnitTower", graphicHint: "acUnit" },
    ],
  },
  {
    id: "env-thp",
    label: "环境 · 温湿压",
    items: [
      { id: "shape-env-tower", label: "三参竖条（温湿压）", preset: "panelEnvTower" },
      { id: "shape-env-mini", label: "三参窄竖条", preset: "panelEnvMini" },
      { id: "shape-env-row", label: "三参横排", preset: "panelEnvRow" },
      { id: "shape-env-press", label: "压差优先（压+温+湿）", preset: "panelEnvPressure" },
      { id: "shape-env-dual-legacy", label: "双通道卡片（沿用）", preset: "telemetryDual", graphicHint: "card" },
      { id: "shape-env-single-legacy", label: "单通道大号（沿用）", preset: "telemetrySingle", graphicHint: "card" },
    ],
  },
  {
    id: "switches",
    label: "开关与急停",
    items: [
      { id: "shape-sw-toggle", label: "拨动开关（横向）", preset: "switchTogglePreset", graphicHint: "switchToggle" },
      { id: "shape-sw-rocker", label: "船型开关（竖向）", preset: "switchRockerPreset", graphicHint: "switchRocker" },
      { id: "shape-sw-estop", label: "急停蘑菇头", preset: "switchEstopPreset", graphicHint: "switchEstop" },
      { id: "shape-sw-dual", label: "双位选择（本地/远程）", preset: "switchDualPreset", graphicHint: "switchDual" },
    ],
  },
  {
    id: "buttons",
    label: "操作条 / 指令按钮",
    items: [
      { id: "shape-btn-cmd", label: "指令按钮（文本槽）", preset: "dashBtnCommand" },
      { id: "shape-btn-status", label: "状态+数值按钮条", preset: "dashBtnStatus" },
      { id: "shape-btn-cmd-2", label: "指令按钮·副本位", preset: "dashBtnCommand" },
    ],
  },
  {
    id: "state",
    label: "指示灯与条形指示",
    items: [
      {
        id: "shape-lamp-single-num",
        label: "指示灯（数值阈值）",
        preset: "telemetrySingle",
        graphicHint: "lamp",
      },
      {
        id: "shape-lamp-compact-text",
        label: "指示灯（文本/开关量）",
        preset: "telemetryCompact",
        graphicHint: "lamp",
      },
      {
        id: "shape-lamp-single-2",
        label: "指示灯·大号第二实例",
        preset: "telemetrySingle",
        graphicHint: "lamp",
      },
      {
        id: "shape-bar-single",
        label: "水平条（单测点）",
        preset: "telemetrySingle",
        graphicHint: "bar",
      },
      {
        id: "shape-bar-dual-temp",
        label: "水平条（双通道·环境）",
        preset: "telemetryDual",
        graphicHint: "bar",
      },
      {
        id: "shape-bar-single-2",
        label: "水平条·单测点副本",
        preset: "telemetrySingle",
        graphicHint: "bar",
      },
    ],
  },
  {
    id: "cards",
    label: "遥测卡片",
    items: [
      { id: "shape-card-dual", label: "双通道卡片", preset: "telemetryDual", graphicHint: "card" },
      { id: "shape-card-single", label: "单通道卡片", preset: "telemetrySingle", graphicHint: "card" },
      { id: "shape-card-compact", label: "紧凑文本", preset: "telemetryCompact", graphicHint: "card" },
      { id: "shape-card-dual-2", label: "双通道卡片·副本", preset: "telemetryDual", graphicHint: "card" },
    ],
  },
  {
    id: "room",
    label: "房间 / 区域示意",
    items: [
      { id: "shape-room-s", label: "房间块（温+湿）", preset: "panelRoomSmall" },
      { id: "shape-room-m", label: "房间块（温+湿+压）", preset: "panelRoomMed" },
      { id: "shape-room-strip-3", label: "房间条（三参横排）", preset: "panelRoomWide" },
      { id: "shape-room-strip-2", label: "房间条（温+湿）", preset: "panelRoomWideDual" },
      { id: "shape-room-s-2", label: "房间块·副本位（温+湿）", preset: "panelRoomSmall" },
      { id: "shape-room-m-2", label: "房间块·副本位（三参）", preset: "panelRoomMed" },
    ],
  },
];

export function findShapeCatalogItem(itemId: string): EditorShapeCatalogItem | undefined {
  for (const f of EDITOR_SHAPE_CATALOG) {
    const it = f.items.find((i) => i.id === itemId);
    if (it) return it;
  }
  return undefined;
}

export function createWidgetFromShapeCatalogItem(
  itemId: string,
  at?: { nx: number; ny: number },
  stackLayerId?: string
): DtSceneWidget | null {
  const item = findShapeCatalogItem(itemId);
  if (!item) return null;
  const w = createWidgetFromPalettePreset(item.preset, at);
  const withHint = item.graphicHint ? { ...w, graphicHint: item.graphicHint } : w;
  return stackLayerId ? { ...withHint, stackLayerId } : withHint;
}
