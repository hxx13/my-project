import type { DuctPlanPolyline } from "@/features/digital-twin-screen/layout/ductLayoutTypes";
import type { AcZoneId } from "@/features/digital-twin-screen/types";

/** 房间在场景板上的轴对齐矩形（归一化 0–1，相对 layoutPlate） */
export type RoomLayoutEntry = {
  roomId: string;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  /** 仅允许 0 / 45 / -45，便于吸附与 CSS */
  rotationDeg?: number;
};

/** 风管 + 房间统一场景（v2）；持久化 key 见 sceneLayoutStorage */
export type SceneLayoutDocumentV2 = {
  version: 2;
  ducts: DuctPlanPolyline[];
  rooms: RoomLayoutEntry[];
};

export const SCENE_LAYOUT_STORAGE_KEY = "aro.digitalTwin.sceneLayout.v2";

/** 测点语义：用于详情默认值与示意布局（不改变 WinCC 变量名字段） */
export type DtWidgetBindingSemantic = "generic" | "temperature" | "humidity" | "pressure";

/** 槽角色：只读数值/文本 vs 指令按钮（写变量后续可接 PLC） */
export type DtWidgetBindingKind = "readout" | "command";

/** WinCC 变量绑定槽（显示框用） */
export type DtWidgetBindingSlot = {
  id: string;
  variableName: string;
  label?: string;
  unit?: string;
  decimals?: number;
  format?: "number" | "text";
  semantic?: DtWidgetBindingSemantic;
  bindingKind?: DtWidgetBindingKind;
};

export type DtSceneWidgetKind = "telemetryCard";

export type DtWidgetStylePresetId = "glassDark" | "highContrast" | "compact";

export type DtWidgetEffectPresetId = "none" | "pulseOnAlarm";

/** 导入图 / 自定义资源在浏览态的交互档位（内置矢量图可忽略，沿用 bindingKind） */
export type DtWidgetAssetInteractionMode = "decorative" | "readoutOverlay" | "commandSurface";

/** 指令槽写入模板（配合 bindingKind=command） */
export type DtWidgetCommandWriteTemplate = "toggle01" | "momentaryPress" | "literal";

/**
 * 编辑态图形示意：由绑定 format / 值驱动形态（非持久化关键字段，缺省按卡片）。
 * roomPanel / envThp* / dashButton 为内置图库专用布局。
 * switch*：开关类示意；ahuPlenum：机房组合式风箱示意；device*：首槽为运行信号（文本开关量或数字>0.5）时旋转动效。
 */
export type DtWidgetGraphicHint =
  | "card"
  | "lamp"
  | "bar"
  | "acUnit"
  | "roomPanel"
  | "envThp"
  | "envThpRow"
  | "dashButton"
  | "switchToggle"
  | "switchRocker"
  | "switchEstop"
  | "switchDual"
  | "ahuPlenum"
  | "deviceFan"
  | "devicePump"
  | "deviceCompressor"
  /** 自定义：graphicAsset + 可选 graphicLibraryAssetId（IndexedDB 素材库） */
  | "customAsset";

/** 内置矢量/位图占位；可与 {@link DtSceneWidget.graphicLibraryAssetId} 组合（仅存 mime/name，像素走本地库） */
export type DtWidgetGraphicAsset = {
  mime: "image/svg+xml" | "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  /** data:image/...;base64,...；若已入库可省略以减小场景 JSON */
  dataUrl?: string;
  name?: string;
};

/** 持久化字段：图形层 id（现仅保留单层，读入时归一为 defaultWidgetStackLayers） */
export const DEFAULT_WIDGET_STACK_LAYER_ID = "wl-default";

export type DtWidgetStackLayerRow = { id: string; name: string };

export type DtWidgetStackLayerUi = { visible: boolean; locked: boolean };

/** 画布上的遥测显示框（plate 归一化 0–1，与房间同一套坐标区域） */
export type DtSceneWidget = {
  id: string;
  kind: DtSceneWidgetKind;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  zIndex?: number;
  /** 所属图形子图层 id（见 sceneDoc.widgetStackLayers）；缺省由存储层归一化到首层 */
  stackLayerId?: string;
  title?: string;
  stylePresetId: DtWidgetStylePresetId;
  effectPresetId: DtWidgetEffectPresetId;
  bindings: DtWidgetBindingSlot[];
  /** 可选：状态机/指示灯等形态（由内置图库写入） */
  graphicHint?: DtWidgetGraphicHint;
  /** 可选：导入的 SVG/PNG 等（graphicHint 置为 customAsset） */
  graphicAsset?: DtWidgetGraphicAsset;
  /** 本地素材库（IndexedDB）条目 id，与 graphicAsset.mime 等并存；像素数据存库内 */
  graphicLibraryAssetId?: string;
  /**
   * 导入图（customAsset）浏览态语义：纯装饰 / 浮层读数 / 整图点击写变量。
   * 非导入图可留空，由 bindingKind 与图元类型决定交互。
   */
  assetInteractionMode?: DtWidgetAssetInteractionMode;
  /** 为 true 时在图元上叠加显示主绑定数值（导入图与部分内置图均可用） */
  showReadoutOverlay?: boolean;
  /** 主显示/告警动效/写点默认槽；缺省为 bindings[0] */
  primaryBindingId?: string;
  commandWriteValueTemplate?: DtWidgetCommandWriteTemplate;
  /** template=literal 时写入的原始值（字符串，由后端解析） */
  commandWriteLiteral?: string;
};

/** v3：在 v2 基础上增加 widgets */
export type SceneLayoutDocumentV3 = {
  version: 3;
  ducts: DuctPlanPolyline[];
  rooms: RoomLayoutEntry[];
  widgets: DtSceneWidget[];
};

/**
 * 空调块在整 scene 坐标系中的归一化矩形（0–1，与 DtDuctSvg / measure 的 ductScene 宽高一致），
 * 便于 world 视口缩放后仍与风管对齐。
 */
export type DtAcZoneDoc = {
  id: string;
  zone: AcZoneId;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  /** 该侧机组负责的列索引（含端点），与 computeDuctChannels 的 zone 映射一致 */
  columnFrom: number;
  columnTo: number;
  labelShort?: string;
};

/** 房间块视觉：平面微阴影 vs 轻伪透视 */
export type RoomVisualPresetId = "flat" | "isoSoft";

/** 整块画布在视口中的空间呈现（与单房间 roomVisualPreset 正交） */
export type BoardPresentationId = "plan2d" | "planTilt";

/** v4：acZones + 房间视觉预设 + 可选房间种子间距（px，未设置则用 config.layout.roomGridGapPx） */
export type SceneLayoutDocumentV4 = {
  version: 4;
  ducts: DuctPlanPolyline[];
  rooms: RoomLayoutEntry[];
  widgets: DtSceneWidget[];
  /** 图形子图层：顺序为自下而上绘制（index 0 最底，末尾最前）；与 widget.stackLayerId 对应 */
  widgetStackLayers: DtWidgetStackLayerRow[];
  widgetStackLayerUi?: Record<string, DtWidgetStackLayerUi>;
  acZones: DtAcZoneDoc[];
  roomVisualPreset: RoomVisualPresetId;
  /** 仅影响 buildDefaultRoomLayout 种子间距；undefined 表示沿用运行时 config */
  roomGapPx?: number;
  /** 整块板：纯平面 vs 斜侧透视（命中逆变换见 viewportPlaneTransform） */
  boardPresentation: BoardPresentationId;
  /** planTilt 时绕 X 轴倾角（度），建议 6–16 */
  boardTiltRotateXDeg?: number;
  /**
   * 为 true 时：无自定义风管折线（ducts 为空）不绘制由 computeDuctChannels 生成的示意风管（DtDuctSvg），
   * 与「清空风管/清空画布」语义一致，避免画布上残留不可选中的装饰层。
   * 缺省/undefined：沿用旧行为（空 ducts 时仍显示内置示意）。
   */
  suppressBuiltInDuctSvg?: boolean;
};

/** 运行时统一使用 v4（由存储层从 v2/v3 迁移） */
export type SceneLayoutDocument = SceneLayoutDocumentV4;

export const SCENE_LAYOUT_STORAGE_KEY_V3 = "aro.digitalTwin.sceneLayout.v3";
export const SCENE_LAYOUT_STORAGE_KEY_V4 = "aro.digitalTwin.sceneLayout.v4";

export function newDtSceneWidgetId(): string {
  try {
    return `dtw-${crypto.randomUUID().slice(0, 10)}`;
  } catch {
    return `dtw-${Date.now()}`;
  }
}

export function defaultWidgetStackLayers(): DtWidgetStackLayerRow[] {
  return [{ id: DEFAULT_WIDGET_STACK_LAYER_ID, name: "图形层 1" }];
}

export function effectiveWidgetStackLayerId(
  w: Pick<DtSceneWidget, "stackLayerId">,
  layers: readonly DtWidgetStackLayerRow[]
): string {
  const ids = new Set(layers.map((l) => l.id));
  if (w.stackLayerId && ids.has(w.stackLayerId)) return w.stackLayerId;
  return layers[0]?.id ?? DEFAULT_WIDGET_STACK_LAYER_ID;
}

export function newWidgetStackLayerId(): string {
  try {
    return `wl-${crypto.randomUUID().slice(0, 10)}`;
  } catch {
    return `wl-${Date.now()}`;
  }
}

export function newDtBindingSlotId(): string {
  try {
    return `slot-${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `slot-${Date.now()}`;
  }
}

export const ROTATION_SNAP_SET = [0, 45, -45] as const;

export function normalizeRotationDeg(deg: number): number {
  const s = new Set(ROTATION_SNAP_SET);
  if (s.has(deg as 0 | 45 | -45)) return deg;
  return 0;
}

/**
 * 可选升级（真 3D）：若需层高、剖切、轨道相机或与 BIM 对齐，可引入 Three.js / Babylon 独立画布层，
 * 与 SceneLayoutDocumentV2 只读同步；平面编辑仍保留在本模块，避免与 P0–P4 强耦合。
 */
