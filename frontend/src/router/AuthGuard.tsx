import { Navigate, Outlet, useLocation } from "react-router-dom";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { isStudentAccount } from "@/features/auth/postLoginNavigation";

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

  // ── 教职工视角门禁：按「是否学生」（id 前缀）判定，学生不进 /console；MEMBER 教职工可进 dashboard（admin 由 AdminAccessGuard 再拦）──
  if (currentPath.startsWith("/console")) {
    if (isStudentAccount()) {
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
