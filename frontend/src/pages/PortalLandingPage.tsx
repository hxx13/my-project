import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { PortalHero } from "@/features/portal/PortalHero";
import { PortalStatsSection } from "@/features/portal/PortalStatsSection";
import { ModelResourceSection } from "@/features/portal/ModelResourceSection";
import { NewsSection } from "@/features/portal/NewsSection";
import { AboutSection } from "@/features/portal/AboutSection";
import { FadeInSection } from "@/components/scroll-reveal";
import { loginOAuth } from "@/api/domains/auth.api";
import { authStorage } from "@/features/auth/authStorage";
import { resolvePostLoginTarget } from "@/features/auth/postLoginNavigation";
import {
  clearOAuthQueryFromUrl,
  consumeIamOAuthCallback,
  getIamOAuthPublicConfig,
  redactOAuthSecretsInText,
  validateAndClearIamState,
} from "@/features/auth/iamOAuth";

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
  const [oauthProcessedRef] = useState({ current: false });

  /* ── 仅首页隐藏主滚动条：挂载打标记、卸载移除，避免全局隐藏 ── */
  useEffect(() => {
    document.documentElement.classList.add("portal-landing-scroll-hidden");
    return () => document.documentElement.classList.remove("portal-landing-scroll-hidden");
  }, []);

  /* ── IAM OAuth 回调：根路径 ?code=&state=（Hash 外）；URL 已在 main 中 early-strip ── */
  useEffect(() => {
    if (oauthProcessedRef.current) return;

    const cb = consumeIamOAuthCallback();
    if (!cb) return;

    oauthProcessedRef.current = true;
    // 成功换票前/失败收尾都保证地址栏无 code（early-strip 后再清一次）
    clearOAuthQueryFromUrl();

    if (cb.kind === "error") {
      oauthProcessedRef.current = false;
      const detail = cb.errorDescription ? `：${cb.errorDescription}` : "";
      toast.error(redactOAuthSecretsInText(`统一认证已取消或失败（${cb.error}${detail}）`));
      return;
    }

    const stateErr = validateAndClearIamState(cb.state);
    if (stateErr) {
      oauthProcessedRef.current = false;
      toast.error(stateErr);
      return;
    }

    const { redirectUri } = getIamOAuthPublicConfig();

    (async () => {
      try {
        const data = await loginOAuth(cb.code, cb.state, redirectUri);
        authStorage.setAuth(data.token, data.role, data.userInfo);
        clearOAuthQueryFromUrl();

        const isStudent =
          data.userInfo?.accountSource === "STUDENT" ||
          (data.userInfo?.accountSource == null && data.role === "MEMBER");

        if (isStudent) {
          authStorage.markLoginPortal("student");
          navigate("/student/home", { replace: true });
          return;
        }

        authStorage.markLoginPortal("staff");
        toast.success("统一认证登录成功");
        const target = await resolvePostLoginTarget({
          role: data.role,
          pendingTwin: null,
          fromFull: null,
        });
        navigate(target, { replace: true });
      } catch (error) {
        clearOAuthQueryFromUrl();
        oauthProcessedRef.current = false;
        const raw = error instanceof Error ? error.message : "统一认证登录失败，请重试";
        toast.error(redactOAuthSecretsInText(raw));
      }
    })();
  }, [navigate]);

  /* ── 从其他页面跳回首页时，滚动到指定锚点 ── */
  useEffect(() => {
    const scrollTo = (location.state as { scrollTo?: string } | null)?.scrollTo;
    if (scrollTo) {
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
