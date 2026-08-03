/** 手机版笼位详情弹窗（v2 — icon+compact 布局，无折叠区块） */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Save, X } from "lucide-react";
import type { CageShelfCell } from "@/api/domains/cageShelf.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { fetchLocalAnnotate, localAnnotate } from "@/api/domains/cageShelf.api";

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

function dBool(detail: Record<string, unknown> | undefined | null, key: string): boolean {
  const v = detail?.[key];
  return v === true || v === 1 || v === "1";
}

function dNum(detail: Record<string, unknown> | undefined | null, key: string): number | null {
  const v = detail?.[key];
  if (v == null || v === "") return null;
  return Number(v);
}

/** cage type badge: 1=等待分配 2=空笼盒 3=饲养中 4=异常 */
function cageTypeLabel(t: unknown): string {
  const n = Number(t);
  if (n === 1) return "等待分配";
  if (n === 2) return "已预约(空笼盒)";
  if (n === 3) return "饲养中";
  if (n === 4) return "异常";
  return "未知";
}

function cageTypeBadgeStyle(t: unknown): { bg: string; color: string } {
  const n = Number(t);
  if (n === 1) return { bg: "#fef3c7", color: "#d97706" };
  if (n === 2) return { bg: "#d1fae5", color: "#059669" };
  if (n === 3) return { bg: "#ffe4e6", color: "#e11d48" };
  if (n === 4) return { bg: "#dbeafe", color: "#2563eb" };
  return { bg: "#f2f3f5", color: "#646566" };
}

function RowItem({
  icon,
  label,
  value,
}: {
  icon: string;
  label?: string;
  value: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 py-1 text-[13px]" style={{ color: "#323233" }}>
      <span className="shrink-0 text-base leading-none">{icon}</span>
      {label && (
        <span className="shrink-0 text-[11px]" style={{ color: "#969799" }}>
          {label}
        </span>
      )}
      <span className="truncate font-medium">{value}</span>
    </div>
  );
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
}: {
  cell: CageShelfCell;
  onClose: () => void;
  staffView?: boolean;
}) {
  const detail = (cell.detail ?? {}) as Record<string, unknown>;
  const cbi = (cell.cageBoxInfo ?? {}) as Record<string, unknown> | undefined;

  // ── 从 detail 读取核心字段 ──
  const position = displayPosition(cell.position);
  const ct = detail.cageTypeCode ?? cell.animalCageType;
  const typeBadge = cageTypeBadgeStyle(ct);
  const typeText = cageTypeLabel(ct);
  const stateLabel = dGet(detail, cbi, "stateLabel") || (cell.stateLabel?.trim() ?? "");
  const cageBoxCode = dGet(detail, cbi, "cageBoxCode");
  const piName = dGet(detail, cbi, "piName") || dGet(detail, cbi, "projectPiName") || (cell.projectPiName?.trim() ?? "");
  const deptName = dGet(detail, cbi, "departmentName") || (cell.departmentName?.trim() ?? "");
  const aupNumber = dGet(detail, cbi, "aupNumber");
  const experimenter = dGet(detail, cbi, "experimenterName");
  const labAssistant = dGet(detail, cbi, "labAssistantName");

  // 动物信息
  const strain = dGet(detail, cbi, "animalStrainName");
  const sex = dGet(detail, cbi, "animalSex");
  const weekAge = dGet(detail, cbi, "animalWeekAge");
  const maleN = dNum(detail, "animalMaleNumber");
  const femaleN = dNum(detail, "animalFemaleNumber");
  const comeFrom = dGet(detail, cbi, "animalComeFrom");

  // 特殊状态 chip
  const needsDivision = dBool(detail, "needsDivision");
  const needsSpecialFeeding = dBool(detail, "needsSpecialFeeding");
  const needsTransfer = dBool(detail, "needsTransfer");
  const hasHealthAbnormality = dBool(detail, "hasHealthAbnormality");
  const cohabitationDate = dGet(detail, cbi, "cohabitationDate");

  // ── 实验记录 & 照片 ──
  const [experimentDesc, setExperimentDesc] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [statusPhotos, setStatusPhotos] = useState<Record<string,string[]>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const animalCageId: string = String(
    (cell as any).id ?? (cell as any).animalCageId ?? detail.animalCageId ?? "",
  );

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

  // ── 构建特殊状态 chip 列表 ──
  const chips = useMemo(() => {
    const list: { label: string; active: boolean; color: string }[] = [];
    if (needsDivision !== undefined)
      list.push({ label: "需分笼", active: needsDivision, color: "#eab308" });
    if (needsSpecialFeeding !== undefined)
      list.push({ label: "特殊饲养", active: needsSpecialFeeding, color: "#ef4444" });
    if (needsTransfer !== undefined)
      list.push({ label: "动物转移", active: needsTransfer, color: "#06b6d4" });
    if (hasHealthAbnormality !== undefined)
      list.push({ label: "健康异常", active: hasHealthAbnormality, color: "#a855f7" });
    if (cohabitationDate)
      list.push({ label: `合笼 ${cohabitationDate}`, active: true, color: "#10b981" });
    return list;
  }, [needsDivision, needsSpecialFeeding, needsTransfer, hasHealthAbnormality, cohabitationDate]);

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
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: "#ebedf0" }}
        >
          <div className="min-w-0 pr-2 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold" style={{ color: "#323233" }}>
              {position}
            </span>
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{ background: typeBadge.bg, color: typeBadge.color }}
            >
              {typeText}
            </span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg shrink-0">
            <X className="size-5" style={{ color: "#94a3b8" }} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
          {isPermitted ? (
            <>
              {/* ── 笼盒编号 ── */}
              {cageBoxCode && (
                <div
                  className="flex items-center gap-2 py-1.5 px-3 rounded-lg text-[12px] font-mono"
                  style={{ background: "#f7f8fa", color: "#646566" }}
                >
                  <span className="text-[10px] shrink-0" style={{ color: "#969799" }}>笼盒</span>
                  <span className="font-semibold" style={{ color: "#323233" }}>{cageBoxCode}</span>
                </div>
              )}

              {/* ── 人员信息 ── */}
              <div className="space-y-0">
                <RowItem icon="👤" value={piName ? `PI ${piName}` : ""} />
                <RowItem icon="🏢" value={deptName ? `部门 ${deptName}` : ""} />
                <RowItem icon="📋" value={aupNumber ? `AUP ${aupNumber}` : ""} />
              </div>

              {/* ── 动物信息 ── */}
              {(strain || sex || weekAge || maleN != null || femaleN != null) && (
                <div
                  className="rounded-lg px-3 py-2"
                  style={{ background: "#f8f9fc", border: "1px solid #eef0f6" }}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]" style={{ color: "#323233" }}>
                    {strain && (
                      <span className="font-semibold">{strain}</span>
                    )}
                    {sex && <span>⚥ {sex}</span>}
                    {weekAge && <span>{weekAge}周龄</span>}
                    {(maleN != null || femaleN != null) && (
                      <span>
                        {(maleN ?? 0) > 0 && `${maleN}♂`}
                        {(maleN ?? 0) > 0 && (femaleN ?? 0) > 0 && "+"}
                        {(femaleN ?? 0) > 0 && `${femaleN}♀`}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <RowItem icon="📍" value={comeFrom ? `来源 ${comeFrom}` : ""} />
              <RowItem icon="🔬" value={experimenter ? `实验员 ${experimenter}` : ""} />
              <RowItem icon="🧪" value={labAssistant ? `实验助理 ${labAssistant}` : ""} />

              {/* ── 特殊状态 chips ── */}
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((ch) => (
                    <span
                      key={ch.label}
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
                      style={{
                        color: ch.active ? ch.color : "#94a3b8",
                        background: ch.active
                          ? `color-mix(in srgb, ${ch.color} 12%, transparent)`
                          : "#f2f3f5",
                        border: `1px solid ${ch.active ? ch.color : "#e5e7eb"}`,
                      }}
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 shrink-0"
                        style={{ background: ch.active ? ch.color : "#cbd5e1" }}
                      />
                      {ch.label}
                    </span>
                  ))}
                </div>
              )}

              {/* 通道一：状态标记照片（只读，仅编辑模式可管理） */}
              {chips.filter(ch=>ch.active&&(statusPhotos[ch.label==="需分笼"?"needs_division":ch.label==="特殊饲养"?"needs_special_feeding":ch.label==="动物转移"?"needs_transfer":"has_health_abnormality"]||[]).length>0).map(ch=>{
                const spKey=ch.label==="需分笼"?"needs_division":ch.label==="特殊饲养"?"needs_special_feeding":ch.label==="动物转移"?"needs_transfer":"has_health_abnormality";
                const spImgs=statusPhotos[spKey]||[];
                return <div key={ch.label} className="rounded-lg px-2 py-1.5 mb-1" style={{background:"#f8f9fc",border:"1px solid #eef0f6"}}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-semibold" style={{color:ch.color}}>{ch.label}照片 ({spImgs.length})</span>
                  </div>
                  {spImgs.length>0&&<div className="flex flex-wrap gap-1">
                    {spImgs.map((url:string,j:number)=><img key={j} src={url} onClick={()=>setPreviewUrl(url)} className="h-10 w-10 object-cover rounded border cursor-pointer" style={{borderColor:"#ebedf0"}} alt="" />)}
                  </div>}
                  <div className="text-[9px] italic mt-1" style={{color:"#969799"}}>通过编辑模式管理</div>
                </div>;
              })}
              {/* 兜底 _status key：弹窗A上传但未绑定到具体状态标记的照片 */}
              {(()=>{const catchAll=(statusPhotos._status||[]);if(catchAll.length===0)return null;
                return <div className="rounded-lg px-2 py-1.5 mb-1" style={{background:"#f8f9fc",border:"1px solid #eef0f6"}}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-semibold" style={{color:"#64748b"}}>状态照片 ({catchAll.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {catchAll.map((url:string,j:number)=><img key={j} src={url} onClick={()=>setPreviewUrl(url)} className="h-10 w-10 object-cover rounded border cursor-pointer" style={{borderColor:"#ebedf0"}} alt="" />)}
                  </div>
                  <div className="text-[9px] italic mt-1" style={{color:"#969799"}}>通过编辑模式管理</div>
                </div>;
              })()}
              {/* 标注备注（通道一只读） */}
              {typeof (statusPhotos as any)._note==="string"&&(statusPhotos as any)._note.trim()&&<div className="rounded-lg px-2 py-1.5 mb-1" style={{background:"#f8f9fc",border:"1px solid #eef0f6"}}>
                <div className="text-[10px] font-semibold mb-1" style={{color:"#64748b"}}>📝 标注备注</div>
                <div className="text-[11px] whitespace-pre-wrap" style={{color:"#323233"}}>{(statusPhotos as any)._note}</div>
                <div className="text-[9px] italic mt-1" style={{color:"#969799"}}>通过编辑模式管理</div>
              </div>}

              <div
                className="border-t"
                style={{ borderColor: "#ebedf0", margin: "4px 0" }}
              />

              {/* ── 实验记录 ── */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-base leading-none">📝</span>
                  <span className="text-[12px] font-semibold" style={{ color: "#323233" }}>
                    实验记录
                  </span>
                </div>
                <textarea
                  value={experimentDesc}
                  onChange={(e) => setExperimentDesc(e.target.value)}
                  rows={4}
                  placeholder="输入实验记录…"
                  className="w-full rounded-lg border px-3 py-2 text-[13px] resize-y focus:outline-none"
                  style={{
                    borderColor: "#dde1e8",
                    color: "#323233",
                    background: "#fafbfc",
                  }}
                />
              </div>

              {/* ── 照片 ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base leading-none">🧪</span>
                    <span className="text-[12px] font-semibold" style={{ color: "#323233" }}>
                      实验记录照片
                    </span>
                    {images.length > 0 && (
                      <span className="text-[10px]" style={{ color: "#969799" }}>
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
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {images.map((url, i) => (
                      <div key={`${i}-${url.slice(-20)}`} className="relative aspect-square rounded-lg overflow-hidden border"
                        style={{ borderColor: "#ebedf0" }}>
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
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
                  style={{ background: BRAND }}
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
          style={{ zIndex: "var(--z-tooltip, 900)", background: "rgba(0,0,0,0.9)" }}
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
