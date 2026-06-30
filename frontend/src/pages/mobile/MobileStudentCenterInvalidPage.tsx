/** 手机版学生中心 — 链接缺少 token 或 token 无效时的占位页（禁止回落到教职工 dashboard） */
import { WifiOff } from "lucide-react";

const PAGE_BG = "#eef0f6";
const BRAND = "#ac1736";

export default function MobileStudentCenterInvalidPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 p-6"
      style={{ background: PAGE_BG }}
    >
      <WifiOff className="size-12" style={{ color: "#c8c9cc" }} />
      <h1 className="text-base font-semibold text-center" style={{ color: "#323233" }}>
        学生中心链接无效
      </h1>
      <p className="text-sm text-center max-w-xs leading-relaxed" style={{ color: "#969799" }}>
        链接不完整或访问口令已缺失。请重新扫码，或向管理员索取完整的手机版学生中心链接。
      </p>
      <p className="text-[11px] text-center max-w-xs" style={{ color: "#c8c9cc" }}>
        正确格式示例：…/#/m/sc/您的访问口令
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="px-6 py-2.5 rounded-full text-white text-sm font-medium active:scale-95"
        style={{ background: `linear-gradient(135deg, ${BRAND}, #8B1229)` }}
      >
        重新加载
      </button>
    </div>
  );
}
