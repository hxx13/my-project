import { useEffect, useState } from "react";
import { appConfirm } from "@/lib/appDialog";
import { QRCodeSVG } from "qrcode.react";
import { authHttp } from "@/api/core/authHttp";
import { CAGE_TYPE_COLORS, CAGE_BOX_ACTIONS, actionsFromFormValues } from "../constants";
import { DEFAULT_COLORS } from "./CageColorContext";
import { fetchCageInfoValues, type CageInfoValueRow } from "../api/cageForm.api";
import { type CageShelfCell, clearCageDivision } from "@/api/domains/cageShelf.api";
import CageFormFill from "./CageFormFill";
import CageExperimentRecordPanel from "./CageExperimentRecordPanel";
import CageOperationActions from "./CageOperationActions";
import type { CageOpKind, CageOpMark, CageOpSource } from "../useCageOpSelect";
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
 *   - ../constants              CAGE_TYPE_COLORS, CAGE_BOX_ACTIONS, actionsFromFormValues
 *
 * ⚠️ 本组件只用于本地数据源。ARO 数据源走 AdminCageShelfPage 内联的 CAGE_BOX_INFO_FIELD_ORDER 渲染。
 */
export default function LocalDetailPanel({ cell, onClose, onStartOp, onChanged, opMarkByCageId, canDivide, onBatchEdit, canEditStatusPhotos }: {
  cell: CageShelfCell;
  onClose: () => void;
  /** 分笼/转移：由页面进入选位模式（主网格选目标），不传则不显示入口 */
  onStartOp?: (kind: CageOpKind, source: CageOpSource) => void;
  /** 认领成功后刷新 */
  onChanged?: () => void;
  /** 待审分笼/转移中间态（按 animalCageId 取）；命中时显示「分笼审核中/转移审核中」状态条 */
  opMarkByCageId?: Map<string, CageOpMark>;
  /** 是否显示「清空划分」入口（管家身份） */
  canDivide?: boolean;
  /** 表单编辑态里的「批量编辑」入口（由页面实现网格选择模式），不传则不显示 */
  onBatchEdit?: (cageId: string) => void;
  /**
   * 能否在详情面板里直接删状态照片 —— 由页面按 `/cage-mode/visible` 是否含「状态(edit)」传入，
   * 与后端 `/local/annotate` 状态照片分支的闸同口径。不传就不出删除入口。
   */
  canEditStatusPhotos?: boolean;
}) {
  const detail = (cell as any).detail as Record<string, any> | undefined;
  const animalCageId = String((cell as any).id ?? detail?.animalCageId ?? (cell as any).animalCageId ?? "");
  const [clearingDivision, setClearingDivision] = useState(false);
  const [statusPhotoSaving, setStatusPhotoSaving] = useState(false);

  /**
   * 直接删一张状态照片：**立即回写** `/local/annotate`（与「状态模式」上传同一道闸），
   * 失败回滚本地 —— 详情面板没有保存按钮，只改内存等于白删。
   * 桶空了删键不留空数组，否则那个状态的照片区会永远留一个空盒子。
   */
  const removeStatusPhoto = async (field: string, index: number) => {
    if (!animalCageId || !canEditStatusPhotos || statusPhotoSaving) return;
    const arr = (statusPhotos[field] || []).slice();
    if (index < 0 || index >= arr.length) return;
    arr.splice(index, 1);
    const next: Record<string, unknown> = { ...statusPhotos };
    if (arr.length) next[field] = arr; else delete next[field];
    const prev = statusPhotos;
    setStatusPhotos(next as Record<string, string[]>);
    setStatusPhotoSaving(true);
    try {
      await authHttp.post("/local/annotate", { animalCageId, statusPhotos: JSON.stringify(next) });
      toast.success("已删除");
    } catch (e: any) {
      setStatusPhotos(prev);
      toast.error(e?.message || "删除失败");
    } finally {
      setStatusPhotoSaving(false);
    }
  };

  /** 一张状态照片 + （有权限时）右上角删除 */
  const statusPhotoThumb = (field: string, url: string, index: number) => (
    <div key={`${field}:${index}`} className="relative group">
      <img src={url} alt="" onClick={() => setPreviewUrl(url)}
        className="h-10 w-10 object-cover rounded border border-[var(--twin-hairline)] cursor-pointer hover:opacity-80 transition" />
      {canEditStatusPhotos && (
        <button
          type="button"
          disabled={statusPhotoSaving}
          onClick={(e) => { e.stopPropagation(); void removeStatusPhoto(field, index); }}
          title="删除这张照片"
          className="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-[var(--twin-danger,#dc2626)] text-[10px] leading-none text-white group-hover:flex disabled:opacity-50"
        >
          ✕
        </button>
      )}
    </div>
  );

  /** 局部清空：只清当前这一个笼位的划分，不动其他笼位 */
  const handleClearDivision = async () => {
    if (!animalCageId) return;
    setClearingDivision(true);
    try {
      await clearCageDivision([animalCageId]);
      toast.success("已清空该笼位的划分");
      onChanged?.();
      onClose?.();
    } catch (e: any) {
      toast.error(e?.message || "清空划分失败");
    } finally {
      setClearingDivision(false);
    }
  };
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [qrZoom, setQrZoom] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [statusPhotos, setStatusPhotos] = useState<Record<string, string[]>>({});
  const [formValues, setFormValues] = useState<CageInfoValueRow[] | null>(null);

  // ── 认领状态标识：有认领记录即「已认领」（认领流程的领地，与一键认领入口互斥）──
  const claimed = !!((cell as any).activeClaimId);

  // ── 编辑权限：**只认服务端**（cageEditInfo，读矩阵能力 cage.edit.form）──
  // 原先这里还有一道客户端硬编码（角色≥ADMIN 或身份含 BREEDING_GROUP_LEADER）并与服务端取或，
  // 结果是「服务端拦得住、客户端能绕过」——同一个账号 Web 能编、别处不能的根因。
  // 2026-09-15 编辑权进矩阵后移除该旁路，判定收敛到 CageFormFill 的 serverEditable 一处。

  useEffect(() => {
    if (!animalCageId) return;
    authHttp.get(`/local/history/${animalCageId}`).then(r => {
      if (r.data?.success) setHistory(r.data.data || []);
    }).catch(() => { });
  }, [animalCageId]);

  // 拉取表单值(cage_info_value)：状态标记唯一真相源，据此渲染状态 chips
  useEffect(() => {
    if (!animalCageId) { setFormValues(null); return; }
    let cancelled = false;
    fetchCageInfoValues(animalCageId).then(rows => { if (!cancelled) setFormValues(rows); }).catch(() => { if (!cancelled) setFormValues(null); });
    return () => { cancelled = true; };
  }, [animalCageId]);

  // 状态标记照片的 URL 集合，供预览导航使用（必须在 statusPhotos 声明之后）
  const allPreviewUrls = (() => {
    const urls: string[] = [];
    for (const k of Object.keys(statusPhotos)) { for (const u of (statusPhotos[k] || [])) urls.push(u); }
    return urls;
  })();
  useEffect(() => {
    if (!animalCageId) return;
    authHttp.get(`/local/annotate/${animalCageId}`).then(r => {
      if (r.data?.success) {
        const d = r.data.data;
        if (d.statusPhotos) { try { const sp = JSON.parse(d.statusPhotos); if (typeof sp === "object") setStatusPhotos(sp); } catch { } }
      }
    }).catch(() => { });
  }, [animalCageId]);

  /** 删除单条历史归档（后端 /local/history/{id} 只给教职工）。删完就地移出列表，不去重拉。 */
  const handleDeleteHistory = async (id: unknown) => {
    if (id == null) return;
    if (!(await appConfirm("确定删除该条历史记录？"))) return;
    try {
      const r = await authHttp.delete(`/local/history/${id}`);
      if (!r.data?.success) throw new Error(r.data?.message || "删除失败");
      setHistory((prev: any[]) => prev.filter((x: any) => x.id !== id));
      toast.success("已删除");
    } catch (e: any) {
      toast.error(e?.message || "删除失败");
    }
  };

  const ct = detail?.cageTypeCode;
  const typeInfo = CAGE_TYPE_COLORS[ct as number];
  const cageBoxCode = detail?.cageBoxCode;
  // 状态 chips：以表单为真相源，只列已开启的状态（无合笼日期指示）
  const activeActions = actionsFromFormValues(formValues);
  const statusChips = CAGE_BOX_ACTIONS.filter(a => activeActions.has(a.action));

  if (!detail) return <div className="text-xs text-[var(--twin-mute)] py-8 text-center">无本地详情数据（请先同步）</div>;

  return <div className="flex flex-col gap-3 p-3">
    {/* 一级：笼位标识 —— **吸顶**：关闭按钮原来跟内容一起滚走，滚到底还得翻回顶部才能关（2026-09-19 用户报） */}
    <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-1 flex items-center justify-between border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 pb-2 pt-3">
      <div className="flex items-center gap-2">
        {statusChips.length > 0
          ? statusChips.map((a) => {
              const c = DEFAULT_COLORS[a.statusCode] ?? { bg: "#ccc", border: "#999" };
              return <span key={a.action} className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: c.bg, color: c.border, border: `1px solid ${c.border}` }}>{a.label}</span>;
            })
          : typeInfo && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: typeInfo.bg, color: typeInfo.border, border: `1px solid ${typeInfo.border}` }}>{typeInfo.label}</span>}
        <span className="text-sm font-bold text-[var(--twin-ink)]">{cell.position}</span>
        {cageBoxCode && <span className="text-[10px] font-mono text-[var(--twin-mute)]">盒:{cageBoxCode}</span>}
        {cell.occupantName && <span className="text-[10px] text-[var(--twin-mute)]">所属:<span className="text-[var(--twin-ink)] font-semibold">{cell.occupantName}</span></span>}
      </div>
      <button type="button" className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={onClose}>✕</button>
    </div>

    {/* 二维码挪到最底部（见文末的 details）——它是最不重要的信息，占着顶部把关键信息挤下去了 */}

    {/* 二维码放大预览 */}
    {qrZoom && (
      <div className="fixed inset-0 z-[var(--z-modal)] bg-black/70 flex flex-col items-center justify-center p-4" onClick={() => setQrZoom(false)}>
        <div className="bg-white rounded-lg p-5 flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <QRCodeSVG value={animalCageId} size={280} level="M" includeMargin={true} />
          <div className="font-mono text-sm text-gray-800 break-all text-center">{animalCageId}</div>
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(animalCageId); toast.success("已复制笼位ID"); }}
            className="rounded px-3 py-1 text-xs font-semibold bg-gray-800 text-white hover:bg-gray-700 transition"
          >
            复制笼位ID
          </button>
          <button type="button" onClick={() => setQrZoom(false)} className="text-xs text-gray-500 hover:text-gray-700">关闭</button>
        </div>
      </div>
    )}

    {/* 划分：笼位属性，独立成块 —— 不入表单字段、不混进下面的 CageFormFill */}
    {(() => {
      const divList = (cell as any).divisionAssignees as Array<{ id: string; name: string }> | undefined;
      if (!divList || divList.length === 0) return null;
      return <div className="rounded-twin-sm border border-rose-200 bg-rose-50 px-2 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-rose-700">已划分给</span>
          {canDivide && (
            <button type="button" onClick={handleClearDivision} disabled={clearingDivision}
              className="rounded border border-rose-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition">
              {clearingDivision ? "清除中…" : "清空划分"}
            </button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {divList.map(a => (
            <span key={a.id} className="rounded border border-rose-200 bg-white px-1.5 py-px text-[10px] text-rose-700">{a.name || a.id}</span>
          ))}
        </div>
      </div>;
    })()}

    {/* 二级：关键信息 — 复用发布模板结构（内联填表，不跳答题页） */}
    <div className="flex items-center justify-between">
      <div className="text-[11px] font-semibold text-[var(--twin-ink)]">关键信息</div>
      {onStartOp && (
        <CageOperationActions
          source={{ animalCageId, position: cell.position, occupantName: cell.occupantName, cageTypeCode: ct }}
          opMark={opMarkByCageId?.get(animalCageId) ?? null}
          occupied={ct === 3}
          onStart={onStartOp}
          onChanged={onChanged}
        />
      )}
    </div>
    <CageFormFill animalCageId={animalCageId || null} claimed={claimed} onBatchEdit={onBatchEdit} />

    {/* 三级：状态标记 + 通道一：状态标记照片（只读，仅编辑模式可管理） */}
    {(statusChips.length > 0 || Object.keys(statusPhotos).some(k => k.startsWith("_") && (statusPhotos[k] || []).length > 0)) && <div className="space-y-2">
      {statusChips.map(a => {
        const sImgs: string[] = statusPhotos[a.statusField] || [];
        const c = DEFAULT_COLORS[a.statusCode] ?? { bg: "#ccc", border: "#999" };
        return <div key={a.action} className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: `${c.bg}18`, color: c.border, border: `1px solid ${c.border}40` }}>{a.label}</span>
            <span className="text-[9px] text-[var(--twin-mute)]">📷 {sImgs.length}张</span>
          </div>
          {sImgs.length > 0 && <div className="flex flex-wrap gap-1">
            {sImgs.map((url: string, j: number) => statusPhotoThumb(a.statusField, url, j))}
          </div>}
          {sImgs.length > 0 && <div className="text-[9px] text-[var(--twin-mute)] mt-1 italic">
            {canEditStatusPhotos ? "悬停照片右上角可删除" : "通过编辑模式管理"}
          </div>}
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
            {catchAll.map((url: string, j: number) => statusPhotoThumb("_status", url, j))}
          </div>
          <div className="text-[9px] text-[var(--twin-mute)] mt-1 italic">
            {canEditStatusPhotos ? "悬停照片右上角可删除" : "通过编辑模式管理"}
          </div>
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

    {/* 实验记录台账：一条一个时间戳，提交后只读 —— 取代原来的「一格一份文本 + 照片」通道 */}
    <div className="border-t border-[var(--twin-hairline)] pt-2">
      <CageExperimentRecordPanel animalCageId={animalCageId} />
    </div>

    {/* 历史归档：默认折叠（省地方），展开后能真看能删 ——
        照片可点开大图、备注给全文、每条带删除（触摸屏没有 hover，所以 ✕ 只在悬停设备上悬停才露） */}
    <details className="border-t border-[var(--twin-hairline)] pt-2">
      <summary className="cursor-pointer select-none text-[11px] font-semibold text-[var(--twin-mute)]">📦 历史记录 ({history.length})</summary>
      <div className="mt-2 space-y-1.5 max-h-[240px] overflow-y-auto">
        {history.map((h: any, i: number) => {
          const label = h.statusField === "needs_division" ? "需分笼" : h.statusField === "needs_special_feeding" ? "特殊饲养" : h.statusField === "_annotation" ? "标注记录" : "健康异常";
          const imgs: string[] = (() => { try { const arr = JSON.parse(h.imagesJson || "[]"); return Array.isArray(arr) ? arr : []; } catch { return []; } })();
          return <div key={h.id ?? i} className="group rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-[10px]">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-[var(--twin-mute)]">{h.createdAt?.substring(0, 16) || ""}</span>
              <span className={h.action === "unmarked" ? "text-red-600" : h.action === "annotated" ? "text-blue-600" : "text-green-600"}>{h.action === "unmarked" ? "✕" : h.action === "annotated" ? "📝" : "✓"} {label}</span>
              {h.toggledBy && <span className="ml-auto text-[var(--twin-mute)]">{h.toggledBy}</span>}
              {h.id != null && (
                <button type="button" onClick={() => void handleDeleteHistory(h.id)} title="删除这条记录"
                  className="shrink-0 rounded px-1 text-[9px] leading-none text-red-500 transition hover:bg-red-50 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">✕</button>
              )}
            </div>
            {h.experimentDesc && <div className="mt-0.5 whitespace-pre-wrap break-words text-[var(--twin-mute)]">{String(h.experimentDesc)}</div>}
            {imgs.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{imgs.map((url: string, j: number) => (
              <img key={j} src={url} alt="" title="点开大图" onClick={() => setPreviewUrl(url)}
                className="h-8 w-8 cursor-pointer rounded-twin-xs border border-[var(--twin-hairline)] object-cover hover:opacity-80" />
            ))}</div>}
          </div>;
        })}
      </div>
    </details>

    {/* 笼位二维码（payload = 纯数字 animal_cage_id）：默认折叠 + 缩小，放到最后 —— 它是最后才需要的东西 */}
    <details className="border-t border-[var(--twin-hairline)] pt-2">
      <summary className="cursor-pointer select-none text-[11px] font-semibold text-[var(--twin-mute)]">🔳 笼位二维码</summary>
      <div className="mt-2 flex items-center gap-3 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-2">
        <div className="shrink-0 cursor-zoom-in" title="点击放大" onClick={() => setQrZoom(true)}>
          <QRCodeSVG value={animalCageId} size={104} level="M" includeMargin={true} />
        </div>
        <div className="min-w-0 text-[10px] leading-relaxed text-[var(--twin-mute)]">
          <div className="font-mono break-all">笼位ID: {animalCageId}</div>
          <div>点击二维码可放大查看</div>
        </div>
      </div>
    </details>

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
