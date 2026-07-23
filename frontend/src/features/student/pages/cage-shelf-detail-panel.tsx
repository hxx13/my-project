import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ChevronDown, ChevronRight, ImagePlus, MapPin, MousePointerClick, Save } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { fetchCellAnnotation, saveCellAnnotation } from "../api/student.api";
import type { CageShelfCell } from "../api/student.api";
import { STATUS_COLOR, STATUS_ABBR } from "@/features/cage-shelf/components/CageCellOverlays";
import {
  appendImageUrls,
  buildCageDetailSections,
  parseImageUrlLines,
  resolveCageTypeLabel,
  resolveSpecialStatusChips,
} from "@/utils/cageCellDetailHelpers";
import { uploadSingleImage } from "@/api/domains/upload.api";

function FieldRow({
  label,
  children,
  className,
  highlight,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  highlight?: "danger" | "warn" | "info" | "health";
}) {
  const highlightClass =
    highlight === "danger"
      ? "text-rose-600 font-medium"
      : highlight === "warn"
        ? "text-orange-600 font-medium"
        : highlight === "info"
          ? "text-cyan-600 font-medium"
          : highlight === "health"
            ? "text-yellow-600 font-medium"
            : "";
  return (
    <div className={cn("rounded-lg border border-[var(--student-hairline)] px-3 py-2", className)}>
      <div className="text-[11px] text-[var(--student-mute)]">{label}</div>
      <div className={cn("mt-0.5 text-[13px] text-[var(--student-ink)] break-all", highlightClass)}>
        {children}
      </div>
    </div>
  );
}

function DetailSection({
  title,
  collapsible,
  defaultOpen,
  children,
}: {
  title: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen !== false);
  if (!collapsible) {
    return (
      <div>
        <h4 className="text-[12px] font-semibold text-[var(--student-mute)] uppercase tracking-wide mb-2">{title}</h4>
        {children}
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        className="w-full flex items-center gap-1.5 mb-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-[var(--student-mute)]" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-[var(--student-mute)]" />
        )}
        <h4 className="text-[12px] font-semibold text-[var(--student-mute)] uppercase tracking-wide">{title}</h4>
      </button>
      {open && children}
    </div>
  );
}

interface CellDetailPanelProps {
  cell: CageShelfCell | null;
  gridMeta: {
    campusName?: string;
    areaName?: string;
    floorName?: string;
    roomName?: string;
    shelveName?: string;
    shelveId?: string;
  } | null;
  shelveId: string;
  onClose: () => void;
}

export function CellDetailPanel({ cell, gridMeta, shelveId, onClose }: CellDetailPanelProps) {
  const [richText, setRichText] = useState("");
  const [imageUrls, setImageUrls] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detailSections = useMemo(
    () => (cell ? buildCageDetailSections(cell, gridMeta) : []),
    [cell, gridMeta],
  );
  const specialChips = useMemo(() => (cell ? resolveSpecialStatusChips(cell) : []), [cell]);
  const imagePreviewUrls = parseImageUrlLines(imageUrls);
  const cageBoxQrCode =
    cell?.cageBoxQrCode ||
    String((cell?.cageBoxInfo as Record<string, unknown> | undefined)?.CageBoxQrCode ?? "").trim();

  useEffect(() => {
    if (!cell) {
      setRichText("");
      setImageUrls("");
      return;
    }
    let cancelled = false;
    fetchCellAnnotation(shelveId, cell.x, cell.y)
      .then((a) => {
        if (cancelled || !a) return;
        setRichText(a.richText ?? "");
        setImageUrls(
          a.images
            ? (() => {
                try {
                  return JSON.parse(a.images).join("\n");
                } catch {
                  return a.images ?? "";
                }
              })()
            : "",
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cell, shelveId]);

  const handleSave = useCallback(async () => {
    if (!cell) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const imgArr = parseImageUrlLines(imageUrls);
      await saveCellAnnotation(shelveId, cell.x, cell.y, cell.position, {
        richText: richText || undefined,
        images: imgArr.length > 0 ? JSON.stringify(imgArr) : undefined,
      });
      setSaveMsg({ type: "ok", text: "保存成功" });
    } catch (e) {
      setSaveMsg({ type: "err", text: e instanceof Error ? e.message : "保存失败" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 2000);
    }
  }, [cell, shelveId, richText, imageUrls]);

  const handleImagePick = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        const result = await uploadSingleImage(file);
        uploaded.push(result.publicUrl || result.url);
      }
      if (uploaded.length) setImageUrls((prev) => appendImageUrls(prev, uploaded));
    } catch (e) {
      setSaveMsg({ type: "err", text: e instanceof Error ? e.message : "图片上传失败" });
      setTimeout(() => setSaveMsg(null), 2500);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  if (!cell) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-xl border border-[var(--student-hairline)] bg-white p-6">
        <div className="text-center">
          <MousePointerClick className="size-10 mx-auto mb-3 text-[var(--student-mute)]/40" />
          <p className="text-[13px] text-[var(--student-mute)]">点击笼盒</p>
          <p className="text-[11px] text-[var(--student-mute)]/70 mt-1">显示详细信息</p>
        </div>
      </div>
    );
  }

  const isPermitted = cell.visible;
  const cageTypeLabel = resolveCageTypeLabel(cell);

  return (
    <div className="flex-1 flex flex-col rounded-xl border border-[var(--student-hairline)] bg-white overflow-hidden min-h-0">
      <div className="flex items-center justify-between border-b border-[var(--student-hairline)] px-4 py-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--student-ink)]">笼位详情</span>
            <span className="inline-flex items-center rounded-full bg-[var(--student-canvas-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--student-body)]">
              {cell.position}
            </span>
          </div>
          <div className="text-[11px] text-[var(--student-mute)] mt-0.5">{cageTypeLabel}</div>
        </div>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-[var(--student-canvas-soft)] transition-colors">
          <span className="text-[18px] text-[var(--student-mute)] leading-none">&times;</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isPermitted ? (
          <>
            {specialChips.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {specialChips.map((s) => {
                  const colorClass = STATUS_COLOR[s.code] ?? "bg-gray-400 ring-gray-200";
                  const abbr = STATUS_ABBR[s.code] ?? "?";
                  return (
                    <span
                      key={s.code}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${colorClass}`}
                    >
                      <span className="w-3 h-3 rounded-full bg-white/30 flex items-center justify-center text-[7px] font-bold">
                        {abbr}
                      </span>
                      {s.label}
                    </span>
                  );
                })}
              </div>
            )}

            {detailSections.map((section) => (
              <DetailSection
                key={section.id}
                title={section.title}
                collapsible={section.collapsible}
                defaultOpen={section.id === "basic" || section.id === "project"}
              >
                <div className="grid grid-cols-2 gap-2">
                  {section.fields.map((f) => (
                    <FieldRow
                      key={f.key}
                      label={f.label}
                      className={f.fullWidth ? "col-span-2" : undefined}
                      highlight={f.highlight}
                    >
                      <span className={f.mono ? "font-mono text-xs" : undefined}>{f.value}</span>
                    </FieldRow>
                  ))}
                </div>
              </DetailSection>
            ))}

            {cageBoxQrCode && (
              <FieldRow label="笼盒二维码" className="col-span-2">
                <div className="mt-2 rounded-md border border-[var(--student-hairline)] bg-white p-2 inline-block">
                  <QRCodeSVG value={cageBoxQrCode} size={80} level="M" />
                </div>
              </FieldRow>
            )}

            {gridMeta && (
              <div className="inline-flex items-center gap-1 text-[12px] text-[var(--student-body)]">
                <MapPin className="size-3 text-[var(--student-mute)]" />
                {[gridMeta.campusName, gridMeta.areaName, gridMeta.floorName, gridMeta.roomName]
                  .filter(Boolean)
                  .join(" / ")}
              </div>
            )}

            <div className="border-t border-[var(--student-hairline)]" />
            <div>
              <h4 className="text-[12px] font-semibold text-[var(--student-mute)] uppercase tracking-wide mb-2">
                备注与标注
              </h4>

              <label className="block mb-2">
                <span className="text-[12px] text-[var(--student-body)]">富文本备注</span>
                <textarea
                  value={richText}
                  onChange={(e) => setRichText(e.target.value)}
                  rows={4}
                  placeholder="输入备注信息（支持 HTML）…"
                  className="mt-1 w-full rounded-lg border border-[var(--student-hairline)] px-3 py-2 text-[13px] text-[var(--student-ink)] placeholder:text-[var(--student-mute)] focus:border-[var(--student-primary)] focus:outline-none resize-y bg-[var(--student-canvas-soft)]"
                />
              </label>

              <div className="mb-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[12px] text-[var(--student-body)]">图片</span>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--student-primary)] px-3 py-1 text-[11px] font-medium text-[var(--student-primary)] disabled:opacity-50"
                  >
                    <ImagePlus className="size-3.5" />
                    {uploading ? "上传中…" : "上传图片"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => void handleImagePick(e.target.files)}
                  />
                </div>
                <textarea
                  value={imageUrls}
                  onChange={(e) => setImageUrls(e.target.value)}
                  rows={2}
                  placeholder="上传后自动填入 URL，也可手动编辑"
                  className="w-full rounded-lg border border-[var(--student-hairline)] px-3 py-2 text-[11px] font-mono text-[var(--student-ink)] placeholder:text-[var(--student-mute)] focus:border-[var(--student-primary)] focus:outline-none resize-y bg-[var(--student-canvas-soft)]"
                />
              </div>

              {imagePreviewUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {imagePreviewUrls.map((url, i) => (
                    <img
                      key={`${url}-${i}`}
                      src={url}
                      alt={`img-${i}`}
                      className="size-20 rounded-lg border border-[var(--student-hairline)] object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--student-primary)] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <Save className="size-4" /> {saving ? "保存中…" : "保存标注"}
                </button>
                {saveMsg && (
                  <span
                    className={cn(
                      "text-[12px]",
                      saveMsg.type === "ok" ? "text-emerald-600" : "text-red-500",
                    )}
                  >
                    {saveMsg.text}
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-4 text-[13px] text-[var(--student-mute)]">
            仅限所属课题组及管理员查看详情
          </div>
        )}
      </div>
    </div>
  );
}
