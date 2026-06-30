/** 手机版 — 通知公告全屏面板（列表 / 单条详情，对齐小程序） */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, ChevronLeft } from "lucide-react";
import type { MobileAlertItem } from "@/api/domains/mobileStudent.api";
import MobileNoticeDetailBody from "./MobileNoticeDetailBody";
import MobileNoticeListRow from "./MobileNoticeListRow";
import {
  MOBILE_NOTICE_LIST_CARD_STYLE,
} from "./mobileNoticePresentation";
import "./mobile-notice-panel.css";

export { alertKindLabel, alertKindColors } from "./mobileNoticePresentation";

function itemKey(item: MobileAlertItem): string {
  return `${item.kind}-${item.notificationId ?? item.bizId ?? item.id}`;
}

interface MobileNoticesPanelProps {
  open: boolean;
  onClose: () => void;
  alerts: MobileAlertItem[];
  html5PrivilegeBypass?: boolean;
  /** 首页点击某条时直接进详情；未传则先进列表 */
  initialFocusKey?: string | null;
  token?: string;
  /** 某条公告/违规 suppress 成功后就地合并，禁止整表 load — post-save-no-full-refresh.mdc */
  onNoticeSuppressed?: (itemKey: string) => void;
}

export default function MobileNoticesPanel({
  open,
  onClose,
  alerts,
  html5PrivilegeBypass = false,
  initialFocusKey = null,
  token,
  onNoticeSuppressed,
}: MobileNoticesPanelProps) {
  const [viewKey, setViewKey] = useState<string | null>(null);
  const [cameFromList, setCameFromList] = useState(false);

  useEffect(() => {
    if (open) {
      setViewKey(initialFocusKey ?? null);
      setCameFromList(false);
    }
  }, [open, initialFocusKey]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.width = "";
    };
  }, [open]);

  if (!open) return null;

  const focusedItem = viewKey ? alerts.find((a) => itemKey(a) === viewKey) : null;
  const isDetailView = Boolean(focusedItem);

  const handleBack = () => {
    if (isDetailView && cameFromList) {
      setViewKey(null);
      setCameFromList(false);
      return;
    }
    onClose();
  };

  const openDetail = (key: string) => {
    setViewKey(key);
    setCameFromList(true);
  };

  const headerTitle = isDetailView
    ? focusedItem!.title.length > 12
      ? `${focusedItem!.title.slice(0, 12)}…`
      : focusedItem!.title
    : "通知公告";

  const panel = (
    <div
      className="mobile-notice-panel-root fixed inset-0 z-[200] flex flex-col"
      style={{
        background: isDetailView ? "#fff" : "#eef0f6",
      }}
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
          onClick={handleBack}
          className="flex items-center justify-center min-w-[40px] h-9 rounded-lg active:opacity-70"
          aria-label="返回"
        >
          <ChevronLeft className="size-6" style={{ color: "#323233" }} />
        </button>
        <h2
          className="flex-1 text-center text-[16px] font-semibold px-2 truncate pr-10"
          style={{ color: "#323233" }}
        >
          {headerTitle}
        </h2>
      </div>

      <div
        className="mobile-notice-panel-scroll px-3 pt-3"
        style={{
          paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {isDetailView && focusedItem ? (
          <MobileNoticeDetailBody
            item={focusedItem}
            html5PrivilegeBypass={html5PrivilegeBypass}
            token={token}
            fullBleed
            onSuppressed={() => onNoticeSuppressed?.(itemKey(focusedItem))}
          />
        ) : alerts.length > 0 ? (
          <div style={MOBILE_NOTICE_LIST_CARD_STYLE}>
            {alerts.map((item, idx) => {
              const key = itemKey(item);
              return (
                <MobileNoticeListRow
                  key={key}
                  item={item}
                  html5PrivilegeBypass={html5PrivilegeBypass}
                  bordered={idx > 0}
                  onSelect={() => openDetail(key)}
                />
              );
            })}
          </div>
        ) : (
          <div
            className="rounded-2xl py-16 text-center"
            style={MOBILE_NOTICE_LIST_CARD_STYLE}
          >
            <Bell className="size-10 mx-auto mb-2" style={{ color: "#c8c9cc" }} />
            <p className="text-sm" style={{ color: "#969799" }}>
              暂无通知公告
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

export { itemKey as mobileNoticeItemKey };
