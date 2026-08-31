import { Outlet, Navigate } from "react-router-dom";
import { PortalHeader } from "@/features/portal/PortalHeader";
import { authStorage } from "@/features/auth/authStorage";

/** 「我的团队」独立壳：登录即可见，无侧栏，团队页自渲染 aup-wb 布局。 */
export default function NhpTeamShell() {
  if (!authStorage.hasToken()) return <Navigate to="/" replace />;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f5f3f0" }}>
      <PortalHeader onOpenLogin={() => {}} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Outlet />
      </div>
    </div>
  );
}
