import { Navigate, Outlet, useLocation } from "react-router-dom";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

interface AuthGuardProps {
  requireRole?: string;
  children?: React.ReactNode;
}

export default function AuthGuard({ requireRole, children }: AuthGuardProps) {
  const location = useLocation();
  const hasToken = authStorage.hasToken();
  const currentPath = location.pathname;

  if (!hasToken) {
    // 根据当前路由判断应跳哪个登录页
    const loginPath = currentPath.startsWith("/m/") ? "/m/login"
      : currentPath.startsWith("/student/") ? "/student/login"
      : "/";
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }

  // ── 教职工视角门禁：统一按角色判定（role≥STAFF 才可进 /console），不再用 accountSource 区分学生库 ──
  if (currentPath.startsWith("/console")) {
    const role = authStorage.getRole() ?? "MEMBER";
    if (!hasMinRole(role, "STAFF")) {
      return <Navigate to="/student/home" replace />;
    }
  }

  // ── Mirror mode ──
  if (requireRole && authStorage.isMirrorMode()) {
    return <>{children ?? <Outlet />}</>;
  }

  // ── 角色层级（同视角内权限分级）──
  if (requireRole) {
    const role = authStorage.getRole() ?? "MEMBER";
    if (!hasMinRole(role, requireRole)) {
      return <Navigate to="/console/dashboard" replace />;
    }
  }

  return <>{children ?? <Outlet />}</>;
}
