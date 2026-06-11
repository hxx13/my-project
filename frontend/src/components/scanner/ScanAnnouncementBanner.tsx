import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Megaphone, X } from "lucide-react";
import type { ScanPopupAnnouncementBundle } from "@/api/types/scanner";
import { prepareAnnouncementHtml, SCAN_ANNOUNCEMENT_BODY_CLASS } from "@/utils/announcementHtml";
import { SCAN_NESTED_BACKDROP, NOTICE_ISLAND_BASE, NOTICE_PANEL, resolveNoticeColors, type NoticeKind } from "./scanPopupTheme";

const ackKey = (id: number) => `twin_scan_announcement_ack_${id}`;

function readAcked(id: number): boolean {
  try {
    return sessionStorage.getItem(ackKey(id)) === "1";
  } catch {
    return false;
  }
}

type Props = {
  bundle: ScanPopupAnnouncementBundle | null | undefined;
  panelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
  suppressAutoOpen?: boolean;
};

/**
 * 扫码公告弹窗 — 🍱 Bento 暗色主题
 *
 * 视觉层级设计（自上而下）：
 *   1. Island 按钮 — 暗色容器 + steel 图标，不抢眼
 *   2. 弹窗面板 — surface-container 底色 + 微边框，轻量化框架
 *   3. 正文卡片 — surface-page 微提亮卡片，视觉重心落在内容
 *
 * 所有颜色通过 --app-color-* 语义令牌引用，遵循 Bento dark 映射。
 */
export function ScanAnnouncementBanner({
  bundle,
  panelOpen: panelOpenProp,
  onPanelOpenChange,
  suppressAutoOpen = false,
}: Props) {
  const items = useMemo(() => bundle?.items?.filter((x) => x?.id) ?? [], [bundle?.items]);
  const total = items.length;
  const showEveryScan = Boolean(bundle?.showNoticeEveryScan);

  const [pageIndex, setPageIndex] = useState(0);
  const [panelOpenInternal, setPanelOpenInternal] = useState(false);
  const controlled = panelOpenProp !== undefined && onPanelOpenChange != null;
  const panelOpen = controlled ? panelOpenProp : panelOpenInternal;
  const setPanelOpen = useCallback(
    (open: boolean) => {
      if (controlled) onPanelOpenChange(open);
      else setPanelOpenInternal(open);
    },
    [controlled, onPanelOpenChange]
  );

  const current = total > 0 ? items[Math.min(pageIndex, total - 1)] : null;

  useEffect(() => {
    setPageIndex(0);
  }, [items.map((x) => x.id).join(",")]);

  useEffect(() => {
    if (suppressAutoOpen || controlled || !total) {
      if (!total) setPanelOpenInternal(false);
      return;
    }
    setPanelOpenInternal(showEveryScan);
  }, [suppressAutoOpen, controlled, total, showEveryScan]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setPanelOpen(false);
        return;
      }
      if (e.key === "ArrowLeft" && total > 1) {
        e.preventDefault();
        setPageIndex((i) => (i - 1 + total) % total);
      }
      if (e.key === "ArrowRight" && total > 1) {
        e.preventDefault();
        setPageIndex((i) => (i + 1) % total);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panelOpen, total, setPanelOpen]);

  const acknowledge = useCallback(() => {
    if (!current?.id || showEveryScan) return;
    try {
      sessionStorage.setItem(ackKey(current.id), "1");
    } catch {
      /* ignore */
    }
    setPanelOpen(false);
  }, [current?.id, showEveryScan, setPanelOpen]);

  if (!bundle?.enabled || total === 0 || !current?.id) return null;

  const sessionAcked = !showEveryScan && readAcked(current.id);
  const islandLabel = sessionAcked
    ? `公告（已知晓）${total > 1 ? ` · ${pageIndex + 1}/${total}` : ""}`
    : panelOpen
      ? "详情已展开 · 点我收起"
      : total > 1
        ? `扫码公告 · ${pageIndex + 1}/${total}`
        : "扫码公告 · 点我查看";

  const safeHtml = prepareAnnouncementHtml(current.contentHtml || "");

  const nc = resolveNoticeColors("announcement");

  return (
    <>
      {/* ── Island 触发按钮 ── */}
      <div className="flex min-w-[min(148px,30vw)] max-w-[420px] flex-1 basis-0 justify-center">
        <button
          type="button"
          onClick={() => setPanelOpen(!panelOpen)}
          className={`group flex w-full min-w-0 max-w-[420px] items-center gap-2 ${NOTICE_ISLAND_BASE} ${nc.border} px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-2.5`}
        >
          <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${nc.iconBg}`}>
            <Megaphone className={`h-4 w-4 ${nc.iconText}`} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className={`block text-[11px] font-black uppercase tracking-[0.2em] ${nc.tag}`}>
              Notice
            </span>
            <span className="block truncate text-sm font-bold text-slate-800 dark:text-warm-50">
              {islandLabel}
            </span>
          </span>
          <ChevronRight
            className={`h-4 w-4 shrink-0 ${nc.tag} transition-transform ${
              panelOpen ? "rotate-90" : "group-hover:translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* ── 公告详情弹窗 ── */}
      {createPortal(
        <AnimatePresence>
          {panelOpen ? (
            <motion.div
              key="announcement-backdrop"
              role="presentation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 ${SCAN_NESTED_BACKDROP}`}
              onClick={() => setPanelOpen(false)}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="scan-announcement-title"
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className={`relative flex max-h-[min(88vh,720px)] w-full max-w-[min(96vw,680px)] flex-col overflow-hidden ${NOTICE_PANEL}`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 顶部玫瑰色装饰条 */}
                <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-[var(--app-radius-container)]" style={{background:"linear-gradient(90deg,#fb7185,#f43f5e)"}} />

                {/* ── Header ── */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rose-200 dark:border-rose-800/30 px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Megaphone className="h-5 w-5 shrink-0 text-rose-500 dark:text-rose-400" />
                    <div className="min-w-0">
                      <div
                        id="scan-announcement-title"
                        className="truncate text-sm font-bold tracking-wide text-[var(--app-color-text-primary)]"
                      >
                        {current.title || "系统公告"}
                      </div>
                      {total > 1 ? (
                        <div className="mt-0.5 text-[11px] text-[var(--app-color-text-tertiary)]">
                          第 {pageIndex + 1} 条 / 共 {total} 条
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!showEveryScan ? (
                      <button
                        type="button"
                        onClick={acknowledge}
                        className="rounded-full border border-rose-200 dark:border-rose-800/30 px-3 py-1 text-[11px] font-bold text-[var(--app-color-text-secondary)] hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                      >
                        已知悉
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setPanelOpen(false)}
                      className="rounded-full p-2 text-[var(--app-color-text-tertiary)] hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                      aria-label="关闭"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* ── 正文内容卡片（视觉重心） ── */}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  {safeHtml ? (
                    <div
                      className={`${SCAN_ANNOUNCEMENT_BODY_CLASS} rounded-[var(--app-radius-element)] border border-rose-200 dark:border-rose-800/30 bg-[var(--app-color-surface-page)] p-5`}
                      dangerouslySetInnerHTML={{ __html: safeHtml }}
                    />
                  ) : (
                    <p className="text-center text-xs text-[var(--app-color-text-tertiary)] py-8">
                      暂无正文内容。
                    </p>
                  )}
                </div>

                {/* ── Footer：翻页导航 ── */}
                {total > 1 ? (
                  <div className="flex shrink-0 items-center justify-between gap-2 border-t border-rose-200 dark:border-rose-800/30 px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] transition-colors"
                      onClick={() => setPageIndex((i) => (i - 1 + total) % total)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      上一条
                    </button>
                    <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
                      {pageIndex + 1} / {total}
                    </span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] transition-colors"
                      onClick={() => setPageIndex((i) => (i + 1) % total)}
                    >
                      下一条
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
