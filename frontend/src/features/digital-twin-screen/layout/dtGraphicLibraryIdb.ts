/**
 * 数字孪生「本地图形素材库」：IndexedDB 持久化，供导入图跨场景复用（浏览器无法静默写入真实磁盘目录）。
 * 场景 JSON 仅存 graphicLibraryAssetId + mime/name，像素走此库；分组仅存于本地库（folderId）。
 */
import type { DtWidgetGraphicAsset } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { buildRasterThumbDataUrl } from "@/features/digital-twin-screen/layout/dtGraphicImport";

const DB_NAME = "aro.dt.graphicLibrary.v1";
/** v3：再次跑 upgradeneeded，补齐极少数仅有 graphics、无 folders 的旧库，避免 folder 事务失败拖垮整页列表 */
const DB_VERSION = 3;
const STORE_GRAPHICS = "graphics";
const STORE_FOLDERS = "folders";

/** 素材库增删改后派发，供左侧栏等订阅刷新列表（避免整页 load） */
export const DT_GRAPHIC_LIBRARY_CHANGED_EVENT = "aro.dt.graphicLibraryChanged";

function notifyGraphicLibraryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DT_GRAPHIC_LIBRARY_CHANGED_EVENT));
}

/** 单条素材上限（字符，data URL）；库在 IndexedDB，可大于场景 localStorage 限额 */
export const MAX_GRAPHIC_LIBRARY_DATA_URL_LEN = 2_500_000;

export type DtGraphicLibraryFolderRow = {
  id: string;
  name: string;
  /** 预留多级；当前 UI 仅建根下子文件夹，存 null */
  parentId: string | null;
  savedAt: number;
  sortOrder: number;
};

export type DtGraphicLibraryFolderListItem = Pick<DtGraphicLibraryFolderRow, "id" | "name" | "parentId" | "sortOrder">;

export type DtGraphicLibraryRow = {
  id: string;
  mime: DtWidgetGraphicAsset["mime"];
  name: string;
  dataUrl: string;
  savedAt: number;
  /** 列表用小预览（栅格缩略 data URL）；旧数据可无 */
  thumbDataUrl?: string;
  /** 所属自定义分组；缺省/ null 表示根目录（未分组） */
  folderId?: string | null;
};

export type DtGraphicLibraryListItem = Pick<DtGraphicLibraryRow, "id" | "mime" | "name" | "savedAt"> & {
  dataUrlLen: number;
  /** 与 {@link DtGraphicLibraryRow.thumbDataUrl} 一致，供侧栏小图 */
  thumbDataUrl?: string;
  folderId?: string | null;
  /** 列表展示用，来自 folders 表 */
  folderName?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB.open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_GRAPHICS)) {
        db.createObjectStore(STORE_GRAPHICS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: "id" });
      }
    };
  });
}

function newLibraryId(): string {
  try {
    return `gl-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  } catch {
    return `gl-${Date.now()}`;
  }
}

function newFolderId(): string {
  try {
    return `gf-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  } catch {
    return `gf-${Date.now()}`;
  }
}

export async function dtGraphicLibraryFolderList(): Promise<DtGraphicLibraryFolderListItem[]> {
  const db = await openDb();
  if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
    return [];
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("folder list failed"));
    const r = tx.objectStore(STORE_FOLDERS).getAll();
    r.onsuccess = () => {
      const rows = (r.result as DtGraphicLibraryFolderRow[]) || [];
      const out = rows
        .map((row) => ({
          id: row.id,
          name: row.name,
          parentId: row.parentId ?? null,
          sortOrder: Number.isFinite(row.sortOrder) ? row.sortOrder : 0,
        }))
        .sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.name.localeCompare(b.name, "zh")));
      resolve(out);
    };
  });
}

export async function dtGraphicLibraryFolderCreate(args: { name: string; parentId?: string | null }): Promise<string> {
  const name = (args.name || "新建分组").trim().slice(0, 80);
  const parentId = args.parentId === undefined || args.parentId === null ? null : String(args.parentId).trim() || null;
  const db = await openDb();
  const existing = await new Promise<DtGraphicLibraryFolderRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("read folders"));
    const q = tx.objectStore(STORE_FOLDERS).getAll();
    q.onsuccess = () => resolve((q.result as DtGraphicLibraryFolderRow[]) || []);
  });
  const maxSort = existing.reduce((m, f) => Math.max(m, f.sortOrder ?? 0), 0);
  const id = newFolderId();
  const row: DtGraphicLibraryFolderRow = {
    id,
    name,
    parentId,
    savedAt: Date.now(),
    sortOrder: maxSort + 1,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, "readwrite");
    tx.oncomplete = () => {
      notifyGraphicLibraryChanged();
      resolve(id);
    };
    tx.onerror = () => reject(tx.error ?? new Error("folder put failed"));
    tx.objectStore(STORE_FOLDERS).put(row);
  });
}

export async function dtGraphicLibraryFolderRename(id: string, name: string): Promise<void> {
  const sid = id.trim();
  if (!sid) return;
  const db = await openDb();
  const row = await new Promise<DtGraphicLibraryFolderRow | null>((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("get folder"));
    const r = tx.objectStore(STORE_FOLDERS).get(sid);
    r.onsuccess = () => resolve((r.result as DtGraphicLibraryFolderRow | undefined) ?? null);
  });
  if (!row) return;
  const next = { ...row, name: name.trim().slice(0, 80) || row.name };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, "readwrite");
    tx.oncomplete = () => {
      notifyGraphicLibraryChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("folder rename failed"));
    tx.objectStore(STORE_FOLDERS).put(next);
  });
}

/** 删除分组：其下素材移到根目录（folderId 清空），不删图 */
export async function dtGraphicLibraryFolderDelete(folderId: string): Promise<void> {
  const fid = folderId.trim();
  if (!fid) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_GRAPHICS, STORE_FOLDERS], "readwrite");
    tx.oncomplete = () => {
      notifyGraphicLibraryChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("folder delete failed"));
    const gStore = tx.objectStore(STORE_GRAPHICS);
    const fStore = tx.objectStore(STORE_FOLDERS);
    const rq = gStore.openCursor();
    rq.onerror = () => reject(rq.error ?? new Error("graphics cursor in folder delete"));
    rq.onsuccess = () => {
      const cur = rq.result;
      if (!cur) {
        fStore.delete(fid);
        return;
      }
      const row = cur.value as DtGraphicLibraryRow;
      if ((row.folderId || "").trim() === fid) {
        gStore.put({ ...row, folderId: null });
      }
      cur.continue();
    };
  });
}

export async function dtGraphicLibraryPut(args: {
  mime: DtWidgetGraphicAsset["mime"];
  name: string;
  dataUrl: string;
  /** 入库目标分组；缺省为根目录 */
  folderId?: string | null;
}): Promise<string> {
  const dataUrl = args.dataUrl.trim();
  if (!dataUrl.startsWith("data:")) throw new Error("仅支持 data URL 入库");
  if (dataUrl.length > MAX_GRAPHIC_LIBRARY_DATA_URL_LEN) {
    throw new Error(`文件过大：超过素材库上限 ${MAX_GRAPHIC_LIBRARY_DATA_URL_LEN} 字符`);
  }
  const fid = args.folderId === undefined || args.folderId === null || String(args.folderId).trim() === "" ? null : String(args.folderId).trim();
  const id = newLibraryId();
  const thumb = await buildRasterThumbDataUrl(dataUrl, args.mime);
  const row: DtGraphicLibraryRow = {
    id,
    mime: args.mime,
    name: (args.name || "未命名").slice(0, 200),
    dataUrl,
    savedAt: Date.now(),
    folderId: fid,
    ...(thumb ? { thumbDataUrl: thumb } : {}),
  };
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GRAPHICS, "readwrite");
    tx.oncomplete = () => {
      notifyGraphicLibraryChanged();
      resolve(id);
    };
    tx.onerror = () => reject(tx.error ?? new Error("put failed"));
    tx.objectStore(STORE_GRAPHICS).put(row);
  });
}

/** 修改素材显示名（仅元数据，不改 id / 像素） */
export async function dtGraphicLibraryRename(graphicId: string, name: string): Promise<void> {
  const gid = graphicId.trim();
  if (!gid) return;
  const nextName = (name || "未命名").trim().slice(0, 200);
  const db = await openDb();
  const row = await new Promise<DtGraphicLibraryRow | null>((resolve, reject) => {
    const tx = db.transaction(STORE_GRAPHICS, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("get graphic"));
    const r = tx.objectStore(STORE_GRAPHICS).get(gid);
    r.onsuccess = () => resolve((r.result as DtGraphicLibraryRow | undefined) ?? null);
  });
  if (!row) return;
  const next: DtGraphicLibraryRow = { ...row, name: nextName };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GRAPHICS, "readwrite");
    tx.oncomplete = () => {
      notifyGraphicLibraryChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("graphic rename failed"));
    tx.objectStore(STORE_GRAPHICS).put(next);
  });
}

export async function dtGraphicLibraryMoveToFolder(graphicId: string, folderId: string | null): Promise<void> {
  const gid = graphicId.trim();
  if (!gid) return;
  const fid = folderId === null || String(folderId).trim() === "" ? null : String(folderId).trim();
  const db = await openDb();
  const row = await new Promise<DtGraphicLibraryRow | null>((resolve, reject) => {
    const tx = db.transaction(STORE_GRAPHICS, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("get graphic"));
    const r = tx.objectStore(STORE_GRAPHICS).get(gid);
    r.onsuccess = () => resolve((r.result as DtGraphicLibraryRow | undefined) ?? null);
  });
  if (!row) return;
  const next: DtGraphicLibraryRow = { ...row, folderId: fid };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GRAPHICS, "readwrite");
    tx.oncomplete = () => {
      notifyGraphicLibraryChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("move failed"));
    tx.objectStore(STORE_GRAPHICS).put(next);
  });
}

export async function dtGraphicLibraryGet(id: string): Promise<DtGraphicLibraryRow | null> {
  const sid = id.trim();
  if (!sid) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GRAPHICS, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("get failed"));
    const r = tx.objectStore(STORE_GRAPHICS).get(sid);
    r.onsuccess = () => resolve((r.result as DtGraphicLibraryRow | undefined) ?? null);
  });
}

async function readAllFolders(db: IDBDatabase): Promise<DtGraphicLibraryFolderRow[]> {
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FOLDERS, "readonly");
      tx.onerror = () => reject(tx.error ?? new Error("folders tx"));
      const r = tx.objectStore(STORE_FOLDERS).getAll();
      r.onsuccess = () => resolve((r.result as DtGraphicLibraryFolderRow[]) || []);
      r.onerror = () => reject(r.error ?? new Error("folders getAll"));
    });
  } catch {
    return [];
  }
}

/**
 * 用游标逐条读取，只保留列表所需字段，避免 getAll 把每条完整 dataUrl 一次性载入内存（大量 PNG 会卡死页签）。
 */
async function readGraphicsMetaForList(db: IDBDatabase): Promise<DtGraphicLibraryListItem[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GRAPHICS, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("graphics tx"));
    const acc: DtGraphicLibraryListItem[] = [];
    const rq = tx.objectStore(STORE_GRAPHICS).openCursor();
    rq.onerror = () => reject(rq.error ?? new Error("graphics cursor"));
    rq.onsuccess = () => {
      const cur = rq.result;
      if (!cur) {
        resolve(acc);
        return;
      }
      const row = cur.value as DtGraphicLibraryRow;
      const du = row.dataUrl || "";
      const folderIdRaw =
        row.folderId === undefined || row.folderId === null || String(row.folderId).trim() === ""
          ? null
          : String(row.folderId).trim();
      acc.push({
        id: row.id,
        mime: row.mime,
        name: row.name,
        savedAt: row.savedAt,
        dataUrlLen: du.length,
        thumbDataUrl: row.thumbDataUrl,
        folderId: folderIdRaw,
      });
      cur.continue();
    };
  });
}

/** 分两次只读事务拉取，避免单事务内嵌套 getAll 在部分环境下第二段不触发、列表恒为空；顺序执行避免同连接并行只读事务的兼容性问题 */
export async function dtGraphicLibraryList(): Promise<DtGraphicLibraryListItem[]> {
  const db = await openDb();
  const folderRows = await readAllFolders(db);
  const rows = await readGraphicsMetaForList(db);
  const folderName = new Map(folderRows.map((f) => [f.id, f.name]));
  const out: DtGraphicLibraryListItem[] = rows
    .map((row) => {
      const folderId = row.folderId;
      return {
        id: row.id,
        mime: row.mime,
        name: row.name,
        savedAt: row.savedAt,
        dataUrlLen: row.dataUrlLen,
        thumbDataUrl: row.thumbDataUrl,
        folderId,
        folderName: folderId ? folderName.get(folderId) : undefined,
      };
    })
    .sort((a, b) => b.savedAt - a.savedAt);
  return out;
}

export async function dtGraphicLibraryDelete(id: string): Promise<void> {
  const sid = id.trim();
  if (!sid) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GRAPHICS, "readwrite");
    tx.oncomplete = () => {
      notifyGraphicLibraryChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("delete failed"));
    tx.objectStore(STORE_GRAPHICS).delete(sid);
  });
}

/** 批量删除；单事务内连续 delete，完成后派发一次变更事件 */
export async function dtGraphicLibraryDeleteMany(ids: readonly string[]): Promise<void> {
  const uniq = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];
  if (uniq.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GRAPHICS, "readwrite");
    tx.oncomplete = () => {
      notifyGraphicLibraryChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("deleteMany failed"));
    const st = tx.objectStore(STORE_GRAPHICS);
    for (const id of uniq) st.delete(id);
  });
}

/** 批量入库（文件夹导入）：单事务内连续 put，失败则整批 reject */
export async function dtGraphicLibraryPutMany(
  items: ReadonlyArray<{ mime: DtWidgetGraphicAsset["mime"]; name: string; dataUrl: string; folderId?: string | null }>
): Promise<string[]> {
  const rows: DtGraphicLibraryRow[] = [];
  const now = Date.now();
  for (const it of items) {
    const dataUrl = it.dataUrl.trim();
    if (!dataUrl.startsWith("data:")) continue;
    if (dataUrl.length > MAX_GRAPHIC_LIBRARY_DATA_URL_LEN) continue;
    const fid =
      it.folderId === undefined || it.folderId === null || String(it.folderId).trim() === ""
        ? null
        : String(it.folderId).trim();
    const thumb = await buildRasterThumbDataUrl(dataUrl, it.mime);
    rows.push({
      id: newLibraryId(),
      mime: it.mime,
      name: (it.name || "未命名").slice(0, 200),
      dataUrl,
      savedAt: now,
      folderId: fid,
      ...(thumb ? { thumbDataUrl: thumb } : {}),
    });
  }
  if (rows.length === 0) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GRAPHICS, "readwrite");
    tx.oncomplete = () => {
      notifyGraphicLibraryChanged();
      resolve(rows.map((r) => r.id));
    };
    tx.onerror = () => reject(tx.error ?? new Error("putMany failed"));
    const st = tx.objectStore(STORE_GRAPHICS);
    for (const row of rows) st.put(row);
  });
}

/** 兼容仍从本模块解构的旧引用（避免 Vite「Export … is not defined」） */
export { mimeFromGraphicFile } from "./dtGraphicImport";
