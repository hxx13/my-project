import { useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTheme } from "@/features/theme/ThemeProvider";

interface StudentMobileEntryQrProps {
  /** 二维码边长（px） */
  size?: number;
}

/**
 * 学生手机端入口二维码 —— 与首页左下角 DashboardQrCarousel 同款。
 *
 * 固定指向登录页，不携带人员 token；各行人员扫码后自行登录看当前状态。
 */
export function StudentMobileEntryQr({ size = 160 }: StudentMobileEntryQrProps) {
  const { theme } = useTheme();
  const isDark = theme.mode === "dark";

  const qrFgColor = isDark ? "#e2e2ea" : "#1e1e2a";
  const qrContainerStyle = useMemo(
    () => ({
      background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
      border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.08)",
    }),
    [isDark],
  );

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <p className="text-sm font-bold" style={{ color: "var(--app-color-text-primary)" }}>
        学生手机端入口
      </p>
      <div className="rounded-xl p-3" style={qrContainerStyle}>
        <QRCodeSVG
          value={`${window.location.origin}/#/m/login`}
          size={size}
          level="M"
          includeMargin
          fgColor={qrFgColor}
          bgColor="transparent"
        />
      </div>
      <p className="text-xs text-center" style={{ color: "var(--app-color-text-secondary)" }}>
        扫一扫直接进入个人中心
      </p>
    </div>
  );
}
