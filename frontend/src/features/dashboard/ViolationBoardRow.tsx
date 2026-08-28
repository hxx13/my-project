import { useEffect, useRef, useState } from "react";
import type { DashboardViolationBoardItem } from "@/api/domains/dashboardViolationBoard.api";
import { PageHelpImageLightbox } from "@/features/page-help/PageHelpImageLightbox";
import { dashTone, useDashboardVisual } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";
import { DASH_NIGHT_CLASS } from "@/features/dashboard-scifi-theme/dashboardNightTokens";

type Props = {
  item: DashboardViolationBoardItem;
  onPreviewOpenChange?: (open: boolean) => void;
};

/**
 * 提醒公示单行：
 * - 课题组违规：组卡（状态标签 + 组名 + 人数 + 组级说明 + 全员名字 chips + 多图内联）
 * - 个人违规：姓名 → 说明 → 多图内联（无图不占位）
 * 图片可点击放大预览，10 秒自动关闭；打开时通知父组件暂停自动滚动。
 */
export function ViolationBoardRow({ item, onPreviewOpenChange }: Props) {
  const visual = useDashboardVisual();
  const isGroup = Boolean(item.groupName);
  const images = (item.imageUrls ?? []).filter((u) => (u ?? "").trim() !== "");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const previewOpenRef = useRef(false);
  const open = previewSrc != null;
  useEffect(() => {
    if (open === previewOpenRef.current) return;
    previewOpenRef.current = open;
    onPreviewOpenChange?.(open);
  }, [open, onPreviewOpenChange]);

  const nameTone = dashTone(visual, "text-fuchsia-100", DASH_NIGHT_CLASS.title, "text-rose-900");
  const summaryTone = dashTone(visual, "text-fuchsia-100/85", DASH_NIGHT_CLASS.textMuted, "text-rose-950/85");
  const borderTone = dashTone(visual, "border-fuchsia-500/15", DASH_NIGHT_CLASS.header, "border-rose-200/50");

  const ImageStrip = images.length > 0 ? (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {images.map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => setPreviewSrc(u)}
          className="shrink-0 cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-color-accent)]"
          aria-label={`查看 ${item.displayName || "人员"} 图片`}
        >
          <img
            src={u}
            alt=""
            loading="lazy"
            draggable={false}
            className={`h-12 w-12 rounded-md object-cover md:h-14 md:w-14 ${
              isGroup
                ? dashTone(visual, "ring-1 ring-amber-400/30", "ring-1 ring-[var(--dash-night-border-warm)]", "ring-1 ring-amber-200")
                : dashTone(visual, "ring-1 ring-fuchsia-500/35", "ring-1 ring-[var(--dash-night-border-warm)]", "ring-1 ring-rose-200")
            }`}
          />
        </button>
      ))}
    </div>
  ) : null;

  const content = isGroup ? (
    <div
      className={`mb-2 rounded-[10px] border p-2.5 md:p-3 ${
        dashTone(visual, "border-amber-400/35 bg-amber-950/30", DASH_NIGHT_CLASS.rowWarn, "border-amber-200/60 bg-amber-50/40")
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {item.statusLabel ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              dashTone(visual, "border border-amber-400/40 bg-amber-500/15 text-amber-200", DASH_NIGHT_CLASS.chipWarn, "border border-amber-500/30 bg-amber-100 text-amber-800")
            }`}
          >
            {item.statusLabel}
          </span>
        ) : null}
        <span className={`text-xs font-bold md:text-sm ${nameTone}`}>{item.displayName || "—"}</span>
        <span className={`text-[11px] ${dashTone(visual, "text-slate-400", DASH_NIGHT_CLASS.textMuted, "text-slate-500")}`}>
          · {(item.members ?? []).length} 人
        </span>
      </div>
      {item.summary ? (
        <p className={`mt-1.5 text-[11px] leading-snug md:text-xs ${summaryTone}`}>{item.summary}</p>
      ) : null}
      {(item.members ?? []).length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(item.members ?? []).map((m, i) => (
            <span
              key={`${m.name}-${i}`}
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                dashTone(visual, "border border-slate-600/40 bg-slate-800/60 text-slate-200", DASH_NIGHT_CLASS.chipMuted, "border border-slate-200 bg-white text-slate-600")
              }`}
            >
              {m.name}
            </span>
          ))}
        </div>
      ) : null}
      {ImageStrip}
    </div>
  ) : (
    <div className={`flex items-start gap-2 border-b py-2.5 md:gap-3 md:py-3 ${borderTone}`}>
      <span
        className={`shrink-0 inline-flex justify-between text-xs font-bold md:text-sm ${nameTone}`}
        style={{ width: "2.7em" }}
      >
        {[...(item.displayName || "—")].map((ch, i) => (
          <span key={i}>{ch}</span>
        ))}
      </span>
      <div className="min-w-0 flex-1">
        {item.summary ? (
          <p className={`text-[11px] leading-snug md:text-xs ${summaryTone}`}>{item.summary}</p>
        ) : null}
        {ImageStrip}
      </div>
    </div>
  );

  return (
    <>
      {content}
      {previewSrc ? (
        <PageHelpImageLightbox
          src={previewSrc}
          alt={`${item.displayName || "人员"} 图片`}
          onClose={() => setPreviewSrc(null)}
          autoCloseMs={10_000}
        />
      ) : null}
    </>
  );
}
