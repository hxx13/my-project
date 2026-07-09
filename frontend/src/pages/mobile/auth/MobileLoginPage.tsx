import { useState, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loginWeb, forgotPasswordVerify, forgotPasswordReset } from "@/api/domains/auth.api";
import { authStorage } from "@/features/auth/authStorage";
import { toast } from "react-hot-toast";
import axios from "axios";

export default function MobileLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

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
  const [qrDecoded, setQrDecoded] = useState(false);
  const forgotQrRef = useRef<HTMLInputElement>(null);

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

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post("/api/auth/forgot-password/decode-qr", formData);
      if (res.data?.success && res.data?.data?.userId) {
        setForgotUserId(res.data.data.userId);
        setForgotPersonnelName(res.data.data.name || "");
        setQrDecoded(true);
        toast.success("二维码识别成功");
      } else {
        toast.error(res.data?.message || "二维码识别失败");
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "二维码上传失败";
      toast.error(msg);
    } finally {
      setQrUploading(false);
    }
  };

  const handleForgotVerify = async () => {
    if (!forgotUserId.trim() || !forgotPhone.trim()) {
      toast.error("请上传二维码并输入手机号");
      return;
    }
    setForgotVerifying(true);
    try {
      const result = await forgotPasswordVerify(forgotUserId.trim(), forgotPhone.trim());
      if (result.verified) {
        setForgotVerified(true);
        setForgotExistingUsername(result.username);
        setForgotNewUsername(result.username);
        setForgotPersonnelName(result.name || forgotPersonnelName);
        toast.success("验证通过");
      } else {
        toast.error(result.message || "验证失败");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "验证请求失败");
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
      setQrDecoded(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重置失败");
    } finally {
      setForgotSubmitting(false);
    }
  };

  const resetForgotState = () => {
    setForgotMode(false);
    setForgotVerified(false);
    setForgotUserId("");
    setForgotPhone("");
    setForgotExistingUsername("");
    setForgotNewUsername("");
    setForgotNewPassword("");
    setForgotPersonnelName("");
    setQrDecoded(false);
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
        {forgotMode ? (
          !forgotVerified ? (
            <>
              <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-bold" style={{ color: primary }}>找回密码</h1>
                <p className="mt-2 text-sm" style={{ color: secondary }}>上传你的个人二维码并输入登记手机号</p>
              </div>
              <div className="mt-6 space-y-4">
                <input ref={forgotQrRef} type="file" accept="image/*" onChange={handleQrUpload} className="hidden" />
                {qrDecoded && forgotUserId ? (
                  <div className="flex items-center gap-2 rounded-[var(--app-radius-element)] px-3 py-2.5 text-sm"
                    style={{ background: "rgba(34,197,94,0.1)", color: "#16a34a" }}>
                    <span>{forgotPersonnelName ? `${forgotPersonnelName} · ` : ""}{forgotUserId}</span>
                    <button type="button" onClick={() => { setQrDecoded(false); setForgotUserId(""); setForgotPersonnelName(""); }}
                      className="ml-auto text-xs underline" style={{ color: secondary }}>重新上传</button>
                  </div>
                ) : (
                  <button type="button" disabled={qrUploading}
                    onClick={() => forgotQrRef.current?.click()}
                    className="w-full rounded-[var(--app-radius-element)] border-2 border-dashed px-4 py-8 text-sm transition-colors"
                    style={{ background: bg, borderColor: border, color: secondary }}>
                    {qrUploading ? "识别中..." : "点击上传二维码图片"}
                  </button>
                )}
                <div>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: primary }}>登记手机号</label>
                  <input type="text" value={forgotPhone}
                    onChange={(e) => setForgotPhone(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleForgotVerify(); }}
                    placeholder="人员在库中登记的手机号" autoComplete="off"
                    className="w-full rounded-[var(--app-radius-element)] border px-3 py-2.5 text-base outline-none transition-colors"
                    style={{ background: bg, borderColor: border, color: primary }} />
                </div>
                <button onClick={handleForgotVerify} disabled={forgotVerifying || !qrDecoded}
                  className="w-full rounded-[var(--app-radius-element)] py-3 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${accent}, ${accent})` }}>
                  {forgotVerifying ? "验证中..." : "验证"}
                </button>
              </div>
              <div className="mt-6 flex flex-col items-center gap-2 text-sm">
                <button type="button" onClick={resetForgotState}
                  className="font-medium hover:underline" style={{ color: accent }}>返回登录</button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-bold" style={{ color: primary }}>重置密码</h1>
                {forgotPersonnelName && <p className="mt-2 text-sm" style={{ color: secondary }}>姓名：{forgotPersonnelName}</p>}
                <p className="mt-1 text-xs" style={{ color: secondary }}>验证通过，请设置新密码</p>
              </div>
              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: primary }}>登录账号（可修改）</label>
                  <input type="text" value={forgotNewUsername}
                    onChange={(e) => setForgotNewUsername(e.target.value)}
                    maxLength={64}
                    className="w-full rounded-[var(--app-radius-element)] border px-3 py-2.5 text-base outline-none transition-colors"
                    style={{ background: bg, borderColor: border, color: primary }} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: primary }}>新密码</label>
                  <input type="password" value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleForgotReset(); }}
                    placeholder="至少6位" autoComplete="new-password"
                    className="w-full rounded-[var(--app-radius-element)] border px-3 py-2.5 text-base outline-none transition-colors"
                    style={{ background: bg, borderColor: border, color: primary }} />
                </div>
                <button onClick={handleForgotReset} disabled={forgotSubmitting}
                  className="w-full rounded-[var(--app-radius-element)] py-3 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${accent}, ${accent})` }}>
                  {forgotSubmitting ? "重置中..." : "重置密码"}
                </button>
              </div>
              <div className="mt-6 flex flex-col items-center gap-2 text-sm">
                <button type="button" onClick={resetForgotState}
                  className="font-medium hover:underline" style={{ color: accent }}>返回登录</button>
              </div>
            </>
          )
        ) : (
          <>
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
              <p style={{ color: secondary }}>
                <button type="button" onClick={() => {
                  setForgotMode(true);
                  setForgotVerified(false);
                  setForgotUserId("");
                  setForgotPhone("");
                  setQrDecoded(false);
                  setForgotPersonnelName("");
                }}
                  className="font-medium hover:underline" style={{ color: accent }}>忘记密码？</button>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
