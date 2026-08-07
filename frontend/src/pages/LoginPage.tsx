import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ChevronLeft, ChevronRight, LogIn, X, ChevronDown, LogOut } from "lucide-react";
import { SHSMU_LOGO_URL } from "@/constants/shsmuBranding";
import { fetchLoginBranding, pickLoginHeroUrls, type LoginBranding } from "@/api/domains/publicSite.api";
import { PortalHero } from "@/features/portal/PortalHero";
import { fetchPublicRuntimeConfig } from "@/api/domains/notification.api";
import { useTheme } from "@/features/theme/ThemeProvider";
import { ThemeSwitcher } from "@/features/theme/ThemeSwitcher";
import { loginWeb, loginCas, forgotPasswordVerify, forgotPasswordReset, forgotPasswordDecodeQr, sendVerificationCode, forgotPasswordByEmailVerify, forgotPasswordByEmailReset } from "@/api/domains/auth.api";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}
import { authStorage, AUTH_USERINFO_UPDATED_EVENT } from "@/features/auth/authStorage";
import { resolvePostLoginTarget } from "@/features/auth/postLoginNavigation";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ForgotPasswordPanel from "@/components/shared/ForgotPasswordPanel";
import "./loginPortalLayout.css";

const SJTU_ORIGIN = "https://130.sjtu.edu.cn";

/** 与 130.sjtu.edu.cn loading-page 同源资源（进入按钮两侧箭头） */
const SJTU_ASSETS = {
  arrowLeft: `${SJTU_ORIGIN}/assets/images/icon-arrow-left.svg`,
  arrowRight: `${SJTU_ORIGIN}/assets/images/icon-arrow-right.svg`,
} as const;

function loginPortalWowDelay(delay: string): CSSProperties {
  return { "--login-wow-delay": delay } as CSSProperties;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { effectiveMode } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [assetBroken, setAssetBroken] = useState<Record<string, boolean>>({});
  const [branding, setBranding] = useState<LoginBranding | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const casProcessedRef = useRef(false);
  const [sessionUser, setSessionUser] = useState(() => authStorage.getUserInfo());
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  // Forgot password state
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotUserId, setForgotUserId] = useState("");
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotVerified, setForgotVerified] = useState(false);
  const [forgotExistingUsername, setForgotExistingUsername] = useState("");
  const [forgotNewUsername, setForgotNewUsername] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotPersonnelName, setForgotPersonnelName] = useState("");
  const [forgotVerifying, setForgotVerifying] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);

  // Forgot password — method selection
  const [forgotMethod, setForgotMethod] = useState<"qr" | "email" | null>(null);

  // Forgot password — email flow state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotEmailCode, setForgotEmailCode] = useState("");
  const [forgotEmailSending, setForgotEmailSending] = useState(false);
  const [forgotEmailVerifying, setForgotEmailVerifying] = useState(false);
  const [forgotEmailCooldown, setForgotEmailCooldown] = useState(0);
  const [forgotEmailStep, setForgotEmailStep] = useState<"email" | "code" | "reset">("email");
  const [forgotEmailResetToken, setForgotEmailResetToken] = useState("");
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => { if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current); };
  }, []);

  // 支持从其他页面跳转 /login?forgot=1 自动打开忘记密码面板
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("forgot") === "1") {
      setShowLogin(true);
      setForgotMode(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Turnstile — 同时读取 enabled 开关和 site-key，缺一不可
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showLogin) return;
    fetchPublicRuntimeConfig()
      .then((cfg) => {
        setTurnstileSiteKey(cfg["turnstile.site-key"] || "");
        setTurnstileEnabled(cfg["turnstile.enabled"] === "true");
      })
      .catch(() => setTurnstileSiteKey(""));
  }, [showLogin]);
  const [qrDecoded, setQrDecoded] = useState(false);
  const forgotQrRef = useRef<HTMLInputElement>(null);

  const syncUserFromStorage = useCallback(() => {
    setSessionUser(authStorage.getUserInfo());
  }, []);

  useEffect(() => {
    syncUserFromStorage();
    const onUser = () => syncUserFromStorage();
    window.addEventListener(AUTH_USERINFO_UPDATED_EVENT, onUser);
    return () => window.removeEventListener(AUTH_USERINFO_UPDATED_EVENT, onUser);
  }, [syncUserFromStorage]);

  /** 对齐门户 body.home-page：不锁死纵向滚动（本页仍 min-h 100dvh） */
  useEffect(() => {
    const prev = document.body.style.overflowY;
    document.body.style.overflowY = "unset";
    return () => {
      document.body.style.overflowY = prev;
    };
  }, []);

  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    if (showLogin) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = prevHtml || "";
      document.body.style.overflow = prevBody || "";
    }
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [showLogin]);

  useEffect(() => {
    if (!showLogin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowLogin(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showLogin]);

  // 立即从缓存恢复 branding，避免每次刷新都等 API 导致闪烁
  const BRANDING_CACHE_KEY = "aro_login_branding_v1";
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(BRANDING_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as LoginBranding;
        if (parsed && (parsed.heroImageUrls?.length || parsed.heroImageUrlsLight?.length)) {
          setBranding(parsed);
        }
      }
    } catch { /* ignore */ }

    let cancelled = false;
    (async () => {
      try {
        const b = await fetchLoginBranding();
        if (!cancelled) {
          setBranding(b);
          try { sessionStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(b)); } catch { /* ignore */ }
        }
      } catch {
        if (!cancelled) {
          setBranding({ heroImageUrls: [], intervalSec: 8, heroCarouselEnabled: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const heroUrls = useMemo(
    () => pickLoginHeroUrls(branding, effectiveMode),
    [branding, effectiveMode],
  );
  const heroUrlKey = useMemo(() => heroUrls.join("\0"), [heroUrls]);

  const heroCarouselOn = branding?.heroCarouselEnabled !== false && heroUrls.length > 0;

  // Turnstile widget: 登录抽屉打开 + 非忘记密码模式时渲染
  const [turnstileLoadFailed, setTurnstileLoadFailed] = useState(false);
  const [turnstileLoading, setTurnstileLoading] = useState(false);
  const turnstilePollCount = useRef(0);

  useEffect(() => {
    if (!showLogin || forgotMode || !turnstileSiteKey || !turnstileEnabled) return;
    const container = turnstileContainerRef.current;
    if (!container) return;

    turnstilePollCount.current = 0;
    setTurnstileLoadFailed(false);
    setTurnstileLoading(true);
    let cancelled = false;

    const tryRender = () => {
      if (cancelled) return;
      if (!window.turnstile) {
        turnstilePollCount.current++;
        if (turnstilePollCount.current > 12) { // ~3.6 秒超时（Cloudflare CDN 在国内慢）
          console.warn("Turnstile CDN 加载超时，降级跳过");
          setTurnstileLoadFailed(true);
          setTurnstileLoading(false);
          return;
        }
        setTimeout(tryRender, 300);
        return;
      }
      try {
        if (turnstileWidgetId.current) {
          try { window.turnstile.remove(turnstileWidgetId.current); } catch { /* already removed */ }
        }
        // Use a dedicated child div so Turnstile owns its own DOM subtree
        let widgetDiv = container.querySelector('.turnstile-widget') as HTMLDivElement;
        if (!widgetDiv) {
          widgetDiv = document.createElement('div');
          widgetDiv.className = 'turnstile-widget';
          container.appendChild(widgetDiv);
        }
        turnstileWidgetId.current = window.turnstile.render(widgetDiv, {
          sitekey: turnstileSiteKey,
          theme: effectiveMode === "dark" ? "dark" : "light",
          size: "normal",
          callback: (token: string) => { setTurnstileToken(token); setTurnstileLoading(false); },
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => { setTurnstileToken(""); setTurnstileLoadFailed(true); setTurnstileLoading(false); },
        });
        setTurnstileLoading(false);
      } catch {
        setTurnstileLoadFailed(true);
        setTurnstileLoading(false);
      }
    };

    const timer = setTimeout(tryRender, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (turnstileWidgetId.current) {
        try { window.turnstile?.remove(turnstileWidgetId.current); } catch { /* ignore */ }
        turnstileWidgetId.current = null;
      }
      // Remove Turnstile's child div so React can cleanly reconcile the container
      const widgetDiv = container?.querySelector('.turnstile-widget');
      if (widgetDiv) widgetDiv.remove();
      setTurnstileToken("");
      setTurnstileLoadFailed(false);
      setTurnstileLoading(false);
    };
  }, [showLogin, forgotMode, effectiveMode, turnstileSiteKey, turnstileEnabled]);

  // CAS ticket auto-extraction — serviceValidate works for any domain
  useEffect(() => {
    if (casProcessedRef.current) return;
    // Try URL first, then sessionStorage (preserved from RootEntryRedirect)
    let ticketMatch = window.location.href.match(/[?&]ticket=([^&#]+)/);
    let ticket = ticketMatch ? decodeURIComponent(ticketMatch[1]) : null;
    if (!ticket) {
      ticket = sessionStorage.getItem('cas_pending_ticket');
    }
    if (!ticket) return;
    sessionStorage.removeItem('cas_pending_ticket');
    casProcessedRef.current = true;

    // Clean ticket from URL immediately
    window.history.replaceState(null, "", window.location.href.replace(/[?&]ticket=[^&#]+/, "").replace(/\?$/, "").replace(/#$/, ""));

    (async () => {
      try {
        const data = await loginCas(ticket, window.location.origin);
        authStorage.setAuth(data.token, data.role, data.userInfo);
        const isStudent = data.userInfo?.accountSource === "STUDENT" || (data.userInfo?.accountSource == null && data.role === "MEMBER");
        if (isStudent) {
          authStorage.markLoginPortal("student");
          setShowLogin(false);
          navigate("/", { replace: true });
          return;
        }
        authStorage.markLoginPortal("staff");
        toast.success("CAS 登录成功");
        setShowLogin(false);
        syncUserFromStorage();
        const st = location.state as any;
        const from = st?.from?.pathname;
        const fromFull = from && from !== "/login" ? `${from}${st?.from?.search || ""}${st?.from?.hash || ""}` : null;
        const target = await resolvePostLoginTarget({ role: data.role, pendingTwin: null, fromFull });
        navigate(target, { replace: true });
      } catch (error) {
        casProcessedRef.current = false;
        toast.error(error instanceof Error ? error.message : "CAS 登录失败，请重试");
      }
    })();
  }, []);

  const headerPrimaryLabel = useMemo(() => {
    const dn = (sessionUser?.displayName || "").trim();
    if (dn) return dn;
    const nick = (sessionUser?.displayNickname || "").trim();
    if (nick) return nick;
    const un = (sessionUser?.username || "").trim();
    if (un) return un;
    return "—";
  }, [sessionUser]);

  const headerUsername = (sessionUser?.username || "").trim();
  const avatarLetter = (headerPrimaryLabel !== "—" ? headerPrimaryLabel : sessionUser?.username || "?").slice(0, 1).toUpperCase();
  const hasSession = Boolean(authStorage.hasToken());

  const doLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      toast.error("请输入账号和密码");
      return;
    }
    try {
      setSubmitting(true);
      // Turnstile 未配置时允许空 token 降级登录
      const data = await loginWeb(username.trim(), password, turnstileToken || undefined, turnstileLoadFailed);
      authStorage.setAuth(data.token, data.role, data.userInfo);

      // 学生库账号（或 MEMBER 角色）不能进入教职工视角 → 自动跳转学生中心
      const isStudentAccount = data.userInfo?.accountSource === "STUDENT"
        || (data.userInfo?.accountSource == null && data.role === "MEMBER");
      if (isStudentAccount) {
        authStorage.markLoginPortal("student");
        setShowLogin(false);
        setUsername("");
        setPassword("");
        navigate("/", { replace: true });
        return;
      }

      authStorage.markLoginPortal("staff");
      toast.success("登录成功");
      setShowLogin(false);
      setUsername("");
      setPassword("");
      syncUserFromStorage();
    } catch (error) {
      const message = error instanceof Error ? error.message : "登录失败";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [username, password, turnstileToken, turnstileLoadFailed, syncUserFromStorage]);

  const openLoginPanel = useCallback(() => {
    setShowLogin(true);
  }, []);

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrUploading(true);
    try {
      const result = await forgotPasswordDecodeQr(file);
      setForgotUserId(result.userId);
      setForgotPersonnelName(result.name || "");
      setQrDecoded(true);
      toast.success("二维码识别成功");
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "二维码识别失败";
      toast.error(msg);
    } finally {
      setQrUploading(false);
    }
  };

  const handleForgotVerify = async () => {
    if (!forgotUserId.trim() || !forgotPhone.trim()) {
      toast.error("请输入用户ID和手机号");
      return;
    }
    setForgotVerifying(true);
    try {
      const result = await forgotPasswordVerify(forgotUserId.trim(), forgotPhone.trim());
      if (result.verified) {
        setForgotVerified(true);
        setForgotExistingUsername(result.username);
        setForgotNewUsername(result.username);
        setForgotPersonnelName(result.name);
        toast.success("验证通过");
      } else {
        toast.error(result.message || "验证失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "验证请求失败");
    } finally {
      setForgotVerifying(false);
    }
  };

  const handleForgotReset = async () => {
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      toast.error("密码至少6位");
      return;
    }
    setForgotSubmitting(true);
    try {
      const newUsername =
        forgotNewUsername.trim() !== forgotExistingUsername
          ? forgotNewUsername.trim()
          : undefined;
      await forgotPasswordReset(forgotUserId.trim(), forgotNewPassword, newUsername);
      toast.success("密码重置成功，请返回登录");
      setForgotMode(false);
      setForgotVerified(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置失败");
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleSendCode = async () => {
    if (!forgotEmail.trim()) { toast.error("请输入邮箱地址"); return; }
    setForgotEmailSending(true);
    try {
      const result = await sendVerificationCode(forgotEmail.trim(), "FORGOT_PASSWORD");
      toast.success(result.message || "验证码已发送");
      setForgotEmailCooldown(result.cooldownSeconds || 60);
      setForgotEmailStep("code");
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = setInterval(() => {
        setForgotEmailCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownTimerRef.current) { clearInterval(cooldownTimerRef.current); cooldownTimerRef.current = null; }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      toast.error(err?.message || "发送失败");
    } finally {
      setForgotEmailSending(false);
    }
  };

  const handleEmailVerify = async () => {
    if (!forgotEmailCode.trim() || forgotEmailCode.length !== 6) {
      toast.error("请输入6位验证码"); return;
    }
    setForgotEmailVerifying(true);
    try {
      const result = await forgotPasswordByEmailVerify(forgotEmail.trim(), forgotEmailCode);
      setForgotEmailResetToken(result.resetToken);
      setForgotEmailStep("reset");
      toast.success("验证通过");
    } catch (err: any) {
      toast.error(err?.message || "验证失败");
    } finally {
      setForgotEmailVerifying(false);
    }
  };

  const handleEmailReset = async () => {
    if (!forgotNewPassword || forgotNewPassword.length < 8) {
      toast.error("密码至少8位，需含大小写字母、数字、特殊符号中至少三类"); return;
    }
    setForgotSubmitting(true);
    try {
      await forgotPasswordByEmailReset(forgotEmailResetToken, forgotNewPassword);
      toast.success("密码重置成功，请返回登录");
      resetForgotState();
    } catch (err: any) {
      toast.error(err?.message || "重置失败");
    } finally {
      setForgotSubmitting(false);
    }
  };

  const backToForgotMethodSelection = () => {
    setForgotMethod(null);
    setForgotVerified(false);
    setForgotUserId(""); setForgotPhone("");
    setForgotPersonnelName(""); setQrDecoded(false);
    setForgotExistingUsername(""); setForgotNewUsername(""); setForgotNewPassword("");
    setForgotEmail(""); setForgotEmailCode("");
    setForgotEmailSending(false); setForgotEmailCooldown(0);
    setForgotEmailStep("email"); setForgotEmailResetToken("");
    if (cooldownTimerRef.current) { clearInterval(cooldownTimerRef.current); cooldownTimerRef.current = null; }
  };

  const resetForgotState = () => {
    setForgotMode(false);
    backToForgotMethodSelection();
  };

  const enterSite = useCallback(async () => {
    if (!authStorage.hasToken()) {
      toast.error("请先登录");
      setShowLogin(true);
      return;
    }
    const st = location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null;
    const from = st?.from?.pathname;
    const fromFull =
      from && from !== "/login" ? `${from}${st?.from?.search || ""}${st?.from?.hash || ""}` : null;
    const r = authStorage.getRole() || "";
    try {
      const to = await resolvePostLoginTarget({
        role: r,
        pendingTwin: null,
        fromFull,
      });
      navigate(to, { replace: true });
    } catch {
      toast.error("无法解析跳转地址");
    }
  }, [navigate, location.state]);

  return (
    <div className="login-home-page fnt18">
      <PortalHero height="100vh" />

      {/* 对应原站 a.logo：本系统为医学院 logo */}
      <Link
        to="/"
        className="login-sjtu-logo login-portal-wow--fadeInLeft"
        style={loginPortalWowDelay("0.2s")}
      >
        {!assetBroken.shsmuLogo ? (
          <img
            src={SHSMU_LOGO_URL}
            alt="上海医学院"
            onError={() => setAssetBroken((p) => ({ ...p, shsmuLogo: true }))}
          />
        ) : (
          <span className="block text-xs font-semibold tracking-wide text-white/90">上海医学院</span>
        )}
      </Link>

      {/* 对应原站右上语言位：本系统为登录 / 头像 */}
      <div className="login-home-page__topright">
        <div className="login-topright-module login-portal-wow--fadeIn shrink-0 sm:gap-3" style={loginPortalWowDelay("0.35s")}>
          {hasSession ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex max-w-[min(78vw,22rem)] min-w-0 items-center gap-2 rounded-full border-0 bg-transparent py-0.5 pl-0.5 pr-0.5 text-left text-[#f8efd9] shadow-none outline-none ring-0 transition hover:text-white focus-visible:ring-2 focus-visible:ring-[#f5d76a]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                  aria-label="账号与退出"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#c9a227]/25 text-sm font-semibold text-[#fdf6e9] ring-1 ring-[#c9a227]/45"
                    aria-hidden
                  >
                    {avatarLetter}
                  </span>
                  <span className="min-w-0 flex-col text-left">
                    <span className="block truncate text-sm font-medium text-[#fdf6e9] drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">
                      {headerPrimaryLabel}
                    </span>
                    {headerUsername ? (
                      <span className="block truncate text-[11px] text-[#d4c4a8]/95 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">
                        @{headerUsername}
                      </span>
                    ) : null}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-[#c9a227]/85" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-44 border border-white/15 bg-[#2a0608]/96 p-1 text-[#f8efd9] shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
              >
                <DropdownMenuItem
                  className="cursor-pointer text-red-300 focus:bg-red-950/50 focus:text-red-200"
                  onSelect={() => setLogoutDialogOpen(true)}
                >
                  <LogOut className="mr-2 h-4 w-4 opacity-90" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              onClick={openLoginPanel}
              className="inline-flex items-center gap-2 rounded-full border border-[#f5d76a]/40 bg-transparent px-3.5 py-1.5 text-sm font-medium text-[#f3e9d8] shadow-none transition hover:border-[#fde68a]/65 hover:bg-white/[0.06]"
            >
              <LogIn className="h-4 w-4 text-[#e8c547]" aria-hidden />
              登录
            </button>
          )}
          <ThemeSwitcher className="rounded-full border border-[#f5d76a]/35 bg-black/20 px-2.5 py-1 text-[#f3e9d8] hover:bg-black/35 hover:text-white" />
        </div>
      </div>

      {/* 对应 .loading-page：theme-container（已去掉底栏 bg-foot、光效 max_light 与年份横滚） */}
      <div className={cn("login-loading-page loading-page", heroCarouselOn && "login-loading-page--under-hero")}>
        <div className="login-theme-container theme-container">
          {/* 进入按钮：视口水平居中 */}
          <div className="login-theme-enter-wrap">
            <div className="login-more more login-portal-wow--fadeInUp" style={loginPortalWowDelay("1.2s")}>
              <button type="button" className="login-more-btn more-btn" onClick={() => void enterSite()}>
                {!assetBroken.arrowL2 ? (
                  <img
                    src={SJTU_ASSETS.arrowLeft}
                    alt=""
                    onError={() => setAssetBroken((p) => ({ ...p, arrowL2: true }))}
                  />
                ) : (
                  <ChevronLeft className="login-more-btn__icon shrink-0 text-[#e8c547]" aria-hidden />
                )}
                <span>
                  <span style={{ color: "#f5d76a" }}>进入</span>  ·  实验动物科学部  ·  <span style={{ color: "#f5d76a" }}>数字孪生网站</span>
                </span>
                {!assetBroken.arrowR2 ? (
                  <img
                    src={SJTU_ASSETS.arrowRight}
                    alt=""
                    onError={() => setAssetBroken((p) => ({ ...p, arrowR2: true }))}
                  />
                ) : (
                  <ChevronRight className="login-more-btn__icon shrink-0 text-[#e8c547]" aria-hidden />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showLogin ? (
        <>
          {/* 遮罩层：覆盖全视口包括顶部 logo/头像区域 */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-[var(--z-overlay)] bg-black/60"
            onClick={() => setShowLogin(false)}
          />
          <aside
            className="fixed right-0 top-0 z-[var(--z-modal)] flex h-full w-full max-w-md flex-col border-l border-[#c9a227]/25 bg-[#050a14]/97 shadow-[-12px_0_48px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-drawer-title"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 id="login-drawer-title" className="text-lg font-semibold tracking-tight text-[#f3e9d8]">
                Web 管理登录
              </h2>
              <button
                type="button"
                onClick={() => setShowLogin(false)}
                className="rounded-lg p-2 text-[#d4c4a8] transition hover:bg-white/10 hover:text-white"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
              {forgotMode ? (
                <ForgotPasswordPanel
                  theme="drawer"
                  onBackToLogin={() => setForgotMode(false)}
                  onResetSuccess={() => setForgotMode(false)}
                />
              ) : (
                <>
                  <p className="mb-6 text-sm leading-relaxed text-[#b8a88c]">
                    请输入账号与密码。浏览器可能自动填入凭据，仍需点击「登录」确认。
                  </p>
                  <form className="space-y-5" onSubmit={(e) => e.preventDefault()} autoComplete="off">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#e8dcc4]" htmlFor="login-username">
                        账号
                      </label>
                      <input
                        id="login-username"
                        type="text"
                        name="aro_login_username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            passwordRef.current?.focus();
                          }
                        }}
                        className="admin-login-input w-full border border-[#f5d76a]/30 bg-black/35 px-4 py-3 text-sm text-[#f8efd9] placeholder:text-[#b8a89a]"
                        placeholder="账号/邮箱"
                        autoComplete="username"
                        spellCheck={false}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#e8dcc4]" htmlFor="login-password">
                        密码
                      </label>
                      <input
                        ref={passwordRef}
                        id="login-password"
                        type="password"
                        name="aro_login_password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void doLogin();
                          }
                        }}
                        className="admin-login-input w-full border border-[#f5d76a]/30 bg-black/35 px-4 py-3 text-sm text-[#f8efd9] placeholder:text-[#b8a89a]"
                        placeholder="请输入密码"
                        autoComplete="current-password"
                      />
                    </div>
                    <div ref={turnstileContainerRef} className="flex min-h-[65px] items-center justify-center">
                      {turnstileLoading && !turnstileLoadFailed && (
                        <div className="flex flex-col items-center gap-1">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#f5d76a]/40 border-t-[#f5d76a]" />
                          <p className="text-xs text-[#b8a88c]">人机验证加载中…</p>
                          <button
                            type="button"
                            onClick={() => { setTurnstileLoadFailed(true); setTurnstileLoading(false); }}
                            className="text-xs text-[#e8c547] hover:text-[#f5e6a8] underline mt-1"
                          >
                            跳过验证
                          </button>
                        </div>
                      )}
                      {turnstileLoadFailed && !turnstileLoading && (
                        <p className="text-xs text-amber-400/80">已跳过人机验证</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={submitting || (turnstileEnabled && !!turnstileSiteKey && !turnstileToken && !turnstileLoadFailed)}
                      onClick={() => void doLogin()}
                      className="admin-login-button-primary w-full border border-[#b8860b]/50 bg-gradient-to-r from-[#8b4513]/90 to-[#c9a227]/90 py-3 text-sm font-semibold text-[#1a0a06] shadow-md hover:from-[#a0522d] hover:to-[#e8c547] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? "登录中…" : "登 录"}
                    </button>
                  </form>
                  <div className="mt-6 border-t border-[#f5d76a]/20 pt-5">
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = `https://auth2.shsmu.edu.cn/cas/login?service=${encodeURIComponent(window.location.origin)}`;
                      }}
                      className="w-full rounded border border-[#f5d76a]/40 bg-transparent px-4 py-3 text-sm font-medium text-[#e8c547] transition hover:border-[#f5d76a]/70 hover:bg-[#f5d76a]/10"
                    >
                      统一认证登录
                    </button>
                  </div>
                  <p className="mt-8 text-center text-sm text-[#9a8b72]">
                    教职工首次使用？
                    <Link to="/register" className="ml-1 font-medium text-[#e8c547] hover:text-[#f5e6a8]">
                      去注册
                    </Link>
                  </p>
                  <p className="mt-3 text-center text-sm text-[#9a8b72]">
                    学生首次使用？
                    <Link to="/student/register" className="ml-1 font-medium text-[#e8c547] hover:text-[#f5e6a8]">
                      去注册
                    </Link>
                  </p>
                  <p className="mt-3 text-center text-sm text-[#9a8b72]">
                    <button
                      type="button"
                      onClick={() => setForgotMode(true)}
                      className="font-medium text-[#e8c547] hover:text-[#f5e6a8]"
                    >
                      忘记密码？
                    </button>
                  </p>
                </>
              )}
            </div>
          </aside>
        </>
      ) : null}

      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent className="z-[var(--z-modal)] border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-sm" overlayClassName="top-0">
          <DialogHeader>
            <DialogTitle>退出登录</DialogTitle>
            <DialogDescription>确定要退出当前账号吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-4 py-2 text-sm text-[var(--app-color-text-primary)] transition-colors hover:bg-[var(--app-color-surface-hover)]"
              onClick={() => setLogoutDialogOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-[var(--app-radius-element)] bg-[var(--app-color-feedback-danger)] px-4 py-2 text-sm text-[var(--app-color-text-inverse)] transition-colors hover:bg-[var(--app-color-feedback-danger)]/85"
              onClick={() => {
                authStorage.clear();
                toast.success("已退出登录");
                setLogoutDialogOpen(false);
                syncUserFromStorage();
              }}
            >
              退出登录
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
