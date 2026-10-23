/** 旧直链地址已停用 —— 统一提示重新获取免登录码 */
import { Link } from "react-router-dom";
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
        入口已升级
      </h1>
      <p className="text-sm text-center max-w-xs leading-relaxed" style={{ color: "#969799" }}>
        旧的个人链接已停用。请向管理员重新获取免登录二维码，扫码即可直接进入手机端。
      </p>
      <Link
        to="/m/login"
        className="px-6 py-2.5 rounded-full text-white text-sm font-medium active:scale-95"
        style={{ background: `linear-gradient(135deg, ${BRAND}, #8B1229)` }}
      >
        去登录页
      </Link>
    </div>
  );
}
