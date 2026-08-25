import { useState, useEffect, useCallback, useRef } from "react";
import { Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { authHttp } from "@/api/core/authHttp";
import type { CageShelfCell } from "@/api/domains/cageShelf.api";
import CageFormFill from "@/features/cage-shelf/components/CageFormFill";
import { CAGE_BOX_ACTIONS, actionsFromFormValues } from "@/features/cage-shelf/constants";
import { DEFAULT_COLORS } from "@/features/cage-shelf/components/CageColorContext";
import { fetchCageInfoValues, type CageInfoValueRow } from "@/features/cage-shelf/api/cageForm.api";

const CAGE_TYPE_COLORS: Record<number, { bg: string; border: string; label: string }> = {
  1: { bg: "var(--student-warning-soft)", border: "var(--student-warning)", label: "等待分配" },
  2: { bg: "var(--student-success-soft)", border: "var(--student-success)", label: "已预约(空笼盒)" },
  3: { bg: "var(--student-error-soft)", border: "var(--student-error)", label: "饲养中" },
  4: { bg: "var(--student-accent-telemetry-soft)", border: "var(--student-accent-telemetry)", label: "异常" },
};

interface CellDetailPanelProps {
  cell: CageShelfCell | null;
  gridMeta: {
    campusName?: string; areaName?: string; floorName?: string; roomName?: string; shelveName?: string; shelveId?: string;
  } | null;
  shelveId: string;
  onClose: () => void;
}

export function CellDetailPanel({ cell, gridMeta, shelveId, onClose }: CellDetailPanelProps) {
  const detail = (cell as any)?.detail as Record<string, any> | undefined;
  const animalCageId = String((cell as any)?.id ?? detail?.animalCageId ?? (cell as any)?.animalCageId ?? "");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [statusPhotos, setStatusPhotos] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [formValues, setFormValues] = useState<CageInfoValueRow[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 拉取表单值(cage_info_value)：状态标记唯一真相源，据此渲染状态 chips
  useEffect(() => {
    if (!animalCageId) { setFormValues(null); return; }
    let cancelled = false;
    fetchCageInfoValues(animalCageId).then(rows => { if (!cancelled) setFormValues(rows); }).catch(() => { if (!cancelled) setFormValues(null); });
    return () => { cancelled = true; };
  }, [animalCageId]);

  // 加载已有笔记和照片（通道一: statusPhotos, 通道二: imagesJson）
  useEffect(() => {
    if (!animalCageId) { setNotes(""); setImages([]); setStatusPhotos({}); return; }
    let cancelled = false;
    authHttp.get(`/local/annotate/${animalCageId}`).then(r => {
      if (cancelled) return;
      if (r.data?.success) {
        const d = r.data.data;
        setNotes(d?.experimentDesc ?? "");
        try {
          const raw = d?.imagesJson;
          if (typeof raw === "string") { const arr = JSON.parse(raw); if (Array.isArray(arr)) setImages(arr); }
          else setImages([]);
        } catch { setImages([]); }
        // 通道一：状态标记照片（只读，admin编辑模式上传）
        if (d?.statusPhotos) {
          try {
            const sp = typeof d.statusPhotos === "string" ? JSON.parse(d.statusPhotos) : d.statusPhotos;
            if (sp && typeof sp === "object" && !Array.isArray(sp)) setStatusPhotos(sp as Record<string, string[]>);
          } catch { setStatusPhotos({}); }
        } else {
          setStatusPhotos({});
        }
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [animalCageId]);

  // 合并双通道照片用于 URL 驱动预览
  const allPreviewUrls: string[] = [];
  const allPreviewLabels: string[] = [];
  Object.entries(statusPhotos).forEach(([key, urls]) => {
    urls.forEach(url => { allPreviewUrls.push(url); allPreviewLabels.push(`状态标记 · ${key}`); });
  });
  images.forEach(url => { allPreviewUrls.push(url); allPreviewLabels.push("实验记录照片"); });
  const curPreviewIdx = previewUrl ? allPreviewUrls.indexOf(previewUrl) : -1;
  const previewLabel = curPreviewIdx >= 0 ? allPreviewLabels[curPreviewIdx] : "";
  const hasPrev = curPreviewIdx > 0;
  const hasNext = curPreviewIdx >= 0 && curPreviewIdx < allPreviewUrls.length - 1;

  const handleSave = useCallback(async () => {
    if (!animalCageId) return;
    setSaving(true); setSaveMsg(null);
    try {
      await authHttp.post("/local/annotate", { animalCageId, experimentDesc: notes, imagesJson: JSON.stringify(images) });
      setSaveMsg({ type: "ok", text: "保存成功" });
    } catch (e: any) {
      setSaveMsg({ type: "err", text: e?.message || "保存失败" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 2000);
    }
  }, [animalCageId, notes, images]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        if (!files[i].type.startsWith("image/")) continue;
        const fd = new FormData();
        fd.append("file", files[i]);
        const r = await authHttp.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        if (r.data?.success && r.data.data?.url) urls.push(r.data.data.url);
      }
      if (urls.length) setImages(prev => [...prev, ...urls]);
    } catch { setSaveMsg({ type: "err", text: "图片上传失败" }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }, []);

  if (!cell) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-xl border border-[var(--student-hairline)] bg-[var(--app-color-surface-container)] p-6">
        <div className="text-center text-[13px] text-[var(--student-mute)]">点击笼盒查看详情</div>
      </div>
    );
  }

  const ct = detail?.cageTypeCode;
  const typeInfo = CAGE_TYPE_COLORS[ct as number];
  // 状态 chips：以表单为真相源，只列已开启的状态（无合笼日期指示）
  const activeActions = actionsFromFormValues(formValues);
  const statusChips = CAGE_BOX_ACTIONS.filter(a => activeActions.has(a.action));

  return (
    <div className="flex-1 flex flex-col rounded-xl border border-[var(--student-hairline)] bg-[var(--app-color-surface-container)] overflow-hidden min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--student-hairline)] px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          {typeInfo && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: typeInfo.bg, color: typeInfo.border, border: `1px solid ${typeInfo.border}` }}>
              {typeInfo.label}
            </span>
          )}
          <span className="text-sm font-semibold text-[var(--student-ink)]">{cell.position.replace(/^([A-H])-(\d+)$/, (_,l:any,n:any)=>`${l}-${11-parseInt(n)}`).replace(/^(\d+)-(\d+)$/, (_,x:any,y:any)=>`${String.fromCharCode(64+parseInt(x))}-${11-parseInt(y)}`)}</span>
        </div>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-[var(--student-canvas-soft)]">
          <span className="text-lg text-[var(--student-mute)]">&times;</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* 关键信息表单(直接读表单,与 web 端一致) */}
        <CageFormFill animalCageId={animalCageId || null} />

        {/* Status chips */}
        {statusChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {statusChips.map(a => {
              const c = DEFAULT_COLORS[a.statusCode] ?? { bg: "#ccc", border: "#999" };
              return (
                <span key={a.action} className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: `${c.bg}18`, color: c.border, border: `1px solid ${c.border}40` }}>
                  {a.label}
                </span>
              );
            })}
            {detail?.specialBreedingName && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--student-error-soft)] text-[var(--student-error)] border border-[var(--student-error-soft)]">{detail.specialBreedingName}</span>}
            {detail?.specialBreedingDesc && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--student-error-soft)] text-[var(--student-error)] border border-[var(--student-error-soft)]">{detail.specialBreedingDesc}</span>}
          </div>
        )}

        {/* Location */}
        {gridMeta && (
          <div className="text-[11px] text-[var(--student-mute)]">
            📍 {[gridMeta.campusName, gridMeta.areaName, gridMeta.floorName, gridMeta.roomName].filter(Boolean).join(" / ")}
          </div>
        )}

        <div className="border-t border-[var(--student-hairline)]" />

        {/* 状态标记照片（通道一：admin编辑模式上传，Student端只读） */}
        {Object.keys(statusPhotos).length > 0 && (
          <div className="rounded-lg bg-[var(--app-color-surface-hover)] p-3 space-y-2">
            <div className="text-[12px] font-semibold text-[var(--student-mute)]">📸 状态标记照片</div>
            {Object.entries(statusPhotos).map(([key, urls]) => (
              <div key={key}>
                <div className="text-[10px] text-[var(--student-mute)] mb-1">{key}</div>
                <div className="flex flex-wrap gap-1.5">
                  {urls.map((url, i) => (
                    <img key={i} src={url} alt="" onClick={() => setPreviewUrl(url)}
                      className="h-14 w-14 object-cover rounded border border-[var(--student-hairline)] cursor-pointer" />
                  ))}
                </div>
              </div>
            ))}
            <div className="text-[10px] italic text-[var(--student-mute)]">通过编辑模式管理</div>
          </div>
        )}

        {/* Notes */}
        <div>
          <div className="text-[12px] font-semibold text-[var(--student-mute)] mb-1.5">📝 实验记录</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="输入备注..."
            className="w-full rounded-lg border border-[var(--student-hairline)] px-3 py-2 text-[12px] resize-y bg-[var(--student-canvas-soft)]" />
        </div>

        {/* 实验记录照片（通道二：Student端可增删） */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-semibold text-[var(--student-mute)]">🧪 实验记录照片 ({images.length})</span>
            <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
              className="rounded-full border border-[var(--student-primary)] px-3 py-1 text-[11px] font-medium text-[var(--student-primary)] disabled:opacity-50">
              {uploading ? "上传中…" : "+ 添加照片"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only"
              onChange={e => void handleUpload(e.target.files)} />
          </div>
          {images.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {images.map((url, i) => (
                <div key={i} className="relative group">
                  <img src={url} alt="" onClick={() => setPreviewUrl(url)}
                    className="h-14 w-14 object-cover rounded border border-[var(--student-hairline)] cursor-pointer" />
                  <button
                    onClick={(e) => { e.stopPropagation(); setImages(prev => prev.filter((_, j) => j !== i)); }}
                    className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-[var(--student-error)] text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity leading-none"
                  >&times;</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-1">
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--student-primary)] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50">
            <Save className="size-4" /> {saving ? "保存中…" : "保存"}
          </button>
          {saveMsg && <span className={cn("text-[12px]", saveMsg.type === "ok" ? "text-[var(--student-success)]" : "text-[var(--student-error)]")}>{saveMsg.text}</span>}
        </div>
      </div>

      {/* Photo preview (URL驱动，合并双通道) */}
      {previewUrl !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          {hasPrev && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-2xl bg-black/30 rounded-full size-10 flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); setPreviewUrl(allPreviewUrls[curPreviewIdx - 1]); }}
            >&lsaquo;</button>
          )}
          <img src={previewUrl} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
          {hasNext && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-2xl bg-black/30 rounded-full size-10 flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); setPreviewUrl(allPreviewUrls[curPreviewIdx + 1]); }}
            >&rsaquo;</button>
          )}
          <button className="absolute top-4 right-4 text-white text-xl" onClick={() => setPreviewUrl(null)}>&times;</button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-[11px] bg-black/40 px-3 py-1 rounded-full">
            {previewLabel} · {curPreviewIdx + 1}/{allPreviewUrls.length}
          </div>
        </div>
      )}
    </div>
  );
}
