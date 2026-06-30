import { useState, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loginWeb } from "@/api/domains/auth.api";
import { authStorage } from "@/features/auth/authStorage";

export default function MobileLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const doLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      setError("请输入账号和密码");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const data = await loginWeb(username.trim(), password);
      authStorage.setAuth(data.token, data.role, data.userInfo);
      authStorage.markLoginPortal("mobile");
      navigate("/m/home", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }, [username, password, navigate]);

  const handleUsernameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); passwordRef.current?.focus(); }
  };
  const handlePasswordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); doLogin(); }
  };

  const bg = "var(--app-color-surface-page)";
  const cardBg = "var(--app-color-surface-container)";
  const primary = "var(--app-color-text-primary)";
  const secondary = "var(--app-color-text-secondary)";
  const accent = "var(--app-color-accent)";
  const border = "var(--app-color-border-default)";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center p-5"
      style={{ background: bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif" }}>
      <div className="w-full max-w-sm rounded-[var(--app-radius-container)] p-[var(--app-space-container-padding)]"
        style={{ background: cardBg }}>
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-bold" style={{ color: primary }}>学生登录</h1>
          <p className="mt-2 text-sm" style={{ color: secondary }}>使用你的账号密码登录</p>
        </div>
        <div className="mt-8 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: primary }}>用户名</label>
            <input value={username} onChange={(e) => { setUsername(e.target.value); setError(null); }}
              onKeyDown={handleUsernameKeyDown} placeholder="请输入用户名" autoComplete="username"
              className="w-full rounded-[var(--app-radius-element)] border px-3 py-2.5 text-base outline-none transition-colors"
              style={{ background: bg, borderColor: border, color: primary }} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: primary }}>密码</label>
            <input ref={passwordRef} type="password" value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              onKeyDown={handlePasswordKeyDown} placeholder="请输入密码" autoComplete="current-password"
              className="w-full rounded-[var(--app-radius-element)] border px-3 py-2.5 text-base outline-none transition-colors"
              style={{ background: bg, borderColor: border, color: primary }} />
          </div>
          {error && (
            <p className="text-sm text-center rounded-[var(--app-radius-element)] px-3 py-2"
              style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>{error}</p>
          )}
          <button onClick={doLogin} disabled={submitting}
            className="w-full rounded-[var(--app-radius-element)] py-3 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent})` }}>
            {submitting ? "登录中..." : "登 录"}
          </button>
        </div>
        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <p style={{ color: secondary }}>
            还没有账号？
            <Link to="/m/register" className="ml-1 font-medium hover:underline" style={{ color: accent }}>立即注册</Link>
          </p>
          <p style={{ color: secondary }}>
            已有身份但未设密码？
            <Link to="/m/activate" className="ml-1 font-medium hover:underline" style={{ color: accent }}>激活账号</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
