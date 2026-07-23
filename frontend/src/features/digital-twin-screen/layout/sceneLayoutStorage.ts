import type { DuctLayoutDocumentV1, DuctPlanPolyline } from "@/features/digital-twin-screen/layout/ductLayoutTypes";
import { DUCT_LAYOUT_STORAGE_KEY } from "@/features/digital-twin-screen/layout/ductLayoutTypes";
import type {
  DtAcZoneDoc,
  DtSceneWidget,
  DtWidgetGraphicAsset,
  SceneLayoutDocumentV2,
  SceneLayoutDocumentV3,
  SceneLayoutDocumentV4,
} from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import {
  DEFAULT_WIDGET_STACK_LAYER_ID,
  defaultWidgetStackLayers,
  SCENE_LAYOUT_STORAGE_KEY,
  SCENE_LAYOUT_STORAGE_KEY_V3,
  SCENE_LAYOUT_STORAGE_KEY_V4,
  type DtWidgetStackLayerRow,
} from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { MAX_WIDGET_GRAPHIC_DATA_URL_LEN } from "@/features/digital-twin-screen/layout/dtGraphicImport";
import { DT_WIDGET_PLATE_MIN } from "@/features/digital-twin-screen/layout/dtWidgetPlateLimits";

const EMPTY_V4: SceneLayoutDocumentV4 = {
  version: 4,
  ducts: [],
  rooms: [],
  widgets: [],
  widgetStackLayers: defaultWidgetStackLayers(),
  widgetStackLayerUi: undefined,
  acZones: [],
  roomVisualPreset: "isoSoft",
  boardPresentation: "plan2d",
  boardTiltRotateXDeg: undefined,
  suppressBuiltInDuctSvg: true,
};

function isV2(v: unknown): v is SceneLayoutDocumentV2 {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.version === 2 && Array.isArray(o.ducts) && Array.isArray(o.rooms);
}

function isV3(v: unknown): v is SceneLayoutDocumentV3 {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.version === 3 && Array.isArray(o.ducts) && Array.isArray(o.rooms) && Array.isArray(o.widgets);
}

function isV4(v: unknown): v is SceneLayoutDocumentV4 {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.version === 4 && Array.isArray(o.ducts) && Array.isArray(o.rooms) && Array.isArray(o.widgets) && Array.isArray(o.acZones);
}

function isV1Duct(v: unknown): v is DuctLayoutDocumentV1 {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.version === 1 && Array.isArray(o.polylines);
}

function sanitizeDucts(raw: unknown): SceneLayoutDocumentV4["ducts"] {
  if (!Array.isArray(raw)) return [];
  return raw.map((pl) => ({
    id: String((pl as DuctPlanPolyline).id),
    columnIndex: Number.isFinite((pl as DuctPlanPolyline).columnIndex)
      ? Math.max(0, Math.floor(Number((pl as DuctPlanPolyline).columnIndex))) % 4
      : 0,
    points: ((pl as DuctPlanPolyline).points || []).map((p) => ({
      id: String(p.id),
      x: clamp01(Number(p.x)),
      y: clamp01(Number(p.y)),
      h: p.h === undefined || p.h === null ? 0 : clamp01(Number(p.h)),
    })),
  })) as SceneLayoutDocumentV4["ducts"];
}

function sanitizeRooms(raw: unknown): SceneLayoutDocumentV4["rooms"] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    roomId: String((r as SceneLayoutDocumentV4["rooms"][number]).roomId),
    nx: clamp01(Number((r as SceneLayoutDocumentV4["rooms"][number]).nx)),
    ny: clamp01(Number((r as SceneLayoutDocumentV4["rooms"][number]).ny)),
    nw: clamp01(Number((r as SceneLayoutDocumentV4["rooms"][number]).nw)),
    nh: clamp01(Number((r as SceneLayoutDocumentV4["rooms"][number]).nh)),
    rotationDeg: normalizeRot((r as SceneLayoutDocumentV4["rooms"][number]).rotationDeg),
  }));
}

function isValidWidgetStackLayerId(id: string): boolean {
  if (!id || id.length > 96) return false;
  return id === DEFAULT_WIDGET_STACK_LAYER_ID || /^wl-[A-Za-z0-9-]+$/.test(id);
}

/** 保留文档中的多图形子图层顺序；非法项剔除，空则回退默认单层 */
function sanitizeWidgetStackLayers(raw: unknown): SceneLayoutDocumentV4["widgetStackLayers"] {
  if (!Array.isArray(raw) || raw.length === 0) return defaultWidgetStackLayers();
  const rows: DtWidgetStackLayerRow[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (!isValidWidgetStackLayerId(id) || seen.has(id)) continue;
    seen.add(id);
    const nameRaw = o.name;
    const name =
      nameRaw === undefined || nameRaw === null || String(nameRaw).trim() === ""
        ? `图层 ${rows.length + 1}`
        : String(nameRaw).trim().slice(0, 80);
    rows.push({ id, name });
  }
  if (rows.length === 0) return defaultWidgetStackLayers();
  return rows;
}

function sanitizeWidgetStackLayerUi(
  raw: unknown,
  layerIds: string[]
): NonNullable<SceneLayoutDocumentV4["widgetStackLayerUi"]> {
  const out: NonNullable<SceneLayoutDocumentV4["widgetStackLayerUi"]> = {};
  const base = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const id of layerIds) {
    const v = base[id];
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      out[id] = {
        visible: o.visible === false ? false : true,
        locked: o.locked === true,
      };
    } else {
      out[id] = { visible: true, locked: false };
    }
  }
  return out;
}

function sanitizeGraphicLibraryId(raw: unknown): string | undefined {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || s.length > 96) return undefined;
  if (!/^gl-[A-Za-z0-9]+$/.test(s)) return undefined;
  return s;
}

/**
 * 内联 data URL 或「素材库引用 + mime/name」；无效组合时丢弃库 id。
 */
function sanitizeGraphicAssetFlexible(
  raw: unknown,
  libraryIdIn: string | undefined
): { asset?: DtWidgetGraphicAsset; graphicLibraryAssetId?: string } {
  const parseBody = (): { mime: DtWidgetGraphicAsset["mime"]; name?: string; dataUrl: string } | undefined => {
    if (!raw || typeof raw !== "object") return undefined;
    const o = raw as Record<string, unknown>;
    const mime = String(o.mime || "");
    const okMime =
      mime === "image/svg+xml" ||
      mime === "image/png" ||
      mime === "image/jpeg" ||
      mime === "image/webp" ||
      mime === "image/gif"
        ? mime
        : undefined;
    if (!okMime) return undefined;
    const name = o.name === undefined || o.name === null ? undefined : String(o.name).slice(0, 200);
    const dataUrl = String(o.dataUrl || "").trim();
    return { mime: okMime, name, dataUrl };
  };

  if (!libraryIdIn) {
    const b = parseBody();
    if (!b || !b.dataUrl.startsWith("data:") || b.dataUrl.length > MAX_WIDGET_GRAPHIC_DATA_URL_LEN) return {};
    return { asset: { mime: b.mime, dataUrl: b.dataUrl, name: b.name } };
  }

  const b = parseBody();
  if (!b) return { graphicLibraryAssetId: undefined };
  const okData =
    b.dataUrl.startsWith("data:") && b.dataUrl.length > 0 && b.dataUrl.length <= MAX_WIDGET_GRAPHIC_DATA_URL_LEN
      ? b.dataUrl
      : undefined;
  if (okData) return { asset: { mime: b.mime, dataUrl: okData, name: b.name }, graphicLibraryAssetId: libraryIdIn };
  return { asset: { mime: b.mime, name: b.name }, graphicLibraryAssetId: libraryIdIn };
}

function sanitizeWidgets(raw: unknown, widgetLayerIds: string[]): DtSceneWidget[] {
  if (!Array.isArray(raw)) return [];
  const primaryLayer = widgetLayerIds[0] ?? defaultWidgetStackLayers()[0]!.id;
  const layerIdSet = new Set(widgetLayerIds);
  const presets = new Set(["glassDark", "highContrast", "compact"]);
  const effects = new Set(["none", "pulseOnAlarm"]);
  return raw
    .map((w) => {
      if (!w || typeof w !== "object") return null;
      const o = w as Record<string, unknown>;
      const id = String(o.id || "");
      if (!id) return null;
      const style = String(o.stylePresetId || "glassDark");
      const effect = String(o.effectPresetId || "none");
      const bindingsRaw = Array.isArray(o.bindings) ? o.bindings : [];
      const bindings = bindingsRaw
        .map((b, bi) => {
          if (!b || typeof b !== "object") return null;
          const br = b as Record<string, unknown>;
          const bid = String(br.id || `b${bi}`);
          const sem = br.semantic;
          const semantic =
            sem === "temperature" || sem === "humidity" || sem === "pressure" || sem === "generic" ? sem : undefined;
          const bk = br.bindingKind;
          const bindingKind = bk === "command" || bk === "readout" ? bk : undefined;
          return {
            id: bid,
            variableName: String(br.variableName ?? "").trim(),
            label: br.label === undefined || br.label === null ? undefined : String(br.label),
            unit: br.unit === undefined || br.unit === null ? undefined : String(br.unit),
            decimals:
              br.decimals === undefined || br.decimals === null ? undefined : Math.max(0, Math.min(6, Number(br.decimals))),
            format: br.format === "text" ? "text" : "number",
            semantic,
            bindingKind,
          };
        })
        .filter(Boolean) as DtSceneWidget["bindings"];
      const sid = typeof o.stackLayerId === "string" ? o.stackLayerId.trim() : "";
      const stackLayerId = sid && layerIdSet.has(sid) ? sid : primaryLayer;
      const libIn = sanitizeGraphicLibraryId(o.graphicLibraryAssetId);
      const gFlex = sanitizeGraphicAssetFlexible(o.graphicAsset, libIn);
      const graphicLibraryAssetId = gFlex.graphicLibraryAssetId;
      const graphicAsset = gFlex.asset;
      const isCustomGraphic = !!graphicAsset?.mime && (!!graphicAsset.dataUrl || !!graphicLibraryAssetId);
      const graphicHintRaw = o.graphicHint;
      const graphicHint =
        isCustomGraphic
          ? ("customAsset" as const)
          : graphicHintRaw === "lamp" ||
              graphicHintRaw === "bar" ||
              graphicHintRaw === "card" ||
              graphicHintRaw === "acUnit" ||
              graphicHintRaw === "roomPanel" ||
              graphicHintRaw === "envThp" ||
              graphicHintRaw === "envThpRow" ||
              graphicHintRaw === "dashButton" ||
              graphicHintRaw === "switchToggle" ||
              graphicHintRaw === "switchRocker" ||
              graphicHintRaw === "switchEstop" ||
              graphicHintRaw === "switchDual" ||
              graphicHintRaw === "ahuPlenum" ||
              graphicHintRaw === "deviceFan" ||
              graphicHintRaw === "devicePump" ||
              graphicHintRaw === "deviceCompressor"
            ? graphicHintRaw
            : undefined;
      const aim = o.assetInteractionMode;
      const assetInteractionMode =
        aim === "decorative" || aim === "readoutOverlay" || aim === "commandSurface" ? aim : undefined;
      const sor = o.showReadoutOverlay;
      const showReadoutOverlay = sor === true;
      const pbi = typeof o.primaryBindingId === "string" ? o.primaryBindingId.trim() : "";
      const bindingIds = new Set(bindings.map((b) => b.id));
      const primaryBindingId = pbi && bindingIds.has(pbi) ? pbi : undefined;
      const cwt = o.commandWriteValueTemplate;
      const commandWriteValueTemplate =
        cwt === "toggle01" || cwt === "momentaryPress" || cwt === "literal" ? cwt : undefined;
      const litRaw = o.commandWriteLiteral;
      const commandWriteLiteral =
        litRaw === undefined || litRaw === null ? undefined : String(litRaw).slice(0, 120);

      const out: DtSceneWidget = {
        id,
        kind: "telemetryCard" as const,
        nx: clamp01(Number(o.nx)),
        ny: clamp01(Number(o.ny)),
        nw: clamp01(Math.max(DT_WIDGET_PLATE_MIN, Number(o.nw) || 0.2)),
        nh: clamp01(Math.max(DT_WIDGET_PLATE_MIN, Number(o.nh) || 0.12)),
        zIndex: o.zIndex === undefined || o.zIndex === null ? undefined : Number(o.zIndex),
        stackLayerId,
        title: o.title === undefined || o.title === null ? undefined : String(o.title),
        stylePresetId: (presets.has(style) ? style : "glassDark") as DtSceneWidget["stylePresetId"],
        effectPresetId: (effects.has(effect) ? effect : "none") as DtSceneWidget["effectPresetId"],
        bindings,
        graphicHint,
      };
      if (graphicAsset) {
        out.graphicAsset = graphicAsset;
      }
      if (graphicLibraryAssetId && isCustomGraphic) out.graphicLibraryAssetId = graphicLibraryAssetId;
      if (assetInteractionMode) out.assetInteractionMode = assetInteractionMode;
      if (showReadoutOverlay) out.showReadoutOverlay = true;
      if (primaryBindingId) out.primaryBindingId = primaryBindingId;
      if (commandWriteValueTemplate) out.commandWriteValueTemplate = commandWriteValueTemplate;
      if (commandWriteLiteral !== undefined && commandWriteLiteral !== "") out.commandWriteLiteral = commandWriteLiteral;
      return out;
    })
    .filter(Boolean) as DtSceneWidget[];
}

function sanitizeAcZones(raw: unknown): DtAcZoneDoc[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((z, i) => {
      if (!z || typeof z !== "object") return null;
      const o = z as Record<string, unknown>;
      const zone = o.zone === "right" ? "right" : "left";
      const id = String(o.id || `ac-${zone}-${i}`);
      const columnFrom = Math.max(0, Math.min(3, Math.floor(Number(o.columnFrom) || 0)));
      const columnTo = Math.max(0, Math.min(3, Math.floor(Number(o.columnTo) || 0)));
      return {
        id,
        zone,
        nx: clamp01(Number(o.nx)),
        ny: clamp01(Number(o.ny)),
        nw: clamp01(Math.max(0.02, Number(o.nw) || 0.1)),
        nh: clamp01(Math.max(0.02, Number(o.nh) || 0.08)),
        columnFrom,
        columnTo,
        labelShort: o.labelShort === undefined || o.labelShort === null ? undefined : String(o.labelShort),
      } as DtAcZoneDoc;
    })
    .filter(Boolean) as DtAcZoneDoc[];
}

function sanitizeRoomVisualPreset(raw: unknown): SceneLayoutDocumentV4["roomVisualPreset"] {
  return raw === "flat" ? "flat" : "isoSoft";
}

function sanitizeBoardPresentation(raw: unknown): SceneLayoutDocumentV4["boardPresentation"] {
  return raw === "planTilt" ? "planTilt" : "plan2d";
}

function sanitizeBoardTiltRotateXDeg(raw: unknown): SceneLayoutDocumentV4["boardTiltRotateXDeg"] {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(18, Math.max(0, n));
}

function sanitizeSuppressBuiltInDuctSvg(raw: unknown): SceneLayoutDocumentV4["suppressBuiltInDuctSvg"] {
  if (raw === true) return true;
  if (raw === false) return false;
  return undefined;
}

function normalizeRot(v: unknown): number | undefined {
  if (v === 45 || v === -45 || v === 0) return v;
  if (v === undefined || v === null) return undefined;
  return 0;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function v2toV3(v2: SceneLayoutDocumentV2): SceneLayoutDocumentV3 {
  return {
    version: 3,
    ducts: sanitizeDucts(v2.ducts),
    rooms: sanitizeRooms(v2.rooms),
    widgets: [],
  };
}

function v3toV4(v3: SceneLayoutDocumentV3): SceneLayoutDocumentV4 {
  const wsl = defaultWidgetStackLayers();
  const lids = wsl.map((l) => l.id);
  return {
    version: 4,
    ducts: sanitizeDucts(v3.ducts),
    rooms: sanitizeRooms(v3.rooms),
    widgets: sanitizeWidgets(v3.widgets, lids),
    widgetStackLayers: wsl,
    widgetStackLayerUi: sanitizeWidgetStackLayerUi(undefined, lids),
    acZones: [],
    roomVisualPreset: "isoSoft",
    roomGapPx: undefined,
    boardPresentation: "plan2d",
    boardTiltRotateXDeg: undefined,
  };
}

function sanitizeV4(parsed: SceneLayoutDocumentV4): SceneLayoutDocumentV4 {
  const gapRaw = (parsed as Record<string, unknown>).roomGapPx;
  const roomGapPx =
    gapRaw === undefined || gapRaw === null || gapRaw === ""
      ? undefined
      : Math.max(0, Math.min(48, Number(gapRaw))) || undefined;
  const pr = parsed as Record<string, unknown>;
  const widgetStackLayers = sanitizeWidgetStackLayers(pr.widgetStackLayers);
  const layerIds = widgetStackLayers.map((l) => l.id);
  return {
    version: 4,
    ducts: sanitizeDucts(parsed.ducts),
    rooms: sanitizeRooms(parsed.rooms),
    widgets: sanitizeWidgets(parsed.widgets, layerIds),
    widgetStackLayers,
    widgetStackLayerUi: sanitizeWidgetStackLayerUi(pr.widgetStackLayerUi, layerIds),
    acZones: sanitizeAcZones(parsed.acZones),
    roomVisualPreset: sanitizeRoomVisualPreset(pr.roomVisualPreset),
    roomGapPx,
    boardPresentation: sanitizeBoardPresentation(pr.boardPresentation),
    boardTiltRotateXDeg: sanitizeBoardTiltRotateXDeg(pr.boardTiltRotateXDeg),
    suppressBuiltInDuctSvg: sanitizeSuppressBuiltInDuctSvg(pr.suppressBuiltInDuctSvg),
  };
}

/** 读取 v4；若无则从 v3/v2/v1 迁移并写入 v4 key */
export function loadSceneLayoutFromStorage(): SceneLayoutDocumentV4 {
  try {
    const rawV4 = localStorage.getItem(SCENE_LAYOUT_STORAGE_KEY_V4);
    if (rawV4) {
      const parsed: unknown = JSON.parse(rawV4);
      if (isV4(parsed)) {
        return sanitizeV4(parsed);
      }
    }
    const rawV3 = localStorage.getItem(SCENE_LAYOUT_STORAGE_KEY_V3);
    if (rawV3) {
      const parsed: unknown = JSON.parse(rawV3);
      if (isV3(parsed)) {
        const migrated = v3toV4({
          version: 3,
          ducts: sanitizeDucts(parsed.ducts),
          rooms: sanitizeRooms(parsed.rooms),
          widgets: Array.isArray(parsed.widgets) ? (parsed.widgets as SceneLayoutDocumentV3["widgets"]) : [],
        });
        try {
          localStorage.setItem(SCENE_LAYOUT_STORAGE_KEY_V4, JSON.stringify(migrated));
        } catch {
          /* ignore */
        }
        return migrated;
      }
    }
    const rawV2 = localStorage.getItem(SCENE_LAYOUT_STORAGE_KEY);
    if (rawV2) {
      const parsed: unknown = JSON.parse(rawV2);
      if (isV2(parsed)) {
        const migrated = v3toV4(
          v2toV3({
            version: 2,
            ducts: sanitizeDucts(parsed.ducts),
            rooms: sanitizeRooms(parsed.rooms),
          })
        );
        try {
          localStorage.setItem(SCENE_LAYOUT_STORAGE_KEY_V4, JSON.stringify(migrated));
          localStorage.setItem(
            SCENE_LAYOUT_STORAGE_KEY_V3,
            JSON.stringify({ version: 3, ducts: migrated.ducts, rooms: migrated.rooms, widgets: migrated.widgets })
          );
        } catch {
          /* ignore */
        }
        return migrated;
      }
    }
    const rawV1 = localStorage.getItem(DUCT_LAYOUT_STORAGE_KEY);
    if (rawV1) {
      const parsed: unknown = JSON.parse(rawV1);
      if (isV1Duct(parsed)) {
        const migrated: SceneLayoutDocumentV4 = v3toV4({
          version: 3,
          ducts: sanitizeDucts(parsed.polylines),
          rooms: [],
          widgets: [],
        });
        try {
          localStorage.setItem(SCENE_LAYOUT_STORAGE_KEY_V4, JSON.stringify(migrated));
          localStorage.setItem(SCENE_LAYOUT_STORAGE_KEY_V3, JSON.stringify({ version: 3, ducts: migrated.ducts, rooms: [], widgets: [] }));
          localStorage.setItem(SCENE_LAYOUT_STORAGE_KEY, JSON.stringify({ version: 2, ducts: migrated.ducts, rooms: [] }));
        } catch {
          /* ignore */
        }
        return migrated;
      }
    }
  } catch {
    /* ignore */
  }
  return { ...EMPTY_V4 };
}

/** 从 JSON 字符串解析 v4 场景（导入/预设）；失败返回 null */
export function parseSceneLayoutDocumentJsonString(raw: string): SceneLayoutDocumentV4 | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isV4(parsed)) return null;
    return sanitizeV4(parsed);
  } catch {
    return null;
  }
}

/** 与存储层一致的空白 v4 文档（新建工程用） */
export function emptySceneLayoutDocumentV4(): SceneLayoutDocumentV4 {
  return { ...EMPTY_V4 };
}

export function saveSceneLayoutToStorage(doc: SceneLayoutDocumentV4): void {
  try {
    const v4: SceneLayoutDocumentV4 = sanitizeV4(doc);
    localStorage.setItem(SCENE_LAYOUT_STORAGE_KEY_V4, JSON.stringify(v4));
    try {
      localStorage.setItem(
        SCENE_LAYOUT_STORAGE_KEY_V3,
        JSON.stringify({ version: 3, ducts: v4.ducts, rooms: v4.rooms, widgets: v4.widgets })
      );
      localStorage.setItem(SCENE_LAYOUT_STORAGE_KEY, JSON.stringify({ version: 2, ducts: v4.ducts, rooms: v4.rooms }));
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}
