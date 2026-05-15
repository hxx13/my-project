import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  DT_GRAPHIC_LIBRARY_CHANGED_EVENT,
  MAX_GRAPHIC_LIBRARY_DATA_URL_LEN,
  dtGraphicLibraryDelete,
  dtGraphicLibraryDeleteMany,
  dtGraphicLibraryFolderCreate,
  dtGraphicLibraryFolderDelete,
  dtGraphicLibraryFolderList,
  dtGraphicLibraryFolderRename,
  dtGraphicLibraryList,
  dtGraphicLibraryMoveToFolder,
  dtGraphicLibraryPut,
  dtGraphicLibraryPutMany,
  dtGraphicLibraryRename,
  type DtGraphicLibraryFolderListItem,
  type DtGraphicLibraryListItem,
} from "@/features/digital-twin-screen/layout/dtGraphicLibraryIdb";
import type { DtWidgetGraphicAsset } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { mimeFromGraphicFile } from "@/features/digital-twin-screen/layout/dtGraphicImport";

function mimeShort(m: DtGraphicLibraryListItem["mime"]): string {
  if (m === "image/svg+xml") return "SVG";
  if (m === "image/png") return "PNG";
  if (m === "image/jpeg") return "JPEG";
  if (m === "image/webp") return "WebP";
  if (m === "image/gif") return "GIF";
  return "图";
}

function LibraryItemThumb({ it }: { it: DtGraphicLibraryListItem }) {
  if (it.thumbDataUrl) {
    return (
      <img
        src={it.thumbDataUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-8 w-8 shrink-0 rounded border border-slate-700/60 bg-slate-900 object-contain [content-visibility:auto]"
        draggable={false}
      />
    );
  }
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-dashed border-slate-600/50 bg-slate-900/80 text-[7px] text-slate-500"
      title="无缩略图（旧数据或 SVG）"
    >
      {it.mime === "image/svg+xml" ? "SVG" : "—"}
    </div>
  );
}

function readFileAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(f);
  });
}

type GraphicLibraryImportUi =
  | null
  | { kind: "running"; pct: number; title: string; detail?: string }
  | { kind: "error"; title: string; detail?: string }
  | { kind: "done"; title: string; detail?: string };

function formatMaxGraphicHint(): string {
  const mb = (MAX_GRAPHIC_LIBRARY_DATA_URL_LEN / 1_000_000).toFixed(1);
  return `单条素材 data URL 上限约 ${mb}M 字符（过大 PNG 会被跳过）`;
}

/** 剪贴板中的文件（截图工具、资源管理器复制图片等） */
function filesFromClipboardEvent(ev: ClipboardEvent): File[] {
  const raw: File[] = [];
  const cd = ev.clipboardData;
  if (!cd) return [];
  const fromItems = Array.from(cd.items || [])
    .filter((it) => it.kind === "file")
    .map((it) => it.getAsFile())
    .filter((f): f is File => f != null);
  raw.push(...fromItems);
  if (cd.files?.length) {
    raw.push(...Array.from(cd.files));
  }
  const seen = new Set<string>();
  const out: File[] = [];
  for (const f of raw) {
    const k = `${f.name}\0${f.size}\0${f.lastModified}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function supportsShowOpenFilePicker(): boolean {
  return typeof window !== "undefined" && typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === "function";
}

function GraphicLibraryRow({
  it,
  folders,
  rowFolderContextId,
  selectedIds,
  onToggleSelect,
  onPickItem,
  refresh,
}: {
  it: DtGraphicLibraryListItem;
  folders: DtGraphicLibraryFolderListItem[];
  /** 本行所在分组：null=根目录列表 */
  rowFolderContextId: string | null;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onPickItem: (id: string) => void;
  refresh: (opts?: { showListSpinner?: boolean }) => void | Promise<unknown>;
}) {
  const onRenameGraphic = () => {
    const cur = it.name || it.id;
    const name = window.prompt("素材显示名称（列表与详情下拉展示；不改素材 id）", cur);
    if (name === null) return;
    void dtGraphicLibraryRename(it.id, name).then(() => void refresh({ showListSpinner: false }));
  };

  return (
    <div className="flex items-center gap-1 [content-visibility:auto] [contain-intrinsic-size:auto_2.25rem]">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-slate-500 accent-cyan-600"
        checked={selectedIds.has(it.id)}
        onChange={() => onToggleSelect(it.id)}
        aria-label={`多选：${it.name || it.id}`}
        title="勾选后可批量删除"
        onClick={(e) => e.stopPropagation()}
      />
      <LibraryItemThumb it={it} />
      <button
        type="button"
        className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-slate-200 hover:bg-cyan-950/50"
        title={it.id}
        onClick={() => onPickItem(it.id)}
      >
        {it.name || it.id}{" "}
        <span className="font-mono text-[8px] text-slate-500">{mimeShort(it.mime)}</span>
      </button>
      <select
        className="max-w-[72px] shrink-0 rounded border border-slate-700 bg-slate-950 px-0.5 py-px text-[7px]"
        title="移到分组"
        value=""
        onChange={(e) => {
          const v = e.target.value;
          e.target.value = "";
          if (!v) return;
          if (v === "__root__") void dtGraphicLibraryMoveToFolder(it.id, null).then(() => void refresh({ showListSpinner: false }));
          else void dtGraphicLibraryMoveToFolder(it.id, v).then(() => void refresh({ showListSpinner: false }));
        }}
      >
        <option value="">移动…</option>
        {rowFolderContextId ? <option value="__root__">→根目录</option> : null}
        {folders
          .filter((f) => f.id !== rowFolderContextId)
          .map((f) => (
            <option key={f.id} value={f.id}>
              →{f.name.slice(0, 6)}
            </option>
          ))}
      </select>
      <button
        type="button"
        className="shrink-0 rounded border border-slate-600/50 px-1 py-px text-[7px] text-slate-300 hover:bg-slate-800/70"
        title="重命名"
        onClick={onRenameGraphic}
      >
        改名
      </button>
      <button
        type="button"
        className="shrink-0 rounded px-1 py-px text-[7px] text-rose-300 hover:bg-rose-950/40"
        title="从库删除"
        onClick={() => {
          if (!window.confirm(`删除素材「${it.name || it.id}」？引用该 id 的场景将显示素材未找到。`)) return;
          void dtGraphicLibraryDelete(it.id).then(() => void refresh({ showListSpinner: false }));
        }}
      >
        删
      </button>
    </div>
  );
}

/** 左侧：本地素材分组、文件/文件夹入库、点击加入画布 */
export function DtGraphicLibrarySidebarPanel({ onPickItem }: { onPickItem: (libraryId: string) => void }) {
  const [folders, setFolders] = useState<DtGraphicLibraryFolderListItem[]>([]);
  const [items, setItems] = useState<DtGraphicLibraryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  /** null = 根目录（未分组），入库目标 */
  const [importFolderId, setImportFolderId] = useState<string | null>(null);
  const [importUi, setImportUi] = useState<GraphicLibraryImportUi>(null);
  const [dropHighlight, setDropHighlight] = useState(false);
  const importDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragDepthRef = useRef(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback((opts?: { showListSpinner?: boolean }) => {
    const spin = opts?.showListSpinner !== false;
    if (spin) setLoading(true);
    return Promise.allSettled([dtGraphicLibraryFolderList(), dtGraphicLibraryList()])
      .then((results) => {
        const [fr, gr] = results;
        if (fr.status === "fulfilled") setFolders(fr.value);
        else setFolders([]);
        if (gr.status === "fulfilled") setItems(gr.value);
        else setItems([]);
        return results;
      })
      .finally(() => {
        if (spin) setLoading(false);
      });
  }, []);

  useEffect(() => {
    void refresh();
    const onLib = () => {
      void refresh({ showListSpinner: false });
    };
    window.addEventListener(DT_GRAPHIC_LIBRARY_CHANGED_EVENT, onLib);
    return () => window.removeEventListener(DT_GRAPHIC_LIBRARY_CHANGED_EVENT, onLib);
  }, [refresh]);

  useEffect(
    () => () => {
      if (importDoneTimerRef.current) clearTimeout(importDoneTimerRef.current);
    },
    []
  );

  const itemsByFolder = useMemo(() => {
    const m = new Map<string | null, DtGraphicLibraryListItem[]>();
    m.set(null, []);
    for (const f of folders) m.set(f.id, []);
    for (const it of items) {
      const k = it.folderId && folders.some((x) => x.id === it.folderId) ? it.folderId : null;
      const arr = m.get(k) ?? m.get(null)!;
      arr.push(it);
    }
    return m;
  }, [folders, items]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const valid = new Set(items.map((x) => x.id));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
      }
      return next;
    });
  }, [items]);

  const toggleGraphicSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const selectAllGraphics = useCallback(() => {
    setSelectedIds(new Set(items.map((x) => x.id)));
  }, [items]);

  const clearGraphicSelection = useCallback(() => setSelectedIds(new Set()), []);

  const batchDeleteSelectedGraphics = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`确定删除选中的 ${ids.length} 条素材？引用这些 id 的场景将显示「素材未找到」。`)) return;
    try {
      await dtGraphicLibraryDeleteMany(ids);
      setSelectedIds(new Set());
      await refresh({ showListSpinner: false });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }, [selectedIds, refresh]);

  const onCreateFolder = () => {
    const name = window.prompt("新建分组名称", "新建分组");
    if (name === null) return;
    void dtGraphicLibraryFolderCreate({ name: name.trim() || "新建分组", parentId: null }).then((id) => {
      setImportFolderId(id);
      refresh();
    });
  };

  const onRenameFolder = (id: string, curName: string) => {
    const name = window.prompt("重命名分组", curName);
    if (name === null) return;
    void dtGraphicLibraryFolderRename(id, name).then(() => {
      void refresh();
    });
  };

  const onDeleteFolder = (id: string, name: string) => {
    if (!window.confirm(`删除分组「${name}」？其中素材将移至根目录，不删除文件本身。`)) return;
    void dtGraphicLibraryFolderDelete(id).then(() => {
      void refresh();
    });
  };

  const ingestFiles = async (files: File[], useRelativePathName: boolean) => {
    if (importDoneTimerRef.current) {
      clearTimeout(importDoneTimerRef.current);
      importDoneTimerRef.current = null;
    }
    let terminalError: { title: string; detail?: string } | null = null;
    let writeOk = false;
    let skipped = 0;
    let skippedMime = 0;
    let skippedRead = 0;
    let skippedData = 0;
    let skippedLarge = 0;
    try {
      setImportUi({
        kind: "running",
        pct: 4,
        title: "1/4 扫描与读取文件",
        detail: `共 ${files.length} 个文件 · 写入目标：${importFolderId ? "当前所选分组" : "根目录"} · ${formatMaxGraphicHint()}`,
      });
      const folderId = importFolderId;
      const batch: { mime: DtWidgetGraphicAsset["mime"]; name: string; dataUrl: string; folderId: string | null }[] = [];
      const n = files.length;
      for (let i = 0; i < n; i++) {
        const f = files[i]!;
        setImportUi({
          kind: "running",
          pct: Math.min(40, 4 + Math.round(((i + 0.35) / Math.max(1, n)) * 36)),
          title: "1/4 读取本地文件（FileReader）",
          detail: `${i + 1}/${n} · ${f.name} · MIME: ${f.type || "（空，将按扩展名推断）"}`,
        });
        const mime = mimeFromGraphicFile(f);
        if (!mime) {
          skipped++;
          skippedMime++;
          continue;
        }
        let dataUrl: string;
        try {
          dataUrl = await readFileAsDataUrl(f);
        } catch {
          skipped++;
          skippedRead++;
          continue;
        }
        if (!dataUrl.startsWith("data:")) {
          skipped++;
          skippedData++;
          continue;
        }
        if (dataUrl.length > MAX_GRAPHIC_LIBRARY_DATA_URL_LEN) {
          skipped++;
          skippedLarge++;
          continue;
        }
        const name = useRelativePathName && (f as File & { webkitRelativePath?: string }).webkitRelativePath
          ? String((f as File & { webkitRelativePath?: string }).webkitRelativePath).replace(/\\/g, "/")
          : f.name;
        batch.push({ mime, name, dataUrl, folderId });
      }
      if (batch.length === 0) {
        const parts: string[] = [];
        if (skippedMime) parts.push(`${skippedMime} 个无法识别为 SVG/PNG/JPEG/WebP/GIF`);
        if (skippedRead) parts.push(`${skippedRead} 个 FileReader 读取失败`);
        if (skippedData) parts.push(`${skippedData} 个读出的内容不是 data URL`);
        if (skippedLarge) parts.push(`${skippedLarge} 个超过素材库单条上限（约 ${(MAX_GRAPHIC_LIBRARY_DATA_URL_LEN / 1_000_000).toFixed(1)}M 字符）`);
        if (parts.length === 0) parts.push("未选中有效文件");
        terminalError = {
          title: "没有进入「写入」步骤",
          detail: `${parts.join("；")}。\n${formatMaxGraphicHint()}。\n常见原因：PNG 解码后 data URL 过长；或文件扩展名/类型被浏览器标成非图片。`,
        };
        return;
      }
      setImportUi({
        kind: "running",
        pct: 48,
        title: "2/4 写入 IndexedDB",
        detail: `${batch.length} 条 → 浏览器库「aro.dt.graphicLibrary」/ graphics`,
      });
      try {
        if (batch.length === 1) {
          await dtGraphicLibraryPut(batch[0]!);
        } else {
          await dtGraphicLibraryPutMany(batch);
        }
        writeOk = true;
        if (skipped > 0) window.alert(`已导入 ${batch.length} 个；跳过 ${skipped} 个。`);
      } catch (e) {
        terminalError = {
          title: "3/4 写入 IndexedDB 失败",
          detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        };
      }
    } catch (e) {
      terminalError = {
        title: "导入过程异常",
        detail: e instanceof Error ? e.message : String(e),
      };
    } finally {
      if (writeOk) {
        setImportUi({
          kind: "running",
          pct: 78,
          title: "4/4 刷新素材列表",
          detail: "从 IndexedDB 重新读取 folders + graphics",
        });
      }
      const results = await refresh({ showListSpinner: false });
      const gr = results[1];
      if (!terminalError && gr.status === "rejected") {
        const err = gr.reason;
        terminalError = {
          title: "4/4 刷新列表失败",
          detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        };
      }
      if (terminalError) {
        setImportUi({ kind: "error", ...terminalError });
      } else if (writeOk) {
        setImportUi({
          kind: "done",
          title: "导入完成",
          detail: "已写入本机素材库；若下面仍为空，请展开「根目录」或对应分组查看。",
        });
        importDoneTimerRef.current = setTimeout(() => {
          importDoneTimerRef.current = null;
          setImportUi(null);
        }, 5200);
      } else {
        setImportUi(null);
      }
    }
  };

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files;
    e.target.value = "";
    if (!fl?.length) return;
    void ingestFiles(Array.from(fl), false);
  };

  const onPickDirectory = (e: ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files;
    e.target.value = "";
    if (!fl?.length) return;
    void ingestFiles(Array.from(fl), true);
  };

  const onDropImportZone = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDropHighlight(false);
    const list = Array.from(e.dataTransfer.files || []);
    if (list.length === 0) return;
    void ingestFiles(list, false);
  };

  const onPasteImportZone = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = filesFromClipboardEvent(e.nativeEvent);
    const imgs = files.filter((f) => mimeFromGraphicFile(f));
    if (imgs.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    void ingestFiles(imgs, false);
  };

  const pickManyViaFileSystemAccess = async () => {
    if (!supportsShowOpenFilePicker()) return;
    try {
      const handles = await (
        window as unknown as {
          showOpenFilePicker: (opts?: {
            multiple?: boolean;
            types?: Array<{ description: string; accept: Record<string, string[]> }>;
          }) => Promise<Array<{ getFile: () => Promise<File> }>>;
        }
      ).showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: "图片",
            accept: {
              "image/png": [".png"],
              "image/jpeg": [".jpg", ".jpeg"],
              "image/webp": [".webp"],
              "image/gif": [".gif"],
              "image/svg+xml": [".svg"],
            },
          },
        ],
      });
      const files: File[] = [];
      for (const h of handles) {
        files.push(await h.getFile());
      }
      if (files.length) void ingestFiles(files, false);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : err instanceof Error ? err.name : "";
      if (name === "AbortError") return;
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  const importOverlay =
    importUi && typeof document !== "undefined"
      ? createPortal(
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto fixed bottom-4 right-4 z-[20000] w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-cyan-900/50 bg-slate-950/98 px-2 py-2 text-[10px] text-slate-100 shadow-2xl ring-1 ring-cyan-500/25 backdrop-blur-sm sm:text-[11px]"
          >
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-cyan-300/90">素材库导入</div>
            {importUi.kind === "running" ? (
              <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-[width] duration-200 ease-out"
                  style={{ width: `${importUi.pct}%` }}
                />
              </div>
            ) : importUi.kind === "done" ? (
              <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div className="h-full w-full rounded-full bg-emerald-600/90" />
              </div>
            ) : null}
            <div className="font-semibold text-slate-50">{importUi.title}</div>
            {importUi.detail ? (
              <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[9px] leading-snug text-slate-400">
                {importUi.detail}
              </pre>
            ) : null}
            {importUi.kind === "running" || importUi.kind === "error" || importUi.kind === "done" ? (
              <button
                type="button"
                className="mt-2 w-full rounded border border-slate-600 bg-slate-900/90 py-1 text-[10px] text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  if (importDoneTimerRef.current) {
                    clearTimeout(importDoneTimerRef.current);
                    importDoneTimerRef.current = null;
                  }
                  setImportUi(null);
                }}
              >
                {importUi.kind === "done" ? "知道了" : importUi.kind === "error" ? "关闭" : "取消 / 关闭浮层"}
              </button>
            ) : null}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="dt-edit-shell-scroll pointer-events-auto flex max-h-[min(48vh,420px)] flex-col gap-1 overflow-y-auto rounded-md border border-slate-600/40 bg-slate-950/55 px-2 py-1.5 text-[10px] text-slate-200 shadow-md sm:text-[11px]">
      <span className="shrink-0 font-semibold text-slate-300">本地图片素材</span>
      <p className="text-[9px] leading-tight text-slate-500">
        入库、分组与删除均在本栏完成；场景仅保存素材 id。导入前请选择目标分组（根目录=未分组）。素材很多时请用分组与批量删除；列表已避免把原图整包进内存，大图仍建议压缩后再导入。
      </p>

      <div className="rounded border border-slate-700/45 bg-slate-900/40 p-1">
        <div className="mb-1 text-[9px] font-semibold text-slate-400">导入到分组</div>
        <select
          className="mb-1 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 text-[10px]"
          value={importFolderId ?? ""}
          onChange={(e) => setImportFolderId(e.target.value === "" ? null : e.target.value)}
        >
          <option value="">根目录（未分组）</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="rounded border border-cyan-800/50 bg-cyan-950/40 px-1.5 py-0.5 text-[9px] text-cyan-100 hover:bg-cyan-900/50"
            onClick={onCreateFolder}
          >
            新建分组
          </button>
          {/* 用 label 激活 file，避免部分环境下 button + input.click() 不弹出选择框、onChange 从不触发 */}
          <label className="inline-flex cursor-pointer items-center rounded border border-slate-600/60 bg-slate-900/40 px-1.5 py-0.5 text-[9px] text-slate-200 hover:bg-slate-800/75">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".svg,.png,.jpg,.jpeg,.webp,.gif,image/svg+xml,image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={onPickFiles}
            />
            选择文件…
          </label>
          <label className="inline-flex cursor-pointer items-center rounded border border-slate-600/60 bg-slate-900/40 px-1.5 py-0.5 text-[9px] text-slate-200 hover:bg-slate-800/75">
            <input
              ref={dirRef}
              type="file"
              multiple
              className="sr-only"
              {...{ webkitdirectory: "" }}
              onChange={onPickDirectory}
            />
            选择文件夹…
          </label>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-label="拖入或粘贴图片以批量入库"
          className={`mt-1.5 select-none rounded-md border-2 border-dashed px-2 py-2 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-500/70 ${
            dropHighlight ? "border-cyan-400/80 bg-cyan-950/35" : "border-slate-600/55 bg-slate-950/50"
          }`}
          onDragEnter={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepthRef.current += 1;
            setDropHighlight(true);
          }}
          onDragLeave={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
            if (dragDepthRef.current === 0) setDropHighlight(false);
          }}
          onDragOver={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={onDropImportZone}
          onPaste={onPasteImportZone}
        >
          <div className="text-[9px] font-semibold text-slate-200">拖放到此处 · 批量入库（推荐）</div>
          <div className="mt-0.5 text-[8px] leading-snug text-slate-500">
            从资源管理器多选 PNG/JPEG/WebP/SVG 拖进来；或先点击本区域再 <kbd className="rounded bg-slate-800 px-0.5">Ctrl+V</kbd> 粘贴截图/复制自文件夹的图片
          </div>
        </div>

        {supportsShowOpenFilePicker() ? (
          <button
            type="button"
            className="mt-1 w-full rounded border border-amber-800/45 bg-amber-950/25 px-1.5 py-1 text-[9px] text-amber-100 hover:bg-amber-900/35"
            title="不经过网页内 file 控件，由系统文件框多选（Chrome / Edge 等）"
            onClick={() => void pickManyViaFileSystemAccess()}
          >
            系统多选文件…（Edge / Chrome）
          </button>
        ) : null}

        <p className="mt-1 text-[8px] leading-snug text-slate-500">
          进度与错误在<strong className="text-slate-400">屏幕右下角浮层</strong>显示。若「选择文件」无反应，请优先用<strong className="text-slate-400">拖放</strong>或<strong className="text-slate-400">系统多选</strong>；勿与上方「自定义图标」混淆。
        </p>
      </div>

      {loading ? (
        <span className="text-[9px] text-slate-500">加载中…</span>
      ) : (
        <div className="space-y-1">
          {items.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 rounded border border-slate-700/50 bg-slate-900/45 px-1 py-1">
              <span className="text-[8px] text-slate-400">
                已选 <span className="font-mono text-cyan-200/90">{selectedIds.size}</span> / {items.length}
              </span>
              <button
                type="button"
                disabled={selectedIds.size === 0}
                className="rounded border border-rose-800/50 bg-rose-950/30 px-1.5 py-px text-[8px] text-rose-100 hover:bg-rose-900/40 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => void batchDeleteSelectedGraphics()}
              >
                批量删除选中
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0}
                className="rounded border border-slate-600/60 px-1.5 py-px text-[8px] text-slate-300 hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={clearGraphicSelection}
              >
                清空选择
              </button>
              <button
                type="button"
                className="rounded border border-cyan-800/45 bg-cyan-950/25 px-1.5 py-px text-[8px] text-cyan-100 hover:bg-cyan-900/35"
                onClick={selectAllGraphics}
              >
                全选素材
              </button>
            </div>
          ) : null}
          {/* 根目录 */}
          <details className="rounded border border-slate-700/50 bg-slate-900/35" open>
            <summary className="cursor-pointer select-none px-1.5 py-1 text-slate-300 hover:bg-slate-800/60">
              根目录（{itemsByFolder.get(null)?.length ?? 0}）
            </summary>
            <div className="flex max-h-[min(24vh,200px)] flex-col gap-0.5 overflow-y-auto border-t border-slate-700/40 px-1 py-1">
              {(itemsByFolder.get(null) ?? []).length === 0 ? (
                <span className="text-[8px] text-slate-500">暂无</span>
              ) : (
                (itemsByFolder.get(null) ?? []).map((it) => (
                  <GraphicLibraryRow
                    key={it.id}
                    it={it}
                    folders={folders}
                    rowFolderContextId={null}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleGraphicSelect}
                    onPickItem={onPickItem}
                    refresh={refresh}
                  />
                ))
              )}
            </div>
          </details>

          {folders.map((folder) => (
            <details key={folder.id} className="rounded border border-slate-700/50 bg-slate-900/35" open>
              <summary className="flex cursor-pointer select-none items-center gap-1 px-1.5 py-1 text-slate-300 hover:bg-slate-800/60">
                <span className="min-w-0 flex-1 truncate">
                  {folder.name}（{itemsByFolder.get(folder.id)?.length ?? 0}）
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded border border-slate-600/50 px-1 py-px text-[8px] text-slate-400 hover:bg-slate-800/70"
                  onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    onRenameFolder(folder.id, folder.name);
                  }}
                >
                  改名
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded border border-rose-900/40 px-1 py-px text-[8px] text-rose-300 hover:bg-rose-950/35"
                  onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    onDeleteFolder(folder.id, folder.name);
                  }}
                >
                  删组
                </button>
              </summary>
              <div className="flex max-h-[min(24vh,200px)] flex-col gap-0.5 overflow-y-auto border-t border-slate-700/40 px-1 py-1">
                {(itemsByFolder.get(folder.id) ?? []).length === 0 ? (
                  <span className="text-[8px] text-slate-500">拖入文件或选文件夹导入到当前分组</span>
                ) : (
                  (itemsByFolder.get(folder.id) ?? []).map((it) => (
                    <GraphicLibraryRow
                      key={it.id}
                      it={it}
                      folders={folders}
                      rowFolderContextId={folder.id}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleGraphicSelect}
                      onPickItem={onPickItem}
                      refresh={refresh}
                    />
                  ))
                )}
              </div>
            </details>
          ))}
        </div>
      )}
      </div>
      {importOverlay}
    </>
  );
}
