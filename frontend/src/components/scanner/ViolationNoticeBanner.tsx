import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Megaphone, X } from "lucide-react";
import type { StudentViolationNotice } from "@/api/types/scanner";

export type ViolationNoticeKind = "violation" | "unbound";

const ackKey = (kind: ViolationNoticeKind, id: number) =>
  kind === "unbound" ? "twin_unbound_card_notice_ack" : `twin_violation_notice_ack_${id}`;

type Props = {
  notice: StudentViolationNotice | undefined | null;
  kind?: ViolationNoticeKind;
  /** 由 ScanPopupNoticeCoordinator 统一调度，避免多弹窗互相覆盖 */
  panelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
  suppressAutoOpen?: boolean;
};

const THEME = {
  violation: {
    islandBorder: (locked: boolean) =>
      locked
        ? "border-red-500/50 bg-gradient-to-r from-black/80 via-red-950/50 to-black/80"
        : "border-amber-500/45 bg-gradient-to-r from-black/75 via-amber-950/40 to-black/75",
    iconRing: "bg-amber-500/20 ring-1 ring-amber-400/40",
    icon: "text-amber-300",
    chevron: "text-amber-200/80",
    badge: "text-amber-100",
    tag: "text-amber-200/90",
    panelBorder: "border-amber-500/35",
    panelBg: "from-[#1a0a05]/98",
    headerBorder: "border-amber-500/25",
    title: "text-amber-100",
    meta: "text-amber-200/80",
    btnBorder: "border-amber-500/40",
    btnText: "text-amber-100",
    closeBtn: "text-amber-200/90",
    textBorder: "border-amber-500/20",
    textBody: "text-amber-50/95",
    emptyHint: "text-amber-200/65",
    dialogTitle: "违规通告",
    alertTag: "Alert",
    imgAlt: "违规附图",
  },
  unbound: {
    islandBorder: (locked: boolean) =>
      locked
        ? "border-red-500/50 bg-gradient-to-r from-black/80 via-red-950/50 to-black/80"
        : "border-cyan-500/45 bg-gradient-to-r from-black/75 via-cyan-950/40 to-black/75",
    iconRing: "bg-cyan-500/20 ring-1 ring-cyan-400/40",
    icon: "text-cyan-300",
    chevron: "text-cyan-200/80",
    badge: "text-cyan-100",
    tag: "text-cyan-200/90",
    panelBorder: "border-cyan-500/35",
    panelBg: "from-[#051018]/98",
    headerBorder: "border-cyan-500/25",
    title: "text-cyan-100",
    meta: "text-cyan-200/80",
    btnBorder: "border-cyan-500/40",
    btnText: "text-cyan-100",
    closeBtn: "text-cyan-200/90",
    textBorder: "border-cyan-500/20",
    textBody: "text-cyan-50/95",
    emptyHint: "text-cyan-200/65",
    dialogTitle: "未绑卡提示",
    alertTag: "Unbound",
    imgAlt: "未绑卡提示附图",
  },
} as const;

/** 根据张数选择列数，保证单张居中、多张均匀 */
function imageGridClass(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "grid grid-cols-1 place-items-center max-w-2xl mx-auto w-full";
  if (count === 2) return "grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-3xl mx-auto";
  if (count <= 4) return "grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-4xl mx-auto";
  return "grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 w-full max-w-5xl mx-auto";
}

function readAcked(kind: ViolationNoticeKind, id: number): boolean {
  try {
    return sessionStorage.getItem(ackKey(kind, id)) === "1";
  } catch {
    return false;
  }
}

export function ViolationNoticeBanner({
  notice,
  kind = "violation",
  panelOpen: panelOpenProp,
  onPanelOpenChange,
  suppressAutoOpen = false,
}: Props) {
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
  const theme = THEME[kind];
  const isViolation = kind === "violation";

  useEffect(() => {
    if (suppressAutoOpen || controlled || !notice?.id) return;
    setPanelOpenInternal(Boolean(notice.showNoticeEveryScan));
  }, [suppressAutoOpen, controlled, notice?.id, notice?.showNoticeEveryScan]);

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
  }, [panelOpen, setPanelOpen]);

  const images = useMemo(() => {
    if (!notice?.imageUrls?.length) return [];
    return notice.imageUrls.filter((u) => typeof u === "string" && u.trim().length > 0);
  }, [notice?.imageUrls]);

  const acknowledge = useCallback(() => {
    if (!notice?.id || notice.showNoticeEveryScan) return;
    try {
      sessionStorage.setItem(ackKey(kind, notice.id), "1");
    } catch {
      /* ignore */
    }
    setPanelOpen(false);
  }, [kind, notice?.id, notice?.showNoticeEveryScan, setPanelOpen]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
  }, [setPanelOpen]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
  }, [setPanelOpen]);

  if (notice?.id == null) return null;

  const text = (notice.violationText || "").trim();
  const locked = Boolean(notice.enterLocked);
  const remaining = isViolation ? notice.remainingEnterAllowance : undefined;
  const imgCount = images.length;

  const sessionAcked = !notice.showNoticeEveryScan && readAcked(kind, notice.id);
  const islandLabel = sessionAcked
    ? isViolation
      ? "违规记录（已知晓）"
      : "未绑卡（已知晓）"
    : panelOpen
      ? "详情已展开 · 点我收起"
      : notice.showNoticeEveryScan
        ? isViolation
          ? "违规警示 · 点我"
          : "未绑卡警示 · 点我"
        : isViolation
          ? "违规通告 · 点我查看"
          : "未绑卡提示 · 点我查看";

  const titleId = kind === "unbound" ? "unbound-notice-title" : "violation-notice-title";

  return (
    <>
      <div className="flex min-w-[min(148px,30vw)] flex-1 basis-0 justify-center">
        <button
          type="button"
          onClick={() => (panelOpen ? closePanel() : openPanel())}
          className={`group flex w-full min-w-0 items-center gap-2 rounded-[999px] border px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-transform active:scale-[0.98] sm:gap-2.5 sm:px-4 sm:py-2.5 ${theme.islandBorder(locked)}`}
        >
          <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${theme.iconRing}`}>
            <Megaphone className={`h-4 w-4 ${theme.icon}`} />
            {locked ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-black/80" aria-hidden />
            ) : null}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className={`block text-[11px] font-black uppercase tracking-[0.2em] ${theme.tag}`}>{theme.alertTag}</span>
            <span className="block truncate text-sm font-bold text-white">{islandLabel}</span>
          </span>
          {remaining != null ? (
            <span className={`hidden shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold sm:inline ${theme.badge}`}>
              余 {remaining}
            </span>
          ) : null}
          <ChevronRight
            className={`h-4 w-4 shrink-0 transition-transform ${theme.chevron} ${panelOpen ? "rotate-90" : "group-hover:translate-x-0.5"}`}
          />
        </button>
      </div>

      {createPortal(
        <AnimatePresence>
          {panelOpen ? (
            <motion.div
              key={`${kind}-backdrop`}
              role="presentation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[100130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
              onClick={closePanel}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className={`relative flex max-h-[min(88vh,720px)] w-full max-w-[min(96vw,640px)] flex-col overflow-hidden rounded-3xl border ${theme.panelBorder} bg-gradient-to-b ${theme.panelBg} to-black/95 shadow-2xl`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`flex shrink-0 items-center justify-between gap-3 border-b ${theme.headerBorder} bg-black/40 px-4 py-3`}>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Megaphone className={`h-5 w-5 shrink-0 ${theme.icon}`} />
                    <div className="min-w-0">
                      <div id={titleId} className={`text-sm font-black tracking-wide ${theme.title}`}>
                        {theme.dialogTitle}
                      </div>
                      {locked || (isViolation && remaining != null) ? (
                        <div className={`mt-0.5 flex flex-wrap items-center gap-2 text-[11px] ${theme.meta}`}>
                          {isViolation && remaining != null ? <span>剩余进入次数：{remaining}</span> : null}
                          {locked ? <span className="font-bold text-red-300">禁止进入</span> : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!notice.showNoticeEveryScan ? (
                      <button
                        type="button"
                        onClick={acknowledge}
                        className={`rounded-full border px-3 py-1 text-[11px] font-bold hover:bg-white/10 ${theme.btnBorder} ${theme.btnText}`}
                      >
                        已知悉
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={closePanel}
                      className={`rounded-full p-2 hover:bg-white/10 ${theme.closeBtn}`}
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
                              alt={theme.imgAlt}
                              className="max-h-[min(38vh,320px)] w-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {text ? (
                      <p
                        className={`w-full max-w-2xl rounded-2xl border bg-black/30 p-4 text-center text-sm leading-relaxed whitespace-pre-wrap break-words ${theme.textBorder} ${theme.textBody}`}
                      >
                        {text}
                      </p>
                    ) : (
                      <p className={`text-center text-xs ${theme.emptyHint}`}>未填写文字说明，请查看附图或联系管理员。</p>
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
