import { useState, useEffect, useCallback } from "react";
import { X, Save, Image, MapPin } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import {
  fetchCellAnnotation,
  saveCellAnnotation,
} from "../../api/student.api";
import type { CageShelfCell } from "../../api/student.api";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cageTypeLabel(t?: number): string {
  if (t === 1) return "等待分配";
  if (t === 2) return "已预约(无笼盒)";
  if (t === 3) return "已预约(有笼盒)";
  return "未知";
}

interface FieldRowProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

function FieldRow({ label, children, className }: FieldRowProps) {
  return (
    <div className={cn("rounded-lg border border-[var(--student-hairline)] px-3 py-2", className)}>
      <div className="text-[11px] text-[var(--student-mute)]">{label}</div>
      <div className="mt-0.5 text-[13px] text-[var(--student-ink)] break-all">
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface CellDetailModalProps {
  cell: CageShelfCell;
  gridMeta?: {
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

export function CellDetailModal({ cell, gridMeta, shelveId, onClose }: CellDetailModalProps) {
  const [richText, setRichText] = useState("");
  const [imageUrls, setImageUrls] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Load existing annotation on open
  useEffect(() => {
    let cancelled = false;
    fetchCellAnnotation(shelveId, cell.x, cell.y)
      .then((a) => {
        if (cancelled) return;
        if (a) {
          setRichText(a.richText ?? "");
          setImageUrls(a.images ? (() => { try { return JSON.parse(a.images).join("\n"); } catch { return a.images; } })() : "");
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [shelveId, cell.x, cell.y]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const imgArr = imageUrls
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
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
  }, [shelveId, cell.x, cell.y, cell.position, richText, imageUrls]);

  const isPermitted = cell.visible;

  return (
    <div
      className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-[var(--student-hairline)] bg-white shadow-xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--student-hairline)] px-5 py-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--student-ink)]">
              笼位详情
            </span>
            <span className="inline-flex items-center rounded-full bg-[var(--student-canvas-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--student-body)]">
              {cell.position}
            </span>
          </div>
          <div className="text-[11px] text-[var(--student-mute)] mt-0.5">
            {cageTypeLabel(cell.animalCageType)} · {cell.stateLabel}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 hover:bg-[var(--student-canvas-soft)] transition-colors"
        >
          <X className="size-5 text-[var(--student-mute)]" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* ---- ARO Official Data ---- */}
        <div>
          <h4 className="text-[12px] font-semibold text-[var(--student-mute)] uppercase tracking-wide mb-2">
            ARO 官方数据
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {isPermitted ? (
              <>
                <FieldRow label="动物类型">{cageTypeLabel(cell.animalCageType)}</FieldRow>
                <FieldRow label="状态">{cell.stateLabel}</FieldRow>
                <FieldRow label="课题组">{cell.departmentName || "-"}</FieldRow>
                <FieldRow label="课题 PI">{cell.projectPiName || "-"}</FieldRow>
                <FieldRow label="AUP 编号">{cell.aupNumber || "-"}</FieldRow>
                {cell.cageBoxQrCode && (
                  <FieldRow label="笼盒卡号" className="col-span-2">
                    <span className="font-mono text-xs">{cell.cageBoxQrCode}</span>
                    <div className="mt-2 rounded-md border border-[var(--student-hairline)] bg-white p-2 inline-block">
                      <QRCodeSVG value={cell.cageBoxQrCode} size={80} level="M" />
                    </div>
                  </FieldRow>
                )}
                {gridMeta && (
                  <FieldRow label="位置" className="col-span-2">
                    <span className="inline-flex items-center gap-1 text-[12px]">
                      <MapPin className="size-3 text-[var(--student-mute)]" />
                      {gridMeta.campusName} / {gridMeta.areaName} / {gridMeta.floorName} / {gridMeta.roomName}
                    </span>
                  </FieldRow>
                )}
              </>
            ) : (
              <div className="col-span-2 text-center py-4 text-[13px] text-[var(--student-mute)]">
                仅限所属课题组及管理员查看详情
              </div>
            )}
          </div>
        </div>

        {/* ---- Annotations (editable, only for permitted users) ---- */}
        {isPermitted && (
          <>
            <div className="border-t border-[var(--student-hairline)]" />
            <div>
              <h4 className="text-[12px] font-semibold text-[var(--student-mute)] uppercase tracking-wide mb-2">
                备注与标注
              </h4>

              {/* Rich text */}
              <label className="block mb-2">
                <span className="text-[12px] text-[var(--student-body)]">富文本备注</span>
                <textarea
                  value={richText}
                  onChange={(e) => setRichText(e.target.value)}
                  rows={4}
                  placeholder="输入备注信息（支持 HTML 格式）…"
                  className="mt-1 w-full rounded-lg border border-[var(--student-hairline)] px-3 py-2 text-[13px] text-[var(--student-ink)] placeholder:text-[var(--student-mute)] focus:border-[var(--student-primary)] focus:outline-none resize-y bg-[var(--student-canvas-soft)]"
                />
              </label>

              {/* Images */}
              <label className="block mb-3">
                <span className="text-[12px] text-[var(--student-body)] flex items-center gap-1">
                  <Image className="size-3" />
                  图片（每行一个 URL）
                </span>
                <textarea
                  value={imageUrls}
                  onChange={(e) => setImageUrls(e.target.value)}
                  rows={3}
                  placeholder="https://example.com/image1.jpg"
                  className="mt-1 w-full rounded-lg border border-[var(--student-hairline)] px-3 py-2 text-[13px] text-[var(--student-ink)] placeholder:text-[var(--student-mute)] focus:border-[var(--student-primary)] focus:outline-none resize-y bg-[var(--student-canvas-soft)] font-mono text-[11px]"
                />
              </label>

              {/* Image previews */}
              {(() => {
                const urls = imageUrls
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (urls.length === 0) return null;
                return (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {urls.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`img-${i}`}
                        className="size-20 rounded-lg border border-[var(--student-hairline)] object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ))}
                  </div>
                );
              })()}

              {/* Save button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--student-primary)] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <Save className="size-4" />
                  {saving ? "保存中…" : "保存标注"}
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
        )}
      </div>
    </div>
  );
}
