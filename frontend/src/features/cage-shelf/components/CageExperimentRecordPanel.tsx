import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Play } from "lucide-react";
import { authHttp } from "@/api/core/authHttp";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isVideoMediaUrl } from "@/features/cage-shelf/constants";
import {
  fetchCageExperimentRecords,
  saveCageExperimentRecord,
  type CageExperimentRecordRow,
  type CageExperimentRecordState,
} from "@/api/domains/cageShelf.api";

/**
 * 笼位实验记录台账（追加式）—— 学生端笼位详情 / 移动端详情弹窗共用。
 *
 * <p>规则（产品口径）：
 *  - 一条记录一个时间戳，**提交后只读**，没有编辑/删除入口；
 *  - 每次新增都是**另起一条**，不是改上一条；
 *  - 一次只能有一条草稿：草稿未提交时不出「新增记录」，只能接着写或提交；
 *  - 不是实验员本人 → 服务端不下发内容，这里只渲染 *** 占位。
 */
export default function CageExperimentRecordPanel({ animalCageId }: { animalCageId: number | string | null }) {
  const [state, setState] = useState<CageExperimentRecordState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  /** 历史记录折叠态：默认折叠，点标题栏展开（记录多时不该把新增入口顶下去） */
  const [histOpen, setHistOpen] = useState(false);
  /** 「查看」弹窗里那条记录（长文本/多张照片的完整内容） */
  const [viewRecord, setViewRecord] = useState<CageExperimentRecordRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** 已经回填过的草稿 id：避免重载把用户正在敲的字冲掉 */
  const hydratedDraftId = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (animalCageId == null || animalCageId === "") {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setState(await fetchCageExperimentRecords(animalCageId));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载实验记录失败");
    } finally {
      setLoading(false);
    }
  }, [animalCageId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const d = state?.draft;
    if (!d) {
      hydratedDraftId.current = null;
      setOpen(false);
      setContent("");
      setImages([]);
      return;
    }
    if (hydratedDraftId.current === d.id) return;
    hydratedDraftId.current = d.id;
    setOpen(true);
    setContent(d.content ?? "");
    setImages(parseImages(d.imagesJson));
  }, [state?.draft]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) continue;
        const fd = new FormData();
        fd.append("file", f);
        // 学生账号默认不能传视频；实验记录是允许的例外，后端按这个用途放行
        fd.append("purpose", "experiment-record");
        const r = await authHttp.post("/upload", fd);
        if (r.data?.success && r.data.data?.url) urls.push(r.data.data.url);
      }
      if (urls.length) setImages((prev) => [...prev, ...urls]);
    } catch {
      toast.error("图片/视频上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doSave = async (action: "draft" | "submit") => {
    if (animalCageId == null || animalCageId === "") return;
    if (action === "submit" && !content.trim() && images.length === 0) {
      toast.error("请先填写文字或添加照片");
      return;
    }
    setSaving(action);
    try {
      setState(await saveCageExperimentRecord(animalCageId, action, content, JSON.stringify(images)));
      toast.success(action === "submit" ? "已新增一条实验记录" : "草稿已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(null);
    }
  };

  if (loading && !state) {
    return <div className="py-3 text-center text-[11px] text-[var(--student-mute)]">加载实验记录…</div>;
  }
  if (err) return <div className="py-3 text-[11px] text-[var(--student-error)]">{err}</div>;
  if (!state) return null;

  if (!state.canView) {
    return (
      <div className="rounded-lg border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-2">
        <div className="text-[12px] font-semibold text-[var(--student-mute)]">📝 实验记录</div>
        <div className="mt-1 text-[12px] text-[var(--student-mute)]">
          *** <span className="text-[10px]">（仅该笼位实验员本人可查看）</span>
        </div>
      </div>
    );
  }

  const canAddNew = state.canWrite && !state.draft;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setHistOpen((v) => !v)}
          className="flex min-w-0 items-center gap-1 text-left"
          title={histOpen ? "折叠历史记录" : "展开历史记录"}
        >
          <span className="text-[10px] text-[var(--student-mute)]">{histOpen ? "▾" : "▸"}</span>
          <span className="text-[12px] font-semibold text-[var(--student-mute)]">
            📝 实验记录
            <span className="ml-1 text-[10px] font-normal">
              （历史 {state.records.length} 条 · 提交后只读）
            </span>
          </span>
        </button>
        {canAddNew && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-full border border-[var(--student-primary)] px-3 py-1 text-[11px] font-medium text-[var(--student-primary)]"
          >
            + 新增记录
          </button>
        )}
      </div>

      {histOpen && (
        state.records.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--student-hairline)] px-3 py-2 text-[11px] text-[var(--student-mute)]">
            还没有实验记录
          </div>
        ) : (
          state.records.map((r) => (
            <RecordRow key={r.id} row={r} onPreview={setPreview} onView={setViewRecord} />
          ))
        )
      )}

      {state.canWrite && open && (
        <div className="rounded-lg border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] p-3 space-y-2">
          <div className="text-[10px] text-[var(--student-mute)]">
            {state.draft ? "继续编辑草稿（提交前不能新增下一条）" : "新增实验记录"}
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="记录本次实验内容…"
            className="w-full rounded-lg border border-[var(--student-hairline)] px-3 py-2 text-[12px] resize-y bg-[var(--student-surface)]"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {images.map((url, i) => (
              <MediaThumb key={`${url}:${i}`} url={url} className="h-14 w-14 rounded" onClick={() => setPreview(url)} />
            ))}
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="h-14 w-14 rounded border border-dashed border-[var(--student-hairline)] text-[18px] text-[var(--student-mute)] disabled:opacity-50"
              title="添加照片/视频"
            >
              {uploading ? "…" : "+"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="sr-only"
              onChange={(e) => void handleUpload(e.target.files)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!!saving}
              onClick={() => void doSave("submit")}
              className="rounded-lg bg-[var(--student-primary)] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            >
              {saving === "submit" ? "提交中…" : "提交记录"}
            </button>
            <button
              type="button"
              disabled={!!saving}
              onClick={() => void doSave("draft")}
              className="rounded-lg border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-1.5 text-[12px] font-medium text-[var(--student-ink)] disabled:opacity-50"
            >
              {saving === "draft" ? "保存中…" : "保存草稿"}
            </button>
            <span className="text-[10px] text-[var(--student-mute)]">提交后不可编辑、不可删除</span>
          </div>
        </div>
      )}

      <Dialog open={preview !== null} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-[min(1100px,94vw)] overflow-hidden border-0 bg-black p-0 [&>button]:text-white">
          <DialogTitle className="sr-only">{isVideoMediaUrl(preview) ? "视频预览" : "照片预览"}</DialogTitle>
          <DialogDescription className="sr-only">点击右上角关闭</DialogDescription>
          {preview && (isVideoMediaUrl(preview) ? (
            <video src={preview} controls autoPlay playsInline className="max-h-[86vh] w-full bg-black object-contain" />
          ) : (
            <img src={preview} alt="预览" className="max-h-[86vh] w-full object-contain" />
          ))}
        </DialogContent>
      </Dialog>

      {viewRecord && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setViewRecord(null)}>
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--student-hairline)] bg-[var(--student-surface)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--student-hairline)] px-4 py-3">
              <div>
                <div className="text-[12px] font-semibold tabular-nums text-[var(--student-ink)]">
                  {fmtTime(viewRecord.submittedAt ?? viewRecord.createdAt)}
                </div>
                <div className="text-[10px] text-[var(--student-mute)]">
                  记录人：{viewRecord.authorName}
                  {viewRecord.status === "ARCHIVED" && " · 已归档"}
                </div>
              </div>
              <button
                onClick={() => setViewRecord(null)}
                className="rounded-md p-1 text-lg leading-none text-[var(--student-mute)] hover:bg-[var(--student-canvas-soft)]"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {viewRecord.content ? (
                <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--student-ink)]">{viewRecord.content}</div>
              ) : (
                <div className="text-[12px] text-[var(--student-mute)]">（本条只有照片）</div>
              )}
              <ViewPhotos row={viewRecord} onPreview={setPreview} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 实验记录里的媒体缩略：图片直接显示，视频显示首帧 + 播放标记 */
function MediaThumb({ url, className = "", onClick }: { url: string; className?: string; onClick: () => void }) {
  const video = isVideoMediaUrl(url);
  return (
    <button type="button" onClick={onClick} title={video ? "点击播放视频" : "点击查看大图"}
      className={`relative block cursor-pointer overflow-hidden border border-[var(--student-hairline)] ${className}`}>
      {video ? (
        <>
          <video src={url} muted preload="metadata" className="pointer-events-none h-full w-full object-cover" />
          <span className="absolute inset-0 grid place-items-center bg-black/35 text-white">
            <Play className="size-4" fill="currentColor" />
          </span>
        </>
      ) : (
        <img src={url} alt="" className="h-full w-full object-cover" />
      )}
    </button>
  );
}

/** 「查看」弹窗里的照片：大图网格，点开还是走同一个预览器 */
function ViewPhotos({ row, onPreview }: { row: CageExperimentRecordRow; onPreview: (url: string) => void }) {
  const imgs = parseImages(row.imagesJson);
  if (imgs.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[10px] text-[var(--student-mute)]">照片/视频（{imgs.length}）</div>
      <div className="grid grid-cols-3 gap-2">
        {imgs.map((url, i) => (
          <MediaThumb key={`${url}:${i}`} url={url} className="aspect-square w-full rounded-lg" onClick={() => onPreview(url)} />
        ))}
      </div>
    </div>
  );
}

function RecordRow({
  row,
  onPreview,
  onView,
}: {
  row: CageExperimentRecordRow;
  onPreview: (url: string) => void;
  onView: (row: CageExperimentRecordRow) => void;
}) {
  const imgs = parseImages(row.imagesJson);
  return (
    <div className="rounded-lg border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tabular-nums text-[var(--student-ink)]">
          {fmtTime(row.submittedAt ?? row.createdAt)}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--student-mute)]">{row.authorName}</span>
          {/* 内容可能很长、照片可能很多 —— 列表里只给摘要，全文看「查看」弹窗 */}
          <button
            type="button"
            onClick={() => onView(row)}
            className="rounded border border-[var(--student-hairline)] bg-[var(--student-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--student-primary)] hover:bg-[var(--student-canvas-soft)]"
          >
            查看
          </button>
        </span>
      </div>
      {row.content && (
        <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] text-[var(--student-ink)]">{row.content}</div>
      )}
      {imgs.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {imgs.slice(0, 6).map((url, i) => (
            <MediaThumb key={`${url}:${i}`} url={url} className="h-14 w-14 rounded" onClick={() => onPreview(url)} />
          ))}
          {imgs.length > 6 && (
            <button
              type="button"
              onClick={() => onView(row)}
              className="h-14 w-14 rounded border border-dashed border-[var(--student-hairline)] text-[10px] text-[var(--student-mute)]"
            >
              +{imgs.length - 6}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** images_json 可能是 null / 非法串 / 非数组，一律折成字符串数组 */
function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.replace("T", " ").slice(0, 16);
}
