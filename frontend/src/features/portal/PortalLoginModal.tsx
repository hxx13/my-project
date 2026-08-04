import { useCallback, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { X } from "lucide-react";
import { loginWeb } from "@/api/domains/auth.api";
import { authStorage } from "@/features/auth/authStorage";

interface PortalLoginModalProps {
  open: boolean;
  onClose: () => void;
}

export function PortalLoginModal({ open, onClose }: PortalLoginModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const doLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      toast.error("请输入账号和密码");
      return;
    }
    try {
      setSubmitting(true);
      const data = await loginWeb(username.trim(), password);
      authStorage.setAuth(data.token, data.role, data.userInfo);

      const isStudent = data.userInfo?.accountSource === "STUDENT"
        || (data.userInfo?.accountSource == null && data.role === "MEMBER");
      if (isStudent) {
        authStorage.markLoginPortal("student");
        toast("学生账号已自动跳转至学生中心", { icon: "🎒" });
      } else {
        authStorage.markLoginPortal("staff");
        toast.success("登录成功");
      }
      setUsername("");
      setPassword("");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }, [username, password, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

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
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 p-1.5 text-white/30 hover:text-white/70 transition-colors"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pb-6 pt-8">
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

            <button
              type="button"
              disabled={submitting}
              onClick={() => void doLogin()}
              className="w-full rounded-lg bg-white/90 py-2.5 text-sm font-semibold text-[#0f172a] hover:bg-white transition-colors disabled:opacity-50"
            >
              {submitting ? "登录中…" : "登 录"}
            </button>
          </form>

          {/* CAS SSO */}
          <div className="mt-5 border-t border-white/10 pt-5">
            <button
              type="button"
              onClick={() => {
                const origin = window.location.origin;
                const service = encodeURIComponent(`${origin}/#/`);
                window.location.href = `https://auth2.shsmu.edu.cn/cas/login?service=${service}`;
              }}
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
            <Link to="/login" onClick={onClose} className="font-medium text-white/50 hover:text-white/80">
              忘记密码？
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
