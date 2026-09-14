import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { isStudentAccount } from "@/features/auth/postLoginNavigation";

/**
 * H5 端 SOP 的账号闸门。
 *
 * 账号分两套（学生侧 aro_personnel / 教职工侧 sys_user），同一个人两边都可能有。
 * SOP 只对**教职工侧**开放 —— 判定一律走 postLoginNavigation 的 `isStudentAccount()`，
 * 那是全站唯一的口径（accountSource > role > id 前缀），别在这里另写一套，
 * 否则「教职工切学生视图时 accountSource 仍是 STAFF」这类边界两边会不一致。
 *
 * 前端这道只管入口可见性和直接输 URL 的场景；真正的边界在服务端
 * `/api/admin/sop/**`（读 STAFF 起、写 ADMIN 起）。
 */
export function MobileSopGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  if (!isStudentAccount()) return <>{children}</>;

  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-2 bg-gray-50 px-8 text-center dark:bg-gray-950">
      <ShieldAlert className="size-10 text-gray-300 dark:text-gray-700" />
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">该功能仅对教职工账号开放</p>
      <p className="text-[11px] text-gray-400">请使用教职工账号登录后查看</p>
      <button
        type="button"
        onClick={() => navigate("/m/home", { replace: true })}
        className="mt-2 inline-flex items-center gap-1 rounded-full border border-gray-200 px-4 py-1.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
      >
        <ArrowLeft className="size-3.5" />
        返回
      </button>
    </div>
  );
}

export default MobileSopGuard;
