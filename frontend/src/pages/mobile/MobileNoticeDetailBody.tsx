/** 单条公告/通知正文 — 对齐小程序 homeBulletinDetail .hbd-scroll */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { MobileAlertItem } from "@/api/domains/mobileStudent.api";
import { markObligationDelivered } from "@/features/student/api/student.api";
import { AlertTriangle } from "lucide-react";
import { alertKindColors, alertKindLabel } from "./MobileNoticesPanel";
import {
  extractViolationBodyForDisplay,
  MOBILE_NOTICE_BODY_CLASS,
  prepareMobileNoticeHtml,
} from "./mobileNoticePresentation";
import {
  buildExemptListPreview,
  parseExemptFields,
  prepareExemptAlertBodyHtml,
  resolveExemptAlertTitle,
} from "./mobileExemptAlertHelpers";

interface MobileNoticeDetailBodyProps {
  item: MobileAlertItem;
  html5PrivilegeBypass?: boolean;
  /** 详情全屏：白底通栏、大图 100% 宽 */
  fullBleed?: boolean;
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-[#f2f3f5] last:border-0">
      <span className="text-[13px] shrink-0" style={{ color: "#969799" }}>{label}</span>
      <span className="text-[13px] font-medium text-right" style={{ color: "#323233" }}>{value}</span>
    </div>
  );
}

function resolveObligationPath(item: MobileAlertItem): string {
  if (item.sourceUrl && item.sourceUrl.startsWith("/") && !item.sourceUrl.startsWith("//")) {
    return item.sourceUrl;
  }
  if (item.obligationId && item.obligationId > 0) {
    return `/student/obligations?focus=${item.obligationId}`;
  }
  return "/student/obligations";
}

function MobileViolationStatusCard({
  item,
  html5PrivilegeBypass,
}: {
  item: MobileAlertItem;
  html5PrivilegeBypass: boolean;
}) {
  const hasInteractive =
    Boolean(item.interactiveChallenge?.trim()) || item.interactiveRequired;
  const interactiveDone = item.interactiveChallengeVerified === true;
  const enterLocked = item.enterLocked === true;
  const unblockMethod = item.unblockMethod?.trim();
  const isSelfUnblockRule = unblockMethod === "自助解禁";
  const canSelfUnblock = item.canSelfUnblock === true;
  const pendingConfirm =
    !html5PrivilegeBypass && hasInteractive && !interactiveDone;
  const showCompleteCta =
    !html5PrivilegeBypass &&
    !interactiveDone &&
    (pendingConfirm || Boolean(item.obligationId));
  const showKioskHint =
    !html5PrivilegeBypass && isSelfUnblockRule && !hasInteractive && !item.obligationId;

  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{
        background: "#fff",
        border: "1px solid #ebedf0",
      }}
    >
      <p className="text-[12px] font-semibold mb-1 px-0.5" style={{ color: "#646566" }}>
        违规状态
      </p>
      <StatusRow label="交互式确认" value={hasInteractive ? "是" : "否"} />
      {hasInteractive && (
        <StatusRow
          label="确认状态"
          value={interactiveDone ? "已完成" : "待完成"}
        />
      )}
      <StatusRow label="当前是否被禁用" value={enterLocked ? "是" : "否"} />
      {isSelfUnblockRule && (
        <StatusRow
          label="当前能否解禁"
          value={canSelfUnblock ? "可以" : "不可以"}
        />
      )}
      {showCompleteCta && (
        <p className="mt-2 text-[12px] leading-relaxed px-0.5" style={{ color: "#646566" }}>
          请在手机端完成确认（H5 / 小程序均可），见下方按钮。
        </p>
      )}
      {showKioskHint && (
        <div
          className="mt-2 rounded-lg px-2.5 py-2 flex items-start gap-2"
          style={{ background: "#fffbeb", border: "1px solid rgba(245,158,11,0.25)" }}
        >
          <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: "#d97706" }} />
          <p className="text-[12px] leading-relaxed" style={{ color: "#92400e" }}>
            解禁操作可能需前往实验动物科学部自助刷卡机完成。
          </p>
        </div>
      )}
    </div>
  );
}

export default function MobileNoticeDetailBody({
  item,
  html5PrivilegeBypass = false,
  fullBleed = false,
}: MobileNoticeDetailBodyProps) {
  const navigate = useNavigate();
  const colors = alertKindColors(item.kind);
  const isViolation = item.kind === "violation";
  const isExempt = item.kind === "exempt";
  const pendingConfirm =
    isViolation &&
    !html5PrivilegeBypass &&
    item.interactiveChallengeVerified !== true &&
    (Boolean(item.obligationId) ||
      Boolean(item.interactiveChallenge?.trim()) ||
      item.interactiveRequired);
  const bodySource = isViolation
    ? extractViolationBodyForDisplay(String(item.contentHtml || ""))
    : isExempt
      ? prepareExemptAlertBodyHtml(item)
      : String(item.contentHtml || "");
  const bodyHtml = isExempt ? bodySource : prepareMobileNoticeHtml(bodySource);
  const displayTitle = isExempt ? resolveExemptAlertTitle() : item.title;
  const metaTime =
    item.publishAt?.slice(0, 16) ||
    item.createdAt?.slice(0, 16) ||
    item.publishAt?.slice(0, 10) ||
    item.createdAt?.slice(0, 10) ||
    "";

  useEffect(() => {
    if (isViolation && item.obligationId && item.obligationId > 0) {
      void markObligationDelivered(item.obligationId).catch(() => undefined);
    }
  }, [isViolation, item.obligationId]);

  return (
    <div className="flex flex-col gap-2.5">
      {/* 来源指示：类型 · 时间 */}
      <div className="flex items-center gap-1 min-w-0 overflow-hidden flex-nowrap">
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none"
          style={{ background: colors.bg, color: colors.color }}
        >
          {alertKindLabel(item.kind, item.source)}
        </span>
        {metaTime ? (
          <>
            <span className="shrink-0 text-[11px]" style={{ color: "#dcdee0" }}>
              ·
            </span>
            <span
              className="shrink-0 text-[11px] tabular-nums whitespace-nowrap"
              style={{ color: "#969799" }}
            >
              {metaTime}
            </span>
          </>
        ) : null}
        {pendingConfirm ? (
          <>
            <span className="shrink-0 text-[11px]" style={{ color: "#dcdee0" }}>
              ·
            </span>
            <span
              className="shrink-0 text-[10px] font-semibold whitespace-nowrap"
              style={{ color: "#ac1736" }}
            >
              待确认
            </span>
          </>
        ) : null}
        {item.autoOpenSuppressed ? (
          <>
            <span className="shrink-0 text-[11px]" style={{ color: "#dcdee0" }}>
              ·
            </span>
            <span
              className="shrink-0 text-[10px] font-semibold whitespace-nowrap"
              style={{ color: "#969799" }}
            >
              已设置不再弹出
            </span>
          </>
        ) : null}
      </div>

      <h3
        className="text-[17px] font-bold leading-snug break-words"
        style={{ color: "#323233" }}
      >
        {displayTitle}
      </h3>

      {isViolation && (
        <MobileViolationStatusCard
          item={item}
          html5PrivilegeBypass={html5PrivilegeBypass}
        />
      )}

      <div
        className={fullBleed ? "pb-2" : "rounded-xl"}
        style={
          fullBleed
            ? undefined
            : {
                background: "#fff",
                border: "1px solid #ebedf0",
                padding: "12px 14px",
              }
        }
      >
        {bodyHtml ? (
          <div
            className={`${MOBILE_NOTICE_BODY_CLASS}${fullBleed ? " mobile-notice-detail-body" : ""}`}
            style={{ color: "#323233" }}
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        ) : (
          <p className="text-[14px] text-center py-6" style={{ color: "#969799" }}>
            暂无正文
          </p>
        )}
      </div>

      {pendingConfirm && (
        <button
          type="button"
          className="w-full rounded-xl py-3 text-[15px] font-semibold text-white active:opacity-90"
          style={{ background: "#ac1736" }}
          onClick={() => navigate(resolveObligationPath(item))}
        >
          去完成确认
        </button>
      )}
    </div>
  );
}
