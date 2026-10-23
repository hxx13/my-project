/**
 * 手机版笼位详情弹窗（v3 — 对齐动物订购链路：白底 + 中性灰分层 + 实底按钮）。
 *
 * v2 的问题：品牌红主导（`#ac1736` 既做主色又做分区竖条）、上传按钮描边、
 * 删除钮 `bg-black/50`、`disabled:opacity-50`、slate/Vant/微信三套灰混用。
 * v3 把结构色收进 `cage-detail-scope.css` 的局部作用域，主色沿用学生端琥珀，
 * 按钮一律实底，状态语义只留一颗圆点。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCageInfoCodelist } from "@/features/cage-shelf/api/cageForm.api";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { CageShelfCell } from "@/api/domains/cageShelf.api";
import { fetchLocalAnnotate } from "@/api/domains/cageShelf.api";
import CageFormFill from "@/features/cage-shelf/components/CageFormFill";
import CageOperationActions from "@/features/cage-shelf/components/CageOperationActions";
import CageExperimentRecordPanel from "@/features/cage-shelf/components/CageExperimentRecordPanel";
import type { CageOpKind, CageOpMark, CageOpSource } from "@/features/cage-shelf/useCageOpSelect";
import { CAGE_BOX_ACTIONS, actionsFromFormValues, displayPosition, isVideoMediaUrl, severityOfValues, itchOfValues, detailCodesOfValues, detailPhotoKey, HEALTH_SEVERITY_DICT, SPECIAL_DETAIL_DICT, HEALTH_ITCH_LABEL } from "@/features/cage-shelf/constants";
import { DEFAULT_COLORS } from "@/features/cage-shelf/components/CageColorContext";
import { fetchCageInfoValues, type CageInfoValueRow } from "@/features/cage-shelf/api/cageForm.api";
import { useViewportHeight } from "./useViewportHeight";
import { authStorage } from "@/features/auth/authStorage";
import "./cage-detail-scope.css";

/** 详情页签按账号记忆（与教职工详情、小程序同一口径）：下次打开其他笼位还落在上次的页签 */
const TAB_STORE_PREFIX = "cageShelf.detailTab.mobile:";
type DetailTab = "overview" | "media" | "records";
function readSavedTab(): DetailTab {
  try {
    const v = localStorage.getItem(TAB_STORE_PREFIX + (authStorage.getUserInfo()?.id ?? "anon"));
    return v === "overview" || v === "media" || v === "records" ? v : "overview";
  } catch {
    return "overview";
  }
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

/** 状态照片缩略图：视频用深色播放块（不强依赖首帧，避免黑块/空块），点开再播放 */
function MediaThumb({ url, onOpen }: { url: string; onOpen: () => void }) {
  if (isVideoMediaUrl(url)) {
    return (
      <button type="button" onClick={onOpen} title="点击播放视频"
        className="relative size-14 shrink-0 overflow-hidden rounded-[10px] bg-slate-900">
        <span className="absolute inset-0 grid place-items-center text-[14px] leading-none text-white">▶</span>
      </button>
    );
  }
  return <img src={url} onClick={onOpen} className="size-14 cursor-pointer rounded-[10px] object-cover" alt="" />;
}

export default function MobileCageCellDetailDialog({
  cell,
  shelfName,
  onClose,
  staffView,
  onStartOp,
  onChanged,
  opMark,
  onStartBatch,
  onStartDivide,
}: {
  cell: CageShelfCell;
  /** 笼架名（如 201A-1）：坐标要带上是哪个架子的第几格 */
  shelfName?: string;
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
  const viewportHeight = useViewportHeight();

  const position = displayPosition(cell.position);
  const animalCageId: string = String(
    (cell as any).id ?? (cell as any).animalCageId ?? detail.animalCageId ?? "",
  );

  // ── 状态标记照片（只读；实验记录走台账接口 CageExperimentRecordPanel）──
  const [statusPhotos, setStatusPhotos] = useState<Record<string, string[]>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** 状态页内的大图当前选中项；点大图再进全屏 */
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<CageInfoValueRow[] | null>(null);
  /** 与小程序抽屉同款三页签：概况 / 状态 / 实验记录（按账号记住上次选择） */
  const [tab, setTab] = useState<DetailTab>(readSavedTab);
  const pickTab = (k: DetailTab) => {
    setTab(k);
    try { localStorage.setItem(TAB_STORE_PREFIX + (authStorage.getUserInfo()?.id ?? "anon"), k); } catch { /* ignore */ }
  };

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

  // 读取状态标记照片（实验记录不在这里读）
  useEffect(() => {
    if (!animalCageId) return;
    let cancelled = false;
    fetchLocalAnnotate(String(animalCageId))
      .then((a) => {
        if (cancelled) return;
        if (a.statusPhotos) { try { const sp = JSON.parse(a.statusPhotos); if (typeof sp === "object") setStatusPhotos(sp); } catch {} }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cell, animalCageId]);

  const isPermitted = cell.visible;

  // 状态子值：健康异常（严重程度 + 瘙痒）与特殊饲养明细 —— 跟父状态一起显示
  const { data: severityOptions = [] } = useQuery({
    queryKey: ["healthSeverityOptions"],
    queryFn: async () => (await fetchCageInfoCodelist(HEALTH_SEVERITY_DICT)).items ?? [],
    staleTime: 10 * 60 * 1000,
  });
  const { data: detailOptions = [] } = useQuery({
    queryKey: ["specialDetailOptions"],
    queryFn: async () => (await fetchCageInfoCodelist(SPECIAL_DETAIL_DICT)).items ?? [],
    staleTime: 10 * 60 * 1000,
  });
  const severity = severityOfValues(formValues);
  const itch = itchOfValues(formValues);
  const severityLabel = severity ? (severityOptions.find((o) => o.itemCode === severity)?.itemLabel || severity) : "";
  const detailItems = useMemo(
    () => [...detailCodesOfValues(formValues)].map((code) => ({
      code,
      label: detailOptions.find((o) => o.itemCode === code)?.itemLabel || code,
      photoKey: detailPhotoKey(code),
    })),
    [formValues, detailOptions],
  );

  // 通道一：状态标记照片（只读，仅编辑模式可管理）+ 兜底 _status
  const catchAllStatusPhotos = statusPhotos._status || [];
  const statusNote = typeof (statusPhotos as any)._note === "string" ? ((statusPhotos as any)._note as string).trim() : "";
  const hasStatusSection = specialChips.length > 0 || detailItems.length > 0 || catchAllStatusPhotos.length > 0 || !!statusNote;

  /**
   * 影像列表必须与页面展示顺序一致，且**只收数组**：
   * `_note` 是字符串，按字符遍历会混进一堆「状/态/标…」伪 URL，
   * 大图默认取第一条 → 显示成黑框（用户报「视频无法播放」的真凶）。
   */
  const allPreviewUrls: string[] = [];
  for (const ch of specialChips) for (const u of (statusPhotos[ch.photoKey] || [])) allPreviewUrls.push(u);
  for (const d of detailItems) for (const u of (statusPhotos[d.photoKey] || [])) allPreviewUrls.push(u);
  for (const u of catchAllStatusPhotos) allPreviewUrls.push(u);

  /** 大图左右切换（图片/视频同列循环），支持按钮与左右滑动 */
  const previewIdx = (() => {
    const shown = activeUrl && allPreviewUrls.includes(activeUrl) ? activeUrl : allPreviewUrls[0];
    return shown ? allPreviewUrls.indexOf(shown) : -1;
  })();
  const stepMedia = (dir: number) => {
    if (allPreviewUrls.length < 2 || previewIdx < 0) return;
    setActiveUrl(allPreviewUrls[(previewIdx + dir + allPreviewUrls.length) % allPreviewUrls.length]);
  };
  const touchStartX = useRef<number | null>(null);

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
        {/* ── 身份条：坐标 + 笼位动作 + 关闭同一行（对齐小程序抽屉） ── */}
        <div className="shrink-0 border-b border-[var(--student-hairline)] px-4 pt-3.5 pb-3">
          <div className="flex items-center gap-2">
            <span className="min-w-0 shrink truncate text-[15px] font-bold tracking-tight text-[var(--student-ink)]">
              {shelfName ? `${shelfName} ` : ""}{position}
            </span>
            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              {isPermitted && onStartOp && (
                <CageOperationActions
                  className="flex-nowrap"
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
              )}
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-full p-2 text-[var(--student-mute)] transition active:bg-[var(--student-canvas-soft-2)]"
                aria-label="关闭"
              >
                <X className="size-4" />
              </button>
            </div>
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
          {/* 三页签在坐标/状态之下（与小程序同序） */}
          {isPermitted && (
            <div className="mt-3 inline-flex items-center rounded-full bg-[var(--student-canvas-soft-2)] p-[3px]">
              {([["overview", "概况"], ["media", "状态"], ["records", "实验记录"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => pickTab(k)}
                  className={`rounded-full px-3 py-1 text-[12px] transition ${
                    tab === k
                      ? "bg-white font-semibold text-[var(--student-ink)] shadow-sm"
                      : "text-[var(--student-body)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-3 pb-4 space-y-4">
          {isPermitted ? (
            tab === "overview" ? (
              /* ── 概况：关键信息表单（本身双列，读 --twin-* 跟随弹窗中性令牌） ── */
              <CageFormFill animalCageId={animalCageId || null} />
            ) : tab === "media" ? (
              /* ── 状态：状态与照片（通道一，只读） ── */
              hasStatusSection ? (
                <div>
                  {/* 页内大图：优先完整显示（contain），点一下进全屏 */}
                  {(() => {
                    const shown = activeUrl && allPreviewUrls.includes(activeUrl) ? activeUrl : allPreviewUrls[0];
                    if (!shown) return null;
                    return (
                      <div
                        className="relative mb-2 overflow-hidden rounded-[14px] bg-black/90 p-1"
                        onTouchStart={(e) => { touchStartX.current = e.touches[0]?.clientX ?? null; }}
                        onTouchEnd={(e) => {
                          const sx = touchStartX.current;
                          touchStartX.current = null;
                          if (sx == null) return;
                          const dx = (e.changedTouches[0]?.clientX ?? sx) - sx;
                          if (Math.abs(dx) < 40) return;
                          stepMedia(dx < 0 ? 1 : -1);
                        }}
                      >
                        <button type="button" onClick={() => setPreviewUrl(shown)} title="点击查看全屏"
                          className="flex h-[38vh] max-h-[340px] w-full items-center justify-center">
                          {isVideoMediaUrl(shown) ? (
                            <video key={shown} src={shown} controls playsInline className="max-h-full max-w-full" />
                          ) : (
                            <img src={shown} alt="" className="max-h-full max-w-full object-contain" />
                          )}
                        </button>
                        {allPreviewUrls.length > 1 && (
                          <>
                            <button type="button" aria-label="上一张" onClick={() => stepMedia(-1)}
                              className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white active:bg-black/70">
                              <ChevronLeft className="size-4" />
                            </button>
                            <button type="button" aria-label="下一张" onClick={() => stepMedia(1)}
                              className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white active:bg-black/70">
                              <ChevronRight className="size-4" />
                            </button>
                          </>
                        )}
                        <div className="mt-1 flex items-center justify-between px-1 text-[9px] text-white/70">
                          <span>{allPreviewUrls.indexOf(shown) + 1} / {allPreviewUrls.length}</span>
                          <span>点大图看全屏</span>
                        </div>
                      </div>
                    );
                  })()}
                  <SectionTitle>状态与照片</SectionTitle>
                  <div className="space-y-2">
                    {specialChips.map((ch) => {
                      const urls = statusPhotos[ch.photoKey] || [];
                      return (
                        <div key={ch.code} className="rounded-[14px] bg-[var(--student-canvas-soft)] px-3 py-2.5">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="size-1.5 shrink-0 rounded-full" style={{ background: ch.color }} />
                            <span className="text-[11px] font-medium text-[var(--student-body)]">{ch.label}</span>
                            {/* 子值跟父状态一起显示 */}
                            {ch.code === "has_health_abnormality" && severityLabel && (
                              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold" style={{ color: ch.color }}>{severityLabel}</span>
                            )}
                            {ch.code === "has_health_abnormality" && itch && (
                              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold" style={{ color: ch.color }}>{HEALTH_ITCH_LABEL}</span>
                            )}
                            {ch.code === "needs_special_feeding" && detailItems.map((d) => (
                              <span key={d.code} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold" style={{ color: ch.color }}>{d.label}</span>
                            ))}
                            <span className="text-[10px] tabular-nums text-[var(--student-mute)]">{urls.length} 张</span>
                          </div>
                          {urls.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {urls.map((u, j) => (
                                <MediaThumb key={j} url={u} onOpen={() => setActiveUrl(u)} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* 特殊饲养明细各自的照片桶（SF_*） */}
                    {detailItems.filter((d) => (statusPhotos[d.photoKey] || []).length > 0).map((d) => (
                      <div key={d.photoKey} className="rounded-[14px] bg-[var(--student-canvas-soft)] px-3 py-2.5">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-[11px] font-medium text-[var(--student-body)]">特殊饲养 · {d.label}</span>
                          <span className="text-[10px] tabular-nums text-[var(--student-mute)]">{(statusPhotos[d.photoKey] || []).length} 张</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(statusPhotos[d.photoKey] || []).map((u, j) => (
                            <MediaThumb key={j} url={u} onOpen={() => setActiveUrl(u)} />
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
                            <MediaThumb key={j} url={u} onOpen={() => setActiveUrl(u)} />
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
              ) : (
                <div className="py-10 text-center text-[13px] text-[var(--student-mute)]">暂无状态影像</div>
              )
            ) : (
              /* ── 实验记录台账（一条一个时间戳，提交后只读，自带存草稿/提交）── */
              <div>
                <SectionTitle>实验记录</SectionTitle>
                <div className="mt-2">
                  <CageExperimentRecordPanel animalCageId={animalCageId} />
                </div>
              </div>
            )
          ) : (
            <div className="py-4 text-center text-[13px] text-[var(--student-mute)]">
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
          {isVideoMediaUrl(previewUrl) ? (
            <video key={previewUrl} src={previewUrl} controls autoPlay playsInline
              className="max-w-full max-h-full rounded-lg p-8" onClick={(e) => e.stopPropagation()} />
          ) : (
            <img
              src={previewUrl}
              alt="预览"
              className="max-w-full max-h-full object-contain p-8"
              onClick={(e) => e.stopPropagation()}
            />
          )}
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
