import { Navigate, Outlet } from "react-router-dom";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

export default function AdminGuard() {
  const role = authStorage.getRole();
  if (!hasMinRole(role, "ADMIN")) {
    return <Navigate to="/admin" replace />;
  }
  return <Outlet />;
}
