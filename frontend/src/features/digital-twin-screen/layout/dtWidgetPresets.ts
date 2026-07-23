import type { DtSceneWidget, DtWidgetGraphicAsset } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { newDtBindingSlotId, newDtSceneWidgetId } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { DT_WIDGET_PLATE_MIN } from "@/features/digital-twin-screen/layout/dtWidgetPlateLimits";

function clampPlateForScene(at: { nx: number; ny: number }, plate: { nw: number; nh: number }) {
  let { nx, ny, nw, nh } = { nx: at.nx, ny: at.ny, ...plate };
  nw = Math.max(DT_WIDGET_PLATE_MIN, Math.min(1, nw));
  nh = Math.max(DT_WIDGET_PLATE_MIN, Math.min(1, nh));
  nx = Math.max(0, Math.min(1 - nw, nx));
  ny = Math.max(0, Math.min(1 - nh, ny));
  return { nx, ny, nw, nh };
}

export type DtWidgetPalettePresetId =
  | "telemetryDual"
  | "telemetrySingle"
  | "telemetryCompact"
  /** 自定义布置用空调机组示意块（无遥测语义，可缩放拖拽） */
  | "hvacUnitCassette"
  | "hvacUnitTower"
  /** 房间示意 + 底部测点（内置图库） */
  | "panelRoomSmall"
  | "panelRoomMed"
  | "panelRoomWide"
  | "panelRoomWideDual"
  /** 温·湿·压 竖/横排 */
  | "panelEnvTower"
  | "panelEnvMini"
  | "panelEnvRow"
  | "panelEnvPressure"
  /** 按钮形图元（指令/状态） */
  | "dashBtnCommand"
  | "dashBtnStatus"
  /** 开关类示意（首槽建议绑运行/合闸布尔或文本） */
  | "switchTogglePreset"
  | "switchRockerPreset"
  | "switchEstopPreset"
  | "switchDualPreset"
  /** 机房组合式风箱（示意 + 首槽运行信号可驱动内部叶轮） */
  | "ahuPlenumWide"
  /** 风机 / 水泵 / 压缩机示意（首槽运行信号驱动旋转） */
  | "deviceFanPreset"
  | "devicePumpPreset"
  | "deviceCompressorPreset";

function newBinding(p: Partial<DtSceneWidget["bindings"][number]>): DtSceneWidget["bindings"][number] {
  return {
    id: newDtBindingSlotId(),
    variableName: "",
    format: "number",
    decimals: 1,
    bindingKind: "readout",
    semantic: "generic",
    ...p,
  };
}

export function createWidgetFromPalettePreset(preset: DtWidgetPalettePresetId, at?: { nx: number; ny: number }): DtSceneWidget {
  const id = newDtSceneWidgetId();
  const nx = at?.nx ?? 0.08;
  const ny = at?.ny ?? 0.08;
  switch (preset) {
    case "telemetrySingle":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.16,
        nh: 0.072,
        title: "测点",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        bindings: [
          {
            id: newDtBindingSlotId(),
            variableName: "",
            label: "测量值",
            unit: "",
            decimals: 1,
            format: "number",
          },
        ],
      };
    case "telemetryCompact":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.14,
        nh: 0.048,
        title: "",
        stylePresetId: "compact",
        effectPresetId: "none",
        bindings: [
          {
            id: newDtBindingSlotId(),
            variableName: "",
            label: "值",
            unit: "",
            decimals: 0,
            format: "text",
          },
        ],
      };
    case "hvacUnitCassette":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.24,
        nh: 0.078,
        title: "空调单元",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        graphicHint: "acUnit",
        bindings: [
          {
            id: newDtBindingSlotId(),
            variableName: "",
            label: "示意",
            unit: "",
            decimals: 0,
            format: "text",
          },
        ],
      };
    case "hvacUnitTower":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.078,
        nh: 0.15,
        title: "空调单元",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        graphicHint: "acUnit",
        bindings: [
          {
            id: newDtBindingSlotId(),
            variableName: "",
            label: "示意",
            unit: "",
            decimals: 0,
            format: "text",
          },
        ],
      };
    case "panelRoomSmall":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.15,
        nh: 0.11,
        title: "房间区",
        stylePresetId: "glassDark",
        effectPresetId: "none",
        graphicHint: "roomPanel",
        bindings: [
          newBinding({ label: "温度", unit: "°C", decimals: 1, semantic: "temperature" }),
          newBinding({ label: "湿度", unit: "%RH", decimals: 0, semantic: "humidity" }),
        ],
      };
    case "panelRoomMed":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.2,
        nh: 0.14,
        title: "房间区",
        stylePresetId: "glassDark",
        effectPresetId: "none",
        graphicHint: "roomPanel",
        bindings: [
          newBinding({ label: "温度", unit: "°C", decimals: 1, semantic: "temperature" }),
          newBinding({ label: "湿度", unit: "%RH", decimals: 0, semantic: "humidity" }),
          newBinding({ label: "压强", unit: "hPa", decimals: 0, semantic: "pressure" }),
        ],
      };
    case "panelRoomWide":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.28,
        nh: 0.085,
        title: "房间条",
        stylePresetId: "compact",
        effectPresetId: "none",
        graphicHint: "roomPanel",
        bindings: [
          newBinding({ label: "温度", unit: "°C", decimals: 1, semantic: "temperature" }),
          newBinding({ label: "湿度", unit: "%RH", decimals: 0, semantic: "humidity" }),
          newBinding({ label: "压强", unit: "hPa", decimals: 0, semantic: "pressure" }),
        ],
      };
    case "panelRoomWideDual":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.24,
        nh: 0.075,
        title: "房间条",
        stylePresetId: "compact",
        effectPresetId: "none",
        graphicHint: "roomPanel",
        bindings: [
          newBinding({ label: "温度", unit: "°C", decimals: 1, semantic: "temperature" }),
          newBinding({ label: "湿度", unit: "%RH", decimals: 0, semantic: "humidity" }),
        ],
      };
    case "panelEnvTower":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.11,
        nh: 0.17,
        title: "环境",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        graphicHint: "envThp",
        bindings: [
          newBinding({ label: "温度", unit: "°C", decimals: 1, semantic: "temperature" }),
          newBinding({ label: "湿度", unit: "%RH", decimals: 0, semantic: "humidity" }),
          newBinding({ label: "压强", unit: "hPa", decimals: 0, semantic: "pressure" }),
        ],
      };
    case "panelEnvMini":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.09,
        nh: 0.14,
        title: "",
        stylePresetId: "compact",
        effectPresetId: "none",
        graphicHint: "envThp",
        bindings: [
          newBinding({ label: "温度", unit: "°C", decimals: 1, semantic: "temperature" }),
          newBinding({ label: "湿度", unit: "%RH", decimals: 0, semantic: "humidity" }),
          newBinding({ label: "压强", unit: "hPa", decimals: 0, semantic: "pressure" }),
        ],
      };
    case "panelEnvRow":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.26,
        nh: 0.078,
        title: "",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        graphicHint: "envThpRow",
        bindings: [
          newBinding({ label: "温度", unit: "°C", decimals: 1, semantic: "temperature" }),
          newBinding({ label: "湿度", unit: "%RH", decimals: 0, semantic: "humidity" }),
          newBinding({ label: "压强", unit: "hPa", decimals: 0, semantic: "pressure" }),
        ],
      };
    case "panelEnvPressure":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.14,
        nh: 0.14,
        title: "洁净压差",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        graphicHint: "envThp",
        bindings: [
          newBinding({ label: "压差", unit: "Pa", decimals: 0, semantic: "pressure" }),
          newBinding({ label: "温度", unit: "°C", decimals: 1, semantic: "temperature" }),
          newBinding({ label: "湿度", unit: "%RH", decimals: 0, semantic: "humidity" }),
        ],
      };
    case "dashBtnCommand":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.12,
        nh: 0.055,
        title: "",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        graphicHint: "dashButton",
        bindings: [
          newBinding({
            label: "指令",
            format: "text",
            decimals: 0,
            semantic: "generic",
            bindingKind: "command",
          }),
        ],
      };
    case "dashBtnStatus":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.15,
        nh: 0.062,
        title: "",
        stylePresetId: "glassDark",
        effectPresetId: "none",
        graphicHint: "dashButton",
        bindings: [
          newBinding({ label: "状态字", format: "text", decimals: 0, semantic: "generic", bindingKind: "readout" }),
          newBinding({ label: "数值", unit: "", decimals: 1, format: "number", semantic: "generic", bindingKind: "readout" }),
        ],
      };
    case "switchTogglePreset":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.072,
        nh: 0.042,
        title: "",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        graphicHint: "switchToggle",
        bindings: [newBinding({ label: "合闸", format: "text", decimals: 0, semantic: "generic", bindingKind: "readout" })],
      };
    case "switchRockerPreset":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.055,
        nh: 0.078,
        title: "",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        graphicHint: "switchRocker",
        bindings: [newBinding({ label: "运行", format: "text", decimals: 0, semantic: "generic", bindingKind: "readout" })],
      };
    case "switchEstopPreset":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.06,
        nh: 0.078,
        title: "",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        graphicHint: "switchEstop",
        bindings: [newBinding({ label: "急停复位", format: "text", decimals: 0, semantic: "generic", bindingKind: "readout" })],
      };
    case "switchDualPreset":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.09,
        nh: 0.058,
        title: "",
        stylePresetId: "glassDark",
        effectPresetId: "none",
        graphicHint: "switchDual",
        bindings: [
          newBinding({ label: "本地", format: "text", decimals: 0, semantic: "generic", bindingKind: "readout" }),
          newBinding({ label: "远程", format: "text", decimals: 0, semantic: "generic", bindingKind: "readout" }),
        ],
      };
    case "ahuPlenumWide":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.28,
        nh: 0.11,
        title: "组合式空调箱",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        graphicHint: "ahuPlenum",
        bindings: [newBinding({ label: "送风机运行", format: "text", decimals: 0, semantic: "generic", bindingKind: "readout" })],
      };
    case "deviceFanPreset":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.072,
        nh: 0.072,
        title: "风机",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        graphicHint: "deviceFan",
        bindings: [newBinding({ label: "运行", format: "text", decimals: 0, semantic: "generic", bindingKind: "readout" })],
      };
    case "devicePumpPreset":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.072,
        nh: 0.072,
        title: "水泵",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        graphicHint: "devicePump",
        bindings: [newBinding({ label: "运行", format: "text", decimals: 0, semantic: "generic", bindingKind: "readout" })],
      };
    case "deviceCompressorPreset":
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.085,
        nh: 0.072,
        title: "压缩机",
        stylePresetId: "highContrast",
        effectPresetId: "none",
        graphicHint: "deviceCompressor",
        bindings: [newBinding({ label: "运行", format: "text", decimals: 0, semantic: "generic", bindingKind: "readout" })],
      };
    case "telemetryDual":
    default:
      return {
        id,
        kind: "telemetryCard",
        nx,
        ny,
        nw: 0.18,
        nh: 0.1,
        title: "环境",
        stylePresetId: "glassDark",
        effectPresetId: "none",
        bindings: [
          {
            id: newDtBindingSlotId(),
            variableName: "",
            label: "温度",
            unit: "°C",
            decimals: 1,
            format: "number",
          },
          {
            id: newDtBindingSlotId(),
            variableName: "",
            label: "湿度",
            unit: "%",
            decimals: 0,
            format: "number",
          },
        ],
      };
  }
}

/** 从本地素材库 id 落画布：场景仅存引用，像素在 IndexedDB（与详情面板「入库」一致） */
export function createCustomGraphicWidgetFromLibrary(args: {
  displayName: string;
  mime: DtWidgetGraphicAsset["mime"];
  graphicLibraryAssetId: string;
  name?: string;
  at: { nx: number; ny: number };
  plate?: { nw: number; nh: number };
}): DtSceneWidget {
  const id = newDtSceneWidgetId();
  const plate0 = args.plate ?? { nw: 0.12, nh: 0.12 };
  const { nx, ny, nw, nh } = clampPlateForScene(args.at, plate0);
  const title = args.displayName.trim() || "自定义图标";
  const libId = args.graphicLibraryAssetId.trim();
  return {
    id,
    kind: "telemetryCard",
    nx,
    ny,
    nw,
    nh,
    title,
    stylePresetId: "glassDark",
    effectPresetId: "none",
    graphicHint: "customAsset",
    graphicLibraryAssetId: libId,
    graphicAsset: { mime: args.mime, name: args.name },
    bindings: [
      newBinding({
        label: title.slice(0, 48),
        format: "text",
        decimals: 0,
        semantic: "generic",
        bindingKind: "readout",
        variableName: "",
      }),
    ],
    assetInteractionMode: "decorative",
    showReadoutOverlay: false,
  };
}

/** 左侧「导入自定义图标」加入画布：独立图元，非替换内置资源 */
export function createCustomGraphicWidget(args: {
  displayName: string;
  asset: DtWidgetGraphicAsset;
  at: { nx: number; ny: number };
  plate?: { nw: number; nh: number };
}): DtSceneWidget {
  const id = newDtSceneWidgetId();
  const plate0 = args.plate ?? { nw: 0.12, nh: 0.12 };
  const { nx, ny, nw, nh } = clampPlateForScene(args.at, plate0);
  const title = args.displayName.trim() || "自定义图标";
  return {
    id,
    kind: "telemetryCard",
    nx,
    ny,
    nw,
    nh,
    title,
    stylePresetId: "glassDark",
    effectPresetId: "none",
    graphicHint: "customAsset",
    graphicAsset: args.asset,
    bindings: [
      newBinding({
        label: title.slice(0, 48),
        format: "text",
        decimals: 0,
        semantic: "generic",
        bindingKind: "readout",
        variableName: "",
      }),
    ],
    assetInteractionMode: "decorative",
    showReadoutOverlay: false,
  };
}
