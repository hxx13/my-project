import { useEffect } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { PortalHeader } from "@/features/portal/PortalHeader";
import { PortalFooter } from "@/features/portal/PortalFooter";
import { PortalLoginModal } from "@/features/portal/PortalLoginModal";
import { DashboardAutoReturnProvider } from "@/features/twin-chrome/DashboardAutoReturnContext";
import { useState } from "react";

export default function PortalLayout({ children }: { children?: ReactNode }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const { pathname } = useLocation();

  // 路由切换时滚回顶部
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    // 「无人操作自动回大屏」也罩住门户：误点摸到门户首页的人等一会儿会被送回去
    <DashboardAutoReturnProvider>
      <div className="min-h-screen bg-white">
        <PortalHeader onOpenLogin={() => setLoginOpen(true)} />
        {children}
        <PortalFooter onRequestLogin={() => setLoginOpen(true)} />
        <PortalLoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>
    </DashboardAutoReturnProvider>
  );
}
