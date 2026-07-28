/** 手机版笼位详情弹窗（与 Web 管理端 cageBoxInfo 字段及标注编辑对齐） */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ImagePlus, Save, X, Check, X as XIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { CageShelfCell } from "@/features/student/api/student.api";
import { STATUS_COLOR, STATUS_ABBR } from "@/features/cage-shelf/components/CageCellOverlays";
import {
  appendImageUrls,
  buildCageDetailSections,
  parseImageUrlLines,
  resolveCageTypeLabel,
  resolveSpecialStatusChips,
} from "@/utils/cageCellDetailHelpers";
import { uploadSingleImage } from "@/api/domains/upload.api";
import {
  fetchMobileCageCellAnnotation,
  saveMobileCageCellAnnotation,
} from "@/api/domains/mobileStudent.api";
import {
  fetchStudentMobileCageCellAnnotation,
  saveStudentMobileCageCellAnnotation,
} from "@/api/domains/studentMobile.api";
import type { CageBoxAction } from "@/api/domains/cageShelf.api";

const BRAND = "#ac1736";

function displayPosition(pos: string): string {
  const m = pos.match(/^([A-H])-(\d+)$/);
  if (!m) return pos;
  return `${m[1]}-${11 - parseInt(m[2])}`;
}

const HIGHLIGHT_COLOR: Record<string, string> = {
  danger: "#ee0a24",
  warn: "#ed6a0c",
  info: "#1989fa",
  health: "#ff976a",
};

function FieldRow({
  label,
  children,
  className,
  valueColor,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  valueColor?: string;
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
      <div
        className="mt-0.5 text-[13px] break-all"
        style={{ color: valueColor ?? "#323233" }}
      >
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
        <h4
          className="text-[12px] font-semibold uppercase tracking-wide mb-2"
          style={{ color: "#969799" }}
        >
          {title}
        </h4>
        {children}
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        className="w-full flex items-center gap-1.5 mb-2"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" style={{ color: "#969799" }} />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" style={{ color: "#969799" }} />
        )}
        <h4
          className="text-[12px] font-semibold uppercase tracking-wide"
          style={{ color: "#969799" }}
        >
          {title}
        </h4>
      </button>
      {open && children}
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
  staffView,
  editMode,
  roomId,
  cachedActions,
  initialCachedActions,
  onCacheUpdate,
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
  staffView?: boolean;
  editMode?: boolean;
  roomId?: string;
  cachedActions?: Set<CageBoxAction>;
  /** 缓存条目的初始快照（首次创建缓存时的 cageBoxInfo 状态），用于 diff 三态显示 */
  initialCachedActions?: Set<CageBoxAction>;
  onCacheUpdate?: (actions: Set<CageBoxAction>) => void;
}) {
  const [richText, setRichText] = useState("");
  const [imageUrls, setImageUrls] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 教职工动作选择：initialCachedActions（缓存快照）> cageBoxInfo 预选 ──
  const initialActions = useMemo(() => {
    // 缓存快照优先（保证 diff 基准不变）
    if (initialCachedActions && initialCachedActions.size > 0) return new Set(initialCachedActions);
    const cbi = cell.cageBoxInfo as Record<string, any> | undefined;
    if (!cbi) return new Set<CageBoxAction>();
    // 兼容嵌套 cageBoxVo 结构（对齐小程序：同时检查扁平和嵌套字段）
    const cvo = cbi.cageBoxVo ?? cbi['cageBoxVo'] ?? {};
    const s = new Set<CageBoxAction>();
    if (cbi.NeedDivideYn === 1 || cbi.NeedDivideYn === "1" || cvo.needDivideYn === 1 || cvo.needDivideYn === "1")
      s.add("DIVIDE");
    if (cbi.NeedFeedingYn === 1 || cbi.NeedFeedingYn === "1" || cvo.needFeedingYn === 1 || cvo.needFeedingYn === "1"
        || (typeof cbi.specialBreedingName === "string" && (cbi.specialBreedingName as string).trim())
        || (typeof cvo.specialBreedingName === "string" && cvo.specialBreedingName.trim()))
      s.add("SPECIAL_BREEDING");
    if (cbi.AbnormalHealthYn === 1 || cbi.AbnormalHealthYn === "1" || cvo.abnormalHealthYn === 1 || cvo.abnormalHealthYn === "1"
        || cbi.animalHealthEntity != null || cvo.animalHealthEntity != null)
      s.add("HEALTH_CHECK");
    return s;
  }, [cell, cachedActions]);

  const [localActions, setLocalActions] = useState<Set<CageBoxAction>>(initialActions);

  // 记录初始状态，用于判断反选（对齐小程序：统一由页面顶栏提交）
  const isDeselect = useCallback((a: CageBoxAction) => initialActions.has(a) && !localActions.has(a), [initialActions, localActions]);
  const isNewSelect = useCallback((a: CageBoxAction) => !initialActions.has(a) && localActions.has(a), [initialActions, localActions]);

  const toggleLocalAction = (a: CageBoxAction) => {
    setLocalActions((prev) => { const n = new Set(prev); if (n.has(a)) n.delete(a); else n.add(a); return n; });
  };

  // 延迟同步到父级 scanCache（避免 setState-in-render 警告）
  useEffect(() => {
    onCacheUpdate?.(localActions);
  }, [localActions, onCacheUpdate]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const detailSections = useMemo(
    () => buildCageDetailSections(cell, gridMeta),
    [cell, gridMeta],
  );
  const specialChips = useMemo(() => resolveSpecialStatusChips(cell), [cell]);
  const cageTypeLabel = resolveCageTypeLabel(cell);
  const imagePreviewUrls = parseImageUrlLines(imageUrls);
  const cageBoxQrCode =
    cell.cageBoxQrCode ||
    String((cell.cageBoxInfo as Record<string, unknown> | undefined)?.CageBoxQrCode ?? "").trim();

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
      const imgArr = parseImageUrlLines(imageUrls);
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

  const handleImagePick = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setSaveMsg(null);
    try {
      const uploaded: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        const result = await uploadSingleImage(file);
        uploaded.push(result.publicUrl || result.url);
      }
      if (uploaded.length) {
        setImageUrls((prev) => appendImageUrls(prev, uploaded));
      }
    } catch (e) {
      setSaveMsg({ type: "err", text: e instanceof Error ? e.message : "图片上传失败" });
      window.setTimeout(() => setSaveMsg(null), 2500);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const isPermitted = cell.visible;

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
                {displayPosition(cell.position)}
              </span>
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "#969799" }}>
              {cageTypeLabel}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={handleClose} className="p-1 rounded-lg shrink-0">
              <X className="size-5" style={{ color: "#94a3b8" }} />
            </button>
          </div>
        </div>

        {/* 教职工动作选择（特殊状态 chips 下方） */}
        {staffView && editMode && isPermitted && (
          <div className="shrink-0 px-4 pb-1">
            <div className="flex flex-wrap gap-1.5">
              {(["DIVIDE", "SPECIAL_BREEDING", "HEALTH_CHECK"] as const).map((key) => {
                const active = localActions.has(key);
                const wasExisting = initialActions.has(key);
                const lb = key === "DIVIDE" ? "请分笼" : key === "SPECIAL_BREEDING" ? "特殊饲养" : "健康检查";
                // 已有且保留=绿，新增=红，已有但取消=灰（不显示选中状态）
                const accent = active ? (wasExisting ? "#10b981" : BRAND) : "#cbd5e1";
                const bg = active ? (wasExisting ? "rgba(16,185,129,0.12)" : "rgba(172,23,54,0.08)") : "transparent";
                return (
                  <button key={key} type="button" onClick={() => toggleLocalAction(key)}
                    className="rounded-full px-3 py-1.5 text-[11px] font-semibold active:scale-95 transition"
                    style={{
                      color: active ? (wasExisting ? "#059669" : BRAND) : "#94a3b8",
                      background: bg,
                      border: `1.5px solid ${accent}`,
                    }}>
                    {active && <Check className="size-3 inline mr-0.5" strokeWidth={3} />}
                    {!active && wasExisting && <XIcon className="size-3 inline mr-0.5" strokeWidth={2} />}
                    {lb}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
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
                        valueColor={f.highlight ? HIGHLIGHT_COLOR[f.highlight] : undefined}
                      >
                        <span className={f.mono ? "font-mono text-xs" : undefined}>{f.value}</span>
                      </FieldRow>
                    ))}
                  </div>
                </DetailSection>
              ))}

              {cageBoxQrCode && (
                <div>
                  <div className="text-[11px] mb-2" style={{ color: "#969799" }}>笼盒二维码</div>
                  <div
                    className="rounded-md border p-2 inline-block"
                    style={{ borderColor: "#ebedf0" }}
                  >
                    <QRCodeSVG value={cageBoxQrCode} size={80} level="M" />
                  </div>
                </div>
              )}

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

                <div className="mb-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[12px]" style={{ color: "#646566" }}>图片</span>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium disabled:opacity-50"
                      style={{
                        color: BRAND,
                        border: `1px solid ${BRAND}`,
                        background: "#fff",
                      }}
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
                    className="w-full rounded-lg border px-3 py-2 text-[11px] font-mono resize-y focus:outline-none"
                    style={{
                      borderColor: "#ebedf0",
                      color: "#323233",
                      background: "#f7f8fa",
                    }}
                  />
                </div>

                {imagePreviewUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {imagePreviewUrls.map((url, i) => (
                      <img
                        key={`${url}-${i}`}
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
          ) : (
            <div className="text-center py-4 text-[13px]" style={{ color: "#969799" }}>
              仅限所属课题组及管理员查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
