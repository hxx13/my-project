import { ChevronRight, AlertTriangle, CreditCard, Megaphone } from "lucide-react";
import type { ScanPopupAnnouncementBundle, StudentViolationNotice } from "@/api/types/scanner";
import { useTheme } from "@/features/theme/ThemeProvider";
import {
  noticeThemeClass,
  resolveScanPopupNoticeMeta,
  type NoticeKind,
} from "./scanPopupTheme";

export type ViolationNoticeKind = "violation" | "unbound" | "cage-notice";

type IslandProps = {
  panelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
};

type ViolationUnboundProps = IslandProps & {
  kind: ViolationNoticeKind;
  notice: StudentViolationNotice | undefined | null;
};

type AnnouncementProps = IslandProps & {
  kind: "announcement";
  bundle: ScanPopupAnnouncementBundle | null | undefined;
  announcementCount: number;
  manualAnnouncementPage?: number;
};

export type ScanPopupNoticeBannerProps = ViolationUnboundProps | AnnouncementProps;

function readAcked(kind: NoticeKind, id: number): boolean {
  try {
    const key =
      kind === "announcement"
        ? `twin_scan_announcement_ack_${id}`
        : kind === "unbound"
          ? "twin_unbound_card_notice_ack"
          : `twin_violation_notice_ack_${id}`;
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function buildIslandLabel(args: {
  kind: NoticeKind;
  panelOpen: boolean;
  showEveryScan: boolean;
  sessionAcked: boolean;
  isViolation: boolean;
  announcementCount: number;
  manualPage?: number;
  headline?: string;
}): string {
  const {
    kind,
    panelOpen,
    showEveryScan,
    sessionAcked,
    isViolation,
    announcementCount,
    manualPage = 0,
    headline,
  } = args;

  if (kind === "announcement") {
    const pageSuffix = announcementCount > 1 ? ` · ${manualPage + 1}/${announcementCount}` : "";
    if (sessionAcked) return `公告（已知晓）${pageSuffix}`;
    if (panelOpen) return "详情已展开 · 点我收起";
    return announcementCount > 1 ? `扫码公告 · ${announcementCount} 条` : "扫码公告 · 点我查看";
  }

  if (sessionAcked) {
    return isViolation ? "违规记录（已知晓）" : "未绑卡（已知晓）";
  }
  if (panelOpen) return "详情已展开 · 点我收起";
  if (showEveryScan) {
    return isViolation ? "违规警示 · 点我" : "未绑卡警示 · 点我";
  }
  if (headline?.trim()) return headline.trim();
  return isViolation ? "违规通告 · 点我查看" : "未绑卡提示 · 点我查看";
}

/** 扫码弹窗通告灵动岛（详情弹窗由 ScanPopupNoticeCoordinator 条带统一渲染） */
export function ScanPopupNoticeBanner(props: ScanPopupNoticeBannerProps) {
  const { kind, panelOpen = false, onPanelOpenChange } = props;
  const { theme } = useTheme();
  const isDark = theme.mode === "dark";
  const meta = resolveScanPopupNoticeMeta(kind);
  const themeClass = noticeThemeClass(kind);
  const noticeThemeShell = `${theme.className} ${isDark ? "dark" : ""} ${themeClass}`;

  const notice = kind === "announcement" ? null : props.notice;
  const announcementCount = kind === "announcement" ? props.announcementCount : 0;
  const manualPage = kind === "announcement" ? props.manualAnnouncementPage ?? 0 : 0;

  const showEveryScan =
    kind === "announcement"
      ? Boolean(props.bundle?.showNoticeEveryScan)
      : Boolean(notice?.showNoticeEveryScan);

  const isViolation = kind === "violation" || kind === "cage-notice";
  const isCageNotice = kind === "cage-notice";
  const locked = Boolean(notice?.enterLocked);
  const remaining = isViolation ? notice?.remainingEnterAllowance : undefined;

  if (kind === "announcement") {
    if (!props.bundle?.enabled || announcementCount === 0) return null;
  } else if (notice?.id == null) {
    return null;
  }

  const firstAnnId = kind === "announcement" ? props.bundle?.items?.find((x) => x?.id)?.id : null;
  const recordId = kind === "announcement" ? firstAnnId : notice?.id;
  const sessionAcked =
    recordId != null && !showEveryScan && readAcked(kind, recordId);

  const islandLabel = buildIslandLabel({
    kind,
    panelOpen,
    showEveryScan,
    sessionAcked,
    isViolation,
    announcementCount,
    manualPage,
  });

  const PanelIcon =
    kind === "announcement" ? Megaphone : kind === "violation" ? AlertTriangle : CreditCard;

  const toggle = () => {
    if (!onPanelOpenChange) return;
    if (kind === "announcement" && panelOpen) return;
    onPanelOpenChange(!panelOpen);
  };

  return (
    <div
      className={`flex min-w-[min(90px,19.6vw)] max-w-[224px] flex-1 basis-0 justify-center ${noticeThemeShell}`}
    >
      <button
        type="button"
        onClick={toggle}
        className={`group scan-notice-island w-full ${panelOpen ? "scan-notice-island--open" : ""}`}
      >
        <span className="scan-notice-island-icon relative shrink-0">
          <PanelIcon className="h-3.5 w-3.5" />
          {locked ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--app-color-feedback-danger)] ring-2 ring-[var(--app-color-surface-page)]"
              aria-hidden
            />
          ) : null}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="scan-notice-island-tag mb-0.5 block w-fit">{isCageNotice ? "Cage" : meta.islandTag}</span>
          <span className="scan-notice-island-label">{isCageNotice ? (panelOpen ? "详情已展开 · 点我收起" : `${(notice?.ruleName?.replace("[CAGE]", "") || "笼位处理提示")} · 点我查看`) : islandLabel}</span>
        </span>
        {remaining != null ? (
          <span className="scan-notice-island-badge hidden shrink-0 px-2 py-0.5 text-[10px] sm:inline">
            余 {remaining}
          </span>
        ) : null}
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-[var(--scan-notice-ink)] transition-transform ${panelOpen ? "rotate-90" : "group-hover:translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}
