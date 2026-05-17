import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Megaphone, X } from "lucide-react";
import type { StudentViolationNotice } from "@/api/types/scanner";

const ackKey = (id: number) => `twin_violation_notice_ack_${id}`;

type Props = {
  notice: StudentViolationNotice | undefined | null;
};

/** 根据张数选择列数，保证单张居中、多张均匀 */
function imageGridClass(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "grid grid-cols-1 place-items-center max-w-2xl mx-auto w-full";
  if (count === 2) return "grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-3xl mx-auto";
  if (count <= 4) return "grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-4xl mx-auto";
  return "grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 w-full max-w-5xl mx-auto";
}

function readAcked(id: number): boolean {
  try {
    return sessionStorage.getItem(ackKey(id)) === "1";
  } catch {
    return false;
  }
}

export function ViolationNoticeBanner({ notice }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!notice?.id) return;
    // 每次扫码：强制每次弹窗的「每次展示」模式默认展开；否则仅灵动岛提示，点岛或遮罩外区域再展开
    setPanelOpen(Boolean(notice.showNoticeEveryScan));
  }, [notice?.id, notice?.showNoticeEveryScan]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panelOpen]);

  const images = useMemo(() => {
    if (!notice?.imageUrls?.length) return [];
    return notice.imageUrls.filter((u) => typeof u === "string" && u.trim().length > 0);
  }, [notice?.imageUrls]);

  const acknowledge = useCallback(() => {
    if (!notice?.id || notice.showNoticeEveryScan) return;
    try {
      sessionStorage.setItem(ackKey(notice.id), "1");
    } catch {
      /* ignore */
    }
    setPanelOpen(false);
  }, [notice?.id, notice?.showNoticeEveryScan]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
  }, []);

  if (!notice?.id) return null;

  const text = (notice.violationText || "").trim();
  const locked = Boolean(notice.enterLocked);
  const remaining = notice.remainingEnterAllowance;
  const imgCount = images.length;

  const sessionAcked = !notice.showNoticeEveryScan && readAcked(notice.id);
  const islandLabel = sessionAcked
    ? "违规记录（已知晓）"
    : panelOpen
      ? "详情已展开 · 点我收起"
      : notice.showNoticeEveryScan
        ? "违规警示 · 点我"
        : "违规通告 · 点我查看";

  return (
    <>
      {/* 灵动岛：与主内容同列，位于人员弹窗网格正上方 */}
      <div className="pointer-events-auto z-[10001] flex w-full shrink-0 justify-center px-1">
        <button
          type="button"
          onClick={() => (panelOpen ? closePanel() : openPanel())}
          className={`group flex max-w-[min(92vw,420px)] items-center gap-2.5 rounded-[999px] border px-4 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-transform active:scale-[0.98] ${
            locked
              ? "border-red-500/50 bg-gradient-to-r from-black/80 via-red-950/50 to-black/80"
              : "border-amber-500/45 bg-gradient-to-r from-black/75 via-amber-950/40 to-black/75"
          }`}
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-400/40">
            <Megaphone className="h-4 w-4 text-amber-300" />
            {locked ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-black/80" aria-hidden />
            ) : null}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-amber-200/90">Alert</span>
            <span className="block truncate text-sm font-bold text-white">{islandLabel}</span>
          </span>
          {remaining != null ? (
            <span className="hidden shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-amber-100 sm:inline">
              余 {remaining}
            </span>
          ) : null}
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-amber-200/80 transition-transform ${panelOpen ? "rotate-90" : "group-hover:translate-x-0.5"}`}
          />
        </button>
      </div>

      {/* 居中警告层：点遮罩关闭 */}
      {createPortal(
        <AnimatePresence>
          {panelOpen ? (
            <motion.div
              key="violation-backdrop"
              role="presentation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[100120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
              onClick={closePanel}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="violation-notice-title"
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="relative flex max-h-[min(88vh,720px)] w-full max-w-[min(96vw,640px)] flex-col overflow-hidden rounded-3xl border border-amber-500/35 bg-gradient-to-b from-[#1a0a05]/98 to-black/95 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/25 bg-black/40 px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Megaphone className="h-5 w-5 shrink-0 text-amber-400" />
                    <div className="min-w-0">
                      <div id="violation-notice-title" className="text-sm font-black tracking-wide text-amber-100">
                        违规通告
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-amber-200/80">
                        {remaining != null ? <span>剩余进入次数：{remaining}</span> : null}
                        {locked ? <span className="font-bold text-red-300">禁止进入</span> : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!notice.showNoticeEveryScan ? (
                      <button
                        type="button"
                        onClick={acknowledge}
                        className="rounded-full border border-amber-500/40 px-3 py-1 text-[11px] font-bold text-amber-100 hover:bg-white/10"
                      >
                        已知悉
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={closePanel}
                      className="rounded-full p-2 text-amber-200/90 hover:bg-white/10"
                      aria-label="关闭"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4">
                    {imgCount > 0 ? (
                      <div className={`w-full ${imageGridClass(imgCount)}`}>
                        {images.map((src) => (
                          <div
                            key={src}
                            className="flex max-h-[min(38vh,320px)] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/50 p-1"
                          >
                            <img
                              src={src}
                              alt="违规附图"
                              className="max-h-[min(38vh,320px)] w-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {text ? (
                      <p className="w-full max-w-2xl rounded-2xl border border-amber-500/20 bg-black/30 p-4 text-center text-sm leading-relaxed text-amber-50/95 whitespace-pre-wrap break-words">
                        {text}
                      </p>
                    ) : (
                      <p className="text-center text-xs text-amber-200/65">未填写文字说明，请查看附图或联系管理员。</p>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
