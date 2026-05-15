import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ChevronLeft, ChevronRight, LogIn, X, ChevronDown, LogOut } from "lucide-react";
import { SHSMU_LOGO_URL } from "@/constants/shsmuBranding";
import { fetchLoginBranding, type LoginBranding } from "@/api/domains/publicSite.api";
import { loginWeb } from "@/api/domains/auth.api";
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
import "./loginPortalLayout.css";

const SJTU_ORIGIN = "https://130.sjtu.edu.cn";

/** 与 130.sjtu.edu.cn loading-page 同源资源（进入按钮两侧箭头） */
const SJTU_ASSETS = {
  arrowLeft: `${SJTU_ORIGIN}/assets/images/icon-arrow-left.svg`,
  arrowRight: `${SJTU_ORIGIN}/assets/images/icon-arrow-right.svg`,
} as const;

/** 轮播关闭时叠层/底色（门户为深蓝，本系统为中国红） */
const LOGIN_PAGE_RED = "#a30000";

function loginPortalWowDelay(delay: string): CSSProperties {
  return { "--login-wow-delay": delay } as CSSProperties;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [assetBroken, setAssetBroken] = useState<Record<string, boolean>>({});
  const [branding, setBranding] = useState<LoginBranding | null>(null);
  const [heroIdx, setHeroIdx] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [sessionUser, setSessionUser] = useState(() => authStorage.getUserInfo());
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await fetchLoginBranding();
        if (!cancelled) setBranding(b);
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
    () => (branding?.heroImageUrls || []).map((u) => String(u).trim()).filter(Boolean),
    [branding?.heroImageUrls]
  );
  const heroCarouselOn = branding?.heroCarouselEnabled !== false && heroUrls.length > 0;

  useEffect(() => {
    if (!heroCarouselOn || heroUrls.length <= 1) return;
    const sec = Math.max(3, branding?.intervalSec ?? 8);
    const t = window.setInterval(() => {
      setHeroIdx((i) => (i + 1) % heroUrls.length);
    }, sec * 1000);
    return () => window.clearInterval(t);
  }, [heroCarouselOn, heroUrls.length, branding?.intervalSec]);

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
      const data = await loginWeb(username.trim(), password);
      authStorage.setAuth(data.token, data.role, data.userInfo);
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
  }, [username, password, syncUserFromStorage]);

  const openLoginPanel = useCallback(() => {
    setShowLogin(true);
  }, []);

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
    const r = authStorage.getRole() || "STUDENT";
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
      {/* 轮播底图：在 loading-page 之下，portal 红底之上 */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        {heroCarouselOn ? (
          <>
            {heroUrls.map((url, i) => (
              <div
                key={`${url}-${i}`}
                className={cn(
                  "absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700 ease-out",
                  i === heroIdx ? "opacity-100" : "opacity-0"
                )}
                style={{ backgroundImage: `url(${url})` }}
              />
            ))}
            <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[#6b0408]/78 via-[#a30000]/65 to-[#3d0204]/85" />
          </>
        ) : (
          <div className="absolute inset-0 z-0" style={{ backgroundColor: LOGIN_PAGE_RED }} />
        )}
      </div>

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
          <button
            type="button"
            aria-label="关闭登录"
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px]"
            onClick={() => setShowLogin(false)}
          />
          <aside
            className="fixed right-0 top-0 z-[110] flex h-full w-full max-w-md flex-col border-l border-[#c9a227]/25 bg-[#050a14]/97 shadow-[-12px_0_48px_rgba(0,0,0,0.5)] backdrop-blur-xl"
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
                    placeholder="请输入账号"
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
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void doLogin()}
                  className="admin-login-button-primary w-full border border-[#b8860b]/50 bg-gradient-to-r from-[#8b4513]/90 to-[#c9a227]/90 py-3 text-sm font-semibold text-[#1a0a06] shadow-md hover:from-[#a0522d] hover:to-[#e8c547] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "登录中…" : "登 录"}
                </button>
              </form>
              <p className="mt-8 text-center text-sm text-[#9a8b72]">
                教职工首次使用？
                <Link to="/register" className="ml-1 font-medium text-[#e8c547] hover:text-[#f5e6a8]">
                  去注册
                </Link>
              </p>
            </div>
          </aside>
        </>
      ) : null}

      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent className="z-[320] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>退出登录</DialogTitle>
            <DialogDescription>确定要退出当前账号吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => setLogoutDialogOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500"
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
