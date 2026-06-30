import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { RefreshCw, Copy, QrCode, ExternalLink, X, Loader2, Clock, Check } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { hasMobileHtml5Privilege, MOBILE_HTML5_PRIVILEGE_MIN_ROLE } from "@/features/auth/roleAccess";
import {
  fetchMobileTokenInfo,
  generateMobileToken,
  type MobileTokenInfo,
} from "@/api/domains/mobileStudent.api";

interface Props {
  userId: string;
  userName?: string;
  /** 人员授权页角色；管理员及以上享有 HTML5 直达免过滤 */
  role?: string;
}

function daysRemaining(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}

/** 紧凑型 table cell：token 状态指示器 + 点击展开 QR 弹窗 */
export function PersonnelMobileTokenCell({ userId, userName, role }: Props) {
  const html5Privilege = hasMobileHtml5Privilege(role);
  const [tokenInfo, setTokenInfo] = useState<MobileTokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const info = await fetchMobileTokenInfo(userId);
      setTokenInfo(info);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCellClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // 已有活跃 token → 打开弹窗展示二维码
    if (hasActive && !expired) {
      setPopoverOpen(true);
      return;
    }
    // 无 token 或已过期 → 直接生成
    if (generating) return;
    setGenerating(true);
    try {
      const gen = await generateMobileToken(userId, 3);
      setTokenInfo({ hasToken: true, token: gen.token, expiresAt: gen.expiresAt });
      toast.success("已生成");
      // 生成后自动打开弹窗
      setPopoverOpen(true);
    } catch (err: any) {
      toast.error(err?.message || "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tokenInfo?.token) return;
    const url = `${window.location.origin}/#/m/sc/${tokenInfo.token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("已复制");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => toast.error("复制失败"));
  };

  const qrUrl = tokenInfo?.token
    ? `${window.location.origin}/#/m/sc/${tokenInfo.token}`
    : "";

  const hasActive = tokenInfo?.hasToken && tokenInfo?.token;
  const remaining = tokenInfo?.expiresAt ? daysRemaining(tokenInfo.expiresAt) : 0;
  const expired = hasActive && remaining <= 0;

  // ---- popover ----
  const popover = popoverOpen && createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={() => setPopoverOpen(false)}
    >
      <div
        className="w-[380px] rounded-2xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <QrCode className="size-5 text-[var(--app-color-primary)]" />
            <span className="font-semibold text-sm text-[var(--app-color-text-primary)]">
              手机端直达
            </span>
          </div>
          <button
            onClick={() => setPopoverOpen(false)}
            className="rounded-lg p-1 hover:bg-[var(--app-color-surface-container)]"
          >
            <X className="size-4 text-[var(--app-color-text-tertiary)]" />
          </button>
        </div>

        {userName && (
          <p className="text-xs text-[var(--app-color-text-secondary)] mb-3">
            学生：{userName}
            {html5Privilege ? (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                HTML5 笼架免过滤（{MOBILE_HTML5_PRIVILEGE_MIN_ROLE}+）
              </span>
            ) : null}
          </p>
        )}

        {hasActive && !expired ? (
          <>
            {/* QR code */}
            <div className="flex justify-center mb-3">
              <div className="rounded-xl bg-white p-3 shadow-sm border border-[var(--app-color-border-default)]">
                <QRCodeSVG value={qrUrl} size={180} level="M" fgColor="#1a1a1a" bgColor="#ffffff" />
              </div>
            </div>

            {/* URL + copy */}
            <div className="flex items-center gap-1.5 mb-2 bg-[var(--app-color-surface-container)] rounded-lg px-3 py-2">
              <a
                href={qrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-[11px] font-mono text-[var(--app-color-primary)] truncate hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                /#/m/sc/{tokenInfo.token!.slice(0, 16)}…
              </a>
              <button
                onClick={handleCopyUrl}
                className="shrink-0 rounded-md p-1.5 hover:bg-[var(--app-color-surface-element)] transition-colors"
                title="复制链接"
              >
                {copied ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5 text-[var(--app-color-text-tertiary)]" />
                )}
              </button>
              <a
                href={qrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-md p-1.5 hover:bg-[var(--app-color-surface-element)] transition-colors"
                title="在新标签页打开"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="size-3.5 text-[var(--app-color-text-tertiary)]" />
              </a>
            </div>

            {/* expiration */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-[var(--app-color-text-tertiary)]">
                <Clock className="size-3" />
                有效期至 {tokenInfo.expiresAt!.slice(0, 10)}
              </span>
              <span className={`font-medium ${remaining <= 1 ? "text-red-500" : "text-emerald-600"}`}>
                {remaining <= 0 ? "已过期" : `剩余 ${remaining} 天`}
              </span>
            </div>

            {/* regenerate */}
            <button
              onClick={handleCellClick}
              disabled={generating}
              className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg border border-[var(--app-color-border-default)] px-3 py-2 text-xs font-medium
                         text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-container)]
                         active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <RefreshCw className={generating ? "size-3.5 animate-spin" : "size-3.5"} />
              重新生成（旧链接立即失效）
            </button>
          </>
        ) : (
          <>
            <div className="text-center py-6">
              <QrCode className="size-10 mx-auto mb-2 text-[var(--app-color-text-tertiary)]/30" />
              <p className="text-xs text-[var(--app-color-text-tertiary)] mb-3">
                {expired ? "链接已过期" : "暂无直达链接"}
              </p>
              <button
                onClick={handleCellClick}
                disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--app-color-primary)] px-4 py-2 text-xs font-medium text-white
                           hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    生成中…
                  </>
                ) : (
                  "生成直达链接"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );

  // ---- compact cell render ----
  if (loading) {
    return (
      <td className="px-2 py-1.5 text-center">
        <Loader2 className="size-3.5 animate-spin text-[var(--twin-mute)] mx-auto" />
      </td>
    );
  }

  return (
    <td className="px-2 py-1.5 text-center">
      <button
        type="button"
        onClick={handleCellClick}
        disabled={generating}
        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-all
                   hover:shadow-sm active:scale-95 disabled:opacity-50"
        style={{
          borderColor: hasActive && !expired
            ? "var(--app-color-feedback-success, #16a34a)"
            : "var(--app-color-border-default, #e5e5e5)",
          backgroundColor: hasActive && !expired
            ? "var(--app-color-feedback-success-soft, #dcfce7)"
            : "var(--app-color-surface-container, #f5f5f5)",
          color: hasActive && !expired
            ? "var(--app-color-feedback-success, #16a34a)"
            : "var(--app-color-text-tertiary, #8c8c8c)",
        }}
      >
        <QrCode className="size-3" />
        {hasActive && !expired ? (
          <span>{remaining}天</span>
        ) : expired ? (
          <span>过期</span>
        ) : (
          <span>生成</span>
        )}
      </button>
      {popover}
    </td>
  );
}
