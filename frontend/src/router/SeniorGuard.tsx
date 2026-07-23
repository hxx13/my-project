import { Navigate, Outlet } from "react-router-dom";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

export default function SeniorGuard() {
  const role = authStorage.getRole();
  if (!hasMinRole(role, "SENIOR")) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
