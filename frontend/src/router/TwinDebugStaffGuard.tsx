import { Navigate, Outlet } from "react-router-dom";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

/** 流水线 / 档案库等 Twin 调试页仅员工及以上；学生仅大屏与登录相关入口 */
export default function TwinDebugStaffGuard() {
  const role = authStorage.getRole() || "STUDENT";
  if (!hasMinRole(role, "STAFF")) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
