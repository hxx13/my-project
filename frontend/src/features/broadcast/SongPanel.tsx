import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Upload, Plus, Pencil, Trash2, FolderInput, X, ChevronRight } from "lucide-react";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFilePickButton } from "@/components/admin/AdminFilePickButton";
import {
  createSongList,
  deleteSongList,
  moveSongsToList,
  removeSongFromList,
  renameSongList,
  uploadSongs,
  type MoveOutcome,
  type SongListView,
  type SongView,
  type UploadOutcome,
} from "@/api/domains/broadcast.api";
import { blockBodyClass, blockHeadClass, blockTitleClass, panelClass } from "./ui";

export interface PickedSong {
  pathName: string;
  fileName: string;
  listId: string;
}

/**
 * 音乐列表（页面右栏，主体）。**单选** —— 播放是从某一首开始，平台会自己接着放完整个列表。
 *
 * 列表（也就是文件夹）可以新建/改名/删除；曲目可以移出或移到别的列表。
 * **任何操作都不会删音频文件** —— 后端把平台那个能连文件一起删的开关固定关掉了。
 */
export default function SongPanel({
  lists,
  loading,
  songPath,
  onPick,
}: {
  lists: SongListView[];
  loading: boolean;
  songPath: string;
  onPick: (song: PickedSong) => void;
}) {
  const qc = useQueryClient();
  const [uploadListId, setUploadListId] = useState("");
  /** 待移动的曲目（支持批量）；null = 没在移动 */
  const [moving, setMoving] = useState<{ songs: { pathName: string; fileName: string; listId: string }[] } | null>(
    null,
  );
  /** 勾选的曲目路径 —— 批量移动用 */
  const [checked, setChecked] = useState<Set<string>>(new Set());
  /** 折叠的列表编号：点列表头收起/展开曲目 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleChecked = (pathName: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(pathName)) next.delete(pathName);
      else next.add(pathName);
      return next;
    });
  };

  /** 勾选的曲目按所属列表分组 —— 移动是按「源列表 → 目标列表」做的 */
  const checkedGroups = () => {
    const groups = new Map<string, { pathName: string; fileName: string; listId: string }[]>();
    for (const l of lists) {
      for (const s of l.songs) {
        if (!checked.has(s.pathName)) continue;
        const g = groups.get(l.id) ?? [];
        g.push({ pathName: s.pathName, fileName: s.fileName, listId: l.id });
        groups.set(l.id, g);
      }
    }
    return groups;
  };

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!uploadListId && lists.length > 0) {
      setUploadListId(lists[0].id);
    }
  }, [lists, uploadListId]);

  // 曲库操作只刷曲库，不连累分区列表
  const invalidate = () => qc.invalidateQueries({ queryKey: ["broadcast", "songLists"] });
  /**
   * 曲库操作后稍等一下再重读：平台写 Playlist 文件是**异步**的（实测 2~3 秒落定），
   * 立刻重读会拿回旧列表 —— 表现就是刚移动/上传完，再看还是原样，接着操作就报「目标不存在」。
   */
  const invalidateSoon = () => window.setTimeout(invalidate, 1800);

  // 上传**逐个文件发请求**，不把多个文件塞进同一个 multipart：
  // 服务端的请求体上限是按整个请求算的，几首大一点的歌加起来很容易撞线
  // （实测 3 个文件 61MB 就超了 35MB 的请求上限）。逐个发也让失败按文件归责。
  const uploadMut = useMutation({
    mutationFn: async (files: File[]) => {
      const out: UploadOutcome[] = [];
      for (const f of files) {
        try {
          const rows = await uploadSongs(uploadListId, [f]);
          out.push(...rows);
        } catch (e) {
          out.push({ fileName: f.name, size: f.size, success: false, message: (e as Error).message || "上传失败" });
        }
      }
      return out;
    },
    onSuccess: (rows) => {
      const ok = rows.filter((r) => r.success).length;
      if (ok === rows.length) {
        toast.success(`已上传 ${ok} 首`);
      } else {
        // 把每一首失败的原因都摆出来 —— 只报「0/1」等于没说
        const first = rows.find((r) => !r.success);
        toast.error(
          `${ok}/${rows.length} 成功` + (first ? `；「${first.fileName}」${first.message || "失败"}` : ""),
          { duration: 8000 },
        );
      }
      invalidateSoon();
    },
    onError: (e: Error) => toast.error(e.message || "上传失败"),
  });

  const opMut = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => invalidateSoon(),
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });

  async function onCreateList() {
    const name = await appPrompt("新列表名称", "");
    if (name === null || !name.trim()) return;
    opMut.mutate(async () => {
      await createSongList(name.trim());
      toast.success("已新建列表");
    });
  }

  async function onRenameList(listId: string, oldName: string) {
    const name = await appPrompt("列表新名称", oldName);
    if (name === null || !name.trim() || name.trim() === oldName) return;
    opMut.mutate(async () => {
      await renameSongList(listId, name.trim());
      toast.success("已改名");
    });
  }

  async function onDeleteList(listId: string, name: string, count: number) {
    const extra = count > 0 ? `（列表里有 ${count} 首，曲目本身不会被删）` : "";
    if (!(await appConfirm(`确定删除列表「${name}」？${extra}`, { danger: true }))) return;
    opMut.mutate(async () => {
      await deleteSongList(listId);
      toast.success("已删除列表");
    });
  }

  async function onRemoveSong(listId: string, song: SongView) {
    if (!(await appConfirm(`从列表移出「${song.fileName}」？（音频文件保留）`))) return;
    opMut.mutate(async () => {
      await removeSongFromList(listId, song.pathName);
      toast.success("已移出列表");
    });
  }

  return (
    <div className={panelClass}>
      <div className={blockHeadClass}>
        <span className={blockTitleClass}>音乐列表</span>
        <span className="flex items-center gap-1.5">
          {checked.size > 0 ? (
            <AdminButton
              tone="primary"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const groups = checkedGroups();
                setMoving({ songs: [...groups.values()].flat() });
              }}
            >
              <FolderInput className="mr-1 h-3.5 w-3.5" />
              移动所选 ({checked.size})
            </AdminButton>
          ) : null}
          <AdminButton tone="secondary" className="h-7 px-2 text-xs" onClick={onCreateList}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            新建列表
          </AdminButton>
          <AdminSelect
            className="h-7 max-w-[120px] text-xs"
            value={uploadListId}
            onChange={(e) => setUploadListId(e.target.value)}
            disabled={lists.length === 0}
            title="上传到哪个列表"
          >
            {lists.length === 0 ? <option value="">无列表</option> : null}
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </AdminSelect>
          {/* 两处都在给共用组件打补丁，原因都是它「只顾图片场景」：
              ① [&>svg]:hidden —— 内部硬编码了一个「图片+」图标，传 audio/* 也照画；
              ② [&>span]:flex —— 组件内部只用一个裸 span 包内容，而 Tailwind 基础样式
                 把 svg 设成 display:block，图标和文字会各占一行。 */}
          <AdminFilePickButton
            accept="audio/*,.mp3,.wav"
            multiple
            disabled={!uploadListId || uploadMut.isPending}
            className="min-h-[28px] shrink-0 whitespace-nowrap px-2 text-xs [&>svg]:hidden [&>span]:flex [&>span]:items-center"
            onFiles={(files) => {
              if (files && files.length > 0) uploadMut.mutate(Array.from(files));
            }}
          >
            <Upload className="mr-1 h-3.5 w-3.5" />
            {uploadMut.isPending ? "上传中…" : "上传"}
          </AdminFilePickButton>
        </span>
      </div>

      <div className={blockBodyClass}>
        {loading ? (
          <div className="px-3 py-4 text-sm text-[var(--app-color-text-tertiary)]">加载中…</div>
        ) : lists.length === 0 ? (
          <div className="px-3 py-4 text-sm text-[var(--app-color-text-tertiary)]">
            还没有曲库列表，点右上「新建列表」
          </div>
        ) : (
          lists.map((l) => (
            <div key={l.id} className="group/list">
              <div
                className="sticky top-0 z-10 flex cursor-pointer select-none items-center justify-between border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs text-[var(--app-color-text-secondary)]"
                onClick={() => toggleCollapse(l.id)}
              >
                <span className="flex items-center gap-1">
                  <ChevronRight
                    className={"h-3.5 w-3.5 shrink-0 transition-transform" + (collapsed.has(l.id) ? "" : " rotate-90")}
                  />
                  <span className="font-medium">{l.name}</span>
                </span>
                <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <span>{l.songCount} 首</span>
                  <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover/list:opacity-100">
                    <button
                      type="button"
                      className="rounded p-0.5 hover:bg-[var(--app-color-surface-hover)]"
                      title="列表改名"
                      onClick={() => onRenameList(l.id, l.name)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-0.5 text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-surface-hover)]"
                      title="删除列表（曲目不删）"
                      onClick={() => onDeleteList(l.id, l.name, l.songCount)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </span>
              </div>
              {!collapsed.has(l.id) && (l.songs.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[var(--app-color-text-tertiary)]">（空）</div>
              ) : (
                <div className="space-y-1 p-1">
                  {l.songs.map((s: SongView) => {
                    const active = s.pathName === songPath;
                    return (
                      <div
                        key={s.pathName}
                        className={
                          "group/row flex w-full items-center gap-2 rounded-[10px] px-3 py-1.5 text-sm transition-colors " +
                          (active
                            ? "bg-[var(--app-color-accent)] font-medium text-white shadow-[0_2px_10px_rgba(37,99,235,0.28)]"
                            : "hover:bg-[var(--app-color-surface-hover)]")
                        }
                        title={s.pathName}
                      >
                        {/* 批量移动用。点它不触发「选这首播放」 */}
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 shrink-0"
                          checked={checked.has(s.pathName)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleChecked(s.pathName)}
                          aria-label={`勾选 ${s.fileName}`}
                        />
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => onPick({ pathName: s.pathName, fileName: s.fileName, listId: l.id })}
                        >
                          <span className="w-3 shrink-0">{active ? "▶" : ""}</span>
                          <span className="min-w-0 flex-1 truncate">{s.fileName}</span>
                          {s.durationSeconds ? (
                            <span
                              className="shrink-0 text-xs"
                              style={{ color: active ? "#dbeafe" : "var(--app-color-text-tertiary)" }}
                            >
                              {Math.floor(s.durationSeconds / 60)}:{String(s.durationSeconds % 60).padStart(2, "0")}
                            </span>
                          ) : null}
                        </button>
                        <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100">
                          <button
                            type="button"
                            className={
                              "rounded p-0.5 " +
                              (active ? "hover:bg-white/20" : "hover:bg-[var(--app-color-surface-container)]")
                            }
                            title="移到别的列表"
                            onClick={() =>
                              setMoving({ songs: [{ pathName: s.pathName, fileName: s.fileName, listId: l.id }] })
                            }
                          >
                            <FolderInput className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className={
                              "rounded p-0.5 " +
                              (active
                                ? "text-white hover:bg-white/20"
                                : "text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-surface-container)]")
                            }
                            title="从列表移出（音频文件保留）"
                            onClick={() => onRemoveSong(l.id, s)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <MoveSongDialog
        moving={moving}
        lists={lists}
        onClose={() => setMoving(null)}
        onConfirm={(toListId) => {
          const m = moving;
          if (!m) return;
          opMut.mutate(async () => {
            // 按源列表分组调用：平台的一次移动只针对一个源列表
            const byList = new Map<string, string[]>();
            for (const s of m.songs) {
              const arr = byList.get(s.listId) ?? [];
              arr.push(s.pathName);
              byList.set(s.listId, arr);
            }
            const rows: MoveOutcome[] = [];
            for (const [from, paths] of byList) {
              rows.push(...(await moveSongsToList(from, toListId, paths)));
            }
            const ok = rows.filter((r) => r.success).length;
            if (ok === rows.length) {
              toast.success(`已移动 ${ok} 首`);
            } else {
              const first = rows.find((r) => !r.success);
              toast.error(
                `${ok}/${rows.length} 成功` + (first ? `；「${first.fileName}」${first.message || "失败"}` : ""),
                { duration: 8000 },
              );
            }
            setChecked(new Set());
            setMoving(null);
          });
        }}
      />
    </div>
  );
}

/** 移动曲目：选个目标列表即可（目标不能是任何一个源列表）。 */
function MoveSongDialog({
  moving,
  lists,
  onClose,
  onConfirm,
}: {
  moving: { songs: { pathName: string; fileName: string; listId: string }[] } | null;
  lists: SongListView[];
  onClose: () => void;
  onConfirm: (toListId: string) => void;
}) {
  const sourceIds = new Set(moving?.songs.map((s) => s.listId) ?? []);
  const targets = lists.filter((l) => !sourceIds.has(l.id));
  const [to, setTo] = useState("");

  useEffect(() => {
    setTo(targets[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving]);

  if (!moving) return null;
  const n = moving.songs.length;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[420px] max-w-[94vw] gap-3 p-4">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {n === 1 ? `移动「${moving.songs[0].fileName}」` : `移动所选 ${n} 首`}
          </DialogTitle>
        </DialogHeader>
        {targets.length === 0 ? (
          <div className="text-sm text-[var(--app-color-text-tertiary)]">
            只有这一个列表，先新建一个再移动。
          </div>
        ) : (
          <AdminSelect className="w-full" value={to} onChange={(e) => setTo(e.target.value)}>
            {targets.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}（{l.songCount} 首）
              </option>
            ))}
          </AdminSelect>
        )}
        <DialogFooter>
          <AdminButton tone="secondary" onClick={onClose}>
            取消
          </AdminButton>
          <AdminButton tone="primary" disabled={!to} onClick={() => onConfirm(to)}>
            移动到这里
          </AdminButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
