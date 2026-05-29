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

  if (!hasToken) {
    const loginPath = "/login";
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }

  if (requireRole) {
    const role = authStorage.getRole() ?? "STUDENT";
    if (!hasMinRole(role, requireRole)) {
      const target = role === "STUDENT" ? "/student/home" : "/admin";
      return <Navigate to={target} replace />;
    }
  }

  return <>{children ?? <Outlet />}</>;
}
