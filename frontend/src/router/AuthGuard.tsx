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

  // ── 学生库账号不能进教职工视角 ──
  if (currentPath.startsWith("/console")) {
    const source = authStorage.getUserInfo()?.accountSource;
    const role = authStorage.getRole() ?? "MEMBER";
    // 明确标记为学生库 → 拦截；来源不明时按角色兜底
    const isStudentLike = source === "STUDENT"
      || (source == null && !hasMinRole(role, "STAFF"));
    if (isStudentLike) {
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
