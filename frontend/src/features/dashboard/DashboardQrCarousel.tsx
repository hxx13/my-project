import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTheme } from "@/features/theme/ThemeProvider";

interface Props {
  qrUrl: string;
  children: ReactNode;
}

export default function DashboardQrCarousel({ qrUrl, children }: Props) {
  const { theme } = useTheme();
  const isDark = theme.mode === "dark";

  const [page, setPage] = useState<0 | 1>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setPage((prev) => (prev === 0 ? 1 : 0));
    }, 8000);
  };

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const switchTo = (p: 0 | 1) => {
    setPage(p);
    resetTimer();
  };

  const qrFgColor = useMemo(() => isDark ? "#e2e2ea" : "#1e1e2a", [isDark]);
  const qrBgColor = "transparent";

  const qrContainerStyle = useMemo(() => ({
    background: isDark
      ? "rgba(255,255,255,0.08)"
      : "rgba(0,0,0,0.04)",
    border: isDark
      ? "1px solid rgba(255,255,255,0.10)"
      : "1px solid rgba(0,0,0,0.08)",
  }), [isDark]);

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex-1 min-h-0 relative">
        <div
          className="absolute inset-0 transition-opacity duration-400"
          style={{ opacity: page === 0 ? 1 : 0, pointerEvents: page === 0 ? "auto" : "none" }}
        >
          {children}
        </div>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 transition-opacity duration-400"
          style={{ opacity: page === 1 ? 1 : 0, pointerEvents: page === 1 ? "auto" : "none" }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--app-color-text-primary)" }}>
            学生手机端入口
          </p>
          <div
            className="rounded-xl p-3"
            style={qrContainerStyle}
          >
            <QRCodeSVG
              value={qrUrl}
              size={160}
              level="M"
              includeMargin
              fgColor={qrFgColor}
              bgColor={qrBgColor}
            />
          </div>
          <p className="text-xs text-center" style={{ color: "var(--app-color-text-secondary)" }}>
            扫一扫直接进入个人中心
          </p>
        </div>
      </div>
      <div className="flex justify-center gap-2 py-2">
        <button
          onClick={() => switchTo(0)}
          className="w-2 h-2 rounded-full transition-colors"
          style={{ background: page === 0 ? "var(--app-color-accent)" : "var(--app-color-border-default)" }}
        />
        <button
          onClick={() => switchTo(1)}
          className="w-2 h-2 rounded-full transition-colors"
          style={{ background: page === 1 ? "var(--app-color-accent)" : "var(--app-color-border-default)" }}
        />
      </div>
    </div>
  );
}
