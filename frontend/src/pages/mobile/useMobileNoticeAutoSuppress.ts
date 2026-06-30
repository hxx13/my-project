/** 手机 H5 公告详情 —「下次不再弹出」（与扫码弹窗同源，本页等待后同步后端） */
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  suppressMobileNoticeAutoOpen,
  type MobileAlertItem,
} from "@/api/domains/mobileStudent.api";
import { NOTICE_DISMISS_WAIT_SECONDS } from "@/components/scanner/scanNoticeDismissStorage";

export type MobileSuppressNoticeKind = "announcement" | "violation";

export function resolveMobileNoticeSuppressKind(
  kind: MobileAlertItem["kind"],
): MobileSuppressNoticeKind | null {
  if (kind === "announcement" || kind === "violation") return kind;
  return null;
}

export function resolveMobileNoticeRecordId(item: MobileAlertItem): number | null {
  const n = Number(item.id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function useMobileNoticeAutoSuppress({
  token,
  item,
  alreadySuppressed = false,
  onSuppressed,
}: {
  token?: string;
  item: MobileAlertItem;
  alreadySuppressed?: boolean;
  onSuppressed?: () => void;
}) {
  const noticeKind = resolveMobileNoticeSuppressKind(item.kind);
  const recordId = resolveMobileNoticeRecordId(item);

  const [suppressed, setSuppressed] = useState(alreadySuppressed);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const sessionRef = useRef(0);

  useEffect(() => {
    setSuppressed(alreadySuppressed);
  }, [alreadySuppressed, item.id, item.kind]);

  useEffect(() => {
    return () => {
      sessionRef.current += 1;
    };
  }, []);

  const cancelCountdown = useCallback(() => {
    sessionRef.current += 1;
    setCountdown(null);
    setSaving(false);
  }, []);

  useEffect(() => {
    if (countdown == null || countdown <= 0) return;
    const timer = window.setTimeout(() => {
      setCountdown((prev) => {
        if (prev == null || prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (countdown !== 0) return;
    if (!token?.trim() || !noticeKind || recordId == null) {
      setCountdown(null);
      return;
    }
    let cancelled = false;
    const session = sessionRef.current;
    setSaving(true);
    void suppressMobileNoticeAutoOpen(token.trim(), { noticeKind, recordId })
      .then(() => {
        if (cancelled || session !== sessionRef.current) return;
        setSuppressed(true);
        setCountdown(null);
        onSuppressed?.();
        toast.success("已设置，扫码时将不再自动弹出");
      })
      .catch((e: unknown) => {
        if (cancelled || session !== sessionRef.current) return;
        setCountdown(null);
        toast.error(e instanceof Error ? e.message : "保存失败，请重试");
      })
      .finally(() => {
        if (!cancelled && session === sessionRef.current) setSaving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [countdown, token, noticeKind, recordId, onSuppressed]);

  const canSuppress = Boolean(token?.trim() && noticeKind && recordId != null && !suppressed);

  const startSuppress = useCallback(() => {
    if (!canSuppress || countdown != null || saving) return;
    sessionRef.current += 1;
    setCountdown(NOTICE_DISMISS_WAIT_SECONDS);
  }, [canSuppress, countdown, saving]);

  const dismissInProgress = countdown != null && countdown > 0;

  const secondaryLabel = suppressed
    ? "已设置不再弹出"
    : dismissInProgress
      ? `请在本页等待 ${countdown}s`
      : saving
        ? "正在保存…"
        : "下次不再弹出";

  return {
    canSuppress,
    suppressed,
    dismissInProgress,
    saving,
    secondaryLabel,
    secondaryDisabled: suppressed || dismissInProgress || saving,
    startSuppress,
    cancelCountdown,
    waitSeconds: NOTICE_DISMISS_WAIT_SECONDS,
    countdownSeconds: dismissInProgress ? countdown : null,
  };
}
