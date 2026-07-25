import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loginWeb, forgotPasswordVerify, forgotPasswordReset, forgotPasswordDecodeQr, sendVerificationCode, forgotPasswordByEmailVerify, forgotPasswordByEmailReset } from "@/api/domains/auth.api";
import { fetchPublicRuntimeConfig } from "@/api/domains/notification.api";
import { authStorage } from "@/features/auth/authStorage";
import { toast } from "react-hot-toast";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export default function MobileLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Turnstile
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileLoadFailed, setTurnstileLoadFailed] = useState(false);
  const [turnstileLoading, setTurnstileLoading] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileId = useRef<string | null>(null);

  useEffect(() => {
    fetchPublicRuntimeConfig()
      .then((cfg) => setTurnstileSiteKey(cfg["turnstile.site-key"] || ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!turnstileSiteKey) return;
    const container = turnstileRef.current;
    if (!container) return;
    let cancelled = false;
    let polls = 0;
    setTurnstileLoading(true);
    const tryRender = () => {
      if (cancelled) return;
      if (!window.turnstile) { if (++polls < 12) setTimeout(tryRender, 300); else { setTurnstileLoadFailed(true); setTurnstileLoading(false); } return; }
      try {
        if (turnstileId.current) window.turnstile.remove(turnstileId.current);
        container.innerHTML = "";
        turnstileId.current = window.turnstile.render(container, {
          sitekey: turnstileSiteKey,
          theme: "light",
          size: "normal",
          callback: (token: string) => { setTurnstileToken(token); setTurnstileLoadFailed(false); setTurnstileLoading(false); },
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => { setTurnstileToken(""); setTurnstileLoadFailed(true); setTurnstileLoading(false); },
        });
        setTurnstileLoading(false);
      } catch { setTurnstileLoadFailed(true); setTurnstileLoading(false); }
    };
    setTimeout(tryRender, 100);
    return () => { cancelled = true; setTurnstileToken(""); setTurnstileLoadFailed(false); setTurnstileLoading(false); };
  }, [turnstileSiteKey]);

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

  // Forgot password — method selection
  const [forgotMethod, setForgotMethod] = useState<"qr" | "email" | null>(null);

  // Forgot password — email flow
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotEmailCode, setForgotEmailCode] = useState("");
  const [forgotEmailSending, setForgotEmailSending] = useState(false);
  const [forgotEmailVerifying, setForgotEmailVerifying] = useState(false);
  const [forgotEmailCooldown, setForgotEmailCooldown] = useState(0);
  const [forgotEmailStep, setForgotEmailStep] = useState<"email" | "code" | "reset">("email");
  const [forgotEmailResetToken, setForgotEmailResetToken] = useState("");
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current); };
  }, []);

  const doLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      setError("请输入账号和密码");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const data = await loginWeb(username.trim(), password, turnstileToken || undefined, turnstileLoadFailed);
      authStorage.setAuth(data.token, data.role, data.userInfo);
      authStorage.markLoginPortal("mobile");
      navigate("/m/home", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }, [username, password, turnstileToken, turnstileLoadFailed, navigate]);

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
      toast.error("请输入人员编号和手机号");
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
          !forgotMethod ? (
            // ─── Method Selection ───
            <>
              <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-bold" style={{ color: primary }}>找回密码</h1>
                <p className="mt-2 text-sm" style={{ color: secondary }}>请选择一种方式验证身份</p>
              </div>
              <div className="mt-6 space-y-3">
                <button type="button" onClick={() => setForgotMethod("qr")}
                  className="w-full rounded-[var(--app-radius-element)] border-2 px-4 py-3 text-left transition-colors"
                  style={{ borderColor: border, background: bg }}>
                  <div className="text-base font-semibold" style={{ color: primary }}>📷 人员二维码 + 手机号</div>
                  <div className="mt-1 text-sm" style={{ color: secondary }}>上传身份二维码并验证登记手机号</div>
                </button>
                <button type="button" onClick={() => setForgotMethod("email")}
                  className="w-full rounded-[var(--app-radius-element)] border-2 px-4 py-3 text-left transition-colors"
                  style={{ borderColor: border, background: bg }}>
                  <div className="text-base font-semibold" style={{ color: primary }}>📧 绑定邮箱 + 验证码</div>
                  <div className="mt-1 text-sm" style={{ color: secondary }}>通过已绑定的邮箱接收验证码</div>
                </button>
              </div>
              <div className="mt-6 flex flex-col items-center gap-2 text-sm">
                <button type="button" onClick={resetForgotState}
                  className="font-medium hover:underline" style={{ color: accent }}>返回登录</button>
              </div>
            </>
          ) : forgotMethod === "qr" ? (
            // ─── QR + phone (existing flow) ───
            !forgotVerified ? (
              <>
                <div className="flex flex-col items-center text-center">
                  <h1 className="text-2xl font-bold" style={{ color: primary }}>找回密码</h1>
                  <p className="mt-2 text-sm" style={{ color: secondary }}>输入或上传二维码识别你的19位人员编号</p>
                </div>
                <div className="mt-6 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" style={{ color: primary }}>人员编号（19 位）</label>
                    <input type="text" inputMode="numeric" maxLength={19} value={forgotUserId}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 19);
                        setForgotUserId(v);
                        if (!v) { setForgotPersonnelName(""); setQrDecoded(false); }
                      }}
                      placeholder="手动输入 19 位人员编号" autoComplete="off"
                      className="w-full rounded-[var(--app-radius-element)] border px-3 py-2.5 text-base outline-none transition-colors"
                      style={{ background: bg, borderColor: border, color: primary }} />
                    {forgotPersonnelName ? (
                      <p className="mt-1 text-xs" style={{ color: "#16a34a" }}>已识别：{forgotPersonnelName}</p>
                    ) : null}
                  </div>
                  <input ref={forgotQrRef} type="file" accept="image/*" onChange={handleQrUpload} className="hidden" />
                  <button type="button" disabled={qrUploading}
                    onClick={() => forgotQrRef.current?.click()}
                    className="w-full rounded-[var(--app-radius-element)] border-2 border-dashed px-4 py-3 text-sm transition-colors"
                    style={{ background: bg, borderColor: border, color: secondary }}>
                    {qrUploading ? "识别中..." : qrDecoded && forgotUserId ? "📷 重新上传二维码" : "📷 上传二维码自动填入"}
                  </button>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" style={{ color: primary }}>登记手机号</label>
                    <input type="text" value={forgotPhone}
                      onChange={(e) => setForgotPhone(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleForgotVerify(); }}
                      placeholder="人员在库中登记的手机号" autoComplete="off"
                      className="w-full rounded-[var(--app-radius-element)] border px-3 py-2.5 text-base outline-none transition-colors"
                      style={{ background: bg, borderColor: border, color: primary }} />
                  </div>
                  <button onClick={handleForgotVerify} disabled={forgotVerifying || forgotUserId.trim().length === 0}
                    className="w-full rounded-[var(--app-radius-element)] py-3 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
                    style={{ background: `linear-gradient(135deg, ${accent}, ${accent})` }}>
                    {forgotVerifying ? "验证中..." : "验证"}
                  </button>
                </div>
                <div className="mt-6 flex flex-col items-center gap-2 text-sm">
                  <button type="button" onClick={backToForgotMethodSelection}
                    className="font-medium hover:underline" style={{ color: accent }}>返回选择方式</button>
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
                      onChange={(e) => setForgotNewUsername(e.target.value)} maxLength={64}
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
            // ─── Email verification flow ───
            forgotEmailStep === "email" ? (
              <>
                <div className="flex flex-col items-center text-center">
                  <h1 className="text-2xl font-bold" style={{ color: primary }}>找回密码</h1>
                  <p className="mt-2 text-sm" style={{ color: secondary }}>输入已绑定邮箱，我们将发送验证码</p>
                </div>
                <div className="mt-6 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" style={{ color: primary }}>已绑定邮箱</label>
                    <input type="email" value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSendCode(); }}
                      placeholder="请输入已绑定的邮箱地址" autoComplete="email"
                      className="w-full rounded-[var(--app-radius-element)] border px-3 py-2.5 text-base outline-none transition-colors"
                      style={{ background: bg, borderColor: border, color: primary }} />
                  </div>
                  <button type="button"
                    disabled={forgotEmailSending || forgotEmailCooldown > 0 || !forgotEmail.trim()}
                    onClick={() => void handleSendCode()}
                    className="w-full rounded-[var(--app-radius-element)] py-3 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
                    style={{ background: `linear-gradient(135deg, ${accent}, ${accent})` }}>
                    {forgotEmailSending ? "发送中..." : forgotEmailCooldown > 0 ? `${forgotEmailCooldown}s 后重发` : "发送验证码"}
                  </button>
                </div>
                <div className="mt-6 flex flex-col items-center gap-2 text-sm">
                  <button type="button" onClick={backToForgotMethodSelection}
                    className="font-medium hover:underline" style={{ color: accent }}>返回选择方式</button>
                </div>
              </>
            ) : forgotEmailStep === "code" ? (
              <>
                <div className="flex flex-col items-center text-center">
                  <h1 className="text-2xl font-bold" style={{ color: primary }}>输入验证码</h1>
                  <p className="mt-2 text-sm" style={{ color: secondary }}>
                    验证码已发送至 <span style={{ color: primary }}>{forgotEmail}</span>
                  </p>
                </div>
                <div className="mt-6 space-y-4">
                  <div>
                    <input type="text" inputMode="numeric" maxLength={6} value={forgotEmailCode}
                      onChange={(e) => setForgotEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => { if (e.key === "Enter") handleEmailVerify(); }}
                      placeholder="000000" autoComplete="one-time-code"
                      className="w-full rounded-[var(--app-radius-element)] border px-3 py-2.5 text-center text-lg tracking-[0.5em] outline-none transition-colors"
                      style={{ background: bg, borderColor: border, color: primary }} />
                  </div>
                  <button type="button"
                    disabled={forgotEmailCode.length !== 6 || forgotEmailVerifying}
                    onClick={() => void handleEmailVerify()}
                    className="w-full rounded-[var(--app-radius-element)] py-3 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
                    style={{ background: `linear-gradient(135deg, ${accent}, ${accent})` }}>
                    {forgotEmailVerifying ? "验证中..." : "验证"}
                  </button>
                  <button type="button"
                    disabled={forgotEmailCooldown > 0 || forgotEmailSending}
                    onClick={() => void handleSendCode()}
                    className="w-full text-sm font-medium hover:underline" style={{ color: accent }}>
                    {forgotEmailCooldown > 0 ? `${forgotEmailCooldown}s 后重发` : "重新发送验证码"}
                  </button>
                </div>
                <div className="mt-4 flex flex-col items-center gap-2 text-sm">
                  <button type="button" onClick={backToForgotMethodSelection}
                    className="font-medium hover:underline" style={{ color: accent }}>返回选择方式</button>
                </div>
              </>
            ) : (
              // email step === "reset"
              <>
                <div className="flex flex-col items-center text-center">
                  <h1 className="text-2xl font-bold" style={{ color: primary }}>重置密码</h1>
                  <p className="mt-2 text-sm" style={{ color: secondary }}>验证通过，请设置新密码</p>
                </div>
                <div className="mt-6 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" style={{ color: primary }}>新密码</label>
                    <input type="password" value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleEmailReset(); }}
                      placeholder="至少8位，含大小写字母、数字、特殊符号中至少三类"
                      autoComplete="new-password"
                      className="w-full rounded-[var(--app-radius-element)] border px-3 py-2.5 text-base outline-none transition-colors"
                      style={{ background: bg, borderColor: border, color: primary }} />
                  </div>
                  <button onClick={handleEmailReset} disabled={forgotSubmitting}
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
                  onKeyDown={handleUsernameKeyDown} placeholder="账号/邮箱" autoComplete="username"
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
              <div ref={turnstileRef} className="flex justify-center items-center w-full min-h-[65px]">
                {turnstileLoading && !turnstileLoadFailed && (
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[var(--app-color-accent)]" />
                    <p className="text-xs" style={{ color: secondary }}>人机验证加载中…</p>
                    <button type="button"
                      onClick={() => { setTurnstileLoadFailed(true); setTurnstileLoading(false); }}
                      className="text-xs underline mt-1" style={{ color: accent }}>
                      跳过验证
                    </button>
                  </div>
                )}
                {turnstileLoadFailed && !turnstileLoading && (
                  <p className="text-xs" style={{ color: secondary }}>已跳过人机验证</p>
                )}
              </div>
              {error && (
                <p className="text-sm text-center rounded-[var(--app-radius-element)] px-3 py-2"
                  style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>{error}</p>
              )}
              <button onClick={doLogin} disabled={submitting || (!!turnstileSiteKey && !turnstileToken && !turnstileLoadFailed)}
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
                  setForgotMethod(null);
                  setForgotVerified(false);
                  setForgotUserId(""); setForgotPhone("");
                  setQrDecoded(false); setForgotPersonnelName("");
                  setForgotEmail(""); setForgotEmailCode("");
                  setForgotEmailStep("email"); setForgotEmailResetToken("");
                  setForgotEmailCooldown(0);
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
