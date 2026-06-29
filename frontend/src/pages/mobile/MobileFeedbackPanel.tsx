/** 手机版 — 审核反馈通知（快捷入口「通知」专用，WebSocket 实时） */
import { Bell, ChevronLeft, Radio, CheckCheck } from "lucide-react";
import { useState } from "react";
import type { MobileAlertItem } from "@/api/domains/mobileStudent.api";
import {
  alertKindColors,
  alertKindLabel,
  mobileNoticeItemKey,
} from "./MobileNoticesPanel";
import { MOBILE_OVERLAY_ABOVE_TAB_BOTTOM } from "./mobileShellLayout";

interface MobileFeedbackPanelProps {
  open: boolean;
  onClose: () => void;
  items: MobileAlertItem[];
  wsConnected?: boolean;
  highlightKey?: string | null;
  onMarkAllRead?: () => Promise<void>;
}

export default function MobileFeedbackPanel({
  open,
  onClose,
  items,
  wsConnected = false,
  highlightKey = null,
  onMarkAllRead,
}: MobileFeedbackPanelProps) {
  const [marking, setMarking] = useState(false);

  if (!open) return null;

  const handleMarkAllRead = async () => {
    if (!onMarkAllRead || marking) return;
    setMarking(true);
    try {
      await onMarkAllRead();
    } finally {
      setMarking(false);
    }
  };

  const hasUnread = items.some((item) => !item.isRead);

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[100] flex flex-col"
      style={{ background: "#eef0f6", bottom: MOBILE_OVERLAY_ABOVE_TAB_BOTTOM }}
    >
      <div
        className="shrink-0 flex items-center px-2"
        style={{
          background: "#fff",
          borderBottom: "1px solid #ebedf0",
          paddingTop: "env(safe-area-inset-top, 0px)",
          height: "calc(44px + env(safe-area-inset-top, 0px))",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center min-w-[40px] h-9 rounded-lg active:opacity-70"
          aria-label="返回"
        >
          <ChevronLeft className="size-6" style={{ color: "#323233" }} />
        </button>
        <div className="flex-1 text-center">
          <h2 className="text-[16px] font-semibold" style={{ color: "#323233" }}>
            我的通知
          </h2>
          <p className="text-[10px] flex items-center justify-center gap-1" style={{ color: "#94a3b8" }}>
            <Radio
              className="size-2.5"
              style={{ color: wsConnected ? "#16a34a" : "#94a3b8" }}
            />
            {wsConnected ? "实时接收物资/延迟审核反馈" : "连接中…"}
          </p>
        </div>
        {onMarkAllRead && hasUnread && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={marking}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold active:opacity-70 disabled:opacity-50 shrink-0"
            style={{ color: "#16a34a" }}
          >
            <CheckCheck className="size-3.5" />
            {marking ? "…" : "全部已读"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8">
        {items.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {items.map((item) => {
              const key = mobileNoticeItemKey(item);
              const colors = alertKindColors(item.kind);
              const highlighted = highlightKey === key;
              return (
                <div
                  key={key}
                  className="rounded-2xl px-4 py-3.5"
                  style={{
                    background: highlighted ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.6)",
                    border: `1px solid ${highlighted ? "rgba(172,23,54,0.35)" : "rgba(30,55,90,0.06)"}`,
                    boxShadow: highlighted ? "0 0 0 2px rgba(172,23,54,0.12)" : undefined,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: colors.bg, color: colors.color }}
                    >
                      {alertKindLabel(item.kind)}
                    </span>
                    {item.status === "PENDING" && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: "#fef3c7", color: "#a16207" }}
                      >
                        审核中
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] font-bold leading-snug mb-1" style={{ color: "#1e293b" }}>
                    {item.title}
                  </p>
                  {item.contentHtml && (
                    <div
                      className="text-[11px] leading-relaxed"
                      style={{ color: "#475569" }}
                      dangerouslySetInnerHTML={{ __html: item.contentHtml }}
                    />
                  )}
                  <p className="text-[10px] mt-2" style={{ color: "#94a3b8" }}>
                    {item.createdAt?.slice(0, 16) ?? ""}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl py-16 text-center">
            <Bell className="size-10 mx-auto mb-2" style={{ color: "#c8c9cc" }} />
            <p className="text-xs" style={{ color: "#969799" }}>
              暂无物资或延迟申请反馈
            </p>
            <p className="text-[10px] mt-2 px-6" style={{ color: "#c8c9cc" }}>
              教职工在审核页处理您的申领或延迟申请后，将在此实时显示
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
