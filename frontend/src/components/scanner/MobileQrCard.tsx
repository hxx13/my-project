import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { RefreshCw, Loader2, Smartphone, Clock } from "lucide-react";
import {
  fetchMobileTokenInfo,
  generateMobileToken,
  type MobileTokenInfo,
} from "@/api/domains/mobileStudent.api";
import { useTheme } from "@/features/theme/ThemeProvider";
import { SCAN_PALETTE } from "./scanPopupTheme";

interface MobileQrCardProps {
  userId: string;
  /** 随父容器尺寸缩放（扫码弹窗左下卡片） */
  adaptive?: boolean;
}

const QR_SIZE_DEFAULT = 152;
const QR_SIZE_MIN = 72;
const QR_SIZE_MAX = 168;

function useAdaptiveQrSize(
  containerRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  const [size, setSize] = useState(QR_SIZE_DEFAULT);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      const next = Math.floor(Math.min(width - 4, height - 4, QR_SIZE_MAX));
      setSize(Math.max(QR_SIZE_MIN, next));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, enabled]);

  return size;
}

/** 解析 CSS 变量/值为 QRCodeSVG 可用的 rgb/hex */
function readResolvedColor(root: Element, property: "color" | "backgroundColor", cssValue: string): string {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  if (property === "color") {
    probe.style.color = cssValue;
  } else {
    probe.style.backgroundColor = cssValue;
  }
  root.appendChild(probe);
  const resolved = getComputedStyle(probe)[property];
  root.removeChild(probe);
  return resolved;
}

function useScanThemedQrColors(enabled: boolean) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isDark = theme.mode === "dark";
  const [colors, setColors] = useState({
    fg: isDark ? SCAN_PALETTE.badgeText : SCAN_PALETTE.accentInk,
    bg: isDark ? SCAN_PALETTE.studentBgDark : SCAN_PALETTE.studentBg,
  });

  useLayoutEffect(() => {
    if (!enabled) return;
    const card = wrapRef.current?.closest(".scan-student-card");
    const qrHost = wrapRef.current?.closest(".mobile-qr-card");
    const overlay = wrapRef.current?.closest("[data-scan-overlay]");
    const root = overlay ?? card ?? document.documentElement;

    const hostBg = qrHost ? getComputedStyle(qrHost).backgroundColor : "";
    const cardBg = card ? getComputedStyle(card).backgroundColor : "";
    const bg =
      (hostBg && hostBg !== "rgba(0, 0, 0, 0)" && hostBg !== "transparent")
        ? hostBg
        : cardBg && cardBg !== "rgba(0, 0, 0, 0)"
          ? cardBg
          : readResolvedColor(
              root,
              "backgroundColor",
              isDark
                ? "var(--scan-student-bg-dark, var(--app-color-scan-student-bg))"
                : "var(--scan-student-bg, var(--app-color-scan-student-bg))",
            );

    const fg = readResolvedColor(root, "color", "var(--app-color-text-primary)");

    setColors({ fg, bg });
  }, [enabled, isDark]);

  return { wrapRef, colors };
}

/** 根据有效期计算剩余天数 */
function daysRemaining(expiresAt: string): number {
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  return Math.max(0, Math.ceil((exp - now) / (1000 * 60 * 60 * 24)));
}

export function MobileQrCard({ userId, adaptive = false }: MobileQrCardProps) {
  const [tokenInfo, setTokenInfo] = useState<MobileTokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasToken = Boolean(tokenInfo?.token);
  const sizeContainerRef = useRef<HTMLDivElement>(null);
  const adaptiveQrSize = useAdaptiveQrSize(sizeContainerRef, adaptive && hasToken && !loading && !generating && !error);
  const qrSize = adaptive ? adaptiveQrSize : QR_SIZE_DEFAULT;
  const { wrapRef, colors: qrColors } = useScanThemedQrColors(hasToken && !loading && !generating && !error);

  const loadToken = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const info = await fetchMobileTokenInfo(userId);
      if (info.hasToken && info.token) {
        setTokenInfo(info);
      } else {
        // 自动生成
        setGenerating(true);
        const gen = await generateMobileToken(userId, 3);
        setTokenInfo({ hasToken: true, token: gen.token, expiresAt: gen.expiresAt });
        setGenerating(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  const handleRegenerate = async () => {
    if (!userId || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const gen = await generateMobileToken(userId, 3);
      setTokenInfo({ hasToken: true, token: gen.token, expiresAt: gen.expiresAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  // QR 码中的 URL（hash 路由）
  const qrUrl = tokenInfo?.token
    ? `${window.location.origin}/#/m/sc/${tokenInfo.token}`
    : "";

  const remaining = tokenInfo?.expiresAt ? daysRemaining(tokenInfo.expiresAt) : 0;

  return (
    <div
      className={`mobile-qr-card flex w-full min-h-0 flex-col items-center gap-1.5 p-1 ${
        adaptive ? "h-full max-h-full flex-1" : "shrink-0"
      }`}
    >
      {/* 标题栏 */}
      <div className="flex shrink-0 items-center gap-2 w-full justify-center flex-wrap">
        <Smartphone className="size-4 text-[var(--app-color-text-tertiary)]" strokeWidth={1.5} />
        <span className={`font-semibold text-[var(--app-color-text-secondary)] ${adaptive ? "text-xs sm:text-sm" : "text-sm"}`}>
          手机端直达
        </span>
        {remaining > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--app-color-text-tertiary)]">
            <Clock className="size-3" strokeWidth={1.5} />
            {remaining}天后过期
          </span>
        )}
      </div>

      {/* 二维码区：adaptive 时占满剩余高度并据此缩放 */}
      <div
        ref={sizeContainerRef}
        className={`w-full min-w-0 flex items-center justify-center ${
          adaptive ? "min-h-0 flex-1" : "shrink-0"
        }`}
      >
      {loading || generating ? (
        <div className="flex flex-col items-center gap-1.5 py-2">
          <Loader2 className="size-5 animate-spin text-[var(--app-color-text-tertiary)]" />
          <span className="text-[10px] text-[var(--app-color-text-tertiary)]">
            {generating ? "生成中…" : "加载中…"}
          </span>
        </div>
      ) : error ? (
        <div className="text-center py-2">
          <p className="text-[10px] text-[var(--app-color-feedback-danger)] mb-1">{error}</p>
          <button
            onClick={loadToken}
            className="text-[10px] text-[var(--app-color-primary)] hover:underline"
          >
            重试
          </button>
        </div>
      ) : tokenInfo?.token ? (
        <div ref={wrapRef} className="rounded-[var(--app-radius-element)] p-0.5 shrink-0">
          <QRCodeSVG
            value={qrUrl}
            size={qrSize}
            level="M"
            fgColor={qrColors.fg}
            bgColor={qrColors.bg}
          />
        </div>
      ) : null}
      </div>

      {tokenInfo?.token && !loading && !generating && !error ? (
        <div className="shrink-0 flex flex-col items-center gap-1.5 w-full">
          {tokenInfo.expiresAt && (
            <p className="text-[10px] text-[var(--app-color-text-tertiary)] text-center leading-tight">
              有效期至{" "}
              <span className="font-medium text-[var(--app-color-text-secondary)]">
                {tokenInfo.expiresAt.slice(0, 10)}
              </span>
            </p>
          )}

          <button
            type="button"
            onClick={handleRegenerate}
            disabled={generating}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-medium
                       bg-[var(--app-color-surface-element)] text-[var(--app-color-text-secondary)]
                       hover:bg-[var(--app-color-surface-container)] active:scale-95
                       transition-all disabled:opacity-50"
          >
            <RefreshCw className={generating ? "size-3 animate-spin" : "size-3"} strokeWidth={1.5} />
            重新生成
          </button>
        </div>
      ) : null}
    </div>
  );
}
