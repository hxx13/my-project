import "@/features/digital-twin-screen/digitalTwinScreen.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { defaultDigitalTwinScreenConfig } from "@/features/digital-twin-screen/defaultDigitalTwinScreenConfig";
import { mergeDigitalTwinScreenConfig } from "@/features/digital-twin-screen/mergeDigitalTwinScreenConfig";
import { digitalTwinThemeStyleVars } from "@/features/digital-twin-screen/themeCssVars";
import { DtAcZoneLayer } from "@/features/digital-twin-screen/DtAcZoneLayer";
import { DtAmbientLayer } from "@/features/digital-twin-screen/DtAmbientLayer";
import { DtChromeBar } from "@/features/digital-twin-screen/DtChromeBar";
import { DtDuctSvg } from "@/features/digital-twin-screen/DtDuctSvg";
import { DtRoomGrid } from "@/features/digital-twin-screen/DtRoomGrid";
import { computeDuctChannels, type DuctSceneLayout, type DuctZoneColumnBinding } from "@/features/digital-twin-screen/computeDuctPaths";
import { useMockRoomTelemetrySnapshot } from "@/features/digital-twin-screen/useRoomTelemetrySnapshot";
import { DIGITAL_TWIN_SCREEN_RETURN_TO_KEY } from "@/features/admin/adminTelemetryNav";
import type { DuctPlanPolyline } from "@/features/digital-twin-screen/layout/ductLayoutTypes";
import { newPointId, newPolylineId } from "@/features/digital-twin-screen/layout/ductLayoutTypes";
import { DuctLayoutEditor } from "@/features/digital-twin-screen/layout/DuctLayoutEditor";
import { RoomLayoutEditor } from "@/features/digital-twin-screen/layout/RoomLayoutEditor";
import { useDtWidgetWinccWrite } from "@/features/digital-twin-screen/hooks/useDtWidgetWinccWrite";
import { useTwinWinccWidgetValues } from "@/features/digital-twin-screen/hooks/useTwinWinccWidgetValues";
import { useDigitalTwinEditorSession } from "@/features/digital-twin-screen/hooks/useDigitalTwinEditorSession";
import { DtEditShell } from "@/features/digital-twin-screen/editor-shell/DtEditShell";
import { DtCustomIconImportPanel } from "@/features/digital-twin-screen/editor-shell/DtCustomIconImportPanel";
import { DtGraphicLibrarySidebarPanel } from "@/features/digital-twin-screen/editor-shell/DtGraphicLibrarySidebarPanel";
import { DtWidgetDetailsPanel } from "@/features/digital-twin-screen/editor-shell/DtWidgetDetailsPanel";
import { DtWidgetStackLayersPanel } from "@/features/digital-twin-screen/editor-shell/DtWidgetStackLayersPanel";
import { DtAcZoneDetailsPanel } from "@/features/digital-twin-screen/editor-shell/DtAcZoneDetailsPanel";
import { DtWidgetPalette } from "@/features/digital-twin-screen/editor-shell/DtWidgetPalette";
import { DuctEditToolbar } from "@/features/digital-twin-screen/layout/editor/DuctEditToolbar";
import { SceneEditSurface, type SceneEditContextMenuHit } from "@/features/digital-twin-screen/layout/editor/SceneEditSurface";
import {
  emptyClipboardBundle,
  parseClipboardBundle,
  remapClipboardBundleForPaste,
  type DtEditorClipboardBundleV2,
} from "@/features/digital-twin-screen/layout/editor/dtEditorClipboard";
import { DtSceneWidgetLayer } from "@/features/digital-twin-screen/layout/DtSceneWidgetLayer";
import { DtShapeLibraryPanel } from "@/features/digital-twin-screen/layout/DtShapeLibraryPanel";
import { buildDefaultRoomLayout } from "@/features/digital-twin-screen/layout/buildDefaultRoomLayout";
import { createWidgetFromShapeCatalogItem } from "@/features/digital-twin-screen/layout/dtEditorShapeCatalog";
import { defaultPlateForCustomIconImage, measureRasterFromDataUrl } from "@/features/digital-twin-screen/layout/dtGraphicImport";
import { dtGraphicLibraryGet } from "@/features/digital-twin-screen/layout/dtGraphicLibraryIdb";
import {
  createCustomGraphicWidget,
  createCustomGraphicWidgetFromLibrary,
  createWidgetFromPalettePreset,
  type DtWidgetPalettePresetId,
} from "@/features/digital-twin-screen/layout/dtWidgetPresets";
import { DEFAULT_EDITOR_LAYER_ROWS } from "@/features/digital-twin-screen/layout/editor/EditorLayerModel";
import { customPolylinesToChannels } from "@/features/digital-twin-screen/layout/customPolylinesToChannels";
import { saveSceneLayoutToStorage } from "@/features/digital-twin-screen/layout/sceneLayoutStorage";
import {
  clearDraftFromStorage,
  deletePresetFromStorage,
  downloadSceneDocJson,
  findPresetById,
  listPresetsFromStorage,
  parseSceneDocFromFileText,
  persistSceneToLegacyV4Slot,
  resolveInitialSceneDocument,
  saveDraftToStorage,
  savePresetToStorage,
} from "@/features/digital-twin-screen/layout/editor/dtEditorProjectStorage";
import type {
  DtAcZoneDoc,
  DtSceneWidget,
  DtWidgetGraphicAsset,
  RoomLayoutEntry,
  SceneLayoutDocumentV4,
} from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import {
  DEFAULT_WIDGET_STACK_LAYER_ID,
  defaultWidgetStackLayers,
  effectiveWidgetStackLayerId,
  ROTATION_SNAP_SET,
} from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { seedAcZonesFromDuctScene } from "@/features/digital-twin-screen/layout/acZoneSeed";
import { cloneSceneLayoutDocument, sceneLayoutDocsEqual } from "@/features/digital-twin-screen/layout/sceneLayoutClone";
import { clamp01, clampRoomTopLeftToPlate, snapGrid } from "@/features/digital-twin-screen/layout/planGeometry";

/** WorldStack：仅 pan+scale；内层 perspective + rotateX（整块板 3D 斜侧） */
function DtWorldStack({
  viewport,
  tilt,
  tiltDeg,
  children,
}: {
  viewport: { panX: number; panY: number; scale: number };
  tilt: boolean;
  tiltDeg: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative min-h-0 flex-1"
      style={{
        transform: `translate3d(${viewport.panX}px,${viewport.panY}px,0) scale(${viewport.scale})`,
        transformOrigin: "0 0",
        willChange: "transform",
      }}
    >
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        style={{
          perspective: tilt ? "min(960px, 130vw)" : undefined,
          transformStyle: tilt ? "preserve-3d" : undefined,
        }}
      >
        <div
          className="relative flex min-h-0 flex-1 flex-col"
          style={{
            transform: tilt ? `rotateX(${tiltDeg}deg)` : undefined,
            transformOrigin: "50% 36%",
            transformStyle: tilt ? "preserve-3d" : undefined,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function initialSceneBundle(): {
  doc: SceneLayoutDocumentV4;
  useCustomDucts: boolean;
  useCustomRooms: boolean;
  restoredFromDraft: boolean;
  legacyMigrated: boolean;
  migratedPresetName?: string;
} {
  const r = resolveInitialSceneDocument();
  return {
    doc: r.doc,
    useCustomDucts: r.useCustomDucts,
    useCustomRooms: r.useCustomRooms,
    restoredFromDraft: r.restoredFromDraft,
    legacyMigrated: r.legacyMigrated,
    migratedPresetName: r.migratedPresetName,
  };
}

function cloneDuctsForEdit(ducts: DuctPlanPolyline[]): DuctPlanPolyline[] {
  return ducts.map((pl) => ({ ...pl, points: pl.points.map((p) => ({ ...p })) }));
}

function nextRoomRotation(deg: number | undefined): number {
  const cur = deg ?? 0;
  const order = ROTATION_SNAP_SET as readonly number[];
  const idx = order.indexOf(cur);
  const i = idx < 0 ? 0 : idx + 1;
  return order[i % order.length]!;
}

const MAX_SCENE_UNDO = 40;

/** 与 measure 共用：视口 CSS 像素下限 */
const MIN_SCENE_DIM = 8;
/** 伪无限画布：滚轮缩放范围（编辑/浏览共用）；后续可接楼层分区、多板平铺与工业图元库 */
const VIEWPORT_SCALE_MIN = 0.08;
const VIEWPORT_SCALE_MAX = 8;
/** 编辑态：逻辑板大于视口，便于平移摆放（与 measure / minHeight 一致） */
/** 编辑态逻辑板相对视口尺寸的扩展倍数（相对浏览态约 2× 可布置面积） */
const EDIT_PLATE_EXTEND_W = 3.7;
const EDIT_PLATE_EXTEND_H = 3.7;

/** measure 在 AC ref 未就绪时按比例沿用上一帧条带，避免整段跳过 setDuctScene */
function scaleDuctSceneAcRects(prev: DuctSceneLayout, W: number, H: number): { leftAc: DuctSceneLayout["leftAc"]; rightAc: DuctSceneLayout["rightAc"] } {
  const sx = prev.width > 1e-6 ? W / prev.width : 1;
  const sy = prev.height > 1e-6 ? H / prev.height : 1;
  const la = prev.leftAc;
  const ra = prev.rightAc;
  return {
    leftAc: { x: la.x * sx, y: la.y * sy, w: la.w * sx, h: la.h * sy },
    rightAc: { x: ra.x * sx, y: ra.y * sy, w: ra.w * sx, h: ra.h * sy },
  };
}

/** 编辑态统一命中顺序（与 EditorLayerModel 默认一致）；不再提供多图层栏与 localStorage 覆盖 */
const EDITOR_SCENE_LAYER_ROWS = DEFAULT_EDITOR_LAYER_ROWS;

function emptyLayoutResetV4(): SceneLayoutDocumentV4 {
  const wsl = defaultWidgetStackLayers();
  const lid = wsl[0]!.id;
  return {
    version: 4,
    ducts: [],
    rooms: [],
    widgets: [],
    widgetStackLayers: wsl,
    widgetStackLayerUi: { [lid]: { visible: true, locked: false } },
    acZones: [],
    roomVisualPreset: "isoSoft",
    boardPresentation: "plan2d",
    boardTiltRotateXDeg: undefined,
    suppressBuiltInDuctSvg: true,
  };
}

function syntheticAcStripsForMeasure(W: number, H: number): { leftAc: DuctSceneLayout["leftAc"]; rightAc: DuctSceneLayout["rightAc"] } {
  const stripW = Math.max(MIN_SCENE_DIM, Math.min(W * 0.14, W * 0.28));
  const stripH = Math.max(MIN_SCENE_DIM * 2, H * 0.22);
  const y = H * 0.02;
  const margin = W * 0.01;
  return {
    leftAc: { x: margin, y, w: stripW, h: stripH },
    rightAc: { x: W - stripW - margin, y, w: stripW, h: stripH },
  };
}

export default function DigitalTwinScreenPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const config = useMemo(
    () => mergeDigitalTwinScreenConfig(defaultDigitalTwinScreenConfig, undefined),
    []
  );

  const snapshot = useMockRoomTelemetrySnapshot(config);

  const bundleRef = useRef(initialSceneBundle());
  const [sceneDoc, setSceneDoc] = useState<SceneLayoutDocumentV4>(() => bundleRef.current.doc);
  const [, setUseCustomDucts] = useState(() => bundleRef.current.useCustomDucts);
  const [useCustomRooms, setUseCustomRooms] = useState(() => bundleRef.current.useCustomRooms);
  const [editorNotice, setEditorNotice] = useState<string | null>(() => {
    const b = bundleRef.current;
    if (b.legacyMigrated && b.migratedPresetName) {
      return `已将旧版本地存储的布局备份为预设「${b.migratedPresetName}」，可在「工程」中载入。新工程默认为空白画布。`;
    }
    if (b.restoredFromDraft) return "已从草稿恢复上次编辑内容。";
    return null;
  });
  const [presetPickerTick, setPresetPickerTick] = useState(0);
  const importJsonInputRef = useRef<HTMLInputElement>(null);
  /** 默认关闭 4×8=32 网格；需显式开启（sessionStorage） */
  const [showLegacy32RoomGrid, setShowLegacy32RoomGrid] = useState(() => {
    try {
      return sessionStorage.getItem("aro.dt.legacy32RoomGrid") === "1";
    } catch {
      return false;
    }
  });
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [snap45, setSnap45] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  /** Shift+点击房间：多选集合（与 selectedRoomId 同步高亮） */
  const [auxSelectedRoomIds, setAuxSelectedRoomIds] = useState<string[]>([]);
  const [auxSelectedWidgetIds, setAuxSelectedWidgetIds] = useState<string[]>([]);
  const [auxSelectedAcZoneIds, setAuxSelectedAcZoneIds] = useState<string[]>([]);
  const [auxSelectedDuctPolyIds, setAuxSelectedDuctPolyIds] = useState<string[]>([]);
  const [selectedDuctPolyId, setSelectedDuctPolyId] = useState<string | null>(null);
  const [selectedDuctPointIndex, setSelectedDuctPointIndex] = useState<number | null>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  /** 新图元、侧边栏导入默认落入的图形子图层（文档 widgetStackLayers 末尾为最前层） */
  const [activeWidgetStackLayerId, setActiveWidgetStackLayerId] = useState(() => {
    const L = bundleRef.current.doc.widgetStackLayers;
    return L[L.length - 1]?.id ?? DEFAULT_WIDGET_STACK_LAYER_ID;
  });
  const [viewport, setViewport] = useState({ scale: 1, panX: 0, panY: 0 });
  const viewportPanScaleRef = useRef(viewport);
  const [viewportIx, setViewportIx] = useState<"idle" | "panning" | "zooming">("idle");
  const [selectedAcZoneId, setSelectedAcZoneId] = useState<string | null>(null);
  const panDragRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const spaceDownRef = useRef(false);
  const zoomIdleTimerRef = useRef(0);
  const [historyRev, setHistoryRev] = useState(0);
  const wasInLayoutEditRef = useRef(false);
  const sceneDocRef = useRef(sceneDoc);
  const clipboardBundleRef = useRef<DtEditorClipboardBundleV2 | null>(null);
  const copySelectionToClipboardRef = useRef<() => void>(() => {});
  const cutSelectionToClipboardRef = useRef<() => void>(() => {});
  const pasteFromClipboardRef = useRef<() => Promise<void>>(async () => {});
  const deleteMultiSelectionRef = useRef<() => void>(() => {});
  const pastRef = useRef<SceneLayoutDocumentV4[]>([]);
  const futureRef = useRef<SceneLayoutDocumentV4[]>([]);
  const gestureBaselineRef = useRef<SceneLayoutDocumentV4 | null>(null);
  const suppressAutoRoomSeedRef = useRef(false);
  const layoutEditModeRef = useRef(layoutEditMode);

  const sceneRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  /** 浏览态：挂在与 ductScene 同尺寸的板面上，measure(grid) 与风管/图元/内置示意共用同一矩形 */
  const layoutPlateRef = useRef<HTMLDivElement>(null);
  /** 编辑态 DtWorldStack 内风管/房间叠放列：用于 DEV 校验 offsetHeight 与 ductScene 对齐 */
  const editPlateColumnRef = useRef<HTMLDivElement>(null);
  const roomLayoutRoomsAreaMetricsRef = useRef<HTMLDivElement>(null);
  const ductSceneLayoutRef = useRef<DuctSceneLayout | null>(null);

  const telemetryByRoomId = useMemo(() => new Map(snapshot.rooms.map((r) => [r.roomId, r])), [snapshot.rooms]);

  useLayoutEffect(() => {
    sceneDocRef.current = sceneDoc;
  }, [sceneDoc]);

  useEffect(() => {
    setActiveWidgetStackLayerId((cur) => {
      const lids = sceneDoc.widgetStackLayers;
      return lids.some((l) => l.id === cur) ? cur : (lids[lids.length - 1]?.id ?? DEFAULT_WIDGET_STACK_LAYER_ID);
    });
  }, [sceneDoc.widgetStackLayers]);

  useEffect(() => {
    if (!layoutEditMode || !selectedWidgetId) return;
    const w = sceneDoc.widgets.find((x) => x.id === selectedWidgetId);
    if (!w) return;
    const lid = effectiveWidgetStackLayerId(w, sceneDoc.widgetStackLayers);
    if (sceneDoc.widgetStackLayerUi?.[lid]?.locked) setSelectedWidgetId(null);
  }, [layoutEditMode, sceneDoc.widgetStackLayerUi, sceneDoc.widgetStackLayers, sceneDoc.widgets, selectedWidgetId]);

  useLayoutEffect(() => {
    layoutEditModeRef.current = layoutEditMode;
  }, [layoutEditMode]);

  useLayoutEffect(() => {
    viewportPanScaleRef.current = viewport;
  }, [viewport]);

  const resetViewport = useCallback(() => {
    setViewport({ scale: 1, panX: 0, panY: 0 });
  }, []);

  const bumpHistoryUi = useCallback(() => setHistoryRev((x) => x + 1), []);

  const trimPast = useCallback(() => {
    while (pastRef.current.length > MAX_SCENE_UNDO) pastRef.current.shift();
  }, []);

  const pushUndoDiscrete = useCallback(() => {
    pastRef.current.push(cloneSceneLayoutDocument(sceneDocRef.current));
    trimPast();
    futureRef.current = [];
    bumpHistoryUi();
  }, [bumpHistoryUi, trimPast]);

  const commitWidgetStackPatch = useCallback(
    (patch: Partial<Pick<SceneLayoutDocumentV4, "widgetStackLayers" | "widgetStackLayerUi" | "widgets">>) => {
      pushUndoDiscrete();
      setSceneDoc((d) => ({ ...d, ...patch }));
    },
    [pushUndoDiscrete]
  );

  const beginLayoutGesture = useCallback(() => {
    gestureBaselineRef.current = cloneSceneLayoutDocument(sceneDocRef.current);
  }, []);

  const endLayoutGesture = useCallback(() => {
    if (!layoutEditModeRef.current) return;
    const base = gestureBaselineRef.current;
    gestureBaselineRef.current = null;
    if (!base) return;
    if (sceneLayoutDocsEqual(base, sceneDocRef.current)) return;
    pastRef.current.push(base);
    trimPast();
    futureRef.current = [];
    bumpHistoryUi();
  }, [bumpHistoryUi, trimPast]);

  const handleRoomSelect = useCallback((id: string | null, opts?: { additive?: boolean }) => {
    if (id === null) {
      setSelectedRoomId(null);
      setAuxSelectedRoomIds([]);
      return;
    }
    if (opts?.additive) {
      setAuxSelectedRoomIds((prev) => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id);
        else s.add(id);
        return Array.from(s);
      });
    } else {
      setAuxSelectedRoomIds([]);
      setSelectedWidgetId(null);
      setAuxSelectedWidgetIds([]);
      setSelectedAcZoneId(null);
      setAuxSelectedAcZoneIds([]);
      setSelectedDuctPolyId(null);
      setSelectedDuctPointIndex(null);
      setAuxSelectedDuctPolyIds([]);
    }
    setSelectedRoomId(id);
  }, []);

  const handleWidgetSelect = useCallback((id: string | null, opts?: { additive?: boolean }) => {
    if (id === null) {
      setSelectedWidgetId(null);
      setAuxSelectedWidgetIds([]);
      return;
    }
    if (opts?.additive) {
      setAuxSelectedWidgetIds((prev) => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id);
        else s.add(id);
        return Array.from(s);
      });
    } else {
      setAuxSelectedWidgetIds([]);
      setSelectedRoomId(null);
      setAuxSelectedRoomIds([]);
      setSelectedAcZoneId(null);
      setAuxSelectedAcZoneIds([]);
      setSelectedDuctPolyId(null);
      setSelectedDuctPointIndex(null);
      setAuxSelectedDuctPolyIds([]);
    }
    setSelectedWidgetId(id);
  }, []);

  /** 框选：仅合并 widget 选中态，禁止整表 load — post-save-no-full-refresh.mdc */
  const handleWidgetMarqueeSelect = useCallback(
    (ids: string[], opts: { additive: boolean }) => {
      if (ids.length === 0) return;
      if (!opts.additive) {
        const [first, ...rest] = ids;
        setSelectedRoomId(null);
        setAuxSelectedRoomIds([]);
        setSelectedAcZoneId(null);
        setAuxSelectedAcZoneIds([]);
        setSelectedDuctPolyId(null);
        setSelectedDuctPointIndex(null);
        setAuxSelectedDuctPolyIds([]);
        setSelectedWidgetId(first ?? null);
        setAuxSelectedWidgetIds(rest);
        return;
      }
      const s = new Set<string>();
      if (selectedWidgetId) s.add(selectedWidgetId);
      for (const x of auxSelectedWidgetIds) s.add(x);
      for (const x of ids) s.add(x);
      const all = Array.from(s);
      const prim = selectedWidgetId ?? ids[0] ?? all[0] ?? null;
      setSelectedWidgetId(prim);
      setAuxSelectedWidgetIds(all.filter((id) => id !== prim));
    },
    [auxSelectedWidgetIds, selectedWidgetId]
  );

  const handleAcZoneSelect = useCallback((id: string | null, opts?: { additive?: boolean }) => {
    if (id === null) {
      setSelectedAcZoneId(null);
      setAuxSelectedAcZoneIds([]);
      return;
    }
    if (opts?.additive) {
      setAuxSelectedAcZoneIds((prev) => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id);
        else s.add(id);
        return Array.from(s);
      });
    } else {
      setAuxSelectedAcZoneIds([]);
      setSelectedRoomId(null);
      setAuxSelectedRoomIds([]);
      setSelectedWidgetId(null);
      setAuxSelectedWidgetIds([]);
      setSelectedDuctPolyId(null);
      setSelectedDuctPointIndex(null);
      setAuxSelectedDuctPolyIds([]);
    }
    setSelectedAcZoneId(id);
  }, []);

  const roomHighlightIds = useMemo(() => {
    if (!layoutEditMode) return null;
    const s = new Set<string>();
    if (selectedRoomId) s.add(selectedRoomId);
    for (const x of auxSelectedRoomIds) s.add(x);
    return s;
  }, [layoutEditMode, selectedRoomId, auxSelectedRoomIds]);

  const widgetHighlightIds = useMemo(() => {
    if (!layoutEditMode) return null;
    const s = new Set<string>();
    if (selectedWidgetId) s.add(selectedWidgetId);
    for (const x of auxSelectedWidgetIds) s.add(x);
    return s;
  }, [layoutEditMode, selectedWidgetId, auxSelectedWidgetIds]);

  const acZoneHighlightIds = useMemo(() => {
    if (!layoutEditMode) return null;
    const s = new Set<string>();
    if (selectedAcZoneId) s.add(selectedAcZoneId);
    for (const x of auxSelectedAcZoneIds) s.add(x);
    return s;
  }, [layoutEditMode, selectedAcZoneId, auxSelectedAcZoneIds]);

  const ductPolyHighlightIds = useMemo(() => {
    if (!layoutEditMode) return null;
    const s = new Set<string>();
    if (selectedDuctPolyId) s.add(selectedDuctPolyId);
    for (const x of auxSelectedDuctPolyIds) s.add(x);
    return s;
  }, [layoutEditMode, selectedDuctPolyId, auxSelectedDuctPolyIds]);

  useEffect(() => {
    if (!layoutEditMode) {
      setAuxSelectedRoomIds([]);
      setAuxSelectedWidgetIds([]);
      setAuxSelectedAcZoneIds([]);
      setAuxSelectedDuctPolyIds([]);
    }
  }, [layoutEditMode]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const target = pastRef.current.pop()!;
    futureRef.current.push(cloneSceneLayoutDocument(sceneDocRef.current));
    setSceneDoc(target);
    bumpHistoryUi();
  }, [bumpHistoryUi]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const target = futureRef.current.pop()!;
    pastRef.current.push(cloneSceneLayoutDocument(sceneDocRef.current));
    setSceneDoc(target);
    bumpHistoryUi();
  }, [bumpHistoryUi]);

  const canUndo = useMemo(() => {
    void historyRev;
    return pastRef.current.length > 0;
  }, [historyRev]);

  const canRedo = useMemo(() => {
    void historyRev;
    return futureRef.current.length > 0;
  }, [historyRev]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      // 防抖写入草稿 + 兼容旧 v4 key；保存后仅合并当前文档，禁止整表 load — post-save-no-full-refresh.mdc
      saveDraftToStorage(sceneDoc);
      persistSceneToLegacyV4Slot(sceneDoc);
    }, 450);
    return () => window.clearTimeout(t);
  }, [sceneDoc]);

  useEffect(() => {
    try {
      sessionStorage.setItem("aro.dt.legacy32RoomGrid", showLegacy32RoomGrid ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [showLegacy32RoomGrid]);

  const returnToPath = useMemo(() => {
    const st = (location.state as { returnTo?: string } | null)?.returnTo?.trim();
    if (st) return st;
    try {
      const s = sessionStorage.getItem(DIGITAL_TWIN_SCREEN_RETURN_TO_KEY);
      return s?.trim() || null;
    } catch {
      return null;
    }
  }, [location.state, location.key]);

  const handleBack = useCallback(() => {
    try {
      sessionStorage.removeItem(DIGITAL_TWIN_SCREEN_RETURN_TO_KEY);
    } catch {
      /* ignore */
    }
    const target = returnToPath || "/admin";
    void navigate(target, { replace: true });
  }, [navigate, returnToPath]);

  const [ductScene, setDuctScene] = useState<DuctSceneLayout | null>(null);

  useLayoutEffect(() => {
    ductSceneLayoutRef.current = ductScene;
  }, [ductScene]);

  const measure = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const s = viewportPanScaleRef.current.scale || 1;
    const sr = vp.getBoundingClientRect();
    if (sr.width < MIN_SCENE_DIM || sr.height < MIN_SCENE_DIM) {
      if (import.meta.env.DEV && layoutEditModeRef.current) {
        console.warn("[DigitalTwin] measure skipped: viewport CSS rect too small", sr.width, sr.height);
      }
      return;
    }
    /** 编辑态：逻辑板大于视口（可平移工作区）；浏览态仍用 /scale 与既有逆变换一致 */
    const edit = layoutEditModeRef.current;
    const W = edit ? sr.width * EDIT_PLATE_EXTEND_W : sr.width / s;
    const H = edit ? sr.height * EDIT_PLATE_EXTEND_H : sr.height / s;
    if (W < MIN_SCENE_DIM || H < MIN_SCENE_DIM) {
      if (import.meta.env.DEV && layoutEditModeRef.current) {
        console.warn("[DigitalTwin] measure skipped: logical plate too small", W, H);
      }
      return;
    }
    const doc = sceneDocRef.current;
    const plateEl = layoutEditModeRef.current ? vp : layoutPlateRef.current;
    if (!plateEl) return;
    const pr = plateEl.getBoundingClientRect();
    const grid = layoutEditModeRef.current
      ? { x: 0, y: 0, w: W, h: H }
      : {
          x: (pr.left - sr.left) / s,
          y: (pr.top - sr.top) / s,
          w: pr.width / s,
          h: pr.height / s,
        };
    let leftAc: DuctSceneLayout["leftAc"] | undefined;
    let rightAc: DuctSceneLayout["rightAc"] | undefined;
    if (doc.acZones.length >= 2) {
      const lz = doc.acZones.find((z) => z.zone === "left");
      const rz = doc.acZones.find((z) => z.zone === "right");
      if (lz && rz) {
        leftAc = { x: lz.nx * W, y: lz.ny * H, w: lz.nw * W, h: lz.nh * H };
        rightAc = { x: rz.nx * W, y: rz.ny * H, w: rz.nw * W, h: rz.nh * H };
      }
    }
    if (leftAc === undefined || rightAc === undefined) {
      const prev = ductSceneLayoutRef.current;
      if (
        prev &&
        prev.width >= MIN_SCENE_DIM &&
        prev.height >= MIN_SCENE_DIM &&
        prev.leftAc &&
        prev.rightAc
      ) {
        const scaled = scaleDuctSceneAcRects(prev, W, H);
        leftAc = scaled.leftAc;
        rightAc = scaled.rightAc;
      } else {
        const syn = syntheticAcStripsForMeasure(W, H);
        leftAc = syn.leftAc;
        rightAc = syn.rightAc;
      }
    }
    /* ductScene.grid：layoutPlate 相对 viewport 的矩形；逆变换与单一 viewport 见 viewportPlaneTransform / 视口架构计划 */
    setDuctScene({
      width: W,
      height: H,
      leftAc,
      rightAc,
      grid,
      columns: config.grid.columns,
    });
  }, [config.grid.columns]);

  useLayoutEffect(() => {
    measure();
  }, [measure, layoutEditMode, viewport.scale]);

  /** 进入编辑后 flex 提交后再量一次，避免首帧 height 为 0 写入 ductScene — 孪生编辑器稳定性计划 */
  useLayoutEffect(() => {
    if (!layoutEditMode) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) measure();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [layoutEditMode, measure]);

  useLayoutEffect(() => {
    const entering = layoutEditMode && !wasInLayoutEditRef.current;
    wasInLayoutEditRef.current = layoutEditMode;
    if (entering) {
      suppressAutoRoomSeedRef.current = false;
      resetViewport();
    }
  }, [layoutEditMode, resetViewport]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, layoutEditMode]);

  useLayoutEffect(() => {
    if (import.meta.env.DEV && layoutEditMode && ductScene && (ductScene.height < MIN_SCENE_DIM || ductScene.width < MIN_SCENE_DIM)) {
      console.warn("[DigitalTwin] ductScene abnormally small in edit mode", ductScene.width, ductScene.height);
    }
  }, [layoutEditMode, ductScene]);

  /** DEV：编辑板列 offsetHeight 应对齐 ductScene.height；否则 absolute+h-full/% 易塌成细线 */
  useLayoutEffect(() => {
    if (!import.meta.env.DEV || !layoutEditMode || !ductScene) return;
    const col = editPlateColumnRef.current;
    const vpEl = viewportRef.current;
    if (!col || !vpEl) return;
    const colH = col.offsetHeight;
    const roomArea = roomLayoutRoomsAreaMetricsRef.current;
    if (colH + 1 < ductScene.height * 0.9) {
      console.warn("[DigitalTwin][DEV] 编辑板列高度仍明显小于 ductScene.height", {
        colH,
        ductH: ductScene.height,
        roomAreaH: roomArea?.offsetHeight,
        vpH: vpEl.offsetHeight,
      });
    }
    /** 命中用 sceneBoardRef.getBoundingClientRect()；图元用 % of 同一列。若与 ductScene 逻辑宽高不一致则必有选中偏差 */
    /** scale 取自 ref，避免本 effect 依赖项个数与历史版本不一致（React 要求 deps 数组长度恒定） */
    const s = Math.max(viewportPanScaleRef.current.scale, 1e-6);
    const br = col.getBoundingClientRect();
    const logicalWFromBr = br.width / s;
    const logicalHFromBr = br.height / s;
    const dw = Math.abs(logicalWFromBr - ductScene.width);
    const dh = Math.abs(logicalHFromBr - ductScene.height);
    if (dw > 2 || dh > 2) {
      console.warn(
        "[DigitalTwin][DEV] 编辑板 rect/scale 反推与 ductScene 宽高差>2px，易导致 plate 逆变换与 % 定位不一致",
        {
          ductW: ductScene.width,
          ductH: ductScene.height,
          logicalWFromBr,
          logicalHFromBr,
          dw,
          dh,
          scale: viewportPanScaleRef.current.scale,
          br,
        }
      );
    }
    const ow = col.offsetWidth;
    const oh = col.offsetHeight;
    if (Math.abs(ow - ductScene.width) > 2 || Math.abs(oh - ductScene.height) > 2) {
      console.warn("[DigitalTwin][DEV] 编辑板列 offset 尺寸与 ductScene 不一致", {
        ow,
        oh,
        ductW: ductScene.width,
        ductH: ductScene.height,
      });
    }
  }, [layoutEditMode, ductScene, sceneDoc.rooms.length]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      for (const n of e.composedPath()) {
        if (n instanceof HTMLElement && n.classList.contains("dt-ctx-menu-scroll")) return;
      }
      if (e.shiftKey) {
        e.preventDefault();
        window.clearTimeout(zoomIdleTimerRef.current);
        setViewportIx("panning");
        zoomIdleTimerRef.current = window.setTimeout(() => setViewportIx("idle"), 200);
        setViewport((v) => ({ ...v, panX: v.panX - e.deltaY * 0.65 }));
        return;
      }
      e.preventDefault();
      window.clearTimeout(zoomIdleTimerRef.current);
      setViewportIx("zooming");
      zoomIdleTimerRef.current = window.setTimeout(() => setViewportIx("idle"), 200);
      const r = el.getBoundingClientRect();
      setViewport((v) => {
        const s0 = v.scale;
        const factor = Math.exp(-e.deltaY * 0.0014);
        const s1 = Math.min(VIEWPORT_SCALE_MAX, Math.max(VIEWPORT_SCALE_MIN, s0 * factor));
        if (Math.abs(s1 - s0) < 1e-12) return v;
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        const panX1 = mx - (s1 / s0) * (mx - v.panX);
        const panY1 = my - (s1 / s0) * (my - v.panY);
        return { scale: s1, panX: panX1, panY: panY1 };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(zoomIdleTimerRef.current);
    };
  }, [layoutEditMode, ductScene?.width]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pd = panDragRef.current;
      if (!pd) return;
      const dx = e.clientX - pd.lastX;
      const dy = e.clientY - pd.lastY;
      panDragRef.current = { lastX: e.clientX, lastY: e.clientY };
      setViewport((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
      setViewportIx("panning");
    };
    const onUp = () => {
      if (panDragRef.current) {
        panDragRef.current = null;
        setViewportIx("idle");
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  useEffect(() => {
    if (!layoutEditMode) return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      e.preventDefault();
      spaceDownRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      spaceDownRef.current = false;
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [layoutEditMode]);

  /** 场景内已有风管折线则始终按折线渲染；勿依赖「自定义管」勾选，否则编辑内画管后退出浏览会误走内置 computeDuctChannels */
  const showCustomDucts = sceneDoc.ducts.length > 0;
  const showFreeformView = useCustomRooms && sceneDoc.rooms.length > 0 && !layoutEditMode;
  /** 无自定义房间布局时仍展示显示框等（不强制 32 宫格） */
  const showBrowsingSceneOverlay = !layoutEditMode && !showFreeformView && !showLegacy32RoomGrid;

  /** 图元 plate 坐标 → scene 画布百分比；与 SceneEditSurface / measure(grid) 一致 */
  const widgetSceneMetrics = useMemo(
    () =>
      ductScene ? { width: ductScene.width, height: ductScene.height, grid: ductScene.grid } : null,
    [ductScene]
  );

  /** 浏览态：避免 layoutPlate 内 flex-1 把图元容器拉高，导致 % 定位与 plate 命中（ductScene 高）不一致 */
  const browsingPlateCenterLayout = !layoutEditMode && (showBrowsingSceneOverlay || showFreeformView);

  const twinWinccPollEnabled =
    sceneDoc.widgets.length > 0 &&
    !!ductScene &&
    (layoutEditMode || showFreeformView || showBrowsingSceneOverlay);
  const { valueByName: twinWinccValues, winccEnabled: twinWinccOn, lastError: twinWinccErr, refreshNow: twinWinccRefreshNow } =
    useTwinWinccWidgetValues(sceneDoc.widgets, twinWinccPollEnabled);
  const twinWinccHint = !twinWinccOn ? "WinCC 未启用" : twinWinccErr || null;

  const { executeWrite: executeDtWidgetWinccWrite, busyWidgetId: dtWidgetWriteBusyId } = useDtWidgetWinccWrite(twinWinccRefreshNow);

  const onBrowseDtWidgetCommand = useCallback(
    (w: DtSceneWidget) => {
      void executeDtWidgetWinccWrite(w, twinWinccValues);
    },
    [executeDtWidgetWinccWrite, twinWinccValues]
  );

  const onViewportPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 1) {
      e.preventDefault();
      panDragRef.current = { lastX: e.clientX, lastY: e.clientY };
      setViewportIx("panning");
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    if (e.button === 0 && spaceDownRef.current) {
      e.preventDefault();
      panDragRef.current = { lastX: e.clientX, lastY: e.clientY };
      setViewportIx("panning");
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const editorSession = useDigitalTwinEditorSession({
    layoutEditMode,
    viewportInteraction: viewportIx,
    boardPlanTilt: sceneDoc.boardPresentation === "planTilt",
    selection: {
      kind: selectedWidgetId ? "widget" : selectedRoomId ? "room" : selectedAcZoneId ? "ac" : selectedDuctPolyId ? "duct" : "none",
    },
    twinWinccEnabled: twinWinccOn,
    twinWinccPollEnabled,
    twinWinccError: twinWinccErr,
  });

  const selectedWidget = useMemo(
    () => sceneDoc.widgets.find((w) => w.id === selectedWidgetId) ?? null,
    [sceneDoc.widgets, selectedWidgetId]
  );

  const selectedAcZone = useMemo(
    () => sceneDoc.acZones.find((z) => z.id === selectedAcZoneId) ?? null,
    [sceneDoc.acZones, selectedAcZoneId]
  );

  const zoneColumnBinding = useMemo((): DuctZoneColumnBinding | null => {
    if (sceneDoc.acZones.length < 2) return null;
    const lz = sceneDoc.acZones.find((z) => z.zone === "left");
    const rz = sceneDoc.acZones.find((z) => z.zone === "right");
    if (!lz || !rz) return null;
    return {
      left: { from: lz.columnFrom, to: lz.columnTo },
      right: { from: rz.columnFrom, to: rz.columnTo },
    };
  }, [sceneDoc.acZones]);

  const ductChannels = useMemo(() => {
    if (!ductScene) return [];
    const colW = ductScene.grid.w / Math.max(1, ductScene.columns);
    const hw = Math.min(config.layout.ductChannelHalfWidthPx, colW * 0.34);
    const lift = config.layout.ductHeightVisualLiftPx;
    if (showCustomDucts) {
      return customPolylinesToChannels(sceneDoc.ducts, ductScene.width, ductScene.height, hw, lift);
    }
    /** 清空风管后须关闭 computeDuctChannels 装饰层，否则 DtDuctSvg 仍在画布且不可选中（命中仅 sceneDoc.ducts） */
    if (sceneDoc.suppressBuiltInDuctSvg === true) {
      return [];
    }
    return computeDuctChannels(ductScene, hw, zoneColumnBinding ?? undefined);
  }, [
    ductScene,
    config.layout.ductChannelHalfWidthPx,
    config.layout.ductHeightVisualLiftPx,
    sceneDoc.ducts,
    sceneDoc.suppressBuiltInDuctSvg,
    showCustomDucts,
    zoneColumnBinding,
  ]);

  const seedDefaultAcZones = useCallback(() => {
    const ds = ductScene;
    if (!ds || ds.width < MIN_SCENE_DIM || ds.height < MIN_SCENE_DIM) return;
    pushUndoDiscrete();
    setSceneDoc((d) => ({ ...d, acZones: seedAcZonesFromDuctScene(ds) }));
    setSelectedAcZoneId(null);
    setAuxSelectedAcZoneIds([]);
  }, [ductScene, pushUndoDiscrete]);

  const seedStandardRoomGridLayout = useCallback(() => {
    const ds = ductScene;
    if (!ds || ds.grid.w < 1 || ds.grid.h < 1) return;
    const curRooms = sceneDocRef.current.rooms.length;
    if (curRooms > 0 && !window.confirm("将用标准列×行房间网格覆盖当前自定义房间，是否继续？")) return;
    if (curRooms === 0 && !window.confirm(`按 ${config.grid.columns}×${config.grid.rows} 在画布上生成房间网格？`)) return;
    pushUndoDiscrete();
    const gapPx = sceneDocRef.current.roomGapPx ?? config.layout.roomGridGapPx ?? 8;
    const rooms = buildDefaultRoomLayout(ds.grid.w, ds.grid.h, config.grid.columns, config.grid.rows, gapPx);
    setSceneDoc((d) => ({ ...d, rooms }));
    setUseCustomRooms(true);
    setSelectedRoomId(null);
    setAuxSelectedRoomIds([]);
    setSelectedWidgetId(null);
    setAuxSelectedWidgetIds([]);
  }, [ductScene, config.grid.columns, config.grid.rows, config.layout.roomGridGapPx, pushUndoDiscrete]);

  const themeStyle = useMemo(() => digitalTwinThemeStyleVars(config), [config]);

  const onDuctsChange = useCallback((next: SceneLayoutDocumentV4["ducts"]) => {
    // 保存后仅合并 ducts，禁止整表 load — post-save-no-full-refresh.mdc
    setSceneDoc((d) => ({ ...d, ducts: next }));
  }, []);

  const onRoomsChange = useCallback((next: SceneLayoutDocumentV4["rooms"]) => {
    // 保存后仅合并 rooms，禁止整表 load — post-save-no-full-refresh.mdc
    setSceneDoc((d) => ({ ...d, rooms: next }));
  }, []);

  const onWidgetsChange = useCallback((next: DtSceneWidget[]) => {
    // 保存后仅合并 widgets，禁止整表 load — post-save-no-full-refresh.mdc
    setSceneDoc((d) => ({ ...d, widgets: next }));
  }, []);

  const onAcZonesChange = useCallback((next: DtAcZoneDoc[]) => {
    // 保存后仅合并 acZones，禁止整表 load — post-save-no-full-refresh.mdc
    setSceneDoc((d) => ({ ...d, acZones: next }));
  }, []);

  const onAcZoneDetailsChange = useCallback((next: DtAcZoneDoc) => {
    setSceneDoc((d) => ({
      ...d,
      acZones: d.acZones.map((z) => {
        if (z.id !== next.id) return z;
        let cf = next.columnFrom;
        let ct = next.columnTo;
        if (cf > ct) [cf, ct] = [ct, cf];
        return { ...next, columnFrom: cf, columnTo: ct };
      }),
    }));
  }, []);

  const clearDuctsOnly = useCallback(() => {
    pushUndoDiscrete();
    // 保存后仅合并 ducts + 示意层开关，禁止整表 load — post-save-no-full-refresh.mdc
    setSceneDoc((d) => ({ ...d, ducts: [], suppressBuiltInDuctSvg: true }));
    setUseCustomDucts(false);
  }, [pushUndoDiscrete]);

  const clearRoomsOnly = useCallback(() => {
    pushUndoDiscrete();
    suppressAutoRoomSeedRef.current = true;
    setSceneDoc((d) => ({ ...d, rooms: [] }));
    setUseCustomRooms(false);
    setSelectedRoomId(null);
    setAuxSelectedRoomIds([]);
  }, [pushUndoDiscrete]);

  const clearAllLayout = useCallback(() => {
    if (!window.confirm("清空风管、房间与显示框自定义布局？此操作不可撤销。")) return;
    resetViewport();
    const empty = emptyLayoutResetV4();
    pastRef.current = [];
    futureRef.current = [];
    suppressAutoRoomSeedRef.current = false;
    bumpHistoryUi();
    setSceneDoc(empty);
    setUseCustomDucts(false);
    setUseCustomRooms(false);
    setLayoutEditMode(false);
    setSelectedRoomId(null);
    setAuxSelectedRoomIds([]);
    setSelectedWidgetId(null);
    setAuxSelectedWidgetIds([]);
    setSelectedAcZoneId(null);
    setAuxSelectedAcZoneIds([]);
    setSelectedDuctPolyId(null);
    setSelectedDuctPointIndex(null);
    setAuxSelectedDuctPolyIds([]);
    clearDraftFromStorage();
    saveSceneLayoutToStorage(empty);
  }, [bumpHistoryUi, resetViewport]);

  const clearCanvasInEdit = useCallback(() => {
    if (!layoutEditMode) return;
    if (!window.confirm("清空画布上的风管、房间、显示框与空调区？撤销栈将重置，仍停留在编辑模式。")) return;
    resetViewport();
    const empty = emptyLayoutResetV4();
    pastRef.current = [];
    futureRef.current = [];
    bumpHistoryUi();
    setSceneDoc(empty);
    setUseCustomDucts(false);
    setUseCustomRooms(false);
    setSelectedRoomId(null);
    setAuxSelectedRoomIds([]);
    setAuxSelectedWidgetIds([]);
    setAuxSelectedAcZoneIds([]);
    setAuxSelectedDuctPolyIds([]);
    setSelectedWidgetId(null);
    setSelectedAcZoneId(null);
    setSelectedDuctPolyId(null);
    setSelectedDuctPointIndex(null);
    clearDraftFromStorage();
    saveSceneLayoutToStorage(empty);
  }, [bumpHistoryUi, layoutEditMode, resetViewport]);

  const cycleSelectedRoomRotation = useCallback(() => {
    if (!selectedRoomId) return;
    pushUndoDiscrete();
    setSceneDoc((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) =>
        r.roomId === selectedRoomId ? { ...r, rotationDeg: nextRoomRotation(r.rotationDeg) } : r
      ),
    }));
  }, [selectedRoomId, pushUndoDiscrete]);

  const onDuctSelectionChange = useCallback(
    (polyId: string | null, pointIndex: number | null, opts?: { additive?: boolean }) => {
      if (polyId !== null && pointIndex !== null) {
        setSelectedRoomId(null);
        setAuxSelectedRoomIds([]);
        setSelectedWidgetId(null);
        setAuxSelectedWidgetIds([]);
        setSelectedAcZoneId(null);
        setAuxSelectedAcZoneIds([]);
        setAuxSelectedDuctPolyIds([]);
        setSelectedDuctPolyId(polyId);
        setSelectedDuctPointIndex(pointIndex);
        return;
      }
      if (polyId === null && pointIndex === null) {
        setSelectedDuctPolyId(null);
        setSelectedDuctPointIndex(null);
        if (!opts?.additive) setAuxSelectedDuctPolyIds([]);
        return;
      }
      if (polyId !== null && pointIndex === null) {
        if (!opts?.additive) {
          setAuxSelectedDuctPolyIds([]);
          setSelectedRoomId(null);
          setAuxSelectedRoomIds([]);
          setSelectedWidgetId(null);
          setAuxSelectedWidgetIds([]);
          setSelectedAcZoneId(null);
          setAuxSelectedAcZoneIds([]);
        } else {
          setAuxSelectedDuctPolyIds((prev) => {
            const s = new Set(prev);
            if (s.has(polyId)) s.delete(polyId);
            else s.add(polyId);
            return Array.from(s);
          });
        }
        setSelectedDuctPolyId(polyId);
        setSelectedDuctPointIndex(null);
      }
    },
    []
  );

  useEffect(() => {
    if (!layoutEditMode) {
      setSelectedDuctPolyId(null);
      setSelectedDuctPointIndex(null);
      setSelectedWidgetId(null);
      setSelectedAcZoneId(null);
    }
  }, [layoutEditMode]);

  const addDuctPolyline = useCallback(() => {
    pushUndoDiscrete();
    const id = newPolylineId();
    setSceneDoc((d) => {
      const col = d.ducts.length % 4;
      return {
        ...d,
        ducts: [
          ...cloneDuctsForEdit(d.ducts),
          {
            id,
            columnIndex: col,
            points: [
              { id: newPointId(), x: 0.22, y: 0.32, h: 0 },
              { id: newPointId(), x: 0.55, y: 0.38, h: 0 },
              { id: newPointId(), x: 0.78, y: 0.55, h: 0 },
            ],
          },
        ],
      };
    });
    setSelectedDuctPolyId(id);
    setSelectedDuctPointIndex(1);
  }, [pushUndoDiscrete]);

  const deleteSelectedDuctPolyline = useCallback(() => {
    if (!selectedDuctPolyId) return;
    pushUndoDiscrete();
    setSceneDoc((d) => ({
      ...d,
      ducts: cloneDuctsForEdit(d.ducts).filter((p) => p.id !== selectedDuctPolyId),
    }));
    setSelectedDuctPolyId(null);
    setSelectedDuctPointIndex(null);
  }, [selectedDuctPolyId, pushUndoDiscrete]);

  const removeDuctVertexAt = useCallback(
    (polyId: string, idx: number) => {
      pushUndoDiscrete();
      const pl0 = sceneDocRef.current.ducts.find((p) => p.id === polyId);
      const oldLen = pl0?.points.length ?? 0;
      if (oldLen <= 2) {
        setSceneDoc((d) => ({
          ...d,
          ducts: cloneDuctsForEdit(d.ducts).filter((p) => p.id !== polyId),
        }));
        setSelectedDuctPolyId(null);
        setSelectedDuctPointIndex(null);
        setAuxSelectedDuctPolyIds((prev) => prev.filter((id) => id !== polyId));
        return;
      }
      setSceneDoc((d) => {
        const next = cloneDuctsForEdit(d.ducts);
        const pl = next.find((p) => p.id === polyId);
        if (!pl) return d;
        pl.points.splice(idx, 1);
        return { ...d, ducts: next };
      });
      setSelectedDuctPointIndex(Math.min(idx, oldLen - 2));
    },
    [pushUndoDiscrete]
  );

  const deleteSelectedDuctVertex = useCallback(() => {
    if (!selectedDuctPolyId || selectedDuctPointIndex === null) return;
    removeDuctVertexAt(selectedDuctPolyId, selectedDuctPointIndex);
  }, [removeDuctVertexAt, selectedDuctPolyId, selectedDuctPointIndex]);

  const onDuctChangeColumn = useCallback(
    (polyId: string, columnIndex: number) => {
      pushUndoDiscrete();
      setSceneDoc((d) => {
        const next = cloneDuctsForEdit(d.ducts);
        const pl = next.find((p) => p.id === polyId);
        if (pl) pl.columnIndex = Math.max(0, Math.min(3, columnIndex));
        return { ...d, ducts: next };
      });
    },
    [pushUndoDiscrete]
  );

  const onChangeDuctSelectedH = useCallback(
    (h01: number) => {
      if (!selectedDuctPolyId || selectedDuctPointIndex === null) return;
      setSceneDoc((d) => {
        const next = cloneDuctsForEdit(d.ducts);
        const pl = next.find((p) => p.id === selectedDuctPolyId);
        if (!pl || !pl.points[selectedDuctPointIndex]) return d;
        pl.points[selectedDuctPointIndex] = { ...pl.points[selectedDuctPointIndex]!, h: clamp01(h01) };
        return { ...d, ducts: next };
      });
    },
    [selectedDuctPolyId, selectedDuctPointIndex]
  );

  const onRoomRotateFromSurface = useCallback(
    (roomId: string) => {
      pushUndoDiscrete();
      setSceneDoc((prev) => ({
        ...prev,
        rooms: prev.rooms.map((r) =>
          r.roomId === roomId ? { ...r, rotationDeg: nextRoomRotation(r.rotationDeg) } : r
        ),
      }));
    },
    [pushUndoDiscrete]
  );

  const onClearRoomSelection = useCallback(() => {
    setSelectedRoomId(null);
    setAuxSelectedRoomIds([]);
  }, []);

  const deleteRoomById = useCallback(
    (roomId: string) => {
      pushUndoDiscrete();
      setSceneDoc((d) => ({ ...d, rooms: d.rooms.filter((r) => r.roomId !== roomId) }));
      setSelectedRoomId((cur) => (cur === roomId ? null : cur));
      setAuxSelectedRoomIds((prev) => prev.filter((id) => id !== roomId));
    },
    [pushUndoDiscrete]
  );

  const duplicateRoomById = useCallback(
    (roomId: string) => {
      pushUndoDiscrete();
      const newId = `room-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      setSceneDoc((d) => {
        const r = d.rooms.find((x) => x.roomId === roomId);
        if (!r) return d;
        let nx = clamp01(r.nx + 0.04);
        let ny = clamp01(r.ny + 0.04);
        const c = clampRoomTopLeftToPlate(nx, ny, r.nw, r.nh, r.rotationDeg);
        const copy = { ...r, roomId: newId, nx: c.nx, ny: c.ny };
        return { ...d, rooms: [...d.rooms, copy] };
      });
      setSelectedRoomId(newId);
      setAuxSelectedRoomIds([]);
    },
    [pushUndoDiscrete]
  );

  const duplicateSelectedRooms = useCallback(() => {
    const targets = new Set<string>();
    if (selectedRoomId) targets.add(selectedRoomId);
    for (const id of auxSelectedRoomIds) targets.add(id);
    if (targets.size === 0) return;
    pushUndoDiscrete();
    setSceneDoc((d) => {
      let next = d.rooms.slice();
      for (const roomId of targets) {
        const r = next.find((x) => x.roomId === roomId);
        if (!r) continue;
        const rid = `room-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
        let nx = clamp01(r.nx + 0.04);
        let ny = clamp01(r.ny + 0.04);
        const c = clampRoomTopLeftToPlate(nx, ny, r.nw, r.nh, r.rotationDeg);
        next = [...next, { ...r, roomId: rid, nx: c.nx, ny: c.ny }];
      }
      return { ...d, rooms: next };
    });
  }, [selectedRoomId, auxSelectedRoomIds, pushUndoDiscrete]);

  const nudgeSelectedRoomsByDelta = useCallback(
    (dxNorm: number, dyNorm: number) => {
      const targets = new Set<string>();
      if (selectedRoomId) targets.add(selectedRoomId);
      for (const id of auxSelectedRoomIds) targets.add(id);
      if (targets.size === 0) return;
      pushUndoDiscrete();
      setSceneDoc((prev) => {
        const rooms = prev.rooms.map((r) => ({ ...r }));
        for (const roomId of targets) {
          const idx = rooms.findIndex((r) => r.roomId === roomId);
          if (idx < 0) continue;
          const r = rooms[idx]!;
          let nx = r.nx + dxNorm;
          let ny = r.ny + dyNorm;
          if (config.layout.roomLayoutSnapGrid > 0) {
            const sg = snapGrid(nx, ny, config.layout.roomLayoutSnapGrid);
            nx = sg.x;
            ny = sg.y;
          }
          const c = clampRoomTopLeftToPlate(nx, ny, r.nw, r.nh, r.rotationDeg);
          rooms[idx] = { ...r, nx: c.nx, ny: c.ny };
        }
        return { ...prev, rooms };
      });
    },
    [selectedRoomId, auxSelectedRoomIds, pushUndoDiscrete, config.layout.roomLayoutSnapGrid]
  );

  const nudgeSelectedWidgetsByDelta = useCallback(
    (dxNorm: number, dyNorm: number) => {
      const targets = new Set<string>();
      if (selectedWidgetId) targets.add(selectedWidgetId);
      for (const id of auxSelectedWidgetIds) targets.add(id);
      if (targets.size === 0) return;
      pushUndoDiscrete();
      setSceneDoc((prev) => ({
        ...prev,
        widgets: prev.widgets.map((w) => {
          if (!targets.has(w.id)) return w;
          const nx = w.nx + dxNorm;
          const ny = w.ny + dyNorm;
          const c = clampRoomTopLeftToPlate(nx, ny, w.nw, w.nh, 0);
          return { ...w, nx: c.nx, ny: c.ny };
        }),
      }));
    },
    [selectedWidgetId, auxSelectedWidgetIds, pushUndoDiscrete]
  );

  const nudgeSelectedAcZonesByDelta = useCallback(
    (dxNorm: number, dyNorm: number) => {
      const targets = new Set<string>();
      if (selectedAcZoneId) targets.add(selectedAcZoneId);
      for (const id of auxSelectedAcZoneIds) targets.add(id);
      if (targets.size === 0) return;
      pushUndoDiscrete();
      setSceneDoc((prev) => ({
        ...prev,
        acZones: prev.acZones.map((z) => {
          if (!targets.has(z.id)) return z;
          let nx = clamp01(z.nx + dxNorm);
          let ny = clamp01(z.ny + dyNorm);
          if (nx + z.nw > 1) nx = 1 - z.nw;
          if (ny + z.nh > 1) ny = 1 - z.nh;
          return { ...z, nx, ny };
        }),
      }));
    },
    [selectedAcZoneId, auxSelectedAcZoneIds, pushUndoDiscrete]
  );

  const nudgeSelectedDuctPolylinesByDelta = useCallback(
    (dxNorm: number, dyNorm: number) => {
      const targets = new Set<string>();
      if (selectedDuctPolyId) targets.add(selectedDuctPolyId);
      for (const id of auxSelectedDuctPolyIds) targets.add(id);
      if (targets.size === 0) return;
      pushUndoDiscrete();
      setSceneDoc((d) => {
        const next = cloneDuctsForEdit(d.ducts);
        for (const pl of next) {
          if (!targets.has(pl.id)) continue;
          for (const p of pl.points) {
            p.x = clamp01(p.x + dxNorm);
            p.y = clamp01(p.y + dyNorm);
          }
        }
        return { ...d, ducts: next };
      });
    },
    [selectedDuctPolyId, auxSelectedDuctPolyIds, pushUndoDiscrete]
  );

  const nudgeCurrentSelectionByDelta = useCallback(
    (dxNorm: number, dyNorm: number) => {
      if (selectedDuctPolyId || auxSelectedDuctPolyIds.length > 0) {
        nudgeSelectedDuctPolylinesByDelta(dxNorm, dyNorm);
      } else if (selectedWidgetId || auxSelectedWidgetIds.length > 0) {
        nudgeSelectedWidgetsByDelta(dxNorm, dyNorm);
      } else if (selectedAcZoneId || auxSelectedAcZoneIds.length > 0) {
        nudgeSelectedAcZonesByDelta(dxNorm, dyNorm);
      } else {
        nudgeSelectedRoomsByDelta(dxNorm, dyNorm);
      }
    },
    [
      selectedDuctPolyId,
      auxSelectedDuctPolyIds,
      nudgeSelectedDuctPolylinesByDelta,
      selectedWidgetId,
      auxSelectedWidgetIds,
      nudgeSelectedWidgetsByDelta,
      selectedAcZoneId,
      auxSelectedAcZoneIds,
      nudgeSelectedAcZonesByDelta,
      nudgeSelectedRoomsByDelta,
    ]
  );

  const selectionNudgeDisabled =
    !selectedRoomId &&
    auxSelectedRoomIds.length === 0 &&
    !selectedWidgetId &&
    auxSelectedWidgetIds.length === 0 &&
    !selectedAcZoneId &&
    auxSelectedAcZoneIds.length === 0 &&
    !selectedDuctPolyId &&
    auxSelectedDuctPolyIds.length === 0;

  useEffect(() => {
    if (!layoutEditMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (!layoutEditMode) return;
      const t0 = e.target;
      if (t0 instanceof HTMLInputElement || t0 instanceof HTMLTextAreaElement || t0 instanceof HTMLSelectElement) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        copySelectionToClipboardRef.current?.();
        return;
      }
      if (mod && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        cutSelectionToClipboardRef.current?.();
        return;
      }
      if (mod && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        void pasteFromClipboardRef.current?.();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (e.key === "Backspace" && mod) return;
        e.preventDefault();
        deleteMultiSelectionRef.current?.();
        return;
      }

      if (!mod && !e.altKey) {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
          if (selectionNudgeDisabled) return;
          e.preventDefault();
          const step =
            config.layout.roomLayoutSnapGrid > 0 ? config.layout.roomLayoutSnapGrid : 0.015625;
          let dx = 0;
          let dy = 0;
          if (e.key === "ArrowLeft") dx = -step;
          else if (e.key === "ArrowRight") dx = step;
          else if (e.key === "ArrowUp") dy = -step;
          else if (e.key === "ArrowDown") dy = step;
          nudgeCurrentSelectionByDelta(dx, dy);
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    layoutEditMode,
    selectionNudgeDisabled,
    nudgeCurrentSelectionByDelta,
    config.layout.roomLayoutSnapGrid,
    undo,
    redo,
  ]);

  const deleteDuctPolylineById = useCallback(
    (polyId: string) => {
      pushUndoDiscrete();
      setSceneDoc((d) => ({
        ...d,
        ducts: cloneDuctsForEdit(d.ducts).filter((p) => p.id !== polyId),
      }));
      setSelectedDuctPolyId((cur) => (cur === polyId ? null : cur));
      setSelectedDuctPointIndex(null);
      setAuxSelectedDuctPolyIds((prev) => prev.filter((id) => id !== polyId));
    },
    [pushUndoDiscrete]
  );

  const duplicateDuctPolylineById = useCallback(
    (polyId: string) => {
      pushUndoDiscrete();
      setSceneDoc((d) => {
        const pl = d.ducts.find((p) => p.id === polyId);
        if (!pl) return d;
        const base = cloneDuctsForEdit(d.ducts);
        const dup: DuctPlanPolyline = {
          id: newPolylineId(),
          columnIndex: pl.columnIndex,
          points: pl.points.map((p) => ({
            id: newPointId(),
            x: clamp01(p.x + 0.05),
            y: clamp01(p.y + 0.05),
            h: p.h,
          })),
        };
        return { ...d, ducts: [...base, dup] };
      });
    },
    [pushUndoDiscrete]
  );

  const duplicateWidgetById = useCallback(
    (widgetId: string) => {
      const nid = `widget-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      pushUndoDiscrete();
      setSceneDoc((d) => {
        const w = d.widgets.find((x) => x.id === widgetId);
        if (!w) return d;
        const nw: DtSceneWidget = {
          ...w,
          id: nid,
          nx: clamp01(w.nx + 0.04),
          ny: clamp01(w.ny + 0.04),
        };
        return { ...d, widgets: [...d.widgets, nw] };
      });
      setSelectedWidgetId(nid);
      setSelectedRoomId(null);
      setAuxSelectedRoomIds([]);
      setSelectedAcZoneId(null);
    },
    [pushUndoDiscrete]
  );

  const duplicateSelectedWidget = useCallback(() => {
    if (!selectedWidgetId) return;
    duplicateWidgetById(selectedWidgetId);
  }, [selectedWidgetId, duplicateWidgetById]);

  const duplicateCurrentSelection = useCallback(() => {
    if (selectedDuctPolyId) duplicateDuctPolylineById(selectedDuctPolyId);
    else if (selectedWidgetId) duplicateSelectedWidget();
    else duplicateSelectedRooms();
  }, [selectedDuctPolyId, selectedWidgetId, duplicateDuctPolylineById, duplicateSelectedWidget, duplicateSelectedRooms]);

  const appendWidgetToScene = useCallback(
    (build: (at: { nx: number; ny: number }) => DtSceneWidget | null) => {
      pushUndoDiscrete();
      const k = sceneDocRef.current.widgets.length;
      const dxy = Math.min(0.18, k * 0.01);
      const at = { nx: clamp01(0.08 + dxy), ny: clamp01(0.08 + dxy) };
      const w0 = build(at);
      if (!w0) return;
      const lids = sceneDocRef.current.widgetStackLayers;
      const fallback = lids[lids.length - 1]?.id ?? DEFAULT_WIDGET_STACK_LAYER_ID;
      const layerId = lids.some((l) => l.id === activeWidgetStackLayerId) ? activeWidgetStackLayerId : fallback;
      const w: DtSceneWidget = { ...w0, stackLayerId: layerId };
      setSceneDoc((d) => ({ ...d, widgets: [...d.widgets, w] }));
      setSelectedWidgetId(w.id);
      setAuxSelectedWidgetIds([]);
      setSelectedAcZoneId(null);
      setAuxSelectedAcZoneIds([]);
      setSelectedRoomId(null);
      setAuxSelectedRoomIds([]);
      setSelectedDuctPolyId(null);
      setSelectedDuctPointIndex(null);
      setAuxSelectedDuctPolyIds([]);
    },
    [activeWidgetStackLayerId, pushUndoDiscrete]
  );

  const addWidgetFromPreset = useCallback(
    (preset: DtWidgetPalettePresetId) => {
      appendWidgetToScene((at) => createWidgetFromPalettePreset(preset, at));
    },
    [appendWidgetToScene]
  );

  const addShapeFromCatalog = useCallback(
    (itemId: string) => {
      appendWidgetToScene((at) => createWidgetFromShapeCatalogItem(itemId, at));
    },
    [appendWidgetToScene]
  );

  const addCustomGraphicFromSidebar = useCallback(
    (payload: { displayName: string; asset: DtWidgetGraphicAsset; plate: { nw: number; nh: number } }) => {
      appendWidgetToScene((at) =>
        createCustomGraphicWidget({
          displayName: payload.displayName,
          asset: payload.asset,
          at,
          plate: payload.plate,
        })
      );
    },
    [appendWidgetToScene]
  );

  const addGraphicFromLibraryById = useCallback(
    (libraryId: string) => {
      void (async () => {
        const row = await dtGraphicLibraryGet(libraryId);
        if (!row) {
          window.alert("素材不存在或已删除");
          return;
        }
        let plate: { nw: number; nh: number };
        if (row.mime === "image/svg+xml") {
          plate = defaultPlateForCustomIconImage(0, 0);
        } else {
          const dims = await measureRasterFromDataUrl(row.dataUrl);
          plate = dims ? defaultPlateForCustomIconImage(dims.w, dims.h) : defaultPlateForCustomIconImage(0, 0);
        }
        appendWidgetToScene((at) =>
          createCustomGraphicWidgetFromLibrary({
            displayName: row.name || "图片",
            mime: row.mime,
            graphicLibraryAssetId: row.id,
            name: row.name,
            at,
            plate,
          })
        );
      })();
    },
    [appendWidgetToScene]
  );

  const updateWidgetFromDetails = useCallback((w: DtSceneWidget) => {
    setSceneDoc((d) => ({
      ...d,
      widgets: d.widgets.map((x) => (x.id === w.id ? w : x)),
    }));
  }, []);

  const deleteWidgetById = useCallback(
    (id: string) => {
      pushUndoDiscrete();
      setSceneDoc((d) => ({ ...d, widgets: d.widgets.filter((w) => w.id !== id) }));
      setSelectedWidgetId((cur) => (cur === id ? null : cur));
      setAuxSelectedWidgetIds((prev) => prev.filter((x) => x !== id));
    },
    [pushUndoDiscrete]
  );

  const cloneRoom = (r: RoomLayoutEntry): RoomLayoutEntry => JSON.parse(JSON.stringify(r)) as RoomLayoutEntry;
  const cloneWidget = (w: DtSceneWidget): DtSceneWidget => ({
    ...w,
    bindings: w.bindings.map((b) => ({ ...b })),
  });

  const buildClipboardBundleFromHit = useCallback((hit: SceneEditContextMenuHit): DtEditorClipboardBundleV2 => {
    const d = sceneDocRef.current;
    switch (hit.kind) {
      case "room": {
        const r = d.rooms.find((x) => x.roomId === hit.roomId);
        return r ? { v: 2, rooms: [cloneRoom(r)], widgets: [], ducts: [] } : emptyClipboardBundle();
      }
      case "widget": {
        const w = d.widgets.find((x) => x.id === hit.widgetId);
        return w ? { v: 2, rooms: [], widgets: [cloneWidget(w)], ducts: [] } : emptyClipboardBundle();
      }
      case "duct_poly":
      case "duct_vertex": {
        const pl = d.ducts.find((p) => p.id === hit.polyId);
        return pl
          ? { v: 2, rooms: [], widgets: [], ducts: [cloneDuctsForEdit([pl])[0]!] }
          : emptyClipboardBundle();
      }
      case "canvas":
      case "ac_zone":
        return emptyClipboardBundle();
      default:
        return emptyClipboardBundle();
    }
  }, []);

  const buildClipboardBundleFromSelection = useCallback((): DtEditorClipboardBundleV2 => {
    const d = sceneDocRef.current;
    const rooms: RoomLayoutEntry[] = [];
    const rs = new Set<string>();
    if (selectedRoomId) rs.add(selectedRoomId);
    for (const id of auxSelectedRoomIds) rs.add(id);
    for (const id of rs) {
      const r = d.rooms.find((x) => x.roomId === id);
      if (r) rooms.push(cloneRoom(r));
    }
    const widgets: DtSceneWidget[] = [];
    const ws = new Set<string>();
    if (selectedWidgetId) ws.add(selectedWidgetId);
    for (const id of auxSelectedWidgetIds) ws.add(id);
    for (const id of ws) {
      const w = d.widgets.find((x) => x.id === id);
      if (w) widgets.push(cloneWidget(w));
    }
    const ducts: DuctPlanPolyline[] = [];
    const ps = new Set<string>();
    if (selectedDuctPolyId) ps.add(selectedDuctPolyId);
    for (const id of auxSelectedDuctPolyIds) ps.add(id);
    for (const id of ps) {
      const pl = d.ducts.find((p) => p.id === id);
      if (pl) ducts.push(cloneDuctsForEdit([pl])[0]!);
    }
    return { v: 2, rooms, widgets, ducts };
  }, [selectedRoomId, auxSelectedRoomIds, selectedWidgetId, auxSelectedWidgetIds, selectedDuctPolyId, auxSelectedDuctPolyIds]);

  const writeClipboardJson = useCallback(async (bundle: DtEditorClipboardBundleV2) => {
    const s = JSON.stringify(bundle);
    clipboardBundleRef.current = bundle;
    try {
      await navigator.clipboard.writeText(s);
    } catch {
      /* ignore */
    }
  }, []);

  const copySelectionToClipboard = useCallback(async () => {
    const b = buildClipboardBundleFromSelection();
    if (b.rooms.length === 0 && b.widgets.length === 0 && b.ducts.length === 0) return;
    await writeClipboardJson(b);
  }, [buildClipboardBundleFromSelection, writeClipboardJson]);

  const copyHitToClipboard = useCallback(
    async (hit: SceneEditContextMenuHit) => {
      const b = buildClipboardBundleFromHit(hit);
      if (b.rooms.length === 0 && b.widgets.length === 0 && b.ducts.length === 0) return;
      await writeClipboardJson(b);
    },
    [buildClipboardBundleFromHit, writeClipboardJson]
  );

  const deleteHitTarget = useCallback(
    (hit: SceneEditContextMenuHit) => {
      switch (hit.kind) {
        case "room":
          deleteRoomById(hit.roomId);
          break;
        case "widget":
          deleteWidgetById(hit.widgetId);
          break;
        case "duct_poly":
          deleteDuctPolylineById(hit.polyId);
          break;
        case "duct_vertex":
          removeDuctVertexAt(hit.polyId, hit.index);
          break;
        default:
          break;
      }
    },
    [deleteRoomById, deleteWidgetById, deleteDuctPolylineById, removeDuctVertexAt]
  );

  const cutHitToClipboard = useCallback(
    async (hit: SceneEditContextMenuHit) => {
      await copyHitToClipboard(hit);
      deleteHitTarget(hit);
    },
    [copyHitToClipboard, deleteHitTarget]
  );

  const deleteMultiSelection = useCallback(() => {
    if (selectedDuctPolyId !== null && selectedDuctPointIndex !== null) {
      deleteSelectedDuctVertex();
      return;
    }
    const roomIds = new Set<string>();
    if (selectedRoomId) roomIds.add(selectedRoomId);
    for (const id of auxSelectedRoomIds) roomIds.add(id);
    const wid = new Set<string>();
    if (selectedWidgetId) wid.add(selectedWidgetId);
    for (const id of auxSelectedWidgetIds) wid.add(id);
    const polyIds = new Set<string>();
    if (selectedDuctPolyId) polyIds.add(selectedDuctPolyId);
    for (const id of auxSelectedDuctPolyIds) polyIds.add(id);
    if (roomIds.size === 0 && wid.size === 0 && polyIds.size === 0) return;
    pushUndoDiscrete();
    setSceneDoc((prev) => ({
      ...prev,
      rooms: prev.rooms.filter((r) => !roomIds.has(r.roomId)),
      widgets: prev.widgets.filter((w) => !wid.has(w.id)),
      ducts: cloneDuctsForEdit(prev.ducts).filter((p) => !polyIds.has(p.id)),
    }));
    setSelectedRoomId(null);
    setAuxSelectedRoomIds([]);
    setSelectedWidgetId(null);
    setAuxSelectedWidgetIds([]);
    setSelectedDuctPolyId(null);
    setSelectedDuctPointIndex(null);
    setAuxSelectedDuctPolyIds([]);
  }, [
    selectedDuctPolyId,
    selectedDuctPointIndex,
    selectedRoomId,
    auxSelectedRoomIds,
    selectedWidgetId,
    auxSelectedWidgetIds,
    auxSelectedDuctPolyIds,
    pushUndoDiscrete,
    deleteSelectedDuctVertex,
  ]);

  const cutSelectionToClipboard = useCallback(async () => {
    await copySelectionToClipboard();
    deleteMultiSelection();
  }, [copySelectionToClipboard, deleteMultiSelection]);

  const pasteFromClipboard = useCallback(async () => {
    let raw = "";
    try {
      raw = await navigator.clipboard.readText();
    } catch {
      /* ignore */
    }
    let bundle = parseClipboardBundle(raw);
    if (!bundle || (bundle.rooms.length === 0 && bundle.widgets.length === 0 && bundle.ducts.length === 0)) {
      bundle = clipboardBundleRef.current;
    }
    if (!bundle || (bundle.rooms.length === 0 && bundle.widgets.length === 0 && bundle.ducts.length === 0)) return;
    pushUndoDiscrete();
    const rem = remapClipboardBundleForPaste(bundle, { dx: 0.04, dy: 0.04 });
    setSceneDoc((d) => {
      const layerIds = new Set(d.widgetStackLayers.map((l) => l.id));
      const activeLayer =
        layerIds.has(activeWidgetStackLayerId) ? activeWidgetStackLayerId : d.widgetStackLayers[d.widgetStackLayers.length - 1]!.id;
      const fixedWidgets = rem.widgets.map((w) => ({
        ...w,
        stackLayerId: w.stackLayerId && layerIds.has(w.stackLayerId) ? w.stackLayerId : activeLayer,
      }));
      return {
        ...d,
        rooms: [...d.rooms, ...rem.rooms],
        widgets: [...d.widgets, ...fixedWidgets],
        ducts: [...cloneDuctsForEdit(d.ducts), ...rem.ducts],
      };
    });
    if (rem.rooms.length > 0) setUseCustomRooms(true);
    if (rem.ducts.length > 0) setUseCustomDucts(true);
  }, [activeWidgetStackLayerId, pushUndoDiscrete]);

  useLayoutEffect(() => {
    copySelectionToClipboardRef.current = () => {
      void copySelectionToClipboard();
    };
    cutSelectionToClipboardRef.current = () => {
      void cutSelectionToClipboard();
    };
    pasteFromClipboardRef.current = pasteFromClipboard;
    deleteMultiSelectionRef.current = deleteMultiSelection;
  }, [copySelectionToClipboard, cutSelectionToClipboard, pasteFromClipboard, deleteMultiSelection]);

  const presetsList = useMemo(() => listPresetsFromStorage(), [presetPickerTick]);

  const applySceneDocument = useCallback(
    (next: SceneLayoutDocumentV4) => {
      const doc = cloneSceneLayoutDocument(next);
      pastRef.current = [];
      futureRef.current = [];
      bumpHistoryUi();
      setSceneDoc(doc);
      setUseCustomDucts(doc.ducts.length > 0);
      setUseCustomRooms(doc.rooms.length > 0);
      setSelectedRoomId(null);
      setAuxSelectedRoomIds([]);
      setSelectedWidgetId(null);
      setAuxSelectedWidgetIds([]);
      setSelectedAcZoneId(null);
      setAuxSelectedAcZoneIds([]);
      setSelectedDuctPolyId(null);
      setSelectedDuctPointIndex(null);
      setAuxSelectedDuctPolyIds([]);
    },
    [bumpHistoryUi]
  );

  const onSavePresetFromCurrent = useCallback(() => {
    const name = window.prompt("预设名称", `场景-${new Date().toLocaleString()}`);
    if (name === null) return;
    savePresetToStorage(name, sceneDocRef.current);
    setPresetPickerTick((x) => x + 1);
    setEditorNotice(`已保存为预设「${name.trim() || "未命名"}」。`);
  }, []);

  const onLoadPresetById = useCallback(
    (presetId: string) => {
      if (!presetId) return;
      const p = findPresetById(presetId);
      if (!p) return;
      if (!window.confirm(`载入预设「${p.name}」将替换当前场景并清空撤销栈，是否继续？`)) return;
      applySceneDocument(p.doc);
      setEditorNotice(`已载入预设「${p.name}」。`);
    },
    [applySceneDocument]
  );

  const onDeletePresetById = useCallback((presetId: string) => {
    if (!presetId) return;
    if (!window.confirm("删除该预设？")) return;
    deletePresetFromStorage(presetId);
    setPresetPickerTick((x) => x + 1);
  }, []);

  const onExportSceneJson = useCallback(() => {
    downloadSceneDocJson(sceneDocRef.current, `digital-twin-scene-${Date.now()}`);
  }, []);

  const onImportJsonFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        const doc = parseSceneDocFromFileText(text);
        if (!doc) {
          setEditorNotice("导入失败：不是有效的场景 v4 JSON。");
          return;
        }
        if (!window.confirm("导入将替换当前场景并清空撤销栈，是否继续？")) return;
        applySceneDocument(doc);
        setEditorNotice(`已导入「${f.name}」。`);
      };
      reader.readAsText(f);
    },
    [applySceneDocument]
  );

  const onDiscardDraft = useCallback(() => {
    clearDraftFromStorage();
    setEditorNotice("已丢弃本地草稿。");
  }, []);

  const roomNudgeStep =
    config.layout.roomLayoutSnapGrid > 0 ? config.layout.roomLayoutSnapGrid : 0.015625;

  const chromeTrailing = (
    <>
      <span
        className="hidden rounded border border-slate-600/45 px-1 py-px text-[9px] text-slate-400 sm:inline"
        title="编辑会话状态（视口/遥测）"
      >
        视口:{editorSession.viewportState}
        {editorSession.boardPlanTilt ? "·透视" : ""} · 遥测:{editorSession.telemetryState}
      </span>
      <button
        type="button"
        className="rounded border border-slate-600/60 bg-slate-900/50 px-1.5 py-0.5 text-[10px] text-slate-200 sm:text-[11px]"
        title="缩放与平移复位"
        onClick={resetViewport}
      >
        重置视口
      </button>
      <label
        className="inline-flex cursor-pointer select-none items-center gap-1 rounded border border-slate-600/60 bg-slate-900/50 px-1.5 py-0.5 text-[10px] text-slate-200 sm:text-[11px]"
        title="场景中一旦存在风管折线即按折线渲染；无折线时走内置网格示意"
      >
        <input type="checkbox" className="h-3 w-3 rounded border-slate-500" checked={sceneDoc.ducts.length > 0} disabled />
        自定义管
      </label>
      <label className="inline-flex cursor-pointer select-none items-center gap-1 rounded border border-slate-600/60 bg-slate-900/50 px-1.5 py-0.5 text-[10px] text-slate-200 sm:text-[11px]">
        <input
          type="checkbox"
          className="h-3 w-3 rounded border-slate-500"
          checked={useCustomRooms}
          disabled={sceneDoc.rooms.length === 0}
          onChange={(e) => setUseCustomRooms(e.target.checked)}
        />
        自定义房间
      </label>
      <label className="inline-flex cursor-pointer select-none items-center gap-1 rounded border border-slate-600/60 bg-slate-900/50 px-1.5 py-0.5 text-[10px] text-slate-200 sm:text-[11px]">
        <input
          type="checkbox"
          className="h-3 w-3 rounded border-slate-500"
          checked={showLegacy32RoomGrid}
          onChange={(e) => setShowLegacy32RoomGrid(e.target.checked)}
        />
        标准网格房间
      </label>
      <label className="inline-flex cursor-pointer select-none items-center gap-1 rounded border border-slate-600/60 bg-slate-900/50 px-1.5 py-0.5 text-[10px] text-slate-200 sm:text-[11px]">
        <input type="checkbox" className="h-3 w-3 rounded border-slate-500" checked={snap45} onChange={(e) => setSnap45(e.target.checked)} />
        45°吸附
      </label>
      {layoutEditMode ? (
        <>
          <button
            type="button"
            className="rounded border border-slate-600/60 bg-slate-900/60 px-1.5 py-0.5 text-[10px] text-slate-200 disabled:opacity-40 sm:text-[11px]"
            disabled={!canUndo}
            onClick={undo}
          >
            撤销
          </button>
          <button
            type="button"
            className="rounded border border-slate-600/60 bg-slate-900/60 px-1.5 py-0.5 text-[10px] text-slate-200 disabled:opacity-40 sm:text-[11px]"
            disabled={!canRedo}
            onClick={redo}
          >
            重做
          </button>
        </>
      ) : null}
      <button
        type="button"
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium sm:text-[11px] ${layoutEditMode ? "border border-amber-500/50 bg-amber-950/50 text-amber-100" : "border border-cyan-600/50 bg-cyan-950/50 text-cyan-100"}`}
        onClick={() => {
          const wasEdit = layoutEditMode;
          setLayoutEditMode((v) => {
            const next = !v;
            if (next) suppressAutoRoomSeedRef.current = false;
            return next;
          });
          if (wasEdit) {
            setSelectedRoomId(null);
            setAuxSelectedRoomIds([]);
            setSelectedWidgetId(null);
            setAuxSelectedWidgetIds([]);
            setSelectedAcZoneId(null);
            setAuxSelectedAcZoneIds([]);
            setSelectedDuctPolyId(null);
            setSelectedDuctPointIndex(null);
            setAuxSelectedDuctPolyIds([]);
            resetViewport();
          }
        }}
      >
        {layoutEditMode ? "完成编辑" : "编辑布局"}
      </button>
      {layoutEditMode ? (
        <button
          type="button"
          className="rounded border border-emerald-600/50 bg-emerald-950/50 px-1.5 py-0.5 text-[10px] text-emerald-100 disabled:opacity-40 sm:text-[11px]"
          disabled={!selectedRoomId}
          onClick={cycleSelectedRoomRotation}
        >
          房间旋转
        </button>
      ) : null}
      <button
        type="button"
        className="rounded border border-rose-800/50 bg-rose-950/35 px-1.5 py-0.5 text-[10px] text-rose-100 sm:text-[11px]"
        onClick={clearDuctsOnly}
        disabled={sceneDoc.ducts.length === 0}
      >
        清空风管
      </button>
      <button
        type="button"
        className="rounded border border-rose-800/50 bg-rose-950/35 px-1.5 py-0.5 text-[10px] text-rose-100 sm:text-[11px]"
        onClick={clearRoomsOnly}
        disabled={sceneDoc.rooms.length === 0}
      >
        清空房间
      </button>
      <button
        type="button"
        className="rounded border border-rose-700/40 bg-rose-950/40 px-1.5 py-0.5 text-[10px] text-rose-100 sm:text-[11px]"
        onClick={clearAllLayout}
      >
        清空全部
      </button>
    </>
  );

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col text-[var(--dt-text)]"
      style={{ ...themeStyle, backgroundColor: "var(--dt-bg)" }}
    >
      <DtChromeBar title={config.title} onBack={handleBack} trailing={chromeTrailing} />
      {editorNotice ? (
        <div className="mx-2 mt-1 flex items-start gap-2 rounded border border-cyan-800/45 bg-cyan-950/35 px-2 py-1.5 text-[10px] text-cyan-50 sm:mx-3">
          <span className="min-w-0 flex-1 leading-snug">{editorNotice}</span>
          <button
            type="button"
            className="shrink-0 rounded border border-cyan-700/50 px-1.5 py-0.5 text-[9px] text-cyan-100 hover:bg-cyan-900/50"
            onClick={() => setEditorNotice(null)}
          >
            关闭
          </button>
        </div>
      ) : null}
      <input
        ref={importJsonInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden
        onChange={onImportJsonFileChange}
      />
      <div className="relative flex min-h-0 flex-1 flex-col p-2 sm:p-3">
        <DtAmbientLayer />
        <div ref={sceneRef} className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden">
          {layoutEditMode && ductScene ? (
            <DtEditShell
              left={
                <>
                  <details className="dt-edit-folder mb-1 rounded border border-slate-700/50 bg-slate-900/35" open>
                    <summary className="cursor-pointer select-none px-1.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800/45">
                      工程
                    </summary>
                    <div className="border-t border-slate-700/40 space-y-1.5 p-1.5 text-[10px] text-slate-200 sm:text-[11px]">
                      <p className="text-[9px] leading-snug text-slate-500">
                        场景自动写入草稿（防抖）。预设与 JSON 用于打开保存好的项目；旧版 v4 存储已迁移为预设时见顶部提示。
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded border border-emerald-700/50 bg-emerald-950/40 px-1.5 py-0.5 text-emerald-100 hover:bg-emerald-900/50"
                          onClick={onSavePresetFromCurrent}
                        >
                          存为预设
                        </button>
                        <select
                          className="max-w-[9rem] rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
                          defaultValue=""
                          onChange={(e) => {
                            const id = e.target.value;
                            e.target.value = "";
                            if (id) onLoadPresetById(id);
                          }}
                        >
                          <option value="">载入预设…</option>
                          {presetsList.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <select
                          className="max-w-[7rem] rounded border border-rose-900/50 bg-rose-950/30 px-1 py-0.5 text-[10px] text-rose-100"
                          defaultValue=""
                          onChange={(e) => {
                            const id = e.target.value;
                            e.target.value = "";
                            if (id) onDeletePresetById(id);
                          }}
                        >
                          <option value="">删除预设…</option>
                          {presetsList.map((p) => (
                            <option key={`del-${p.id}`} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-600/60 px-1.5 py-0.5 hover:bg-slate-800/80"
                          onClick={onExportSceneJson}
                        >
                          导出 JSON
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-600/60 px-1.5 py-0.5 hover:bg-slate-800/80"
                          onClick={() => importJsonInputRef.current?.click()}
                        >
                          导入 JSON
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-600/60 px-1.5 py-0.5 hover:bg-slate-800/80"
                          onClick={onDiscardDraft}
                        >
                          清空草稿
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1 border-t border-slate-700/40 pt-1.5">
                        <button
                          type="button"
                          className="rounded border border-rose-700/45 bg-rose-950/35 px-1.5 py-0.5 text-rose-100 hover:bg-rose-900/45"
                          onClick={clearCanvasInEdit}
                        >
                          清空画布
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-600/60 px-1.5 py-0.5 hover:bg-slate-800/80 disabled:opacity-40"
                          disabled={!ductScene}
                          onClick={seedDefaultAcZones}
                          title="按当前 ductScene 写入左右空调区（可再编辑）"
                        >
                          生成空调区
                        </button>
                      </div>
                    </div>
                  </details>
                  <details className="dt-edit-folder mb-1 rounded border border-slate-700/50 bg-slate-900/35" open>
                    <summary className="cursor-pointer select-none px-1.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800/45">
                      选中项
                    </summary>
                    <div className="border-t border-slate-700/40 p-1.5 text-[10px] text-slate-200 sm:text-[11px]">
                      <span className="mb-1 block text-[9px] text-slate-500">
                        叠放时优先图元，其次风管、房间、空调区（与画布叠放一致）。按住 Alt 再单击可在同一点循环选中下层对象。Shift+多选；拖拽移动时 Shift 横/竖约束；拖拽缩放手柄时 Shift 等比。
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-600/60 px-1.5 py-0.5 hover:bg-slate-800/80 disabled:opacity-40"
                          disabled={selectionNudgeDisabled}
                          onClick={() => nudgeCurrentSelectionByDelta(-roomNudgeStep, 0)}
                          title="左移"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-600/60 px-1.5 py-0.5 hover:bg-slate-800/80 disabled:opacity-40"
                          disabled={selectionNudgeDisabled}
                          onClick={() => nudgeCurrentSelectionByDelta(roomNudgeStep, 0)}
                          title="右移"
                        >
                          →
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-600/60 px-1.5 py-0.5 hover:bg-slate-800/80 disabled:opacity-40"
                          disabled={selectionNudgeDisabled}
                          onClick={() => nudgeCurrentSelectionByDelta(0, -roomNudgeStep)}
                          title="上移"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-600/60 px-1.5 py-0.5 hover:bg-slate-800/80 disabled:opacity-40"
                          disabled={selectionNudgeDisabled}
                          onClick={() => nudgeCurrentSelectionByDelta(0, roomNudgeStep)}
                          title="下移"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="rounded border border-cyan-700/50 bg-cyan-950/40 px-1.5 py-0.5 text-cyan-100 hover:bg-cyan-900/50 disabled:opacity-40"
                          disabled={selectionNudgeDisabled}
                          onClick={duplicateCurrentSelection}
                          title="复制当前选中（房间多选 / 单显示框 / 单风管折线）"
                        >
                          复制选中
                        </button>
                      </div>
                    </div>
                  </details>
                  <details className="dt-edit-folder mb-1 rounded border border-slate-700/50 bg-slate-900/35" open>
                    <summary className="cursor-pointer select-none px-1.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800/45">
                      剪贴板
                    </summary>
                    <div className="border-t border-slate-700/40 p-1.5 text-[10px] text-slate-200">
                      <p className="mb-1.5 text-[9px] leading-snug text-slate-500">
                        与 Ctrl/⌘+C、X、V 相同：支持房间、图元（显示框/指示灯/条）、风管折线。
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-600/60 px-1.5 py-0.5 hover:bg-slate-800/80"
                          onClick={() => void copySelectionToClipboard()}
                        >
                          复制
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-600/60 px-1.5 py-0.5 hover:bg-slate-800/80"
                          onClick={() => void cutSelectionToClipboard()}
                        >
                          剪切
                        </button>
                        <button
                          type="button"
                          className="rounded border border-cyan-700/50 bg-cyan-950/40 px-1.5 py-0.5 text-cyan-100 hover:bg-cyan-900/50"
                          onClick={() => void pasteFromClipboard()}
                        >
                          粘贴
                        </button>
                      </div>
                    </div>
                  </details>
                  <details className="dt-edit-folder mb-1 rounded border border-slate-700/50 bg-slate-900/35" open>
                    <summary className="cursor-pointer select-none px-1.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800/45">
                      基本场景
                    </summary>
                    <div className="border-t border-slate-700/40 space-y-1 p-1.5 text-[10px] text-slate-200">
                      <p className="text-[9px] leading-snug text-slate-500">
                        房间网格、文档内空调区与管道入口；空调机组外观请用「图形库」中的空调单元块自行摆放。
                      </p>
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-600/60 px-1.5 py-0.5 text-left hover:bg-slate-800/80 disabled:opacity-40"
                          disabled={!ductScene}
                          onClick={seedStandardRoomGridLayout}
                          title="按配置列×行写入 plate 归一化房间"
                        >
                          标准房间网格 ({config.grid.columns}×{config.grid.rows})
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-600/60 px-1.5 py-0.5 text-left hover:bg-slate-800/80 disabled:opacity-40"
                          disabled={!ductScene}
                          onClick={seedDefaultAcZones}
                        >
                          生成空调区
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-600/60 px-1.5 py-0.5 text-left hover:bg-slate-800/80"
                          onClick={addDuctPolyline}
                        >
                          新建管道
                        </button>
                      </div>
                    </div>
                  </details>
                  <details className="dt-edit-folder mb-1 rounded border border-slate-700/50 bg-slate-900/35" open>
                    <summary className="cursor-pointer select-none px-1.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800/45">
                      管道布局
                    </summary>
                    <div className="border-t border-slate-700/40 p-1 pt-1">
                      <DuctEditToolbar
                        ducts={sceneDoc.ducts}
                        selectedPolyId={selectedDuctPolyId}
                        selectedPointIndex={selectedDuctPointIndex}
                        onAddPolyline={addDuctPolyline}
                        onDeletePolyline={deleteSelectedDuctPolyline}
                        onDeleteVertex={deleteSelectedDuctVertex}
                        onChangeColumn={onDuctChangeColumn}
                        onChangeSelectedH={onChangeDuctSelectedH}
                      />
                    </div>
                  </details>
                  <details className="dt-edit-folder mb-1 rounded border border-slate-700/50 bg-slate-900/35" open>
                    <summary className="cursor-pointer select-none px-1.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800/45">
                      图形图层
                    </summary>
                    <div className="border-t border-slate-700/40 p-1 pt-1">
                      <DtWidgetStackLayersPanel
                        layers={sceneDoc.widgetStackLayers}
                        layerUi={sceneDoc.widgetStackLayerUi}
                        widgets={sceneDoc.widgets}
                        activeLayerId={activeWidgetStackLayerId}
                        selectedWidgetId={selectedWidgetId}
                        onActiveLayerChange={setActiveWidgetStackLayerId}
                        onDocPatch={commitWidgetStackPatch}
                      />
                    </div>
                  </details>
                  <details className="dt-edit-folder mb-1 rounded border border-slate-700/50 bg-slate-900/35" open>
                    <summary className="cursor-pointer select-none px-1.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800/45">
                      图形库
                    </summary>
                    <div className="border-t border-slate-700/40 space-y-1 p-1 pt-1">
                      <DtCustomIconImportPanel onImport={addCustomGraphicFromSidebar} />
                      <DtGraphicLibrarySidebarPanel onPickItem={addGraphicFromLibraryById} />
                      <DtWidgetPalette onPick={addWidgetFromPreset} />
                      <DtShapeLibraryPanel onPick={addShapeFromCatalog} />
                    </div>
                  </details>
                  <details className="dt-edit-folder mb-1 rounded border border-slate-700/50 bg-slate-900/35">
                    <summary className="cursor-pointer select-none px-1.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800/45">
                      视图与外观
                    </summary>
                    <div className="border-t border-slate-700/40 space-y-1 p-1.5">
                      <label className="flex flex-col gap-0.5 text-[9px] text-slate-400">
                        <span>房间块视觉</span>
                        <select
                          className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
                          value={sceneDoc.roomVisualPreset}
                          onChange={(e) => {
                            const v = e.target.value === "flat" ? "flat" : "isoSoft";
                            setSceneDoc((d) => ({ ...d, roomVisualPreset: v }));
                          }}
                        >
                          <option value="isoSoft">轻伪 3D（默认）</option>
                          <option value="flat">平面</option>
                        </select>
                      </label>
                      {import.meta.env.DEV ? (
                        <label className="flex flex-col gap-0.5 text-[9px] text-slate-400">
                          <span>画布透视（仅开发构建）</span>
                          <select
                            className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
                            value={sceneDoc.boardPresentation}
                            onChange={(e) => {
                              const v = e.target.value === "planTilt" ? "planTilt" : "plan2d";
                              // 保存后仅合并 boardPresentation，禁止整表 load — post-save-no-full-refresh.mdc
                              setSceneDoc((d) => ({ ...d, boardPresentation: v }));
                            }}
                          >
                            <option value="plan2d">平面（默认）</option>
                            <option value="planTilt">斜侧透视</option>
                          </select>
                        </label>
                      ) : null}
                    </div>
                  </details>
                  <details className="dt-edit-folder mb-1 rounded border border-slate-700/50 bg-slate-900/35">
                    <summary className="cursor-pointer select-none px-1.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800/45">
                      快捷键与交互
                    </summary>
                    <div className="border-t border-slate-700/40 p-1.5 text-[9px] leading-snug text-slate-500">
                      滚轮缩放（以指针下点为锚）；Shift+滚轮水平平移；中键或空格拖画布。空白单击取消选中；空白拖拽框选（Shift 追加）。方向键微移当前选中。拖拽移动时 Shift 约束横/竖移；拖拽缩放手柄时 Shift 等比锁定宽高比。Alt+单击同点穿透循环选中。Ctrl/⌘+C/X/V、Delete/Backspace
                      与左侧「剪贴板」及右键复制/剪切/粘贴/删除一致。指示灯与条形图为独立图元，样式见 dtEditorWidgetVisuals。
                    </div>
                  </details>
                </>
              }
              center={
                <div
                  ref={viewportRef}
                  data-twin-global-ctx-skip
                  className="relative z-[1] min-h-0 h-full w-full overflow-hidden"
                  onPointerDown={onViewportPointerDown}
                >
                  <DtWorldStack
                    viewport={viewport}
                    tilt={false}
                    tiltDeg={sceneDoc.boardTiltRotateXDeg ?? 12}
                  >
                    {/* 保存后仅合并布局字段，禁止整表 load — post-save-no-full-refresh.mdc；minHeight 与 ductScene 对齐，避免 absolute+h-full/% 在 flex+3D 链上塌成细线 */}
                    <div
                      ref={editPlateColumnRef}
                      className="relative flex min-h-0 shrink-0 flex-col gap-0"
                      style={{
                        width: ductScene.width,
                        minWidth: ductScene.width,
                        height: ductScene.height,
                        minHeight: ductScene.height,
                      }}
                    >
                      {ductScene && ductChannels.length > 0 && !showCustomDucts ? (
                        <DtDuctSvg
                          width={ductScene.width}
                          height={ductScene.height}
                          channels={ductChannels}
                          phaseStaggerSec={config.animation.phaseStaggerSec}
                        />
                      ) : null}
                      {sceneDoc.acZones.length >= 2 && ductScene ? (
                        <DtAcZoneLayer
                          acZones={sceneDoc.acZones}
                          sceneWidth={ductScene.width}
                          sceneHeight={ductScene.height}
                          selectedId={selectedAcZoneId}
                          highlightZoneIds={acZoneHighlightIds}
                        />
                      ) : null}
                      <RoomLayoutEditor
                        plateRef={viewportRef}
                        presentationOnly
                        roomsLayout={sceneDoc.rooms}
                        onRoomsChange={onRoomsChange}
                        telemetryByRoomId={telemetryByRoomId}
                        config={config}
                        roomSnapGrid={config.layout.roomLayoutSnapGrid}
                        selectedRoomId={selectedRoomId}
                        highlightRoomIds={roomHighlightIds}
                        onSelectRoom={handleRoomSelect}
                        onLayoutGestureStart={beginLayoutGesture}
                        onLayoutGestureEnd={endLayoutGesture}
                        roomVisualPreset={sceneDoc.roomVisualPreset}
                        roomsAreaMetricsRef={roomLayoutRoomsAreaMetricsRef}
                      />
                      <DuctLayoutEditor
                        width={ductScene.width}
                        height={ductScene.height}
                        ducts={sceneDoc.ducts}
                        snapGridStep={config.layout.ductLayoutSnapGrid}
                        heightLiftPx={config.layout.ductHeightVisualLiftPx}
                        selectedPolyId={selectedDuctPolyId}
                        selectedPointIndex={selectedDuctPointIndex}
                        highlightPolyIds={ductPolyHighlightIds}
                      />
                      {sceneDoc.widgets.length > 0 ? (
                        <DtSceneWidgetLayer
                          widgets={sceneDoc.widgets}
                          widgetStackLayers={sceneDoc.widgetStackLayers}
                          widgetStackLayerUi={sceneDoc.widgetStackLayerUi}
                          valueByName={twinWinccValues}
                          selectedWidgetId={selectedWidgetId}
                          highlightWidgetIds={widgetHighlightIds}
                          winccHint={twinWinccHint}
                          suppressSelectionRing={layoutEditMode}
                          sceneMetrics={widgetSceneMetrics}
                          browseInteractive={false}
                          writeBusyWidgetId={dtWidgetWriteBusyId}
                        />
                      ) : null}
                      {/* 编辑选框已并入 DtSceneWidgetLayer（与图元同盒），避免独立绝对层垂直错位 */}
                      {/* 编辑态画布与 DtWorldStack 同为 plan2d，命中逆变换与视觉一致 */}
                      <SceneEditSurface
                        canvasRef={viewportRef}
                        sceneBoardRef={editPlateColumnRef}
                        spacePanBlocksSurfaceRef={spaceDownRef}
                        viewportPanScale={viewport}
                        boardPlaneParams={{
                          presentation: "plan2d",
                          tiltRotateXDeg: sceneDoc.boardTiltRotateXDeg ?? 12,
                        }}
                        sceneGrid={ductScene.grid}
                        roomsLayout={sceneDoc.rooms}
                        ducts={sceneDoc.ducts}
                        widgets={sceneDoc.widgets}
                        widgetStackLayers={sceneDoc.widgetStackLayers}
                        widgetStackLayerUi={sceneDoc.widgetStackLayerUi}
                        acZones={sceneDoc.acZones}
                        onAcZonesChange={onAcZonesChange}
                        selectedAcZoneId={selectedAcZoneId}
                        onSelectAcZone={handleAcZoneSelect}
                        shapeLibraryEnabled
                        onAddShapeFromCatalog={addShapeFromCatalog}
                        ductPixelWidth={ductScene.width}
                        ductPixelHeight={ductScene.height}
                        heightLiftPx={config.layout.ductHeightVisualLiftPx}
                        layerRows={EDITOR_SCENE_LAYER_ROWS}
                        selectedRoomId={selectedRoomId}
                        selectedWidgetId={selectedWidgetId}
                        selectedDuctPolyId={selectedDuctPolyId}
                        selectedDuctPointIndex={selectedDuctPointIndex}
                        onSelectRoom={handleRoomSelect}
                        onSelectWidget={handleWidgetSelect}
                        onWidgetMarqueeSelect={handleWidgetMarqueeSelect}
                        onDuctSelectionChange={onDuctSelectionChange}
                        onRoomsChange={onRoomsChange}
                        onDuctsChange={onDuctsChange}
                        onWidgetsChange={onWidgetsChange}
                        roomSnapGrid={config.layout.roomLayoutSnapGrid}
                        widgetSnapGrid={config.layout.widgetLayoutSnapGrid}
                        snapGridStep={config.layout.ductLayoutSnapGrid}
                        snap45={snap45}
                        onLayoutGestureStart={beginLayoutGesture}
                        onLayoutGestureEnd={endLayoutGesture}
                        onDuctDiscreteUndoAnchor={pushUndoDiscrete}
                        onRoomRotateRequest={onRoomRotateFromSurface}
                        onClearRoomSelection={onClearRoomSelection}
                        onDuctDeleteVertex={deleteSelectedDuctVertex}
                        onDeleteWidget={deleteWidgetById}
                        onDeleteRoomById={deleteRoomById}
                        onDuplicateRoomById={duplicateRoomById}
                        onDeleteDuctPolylineById={deleteDuctPolylineById}
                        onDuplicateDuctPolylineById={duplicateDuctPolylineById}
                        onDuplicateWidgetById={duplicateWidgetById}
                        onRequestCopySelection={() => {
                          void copySelectionToClipboard();
                        }}
                        onRequestCutSelection={() => {
                          void cutSelectionToClipboard();
                        }}
                        onRequestPaste={() => {
                          void pasteFromClipboard();
                        }}
                        onRequestDeleteSelection={() => {
                          deleteMultiSelection();
                        }}
                        onRequestCopyHit={(hit) => {
                          void copyHitToClipboard(hit);
                        }}
                        onRequestCutHit={(hit) => {
                          void cutHitToClipboard(hit);
                        }}
                        onRequestDeleteHit={(hit) => {
                          deleteHitTarget(hit);
                        }}
                      />
                    </div>
                  </DtWorldStack>
                </div>
              }
              right={
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {selectedWidget ? (
                      <DtWidgetDetailsPanel
                        widget={selectedWidget}
                        widgetStackLayers={sceneDoc.widgetStackLayers}
                        onChange={updateWidgetFromDetails}
                      />
                    ) : selectedAcZone ? (
                      <DtAcZoneDetailsPanel
                        zone={selectedAcZone}
                        gridColumns={config.grid.columns}
                        onChange={onAcZoneDetailsChange}
                      />
                    ) : (
                      <div className="rounded border border-slate-700/40 bg-slate-900/30 p-2 text-[9px] leading-snug text-slate-400">
                        点选图元（显示框/指示灯/条）或空调区后在此编辑属性。管道工具已移至左侧「管道布局」。
                      </div>
                    )}
                  </div>
                </div>
              }
            />
          ) : (
            <div
              ref={viewportRef}
              className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden"
              onPointerDown={onViewportPointerDown}
            >
              <DtWorldStack
                viewport={viewport}
                tilt={sceneDoc.boardPresentation === "planTilt"}
                tiltDeg={sceneDoc.boardTiltRotateXDeg ?? 12}
              >
                {/* 勿在 pan/scale 变换子树内 flex 居中整块板：否则逻辑原点与滚轮缩放公式不一致，无法以指针为锚（与编辑态一致） */}
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col items-start justify-start gap-2">
                  {!layoutEditMode && ductScene ? (
                    <div
                      ref={layoutPlateRef}
                      className="relative z-[1] shrink-0"
                      style={{
                        width: ductScene.width,
                        minWidth: ductScene.width,
                        height: ductScene.height,
                        minHeight: ductScene.height,
                      }}
                    >
                      {ductChannels.length > 0 ? (
                        <DtDuctSvg
                          width={ductScene.width}
                          height={ductScene.height}
                          channels={ductChannels}
                          phaseStaggerSec={config.animation.phaseStaggerSec}
                        />
                      ) : null}
                      {sceneDoc.acZones.length >= 2 ? (
                        <DtAcZoneLayer
                          acZones={sceneDoc.acZones}
                          sceneWidth={ductScene.width}
                          sceneHeight={ductScene.height}
                          selectedId={null}
                        />
                      ) : null}
                      <div
                        className={`absolute inset-0 z-[2] flex min-h-0 flex-col ${browsingPlateCenterLayout ? "items-center justify-center" : ""}`}
                      >
                        {showFreeformView ? (
                          <div className="relative z-[2] flex min-h-0 min-w-0 shrink-0 flex-col items-center justify-center">
                            <DtRoomGrid
                              mode="freeform"
                              rooms={snapshot.rooms}
                              config={config}
                              roomLayout={sceneDoc.rooms}
                              roomVisualPreset={sceneDoc.roomVisualPreset}
                            />
                            {sceneDoc.widgets.length > 0 ? (
                              <DtSceneWidgetLayer
                                widgets={sceneDoc.widgets}
                                widgetStackLayers={sceneDoc.widgetStackLayers}
                                widgetStackLayerUi={sceneDoc.widgetStackLayerUi}
                                valueByName={twinWinccValues}
                                selectedWidgetId={null}
                                winccHint={twinWinccHint}
                                sceneMetrics={widgetSceneMetrics}
                                browseInteractive={twinWinccOn}
                                onBrowseWidgetCommand={onBrowseDtWidgetCommand}
                                writeBusyWidgetId={dtWidgetWriteBusyId}
                              />
                            ) : null}
                          </div>
                        ) : null}
                        {showBrowsingSceneOverlay ? (
                          <div className="absolute inset-0 z-[2] flex min-h-0 flex-col">
                            {sceneDoc.widgets.length > 0 ? (
                              <DtSceneWidgetLayer
                                widgets={sceneDoc.widgets}
                                widgetStackLayers={sceneDoc.widgetStackLayers}
                                widgetStackLayerUi={sceneDoc.widgetStackLayerUi}
                                valueByName={twinWinccValues}
                                selectedWidgetId={null}
                                winccHint={twinWinccHint}
                                sceneMetrics={widgetSceneMetrics}
                                browseInteractive={twinWinccOn}
                                onBrowseWidgetCommand={onBrowseDtWidgetCommand}
                                writeBusyWidgetId={dtWidgetWriteBusyId}
                              />
                            ) : (
                              <div className="flex flex-1 items-center justify-center px-4 text-center text-[11px] leading-snug text-slate-500">
                                默认不显示 4×8 标准房间网格。勾选工具栏「标准网格房间」恢复 32 格预览；或使用「自定义房间」并进入编辑布置房间与图元。
                              </div>
                            )}
                          </div>
                        ) : null}
                        {showLegacy32RoomGrid && !showFreeformView ? (
                          <DtRoomGrid
                            mode="grid"
                            rooms={snapshot.rooms}
                            config={config}
                            roomVisualPreset={sceneDoc.roomVisualPreset}
                            gridGapPx={sceneDoc.roomGapPx}
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : !layoutEditMode ? (
                    <div
                      ref={layoutPlateRef}
                      className={`relative z-[2] flex min-h-0 min-w-0 flex-1 flex-col ${browsingPlateCenterLayout ? "items-center justify-center" : ""}`}
                    >
                      {showFreeformView ? (
                        <div className="relative z-[2] flex min-h-0 min-w-0 shrink-0 flex-col items-center justify-center">
                          <DtRoomGrid
                            mode="freeform"
                            rooms={snapshot.rooms}
                            config={config}
                            roomLayout={sceneDoc.rooms}
                            roomVisualPreset={sceneDoc.roomVisualPreset}
                          />
                          {sceneDoc.widgets.length > 0 ? (
                            <DtSceneWidgetLayer
                              widgets={sceneDoc.widgets}
                              widgetStackLayers={sceneDoc.widgetStackLayers}
                              widgetStackLayerUi={sceneDoc.widgetStackLayerUi}
                              valueByName={twinWinccValues}
                              selectedWidgetId={null}
                              winccHint={twinWinccHint}
                              sceneMetrics={widgetSceneMetrics}
                              browseInteractive={twinWinccOn}
                              onBrowseWidgetCommand={onBrowseDtWidgetCommand}
                              writeBusyWidgetId={dtWidgetWriteBusyId}
                            />
                          ) : null}
                        </div>
                      ) : null}
                      {showBrowsingSceneOverlay ? (
                        <div className="relative z-[2] flex min-h-0 shrink-0 flex-col">
                          {sceneDoc.widgets.length > 0 ? (
                            <DtSceneWidgetLayer
                              widgets={sceneDoc.widgets}
                              widgetStackLayers={sceneDoc.widgetStackLayers}
                              widgetStackLayerUi={sceneDoc.widgetStackLayerUi}
                              valueByName={twinWinccValues}
                              selectedWidgetId={null}
                              winccHint={twinWinccHint}
                              sceneMetrics={widgetSceneMetrics}
                              browseInteractive={twinWinccOn}
                              onBrowseWidgetCommand={onBrowseDtWidgetCommand}
                              writeBusyWidgetId={dtWidgetWriteBusyId}
                            />
                          ) : (
                            <div className="flex flex-1 items-center justify-center px-4 text-center text-[11px] leading-snug text-slate-500">
                              默认不显示 4×8 标准房间网格。勾选工具栏「标准网格房间」恢复 32 格预览；或使用「自定义房间」并进入编辑布置房间与图元。
                            </div>
                          )}
                        </div>
                      ) : null}
                      {showLegacy32RoomGrid && !showFreeformView ? (
                        <DtRoomGrid
                          mode="grid"
                          rooms={snapshot.rooms}
                          config={config}
                          roomVisualPreset={sceneDoc.roomVisualPreset}
                          gridGapPx={sceneDoc.roomGapPx}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </DtWorldStack>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
