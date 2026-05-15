import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { fetchPublicPagePermissions, type PublicPagePermissionNode } from "@/api/domains/pagePermission.api";
import { canAccessWebPage } from "@/features/auth/pagePermissionAccess";

export default function AdminAccessGuard() {
  const role = authStorage.getRole();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<PublicPagePermissionNode[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await fetchPublicPagePermissions("WEB");
        if (mounted) setNodes(list || []);
      } catch {
        if (mounted) setNodes([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!hasMinRole(role, "STAFF")) {
    return <Navigate to="/" replace />;
  }
  if (loading) {
    return <div className="p-6 text-sm text-slate-500">权限加载中...</div>;
  }
  if (!canAccessWebPage(nodes, location.pathname, role, "STAFF")) {
    return <Navigate to="/admin" replace />;
  }
  return <Outlet />;
}
