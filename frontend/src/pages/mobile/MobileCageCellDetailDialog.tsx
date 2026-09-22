/**
 * 手机版笼位详情弹窗（v3 — 对齐动物订购链路：白底 + 中性灰分层 + 实底按钮）。
 *
 * v2 的问题：品牌红主导（`#ac1736` 既做主色又做分区竖条）、上传按钮描边、
 * 删除钮 `bg-black/50`、`disabled:opacity-50`、slate/Vant/微信三套灰混用。
 * v3 把结构色收进 `cage-detail-scope.css` 的局部作用域，主色沿用学生端琥珀，
 * 按钮一律实底，状态语义只留一颗圆点。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Save, X } from "lucide-react";
import type { CageShelfCell } from "@/api/domains/cageShelf.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { fetchLocalAnnotate, localAnnotate } from "@/api/domains/cageShelf.api";
import CageFormFill from "@/features/cage-shelf/components/CageFormFill";
import CageOperationActions from "@/features/cage-shelf/components/CageOperationActions";
import type { CageOpKind, CageOpMark, CageOpSource } from "@/features/cage-shelf/useCageOpSelect";
import { CAGE_BOX_ACTIONS, actionsFromFormValues, displayPosition } from "@/features/cage-shelf/constants";
import { DEFAULT_COLORS } from "@/features/cage-shelf/components/CageColorContext";
import { fetchCageInfoValues, type CageInfoValueRow } from "@/features/cage-shelf/api/cageForm.api";
import { useViewportHeight } from "./useViewportHeight";
import "./cage-detail-scope.css";

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

/** 分区小标题：不带竖条、不带色块，与小程序 `.cs-sec-title` 同一口径 */
function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-[13px] font-semibold text-[var(--student-ink)]">{children}</span>
      {count != null && count > 0 && (
        <span className="rounded-full bg-[var(--student-canvas-soft-2)] px-2 py-0.5 text-[10px] tabular-nums text-[var(--student-mute)]">
          {count}
        </span>
      )}
    </div>
  );
}

export default function MobileCageCellDetailDialog({
  cell,
  onClose,
  staffView,
  onStartOp,
  onChanged,
  opMark,
  onStartBatch,
  onStartDivide,
}: {
  cell: CageShelfCell;
  onClose: () => void;
  staffView?: boolean;
  /** 分笼/转移：由页面进入选位模式（主网格选目标），不传则不显示入口 */
  onStartOp?: (kind: CageOpKind, source: CageOpSource) => void;
  /** 认领成功后刷新 */
  onChanged?: () => void;
  /** 该笼位待审的分笼/转移中间态 */
  opMark?: CageOpMark | null;
  /** 转移入口：由页面打开批量缓冲抽屉（不传则退回原来的单笼选位流程） */
  onStartBatch?: (source: CageOpSource) => void;
  /** 分笼入口：由页面以 divide 模式打开批量缓冲抽屉（不传则退回原来的单笼选位流程） */
  onStartDivide?: (source: CageOpSource) => void;
}) {
  const detail = (cell.detail ?? {}) as Record<string, unknown>;
  const cbi = (cell.cageBoxInfo ?? {}) as Record<string, unknown> | undefined;
  const viewportHeight = useViewportHeight();

  const position = displayPosition(cell.position);
  const animalCageId: string = String(
    (cell as any).id ?? (cell as any).animalCageId ?? detail.animalCageId ?? "",
  );

  // ── 实验记录 & 照片 ──
  const [experimentDesc, setExperimentDesc] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [statusPhotos, setStatusPhotos] = useState<Record<string, string[]>>({});
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

  // 合并两个通道的所有照片 URL，供预览导航使用
  const allPreviewUrls = useMemo(() => {
    const urls: string[] = [];
    for (const k of Object.keys(statusPhotos)) {
      for (const u of (statusPhotos[k] || [])) urls.push(u);
    }
    for (const u of images) urls.push(u);
    return urls;
  }, [statusPhotos, images]);

  // 读取已有标注
  useEffect(() => {
    if (!animalCageId) {
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
      // 只发这条通道真正会改的两个字段。statusPhotos 归「状态模式」管，本弹窗里是只读的，
      // 回传它等于向服务端声明「我要写状态照片」——那道闸只开给饲养员/饲养组长，
      // 会把「实验员本人存实验记录」一并拦死。
      await localAnnotate(animalCageId, experimentDesc || undefined, JSON.stringify(images));
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

  // 通道一：状态标记照片（只读，仅编辑模式可管理）+ 兜底 _status
  const statusPhotoBlocks = specialChips
    .filter((ch) => ch.photoKey && (statusPhotos[ch.photoKey] || []).length > 0)
    .map((ch) => ({ key: ch.code, label: ch.label, color: ch.color, urls: statusPhotos[ch.photoKey] || [] }));
  const catchAllStatusPhotos = statusPhotos._status || [];
  const statusNote = typeof (statusPhotos as any)._note === "string" ? ((statusPhotos as any)._note as string).trim() : "";
  const hasStatusSection = statusPhotoBlocks.length > 0 || catchAllStatusPhotos.length > 0 || !!statusNote;

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
        className="cage-detail-sheet w-full flex flex-col rounded-[18px] overflow-hidden bg-[var(--student-surface)]"
        style={{
          maxWidth: 400,
          maxHeight: "100%",
          boxShadow: "0 24px 64px -16px rgba(15, 23, 42, 0.32)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 身份条：位置 + 状态标签 + 关闭；笼位动作钉在它下面，不随正文滚 ── */}
        <div className="shrink-0 border-b border-[var(--student-hairline)] px-4 pt-3.5 pb-3">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-tight text-[var(--student-ink)]">
              {position}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-[var(--student-mute)] transition active:bg-[var(--student-canvas-soft-2)]"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          </div>
          {/* 状态语义只落在一颗圆点上：不铺饱和底、不描边 */}
          {specialChips.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {specialChips.map((ch) => (
                <span
                  key={ch.code}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--student-canvas-soft-2)] px-3 py-1 text-[11px] font-medium text-[var(--student-body)]"
                >
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: ch.color }} />
                  {ch.label}
                </span>
              ))}
            </div>
          )}
          {isPermitted && onStartOp && (
            <div className="mt-3">
              <CageOperationActions
                source={{
                  animalCageId,
                  position,
                  occupantName: (cell as any).occupantName,
                  cageTypeCode: (cell as any).cageTypeCode ?? cell.animalCageType,
                }}
                occupied={((cell as any).cageTypeCode ?? cell.animalCageType) === 3}
                onStart={onStartOp}
                onStartBatch={onStartBatch}
                onStartDivide={onStartDivide}
                onChanged={onChanged}
                opMark={opMark}
              />
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-3 pb-4 space-y-4">
          {isPermitted ? (
            <>
              {/* ── 关键信息表单（本身已是双列网格，读 --twin-* 跟随本弹窗的中性令牌） ── */}
              <CageFormFill animalCageId={animalCageId || null} />

              {/* ── 状态与照片（通道一，只读） ── */}
              {hasStatusSection && (
                <div>
                  <SectionTitle>状态与照片</SectionTitle>
                  <div className="space-y-2">
                    {statusPhotoBlocks.map((blk) => (
                      <div key={blk.key} className="rounded-[14px] bg-[var(--student-canvas-soft)] px-3 py-2.5">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="size-1.5 shrink-0 rounded-full" style={{ background: blk.color }} />
                          <span className="text-[11px] font-medium text-[var(--student-body)]">{blk.label}</span>
                          <span className="text-[10px] tabular-nums text-[var(--student-mute)]">{blk.urls.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {blk.urls.map((u, j) => (
                            <img key={j} src={u} onClick={() => setPreviewUrl(u)} className="size-11 cursor-pointer rounded-[10px] object-cover" alt="" />
                          ))}
                        </div>
                      </div>
                    ))}
                    {catchAllStatusPhotos.length > 0 && (
                      <div className="rounded-[14px] bg-[var(--student-canvas-soft)] px-3 py-2.5">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-[11px] font-medium text-[var(--student-body)]">状态照片</span>
                          <span className="text-[10px] tabular-nums text-[var(--student-mute)]">{catchAllStatusPhotos.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {catchAllStatusPhotos.map((u, j) => (
                            <img key={j} src={u} onClick={() => setPreviewUrl(u)} className="size-11 cursor-pointer rounded-[10px] object-cover" alt="" />
                          ))}
                        </div>
                      </div>
                    )}
                    {statusNote && (
                      <div className="rounded-[14px] bg-[var(--student-canvas-soft)] px-3 py-2.5">
                        <div className="mb-1 text-[11px] font-medium text-[var(--student-mute)]">标注备注</div>
                        <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--student-body)]">{statusNote}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── 实验记录 + 照片 ── */}
              <div>
                <SectionTitle>实验记录</SectionTitle>
                <textarea
                  value={experimentDesc}
                  onChange={(e) => setExperimentDesc(e.target.value)}
                  rows={4}
                  placeholder="输入实验记录…"
                  className="w-full resize-y rounded-[14px] bg-[var(--student-canvas-soft)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--student-ink)] placeholder:text-[var(--student-mute-foreground)] focus:outline-none"
                />

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[var(--student-ink)]">照片</span>
                    <span className="text-[10px] tabular-nums text-[var(--student-mute)]">{images.length}</span>
                  </div>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="cage-detail-btn-soft inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition active:scale-95"
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

                {images.length > 0 ? (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {images.map((url, i) => (
                      <div key={`${i}-${url.slice(-20)}`} className="relative aspect-square overflow-hidden rounded-[14px] bg-[var(--student-canvas-soft)]">
                        <img
                          src={url}
                          alt={`photo-${i}`}
                          className="h-full w-full cursor-pointer object-cover"
                          onClick={() => setPreviewUrl(url)}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="cage-detail-photo-del absolute top-1 right-1 flex size-5 items-center justify-center rounded-full"
                          aria-label="删除图片"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-[12px] text-[var(--student-mute)]">暂无照片</div>
                )}
              </div>
            </>
          ) : (
            <div className="py-4 text-center text-[13px] text-[var(--student-mute)]">
              仅限所属课题组及管理员查看详情
            </div>
          )}
        </div>

        {/* ── 底栏：一个时刻只有一个保存目标 ── */}
        {isPermitted && (
          <div className="shrink-0 flex items-center gap-3 border-t border-[var(--student-hairline)] px-4 py-3">
            {saveMsg && (
              <span
                className="text-[12px]"
                style={{ color: saveMsg.type === "ok" ? "var(--student-success)" : "var(--student-error)" }}
              >
                {saveMsg.text}
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="cage-detail-btn-primary ml-auto inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] px-5 text-[13px] font-semibold transition active:scale-[0.98]"
            >
              <Save className="size-4" />
              {saving ? "保存中…" : "保存记录"}
            </button>
          </div>
        )}
      </div>

      {/* ── 全屏照片预览（双通道共享，URL驱动）── */}
      {previewUrl !== null && (() => {
        const curIdx = allPreviewUrls.indexOf(previewUrl);
        return (
        <div
          className="cage-detail-viewer fixed inset-0 flex items-center justify-center"
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
            className="cage-detail-viewer-btn absolute top-4 right-4 rounded-full p-2.5"
            aria-label="关闭预览"
          >
            <X className="size-5" />
          </button>
          {allPreviewUrls.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); const prev = curIdx > 0 ? curIdx - 1 : allPreviewUrls.length - 1; setPreviewUrl(allPreviewUrls[prev]); }}
                className="cage-detail-viewer-btn absolute left-4 rounded-full px-3 py-2"
                aria-label="上一张"
              >
                <span className="text-xl leading-none">&lsaquo;</span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); const next = curIdx < allPreviewUrls.length - 1 ? curIdx + 1 : 0; setPreviewUrl(allPreviewUrls[next]); }}
                className="cage-detail-viewer-btn absolute right-4 rounded-full px-3 py-2"
                aria-label="下一张"
              >
                <span className="text-xl leading-none">&rsaquo;</span>
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
            <div className="absolute bottom-4 text-sm text-white">
              {curIdx + 1} / {allPreviewUrls.length}
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
