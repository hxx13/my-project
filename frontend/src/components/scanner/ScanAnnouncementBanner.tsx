import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Megaphone, X } from "lucide-react";
import type { ScanPopupAnnouncementBundle } from "@/api/types/scanner";
import { prepareAnnouncementHtml, SCAN_ANNOUNCEMENT_BODY_CLASS } from "@/utils/announcementHtml";

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

  return (
    <>
      <div className="flex min-w-[min(148px,30vw)] flex-1 basis-0 justify-center">
        <button
          type="button"
          onClick={() => setPanelOpen(!panelOpen)}
          className="group flex w-full min-w-0 items-center gap-2 rounded-[999px] border border-violet-500/45 bg-gradient-to-r from-black/75 via-violet-950/40 to-black/75 px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-transform active:scale-[0.98] sm:gap-2.5 sm:px-4 sm:py-2.5"
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 ring-1 ring-violet-400/40">
            <Megaphone className="h-4 w-4 text-violet-300" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-violet-200/90">Notice</span>
            <span className="block truncate text-sm font-bold text-white">{islandLabel}</span>
          </span>
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-violet-200/80 transition-transform ${panelOpen ? "rotate-90" : "group-hover:translate-x-0.5"}`}
          />
        </button>
      </div>

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
              className="fixed inset-0 z-[100130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
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
                className="relative flex max-h-[min(88vh,720px)] w-full max-w-[min(96vw,680px)] flex-col overflow-hidden rounded-3xl border border-violet-500/35 bg-gradient-to-b from-[#120a1f]/98 to-black/95 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-violet-500/25 bg-black/40 px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Megaphone className="h-5 w-5 shrink-0 text-violet-400" />
                    <div className="min-w-0">
                      <div id="scan-announcement-title" className="truncate text-sm font-black tracking-wide text-violet-100">
                        {current.title || "系统公告"}
                      </div>
                      {total > 1 ? (
                        <div className="mt-0.5 text-[11px] text-violet-200/80">
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
                        className="rounded-full border border-violet-500/40 px-3 py-1 text-[11px] font-bold text-violet-100 hover:bg-white/10"
                      >
                        已知悉
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setPanelOpen(false)}
                      className="rounded-full p-2 text-violet-200/90 hover:bg-white/10"
                      aria-label="关闭"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                  {safeHtml ? (
                    <div className={SCAN_ANNOUNCEMENT_BODY_CLASS} dangerouslySetInnerHTML={{ __html: safeHtml }} />
                  ) : (
                    <p className="text-center text-xs text-violet-200/65">暂无正文内容。</p>
                  )}
                </div>

                {total > 1 ? (
                  <div className="flex shrink-0 items-center justify-between gap-2 border-t border-violet-500/20 bg-black/30 px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 px-3 py-1.5 text-xs font-bold text-violet-100 hover:bg-white/10"
                      onClick={() => setPageIndex((i) => (i - 1 + total) % total)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      上一条
                    </button>
                    <span className="text-[11px] text-violet-200/70">
                      {pageIndex + 1} / {total}
                    </span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 px-3 py-1.5 text-xs font-bold text-violet-100 hover:bg-white/10"
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
