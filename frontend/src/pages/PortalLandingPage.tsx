import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { PortalHero } from "@/features/portal/PortalHero";
import { PortalStatsSection } from "@/features/portal/PortalStatsSection";
import { ModelResourceSection } from "@/features/portal/ModelResourceSection";
import { NewsSection } from "@/features/portal/NewsSection";
import { AboutSection } from "@/features/portal/AboutSection";
import { FadeInSection } from "@/components/scroll-reveal";
import { loginCas } from "@/api/domains/auth.api";
import { authStorage } from "@/features/auth/authStorage";
import { resolvePostLoginTarget } from "@/features/auth/postLoginNavigation";

function Divider() {
  return (
    <div className="relative h-0">
      <div className="absolute inset-x-0 top-0 flex items-center justify-center -translate-y-1/2">
        <div className="w-full h-px bg-gradient-to-r from-transparent via-neutral-300 to-transparent" />
        <div className="absolute size-2 rounded-full bg-amber-400/60 ring-4 ring-white" />
      </div>
    </div>
  );
}

export default function PortalLandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [casProcessedRef] = useState({ current: false });

  /* ── 仅首页隐藏主滚动条：挂载打标记、卸载移除，避免全局隐藏 ── */
  useEffect(() => {
    document.documentElement.classList.add("portal-landing-scroll-hidden");
    return () => document.documentElement.classList.remove("portal-landing-scroll-hidden");
  }, []);

  /* ── CAS ticket 回调处理 ── */
  useEffect(() => {
    if (casProcessedRef.current) return;

    const ticketMatch = window.location.href.match(/[?&]ticket=([^&#]+)/);
    const ticket = ticketMatch ? decodeURIComponent(ticketMatch[1]) : null;
    // 也可能由旧 LoginPage 存入 sessionStorage
    const pendingTicket = sessionStorage.getItem("cas_pending_ticket");
    const finalTicket = ticket || pendingTicket;

    if (!finalTicket) return;

    sessionStorage.removeItem("cas_pending_ticket");
    casProcessedRef.current = true;

    // 清理 URL 中的 ticket 参数
    window.history.replaceState(
      null,
      "",
      window.location.href.replace(/[?&]ticket=[^&#]+/, "").replace(/\?$/, "").replace(/#$/, ""),
    );

    // serviceUrl 必须与 CAS 登录入口使用的 service 参数一致
    const serviceUrl =
      sessionStorage.getItem("cas_service_url") || window.location.origin + "/#/";
    sessionStorage.removeItem("cas_service_url");

    (async () => {
      try {
        const data = await loginCas(finalTicket, serviceUrl);
        authStorage.setAuth(data.token, data.role, data.userInfo);

        const isStudent =
          data.userInfo?.accountSource === "STUDENT" ||
          (data.userInfo?.accountSource == null && data.role === "MEMBER");

        if (isStudent) {
          authStorage.markLoginPortal("student");
          navigate("/student/home", { replace: true });
          return;
        }

        authStorage.markLoginPortal("staff");
        toast.success("CAS 登录成功");
        const target = await resolvePostLoginTarget({
          role: data.role,
          pendingTwin: null,
          fromFull: null,
        });
        navigate(target, { replace: true });
      } catch (error) {
        casProcessedRef.current = false;
        toast.error(error instanceof Error ? error.message : "CAS 登录失败，请重试");
      }
    })();
  }, [navigate]);

  /* ── 从其他页面跳回首页时，滚动到指定锚点 ── */
  useEffect(() => {
    const scrollTo = (location.state as { scrollTo?: string } | null)?.scrollTo;
    if (scrollTo) {
      // 等页面渲染完成再滚动
      const timer = setTimeout(() => {
        document.querySelector(scrollTo)?.scrollIntoView({ behavior: "smooth" });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  return (
    <div className="min-h-screen bg-white">
      <PortalHero />
      <Divider />
      <FadeInSection>
        <PortalStatsSection />
      </FadeInSection>
      <Divider />
      <FadeInSection>
        <ModelResourceSection />
      </FadeInSection>
      <Divider />
      <FadeInSection>
        <NewsSection />
      </FadeInSection>
      <Divider />
      <FadeInSection>
        <AboutSection />
      </FadeInSection>
    </div>
  );
}
