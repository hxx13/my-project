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
    return <Navigate to="/console/dashboard" replace />;
  }
  if (loading) {
    return <div className="p-6 text-sm text-slate-500">权限加载中...</div>;
  }
  if (!canAccessWebPage(nodes, location.pathname, role, "STAFF")) {
    // 兜底回后台首页，而不是把人扔出后台。已经在首页说明首页本身就不够权限，
    // 再指向首页会变成重定向死循环（整页卡白），此时才退回工作台。
    return <Navigate to={location.pathname === "/console/admin" ? "/console/dashboard" : "/console/admin"} replace />;
  }
  return <Outlet />;
}
