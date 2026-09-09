/** 手机版笼位详情弹窗（v2 — icon+compact 布局，无折叠区块） */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Save, X } from "lucide-react";
import type { CageShelfCell } from "@/api/domains/cageShelf.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { fetchLocalAnnotate, localAnnotate } from "@/api/domains/cageShelf.api";
import CageFormFill from "@/features/cage-shelf/components/CageFormFill";
import CageOperationActions from "@/features/cage-shelf/components/CageOperationActions";
import type { CageOpKind, CageOpSource } from "@/features/cage-shelf/useCageOpSelect";
import { CAGE_BOX_ACTIONS, actionsFromFormValues } from "@/features/cage-shelf/constants";
import { DEFAULT_COLORS } from "@/features/cage-shelf/components/CageColorContext";
import { fetchCageInfoValues, type CageInfoValueRow } from "@/features/cage-shelf/api/cageForm.api";
import { useViewportHeight } from "./useViewportHeight";

const BRAND = "#ac1736";

function displayPosition(pos: string): string {
  const m = pos.match(/^([A-H])-(\d+)$/);
  if (!m) return pos;
  return `${m[1]}-${11 - parseInt(m[2])}`;
}

/** 从 cell.detail (camelCase) 或 cageBoxInfo 读字段值 */
function dGet(
  detail: Record<string, unknown> | undefined | null,
  cbi: Record<string, unknown> | undefined,
  key: string,
): string {
  if (detail?.[key] != null && String(detail[key]).trim() !== "") return String(detail[key]).trim();
  if (cbi?.[key] != null && String(cbi[key]).trim() !== "") return String(cbi[key]).trim();
  return "";
}

function dNum(detail: Record<string, unknown> | undefined | null, key: string): number | null {
  const v = detail?.[key];
  if (v == null || v === "") return null;
  return Number(v);
}

function parseImagesJson(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map(String).filter(Boolean);
    } catch {
      // fallback: split by newline
      return raw.split("\n").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export default function MobileCageCellDetailDialog({
  cell,
  onClose,
  staffView,
  onStartOp,
  onChanged,
}: {
  cell: CageShelfCell;
  onClose: () => void;
  staffView?: boolean;
  /** 分笼/转移：由页面进入选位模式（主网格选目标），不传则不显示入口 */
  onStartOp?: (kind: CageOpKind, source: CageOpSource) => void;
  /** 认领成功后刷新 */
  onChanged?: () => void;
}) {
  const detail = (cell.detail ?? {}) as Record<string, unknown>;
  const cbi = (cell.cageBoxInfo ?? {}) as Record<string, unknown> | undefined;
  const viewportHeight = useViewportHeight();

  // ── 头部(表外固定字段,来自 cage_cell_detail) ──
  const position = displayPosition(cell.position);
  const animalCageId: string = String(
    (cell as any).id ?? (cell as any).animalCageId ?? detail.animalCageId ?? "",
  );

  // ── 实验记录 & 照片 ──
  const [experimentDesc, setExperimentDesc] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [statusPhotos, setStatusPhotos] = useState<Record<string,string[]>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<CageInfoValueRow[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 拉取表单值(cage_info_value)：状态标记唯一真相源，据此渲染状态 chips
  useEffect(() => {
    if (!animalCageId) { setFormValues(null); return; }
    let cancelled = false;
    fetchCageInfoValues(animalCageId).then(rows => { if (!cancelled) setFormValues(rows); }).catch(() => { if (!cancelled) setFormValues(null); });
    return () => { cancelled = true; };
  }, [animalCageId]);

  // 特殊状态 chips：以表单为真相源，只列已开启的状态
  const specialChips = useMemo(() => {
    const active = actionsFromFormValues(formValues);
    return CAGE_BOX_ACTIONS.filter(a => active.has(a.action)).map(a => {
      const c = DEFAULT_COLORS[a.statusCode] ?? { bg: "#ccc", border: "#999" };
      return { code: a.statusField, label: a.label, color: c.border, photoKey: a.statusField };
    });
  }, [formValues]);

  // 合并两个通道的所有照片 URL，供预览导航使用（必须在 statusPhotos 声明之后）
  const allPreviewUrls = (() => {
    const urls: string[] = [];
    for (const k of Object.keys(statusPhotos)) {
      for (const u of (statusPhotos[k] || [])) urls.push(u);
    }
    for (const u of images) urls.push(u);
    return urls;
  })();

  // 读取已有标注
  useEffect(() => {
    const animalCageId = String((cell as any).id ?? (cell as any).animalCageId ?? detail.animalCageId ?? "");
    if (!animalCageId) {
      // 从 detail 兜底
      setExperimentDesc(dGet(detail, cbi, "experimentDesc"));
      setImages(parseImagesJson(detail.imagesJson ?? "[]"));
      return;
    }
    let cancelled = false;
    fetchLocalAnnotate(String(animalCageId))
      .then((a) => {
        if (cancelled) return;
        setExperimentDesc(a.experimentDesc ?? "");
        setImages(parseImagesJson(a.imagesJson ?? "[]"));
        if (a.statusPhotos) { try { const sp = JSON.parse(a.statusPhotos); if (typeof sp === "object") setStatusPhotos(sp); } catch {} }
      })
      .catch(() => {
        if (!cancelled) {
          setExperimentDesc(dGet(detail, cbi, "experimentDesc"));
          setImages(parseImagesJson(detail.imagesJson ?? "[]"));
        }
      });
    return () => { cancelled = true; };
  }, [cell]);

  const handleSave = useCallback(async () => {
    if (!animalCageId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await localAnnotate(animalCageId, experimentDesc || undefined, JSON.stringify(images), JSON.stringify(statusPhotos));
      setSaveMsg({ type: "ok", text: "保存成功" });
    } catch (e) {
      setSaveMsg({ type: "err", text: e instanceof Error ? e.message : "保存失败" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 2000);
    }
  }, [animalCageId, experimentDesc, images]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setSaveMsg(null);
    try {
      const uploaded: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        const result = await uploadSingleImage(file);
        uploaded.push(result.publicUrl);
      }
      if (uploaded.length) {
        setImages((prev) => [...prev, ...uploaded]);
      }
    } catch (e) {
      setSaveMsg({ type: "err", text: e instanceof Error ? e.message : "图片上传失败" });
      setTimeout(() => setSaveMsg(null), 2500);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const isPermitted = cell.visible;

  // 特殊状态 chips（与标题栏共享，见上方 specialChips）

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: "var(--z-modal, 800)",
        background: "rgba(0,0,0,0.45)",
        height: viewportHeight > 0 ? viewportHeight : "100dvh",
        padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px calc(env(safe-area-inset-bottom, 0px) + 12px)",
      }}
      onClick={onClose}
    >
      <div
        className="w-full flex flex-col rounded-[22px] overflow-hidden"
        style={{
          background: "#fff",
          maxWidth: 400,
          maxHeight: "100%",
          boxShadow: "0 24px 64px -16px rgba(15, 23, 42, 0.32)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between gap-3 px-4 py-3.5 shrink-0"
          style={{ background: "#fafbfc", borderBottom: "1px solid #eef0f6" }}
        >
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-bold tracking-tight" style={{ color: "#1e293b" }}>
              {position}
            </span>
            {/* 标题栏只展示特殊状态；无特殊状态则不展示任何笼型/状态徽标 */}
            {specialChips.map((ch) => (
              <span
                key={ch.code}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{ color: "#334155", background: "#f1f5f9" }}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: ch.color }} />
                {ch.label}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 transition active:scale-90"
            style={{ background: "#f1f5f9" }}
            aria-label="关闭"
          >
            <X className="size-4" style={{ color: "#64748b" }} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-3 pb-4 space-y-3">
          {isPermitted ? (
            <>
              {/* ── 分笼 / 转移笼位（仅占用中笼位出现） ── */}
              {onStartOp && (
                <CageOperationActions
                  source={{
                    animalCageId,
                    position,
                    occupantName: (cell as any).occupantName,
                    cageTypeCode: (cell as any).cageTypeCode ?? cell.animalCageType,
                  }}
                  occupied={((cell as any).cageTypeCode ?? cell.animalCageType) === 3}
                  onStart={onStartOp}
                  onChanged={onChanged}
                />
              )}

              {/* ── 关键信息表单(直接读表单,与 web 端一致) ── */}
              <CageFormFill animalCageId={animalCageId || null} />

              {/* 特殊状态 chips 已上移到标题栏，此处只保留其对应的照片 */}

              {/* 通道一：状态标记照片（只读，仅编辑模式可管理） */}
              {specialChips.filter(ch=>ch.photoKey&&(statusPhotos[ch.photoKey]||[]).length>0).map(ch=>{
                const spImgs=statusPhotos[ch.photoKey]||[];
                return <div key={ch.code} className="rounded-2xl px-3 py-2 mb-1" style={{background:"#f8fafc"}}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-semibold" style={{color:ch.color}}>{ch.label}照片 ({spImgs.length})</span>
                  </div>
                  {spImgs.length>0&&<div className="flex flex-wrap gap-1">
                    {spImgs.map((url:string,j:number)=><img key={j} src={url} onClick={()=>setPreviewUrl(url)} className="h-11 w-11 object-cover rounded-xl cursor-pointer" style={{border:"1px solid #eef0f6"}} alt="" />)}
                  </div>}
                  <div className="text-[9px] italic mt-1" style={{color:"#969799"}}>通过编辑模式管理</div>
                </div>;
              })}
              {/* 兜底 _status key：弹窗A上传但未绑定到具体状态标记的照片 */}
              {(()=>{const catchAll=(statusPhotos._status||[]);if(catchAll.length===0)return null;
                return <div className="rounded-2xl px-3 py-2 mb-1" style={{background:"#f8fafc"}}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-semibold" style={{color:"#64748b"}}>状态照片 ({catchAll.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {catchAll.map((url:string,j:number)=><img key={j} src={url} onClick={()=>setPreviewUrl(url)} className="h-11 w-11 object-cover rounded-xl cursor-pointer" style={{border:"1px solid #eef0f6"}} alt="" />)}
                  </div>
                  <div className="text-[9px] italic mt-1" style={{color:"#969799"}}>通过编辑模式管理</div>
                </div>;
              })()}
              {/* 标注备注（通道一只读） */}
              {typeof (statusPhotos as any)._note==="string"&&(statusPhotos as any)._note.trim()&&<div className="rounded-2xl px-3 py-2 mb-1" style={{background:"#f8fafc"}}>
                <div className="text-[10px] font-semibold mb-1" style={{color:"#64748b"}}>📝 标注备注</div>
                <div className="text-[11px] whitespace-pre-wrap" style={{color:"#323233"}}>{(statusPhotos as any)._note}</div>
                <div className="text-[9px] italic mt-1" style={{color:"#969799"}}>通过编辑模式管理</div>
              </div>}

              <div
                className="border-t"
                style={{ borderColor: "#f1f5f9", margin: "6px 0 2px" }}
              />

              {/* ── 实验记录 ── */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-3.5 w-[3px] rounded-full" style={{ background: BRAND }} />
                  <span className="text-[12px] font-semibold tracking-wide" style={{ color: "#1e293b" }}>
                    实验记录
                  </span>
                </div>
                <textarea
                  value={experimentDesc}
                  onChange={(e) => setExperimentDesc(e.target.value)}
                  rows={4}
                  placeholder="输入实验记录…"
                  className="w-full rounded-2xl border px-3.5 py-2.5 text-[13px] resize-y focus:outline-none"
                  style={{
                    borderColor: "#eef0f6",
                    color: "#323233",
                    background: "#fafbfc",
                  }}
                />
              </div>

              {/* ── 照片 ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3.5 w-[3px] rounded-full" style={{ background: BRAND }} />
                    <span className="text-[12px] font-semibold tracking-wide" style={{ color: "#1e293b" }}>
                      实验记录照片
                    </span>
                    {images.length > 0 && (
                      <span className="text-[10px] tabular-nums" style={{ color: "#94a3b8" }}>
                        {images.length}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium disabled:opacity-50 active:scale-95 transition"
                    style={{
                      color: BRAND,
                      border: `1px solid ${BRAND}`,
                      background: "#fff",
                    }}
                  >
                    <ImagePlus className="size-3.5" />
                    {uploading ? "上传中…" : "上传"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => void handleUpload(e.target.files)}
                  />
                </div>

                {images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((url, i) => (
                      <div key={`${i}-${url.slice(-20)}`} className="relative aspect-square rounded-2xl overflow-hidden"
                        style={{ border: "1px solid #eef0f6" }}>
                        <img
                          src={url}
                          alt={`photo-${i}`}
                          className="w-full h-full object-cover"
                          onClick={() => setPreviewUrl(url)}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute top-1 right-1 size-5 rounded-full bg-black/50 flex items-center justify-center"
                          aria-label="删除图片"
                        >
                          <X className="size-3 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── 保存按钮 ── */}
              <div className="flex items-center gap-3 flex-wrap pt-0.5">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full px-5 h-10 text-[13px] font-semibold text-white disabled:opacity-50 active:scale-[0.98] transition"
                  style={{ background: BRAND, boxShadow: `0 8px 20px -8px ${BRAND}` }}
                >
                  <Save className="size-4" />
                  {saving ? "保存中…" : "保存"}
                </button>
                {saveMsg && (
                  <span
                    className="text-[12px]"
                    style={{ color: saveMsg.type === "ok" ? "#07c160" : "#ee0a24" }}
                  >
                    {saveMsg.text}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-4 text-[13px]" style={{ color: "#969799" }}>
              仅限所属课题组及管理员查看详情
            </div>
          )}
        </div>
      </div>

      {/* ── 全屏照片预览（双通道共享，URL驱动）── */}
      {previewUrl !== null && (() => {
        const curIdx = allPreviewUrls.indexOf(previewUrl);
        return (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{
            zIndex: "var(--z-tooltip, 900)",
            background: "rgba(0,0,0,0.9)",
            height: viewportHeight > 0 ? viewportHeight : "100dvh",
          }}
          onClick={() => setPreviewUrl(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 active:bg-white/20"
          >
            <X className="size-6 text-white" />
          </button>
          {allPreviewUrls.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); const prev = curIdx > 0 ? curIdx - 1 : allPreviewUrls.length - 1; setPreviewUrl(allPreviewUrls[prev]); }}
                className="absolute left-4 p-2 rounded-full bg-white/10 active:bg-white/20"
              >
                <span className="text-white text-2xl leading-none">&lsaquo;</span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); const next = curIdx < allPreviewUrls.length - 1 ? curIdx + 1 : 0; setPreviewUrl(allPreviewUrls[next]); }}
                className="absolute right-4 p-2 rounded-full bg-white/10 active:bg-white/20"
              >
                <span className="text-white text-2xl leading-none">&rsaquo;</span>
              </button>
            </>
          )}
          <img
            src={previewUrl}
            alt="预览"
            className="max-w-full max-h-full object-contain p-8"
            onClick={(e) => e.stopPropagation()}
          />
          {allPreviewUrls.length > 1 && (
            <div className="absolute bottom-4 text-white text-sm">
              {curIdx + 1} / {allPreviewUrls.length}
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
