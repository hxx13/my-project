import { useEffect, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

export default function SuperAdminGuard() {
  const role = authStorage.getRole();
  const navigate = useNavigate();
  const blocked = useRef(false);

  useEffect(() => {
    if (!hasMinRole(role, "SUPER_ADMIN") && !blocked.current) {
      blocked.current = true;
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate("/console/admin", { replace: true });
      }
    }
  }, [role, navigate]);

  if (!hasMinRole(role, "SUPER_ADMIN")) return null;
  return <Outlet />;
}
