import { Navigate, Outlet, useLocation } from "react-router-dom";
import { authStorage } from "@/features/auth/authStorage";

export default function AuthGuard() {
  const location = useLocation();
  const hasToken = authStorage.hasToken();

  if (!hasToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
