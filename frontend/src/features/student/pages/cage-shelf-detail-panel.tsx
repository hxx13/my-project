import { useState, useEffect } from "react";
import { authHttp } from "@/api/core/authHttp";
import { clearCageDivision, type CageShelfCell } from "@/api/domains/cageShelf.api";
import CageFormFill from "@/features/cage-shelf/components/CageFormFill";
import CageOperationActions from "@/features/cage-shelf/components/CageOperationActions";
import CageExperimentRecordPanel from "@/features/cage-shelf/components/CageExperimentRecordPanel";
import type { CageOpKind, CageOpMark, CageOpSource } from "@/features/cage-shelf/useCageOpSelect";
import { CAGE_BOX_ACTIONS, actionsFromFormValues, SPECIAL_DETAIL_STATUS_PREFIX } from "@/features/cage-shelf/constants";
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
  /** 分笼/转移：由页面进入选位模式（主网格选目标），不传则不显示入口 */
  onStartOp?: (kind: CageOpKind, source: CageOpSource) => void;
  /** 认领成功后刷新 */
  onChanged?: () => void;
  /** 待审分笼/转移中间态（按 animalCageId 取）；命中时该笼位显示「分笼审核中/转移审核中」状态条 */
  opMarkByCageId?: Map<string, CageOpMark>;
  /** 是否显示「清空划分」入口（管家身份） */
  canDivide?: boolean;
}

export function CellDetailPanel({ cell, gridMeta, shelveId, onClose, onStartOp, onChanged, opMarkByCageId, canDivide }: CellDetailPanelProps) {
  const detail = (cell as any)?.detail as Record<string, any> | undefined;
  const animalCageId = String((cell as any)?.id ?? detail?.animalCageId ?? (cell as any)?.animalCageId ?? "");
  const [statusPhotos, setStatusPhotos] = useState<Record<string, string[]>>({});
  const [clearingDivision, setClearingDivision] = useState(false);

  /** 局部清空：只清当前这一个笼位的划分，不动其他笼位 */
  const handleClearDivision = async () => {
    if (!animalCageId) return;
    setClearingDivision(true);
    try {
      await clearCageDivision([animalCageId]);
      setSaveMsg({ type: "ok", text: "已清空该笼位的划分" });
      onChanged?.();
      onClose?.();
    } catch (e: any) {
      setSaveMsg({ type: "err", text: e?.message || "清空划分失败" });
    } finally {
      setClearingDivision(false);
    }
  };
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [formValues, setFormValues] = useState<CageInfoValueRow[] | null>(null);

  // 拉取表单值(cage_info_value)：状态标记唯一真相源，据此渲染状态 chips
  useEffect(() => {
    if (!animalCageId) { setFormValues(null); return; }
    let cancelled = false;
    fetchCageInfoValues(animalCageId).then(rows => { if (!cancelled) setFormValues(rows); }).catch(() => { if (!cancelled) setFormValues(null); });
    return () => { cancelled = true; };
  }, [animalCageId]);

  // 状态标记照片（按归属状态分桶，只读；实验记录本身走台账接口，不走这里）
  useEffect(() => {
    if (!animalCageId) { setStatusPhotos({}); return; }
    let cancelled = false;
    authHttp.get(`/local/annotate/${animalCageId}`).then(r => {
      if (cancelled) return;
      if (r.data?.success) {
        const d = r.data.data;
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

  /**
   * 状态照片是「按归属状态分桶」存的（key = 状态表单字段名，明细是 `SF_<code>`），
   * 展示时**必须把 key 还原成人看的名字**再挂到对应状态上 ——
   * 直接 `{key}` 打出来就是 `has_health_abnormality` 这种给用户看的东西（2026-09-19 用户报）。
   */
  const photoLabelOf = (key: string): string => {
    const act = CAGE_BOX_ACTIONS.find(a => a.statusField === key);
    if (act) return act.label;
    if (key.startsWith(SPECIAL_DETAIL_STATUS_PREFIX)) return "特殊饲养明细";
    return "状态照片";
  };

  // 合并状态标记照片用于 URL 驱动预览（实验记录的照片由台账面板自己管）
  const allPreviewUrls: string[] = [];
  const allPreviewLabels: string[] = [];
  Object.entries(statusPhotos).forEach(([key, urls]) => {
    if (!Array.isArray(urls)) return;                 // `_note` 是字符串，别当照片
    urls.forEach(url => { allPreviewUrls.push(url); allPreviewLabels.push(`状态标记 · ${photoLabelOf(key)}`); });
  });
  const curPreviewIdx = previewUrl ? allPreviewUrls.indexOf(previewUrl) : -1;
  const previewLabel = curPreviewIdx >= 0 ? allPreviewLabels[curPreviewIdx] : "";
  const hasPrev = curPreviewIdx > 0;
  const hasNext = curPreviewIdx >= 0 && curPreviewIdx < allPreviewUrls.length - 1;

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

  /** 该状态自己那份照片（就地挂在它那枚 chip 下面） */
  const photosOf = (statusField: string): string[] => {
    const v = statusPhotos[statusField];
    return Array.isArray(v) ? v : [];
  };
  /**
   * 没有对应状态 chip 的桶：明细（`SF_`）与历史遗留的 `_status` 兜底。
   * `_note` 是字符串不是数组，这里一并排除 —— 原来那个 Object.entries 循环会对字符串调 `.map`，有备注就白屏。
   */
  const orphanPhotoGroups = Object.entries(statusPhotos)
    .filter(([k, v]) => Array.isArray(v) && (v as string[]).length > 0 && k !== "_note"
      && !CAGE_BOX_ACTIONS.some(a => a.statusField === k))
    .map(([k, v]) => ({ key: k, label: photoLabelOf(k), urls: v as string[] }));

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
        <div className="flex items-center gap-2">
          {onStartOp && (
            <CageOperationActions
              source={{ animalCageId, position: cell.position, occupantName: cell.occupantName, cageTypeCode: ct }}
              occupied={ct === 3}
              onStart={onStartOp}
              onChanged={onChanged}
              opMark={opMarkByCageId?.get(animalCageId) ?? null}
            />
          )}
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[var(--student-canvas-soft)]">
            <span className="text-lg text-[var(--student-mute)]">&times;</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* 关键信息表单(直接读表单,与 web 端一致) */}
        {/* 划分：笼位属性，独立成块 —— 不入表单字段、不混进下面的 CageFormFill */}
        {(() => {
          const divList = (cell as any)?.divisionAssignees as Array<{ id: string; name: string }> | undefined;
          if (!divList || divList.length === 0) return null;
          return <div className="rounded-student-sm border border-rose-200 bg-rose-50 px-2 py-1.5">
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

        <CageFormFill animalCageId={animalCageId || null} />

        {/* Status chips —— 每个状态自己的照片就挂在那枚 chip 下面（照片本就按归属状态分桶） */}
        {statusChips.length > 0 && (
          <div className="flex flex-wrap items-start gap-1.5">
            {statusChips.map(a => {
              const c = DEFAULT_COLORS[a.statusCode] ?? { bg: "#ccc", border: "#999" };
              const imgs = photosOf(a.statusField);
              return (
                <div key={a.action} className="flex flex-col gap-1">
                  <span className="self-start px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: `${c.bg}18`, color: c.border, border: `1px solid ${c.border}40` }}>
                    {a.label}
                  </span>
                  {imgs.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {imgs.map((url, i) => (
                        <img key={`${url}:${i}`} src={url} alt="" onClick={() => setPreviewUrl(url)}
                          className="h-10 w-10 rounded border border-[var(--student-hairline)] object-cover cursor-pointer" />
                      ))}
                    </div>
                  )}
                </div>
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

        {/* 没有对应状态 chip 的状态照片：明细（SF_）与历史遗留的 _status 兜底。
            标题走可读名（不再把 `has_health_abnormality` 这种 key 打给用户看） */}
        {orphanPhotoGroups.length > 0 && (
          <div className="rounded-lg bg-[var(--app-color-surface-hover)] p-3 space-y-2">
            <div className="text-[12px] font-semibold text-[var(--student-mute)]">📸 状态标记照片</div>
            {orphanPhotoGroups.map(g => (
              <div key={g.key}>
                <div className="text-[10px] text-[var(--student-mute)] mb-1">{g.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.urls.map((url, i) => (
                    <img key={i} src={url} alt="" onClick={() => setPreviewUrl(url)}
                      className="h-14 w-14 object-cover rounded border border-[var(--student-hairline)] cursor-pointer" />
                  ))}
                </div>
              </div>
            ))}
            <div className="text-[10px] italic text-[var(--student-mute)]">通过编辑模式管理</div>
          </div>
        )}

        {/* 实验记录台账：一条记录一个时间戳，提交后只读；不是实验员本人只看到 *** 占位 */}
        <CageExperimentRecordPanel animalCageId={animalCageId || null} />

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
