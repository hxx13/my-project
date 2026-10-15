import { Navigate, Outlet } from "react-router-dom";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

export default function SuperAdminGuard() {
  const role = authStorage.getRole();
  if (!hasMinRole(role, "SUPER_ADMIN")) {
    // 兜底回后台首页，而不是把人扔出后台
    return <Navigate to="/console/admin" replace />;
  }
  return <Outlet />;
}
