/** 手机版笼位详情弹窗（与 Web CellDetailPanel 字段与标注编辑对齐） */
import { useCallback, useEffect, useState } from "react";
import { X, Save, Image, MapPin } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { CageShelfCell } from "@/features/student/api/student.api";
import { STATUS_COLOR, STATUS_ABBR } from "@/features/cage-shelf/components/CageCellOverlays";
import {
  fetchMobileCageCellAnnotation,
  saveMobileCageCellAnnotation,
} from "@/api/domains/mobileStudent.api";
import {
  fetchStudentMobileCageCellAnnotation,
  saveStudentMobileCageCellAnnotation,
} from "@/api/domains/studentMobile.api";

const BRAND = "#ac1736";

function cageTypeLabel(t?: number): string {
  if (t === 1) return "等待分配";
  if (t === 2) return "已预约(空笼盒)";
  if (t === 3) return "已预约(饲养中)";
  return "未知";
}

function FieldRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        borderRadius: 10,
        border: "1px solid #ebedf0",
        padding: "8px 12px",
        background: "#fff",
      }}
    >
      <div className="text-[11px]" style={{ color: "#969799" }}>{label}</div>
      <div className="mt-0.5 text-[13px] break-all" style={{ color: "#323233" }}>{children}</div>
    </div>
  );
}

export default function MobileCageCellDetailDialog({
  token,
  jwtMode,
  shelveId,
  cell,
  gridMeta,
  onClose,
}: {
  token: string;
  jwtMode?: boolean;
  shelveId: string;
  cell: CageShelfCell;
  gridMeta: {
    campusName?: string;
    areaName?: string;
    floorName?: string;
    roomName?: string;
    shelveName?: string;
  } | null;
  onClose: () => void;
}) {
  const [richText, setRichText] = useState("");
  const [imageUrls, setImageUrls] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (jwtMode
      ? fetchStudentMobileCageCellAnnotation(shelveId, cell.x, cell.y)
      : fetchMobileCageCellAnnotation(token, shelveId, cell.x, cell.y)
    )
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
  }, [token, jwtMode, shelveId, cell.x, cell.y]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const imgArr = imageUrls
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const data = {
        richText: richText || undefined,
        images: imgArr.length > 0 ? JSON.stringify(imgArr) : undefined,
      };
      if (jwtMode) {
        await saveStudentMobileCageCellAnnotation(shelveId, cell.x, cell.y, cell.position, data);
      } else {
        await saveMobileCageCellAnnotation(token, shelveId, cell.x, cell.y, cell.position, data);
      }
      setSaveMsg({ type: "ok", text: "保存成功" });
    } catch (e) {
      setSaveMsg({ type: "err", text: e instanceof Error ? e.message : "保存失败" });
    } finally {
      setSaving(false);
      window.setTimeout(() => setSaveMsg(null), 2000);
    }
  }, [token, jwtMode, shelveId, cell, richText, imageUrls]);

  const isPermitted = cell.visible;
  const bi = cell.cageBoxInfo as Record<string, unknown> | undefined;
  const imagePreviewUrls = imageUrls
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: "var(--z-modal, 800)", background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: "#fff",
          maxWidth: 400,
          maxHeight: "min(88vh, 720px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: "#ebedf0" }}
        >
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold" style={{ color: "#323233" }}>笼位详情</span>
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "#f7f8fa", color: "#646566" }}
              >
                {cell.position}
              </span>
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "#969799" }}>
              {cageTypeLabel(cell.animalCageType)} · {cell.stateLabel}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg shrink-0">
            <X className="size-5" style={{ color: "#94a3b8" }} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
          <div>
            <h4
              className="text-[12px] font-semibold uppercase tracking-wide mb-2"
              style={{ color: "#969799" }}
            >
              ARO 官方数据
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {isPermitted ? (
                <>
                  {cell.specialStatuses &&
                    cell.specialStatuses.filter((s) => s.code !== "NORMAL").length > 0 && (
                      <div className="col-span-2 mb-1">
                        <div className="flex flex-wrap gap-1">
                          {cell.specialStatuses
                            .filter((s) => s.code !== "NORMAL")
                            .map((s) => {
                              const colorClass = STATUS_COLOR[s.code] ?? "bg-gray-400 ring-gray-200";
                              const abbr = STATUS_ABBR[s.code] ?? "?";
                              return (
                                <span
                                  key={s.code}
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${colorClass}`}
                                >
                                  <span
                                    className="w-3 h-3 rounded-full bg-white/30 flex items-center justify-center text-[7px] font-bold"
                                  >
                                    {abbr}
                                  </span>
                                  {s.label}
                                </span>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  <FieldRow label="动物类型">{cageTypeLabel(cell.animalCageType)}</FieldRow>
                  <FieldRow label="状态">{cell.stateLabel}</FieldRow>
                  <FieldRow label="课题组">{cell.departmentName || "-"}</FieldRow>
                  <FieldRow label="课题 PI">{cell.projectPiName || "-"}</FieldRow>
                  <FieldRow label="AUP 编号">{cell.aupNumber || "-"}</FieldRow>
                  {cell.cageBoxQrCode && (
                    <FieldRow label="笼盒卡号" className="col-span-2">
                      <span className="font-mono text-xs">{cell.cageBoxQrCode}</span>
                      <div
                        className="mt-2 rounded-md border p-2 inline-block"
                        style={{ borderColor: "#ebedf0" }}
                      >
                        <QRCodeSVG value={cell.cageBoxQrCode} size={80} level="M" />
                      </div>
                    </FieldRow>
                  )}
                  {bi && (
                    <>
                      {bi.NeedDivideYn === 1 && (
                        <FieldRow label="请分笼">
                          <span style={{ color: "#ee0a24", fontWeight: 600 }}>是</span>
                        </FieldRow>
                      )}
                      {bi.NeedFeedingYn === 1 && (
                        <FieldRow label="特殊饲养">
                          <span style={{ color: "#ed6a0c", fontWeight: 600 }}>是</span>
                        </FieldRow>
                      )}
                      {bi.NeedTransferYn === 1 && (
                        <FieldRow label="动物转移">
                          <span style={{ color: "#1989fa", fontWeight: 600 }}>是</span>
                        </FieldRow>
                      )}
                      {bi.AbnormalHealthYn === 1 && (
                        <FieldRow label="健康异常">
                          <span style={{ color: "#ff976a", fontWeight: 600 }}>是</span>
                        </FieldRow>
                      )}
                      {bi.ClosingDate && <FieldRow label="合笼日期">{String(bi.ClosingDate)}</FieldRow>}
                      {bi.SpecialBreedingName && (
                        <FieldRow label="特殊饲养名称">{String(bi.SpecialBreedingName)}</FieldRow>
                      )}
                    </>
                  )}
                  {gridMeta && (
                    <FieldRow label="位置" className="col-span-2">
                      <span className="inline-flex items-center gap-1 text-[12px]">
                        <MapPin className="size-3 shrink-0" style={{ color: "#969799" }} />
                        {gridMeta.campusName} / {gridMeta.areaName} / {gridMeta.floorName} /{" "}
                        {gridMeta.roomName}
                      </span>
                    </FieldRow>
                  )}
                </>
              ) : (
                <div className="col-span-2 text-center py-4 text-[13px]" style={{ color: "#969799" }}>
                  仅限所属课题组及管理员查看详情
                </div>
              )}
            </div>
          </div>

          {isPermitted && (
            <>
              <div className="border-t" style={{ borderColor: "#ebedf0" }} />
              <div>
                <h4
                  className="text-[12px] font-semibold uppercase tracking-wide mb-2"
                  style={{ color: "#969799" }}
                >
                  备注与标注
                </h4>

                <label className="block mb-3">
                  <span className="text-[12px]" style={{ color: "#646566" }}>富文本备注</span>
                  <textarea
                    value={richText}
                    onChange={(e) => setRichText(e.target.value)}
                    rows={4}
                    placeholder="输入备注信息（支持 HTML）…"
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-[13px] resize-y focus:outline-none"
                    style={{
                      borderColor: "#ebedf0",
                      color: "#323233",
                      background: "#f7f8fa",
                    }}
                  />
                </label>

                <label className="block mb-3">
                  <span className="text-[12px] flex items-center gap-1" style={{ color: "#646566" }}>
                    <Image className="size-3" /> 图片（每行一个 URL）
                  </span>
                  <textarea
                    value={imageUrls}
                    onChange={(e) => setImageUrls(e.target.value)}
                    rows={3}
                    placeholder="https://example.com/image1.jpg"
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-[11px] font-mono resize-y focus:outline-none"
                    style={{
                      borderColor: "#ebedf0",
                      color: "#323233",
                      background: "#f7f8fa",
                    }}
                  />
                </label>

                {imagePreviewUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {imagePreviewUrls.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`img-${i}`}
                        className="size-20 rounded-lg border object-cover"
                        style={{ borderColor: "#ebedf0" }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
                    style={{ background: BRAND }}
                  >
                    <Save className="size-4" />
                    {saving ? "保存中…" : "保存标注"}
                  </button>
                  {saveMsg && (
                    <span
                      className="text-[12px]"
                      style={{
                        color: saveMsg.type === "ok" ? "#07c160" : "#ee0a24",
                      }}
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
    </div>
  );
}
