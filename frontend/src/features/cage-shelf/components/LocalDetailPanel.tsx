import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { authHttp } from "@/api/core/authHttp";
import { CAGE_TYPE_COLORS, STATUS_CHIPS } from "../constants";
import { type CageShelfCell } from "@/api/domains/cageShelf.api";
import { fetchCageInfoFields, fetchCageClaimInfo, updateCageClaimInfo, type CageInfoField } from "../api/cageForm.api";
import toast from "react-hot-toast";

/**
 * LocalDetailPanel — 本地数据源笼位详情面板
 *
 * 适用场景: dataSource === "local" 时，展示笼位的完整详情
 *
 * 功能分区:
 *   ① 笼位标识 — 类型徽章 + 坐标 + 笼盒码
 *   ② 关键信息 — PI / 部门 / AUP / 实验员 / 动物品系 等 compact 网格
 *   ③ 状态标记 — 分笼/特殊饲养/健康异常/合笼 标记 + 关联照片(只读)
 *   ④ 实验记录 — 可编辑 textarea + 照片上传/删除（通道二）
 *   ⑤ 历史归档 — 该笼位所有历史操作记录
 *   ⑥ 照片预览 — 双通道照片共享的全屏灯箱，支持左右切换
 *
 * Props:
 *   cell  - CageShelfCell，必须含 detail 字段（本地数据）
 *   onClose - 关闭面板回调
 *
 * 依赖:
 *   - @/api/core/authHttp      本地 API (annotate/history)
 *   - ../constants              CAGE_TYPE_COLORS, STATUS_CHIPS
 *
 * ⚠️ 本组件只用于本地数据源。ARO 数据源走 AdminCageShelfPage 内联的 CAGE_BOX_INFO_FIELD_ORDER 渲染。
 */
export default function LocalDetailPanel({ cell, onClose }: { cell: CageShelfCell; onClose: () => void }) {
  const detail = (cell as any).detail as Record<string, any> | undefined;
  const animalCageId = String((cell as any).id ?? detail?.animalCageId ?? (cell as any).animalCageId ?? "");
  const [notes, setNotes] = useState(detail?.experimentDesc ?? "");
  const [images, setImages] = useState<string[]>(() => {
    try { const raw = detail?.imagesJson; if (typeof raw === "string") { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } } catch { }
    return [];
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [statusPhotos, setStatusPhotos] = useState<Record<string, string[]>>({});

  // ── 认领信息表单：发布的字段字典 + 当前认领的实例值 ──
  const claimId = (cell as any).activeClaimId ?? (cell as any).claim?.id ?? (cell as any).claimId ?? null;
  const [fieldDefs, setFieldDefs] = useState<CageInfoField[]>([]);
  const [editValues, setEditValues] = useState<Record<number, string | number | boolean | null>>({});
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoSaving, setInfoSaving] = useState(false);

  useEffect(() => {
    fetchCageInfoFields()
      .then(all => all
        .filter(f => f.published === true)
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)))
      .then(fields => setFieldDefs(fields))
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (claimId == null) return;
    setInfoLoading(true);
    fetchCageClaimInfo(claimId)
      .then(rows => {
        const map: Record<number, string | number | boolean | null> = {};
        for (const r of rows) map[r.fieldId] = r.value;
        setEditValues(map);
      })
      .catch(() => { })
      .finally(() => setInfoLoading(false));
  }, [claimId]);

  const handleSaveInfo = async () => {
    if (claimId == null) return;
    setInfoSaving(true);
    try {
      const values = fieldDefs.map(f => ({ fieldId: f.id, value: editValues[f.id] ?? null }));
      await updateCageClaimInfo(claimId, values);
      toast.success("已保存");
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    } finally {
      setInfoSaving(false);
    }
  };

  useEffect(() => {
    if (!animalCageId) return;
    authHttp.get(`/local/history/${animalCageId}`).then(r => {
      if (r.data?.success) setHistory(r.data.data || []);
    }).catch(() => { });
  }, [animalCageId]);

  // 合并两个通道的所有照片 URL，供预览导航使用（必须在 statusPhotos 声明之后）
  const allPreviewUrls = (() => {
    const urls: string[] = [];
    for (const k of Object.keys(statusPhotos)) { for (const u of (statusPhotos[k] || [])) urls.push(u); }
    for (const u of images) urls.push(u);
    return urls;
  })();
  useEffect(() => {
    if (!animalCageId) return;
    authHttp.get(`/local/annotate/${animalCageId}`).then(r => {
      if (r.data?.success) {
        const d = r.data.data;
        if (d.experimentDesc) setNotes(d.experimentDesc);
        if (d.imagesJson) { try { const arr = JSON.parse(d.imagesJson); if (Array.isArray(arr)) setImages(arr); } catch { } }
        if (d.statusPhotos) { try { const sp = JSON.parse(d.statusPhotos); if (typeof sp === "object") setStatusPhotos(sp); } catch { } }
      }
    }).catch(() => { });
  }, [animalCageId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await authHttp.post("/local/annotate", { animalCageId, experimentDesc: notes, imagesJson: JSON.stringify(images) });
      toast.success("保存成功");
    } catch (e: any) { toast.error(e?.message || "保存失败"); }
    finally { setSaving(false); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const fd = new FormData();
        fd.append("file", files[i]);
        const r = await authHttp.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        if (r.data?.success && r.data.data?.url) urls.push(r.data.data.url);
      }
      if (urls.length) setImages(prev => [...prev, ...urls]);
    } catch (e: any) { toast.error("上传失败"); }
    finally { setUploading(false); }
  };

  const ct = detail?.cageTypeCode;
  const typeInfo = CAGE_TYPE_COLORS[ct as number];
  const cageBoxCode = detail?.cageBoxCode;
  const statusChips = STATUS_CHIPS.filter(c => {
    if (c.key === "cohabitationDate") return detail?.cohabitationDate && String(detail.cohabitationDate).trim() !== "";
    return detail?.[c.key] === true;
  });

  if (!detail) return <div className="text-xs text-[var(--twin-mute)] py-8 text-center">无本地详情数据（请先同步）</div>;

  return <div className="flex flex-col gap-3">
    {/* 一级：笼位标识 */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {typeInfo && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: typeInfo.bg, color: typeInfo.border, border: `1px solid ${typeInfo.border}` }}>{typeInfo.label}</span>}
        <span className="text-sm font-bold text-[var(--twin-ink)]">{cell.position}</span>
        {cageBoxCode && <span className="text-[10px] font-mono text-[var(--twin-mute)]">盒:{cageBoxCode}</span>}
      </div>
      <button type="button" className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={onClose}>✕</button>
    </div>

    {/* 笼位二维码：payload = 纯数字 animal_cage_id */}
    <div className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-2 flex items-center gap-3">
      <QRCodeSVG value={animalCageId} size={72} level="M" />
      <div className="text-[10px] text-[var(--twin-mute)] leading-relaxed">
        <div className="text-[11px] font-semibold text-[var(--twin-ink)]">笼位二维码</div>
        <div className="font-mono">笼位ID: {animalCageId}</div>
        <div>扫码读取该笼位占用信息</div>
      </div>
    </div>

    {/* 二级：关键信息 — 发布的字段表单（绑定当前认领，可编辑） */}
    {claimId == null ? (
      <div className="text-[11px] text-[var(--twin-mute)] py-3 text-center">暂无占用记录</div>
    ) : (
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-[var(--twin-ink)]">关键信息</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
          {fieldDefs.map(f => {
            const val = editValues[f.id];
            const isText = f.dataType === "text";
            return (
              <div key={f.id} className={isText ? "col-span-2" : ""}>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[var(--twin-mute)]">
                    {f.label}
                    {f.required === "YES" && <span className="text-red-500"> *</span>}
                  </span>
                  {f.dataType === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={val === true}
                      onChange={e => setEditValues(prev => ({ ...prev, [f.id]: e.target.checked }))}
                      className="h-4 w-4 accent-[var(--twin-primary)]"
                    />
                  ) : f.dataType === "number" ? (
                    <input
                      type="number"
                      value={typeof val === "number" ? val : ""}
                      onChange={e => {
                        const n = e.target.valueAsNumber;
                        setEditValues(prev => ({ ...prev, [f.id]: Number.isNaN(n) ? null : n }));
                      }}
                      className="w-full rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)]"
                    />
                  ) : (
                    <input
                      type="text"
                      value={typeof val === "string" ? val : ""}
                      onChange={e => setEditValues(prev => ({ ...prev, [f.id]: e.target.value }))}
                      className="w-full rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)]"
                    />
                  )}
                </label>
              </div>
            );
          })}
        </div>
        {fieldDefs.length === 0 && !infoLoading && <div className="text-[11px] text-[var(--twin-mute)] text-center py-1">暂无已发布字段</div>}
        {infoLoading && <div className="text-[10px] text-[var(--twin-mute)]">加载中...</div>}
        <button
          type="button"
          onClick={handleSaveInfo}
          disabled={infoSaving || fieldDefs.length === 0}
          className="rounded-twin-md px-3 py-1 text-[11px] font-semibold bg-[var(--twin-primary)] text-white hover:brightness-95 disabled:opacity-50 transition self-start"
        >
          {infoSaving ? "保存中..." : "保存"}
        </button>
      </div>
    )}

    {/* 三级：状态标记 + 通道一：状态标记照片（只读，仅编辑模式可管理） */}
    {(statusChips.length > 0 || Object.keys(statusPhotos).some(k => k.startsWith("_") && (statusPhotos[k] || []).length > 0)) && <div className="space-y-2">
      {statusChips.map(c => {
        const sImgs: string[] = statusPhotos[c.key] || [];
        return <div key={c.key} className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: `${c.color}18`, color: c.color, border: `1px solid ${c.color}40` }}>{c.icon} {c.label}{c.key === "cohabitationDate" && detail?.cohabitationDate ? ` ${String(detail.cohabitationDate).substring(0, 10)}` : ""}</span>
            <span className="text-[9px] text-[var(--twin-mute)]">📷 {sImgs.length}张</span>
          </div>
          {sImgs.length > 0 && <div className="flex flex-wrap gap-1">
            {sImgs.map((url: string, j: number) => (
              <img key={j} src={url} onClick={() => setPreviewUrl(url)}
                className="h-10 w-10 object-cover rounded border border-[var(--twin-hairline)] cursor-pointer hover:opacity-80 transition" />
            ))}
          </div>}
          {sImgs.length > 0 && <div className="text-[9px] text-[var(--twin-mute)] mt-1 italic">通过编辑模式管理</div>}
        </div>;
      })}
      {/* 兜底 _status key：弹窗A上传但未绑定到具体状态标记的照片 */}
      {(() => {
        const catchAll = (statusPhotos._status || []); if (catchAll.length === 0) return null;
        return <div className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-300">📌 状态照片</span>
            <span className="text-[9px] text-[var(--twin-mute)]">📷 {catchAll.length}张</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {catchAll.map((url: string, j: number) => (
              <img key={j} src={url} onClick={() => setPreviewUrl(url)}
                className="h-10 w-10 object-cover rounded border border-[var(--twin-hairline)] cursor-pointer hover:opacity-80 transition" />
            ))}
          </div>
          <div className="text-[9px] text-[var(--twin-mute)] mt-1 italic">通过编辑模式管理</div>
        </div>;
      })()}
      {detail?.specialBreedingName && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200">{detail.specialBreedingName}</span>}
      {/* 标注备注（通道一只读） */}
      {typeof (statusPhotos as any)._note === "string" && (statusPhotos as any)._note.trim() && <div className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5">
        <div className="text-[10px] font-semibold text-[var(--twin-mute)] mb-1">📝 标注备注</div>
        <div className="text-[11px] text-[var(--twin-ink)] whitespace-pre-wrap">{(statusPhotos as any)._note}</div>
        <div className="text-[9px] text-[var(--twin-mute)] mt-1 italic">通过编辑模式管理</div>
      </div>}
    </div>}

    {/* 四级A：实验记录（通道二可编辑） */}
    <div className="border-t border-[var(--twin-hairline)] pt-2">
      <div className="text-[11px] font-semibold text-[var(--twin-ink)] mb-1.5">📝 实验记录</div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)}
        className="w-full rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1.5 text-[11px] text-[var(--twin-ink)] resize-y min-h-[60px]"
        placeholder="输入实验记录、备注..." />
    </div>

    {/* 四级B：通道二：实验记录照片（详情面板直接增删） */}
    <div className="border-t border-[var(--twin-hairline)] pt-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] font-semibold text-[var(--twin-ink)]">🧪 实验记录照片 ({images.length})</div>
        <label className="cursor-pointer px-2 py-0.5 rounded-twin-md text-[10px] font-semibold bg-[var(--twin-primary)] text-white hover:brightness-95 transition">
          {uploading ? "上传中..." : "+ 添加"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      {images.length > 0 && <div className="flex flex-wrap gap-1.5">
        {images.map((url, i) => (
          <div key={i} className="relative group">
            <img src={url} alt="" onClick={() => setPreviewUrl(url)}
              className="h-14 w-14 object-cover rounded-twin-sm border border-[var(--twin-hairline)] cursor-pointer hover:opacity-80 transition" />
            <button onClick={(e) => { e.stopPropagation(); setImages(p => p.filter(x => x !== url)); }}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] items-center justify-center hidden group-hover:flex">✕</button>
          </div>))}
      </div>}
    </div>

    {/* 历史归档 */}
    <div className="border-t border-[var(--twin-hairline)] pt-2">
      <div className="text-[11px] font-semibold text-[var(--twin-mute)] mb-1.5">📦 历史记录 ({history.length})</div>
      <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
        {history.map((h: any, i: number) => {
          const label = h.statusField === "needs_division" ? "需分笼" : h.statusField === "needs_special_feeding" ? "特殊饲养" : h.statusField === "_annotation" ? "标注记录" : "健康异常";
          const imgs: string[] = (() => { try { const arr = JSON.parse(h.imagesJson || "[]"); return Array.isArray(arr) ? arr : []; } catch { return []; } })();
          return <div key={i} className="flex items-center gap-2 text-[10px] rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1">
            <span className="text-[var(--twin-mute)] whitespace-nowrap">{h.createdAt?.substring(0, 16) || ""}</span>
            <span className={h.action === "unmarked" ? "text-red-600" : h.action === "annotated" ? "text-blue-600" : "text-green-600"}>{h.action === "unmarked" ? "✕" : h.action === "annotated" ? "📝" : "✓"} {label}</span>
            {imgs.length > 0 && <div className="flex gap-0.5">{imgs.slice(0, 4).map((url: string, j: number) => (<img key={j} src={url} className="h-6 w-6 object-cover rounded-twin-xs border border-[var(--twin-hairline)]" />))}{imgs.length > 4 && <span className="text-[var(--twin-mute)]">+{imgs.length - 4}</span>}</div>}
            {h.toggledBy && <span className="text-[var(--twin-mute)] ml-auto">{h.toggledBy}</span>}
          </div>;
        })}
      </div>
    </div>

    {/* 保存 */}
    <button type="button" onClick={handleSave} disabled={saving}
      className="rounded-twin-md px-4 py-1.5 text-[11px] font-semibold bg-[var(--twin-primary)] text-white hover:brightness-95 disabled:opacity-50 transition self-end">
      {saving ? "保存中..." : "保存"}
    </button>

    {/* 照片预览放大（双通道共享） */}
    {previewUrl !== null && (() => { const curIdx = allPreviewUrls.indexOf(previewUrl); return <div className="fixed inset-0 z-[var(--z-modal)] bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
      <img src={previewUrl} alt="预览" className="max-w-full max-h-full object-contain rounded-twin-lg" onClick={e => e.stopPropagation()} />
      <button className="absolute top-4 right-4 text-white text-xl" onClick={() => setPreviewUrl(null)}>✕</button>
      {allPreviewUrls.length > 1 && <>
        <button className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-2xl" onClick={e => { e.stopPropagation(); const prev = curIdx > 0 ? curIdx - 1 : allPreviewUrls.length - 1; setPreviewUrl(allPreviewUrls[prev]); }}>‹</button>
        <button className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-2xl" onClick={e => { e.stopPropagation(); const next = curIdx < allPreviewUrls.length - 1 ? curIdx + 1 : 0; setPreviewUrl(allPreviewUrls[next]); }}>›</button>
      </>}
    </div>; })()}
  </div>;
}
