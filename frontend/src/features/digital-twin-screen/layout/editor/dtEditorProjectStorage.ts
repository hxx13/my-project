import type { SceneLayoutDocumentV4 } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import {
  emptySceneLayoutDocumentV4,
  loadSceneLayoutFromStorage,
  parseSceneLayoutDocumentJsonString,
  saveSceneLayoutToStorage,
} from "@/features/digital-twin-screen/layout/sceneLayoutStorage";
import {
  SCENE_LAYOUT_STORAGE_KEY,
  SCENE_LAYOUT_STORAGE_KEY_V3,
  SCENE_LAYOUT_STORAGE_KEY_V4,
} from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { cloneSceneLayoutDocument } from "@/features/digital-twin-screen/layout/sceneLayoutClone";

const DRAFT_KEY = "aro.dt.editor.draft.v1";
const PRESETS_KEY = "aro.dt.editor.presets.v1";
const MIGRATED_LEGACY_FLAG = "aro.dt.editor.migratedLegacyV4.v1";

export type DtEditorDraftV1 = {
  version: 1;
  updatedAt: number;
  doc: SceneLayoutDocumentV4;
};

export type DtEditorPresetV1 = {
  id: string;
  name: string;
  updatedAt: number;
  doc: SceneLayoutDocumentV4;
};

function newPresetId(): string {
  try {
    return `pre-${crypto.randomUUID().slice(0, 12)}`;
  } catch {
    return `pre-${Date.now()}`;
  }
}

export function isSceneDocumentEmpty(doc: SceneLayoutDocumentV4): boolean {
  return (
    doc.ducts.length === 0 &&
    doc.rooms.length === 0 &&
    doc.widgets.length === 0 &&
    doc.acZones.length === 0
  );
}

export function loadDraftFromStorage(): DtEditorDraftV1 | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (o.version !== 1 || typeof o.updatedAt !== "number" || !o.doc) return null;
    const docRaw = o.doc;
    if (!docRaw || typeof docRaw !== "object") return null;
    const docStr = JSON.stringify(docRaw);
    const doc = parseSceneLayoutDocumentJsonString(docStr);
    if (!doc) return null;
    return { version: 1, updatedAt: o.updatedAt, doc };
  } catch {
    return null;
  }
}

export function saveDraftToStorage(doc: SceneLayoutDocumentV4): void {
  try {
    const payload: DtEditorDraftV1 = {
      version: 1,
      updatedAt: Date.now(),
      doc: cloneSceneLayoutDocument(doc),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearDraftFromStorage(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function listPresetsFromStorage(): DtEditorPresetV1[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: DtEditorPresetV1[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = String(r.id || "");
      const name = String(r.name || "未命名");
      const updatedAt = typeof r.updatedAt === "number" ? r.updatedAt : 0;
      const docStr = JSON.stringify(r.doc ?? {});
      const doc = parseSceneLayoutDocumentJsonString(docStr);
      if (!id || !doc) continue;
      out.push({ id, name, updatedAt, doc });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function writePresets(presets: DtEditorPresetV1[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* ignore */
  }
}

export function savePresetToStorage(name: string, doc: SceneLayoutDocumentV4): DtEditorPresetV1 {
  const preset: DtEditorPresetV1 = {
    id: newPresetId(),
    name: name.trim() || "未命名预设",
    updatedAt: Date.now(),
    doc: cloneSceneLayoutDocument(doc),
  };
  const list = listPresetsFromStorage();
  writePresets([preset, ...list]);
  return preset;
}

export function upsertPresetInStorage(preset: DtEditorPresetV1): void {
  const list = listPresetsFromStorage().filter((p) => p.id !== preset.id);
  writePresets([{ ...preset, doc: cloneSceneLayoutDocument(preset.doc), updatedAt: Date.now() }, ...list]);
}

export function deletePresetFromStorage(id: string): void {
  writePresets(listPresetsFromStorage().filter((p) => p.id !== id));
}

export function findPresetById(id: string): DtEditorPresetV1 | null {
  return listPresetsFromStorage().find((p) => p.id === id) ?? null;
}

/** 从文件读取 JSON 并解析为场景文档 */
export function parseSceneDocFromFileText(text: string): SceneLayoutDocumentV4 | null {
  return parseSceneLayoutDocumentJsonString(text);
}

export function downloadSceneDocJson(doc: SceneLayoutDocumentV4, filename: string): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearLegacySceneLayoutKeys(): void {
  try {
    localStorage.removeItem(SCENE_LAYOUT_STORAGE_KEY_V4);
    localStorage.removeItem(SCENE_LAYOUT_STORAGE_KEY_V3);
    localStorage.removeItem(SCENE_LAYOUT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 一次性：若旧版 aro.digitalTwin.sceneLayout.v4 有内容且尚未迁移，则写入预设「迁移-旧版布局」并清空旧 key，
 * 避免与「空白默认 + 草稿」工程模型混用。
 */
export function tryMigrateLegacySceneLayoutV4Once(): { migrated: boolean; presetName?: string } {
  try {
    if (localStorage.getItem(MIGRATED_LEGACY_FLAG)) return { migrated: false };
    const legacy = loadSceneLayoutFromStorage();
    if (isSceneDocumentEmpty(legacy)) {
      localStorage.setItem(MIGRATED_LEGACY_FLAG, "1");
      return { migrated: false };
    }
    const name = "迁移-旧版布局";
    savePresetToStorage(name, legacy);
    clearLegacySceneLayoutKeys();
    localStorage.setItem(MIGRATED_LEGACY_FLAG, "1");
    return { migrated: true, presetName: name };
  } catch {
    return { migrated: false };
  }
}

export function resolveInitialSceneDocument(): {
  doc: SceneLayoutDocumentV4;
  useCustomDucts: boolean;
  useCustomRooms: boolean;
  restoredFromDraft: boolean;
  legacyMigrated: boolean;
  migratedPresetName?: string;
} {
  const draft = loadDraftFromStorage();
  if (draft && !isSceneDocumentEmpty(draft.doc)) {
    const doc = cloneSceneLayoutDocument(draft.doc);
    return {
      doc,
      useCustomDucts: doc.ducts.length > 0,
      useCustomRooms: doc.rooms.length > 0,
      restoredFromDraft: true,
      legacyMigrated: false,
    };
  }

  const mig = tryMigrateLegacySceneLayoutV4Once();
  const doc = emptySceneLayoutDocumentV4();
  return {
    doc,
    useCustomDucts: false,
    useCustomRooms: false,
    restoredFromDraft: false,
    legacyMigrated: mig.migrated,
    migratedPresetName: mig.presetName,
  };
}

/** 将当前场景写回旧 v4 key（可选兼容导出/其它入口） */
export function persistSceneToLegacyV4Slot(doc: SceneLayoutDocumentV4): void {
  saveSceneLayoutToStorage(doc);
}
