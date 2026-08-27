import { useCallback, useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { X } from "lucide-react";
import { loginWeb } from "@/api/domains/auth.api";
import { startIamOAuthLogin } from "@/features/auth/iamOAuth";
import ForgotPasswordPanel from "@/components/shared/ForgotPasswordPanel";
import { fetchPublicRuntimeConfig } from "@/api/domains/notification.api";
import { authStorage } from "@/features/auth/authStorage";

interface PortalLoginModalProps {
  open: boolean;
  onClose: () => void;
}

export function PortalLoginModal({ open, onClose }: PortalLoginModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Turnstile
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileLoadFailed, setTurnstileLoadFailed] = useState(false);
  const [turnstileLoading, setTurnstileLoading] = useState(false);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstilePollCount = useRef(0);

  // Fetch Turnstile config when modal opens
  useEffect(() => {
    if (!open) return;
    setUsername("");
    setPassword("");
    setForgotMode(false);
    setTurnstileToken("");
    setTurnstileLoadFailed(false);
    setTurnstileLoading(false);
    fetchPublicRuntimeConfig()
      .then((cfg) => {
        setTurnstileSiteKey(cfg["turnstile.site-key"] || "");
        setTurnstileEnabled(cfg["turnstile.enabled"] === "true");
      })
      .catch(() => setTurnstileSiteKey(""));
  }, [open]);

  // Turnstile widget render
  useEffect(() => {
    if (!open || !turnstileSiteKey || !turnstileEnabled) return;
    const container = turnstileContainerRef.current;
    if (!container) return;

    turnstilePollCount.current = 0;
    setTurnstileLoadFailed(false);
    setTurnstileLoading(true);
    let cancelled = false;

    const tryRender = () => {
      if (cancelled) return;
      if (!(window as any).turnstile) {
        turnstilePollCount.current++;
        if (turnstilePollCount.current > 12) {
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
          try { (window as any).turnstile.remove(turnstileWidgetId.current); } catch { /* ignore */ }
        }
        let widgetDiv = container.querySelector(".turnstile-widget") as HTMLDivElement;
        if (!widgetDiv) {
          widgetDiv = document.createElement("div");
          widgetDiv.className = "turnstile-widget";
          container.appendChild(widgetDiv);
        }
        turnstileWidgetId.current = (window as any).turnstile.render(widgetDiv, {
          sitekey: turnstileSiteKey,
          theme: "dark",
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
        try { (window as any).turnstile?.remove(turnstileWidgetId.current); } catch { /* ignore */ }
        turnstileWidgetId.current = null;
      }
      const widgetDiv = container?.querySelector(".turnstile-widget");
      if (widgetDiv) widgetDiv.remove();
    };
  }, [open, turnstileSiteKey, turnstileEnabled]);

  const doLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      toast.error("请输入账号和密码");
      return;
    }
    try {
      setSubmitting(true);
      const data = await loginWeb(username.trim(), password, turnstileToken || undefined, turnstileLoadFailed);
      authStorage.setAuth(data.token, data.role, data.userInfo);

      const isStudent = data.userInfo?.accountSource === "STUDENT"
        || (data.userInfo?.accountSource == null && data.role === "MEMBER");
      if (isStudent) {
        authStorage.markLoginPortal("student");
      } else {
        authStorage.markLoginPortal("staff");
        toast.success("登录成功");
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }, [username, password, turnstileToken, turnstileLoadFailed, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const isLoginDisabled = submitting
    || (turnstileEnabled && !!turnstileSiteKey && !turnstileToken && !turnstileLoadFailed);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="登录"
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 p-1.5 text-white/30 hover:text-white/70 transition-colors"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pb-6 pt-8">
          {forgotMode ? (
            <ForgotPasswordPanel
              theme="drawer"
              onBackToLogin={() => setForgotMode(false)}
              onResetSuccess={() => { setForgotMode(false); onClose(); }}
            />
          ) : (
            <>
          <h2 className="text-lg font-semibold text-white mb-1">登录</h2>
          <p className="text-sm text-white/40 mb-6">请输入账号与密码</p>

          <form className="space-y-4" onSubmit={(e) => e.preventDefault()} autoComplete="off">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/60" htmlFor="portal-login-username">
                账号
              </label>
              <input
                id="portal-login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); passwordRef.current?.focus(); } }}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/25 focus:ring-1 focus:ring-white/20"
                placeholder="账号/邮箱"
                autoComplete="username"
                spellCheck={false}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/60" htmlFor="portal-login-password">
                密码
              </label>
              <input
                ref={passwordRef}
                id="portal-login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void doLogin(); } }}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/25 focus:ring-1 focus:ring-white/20"
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </div>

            {/* Turnstile */}
            {turnstileEnabled && turnstileSiteKey ? (
              <div ref={turnstileContainerRef} className="flex min-h-[65px] items-center justify-center">
                {turnstileLoading && !turnstileLoadFailed && (
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                    <p className="text-xs text-white/40">人机验证加载中…</p>
                    <button
                      type="button"
                      onClick={() => { setTurnstileLoadFailed(true); setTurnstileLoading(false); }}
                      className="text-xs text-white/50 hover:text-white/80 underline mt-1"
                    >
                      跳过验证
                    </button>
                  </div>
                )}
                {turnstileLoadFailed && !turnstileLoading && (
                  <p className="text-xs text-white/40">已跳过人机验证</p>
                )}
              </div>
            ) : null}

            <button
              type="button"
              disabled={isLoginDisabled}
              onClick={() => void doLogin()}
              className="w-full rounded-lg bg-white/90 py-2.5 text-sm font-semibold text-[#0f172a] hover:bg-white transition-colors disabled:opacity-50"
            >
              {submitting ? "登录中…" : "登 录"}
            </button>
          </form>

          {/* IAM 统一认证（账密登录上方表单保留） */}
          <div className="mt-5 border-t border-white/10 pt-5">
            <button
              type="button"
              onClick={() => startIamOAuthLogin()}
              className="w-full rounded-lg border border-white/15 bg-transparent px-4 py-2.5 text-sm font-medium text-white/60 transition hover:border-white/30 hover:text-white/80"
            >
              统一认证登录
            </button>
          </div>

          {/* Links */}
          <p className="mt-5 text-center text-sm text-white/30">
            教职工首次使用？
            <Link to="/register" onClick={onClose} className="ml-1 font-medium text-white/50 hover:text-white/80">
              去注册
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-white/30">
            学生首次使用？
            <Link to="/student/register" onClick={onClose} className="ml-1 font-medium text-white/50 hover:text-white/80">
              去注册
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-white/30">
            已有身份但未设密码？
            <Link to="/m/activate" onClick={onClose} state={{ from: "/" }} className="ml-1 font-medium text-white/50 hover:text-white/80">
              激活账号
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-white/30">
            <button type="button" onClick={() => setForgotMode(true)} className="font-medium text-white/50 hover:text-white/80">
              忘记密码？
            </button>
          </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
