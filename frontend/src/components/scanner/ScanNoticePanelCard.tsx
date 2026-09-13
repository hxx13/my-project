import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { AlertTriangle, CreditCard, Megaphone, type LucideIcon } from "lucide-react";
import type { ScanPopupAnnouncementItem, StudentViolationNotice } from "@/api/types/scanner";
import { prepareAnnouncementHtml } from "@/utils/announcementHtml";
import { InteractiveChallenge } from "./InteractiveChallenge";
import {
  ViolationAckReadPanel,
  ViolationQuizPanel,
  ViolationSignaturePanel,
} from "./ViolationDispositionPanels";
import { ScanNoticeDoodleCard } from "./ScanNoticeDoodleCard";
import { ackViolationInteractivePermanent, type InteractiveVerifiedPatch } from "./twinViolationInteractive";
import {
  noticeThemeClass,
  resolveScanPopupNoticeMeta,
  type NoticeKind,
} from "./scanPopupTheme";
import { useTheme } from "@/features/theme/ThemeProvider";
import type { ScanNoticePanelKey } from "./scanNoticePanelId";
import { parseAnnouncementPanelId } from "./scanNoticePanelId";
import {
  NOTICE_DISMISS_WAIT_SECONDS,
} from "./scanNoticeDismissStorage";
import { suppressScanNoticeAutoOpen } from "./scanNoticeAutoSuppress.api";

export type { InteractiveVerifiedPatch } from "./twinViolationInteractive";

type BaseProps = {
  panelKey: ScanNoticePanelKey;
  /** 被扫码人员 userId（非操作员） */
  scannedUserId?: string;
  /** 服务端已标记不再自动弹出 */
  autoOpenSuppressed?: boolean;
  onAutoOpenSuppressed?: () => void;
  onClose: () => void;
  manualAnnouncementPage?: number;
  manualAnnouncementTotal?: number;
  onManualAnnouncementPrev?: () => void;
  onManualAnnouncementNext?: () => void;
};

type ViolationPanelProps = BaseProps & {
  kind: "violation" | "unbound" | "cage-notice";
  notice: StudentViolationNotice;
  targetUserId?: string;
  onInteractiveVerified?: (patch: InteractiveVerifiedPatch) => void;
};

type AnnouncementPanelProps = BaseProps & {
  kind: "announcement";
  item: ScanPopupAnnouncementItem;
  showNoticeEveryScan: boolean;
};

export type ScanNoticePanelCardProps = ViolationPanelProps | AnnouncementPanelProps;

function noticeAckKey(kind: NoticeKind, id: number): string {
  if (kind === "announcement") return `twin_scan_announcement_ack_${id}`;
  if (kind === "unbound") return "twin_unbound_card_notice_ack";
  return `twin_violation_notice_ack_${id}`;
}

function persistAck(kind: NoticeKind, id: number, showEveryScan: boolean) {
  if (showEveryScan) return;
  try {
    sessionStorage.setItem(noticeAckKey(kind, id), "1");
  } catch {
    /* ignore */
  }
}

/**
 * 单张原尺寸涂鸦便签卡（嵌入横向条带，不缩小）
 *
 * showNoticeEveryScan 契约（T2-5）：服务端只存储/下发布尔值；本组件负责同会话
 * 展开频次（sessionStorage ack）。跨会话「不再自动弹出」走 auto-suppress API。
 */
export function ScanNoticePanelCard(props: ScanNoticePanelCardProps) {
  const { kind, panelKey, scannedUserId, autoOpenSuppressed = false, onAutoOpenSuppressed, onClose } =
    props;
  const { theme } = useTheme();
  const isDark = theme.mode === "dark";
  const meta = resolveScanPopupNoticeMeta(kind);
  const themeClass = noticeThemeClass(kind);
  const shell = `${theme.className} ${isDark ? "dark" : ""} ${themeClass}`;

  const notice = kind === "announcement" ? null : props.notice;
  const item = kind === "announcement" ? props.item : null;
  const targetUserId = kind !== "announcement" ? props.targetUserId : undefined;
  const onInteractiveVerified =
    kind !== "announcement" ? props.onInteractiveVerified : undefined;
  const showEveryScan =
    kind === "announcement" ? props.showNoticeEveryScan : Boolean(notice?.showNoticeEveryScan);

  const isViolation = kind === "violation";
  const locked = Boolean(notice?.enterLocked);
  const remaining = isViolation ? notice?.remainingEnterAllowance : undefined;

  const [interactiveDone, setInteractiveDone] = useState(
    Boolean(kind !== "announcement" && notice?.interactiveChallengeVerified)
  );
  // 一次性闸：interactiveSaving 是 state，被 useCallback 闭包捕获后同一 tick 内二次调用读到旧值，
  // 挡不住连点；用 ref 同步置位才能真正单飞。
  const ackSavingRef = useRef(false);
  // ack 失败时递增，强制 InteractiveChallenge 重挂，退回可重试状态（否则其内部 done 已为 true，绿「验证通过」不再消失）
  const [interactiveResetKey, setInteractiveResetKey] = useState(0);
  const [dismissCountdown, setDismissCountdown] = useState<number | null>(null);
  const [externalCloseTick, setExternalCloseTick] = useState(0);
  const [dismissSaving, setDismissSaving] = useState(false);
  const dismissSessionRef = useRef(0);

  const cancelDismissCountdown = useCallback(() => {
    dismissSessionRef.current += 1;
    setDismissCountdown(null);
    setDismissSaving(false);
  }, []);

  useEffect(() => {
    if (kind === "announcement") return;
    setInteractiveDone(Boolean(notice?.interactiveChallengeVerified));
  }, [kind, notice?.id, notice?.interactiveChallengeVerified]);

  const interactivePhrase =
    kind === "announcement" ? null : notice?.interactiveChallenge || null;
  const unblockMethod = kind !== "announcement" ? notice?.unblockMethod : undefined;
  const canSelfUnblock = kind !== "announcement" ? notice?.canSelfUnblock : undefined;

  // 记录级 interactiveChallenge 为管理员/系统显式开启；不受 MANUAL 等「仅工作人员」规则默认解禁方式影响
  const interactiveBlockedByLimit =
    Boolean(interactivePhrase) && !interactiveDone && unblockMethod === "自助解禁" && canSelfUnblock === false;

  // 处置策略：后端下发的 dispositionType 优先；老数据没有该字段时回退到「有拼图短语即拼图」
  const dispositionStrategy = useMemo(() => {
    if (kind === "announcement") return "";
    const declared = notice?.dispositionType?.trim().toUpperCase();
    if (declared) {
      // 拼图策略必须有短语才可作答：否则 footer 渲染不出、主按钮又被禁用，弹窗会卡死无出口。
      // 缺短语时退回普通公告（与改前 showInteractivePuzzle 要求 interactivePhrase 的口径一致）。
      if (declared === "ACK_PUZZLE" && !interactivePhrase) return "";
      return declared;
    }
    return interactivePhrase ? "ACK_PUZZLE" : "";
  }, [kind, notice?.dispositionType, interactivePhrase]);

  /** 待完成的交互式处置（拼图 / 确认阅读 / 答题 / 签名）；空串表示无需处置 */
  const pendingAckStrategy = useMemo(() => {
    if (interactiveDone || interactiveBlockedByLimit) return "";
    const interactive = ["ACK_PUZZLE", "ACK_READ", "QUIZ", "SIGNATURE"];
    return interactive.includes(dispositionStrategy) ? dispositionStrategy : "";
  }, [dispositionStrategy, interactiveDone, interactiveBlockedByLimit]);

  const dispositionConfig = useMemo(() => {
    if (kind === "announcement" || !notice?.dispositionConfigJson) return null;
    try {
      return JSON.parse(notice.dispositionConfigJson) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [kind, notice?.dispositionConfigJson]);
  const signaturePreamble =
    typeof dispositionConfig?.preamble === "string" ? dispositionConfig.preamble : "";

  const ackViolationId = notice?.id ?? null;

  // 「需滚动到底才能确认」用：正文滚动到底后置位，切违规时复位
  const [bodyScrolledToBottom, setBodyScrolledToBottom] = useState(false);
  useEffect(() => {
    if (kind === "announcement") return;
    setBodyScrolledToBottom(false);
  }, [kind, ackViolationId]);
  const handleBodyScrollToBottom = useCallback(() => setBodyScrolledToBottom(true), []);

  /** 四种策略共用的提交：成功后回写 onInteractiveVerified，失败向上抛给各面板自行提示与重试 */
  const submitAck = useCallback(
    async (answer: string) => {
      if (kind === "announcement" || ackViolationId == null || !targetUserId) {
        throw new Error("无法提交处置");
      }
      if (ackSavingRef.current || interactiveDone) return;
      ackSavingRef.current = true;
      try {
        const ack = await ackViolationInteractivePermanent(ackViolationId, targetUserId, answer);
        setInteractiveDone(true);
        onInteractiveVerified?.({
          violationId: ack.violationId,
          enterLocked: ack.enterLocked,
          interactiveChallengeVerified: ack.interactiveChallengeVerified,
          violationExpired: ack.violationExpired,
        });
      } catch (e) {
        setInteractiveDone(false);
        throw e;
      } finally {
        ackSavingRef.current = false;
      }
    },
    [kind, ackViolationId, targetUserId, interactiveDone, onInteractiveVerified]
  );

  const images = useMemo(() => {
    if (kind === "announcement" || !notice?.imageUrls?.length) return [];
    return notice.imageUrls.filter((u) => typeof u === "string" && u.trim().length > 0);
  }, [kind, notice?.imageUrls]);

  const bodyHtml = useMemo(() => {
    if (kind === "announcement") {
      return prepareAnnouncementHtml(item?.contentHtml || "");
    }
    const src =
      notice?.critical && notice?.criticalNoticeText
        ? notice.criticalNoticeText
        : notice?.violationText || "";
    return prepareAnnouncementHtml(src);
  }, [kind, item?.contentHtml, notice?.critical, notice?.criticalNoticeText, notice?.violationText]);

  const title =
    kind === "announcement" ? item?.title || "扫码公告"
    : kind === "cage-notice" ? notice?.ruleName?.replace("[CAGE]", "") || "笼位处理提示"
    : meta.dialogCategory;

  const PanelIcon: LucideIcon =
    kind === "announcement" ? Megaphone : kind === "violation" ? AlertTriangle : CreditCard;

  const recordId =
    kind === "announcement"
      ? item?.id ?? parseAnnouncementPanelId(panelKey)
      : notice?.id;

  const dismissAlreadySuppressed = autoOpenSuppressed;
  const showDismissForever = Boolean(
    scannedUserId?.trim() && recordId != null && !dismissAlreadySuppressed
  );
  const dismissInProgress = dismissCountdown != null && dismissCountdown > 0;

  useEffect(() => {
    if (dismissCountdown == null || dismissCountdown <= 0) return;
    const timer = window.setTimeout(() => {
      setDismissCountdown((prev) => {
        if (prev == null || prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [dismissCountdown]);

  useEffect(() => {
    if (dismissCountdown !== 0) return;
    if (!scannedUserId?.trim() || recordId == null) {
      setDismissCountdown(null);
      return;
    }
    let cancelled = false;
    const session = dismissSessionRef.current;
    setDismissSaving(true);
    void suppressScanNoticeAutoOpen({
      targetUserId: scannedUserId.trim(),
      noticeKind: kind,
      recordId,
    })
      .then(() => {
        if (cancelled || session !== dismissSessionRef.current) return;
        onAutoOpenSuppressed?.();
        setDismissCountdown(null);
        setExternalCloseTick((t) => t + 1);
      })
      .catch(() => {
        if (cancelled || session !== dismissSessionRef.current) return;
        setDismissCountdown(null);
      })
      .finally(() => {
        if (!cancelled && session === dismissSessionRef.current) setDismissSaving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dismissCountdown, scannedUserId, kind, recordId, onAutoOpenSuppressed]);

  const handleDismissForever = useCallback(() => {
    if (dismissCountdown != null || dismissSaving) return;
    dismissSessionRef.current += 1;
    setDismissCountdown(NOTICE_DISMISS_WAIT_SECONDS);
  }, [dismissCountdown, dismissSaving]);

  const handlePrimary = useCallback(() => {
    cancelDismissCountdown();
    if (kind === "announcement") {
      if (recordId != null) persistAck("announcement", recordId, showEveryScan);
      onClose();
      return;
    }
    if (recordId == null || showEveryScan || pendingAckStrategy) return;
    persistAck(kind, recordId, showEveryScan);
    onClose();
  }, [kind, recordId, showEveryScan, pendingAckStrategy, onClose, cancelDismissCountdown]);

  const handleClose = useCallback(() => {
    cancelDismissCountdown();
    if (kind === "announcement" && recordId != null) {
      persistAck("announcement", recordId, showEveryScan);
    }
    onClose();
  }, [kind, recordId, showEveryScan, onClose, cancelDismissCountdown]);

  const manualTotal = props.manualAnnouncementTotal ?? 1;
  const manualPage = props.manualAnnouncementPage ?? 0;
  const showPager =
    kind === "announcement" &&
    panelKey === "announcement-manual" &&
    manualTotal > 1;

  return (
    <motion.div
      layout="position"
      transition={{ layout: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } }}
      className={`scan-notice-strip-slot ${shell}`}
    >
      <ScanNoticeDoodleCard
        embedded
        onBodyScrollToBottom={
          pendingAckStrategy === "ACK_READ" ? handleBodyScrollToBottom : undefined
        }
        kind={kind}
        titleId={`${meta.titleId}-${panelKey}`}
        title={title}
        categoryLabel={meta.dialogCategory}
        icon={PanelIcon}
        bodyHtml={bodyHtml}
        emptyHint={meta.emptyBodyHint}
        imageUrls={kind === "announcement" ? [] : images}
        imageAlt={meta.imageAlt}
        pageIndex={manualPage}
        totalPages={showPager ? manualTotal : 1}
        statusSlot={
          <>
            {isViolation && remaining != null ? (
              <span className="scan-doodle-card__status">剩余进入 {remaining} 次</span>
            ) : null}
            {locked ? (
              <span className="scan-doodle-card__status scan-doodle-card__status--danger">禁止进入</span>
            ) : null}
          </>
        }
        footerSlot={
          pendingAckStrategy === "ACK_PUZZLE" && interactivePhrase ? (
            <InteractiveChallenge
              key={interactiveResetKey}
              phrase={interactivePhrase}
              onComplete={(answer) => {
                void submitAck(answer).catch((e) => {
                  setInteractiveResetKey((k) => k + 1);
                  toast.error(e instanceof Error ? e.message : "交互确认失败");
                });
              }}
            />
          ) : pendingAckStrategy === "ACK_READ" ? (
            <ViolationAckReadPanel
              key={ackViolationId}
              configJson={notice?.dispositionConfigJson}
              scrolledToBottom={bodyScrolledToBottom}
              onSubmit={submitAck}
            />
          ) : pendingAckStrategy === "QUIZ" && ackViolationId != null ? (
            <ViolationQuizPanel key={ackViolationId} violationId={ackViolationId} onSubmit={submitAck} />
          ) : pendingAckStrategy === "SIGNATURE" ? (
            <ViolationSignaturePanel preamble={signaturePreamble} onSubmit={submitAck} />
          ) : interactiveBlockedByLimit ? (
            <p className="text-[11px] text-center text-[var(--app-color-feedback-danger)] px-3 py-2">
              已达解禁上限
            </p>
          ) : null
        }
        primaryLabel={
          kind === "announcement"
            ? "知道了"
            : pendingAckStrategy
              ? "请先完成上方处置"
              : "已知悉，关闭"
        }
        primaryDisabled={Boolean(pendingAckStrategy)}
        showPrimary={kind === "announcement" || !showEveryScan}
        onPrimary={handlePrimary}
        showSecondary={showDismissForever}
        secondaryLabel={
          dismissInProgress
            ? `请等待 ${dismissCountdown}s`
            : "下次不再弹出"
        }
        secondaryDisabled={dismissInProgress || dismissSaving}
        onSecondary={handleDismissForever}
        externalCloseTick={externalCloseTick}
        onClose={handleClose}
        onPrev={showPager ? props.onManualAnnouncementPrev : undefined}
        onNext={showPager ? props.onManualAnnouncementNext : undefined}
      />
    </motion.div>
  );
}
